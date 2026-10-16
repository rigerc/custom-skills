# custom-skills

A standalone GitHub-hosted skills registry for the [`rigerc/autoskills`](https://github.com/rigerc/autoskills) fork. The registry follows [its version-1 catalog specification](https://github.com/rigerc/autoskills/blob/main/packages/autoskills/docs/catalog.md).

## Structure

```text
.
├── catalog.json
├── skills/
│   ├── react-code-review/SKILL.md
│   ├── release-checklist/
│   │   ├── SKILL.md
│   │   └── references/checklist.md
│   └── incident-runbook/SKILL.md
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
| `react-code-review` | `"technologies": ["react", "nextjs"]` | Recommended when React **or** Next.js is detected. |
| `release-checklist` | `"always": true` | Recommended on every project. |
| `incident-runbook` | No mapping | Available for explicit selection; not installed by `-y` unless otherwise recommended. |

Built-in AutoSkills recommendations remain enabled alongside this registry. The technology IDs must exist in the AutoSkills `SKILLS_MAP` used by the installed CLI. The example IDs `react` and `nextjs` are supported in the referenced fork. A catalog cannot define new detection rules.

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
name: release-checklist
description: Build a risk-aware release checklist.
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

Review all changes to `SKILL.md`, scripts, and reference files before merging. Skills contain instructions for AI agents; treat contributions and external upstream sources as executable-influence supply-chain inputs. Keep third-party licenses and provenance with their files. The consumer's `skills-lock.json` records installed origins, so changing or removing a registry does not implicitly retarget updates for installed skills.

This starter intentionally does **not** use `skills-registry/index.json`: that file belongs to AutoSkills' former bundled review index, not its user-registry catalog format.
