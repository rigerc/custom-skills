# Project-management playbooks

Read the workflow that matches the user's current intent. Use the rules in `SKILL.md` for approval gates, runtime action discovery and read-after-write verification.

## A. Idea / PRD to delivery plan

**Entry:** project objective, repository, preferred scope/timebox (if known).

1. Inspect existing repo issues, milestone dates, project fields, and any linked PRD. Do not assume the project is empty.
2. State outcomes, target users, non-goals and measurable definition of done.
3. Generate or refine PRD optionally through `ai_generate/generate_prd`; review with user for scope and feasibility.
4. Parse to tasks (`ai_generate/parse_prd`) or manually break down work. Prefer independent, reviewable units and preserve requirement → issue links.
5. Create a dependency graph: identify prerequisites, parallelizable work, blocked items and milestone boundaries. Detect cycles and disconnected tasks.
6. Estimate effort as a range or confidence level, not false precision. Rank by value, urgency, risk and dependency leverage.
7. Produce a preview table: proposed issues, priority, acceptance criteria, blockers, suggested owner, expected milestone. Detect duplicates by search.
8. After approval, materialize issues. Re-read GitHub and return URLs, IDs and any partial failures.

**Exit:** reviewed backlog + dependency graph + milestone proposal; on authorized execution, concrete issue/project artifacts.

## B. Sprint planning

**Entry:** sprint horizon, goal, real available capacity, known absences if provided.

1. Read `manage_sprints/get_current`, backlog, sprint metrics and currently claimed work.
2. Separate carryover, top-priority new tasks and blocked tasks. Exclude blocked tasks from committed capacity unless dependency will clear early and is explicitly tracked.
3. Compute rough commitment from actual capacity and historical throughput, accounting for testing, reviews and interruptions. Do not treat AI-generated capacity as fact.
4. Present committed vs stretch work, per-owner load, dependencies and risks.
5. With authorization, use `manage_sprints/create|add_issues`; verify resulting sprint membership.
6. Mark checkpoint cadence and review/retrospective criteria.

**Exit:** sprint goal, realistic commitment, owner assignments, health-check cadence and escape hatches.

## C. Direct delegation to a worker fleet

**Entry:** a project ID and an already-running worker harness fleet (or an explicit request to prepare tasks without launching agents).

1. Read project items, `agent_manage/list|get_swarm_status`, per-agent budgets, task blockers and live claims.
2. Confirm `manage_project/setup_agent_fields` is provisioned; only invoke if needed and authorized.
3. Choose either worker-driven `agent_work/checkout_task {skipBlocked:true}` or PM-driven `agent_manage/assign_task`. Use `smart_assign` only if its batch effects are approved. Avoid simultaneous conflicting approaches for the same tasks.
4. Match issue → capabilities → budget → WIP; prefer an independent reviewer when code is produced.
5. Issue the delegation contract; create/update GitHub issue context if authorized.
6. Verify each claim atomically succeeded and that the task status reflects it. Do not claim workers were started merely because they were registered or assigned.
7. Report exact task/agent mappings and what action the running harness must take next.

**Exit:** auditable assignments with owners and review path, or a clear statement that workers must be launched separately.

## D. Daily standup / status review

**Entry:** existing project (optionally sprint).

1. Read active tasks, last heartbeat times, new PRs, review queue, CI checks, budget summaries, milestone deadlines.
2. For each active issue classify `on track`, `at risk`, `blocked`, or `unknown` based on observed evidence. Highlight missing evidence, not assumed failures.
3. Rank obstacles by impact: release blocker, critical-path delay, review bottleneck, isolated noncritical delay.
4. Generate decision log: owner, action, deadline if provided, evidence link.
5. Draft a factual status update; post with `manage_status_updates/create` only when explicitly requested/approved.

**Exit:** concise project health, material changes since previous snapshot if comparable, escalations and next choices.

## E. Rejected work / stalled task recovery

**Entry:** issue with rejection, failure, blocker or stale owner.

1. Inspect current owner and context (`get_task_context`, `get_handoff_context`, issue comments) and actual PR/test output.
2. Diagnose whether the problem is missing evidence, incomplete acceptance criteria, a code defect, a cross-team dependency or a dead harness.
3. Choose lowest-risk resolution: request evidence, provide specific reviewer feedback, split task, release safely, or reassign.
4. Preserve failure details and prior work links in the issue. Use `agent_manage/decompose_task` for documented subtasks only with approval; do not silently create duplicates.
5. For stale owners, verify the effective `AGENT_STALE_AFTER_MINUTES` threshold and whether reclaim has already happened; do not use `reclaim_stale` as a routine heartbeat substitute.
6. Verify new issue status/claim and tell the affected owner about handoff context.

**Exit:** reason for exception, action taken, new owner/status, and explicit residual risk.

## F. Quality gate / review

**Entry:** a task marked ready for review with submitted work product.

1. Read issue acceptance criteria, work-product artifacts, PR branch/commit evidence and reported tests.
2. Reviewer validates results independently; check CI against the relevant head commit and verify human/code-owner policies.
3. Use `validate_work_product` as one signal only. No PR/test data means **insufficient evidence**, not success.
4. Deliver verdict: **approve**, **request changes** with reproducible feedback, or **needs decision**. Only call `approve_task` if authorized to close.
5. Keep PR merge/release/deploy distinct from task approval; each requires its own requested authority and relevant policy checks.

**Exit:** traceable review decision and task state consistent with actual evidence.
