import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runner = join(projectRoot, 'scripts/run-laya-classification.mjs');
const refresher = join(projectRoot, 'scripts/refresh-autoskills-map.mjs');
const validMap = `export const SKILLS_MAP = [{ id: 'ink', name: 'Ink', skills: ['skill'] }];
export const COMBO_SKILLS_MAP = [];
export const FRONTEND_BONUS_SKILLS = [];
`;

async function exec(script, cwd, args = [], env = {}) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const status = await new Promise((res, rej) => {
    child.once('error', rej); child.once('close', res);
  });
  return { status, stdout, stderr };
}

async function workspace(t) {
  const dir = await mkdtemp(join(tmpdir(), 'laya-workflow-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'scripts'));
  await mkdir(join(dir, 'bin'));
  const log = join(dir, 'steps.log');
  await writeFile(join(dir, 'package.json'), JSON.stringify({
    name: 'workflow-fixture', private: true, type: 'module', scripts: {
      'catalog:sync': 'node scripts/stub.mjs sync',
      'catalog:check': 'node scripts/stub.mjs check',
      test: 'node scripts/stub.mjs test',
    },
  }));
  await writeFile(join(dir, 'scripts/stub.mjs'), `
    import { appendFile } from 'node:fs/promises';
    await appendFile(process.env.STEPS_LOG, process.argv[2] + '\\n');
    if (process.env.FAIL_STEP === process.argv[2]) process.exit(2);
  `);
  await writeFile(join(dir, 'scripts/refresh-autoskills-map.mjs'), `
    import { appendFile, mkdir, writeFile } from 'node:fs/promises';
    await appendFile(process.env.STEPS_LOG, 'refresh\\n');
    if (process.env.FAIL_STEP === 'refresh') process.exit(2);
    await mkdir('.cache/autoskills', { recursive: true });
    await writeFile('.cache/autoskills/skills-map.ts', 'export const SKILLS_MAP = []');
  `);
  await writeFile(join(dir, 'scripts/classify-skills.mjs'), `
    import { appendFile, readFile, writeFile } from 'node:fs/promises';
    const args = process.argv.slice(2);
    const snapshot = args[args.indexOf('--map') + 1];
    await readFile(snapshot, 'utf8');
    const inspection = args.includes('--inspect-map');
    await appendFile(process.env.STEPS_LOG, (inspection ? 'inspect' : 'classify') + ' ' + args.join(' ') + '\\n');
    if (process.env.FAIL_STEP === (inspection ? 'inspect' : 'classify')) process.exit(2);
    if (!inspection && args.includes('--write')) await writeFile('catalog.json', 'updated');
  `);
  await writeFile(join(dir, 'bin/docker'), `#!/usr/bin/env node
    import fs from 'node:fs';
    const args = process.argv.slice(2);
    fs.appendFileSync(process.env.STEPS_LOG, 'docker ' + args.join(' ') + '\\n');
    if (process.env.FAIL_STEP === 'docker-up' && args.includes('up')) process.exit(2);
  `);
  await chmod(join(dir, 'bin/docker'), 0o755);
  return { dir, log, env: {
    STEPS_LOG: log, PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
  } };
}

test('one command refreshes map, classifies read-only, validates, and stops Docker', async t => {
  const w = await workspace(t);
  const r = await exec(runner, w.dir, ['--limit', '2'], w.env);
  assert.equal(r.status, 0, r.stderr);
  const steps = (await readFile(w.log, 'utf8')).trim().split('\n');
  assert.equal(steps[0], 'refresh');
  assert.ok(steps[1].startsWith('inspect '));
  assert.equal(steps[2], 'check');
  assert.ok(steps[3].includes('docker compose -f compose.laya.yml up'));
  assert.ok(steps[4].startsWith('classify '));
  assert.match(steps[4], /--limit 2/);
  assert.ok(!steps[4].includes('--write'));
  assert.deepEqual(steps.slice(5), ['check', 'test', 'docker compose -f compose.laya.yml down']);
});

test('the --write flag syncs catalog and sets conservative threshold', async t => {
  const w = await workspace(t);
  const r = await exec(runner, w.dir, ['--write', '--limit', '1'], w.env);
  assert.equal(r.status, 0, r.stderr);
  const steps = (await readFile(w.log, 'utf8')).trim().split('\n');
  assert.equal(steps[0], 'refresh');
  assert.ok(steps[1].startsWith('inspect '));
  assert.equal(steps[2], 'sync');
  const classify = steps.find(x => x.startsWith('classify '));
  assert.match(classify, /--write/);
  assert.match(classify, /--threshold 0\.90/);
  assert.equal(await readFile(join(w.dir, 'catalog.json'), 'utf8'), 'updated');
});

test('Docker is stopped if classification fails', async t => {
  const w = await workspace(t);
  const r = await exec(runner, w.dir, [], { ...w.env, FAIL_STEP: 'classify' });
  assert.notEqual(r.status, 0);
  const steps = (await readFile(w.log, 'utf8')).trim().split('\n');
  assert.ok(steps.some(x => x.startsWith('classify ')));
  assert.equal(steps.at(-1), 'docker compose -f compose.laya.yml down');
  assert.ok(!steps.includes('test'));
});

test('refresh failure does not start Docker', async t => {
  const w = await workspace(t);
  const r = await exec(runner, w.dir, [], { ...w.env, FAIL_STEP: 'refresh' });
  assert.notEqual(r.status, 0);
  const steps = (await readFile(w.log, 'utf8')).trim().split('\n');
  assert.ok(!steps.some(x => x.startsWith('docker ')));
});

test('rejects write in map mode before altering anything', async t => {
  const w = await workspace(t);
  const r = await exec(runner, w.dir, ['--mode', 'map', '--write'], w.env);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /only valid in catalog mode/);
});

test('refresher replaces cache only with a valid upstream TypeScript map', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'autoskills-map-refresh-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let body = validMap;
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(body);
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise(done => server.close(done)));
  const out = join(dir, 'cache', 'skills-map.ts');
  const env = { AUTOSKILLS_MAP_URL: `http://127.0.0.1:${server.address().port}/map.ts`,
    AUTOSKILLS_MAP_CACHE: out };
  let r = await exec(refresher, process.cwd(), [], env);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(await readFile(out, 'utf8'), validMap);
  body = 'not valid TypeScript (((((';
  r = await exec(refresher, process.cwd(), [], env);
  assert.notEqual(r.status, 0);
  assert.equal(await readFile(out, 'utf8'), validMap);
});

test('OpenCode provider refreshes map and validates without starting Docker', async t => {
  const w=await workspace(t);
  const r=await exec(runner,w.dir,['--provider','opencode-zen','--limit','2'],{
    ...w.env,OPENCODE_API_KEY:'test'});
  assert.equal(r.status,0,r.stderr);
  const steps=(await readFile(w.log,'utf8')).trim().split('\n');
  assert.equal(steps[0],'refresh');
  assert.ok(steps[1].startsWith('inspect '));
  assert.equal(steps[2],'check');
  assert.ok(steps[3].startsWith('classify '));
  assert.match(steps[3],/--provider opencode-zen/);
  assert.deepEqual(steps.slice(4),['check','test']);
  assert.ok(!steps.some(s=>s.startsWith('docker ')));
});

test('OpenCode write mode skips Docker and retains write safeguards', async t => {
  const w=await workspace(t);
  const r=await exec(runner,w.dir,['--provider','opencode-zen','--write','--limit','1'],{
    ...w.env,OPENCODE_API_KEY:'test'});
  assert.equal(r.status,0,r.stderr);
  const steps=(await readFile(w.log,'utf8')).trim().split('\n');
  assert.equal(steps[2],'sync');
  assert.ok(steps.some(s=>s.startsWith('classify ') && s.includes('--threshold 0.90')));
  assert.ok(!steps.some(s=>s.startsWith('docker ')));
  assert.equal(await readFile(join(w.dir,'catalog.json'),'utf8'),'updated');
});

test('OpenCode provider requires a key before map refresh', async t => {
  const w=await workspace(t);
  const r=await exec(runner,w.dir,['--provider','opencode-zen'],{
    ...w.env,OPENCODE_API_KEY:'',OPENCODE_ZEN_API_KEY:''});
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/OPENCODE_API_KEY/);
  await assert.rejects(()=>readFile(w.log,'utf8'),/ENOENT/);
});

test('OpenCode failed classification does not run Docker or tests', async t => {
  const w=await workspace(t);
  const r=await exec(runner,w.dir,['--provider','opencode-zen'],{
    ...w.env,OPENCODE_API_KEY:'test',FAIL_STEP:'classify'});
  assert.notEqual(r.status,0);
  const steps=(await readFile(w.log,'utf8')).trim().split('\n');
  assert.ok(steps.some(s=>s.startsWith('classify ')));
  assert.ok(!steps.some(s=>s.startsWith('docker ')));
  assert.ok(!steps.includes('test'));
});
