const { test, describe, it, expect } = require('./helpers.cjs');
const jpv = require('../dist/index.cjs');

test('matches regex', () => {
  expect(jpv.validate({ name: 'John' }, { name: /^John$/ })).toBe(true);
});

test('does not match different regex', () => {
  expect(jpv.validate({ name: 'Jane' }, { name: /^John$/ })).toBe(false);
});

test('matches regex with number', () => {
  expect(jpv.validate({ age: 25 }, { age: /^\d+$/ })).toBe(true);
});

test('does not match regex with non-number', () => {
  expect(jpv.validate({ age: 'twenty-five' }, { age: /^\d+$/ })).toBe(false);
});

test('matches regex with special character', () => {
  expect(jpv.validate({ password: 'p@ssw0rd' }, { password: /^[\w@]+$/ })).toBe(true);
});

test('does not match regex with unallowed special character', () => {
  expect(jpv.validate({ password: 'p@ssw0rd!' }, { password: /^[\w@]+$/ })).toBe(false);
});
