/** Read full SKILL.md for local or GitHub-backed catalog entries. */
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

const MAX_SOURCE_BYTES = 1024 * 1024;
function safePath(value, label) {
  if (typeof value !== 'string' || !value || isAbsolute(value) || value.includes('\\') ||
    value.split('/').some(s => !s || s === '.' || s === '..') || value.includes('\0')) {
    throw new Error(`Invalid ${label}: expected a safe relative POSIX path`);
  }
  return value;
}
function inside(root, filename) {
  const rel = relative(root, filename);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error('SKILL.md path must be inside the catalog directory');
  }
}

export async function readSkillMarkdown(skill, catalogPath, fetchImpl = fetch) {
  if (typeof skill.id !== 'string' || !skill.id) throw new Error('Catalog skill needs an id');
  let content, source;
  if (skill.path && !skill.repository && !skill.directory) {
    const root = await realpath(dirname(resolve(catalogPath)));
    const dir = resolve(root, safePath(skill.path, 'skill path'));
    inside(root, dir);
    const physical = await realpath(resolve(dir, 'SKILL.md'));
    inside(root, physical); // reject symlinks escaping the repository
    const info = await stat(physical);
    if (!info.isFile() || info.size > MAX_SOURCE_BYTES) {
      throw new Error(`SKILL.md is not a regular file or is oversized: ${skill.id}`);
    }
    content = await readFile(physical, 'utf8');
    source = relative(root, physical).split(sep).join('/');
  } else if (!skill.path && skill.repository && skill.directory) {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(skill.repository)) {
      throw new Error(`Invalid repository: ${skill.repository}`);
    }
    const dir = safePath(skill.directory, 'skill directory');
    const url = `https://api.github.com/repos/${skill.repository}/contents/${dir.split('/').map(encodeURIComponent).join('/')}/SKILL.md`;
    const headers = { accept: 'application/vnd.github+json',
      'user-agent': 'custom-skills-laya-classifier', 'x-github-api-version': '2022-11-28' };
    if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Could not fetch ${skill.id} SKILL.md from GitHub (HTTP ${response.status})`);
    const file = await response.json();
    if (file.type !== 'file' || file.encoding !== 'base64' || typeof file.content !== 'string' ||
        file.content.length > Math.ceil(MAX_SOURCE_BYTES / 3) * 4 + 8) {
      throw new Error(`Unexpected or oversized GitHub SKILL.md content for ${skill.id}`);
    }
    content = Buffer.from(file.content.replace(/\s/g, ''), 'base64').toString('utf8');
    source = `${skill.repository}/${dir}/SKILL.md`;
  } else {
    throw new Error(`Catalog skill ${skill.id} needs exactly one of path or repository+directory`);
  }
  if (!content.trim() || Buffer.byteLength(content) > MAX_SOURCE_BYTES || content.includes('\uFFFD')) {
    throw new Error(`SKILL.md is empty, invalid UTF-8, or oversized: ${skill.id}`);
  }
  return { content, source };
}

/** Every source character appears in at least one bounded, overlapping window. */
export function skillChunks(markdown, chunkChars = 700) {
  if (!Number.isSafeInteger(chunkChars) || chunkChars < 200 || chunkChars > 4000) {
    throw new Error('chunkChars must be an integer between 200 and 4000');
  }
  const overlap = Math.min(120, Math.floor(chunkChars / 5));
  const chunks = [];
  for (let start = 0; start < markdown.length;) {
    const end = Math.min(start + chunkChars, markdown.length);
    chunks.push({ start, end, text: markdown.slice(start, end) });
    if (end === markdown.length) break;
    start = end - overlap;
  }
  return chunks;
}
