# custom-skills

A standalone GitHub-hosted skills registry for the [`rigerc/autoskills`](https://github.com/rigerc/autoskills) fork. The registry follows [its version-1 catalog specification](https://github.com/rigerc/autoskills/blob/main/packages/autoskills/docs/catalog.md).

## Structure

```text
.
├── catalog.json
├── skills/
│   ├── gum-cli/
│   │   ├── SKILL.md
│   │   ├── README.md
│   │   └── references/gum-reference.md
│   ├── ink/
│   │   ├── SKILL.md
│   │   └── references/{components,hooks,patterns,render-api}.md
│   └── serena-usage/
│       ├── SKILL.md
│       ├── CHANGELOG.md
│       ├── LICENSE.txt
│       ├── examples/refactoring-workflow.md
│       ├── references/{memory-management,symbol-navigation}.md
│       └── scripts/serena-memory-backup.ps1
├── scripts/
│   ├── sync-catalog.mjs
│   └── validate-catalog.mjs
├── tests/sync-catalog.test.mjs
├── examples/autoskills.json
├── .github/workflows/
│   ├── sync-catalog.yml
│   └── validate.yml
└── package.json
```

## Publish and register

1. Create a GitHub repository (for example `rigerc/custom-skills`) and push these files to its default branch. Leave `catalog.json` in the repository root.
2. From the **consumer project's** root, register the GitHub source:

   ```bash
   npx autoskills registry add team rigerc/custom-skills
   npx autoskills registry list
   npx autoskills registry refresh team
   npx autoskills --dry-run
   npx autoskills -y
   ```

3. For an account-level registration (instead of per project), use `npx autoskills registry add team rigerc/custom-skills --global`. The consumer project's `autoskills.json` can also be configured as shown in [`examples/autoskills.json`](examples/autoskills.json).

**Important:** These commands require an AutoSkills build with custom-registry support (as implemented in `rigerc/autoskills`). Do not assume an older `npx autoskills` release includes them. Confirm with `npx autoskills registry --help`, or run the compatible fork's CLI. For a private repository, configure `GITHUB_TOKEN` or `GH_TOKEN` in the consumer environment.

## Recommendation behavior

| Skill | Catalog rule | Behavior |
| --- | --- | --- |
| `gum-cli` | `"technologies": ["bash"]` | Recommended when the project contains `.sh` or `.bash` files. |
| `ink` | `"technologies": ["ink"]` | Recommended when the project depends on `ink`, an `ink-*` package, or `@inkjs/*`. |
| `serena-usage` | No mapping | Available for explicit selection; not installed by `-y` unless otherwise recommended. |

Recommendation metadata lives only in `catalog.json` and is maintained by hand; it is never derived from `SKILL.md`. The sync action preserves `technologies` and `always` and only rewrites `description` and `path`.

Built-in AutoSkills recommendations remain enabled alongside this registry. The technology IDs must exist in the AutoSkills `SKILLS_MAP` used by the installed CLI. The `ink` and `bash` IDs used here are supported in the referenced fork. A catalog cannot define new detection rules, so a skill whose runtime has no matching ID (for example `serena-usage`, which drives the Serena MCP server) cannot be recommended by detection and stays manual-select.

## Automatic catalog updates (GitHub Actions)

The included [`sync-catalog.yml`](.github/workflows/sync-catalog.yml) runs on pushes that change `skills/**` or catalog synchronization files, **on the default branch only**. It also supports manual runs through **Actions → Sync AutoSkills catalog → Run workflow** (select the default branch).

The job:

1. Discovers immediate child skill directories at `skills/<id>/SKILL.md`.
2. Reads each skill's `name` and `description` from `SKILL.md` YAML frontmatter.
3. Reconciles `catalog.json`: adds new entries, updates descriptions, and removes entries for deleted managed skills. It retains `technologies` and `always` flags, external GitHub sources, and manually managed paths outside `skills/<id>`.
4. Runs `npm test` and, if the catalog changed, commits only `catalog.json` with a `github-actions[bot]` commit.

A newly discovered skill has no recommendation flags, so it is **manually selectable** by default. To recommend it automatically, edit its catalog entry to set `always: true` or the supported `technologies` array. Later synchronizations preserve these settings. Descriptions, however, are sourced from `SKILL.md` and will overwrite edits made only in the catalog.

The workflow requests `contents: write` and needs the repository's **Actions → General → Workflow permissions** to permit write access for the `GITHUB_TOKEN`. If default-branch protection or a ruleset blocks bot pushes, configure an approved bypass or adapt the workflow to create a pull request instead. This starter does not use a PAT or bypass branch protections.

The separate [`validate.yml`](.github/workflows/validate.yml) checks pushes and pull requests read-only. For PRs, it regenerates the catalog temporarily and validates that generated catalog; it does not commit to the contributor's branch. Once the PR is merged, the default-branch sync job updates the committed catalog. Generated `GITHUB_TOKEN` pushes ordinarily do not trigger an additional Actions run.

## Add or update a skill

1. Create `skills/<skill-id>/SKILL.md` with YAML frontmatter specifying `name` (equal to the folder name) and `description`.
2. Optionally add supporting files under that folder (`references/`, `scripts/`, etc.). The sync tool does not discover nested skills within another skill folder.
3. Run `npm run catalog:sync` to update the catalog locally, or push/merge your new skill and allow the default-branch GitHub Action to synchronize it.
4. Optionally add `technologies` or `always` to the generated catalog entry to enable recommendations. Omit both for manual-only skills.
5. Run `npm test` and `npm run catalog:check` to verify the output, then refresh the registry in consuming projects as needed.

Example `SKILL.md` metadata:

```yaml
---
name: my-skill
description: One-line summary of when an agent should load this skill.
---
```

The sync tool supports plain strings, JSON-compatible double-quoted strings, single-quoted strings, and indented YAML `>` or `|` description blocks. It does not implement a full YAML parser. If the frontmatter is more complex, simplify `name` and `description` or extend the parser before enabling automatic updates.

**Catalog constraints:** `version` must equal `1`. Root fields must be only `version` and `skills`. A skill entry may contain only `id`, `description`, `path`, `repository`, `directory`, `technologies`, and `always`. It must specify **either** a `path` relative to `catalog.json` **or** the pair `repository` + `directory` for an exact GitHub skill location—not both. IDs are restricted to lowercase letters, digits, `.`, `_` and `-`. Paths cannot be absolute or traverse `..`. The GitHub loader confirms the referenced directories contain `SKILL.md` at the resolved revision.

`path` entries allow this registry to work both as a GitHub catalog and as a local directory. Alternatively, cross-repo entries can use `"repository": "owner/repo", "directory": "skills/name"` (without `path`).

## Local development

```bash
npm run catalog:sync   # Generate/reconcile catalog.json
npm run catalog:check  # CI-friendly no-write drift check
npm test               # Run sync-script tests + catalog validation
# From a consumer project:
npx autoskills registry add personal /absolute/path/to/custom-skills
npx autoskills registry refresh personal
npx autoskills --dry-run
```

The included validator checks catalog shape, safe paths, unique IDs, and local skill files, without downloading dependencies. It **does not** reproduce AutoSkills' built-in technology ID table or remote resolution checks; `registry refresh` performs the latter with the compatible CLI. Symlinks inside in-repo skills are disallowed by the scaffold validator.

## Maintenance and trust

Review all changes to `SKILL.md`, scripts, and reference files before merging. Skills contain instructions for AI agents; treat contributions and external upstream sources as executable-influence supply-chain inputs. Keep third-party licenses and provenance with their files. `skills/serena-usage` is a third-party bundle (MIT, Copyright (c) 2026 Sithu Win San) and keeps its upstream `LICENSE.txt`, `CHANGELOG.md`, and `scripts/serena-memory-backup.ps1` unmodified. `skills/serena-usage/SKILL.md` links to sibling skills (for example `../development-workflow/SKILL.md`) that this registry does not ship; those links resolve only where the consumer has also installed them. The consumer's `skills-lock.json` records installed origins, so changing or removing a registry does not implicitly retarget updates for installed skills.

This starter intentionally does **not** use `skills-registry/index.json`: that file belongs to AutoSkills' former bundled review index, not its user-registry catalog format.

## Advisory Laya classification (GitHub Actions)

The [Classify skills with Laya](.github/workflows/classify-skills.yml) workflow uses
[the TypeScript Laya runtime](https://github.com/NandhaKishorM/laya/tree/main/laya-ts)
to produce **review-only** classification reports. It does not write to
`catalog.json`, commit changes, or create automatic recommendation mappings.

- **Pull requests** that touch classifier-related files run fast fixture tests without loading a model.
- **Pushes to `main`** touching skills, catalog, or the workflow run classification in `catalog` mode.
- **Actions → Classify skills with Laya → Run workflow** allows choosing
  `catalog` (suggest existing technology IDs) or `map` (group the built-in AutoSkills
  skills into domains), and selecting a limit and confidence threshold.
- Download `laya-catalog-classifications` or `laya-map-classifications` from
  the completed run's **Artifacts** section. `proposedAdditions` are
  suggestions for manual review, not automatically approved mappings.

The workflow pins the Laya source checkout to commit
`4ac226d5ee88ed6df8db288a05c766d7a34ee682`, builds `laya-ts`, and
exports the public `convaiinnovations/laya` checkpoint to split ONNX on the
first inference run (subsequent runs can restore the ONNX model from the Actions
cache). The model is large; initial exports may take substantial runner time,
disk space and network bandwidth. The GitHub-hosted runner performs real
inference only for trusted default-branch pushes or manual runs, never for
untrusted pull requests. The checkpoint download is not currently pinned to a
Hugging Face revision; for bit-for-bit reproducibility, pin the model snapshot
and update the cache key.

Run the classifier locally (requires the TypeScript parser, a built Laya runtime
and an exported ONNX model; see [Laya's export guide](https://github.com/NandhaKishorM/laya/blob/main/laya-ts/README.md)):

```bash
npm install --no-save typescript
node scripts/classify-skills.mjs --inspect-map
node scripts/classify-skills.mjs --mode catalog --model ./model \
  --laya ../laya/laya-ts/dist/index.js --output ./skill-classifications.json
node scripts/classify-skills.mjs --mode map --model ./model \
  --laya ../laya/laya-ts/dist/index.js --output ./autoskills-classified.json
node --test tests/classify-skills.test.mjs
```

The `--write` CLI flag can add only sufficiently high-confidence suggestions
while preserving existing technology IDs, but the GitHub Action deliberately
does **not** enable it. Review classifications against actual skill behavior;
Laya's output confidence is not independently calibrated on this registry.
