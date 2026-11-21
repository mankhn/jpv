const { test, describe, expect } = require('./helpers.cjs');
const {
    validate, explain, assert, compile, ValidationError, isPattern,
    strict, and, or, not, nullable, forEach, record, type, lazy, message
} = require('../dist/index.cjs');

describe('bug fixes', () => {
    test('global / sticky regexes give the same answer on every call', () => {
        const re = /^a/g;
        for (let i = 0; i < 5; i++) expect(validate('abc', re)).toBe(true);
        const sticky = /a/y;
        for (let i = 0; i < 5; i++) expect(validate('a', sticky)).toBe(true);
    });

    test('NaN pattern matches NaN', () => {
        expect(validate(NaN, NaN)).toBe(true);
        expect(validate(1, NaN)).toBe(false);
        expect(validate({ a: NaN }, { a: NaN })).toBe(true);
    });

    test('inherited (polluted) prototype properties are not read', () => {
        const proto = { role: 'admin' };
        const value = Object.create(proto);
        expect(validate(value, { role: 'admin' })).toBe(false);
        expect(validate({}, { toString: (x) => x === undefined })).toBe(true);
    });

    test('objects with an own "constructor" key are plain objects', () => {
        expect(validate(JSON.parse('{"constructor":"x","a":1}'), { a: 1 })).toBe(true);
    });

    test('class instances, Maps and Dates are not plain objects', () => {
        class A { constructor () { this.a = 1; } }
        expect(validate(new A(), { a: 1 })).toBe(false);
        expect(validate(new Map(), {})).toBe(false);
        expect(validate(new Date(), {})).toBe(false);
    });

    test('strict allows optional (nullable) keys to be missing', () => {
        const p = strict({ a: 1, b: nullable(type('string')) });
        expect(validate({ a: 1 }, p)).toBe(true);
        expect(validate({ a: 1, b: 'x' }, p)).toBe(true);
        expect(validate({ a: 1, b: null }, p)).toBe(true);
        expect(validate({ a: 1, c: 2 }, p)).toBe(false);
        expect(validate({ b: 'x' }, p)).toBe(false);
    });

    test('strict arrays reject extra items but allow missing nullable ones', () => {
        const p = strict([1, nullable(2)]);
        expect(validate([1], p)).toBe(true);
        expect(validate([1, 2], p)).toBe(true);
        expect(validate([1, 2, 3], p)).toBe(false);
    });

    test('strict on non-object patterns is a no-op', () => {
        expect(validate('a', strict('a'))).toBe(true);
        expect(validate(5, strict((x) => x > 1))).toBe(true);
    });

    test('Date pattern matches equal dates', () => {
        expect(validate(new Date(0), new Date(0))).toBe(true);
        expect(validate(new Date(1), new Date(0))).toBe(false);
        expect(validate(0, new Date(0))).toBe(false);
    });

    test('self-referencing pattern objects do not overflow', () => {
        const p = { name: type('string') };
        p.child = nullable(p);
        expect(validate({ name: 'a', child: { name: 'b', child: { name: 'c' } } }, p)).toBe(true);
        expect(validate({ name: 'a', child: { name: 1 } }, p)).toBe(false);
    });

    test('patterns are immutable', () => {
        const p = and(1);
        expect(Object.isFrozen(p)).toBe(true);
    });
});

describe('type()', () => {
    test('basic types', () => {
        expect(validate('a', type('string'))).toBe(true);
        expect(validate(1, type('string'))).toBe(false);
        expect(validate(1, type('number'))).toBe(true);
        expect(validate(NaN, type('number'))).toBe(false);
        expect(validate(1.5, type('integer'))).toBe(false);
        expect(validate(Infinity, type('finite'))).toBe(false);
        expect(validate(2n, type('bigint'))).toBe(true);
        expect(validate([], type('array'))).toBe(true);
        expect(validate([], type('object'))).toBe(false);
        expect(validate({}, type('object'))).toBe(true);
        expect(validate(null, type('null'))).toBe(true);
        expect(validate(undefined, type('undefined'))).toBe(true);
        expect(validate(new Date(), type('date'))).toBe(true);
        expect(validate(new Date('nope'), type('date'))).toBe(false);
        expect(validate(/x/, type('regexp'))).toBe(true);
        expect(validate(() => 1, type('function'))).toBe(true);
        expect(validate(Symbol('s'), type('symbol'))).toBe(true);
        expect(validate(undefined, type('any'))).toBe(true);
    });

    test('union of types', () => {
        const p = type('string', 'null');
        expect(validate('a', p)).toBe(true);
        expect(validate(null, p)).toBe(true);
        expect(validate(1, p)).toBe(false);
    });

    test('unknown type throws', () => {
        expect(() => type('str')).toThrow(TypeError);
        expect(() => type()).toThrow(TypeError);
    });
});

describe('forEach() length bounds', () => {
    test('min / max', () => {
        const p = forEach(type('number'), { min: 1, max: 2 });
        expect(validate([], p)).toBe(false);
        expect(validate([1], p)).toBe(true);
        expect(validate([1, 2], p)).toBe(true);
        expect(validate([1, 2, 3], p)).toBe(false);
        expect(validate([1, 'a'], p)).toBe(false);
    });

    test('invalid options throw', () => {
        expect(() => forEach(1, 5)).toThrow(TypeError);
    });
});

describe('record()', () => {
    test('validates keys and values', () => {
        const p = record(/^[a-z]+$/, type('number'));
        expect(validate({ a: 1, b: 2 }, p)).toBe(true);
        expect(validate({}, p)).toBe(true);
        expect(validate({ A: 1 }, p)).toBe(false);
        expect(validate({ a: 'x' }, p)).toBe(false);
        expect(validate([], p)).toBe(false);
    });

    test('requires two arguments', () => {
        expect(() => record(type('number'))).toThrow(TypeError);
    });
});

describe('lazy()', () => {
    test('recursive tree', () => {
        const node = {
            value: type('number'),
            children: forEach(lazy(() => node))
        };
        expect(validate({ value: 1, children: [{ value: 2, children: [] }] }, node)).toBe(true);
        expect(validate({ value: 1, children: [{ value: 'x', children: [] }] }, node)).toBe(false);
    });

    test('factory is called once', () => {
        let calls = 0;
        const v = compile(lazy(() => { calls++; return 1; }));
        v(1); v(1); v(2);
        expect(calls).toBe(1);
    });

    test('requires a function', () => {
        expect(() => lazy(1)).toThrow(TypeError);
    });
});

describe('explain()', () => {
    test('valid value', () => {
        expect(explain({ a: 1 }, { a: 1 })).toEqual({ valid: true, errors: [] });
    });

    test('reports every error with a path', () => {
        const pattern = {
            name: type('string'),
            tags: forEach(/^[a-z]+$/),
            meta: strict({ age: (x) => x > 18 }),
            'odd key': 1
        };
        const { valid, errors } = explain({
            name: 1,
            tags: ['ok', 'NOT'],
            meta: { age: 10, extra: true },
            'odd key': 2
        }, pattern);
        expect(valid).toBe(false);
        expect(errors.map((e) => e.path)).toEqual(['name', 'tags[1]', 'meta.extra', 'meta.age', '["odd key"]']);
        expect(errors[0].message).toBe('expected string, received number');
        expect(errors[0].keys).toEqual(['name']);
        expect(errors[1].value).toBe('NOT');
        expect(errors[2].message).toBe('unexpected key "extra"');
        expect(errors[3].message).toBe('failed check "age", received 10'); // name inferred from the key
        expect(explain([1], [(x) => x > 1]).errors[0].message).toBe('failed custom check, received 1');
    });

    test('root errors have an empty path', () => {
        const { errors } = explain('x', 1);
        expect(errors).toEqual([{ path: '', keys: [], message: 'expected 1, received "x"', value: 'x' }]);
    });

    test('named functions appear in messages', () => {
        const isAdult = (x) => x >= 18;
        expect(explain(1, isAdult).errors[0].message).toBe('failed check "isAdult", received 1');
    });

    test('or / not / and messages', () => {
        expect(explain(3, or(1, 2)).errors[0].message).toBe('expected to match one of 2 alternatives, received 3');
        expect(explain(1, not(1)).errors[0].message).toBe('expected not to match the negated pattern, received 1');
        expect(explain(5, and(type('number'), 1)).errors[0].message).toBe('expected 1, received 5');
        expect(explain('x', and(type('number'), (x) => x.toFixed())).errors.length).toBe(1);
    });

    test('array errors', () => {
        expect(explain('x', [1]).errors[0].message).toBe('expected an array, received "x"');
        expect(explain([1, 2], strict([1])).errors[0].message).toBe('expected at most 1 item, received 2');
        expect(explain([], forEach(1, { min: 2 })).errors[0].message).toBe('expected at least 2 items, received 0');
    });

    test('record key errors', () => {
        const { errors } = explain({ A: 'x' }, record(/^[a-z]$/, type('number')));
        expect(errors.map((e) => e.message)).toEqual(['invalid key "A"', 'expected number, received string']);
    });

    test('custom messages', () => {
        expect(explain(1, message(type('string'), 'must be text')).errors[0].message).toBe('must be text');
        expect(explain(1, message(2, (v) => `got ${v}`)).errors[0].message).toBe('got 1');
        expect(validate(2, message(2, 'x'))).toBe(true);
        expect(() => message(1, 2)).toThrow(TypeError);
    });
});

describe('assert()', () => {
    test('returns the value when valid', () => {
        const value = { a: 1 };
        expect(assert(value, { a: 1 })).toBe(value);
    });

    test('throws ValidationError with details', () => {
        try {
            assert({ a: 2 }, { a: 1 });
            throw new Error('should have thrown');
        } catch (err) {
            expect(err instanceof ValidationError).toBe(true);
            expect(err instanceof Error).toBe(true);
            expect(err.name).toBe('ValidationError');
            expect(err.message).toBe('a: expected 1, received 2');
            expect(err.errors.length).toBe(1);
        }
    });

    test('custom message', () => {
        expect(() => assert(1, 2, 'bad input')).toThrow(/bad input/);
    });
});

describe('compile()', () => {
    const user = compile({ name: type('string'), age: and(type('integer'), (x) => x >= 0) });

    test('is a boolean function', () => {
        expect(user({ name: 'a', age: 1 })).toBe(true);
        expect(user({ name: 'a', age: -1 })).toBe(false);
        expect(user.validate({ name: 'a', age: 1 })).toBe(true);
    });

    test('explain and assert', () => {
        expect(user.explain({ name: 'a' }).errors[0].path).toBe('age');
        expect(() => user.assert({})).toThrow(ValidationError);
        expect(user.assert({ name: 'a', age: 2 }).age).toBe(2);
    });
});

describe('interop', () => {
    test('patterns from the ESM build work with the CJS build', async () => {
        const esm = await import('../dist/index.mjs');
        expect(validate('a', esm.type('string'))).toBe(true);
        expect(esm.validate({ a: [1] }, { a: forEach(type('number')) })).toBe(true);
        expect(isPattern(esm.and())).toBe(true);
        expect(isPattern({ kind: 'and' })).toBe(false);
    });

    test('fake pattern objects are treated as plain objects', () => {
        expect(validate({ kind: 'and', argument: [] }, { kind: 'and' })).toBe(true);
        expect(validate(5, { kind: 'not', argument: 5 })).toBe(false);
    });
});
