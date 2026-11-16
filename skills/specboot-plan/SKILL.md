---
name: specboot-plan
description: Plan a new product, an epic or a feature large enough to need a PRD, before any OpenSpec change. Runs ideation, PRD, user stories, prioritized backlog and epics with the project's planning skills, writes everything to docs/planning/, and hands each ticket to OpenSpec. Use in new and existing projects when the request is bigger than one user story.
---

# specboot-plan

Product definition comes before OpenSpec. OpenSpec manages changes to something that exists; it does not decide what to build. This skill produces the chain **PRD → epics → user stories → prioritized backlog**, and then each backlog item becomes one OpenSpec change.

It works in Claude Code, Cursor, Codex and opencode. It uses the planning skills listed in `openspec/standards/project-facts.md` (section "Planning") for the content of each phase, and it replaces the `/plan:pipeline` command, which only exists in Claude Code.

## When to use it, and when not

| Request | Path |
|---------|------|
| A new product, a new line of product, or "what should we build" | This skill, from phase 1 |
| An epic or a feature that needs a PRD (several stories, several fronts, open scope) | This skill, from phase 2 |
| One user story, possibly vague | Not this skill: `enrich-us`, then `openspec-propose` |
| A small, obvious change | Not this skill: directly, or `openspec-propose` |

If unsure, ask the user which of these it is. Do not run the full pipeline for a single story.

## Step 0 - Setup

1. Read `openspec/standards/project-facts.md`: project mode, the planning skills and their paths, the output folder (default `docs/planning/`), and where `docs/` lives.
2. If a planning skill is reported NOT FOUND, tell the user it is missing and continue with the phases you can do; never invent its template.
3. Read the existing planning folder. If a PRD, a backlog or stories already exist, start from the phase they leave open instead of redoing earlier ones.
4. `docs/` is private when its placement is `local` or `store`: never stage or commit it to the code repository. When the placement is `client`, the files are committed with the code like any other document.

## Where every artifact goes

All paths are relative to the output folder (default `docs/planning/`). This overrides any default path a planning skill names; for example `breakdown-feature-prd` mentions `docs/ways-of-work/plan/...`: use the paths below instead.

| Artifact | Path |
|----------|------|
| Ideation (vision, keys to success, differentiators) | `ideation.md` |
| Product PRD | `prd.md` |
| Feature PRD (for an epic or feature) | `<epic-slug>/<feature-slug>/prd.md` |
| User stories with acceptance criteria | `<epic-slug>/user-stories.md` |
| Epic (scope, diagram, dependencies) | `<epic-slug>/epic.md` |
| Prioritized backlog (P1, P2, P3) | `backlog.md` |

Slugs are lowercase words joined by hyphens. Follow `openspec/standards/overrides.md` for every name taken from an architecture document.

## Greenfield path (mode greenfield)

1. **Ideation** with `product-ideation-brainstorm`. Collect what the skill marks as required before writing; market research only if the user agrees.
2. **Product PRD** with `breakdown-feature-prd` (or `project-manager`, PRD analysis): goals, personas, scope, non-goals, functional and non-functional requirements, success metrics.
3. **User stories** with `project-manager`: grouped by epic, each with acceptance criteria written as observable business rules, not as endpoints or fields.
4. **Backlog** with `project-manager`: prioritized, each item one story, with its epic.
5. **Epics** with `project-manager`: scope, dependencies between epics, and a diagram when the skill provides one.
6. Stop there. Do **not** generate technical tickets or task lists: in this project the OpenSpec change is the ticket, and its `tasks.md` holds the tasks.

Then tell the user the next steps, in this order: the `specboot-prescribe` skill (it reads `prd.md` for the project overview), review of the standards, the skeleton change, and then the backlog item by item.

## Brownfield path (mode brownfield)

The product already exists. Plan the new part against what is there.

1. Skip ideation unless the user is opening a new line of product.
2. **Before the feature PRD**, read what exists: `openspec/specs/` (current behavior), `openspec/standards/` (how it is built), `api-spec.md` and `data-model.md`. Record in the PRD, under a "Current state" heading, what the feature changes and what it must not break.
3. **Feature PRD** with `breakdown-feature-prd`, saved at `<epic-slug>/<feature-slug>/prd.md`.
4. **User stories** and **backlog items** with `project-manager`, appended to the existing `backlog.md` (do not rewrite items already there; mark their status instead).
5. Stop before technical tickets, as above.

## Hand-off to OpenSpec

Each backlog item becomes exactly one OpenSpec change:

1. Take the highest-priority item that is not done.
2. If its story is vague, run `enrich-us` on it.
3. Run `openspec-propose` with: the story and its acceptance criteria, a link to the feature PRD, and the item id. The change name should echo the story (`add-invoice-export`, not `ticket-12`).
4. In `backlog.md`, mark the item with the change name and status: `proposed`, `in progress`, `archived`.
5. After the change is archived, mark the item `done`.

Acceptance criteria in the story become scenarios in the change's specs. Keep them as business rules; the technical detail belongs to the change's design.

## Completion

When planning ends, tell the user: which phases ran, which files were written or updated, how many backlog items exist and their priorities, which planning skills were missing if any, and the item you suggest starting with. Then run:

```bash
specboot sync -m "planning: <what was planned>"
```

## Guardrails

- Never commit planning files to the code repository unless `docs/` placement is `client`.
- Never skip the user's confirmation of the PRD scope before writing stories: a wrong scope multiplies into every story.
- Never create OpenSpec changes for the whole backlog at once. One item at a time.
- If a planning skill's instructions conflict with this skill on paths or on the stopping point, this skill wins; on content and templates, the planning skill wins.
