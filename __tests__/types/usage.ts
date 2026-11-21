// Compile-time tests for type inference. Run with `npm run test:types`.
import {
    validate, explain, assert, compile, strict, and, or, not, nullable, forEach, record, type, lazy, message,
    ValidationError, isPattern, Pattern, Infer, PatternNode
} from '../../dist/index.mjs';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const expectType = <T extends true>(_?: T) => {};

// --- primitives & leaf patterns ---------------------------------------------
expectType<Equal<Infer<'John'>, 'John'>>();
expectType<Equal<Infer<42>, 42>>();
expectType<Equal<Infer<null>, null>>();
expectType<Equal<Infer<RegExp>, string | number>>();
expectType<Equal<Infer<Date>, Date>>();
expectType<Equal<Infer<(x: any) => boolean>, unknown>>();
expectType<Equal<Infer<(x: unknown) => x is string>, string>>();

// --- builders ---------------------------------------------------------------
expectType<Equal<Infer<ReturnType<typeof type<['string']>>>, string>>();
const strOrNull = type('string', 'null');
expectType<Equal<Infer<typeof strOrNull>, string | null>>();
const roles = or('admin', 'user');
expectType<Equal<Infer<typeof roles>, 'admin' | 'user'>>();
const nums = forEach(type('number'));
expectType<Equal<Infer<typeof nums>, number[]>>();
const dict = record(/^\w+$/, type('boolean'));
expectType<Equal<Infer<typeof dict>, { [key: string]: boolean }>>();
const maybe = nullable(type('integer'));
expectType<Equal<Infer<typeof maybe>, number | null | undefined>>();
const both = and(type('string'), /x/);
expectType<Equal<Infer<typeof both>, string>>();
const neg = not('x');
expectType<Equal<Infer<typeof neg>, unknown>>();
const msg = message(type('string'), (v) => `bad ${String(v)}`);
expectType<Equal<Infer<typeof msg>, string>>();
const tuple = strict([type('number'), type('string')]);
expectType<Equal<Infer<typeof tuple>, [number, string]>>();
const loose = compile([type('number'), type('string')]);
expectType<Equal<Parameters<typeof loose.assert>[0], unknown>>();
expectType<Equal<ReturnType<typeof loose.assert>, [number, string, ...unknown[]]>>();

// --- objects: required vs optional keys -------------------------------------
const user = compile({
    id: type('integer'),
    name: type('string'),
    email: nullable(/@/),
    role: or('admin', 'user'),
    tags: forEach(type('string'), { min: 1 }),
    address: nullable(strict({ city: type('string'), zip: /^\d+$/ }))
});
type User = ReturnType<typeof user.assert>;
expectType<Equal<User, {
    id: number;
    name: string;
    role: 'admin' | 'user';
    tags: string[];
    email?: string | number | null | undefined;
    address?: { city: string; zip: string | number } | null | undefined;
}>>();

// --- narrowing --------------------------------------------------------------
const input: unknown = {};
if (validate(input, { name: type('string'), age: type('number') })) {
    const n: number = input.age;
    const s: string = input.name;
    void n; void s;
}
if (user(input)) {
    const id: number = input.id;
    void id;
}
const a: { port: number } = assert(input, { port: type('integer') });
void a;

// --- recursion (explicit type) ----------------------------------------------
interface Category { name: string; children: Category[] }
const category: Pattern = { name: type('string'), children: forEach(lazy<Category>(() => category)) };
const c = assert(input, lazy<Category>(() => category));
expectType<Equal<typeof c, Category>>();

// --- misc API ---------------------------------------------------------------
const r = explain(input, user);
const p: string = r.errors[0].path;
void p;
user.explain(input).errors.forEach((e) => e.keys);
const e = new ValidationError([]);
void e.errors;
if (isPattern(input)) { const node: PatternNode = input; void node; }

// @ts-expect-error unknown type name
type('str');
// @ts-expect-error record requires two arguments
record(type('string'));

// README example: Infer works on a compiled validator too
const isUserR = compile({ name: type('string'), role: or('admin', 'user'), email: nullable(type('string')) });
expectType<Equal<Infer<typeof isUserR>, { name: string; role: 'admin' | 'user'; email?: string | null | undefined }>>();
