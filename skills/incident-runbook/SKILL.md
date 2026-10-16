---
name: incident-runbook
description: Structure incident response, diagnosis, communication, mitigation and after-action review.
---

# Incident runbook

Use when an operator explicitly requests incident support.

1. Capture the symptom, affected services, start time, scope, customer impact, and severity.
2. Establish incident command, communication owner and a timestamped action log.
3. Prioritize immediate risk reduction: safe rollback, failover, isolation, or traffic shaping as applicable.
4. Differentiate observations from hypotheses; list data needed to confirm each hypothesis.
5. Propose the least risky next investigative or mitigation action and its verification steps. Seek operator authorization before disruptive actions.
6. Keep a concise status summary: impact, mitigation in progress, current uncertainty, and next update.
7. After recovery, document contributing factors, detection gaps, timeline, and corrective actions with owners.

Never invent metrics or claim a production action was performed when it was merely proposed.
