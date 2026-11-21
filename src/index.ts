/*!
 * jpv - JSON Pattern Validation
 * MIT License
 */

// ===========================================================================
// Public types
// ===========================================================================

declare const TYPE: unique symbol;

export type PatternKind =
    | 'strict' | 'and' | 'or' | 'not' | 'nullable' | 'forEach'
    | 'record' | 'type' | 'lazy' | 'message';

/**
 * An opaque pattern produced by one of jpv's builders. `T` is the type of the
 * values it accepts (used for inference only).
 */
export interface PatternNode<T = unknown> {
    readonly kind: PatternKind;
    /** Phantom field carrying the inferred type; never present at runtime. */
    readonly [TYPE]?: T;
}

/** A custom check. Any truthy return value means "valid". Type predicates narrow the inferred type. */
export type PatternFunction = (value: any) => unknown;

/**
 * Anything jpv can validate against:
 * - primitives are compared exactly (`NaN` matches `NaN`)
 * - `RegExp` is tested against string / number values
 * - functions are custom checks
 * - plain objects validate listed keys (extra keys allowed unless `strict`)
 * - arrays validate items by position (extra items allowed unless `strict`)
 * - `Date` matches a `Date` with the same time
 * - builder results (`strict`, `and`, `or`, `not`, `nullable`, `forEach`, `record`, `type`, `lazy`, `message`)
 */
export type Pattern =
    | string | number | bigint | boolean | symbol | null | undefined
    | RegExp
    | Date
    | PatternFunction
    | PatternNode<any>
    | readonly Pattern[]
    | { readonly [key: string]: Pattern };

export interface TypeMap {
    string: string;
    number: number;
    integer: number;
    finite: number;
    boolean: boolean;
    bigint: bigint;
    symbol: symbol;
    function: (...args: any[]) => unknown;
    undefined: undefined;
    null: null;
    object: { [key: string]: unknown };
    array: unknown[];
    date: Date;
    regexp: RegExp;
    any: unknown;
}

export type TypeName = keyof TypeMap;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type InferObject<P> = Simplify<
    { -readonly [K in keyof P as undefined extends Infer<P[K]> ? never : K]: Infer<P[K]> } &
    { -readonly [K in keyof P as undefined extends Infer<P[K]> ? K : never]?: Infer<P[K]> }
>;

type InferItems<P extends readonly unknown[]> =
    P extends readonly [infer H, ...infer R] ? [Infer<H>, ...InferItems<R>] : [];

type InferIntersection<P extends readonly unknown[]> =
    P extends readonly [infer H, ...infer R] ? Infer<H> & InferIntersection<R> : unknown;

/** The type of values accepted by pattern `P`. */
export type Infer<P> =
    P extends PatternNode<infer T> ? T :
    P extends RegExp ? string | number :
    P extends Date ? Date :
    P extends (value: any) => value is infer X ? X :
    P extends (...args: any[]) => unknown ? unknown :
    P extends readonly unknown[]
        ? number extends P['length']
            ? unknown[]
            : P extends readonly [] ? unknown[] : [...InferItems<P>, ...unknown[]] :
    P extends object ? InferObject<P> :
    P;

/** The type of values accepted by `strict(P)`. */
export type InferStrict<P> =
    P extends readonly unknown[] ? (number extends P['length'] ? unknown[] : InferItems<P>) :
    Infer<P>;

export interface ValidationIssue {
    /** Human readable location, e.g. `data[1].age`. Empty string for the root value. */
    path: string;
    /** The same location as a list of keys / indexes, e.g. `['data', 1, 'age']`. */
    keys: (string | number)[];
    /** What went wrong, e.g. `expected string, received number`. */
    message: string;
    /** The offending value. */
    value: unknown;
}

export interface ExplainResult {
    valid: boolean;
    errors: ValidationIssue[];
}

export interface Validator<T> {
    (value: unknown): value is T;
    validate(value: unknown): value is T;
    explain(value: unknown): ExplainResult;
    assert(value: unknown, message?: string): T;
}

export interface ForEachOptions {
    /** Minimum array length (inclusive). */
    min?: number;
    /** Maximum array length (inclusive). */
    max?: number;
}

// ===========================================================================
// Internals
// ===========================================================================

// A global brand (instead of `instanceof`) so that patterns created by one copy
// of jpv (e.g. the CommonJS build) are recognised by another copy (e.g. the
// ESM build, or a different version installed in a nested node_modules).
const BRAND = Symbol.for('jpv.pattern');

const hasOwn = Object.prototype.hasOwnProperty;
const getProto = Object.getPrototypeOf;
const isArray = Array.isArray;

type AnyObject = { [key: string]: unknown };

// A plain object is one created by `{}`, `new Object()`, `Object.create(null)`
// or `JSON.parse`. Own `constructor` keys (e.g. from user JSON) do not matter.
const isPlainObject = (obj: unknown): obj is AnyObject => {
    if (obj === null || typeof obj !== 'object') return false;
    const proto = getProto(obj);
    return proto === Object.prototype || proto === null;
};

interface Node {
    readonly kind: PatternKind;
    readonly argument: any;
    readonly extra?: any;
}

class PatternImpl implements Node {
    readonly kind: PatternKind;
    readonly argument: any;
    readonly extra?: any;

    constructor (kind: PatternKind, argument: unknown, extra?: unknown) {
        this.kind = kind;
        this.argument = argument;
        if (extra !== undefined) this.extra = extra;
    }
}
Object.defineProperty(PatternImpl.prototype, BRAND, { value: true });

const make = <T>(kind: PatternKind, argument: unknown, extra?: unknown): PatternNode<T> =>
    Object.freeze(new PatternImpl(kind, argument, extra)) as unknown as PatternNode<T>;

const isNode = (obj: unknown): obj is Node =>
    obj !== null && typeof obj === 'object' && (obj as { [BRAND]?: unknown })[BRAND] === true;

interface Ctx {
    path: (string | number)[];
    errors: ValidationIssue[];
}

/** `ctx` is `null` on the fast boolean path and an error collector in explain mode. */
type Check = (value: unknown, ctx: Ctx | null) => boolean;

// ===========================================================================
// Error reporting helpers (only used in "explain" mode)
// ===========================================================================

const IDENT = /^[A-Za-z_$][\w$]*$/;

const formatPath = (keys: (string | number)[]): string => {
    let out = '';
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (typeof k === 'number') out += '[' + k + ']';
        else if (IDENT.test(k)) out += (out === '' ? '' : '.') + k;
        else out += '[' + JSON.stringify(k) + ']';
    }
    return out;
};

const show = (v: unknown): string => {
    if (typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'bigint') return v + 'n';
    if (typeof v === 'function') return v.name ? 'function ' + v.name : 'function';
    if (typeof v === 'symbol') return v.toString();
    if (v instanceof Date) return 'Date(' + (isNaN(v.getTime()) ? 'Invalid' : v.toISOString()) + ')';
    if (v instanceof RegExp) return String(v);
    if (isArray(v)) return 'array';
    if (v !== null && typeof v === 'object') return 'object';
    return String(v);
};

const typeName = (v: unknown): string => {
    if (v === null) return 'null';
    if (isArray(v)) return 'array';
    if (v instanceof Date) return isNaN(v.getTime()) ? 'invalid date' : 'date';
    if (typeof v === 'number' && v !== v) return 'NaN';
    if (typeof v === 'object') {
        if (isPlainObject(v)) return 'object';
        const ctor = (v as { constructor?: { name?: string } }).constructor;
        return (ctor && ctor.name) || 'object';
    }
    return typeof v;
};

const plural = (n: number, word: string) => n + ' ' + word + (n === 1 ? '' : 's');

const report = (ctx: Ctx, value: unknown, message: string): void => {
    ctx.errors.push({
        path: formatPath(ctx.path),
        keys: ctx.path.slice(),
        message,
        value
    });
};

// ===========================================================================
// Types
// ===========================================================================

const TYPES: { [K in TypeName]: (v: unknown) => boolean } = {
    string: (v) => typeof v === 'string',
    number: (v) => typeof v === 'number' && v === v,
    integer: (v) => Number.isInteger(v),
    finite: (v) => Number.isFinite(v),
    boolean: (v) => typeof v === 'boolean',
    bigint: (v) => typeof v === 'bigint',
    symbol: (v) => typeof v === 'symbol',
    function: (v) => typeof v === 'function',
    undefined: (v) => v === undefined,
    null: (v) => v === null,
    object: isPlainObject,
    array: isArray,
    date: (v) => v instanceof Date && !isNaN(v.getTime()),
    regexp: (v) => v instanceof RegExp,
    any: () => true
};

// ===========================================================================
// Compiler: a pattern is compiled once into a tree of small closures.
// ===========================================================================

type Seen = Map<object, Check>;

const compileNode = (pattern: unknown, seen: Seen): Check => {
    if (pattern === null || (typeof pattern !== 'object' && typeof pattern !== 'function')) {
        return compilePrimitive(pattern);
    }

    // Support self-referencing pattern objects: hand out a forwarding reference
    // while the pattern is still being compiled.
    const cached = seen.get(pattern);
    if (cached !== undefined) return cached;
    let compiled: Check | null = null;
    seen.set(pattern, (v, ctx) => (compiled as Check)(v, ctx));
    compiled = compileObject(pattern, seen);
    seen.set(pattern, compiled);
    return compiled;
};

const compilePrimitive = (expected: unknown): Check => {
    // NaN is the only value not equal to itself; treat a NaN pattern as "is NaN".
    if (expected !== expected) {
        return (v, ctx) => {
            if (v !== v) return true;
            if (ctx !== null) report(ctx, v, 'expected NaN, received ' + show(v));
            return false;
        };
    }
    return (v, ctx) => {
        if (v === expected) return true;
        if (ctx !== null) report(ctx, v, 'expected ' + show(expected) + ', received ' + show(v));
        return false;
    };
};

const compileObject = (pattern: object, seen: Seen): Check => {
    if (typeof pattern === 'function') return compileFunction(pattern as PatternFunction);
    if (isNode(pattern)) return compileOperator(pattern, seen);
    if (isArray(pattern)) return compileArray(pattern, seen, false);
    if (pattern instanceof RegExp) return compileRegExp(pattern);
    if (pattern instanceof Date) return compileDate(pattern);
    if (isPlainObject(pattern)) return compilePlainObject(pattern, seen, false);

    // Any other object (Map, class instance, ...): compare by identity.
    return (v, ctx) => {
        if (v === pattern) return true;
        if (ctx !== null) report(ctx, v, 'expected the exact ' + show(pattern) + ' instance');
        return false;
    };
};

const compileFunction = (fn: PatternFunction): Check => (v, ctx) => {
    if (fn(v)) return true;
    if (ctx !== null) {
        report(ctx, v, (fn.name ? 'failed check "' + fn.name + '"' : 'failed custom check') + ', received ' + show(v));
    }
    return false;
};

const compileRegExp = (re: RegExp): Check => {
    // Global/sticky regexes keep state in `lastIndex`; reset it for every test
    // so the same pattern gives the same answer on every call.
    const stateful = re.global || re.sticky;
    return (v, ctx) => {
        const t = typeof v;
        if (t === 'string' || t === 'number') {
            if (stateful) re.lastIndex = 0;
            if (re.test(v as string)) return true;
        }
        if (ctx !== null) report(ctx, v, 'expected to match ' + String(re) + ', received ' + show(v));
        return false;
    };
};

const compileDate = (date: Date): Check => {
    const time = date.getTime();
    return (v, ctx) => {
        if (v instanceof Date) {
            const t = v.getTime();
            if (t === time || (time !== time && t !== t)) return true;
        }
        if (ctx !== null) report(ctx, v, 'expected ' + show(date) + ', received ' + show(v));
        return false;
    };
};

const compileArray = (pattern: readonly unknown[], seen: Seen, strictMode: boolean): Check => {
    const n = pattern.length;
    const items: Check[] = new Array(n);
    for (let i = 0; i < n; i++) items[i] = compileNode(pattern[i], seen);

    return (v, ctx) => {
        if (!isArray(v)) {
            if (ctx !== null) report(ctx, v, 'expected an array, received ' + show(v));
            return false;
        }
        let ok = true;
        if (strictMode && v.length > n) {
            if (ctx === null) return false;
            report(ctx, v, 'expected at most ' + plural(n, 'item') + ', received ' + v.length);
            ok = false;
        }
        if (ctx === null) {
            for (let i = 0; i < n; i++) if (!items[i](v[i], null)) return false;
            return true;
        }
        const path = ctx.path;
        for (let i = 0; i < n; i++) {
            path.push(i);
            if (!items[i](v[i], ctx)) ok = false;
            path.pop();
        }
        return ok;
    };
};

const compilePlainObject = (pattern: AnyObject, seen: Seen, strictMode: boolean): Check => {
    const keys = Object.keys(pattern);
    const n = keys.length;
    const checks: Check[] = new Array(n);
    for (let i = 0; i < n; i++) checks[i] = compileNode(pattern[keys[i]], seen);
    const allowed = strictMode ? new Set(keys) : null;

    return (v, ctx) => {
        if (!isPlainObject(v)) {
            if (ctx !== null) report(ctx, v, 'expected an object, received ' + show(v));
            return false;
        }

        let ok = true;

        if (allowed !== null) {
            const valueKeys = Object.keys(v);
            // Fast reject: more own keys than the pattern allows.
            if (ctx === null && valueKeys.length > n) return false;
            for (let i = 0; i < valueKeys.length; i++) {
                const k = valueKeys[i];
                if (!allowed.has(k)) {
                    if (ctx === null) return false;
                    ctx.path.push(k);
                    report(ctx, v[k], 'unexpected key ' + JSON.stringify(k));
                    ctx.path.pop();
                    ok = false;
                }
            }
        }

        // Only own properties are considered; inherited (possibly polluted)
        // prototype properties are treated as missing.
        if (ctx === null) {
            for (let i = 0; i < n; i++) {
                const k = keys[i];
                if (!checks[i](hasOwn.call(v, k) ? v[k] : undefined, null)) return false;
            }
            return true;
        }

        const path = ctx.path;
        for (let i = 0; i < n; i++) {
            const k = keys[i];
            path.push(k);
            if (!checks[i](hasOwn.call(v, k) ? v[k] : undefined, ctx)) ok = false;
            path.pop();
        }
        return ok;
    };
};

const compileForEach = (item: Check, options: ForEachOptions | undefined): Check => {
    const min = options ? options.min : undefined;
    const max = options ? options.max : undefined;
    return (v, ctx) => {
        if (!isArray(v)) {
            if (ctx !== null) report(ctx, v, 'expected an array, received ' + show(v));
            return false;
        }
        const len = v.length;
        let ok = true;
        if (min !== undefined && len < min) {
            if (ctx === null) return false;
            report(ctx, v, 'expected at least ' + plural(min, 'item') + ', received ' + len);
            ok = false;
        }
        if (max !== undefined && len > max) {
            if (ctx === null) return false;
            report(ctx, v, 'expected at most ' + plural(max, 'item') + ', received ' + len);
            ok = false;
        }
        if (ctx === null) {
            for (let i = 0; i < len; i++) if (!item(v[i], null)) return false;
            return true;
        }
        const path = ctx.path;
        for (let i = 0; i < len; i++) {
            path.push(i);
            if (!item(v[i], ctx)) ok = false;
            path.pop();
        }
        return ok;
    };
};

const compileRecord = (keyCheck: Check, valueCheck: Check): Check => (v, ctx) => {
    if (!isPlainObject(v)) {
        if (ctx !== null) report(ctx, v, 'expected an object, received ' + show(v));
        return false;
    }
    const keys = Object.keys(v);
    if (ctx === null) {
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            if (!keyCheck(k, null) || !valueCheck(v[k], null)) return false;
        }
        return true;
    }
    let ok = true;
    const path = ctx.path;
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        path.push(k);
        if (!keyCheck(k, null)) {
            report(ctx, k, 'invalid key ' + JSON.stringify(k));
            ok = false;
        }
        if (!valueCheck(v[k], ctx)) ok = false;
        path.pop();
    }
    return ok;
};

const compileOperator = (p: Node, seen: Seen): Check => {
    switch (p.kind) {
        case 'strict': {
            const arg: unknown = p.argument;
            if (isArray(arg)) return compileArray(arg, seen, true);
            if (isPlainObject(arg)) return compilePlainObject(arg, seen, true);
            // strict() has no meaning for other patterns; validate as-is.
            return compileNode(arg, seen);
        }

        case 'forEach':
            return compileForEach(compileNode(p.argument, seen), p.extra);

        case 'record':
            return compileRecord(compileNode(p.argument, seen), compileNode(p.extra, seen));

        case 'and': {
            const checks = (p.argument as unknown[]).map((c) => compileNode(c, seen));
            const n = checks.length;
            // Stops at the first failure in both modes: later conditions often
            // assume earlier ones held (e.g. and(type('string'), s => s.length > 2)).
            return (v, ctx) => {
                for (let i = 0; i < n; i++) if (!checks[i](v, ctx)) return false;
                return true;
            };
        }

        case 'or': {
            const checks = (p.argument as unknown[]).map((c) => compileNode(c, seen));
            const n = checks.length;
            return (v, ctx) => {
                for (let i = 0; i < n; i++) if (checks[i](v, null)) return true;
                if (ctx !== null) {
                    // A single alternative: its own error is the most precise.
                    if (n === 1) return checks[0](v, ctx);
                    report(ctx, v, 'expected to match one of ' + n + ' alternatives, received ' + show(v));
                }
                return false;
            };
        }

        case 'not': {
            const check = compileNode(p.argument, seen);
            return (v, ctx) => {
                if (!check(v, null)) return true;
                if (ctx !== null) report(ctx, v, 'expected not to match the negated pattern, received ' + show(v));
                return false;
            };
        }

        case 'nullable': {
            const check = compileNode(p.argument, seen);
            return (v, ctx) => v === null || v === undefined || check(v, ctx);
        }

        case 'type': {
            const names = p.argument as TypeName[];
            const tests = names.map((name) => TYPES[name]);
            const n = tests.length;
            const label = names.join(' | ');
            return (v, ctx) => {
                for (let i = 0; i < n; i++) if (tests[i](v)) return true;
                if (ctx !== null) report(ctx, v, 'expected ' + label + ', received ' + typeName(v));
                return false;
            };
        }

        case 'lazy': {
            const factory = p.argument as () => unknown;
            let check: Check | null = null;
            return (v, ctx) => {
                if (check === null) check = compileNode(factory(), seen);
                return check(v, ctx);
            };
        }

        case 'message': {
            const check = compileNode(p.argument, seen);
            const msg = p.extra as string | ((value: unknown) => string);
            return (v, ctx) => {
                if (ctx === null) return check(v, null);
                if (check(v, null)) return true;
                report(ctx, v, typeof msg === 'function' ? String(msg(v)) : msg);
                return false;
            };
        }
    }
    throw new TypeError('jpv: unknown pattern kind "' + String(p.kind) + '"');
};

const toCheck = (pattern: unknown): Check => compileNode(pattern, new Map());

// ===========================================================================
// Public API: pattern builders
// ===========================================================================

/** Objects must not have keys, and arrays must not have items, beyond those in the pattern. */
export const strict = <const P extends Pattern>(pattern: P): PatternNode<InferStrict<P>> =>
    make('strict', pattern);

/** Every condition must match (stops at the first failure). */
export const and = <const P extends readonly Pattern[]>(...conditions: P): PatternNode<InferIntersection<P>> =>
    make('and', conditions);

/** At least one condition must match. */
export const or = <const P extends readonly Pattern[]>(...conditions: P): PatternNode<Infer<P[number]>> =>
    make('or', conditions);

/** The condition must not match. */
export const not = (condition: Pattern): PatternNode<unknown> => make('not', condition);

/** `null` and `undefined` (including missing keys) are accepted; anything else must match. */
export const nullable = <const P extends Pattern>(condition: P): PatternNode<Infer<P> | null | undefined> =>
    make('nullable', condition);

/** The value must be an array whose every item matches the pattern. */
export const forEach = <const P extends Pattern>(pattern: P, options?: ForEachOptions): PatternNode<Infer<P>[]> => {
    if (options !== undefined && (options === null || typeof options !== 'object')) {
        throw new TypeError('jpv: forEach() options must be an object like { min, max }');
    }
    return make('forEach', pattern, options ? { min: options.min, max: options.max } : undefined);
};

/** The value must be a plain object whose every own key matches `keyPattern` and value matches `valuePattern`. */
export const record = <const V extends Pattern>(
    ...args: [keyPattern: Pattern, valuePattern: V]
): PatternNode<{ [key: string]: Infer<V> }> => {
    if (args.length !== 2) throw new TypeError('jpv: record() expects (keyPattern, valuePattern)');
    return make('record', args[0], args[1]);
};

/** The value must be of one of the given types: type('string'), type('number', 'null'). */
export const type = <const N extends readonly [TypeName, ...TypeName[]]>(...names: N): PatternNode<TypeMap[N[number]]> => {
    if (names.length === 0) throw new TypeError('jpv: type() expects at least one type name');
    for (let i = 0; i < names.length; i++) {
        if (!hasOwn.call(TYPES, names[i])) {
            throw new TypeError('jpv: unknown type "' + String(names[i]) + '". Known types: ' + Object.keys(TYPES).join(', '));
        }
    }
    return make('type', Object.freeze(names.slice()));
};

/**
 * Builds the pattern on first use; for recursive structures.
 * Recursive types can't be inferred: pass the type explicitly, e.g. `lazy<Category>(() => category)`.
 */
export const lazy = <T = unknown>(factory: () => Pattern): PatternNode<T> => {
    if (typeof factory !== 'function') throw new TypeError('jpv: lazy() expects a function returning a pattern');
    return make('lazy', factory);
};

/** Uses a custom error message for `explain` / `assert` when the pattern fails. */
export const message = <const P extends Pattern>(
    pattern: P,
    text: string | ((value: unknown) => string)
): PatternNode<Infer<P>> => {
    if (typeof text !== 'string' && typeof text !== 'function') {
        throw new TypeError('jpv: message() expects a string or a function (value) => string');
    }
    return make('message', pattern, text);
};

/** Returns `true` if `value` was created by one of jpv's pattern builders. */
export const isPattern = (value: unknown): value is PatternNode => isNode(value);

// ===========================================================================
// Public API: validation
// ===========================================================================

export class ValidationError extends Error {
    readonly errors: ValidationIssue[];

    constructor (errors: ValidationIssue[], message?: string) {
        const first = errors[0];
        super(message || (first ? (first.path ? first.path + ': ' : '') + first.message : 'Validation failed'));
        this.name = 'ValidationError';
        this.errors = errors;
    }
}

const runExplain = (check: Check, value: unknown): ExplainResult => {
    const ctx: Ctx = { path: [], errors: [] };
    const valid = check(value, ctx);
    return { valid, errors: ctx.errors };
};

const runAssert = <T>(check: Check, value: unknown, msg?: string): T => {
    const result = runExplain(check, value);
    if (!result.valid) throw new ValidationError(result.errors, msg);
    return value as T;
};

/** Returns `true` if `value` matches `pattern`, narrowing `value` to the inferred type. */
export const validate = <const P extends Pattern>(value: unknown, pattern: P): value is Infer<P> =>
    toCheck(pattern)(value, null);

/** Validates and returns every mismatch with its path. */
export const explain = (value: unknown, pattern: Pattern): ExplainResult => runExplain(toCheck(pattern), value);

/** Throws a `ValidationError` if `value` does not match; otherwise returns it, typed. */
export const assert = <const P extends Pattern>(value: unknown, pattern: P, message?: string): Infer<P> =>
    runAssert(toCheck(pattern), value, message);

/** Compiles a pattern once into a fast, reusable validator. */
export const compile = <const P extends Pattern>(pattern: P): Validator<Infer<P>> => {
    const check = toCheck(pattern);
    const validator = ((value: unknown) => check(value, null)) as Validator<Infer<P>>;
    validator.validate = validator;
    validator.explain = (value) => runExplain(check, value);
    validator.assert = (value, msg) => runAssert(check, value, msg);
    return validator;
};
