#!/usr/bin/env bash
# Ensure Ponytail skill is available via SpecBoot efficiency-skills (idempotent).
# shellcheck shell=bash
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

eff_log "efficiency: ponytail"

PONY_DIR="${EFF_SKILLS}/ponytail"
mkdir -p "${PONY_DIR}"
PONY_URL="https://raw.githubusercontent.com/DietrichGebert/ponytail/main/skills/ponytail/SKILL.md"

if eff_fetch "${PONY_URL}" "${PONY_DIR}/SKILL.md" 2>/dev/null; then
  if grep -q '^name:' "${PONY_DIR}/SKILL.md"; then
    eff_ok "ponytail SKILL.md fetched from upstream"
  else
    eff_warn "fetched ponytail file looks wrong; writing SpecBoot fallback"
    rm -f "${PONY_DIR}/SKILL.md"
  fi
fi

if [[ ! -f "${PONY_DIR}/SKILL.md" ]]; then
  eff_write_skill ponytail "$(cat <<'EOF'
---
name: ponytail
description: "Trigger: apply, implement, write code, avoid over-engineering, minimal diff. Write only what the task needs; never cut validation, security, tests, or accessibility."
license: MIT
metadata:
  author: specboot-efficiency
  version: "1.0"
  upstream: DietrichGebert/ponytail
---

# ponytail (SpecBoot efficiency)

Load on OpenSpec `apply` (and when shaping commits).

## Rules

1. Read the code the change touches before writing.
2. Prefer existing components, stdlib, and project patterns over new libraries.
3. Write the smallest diff that satisfies the OpenSpec tasks and project standards.
4. Never drop validation, error handling, security, accessibility, or required tests.
5. End with what you skipped and any residual risk.

Upstream: https://github.com/DietrichGebert/ponytail
EOF
)"
fi

# Best-effort Claude Code / Codex plugins (non-fatal).
if have claude; then
  if claude plugin marketplace add DietrichGebert/ponytail >/dev/null 2>&1; then
    claude plugin install ponytail@ponytail >/dev/null 2>&1 && eff_ok "Claude Code ponytail plugin install attempted" \
      || eff_warn "Claude Code: marketplace ok; plugin install may need an interactive session"
  else
    eff_warn "Claude Code plugin marketplace add skipped/failed (optional)"
  fi
fi
if have codex; then
  if codex plugin marketplace add DietrichGebert/ponytail >/dev/null 2>&1; then
    codex plugin add ponytail@ponytail >/dev/null 2>&1 && eff_ok "Codex ponytail plugin install attempted" \
      || eff_warn "Codex: marketplace ok; plugin add may need an interactive session"
  else
    eff_warn "Codex plugin marketplace add skipped/failed (optional)"
  fi
fi

eff_exit
