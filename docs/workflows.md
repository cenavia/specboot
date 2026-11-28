# Proyectos nuevos, existentes y planificación

[← README](../README.md)

## Proyecto nuevo y traspaso

1. `specboot init` marca el proyecto como nuevo si no hay código.
2. La skill `specboot-prescribe` lee overrides, documentos y skills base; arma la tabla de decisiones; pregunta solo lo que ningún documento cierra; registra la política de esqueleto (completo o mínimo ejecutable, con lo aplazado en una lista) y escribe los estándares.
3. El primer cambio de OpenSpec crea el esqueleto: carpetas, linter, pruebas y CI.
4. **Traspaso obligatorio.** Cuando hay código versionado bajo los frentes, `map` y `doctor` avisan «handoff due». Antes del siguiente cambio: la skill `specboot-map` verifica el código contra lo prescrito y completa lo que ya no es «Not defined yet», y luego `specboot mode brownfield`.

## Proyecto existente

Orden canónico (detalle: [GUIA-BROWNFIELD.md](../GUIA-BROWNFIELD.md), [CHEATSHEET.md](../CHEATSHEET.md) §4):

1. `specboot init <cliente> --existing --docs local --remote <url>` — store, enlace, exclude/hook.
2. Opcional: `specboot detect --preset` (plantilla en máquina) y `specboot detect --preset --apply` (merge a `openspec/standards/fronts.json` del store; commit local; `--sync` para push).
3. La skill `specboot-map` escribe los estándares a partir del código, con evidencia por regla.
4. `specboot check` (línea base) y `specboot sync`.
5. Si hay documentos de arquitectura, describen el objetivo y el código la realidad. Las contradicciones se reportan como desviación y tú decides.

Capas: preset de máquina ≠ `fronts.json` del store. No uses `--apply` antes de `init`.

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
