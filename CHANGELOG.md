# Changelog

## 0.7.5

Presets desde detect, apply al store, CLI modular y docs canónicas. Para actualizar: `git fetch --tags && git checkout v0.7.5 && npm link && specboot install`.

- **Fix:** `specboot install` fallaba tras la modularización (`ReferenceError: os is not defined`, luego `linkDir is not defined`). Se restauran los imports de `node:os` y `linkDir` en `lib/install.mjs`.
- **`preset apply` / `detect --preset --apply`:** el preset de máquina se puede fusionar en `openspec/standards/fronts.json` del store del cliente registrado (merge por defecto; conserva `mode`/`docs`/`planning`/`documents`; `--replace-fronts` solo reemplaza frentes; commit local del store; `--sync` hace push). Módulo: `lib/store-fronts.mjs`.
- **Docs canónicas:** [CHEATSHEET.md](CHEATSHEET.md) §0/§3/§4, [GUIA-BROWNFIELD.md](GUIA-BROWNFIELD.md), [GUIA-PRESETS.md](GUIA-PRESETS.md), [docs/workflows.md](docs/workflows.md) y onboarding de equipo alineados al orden init → detect/apply → map → sync.
- **Modularización del CLI:** el monolito `bin/specboot.mjs` pasa a un bin fino + módulos en `lib/` (`paths`, `util`, `detect`, `skills`, `preset`, `install`, `project`). Misma CLI; `lib/app.mjs` reexporta la superficie pública para tests.
- **`specboot detect --preset`** (alias `--from-detect`; también `preset create --from-detect`): mapea el stack detectado a IDs de preset, escribe `fronts.*.json` cuando hay manifesto/skills, y reporta **gaps** con opciones concretas (buscar/instalar plugin, crear manifesto, o skills `<tech>-*` + `--heuristic`). `--dry-run` solo planifica; `--force` escribe aunque falten skills declaradas. Guía: [GUIA-BROWNFIELD.md](GUIA-BROWNFIELD.md).
- **`specboot preset` CRUD:** `list` / `show` / `create` / `update` / `apply` / `attach` / `remove`. `show` solo lee generados; `--resolve` previsualiza. `update` regenera (exige archivo salvo `--force`). `apply` fusiona al store. `attach --topics-from` añade packs a un preset existente.
- **Presets multi-tech + topics-pack:** `create go,react` o `create go,python,java,react --topics-from ai --attach-to python`. Colisiones de frente se desambiguan; packs (`kind: topics-pack`) expanden varios `topicPrefixes` (p. ej. ai-dev).
- **`init --stack`** acepta varios techs y packs; flags `--topics-from` / `--attach-to`.
- Manifestos de ejemplo: `presets/manifests/{go,react,python,java,ai}.specboot.preset.json`. Guía: [GUIA-PRESETS.md](GUIA-PRESETS.md).

## 0.7.4

Los comandos de OpenSpec disparan solos las skills del arnés. Para actualizar: `git fetch --tags && git checkout v0.7.4 && npm link && specboot install`.

- **Bindings dentro de las skills `openspec-*`.** `install` escribe en cada skill generada una sección `## specboot bindings` con lo que va antes, durante y después (por ejemplo, `openspec-verify-change` continúa con `specboot check` → `adversarial-review` → `judgment-day`, y `openspec-archive-change` exige el gate aprobado y termina con `specboot sync`). Al estar en la skill misma, aplica igual en Claude Code, Cursor, Codex y opencode, aunque el comando se invoque directamente. Solo actúa en proyectos con `openspec/standards/`.
- **Quality gate: qué hacer cuando un paso falla.** `specboot-start` §5c indica a qué paso volver según dónde va el arreglo (código, artefactos OpenSpec o documentación).
- **`config.yaml`:** la guía de `archive` ahora exige también `judgment-day` en `APPROVED` (se aplica con `specboot detect --write` o `specboot map`).
- **Fix:** `update-docs` apuntaba a un archivo que el arnés no crea; `code-auditing` no tenía descripción que la activara; referencias a `ai-specs/` de otro proyecto; fila `apply` del cheatsheet sin `ponytail`.

## 0.7.3

Regla de Cursor sin pasos manuales. Para actualizar: `git fetch --tags && git checkout v0.7.3 && npm link && specboot install`, y en cada proyecto `specboot link`.

- **Regla de Cursor automática por proyecto.** Cursor guarda las User Rules en su configuración (sincronizada con la cuenta), no en un archivo, así que `install` solo podía pedir que se pegaran a mano. Ahora `init`, `link` y `map` escriben la regla del arnés en `.cursor/rules/specboot.mdc` con `alwaysApply: true`, una regla de proyecto documentada por Cursor. Vive bajo `.cursor/`, que el exclude y el hook `pre-commit` ya mantienen fuera del repositorio del cliente. Se reescribe cuando cambia la regla del arnés; un archivo con ese nombre que no lleve la marca de specboot no se toca.
- **`doctor`** avisa si la regla de Cursor falta, está desactualizada o el archivo no es de specboot.
- **`install`** ya no pide pegar nada en Cursor; sigue mostrando el texto solo para quien quiera la regla también fuera de los proyectos con specboot.
- Se descartó escribir en `~/.cursor/rules/`: Cursor no documenta que cargue reglas desde ahí.

## 0.7.2

Compatibilidad con OpenSpec 2.x y protección real de proyectos preparados con un arnés anterior. Para actualizar: `git fetch --tags && git checkout v0.7.2 && npm link && specboot install`, y en cada proyecto `specboot link` (o `specboot map`).

- **Fix: skills `openspec-*` con OpenSpec 2.x.** OpenSpec 2.x instala sus skills en la carpeta personal (`~/.agents/skills`, `~/.claude/skills`) y no en el proyecto, así que `install` informaba `generated 0`, dejaba vacía `generated-skills` y en cada ejecución OpenSpec reescribía las carpetas de los agentes. Ahora `openspec init` corre con un `HOME` temporal (la configuración global, con el perfil y los workflows, se sigue leyendo del sitio real) y se generan de nuevo las 6 (core) o 12 (extendido). OpenSpec 1.x sigue funcionando.
- **Fix: falso FAIL de `openspec-sync-specs` en `doctor`.** La copia del arnés (generada con OpenSpec 1.3.1) chocaba con la de OpenSpec 2.x. Ahora la skill generada tiene prioridad y la del arnés queda solo como respaldo para OpenSpec 1.x core, que no la genera.
- **`install` se hace cargo de las `openspec-*` que dejó OpenSpec.** Las carpetas o enlaces `openspec-*` con `author: openspec` en las carpetas de los agentes se respaldan en `~/.specboot-data/backups/<fecha>/` y se reemplazan por los enlaces del arnés.
- **Nuevo `specboot install --adopt`.** Hace lo mismo con cualquier otra carpeta que ocupe un nombre que specboot gestiona (por ejemplo `branch-pr` o `judgment-day` instaladas por otra herramienta). Sin `--adopt`, `install` lista cada choque con su ruta y sale con código 1.
- **`doctor` explica los choques.** En lugar de repetir `run: specboot install` (que no los arreglaba), indica qué ruta ocupa el nombre, si es un enlace o una carpeta, si la instaló OpenSpec, y propone `specboot install --adopt`.
- **Fix: exclude y hook desactualizados pasaban `doctor`.** Un proyecto preparado antes de 0.7 no tenía `/.codegraph/` en `.git/info/exclude` ni en el hook `pre-commit`, y `doctor` solo comprobaba que el bloque existiera. Ahora `doctor` compara con la lista actual y falla nombrando lo que falta; `specboot link` y `specboot map` reescriben exclude y hook siempre.

## 0.7.1

Correcciones del efficiency pack, sobre todo en Windows. Para actualizar: `git fetch --tags && git checkout v0.7.1 && npm link && specboot install`.

- **Fix (Windows): scripts que no arrancaban en PowerShell 5.1.** `install-codegraph.ps1`, `install-rtk.ps1` e `install-headroom.ps1` tenían un guion largo (`—`) dentro de cadenas con comillas dobles. PowerShell 5.1 lee los `.ps1` sin BOM como Windows-1252 y uno de esos bytes se convierte en una comilla, así que el script no se podía analizar y codegraph, rtk y headroom no se instalaban. Todos los `.ps1` del pack son ahora ASCII puro.
- **Fix (Windows): `SKILL.md` con BOM.** `Set-Content -Encoding utf8` añade BOM en 5.1 y el frontmatter dejaba de empezar por `---`. `Eff-WriteSkill` escribe UTF-8 sin BOM, y `specboot` ignora un BOM al leer el nombre de cualquier skill.
- **Fix (Windows): éxito falso y posible cuelgue.** Los comandos nativos no lanzan excepción con código de salida distinto de 0, así que los `try/catch` informaban `ok` aunque fallaran. Ahora se comprueba `$LASTEXITCODE` (`Eff-RunQuiet`). El instalador de caveman corre con stdin desde `NUL` (`Eff-RunNoInput`) para no quedarse esperando una pregunta invisible. Se refresca el PATH tras instalar codegraph, rtk y headroom.
- **Fix: códigos de salida.** Cada instalador (bash y PowerShell) sale con 1 si reportó `FAIL`, y `install-all.sh` informa el código real (antes siempre decía «exited 0»).
- **Fix: `doctor` comprueba rtk con `rtk gain`**, igual que el instalador, para no aceptar otro programa llamado `rtk`.
- **Fix: caveman exige Node 22.13+** de verdad (antes solo comprobaba la versión mayor 22).

## 0.7.0

- **Núcleo de entrega:** las skills `work-unit-commits`, `chained-pr` y `branch-pr` (portables, Apache-2.0) pasan a vivir en `skills/` del arnés y forman parte del ciclo en `specboot-start`, CHEATSHEET y README. Un `specboot install` las enlaza a todos los agentes sin un repo de skills aparte.
- **Cableado comando → skills:** `specboot-start` define bindings core (6) y extendido (12): cada comando OpenSpec carga también las skills de proceso del arnés. Quality gate / `verify`: `openspec-verify-change` (extendido) → `specboot check` → `adversarial-review` → `judgment-day` (juicio final). Skill `judgment-day` añadida al arnés.
- **Inventario completo del arnés alineado a OpenSpec:** §5a lista cada skill del core SpecBoot (función + si enlaza a un comando). §5b amplía must/when para `apply` (worktrees, Playwright, commits/PR/docs), quality gate (`mutation-testing`, `code-auditing`) y entradas `quick-change` / `factory`.
- **Docs:** `UPGRADE-OPENSPEC-2.md` — pasos máquina/proyecto para OpenSpec 1.x → 2.x con perfil extendido y quality gate SpecBoot.
- **Efficiency pack en `specboot install`:** siempre ejecuta el pack (ponytail, caveman, codegraph, rtk, headroom) salvo `SPECBOOT_SKIP_EFFICIENCY=1`. Skills en `~/.specboot-data/efficiency-skills/`. Regla global + `doctor` (sección Efficiency). Exclude `.codegraph/`.
- **Efficiency pack multiplataforma:** macOS/Linux → `install-all.sh`; Windows → `install-all.ps1` (winget para rtk, `install.ps1` para codegraph). No requiere Git Bash en Windows.
- **Fix:** `codegraph install -y` en el pack (antes pedía prompt y colgaba `specboot install`).
- **Fix:** `rtk init -g --auto-patch --no-trust-filters` (antes `rtk init -g` pedía prompt y colgaba).
- **Fix:** codegraph/rtk ya no ocultan stdio en el wire; si falla lo no-interactivo y hay TTY, piden confirmación visible y el pack avanza al confirmar.
- **Docs:** `GUIA-INSTALACION-EQUIPO.md` — onboarding: instalar arnés en máquina primero, luego `init` en el proyecto existente.

## 0.6.1

- **Corrección: las skills de planificación no quedaban integradas.** Solo `init` configuraba `planning`, así que un proyecto creado antes de la v0.6, o antes de registrar el plugin `plan`, se quedaba sin ellas y nada lo avisaba. Ahora cada `specboot map` las añade en cuanto están instaladas, `doctor` avisa si faltan con el comando exacto para registrarlas, y `project-facts.md` explica qué hacer mientras no estén. Una lista escrita a mano se respeta y `{"disabled": true}` apaga la planificación.


## 0.6.0

- **`docs/` local e ignorada por defecto.** Nueva ubicación `local`: carpeta real dentro del proyecto del cliente, oculta con el exclude y protegida por el hook. `specboot sync` la respalda en el store y trae los cambios del equipo; un manifiesto por máquina propaga también los borrados. En worktrees secundarios es un enlace a la del árbol principal. Si el cliente ya versiona `docs/`, se elige `client`.
- **Planificación por defecto.** Sección `planning` en `fronts.json` con las skills del plugin `plan` que estén instaladas. Nueva skill `specboot-plan` que reemplaza a `/plan:pipeline` en los cuatro agentes, con caminos greenfield y brownfield, salida en `docs/planning/` y entrega de cada elemento del backlog a OpenSpec. `specboot-start` enruta según el tamaño del pedido.
- **Trabajo en equipo.**
  - `sync` trae el trabajo del equipo (rebase) antes de subir y se detiene sin perder nada si hay conflicto.
  - Nuevo `specboot pull`.
  - `project-facts.md` sale del versionado del store.
  - `doctor` avisa si el store va por detrás o tiene commits sin subir.
  - `skillsPin` en `fronts.json` fija el commit de cada repositorio de skills; `doctor` muestra el `git checkout` exacto si no coincide.
  - `init --remote` sobre un store ya existente añade el remoto.


## 0.5.0

Resuelve los 14 tickets de `IMPROVEMENTS.md` (evidencia: proyecto Tribuvex sobre 0.4.0).

| Ticket | Cambio | Dónde |
|--------|--------|-------|
| SB-01 | `checks.json` es la única lista que ejecuta `specboot check`. Los checks de `fronts.json` se sincronizan en ella con `source: front`; los descubiertos con `source: project`; los manuales con `source: user`. Un `checks.json` vacío se rellena solo. README, ayuda, plantilla base y `adversarial-review` dicen lo mismo. | `syncChecks`, `allChecks`, `cmdCheck` |
| SB-02 | `map` y `doctor` detectan «handoff due» cuando hay código versionado bajo los frentes de un proyecto aún `greenfield`. Nuevo `specboot mode brownfield`. `doctor --strict` falla. El traspaso es un paso obligatorio en `specboot-start`, `specboot-prescribe` y `specboot-map`. | `handoffDue`, `cmdMode`, skills |
| SB-03 | Nuevo `overrides.md`: tabla «término del documento → identificador a usar». Aparece primero en `project-facts.md` y en el contexto de OpenSpec. Las skills la leen antes que los documentos. | plantilla, `overrideCount`, skills |
| SB-04 | `specboot-prescribe` arma una tabla de decisiones antes de preguntar: lo que cierra un documento no se pregunta y se muestra como «closed by <documento> §<sección>». | skill |
| SB-05 | Si faltan skills base, `init`, `map` y `doctor` buscan dónde están y muestran `fix: specboot source add <carpeta> && specboot install`. `doctor` avisa si no hay ninguna fuente registrada. | `suggestSkillRoots`, `reportFronts` |
| SB-06 | Conflicto entre dos skills base = decisión explícita obligatoria. Política de esqueleto («full declared stack» o «minimum runnable») con lista de elementos aplazados; `adversarial-review` distingue aplazamiento aprobado de desviación. | `decisions.md`, skills |
| SB-07 | Preset `fronts.fastapi-react-agentic.json`: capa agéntica como `backend.topics`. README explica cuándo sí usar un frente `ai`. | presets, README |
| SB-08 | `init --gitignore` añade `/openspec` (y `/docs` privado) al `.gitignore` versionado. `init` y `doctor` avisan de que `exclude` no protege otros clones. `specboot-prescribe` lo plantea al proponer el esqueleto. | `cmdInit`, `cmdDoctor`, skill |
| SB-09 | `checks.json` se refresca en cada `map`, `check` y `doctor`: añade lo descubierto, conserva lo manual, nunca borra sin que lo pidas. | `syncChecks` |
| SB-10 | Refresco de estándares obligatorio antes de archivar si el cambio alteró carpetas, rutas, nombres o idioma. Está en `specboot-start`, en la guía de archivado de OpenSpec y como hallazgo en `adversarial-review`. | skills, `stackYaml` |
| SB-11 | Los checks propuestos usan el gestor del proyecto: `uv run`, `poetry run`, `pdm run`. | `proposeChecks` |
| SB-12 | `init` sin remoto imprime cómo respaldar el store. `doctor --strict` falla sin remoto. | `cmdInit`, `cmdDoctor` |
| SB-13 | Nuevo `skill-gaps.md`: cada regla `[assumed]` por falta de cobertura de una skill queda registrada para quien mantiene las skills. | plantilla, skill |
| SB-14 | Carpeta `docs/` con `planning/`, `architecture/`, `adr/`. `specboot docs client\|store` fija si se versiona en el repositorio del cliente o se enlaza al store privado. `doc add` guarda ahí los documentos. `link` la recrea en worktrees. `doctor` comprueba que el exclude y el hook coinciden con la elección. | `applyDocsPlacement`, `cmdDocs`, `cmdDoc` |

Compatibilidad con 0.4.0:

- Los documentos ya registrados en `openspec/standards/sources/` siguen funcionando.
- Un `checks.json` existente se conserva; sus entradas sin `source` se clasifican solas.
- `specboot map --accept-skills` sigue funcionando como alias de `--accept`.

Para actualizar un proyecto de 0.4.0: `specboot install`, y dentro del proyecto `specboot map` y `specboot doctor`.

## 0.4.0

Documentos de arquitectura propios con autoridad sobre las skills.

## 0.3.0

Fuentes de skills, frentes y modo proyecto nuevo.

## 0.2.0

Mapeo de proyectos existentes: `map`, `check`, plantillas de estándares.

## 0.1.0

Instalación global, store privado por cliente, protección del repositorio.
