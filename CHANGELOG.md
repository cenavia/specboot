# Changelog

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
