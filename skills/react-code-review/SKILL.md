---
name: react-code-review
description: Review React and Next.js code changes for correctness, maintainability, accessibility, and rendering performance.
---

# React code review

Use when reviewing a patch, pull request, or component in a React or Next.js application.

## Review procedure

1. Identify the changed behavior and the user-visible acceptance criteria.
2. Check correctness: state updates, effect dependencies and cleanup, stale closures, conditional rendering, and server/client boundaries for Next.js.
3. Check user experience: keyboard access, semantic HTML, focus, labels, validation and loading/error states.
4. Check runtime impact: unnecessary rendering, expensive calculations, list keys, large client bundles, and inappropriate network calls.
5. Check test coverage: behavior-oriented assertions and meaningful edge cases.
6. Report findings ordered by severity with concrete file references and suggested repairs.

## Output format

For each finding provide **severity**, **location**, **observed problem**, and **recommended change**. Separate confirmed defects from speculative improvements. If no material issues are found, say so and identify any remaining untested areas.
