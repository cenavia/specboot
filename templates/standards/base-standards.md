---
status: draft
mapped_from_commit:
---

# Base standards

<!--
How this file is written (remove nothing; the specboot-map skill follows it):
- Describe how THIS project works today. Do not prescribe improvements or generic best practice.
- One rule per bullet, ending with its tag and evidence:
    - Services never import from controllers. [observed] evidence: src/services/user.service.ts, src/services/order.service.ts
    - Feature branches are named feature/<ticket>. [assumed] evidence: 2 of 6 branches follow it
- [observed]: seen consistently in at least two places, or enforced by a config file.
- [assumed]: inferred from weak or mixed evidence. A person must confirm or correct it.
- [prescribed]: taken from a base skill of a front, not yet visible in the code. Evidence is the skill and its section:
    - Features never import from other features. [prescribed] evidence: skill react-architecture, "Screaming Architecture > Rules"
- If the project is inconsistent, say so and name the variant used in the most recent code.
- In a new project, describe the target the code must follow; in an existing one, describe what is there.
- status: draft (empty) -> mapped or prescribed (written by the agent) -> reviewed (confirmed by a person).
-->

## 1. Project overview

Purpose of the system, main users, and domain vocabulary (terms as they appear in the code).

## 2. Repository structure

Top-level folders and what each one owns. Where new code of each kind belongs.

## 3. Architecture

Layers or modules, allowed dependency directions, and how a request or event flows through them.

## 4. Conventions that apply everywhere

Language of code, comments and messages. Naming. Error handling. Logging. Configuration and secrets.

## 5. Git workflow

Branch naming, commit message format, pull request expectations, and hooks or CI gates that run.

## 6. Executable checks

`checks.json` in this folder is the single list of gates: `specboot check` runs every enabled entry and work is not done until they pass. It is kept in sync automatically. Checks a front declares in `fronts.json` appear there with source `front`; commands discovered in the repository appear with source `project`; anything added by hand has source `user`. Edit a front's checks in `fronts.json` and everything else in `checks.json`.

Record here the baseline (checks that already failed before any change) and the commands that cannot run locally.

## 7. Area standards

Links to the area documents in this folder and what each one covers.

## 8. Existing agent rules in the repository

Rule files the client already versions (for example `AGENTS.md` or `.cursor/rules/`). They take precedence over this document; summarize and link them, do not restate them differently.

## 9. Assumptions awaiting confirmation

Every `[assumed]` rule from all standards documents, collected as a checklist for the reviewer.
