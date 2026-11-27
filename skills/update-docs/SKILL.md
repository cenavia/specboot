---
name: update-docs
description: Identify and update required technical documentation based on implemented changes.
author: LIDR.co
version: 1.0.0
---
# update-docs Skill

Use it when this workflow is required in the project.

## Instructions

1. Read `openspec/standards/project-facts.md` to learn where `docs/` lives (`local`, `store` or `client`) and whether it may be committed.
2. If the project has its own `docs/documentation-standards.md`, follow it first.
3. Update only what the change made stale:
   - endpoints or contracts → `openspec/standards/api-spec.md`
   - entities, tables or fields → `openspec/standards/data-model.md`
   - setup, commands, tests or environments → `openspec/standards/development-guide.md`
   - a closed decision → `openspec/standards/decisions.md` (long form in `docs/adr/`)
   - user-facing or architecture documents → the files under `docs/` or the README that describe the changed behavior
4. Report which files were updated, and say so when nothing needed a change.
