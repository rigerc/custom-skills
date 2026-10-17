#!/usr/bin/env node
/**
 * Classify AutoSkills built-in skills into broad domains, or suggest supported
 * AutoSkills technology IDs for custom-skills/catalog.json using laya-ts.
 *
 * Requires Node >= 22, `typescript`, and a running Laya Docker HTTP service.
 * The AutoSkills TypeScript source is PARSED, never executed.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const DEFAULT_MAP = 'https://raw.githubusercontent.com/rigerc/autoskills/main/packages/autoskills/skills-map.ts';

const DOMAINS = {
  frontend: 'Web user interfaces, CSS, and frontend frameworks',
  backend: 'Server-side development, APIs, and web services',
  data: 'Databases, storage, schema, and data access',
  mobile_desktop: 'Native mobile and desktop app development',
  cloud_devops: 'Cloud infrastructure, deployment, and operations',
  security_auth: 'Security, authentication, identity, and authorization',
  ai_agents: 'AI applications, LLMs, agents, and machine learning',
  testing_quality: 'Testing, performance analysis, debugging, and quality',
  tooling_cli: 'CLI tools, shells, build tools, and developer workflow',
  media_graphics: 'Audio, video, animation, 3D, and graphics',
  other: 'Other or broadly applicable software engineering skills',
};
const DOMAIN_QUESTION = {
  type: 'choice',
  instructions: 'Which ONE domain best describes the primary purpose of this agent skill?',
  criteria: DOMAINS,
};

function usage() {
  console.log(`Usage: node classify-skills.mjs [options]

Options:
  --mode catalog|map   catalog: recommend valid technology IDs (default)
                       map: classify all built-in SKILLS_MAP skills by domain
  --map PATH_OR_URL    Fork skills-map.ts; defaults to rigerc/autoskills main
  --catalog PATH       Custom-registry catalog.json (default ./catalog.json)
  --model NAME         Laya server checkpoint (default english)
  --laya-url URL       Dockerized Laya server (default http://127.0.0.1:8000)
  --output PATH        Report JSON (default ./skill-classifications.json)
  --threshold N        Minimum P(true) to suggest a technology (default 0.80)
  --min-domain N       Below this domain confidence, mark needsReview (default 0.55)
  --max-candidates N   Candidate technology limit per custom skill (default 12)
  --batch-size N       Batch size when scanning built-in map (default 4)
  --limit N            Classify only the first N records (for sampling)
  --write              Add approved suggestions to catalog.json (catalog mode only)
  --inspect-map        Print parsed map IDs and counts; no model required
  --help               Show this help

The default run NEVER modifies catalog.json; --write only ADDS suggested IDs.
`);
}

function parseArgs(argv) {
  const args = {
    mode: 'catalog', map: DEFAULT_MAP, catalog: './catalog.json',
    model: 'english', layaUrl: process.env.LAYA_URL || 'http://127.0.0.1:8000',
    output: './skill-classifications.json',
    threshold: 0.80, minDomain: 0.55, maxCandidates: 12,
    batchSize: 4, limit: Number.MAX_SAFE_INTEGER, write: false, inspectMap: false,
  };
  const valueOptions = new Map([
    ['--mode', 'mode'], ['--map', 'map'], ['--catalog', 'catalog'],
    ['--model', 'model'], ['--laya-url', 'layaUrl'], ['--output', 'output'],
    ['--threshold', 'threshold'], ['--min-domain', 'minDomain'],
    ['--max-candidates', 'maxCandidates'], ['--batch-size', 'batchSize'],
    ['--limit', 'limit'],
  ]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { usage(); process.exit(0); }
    if (arg === '--write') { args.write = true; continue; }
    if (arg === '--inspect-map') { args.inspectMap = true; continue; }
    if (!valueOptions.has(arg) || !argv[i + 1]) throw new Error(`Missing/unknown option: ${arg}`);
    const key = valueOptions.get(arg);
    args[key] = argv[++i];
  }
  for (const key of ['threshold', 'minDomain', 'maxCandidates', 'batchSize', 'limit']) {
    args[key] = Number(args[key]);
    if (!Number.isFinite(args[key]) || args[key] <= 0) throw new Error(`${key} must be positive`);
  }
  if (args.threshold > 1 || args.minDomain > 1) throw new Error('Confidence thresholds must be <= 1');
  for (const k of ['maxCandidates', 'batchSize', 'limit']) {
    if (!Number.isInteger(args[k])) throw new Error(`${k} must be an integer`);
  }
  if (!['catalog', 'map'].includes(args.mode)) throw new Error('mode must be catalog or map');
  if (args.write && args.mode !== 'catalog') throw new Error('--write requires --mode catalog');
  if (args.batchSize > 64) throw new Error('batchSize must be <= 64 (Laya HTTP batch limit)');
  let url;
  try { url = new URL(args.layaUrl); }
  catch { throw new Error('layaUrl must be a valid HTTP(S) URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.search || url.hash || url.pathname !== '/') {
    throw new Error('layaUrl must be an HTTP(S) server origin without credentials, path or query');
  }
  if (!args.model.trim()) throw new Error('model must be non-empty');
  return args;
}

async function readSource(pathOrUrl) {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    if (!pathOrUrl.startsWith('https://')) throw new Error('Use HTTPS for remote maps');
    const res = await fetch(pathOrUrl, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`Could not fetch map (${res.status}): ${pathOrUrl}`);
    return res.text();
  }
  return readFile(resolve(pathOrUrl), 'utf8');
}

function readTs() {
  try { return require('typescript'); }
  catch { throw new Error('Missing TypeScript parser. Run: npm install'); }
}

// Simple AST reading: accepts string literals and arrays, never evaluates TS or regexes.
function parseSkillMap(source) {
  const ts = readTs();
  const sf = ts.createSourceFile('skills-map.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (sf.parseDiagnostics.length) throw new Error(`Invalid skills-map.ts: ${sf.parseDiagnostics[0].messageText}`);
  const decl = (name) => {
    let init;
    for (const statement of sf.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const d of statement.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === name) init = d.initializer;
      }
    }
    return init;
  };
  const prop = (node, key) => {
    if (!node || !ts.isObjectLiteralExpression(node)) return undefined;
    const p = node.properties.find(x => ts.isPropertyAssignment(x) &&
      (ts.isIdentifier(x.name) || ts.isStringLiteral(x.name)) && x.name.text === key);
    return p?.initializer;
  };
  const string = (node) => node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined;
  const strings = (node) => node && ts.isArrayLiteralExpression(node)
    ? node.elements.map(string).filter(x => x !== undefined) : [];
  const objects = (node) => node && ts.isArrayLiteralExpression(node) ? [...node.elements] : [];
  const technologies = objects(decl('SKILLS_MAP')).map((n) => {
    const det = prop(n, 'detect');
    return {
      id: string(prop(n, 'id')),
      name: string(prop(n, 'name')),
      skills: strings(prop(n, 'skills')),
      keywords: [...new Set([
        ...strings(prop(det, 'packages')),
        ...strings(prop(det, 'pythonPackages')),
        ...strings(prop(det, 'fileExtensions')),
        ...strings(prop(det, 'configFiles')),
        ...strings(prop(det, 'gems')),
      ])],
    };
  });
  const combos = objects(decl('COMBO_SKILLS_MAP')).map(n => ({
    id: string(prop(n, 'id')),
    requires: strings(prop(n, 'requires')),
    skills: strings(prop(n, 'skills')),
  }));
  const extras = strings(decl('FRONTEND_BONUS_SKILLS'));
  if (!technologies.length || technologies.some(t => !t.id || !t.name || !Array.isArray(t.skills))) {
    throw new Error('SKILLS_MAP not found or unexpected structure');
  }
  if (new Set(technologies.map(t => t.id)).size !== technologies.length) {
    throw new Error('Duplicate technology IDs in SKILLS_MAP');
  }
  return { technologies, combos, extras };
}

function mapBuiltinSkills(map) {
  const bySlug = new Map();
  const add = (slug, ids, combo = null) => {
    if (typeof slug !== 'string' || !slug) return;
    const entry = bySlug.get(slug) || { id: slug, technologies: [], combos: [], frontendBonus: false };
    entry.technologies = [...new Set([...entry.technologies, ...ids])];
    if (combo) entry.combos = [...new Set([...entry.combos, combo])];
    bySlug.set(slug, entry);
  };
  for (const tech of map.technologies) for (const s of tech.skills) add(s, [tech.id]);
  for (const combo of map.combos) for (const s of combo.skills) add(s, combo.requires, combo.id);
  for (const s of map.extras) {
    add(s, []);
    bySlug.get(s).frontendBonus = true;
  }
  return [...bySlug.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function canonical(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').trim().replace(/\s+/g, ' ');
}
function includesTerm(haystack, rawTerm) {
  const term = canonical(rawTerm);
  if (term.length < 3) return false;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i').test(haystack);
}

function technologyCandidates(skill, technologies, maxCandidates) {
  const content = canonical(`${skill.id} ${skill.description ?? ''}`);
  const idContent = canonical(skill.id);
  const existing = new Set(skill.technologies || []);
  return technologies.map(tech => {
    let score = 0;
    if (existing.has(tech.id)) score += 100;
    if (includesTerm(idContent, tech.id)) score += 30;
    if (includesTerm(content, tech.id)) score += 10;
    if (includesTerm(content, tech.name)) score += 10;
    for (const keyword of tech.keywords) {
      // Avoid generic project files (package-lock.json), too-short package names, etc.
      if (keyword.length >= 4 && includesTerm(content, keyword)) score += 2;
    }
    return { tech, score };
  }).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.tech.id.localeCompare(b.tech.id))
    .slice(0, maxCandidates)
    .map(x => x.tech);
}

function skillState(skill, techNames = []) {
  return `Agent skill: ${skill.id}\nDescription: ${String(skill.description || '').slice(0, 1600)}\n` +
    (techNames.length ? `Technologies mentioned by AutoSkills: ${techNames.join(', ')}` : '');
}
function isTruncated(result) {
  const usage = result?.usage;
  return Boolean(usage?.truncated ||
    (Array.isArray(usage?.truncated_questions) && usage.truncated_questions.length > 0) ||
    (usage?.options && Object.keys(usage.options).length > 0));
}
function domainAnswer(result, minDomain) {
  const a = result?.answers?.domain;
  if (a?.type !== 'choice' || !Object.hasOwn(DOMAINS, a.choice)) {
    throw new Error('Unexpected Laya domain answer');
  }
  const confidence = a.answer_confidence ?? a.probabilities?.[a.choice] ?? 0;
  return { domain: a.choice, domainConfidence: confidence,
    needsReview: confidence < minDomain || isTruncated(result) };
}

function createLayaClient(args) {
  const baseUrl = new URL(args.layaUrl);
  const headers = { 'content-type': 'application/json' };
  if (process.env.LAYA_API_KEY) headers.authorization = `Bearer ${process.env.LAYA_API_KEY}`;

  async function request(path, payload) {
    let response;
    try {
      response = await fetch(new URL(path, baseUrl), {
        method: 'POST', headers, body: JSON.stringify(payload),
        signal: AbortSignal.timeout(600_000),
      });
    } catch (error) {
      throw new Error(`Cannot reach Laya at ${baseUrl.origin}: ${error.message}. Start it with npm run laya:up.`);
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`Laya HTTP ${response.status}: ${detail}`);
    }
    try { return await response.json(); }
    catch { throw new Error('Laya returned invalid JSON'); }
  }

  return {
    predict: (state, questions) =>
      request('/v1/systemone', { state, questions, model: args.model }),
    predictBatch: async (states, questions) => {
      const result = await request('/v1/systemone/batch', { states, questions, model: args.model });
      if (!Array.isArray(result?.results)) throw new Error('Unexpected Laya batch response');
      return result.results;
    },
  };
}

async function classifyCatalog(args, map, agent) {
  const original = JSON.parse(await readFile(resolve(args.catalog), 'utf8'));
  if (original.version !== 1 || !Array.isArray(original.skills)) throw new Error('Expected version-1 custom-skills catalog.json');
  const records = [];
  let changed = false;
  for (const s of original.skills.slice(0, args.limit)) {
    const candidates = technologyCandidates(s, map.technologies, args.maxCandidates);
    const questions = { domain: DOMAIN_QUESTION };
    for (let i = 0; i < candidates.length; i++) {
      const tech = candidates[i];
      questions[`tech_${i}`] = {
        type: 'noul',
        instructions: `Should this agent skill be recommended WHEN ${tech.name} (${tech.id}) is detected in a project? Answer YES only if the skill specifically targets or requires ${tech.name}. Ignore incidental mentions and loose similarities.`,
      };
    }
    const result = await agent.predict(skillState(s), questions);
    const domain = domainAnswer(result, args.minDomain);
    const suggestions = candidates.map((tech, i) => {
      const ans = result.answers?.[`tech_${i}`];
      if (ans?.type !== 'noul' || typeof ans.noul !== 'number') {
        throw new Error(`Unexpected Laya yes/no answer for ${s.id}:${tech.id}`);
      }
      return { id: tech.id, probability: ans.noul };
    }).sort((a, b) => b.probability - a.probability);
    const safeToWrite = !isTruncated(result);
    const approved = safeToWrite ? suggestions.filter(x => x.probability >= args.threshold).map(x => x.id) : [];
    const old = Array.isArray(s.technologies) ? [...s.technologies] : [];
    const additions = approved.filter(id => !old.includes(id));
    if (args.write && additions.length) {
      s.technologies = [...new Set([...old, ...additions])];
      changed = true;
    }
    records.push({ id: s.id, ...domain, existingTechnologies: old,
      suggestions, proposedAdditions: additions,
      needsReview: domain.needsReview || !safeToWrite || !candidates.length ||
        (suggestions.length > 0 && approved.length === 0),
    });
    console.error(`${s.id}: ${domain.domain}; +[${additions.join(', ') || 'none'}]`);
  }
  if (args.write && changed) {
    await writeFile(resolve(args.catalog), `${JSON.stringify(original, null, 2)}\n`);
  }
  return { mode: 'catalog', changedCatalog: args.write && changed, records };
}

async function classifyMap(args, map, agent) {
  const lookup = new Map(map.technologies.map(t => [t.id, t.name]));
  const skills = mapBuiltinSkills(map).slice(0, args.limit);
  const states = skills.map(s => skillState(s, s.technologies.map(t => lookup.get(t) || t)));
  const records = [];
  for (let i = 0; i < states.length; i += args.batchSize) {
    const batch = skills.slice(i, i + args.batchSize);
    const output = await agent.predictBatch(states.slice(i, i + args.batchSize), { domain: DOMAIN_QUESTION }, { batchSize: args.batchSize });
    if (!Array.isArray(output) || output.length !== batch.length) throw new Error('Unexpected Laya batch result length');
    for (let j = 0; j < batch.length; j++) {
      records.push({ ...batch[j], ...domainAnswer(output[j], args.minDomain) });
    }
    console.error(`Classified ${Math.min(i + args.batchSize, skills.length)}/${skills.length}`);
  }
  return { mode: 'map', records };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const map = parseSkillMap(await readSource(args.map));
  if (args.inspectMap) {
    console.log(JSON.stringify({ technologyCount: map.technologies.length,
      mappedSkillCount: mapBuiltinSkills(map).length,
      technologyIds: map.technologies.map(t => t.id) }, null, 2));
    return;
  }
  const agent = createLayaClient(args);
  const results = args.mode === 'catalog'
    ? await classifyCatalog(args, map, agent)
    : await classifyMap(args, map, agent);
  const report = { generatedAt: new Date().toISOString(), map: args.map,
    model: args.model, layaUrl: args.layaUrl, threshold: args.threshold, ...results };
  await writeFile(resolve(args.output), `${JSON.stringify(report, null, 2)}\n`);
  console.error(`Wrote ${args.output} (${results.records.length} records).`);
  if (args.write) console.error(results.changedCatalog ? 'Updated catalog.json.' : 'No catalog changes.');
}

main().catch(error => { console.error(`Error: ${error.message}`); process.exitCode = 1; });