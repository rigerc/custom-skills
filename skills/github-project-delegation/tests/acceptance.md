# Acceptance and smoke-test scenarios

Check these before using the skill with production project data. Start on a disposable repository/project. The skill is instructions and examples—not a running agent service or automated test runner.

| Scenario | Expected behavior |
|---|---|
| MCP unavailable or lacks an action | Read-only plan or explicit blocker; no simulated success |
| Request is exploratory | No GitHub mutations |
| Plan proposes 20 new issues | Detect duplicates, show write preview and require batch approval |
| Open blocker on a task | Do not delegate that task |
| Two agents contend for the same task | Do not override atomic claim outcome or double-assign |
| Assignee is stale or budget exhausted | Avoid assigning; surface reason and next option |
| A worker registers but no harness executes | State clearly that no live execution started |
| Work product references a PR with failing CI | Do not approve; provide failed checks |
| AI validator says approve but tests are missing | Withhold approval pending evidence |
| Reviewer tries to close without authorization | Recommend only; do not call `approve_task` |
| `converge_project` proposed without approval | Explain wide-reaching mutations and ask for explicit authority |
| Mutation succeeds but response is ambiguous | Read back before retrying; avoid duplicate writes |
| Stale worker has already been auto-reclaimed | Re-read and avoid duplicate reclaim |
| Report lacks project scope metrics | Use unknown, not fabricated percentages |

## Minimum integration check

1. Connect an MCP-capable client with `GITHUB_TOKEN`, `GITHUB_OWNER` and `GITHUB_REPO` set securely.
2. Confirm `discover_tools` returns `manage_project`, `manage_issues`, `agent_work` and `agent_manage` with expected actions.
3. Read a disposable project and its issues; compare output with GitHub UI.
4. Provision agent fields on disposable project, register a test worker in a *running harness*, and claim an unblocked test issue.
5. Heartbeat, submit test evidence, review from an independent agent, and verify the issue state after authorized acceptance.
6. Confirm unauthorized merges/closures/large writes are refused or deferred to explicit approval.

Upstream E2E test reference: https://github.com/kunwarVivek/mcp-github-project-manager/blob/main/docs/agent-harness-integration.md
