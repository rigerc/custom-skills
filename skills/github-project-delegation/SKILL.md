---
name: github-project-delegation
description: "Plan and coordinate software projects in GitHub Projects v2 using the mcp-github-project-manager MCP server. Use for backlog triage, PRD-to-issue breakdown, sprint planning, human or AI-agent delegation, cross-agent handoffs, progress/risk reporting, review gates, and blocked or stale task recovery."
---

# GitHub Project Management & Delegation

Act as a **project manager and dispatcher**, not as an invisible coding agent. Use GitHub as the source of truth and the `mcp-github-project-manager` server for project operations, agent claims, reviews, and progress. Your decisions should be explainable, auditable, and reversible where possible.

## Activate for

- "Plan this project", "break down this PRD", "create a sprint", or "prioritize our backlog".
- "Delegate tasks", "assign work to our agents", "rebalance the team", or "coordinate subagents".
- "What's blocked?", "give me a status update", "review pending work", or "recover stalled tasks".

Do not activate merely because the user mentions GitHub. For implementation-only requests, use the relevant coding workflow and consult this skill only when coordination is necessary.

## Operating contract

1. **Determine scope:** repository owner/name, GitHub Projects v2 `projectId` (when relevant), desired outcome, deadline, constraints, stakeholders, available humans/agents, and authority to write. Use existing context; ask only for essential missing scope. Never invent an ID, assignee, deadline, capacity, PR, or team member.
2. **Discover capabilities:** call `discover_tools` first; then request `includeSchemas: true` for actions you intend to use. Compound groups/actions and server access can vary by installed version and `MCP_TOOL_GROUPS`. Stop or propose a manual alternative if the required action is unavailable.
3. **Build a read-only snapshot** before proposing changes: project items, open issues, current sprint, milestone deadlines, PR/review status, registered agents, swarm health, and metrics where relevant. Identify duplicates, blockers, incomplete acceptance criteria, and stale information. Timestamp the snapshot.
4. **Default to proposal mode** for open-ended planning. Execute GitHub writes when clearly requested and authorized in scope; present a concise change plan before bulk or high-impact actions. Explicit approval is required for destructive actions, bulk issue creation/reassignment, closing work, publishing a project status update, triggering a workflow, merging code, or automatic convergence.
5. **Prefer deterministic steps:** AI generation, risk scoring, and routing are advisory; inspect their results before writing. Never claim that starting or registering an agent creates a live worker process. Agent execution requires a separately running MCP-capable harness.
6. **Verify each mutation:** inspect tool success responses, canonical URLs/IDs, and relevant read-back state. If ambiguous or timed out, read before retrying to avoid duplicates. Report partial success and failed actions rather than claiming completion.

### Modes

| Mode | When to use | Writes |
|---|---|---|
| **Propose** (default) | Ambiguous or exploratory requests | None |
| **Execute** | Explicit, scoped request to create/update/delegate | Permitted non-destructive writes; gated operations require approval |
| **Orchestrate** | Explicit authorization to coordinate an existing project/worker fleet | Bounded assignment, health, and review operations; no unattended execution guarantee or bypass of gates |

A single user request does not authorize indefinite autonomous operation. Treat orchestration as a bounded session unless a separate scheduler or running harness actually exists.

## Standard process

### 1. Inspect and establish source of truth

- Discover the server (`discover_tools {}`); inspect schemas for planned actions.
- Identify the repository and GitHub Projects v2 project. `projectId` is a GitHub Project identifier (typically `PVT_...`), not a repository name or issue number.
- Read relevant state using `manage_project/list|get|list_items`, `manage_issues/list|search_advanced`, `manage_sprints/get_current`, `manage_milestones/list`, `manage_prs/list`, `agent_manage/list|get_swarm_status|get_metrics`.
- Clarify missing goals, blocked dependencies, capacity, and authority only if necessary to avoid a wrong write. Work with available evidence otherwise; state assumptions.
- Record a **baseline**: goal, current progress, items in scope, active agents, blocked work, open reviews, near-term dates, and risks.

### 2. Convert outcome to a dependency-aware plan

- Define deliverables and measurable acceptance conditions. Identify scope exclusions and decision owners.
- Use `ai_generate/generate_prd` and `parse_prd` if AI is configured; otherwise decompose manually. Use `ai_generate/analyze_complexity` or `expand_task` for unclear/large tasks.
- Each actionable issue needs one accountable owner, testable acceptance criteria, links to source requirements, dependencies (`Blocked by #N` or `Depends on #N`), estimate/confidence, priority, and a definition of done. Keep tasks small enough for independent review. Use [the issue template](assets/issue-template.md).
- Validate the dependency DAG (no cycles); sequence foundational tasks first and respect actual human/agent capacity. Prioritize blockers and the critical path above speculative parallelism.
- Search for existing issues before creating; preserve existing issue history. Present **proposed creation/update counts** and a diff-like outline for approval of bulk mutations.
- With authorization, use `manage_issues/create|update`, `manage_milestones/create`, `manage_sprints/create|add_issues`, or `ai_generate/materialize_tasks`. Inspect AI-produced task lists before materialization: that action creates multiple GitHub artifacts.

### 3. Delegate with capacity and ownership checks

- Separate **human assignment** (`manage_issues/update` with assignees) from **AI-agent claim** (`agent_manage/assign_task`, `smart_assign`, or `agent_work/checkout_task`). They are not interchangeable.
- Confirm each assignee or agent exists, is suitable, has available capacity and permission, and is not stale/budget-exhausted. Default work-in-progress limit is **one actively claimed issue per worker**; override only if the team explicitly accepts higher WIP.
- Respect dependencies. `assign_task` can bypass self-service selection: independently verify that blockers are resolved before directing a claim.
- For automatic selection prefer `agent_work/checkout_task` with `skipBlocked: true` and a deliberate strategy (`skills_match`, `highest_priority`, or `milestone_deadline`). For manager-directed allocation, `agent_manage/smart_assign` can choose capability/budget-aware matches but inspect the results.
- If agent project fields are absent, provision once using `manage_project/setup_agent_fields` **only with write authorization**.
- Register worker identities using `agent_work/register`; persist returned `agentId`. Optional `parentAgentId` builds hierarchy; do not deregister a parent casually because deregistration cascades to children.
- Provide a short **delegation contract**: issue ID/URL, goal, acceptance criteria, dependencies, permitted scope, expected work product, check-in rhythm, review owner, and escalation rule. See [role contracts](references/role-contracts.md).

### 4. Track execution and surface exceptions

- For live workers, the running harness—not this document—must send `agent_work/heartbeat` at an interval lower than its configured stale threshold and `agent_manage/record_usage` for actual token spend.
- Monitor `agent_manage/get_swarm_status|get_activity|get_metrics`, sprint metrics, milestone deadlines, PRs, CI evidence, and issue state. Do not confuse absence of heartbeat with proven task failure.
- Identify: overdue critical-path items, unresolved blockers, stale claims, failing CI, rejected reviews, exhausted budgets, missing owners, and scope creep.
- When status is uncertain, request/update evidence rather than inventing percentage completion. Report *observed*, *reported*, and *inferred* progress separately.
- Escalation hierarchy: (1) request owner update; (2) unblock or split scope; (3) propose reassignment; (4) with authorization reclaim/rebalance (`agent_manage/reclaim_stale|rebalance_workload`) and record why. The server may auto-reclaim stale agents; re-read state before manual recovery to avoid conflicts.

### 5. Review, accept, and close responsibly

- Worker: gather actual evidence (branch/PR/commits, tests and results), call `agent_manage/submit_work_product`, then `agent_work/submit_for_review`.
- Independent reviewer: claim review queue using `agent_work/checkout_task {reviewQueue:true}`, read `agent_work/get_task_context|get_handoff_context`, inspect real PR/test evidence, and optionally run `agent_work/validate_work_product`.
- A validator recommendation alone is **not** proof of successful tests or merge. Confirm acceptance criteria, CI status, review requirements, and outstanding blockers. Do not review your own implementation without explicit authorization.
- With authority to close, use `agent_work/approve_task` (closes the issue). Otherwise return a recommendation to the human reviewer. Reject with specific reproducible feedback using `agent_work/reject_task`, and consider `agent_manage/decompose_task` for failed work too large to repair safely.
- Never silently merge PRs, trigger deployments, publish releases, delete data, or call `agent_manage/converge_project|converge_until_done` without explicit scope and approval; these may make wide-ranging state changes.

### 6. Communicate progress and next actions

Every run ends with a compact, evidence-linked report:

1. **Outcome:** what was accomplished or proposed, and which GitHub artifacts changed.
2. **Delegations:** task → owner/agent → due date (if known) → review owner → status.
3. **Health:** complete/in progress/blocked/in review (counts only if measured), critical path, stale agents, budget concerns, and delivery confidence with rationale.
4. **Decisions:** specific approvals or clarifications needed, responsible decision maker, and suggested default action.
5. **Next checkpoints:** next event or check-in, not a promise of unattended future work.

Use [the status template](assets/status-template.md). Label unverifiable data as unknown. If the user only requests a plan, do not make writes.

## Delegation decision rules

| Situation | Action |
|---|---|
| Task has an open `Blocked by #N` dependency | Do not assign; surface blocker and owner |
| No suitable live agent | Keep unclaimed; recommend human assignment or running a compatible worker harness |
| Existing eligible task is already claimed | Do not double-claim; inspect current assignee and progress |
| Proposed assignment exceeds capacity or token budget | Split/reprioritize; do not bypass budget hard stop |
| Work submitted without PR/test evidence | Request evidence; do not approve |
| Worker is stale | Verify config/time + latest heartbeat; propose safe reclaim/reassignment |
| Automation or bulk write might alter many issues | Summarize effects and require approval |
| MCP unavailable or action missing | Produce a read-only plan or clearly describe blockers; never simulate an API success |

## References and use on demand

- [MCP action map and exact example calls](references/mcp-actions.md) — read before constructing tool inputs.
- [Detailed operating playbooks](references/playbooks.md) — intake, sprint, delegation, review, escalation.
- [Role contracts](references/role-contracts.md) — PM, worker, reviewer responsibilities and handoffs.
- [Issue template](assets/issue-template.md) and [status template](assets/status-template.md).
- [Request examples](examples/requests.md) and [smoke tests](tests/acceptance.md).

Authoritative upstream docs: [Tool reference](https://github.com/kunwarVivek/mcp-github-project-manager/blob/main/docs/TOOLS.md), [Agent harness integration](https://github.com/kunwarVivek/mcp-github-project-manager/blob/main/docs/agent-harness-integration.md), and [repository README](https://github.com/kunwarVivek/mcp-github-project-manager/blob/main/README.md). At runtime, `discover_tools` schemas supersede examples in this skill.
