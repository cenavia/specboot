# Caveman: SpecBoot skill + best-effort CLI (Windows).
$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot 'lib.ps1')

Eff-Log 'efficiency: caveman'

Eff-WriteSkill 'caveman' @'
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
'@

if ((Eff-Have 'npx') -and (Eff-Have 'node')) {
  try {
    $major = [int](& node -p "process.versions.node.split('.')[0]")
  } catch {
    $major = 0
  }
  if ($major -ge 22) {
    try {
      & npx --yes @caveman-ai/cli@latest 2>$null | Out-Null
      Eff-Ok 'caveman CLI installer invoked (confirm agent wiring if prompted interactively)'
    } catch {
      try {
        & npx --yes skills add JuliusBrussee/caveman -g 2>$null | Out-Null
        Eff-Ok 'caveman upstream skill added globally via npx skills'
      } catch {
        Eff-Warn 'caveman CLI/skill install needs an interactive terminal — SpecBoot skill is linked; run: npx @caveman-ai/cli@latest'
      }
    }
  } else {
    Eff-Warn "caveman CLI wants Node 22.13+ (found $major); SpecBoot skill still linked"
  }
} else {
  Eff-Warn 'npx/node missing; SpecBoot caveman skill only'
}
