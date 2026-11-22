# Install RTK CLI and wire agents globally (Windows).
$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot 'lib.ps1')

Eff-Log 'efficiency: rtk'

# Verify with `rtk gain`: the unrelated crates.io `rtk` does not have it.
function Test-Rtk { return ((Eff-Have 'rtk') -and (Eff-RunQuiet 'rtk' @('gain'))) }

$rtkOk = $false
if (Test-Rtk) {
  $rtkOk = $true
  $ver = (& rtk --version 2>$null | Select-Object -First 1)
  Eff-Ok "rtk already installed ($ver)"
} elseif (Eff-Have 'rtk') {
  Eff-Warn 'rtk on PATH but `rtk gain` failed (possible name collision); reinstalling'
}

if (-not $rtkOk) {
  if (Eff-Have 'winget') {
    $null = Eff-RunQuiet 'winget' @('install', '--id', 'rtk-ai.rtk', '-e', '--accept-package-agreements', '--accept-source-agreements')
    Eff-RefreshPath
    if (Test-Rtk) {
      Eff-Ok 'rtk installed via winget'
      $rtkOk = $true
    } else {
      Eff-Fail 'winget install rtk-ai.rtk did not give a working `rtk gain` (open a new shell, or: winget install rtk-ai.rtk)'
    }
  } else {
    Eff-Fail 'cannot install rtk (need winget: winget install rtk-ai.rtk). See https://www.rtk-ai.app/docs/getting-started/installation/'
  }
}

if ($rtkOk) {
  # Prefer non-interactive flags. Keep host stdio so an interactive confirm is visible and can advance.
  $wired = $false
  $global:LASTEXITCODE = 0
  & rtk init -g --auto-patch --no-trust-filters
  if ($LASTEXITCODE -eq 0) {
    $wired = $true
    Eff-Ok 'rtk init -g --auto-patch (Claude hooks); restart agents to pick up'
  } else {
    $canPrompt = [Environment]::UserInteractive -and -not [Console]::IsInputRedirected
    if ($canPrompt) {
      Eff-Warn 'non-interactive rtk init failed - confirm prompts to continue'
      $global:LASTEXITCODE = 0
      & rtk init -g
      if ($LASTEXITCODE -eq 0) {
        $wired = $true
        Eff-Ok 'rtk init -g (interactive confirm); restart agents to pick up'
      }
    }
  }
  if (-not $wired) {
    Eff-Warn 'rtk present but init failed - run: rtk init -g --auto-patch --no-trust-filters'
  }
  # Best-effort extra agents (non-fatal). Codex rejects --auto-patch/--no-patch; still exits without a prompt.
  & rtk init -g --auto-patch --no-trust-filters --agent cursor
  & rtk init -g --codex --no-trust-filters
  & rtk init -g --auto-patch --no-trust-filters --opencode
}

Eff-Exit
