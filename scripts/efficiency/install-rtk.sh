#!/usr/bin/env bash
# Install RTK CLI and wire agents globally (idempotent).
# shellcheck shell=bash
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

eff_log "efficiency: rtk"

if have rtk && rtk gain >/dev/null 2>&1; then
  eff_ok "rtk already installed ($(rtk --version 2>/dev/null | head -1))"
else
  if have brew; then
    if brew install rtk-ai/tap/rtk >/dev/null 2>&1 || brew install rtk >/dev/null 2>&1; then
      eff_ok "rtk installed via Homebrew"
    else
      eff_warn "Homebrew install of rtk failed; trying install script"
    fi
  fi
  if ! have rtk || ! rtk gain >/dev/null 2>&1; then
    if have curl; then
      if curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/master/install.sh | sh; then
        # install.sh often drops into ~/.local/bin
        export PATH="${HOME}/.local/bin:${PATH}"
        if have rtk && rtk gain >/dev/null 2>&1; then
          eff_ok "rtk installed via install.sh"
        else
          eff_fail "rtk install script ran but 'rtk gain' does not work (wrong binary or PATH)"
        fi
      else
        eff_fail "rtk install script failed"
      fi
    else
      eff_fail "cannot install rtk (need brew or curl)"
    fi
  fi
fi

if have rtk && rtk gain >/dev/null 2>&1; then
  # Prefer non-interactive flags. Do NOT redirect stdio: hiding prompts made installs look hung
  # while stdin still waited; with a TTY, confirming must be visible so the pack can advance.
  wired=0
  if rtk init -g --auto-patch --no-trust-filters; then
    wired=1
    eff_ok "rtk init -g --auto-patch (Claude hooks); restart agents to pick up"
  elif [[ -t 0 && -t 1 ]]; then
    eff_warn "non-interactive rtk init failed — confirm prompts to continue"
    if rtk init -g; then
      wired=1
      eff_ok "rtk init -g (interactive confirm); restart agents to pick up"
    fi
  fi
  if [[ "$wired" -eq 0 ]]; then
    eff_warn "rtk present but init failed — run: rtk init -g --auto-patch --no-trust-filters"
  fi
  # Best-effort extra agents (non-fatal). Codex rejects --auto-patch/--no-patch; still exits without a prompt.
  rtk init -g --auto-patch --no-trust-filters --agent cursor || true
  rtk init -g --codex --no-trust-filters || true
  rtk init -g --auto-patch --no-trust-filters --opencode || true
fi
