#!/usr/bin/env node
/**
 * Reconcile catalog.json with skills/<id>/SKILL.md.
 *
 * - SKILL.md frontmatter owns id + description.
 * - catalog.json owns recommendation metadata (technologies / always).
 * - Existing external / manually curated sources are retained.
 * - Deleted managed skills are removed; new ones are manual-select by default.
 * - --check reports drift without modifying the catalog.
 */
import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VALID_ID = /^[a-z0-9][a-z0-9._-]*$/;
const managedPath = (p) => typeof p === 'string' && /^(?:\.\/)?skills\/[a-z0-9][a-z0-9._-]*$/.test(p);

function parseScalar(raw, label) {
  const value = raw.trim();
  if (!value) throw new Error(`${label}: value must not be empty`);
  if (value.startsWith('"')) {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === 'string' && parsed.trim()) return parsed.trim();
    } catch { /* fall through */ }
    throw new Error(`${label}: unsupported double-quoted value; use JSON-compatible escaping`);
  }
  if (value.startsWith("'")) {
    if (!value.endsWith("'") || value.length < 2) throw new Error(`${label}: unterminated quote`);
    return value.slice(1, -1).replace(/''/g, "'").trim();
  }
  if (/^[>|][-+]?$/.test(value)) throw new Error(`${label}: a block scalar needs indented content`);
  return value;
}

// Parse only the simple YAML subset required by the standard skill metadata.
// Fail rather than silently generating a misleading description for unrecognized syntax.
export function readSkillMetadata(file) {
  const contents = readFileSync(file, 'utf8');
  const match = contents.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error(`${file}: missing leading YAML frontmatter`);
  const lines = match[1].split(/\r?\n/);
  const fields = new Map();
  for (let i = 0; i < lines.length; i++) {
    const found = lines[i].match(/^(name|description):\s*(.*)$/);
    if (!found) continue;
    const [, key, raw] = found;
    if (fields.has(key)) throw new Error(`${file}: duplicate ${key} field`);
    const value = raw.trim();
    if (/^[>|][-+]?$/.test(value)) {
      const folded = value.startsWith('>');
      const block = [];
      let minIndent = Infinity;
      while (i + 1 < lines.length) {
        const line = lines[i + 1];
        if (line.trim() && !/^\s+/.test(line)) break;
        i++;
        if (line.trim()) minIndent = Math.min(minIndent, line.match(/^\s*/)[0].length);
        block.push(line);
      }
      if (!block.some((line) => line.trim())) throw new Error(`${file}: ${key} block is empty`);
      const parts = block.map((line) => line.slice(Math.min(line.match(/^\s*/)[0].length, minIndent)).trimEnd());
      const result = folded ? parts.join(' ').replace(/\s+/g, ' ').trim() : parts.join('\n').trim();
      fields.set(key, result);
    } else {
      fields.set(key, parseScalar(value, `${file}: ${key}`));
    }
  }
  const name = fields.get('name');
  const description = fields.get('description');
  if (!VALID_ID.test(name ?? '')) throw new Error(`${file}: frontmatter name must be a lowercase skill ID`);
  if (typeof description !== 'string' || !description.trim()) throw new Error(`${file}: missing nonempty description`);
  return { name, description };
}

function discover(root) {
  const base = join(root, 'skills');
  if (!existsSync(base)) throw new Error('skills/ directory is missing');
  if (!lstatSync(base).isDirectory() || lstatSync(base).isSymbolicLink()) {
    throw new Error('skills/ must be a regular directory');
  }
  const found = new Map();
  for (const entry of readdirSync(base, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    if (entry.isSymbolicLink()) throw new Error(`skills/${entry.name}: symlinked skill directories are not allowed`);
    if (!entry.isDirectory()) continue;
    const directory = join(base, entry.name);
    const skillFile = join(directory, 'SKILL.md');
    if (!existsSync(skillFile)) continue; // Auxiliary folders are not skills.
    if (!lstatSync(skillFile).isFile() || lstatSync(skillFile).isSymbolicLink()) {
      throw new Error(`skills/${entry.name}/SKILL.md: expected a regular file`);
    }
    const meta = readSkillMetadata(skillFile);
    if (meta.name !== entry.name) throw new Error(`skills/${entry.name}: frontmatter name ${meta.name} must match folder name`);
    if (found.has(meta.name)) throw new Error(`duplicate skill name ${meta.name}`);
    found.set(meta.name, { id: meta.name, description: meta.description, path: `skills/${meta.name}` });
  }
  return found;
}

export function buildCatalog(root = defaultRoot) {
  const catalogPath = join(root, 'catalog.json');
  const existing = existsSync(catalogPath)
    ? JSON.parse(readFileSync(catalogPath, 'utf8'))
    : { version: 1, skills: [] };
  if (!existing || existing.version !== 1 || !Array.isArray(existing.skills) ||
      Object.keys(existing).some((key) => !['version', 'skills'].includes(key))) {
    throw new Error('catalog.json: expected AutoSkills v1 catalog with only version and skills');
  }
  const found = discover(root);
  const usedIds = new Set();
  const matched = new Set();
  const skills = [];
  for (const entry of existing.skills) {
    if (!entry || typeof entry !== 'object' || !VALID_ID.test(entry.id ?? '') ||
        typeof entry.description !== 'string') {
      throw new Error('catalog.json: existing entry has invalid id or description');
    }
    if (usedIds.has(entry.id)) throw new Error(`catalog.json: duplicate ID ${entry.id}`);
    usedIds.add(entry.id);
    if (managedPath(entry.path)) {
      const idFromPath = entry.path.replace(/^\.?\/?skills\//, '');
      const current = found.get(idFromPath);
      if (!current) continue; // Deleted managed skill.
      if (entry.id !== current.id) throw new Error(`catalog.json: ID ${entry.id} must match ${current.path}`);
      skills.push({ ...entry, description: current.description, path: current.path });
      matched.add(current.id);
    } else {
      skills.push(entry); // Cross-repo and custom-path entries are user-managed.
    }
  }
  for (const skill of found.values()) {
    if (matched.has(skill.id)) continue;
    if (usedIds.has(skill.id)) throw new Error(`catalog.json: new skill ${skill.id} conflicts with an existing entry`);
    skills.push(skill);
    usedIds.add(skill.id);
  }
  return { version: 1, skills };
}

export function syncCatalog(root = defaultRoot, { check = false } = {}) {
  const catalogPath = join(root, 'catalog.json');
  const next = `${JSON.stringify(buildCatalog(root), null, 2)}\n`;
  const previous = existsSync(catalogPath) ? readFileSync(catalogPath, 'utf8') : '';
  if (next === previous) {
    console.log('catalog.json is up to date.');
    return false;
  }
  if (check) throw new Error('catalog.json is out of date. Run npm run catalog:sync.');
  writeFileSync(catalogPath, next);
  console.log('Updated catalog.json from skills/*/SKILL.md.');
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== '--check')) {
      throw new Error('Usage: node scripts/sync-catalog.mjs [--check]');
    }
    syncCatalog(defaultRoot, { check: process.argv[2] === '--check' });
  } catch (error) {
    console.error(`ERROR ${error.message}`);
    process.exitCode = 1;
  }
}
