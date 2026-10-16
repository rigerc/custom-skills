---
name: release-checklist
description: Build a risk-aware release plan with verifiable checks, ownership, rollout and rollback criteria.
---

# Release checklist

Use when preparing a versioned deployment or shipment.

1. Clarify the target environment, change scope, owner, rollback authority, and release window.
2. Identify external dependencies, data migrations, and customer-facing behavior changes.
3. Create preflight, deploy, verification, communication, and rollback steps.
4. Assign an owner and objective pass/fail criterion to each step. Mark missing facts as unknown rather than inventing them.
5. Require explicit approval before destructive or production-affecting operations.

Use [the reference checklist](references/checklist.md) as a starting point and adapt it to the actual project.
