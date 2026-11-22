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
  if (Eff-RunQuiet 'claude' @('plugin', 'marketplace', 'add', 'DietrichGebert/ponytail')) {
    if (Eff-RunQuiet 'claude' @('plugin', 'install', 'ponytail@ponytail')) {
      Eff-Ok 'Claude Code ponytail plugin installed'
    } else {
      Eff-Warn 'Claude Code: marketplace ok; plugin install may need an interactive session - run: claude plugin install ponytail@ponytail'
    }
  } else {
    Eff-Warn 'Claude Code plugin marketplace add skipped/failed (optional) - run: claude plugin marketplace add DietrichGebert/ponytail'
  }
}
if (Eff-Have 'codex') {
  if (Eff-RunQuiet 'codex' @('plugin', 'marketplace', 'add', 'DietrichGebert/ponytail')) {
    if (Eff-RunQuiet 'codex' @('plugin', 'add', 'ponytail@ponytail')) {
      Eff-Ok 'Codex ponytail plugin installed'
    } else {
      Eff-Warn 'Codex: marketplace ok; plugin add may need an interactive session - run: codex plugin add ponytail@ponytail'
    }
  } else {
    Eff-Warn 'Codex plugin marketplace add skipped/failed (optional) - run: codex plugin marketplace add DietrichGebert/ponytail'
  }
}

Eff-Exit
