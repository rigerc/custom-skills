#!/usr/bin/env node
/** Run one reproducible, local Laya classification session from npm. */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

function usage() {
  console.log(`Usage: npm run laya:run -- [classifier options] [--write]

Refresh rigerc/autoskills' skills-map.ts, inspect it, classify using Dockerized
Laya (default) or OpenCode Zen's Jev API (no Docker), then validate.
Without --write the catalog is never changed by this workflow.

  --write              Sync catalog entries and add high-scoring Laya tags
                       (implies --threshold 0.90 unless specified)
  --mode catalog|map   Classifier mode (default: catalog)
  --provider NAME      laya (default) or opencode-zen
  --model NAME         english for Laya, jev-1.13-free for OpenCode
  --opencode-url URL   Jev endpoint (official OpenCode or localhost test)
  --limit N            Classify a sample
  --threshold N        Minimum probability for a suggested tag
  --tech-batch-size N  Technologies per question group (default 8)
  --chunk-chars N      Maximum selected evidence excerpt (default 600)
  --fallback-limit N   Borderline technology rechecks per skill (default 12)
  --no-fallback        Diagnose the compact profile alone
  --output PATH        Report destination
  --help               Print this help

Other classifier options except --map and --inspect-map are forwarded.
The map is always freshly downloaded before a run; use the standalone
classifier for a custom/pinned map. Docker is stopped even on failure.`);
}

function argumentsForClassifier(argv) {
  if (argv.includes('--help') || argv.includes('-h')) { usage(); return null; }
  if (argv.includes('--map') || argv.includes('--inspect-map')) {
    throw new Error('laya:run always downloads the upstream map; use the standalone classifier for --map/--inspect-map');
  }
  const noFallback = argv.includes('--no-fallback');
  const forwarded = argv.filter(flag => flag !== '--no-fallback');
  const valueOptions = new Set(['--mode', '--catalog', '--provider', '--model', '--laya-url', '--opencode-url', '--output',
    '--threshold', '--min-domain', '--tech-batch-size', '--chunk-chars', '--fallback-limit', '--batch-size', '--limit']);
  let mode = 'catalog', provider = 'laya', write = false, threshold = false, output = false;
  for (let i = 0; i < forwarded.length; i++) {
    const flag = forwarded[i];
    if (flag === '--write') { write = true; continue; }
    if (!valueOptions.has(flag) || !forwarded[i + 1] || forwarded[i + 1].startsWith('--')) {
      throw new Error(`Unknown or missing classifier argument: ${flag}`);
    }
    if (flag === '--mode') mode = forwarded[i + 1];
    if (flag === '--provider') provider = forwarded[i + 1];
    if (flag === '--threshold') threshold = true;
    if (flag === '--output') output = true;
    i++;
  }
  if (!['catalog', 'map'].includes(mode)) throw new Error('mode must be catalog or map');
  if (!['laya', 'opencode-zen'].includes(provider)) throw new Error('provider must be laya or opencode-zen');
  if (provider === 'laya' && forwarded.includes('--opencode-url')) {
    throw new Error('--opencode-url requires --provider opencode-zen');
  }
  if (provider === 'opencode-zen' && forwarded.includes('--laya-url')) {
    throw new Error('--laya-url requires --provider laya');
  }
  if (write && mode !== 'catalog') throw new Error('--write is only valid in catalog mode');
  return { mode, provider, write, args: [
    ...forwarded,
    ...(noFallback ? ['--no-fallback'] : []),
    ...(write && !threshold ? ['--threshold', '0.90'] : []),
    ...(!output ? ['--output', mode === 'map' ? 'autoskills-classified.json' : 'skill-classifications.json'] : []),
    '--map', resolve(process.env.AUTOSKILLS_MAP_CACHE || '.cache/autoskills/skills-map.ts'),
  ] };
}

async function run(executable, args) {
  const status = await new Promise((done, fail) => {
    const child = spawn(executable, args, { stdio: 'inherit' });
    child.once('error', fail);
    child.once('close', code => done(code));
  });
  if (status !== 0) throw new Error(`${executable} ${args.join(' ')} exited with status ${status}`);
}

async function main() {
  const cfg = argumentsForClassifier(process.argv.slice(2));
  if (!cfg) return;
  if (cfg.provider === 'opencode-zen' &&
      !(process.env.OPENCODE_API_KEY || process.env.OPENCODE_ZEN_API_KEY)) {
    throw new Error('Set OPENCODE_API_KEY or OPENCODE_ZEN_API_KEY for OpenCode Zen Jev');
  }
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const dockerArgs = ['compose', '-f', 'compose.laya.yml'];
  // Refresh and inspect the map before any catalog edits or Docker work.
  await run(process.execPath, ['scripts/refresh-autoskills-map.mjs']);
  await run(process.execPath, ['scripts/classify-skills.mjs', '--inspect-map', '--map',
    resolve(process.env.AUTOSKILLS_MAP_CACHE || '.cache/autoskills/skills-map.ts')]);
  // Fail on drift without --write; only --write may alter catalog.json.
  if (cfg.write) await run(npm, ['run', 'catalog:sync']);
  else await run(npm, ['run', 'catalog:check']);

  let started = false;
  let failed = null;
  try {
    if (cfg.provider === 'laya') {
      started = true; // also clean up a partially started service
      await run('docker', [...dockerArgs, 'up', '-d', '--build', '--wait']);
    }
    await run(process.execPath, ['scripts/classify-skills.mjs', ...cfg.args]);
    await run(npm, ['run', 'catalog:check']);
    await run(npm, ['test']);
  } catch (error) {
    failed = error;
  } finally {
    if (started) {
      try { await run('docker', [...dockerArgs, 'down']); }
      catch (error) { if (!failed) failed = error; else console.error(`Cleanup failed: ${error.message}`); }
    }
  }
  if (failed) throw failed;
  console.log(`Classification complete (${cfg.provider}, ${cfg.mode}${cfg.write ? ', catalog updated' : ', report only'}).`);
}

main().catch(error => { console.error(`Error: ${error.message}`); process.exitCode = 1; });
