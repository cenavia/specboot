# Trabajo en equipo y protección del repositorio

[← README](../README.md)

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

## Protección del repositorio del cliente

- **`.git/info/exclude`** oculta `openspec`, `.claude/`, `.cursor/`, `.codex/`, `.opencode/`, `.agents/`, `.atl/`, `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `codex.md`, y `docs` salvo en ubicación `client`.
- **Regla de Cursor.** Cursor guarda sus User Rules en su configuración, no en un archivo, así que `init`, `link` y `map` escriben la regla del arnés como regla de proyecto en `.cursor/rules/specboot.mdc` (`alwaysApply: true`). Vive bajo `.cursor/`, que ya está oculto y bloqueado. Si ya existe un archivo con ese nombre que no es de specboot, no se toca.
- **Hook `pre-commit`** rechaza commits que añadan esos archivos, incluso con `git add -f`. Solo bloquea archivos nuevos.
- **Ambos son locales a tu clon.** Un compañero que clone el repositorio no queda protegido. Para protegerlos a todos: `specboot init <cliente> --gitignore` añade `/openspec` (y `/docs` si es privado) al `.gitignore` versionado. Eso hace visible el nombre de la carpeta en el repositorio del cliente; por eso es opcional.
- Si el repositorio usa `core.hooksPath` (Husky), el hook no se instala. Si ya hay un `pre-commit`, se escribe `pre-commit.specboot` al lado.
- Las firmas de coautoría que añaden los agentes se configuran en cada herramienta.

**Respaldo.** Sin remoto, el store existe solo en tu máquina. `init` y `doctor` lo avisan; `doctor --strict` falla.
