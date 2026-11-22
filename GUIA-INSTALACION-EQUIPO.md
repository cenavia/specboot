# Guía de instalación SpecBoot (equipo)

Cómo dejar SpecBoot listo en tu máquina y engancharlo a un **proyecto cliente ya existente**, sin meter artefactos de IA en el git del cliente.

## Recomendación (léela primero)

| Fase | Dónde trabajar | Por qué |
|------|----------------|---------|
| **A. Máquina (una vez)** | Terminal en el **repo del arnés** (`~/.specboot` o tu clone de SpecBoot), **no** en el repo del cliente | `npm link`, skills globales, efficiency pack y reglas de agentes son de tu usuario, no del proyecto |
| **B. Proyecto (por cada cliente)** | Terminal **dentro del repo del cliente** ya clonado | `specboot init` crea store + enlace `openspec/` + exclude/hook **locales** a ese clon |

**No empieces** con `cd mi-proyecto-cliente && npm link` del arnés, ni corras `specboot install` “desde el cliente” pensando que eso configura solo ese repo: `install` es global a tu máquina.

**Sí empiezas** así:

1. Instalas/enlazas SpecBoot en la máquina (Fase A).
2. Entras al proyecto existente (Fase B) y ejecutas `specboot init`.

```text
[ terminal / home ]     clone o npm link del arnés → source add → specboot install → doctor
           ↓
[ repo del cliente ]    cd proyecto-existente → specboot init → doctor → skill specboot-map
```

---

## Quick path (proyecto existente, Mac/Linux)

Sustituye URLs y rutas por las de tu equipo.

```bash
# ——— FASE A (máquina; fuera del cliente) ———
node --version                                          # >= 20.19
npm install -g @fission-ai/openspec@latest

# Opción recomendada para el equipo: clone canónico
git clone <url-privada-specboot> ~/.specboot
cd ~/.specboot && npm link

# Si desarrollas el arnés en otro path (ej. Documents/projects/specboot):
#   cd /ruta/a/specboot && npm link
# (mismo efecto: comando `specboot` global; no uses el repo del cliente)

specboot source add <ruta-a-tu-carpeta-de-skills>       # la que el equipo acuerde
specboot install                                        # enlaza skills + efficiency pack
specboot doctor                                         # sin proyecto: valida máquina

# ——— FASE B (dentro del proyecto existente) ———
cd /ruta/al/proyecto-cliente
specboot init <cliente> --remote <url-git-privada-del-store-de-specs>
specboot doctor
specboot check --list
```

En el agente: «Ejecuta la skill `specboot-map`» → revisas `[assumed]` → `specboot check` → `specboot sync -m "standards: map project"`.

En **Cursor**, tras `install`: Settings → Rules → User Rules → pega el bloque que imprimió `specboot install`.

---

## Fase A — Instalación en la máquina

### Requisitos

| Requisito | Notas |
|-----------|--------|
| Node.js **20.19+** | `node --version` |
| git | |
| OpenSpec global | `npm install -g @fission-ai/openspec@latest` |
| Agentes que uses | Claude Code, Cursor, Codex y/o opencode |
| (Windows) PowerShell | El efficiency pack usa `.ps1`; no hace falta Git Bash |

### Dónde clonar el arnés

| Opción | Cuándo | Comandos |
|--------|--------|----------|
| **`~/.specboot` (recomendada para el equipo)** | Uso diario; path estable; coincide con la cheatsheet | `git clone <url> ~/.specboot && cd ~/.specboot && npm link` |
| **Clone de desarrollo** (otro path) | Mantenedores del arnés | `cd <tu-clone> && npm link` — el comando queda global igual |
| **Dentro del repo del cliente** | **No** | Contamina el mental model y no aporta nada: el arnés no vive en el cliente |

Tras `npm link`, `specboot` debe resolverse en cualquier directorio:

```bash
which specboot
specboot --help    # o el subcomando que documente tu versión
```

### Skills del equipo

Las skills **tuyas / del equipo** (plugins) no se copian a mano a `~/.claude/skills`. Se registran una vez:

```bash
specboot source add ~/code/agents/plugins    # ejemplo; usa la ruta acordada
specboot source list
```

Cada skill válida tiene un `SKILL.md` con `name:` y `description:`.

### `specboot install` (global)

Desde **cualquier** cwd (idealmente desde `~/.specboot` tras el link):

```bash
specboot install
```

Hace, entre otras cosas:

- Genera skills `openspec-*` según el perfil OpenSpec instalado
- Enlaza skills del arnés + sources a Claude / Cursor / Codex / opencode
- Escribe o actualiza reglas globales de agentes
- **Siempre** corre el **efficiency pack** (ponytail, caveman, codegraph, rtk, headroom), salvo:

```bash
SPECBOOT_SKIP_EFFICIENCY=1 specboot install
```

| Plataforma | Cómo corre el pack |
|------------|--------------------|
| macOS / Linux | `scripts/efficiency/install-all.sh` (bash) |
| Windows | `scripts/efficiency/install-all.ps1` (PowerShell) |

Si un instalador pide confirmación en TTY, **confirma** y el pack sigue. Los wires principales van en modo no interactivo para no colgar en CI/redirigidos.

Repite `specboot install` cuando actualices OpenSpec, el arnés o las skills del equipo.

### Verificar la máquina

```bash
specboot doctor
```

Opcional por repo (después de Fase B): `codegraph init` en el proyecto; mantén `.codegraph/` fuera del git del cliente.

Detalle del pack: [`scripts/efficiency/README.md`](scripts/efficiency/README.md).

---

## Fase B — Proyecto cliente ya existente (brownfield)

Trabaja **siempre** con la cwd en la raíz del repo del cliente.

```bash
cd /ruta/al/proyecto-existente

# 1. Inicializar SpecBoot en este clon
specboot init <cliente> --remote <url-git-privada-de-specs>

# 2. docs/ local e ignorada por defecto. Solo si el cliente debe versionar docs:
# specboot docs client

# 3. Opcional: arquitectura objetivo y frentes
# specboot doc add ~/ruta/arquitectura.md
# edita openspec/standards/fronts.json si aplica

# 4. Salud del enlace
specboot doctor
specboot check --list
```

| Pieza | Dónde queda | ¿En el git del cliente? |
|-------|-------------|-------------------------|
| Store de specs | `~/.specboot-data/stores/<cliente>/` | No (repo privado aparte) |
| `openspec/` en el proyecto | Symlink/enlace al store | No (exclude local; opcional `--gitignore`) |
| `docs/` (default `local`) | Carpeta real en el proyecto | No (exclude) |
| Código de producto | El repo del cliente | Sí |

### Después del `init` (con el agente)

| Paso | Acción | Resultado |
|------|--------|-----------|
| 1 | «Ejecuta la skill `specboot-map`» | Estándares desde el código + evidencia |
| 2 | Revisas `[assumed]` y desviaciones vs tu doc | `status: reviewed` donde corresponda |
| 3 | `specboot check` | Línea base antes de cambiar código |
| 4 | `specboot sync -m "standards: map project"` | Store compartido con el equipo |

En brownfield **manda el código**. Tu documento de arquitectura es el objetivo; las contradicciones se reportan y alguien del equipo decide.

Guía corta de flujos: [`CHEATSHEET.md`](CHEATSHEET.md) §4. OpenSpec 1.x → 2 extendido: [`UPGRADE-OPENSPEC-2.md`](UPGRADE-OPENSPEC-2.md).

---

## Compañero nuevo en un proyecto ya SpecBoot

El lead ya dejó un store remoto. Tú:

1. Completas **Fase A** en tu máquina (mismo arnés + mismas skills + mismo pin si `doctor` lo pide).
2. Clonas el **repo del cliente** (código).
3. En ese clon:

```bash
specboot init <cliente> --remote <url-privada-del-store>
specboot pull
specboot doctor
```

Día a día: `specboot pull` al empezar; `specboot sync -m "..."` al cerrar trabajo de specs.

Si el exclude solo era local y el compañero ve `openspec/` sin ignorar: el lead puede usar `specboot init <cliente> --gitignore` (hace visible el nombre de carpeta en el `.gitignore` versionado; es opcional a propósito).

---

## Qué no hacer

| Anti-patrón | Qué pasa | Qué hacer |
|-------------|----------|-----------|
| Instalar el arnés “dentro” del repo cliente | Confunde ownership; no protege al cliente | Clone/`npm link` solo del arnés |
| Copiar skills a mano a `~/.claude/skills` | Se desincronizan | `specboot source add` + `install` |
| Commitear `openspec/`, `.claude/`, `docs/` privadas | Contaminas el repo del cliente | Confía en exclude/hook; usa store remoto |
| Empezar cambios sin `specboot-map` en brownfield | Estándares vacíos o inventados | Map → review → check → sync |
| Saltar `doctor` tras `install` / `init` | Fallos silenciosos de PATH, sources o remote | `specboot doctor` (y `--strict` si el equipo lo exige) |

---

## Checklist de onboarding

### Máquina

- [ ] Node ≥ 20.19 y OpenSpec global
- [ ] Arnés en `~/.specboot` (o clone de dev) + `npm link`
- [ ] `specboot source add` a la carpeta de skills del equipo
- [ ] `specboot install` terminó (incl. efficiency pack o skip explícito)
- [ ] Regla de Cursor pegada si usas Cursor
- [ ] `specboot doctor` OK a nivel máquina

### Proyecto existente

- [ ] Estás en la raíz del repo del cliente
- [ ] `specboot init <cliente> --remote <url>` OK
- [ ] `openspec/` enlazado; `doctor` OK
- [ ] Skill `specboot-map` corrida y estándares revisados
- [ ] `specboot check` (línea base anotada)
- [ ] `specboot sync` (o `pull` si solo consumes)
- [ ] (Opcional) `codegraph init` en el repo; `.codegraph/` no versionado

---

## Problemas frecuentes en la instalación

| Síntoma | Qué suele ser | Arreglo |
|---------|---------------|---------|
| `specboot: command not found` | No hiciste `npm link` o PATH de npm global | `cd` al arnés → `npm link`; nueva shell |
| Pack “colgado” en codegraph/rtk | Prompt interactivo sin flags / salida oculta | Actualiza arnés; Ctrl+C; `specboot install` de nuevo |
| Skills en `fronts.json` no instaladas | Falta `source add` | Ejecuta el `fix:` que imprime `doctor` |
| `store has no remote` | Specs solo locales | Añade `origin` al store y `specboot sync` |
| Worktree sin `openspec/` | Enlaces no versionados | `specboot link` |
| Companion sin protección git | Exclude/hook son locales al clon | `init --gitignore` acordado por el equipo |

Más casos: [`CHEATSHEET.md`](CHEATSHEET.md) §9.

---

## Next step

1. Termina Fase A y pega la regla de Cursor si aplica.
2. En tu proyecto existente: Fase B + `specboot-map`.
3. Para el ciclo diario de cambios (propose → apply → verify → archive): [`CHEATSHEET.md`](CHEATSHEET.md) §5 y la skill `specboot-start`.
