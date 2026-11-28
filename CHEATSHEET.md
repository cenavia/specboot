# specboot: guía rápida (canónica)

Instalación y uso para proyectos nuevos (greenfield) y existentes (brownfield). Versión 0.7.5.

| Guía | Cuándo |
|------|--------|
| **[GUIA-GREENFIELD.md](GUIA-GREENFIELD.md)** | Proyecto vacío, cliente limpio, prescribe → esqueleto → handoff |
| **[GUIA-BROWNFIELD.md](GUIA-BROWNFIELD.md)** | Repo con código; specs ocultas; `docs local`; detect → apply → map |
| **[GUIA-PRESETS.md](GUIA-PRESETS.md)** | Manifiestos, CRUD de preset, detect/apply |
| **[GUIA-INSTALACION-EQUIPO.md](GUIA-INSTALACION-EQUIPO.md)** | Onboarding de máquina y compañeros |

## 0. Capas (no las mezcles)

| Capa | Ruta | Quién la escribe | ¿Git del cliente? |
|------|------|------------------|-------------------|
| Código de producto | repo del cliente | tú / agente (apply OpenSpec) | **Sí** |
| Preset de **máquina** | `~/.specboot-data/presets/fronts.<id>.json` | `preset create` / `detect --preset` | No |
| Store de **specs** | `~/.specboot-data/stores/<cliente>/` → `openspec/` | `init`, `--apply`, map, sync | No |
| Frentes activos | `openspec/standards/fronts.json` (en el store) | `init --stack/--fronts` o `preset apply` / `detect --preset --apply` | No |
| Docs SpecBoot | `docs/` local (ignorada) | plan / doc add | No (salvo `docs client`) |
| Skills / regla Cursor | `~/.claude/skills`, `.cursor/rules/…` | `install` / `init` | No |

**Regla:** `detect --preset` = plantilla en máquina. `--apply` = merge al store del cliente (hace falta `init` antes). `specboot sync` = compartir el store con el equipo.

## 1. Dónde va cada cosa

| Qué | Ruta exacta | Quién lo pone |
|-----|-------------|---------------|
| El arnés | `~/.specboot/` (o clone de dev + `npm link`) | Tú |
| Código fuente del CLI | `bin/specboot.mjs` + `lib/*` | Repo SpecBoot |
| Tus skills | Carpeta de plugins, p. ej. `~/code/agents/plugins/` | Tú (`source add`) |
| Enlaces Claude / Cursor / Codex / opencode | `~/.claude/skills`, `~/.agents/skills` | `specboot install` |
| Reglas globales | `~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`, … | `specboot install` |
| Regla Cursor | `.cursor/rules/specboot.mdc` (excluida) | `init` / `link` / `map` |
| Datos del arnés | `~/.specboot-data/` | El arnés |
| Store privado | `~/.specboot-data/stores/<cliente>/` | `specboot init` |
| Specs / estándares | `<proyecto>/openspec` → enlace al store | `specboot init` |
| Presets generados | `~/.specboot-data/presets/` | `preset create` / `detect --preset` |
| Planificación / arquitectura | `<proyecto>/docs/` local ignorada | `init` (`--docs local`) |

Estructura de una carpeta de skills válida (cualquier profundidad sirve; se detecta cada `SKILL.md`):

```
~/code/agents/plugins/
├── python-dev/skills/fastapi-templates/SKILL.md
├── react-dev-suite/skills/react-architecture/SKILL.md
└── ai-dev/skills/langgraph-core/SKILL.md
```

Cada `SKILL.md` necesita `name:` y `description:` en su encabezado. De un plugin solo se usan las skills; los subagentes, comandos y hooks son propios de Claude Code.

## 2. Instalación (una vez por máquina)

Instala por **tag** ([releases](https://github.com/cenavia/specboot/releases)): **`v0.7.5`** (actual), `v0.7.4`, `v0.7.3`, `v0.7.2`, `v0.7.1`, `v0.7.0` o **`v0.6.1`** (estable anterior). Detalle: [GUIA-INSTALACION-EQUIPO.md](GUIA-INSTALACION-EQUIPO.md).

```bash
# 1. Requisitos
node --version                                  # 20.19 o superior
npm install -g @fission-ai/openspec@latest

# 2. El arnés en la versión acordada
git clone https://github.com/cenavia/specboot.git ~/.specboot
cd ~/.specboot
git checkout v0.7.5                             # o: git checkout v0.6.1
npm link                                        # comando global `specboot`

# Cambiar de versión más tarde:
#   cd ~/.specboot && git fetch --tags && git checkout v0.7.5 && npm link && specboot install

# 3. Tus skills
specboot source add ~/code/agents/plugins       # la carpeta que contiene tus skills
specboot source list

# 4. Enlazar agentes (en v0.7.0+ también efficiency pack: ponytail, caveman, codegraph, rtk, headroom)
specboot install
# macOS/Linux → bash; Windows → PowerShell (no hace falta Git Bash)
# Saltar solo el pack (0.7+): SPECBOOT_SKIP_EFFICIENCY=1 specboot install

# 5. Verificar
specboot doctor
git -C ~/.specboot describe --tags --always     # confirma el tag activo
# Por cada repo cliente (0.7+, opcional): codegraph init
```

En Cursor no hay que pegar nada: `init`, `link` y `map` escriben la regla en `.cursor/rules/specboot.mdc` de cada proyecto. En proyectos preparados antes de 0.7.3, ejecuta `specboot link`.

Repite `specboot install` cada vez que cambies de tag, actualices OpenSpec o tus skills.

## 3. Flujo greenfield (canónico, paso a paso)

Detalle: **[GUIA-GREENFIELD.md](GUIA-GREENFIELD.md)**. Escenario: specs/skills/IA **fuera** del git del cliente; `--docs local`.

```bash
# ——— A. Máquina (una vez) ———
# (igual que §2)

# ——— B. Preset de máquina ———
specboot preset create go,react --topics-from ai --attach-to backend
# o: specboot preset create go
# o JSON estático: ~/.specboot/presets/fronts.fastapi-react.json

# ——— C. Repo vacío del cliente ———
mkdir mi-proyecto && cd mi-proyecto
git init && git commit --allow-empty -m "chore: init"

specboot init <cliente> \
  --stack go,react,ai \
  --attach-to backend \
  --docs local \
  --remote <url-store-privada>
# alternativo: --fronts ~/.specboot-data/presets/fronts.<id>.json

specboot doctor
git check-ignore -v openspec docs .cursor
```

| Paso | Agente / CLI | Resultado |
|------|--------------|-----------|
| 0 | Skill `specboot-plan` (opcional) | PRD / backlog en `docs/planning/` (local) |
| 1 | Skill `specboot-prescribe` | Estándares en el store |
| 2 | Revisas `[assumed]` → `status: reviewed` | |
| 3 | `specboot sync -m "standards: prescribe…"` | Store remoto |
| 4–5 | OpenSpec propose/apply del **esqueleto** | Código en el repo del cliente |
| 6 | `specboot check` | Gates en verde |
| 7 | Commit del esqueleto en el **git del cliente** | Lo único que el cliente debe ver |
| 8 | Skill `specboot-map` + `specboot mode brownfield` | Handoff obligatorio |
| 9 | `specboot sync -m "standards: handoff brownfield"` | |

`doctor` / `map` avisan «handoff due» hasta el paso 8.

## 4. Flujo brownfield (canónico, paso a paso)

Detalle: **[GUIA-BROWNFIELD.md](GUIA-BROWNFIELD.md)**. Escenario: mismo contrato de ocultación + solo `docs local`.

**Orden fijo:** máquina → comprobar `docs/` → **init** → detect/apply → map → sync.

```bash
# ——— A. Máquina (una vez) ———  §2

# ——— B. Repo existente ———
cd /ruta/proyecto-cliente
git ls-files -- docs | head          # debe estar vacío para docs local

# 1. Registrar proyecto + store (antes de --apply)
specboot init <cliente> \
  --existing \
  --docs local \
  --remote <url-store-privada>
# Opcional en el mismo init si ya sabes el stack:
#   --stack go,react
#   --fronts ~/.specboot-data/presets/fronts.go-react.json

# 2. Inferir preset desde el código (máquina)
specboot detect --preset --dry-run   # plan + gaps; no escribe
specboot detect --preset             # escribe ~/.specboot-data/presets/fronts.<id>.json

# 3. Fusionar frentes al store del cliente
specboot detect --preset --apply     # merge fronts.json + commit local del store
# o: specboot preset apply <id>
# --replace-fronts  → sustituye solo el mapa fronts
# --sync            → además push del store

# 4. Salud
specboot doctor
specboot check --list
git check-ignore -v openspec docs .cursor

# 5. Arquitectura objetivo (opcional; sigue en docs/ local)
specboot doc add ~/ruta/arquitectura.md
```

| Paso | Agente / CLI | Resultado |
|------|--------------|-----------|
| 1 | Skill `specboot-map` | Estándares desde el **código** + evidencia |
| 2 | Revisas `[assumed]` / drift vs docs | `status: reviewed` |
| 3 | `specboot check` | Línea base (anota fallos previos) |
| 4 | `specboot sync -m "standards: map project"` | Store compartido |

En brownfield **manda el código**. Los gaps de `detect --preset` se resuelven instalando plugins o creando skills; no se inventan.

**Compañero** (store ya existe):

```bash
# Fase A en su máquina (§2), luego:
cd clon-cliente
specboot init <cliente> --existing --docs local --remote <url-store>
specboot pull && specboot doctor
```

## 5. Ciclo de cada cambio (ambos flujos)

Según el tamaño del pedido: producto, épica o funcionalidad grande → primero `specboot-plan`; una historia → `enrich-us`; un cambio pequeño → directo.

| Comando OpenSpec | Skills del arnés que van con él |
|------------------|--------------------------------|
| `explore` | `enrich-us`? · `explain`? |
| `propose` / `new` / `ff` | `specboot-plan`? · `enrich-us`? · `playwright-qa-scenarios` (catálogo FE)? |
| `continue` / `update` | (solo artefactos OpenSpec) |
| `apply` | **must** `ponytail` (diff mínimo) · codegraph si el proyecto está indexado · `using-git-worktrees`? · E2E FE: `playwright-qa-scenarios`+`playwright-skill` · **must** `work-unit-commits` · `chained-pr`? · `branch-pr` · `commit`? · `update-docs`? · `show-spec-working`? |
| `sync` | `openspec-sync-specs` (la de OpenSpec; el arnés trae una copia de respaldo para OpenSpec 1.x) |
| **verify** / pre-**archive** | `openspec-verify-change` (solo extendido) → `specboot check` → `adversarial-review` → `mutation-testing`? → `code-auditing`? → **`judgment-day`** |
| `archive` / `bulk-archive` | quality gate + `specboot-map`? + `specboot sync` |
| `onboard` | `specboot-start` primero |
| Entradas | `quick-change` / `factory` → luego el ciclo de arriba |

`?` = solo si aplica la condición. Inventario completo y must/when: `specboot-start` §§5a–5c. Perfil: `openspec config get profile` / `workflows` (core=6, extendido=12).

Proyecto ya en OpenSpec 1.x → 2.x extendido: ver **[UPGRADE-OPENSPEC-2.md](UPGRADE-OPENSPEC-2.md)**.

Cómo invocar una skill: `/nombre` en Claude Code, Cursor y opencode; `$nombre` en Codex; o pídelo en lenguaje natural.

## 6. `fronts.json` de referencia

Ruta: `<proyecto>/openspec/standards/fronts.json`

```json
{
  "mode": "greenfield",
  "docs": { "placement": "local" },
  "planning": {
    "skills": ["product-ideation-brainstorm", "breakdown-feature-prd", "project-manager"],
    "output": "docs/planning"
  },
  "fronts": {
    "backend": {
      "path": "backend",
      "core": ["python-project-structure", "fastapi-templates", "python-code-style", "python-testing-patterns"],
      "topics": ["python-observability", "langgraph-fundamentals", "rag-implementation"],
      "decisions": { "architecture": "monolito modular" },
      "checks": ["uv run ruff check .", "uv run mypy .", "uv run pytest"]
    },
    "frontend": {
      "path": "frontend",
      "core": ["react-architecture", "react-core", "react-testing"],
      "topics": ["react-state", "react-forms"],
      "decisions": { "architecture": "Screaming (feature-first)" },
      "checks": ["npm run lint", "npm run typecheck", "npm run test -- --run"]
    }
  }
}
```

| Campo | Regla |
|-------|-------|
| `core` | 3 a 5 skills que definen estructura, estilo y pruebas. Usa el `name` de la skill, no el de su carpeta |
| `topics` | Skills que se cargan solo cuando la tarea las necesita |
| `decisions` | Lo ya decidido; el agente no lo vuelve a preguntar |
| `checks` | Escritos como se ejecutan de verdad (`uv run ...`, `pnpm run ...`) |
| `planning` | Skills del plugin `plan`. Las añade `specboot map` en cuanto están instaladas; escribe tu propia lista para fijarla, o `{"disabled": true}` para apagarla |

Después de editarlo: `specboot map`.

## 7. Qué hay en `openspec/standards/`

| Archivo | Editas tú | Notas |
|---------|-----------|-------|
| `fronts.json` | Sí | Frentes, modo, ubicación de `docs/` |
| `checks.json` | Solo para añadir comandos propios o desactivar con `"disabled": true` | Los de los frentes se editan en `fronts.json` |
| `overrides.md` | Sí | «Término del documento → identificador a usar» |
| `decisions.md` | Sí | Decisiones cerradas y elementos aplazados |
| `*-standards.md`, `development-guide.md`, `data-model.md`, `api-spec.md` | Revisas y pones `status: reviewed` | Los escribe el agente |
| `skill-gaps.md` | No | Lo que tus skills no cubrieron |
| `project-facts.md`, `fronts.lock.json` | No | Se regeneran con `specboot map` |

## 8. Comandos

| Comando | Para qué |
|---------|----------|
| `specboot doctor [--strict]` | Salud de máquina/proyecto |
| `specboot source add\|list\|remove` | Plugins de skills |
| `specboot install [--adopt]` | Enlazar skills, reglas, efficiency pack |
| `specboot preset list\|show\|create\|update\|apply\|attach\|remove` | CRUD de presets de máquina + apply al store |
| `specboot detect [--preset] [--dry-run] [--apply] [--replace-fronts] [--sync] [--write] [--json]` | Stack; preset; merge al store |
| `specboot init <cliente> …` | Store + enlace + exclude/hook |
| `specboot docs local\|client\|store` | Ubicación de `docs/` |
| `specboot doc add\|remove\|list` | Documentos de arquitectura |
| `specboot map [--accept]` | Inventario + plantillas + checks |
| `specboot check [--list] [--strict]` | Gates del store |
| `specboot mode greenfield\|brownfield` | Modo del proyecto |
| `specboot link` | Worktree: enlaces + exclude + hook + regla Cursor |
| `specboot sync -m "…"` | Commit + rebase + **push** del store |
| `specboot pull` | Traer store sin subir |

**`init`:** `--remote`, `--stack` / `--fronts`, `--topics-from`, `--attach-to`, `--new` / `--existing`, `--docs local|client|store`, `--gitignore`.

**Preset / detect (brownfield):**

```bash
specboot detect --preset --dry-run
specboot detect --preset --apply          # requiere init previo
specboot preset apply go-react
specboot preset apply --from-detect
```

## 9. Problemas frecuentes

| Síntoma | Causa | Arreglo |
|---------|-------|---------|
| «skills declared in fronts.json are not installed» | Falta registrar tu carpeta de skills | Ejecuta la línea `fix:` que aparece debajo |
| «planning skills not installed» | El plugin `plan` no está registrado, o el proyecto es anterior a la v0.6 | Ejecuta la línea `fix:` que aparece debajo; `specboot map` las añade al proyecto |
| El agente no ve una skill | No se enlazó, o le falta `name:` | `specboot install` y revisa los avisos |
| «handoff due» | Ya hay código y el proyecto sigue en greenfield | Skill `specboot-map`, luego `specboot mode brownfield` |
| `check` dice que no verificó nada | Las carpetas de los frentes aún no existen | Normal antes del esqueleto |
| Un check descubierto aparece `off` | Ya hay checks para esa carpeta | Pon `"disabled": false` en `checks.json` si lo quieres |
| «base skill changed» o «document changed» | Editaste una skill o un documento después de escribir los estándares | Actualiza los estándares y ejecuta `specboot map --accept` |
| Falta `openspec/` en un worktree | Los enlaces no se versionan | `specboot link` |
| «commit blocked» | Intentaste añadir un archivo privado | `git restore --staged <ruta>` |
| «store has no remote» | Las specs solo están en tu máquina | `git -C ~/.specboot-data/stores/<cliente> remote add origin <url>` y `specboot sync` |
| «store is N commits behind the team» | Un compañero subió cambios | `specboot pull` |
| «your specs and the team's changed the same lines» | Conflicto real en el store | Sigue las tres líneas que imprime; no se perdió nada |
| «skills repository X is at ... but the project uses ...» | Tienes otra versión de las skills | El `git checkout` que imprime, o `specboot map --accept` |
| Un compañero clonó y ve `openspec/` sin ignorar | El exclude es local a tu clon | `specboot init <cliente> --gitignore` y commit del `.gitignore` |
| El hook no se instaló | El repositorio usa `core.hooksPath` (Husky) | Llama a `pre-commit.specboot` desde tu hook |

## 10. Compartir con el equipo

Cada compañero instala el **mismo tag** del arnés (`v0.7.5` o el que acuerden):

```bash
git clone https://github.com/cenavia/specboot.git ~/.specboot
cd ~/.specboot && git checkout v0.7.5 && npm link
specboot source add <ruta-skills-del-equipo>
specboot install && specboot doctor
```

Tú, una vez (store de specs del cliente):

```bash
git -C ~/.specboot-data/stores/<cliente> remote add origin <url-privada>
specboot sync
```

En el clon del repositorio del cliente:

```bash
specboot init <cliente> --remote <url-privada>
```

Día a día: `specboot pull` al empezar, `specboot sync -m "..."` al terminar. `doctor` avisa si vas por detrás o si tus skills no están en el commit del proyecto.

## 11. Orden de autoridad

1. Reglas de agentes que el cliente ya versiona.
2. Tus documentos de arquitectura, corregidos por `overrides.md`.
3. `decisions.md`.
4. El código (existente) o las skills base (nuevo).
5. Skills genéricas.
