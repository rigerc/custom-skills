import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = resolve('scripts/classify-skills.mjs');

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'laya-classifier-'));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const map = join(dir, 'skills-map.ts');
  const catalog = join(dir, 'catalog.json');
  const laya = join(dir, 'mock-laya.mjs');
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
  await writeFile(laya, `
    export class Agent {
      static async load() { return new Agent(); }
      async predict(state, questions) {
        const answers = {};
        for (const key of Object.keys(questions)) {
          if (key === 'domain') {
            answers[key] = { type: 'choice', choice: 'tooling_cli', answer_confidence: 0.94 };
          } else {
            answers[key] = { type: 'noul', noul: 0.96 };
          }
        }
        return { answers, usage: {} };
      }
      async predictBatch(states, questions) {
        return Promise.all(states.map(state => this.predict(state, questions)));
      }
    }
  `);
  return { dir, map, catalog, laya, output };
}

function run(...args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8', timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

test('inspect-map parses TypeScript without executing it or loading Laya', async t => {
  const f = await fixture(t);
  const result = run('--inspect-map', '--map', f.map);
  const json = JSON.parse(result.stdout);
  assert.equal(json.technologyCount, 2);
  assert.equal(json.mappedSkillCount, 4);
  assert.deepEqual(json.technologyIds, ['bash', 'ink']);
});

test('catalog mode reports suggestions and leaves catalog unchanged by default', async t => {
  const f = await fixture(t);
  const before = await readFile(f.catalog, 'utf8');
  run('--map', f.map, '--catalog', f.catalog, '--laya', f.laya,
    '--model', f.dir, '--output', f.output);
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
  run('--map', f.map, '--catalog', f.catalog, '--laya', f.laya,
    '--model', f.dir, '--output', f.output, '--write', '--threshold', '0.95');
  const updated = JSON.parse(await readFile(f.catalog, 'utf8'));
  assert.deepEqual(updated.skills[0].technologies, ['ink']);
  assert.deepEqual(updated.skills[1].technologies, ['bash']);
  assert.equal('technologies' in updated.skills[2], false);
  const report = JSON.parse(await readFile(f.output, 'utf8'));
  assert.equal(report.changedCatalog, true);
});

test('map mode retains AutoSkills technologies and classifies slugs', async t => {
  const f = await fixture(t);
  run('--mode', 'map', '--map', f.map, '--laya', f.laya,
    '--model', f.dir, '--output', f.output, '--batch-size', '2');
  const report = JSON.parse(await readFile(f.output, 'utf8'));
  assert.equal(report.records.length, 4);
  assert.deepEqual(report.records.find(x => x.id === 'combo-skill').technologies.sort(),
    ['bash', 'ink']);
  assert.equal(report.records.find(x => x.id === 'frontend-skill').frontendBonus, true);
  assert.ok(report.records.every(x => x.domain === 'tooling_cli'));
});
