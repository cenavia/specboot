# Overrides to the architecture documents

An architecture document is not rewritten every time the team decides something different. When a later decision renames or replaces something a document says, the change is recorded here, and this table wins over the document.

How to use it:

- Read this table BEFORE any architecture document.
- Wherever a document uses a term in the left column, use the right column instead in standards, specs, tasks and code.
- Never copy a left-column term from a document into a new artifact.
- Everything the table does not mention still follows the document.
- Add a row whenever a decision in `decisions.md` contradicts an architecture document. Each row names that decision.

Kinds of entry: `module`, `route`, `entity`, `field`, `folder`, `language`, `library`, `rule`.

| Document term | Use instead | Kind | Decision | Document and section |
|---------------|-------------|------|----------|----------------------|
