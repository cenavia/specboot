#!/usr/bin/env bash
# Install Headroom CLI (Python) and attempt MCP wiring (idempotent).
# shellcheck shell=bash
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

eff_log "efficiency: headroom"

if have headroom; then
  eff_ok "headroom already on PATH ($(headroom --version 2>/dev/null | head -1 || echo present))"
else
  installed=0
  if have uv; then
    if uv tool install --python 3.13 "headroom-ai[all]" >/dev/null 2>&1 \
      || uv tool install "headroom-ai[all]" >/dev/null 2>&1; then
      export PATH="${HOME}/.local/bin:${PATH}"
      have headroom && installed=1 && eff_ok "headroom installed via uv tool"
    fi
  fi
  if [[ "$installed" -eq 0 ]] && have pipx; then
    if pipx install --python python3.13 "headroom-ai[all]" >/dev/null 2>&1 \
      || pipx install "headroom-ai[all]" >/dev/null 2>&1; then
      have headroom && installed=1 && eff_ok "headroom installed via pipx"
    fi
  fi
  if [[ "$installed" -eq 0 ]] && have pip3; then
    if pip3 install --user "headroom-ai[all]" >/dev/null 2>&1; then
      export PATH="${HOME}/.local/bin:${PATH}"
      have headroom && installed=1 && eff_ok "headroom installed via pip3 --user"
    fi
  fi
  if [[ "$installed" -eq 0 ]]; then
    eff_fail "headroom not installed (need uv, pipx, or pip3 + Python 3.11+)"
  fi
fi

if have headroom; then
  if headroom mcp install >/dev/null 2>&1; then
    eff_ok "headroom mcp install"
  else
    eff_warn "headroom present; MCP not auto-wired — run: headroom mcp install  (or configure absolute path to 'headroom mcp serve')"
  fi
fi
