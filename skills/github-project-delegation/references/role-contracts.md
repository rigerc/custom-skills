# Delegation and accountability contracts

## Project manager / dispatcher

**Owns:** scope, ordering, dependencies, capacity, outcome, escalation and communication.

**Can:** plan; propose prioritization; register agent identities; assign within approved scope; monitor, replan, recommend reviewers.

**Must not:** claim an agent is executing before a live harness takes work; assign blocked tasks; turn a recommendation into unreviewed closure; bypass human approval gates.

**Delivery contract to each worker:**

- **Work item:** canonical GitHub issue ID/URL and project/sprint.
- **Outcome:** a one-sentence user-visible goal.
- **Inputs:** relevant PRD/design/docs and prerequisite issues.
- **Done means:** testable acceptance criteria plus required CI/review proof.
- **Boundaries:** allowed files/systems, non-goals, forbidden irreversible actions.
- **Schedule:** due date *if confirmed*, next checkpoint, and escalation trigger.
- **Output:** branch/PR or document, test log/results, summary and unresolved risks.
- **Review:** independent reviewer agent/human and decision authority.

## Worker / implementer

**Owns:** exactly one claimed task at a time by default, implementation, tests, actual progress signals and evidence.

**Procedure:** register in running harness → claim task → retrieve enriched context → read acceptance criteria → implement within scope → heartbeat with factual progress → report actual usage → submit work product → submit for review → respond to feedback. If blocked, signal blockers and release only according to agreement.

**Must not:** work on someone else's claim, imply a PR is merged, self-approve, fabricate token spend or CI success, expand the task without approval.

## Reviewer / QA

**Owns:** acceptance decision supported by evidence; independent validation.

**Procedure:** claim review queue → inspect task context, code/results, tests and policy → request changes or recommend/issue approval according to authority → record verification links.

**Must not:** treat `validate_work_product` confidence as conclusive, self-review unapproved work, close tasks without authority or substitute issue closure for merging the PR.

## Human approver

**Owns:** irreversible operations, publication, product scope changes, budget-limit overrides, and any task acceptance reserved to a human by project policy.

**Approval payload:** operation, targets (exact issue/PR/project IDs), expected side effects, batch count, alternatives and rollback limitations. Only an affirmative scoped authorization proceeds.

## Recommended separation of duties

| Operation | Responsible | Accountable |
|---|---|---|
| Prioritize and define sprint goal | PM agent | Human product owner |
| Implement assigned task | Worker agent or developer | Named task owner |
| Evaluate tests and acceptance | QA/reviewer | Authorized reviewer |
| Rebalance or reclaim abandoned claims | PM agent after verification | Team lead |
| Merge, release, production deploy | Approved human/automation | Repository release owner |

The role names are illustrative governance policy, not server-enforced permissions. Respect your actual GitHub access controls and configured branch-protection rules.
