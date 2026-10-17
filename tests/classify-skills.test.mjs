import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readSkillMarkdown, skillChunks } from '../scripts/skill-source.mjs';
import { buildSkillProfile, cachedSkillProfile, selectedEvidence, technologyQuestion } from '../scripts/skill-profile.mjs';

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
  for (const [name, markdown] of [
    ['ink-tui', '# Ink\nUse Ink for interactive React terminal UIs.\n' +
      'Ink rendering examples and troubleshooting. '.repeat(36) + '\nEND_OF_INK_SKILL'],
    ['shell-runner', '# Shell runner\nUse Bash for .sh scripts and shell automation.'],
    ['manual-utility', '# Generic skill\nManual utility operations without framework coupling.'],
  ]) {
    const skillDir = join(dir, 'skills', name);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), markdown);
  }
  return { dir, map, catalog, output };
}

async function mockServer(t) {
  const requests = [];
  const state = { truncated: false, uncertain: false, denyFallback: false, httpStatus: 200, strict: false };
  const server = createServer(async (request, response) => {
    try {
      if (!['/v1/systemone', '/v1/systemone/batch'].includes(request.url)) {
        response.writeHead(404).end('Not found');
        return;
      }
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      requests.push({ path: request.url, body, authorization: request.headers.authorization });
      if (state.httpStatus !== 200) {
        response.writeHead(state.httpStatus).end('Request rejected');
        return;
      }
      const predict = (text) => {
        const answers = {};
        for (const key of Object.keys(body.questions)) {
          answers[key] = key === 'domain'
            ? (state.strict ? { type: 'choice', choice: 'tooling_cli', probabilities: {tooling_cli:0.94}, confidence:0.94 } : { type: 'choice', choice: 'tooling_cli', answer_confidence: 0.94 })
            : { type: 'noul', noul:
              (text.includes('Agent skill: ink-tui') && body.questions[key].instructions.includes('(ink)')) ||
              (text.includes('Agent skill: shell-runner') && body.questions[key].instructions.includes('(bash)'))
                ? (state.uncertain ? (text.includes('Section:') ?
                    (state.denyFallback ? 0.10 : 0.97) : 0.88) : 0.96) : 0.02 };
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
  return runEnv({}, ...args);
}

async function runEnv(env, ...args) {
  const child = spawn(process.execPath, [script, ...args], {
    env: {...process.env, ...env},
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
  assert.equal(server.requests[0].path, '/v1/systemone/batch');
  assert.equal(await readFile(f.catalog, 'utf8'), before);
  const report = JSON.parse(await readFile(f.output, 'utf8'));
  assert.equal(report.mode, 'catalog');
  assert.equal(report.changedCatalog, false);
  const ink = report.records.find(x => x.id === 'ink-tui');
  assert.deepEqual(ink.proposedAdditions, ['ink']);
  assert.equal(ink.technologyCount, 2);
  assert.deepEqual(ink.suggestions.map(x => x.id).sort(), ['bash', 'ink']);
  assert.ok(ink.profileChars <= 850);
  assert.ok(ink.requests <= 2);
  assert.ok(server.requests.every(r => r.body.states?.every(s => !s.includes('END_OF_INK_SKILL'))));
  assert.ok(server.requests.every(r => r.body.states?.length === 1));
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

test('chunk windows cover every character of the entire SKILL.md', () => {
  const markdown = 'ABCDEFGHIJ'.repeat(300);
  const chunks = skillChunks(markdown, 230);
  assert.ok(chunks.length > 10);
  assert.equal(chunks[0].start, 0);
  assert.equal(chunks.at(-1).end, markdown.length);
  for (const c of chunks) {
    assert.equal(c.text, markdown.slice(c.start, c.end));
  }
  for (let i = 1; i < chunks.length; i++) {
    assert.ok(chunks[i].start <= chunks[i - 1].end);
  }
});

test('GitHub-backed SKILL.md is read in full from the contents API', async () => {
  const content = '# Remote skill\n'.repeat(180);
  let requestedUrl;
  const fakeFetch = async (url, options) => {
    requestedUrl = url;
    assert.match(options.headers.accept, /github/);
    return { ok: true, json: async () => ({
      type: 'file', encoding: 'base64', content: Buffer.from(content).toString('base64'),
    }) };
  };
  const found = await readSkillMarkdown({
    id: 'remote', repository: 'example/skills', directory: 'dev/sample',
  }, '/tmp/catalog.json', fakeFetch);
  assert.equal(found.content, content);
  assert.equal(found.source, 'example/skills/dev/sample/SKILL.md');
  assert.equal(requestedUrl,
    'https://api.github.com/repos/example/skills/contents/dev/sample/SKILL.md');
  await assert.rejects(() => readSkillMarkdown({
    id: 'invalid', repository: 'example/skills', directory: '../secret',
  }, '/tmp/catalog.json', fakeFetch), /Invalid skill directory/);
});

test('missing SKILL.md aborts without writing any catalog changes', async t => {
  const f = await fixture(t);
  const { rm } = await import('node:fs/promises');
  await rm(join(f.dir, 'skills', 'shell-runner', 'SKILL.md'));
  const server = await mockServer(t);
  const initial = await readFile(f.catalog, 'utf8');
  const child = spawn(process.execPath, [script, '--map', f.map, '--catalog', f.catalog,
    '--laya-url', server.url, '--output', f.output, '--write'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const code = await new Promise(resolve => child.on('close', resolve));
  assert.notEqual(code, 0);
  assert.match(errors, /ENOENT|SKILL.md/);
  assert.equal(await readFile(f.catalog, 'utf8'), initial);
});

test('catalog technology scores cover every map entry regardless of lexical matches', async t => {
  const f = await fixture(t);
  const server = await mockServer(t);
  await run('--map', f.map, '--catalog', f.catalog, '--laya-url', server.url,
    '--output', f.output, '--tech-batch-size', '1', '--batch-size', '2');
  const report = JSON.parse(await readFile(f.output, 'utf8'));
  for (const record of report.records) {
    assert.deepEqual(record.suggestions.map(x => x.id).sort(), ['bash', 'ink']);
    assert.equal(record.technologyCount, 2);
    assert.ok(record.suggestions.every(x => Number.isFinite(x.profileProbability)));
  }
  assert.ok(server.requests.some(r => Object.keys(r.body.questions).length === 1));
});

test('profile extraction is deterministic, compact and cached by source digest', async t => {
  const f = await fixture(t);
  const skill = JSON.parse(await readFile(f.catalog, 'utf8')).skills[0];
  const md = await readFile(join(f.dir, 'skills', 'ink-tui', 'SKILL.md'), 'utf8');
  const profile = buildSkillProfile(skill, md);
  assert.ok(profile.profileChars <= 850);
  assert.match(profile.text, /Purpose:/);
  assert.doesNotMatch(profile.text, /END_OF_INK_SKILL/);
  const first = await cachedSkillProfile(skill, md, f.catalog);
  const second = await cachedSkillProfile(skill, md, f.catalog);
  assert.equal(first.cacheHit, false);
  assert.equal(second.cacheHit, true);
  assert.equal(first.text, second.text);
  const third = await cachedSkillProfile(skill, md + '\nChanged', f.catalog);
  assert.equal(third.cacheHit, false);
});

test('structured questions include AutoSkills detection signals', () => {
  const q = technologyQuestion({
    id:'mcp-sdk', name:'Model Context Protocol SDK',
    detect:{packages:['@modelcontextprotocol/sdk'], pythonPackages:['mcp']},
  });
  assert.match(q.instructions,/Model Context Protocol SDK/);
  assert.match(q.instructions,/@modelcontextprotocol\/sdk/);
  assert.match(q.instructions,/mcp/);
});

test('targeted evidence chooses relevant sections, not whole Markdown', () => {
  const md = '# Skill\n## Overview\nIntro content unrelated.\n' +
    '## Tool configuration\nUses Ink to render a TUI.\n' +
    '## References\n' + 'large unrelated paragraph '.repeat(300);
  const excerpt = selectedEvidence(md, {id:'ink',name:'Ink',detect:{packages:['ink']}}, 260);
  assert.match(excerpt,/Ink to render a TUI/);
  assert.doesNotMatch(excerpt,/large unrelated paragraph/);
  assert.ok(excerpt.length < 340);
});

test('uncertain profile decisions use targeted fallback before write', async t => {
  const f = await fixture(t), server = await mockServer(t);
  server.state.uncertain = true;
  await run('--map',f.map,'--catalog',f.catalog,'--laya-url',server.url,
    '--output',f.output,'--write','--threshold','0.90');
  const report=JSON.parse(await readFile(f.output,'utf8'));
  const ink=report.records.find(r=>r.id==='ink-tui');
  const guess=ink.suggestions.find(s=>s.id==='ink');
  assert.equal(guess.profileProbability,0.88);
  assert.equal(guess.probability,0.97);
  assert.equal(guess.evidenceUsed,true);
  assert.deepEqual(ink.proposedAdditions,['ink']);
  assert.ok(server.requests.some(r=>r.body.states?.some(s=>s.includes('Section:'))));
  assert.ok(server.requests.every(r=>r.body.states?.every(s=>!s.includes('END_OF_INK_SKILL'))));
});

test('targeted fallback can reject an ambiguous high score', async t => {
  const f=await fixture(t),server=await mockServer(t);
  server.state.uncertain=true;
  server.state.denyFallback=true;
  await run('--map',f.map,'--catalog',f.catalog,'--laya-url',server.url,
    '--output',f.output,'--write','--threshold','0.85');
  const report=JSON.parse(await readFile(f.output,'utf8'));
  const ink=report.records.find(r=>r.id==='ink-tui');
  assert.equal(ink.suggestions.find(x=>x.id==='ink').probability,0.10);
  assert.deepEqual(ink.proposedAdditions,[]);
});

test('unmapped existing tags are reported explicitly', async t => {
  const f=await fixture(t),server=await mockServer(t);
  const catalog=JSON.parse(await readFile(f.catalog,'utf8'));
  catalog.skills[2].technologies=['nonexistent-tech'];
  await writeFile(f.catalog,JSON.stringify(catalog));
  await run('--map',f.map,'--catalog',f.catalog,'--laya-url',server.url,'--output',f.output);
  const report=JSON.parse(await readFile(f.output,'utf8'));
  const record=report.records.find(x=>x.id==='manual-utility');
  assert.deepEqual(record.unknownExistingTechnologies,['nonexistent-tech']);
  assert.equal(record.needsReview,true);
});

test('OpenCode Zen Jev authenticates and sends unbatched System One payloads', async t => {
  const f=await fixture(t), server=await mockServer(t);
  server.state.strict=true;
  await runEnv({OPENCODE_API_KEY:'test-secret'},
    '--provider','opencode-zen','--opencode-url',server.url+'/v1/systemone',
    '--map',f.map,'--catalog',f.catalog,'--output',f.output,
    '--no-fallback');
  assert.ok(server.requests.length >= 3);
  assert.ok(server.requests.every(r=>r.path==='/v1/systemone'));
  assert.ok(server.requests.every(r=>r.authorization==='Bearer test-secret'));
  assert.ok(server.requests.every(r=>r.body.model==='jev-1.13-free'));
  assert.ok(server.requests.every(r=>typeof r.body.state==='string' && !r.body.states));
  const report=JSON.parse(await readFile(f.output,'utf8'));
  assert.equal(report.provider,'opencode-zen');
  assert.equal(report.model,'jev-1.13-free');
  assert.equal(report.records[0].domain,'tooling_cli');
  assert.deepEqual(report.records[0].proposedAdditions,['ink']);
});

test('OpenCode Zen Jev writes approved tags without Docker', async t => {
  const f=await fixture(t), server=await mockServer(t);
  await runEnv({OPENCODE_ZEN_API_KEY:'test-zen-secret',OPENCODE_API_KEY:''},
    '--provider','opencode-zen','--opencode-url',server.url+'/v1/systemone',
    '--map',f.map,'--catalog',f.catalog,'--output',f.output,
    '--write','--threshold','0.95');
  assert.ok(server.requests.every(r=>r.authorization==='Bearer test-zen-secret'));
  const catalog=JSON.parse(await readFile(f.catalog,'utf8'));
  assert.deepEqual(catalog.skills[0].technologies,['ink']);
  assert.deepEqual(catalog.skills[1].technologies,['bash']);
  const report=JSON.parse(await readFile(f.output,'utf8'));
  assert.equal(report.changedCatalog,true);
});

test('OpenCode Jev refuses missing key before sending requests', async t => {
  const f=await fixture(t), server=await mockServer(t);
  const child=spawn(process.execPath,[script,'--provider','opencode-zen',
    '--opencode-url',server.url+'/v1/systemone','--map',f.map,
    '--catalog',f.catalog,'--output',f.output],{
      env:{...process.env,OPENCODE_API_KEY:'',OPENCODE_ZEN_API_KEY:''},
      stdio:['ignore','pipe','pipe'],
    });
  let err='';child.stderr.on('data',c=>{err+=c;});
  const status=await new Promise(done=>child.once('close',done));
  assert.notEqual(status,0);
  assert.match(err,/OPENCODE_API_KEY/);
  assert.equal(server.requests.length,0);
});

test('OpenCode Jev surfaces HTTP authorization failures without leaking secrets', async t => {
  const f=await fixture(t), server=await mockServer(t);
  server.state.httpStatus=401;
  const child=spawn(process.execPath,[script,'--provider','opencode-zen',
    '--opencode-url',server.url+'/v1/systemone','--map',f.map,
    '--catalog',f.catalog,'--output',f.output],{
      env:{...process.env,OPENCODE_API_KEY:'do-not-log'},
      stdio:['ignore','pipe','pipe'],
    });
  let err='';child.stderr.on('data',c=>{err+=c;});
  const status=await new Promise(done=>child.once('close',done));
  assert.notEqual(status,0);
  assert.match(err,/HTTP 401/);
  assert.doesNotMatch(err,/do-not-log/);
});

test('rejects non-OpenCode credential endpoints and conflicting options', async t => {
  const f=await fixture(t), server=await mockServer(t);
  const invalid=[
    ['--provider','opencode-zen','--opencode-url','https://malicious.example/v1/systemone'],
    ['--provider','laya','--opencode-url',server.url+'/v1/systemone'],
    ['--provider','opencode-zen','--laya-url',server.url],
  ];
  for (const extra of invalid) {
    const child=spawn(process.execPath,[script,'--map',f.map,'--catalog',f.catalog,...extra],{
      env:{...process.env,OPENCODE_API_KEY:'test'},
      stdio:['ignore','pipe','pipe'],
    });
    let err='';child.stderr.on('data',c=>{err+=c;});
    const status=await new Promise(done=>child.once('close',done));
    assert.notEqual(status,0);
    assert.match(err,/requires|official OpenCode/);
  }
  assert.equal(server.requests.length,0);
});

test('OpenCode Jev map mode emulates batches using individual System One calls', async t => {
  const f=await fixture(t), server=await mockServer(t);
  await runEnv({OPENCODE_API_KEY:'test'},
    '--provider','opencode-zen','--opencode-url',server.url+'/v1/systemone',
    '--mode','map','--map',f.map,'--output',f.output,'--batch-size','3');
  const report=JSON.parse(await readFile(f.output,'utf8'));
  assert.equal(report.records.length,4);
  assert.equal(server.requests.length,4);
  assert.ok(server.requests.every(r=>r.path==='/v1/systemone'));
});
