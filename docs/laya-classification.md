# Laya × AutoSkills classification (Docker)

The classifier in `scripts/classify-skills.mjs` uses the upstream
[Laya](https://github.com/NandhaKishorM/laya) HTTP inference API in Docker.
No Python, PyTorch, `laya-ts`, ONNX export, or model files are required on
the host. The host needs **Docker Engine / Docker Desktop with Compose v2**,
**Node.js 22+**, and enough memory and storage (upstream recommends at least
8 GB RAM and 10 GB free disk for the CPU image).

The pinned upstream Docker build is configured in
[`compose.laya.yml`](../compose.laya.yml). It serves `/v1/systemone`
and `/v1/systemone/batch` on loopback port 8000 by default. It keeps
Hugging Face checkpoint downloads in a persistent Docker named volume.
The first prediction downloads the English checkpoint and may take time.
The health check only verifies the server is reachable, not that the
checkpoint has been downloaded.

## One-command workflow

From this repository's root, after `npm install`:

```bash
npm run laya:run                          # Fresh map + report, no catalog writes
npm run laya:run -- --write              # Sync catalog + add high-confidence tags
npm run laya:run -- --limit 5            # Sample, still read-only
npm run laya:run -- --mode map --limit 10 # Classify built-in AutoSkills skills
```

The command performs the complete workflow in this order:

1. Fetch the latest `skills-map.ts` from **`rigerc/autoskills/main`** and validate
   its TypeScript structure. Cache this snapshot in
   `.cache/autoskills/skills-map.ts` (gitignored), printing its SHA-256.
   It **fails closed** if downloading or parsing fails; it never silently
   uses a stale cached map.
2. Parse the **exact saved snapshot** using the existing classifier's AST
   inspection. No Laya server is needed for this step.
3. For read-only runs, check for existing catalog drift without modifying
   `catalog.json`. With `--write`, first run `catalog:sync` to discover
   or reconcile catalog entries before classification.
4. Build/start the pinned Laya service with Docker Compose and wait for
   its HTTP health check; classify with the saved map.
5. Run `catalog:check` and `npm test`, then stop the Compose service
   **even if classification or validation fails**. The checkpoint volume
   is retained for reuse.

The default report is `skill-classifications.json` (or
`autoskills-classified.json` for `--mode map`). Pass `--output`,
`--limit`, `--threshold`, `--model` and other classifier options after
`--` as needed. `--write` works only in catalog mode, uses
`--threshold 0.90` by default unless overridden, and adds only accepted
technology IDs; it never removes existing mappings. Review the diff before
committing catalog updates.

The full command always refreshes the upstream map. For a custom or pinned
`--map` source, use `scripts/classify-skills.mjs` directly instead.
You can also run just `npm run laya:refresh-map`; a direct
`npm run laya:classify` still downloads the live default source rather
than reading the workflow's saved snapshot.

**Scope:** This refresh updates only the *classifier's input snapshot* of
AutoSkills' technology map. It does **not** write to the
`rigerc/autoskills` repository or change the AutoSkills CLI installation.

## Start and stop Laya

From the root of this repository:

```bash
npm install
npm run laya:up          # build upstream image, start server, wait for /health
npm run laya:classify -- --limit 5
npm run laya:down        # stop server; checkpoint volume is kept
```

Check `http://127.0.0.1:8000/health` to inspect liveness. `laya:up`
builds from upstream commit `4ac226d5ee88ed6df8db288a05c766d7a34ee682`
and the image uses the CPU backend. Docker caches the built image and
checkpoint volume for subsequent runs. Changing the upstream revision
requires editing the pinned Compose build context and image tag.

To use another host port, set `LAYA_PORT` for Docker and
`LAYA_URL=http://127.0.0.1:<port>` for the Node classifier. You can
also pass `--laya-url https://your-server.example` to use an existing
Laya server, with optional `LAYA_API_KEY` for bearer authorization.
Do not expose an unauthenticated inference service publicly.

## Complete SKILL.md and all-technology evaluation

Catalog mode now reads the **complete `SKILL.md`** rather than just the
catalog ID and description. Local `path` entries are read from
`path/SKILL.md`, relative to the catalog; `repository` +
`directory` entries are downloaded from the GitHub Contents API's default
branch (set `GITHUB_TOKEN` when authentication is needed). If a source is
missing, malformed, outside the catalog root, or oversized (over 1 MiB),
classification **fails rather than falling back** to the short description.

The classifier divides the whole Markdown document into overlapping,
**700-character windows** by default. Every source character is evaluated;
it does not silently truncate the file in JavaScript. It asks Laya about
**every technology ID** in the refreshed `SKILLS_MAP`, including
technologies not mentioned by name or keywords in the skill metadata.
It uses `/v1/systemone/batch` with bounded groups of eight technology
questions and four document windows per HTTP call by default. Both
sizes are configurable:

```bash
npm run laya:run -- --chunk-chars 600 --tech-batch-size 6 --batch-size 2
npm run laya:run -- --write --threshold 0.95
```

For each technology, the report stores the **maximum model YES probability
across all windows** and the index of the strongest window.
This aggregates relevant evidence from anywhere in `SKILL.md`, but
maximum-over-windows scores can overstate relevance for long skills or
incidental mentions. It is **not a calibrated document-level probability**.
The domain is selected by summed per-window domain confidence.
The report includes source path, window count, evaluated technology count
and the indices of any model-truncated windows.

**Write safety:** If Laya reports any truncated request for a skill,
the script will not add *any* tags for that skill. Unreadable files or
invalid/incomplete prediction responses abort classification; the catalog
is written only after every selected skill is processed successfully.
`--write` remains opt-in and additive-only.

Evaluating every technology against every source window increases inference
time substantially, especially for long Markdown documents on the CPU
checkpoint. For a small trial use `--limit 1` before running the full
catalog. Content is chunked because the default Laya English model's
context window is short; model-side truncation is detected but may require
reducing `--chunk-chars`.

## Modes and commands

- **Catalog** (default): for each custom catalog entry, suggest technology IDs
  that already exist in AutoSkills' `SKILLS_MAP` and assign a broad domain.
  Report-only by default; `--write` can **add** tags but never delete
  existing tags.
- **Map**: classify the distinct built-in AutoSkills skill slugs into
  domains while retaining each slug's original technology and combo IDs.

The default TypeScript map is from
[`rigerc/autoskills`](https://github.com/rigerc/autoskills). Its source
is parsed as data via the TypeScript AST, **never executed**. For
reproducibility, use `--map` with a local pinned `skills-map.ts`.

```bash
npm run laya:inspect-map   # AST parse only, no running Docker server needed
npm run laya:classify      # report: skill-classifications.json
npm run laya:classify:map -- --limit 10 --batch-size 2
npm run laya:classify:write -- --limit 5 # opt-in catalog.json update
npm run catalog:check
npm test
```

All scripts use the same `--laya-url` option (default
`http://127.0.0.1:8000`, or `LAYA_URL`), and `--model` selects a Laya
**server checkpoint name**, default `english`. It is not an ONNX model
directory. `--output PATH` chooses the JSON report. The `--threshold`
default is 0.80; the write convenience command sets it to 0.90. For
`--mode map`, `--batch-size` can be at most 64. In catalog mode,
`--tech-batch-size` is at most 63, leaving one slot for the domain
question in Laya's 64-question limit. `--inspect-map` needs neither HTTP nor weights.

The reports retain per-skill domain confidence, all evaluated technology
probabilities and proposed technology additions. `--write` refuses to add suggestions when the model indicates
truncation (including `usage.truncated_questions`) and never overwrites
existing IDs. **Laya confidence is not calibrated against this catalog**;
review every proposed mapping against real skills before committing. A
high score does not mean the ID is correct.

## Tests, trust, and resource usage

`npm test` exercises the classifier against a local HTTP fixture without
building Docker or downloading checkpoints. The upstream image performs real
inference; its first use requires internet access to fetch public weights.
The image is based on upstream Laya at a pinned commit, but the downloaded
Hugging Face weights are not SHA-pinned by this repository. Review their
provenance before depending on them in a sensitive workflow.

Only the classifier's report and optional local catalog write remain.
The prior Laya-specific GitHub Actions workflows, composite cache action,
and split-ONNX patch have been removed. Unrelated catalog synchronization
and validation workflows are unchanged. There are **no scheduled
classification runs or automatically generated classification PRs**.

Run `npm run laya:down` when finished. The named model cache persists;
remove it manually only when you deliberately want to reclaim disk space.
