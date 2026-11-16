---
name: specboot-prescribe
description: Write the project standards of a NEW (greenfield) project from the team's architecture documents and the base skills declared for each front (backend, frontend, mobile, ai, ml, data-science). Use when `specboot doctor` or `specboot map` reports mode greenfield with empty standards, when the user asks to define the architecture or standards of a new project, or when a front or an architecture document is added.
---

# specboot-prescribe

A new project has no code to learn from, so its standards are **prescribed**: taken from the architecture documents the team wrote and from the skills chosen for each front, then frozen into `openspec/standards/`. From then on the standards, not the skills, are the rule for this project.

Order of authority, highest first:

1. Agent rule files the client already versions in its repository.
2. Architecture documents, as amended by `openspec/standards/overrides.md`.
3. Decisions recorded in `decisions.md` and `fronts.json`.
4. Base skills of each front, in the order listed.
5. Generic knowledge. Anything taken from here is tagged `[assumed]`.

Everything is written to the private spec store. Nothing here goes into the code repository.

## Step 1 - Collect the facts and unblock the setup

```bash
specboot map
```

Read `openspec/standards/project-facts.md` completely. Then clear every blocker below before reading any skill. Each has a command; do not search the filesystem by hand.

| What the output says | What to do |
|----------------------|------------|
| Skills declared in fronts.json are not installed | The output lists where it found them and prints `fix: specboot source add <folder> && specboot install`. Show that line to the user, run it once they agree, and rerun `specboot map`. If nothing was found, ask the user where their skills folder is. |
| No fronts are declared | Offer to write `openspec/standards/fronts.json` (format below, or a file from `presets/` in the harness), then rerun `specboot map`. |
| docs/ placement not decided | Ask the user once where `docs/` (planning, architecture, ADRs) lives: `specboot docs local` (default: in the project, ignored by git, backed up to the store), `specboot docs client` (versioned with the code, visible to the client team) or `specboot docs store` (a link to the store). Run the command they choose. |
| The mode is brownfield | Stop. Use the `specboot-map` skill instead. |
| No PRD in `docs/planning/` and the project facts list planning skills | Suggest running the `specboot-plan` skill first: the standards' overview and scope come from the PRD. Continue without it only if the user says so. |

### fronts.json format

```json
{
  "mode": "greenfield",
  "docs": { "placement": "store" },
  "fronts": {
    "backend": {
      "path": "backend",
      "core": ["skill-that-defines-structure", "skill-that-defines-style", "skill-that-defines-tests"],
      "topics": ["skills-loaded-only-when-a-task-needs-them"],
      "decisions": { "architecture": "the alternative chosen where a skill offers several" },
      "checks": ["lint command", "type-check command", "test command"]
    }
  }
}
```

An agentic layer that runs inside the backend (same deployable) is **not** a separate front: put its skills in `backend.topics`. Declare an `ai` front only when the agents are their own deployable, with their own folder and checks.

## Step 2 - Read the sources in order of authority

1. **`openspec/standards/overrides.md`**, if it has rows. Every row replaces a term of an architecture document. Keep the table at hand: whenever a document uses a left-column term, write the right-column one. Never copy a document's original term into standards, specs or code once it has an override.
2. **Every architecture document** listed under "Architecture documents", completely.
3. **Every base skill** of each front, fully, including the reference files it points to when they define structure, layers, naming or testing. Do not read topic skills now.

How the documents bind:

- A rule a document states is the standard, even when a base skill recommends something else.
- A document that applies to one front governs that front; one that applies to the whole project governs all.
- If two documents contradict each other, or a document is ambiguous on something structural, ask the user. Do not resolve it with a skill.
- If a document describes something no declared front covers, tell the user and offer to add the front.

## Step 3 - Build the decision table before asking anything

Write the table below in your working notes first. It decides what you may ask.

| Topic | Closed by | Value | Ask the user? |
|-------|-----------|-------|---------------|

Fill it row by row for every structural topic: architecture style, folder layout, layer rules, where tests live, naming, language of code and comments, state and data libraries, test stack, package manager, git workflow.

1. **Closed by an architecture document.** Record the document and section. It is closed: do not ask, do not offer the skill's alternatives. Example: the document fixes a modular monolith with a parallel `tests/` tree, so backend layout and test location are closed even if a base skill presents three layouts.
2. **Closed by `overrides.md` or `fronts.json` decisions.** Closed. Do not ask.
3. **Two base skills disagree** (for example one skill's sample tree conflicts with the architecture another skill prescribes). This is always an explicit decision: never merge the two silently and never let list order decide something structural without telling the user. Ask, naming both skills and what each implies.
4. **One base skill offers alternatives** and nothing above closes it. Ask, giving the skill's own default if it names one.
5. **No source covers it.** Ask only if it is structural; otherwise assume the most conventional option and tag it `[assumed]`.

Then ask the user every open row of a front together, in one message. Show the closed rows too, as "closed by `<document>` section `<section>`", so the user can see nothing was skipped and can object.

Record each decision in `openspec/standards/decisions.md` using its entry format, and add it to the front's `decisions` in `fronts.json`. If a decision contradicts an architecture document (the user chooses English identifiers while the document names modules in Spanish, for instance), also add one row per affected term to `overrides.md`.

### The skeleton policy is one of the decisions

Ask it explicitly and record it in the "Skeleton policy" section of `decisions.md`:

- **Full declared stack**: the first change installs and configures everything the standards prescribe.
- **Minimum runnable**: the first change installs only what every declared check needs to run and pass. List everything else the standards prescribe under "Deferred items" with what triggers it.

## Step 4 - Write the standards

Fill every document with `status: draft`, keeping the template headings:

- `<front>-standards.md` for each front.
- `base-standards.md`: overview (from the user, or from the PRD in `docs/planning/` if one exists), repository structure across fronts, cross-cutting conventions, git workflow.
- `development-guide.md`, `data-model.md`, `api-spec.md`: only what is already decided. Otherwise write "Not defined yet: will be written by the change that introduces it".

Rules for every statement:

- One rule per bullet, ending with its tag and evidence:
  `- Routers only call services; they never touch the ORM. [prescribed] evidence: document docs/architecture/architecture.md, "Backend layers"`
  `- Features never import from other features. [prescribed] evidence: skill react-architecture, "Screaming Architecture > Rules"`
- `[prescribed]`: stated by an architecture document, a recorded decision or a base skill. Name which one.
- `[prescribed, deferred D-0xx]`: prescribed but listed under "Deferred items" by the skeleton policy.
- `[assumed]`: no source covers it and you filled the gap. Keep these to what the template requires.
- Apply `overrides.md` to every identifier, route and name you take from a document.
- Copy the concrete parts a developer needs: the folder tree, the layer rules, the naming table. Reference the skill section instead of copying tutorials or code samples.

Then set `status: prescribed` in each document you filled.

## Step 5 - Make the rules executable

`openspec/standards/checks.json` is the single list `specboot check` runs. Checks a front declares in `fronts.json` are copied into it automatically; nothing else needs to be kept in sync by hand.

1. For each front, compare its `checks` in `fronts.json` with the lint, type and test commands the documents and base skills name. Propose the missing ones to the user and add the accepted ones to `fronts.json`.
2. Write each command the way the project will run it: through the environment manager the documents or decisions fix (`uv run pytest`, `poetry run pytest`, `pnpm run lint`), never as a bare tool name when a manager is chosen.
3. Run `specboot map` so `checks.json`, the facts and the OpenSpec configuration reflect the fronts. Confirm with `specboot check --list`.
4. Checks cannot pass yet: the folders do not exist. `specboot check` reports them as skipped until the skeleton is created. That is expected.

## Step 6 - Report, and record the skill gaps

1. For every `[assumed]` rule that exists because no base skill, document or decision covered it, add a row to `openspec/standards/skill-gaps.md`: front, the skill that should have covered it, the missing topic, what was assumed. This file is what the skill maintainer reads later.
2. Collect every `[assumed]` rule in `base-standards.md` section 9.
3. Tell the user, per front: decisions closed by a document (with section), decisions they took, decisions forced by a conflict between skills, the skeleton policy and deferred items, the checks declared, and the gaps recorded.
4. Ask the user to confirm or correct. Apply corrections. Only the user sets `status: reviewed`.
5. Run `specboot sync -m "standards: prescribe project architecture"`.

## Step 7 - Propose the skeleton as the first change

Once the standards are reviewed, propose the first OpenSpec change with `openspec-propose`: the project skeleton. Following the standards and the skeleton policy exactly, it creates:

- The folder structure of each front.
- The linter, formatter, type-checker and test configuration, so every declared check runs.
- The CI workflow that runs those same commands.
- One minimal vertical example per front (for instance a health endpoint with its test) that later files can imitate.
- Nothing that the skeleton policy lists as deferred.

Also raise this with the user and act only on their answer: the ignore rules that hide `openspec/` (and a private `docs/`) are local to this clone. A teammate who clones the repository is not protected by them. Recommend adding `/openspec` (and `/docs` when it is private) to the committed `.gitignore` as part of the skeleton, and say plainly that this makes the folder name visible in the client repository. If they agree, include it in the skeleton tasks or run `specboot init <client> --gitignore`.

Lint, test and CI configuration belong to the code repository and are committed there. Standards, specs and agent files stay in the store.

The skeleton change is done when `specboot check` runs every enabled check and all pass.

## Step 8 - Handoff to brownfield (mandatory, not optional)

A project stops being new as soon as real code is tracked under its fronts. `specboot map` and `specboot doctor` then report **handoff due**. When they do, before the next change:

1. Run the `specboot-map` skill as a verification pass. It retags what the code confirms as `[observed]`, sets `mapped_from_commit`, replaces every "Not defined yet" that the code now answers (the development guide above all), fills the "Reference files to imitate" tables with the skeleton's real files, and reports drift.
2. Run `specboot mode brownfield`.
3. Run `specboot sync -m "standards: verify against skeleton, switch to brownfield"`.

Do not start a second change while handoff is due.

## Guardrails

- Do not invent an architecture when a front has neither a document nor base skills. Say the front has no definition and ask the user for a document, a skill or a decision.
- Do not overwrite a document whose status is `reviewed` without asking.
- Do not create application code while prescribing. The skeleton is a separate change that goes through OpenSpec.
- Do not ask the user something a registered architecture document already answers.
