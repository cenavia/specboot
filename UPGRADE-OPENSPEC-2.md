# Upgrade: OpenSpec 1.x → 2.x with SpecBoot extended profile

How to move a project that was already configured with **SpecBoot + OpenSpec 1.x** to **OpenSpec 2.x** and SpecBoot’s **extended** handling (12 OpenSpec workflows + harness command→skill bindings).

Related docs: [CHEATSHEET.md](CHEATSHEET.md), [README.md](README.md), skill `specboot-start` §§5a–5c.  
Upstream OpenSpec guide: [Upgrade to 2.0](https://openspec.dev/docs/upgrade-to-2).

---

## What changes (1.x → 2.0)

| 1.x | 2.0 |
|-----|-----|
| Slash commands `/opsx:propose`, etc. | Skills: `/openspec-propose`, `$openspec-propose`, or natural language |
| `delivery: skills \| commands \| both` | Retired — everything is skills |
| Skills copied per tool folder | Profile-driven skills (`core` = 6 or `custom` / extended = 12) |
| Implicit “core” set | Explicit `openspec config profile` |

### Command → skill map

| 1.x command | 2.0 skill |
|-------------|-----------|
| `/opsx:explore` | `openspec-explore` |
| `/opsx:propose` | `openspec-propose` |
| `/opsx:apply` | `openspec-apply-change` |
| `/opsx:update` | `openspec-update-change` |
| `/opsx:sync` | `openspec-sync-specs` |
| `/opsx:archive` | `openspec-archive-change` |
| `/opsx:new` | `openspec-new-change` |
| `/opsx:continue` | `openspec-continue-change` |
| `/opsx:ff` | `openspec-ff-change` |
| `/opsx:verify` | `openspec-verify-change` |
| `/opsx:bulk-archive` | `openspec-bulk-archive-change` |
| `/opsx:onboard` | `openspec-onboard` |

---

## SpecBoot note (important)

SpecBoot keeps **agent skills on the machine**, not in the client code repository.

- Prefer **`specboot install`** to regenerate and symlink `openspec-*` skills for Claude / Cursor / Codex / opencode.
- Do **not** commit `.agents/`, `.claude/`, `.cursor/`, `.codex/`, or leftover `/opsx` command files into the client repo.
- If you run `openspec update` inside a client project for dry-run or cleanup, treat any written skill/command paths as **local / excluded**, not as deliverables for the client git history.
- Put durable project instructions in `openspec/config.yaml` (`context` / `rules`) or in harness skills — not by editing generated OpenSpec skill folders.

---

## A. Once per machine (every engineer)

```bash
# 1. OpenSpec CLI 2.x
npm install -g @fission-ai/openspec@latest
openspec --version          # must be 2.x

# 2. Extended profile (all 12 workflows)
openspec config profile     # interactive: select all 12
# or ensure custom workflows include the full set
openspec config get profile
openspec config get workflows
```

Expected workflows for **extended**:

```text
explore, propose, new, continue, apply, update, ff,
sync, archive, bulk-archive, verify, onboard
```

```bash
# 3. SpecBoot harness (fork/clone that includes §§5a–5c + judgment-day)
cd ~/.specboot && git pull    # or your team harness path
npm link

# 4. Regenerate OpenSpec skills + link harness skills
specboot install
specboot doctor --strict
```

Verify generated skills (should be **12**, not only the core 6):

```bash
ls ~/.specboot-data/generated-skills
```

Must include: `openspec-explore`, `openspec-propose`, `openspec-apply-change`, `openspec-update-change`, `openspec-sync-specs`, `openspec-archive-change`, **plus** `openspec-new-change`, `openspec-continue-change`, `openspec-ff-change`, `openspec-verify-change`, `openspec-bulk-archive-change`, `openspec-onboard`.

Also confirm harness skills exist after install (symlinked): `specboot-start`, `adversarial-review`, `judgment-day`, `work-unit-commits`, `chained-pr`, `branch-pr`, etc.

---

## B. Per already-configured project (v1 → v2)

```bash
cd <client-project>

# 1. Clean git state first
git status

# 2. SpecBoot links + store
specboot pull                 # if the spec store has a remote
specboot link                 # if openspec/ or docs/ missing (e.g. new worktree)
specboot doctor

# 3. Optional: see what OpenSpec would change in-repo
openspec update --dry-run
```

If you previously customized `/opsx:*` command files or built-in skills:

1. Back them up / commit on a branch first.
2. Move anything worth keeping into `openspec/config.yaml` or a **renamed** team skill.
3. Delete obsolete generated command files by hand after review (`openspec update` keeps edited command files and lists them).

```bash
# 4. Refresh project facts against the new harness
specboot map
specboot doctor --strict
```

Do not start a new OpenSpec change until `doctor` is clean (and handoff / empty standards gates are cleared via `specboot-prescribe` or `specboot-map` as usual).

---

## C. How to work with extended handling

1. Start non-trivial work with skill **`specboot-start`** (loads profile + binding tables §§5a–5c).
2. Stop using `/opsx:*`. Use `/openspec-*` (most tools) or `$openspec-*` (Codex), or plain language.
3. Propose paths (pick one per change):
   - `openspec-propose`, or
   - `openspec-new-change` → `openspec-continue-change`…, or
   - `openspec-ff-change`
4. **Quality gate** (on `openspec-verify-change`, or **before every** `archive` / `bulk-archive`):

```text
openspec-verify-change          # extended only; skip on core profile
  → specboot check
  → adversarial-review
  → mutation-testing?           # when tests are in scope
  → code-auditing?              # when high-risk or requested
  → judgment-day                # juicio final — APPROVED | ESCALATED
  → openspec-archive-change / openspec-bulk-archive-change
  → specboot sync
```

5. After `apply`: harness bindings still apply (`work-unit-commits` → `chained-pr`? → `branch-pr`, Playwright when FE, etc.). See `specboot-start` §5b.

---

## Team checklist

- [ ] Every engineer on OpenSpec **2.x** (do not mix 1.x and 2.x against the same store).
- [ ] Same **extended** profile (12 workflows) on every machine.
- [ ] Same SpecBoot harness revision + `specboot install`.
- [ ] `specboot doctor --strict` green on each clone.
- [ ] No client commits of `.agents/`, `.claude/`, `.cursor/`, `.codex/`, or legacy `opsx` commands.

---

## Fallback: stay on core after upgrade

If the team upgrades the CLI to 2.x but wants only the six core workflows:

```bash
openspec config profile core
specboot install
```

The SpecBoot quality gate still runs before archive; the `openspec-verify-change` step is skipped on core.

---

## Stay on OpenSpec 1.x (not recommended)

```bash
npm install -g @fission-ai/openspec@1
```

1.x keeps working, but you will not get 2.0 skills layout, retired `delivery`, or SpecBoot’s extended verify bindings as documented here.
