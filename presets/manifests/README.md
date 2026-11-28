# Preset manifests

A **manifest** tells SpecBoot how to turn an installed skill plugin into a `fronts.json` for `specboot init`.

## File names SpecBoot loads

| Location | Pattern |
|----------|---------|
| This folder (harness) | `*.specboot.preset.json` |
| Any registered skill source | `specboot.preset.json` or `*.specboot.preset.json` |

Plugin manifests **override** harness ones for the same `technology`.

## Stack shape (Go, React, Python, …)

```json
{
  "technology": "go",
  "aliases": ["golang"],
  "skillPrefix": "go-",
  "front": "backend",
  "path": "backend",
  "core": ["go-project-layout", "go-modules", "go-idiomatic", "go-testing", "go-quality-gates"],
  "topics": "*",
  "checks": ["go vet ./...", "go test ./..."]
}
```

## Topics-pack shape (ai-dev and similar)

```json
{
  "technology": "ai",
  "kind": "topics-pack",
  "attachTo": "backend",
  "topicPrefixes": ["langgraph-", "langchain-", "rag-", "llm-"],
  "topics": ["mcp-builder"]
}
```

Does **not** create a front. Attach with `--topics-from ai` or by listing `ai` in the composite stack.

## Commands (CRUD)

```bash
specboot preset list
specboot preset create go,python,java,react --topics-from ai --attach-to python
specboot preset show go-java-python-react-with-ai
specboot preset update go,python,java,react --topics-from ai --attach-to python
specboot preset attach go-react --topics-from ai --attach-to backend
specboot preset remove go-java-python-react-with-ai
specboot init acme --stack go,python,java,react,ai --attach-to python
```

Full guide: [GUIA-PRESETS.md](../../GUIA-PRESETS.md).
