# Guía greenfield: proyecto nuevo con presets (cliente limpio)

Cómo instalar SpecBoot, **crear presets** (uno o varios stacks + IA) e inicializar un **proyecto vacío** hasta prescribe → esqueleto → handoff, **sin** dejar specs, skills ni configuración de agentes en el git del cliente.

Relacionado: [GUIA-BROWNFIELD.md](GUIA-BROWNFIELD.md) (proyecto existente, specs ocultas + docs local), [GUIA-PRESETS.md](GUIA-PRESETS.md) (detalle de manifiestos), [GUIA-INSTALACION-EQUIPO.md](GUIA-INSTALACION-EQUIPO.md) (onboarding equipo), [docs/team-and-safety.md](docs/team-and-safety.md), [CHEATSHEET.md](CHEATSHEET.md).

---

## Qué ve el cliente vs qué queda en tu máquina

| Pieza | Dónde vive | ¿En el git del cliente? |
|-------|------------|-------------------------|
| Código / esqueleto / CI de producto | Repo del cliente | **Sí** |
| Specs, estándares, changes OpenSpec | Store privado `~/.specboot-data/stores/<cliente>/` → enlace `openspec/` | **No** (exclude + hook) |
| `docs/` de planning/arquitectura | Por defecto **local** en el clon (ignorada) | **No** |
| Skills de agentes | `~/.claude/skills`, `~/.agents/skills` (vía `specboot install`) | **No** |
| Regla Cursor del arnés | `.cursor/rules/specboot.mdc` | **No** (bajo `.cursor/`, excluido) |
| Presets generados | `~/.specboot-data/presets/fronts.*.json` | **No** |
| Arnés SpecBoot | `~/.specboot/` | **No** |

`specboot init` (sin trucos raros) deja el repo del cliente **limpio de IA**: escribe exclude local, hook `pre-commit` y, por defecto, `docs` en modo `local`.

**No uses `--docs client`** si el cliente no debe ver planning/arquitectura.  
**`--gitignore`** es opcional: protege a todos los clones añadiendo `/openspec` (y `/docs` si es privada) al `.gitignore` **versionado** — eso hace visibles esos nombres de carpeta en el repo del cliente; úsalo solo si el equipo lo acepta.

---

## Flujo completo (mapa)

```text
A. Máquina     install / source add / doctor
B. Preset      preset create …   →  ~/.specboot-data/presets/
C. Proyecto    git init → init --stack … --remote … --docs local
               (exclude + hook ocultan openspec/docs/agentes)
D. Agente      plan? → prescribe → esqueleto → check → map + brownfield → sync
```

Versión del arnés: instala por **tag** (hoy **`v0.7.5`** o el checkout de desarrollo con estos cambios + `npm link`).  
Repo: `https://github.com/cenavia/specboot.git`

---

## Quick path (Go + React + IA, cliente limpio)

Sustituye `<cliente>` y `<url-store>`.

```bash
# ——— A. Máquina (una vez / al actualizar) ———
node --version   # >= 20.19
npm install -g @fission-ai/openspec@latest

# Si trabajas desde este repo de desarrollo:
cd /ruta/a/specboot && npm link && specboot install && specboot doctor

# O release por tag:
# git clone … ~/.specboot && cd ~/.specboot && git checkout v0.7.5 && npm link
# specboot source add <carpeta-plugins> && specboot install && specboot doctor

# ——— B. Preset ———
specboot preset create go,react --topics-from ai --attach-to backend
specboot preset show go-react-with-ai

# ——— C. Proyecto (solo código visible al cliente) ———
mkdir mi-proyecto && cd mi-proyecto
git init
git commit --allow-empty -m "chore: init"

specboot init <cliente> \
  --stack go,react,ai \
  --attach-to backend \
  --docs local \
  --remote <url-store-privada>

specboot doctor

# Comprobar que openspec/docs no se trackean:
git status
git check-ignore -v openspec docs .cursor 2>/dev/null || true
```

Luego, **sesión nueva** del agente: `specboot-plan` (opcional) → `specboot-prescribe` → esqueleto → `specboot check` → handoff (`specboot-map` + `mode brownfield` + `sync`).

---

## Referencia CLI (comandos que usarás)

### Máquina y skills

| Comando | Qué hace |
|---------|----------|
| `specboot install` | Enlaza skills del arnés + sources; genera `openspec-*`; reglas globales; efficiency pack (0.7+) |
| `specboot install --adopt` | Adopta carpetas de skill que ocupaban nombres gestionados (con respaldo) |
| `specboot uninstall` | Quita enlaces y regla global (stores se conservan) |
| `specboot source add <ruta>` | Registra un plugin/carpeta de skills |
| `specboot source list` / `remove <ruta>` | Lista o quita sources |
| `specboot doctor` / `doctor --strict` | Salud de máquina y, si hay proyecto, del clon |

### Presets (CRUD)

| Comando | Qué hace |
|---------|----------|
| `specboot preset list` | Manifestos, ejemplos del arnés y JSON generados |
| `specboot preset show <id>` | Lee el generado en `~/.specboot-data/presets/` (falla si no existe) |
| `specboot preset show … --resolve` | Previsualiza desde manifesto(s) **sin** escribir archivo |
| `specboot preset create <tech[,…]>` | Crea/regenera `fronts.<id>.json` |
| `specboot preset update <…>` | Como create; exige que el archivo exista (salvo `--force`) |
| `specboot preset attach <id> --topics-from <pack>` | Añade un topics-pack a un preset ya generado |
| `specboot preset remove <id>` | Borra el JSON generado (`--default` también quita `fronts.default.json`) |

Flags útiles de preset:

| Flag | Efecto |
|------|--------|
| `--topics-from ai` | Engancha pack multi-prefijo (LangGraph, RAG, …) |
| `--attach-to <frente>` | Frente destino del pack (`backend`, `python`, …) |
| `--default` | Copia también a `~/.specboot-data/fronts.default.json` |
| `--out <file>` | Ruta alternativa de salida |
| `--force` | Escribe aunque falten skills del manifesto |
| `--heuristic` | Ignora manifesto y arma desde skills `<tech>-*` |

### Proyecto (init y día a día)

| Comando | Qué hace |
|---------|----------|
| `specboot init <cliente> …` | Store + enlace `openspec/` + **exclude** + **hook** + regla Cursor |
| `specboot link` | Recrea enlaces/exclude/hook/regla en otro worktree |
| `specboot docs local\|client\|store` | Dónde vive `docs/` (greenfield “oculto”: **`local`**) |
| `specboot doc add\|remove\|list` | Documentos de arquitectura (mandan sobre skills) |
| `specboot mode greenfield\|brownfield` | Modo del proyecto |
| `specboot map` / `map --accept` | Inventario, plantillas, `checks.json` |
| `specboot check` / `check --list` | Ejecuta checks del store |
| `specboot sync -m "…"` | Commit + rebase + push del **store** (no del código cliente) |
| `specboot pull` | Trae cambios del store sin subir |
| `specboot detect [--write] [--preset]` | Stack detectado; `--preset` también arma el fronts preset (útil en brownfield) |

Flags importantes de `init`:

| Flag | Efecto para el cliente |
|------|------------------------|
| `--stack <tech[,…]>` | Frentes desde presets/manifestos (puede incluir `ai`) |
| `--fronts <file.json>` | Frentes desde un JSON (no combinar con `--stack`) |
| `--topics-from` / `--attach-to` | Packs al resolver `--stack` |
| `--remote <url>` | Store privado compartido con el equipo |
| `--docs local` | **Recomendado**: docs privadas, ocultas |
| `--docs client` | Docs versionadas en el repo del cliente (visibles) |
| `--docs store` | docs como enlace al store |
| `--gitignore` | Añade `/openspec` (y `/docs`) al `.gitignore` **commiteable** (nombres visibles) |
| `--new` | Fuerza modo greenfield |

---

## Escenarios de preset → init

En todos: `docs local` (implícito o explícito) y store con `--remote` para no perder specs.

### 1. Un solo backend (Go)

```bash
specboot preset create go
specboot preset show go

mkdir api-go && cd api-go && git init
git commit --allow-empty -m "chore: init"

specboot init acme-go --stack go --docs local --remote <url-store>
specboot doctor
```

### 2. Backend + frontend (Go + React)

```bash
specboot preset create go,react
# → fronts.go-react.json  (backend/ + frontend/)

specboot init acme-web --stack go,react --docs local --remote <url-store>
```

### 3. Backend + frontend + capa IA (topics en el backend)

```bash
specboot preset create go,react --topics-from ai --attach-to backend
# o: create go,react,ai   (ai es topics-pack; no crea carpeta propia)

specboot init acme-agentic \
  --stack go,react,ai \
  --attach-to backend \
  --docs local \
  --remote <url-store>
```

`--attach-to` nombra un **frente del preset** (`backend`, `frontend`, `python`…), no una tecnología que no hayas incluido en el stack.

### 4. Varios backends + React + IA en Python

```bash
specboot preset create go,python,java,react --topics-from ai --attach-to python
# Frentes: backend (go), python, java, frontend — IA en topics de python

specboot init acme-poly \
  --stack go,python,java,react,ai \
  --attach-to python \
  --docs local \
  --remote <url-store>
```

### 5. Preset estático del arnés (sin `preset create`)

```bash
specboot init acme-fastapi \
  --fronts ~/.specboot/presets/fronts.fastapi-react.json \
  --docs local \
  --remote <url-store>
```

Ejemplos: `fronts.fastapi-react.json`, `fronts.fastapi-react-agentic.json`, `fronts.springboot-angular.json`.

### 6. CRUD del preset (ciclo de vida)

```bash
specboot preset list
specboot preset create go,react --topics-from ai --attach-to backend
specboot preset show go-react-with-ai
specboot preset update go,react --topics-from ai --attach-to backend
specboot preset attach go-react --topics-from ai --attach-to backend   # si partiste sin ai
specboot preset remove go-react-with-ai
```

### 7. Compañero en un greenfield ya iniciado (sigue oculto en su clon)

```bash
# Tras Fase A en su máquina…
cd /ruta/clon-cliente
specboot init <cliente> --remote <url-store> --docs local
specboot pull
specboot doctor
# init vuelve a poner exclude + hook locales en SU clon
```

---

## Fase A — Instalación / actualización

### Desde cero (release)

```bash
git clone https://github.com/cenavia/specboot.git ~/.specboot
cd ~/.specboot && git checkout v0.7.5 && npm link
specboot source add <ruta-plugins>
specboot install
specboot doctor
```

### Ya tienes SpecBoot

```bash
cd ~/.specboot   # o el clone de desarrollo
git fetch --tags && git checkout <tag>   # si usas tags
npm link
specboot install
specboot doctor
```

Las skills **nunca** van al repo del cliente: solo `source add` + `install` en la máquina del ingeniero.

---

## Fase B — Init con ocultación al cliente

```bash
mkdir mi-proyecto && cd mi-proyecto
git init
git commit --allow-empty -m "chore: init"

specboot init <cliente> \
  --stack <tech[,tech…]> \
  --docs local \
  --remote <url-store-privada>
# Opcional de equipo: --gitignore
```

Tras el `init`, en ese clon:

1. **`.git/info/exclude`** — oculta `openspec`, `.claude/`, `.cursor/`, `.codex/`, `.agents/`, `docs` (si es privada), etc. Es **local** (no se pushea).
2. **Hook `pre-commit`** — bloquea *añadir* esos paths aunque hagas `git add -f`.
3. **`openspec/`** — symlink al store privado.
4. **`.cursor/rules/specboot.mdc`** — regla del arnés, también excluida.

Verificación rápida:

```bash
specboot doctor
git status                    # no debe listar openspec/ ni docs/ como trackeables
git check-ignore -v openspec
```

Arquitectura (opcional, manda sobre skills):

```bash
specboot doc add ~/ruta/arquitectura.md
specboot doc add ~/ruta/backend.md --front backend
```

---

## Fase C — Agente (prescribe → esqueleto → handoff)

| Paso | Acción | Resultado |
|------|--------|-----------|
| 0 | Skill `specboot-plan` | PRD / historias en `docs/planning/` (sigue oculta si `docs local`) |
| 1 | Skill `specboot-prescribe` | Estándares en `openspec/standards/` (store) |
| 2 | Revisas `[assumed]` → `status: reviewed` | |
| 3 | `specboot sync -m "standards: prescribe…"` | Specs en el remoto privado |
| 4–5 | `openspec-propose` / `apply` del esqueleto | **Código** en el repo del cliente |
| 6 | `specboot check` | Checks en verde |
| 7 | Commit del esqueleto en el repo del cliente | Lo único que el cliente debe ver |
| 8–9 | `specboot-map` + `specboot mode brownfield` + `sync` | Handoff obligatorio |

Política de esqueleto en prescribe: **full stack** vs **minimum runnable**.

---

## Qué no hacer (cliente limpio)

| Anti-patrón | Riesgo | Qué hacer |
|-------------|--------|-----------|
| `--docs client` “por comodidad” | Planning/arquitectura en el git del cliente | Usa `--docs local` o `store` |
| Commitear `openspec/`, `.cursor/`, skills | Contaminas el repo | Confía en exclude/hook; store remoto |
| Copiar skills al repo del cliente | Artefactos de IA versionados | Solo `source add` + `install` en máquina |
| Instalar el arnés dentro del repo cliente | Ownership confuso | `~/.specboot` / clone de dev + `npm link` |
| Empezar a codear sin prescribe | Estándares inventados | Prescribe → review → esqueleto |
| Saltar handoff | Drift greenfield con código real | `map` + `mode brownfield` + `sync` |
| `--attach-to python` sin frente `python` | Error o remap a `backend` | Incluye `python` en el stack o usa `--attach-to backend` |

---

## Checklist

### Máquina

- [ ] Node ≥ 20.19, OpenSpec 2.x, `specboot` en PATH (`npm link`)
- [ ] `source add` + `install` + `doctor` OK
- [ ] Plugins con `specboot.preset.json` (stack y/o `kind: topics-pack` para ai)

### Preset

- [ ] `preset create` del escenario elegido
- [ ] `preset show <id>` muestra el generado
- [ ] Frentes y `--attach-to` coherentes

### Proyecto (oculto al cliente)

- [ ] `git init` + `init … --docs local --remote …`
- [ ] `doctor` OK; `openspec` ignorado
- [ ] Exclude + hook presentes (`doctor` / `link` si hace falta)
- [ ] Prescribe → esqueleto commiteado → handoff → `sync` del store

---

## Problemas frecuentes

| Síntoma | Causa | Arreglo |
|---------|--------|---------|
| `front "python" not found` | `--attach-to` no es un frente de **este** preset | Usa un frente listado o añade esa tech al stack |
| `show` tras `remove` “sigue” con `--resolve` | `--resolve` lee el manifesto, no el generado | Sin `--resolve` debe fallar si borraste el JSON |
| Skills no instaladas en create | Source / names | `source add` + `install` o `--force` |
| Compañero ve `openspec` sin ignorar | Exclude es local al clon | Que ejecute `init`/`link`; o `--gitignore` de equipo |
| `doctor --strict` por store sin remote | Specs solo locales | Añade `origin` al store y `sync` |

Más: [GUIA-PRESETS.md](GUIA-PRESETS.md), [CHEATSHEET.md](CHEATSHEET.md) §9, [docs/team-and-safety.md](docs/team-and-safety.md).

---

## Next step

1. Fase A + plugins.  
2. Escoge un escenario de preset (arriba) y `create`.  
3. `init --docs local --remote …` → prescribe → esqueleto → handoff.  
4. Ciclo diario: [CHEATSHEET.md](CHEATSHEET.md) §5 y skill `specboot-start`.
