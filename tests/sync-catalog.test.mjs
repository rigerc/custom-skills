import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCatalog, readSkillMetadata, syncCatalog } from '../scripts/sync-catalog.mjs';

function sandbox(t, catalog = { version: 1, skills: [] }) {
  const root = mkdtempSync(join(tmpdir(), 'skill-catalog-'));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  mkdirSync(join(root, 'skills'));
  writeFileSync(join(root, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
  return root;
}
function addSkill(root, id, description = `Description of ${id}`) {
  const dir = join(root, 'skills', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${id}\ndescription: ${description}\n---\n\n# ${id}\n`);
}
function load(root) { return JSON.parse(readFileSync(join(root, 'catalog.json'), 'utf8')); }

test('automatically adds skills in deterministic order, without recommending them by default', (t) => {
  const root = sandbox(t);
  addSkill(root, 'zeta');
  addSkill(root, 'alpha');
  syncCatalog(root);
  assert.deepEqual(load(root).skills, [
    { id: 'alpha', description: 'Description of alpha', path: 'skills/alpha' },
    { id: 'zeta', description: 'Description of zeta', path: 'skills/zeta' },
  ]);
  assert.equal(syncCatalog(root), false);
  assert.equal(syncCatalog(root, { check: true }), false);
});

test('refreshes description while preserving technologies and always', (t) => {
  const root = sandbox(t, { version: 1, skills: [
    { id: 'web-review', description: 'outdated', path: 'skills/web-review', technologies: ['react'], always: true },
  ] });
  addSkill(root, 'web-review', 'Current frontmatter description');
  syncCatalog(root);
  assert.deepEqual(load(root).skills[0], {
    id: 'web-review', description: 'Current frontmatter description', path: 'skills/web-review',
    technologies: ['react'], always: true,
  });
});

test('prunes removed managed entries without touching cross-repository or custom-path entries', (t) => {
  const root = sandbox(t, { version: 1, skills: [
    { id: 'removed', description: 'unused', path: 'skills/removed', always: true },
    { id: 'foreign', description: 'remote', repository: 'org/skills', directory: 'skills/foreign' },
    { id: 'special', description: 'manual path', path: 'custom/special' },
  ] });
  addSkill(root, 'new-skill');
  syncCatalog(root);
  assert.deepEqual(load(root).skills.map((x) => x.id), ['foreign', 'special', 'new-skill']);
});

test('--check reports drift without writing', (t) => {
  const root = sandbox(t);
  addSkill(root, 'new-skill');
  const before = readFileSync(join(root, 'catalog.json'), 'utf8');
  assert.throws(() => syncCatalog(root, { check: true }), /out of date/);
  assert.equal(readFileSync(join(root, 'catalog.json'), 'utf8'), before);
});

test('parses YAML folded descriptions and rejects conflicting names', (t) => {
  const root = sandbox(t);
  addSkill(root, 'folded');
  const file = join(root, 'skills/folded/SKILL.md');
  writeFileSync(file, '---\nname: folded\ndescription: >-\n  First line\n  second line\n---\n');
  assert.deepEqual(readSkillMetadata(file), { name: 'folded', description: 'First line second line' });
  syncCatalog(root);
  assert.equal(load(root).skills[0].description, 'First line second line');
  writeFileSync(file, '---\nname: different\ndescription: A thing\n---\n');
  assert.throws(() => buildCatalog(root), /must match folder name/);
});

test('refuses duplicate IDs and symlinked skill entries', (t) => {
  const root = sandbox(t, { version: 1, skills: [
    { id: 'one', description: 'remote', repository: 'org/repo', directory: 'one' },
  ] });
  addSkill(root, 'one');
  assert.throws(() => buildCatalog(root), /conflicts with an existing entry/);
  const external = join(root, 'external');
  mkdirSync(external);
  symlinkSync(external, join(root, 'skills', 'link'));
  assert.throws(() => buildCatalog(root), /symlinked skill directories/);
});
