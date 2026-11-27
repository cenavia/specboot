# Estándares del proyecto

[← README](../README.md)

## Orden de autoridad

De mayor a menor. Todo el arnés sigue este orden:

1. Reglas de agentes que el cliente ya versiona en su repositorio.
2. Tus documentos de arquitectura, corregidos por `overrides.md`.
3. Decisiones registradas en `decisions.md` y `fronts.json`.
4. El código, en un proyecto existente; las skills base de cada frente, en uno nuevo.
5. Skills genéricas de tecnología.

## Archivos

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

## Etiquetas y estados

Cada regla lleva una etiqueta y su evidencia:

- `[observed]`: vista en el código en dos o más sitios, o impuesta por una configuración.
- `[prescribed]`: viene de un documento de arquitectura, una decisión o una skill base.
- `[prescribed, deferred D-0xx]`: prescrita pero aplazada por la política de esqueleto.
- `[assumed]`: ninguna fuente la cubre; hay que confirmarla.

Estados de un documento: `draft` (vacío), `mapped` o `prescribed` (escrito por el agente), `reviewed` (confirmado por ti). Solo tú pones `reviewed`.
