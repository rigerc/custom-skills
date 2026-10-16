# Laya × AutoSkills classification

`classify-skills.mjs` provides two modes:

- **`--mode catalog` (default):** Suggests existing AutoSkills technology IDs for entries in `rigerc/custom-skills/catalog.json`. Uses Laya's yes/no (`noul`) decisions over short-listed candidate technologies, and also adds a broad domain classification. Defaults to a report only, without changing `catalog.json`.
- **`--mode map`:** Reads the fork's `SKILLS_MAP`, `COMBO_SKILLS_MAP`, and frontend bonus skills; retains the source technology IDs; uses Laya's `choice` classifier to assign each distinct built-in skill a broad domain (frontend, backend, etc.). Writes a report only.

The TypeScript map is parsed as data using the TypeScript AST, **not executed**. The default map is the **rigerc** fork (which includes `bash` and `ink`); override with `--map` to use a local checkout or another version. `catalog.json` is modified only with `--write`, which can **add** matched IDs but never delete an existing manual mapping. The catalog schema permits only the known AutoSkills technology IDs; domain classifications are stored in the **report**, not in `catalog.json`.

## Install

Node.js 22+ recommended. From a clone of `rigerc/custom-skills`:

```bash
npm install --no-save typescript
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

[Classify AutoSkills skills with Laya](../.github/workflows/classify-skills.yml) runs after relevant pushes, produces an advisory report each Monday at 06:19 UTC, and supports manual runs through **Actions → Classify AutoSkills skills with Laya → Run workflow** after this workflow has merged into the default branch.

- Scheduled runs use **catalog** mode (up to 100 records by default), write **only** a downloadable 30-day JSON report, and do not modify `catalog.json`.
- Manual runs can select **catalog** or **map** mode, and adjust the record limit (100 by default). By default they also generate only a report.
- For a manual **catalog** run on the **default branch**, enable **propose_updates** to append IDs with P(yes) ≥ 0.90, validate the catalog, and create a separate **review PR** with only `catalog.json`. The update is never merged automatically.
- The workflow pins the Laya source revision, builds `laya-ts`, and exports the English checkpoint to split ONNX if not already cached. This requires downloading a large (~843 MB) Hugging Face checkpoint and exporting large ONNX graphs; cache misses can take substantial runner time, disk, and memory. The ONNX model is **not checked into git**.
- Repository settings must allow GitHub Actions to create pull requests for the optional **propose_updates** mode to succeed; the workflow uses `contents:write` and `pull-requests:write` only in its job.
- The TypeScript parser and mocked Laya tests run in ordinary PR validation without downloading model weights. Actual Laya inference is run only by the classification workflow.

After a PR changes skills, the catalog sync action may update descriptions independently; review the generated Laya tags before merging any machine-created PR.
