# specboot: guía rápida

Instalación y uso para proyectos nuevos (greenfield) y existentes (brownfield). Versión 0.7.2.

Onboarding detallado del equipo (recomendación máquina → luego proyecto existente): **[GUIA-INSTALACION-EQUIPO.md](GUIA-INSTALACION-EQUIPO.md)**.

## 1. Dónde va cada cosa

| Qué | Ruta exacta | Quién lo pone |
|-----|-------------|---------------|
| El arnés | `~/.specboot/` | Tú, con `git clone` |
| Tus skills | Cualquier carpeta tuya, por ejemplo `~/code/agents/plugins/` | Tú. **No las copies a mano a ningún otro sitio** |
| Enlaces para Claude Code, Cursor y opencode | `~/.claude/skills/<skill>` | `specboot install` |
| Enlaces para Codex y Cursor | `~/.agents/skills/<skill>` | `specboot install` |
| Regla global de Claude Code | `~/.claude/CLAUDE.md` | `specboot install` |
| Regla global de Codex | `~/.codex/AGENTS.md` | `specboot install` |
| Regla global de opencode | `~/.config/opencode/AGENTS.md` | `specboot install` |
| Regla global de Cursor | Settings → Rules → User Rules | Tú, pegando el texto que muestra `install` |
| Datos del arnés | `~/.specboot-data/` | El arnés |
| Store privado de un cliente | `~/.specboot-data/stores/<cliente>/` | `specboot init` |
| Specs y estándares | `<proyecto>/openspec` → enlace al store | `specboot init` |
| Planificación y arquitectura | `<proyecto>/docs/`, carpeta real ignorada por git | `specboot init` (ubicación `local` por defecto) |

Estructura de una carpeta de skills válida (cualquier profundidad sirve; se detecta cada `SKILL.md`):

```
~/code/agents/plugins/
├── python-dev/skills/fastapi-templates/SKILL.md
├── react-dev-suite/skills/react-architecture/SKILL.md
└── ai-dev/skills/langgraph-core/SKILL.md
```

Cada `SKILL.md` necesita `name:` y `description:` en su encabezado. De un plugin solo se usan las skills; los subagentes, comandos y hooks son propios de Claude Code.

## 2. Instalación (una vez por máquina)

Instala por **tag** ([releases](https://github.com/cenavia/specboot/releases)): **`v0.7.2`** (actual), `v0.7.1`, `v0.7.0` o **`v0.6.1`** (estable anterior). Detalle: [GUIA-INSTALACION-EQUIPO.md](GUIA-INSTALACION-EQUIPO.md).

```bash
# 1. Requisitos
node --version                                  # 20.19 o superior
npm install -g @fission-ai/openspec@latest

# 2. El arnés en la versión acordada
git clone https://github.com/cenavia/specboot.git ~/.specboot
cd ~/.specboot
git checkout v0.7.2                             # o: git checkout v0.6.1
npm link                                        # comando global `specboot`

# Cambiar de versión más tarde:
#   cd ~/.specboot && git fetch --tags && git checkout v0.7.2 && npm link && specboot install

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

Después, en Cursor: Settings → Rules → User Rules, y pega el texto que `specboot install` mostró al final.

Repite `specboot install` cada vez que cambies de tag, actualices OpenSpec o tus skills.

## 3. Flujo greenfield (proyecto nuevo)

```bash
# 1. Repositorio vacío del cliente
mkdir mi-proyecto && cd mi-proyecto && git init
git commit --allow-empty -m "chore: init"

# 2. Iniciar con un preset de frentes
specboot init <cliente> \
  --fronts ~/.specboot/presets/fronts.fastapi-react.json \
  --remote <url-git-privada-de-specs>

# 3. Registrar tu documento de arquitectura (opcional, manda sobre las skills)
specboot doc add ~/ruta/arquitectura.md
specboot doc add ~/ruta/backend.md --front backend

# 4. Comprobar
specboot doctor
```

Luego, con el agente:

| Paso | Qué le pides al agente | Resultado |
|------|------------------------|-----------|
| 0 | «Ejecuta la skill `specboot-plan`» | Ideación, PRD, historias y backlog en `docs/planning/` |
| 1 | «Ejecuta la skill `specboot-prescribe`» | Lee overrides, documentos y skills base; te pregunta solo lo que ningún documento cierra; escribe `openspec/standards/` |
| 2 | Revisas y corriges lo marcado `[assumed]` | Pones `status: reviewed` en cada documento |
| 3 | «Propón el cambio del esqueleto del proyecto» | Cambio de OpenSpec con carpetas, linter, pruebas y CI |
| 4 | «Aplica el cambio» | Código del esqueleto |
| 5 | `specboot check` | Todos los checks activos pasan |
| 6 | Commit del esqueleto en el repositorio del cliente | |
| 7 | **Traspaso:** «Ejecuta la skill `specboot-map`» y después `specboot mode brownfield` | Lo prescrito se verifica contra el código |
| 8 | `specboot sync -m "standards: verify, switch to brownfield"` | Store versionado |

`specboot map` y `specboot doctor` avisan «handoff due» cuando toca el paso 7. No empieces otro cambio antes.

Presets en `~/.specboot/presets/`:

| Archivo | Para |
|---------|------|
| `fronts.fastapi-react.json` | FastAPI + React |
| `fronts.fastapi-react-agentic.json` | Igual, con LangGraph dentro del backend como `topics` |
| `fronts.springboot-angular.json` | Spring Boot + Angular |
| `fronts.all-fronts.example.json` | Ejemplo con backend, frontend, mobile, ai, ml y data-science |

Para usar uno por defecto: cópialo a `~/.specboot-data/fronts.default.json`.

## 4. Flujo brownfield (proyecto existente)

```bash
cd proyecto-existente

# 1. Iniciar (detecta solo que hay código)
specboot init <cliente> --remote <url-git-privada-de-specs>

# 2. docs/ queda local e ignorada por defecto. Solo si el cliente debe verla:
specboot docs client

# 3. Opcional: documento de arquitectura objetivo y frentes
specboot doc add ~/ruta/arquitectura.md
#   edita openspec/standards/fronts.json si quieres skills por frente

# 4. Comprobar
specboot doctor
specboot check --list         # comandos de lint y pruebas que encontró en el proyecto
```

Luego, con el agente:

| Paso | Qué le pides al agente | Resultado |
|------|------------------------|-----------|
| 1 | «Ejecuta la skill `specboot-map`» | Lee reglas, configuración y código; escribe `openspec/standards/` con evidencia por regla |
| 2 | Revisas lo marcado `[assumed]` y las desviaciones frente a tu documento | Pones `status: reviewed` |
| 3 | `specboot check` | Línea base: anota en los estándares qué fallaba antes de tocar nada |
| 4 | `specboot sync -m "standards: map project"` | Store versionado |

En un proyecto existente el código manda. Tu documento describe el objetivo; las contradicciones se reportan y tú decides.

## 5. Ciclo de cada cambio (ambos flujos)

Según el tamaño del pedido: producto, épica o funcionalidad grande → primero `specboot-plan`; una historia → `enrich-us`; un cambio pequeño → directo.

| Comando OpenSpec | Skills del arnés que van con él |
|------------------|--------------------------------|
| `explore` | `enrich-us`? · `explain`? |
| `propose` / `new` / `ff` | `specboot-plan`? · `enrich-us`? · `playwright-qa-scenarios` (catálogo FE)? |
| `continue` / `update` | (solo artefactos OpenSpec) |
| `apply` | `using-git-worktrees`? · E2E FE: `playwright-qa-scenarios`+`playwright-skill` · **must** `work-unit-commits` · `chained-pr`? · `branch-pr` · `commit`? · `update-docs`? · `show-spec-working`? |
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
| `specboot doctor [--strict]` | Qué falta o está mal, con el comando que lo arregla |
| `specboot source add <carpeta>` | Registrar tus skills |
| `specboot install` | Enlazar skills y regla global |
| `specboot init <cliente> [opciones]` | Preparar un proyecto |
| `specboot docs local\|client\|store` | Dónde vive `docs/` |
| `specboot doc add <archivo> [--front <f>]` | Registrar un documento de arquitectura |
| `specboot map [--accept]` | Regenerar inventario y sincronizar checks |
| `specboot check [--list] [--strict]` | Ejecutar o listar los checks |
| `specboot mode brownfield` | Cerrar la fase de proyecto nuevo |
| `specboot link` | Recrear enlaces en un worktree nuevo |
| `specboot sync -m "..."` | Confirmar, traer lo del equipo y subir |
| `specboot pull` | Traer lo del equipo sin subir |

Opciones de `init`: `--remote <url>`, `--fronts <archivo>`, `--new`, `--existing`, `--docs local|client|store`, `--gitignore`.

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

Cada compañero instala el **mismo tag** del arnés (`v0.7.2` o el que acuerden):

```bash
git clone https://github.com/cenavia/specboot.git ~/.specboot
cd ~/.specboot && git checkout v0.7.2 && npm link
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
