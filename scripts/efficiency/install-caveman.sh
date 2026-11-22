#!/usr/bin/env bash
# Install Caveman (full CLI when Node is available; always ensure SpecBoot skill).
# shellcheck shell=bash
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

eff_log "efficiency: caveman"

# Always ship a SpecBoot-managed skill (gates must stay verbose).
CAVE_DIR="${EFF_SKILLS}/caveman"
mkdir -p "${CAVE_DIR}"
cat >"${CAVE_DIR}/SKILL.md" <<'EOF'
---
name: caveman
description: "Trigger: shorter answers, less filler, caveman mode. Use for ordinary chat compression. Do NOT shorten SpecBoot gates, quality-gate evidence, doctor output, PR bodies, or judgment-day verdicts."
license: MIT
metadata:
  author: specboot-efficiency
  version: "1.0"
  upstream: JuliusBrussee/caveman
---

# caveman (SpecBoot efficiency)

Prefer short, structured answers for ordinary conversation.

## Hard rules for SpecBoot

- When `specboot-start`, `specboot doctor`, the OpenSpec quality gate (`adversarial-review`, `judgment-day`, `specboot check`), or PR/commit bodies are in play: use full clear sentences. Do not grunt or drop evidence.
- Never rewrite the user's prompt.
- Keep code, paths, commands, and error messages verbatim.

## Optional full install

If the Caveman CLI is installed (`npx @caveman-ai/cli@latest`), follow its rocks for compressing tool reads. SpecBoot still owns process verbosity at gates.
EOF
eff_ok "efficiency skill ready: caveman"

if have npx && have node; then
  node_ver="$(node -p "process.versions.node" 2>/dev/null || echo 0.0.0)"
  node_major="${node_ver%%.*}"; node_minor="${node_ver#*.}"; node_minor="${node_minor%%.*}"
  if [[ "${node_major}" -gt 22 || ( "${node_major}" -eq 22 && "${node_minor}" -ge 13 ) ]]; then
    if npx --yes @caveman-ai/cli@latest </dev/null >/dev/null 2>&1; then
      eff_ok "caveman CLI installer invoked (confirm agent wiring if prompted interactively)"
    else
      if npx --yes skills add JuliusBrussee/caveman -g >/dev/null 2>&1; then
        eff_ok "caveman upstream skill added globally via npx skills"
      else
        eff_warn "caveman CLI/skill install needs an interactive terminal — SpecBoot skill is linked; run: npx @caveman-ai/cli@latest"
      fi
    fi
  else
    eff_warn "caveman CLI wants Node 22.13+ (found ${node_ver}); SpecBoot skill still linked"
  fi
else
  eff_warn "npx/node missing; SpecBoot caveman skill only"
fi

eff_exit
