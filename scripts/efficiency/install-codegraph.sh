#!/usr/bin/env bash
# Install CodeGraph CLI and wire MCP into agents (idempotent). Per-project: codegraph init.
# shellcheck shell=bash
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

eff_log "efficiency: codegraph"

if ! have codegraph; then
  if have npm; then
    if npm install -g @colbymchenry/codegraph >/dev/null 2>&1; then
      eff_ok "codegraph installed via npm -g"
    else
      eff_warn "npm install -g @colbymchenry/codegraph failed; trying install.sh"
    fi
  fi
  if ! have codegraph && have curl; then
    if curl -fsSL https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.sh | sh; then
      export PATH="${HOME}/.local/bin:${PATH}"
      have codegraph && eff_ok "codegraph installed via install.sh" || eff_fail "codegraph install.sh ran but binary not on PATH (open a new shell)"
    else
      eff_fail "codegraph install.sh failed"
    fi
  elif ! have codegraph; then
    eff_fail "cannot install codegraph (need npm or curl)"
  fi
else
  eff_ok "codegraph already on PATH ($(codegraph --version 2>/dev/null | head -1 || echo present))"
fi

if have codegraph; then
  # -y = non-interactive. Keep stdio live so any leftover prompt is visible; on a TTY,
  # confirming interactively must advance the pack (redirecting hid prompts and looked hung).
  wired=0
  if codegraph install -y; then
    wired=1
    eff_ok "codegraph install -y (MCP wired globally for auto-detected agents)"
  elif [[ -t 0 && -t 1 ]]; then
    eff_warn "non-interactive codegraph install failed — confirm prompts to continue"
    if codegraph install; then
      wired=1
      eff_ok "codegraph install (interactive confirm)"
    fi
  fi
  if [[ "$wired" -eq 0 ]]; then
    eff_warn "codegraph CLI present but install failed — run: codegraph install -y"
  fi
  eff_warn "per project: cd <repo> && codegraph init  (keep .codegraph/ out of client git)"
fi

eff_exit
