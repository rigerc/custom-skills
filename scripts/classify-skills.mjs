#!/usr/bin/env node
/**
 * Classify AutoSkills built-in skills into broad domains, or suggest supported
 * AutoSkills technology IDs for custom-skills/catalog.json using the Dockerized Laya HTTP API.
 *
 * Requires Node >= 22, `typescript`, and a running Laya Docker HTTP service.
 * The AutoSkills TypeScript source is PARSED, never executed.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readSkillMarkdown } from './skill-source.mjs';
import { cachedSkillProfile, technologyQuestion, selectedEvidence, isBorderline } from './skill-profile.mjs';
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
  --tech-batch-size N  Technology questions per HTTP call (default 8; max 63)
  --chunk-chars N      Max targeted fallback excerpt length (default 600)
  --fallback-limit N   Max borderline technology rechecks per skill (default 12)
  --no-fallback        Skip targeted evidence rechecks (diagnostics/benchmarking)
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
    threshold: 0.80, minDomain: 0.55, techBatchSize: 8, chunkChars: 600, fallbackLimit: 12, fallback: true,
    batchSize: 4, limit: Number.MAX_SAFE_INTEGER, write: false, inspectMap: false,
  };
  const valueOptions = new Map([
    ['--mode', 'mode'], ['--map', 'map'], ['--catalog', 'catalog'],
    ['--model', 'model'], ['--laya-url', 'layaUrl'], ['--output', 'output'],
    ['--threshold', 'threshold'], ['--min-domain', 'minDomain'],
    ['--tech-batch-size', 'techBatchSize'], ['--chunk-chars', 'chunkChars'], ['--fallback-limit', 'fallbackLimit'], ['--batch-size', 'batchSize'],
    ['--limit', 'limit'],
  ]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { usage(); process.exit(0); }
    if (arg === '--write') { args.write = true; continue; }
    if (arg === '--inspect-map') { args.inspectMap = true; continue; }
    if (arg === '--no-fallback') { args.fallback = false; continue; }
    if (!valueOptions.has(arg) || !argv[i + 1]) throw new Error(`Missing/unknown option: ${arg}`);
    const key = valueOptions.get(arg);
    args[key] = argv[++i];
  }
  for (const key of ['threshold', 'minDomain', 'techBatchSize', 'chunkChars', 'fallbackLimit', 'batchSize', 'limit']) {
    args[key] = Number(args[key]);
    if (!Number.isFinite(args[key]) || args[key] <= 0) throw new Error(`${key} must be positive`);
  }
  if (args.threshold > 1 || args.minDomain > 1) throw new Error('Confidence thresholds must be <= 1');
  for (const k of ['techBatchSize', 'chunkChars', 'fallbackLimit', 'batchSize', 'limit']) {
    if (!Number.isInteger(args[k])) throw new Error(`${k} must be an integer`);
  }
  if (!['catalog', 'map'].includes(args.mode)) throw new Error('mode must be catalog or map');
  if (args.write && args.mode !== 'catalog') throw new Error('--write requires --mode catalog');
  if (args.batchSize > 64) throw new Error('batchSize must be <= 64 (Laya HTTP batch limit)');
  if (args.techBatchSize > 63) throw new Error('techBatchSize must be <= 63 (Laya question limit)');
  if (args.chunkChars < 200 || args.chunkChars > 1200) throw new Error('chunkChars must be between 200 and 1200');
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
      detect: Object.fromEntries(['packages', 'pythonPackages', 'fileExtensions', 'configFiles', 'gems']
        .map(key => [key, strings(prop(det, key))])),
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
  if (original.version !== 1 || !Array.isArray(original.skills)) {
    throw new Error('Expected version-1 custom-skills catalog.json');
  }
  const knownIds = new Set(map.technologies.map(t => t.id));
  const records = [];
  let changed = false;
  for (const skill of original.skills.slice(0, args.limit)) {
    const {content, source} = await readSkillMarkdown(skill, args.catalog);
    const profile = await cachedSkillProfile(skill, content, args.catalog);
    const scores = new Map();
    const truncation = [];
    let domain = null;
    let requestCount = 0;
    // Primary pass: ONE compact profile scored against EVERY AutoSkills ID.
    for (let offset = 0; offset < map.technologies.length; offset += args.techBatchSize) {
      const group = map.technologies.slice(offset, offset + args.techBatchSize);
      const questions = offset === 0 ? {domain: DOMAIN_QUESTION} : {};
      group.forEach((tech, i) => { questions[`tech_${i}`] = technologyQuestion(tech); });
      const [result] = await agent.predictBatch([profile.text], questions);
      requestCount++;
      if (!result) throw new Error(`Missing Laya primary prediction for ${skill.id}`);
      if (isTruncated(result)) truncation.push({stage:'profile',group:offset});
      if (offset === 0) domain = domainAnswer(result, args.minDomain);
      group.forEach((tech, i) => {
        const answer = result.answers?.[`tech_${i}`];
        if (answer?.type !== 'noul' || !Number.isFinite(answer.noul) ||
            answer.noul < 0 || answer.noul > 1) {
          throw new Error(`Invalid Laya relevance score for ${skill.id}:${tech.id}`);
        }
        scores.set(tech.id, {id:tech.id,probability:answer.noul,profileProbability:answer.noul,
          evidenceUsed:false});
      });
    }
    if (!domain) throw new Error(`No Laya domain score for ${skill.id}`);
    const borderline = args.fallback ? map.technologies
      .filter(tech => isBorderline(scores.get(tech.id).probability, args.threshold))
      .sort((a,b) =>
        Math.abs(scores.get(a.id).probability-args.threshold) -
        Math.abs(scores.get(b.id).probability-args.threshold) || a.id.localeCompare(b.id))
      : [];
    const skippedFallback = borderline.slice(args.fallbackLimit).map(tech => tech.id);
    // Fallback checks only selected Markdown sections for ambiguous decisions.
    for (const tech of borderline.slice(0, args.fallbackLimit)) {
      const excerpt = selectedEvidence(content,tech,args.chunkChars);
      if (!excerpt) {skippedFallback.push(tech.id);continue;}
      const state = `Agent skill: ${skill.id}\nPurpose: ${String(skill.description || '').slice(0,160)}\n${excerpt}`;
      const [result] = await agent.predictBatch([state],{tech_0:technologyQuestion(tech)});
      requestCount++;
      if (!result) throw new Error(`Missing Laya fallback prediction for ${skill.id}:${tech.id}`);
      if (isTruncated(result)) truncation.push({stage:'fallback',technology:tech.id});
      const answer = result.answers?.tech_0;
      if (answer?.type !== 'noul' || !Number.isFinite(answer.noul) ||
          answer.noul < 0 || answer.noul > 1) {
        throw new Error(`Invalid Laya fallback score for ${skill.id}:${tech.id}`);
      }
      const previous = scores.get(tech.id);
      scores.set(tech.id,{...previous,probability:answer.noul,
        evidenceUsed:true,evidenceChars:excerpt.length});
    }
    if (args.fallback && domain.domainConfidence < args.minDomain) {
      const excerpt = selectedEvidence(content,{id:skill.id,name:skill.id},args.chunkChars);
      if (excerpt) {
        const [result] = await agent.predictBatch(
          [`Agent skill: ${skill.id}\n${excerpt}`],{domain:DOMAIN_QUESTION});
        requestCount++;
        if (!result) throw new Error(`Missing Laya domain fallback for ${skill.id}`);
        if (isTruncated(result)) truncation.push({stage:'domain-fallback'});
        domain = domainAnswer(result,args.minDomain);
      }
    }
    const existing = Array.isArray(skill.technologies) ? [...skill.technologies] : [];
    const unknownExistingTechnologies = existing.filter(id => !knownIds.has(id));
    if (unknownExistingTechnologies.length) {
      console.error(`Warning: ${skill.id} has technology IDs absent from AutoSkills: ${unknownExistingTechnologies.join(', ')}`);
    }
    const suggestions = [...scores.values()].sort((a,b) =>
      b.probability-a.probability || a.id.localeCompare(b.id));
    const unverified = new Set(skippedFallback);
    const approved = truncation.length ? [] : suggestions
      .filter(row => row.probability >= args.threshold && !unverified.has(row.id))
      .map(row=>row.id);
    const additions = approved.filter(id=>!existing.includes(id));
    if (args.write && additions.length) {
      skill.technologies = [...new Set([...existing,...additions])];
      changed = true;
    }
    records.push({
      id:skill.id,skillSource:source,sourceChars:content.length,
      profileChars:profile.profileChars,profileCacheHit:profile.cacheHit,
      technologyCount:map.technologies.length,requests:requestCount,
      ...domain,existingTechnologies:existing,unknownExistingTechnologies,
      suggestions,proposedAdditions:additions,skippedFallback,truncation,
      needsReview:domain.needsReview || !!truncation.length ||
        !!skippedFallback.length || !!unknownExistingTechnologies.length ||
        (suggestions.length > 0 && approved.length === 0),
    });
    console.error(`${skill.id}: ${domain.domain}; ${map.technologies.length} technologies; ${requestCount} requests; +[${additions.join(', ') || 'none'}]`);
  }
  if (args.write && changed) {
    await writeFile(resolve(args.catalog),`${JSON.stringify(original,null,2)}\n`);
  }
  return {mode:'catalog',changedCatalog:args.write && changed,records};
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