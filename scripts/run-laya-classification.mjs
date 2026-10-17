#!/usr/bin/env node
/** Run one reproducible, local Laya classification session from npm. */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

function usage() {
  console.log(`Usage: npm run laya:run -- [classifier options] [--write]

Refresh rigerc/autoskills' skills-map.ts, inspect it, start Dockerized
Laya, classify the catalog (or built-in map), validate, then stop Docker.
Without --write the catalog is never changed by this workflow.

  --write              Sync catalog entries and add high-scoring Laya tags
                       (implies --threshold 0.90 unless specified)
  --mode catalog|map   Classifier mode (default: catalog)
  --limit N            Classify a sample
  --threshold N        Minimum probability for a suggested tag
  --tech-batch-size N  Technologies per question group (default 8)
  --chunk-chars N      Characters per SKILL.md window (default 700)
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
  const valueOptions = new Set(['--mode', '--catalog', '--model', '--laya-url', '--output',
    '--threshold', '--min-domain', '--tech-batch-size', '--chunk-chars', '--batch-size', '--limit']);
  let mode = 'catalog', write = false, threshold = false, output = false;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--write') { write = true; continue; }
    if (!valueOptions.has(flag) || !argv[i + 1] || argv[i + 1].startsWith('--')) {
      throw new Error(`Unknown or missing classifier argument: ${flag}`);
    }
    if (flag === '--mode') mode = argv[i + 1];
    if (flag === '--threshold') threshold = true;
    if (flag === '--output') output = true;
    i++;
  }
  if (!['catalog', 'map'].includes(mode)) throw new Error('mode must be catalog or map');
  if (write && mode !== 'catalog') throw new Error('--write is only valid in catalog mode');
  return { mode, write, args: [
    ...argv,
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
    started = true; // also clean up a partially started service
    await run('docker', [...dockerArgs, 'up', '-d', '--build', '--wait']);
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
  console.log(`Laya classification complete (${cfg.mode}${cfg.write ? ', catalog updated' : ', report only'}).`);
}

main().catch(error => { console.error(`Error: ${error.message}`); process.exitCode = 1; });
