# Documentos de arquitectura y carpeta `docs/`

[← README](../README.md)

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

## Carpeta `docs/` del proyecto

Lugar único para planificación, arquitectura y decisiones: `docs/planning/`, `docs/architecture/`, `docs/adr/`.

| Ubicación | Resultado | Cuándo |
|-----------|-----------|--------|
| `local` (por defecto) | Carpeta real dentro del proyecto del cliente, ignorada por git. `specboot sync` la respalda en el store y trae los cambios del equipo | Casi siempre |
| `client` | Carpeta normal del repositorio del cliente, versionada con el código | El cliente debe ver esos documentos |
| `store` | Enlace al store privado | Prefieres no tener copia física en el proyecto |

Se cambia con `specboot docs local|client|store`. Si el cliente ya versiona una carpeta `docs/`, solo se admite `client` y es la que se elige sola.

Con `local`, cada máquina tiene su copia y el store guarda el respaldo. Un manifiesto por máquina distingue un archivo borrado de uno que todavía no llegó, así que los borrados también se propagan. En un worktree secundario, `docs/` es un enlace a la del árbol principal: una sola copia por máquina.
