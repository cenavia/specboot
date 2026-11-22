# Ensure Ponytail skill via SpecBoot efficiency-skills (Windows).
$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot 'lib.ps1')

Eff-Log 'efficiency: ponytail'

$ponyDir = Join-Path $script:EffSkills 'ponytail'
New-Item -ItemType Directory -Force -Path $ponyDir | Out-Null
$ponySkill = Join-Path $ponyDir 'SKILL.md'
$ponyUrl = 'https://raw.githubusercontent.com/DietrichGebert/ponytail/main/skills/ponytail/SKILL.md'

try {
  Eff-Fetch $ponyUrl $ponySkill
  $text = Get-Content -Raw $ponySkill
  if ($text -match '(?m)^name:') {
    Eff-Ok 'ponytail SKILL.md fetched from upstream'
  } else {
    Eff-Warn 'fetched ponytail file looks wrong; writing SpecBoot fallback'
    Remove-Item -Force $ponySkill -ErrorAction SilentlyContinue
  }
} catch {
  Eff-Warn "could not fetch ponytail upstream: $($_.Exception.Message)"
}

if (-not (Test-Path $ponySkill)) {
  Eff-WriteSkill 'ponytail' @'
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
'@
}

if (Eff-Have 'claude') {
  try {
    & claude plugin marketplace add DietrichGebert/ponytail 2>$null | Out-Null
    & claude plugin install ponytail@ponytail 2>$null | Out-Null
    Eff-Ok 'Claude Code ponytail plugin install attempted'
  } catch {
    Eff-Warn 'Claude Code plugin install may need an interactive session'
  }
}
if (Eff-Have 'codex') {
  try {
    & codex plugin marketplace add DietrichGebert/ponytail 2>$null | Out-Null
    & codex plugin add ponytail@ponytail 2>$null | Out-Null
    Eff-Ok 'Codex ponytail plugin install attempted'
  } catch {
    Eff-Warn 'Codex plugin install may need an interactive session'
  }
}
