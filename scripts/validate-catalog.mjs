#!/usr/bin/env node
import { readFileSync, lstatSync, realpathSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const fail = (location, why) => errors.push(`${location}: ${why}`);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (v, key) => Object.hasOwn(v, key);
const validId = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9._-]*$/.test(s);

// Mirrors the path restrictions of the version-1 parser. A path may be '.'.
function validRelativePath(v) {
  if (typeof v !== 'string' || !v.length || v.includes('\\') || v.includes('\0') || v.startsWith('/')) return false;
  if (/^[a-zA-Z]:/.test(v)) return false;
  if (v === '.') return true;
  return v.replace(/^\.\//, '').split('/').every((part) => part.length && part !== '.' && part !== '..');
}
function inside(root, candidate) {
  const p = relative(root, candidate);
  return p === '' || (p !== '..' && !p.startsWith(`..${sep}`) && !isAbsolute(p));
}
function checkNoSymlinks(dir, label) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = join(dir, entry.name);
    if (entry.isSymbolicLink()) { fail(label, `symlink is not allowed: ${relative(repoRoot, child)}`); continue; }
    if (entry.isDirectory()) checkNoSymlinks(child, label);
  }
}

let catalog;
try { catalog = JSON.parse(readFileSync(join(repoRoot, 'catalog.json'), 'utf8')); }
catch (error) { console.error(`catalog.json: ${error.message}`); process.exit(1); }

if (!isObject(catalog)) {
  fail('catalog.json', 'expected an object');
} else {
  for (const k of Object.keys(catalog)) if (!['version', 'skills'].includes(k)) fail('catalog.json', `unknown field ${k}`);
  if (catalog.version !== 1) fail('catalog.json.version', 'expected integer 1');
  if (!Array.isArray(catalog.skills)) fail('catalog.json.skills', 'expected an array');
  else {
    const ids = new Set();
    catalog.skills.forEach((skill, i) => {
      const where = `catalog.json.skills[${i}]`;
      if (!isObject(skill)) { fail(where, 'expected an object'); return; }
      const allowed = ['id','description','path','repository','directory','technologies','always'];
      for (const k of Object.keys(skill)) if (!allowed.includes(k)) fail(where, `unknown field ${k}`);
      if (!validId(skill.id)) fail(`${where}.id`, 'expected lowercase letters/digits plus ._-');
      else { if (ids.has(skill.id)) fail(`${where}.id`, `duplicate ID ${skill.id}`); ids.add(skill.id); }
      if (typeof skill.description !== 'string' || !skill.description.trim()) fail(`${where}.description`, 'expected nonempty string');
      const hasPath = own(skill, 'path');
      const hasRemote = own(skill, 'repository') || own(skill, 'directory');
      if (hasPath === hasRemote) fail(where, 'choose path OR (repository and directory)');
      if (hasPath) {
        if (!validRelativePath(skill.path)) fail(`${where}.path`, 'expected safe relative path');
        else {
          const skillDir = resolve(repoRoot, skill.path);
          if (!inside(repoRoot, skillDir)) fail(`${where}.path`, 'escapes repository');
          else if (!existsSync(skillDir)) fail(`${where}.path`, `missing directory ${skill.path}`);
          else if (lstatSync(skillDir).isSymbolicLink()) fail(`${where}.path`, 'directory cannot be a symlink');
          else if (!lstatSync(skillDir).isDirectory()) fail(`${where}.path`, 'not a directory');
          else if (!inside(realpathSync(repoRoot), realpathSync(skillDir))) fail(`${where}.path`, 'resolves outside repository');
          else {
            const entrypoint = join(skillDir, 'SKILL.md');
            if (!existsSync(entrypoint) || !lstatSync(entrypoint).isFile()) fail(`${where}.path`, 'missing SKILL.md');
            else {
              const body = readFileSync(entrypoint, 'utf8');
              if (!/^---\r?\n[\s\S]*?\r?\n---\r?\n/.test(body)) fail(`${where}.path`, 'SKILL.md should have YAML frontmatter');
              if (!new RegExp(`^name:\\s*${skill.id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*$`, 'm').test(body))
                fail(`${where}.path`, 'SKILL.md frontmatter name should match catalog id');
            }
            checkNoSymlinks(skillDir, where);
          }
        }
      }
      if (hasRemote) {
        if (typeof skill.repository !== 'string' || !/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(skill.repository) || skill.repository.split('/').some((s) => s === '.' || s === '..'))
          fail(`${where}.repository`, 'expected owner/repository');
        if (!validRelativePath(skill.directory)) fail(`${where}.directory`, 'expected safe exact directory');
      }
      if (own(skill, 'technologies')) {
        if (!Array.isArray(skill.technologies) || skill.technologies.some((v) => typeof v !== 'string')) fail(`${where}.technologies`, 'expected an array of technology ID strings');
        // Authoritative validation against SKILLS_MAP is performed by `autoskills registry refresh`.
      }
      if (own(skill, 'always') && typeof skill.always !== 'boolean') fail(`${where}.always`, 'expected boolean');
    });
  }
}

if (errors.length) {
  for (const error of errors) console.error(`ERROR ${error}`);
  process.exit(1);
}
console.log(`Validated ${catalog.skills.length} skill entries (catalog v1; local checks only).`);
