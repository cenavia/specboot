# Guía brownfield: proyecto existente (specs ocultas, docs local)

Cómo enganchar SpecBoot a un **repositorio cliente que ya tiene código**, de forma que el git del cliente **no vea specs ni configuración de agentes**, y la única documentación de planning/arquitectura viva como **`docs/` local** (carpeta real en el clon, ignorada por git).

Relacionado: [GUIA-GREENFIELD.md](GUIA-GREENFIELD.md) (proyecto nuevo), [GUIA-INSTALACION-EQUIPO.md](GUIA-INSTALACION-EQUIPO.md) (onboarding completo), [GUIA-PRESETS.md](GUIA-PRESETS.md), [docs/team-and-safety.md](docs/team-and-safety.md), [CHEATSHEET.md](CHEATSHEET.md).

---

## Escenario de esta guía (léelo primero)

| Qué | Decisión de este escenario |
|-----|----------------------------|
| Specs / OpenSpec / estándares | **Ocultos** — store privado + enlace `openspec/` + exclude + hook |
| Skills, regla Cursor, `.claude/`, `.agents/`, etc. | **En la máquina del ingeniero** (y en el clon, pero **fuera del git** del cliente) |
| Documentación SpecBoot (planning, arquitectura, ADRs) | **Solo `docs local`** — carpeta en el proyecto, **no** versionada |
| Qué entra al remoto del cliente | **Código de producto** (y, si el equipo lo acepta, opcional `--gitignore`) |

Trabajas **con la IA dentro del proyecto cliente** (Cursor / Claude Code / Codex abiertos en ese clon). Eso no implica meter artefactos de IA en el repositorio: `init` escribe exclude + hook locales.

**No uses `--docs client`** en este escenario.  
**No uses `--docs store`** si quieres la documentación como carpeta real en el clon (backup vía `sync`, no como único sitio de lectura).

### Precondición crítica de `docs/`

Si el repo del cliente **ya versiona** una carpeta `docs/`, SpecBoot **no puede** ponerla en `local` (ni `store`): chocaría con archivos trackeados. En ese caso este escenario no aplica tal cual — o el equipo deja de versionar `docs/`, o usas `specboot docs client` (otra guía / otro contrato).

Comprueba antes:

```bash
cd /ruta/al/proyecto-cliente
git ls-files -- docs | head
# vacío → puedes forzar --docs local
# con archivos → este escenario no aplica hasta acordar otra ubicación
```

---

## Qué ve el cliente vs qué queda en tu máquina

| Pieza | Dónde vive | ¿En el git del cliente? |
|-------|------------|-------------------------|
| Código de producto | Repo del cliente | **Sí** |
| Specs, estándares, changes OpenSpec | Store `~/.specboot-data/stores/<cliente>/` → enlace `openspec/` | **No** |
| `docs/` planning/arquitectura | Carpeta **local** en el clon (ignorada) | **No** |
| Skills de agentes | `~/.claude/skills`, `~/.agents/skills` (vía `specboot install`) | **No** |
| Regla Cursor del arnés | `.cursor/rules/specboot.mdc` | **No** (bajo `.cursor/`, excluido) |
| Arnés SpecBoot | `~/.specboot/` | **No** |

`specboot sync` versiona el **store** (specs + respaldo de `docs/` local). El remoto del **código** del cliente no recibe eso.

---

## Capas (canónico)

| Capa | Dónde | Comando típico |
|------|-------|----------------|
| Preset de máquina | `~/.specboot-data/presets/fronts.<id>.json` | `detect --preset` / `preset create` |
| Store del cliente | `~/.specboot-data/stores/<cliente>/` | `init`, luego `detect --preset --apply` |
| Frentes activos | `openspec/standards/fronts.json` | merge con `--apply` (no pisar `mode`/`docs`/`planning`) |
| Código | repo del cliente | OpenSpec apply / commits normales |

`detect --preset` **no** escribe al store. `--apply` sí (merge + commit local). Push solo con `--sync` o `specboot sync`.

---

## Flujo completo (mapa canónico)

```text
A. Máquina     source add → install → doctor
B. Proyecto    ls-files docs → init --existing --docs local --remote …
C. Frentes     detect --preset [--dry-run] → detect --preset --apply
D. Agente      specboot-map → review → check → sync
E. Día a día   pull → plan?/propose → apply → verify → archive → sync
```

Versión del arnés: tag **`v0.7.5`** o checkout de desarrollo + `npm link`.  
Repo: `https://github.com/cenavia/specboot.git`  
Cheatsheet: [CHEATSHEET.md](CHEATSHEET.md) §4.

---

## Quick path (canónico, paso a paso)

Sustituye `<cliente>` y `<url-store>`.

```bash
# ——— 1. Máquina (una vez / al actualizar) ———
node --version   # >= 20.19
npm install -g @fission-ai/openspec@latest

# Release:
# git clone https://github.com/cenavia/specboot.git ~/.specboot
# cd ~/.specboot && git checkout v0.7.5 && npm link
# specboot source add <carpeta-plugins> && specboot install && specboot doctor

# Desde este repo de desarrollo:
cd /ruta/a/specboot && npm link && specboot install && specboot doctor

# ——— 2. Repo existente ———
cd /ruta/al/proyecto-cliente
git ls-files -- docs | head    # vacío → ok para --docs local

# ——— 3. Init ANTES de --apply (registra el store) ———
specboot init <cliente> \
  --existing \
  --docs local \
  --remote <url-store-privada>
# Opcional si ya conoces el stack:
#   --stack go,react
#   --fronts ~/.specboot-data/presets/fronts.go-react.json

# ——— 4. Detect → preset de máquina → apply al store ———
specboot detect --preset --dry-run     # plan + gaps; no escribe
specboot detect --preset               # ~/.specboot-data/presets/fronts.<id>.json
specboot detect --preset --apply       # merge openspec/standards/fronts.json + commit store
# Alternativas:
#   specboot preset apply <id>
#   specboot preset apply --from-detect
#   … --replace-fronts   # solo sustituye el mapa fronts
#   … --sync             # además push del store

# ——— 5. Verificar ocultación ———
specboot doctor
specboot check --list
git check-ignore -v openspec docs .cursor 2>/dev/null || true
```

**6. Agente:** skill `specboot-map` → revisas `[assumed]` → `specboot check` → `specboot sync -m "standards: map project"`.

---

## Referencia CLI (comandos que usarás)

### Máquina y skills

| Comando | Qué hace |
|---------|----------|
| `specboot install` | Enlaza skills del arnés + sources; genera `openspec-*`; reglas; efficiency pack (0.7+) |
| `specboot install --adopt` | Adopta carpetas que ocupaban nombres gestionados |
| `specboot source add <ruta>` | Registra plugins de skills |
| `specboot doctor` / `doctor --strict` | Salud de máquina y del clon |

### Proyecto brownfield

| Comando | Qué hace |
|---------|----------|
| `specboot init <cliente> --existing --docs local --remote …` | Store + enlace + **exclude** + **hook** + modo brownfield + docs privadas |
| `specboot link` | Recrea enlaces/exclude/hook/regla en otro worktree |
| `specboot docs local` | Fija/confirma docs privadas en el clon (este escenario) |
| `specboot doc add\|remove\|list` | Arquitectura con autoridad (sigue viviendo bajo `docs/` local) |
| `specboot map` / `map --accept` | Inventario / plantillas; `--accept` tras cambiar pin de skills |
| `specboot check` / `check --list` | Gates del store (línea base brownfield) |
| `specboot sync -m "…"` | Commit + rebase + push del **store** (no del código cliente) |
| `specboot pull` | Trae el store sin subir |
| `specboot detect [--write] [--preset] [--dry-run] [--apply] [--replace-fronts] [--sync]` | Stack; preset de máquina; `--apply` merge al store |

Flags importantes de `init` en este escenario:

| Flag | Efecto |
|------|--------|
| `--existing` | Fuerza modo **brownfield** (el código manda) |
| `--docs local` | **Obligatorio aquí**: docs en el proyecto, ignoradas |
| `--remote <url>` | Store privado compartido (specs + backup de docs) |
| `--stack` / `--fronts` | Declara frentes/skills para mapear (opcional si hay default) |
| `--topics-from` / `--attach-to` | Packs (p. ej. `ai`) al resolver `--stack` |
| `--gitignore` | Añade `/openspec` y `/docs` al `.gitignore` **commiteable** (nombres visibles) |

---

## Escenarios de init (todos con docs local + specs ocultas)

En todos: repo **ya con código**, `git ls-files -- docs` vacío, `--docs local` explícito y `--remote` para no perder specs/docs.

### 1. Brownfield mínimo (detecta código, frentes por defecto o vacíos)

```bash
cd /ruta/proyecto-existente

specboot init acme-legacy \
  --existing \
  --docs local \
  --remote <url-store>

specboot doctor
```

Después: skill `specboot-map`. Si `fronts.json` quedó vacío, declara frentes (edición o `--stack`/`--fronts` en un `init`/`map` posterior) antes de mapear en serio.

### 1b. Detect → preset → apply (detalle)

Orden canónico: **`init` primero**, después detect/apply. Sin `init`, `--apply` falla (proyecto no registrado).

```bash
# Ya corriste: init --existing --docs local --remote …

specboot detect --preset --dry-run     # plan + gaps; no escribe
specboot detect --preset               # preset de máquina
specboot detect --preset --force       # si el manifesto declara skills aún no instaladas
specboot detect --preset --apply       # merge al store + commit local
# specboot preset apply <id>           # apply en dos pasos
# … --replace-fronts | --sync
```

Equivalencias: `preset create --from-detect` ≈ `detect --preset`; `preset apply --from-detect` ≈ detect + apply.

Si preferís declarar el stack en el `init` (sin detect):

```bash
specboot init <cliente> --existing --docs local --remote <url> \
  --stack go,react
# o: --fronts ~/.specboot-data/presets/fronts.go-react.json
```

Salida típica de un gap (no inventa skills):

```text
Gaps (search or create skills / manifests as needed):
  gap   Rust → rust @ . [missing-skills]
        No preset manifest and no installed skills matching "rust-*".
          Options:
            1) Search/install a plugin: specboot source add <path> && specboot install
            2) Add presets/manifests/rust.specboot.preset.json (or plugin specboot.preset.json)
            3) Create skills named rust-* then: specboot preset create rust --heuristic
```

### 2. Brownfield + stack declarado a mano (Go)

```bash
specboot preset create go   # si aún no tienes el JSON generado

specboot init acme-go \
  --existing \
  --stack go \
  --docs local \
  --remote <url-store>
```

### 3. Backend + frontend (Go + React)

```bash
specboot preset create go,react

specboot init acme-web \
  --existing \
  --stack go,react \
  --docs local \
  --remote <url-store>
```

### 4. Polyglot + capa IA (topics en un frente)

```bash
specboot preset create go,react --topics-from ai --attach-to backend

specboot init acme-agentic \
  --existing \
  --stack go,react,ai \
  --attach-to backend \
  --docs local \
  --remote <url-store>
```

La IA (skills LangGraph/RAG/…) vive en la **máquina** vía `install`; el pack solo se **declara** en `fronts.json` del store. Nada de eso se commitea al git del cliente.

### 5. Frentes desde JSON estático del arnés

```bash
specboot init acme-fastapi \
  --existing \
  --fronts ~/.specboot/presets/fronts.fastapi-react.json \
  --docs local \
  --remote <url-store>
```

### 6. Ya hay docs/ versionadas (este escenario NO aplica)

```bash
git ls-files -- docs | head   # hay paths
# No fuerces --docs local: init fallará o el doctor te bloqueará el cambio.
# Opciones: acordar dejar de trackear docs/, o usar docs client (otro contrato).
```

### 7. Compañero en un brownfield ya iniciado (sigue oculto en su clon)

```bash
# Tras Fase A en su máquina…
cd /ruta/clon-cliente
specboot init <cliente> --existing --docs local --remote <url-store>
specboot pull
specboot doctor
# init vuelve a poner exclude + hook locales en SU clon
```

---

## Fase A — Instalación / actualización (máquina)

Igual que greenfield: el arnés **no** vive dentro del repo cliente.

```bash
git clone https://github.com/cenavia/specboot.git ~/.specboot
cd ~/.specboot && git checkout v0.7.5 && npm link
specboot source add <ruta-plugins>
specboot install
specboot doctor
```

Skills y efficiency pack quedan en tu usuario. Detalle: [GUIA-INSTALACION-EQUIPO.md](GUIA-INSTALACION-EQUIPO.md).

---

## Fase B — Init con ocultación al cliente

```bash
cd /ruta/al/proyecto-existente
git ls-files -- docs | head

specboot init <cliente> \
  --existing \
  --docs local \
  --remote <url-store-privada>
# Opcional de equipo: --gitignore
# Opcional de frentes: --stack … o --fronts …
```

Tras el `init`, en ese clon:

1. **`.git/info/exclude`** — oculta `openspec`, `.claude/`, `.cursor/`, `.codex/`, `.agents/`, `docs`, etc. Es **local** (no se pushea).
2. **Hook `pre-commit`** — bloquea *añadir* esos paths aunque hagas `git add -f`.
3. **`openspec/`** — symlink al store privado.
4. **`docs/`** — carpeta real en el proyecto, privada; `sync` la respalda en el store.
5. **`.cursor/rules/specboot.mdc`** — regla del arnés, también excluida.

Verificación rápida:

```bash
specboot doctor
git status
git check-ignore -v openspec docs .cursor
```

Arquitectura objetivo (opcional; manda sobre skills genéricas, el código sigue mandando en brownfield):

```bash
specboot doc add ~/ruta/arquitectura.md
specboot doc add ~/ruta/backend.md --front backend
```

Esos archivos viven bajo `docs/` **local**: el cliente no los ve en git.

---

## Fase C — Agente (map → review → check → sync)

En brownfield **manda el código**. No prescritas un producto nuevo: documentas lo que existe.

| Paso | Acción | Resultado |
|------|--------|-----------|
| 1 | Skill `specboot-map` | Estándares en `openspec/standards/` con evidencia `[observed]` / `[assumed]` |
| 2 | Revisas `[assumed]` y drift vs docs de arquitectura | `status: reviewed` donde corresponda |
| 3 | `specboot check` | Línea base: anota qué ya fallaba |
| 4 | `specboot sync -m "standards: map project"` | Specs + backup de `docs/` en el remoto privado |
| 5+ | Ciclo OpenSpec (`specboot-plan`? → propose → apply → verify → archive) | Código en el repo del cliente; specs solo en el store |

Planning (`docs/planning/`) también es **local** en este escenario: útil para el equipo de ingeniería, invisible al remoto del cliente.

---

## Qué no hacer (este escenario)

| Anti-patrón | Riesgo | Qué hacer |
|-------------|--------|-----------|
| `--docs client` “porque el cliente pide docs” | Mezclas planning SpecBoot con el git del cliente | Mantén `--docs local`; entrega docs de producto por otro canal si hace falta |
| Forzar `docs local` con `docs/` ya trackeada | Conflicto / error de init | Vacía el trackeo o cambia de escenario |
| Commitear `openspec/`, `.cursor/`, skills | Contaminas el repo | Exclude + hook; store remoto |
| Copiar skills al repo del cliente | Artefactos de IA versionados | Solo `source add` + `install` en máquina |
| Empezar features sin `specboot-map` | Estándares vacíos o inventados | Map → review → check → sync |
| Confundir `sync` del store con push del código | Subes al remoto equivocado | `specboot sync` = store; `git push` = cliente |
| `--attach-to python` sin frente `python` | Error o remap | Incluye esa tech en el stack o usa un frente real |

---

## Checklist

### Máquina

- [ ] Node ≥ 20.19, OpenSpec 2.x, `specboot` en PATH
- [ ] `source add` + `install` + `doctor` OK
- [ ] Plugins/skills que declare `fronts.json`

### Proyecto (oculto + docs local)

- [ ] `git ls-files -- docs` vacío
- [ ] `init … --existing --docs local --remote …` (**antes** de `--apply`)
- [ ] `detect --preset` (dry-run → create; gaps resueltos o aceptados)
- [ ] `detect --preset --apply` o `preset apply <id>` (fronts en el store)
- [ ] `doctor` OK; `openspec` y `docs` ignorados
- [ ] Exclude + hook presentes (`link` si hace falta)
- [ ] `specboot-map` → review → `check` → `sync`

---

## Problemas frecuentes

| Síntoma | Causa | Arreglo |
|---------|-------|---------|
| Init/docs rechaza `local` | `docs/` ya está en el índice git | Otro escenario, o dejar de trackear `docs/` |
| Compañero ve `openspec` sin ignorar | Exclude es local al clon | Que ejecute `init`/`link`; o `--gitignore` de equipo |
| `doctor --strict` por store sin remote | Specs/docs solo locales | Añade `origin` al store y `sync` |
| Standards draft / vacíos | No corriste el map con agente | Skill `specboot-map` |
| Skills del front no instaladas | Falta source | El `fix:` que imprime `doctor` |
| Worktree sin `openspec/` | Enlaces no versionados | `specboot link` |

Más: [GUIA-INSTALACION-EQUIPO.md](GUIA-INSTALACION-EQUIPO.md), [CHEATSHEET.md](CHEATSHEET.md) §4–§5 y §9, [docs/team-and-safety.md](docs/team-and-safety.md).

---

## Next step

1. Máquina: `install` + `doctor` ([CHEATSHEET.md](CHEATSHEET.md) §2).  
2. Canónico: `init --existing --docs local --remote …` → `detect --preset --apply` → map → `sync` (§ Quick path).  
3. Ciclo diario: [CHEATSHEET.md](CHEATSHEET.md) §5 y skill `specboot-start`.
