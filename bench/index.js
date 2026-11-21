// Micro-benchmark: node bench/index.js [path-to-other-build.cjs]
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const v4 = require('../dist/index.cjs');
const other = process.argv[2] ? require(resolve(process.argv[2])) : null;

const makeData = () => ({
    status: 'OK',
    meta: { page: 1, total: 120 },
    data: Array.from({ length: 50 }, (_, i) => ({
        id: i,
        name: 'User ' + i,
        email: `user${i}@example.com`,
        tags: ['a', 'b', 'c'],
        address: i % 3 ? null : { city: 'Yerevan', zip: '0001' }
    }))
});

const makePattern = (j) => ({
    status: /^ok$/i,
    meta: { page: (x) => x > 0, total: (x) => typeof x === 'number' },
    data: j.forEach({
        id: (x) => Number.isInteger(x),
        name: j.and((x) => typeof x === 'string', /^User/),
        email: /^[^@]+@[^@]+$/,
        tags: j.forEach(j.or('a', 'b', 'c')),
        address: j.nullable(j.strict({ city: /\w/, zip: /^\d{4}$/ }))
    })
});

const bench = (name, fn, ms = 1000) => {
    for (let i = 0; i < 2000; i++) fn();
    let n = 0;
    const start = process.hrtime.bigint();
    const end = start + BigInt(ms) * 1000000n;
    let now = start;
    while (now < end) {
        for (let i = 0; i < 200; i++) fn();
        n += 200;
        now = process.hrtime.bigint();
    }
    const opsPerSec = n / (Number(now - start) / 1e9);
    console.log(`${name.padEnd(44)} ${Math.round(opsPerSec).toLocaleString().padStart(12)} ops/s`);
    return opsPerSec;
};

const data = makeData();
const results = {};

if (other) {
    const p = makePattern(other);
    if (!other.validate(data, p)) throw new Error('other build: unexpected result');
    results.otherReused = bench('other: validate(value, sharedPattern)', () => other.validate(data, p));
    results.otherInline = bench('other: validate(value, inlinePattern)', () => other.validate(data, makePattern(other)));
}

const p4 = makePattern(v4);
if (!v4.validate(data, p4)) throw new Error('v4: unexpected result');
const compiled = v4.compile(p4);
results.reused = bench('v4:    validate(value, sharedPattern)', () => v4.validate(data, p4));
results.inline = bench('v4:    validate(value, inlinePattern)', () => v4.validate(data, makePattern(v4)));
results.compiled = bench('v4:    compile(pattern)(value)', () => compiled(data));
bench('v4:    explain(value, sharedPattern)', () => v4.explain(data, p4));

if (other) {
    console.log(`\nshared pattern: ${(results.reused / results.otherReused).toFixed(2)}x, ` +
        `inline pattern: ${(results.inline / results.otherInline).toFixed(2)}x, ` +
        `compiled: ${(results.compiled / results.otherReused).toFixed(2)}x vs other build`);
}
