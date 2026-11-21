const { test, describe, it, expect } = require('./helpers.cjs');

const {validate} = require('../dist/index.cjs');

describe('JPV Corner Cases', () => {
  const pattern = {
    name: 'John',
    age: 30,
  };

  test('Manipulation of prototype should not affect validation', () => {
    const object = {
      name: 'John',
      age: 30,
    };
    object.__proto__.name = 'Jane';
    expect(validate(object, pattern)).toBe(true);
  });

  test('Manipulation of constructor should not affect validation', () => {
    const object = {
      name: 'John',
      age: 30,
    };
    object.constructor.prototype.name = 'Jane';
    expect(validate(object, pattern)).toBe(true);
  });

  test('Manipulation of toString should not affect validation', () => {
    const object = {
      name: 'John',
      age: 30,
    };
    object.toString = () => 'Jane';
    expect(validate(object, pattern)).toBe(true);
  });

  test('Manipulation of constructor with function type pattern', () => {
    const object = {
      name: () => 'John',
      age: 30,
    };
    object.constructor.prototype.name = () => 'Jane';
    const funcPattern = {
      name: (x) => x(),
      age: 30,
    };
    expect(validate(object, funcPattern)).toBe(true);
  });

  test('Manipulation of prototype with function type pattern', () => {
    const object = {
      name: () => 'John',
      age: 30,
    };
    object.__proto__.name = () => 'Jane';
    const funcPattern = {
      name: (x) => x(),
      age: 30,
    };
    expect(validate(object, funcPattern)).toBe(true);
  });

  // v4: null-prototype objects (Object.create(null), some query-string parsers)
  // are plain data and are validated normally.
  test('Manipulation of prototype to null', () => {
    const object = {
      name: 'John',
      age: 30,
    };
    object.__proto__ = null;
    expect(validate(object, pattern)).toBe(true);
    expect(validate(Object.assign(Object.create(null), { name: 'Jane', age: 30 }), pattern)).toBe(false);
  });

  // v4: an own "constructor" key is just data (e.g. JSON.parse('{"constructor": 1}')).
  test('Manipulation of constructor to null', () => {
    const object = {
      name: 'John',
      age: 30,
    };
    object.constructor = null;
    expect(validate(object, pattern)).toBe(true);
    expect(validate(JSON.parse('{"constructor":1,"name":"John","age":30}'), pattern)).toBe(true);
  });

  test('Manipulation of toString to null', () => {
    const object = {
      name: 'John',
      age: 30,
    };
    object.toString = null;
    expect(validate(object, pattern)).toBe(true);
  });

  test('Manipulation of toString, constructor and prototype', () => {
    const object = {
      name: 'John',
      age: 30,
    };
    object.toString = () => 'Jane';
    object.constructor.prototype.name = 'Jane';
    object.__proto__.name = 'Jane';
    expect(validate(object, pattern)).toBe(true);
  });
});
