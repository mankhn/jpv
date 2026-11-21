// Dependency-free smoke test of the built package, for old Node versions
// that lack node:test. Usage: node scripts/smoke.cjs
'use strict';
const assert = require('assert');
const path = require('path');

const check = (jpv, label) => {
    const { validate, explain, assert: jassert, compile, ValidationError, strict, and, or, not, nullable, forEach, record, type, lazy, message } = jpv;
    const node = { name: type('string'), children: forEach(lazy(() => node)) };
    const user = compile({
        id: type('integer'),
        name: and(type('string'), /^[A-Z]/),
        role: or('admin', 'user'),
        email: nullable(/@/),
        tags: forEach(type('string'), { min: 1 }),
        meta: strict({ a: not(0) }),
        scores: record(/^\w+$/, type('number')),
        tree: node,
        label: message(type('string'), 'label required')
    });
    const good = { id: 1, name: 'Ann', role: 'user', tags: ['x'], meta: { a: 1 }, scores: { q: 1 }, tree: { name: 'r', children: [] }, label: 'l' };
    assert.strictEqual(user(good), true, label);
    assert.strictEqual(validate(good, { id: 1 }), true, label);
    assert.strictEqual(validate('abc', /^a/g) && validate('abc', /^a/g), true, label);
    const r = user.explain(Object.assign({}, good, { id: 1.5, label: 3 }));
    assert.deepStrictEqual(r.errors.map((e) => e.path + ' ' + e.message), ['id expected integer, received number', 'label label required'], label);
    assert.throws(() => jassert({}, { a: 1 }), ValidationError, label);
    console.log('ok  ' + label);
};

check(require(path.join(__dirname, '..', 'dist', 'index.cjs')), 'CommonJS on Node ' + process.version);
import(path.join(__dirname, '..', 'dist', 'index.mjs').replace(/\\/g, '/'))
    .then((esm) => check(esm, 'ESM on Node ' + process.version))
    .catch((err) => { console.error(err); process.exit(1); });
