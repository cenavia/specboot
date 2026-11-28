# Guía: crear presets por tecnología

Cómo declarar un stack (Go, FastAPI, React, …) una vez en el plugin de skills y reutilizarlo en cada proyecto greenfield con `specboot preset` / `specboot init --stack`.

**Greenfield de punta a punta** (escenarios, referencia CLI, ocultar specs/skills/IA al cliente): [GUIA-GREENFIELD.md](GUIA-GREENFIELD.md).  
**Brownfield** (proyecto existente, mismo contrato de ocultación + docs local): [GUIA-BROWNFIELD.md](GUIA-BROWNFIELD.md).  
También: [docs/configuration.md](docs/configuration.md), ejemplos en [presets/](presets/).

## Idea en una frase

El **plugin** aporta las skills; el **manifesto** (`specboot.preset.json`) dice cuáles son `core`, cuáles `topics` y qué `checks` correr; SpecBoot **materializa** un `fronts.<tech>.json` listo para `init`.

```text
plugin go-dev/          →  skills go-*
specboot.preset.json    →  core / topics / checks
specboot preset create go
        ↓
~/.specboot-data/presets/fronts.go.json
        ↓
specboot init acme --stack go   (o --fronts ese archivo)
```

## Requisitos

1. Plugin registrado e instalado:

```bash
specboot source add /ruta/al/plugin-o-carpeta-de-plugins
specboot install
specboot doctor
```

2. Los `name:` de cada `SKILL.md` son los que irán en `core` / `topics` (no el nombre de carpeta, si difiere).

## Quick path (Go, manifesto ya en el arnés)

Con el plugin Go en tus sources:

```bash
specboot preset list
specboot preset show go
specboot preset create go

mkdir mi-api && cd mi-api && git init
git commit --allow-empty -m "chore: init"
specboot init acme --stack go --remote <url-store-privada>
specboot doctor
```

Luego, en el agente: `specboot-prescribe` → esqueleto → handoff ([GUIA-GREENFIELD.md](GUIA-GREENFIELD.md)).

---

## Cómo crear el manifesto de una tecnología nueva

### Paso 1 — Elige `technology` y prefijo

| Campo | Ejemplo | Regla |
|-------|---------|--------|
| `technology` | `go` | Id corto, minúsculas |
| `aliases` | `["golang"]` | Nombres alternativos para `--stack` |
| `skillPrefix` | `go-` | Por defecto `<technology>-` |

### Paso 2 — Separa `core` y `topics`

| Lista | Cuántas | Qué va |
|-------|---------|--------|
| **core** | 3–5 | Estructura, estilo/idioms, tests (y opcional quality gates). `prescribe` las lee **enteras**. |
| **topics** | el resto | Se cargan solo cuando la tarea las necesita |

Opciones para `topics`:

- `"*"` — todas las skills instaladas con ese `skillPrefix` que no estén en `core` (**recomendado**).
- Array explícito — control fino (como en `presets/fronts.go.json`).

### Paso 3 — Checks y path

Escribe los comandos **como los vas a correr** en el repo (`go test ./...`, `uv run pytest`, …).  
`path` es la carpeta del frente (`.` si el repo es solo ese servicio; `backend` en monorepo).

### Paso 4 — Dónde guardar el archivo

| Dónde | Nombre | Cuándo |
|-------|--------|--------|
| **Raíz del plugin** (mejor) | `specboot.preset.json` | El plugin es la fuente de verdad; viaja con el equipo |
| Arnés SpecBoot | `presets/manifests/<tech>.specboot.preset.json` | Ejemplo compartido / fallback |
| Solo tu máquina | Generas con `preset create` → `~/.specboot-data/presets/` | Sin tocar el plugin aún |

Plantilla mínima:

```json
{
  "technology": "go",
  "aliases": ["golang"],
  "skillPrefix": "go-",
  "front": "backend",
  "path": ".",
  "core": [
    "go-project-layout",
    "go-modules",
    "go-idiomatic",
    "go-testing",
    "go-quality-gates"
  ],
  "topics": "*",
  "checks": ["go vet ./...", "go test ./..."],
  "decisions": {}
}
```

Varios frentes en un solo manifesto:

```json
{
  "technology": "go-react",
  "fronts": {
    "backend": {
      "path": "backend",
      "core": ["go-project-layout", "go-modules", "go-testing"],
      "topics": "*",
      "skillPrefix": "go-",
      "checks": ["go test ./..."]
    },
    "frontend": {
      "path": "frontend",
      "core": ["react-architecture", "react-core", "react-testing"],
      "topics": ["react-state", "react-forms"],
      "checks": ["npm run lint", "npm run test -- --run"]
    }
  }
}
```

### Paso 5 — Generar y usar

```bash
specboot preset create go
# → ~/.specboot-data/presets/fronts.go.json

specboot preset create go --default          # también ~/.specboot-data/fronts.default.json
specboot preset create go --out ./fronts.go.json
specboot preset create go --path backend     # override del path del frente único
specboot preset create go --front api        # nombre del frente (default backend)

# Brownfield: inferir desde el repo (preset de máquina)
specboot detect --preset --dry-run           # plan + gaps
specboot detect --preset                     # ~/.specboot-data/presets/…
specboot preset create --from-detect         # equivalente

# Tras init del cliente: fusionar al store (fronts.json)
specboot detect --preset --apply             # merge + commit local del store
specboot preset apply go-react               # apply de un id ya generado
specboot preset apply --from-detect          # detect + apply
# --replace-fronts  → sustituye solo fronts (conserva mode/docs/planning)
# --sync            → además push; si no: specboot sync
```

Si `detect --preset` marca un **gap**, no inventa skills: te indica buscar un plugin (`source add` + `install`), añadir un manifesto, o crear skills `<tech>-*` y regenerar con `--heuristic`.

Sin manifesto, SpecBoot puede **adivinar** desde skills `go-*` instaladas (core por palabras clave: layout, modules, style, testing, …):

```bash
specboot preset create go --heuristic
```

Revisa el JSON antes de confiar en la heurística; el manifesto del plugin es la forma seria.

### Paso 6 — Init del proyecto

```bash
specboot init <cliente> --stack go --remote <url>
# equivalente:
specboot init <cliente> --fronts ~/.specboot-data/presets/fronts.go.json
```

`--fronts` y `--stack` no se combinan.

---

## Comandos (CRUD)

| Acción | Comando | Qué hace |
|--------|---------|----------|
| **List (R)** | `specboot preset list` | Manifestos, ejemplos y generados |
| **Read (R)** | `specboot preset show <id>` | Lee el JSON **generado** (error si no existe) |
| **Read** | `specboot preset show … --resolve` | Previsualiza sin crear |
| **Create (C)** | `specboot preset create <tech[,…]>` | Escribe `~/.specboot-data/presets/fronts.<id>.json` |
| **Update (U)** | `specboot preset update <…>` | Igual que create; exige que el archivo exista (salvo `--force`) |
| **Apply** | `specboot preset apply <id>` / `apply --from-detect` | Merge al `fronts.json` del **store** del cliente registrado |
| **Attach (U)** | `specboot preset attach <id> --topics-from ai` | Añade un topics-pack a un preset ya generado |
| **Delete (D)** | `specboot preset remove <id>` | Borra el generado (`--default` también quita `fronts.default.json`) |

Flags de apply: `--replace-fronts`, `--sync`. Create/detect también aceptan `--apply` (mismo efecto tras escribir el preset de máquina).

### Varias tecnologías + pack de IA

```bash
# Stacks + topics-pack (ai-dev) enganchado a un frente
specboot preset create go,python,java,react --topics-from ai --attach-to python
# equivalente incluyendo ai en la lista:
specboot preset create go,python,java,react,ai --attach-to python

specboot preset show go-java-python-react-with-ai
specboot preset update go,python,java,react --topics-from ai --attach-to python --force
specboot preset remove go-java-python-react-with-ai

specboot init acme --stack go,python,java,react,ai --attach-to python --remote <url>
```

### Topics-pack (plugins multi-prefijo como ai-dev)

```json
{
  "technology": "ai",
  "kind": "topics-pack",
  "attachTo": "backend",
  "topicPrefixes": ["langgraph-", "langchain-", "rag-", "llm-"],
  "topics": ["mcp-builder"]
}
```

No crea un frente propio: **inyecta topics** en el frente indicado (`attachTo` o `--attach-to`).

Roles por defecto al componer (si el manifesto no fija `front`/`path`):

| Tecnología | Frente | Path |
|------------|--------|------|
| go, java, python, fastapi, … | `backend` | `backend` |
| react, angular, vue | `frontend` | `frontend` |
| react-native, flutter | `mobile` | `mobile` |

Si dos stacks chocan en el mismo nombre de frente, SpecBoot **renombra** al nombre de la tecnología (aviso en consola). Mejor: fija `front`/`path` únicos en cada `specboot.preset.json`.

`remove` / `update` no tocan el manifesto del plugin ni el `fronts.json` de un proyecto ya inicializado.

Resolución de `--stack` / `create`:

1. Manifesto en un **source** (`specboot.preset.json`) para esa tecnología o alias  
2. Si no, manifesto del **arnés** (`presets/manifests/`)  
3. Si no, **heurística** sobre skills `<tech>-*` instaladas (con aviso)

---

## Checklist para un plugin nuevo

- [ ] Skills con `name:` y `description:` válidos
- [ ] `specboot source add` + `install` + aparecen en el catálogo
- [ ] `specboot.preset.json` en la raíz del plugin (core 3–5, `topics: "*"`, checks reales)
- [ ] `specboot preset show <tech>` lista solo skills instaladas
- [ ] `specboot preset create <tech>` sin errores
- [ ] `specboot init … --stack <tech>` en un repo de prueba
- [ ] `specboot doctor` OK → seguir [GUIA-GREENFIELD.md](GUIA-GREENFIELD.md) (prescribe → esqueleto)

---

## Problemas frecuentes

| Síntoma | Causa | Qué hacer |
|---------|--------|-----------|
| `no installed skills match prefix` | Plugin no está en sources o sin `install` | `source add` + `install` |
| `skill(s) in the preset are not installed` | `core`/`topics` con nombres mal escritos o skills no enlazadas | Corrige `name:` o usa `--force` solo para depurar |
| Heurística con un `core` flojo | No hay manifesto | Escribe `specboot.preset.json` en el plugin |
| `topics` vacío con `"*"` | Prefijo distinto al de los `name:` | Ajusta `skillPrefix` |
| Quiero FastAPI+React sin inventar | Ya hay JSON estático | `presets/fronts.fastapi-react.json` vía `--fronts` (o crea un manifesto `fastapi-react`) |

---

## Next step

1. Añade `specboot.preset.json` al plugin (stack o `kind: topics-pack`).  
2. **Greenfield:** [GUIA-GREENFIELD.md](GUIA-GREENFIELD.md) — `preset create` → `init --docs local` → prescribe.  
3. **Brownfield:** [GUIA-BROWNFIELD.md](GUIA-BROWNFIELD.md) / [CHEATSHEET.md](CHEATSHEET.md) §4 — `init` → `detect --preset --apply` → map.  
