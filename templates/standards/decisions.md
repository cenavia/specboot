---
status: draft
---

# Architecture decisions

<!--
One entry per decision taken when the project standards were written. Later decisions are appended, never rewritten.
A decision recorded here is closed: agents follow it and do not reopen it in each change.
A decision that contradicts an architecture document also gets a row in overrides.md.
-->

## Order of authority

1. Agent rule files the client already versions in its repository.
2. Architecture documents, as amended by `overrides.md`.
3. The decisions in this file.
4. The code (existing project) or the base skills of each front (new project).
5. Generic technology skills.

## Skeleton policy

How much of the declared stack the first change must install. Choose one and record it as a decision:

- **Full declared stack**: everything the standards prescribe is installed and configured by the skeleton.
- **Minimum runnable**: the skeleton installs only what is needed for every declared check to run and pass. Everything else the standards prescribe is listed below as deferred.

### Deferred items

Prescribed by the standards but intentionally not installed yet. A reviewer treats these as approved deferrals, not as drift. Remove a row when the item lands.

| Item | Prescribed by | Deferred until | Decision |
|------|---------------|----------------|----------|

## Decisions

Entry format:

```markdown
## D-001: <short title>

- Front: <front name or "all">
- Date: YYYY-MM-DD
- Decision: <what was chosen>
- Alternatives considered: <what the document, the base skills or the team also offered>
- Reason: <why this one, in the user's words when they gave one>
- Source: <architecture document and section | conflict between skills A and B | the user>
- Overrides a document: <no | yes, see overrides.md>
```
