# Configuración: frentes y checks

[← README](../README.md)

## Frentes

`fronts.json` declara las partes del proyecto y qué skills las definen:

```json
{
  "mode": "greenfield",
  "docs": { "placement": "store" },
  "fronts": {
    "backend": {
      "path": "backend",
      "core": ["python-project-structure", "fastapi-templates", "python-code-style", "python-testing-patterns"],
      "topics": ["python-observability", "langgraph-fundamentals"],
      "decisions": { "architecture": "monolito modular" },
      "checks": ["uv run ruff check .", "uv run mypy .", "uv run pytest"]
    }
  }
}
```

| Campo | Para qué sirve |
|-------|----------------|
| `path` | Carpeta del frente |
| `core` | Skills base: de ellas salen los estándares. Si dos se contradicen, el agente te obliga a decidir |
| `topics` | Skills de tema: se cargan solo cuando una tarea las necesita |
| `decisions` | Lo ya decidido. Queda cerrado |
| `checks` | Comandos de verificación del frente |

**Capa agéntica dentro del backend.** Si los agentes corren en el mismo desplegable que el backend, no declares un frente `ai`: pon sus skills (LangGraph, RAG, evaluación) en `backend.topics`. Hay un preset: `presets/fronts.fastapi-react-agentic.json`. Declara un frente `ai` solo cuando los agentes sean un desplegable propio, con su carpeta y sus checks.

Los frentes de ML y ciencia de datos usan otra plantilla (datos, reproducibilidad, evaluación, notebooks frente a código de producción).

## Presets por tecnología

Para no editar `fronts.json` a mano en cada greenfield, el plugin puede llevar un `specboot.preset.json`. SpecBoot lo materializa con:

```bash
specboot preset create go
specboot init <cliente> --stack go
```

`topics: "*"` expande a todas las skills instaladas con el `skillPrefix` (por defecto `<technology>-`) que no estén en `core`. Guía completa: [GUIA-PRESETS.md](../GUIA-PRESETS.md). Manifestos de ejemplo: [presets/manifests/](../presets/manifests/).

## Checks: una sola lista

`openspec/standards/checks.json` es lo único que ejecuta `specboot check`. Se sincroniza sola en cada `map`, `check` y `doctor`:

| `source` | De dónde sale | Dónde se edita |
|----------|---------------|----------------|
| `front` | `checks` de cada frente en `fronts.json` | En `fronts.json` |
| `project` | Scripts y configuración descubiertos en el repositorio | Se añaden solos; desactívalos con `"disabled": true` |
| `user` | Añadidos a mano | En `checks.json` |

- El primer dueño de una carpeta manda: si un frente declara checks para `backend/` y luego se descubren otros en esa carpeta, los nuevos entran con `"disabled": true`. En un proyecto existente es al revés: los del proyecto mandan y los del frente entran desactivados.
- Los comandos descubiertos usan el gestor del proyecto: `uv run`, `poetry run`, `pdm run`, `pnpm`, `yarn`, `bun`.
- `specboot check --list` muestra todos, activos e inactivos.
- Un check cuya carpeta aún no existe se omite; con `--strict` cuenta como fallo si no se ejecuta ninguno.

Garantía real: solo lo que estos comandos comprueban. Arquitectura, nombres y patrones se guían con los estándares y la revisión, pero no se garantizan.
