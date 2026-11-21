// Minimal Jest-style `expect` on top of node:test / node:assert (zero dependencies).
const assert = require('node:assert/strict');
const { test, describe, it } = require('node:test');

const expect = (actual) => ({
    toBe: (expected) => assert.strictEqual(actual, expected),
    toEqual: (expected) => assert.deepStrictEqual(actual, expected),
    toThrow: (expected) => assert.throws(actual, expected),
    not: {
        toBe: (expected) => assert.notStrictEqual(actual, expected),
        toThrow: () => assert.doesNotThrow(actual)
    }
});

module.exports = { test, describe, it, expect, jpv: require('../dist/index.cjs') };
