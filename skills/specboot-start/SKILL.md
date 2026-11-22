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

**Binding rule:** when the user (or you) invokes an OpenSpec command / skill, also load every **harness skill** marked **must** for that command. Load **when** skills only if their condition holds. Do not run the OpenSpec skill alone when the table names SpecBoot skills.

Detect the OpenSpec profile once per session:

```bash
openspec config get profile
openspec config get workflows
```

- Profile `core` (exactly the six core workflows) → **§5b** core rows only.
- Any other selection (`custom` / extended) → **§5b** core rows **plus** extended rows.

### 5a. Harness skill inventory (what each is for)

| Harness skill | Role | Binds to OpenSpec? |
|---------------|------|--------------------|
| `specboot-start` | Gates, standards, profile, this binding table | Session start; `onboard` |
| `specboot-plan` | PRD → stories → backlog before any change | Before `propose` / `new` / `ff` when epic/product |
| `specboot-prescribe` | Write standards (greenfield) | **Lifecycle** (before OpenSpec coding), not a change command |
| `specboot-map` | Map/verify standards (brownfield / handoff / refresh) | Before first change if draft; **before `archive`** if conventions changed |
| `enrich-us` | Turn a vague story into an implementation-ready ticket | Before `propose`/`new`/`ff`; optional on `explore` |
| `openspec-sync-specs` | Harness copy of OpenSpec sync (wins over generated) | `sync` |
| `using-git-worktrees` | Isolated worktree for feature work | Before/during `apply` when isolation is needed; **must** under `factory` |
| `work-unit-commits` | Split delivery into reviewable commits | After `apply` (must) |
| `chained-pr` | Stack PRs when ~400+ lines | After `apply` when over budget |
| `branch-pr` | Open/prepare PR per **destination** policy | After `apply` when opening a PR |
| `commit` | Execute commit + push + PR + Jira transitions | After `apply` when the team uses the Jira/PR packaging path (with or after `work-unit-commits`) |
| `update-docs` | Update technical docs for what was implemented | After `apply` when docs standards require it |
| `playwright-qa-scenarios` | E2E case catalog + suite from ACs | Catalog: with `enrich-us` if FE; suite: during `apply` E2E tasks |
| `playwright-skill` | Playwright practice for writing/debugging E2E | With `playwright-qa-scenarios` suite / FE test tasks in `apply` |
| `adversarial-review` | Red-team change vs proposal/specs/tasks | Quality gate (§5c); also inside `factory` before verify loops |
| `mutation-testing` | Would tests catch a small deliberate bug? | Inside quality gate with / after `adversarial-review` when tests are in scope |
| `judgment-day` | Juicio final — dual blind review | Quality gate (§5c) after `adversarial-review` |
| `code-auditing` | Broad code-quality / security audit | Quality gate **when** high-risk (auth, payments, data, security) or user asks |
| `show-spec-working` | Live demo that the change works | After `apply` or after quality gate when user asks to see it working |
| `quick-change` | Informal ask → Jira + branch + OpenSpec change | **Entry** when no Jira and no explicit `openspec-*`; then follows §5b |
| `factory` | Parallel worktrees running full OpenSpec pipeline | **Entry** for parallel/Jira-queue work; each unit runs §5b through quality gate |
| `explain` | Teach concepts behind a question | Orthogonal — never blocks OpenSpec |
| `meta-prompt` | Rewrite prompts | Orthogonal — harness/meta |
| `writing-skills` | Author/improve skills | Orthogonal — harness/meta |
| `sync-agent-symlinks` | Sync skill symlinks across agents | Orthogonal — after skill install changes |

### 5b. Command → skills bindings

#### Core OpenSpec commands (always)

| OpenSpec command | OpenSpec skill | Harness skills |
|------------------|----------------|----------------|
| *(session start)* | — | **must:** `specboot-start` (+ `specboot doctor`). If standards empty: `specboot-prescribe` (greenfield) or `specboot-map` (brownfield). If handoff due: `specboot-map` then `specboot mode brownfield`. |
| `explore` / `opsx explore` | `openspec-explore` | **when** vague story: `enrich-us`. **when** user needs concepts: `explain`. |
| `propose` / `opsx propose` | `openspec-propose` | **when** epic/product: `specboot-plan` first. **when** vague story: `enrich-us` first. **when** FE behavior: `playwright-qa-scenarios` (catalog) after enrich. |
| `apply` / `opsx apply` | `openspec-apply-change` | **must:** `ponytail` (minimal necessary diff). **when** isolation needed: `using-git-worktrees`. **when** FE E2E tasks: `playwright-qa-scenarios` (suite) + `playwright-skill`. Prefer **codegraph** if the project is indexed. **must** after code lands: `work-unit-commits`. **when** ~400+ lines: `chained-pr`. **when** opening PR: `branch-pr`. **when** Jira packaging required: `commit`. **when** docs standards require it: `update-docs`. **when** user asks demo: `show-spec-working`. |
| `update` / `opsx update` | `openspec-update-change` | — (planning artifacts only). |
| `sync` / `opsx sync` | `openspec-sync-specs` | Use the harness skill of that name (same intent as OpenSpec sync). |
| `archive` / `opsx archive` | `openspec-archive-change` | **must:** quality gate §5c first. **when** conventions changed: `specboot-map` (+ overrides/decisions) before archive. **must** after: `specboot sync` (store). |

Core has no `verify` command → §5c is still **mandatory before every archive**.

#### Extended-only OpenSpec commands

| OpenSpec command | OpenSpec skill | Harness skills |
|------------------|----------------|----------------|
| `new` / `opsx new` | `openspec-new-change` | Same pre-steps as `propose` (`specboot-plan` / `enrich-us` / FE catalog when applicable). |
| `continue` / `opsx continue` | `openspec-continue-change` | — (next planning artifact only). |
| `ff` / `opsx ff` | `openspec-ff-change` | Same pre-steps as `propose`. |
| **`verify` / `opsx verify`** | **`openspec-verify-change`** | **must:** full quality gate §5c (named verify entry). **when** user asks demo after green gate: `show-spec-working`. |
| `bulk-archive` / `opsx bulk-archive` | `openspec-bulk-archive-change` | **must:** §5c per change (or confirm batch scope). Then bulk archive; then `specboot sync`. |
| `onboard` / `opsx onboard` | `openspec-onboard` | **must:** `specboot-start` first so gates/standards still apply; then follow §5b for each step of the onboarded change. |

Propose paths in extended: `propose` **or** `new`→`continue`… **or** `ff`. One path per change.

#### Harness entry commands (not OpenSpec, but they drive OpenSpec)

| Entry | What it does | Then |
|-------|--------------|------|
| `quick-change` | Informal request → ticket/branch/change | Run the matching §5b path (`propose`/`apply`/… through §5c). |
| `factory` | Parallel units in worktrees | Each unit: `using-git-worktrees` + full §5b through §5c (`adversarial-review` before verify loops as factory already requires). |

### 5c. Quality gate (verify / pre-archive) — juicio final

Run **in this order**. Do not archive until the gate completes:

1. **`openspec-verify-change`** — only when the profile includes `verify` (extended). On core, skip and continue.
2. **`specboot check`** — `checks.json` must pass (or report documented baseline failures).
3. **`adversarial-review`** — fresh session (not the implementer); red-team vs proposal/specs/tasks.
4. **`mutation-testing`** — **when** the change includes or depends on tests; strengthen survivors before proceeding.
5. **`code-auditing`** — **when** high-risk surface (auth, payments, PII, security, irreversible data) or the user asks.
6. **`judgment-day`** — juicio final; dual blind review; terminal `APPROVED` or `ESCALATED`. Do not archive on `ESCALATED` without an explicit human decision.

Announce at the start: active profile (core/extended), and that `adversarial-review` + `judgment-day` are both required.

### Standards refresh before archive

Before archiving, answer this question about the change: did it alter the folder layout, a route or public name, a naming or language rule, a library choice, or how a layer may be used?

- **No**: proceed with §5c then archive.
- **Yes**: standards are stale. Run `specboot-map` (or edit rules + evidence), update `decisions.md` / `overrides.md` as needed, then §5c and archive.

Before changing a module that has no spec yet under `openspec/specs/`, describe its current behavior in the proposal (from code and tests) so the change is a delta against reality.

Skip OpenSpec for small, obvious changes (one-line fix, log, default) and throwaway spikes — say so. Still run `specboot check` when code changed; run §5c only when the user asks or risk is high.

## 6. Keep the client repository clean

These rules are not negotiable:

- Never run `git add -A` or `git add .` in the code repository. Stage code files by path.
- Never stage or commit `openspec/`, `.claude/`, `.cursor/`, `.codex/`, `.opencode/`, `.agents/`, `.atl/`, `CLAUDE.md`, `AGENTS.md` or `GEMINI.md` unless the client repository already versions that exact file. The same applies to `docs/` when it is private.
- Never use `git add -f` on those paths, and never set `SPECBOOT_ALLOW=1` yourself. If the pre-commit guard blocks a commit, unstage the listed files.
- Write test reports and verification notes inside the change folder under `openspec/changes/<change>/`, not in the code tree.
- Keep commit messages and PR descriptions about the code change only. Do not reference OpenSpec change names or file paths under `openspec/`.

## Completion

End each work session by stating: the change name, which tasks are done, the OpenSpec profile (core/extended), which §5b bindings ran, the result of `specboot check`, `adversarial-review` / `mutation-testing` / `code-auditing` outcomes if run, the `judgment-day` verdict (`APPROVED` / `ESCALATED` / not run), whether standards needed a refresh, and whether `specboot sync` ran.
