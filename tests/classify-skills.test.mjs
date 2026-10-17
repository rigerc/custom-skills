import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

const script = resolve('scripts/classify-skills.mjs');

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'laya-classifier-'));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const map = join(dir, 'skills-map.ts');
  const catalog = join(dir, 'catalog.json');
  const output = join(dir, 'report.json');
  await writeFile(map, `
    export const SKILLS_MAP: Technology[] = [
      { id: 'bash', name: 'Bash', detect: { fileExtensions: ['.sh'] },
        skills: ['shell-skill'] },
      { id: 'ink', name: 'Ink', detect: { packages: ['ink'] },
        skills: ['terminal-ui-skill'] },
    ];
    export const COMBO_SKILLS_MAP = [
      { id: 'combo', requires: ['bash', 'ink'], skills: ['combo-skill'] },
    ];
    export const FRONTEND_BONUS_SKILLS = ['frontend-skill'];
  `);
  await writeFile(catalog, JSON.stringify({
    version: 1,
    skills: [
      { id: 'ink-tui', description: 'Build an Ink React terminal UI with ink packages',
        path: 'skills/ink-tui' },
      { id: 'shell-runner', description: 'Use Bash to run .sh scripts',
        path: 'skills/shell-runner', technologies: ['bash'] },
      { id: 'manual-utility', description: 'Unrelated task, not tied to a technology',
        path: 'skills/manual-utility' },
    ],
  }, null, 2) + '\n');
  return { dir, map, catalog, output };
}

async function mockServer(t) {
  const requests = [];
  const state = { truncated: false };
  const server = createServer(async (request, response) => {
    try {
      if (!['/v1/systemone', '/v1/systemone/batch'].includes(request.url)) {
        response.writeHead(404).end('Not found');
        return;
      }
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      requests.push({ path: request.url, body });
      const predict = (text) => {
        const answers = {};
        for (const key of Object.keys(body.questions)) {
          answers[key] = key === 'domain'
            ? { type: 'choice', choice: 'tooling_cli', answer_confidence: 0.94 }
            : { type: 'noul', noul: 0.96 };
        }
        return { model: 'laya-rl-agent', answers,
          usage: { truncated: state.truncated, truncated_questions: state.truncated ? ['domain'] : [] } };
      };
      const result = request.url.endsWith('/batch')
        ? { results: body.states.map(predict), total_usage: {} }
        : predict(body.state);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(result));
    } catch (error) {
      response.writeHead(500).end(error.message);
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { url: `http://127.0.0.1:${server.address().port}`, requests, state };
}

async function run(...args) {
  const child = spawn(process.execPath, [script, ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  assert.equal(code, 0, stderr || stdout);
  return { stdout, stderr };
}

test('inspect-map parses TypeScript without executing it or loading Laya', async t => {
  const f = await fixture(t);
  const result = await run('--inspect-map', '--map', f.map);
  const json = JSON.parse(result.stdout);
  assert.equal(json.technologyCount, 2);
  assert.equal(json.mappedSkillCount, 4);
  assert.deepEqual(json.technologyIds, ['bash', 'ink']);
});

test('catalog mode reports suggestions and leaves catalog unchanged by default', async t => {
  const f = await fixture(t);
  const before = await readFile(f.catalog, 'utf8');
  const server = await mockServer(t);
  await run('--map', f.map, '--catalog', f.catalog, '--laya-url', server.url,
    '--model', 'english', '--output', f.output);
  assert.equal(server.requests[0].body.model, 'english');
  assert.equal(server.requests[0].path, '/v1/systemone');
  assert.equal(await readFile(f.catalog, 'utf8'), before);
  const report = JSON.parse(await readFile(f.output, 'utf8'));
  assert.equal(report.mode, 'catalog');
  assert.equal(report.changedCatalog, false);
  const ink = report.records.find(x => x.id === 'ink-tui');
  assert.deepEqual(ink.proposedAdditions, ['ink']);
  const shell = report.records.find(x => x.id === 'shell-runner');
  assert.deepEqual(shell.existingTechnologies, ['bash']);
  assert.deepEqual(shell.proposedAdditions, []);
  const manual = report.records.find(x => x.id === 'manual-utility');
  assert.deepEqual(manual.proposedAdditions, []);
  assert.equal(manual.needsReview, true);
});

test('catalog --write adds only approved mappings without removing existing values', async t => {
  const f = await fixture(t);
  const server = await mockServer(t);
  await run('--map', f.map, '--catalog', f.catalog, '--laya-url', server.url,
    '--output', f.output, '--write', '--threshold', '0.95');
  const updated = JSON.parse(await readFile(f.catalog, 'utf8'));
  assert.deepEqual(updated.skills[0].technologies, ['ink']);
  assert.deepEqual(updated.skills[1].technologies, ['bash']);
  assert.equal('technologies' in updated.skills[2], false);
  const report = JSON.parse(await readFile(f.output, 'utf8'));
  assert.equal(report.changedCatalog, true);
});

test('map mode retains AutoSkills technologies and classifies slugs', async t => {
  const f = await fixture(t);
  const server = await mockServer(t);
  await run('--mode', 'map', '--map', f.map, '--laya-url', server.url,
    '--output', f.output, '--batch-size', '2');
  assert.ok(server.requests.some(req => req.path === '/v1/systemone/batch'));
  assert.ok(server.requests.every(req => req.body.model === 'english'));
  const report = JSON.parse(await readFile(f.output, 'utf8'));
  assert.equal(report.records.length, 4);
  assert.deepEqual(report.records.find(x => x.id === 'combo-skill').technologies.sort(),
    ['bash', 'ink']);
  assert.equal(report.records.find(x => x.id === 'frontend-skill').frontendBonus, true);
  assert.ok(report.records.every(x => x.domain === 'tooling_cli'));
});

test('catalog --write does not accept suggestions from truncated Laya responses', async t => {
  const f = await fixture(t);
  const server = await mockServer(t);
  server.state.truncated = true;
  const before = await readFile(f.catalog, 'utf8');
  await run('--map', f.map, '--catalog', f.catalog, '--laya-url', server.url,
    '--output', f.output, '--write');
  assert.equal(await readFile(f.catalog, 'utf8'), before);
  const report = JSON.parse(await readFile(f.output, 'utf8'));
  assert.equal(report.changedCatalog, false);
  assert.ok(report.records.every(record => record.needsReview));
  assert.ok(report.records.every(record => record.proposedAdditions.length === 0));
});
