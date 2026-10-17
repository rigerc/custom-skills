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
`--mode map`, `--batch-size` can be at most 64 to satisfy the HTTP
API's batch limit. `--inspect-map` needs neither HTTP nor weights.

The reports retain per-skill domain confidence and proposed technology
additions. `--write` refuses to add suggestions when the model indicates
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
