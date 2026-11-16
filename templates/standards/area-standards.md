---
status: draft
area: {{AREA}}
mapped_from_commit:
---

# {{AREA_TITLE}} standards

<!-- Same writing rules as base-standards.md: describe what exists, one rule per bullet, tag [observed] or [assumed], cite evidence paths. -->

## 1. Technology stack

Language and runtime versions, framework, and the key libraries actually used (with the manifest they come from).

## 2. Folder layout

Where each kind of file lives in this area. Where a new one of each kind must be created.

## 3. Layers and responsibilities

Each layer, what it may and may not do, and what it may import.

## 4. Naming

Files, classes, functions, variables, routes, database objects and tests.

## 5. Recurring patterns

Validation, error handling, data access, state management, dependency injection, authentication. Describe the pattern the code uses, not an ideal one.

## 6. Testing

Framework, where tests live, naming, what is mocked, fixtures, and coverage thresholds if a config enforces them.

## 7. Configuration

Environment variables, config files, and how secrets are handled.

## 8. Commands

Run, build, lint, type-check and test commands for this area.

## 9. Reference files to imitate

Two or three real files per kind of artifact that best represent the current conventions. When creating a new file, start from these.

| Kind | Reference files |
|------|-----------------|

## 10. Do not

Things the codebase visibly avoids, or that a config forbids.
