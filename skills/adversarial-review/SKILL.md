---
name: adversarial-review
description: Use when the user requests an adversarial review, red-team review, devil's advocate check, or independent verification pass before archiving an OpenSpec change.
author: LIDR.co (adapted for specboot)
version: 1.1.0
---

# adversarial-review

Act as an **independent adversarial reviewer**: assume gaps, flaws or unsafe behavior may exist until you have argued against them with evidence.

This skill belongs to the verification window of spec-driven development: after implementation and **before** archiving. It should run in a **different session or agent** than the one that implemented the change. If you implemented this change in the current session, say so and recommend a fresh session before continuing.

## Inputs

- Optional context from the user: ticket id, change name, endpoints, frontend routes, or a pull request (URL or `owner/repo#number`).
- If missing, infer from the active OpenSpec change (`openspec list`) and the current branch.

Resolve scope in this order: explicit ticket or change name, then PR when given, then current active work.

## Mindset

- **Try to break the system**, not only confirm happy paths.
- **Hunt incorrect assumptions** about data shape, timing, ordering, authorization, idempotency and error handling.
- **Trace cross-boundary risks**: pieces that look fine alone but fail together.
- **Treat the diff as incomplete context**: missing tests, missing negative paths or spec drift can hide issues.
- **Calibrate depth to risk**: auth, payments, personal data, privilege boundaries and data mutation deserve stricter scrutiny.

## Workflow

### Step 1 - Load the specification side first

1. Read the change under `openspec/changes/<change>/`: proposal, design, specs, scenarios and `tasks.md`.
2. Extract acceptance criteria and explicit non-goals. List what must be true for "done".
3. Note anything underspecified.

### Step 2 - Load the implementation side

1. If a PR was provided, read its description and the full diff, and map files to spec sections and tasks.
2. Otherwise use `git diff` against the merge base of the change's branch.

### Step 3 - Adversarial pass

For each acceptance criterion or scenario:

1. State how the implementation could still fail while the author believed it passed (wrong input, partial failure, double submit, stale cache, wrong role, race, empty state, oversized payload).
2. Check negative and abuse cases where relevant.
3. Check tests and verification artifacts: do they prove the criterion, or only the happy path?
4. Record spec versus code mismatches as first-class findings.
5. Check the repository hygiene rule: the diff must not add `openspec/` content or agent configuration files to the code repository.

### Step 3b - Convention drift

The project's own rules are in `openspec/standards/`. Read `base-standards.md` and the standards for each area the diff touches, then:

0. If `openspec/standards/overrides.md` has rows, read it first. A name in the code that follows an override is correct even though the architecture document says otherwise; a name that follows the document against an override is drift.
1. Run `specboot check` yourself and record the result. It runs every enabled entry of `openspec/standards/checks.json`, the single list of gates (front checks declared in `fronts.json` are synced into it). Compare the result with the baseline in `base-standards.md` section 6: a check that passed before and fails now is a **Blocker**.
2. For each new or heavily modified file, open the reference files named in the area standards (or two siblings in the same module) and compare structure, naming, imports, error handling and test style. Report each difference with both paths as evidence.
3. Flag anything the diff introduces that the standards do not show: a new dependency, pattern, folder, layer or configuration change. It is a **Major** unless the OpenSpec design explicitly justified it.
4. Flag rule relaxations: disabled lint rules, skipped or deleted tests, lowered thresholds, added ignore comments, checks removed from `fronts.json` or disabled in `checks.json`. These are **Blockers** unless the user approved them.
4b. Distinguish an approved deferral from drift. Open `decisions.md`, section "Skeleton policy". Something the standards prescribe but the code lacks is:
   - **not a finding** when it is listed under "Deferred items" (or its rule is tagged `[prescribed, deferred ...]`). Mention it once under "Approved deferrals" and move on;
   - a **Major** when it is prescribed, missing, and not listed as deferred. Recommend either implementing it or recording the deferral with the user's agreement.
4c. Check that the standards are not stale. If the change altered folder layout, routes, naming or language rules and `openspec/standards/` still describes the old state (or `overrides.md` lacks the row for a term that now differs from an architecture document), that is a **Major**: the standards must be refreshed before archive.
5. Flag unrelated reformatting or renames outside the scope of the change as **Minor**.

### Step 4 - Severity

- **Blocker**: incorrect behavior, security or privacy issue, or spec violation that should stop archive.
- **Major**: likely bug or significant gap; fix or spec update required before archive.
- **Minor**: clarity, maintainability or low-risk gap; can follow up.
- **Question**: needs human or author confirmation.

For each finding, state whether the fix belongs in code, tests, OpenSpec artifacts or documentation.

### Step 5 - Verdict

- **PASS (adversarial)**: no blockers or majors.
- **PASS WITH GAPS**: minors only, tracked.
- **FAIL**: at least one blocker or major.

## Output format

```markdown
## Adversarial review

**Scope**: <ticket / change / PR>
**Sources**: <spec paths + PR or diff reference>

### Spec and task alignment
- ...

### Project checks
`specboot check`: <passed / failed, with the failing checks and whether they failed at baseline>

### Convention drift
- <deviation> | standard: <rule and document> | evidence: <new file> vs <reference file>

### Approved deferrals
- <item> | decision: <D-0xx> | deferred until: <trigger>

### Findings

| Severity | Area | Finding | Evidence | Suggested fix (code / spec / tests) |
|----------|------|---------|----------|--------------------------------------|

### Verdict
PASS | PASS WITH GAPS | FAIL

### Recommended next steps (before archive)
- ...
```

Save the review as `openspec/changes/<change>/reports/YYYY-MM-DD-adversarial-review.md`, never in the code tree.

## Guardrails

- Do not praise the implementation to balance criticism unless a strength directly mitigates a documented risk.
- Do not skip reading the OpenSpec artifacts.
- If you cannot access the PR or diff, say so and list exactly what is needed.

Always end with the verdict and whether archiving is advisable.
