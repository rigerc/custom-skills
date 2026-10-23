# Nosey registry template

Create shareable AI agent skill registries for [Nosey](https://github.com/rigerc/nosey). This template includes generators, technology mappings, and validation workflows.

<!-- BEGIN GENERATED SKILL CATALOG -->

## Skill catalog

Registry: rigerc/custom-skills · 12 skills.

Generated from [skills-manifest.json](skills-manifest.json) and [skills-map.json](skills-map.json). Edit those sources or skill frontmatter, then regenerate this section.

Recommendation conditions below are alternatives; matching any condition can recommend a skill. Technology detection is handled by Nosey.

### [agnix](skills/agnix/SKILL.md)

Use when asked to lint, validate, troubleshoot, or improve AI coding-agent configuration files \(SKILL.md, AGENTS.md, CLAUDE.md, hooks, MCP, or IDE agent rules\), or to set up agnix checks in CI. Run the agnix CLI, explain its diagnostics, and apply explicitly requested safe fixes across Claude Code, Codex, Cursor, Copilot, Kiro, OpenCode, and related tools.

Available; no automatic recommendation.

### [github-project-delegation](skills/github-project-delegation/SKILL.md)

Plan and coordinate software projects in GitHub Projects v2 using the mcp-github-project-manager MCP server. Use for backlog triage, PRD-to-issue breakdown, sprint planning, human or AI-agent delegation, cross-agent handoffs, progress/risk reporting, review gates, and blocked or stale task recovery.

Available; no automatic recommendation.

### [gum-cli](skills/gum-cli/SKILL.md)

Use Charmbracelet Gum to build polished interactive shell scripts with prompts, selectors, filters, spinners, formatting, tables, pagers, logging, and styled terminal output. Use when writing, reviewing, or debugging shell workflows that invoke the \`gum\` CLI.

Available; no automatic recommendation.

### [ink](skills/ink/SKILL.md)

Use when building, debugging, testing, or reviewing an Ink \(React terminal CLI\) application. Covers Ink 8 APIs, Node and React compatibility, components, input/paste, focus, terminal dimensions, scrolling, lifecycle, accessibility, and testing.

Available; no automatic recommendation.

### [ink-testing-library](skills/ink-testing-library/SKILL.md)

Write, improve, and debug automated tests for React-based Ink terminal/CLI components using the ink-testing-library package. Use when testing rendered terminal output, interactive keyboard input, rerenders, asynchronous UI changes, stdout/stderr frames, or teardown in Ink apps. Do not use for browser React DOM tests or when only a one-shot renderToString assertion is needed.

Available; no automatic recommendation.

### [justfile-expert](skills/justfile-expert/SKILL.md)

Just command runner expertise — Justfile syntax, recipes, parameters, modules, shebang recipes. Use when authoring justfiles, project commands, or task automation.

Available; no automatic recommendation.

### [knap-skill](skills/knap-skill/SKILL.md)

Write, explain, validate, and render Knap templates for Markdown or text output. Use for Knap variables, filters, conditions, loops, local assignments, CLI rendering, or batch generation; do not apply to unrelated Jinja, Liquid, or Mustache templates.

Available; no automatic recommendation.

### [readme-crafter-skill](skills/readme-crafter-skill/SKILL.md)

Creates repository-specific README.md files that act as landing pages, onboarding guides, and trust signals. Use when the user asks to write, rewrite, improve, audit, localize, or restructure a README, or when a codebase needs a GitHub-facing project overview. Common triggers include "write a README", "improve my README", "generate README.md", "rewrite this project overview", and "make this repo easier to understand". Adapts to libraries, CLI tools, apps, research repos, browser extensions, internal tools, monorepos, and bilingual README workflows.

Available; no automatic recommendation.

### [serena-usage](skills/serena-usage/SKILL.md)

Serena MCP for project memory and code navigation. Use when managing Serena memories, navigating symbols, performing intelligent refactoring, or maintaining context/continuity across AI agent sessions.

Available; no automatic recommendation.

### [ue4ss-bridge](skills/ue4ss-bridge/SKILL.md)

Inspect and manipulate a live, running Unreal Engine game through the ue4ss-bridge MCP server \(UE4SS plus the UEBridge Lua mod\). Use this whenever the user wants to examine UObjects, properties, UFunctions or class hierarchies in a running game; read or change a value live; run Lua inside the game; snapshot/diff or watch/hook values while they play; find out what the camera is aimed at; trigger UE4SS dumps \(usmap, jmap, uht, cxx\); or whenever ue4ss-bridge tools \(bridge\_status, inspect\_object, eval\_lua, snapshot\_object, watch\_property, hook\_function, poll\_events, etc.\) are available. Also trigger on mentions of UE4SS, UEBridge, Unreal game modding or reverse engineering, "the player pawn/controller", or finding offsets and property names in a live game, even if the user never names the tool.

Available; no automatic recommendation.

### [vhs-cli](skills/vhs-cli/SKILL.md)

Create and verify reproducible terminal recordings using Charmbracelet VHS. Use for .tape authoring, CLI/TUI demos, GIF/MP4/WebM recording, terminal screenshots, and ASCII golden fixtures. Offers simple \(lint without rendering\) and expanded \(render, inspect, review\) workflows.

Available; no automatic recommendation.

### [vitest-testing](skills/vitest-testing/SKILL.md)

Write, configure, debug, migrate, and review JavaScript/TypeScript tests with Vitest and Vite. Use for Vitest unit tests, async assertions, mocks/spies, fake timers, DOM or Browser Mode tests, coverage, CI, workspaces, flaky tests, Jest migration, or contributions to vitest-dev/vitest.

Available; no automatic recommendation.

<!-- END GENERATED SKILL CATALOG -->

## Create a GitHub registry (recommended)

1. Select **Use this template** → **Create a new repository** at
   [rigerc/nosey-registry-template](https://github.com/rigerc/nosey-registry-template).
   Choose your owner, repository name, and visibility.
2. Clone the new repository and set its registry identity:

   ```bash
   gh repo clone your-org/your-skills
   cd your-skills
   node scripts/configure-registry.mjs your-org/your-skills
   make check
   git add registry.json skills-manifest.json skills-map.json README.md
   git commit -m "chore(registry): set registry identity"
   git push
   ```

   **The configuration step is required.** GitHub template creation does not
   automatically replace `example/agent-skills`. The command rewrites registry
   and local skill IDs, preserves external skill IDs and `$schema` annotations,
   and regenerates the README catalog. It is safe to rerun.

3. Add skills under `skills/<name>/SKILL.md`; edit `skills-map.json` to
   associate them with technologies. Run `make generate && make check`.
4. Register the published repository with Nosey:

   ```bash
   nosey registry add https://github.com/your-org/your-skills.git --ref main
   nosey scan .
   ```

New repositories have independent Git histories. The included
[template-sync workflow](.github/workflows/template-sync.yml) checks for
upstream changes and proposes them in pull requests for review.

## Receive template updates

Derived registries receive upstream infrastructure changes through reviewed
[template-sync PRs](.github/workflows/template-sync.yml) using
[actions-template-sync](https://github.com/AndreasAugustin/actions-template-sync).
Skills, identity, mappings, the manifest and README remain downstream-owned.
Configure the `TEMPLATE_SYNC_TOKEN` secret with Contents, Pull requests and
Workflows write permissions to enable monthly updates. See
[template synchronization](TEMPLATE_UPDATES.md) for setup, dry runs and conflict handling.

## Local registry creation

Nosey's existing command still creates a registry from its packaged scaffold
rather than this GitHub template:

```bash
nosey registry init ./my-registry --registry-id your-org/your-skills
```

The interactive wizard asks for confirmation and can optionally initialize
Git. For unattended creation without Git:

```bash
nosey registry init ./my-registry --registry-id your-org/your-skills --yes --no-git
```

The destination must not already exist. Until Nosey's CLI is refactored, its
`--github` mode also uses the older local-scaffold-and-push flow.

## Customize

1. If copied manually, set the same unique `registryId` in `registry.json` and
   `skills-map.json`, and update skill ID references in the map to match. Init
   already does this for you. Nosey validates these files using their `schemaVersion`.
2. Add your own skills under
   `skills/<skill-name>/SKILL.md`, with YAML frontmatter containing a name and
   a description explaining when to use the skill. Nested skill folders are supported.
3. From the registry directory, run `node scripts/generate-manifest.mjs` to generate
   `skills-manifest.json` using the identity in `registry.json`.
4. Run `node scripts/generate-readme.mjs` to refresh the skill catalog, then commit
   both `skills-manifest.json` and `README.md`.
5. Maintain `skills-map.json` manually. The generators never edit it. Update
   mappings when you delete or rename skills.
6. Push to GitHub. The [catalog workflow](.github/workflows/generate-catalog.yml)
   regenerates and commits `skills-manifest.json` and the README catalog when skills,
   registry identity, mappings or generators change on any branch. Pull request CI
   regenerates and validates the output without pushing to the contributor's branch.
   Local generation remains useful for reviewing changes before pushing.

The catalog workflow uses the built-in `GITHUB_TOKEN` with Contents write permission;
enable GitHub Actions and allow its commits on the target branch. If branch protection
blocks bot pushes, run `make generate` and commit the output yourself. You can also
run the workflow manually from the Actions tab. Bot pushes do not trigger another
push workflow run ([GitHub documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)).

The template includes an empty `skills/` directory tracked by `.gitkeep`. Add skills
alongside it; the manifest generator ignores the placeholder.

IDs use `<registryId>/<relative-directory-under-skills>`. Moving a skill changes its ID.

The manifest lists local skills, but does not automatically recommend them.
Map skills to built-in technologies with technologySkills, declare new technologies
with detection rules, declare combinations, extend existing combinations with
combinationSkills, add frontendBonusSkills, or list specific skill IDs in
`alwaysRecommend` to recommend them in every project using this registry. Mapped skill IDs must be declared either in the local manifest or in `externalSkills` in the map.

For an external upstream skill, use `schemaVersion: 2` in `skills-map.json` and add:

```json
"externalSkills": [
  {
    "id": "acme/upstream-skills/example-testing",
    "name": "External testing guidance",
    "source": "acme/upstream-skills",
    "skill": "example-testing"
  }
],
"technologySkills": [
  {"technologyId": "react", "skills": ["acme/upstream-skills/example-testing"]}
],
"alwaysRecommend": []
```

External sources accept GitHub `owner/repo`, `https://github.com/owner/repo`, and
`git@github.com:owner/repo` forms. Nosey reads declarative metadata only: it
never downloads or executes external skills when scanning. Skill existence upstream
is not automatically verified. Version 1 maps without `externalSkills` remain valid.

You can also mark individual skills through Nosey's Registries tab: open a local
registry, press `a`, select skills with Space, and save after reviewing the write
target. This updates `skills-map.json`, which the manifest generator preserves.
Commit and publish the map to share the marks with Git registry consumers.

## Regenerate the catalog

With Node.js 20 or later, run these commands from the registry directory after
editing skills or the map:

```bash
node scripts/generate-manifest.mjs
node scripts/generate-readme.mjs
```

Only the section between the generated catalog markers is replaced. Keep the
markers intact and edit descriptions in skill frontmatter and recommendation
rules in `skills-map.json`. Local and external skills without mappings remain
listed as available. External entries link to their upstream repository.
The generators support a registry with no local `skills/` directory.

Check committed output without writing files, and run the generator and SARIF tests:

```bash
node scripts/generate-manifest.mjs --check
node scripts/generate-readme.mjs --check
node --test scripts/*.test.mjs
```

## Lint skills

Skills are validated with [agnix](https://github.com/agent-sh/agnix). CI pins
version `v0.59.0`; use the same version locally:

```bash
npm install -g agnix@0.59.0
agnix .              # report errors and warnings
agnix --fix-safe .   # apply safe fixes only
agnix --strict .     # treat warnings as errors
```

`.github/workflows/agnix.yml` runs on pushes to main, on pull requests and on
manual dispatch. Validation errors fail the job. A filtered SARIF copy omits
findings without file locations so GitHub code scanning can accept the upload;
the original diagnostics and lint result are preserved. Upload failures are
nonfatal, and code scanning availability depends on repository settings.
`.agnix.toml` promotes credential exposure, dangerous execution and permission
escalation rules to errors, so those findings fail validation even without
`--strict`.

For agent-assisted remediation, use
[Fix skill diagnostics with agnix](.agents/prompts/fix-skills-using-agnix.md).
The prompt covers baseline checks, safe fixes, manual corrections and strict
validation, followed by regenerating the manifest and README catalog.

## Use with Nosey

Init creates the registry files; register it separately. From the project you want
to scan, run:

```bash
nosey registry add /path/to/my-registry
nosey scan .
```

For a published registry, use:

```bash
nosey registry add https://github.com/your-org/your-skills.git --ref main
```

Added registries are saved globally and available across projects. Existing
project-scoped references still load; use `registry remove <source> --project` to
remove a legacy reference. For a single scan without saving a reference, run
`nosey scan . --registry /path/to/my-registry`.

Validate a registry with `nosey registry validate /path/to/my-registry`. To check
whether its manifest is up to date, run
`node scripts/generate-manifest.mjs --check` and
`node scripts/generate-readme.mjs --check` from the registry directory.

Only the registry JSON files are interpreted by Nosey; skill files are
never executed or installed during detection.

## Registry validation

The template contains no JSON Schema files or `$schema` annotations. Nosey validates
registry documents through its parsers. Run `nosey registry validate .` for full
validation, including skill references and file paths. See Nosey's
[registry schema reference](https://github.com/rigerc/nosey/blob/main/docs/registry-schema.md)
for the supported fields.

Template CI regenerates output, validates the registry and runs generator tests. Run `make check`
locally and validate with Nosey before publishing registry changes.

## Repository standards

This template adapts repository practices from [ianlewis/repo-template](https://github.com/ianlewis/repo-template). See [NOTICE.md](NOTICE.md) for attribution, and review the included [LICENSE](LICENSE) before publishing independently authored skills. Run `make check` for deterministic, dependency-free checks.
