---
name: specboot-map
description: Map an existing (brownfield) codebase into the project standards documents under openspec/standards/. Use when the user asks to map the project, document its conventions or standards, when `specboot doctor` reports standards as draft, after a large refactor, or before the first OpenSpec change in a repository.
---

# specboot-map

Write down how this project works **today** so every later change follows it. You are documenting, not improving: never record a generic best practice that the code does not show.

The output lives in `openspec/standards/`, which belongs to the private spec store. Nothing here is written into the code repository.

## Step 1 - Collect the facts

```bash
specboot map
```

This rewrites `openspec/standards/project-facts.md` (deterministic inventory from tracked files) and creates any missing standards documents from templates. Read `project-facts.md` completely before anything else.

## Step 2 - Read the rule sources first

For every file listed under "Existing rule sources":

1. **Existing agent rules** (`AGENTS.md`, `CLAUDE.md`, `.cursor/rules/`, Copilot instructions): read them fully. They are the client's own instructions and take precedence over anything you infer. Summarize and link them in `base-standards.md` section 8; never contradict them.
2. **Lint, format and type configs**: read the config itself and record the rules that shape how code is written (quotes, import order, strictness flags, max line length, banned patterns). Tag these `[observed]`: a config enforces them.
3. **CI workflows and git hooks**: record which commands gate a merge.
4. **Contributing guides, architecture docs, ADRs, PR templates**: record the rules they state.

## Step 3 - Read the code

For each directory under "Representative files to read per module":

1. Read the listed files, plus the module's tests when they exist.
2. Extract what repeats: layering, imports allowed between layers, naming, error handling, validation, data access, state management, test structure.
3. A pattern seen in two or more files is `[observed]`. A pattern seen once, or contradicted elsewhere, is `[assumed]`.
4. When two styles coexist, record both, say which one the most recently modified files use, and tag it `[assumed]`.

Read more files if a module is unclear. Do not guess from folder names alone.

## Step 3a - Compare with the architecture documents, if any

If `openspec/standards/overrides.md` has rows, read it before the documents. Each row replaces a term of a document: use the right-hand term in everything you write, and never copy the document's original term into the standards. When you find that the code uses a name different from the document's and a decision explains it, add the missing row to `overrides.md` instead of reporting drift.

`project-facts.md` may list "Architecture documents" the team provided. They describe the architecture the team intends; the code shows what exists. Both matter, and they can differ.

1. Read each document completely.
2. For every structural rule it states, check the code:
   - The code follows it: write the rule as `[observed]`, with the code paths as evidence and the document section noted.
   - The code does not show it yet: write it as `[prescribed] evidence: document <path>, "<section>"`. New code must follow it.
   - The code contradicts it: write the document's rule as `[prescribed]`, and list the contradiction under "Drift from the architecture document" in `base-standards.md` section 9, with the offending paths. Do not decide which side is right; the user chooses between fixing the code, migrating gradually, or correcting the document.
3. Until the user decides on a contradiction, new code follows the document and existing code is left as it is.
4. The documents outrank the base skills of every front. Skills fill only what neither the code nor the documents define.

## Step 3b - Use the declared fronts, if any

`project-facts.md` may list "Declared fronts" with base skills and decisions.

- **Existing project (mode brownfield):** the code is the authority. Read a front's base skills only to fill template sections the code does not answer, and tag those rules `[prescribed]` with the skill and section as evidence. Where the code and a base skill disagree, record what the code does and add the difference to the assumptions checklist for the user to decide.
- **Project that started as new (documents with `status: prescribed`, or `specboot map` reports "handoff due"):** this is the handoff verification pass. It is mandatory once real code exists. Besides the rule-by-rule check below:
  - Set `mapped_from_commit` in every document to the current commit.
  - Replace every "Not defined yet" that the code now answers. The development guide must end with the real setup, run and test commands; `api-spec.md` and `data-model.md` must list what the code now has.
  - Fill the "Reference files to imitate" tables with real files from the skeleton.
  - Rules tagged `[prescribed, deferred ...]` and listed under "Deferred items" in `decisions.md` are approved deferrals: leave them as they are and do not report them as drift.
  - When done, tell the user to run `specboot mode brownfield` (or run it yourself once they agree), then `specboot sync`.

  For each `[prescribed]` rule, look for it in the code:
  - The code follows it in two or more places: retag `[observed]` and replace the evidence with the file paths.
  - The code contradicts it: keep the rule, and list it under "Drift from the prescribed standards" in `base-standards.md` section 9 with both the rule and the offending paths. The user decides whether to fix the code or change the standard.
  - No code touches it yet: leave it `[prescribed]`.

  Do not change a rule to match drifted code on your own.
- If the facts report that a base skill changed since the standards were written, compare the skill with the standards, propose the differences to the user, and run `specboot map --accept` only after they decide.

## Step 4 - Write the documents

Fill every document in `openspec/standards/` whose frontmatter says `status: draft`, keeping the section headings from the template:

- `base-standards.md`: overview, structure, architecture, cross-cutting conventions, git workflow.
- `<area>-standards.md` (backend, frontend or code): the detail for that area, including the **Reference files to imitate** table.
- `development-guide.md`, `data-model.md`, `api-spec.md`: only what the repository shows. If a section does not apply, write "Not applicable: <reason>".

Rules for every statement:

- One rule per bullet, ending with its tag and evidence, for example:
  `- Routers only call services; they never touch the ORM. [observed] evidence: app/routers/users.py, app/routers/orders.py`
- Evidence is one or more real paths you actually read. No evidence, no rule.
- For the git workflow, use the "Recent commit subjects" and "Branches" facts. If commits follow no single format, say so.
- Write in the language the project uses for its documentation.

Then set `status: mapped` and `mapped_from_commit: <output of git rev-parse --short HEAD>` in each document you filled.

## Step 5 - Review the executable checks

`openspec/standards/checks.json` is the single list `specboot check` runs. `specboot map` keeps it in sync: entries with source `front` come from `fronts.json`, entries with source `project` are discovered from the project's scripts and configs, and entries with source `user` were added by hand. Run `specboot check --list` to see them, including disabled ones.

- Compare the list with the lint, type-check and test commands in scripts, Makefiles and CI. Add any command CI runs that is missing, directly to `checks.json` with `"source": "user"`.
- A front's own checks are edited in `fronts.json`, not here.
- Commands must go through the project's environment manager when it has one (`uv run`, `poetry run`, `pnpm run`).
- An entry marked `"disabled": true` is an alternative for a folder that already has checks. Enable it only if it adds a real gate; do not delete it, or the next sync adds it again.
- For commands that cannot run locally (they need secrets or deployed services), set `"disabled": true` and note them in `base-standards.md` section 6.
- Run `specboot check` once. Record the baseline: if a check already fails before any change, write that in section 6 so a later failure is not blamed on new work. Do not fix pre-existing failures as part of mapping.

## Step 6 - Hand over for review

1. Collect every `[assumed]` rule into `base-standards.md` section 9 as a checklist.
2. Tell the user: how many rules are observed, how many are assumed, which checks exist and their baseline result, and anything the code could not answer (team habits that are not written anywhere).
3. Ask the user to confirm or correct the assumptions. Apply their corrections, retag confirmed rules `[observed]`, and only then set `status: reviewed`. Never set `reviewed` on your own.
4. Run `specboot sync -m "standards: map project conventions"`.

## Guardrails

- Do not create, edit or stage any file in the code repository during mapping.
- Do not copy secrets, tokens or personal data from config or environment files into the standards.
- Do not overwrite a document whose status is `reviewed` without asking; propose the differences instead.
- If the repository is too large to read in one pass, map one area at a time and say which areas remain `draft`.
