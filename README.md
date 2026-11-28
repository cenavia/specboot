# specboot

[![release](https://img.shields.io/github/v/release/cenavia/specboot)](https://github.com/cenavia/specboot/releases/latest)
![license](https://img.shields.io/badge/license-MIT-blue)
![node](https://img.shields.io/badge/node-%E2%89%A520.19-339933)
![agents](https://img.shields.io/badge/agents-Claude%20Code%20%7C%20Cursor%20%7C%20Codex%20%7C%20opencode-555)

**Arnés global de OpenSpec para agentes de IA que no deja nada de IA en el repositorio del cliente.**

- Las skills viven en tu máquina, no en el proyecto.
- Las specs y los estándares viven en un repositorio git privado tuyo (el *store*), enlazado al proyecto como `openspec/`.
- El repositorio del cliente solo recibe código. Un `exclude` local y un hook `pre-commit` lo protegen.

## Por qué specboot

Trabajar con agentes y desarrollo guiado por specs suele llenar el repositorio de `CLAUDE.md`, `.cursor/`, `openspec/` y skills copiadas. En un proyecto de cliente eso no siempre es aceptable, y cada repositorio termina con su propia versión de las reglas.

specboot separa las tres cosas: las **skills** se instalan una vez por máquina, las **specs y estándares** van a un store privado por cliente y el **código** va al repositorio del cliente. Los cuatro agentes leen las mismas skills, y cada comando de OpenSpec dispara solo las skills de proceso que le corresponden: planificación, diff mínimo, commits revisables y quality gate.

Sirve para proyectos existentes, donde los estándares se observan del código, y para proyectos nuevos, donde se prescriben desde tus documentos y skills.

## Cómo funciona

```
 Tu máquina                          Store privado (git)              Repositorio del cliente
 ──────────                          ───────────────────              ───────────────────────
 ~/.specboot/        (arnés)         ~/.specboot-data/stores/<cliente>/
   skills, CLI, plantillas             openspec/                 ◄──── openspec   (enlace, oculto a git)
 ~/.claude/skills ┐                      specs/, changes/              docs/      (oculta a git por defecto)
 ~/.agents/skills ┘ enlaces              standards/                    código     (lo único que se versiona)
 regla global de cada agente           docs/ (respaldo)
```

| Pieza | Dónde vive | Qué es |
|-------|-----------|--------|
| Arnés | `~/.specboot/` | Este repositorio: CLI, skills de flujo, plantillas, presets |
| Tus skills | Donde tú quieras | Se registran con `specboot source add <carpeta>` |
| Datos | `~/.specboot-data/` | Stores por cliente, skills generadas de OpenSpec, registros |
| Store de un cliente | `~/.specboot-data/stores/<cliente>/` | Repositorio git privado con `openspec/` y la copia de respaldo de `docs/` |
| Proyecto | Repositorio del cliente | Código, el enlace `openspec` y la carpeta `docs/`, ambos ocultos a git |

## Requisitos

- Node.js 20.19 o superior y git
- OpenSpec: `npm install -g @fission-ai/openspec@latest`
- Al menos un agente: Claude Code, Cursor, Codex u opencode

## Instalación

Instala la [última release](https://github.com/cenavia/specboot/releases/latest) por su tag (el ejemplo usa `v0.7.5`):

```bash
git clone https://github.com/cenavia/specboot.git ~/.specboot
cd ~/.specboot
git checkout v0.7.5
npm link
specboot install
```

`specboot install` genera las skills `openspec-*` según tu perfil de OpenSpec, enlaza todas las skills en `~/.claude/skills` y `~/.agents/skills`, escribe la regla global de cada agente e instala el pack de eficiencia (`SPECBOOT_SKIP_EFFICIENCY=1` lo omite).

Comprueba la instalación:

```bash
specboot doctor
```

## Inicio rápido

Desde la raíz del repositorio del cliente:

```bash
specboot init acme                   # crea el store "acme", enlaza openspec/ y protege el repo
specboot source add ~/mis-skills     # opcional: registra tus skills
specboot map                         # inventario, plantillas de estándares y checks
specboot doctor                      # todo en ok
```

Abre el agente en el proyecto y pídele que escriba los estándares: la skill `specboot-map` en un proyecto existente o `specboot-prescribe` en uno nuevo. A partir de ahí, cada cambio sigue el flujo de OpenSpec.

## El flujo de un cambio

| Paso | Comando | Qué hace | Skills que dispara solo |
|------|---------|----------|--------------------------|
| 1 | `/openspec-explore` | Entiende el pedido, la arquitectura y los tradeoffs, sin código | `enrich-us`, `explain` |
| 2 | `/openspec-propose` | Crea el change: proposal, specs, design y tasks | `specboot-plan`, `enrich-us`, `playwright-qa-scenarios` |
| 3 | `/openspec-apply-change` | Implementa las tareas con tests | `ponytail`, `work-unit-commits`, `specboot check`, `update-docs` |
| 4 | `/openspec-verify-change` | Quality gate completo | `specboot check` → `adversarial-review` → `mutation-testing`? → `code-auditing`? → `judgment-day` |
| 5 | `/openspec-archive-change` | Sincroniza las specs principales y archiva | `specboot sync` |
| 6 | `/branch-pr` | Sube la rama y abre el PR | — |

Las skills se cargan aunque no las invoques: `specboot install` escribe en cada skill `openspec-*` qué debe correr antes, durante y después. Esto solo aplica en proyectos con `openspec/standards/`. El detalle está en la skill `specboot-start` §§5a–5c.

Archive solo procede si `judgment-day` terminó en `APPROVED`. Si un paso del gate falla, el arreglo vuelve a `apply` y el gate continúa desde el paso que falló.

### Ejemplo: de ticket a PR

```text
/enrich-us <ticket> # opcional 
/openspec-explore <ticket>.md
/openspec-propose
/openspec-apply-change
/openspec-verify-change
/openspec-archive-change
/branch-pr
```

| Comando | Resultado |
|---------|-----------|
| explore | Ticket, arquitectura y tradeoffs entendidos (por ejemplo, sync o async), sin código |
| propose | Change `model-gateway-stub` con proposal, specs, design y tasks |
| apply | Implementación en `feature/model-gateway-stub`, con tests, checks y commits |
| verify | Verify, `specboot check`, adversarial review, mutation testing y `judgment-day` en `APPROVED` |
| archive | Spec principal `model-gateway` sincronizada, change archivado y `specboot sync` |
| branch-pr | Rama subida y PR abierto con `Closes #<issue>` |

### Variantes según el caso

| Situación | Qué cambia |
|-----------|------------|
| Ticket vago | `/enrich-us` antes de `propose` |
| Cambio ya claro | `/openspec-ff-change` crea todos los artefactos de una vez (perfil extendido) |
| Varios cambios en paralelo | Un worktree por cambio (`using-git-worktrees`) antes de `apply` |
| Empaquetado tipo Jira | `/commit` en lugar de `/branch-pr` |
| Perfil `core` de OpenSpec | No hay `verify`: el gate empieza en `specboot check` |
| Producto o épica completa | `specboot-plan` primero: PRD, historias y backlog |

## Agentes compatibles

| Agente | Skills | Regla del arnés |
|--------|--------|-----------------|
| Claude Code | `~/.claude/skills` | `~/.claude/CLAUDE.md` |
| Codex | `~/.agents/skills` | `~/.codex/AGENTS.md` (o `$CODEX_HOME`) |
| opencode | `~/.agents/skills` | `~/.config/opencode/AGENTS.md` (o `$XDG_CONFIG_HOME`) |
| Cursor | `~/.agents/skills` | `.cursor/rules/specboot.mdc` en cada proyecto, oculta a git. La escriben `init`, `link` y `map` |

Abre una sesión nueva del agente después de `install` o `link`: las skills se cargan al iniciar.

## Comandos

| Comando | Qué hace |
|---------|----------|
| `specboot install [--adopt]` / `uninstall` | Enlaza skills, regla global y **siempre** el efficiency pack (ponytail, caveman, codegraph, rtk, headroom). Omitir pack: `SPECBOOT_SKIP_EFFICIENCY=1`. Las `openspec-*` que OpenSpec 2.x deja en las carpetas de los agentes se reemplazan solas (con respaldo); `--adopt` hace lo mismo con cualquier otra carpeta que ocupe un nombre gestionado |
| `specboot source add <ruta>` / `remove <ruta>` / `list` | Registra una carpeta con tus skills |
| `specboot preset list` / `show` / `create` / `update` / `apply` / `attach` / `remove` | Presets de máquina; `apply` / `create --apply` fusionan al store del cliente |
| `specboot init <cliente> [--remote <url>] [--fronts <archivo> \| --stack <tech>] [--new\|--existing] [--docs local\|client\|store] [--gitignore]` | Prepara el proyecto actual |
| `specboot link` | Recrea los enlaces en un worktree nuevo y actualiza el exclude, el hook `pre-commit` y la regla de Cursor (`.cursor/rules/specboot.mdc`) |
| `specboot docs [local\|client\|store]` | Muestra o fija dónde vive `docs/` |
| `specboot doc add <archivo> [--front <nombre>]` / `remove <archivo>` / `list` | Registra un documento de arquitectura |
| `specboot mode [greenfield\|brownfield]` | Muestra o cambia el modo |
| `specboot detect [--json] [--write] [--preset] [--dry-run] [--force] [--apply] [--replace-fronts] [--sync]` | Stack; preset de máquina; `--apply` merge a `fronts.json` del store |
| `specboot map [--accept]` | Regenera el inventario, crea plantillas, sincroniza `checks.json` y actualiza exclude, hook y regla de Cursor; `--accept` acepta las versiones actuales de skills y documentos |
| `specboot check [--list] [--strict]` | Ejecuta `checks.json` |
| `specboot sync [-m <mensaje>]` | Confirma tu trabajo, trae el del equipo y sube |
| `specboot pull` | Trae el trabajo del equipo sin subir |
| `specboot doctor [--strict]` | Verifica máquina y proyecto |

## Skills del arnés

| Skill | Cuándo |
|-------|--------|
| `specboot-start` | Antes de cualquier cambio en un proyecto con `openspec/` |
| `specboot-plan` | Producto, épica o funcionalidad grande: PRD, historias, backlog |
| `specboot-prescribe` | Proyecto nuevo: escribir los estándares |
| `specboot-map` | Proyecto existente: mapear; proyecto nuevo con código: verificar |
| `enrich-us` | Afinar una historia vaga |
| `work-unit-commits` | Partir la implementación en commits revisables (tests/docs con el comportamiento) |
| `chained-pr` | PR que puede pasar de ~400 líneas, o PRs apilados |
| `branch-pr` | Abrir o preparar el PR según la política del repositorio destino |
| `adversarial-review` | Red-team del change (sesión fresca); parte del quality gate |
| `judgment-day` | Juicio final (doble review); parte del quality gate antes de archivar |
| `openspec-*` | Generadas por `specboot install` según el perfil OpenSpec (`core` = 6, extendido = 12). El arnés trae `openspec-sync-specs` solo como respaldo para OpenSpec 1.x; la generada tiene prioridad |

## Configuración y conceptos

| Tema | Documento |
|------|-----------|
| Orden de autoridad, archivos de estándares, etiquetas `[observed]`/`[prescribed]` | [docs/standards.md](docs/standards.md) |
| `fronts.json` y `checks.json` | [docs/configuration.md](docs/configuration.md) |
| Documentos de arquitectura, overrides y ubicación de `docs/` | [docs/architecture-docs.md](docs/architecture-docs.md) |
| Proyecto nuevo, existente, traspaso y planificación | [docs/workflows.md](docs/workflows.md) |
| Store compartido con el equipo y protección del repositorio | [docs/team-and-safety.md](docs/team-and-safety.md) |

## Actualizar y desinstalar

```bash
cd ~/.specboot
git fetch --tags && git checkout <nuevo-tag>
npm link && specboot install
```

En cada proyecto, después: `specboot link` y `specboot doctor`. Para volver atrás, haz `checkout` del tag anterior y repite `npm link && specboot install`. El [CHANGELOG](CHANGELOG.md) indica los pasos propios de cada versión.

`specboot uninstall` quita los enlaces y la regla global. Tus stores en `~/.specboot-data/` no se tocan.

## Preguntas frecuentes

**¿Qué ve el cliente en su repositorio?** Solo código. `openspec`, `docs/` y los archivos de agentes están en `.git/info/exclude`, y el hook `pre-commit` rechaza añadirlos incluso con `git add -f`. Si el cliente debe ver `docs/`, usa `specboot docs client`.

**¿Mis compañeros quedan protegidos?** No automáticamente: el exclude y el hook son locales a cada clon. Cada uno ejecuta `specboot init <cliente> --remote <url-privada>`, u opcionalmente usas `--gitignore`. Ver [docs/team-and-safety.md](docs/team-and-safety.md).

**¿Qué pasa si no tengo remoto para el store?** El store existe solo en tu máquina. `init` y `doctor` lo avisan; `doctor --strict` falla.

**`doctor` dice que hay nombres de skill ocupados por otras carpetas.** Normalmente significa que instalaste desde dos copias distintas de specboot. Ejecuta `install` desde la misma copia a la que apunta el comando `specboot` antes de pensar en `--adopt`.

**¿Funciona con OpenSpec 1.x?** Sí, pero se recomienda 2.x con perfil extendido. Ver [UPGRADE-OPENSPEC-2.md](UPGRADE-OPENSPEC-2.md).

## Documentación

| Documento | Para qué |
|-----------|----------|
| [CHEATSHEET.md](CHEATSHEET.md) | Guía rápida de instalación y uso |
| [GUIA-GREENFIELD.md](GUIA-GREENFIELD.md) | Proyecto nuevo: presets (escenarios), CLI, `init` con specs/skills/IA ocultos al cliente, prescribe → handoff |
| [GUIA-BROWNFIELD.md](GUIA-BROWNFIELD.md) | Proyecto existente canónico: init → detect/apply → map → sync (`docs local`, specs ocultas) |
| [GUIA-PRESETS.md](GUIA-PRESETS.md) | Manifiestos, topics-pack, CRUD + `apply` al store |
| [GUIA-INSTALACION-EQUIPO.md](GUIA-INSTALACION-EQUIPO.md) | Onboarding del equipo en un proyecto existente: máquina frente a repositorio y qué tag usar |
| [UPGRADE-OPENSPEC-2.md](UPGRADE-OPENSPEC-2.md) | Pasar de OpenSpec 1.x a 2.x con perfil extendido |
| [CHANGELOG.md](CHANGELOG.md) | Cambios por versión |

## Estructura del repositorio

```
bin/specboot.mjs              CLI fino (dispatch + help)
lib/                          CLI por dominio (paths, util, detect, skills, preset, store-fronts, install, project)
skills/                       skills de flujo del arnés
scripts/efficiency/           pack de eficiencia (bash + PowerShell; lo corre `specboot install`)
templates/standards/          plantillas de los documentos de estándares
presets/                      ejemplos de fronts.json
docs/                         referencia: estándares, configuración, flujos, equipo
```

## Licencia y créditos

MIT.

`enrich-us` y `adversarial-review` están adaptadas de [lidr-specboot](https://lidr.co/ia-devs) (LIDR.co, licencia MIT).

`work-unit-commits`, `chained-pr`, `branch-pr` y `judgment-day` son skills portables Apache-2.0 tomadas de Gentle AI (`internal/assets/skills/`); no incluyen las variantes `gentle-ai-*` específicas de ese repositorio.
