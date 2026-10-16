# Laya × AutoSkills classification

`classify-skills.mjs` provides two modes:

- **`--mode catalog` (default):** Suggests existing AutoSkills technology IDs for entries in `rigerc/custom-skills/catalog.json`. Uses Laya's yes/no (`noul`) decisions over short-listed candidate technologies, and also adds a broad domain classification. Defaults to a report only, without changing `catalog.json`.
- **`--mode map`:** Reads the fork's `SKILLS_MAP`, `COMBO_SKILLS_MAP`, and frontend bonus skills; retains the source technology IDs; uses Laya's `choice` classifier to assign each distinct built-in skill a broad domain (frontend, backend, etc.). Writes a report only.

The TypeScript map is parsed as data using the TypeScript AST, **not executed**. The default map is the **rigerc** fork (which includes `bash` and `ink`); override with `--map` to use a local checkout or another version. `catalog.json` is modified only with `--write`, which can **add** matched IDs but never delete an existing manual mapping. The catalog schema permits only the known AutoSkills technology IDs; domain classifications are stored in the **report**, not in `catalog.json`.

## Install

Node.js 22+ recommended. From a clone of `rigerc/custom-skills`:

```bash
npm install --no-save typescript@5.9.3
# If using a laya-ts package installed from npm, also install onnxruntime-node.
```

If `laya-ts` is not available on npm, build it from the source repository:

```bash
git clone https://github.com/NandhaKishorM/laya.git
cd laya/laya-ts
npm install
npm run build
cd ../..
```

The Laya TypeScript runtime requires **split ONNX weights**, not just a PyTorch checkpoint. Export them once (large checkpoint download; sufficient disk/RAM required):

```bash
python -m pip install laya transformers torch safetensors huggingface_hub onnx onnxruntime
python laya/laya-ts/scripts/export_onnx.py --repo convaiinnovations/laya --out-dir ./model
```

The `--model` directory must contain `encoder.onnx`, `head.onnx`, `tokenizer.json`, and `rl_agent_config.json` (plus any ONNX external-data sidecars). The script does not run the downloaded model automatically; export first. As an alternative, supply an equivalent trusted ONNX bundle compatible with upstream `laya-ts`.

## Usage

This repository includes `scripts/classify-skills.mjs`. If you build Laya from source, pass the path of its ESM output:

```bash
# Confirm the map can be parsed without loading a model:
node scripts/classify-skills.mjs --inspect-map

# Suggest tags for custom skills; write ONLY the report:
node scripts/classify-skills.mjs --mode catalog --catalog catalog.json \
  --model ./model --laya ./laya/laya-ts/dist/index.js \
  --output ./catalog-classifications.json

# After reviewing suggestions, add high-probability IDs to catalog:
node scripts/classify-skills.mjs --mode catalog --catalog catalog.json \
  --model ./model --laya ./laya/laya-ts/dist/index.js \
  --threshold 0.9 --write

# Classify the skills from AutoSkills' built-in map into semantic domains:
node scripts/classify-skills.mjs --mode map --model ./model \
  --laya ./laya/laya-ts/dist/index.js \
  --output ./autoskills-classified.json

# Quick sample before classifying hundreds of built-in skills:
node scripts/classify-skills.mjs --mode map --limit 10 --batch-size 2 \
  --model ./model --laya ./laya/laya-ts/dist/index.js
```

If you installed `laya-ts` as an npm package, omit `--laya`. If `laya` lives in a sibling repository, use `--laya ../laya/laya-ts/dist/index.js` instead.

## Review and limitations

- Laya's `noul` answer is P(yes); the default automatic suggestion threshold is **0.80**. This is not a calibrated probability that a technology tag is genuinely correct on AutoSkills data, and should be validated against hand-labeled examples before relying on `--write` in production.
- Candidate IDs are chosen with conservative literal matches against skill ID, description, technology ID/name, and selected detection hints; Laya can only evaluate shortlisted candidates. No lexical candidates means manual-only. For example, `serena-usage` may remain unmapped, consistent with its source registry.
- A built-in map may associate a skill with multiple technologies, which is preserved in `--mode map` output. Frontend bonus skills are reported with `frontendBonus: true` and do not invent an AutoSkills technology ID.
- Use a **pinned** git revision or a local `--map` for reproducibility. Download and review any dependencies/models before deploying in CI. All skill contents are potentially untrusted prompts; the script treats metadata as data, without executing skills.
- If you use `--write`, consider running `npm run catalog:check` and `npm test` from the custom registry afterward.
## GitHub Actions integration

The [Classify skills with Laya](../.github/workflows/classify-skills.yml) workflow
has two separate trust levels:

1. **PRs:** run the TypeScript-AST parser and mock-Laya regression tests only.
   There is no model download and no write token.
2. **Pushes to `main`, weekly schedules, or manual dispatch:** run real ONNX
   classification in read-only mode. A successful run uploads its JSON report
   as a 30-day artifact and writes a short summary with classification counts,
   technology suggestions, and manual-review flags.

A manual run selects `catalog` or `map` mode, a record limit, and a
probability threshold. Weekly runs default to catalog mode. Report confidence
is **not calibrated** for the custom skill registry, so all suggestions require
human review.

### Faster startup with a prepared model cache

The [Warm Laya model cache](../.github/workflows/warm-laya-cache.yml)
workflow runs on **Sunday and Thursday at 05:43 UTC**, or manually via
**Actions → Warm Laya model cache → Run workflow**. It prepares the English
split-ONNX checkpoint once and saves the model files into a shared GitHub
Actions cache. The Monday **06:19 UTC** report ordinarily restores that cache
instead of exporting a fresh model.

Both workflows call [the same composite model action](../.github/actions/laya-model/action.yml)
to restore, validate, export on a miss, and save the ONNX files. On a cache
miss it uses pinned **CPU-only PyTorch 2.9.0**, avoiding the download of
unused CUDA dependencies. Incomplete cached bundles cause an explicit
failure instead of a misleading inference error. To invalidate a corrupt or
obsolete cache, increment the version in the composite action's cache key.

The first cache miss still requires the large Hugging Face checkpoint and
ONNX export, which can be slow or exceed a hosted runner's available resources.
Cache availability, retention, and quotas depend on GitHub; warming is a
best-effort optimization, not a guarantee. The Laya source checkout is pinned
to `4ac226d5ee88ed6df8db288a05c766d7a34ee682`. The Hugging Face
checkpoint download is **not** pinned to a snapshot revision, so the cache
key is not a cryptographic model provenance guarantee. Model weights are not
committed to this repository.

### Optional reviewed catalog updates

A manual **catalog** run on the **default branch** can enable
`propose_updates`. The classifier may append valid `SKILLS_MAP` technology
IDs whose model score passes the chosen threshold; existing tags are retained.
It then publishes the proposed catalog as a short-lived artifact. A **separate
`propose` job** downloads this artifact, runs catalog synchronization checks
and the complete tests, and opens a review-only PR affecting `catalog.json`.

This separates permissions: the heavy classifier job has **contents: read**,
while only the explicitly requested proposal job receives
**contents: write** and **pull-requests: write**. Neither job merges proposals.
The repository must enable **Settings → Actions → General → Allow GitHub
Actions to create and approve pull requests** for proposal creation to work.

The [Sync AutoSkills catalog](../.github/workflows/sync-catalog.yml)
workflow remains separate and now installs the same pinned TypeScript parser
before its complete test suite. It continues to own catalog description/path
reconciliation, not Laya-generated technology tags.
