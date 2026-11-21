# jpv

JSON pattern validation for JavaScript and TypeScript.

```javascript
import { validate } from 'jpv';

const pattern = {
  name: /^[A-Z][a-z]+$/,   // regex
  age: (n) => n >= 18,     // function
  role: 'admin',           // exact value
};

validate({ name: 'John', age: 30, role: 'admin' }, pattern); // true
validate({ name: 'john', age: 12, role: 'guest' }, pattern); // false
```

## Installation

```bash
npm install jpv
```

```javascript
import { validate } from 'jpv';       // ES modules
const { validate } = require('jpv');  // CommonJS
```

## Patterns

### Exact values

```javascript
validate({ status: 'OK', code: 200 }, { status: 'OK', code: 200 }); // true
```

### Regular expressions

```javascript
validate({ phone: '5551234567' }, { phone: /^\d{10}$/ }); // true
```

### Functions

```javascript
validate({ age: 30 }, { age: (n) => n >= 18 }); // true
```

### Types

```javascript
import { type } from 'jpv';

const pattern = {
  id: type('integer'),
  name: type('string'),
  note: type('string', 'null'),  // string or null
};
```

Available types: `string` `number` `integer` `finite` `boolean` `bigint` `symbol` `function` `undefined` `null` `object` `array` `date` `regexp` `any`.

### Nested objects

```javascript
const pattern = {
  user: {
    name: type('string'),
    address: {
      city: type('string'),
    },
  },
};
```

### Arrays

```javascript
import { forEach } from 'jpv';

validate(['a', 'b'], forEach(type('string')));             // every item
validate(['a', 'b'], forEach(type('string'), { max: 5 })); // with length limits
validate(['John', 30], [type('string'), type('number')]);  // by position
```

### Optional values

```javascript
import { nullable } from 'jpv';

const pattern = { email: nullable(/@/) };

validate({}, pattern);                         // true
validate({ email: null }, pattern);            // true
validate({ email: 'john@mail.com' }, pattern); // true
```

### Strict

```javascript
import { strict } from 'jpv';

const pattern = strict({ x: type('number'), y: type('number') });

validate({ x: 1, y: 2 }, pattern);       // true
validate({ x: 1, y: 2, z: 3 }, pattern); // false, unexpected key "z"
```

### Operators

```javascript
import { and, or, not } from 'jpv';

const pattern = {
  role: or('admin', 'editor', 'viewer'),
  url: and(type('string'), /^https:/),
  username: not('root'),
};
```

### Dictionaries

```javascript
import { record } from 'jpv';

validate({ alice: 10, bob: 7 }, record(/^[a-z]+$/, type('number'))); // true
```

### Recursion

```javascript
import { lazy } from 'jpv';

const category = {
  name: type('string'),
  children: forEach(lazy(() => category)),
};
```

## Errors

```javascript
import { explain } from 'jpv';

explain({ id: 'x', tags: ['a', 1] }, { id: type('integer'), tags: forEach(type('string')) });
// {
//   valid: false,
//   errors: [
//     { path: 'id',      message: 'expected integer, received string', ... },
//     { path: 'tags[1]', message: 'expected string, received number',  ... }
//   ]
// }
```

```javascript
import { assert } from 'jpv';

assert({ port: '80' }, { port: type('integer') });
// throws ValidationError: port: expected integer, received string
```

```javascript
import { message } from 'jpv';

const pattern = {
  password: message(/^.{12,}$/, 'Password must be at least 12 characters'),
};
```

## Compile

Prepare a pattern once and reuse it.

```javascript
import { compile } from 'jpv';

const isUser = compile({ name: type('string'), age: type('integer') });

isUser(value);          // true / false
isUser.explain(value);  // { valid, errors }
isUser.assert(value);   // value, or throws
```

## TypeScript

Types are inferred from patterns.

```typescript
import { compile, type, or, Infer } from 'jpv';

const isUser = compile({ name: type('string'), role: or('admin', 'user') });

type User = Infer<typeof isUser>; // { name: string; role: 'admin' | 'user' }

if (isUser(input)) {
  input.role; // 'admin' | 'user'
}
```

## API

| Function | Description |
| --- | --- |
| `validate(value, pattern)` | Returns `true` or `false` |
| `explain(value, pattern)` | Returns `{ valid, errors }` |
| `assert(value, pattern)` | Returns the value or throws `ValidationError` |
| `compile(pattern)` | Returns a reusable validator |
| `type(...names)` | Value is one of the given types |
| `nullable(pattern)` | Value is `null`, `undefined` or matches |
| `strict(pattern)` | No keys or items beyond the pattern |
| `forEach(pattern, { min, max })` | Every array item matches |
| `record(key, value)` | Every object key and value match |
| `and(...patterns)` | All patterns match |
| `or(...patterns)` | Any pattern matches |
| `not(pattern)` | Pattern does not match |
| `lazy(() => pattern)` | Deferred pattern, for recursion |
| `message(pattern, text)` | Custom error message |

## Compatibility

Node.js 14+, modern browsers, TypeScript 4.1+. No dependencies.

Upgrading from 3.x? See the [changelog](./CHANGELOG.md).

## License

MIT
