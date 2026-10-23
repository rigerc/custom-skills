# MCP action map

This file reflects the repository's documented **compound-tool API**, as inspected on 2026-10-23. Always call `discover_tools` in the live MCP session for exact schemas. All JSON below is **illustrative**: replace placeholders with returned IDs and validated values. A tool call is not proof of execution until its response and GitHub state are checked.

## Discovery and preflight

```json
{"tool":"discover_tools","arguments":{}}
{"tool":"discover_tools","arguments":{"group":"agent_manage","action":"assign_task","includeSchemas":true}}
{"tool":"discover_tools","arguments":{"group":"manage_issues","action":"create","includeSchemas":true}}
```

Most relevant groups:

| Purpose | Compound tool | Read actions | Write actions |
|---|---|---|---|
| Projects / fields / items | `manage_project` | `list`, `get`, `list_items`, `list_fields` | `create`, `add_item`, `setup_agent_fields`, `set_field_value` |
| Issues and sub-issues | `manage_issues` | `list`, `get`, `search_advanced`, `list_comments`, `list_sub_issues` | `create`, `update`, `create_comment`, `add_sub_issue` |
| Sprint | `manage_sprints` | `list`, `get_current`, `get_metrics` | `create`, `plan`, `add_issues`, `update` |
| Milestones | `manage_milestones` | `list`, `get_overdue`, `get_metrics` | `create`, `update` |
| PRs and reviews | `manage_prs` | `get`, `list`, `list_reviews` | `create`, `create_review`, `merge` (gated) |
| Planning | `ai_generate` / `ai_plan` | AI suggestions | `materialize_tasks` (gated bulk write) |
| Worker operations | `agent_work` | `get_task_context`, `check_work_status`, `get_handoff_context` | `register`, `checkout_task`, `heartbeat`, `submit_for_review`, `approve_task` (gated), `reject_task` |
| Manager operations | `agent_manage` | `list`, `get_activity`, `get_budget`, `get_swarm_status`, `get_metrics` | `assign_task`, `smart_assign`, `set_budget`, `record_usage`, `submit_work_product`, `rebalance_workload` |
| Project reporting | `manage_status_updates` | `list`, `get` | `create` (gated publication) |

**Status labels:** do not assume user-defined project states exist. Inspect actual fields/options first. **Issue IDs:** `issueNumber` is a number; agent `taskId` is often a string such as `issue-42`. Obtain actual values from responses.

## Project preparation

```json
{"tool":"manage_project","arguments":{"action":"list","limit":20}}
{"tool":"manage_project","arguments":{"action":"get","projectId":"PVT_..."}}
{"tool":"manage_project","arguments":{"action":"list_items","projectId":"PVT_...","limit":100}}
{"tool":"manage_project","arguments":{"action":"setup_agent_fields","projectId":"PVT_..."}}
```

The last call modifies the project and needs authorization. Setup provisions agent-claim custom fields; it does not spawn an agent.

## Planning / issue generation

```json
{"tool":"manage_issues","arguments":{"action":"search_advanced","query":"repo:OWNER/REPO is:issue is:open login"}}
{"tool":"ai_generate","arguments":{"action":"generate_prd","projectIdea":"<idea>","projectName":"<project>"}}
{"tool":"ai_generate","arguments":{"action":"parse_prd","prdContent":"<reviewed PRD>","createTraceabilityMatrix":true,"maxTasks":20}}
{"tool":"ai_generate","arguments":{"action":"materialize_tasks","projectId":"PVT_...","tasks":[{"id":"t1","title":"Implement login validation","description":"...","priority":"high","dependencies":[],"acceptanceCriteria":["... "]}]}}
```

`materialize_tasks` writes actual issues/milestones/sprints. Preflight duplicates and confirm batch size plus effects. Without AI configuration, create hand-reviewed issues through `manage_issues/create` instead.

## Manager-led delegation

```json
{"tool":"agent_manage","arguments":{"action":"list"}}
{"tool":"agent_manage","arguments":{"action":"get_swarm_status"}}
{"tool":"agent_manage","arguments":{"action":"get_budget","agentId":"agent-123"}}
{"tool":"agent_manage","arguments":{"action":"assign_task","projectId":"PVT_...","agentId":"agent-123","issueNumber":42}}
```

`assign_task` makes an atomic agent claim; verify the claimed issue's dependency state and agent fitness **before** calling it. To allow the server to route several tasks instead:

```json
{"tool":"agent_manage","arguments":{"action":"smart_assign","projectId":"PVT_...","roleFilter":"engineer","maxAssignments":3}}
```

If assigning a *person*, use `manage_issues/update` with a verified GitHub username. Be cautious with replacements of existing assignee arrays; preserve any intentionally shared owners.

## Worker lifecycle

```json
{"tool":"agent_work","arguments":{"action":"register","name":"frontend-worker-1","role":"engineer","runtime":"claude-code","capabilities":["typescript","react","testing"]}}
{"tool":"agent_work","arguments":{"action":"checkout_task","agentId":"agent-123","projectId":"PVT_...","strategy":"skills_match","skipBlocked":true}}
{"tool":"agent_work","arguments":{"action":"get_task_context","issueNumber":42}}
{"tool":"agent_work","arguments":{"action":"heartbeat","agentId":"agent-123","taskId":"issue-42","status":"working","progress":50,"progressSummary":"API tests pass; integration tests remain"}}
{"tool":"agent_manage","arguments":{"action":"record_usage","agentId":"agent-123","tokensUsed":4200}}
{"tool":"agent_manage","arguments":{"action":"submit_work_product","agentId":"agent-123","taskId":"issue-42","issueNumber":42,"branch":"feat/42-login-validation","prNumber":99,"summary":"Added validation with tests"}}
{"tool":"agent_work","arguments":{"action":"submit_for_review","agentId":"agent-123","taskId":"issue-42","summary":"PR #99 ready; tests attached"}}
```

Do not fabricate token usage or run heartbeats for offline agents. `register` records an agent; it does not start the worker.

## Reviewer lifecycle

```json
{"tool":"agent_work","arguments":{"action":"checkout_task","agentId":"reviewer-456","reviewQueue":true}}
{"tool":"agent_work","arguments":{"action":"get_handoff_context","taskId":"issue-42"}}
{"tool":"agent_work","arguments":{"action":"validate_work_product","agentId":"reviewer-456","taskId":"issue-42"}}
{"tool":"agent_work","arguments":{"action":"reject_task","reviewerId":"reviewer-456","taskId":"issue-42","feedback":"Missing test for expired token; please add coverage."}}
```

To accept *after independent evidence checks* and when explicitly authorized to close:

```json
{"tool":"agent_work","arguments":{"action":"approve_task","reviewerId":"reviewer-456","taskId":"issue-42","summary":"All acceptance criteria and CI checks verified."}}
```

## Monitor and recover

```json
{"tool":"agent_manage","arguments":{"action":"get_metrics","staleAfterMinutes":30}}
{"tool":"manage_sprints","arguments":{"action":"get_current"}}
{"tool":"manage_milestones","arguments":{"action":"get_overdue"}}
{"tool":"agent_manage","arguments":{"action":"reclaim_stale","timeoutMinutes":30}}
```

Reclaim is a mutation. Check configured timeouts, fresh heartbeats and whether the server's auto-reclaim already acted. `agent_manage/rebalance_workload` changes assignment and needs scope approval.

## Publishing a project update

```json
{"tool":"manage_status_updates","arguments":{"action":"create","projectId":"PVT_...","status":"ON_TRACK","body":"<verified project update>"}}
```

Use the actual allowed status enum discovered at runtime. Verify the created update before reporting success.

## Sources

- https://github.com/kunwarVivek/mcp-github-project-manager/blob/main/docs/TOOLS.md
- https://github.com/kunwarVivek/mcp-github-project-manager/blob/main/docs/agent-harness-integration.md
- https://github.com/kunwarVivek/mcp-github-project-manager/blob/main/examples/basic/agent-loop.ts
