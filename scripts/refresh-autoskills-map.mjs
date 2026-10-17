#!/usr/bin/env node
/** Download one validated, local snapshot of the AutoSkills skill map. */
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const DEFAULT_SOURCE = 'https://raw.githubusercontent.com/rigerc/autoskills/main/packages/autoskills/skills-map.ts';
const source = process.env.AUTOSKILLS_MAP_URL || DEFAULT_SOURCE;
const output = resolve(process.env.AUTOSKILLS_MAP_CACHE || '.cache/autoskills/skills-map.ts');

async function main() {
  const url = new URL(source);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('AutoSkills map source must use HTTPS (or localhost HTTP for testing)');
  }
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`AutoSkills map download failed: HTTP ${response.status}`);
  const content = await response.text();
  if (!content.trim()) throw new Error('AutoSkills map download was empty');

  const ts = require('typescript');
  const ast = ts.createSourceFile('skills-map.ts', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (ast.parseDiagnostics.length) throw new Error(`Invalid upstream skills-map.ts: ${ast.parseDiagnostics[0].messageText}`);
  const arrays = new Set();
  for (const statement of ast.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const item of statement.declarationList.declarations) {
      if (ts.isIdentifier(item.name) && ts.isArrayLiteralExpression(item.initializer)) arrays.add(item.name.text);
    }
  }
  if (!arrays.has('SKILLS_MAP') || !arrays.has('COMBO_SKILLS_MAP')) {
    throw new Error('Upstream map is missing SKILLS_MAP or COMBO_SKILLS_MAP arrays');
  }

  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { flag: 'wx' });
    await rename(temporary, output);
  } finally {
    await rm(temporary, { force: true });
  }
  const sha256 = createHash('sha256').update(content).digest('hex');
  console.log(`Refreshed AutoSkills map: ${url.href}\n  saved: ${output}\n  sha256: ${sha256}`);
}

main().catch(error => { console.error(`Error: ${error.message}`); process.exitCode = 1; });
