# Example user requests and intended routing

## Example 1: design only (no writes)

> "Review our backlog and propose a two-week sprint around the login launch."

Read project, issues, deadlines, prior sprint metrics; propose scope, dependency-aware order, per-owner allocations and risks. Do not create a sprint until approved.

## Example 2: execute an approved plan

> "Create those six issues in org/app and add them to project PVT_... after checking for duplicates."

Discover schemas; read duplicates; create only missing issues; verify each resulting URL; report partial failures and do not retry uncertain writes blindly.

## Example 3: delegate to registered agent fleet

> "Assign the next three unblocked backend tasks to available AI engineering agents in project PVT_...."

Read claims, blockers, budgets and live agents. Preflight each issue. Use `smart_assign` with `maxAssignments:3` or scoped individual `assign_task` calls; verify every claim. Do **not** say a coding process was launched unless a connected runtime actually is running.

## Example 4: status

> "What is blocking release, who owns each blocker, and which agents have stopped checking in?"

Get milestone and issue dependency data, recent PR/CI status and swarm heartbeats. Show evidence links and separate stale signal from confirmed abandoned work. No writes unless requested.

## Example 5: review decisions

> "Check the review queue and recommend which tasks are safe to approve."

Gather acceptance criteria, work products, reviewer context and CI evidence. Return recommendations; do not invoke `approve_task`, merge PRs or publish releases.

## Example 6: recover stale claims

> "Agent-123 crashed and has not checked in for an hour; if it is stale, recover #42 and give it to another matching worker."

Validate configured staleness threshold, project state and latest claim. If still stale and write-authorized, reclaim under verified conditions, then assign to an eligible agent and provide audit trail. If already auto-reclaimed, do not reclaim twice.
