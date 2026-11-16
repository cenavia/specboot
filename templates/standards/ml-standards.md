---
status: draft
area: {{AREA}}
mapped_from_commit:
---

# {{AREA_TITLE}} standards

<!-- Same writing rules as base-standards.md: one rule per bullet, tag [observed], [prescribed] or [assumed], cite evidence. -->

## 1. Technology stack

Language and runtime versions, frameworks and key libraries (training, data processing, tracking, serving).

## 2. Folder layout

Where data, notebooks, pipelines, training code, evaluation code, models and reports live. Where each new artifact must be created.

## 3. Boundary between exploration and production code

What may live in notebooks, what must be moved into modules, and how a notebook result is promoted to a pipeline.

## 4. Data

Sources, access, storage formats, versioning, splits (train, validation, test) and how leakage is prevented. What data must never be committed.

## 5. Reproducibility

Seeds, environment pinning, configuration files, experiment tracking, and how a past result is reproduced.

## 6. Training and pipelines

Structure of a pipeline or training run, configuration, checkpoints and resource use.

## 7. Evaluation

Metrics, baselines, evaluation datasets, acceptance thresholds and how results are reported.

## 8. Models and artifacts

Naming, versioning, registry or storage, and export formats.

## 9. Testing

What is unit-tested (transforms, features, metrics), data validation checks, and smoke tests for pipelines.

## 10. Commands

Commands to set up, lint, test, train, evaluate and serve.

## 11. Reference files to imitate

| Kind | Reference files |
|------|-----------------|

## 12. Do not

Practices this project forbids (for example, tuning on the test set or committing raw data).
