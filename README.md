# specboot

Arnés global para trabajar con OpenSpec en Claude Code, Cursor, Codex y opencode sin dejar nada de IA en el repositorio del cliente.

- Las skills viven en tu máquina, no en el proyecto.
- Las specs y los estándares viven en un repositorio git privado tuyo (el *store*), enlazado al proyecto como `openspec/`.
- El repositorio del cliente solo recibe código. Un `exclude` local y un hook `pre-commit` lo protegen.
- Sirve para proyectos existentes (los estándares se observan del código) y nuevos (se prescriben desde tus documentos y skills).

Para instalar y usar paso a paso, ve a **[CHEATSHEET.md](CHEATSHEET.md)**. Este README explica cómo funciona.

## Requisitos

- Node.js 20.19 o superior y git
- OpenSpec: `npm install -g @fission-ai/openspec@latest`

## Piezas

| Pieza | Dónde vive | Qué es |
|-------|-----------|--------|
| Arnés | `~/.specboot/` | Este repositorio: CLI, skills de flujo, plantillas, presets |
| Tus skills | Donde tú quieras | Se registran con `specboot source add <carpeta>` |
| Datos | `~/.specboot-data/` | Stores por cliente, skills generadas de OpenSpec, registros |
| Store de un cliente | `~/.specboot-data/stores/<cliente>/` | Repositorio git privado con `openspec/` y la copia de respaldo de `docs/` |
| Proyecto | Repositorio del cliente | Código, el enlace `openspec` y la carpeta `docs/`, ambos ocultos a git |

## Orden de autoridad

De mayor a menor. Todo el arnés sigue este orden:

1. Reglas de agentes que el cliente ya versiona en su repositorio.
2. Tus documentos de arquitectura, corregidos por `overrides.md`.
3. Decisiones registradas en `decisions.md` y `fronts.json`.
4. El código, en un proyecto existente; las skills base de cada frente, en uno nuevo.
5. Skills genéricas de tecnología.

## Estándares del proyecto

Viven en `openspec/standards/` (dentro del store) y son lo que cada cambio debe seguir.

| Archivo | Contenido | Quién lo escribe |
|---------|-----------|------------------|
| `project-facts.md` | Inventario: modo, frentes, documentos, overrides, checks, carpetas | `specboot map` (se regenera) |
| `fronts.json` | Modo, ubicación de `docs/`, frentes con skills, decisiones y checks | Tú |
| `checks.json` | La lista única de comandos que ejecuta `specboot check` | `specboot map` la sincroniza; tú añades los tuyos |
| `base-standards.md`, `<frente>-standards.md` | Arquitectura, convenciones, pruebas, archivos de referencia | El agente; tú revisas |
| `development-guide.md`, `data-model.md`, `api-spec.md` | Guía de desarrollo, modelo de datos, contratos | El agente; tú revisas |
| `decisions.md` | Decisiones cerradas, política de esqueleto, elementos diferidos | El agente, con tus respuestas |
| `overrides.md` | Tabla «término del documento → identificador a usar» | El agente, cuando una decisión contradice un documento |
| `skill-gaps.md` | Lo que tus skills no cubrieron y hubo que asumir | El agente |
| `fronts.lock.json` | Versión de cada skill base y documento con la que se escribieron los estándares | `specboot map` |

Cada regla lleva una etiqueta y su evidencia:

- `[observed]`: vista en el código en dos o más sitios, o impuesta por una configuración.
- `[prescribed]`: viene de un documento de arquitectura, una decisión o una skill base.
- `[prescribed, deferred D-0xx]`: prescrita pero aplazada por la política de esqueleto.
- `[assumed]`: ninguna fuente la cubre; hay que confirmarla.

Estados de un documento: `draft` (vacío), `mapped` o `prescribed` (escrito por el agente), `reviewed` (confirmado por ti). Solo tú pones `reviewed`.

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

## Documentos de arquitectura y overrides

```bash
specboot doc add ruta/arquitectura.md                 # todo el proyecto
specboot doc add ruta/backend.md --front backend      # un frente
```

- Se guardan en `docs/architecture/` (o en `openspec/standards/sources/` si aún no elegiste dónde vive `docs/`).
- Lo que un documento afirma es el estándar, aunque una skill diga otra cosa. Lo que elige queda cerrado y el agente no vuelve a preguntarlo.
- Las skills solo cubren lo que el documento deja abierto.

**Overrides.** Un documento no se reescribe cada vez que el equipo decide algo distinto. Si el documento nombra un módulo `facturacion` y luego decides que el código va en inglés, se añade una fila a `overrides.md`:

| Document term | Use instead | Kind | Decision | Document and section |
|---------------|-------------|------|----------|----------------------|
| facturacion | billing | module | D-010 | arquitectura.md, Módulos |

Los agentes leen esa tabla antes que el documento y nunca reintroducen el término original.

## Carpeta `docs/`

Lugar único para planificación, arquitectura y decisiones: `docs/planning/`, `docs/architecture/`, `docs/adr/`.

| Ubicación | Resultado | Cuándo |
|-----------|-----------|--------|
| `local` (por defecto) | Carpeta real dentro del proyecto del cliente, ignorada por git. `specboot sync` la respalda en el store y trae los cambios del equipo | Casi siempre |
| `client` | Carpeta normal del repositorio del cliente, versionada con el código | El cliente debe ver esos documentos |
| `store` | Enlace al store privado | Prefieres no tener copia física en el proyecto |

Se cambia con `specboot docs local|client|store`. Si el cliente ya versiona una carpeta `docs/`, solo se admite `client` y es la que se elige sola.

Con `local`, cada máquina tiene su copia y el store guarda el respaldo. Un manifiesto por máquina distingue un archivo borrado de uno que todavía no llegó, así que los borrados también se propagan. En un worktree secundario, `docs/` es un enlace a la del árbol principal: una sola copia por máquina.

## Planificación

El plugin `plan` se aplica por defecto en proyectos nuevos y existentes. `specboot init` y cada `specboot map` añaden a `fronts.json` las skills de planificación que estén instaladas, así que un proyecto creado antes de registrar el plugin, o antes de la v0.6, las recibe en el siguiente `map`. Una lista escrita a mano se respeta; `"planning": {"disabled": true}` la apaga. `doctor` avisa si faltan y muestra el comando para registrarlas:

```json
"planning": {
  "skills": ["product-ideation-brainstorm", "breakdown-feature-prd", "project-manager"],
  "output": "docs/planning"
}
```

La skill `specboot-plan` del arnés orquesta el flujo en los cuatro agentes (el comando `/plan:pipeline` solo existe en Claude Code):

| Modo | Recorrido |
|------|-----------|
| Greenfield | Ideación → PRD del producto → historias → backlog → épicas. Después, `specboot-prescribe` usa el PRD |
| Brownfield | PRD por funcionalidad, que parte de `openspec/specs/` y los estándares → historias → backlog |

El plan termina en historias y épicas: cada elemento del backlog se convierte en un cambio de OpenSpec, que lleva sus propias tareas. `specboot-start` decide el camino según el tamaño del pedido: producto o épica → `specboot-plan`; una historia → `enrich-us` y `openspec-propose`; un cambio pequeño → directo.

## Trabajo en equipo

El store es un repositorio git. Para compartirlo, dale un remoto privado y da acceso solo a tu equipo:

```bash
git -C ~/.specboot-data/stores/acme remote add origin <url-privada>
specboot sync
```

Cada compañero instala el arnés y las mismas skills, y en su clon del repositorio del cliente ejecuta `specboot init acme --remote <url-privada>`: clona el store y restaura `docs/`.

- `specboot sync` confirma tu trabajo, trae el del equipo (rebase) y sube.
- `specboot pull` trae el del equipo sin subir.
- Si dos personas cambiaron las mismas líneas, el arnés se detiene sin perder nada e indica cómo resolverlo.
- `doctor` avisa cuando el store va por detrás del remoto; con `--strict` falla.
- `project-facts.md` no se versiona: se regenera en cada máquina.
- `fronts.json` guarda el commit de cada repositorio de skills (`skillsPin`) con el que se escribieron los estándares. Si un compañero tiene otra versión, `doctor` le muestra el `git checkout` exacto; `specboot map --accept` adopta la versión nueva para todos.

## Proyecto nuevo y traspaso

1. `specboot init` marca el proyecto como nuevo si no hay código.
2. La skill `specboot-prescribe` lee overrides, documentos y skills base; arma la tabla de decisiones; pregunta solo lo que ningún documento cierra; registra la política de esqueleto (completo o mínimo ejecutable, con lo aplazado en una lista) y escribe los estándares.
3. El primer cambio de OpenSpec crea el esqueleto: carpetas, linter, pruebas y CI.
4. **Traspaso obligatorio.** Cuando hay código versionado bajo los frentes, `map` y `doctor` avisan «handoff due». Antes del siguiente cambio: la skill `specboot-map` verifica el código contra lo prescrito y completa lo que ya no es «Not defined yet», y luego `specboot mode brownfield`.

## Proyecto existente

1. `specboot init` hace el inventario de reglas del código (linter, tipos, CI, hooks, guías, reglas de agentes del cliente).
2. La skill `specboot-map` escribe los estándares a partir del código, con evidencia por regla.
3. Si hay documentos de arquitectura, describen el objetivo y el código la realidad. Las contradicciones se reportan como desviación y tú decides.

## Protección del repositorio del cliente

- **`.git/info/exclude`** oculta `openspec`, `.claude/`, `.cursor/`, `.codex/`, `.opencode/`, `.agents/`, `.atl/`, `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `codex.md`, y `docs` salvo en ubicación `client`.
- **Hook `pre-commit`** rechaza commits que añadan esos archivos, incluso con `git add -f`. Solo bloquea archivos nuevos.
- **Ambos son locales a tu clon.** Un compañero que clone el repositorio no queda protegido. Para protegerlos a todos: `specboot init <cliente> --gitignore` añade `/openspec` (y `/docs` si es privado) al `.gitignore` versionado. Eso hace visible el nombre de la carpeta en el repositorio del cliente; por eso es opcional.
- Si el repositorio usa `core.hooksPath` (Husky), el hook no se instala. Si ya hay un `pre-commit`, se escribe `pre-commit.specboot` al lado.
- Las firmas de coautoría que añaden los agentes se configuran en cada herramienta.

**Respaldo.** Sin remoto, el store existe solo en tu máquina. `init` y `doctor` lo avisan; `doctor --strict` falla.

## Comandos

| Comando | Qué hace |
|---------|----------|
| `specboot install` / `uninstall` | Enlaza o retira las skills y la regla global |
| `specboot source add <ruta>` / `remove <ruta>` / `list` | Registra una carpeta con tus skills |
| `specboot init <cliente> [--remote <url>] [--fronts <archivo>] [--new\|--existing] [--docs local\|client\|store] [--gitignore]` | Prepara el proyecto actual |
| `specboot link` | Recrea los enlaces en un worktree nuevo |
| `specboot docs [local\|client\|store]` | Muestra o fija dónde vive `docs/` |
| `specboot doc add <archivo> [--front <nombre>]` / `remove <archivo>` / `list` | Registra un documento de arquitectura |
| `specboot mode [greenfield\|brownfield]` | Muestra o cambia el modo |
| `specboot detect [--json] [--write]` | Detecta el stack |
| `specboot map [--accept]` | Regenera el inventario, crea plantillas, sincroniza `checks.json`; `--accept` acepta las versiones actuales de skills y documentos |
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
| `adversarial-review` | Revisión antes de archivar, en una sesión nueva |
| `openspec-*` | Generadas por `specboot install` con tu versión de OpenSpec |

## Estructura del repositorio

```
bin/specboot.mjs        CLI sin dependencias
skills/                 skills de flujo del arnés
templates/standards/    plantillas de los documentos de estándares
presets/                ejemplos de fronts.json
CHEATSHEET.md           guía rápida de instalación y uso
CHANGELOG.md            cambios por versión
```

## Créditos

`enrich-us` y `adversarial-review` están adaptadas de [lidr-specboot](https://lidr.co/ia-devs) (LIDR.co, licencia MIT).
