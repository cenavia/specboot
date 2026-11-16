---
name: specboot-start
description: Use before planning, implementing or reviewing any feature or non-trivial change in a repository whose root contains an openspec/ folder (often a symlink). Sets up the OpenSpec workflow, loads the project standards and their order of authority, and enforces that specs and agent configuration never enter the code repository.
---

# specboot-start

This repository is driven by OpenSpec through the specboot harness. The `openspec/` folder at the project root is a link to a private spec store that is versioned separately. The code repository belongs to a client and must stay free of specs and agent configuration.

## 1. Check the setup and clear the gates

Run:

```bash
specboot doctor
```

Act on what it reports before anything else. These are gates, not notes:

| doctor reports | Do this first |
|----------------|---------------|
| not registered | Ask the user which client name to use, then `specboot init <client>`. |
| `openspec/` or `docs/` link missing (common in a new git worktree) | `specboot link` |
| skills declared in fronts.json are not installed | Show the user the printed `fix:` line and run it once they agree. |
| standards still empty | Write them first: the `specboot-prescribe` skill in mode greenfield, the `specboot-map` skill in mode brownfield. Do not plan or write code against empty standards. |
| **handoff due** | Real code now exists in a project still marked greenfield. Run the `specboot-map` skill as a verification pass, then `specboot mode brownfield`. Do not start another change until this is done. |
| docs/ placement not decided | Ask the user once before writing any planning or architecture document: `specboot docs local` (default: in the project, ignored by git), `client` or `store`. |
| store is behind the team | `specboot pull` before planning or proposing anything, so you work on the team's latest specs. |
| private files are staged | Unstage them. |

If `specboot` is not installed, say so and continue with plain OpenSpec only if `openspec/` exists.

## 2. Load the project standards

1. Read `openspec/standards/project-facts.md`: mode, fronts, architecture documents, overrides, checks, and where `docs/` lives.
2. If `openspec/standards/overrides.md` has rows, read it **before** any architecture document. Each row replaces a term of a document. Use the right-hand term everywhere and never reintroduce the left-hand one into a spec, a task or code, even though the document still says it.
3. Read `openspec/standards/base-standards.md`, then the standards document of each front the work touches. Read `data-model.md` and `api-spec.md` when the change touches data or endpoints, and `decisions.md` for what is closed and what is deferred.
4. If the documents say `status: mapped` or `status: prescribed`, tell the user the assumptions in `base-standards.md` section 9 are unconfirmed, and treat `[assumed]` rules as questions to verify. `[prescribed]` rules are binding even when no code shows them yet. `[prescribed, deferred ...]` rules are intentionally not implemented yet: do not implement them unless the change is the one that brings them in.
5. Work inside the folder of the front the change belongs to. Load a front's topic skills only when the task needs that topic.

Order of authority, highest first:

1. Agent rule files the client already versions in the repository.
2. Architecture documents the team provided, as amended by `overrides.md`.
3. Decisions in `decisions.md`.
4. The code (existing project) or the base skills of the front (new project), as written into `openspec/standards/`.
5. Generic technology skills, only for topics the standards do not cover. Say which rule came from one.

If a standards document disagrees with an architecture document and no override explains it, the standards are stale: follow the document, tell the user, and suggest rerunning the mapping skill. If you believe a project convention is harmful, say so to the user; do not silently deviate.

## 2c. Size the request before choosing a path

| The request is | Path |
|----------------|------|
| A new product, a new line of product, an epic, or a feature with several stories or open scope | The `specboot-plan` skill first (PRD, stories, backlog in `docs/planning/`), then one OpenSpec change per backlog item |
| One user story, even a vague one | `enrich-us` if needed, then `openspec-propose` |
| A small, obvious change | Directly, or `openspec-propose` if it touches behavior worth a spec |

When a backlog exists in `docs/planning/backlog.md`, take work from it in priority order and mark the item with the change name as it moves.

## 3. Where documents go

- OpenSpec artifacts (proposals, designs, specs, tasks, reports): `openspec/changes/<change>/`.
- Planning (PRD, backlog, user stories, brainstorms): `docs/planning/`.
- Architecture documents: `docs/architecture/`, then register them with `specboot doc add <file>` so they gain authority.
- Decision records: `docs/adr/` for the long form; the closed decision itself in `openspec/standards/decisions.md`.

`project-facts.md` says where `docs/` lives. `local` (the default): a real folder in the project, ignored by git; never commit it. `store`: a link to the private store; never commit it. `client`: part of the client repository; commit it with the code. `specboot sync` backs up and shares `local` and `store`. If placement is not decided, ask before writing there.

## 4. Write code the way the project does

- Before creating a file, open the reference files listed in the front's standards or two or three siblings in the same module, and mirror their structure, naming and imports.
- Do not introduce a library, pattern, folder or layer the standards do not show. If the change needs one, raise it in the OpenSpec design and get the user's agreement first.
- Do not reformat, rename or reorganize code outside the scope of the change.
- Run `specboot check` before marking a group of tasks complete. It runs every enabled entry of `openspec/standards/checks.json`, which is the single list of gates. A failing check is not done: fix the cause instead of disabling the rule, skipping the test or editing the check.
- To add or change a gate: a front's checks are edited in `fronts.json`; any other command is added to `checks.json`. Only with the user's agreement.
- If a check was already failing before your change (see the baseline in `base-standards.md` section 6), report it and leave it as it was.

## 5. Work through OpenSpec changes

Use the OpenSpec skills for every step. Do not improvise the artifacts.

| Step | Skill or command | Notes |
|------|------------------|-------|
| Refine the story | `enrich-us` | Optional; use when the request is vague |
| Explore | `openspec-explore` | Optional; use when the approach is unclear |
| Propose | `openspec-propose` | Creates the change in `openspec/changes/` |
| Implement | `openspec-apply-change` | Task by task, marking `tasks.md` |
| Verify | `specboot check` | Must pass before review |
| Review | `adversarial-review` | In a fresh session, different from the one that implemented |
| Refresh standards | see below | Mandatory when the change altered a convention |
| Archive | `openspec-archive-change` | Only after the review verdict allows it |
| Version the specs | `specboot sync -m "..."` | After proposing, after implementing, after archiving. It also brings in the team's changes |

### Standards refresh before archive

Before archiving, answer this question about the change: did it alter the folder layout, a route or public name, a naming or language rule, a library choice, or how a layer may be used?

- **No**: archive.
- **Yes**: the standards are now stale. Before archiving, update the affected standards documents (run the `specboot-map` skill, or edit the specific rules and their evidence), add a decision to `decisions.md`, and add rows to `overrides.md` for every term that now differs from an architecture document. Then archive. A change that renames modules or routes and leaves the standards describing the old names is not finished.

Before changing a module that has no spec yet under `openspec/specs/`, describe its current behavior in the proposal (what it does today, from the code and tests) so the change is written as a delta against reality.

Skip OpenSpec for small, obvious changes (a one-line fix, a log, a default value) and for throwaway spikes. Say that you are skipping it and why.

## 6. Keep the client repository clean

These rules are not negotiable:

- Never run `git add -A` or `git add .` in the code repository. Stage code files by path.
- Never stage or commit `openspec/`, `.claude/`, `.cursor/`, `.codex/`, `.opencode/`, `.agents/`, `.atl/`, `CLAUDE.md`, `AGENTS.md` or `GEMINI.md` unless the client repository already versions that exact file. The same applies to `docs/` when it is private.
- Never use `git add -f` on those paths, and never set `SPECBOOT_ALLOW=1` yourself. If the pre-commit guard blocks a commit, unstage the listed files.
- Write test reports and verification notes inside the change folder under `openspec/changes/<change>/`, not in the code tree.
- Keep commit messages and PR descriptions about the code change only. Do not reference OpenSpec change names or file paths under `openspec/`.

## Completion

End each work session by stating: the change name, which tasks are done, the result of `specboot check`, the review verdict if any, whether the standards needed a refresh, and whether `specboot sync` ran.
