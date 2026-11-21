// Build: compiles src/index.ts with tsc, then emits dist/index.mjs (ESM),
// dist/index.cjs (CommonJS) and matching type declarations.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'build');
const dist = join(root, 'dist');

rmSync(build, { recursive: true, force: true });
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
execFileSync(process.execPath, [tsc, '-p', join(root, 'tsconfig.json')], { stdio: 'inherit' });

const src = readFileSync(join(build, 'index.js'), 'utf8');
const types = readFileSync(join(build, 'index.d.ts'), 'utf8');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const names = [];
let cjs = src
    .replace(/^export (const|class) ([A-Za-z_$][\w$]*)/gm, (_, kw, name) => {
        names.push(name);
        return `${kw} ${name}`;
    })
    .replace(/^export \{([^}]*)\};?\s*$/gm, (_, list) => {
        list.split(',').map((s) => s.trim()).filter(Boolean).forEach((n) => names.push(n));
        return '';
    });

if (/^\s*(export|import)\s/m.test(cjs)) {
    throw new Error('build: unsupported export/import syntax left in compiled output');
}

cjs = `'use strict';\n${cjs.trimEnd()}\n\nmodule.exports = { ${names.join(', ')} };\n`;

writeFileSync(join(dist, 'index.cjs'), cjs);
writeFileSync(join(dist, 'index.mjs'), src);
writeFileSync(join(dist, 'index.d.ts'), types);
writeFileSync(join(dist, 'index.d.cts'), types);
writeFileSync(join(dist, 'index.d.mts'), types);

// TypeScript < 5.0 can't parse `const` type parameters. Ship a copy without
// them (literal types widen, everything else is inferred the same way).
const legacy = types.replace(/<const /g, '<');
if (/\bconst [A-Z]\w* extends/.test(legacy)) throw new Error('build: const type parameter left in legacy types');
mkdirSync(join(dist, 'legacy'), { recursive: true });
for (const ext of ['d.ts', 'd.cts', 'd.mts']) writeFileSync(join(dist, 'legacy', 'index.' + ext), legacy);

rmSync(build, { recursive: true, force: true });
console.log(`built dist/ (${names.length} exports: ${names.join(', ')})`);
