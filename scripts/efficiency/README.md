# SpecBoot efficiency pack

Runs on every `specboot install` (unless `SPECBOOT_SKIP_EFFICIENCY=1`).

| Platform | Entrypoint |
|----------|------------|
| macOS / Linux | `install-all.sh` (bash) |
| Windows | `install-all.ps1` (PowerShell; no Git Bash required) |

| Script | Tool | Windows notes |
|--------|------|---------------|
| `install-ponytail.*` | Skill (+ optional plugins) | Same |
| `install-caveman.*` | SpecBoot skill + best-effort `npx` | Same |
| `install-codegraph.*` | CLI + MCP | `npm -g` then `install.ps1` |
| `install-rtk.*` | CLI + `rtk init -g` | `winget install rtk-ai.rtk` |
| `install-headroom.*` | CLI + MCP | `uv` / `pipx` / `pip` / `py -3` |

Per project after codegraph CLI: `codegraph init` (keep `.codegraph/` out of client git).
