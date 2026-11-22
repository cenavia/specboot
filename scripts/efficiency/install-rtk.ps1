# Install RTK CLI and wire agents globally (Windows).
$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot 'lib.ps1')

Eff-Log 'efficiency: rtk'

# Prefer verifying with `rtk gain` (wrong crates.io rtk won't have it).
$rtkOk = $false
if (Eff-Have 'rtk') {
  try {
    & rtk gain 2>&1 | Out-Null
    $rtkOk = $true
    $ver = (& rtk --version 2>$null | Select-Object -First 1)
    Eff-Ok "rtk already installed ($ver)"
  } catch {
    Eff-Warn 'rtk on PATH but `rtk gain` failed (possible name collision); reinstalling'
  }
}

if (-not $rtkOk) {
  $installed = $false
  if (Eff-Have 'winget') {
    try {
      & winget install --id rtk-ai.rtk -e --accept-package-agreements --accept-source-agreements 2>$null | Out-Null
      # Refresh PATH for current process from Machine+User
      $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')
      try {
        $null = & rtk gain 2>&1
        Eff-Ok 'rtk installed via winget'
        $installed = $true
        $rtkOk = $true
      } catch {
        Eff-Warn 'winget install finished but rtk gain not available yet (open a new shell)'
      }
    } catch {
      Eff-Warn 'winget install rtk-ai.rtk failed'
    }
  }
  if (-not $installed) {
    Eff-Fail 'cannot install rtk (need winget: winget install rtk-ai.rtk). See https://www.rtk-ai.app/docs/getting-started/installation/'
  }
}

if ($rtkOk) {
  # Prefer non-interactive flags. Keep host stdio so interactive confirm is visible and can advance.
  $wired = $false
  try {
    & rtk init -g --auto-patch --no-trust-filters
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "exit $LASTEXITCODE" }
    $wired = $true
    Eff-Ok 'rtk init -g --auto-patch (Claude hooks); restart agents to pick up'
  } catch {
    $canPrompt = [Environment]::UserInteractive -and -not [Console]::IsInputRedirected
    if ($canPrompt) {
      Eff-Warn 'non-interactive rtk init failed — confirm prompts to continue'
      try {
        & rtk init -g
        if (-not ($LASTEXITCODE -and $LASTEXITCODE -ne 0)) {
          $wired = $true
          Eff-Ok 'rtk init -g (interactive confirm); restart agents to pick up'
        }
      } catch { }
    }
  }
  if (-not $wired) {
    Eff-Warn "rtk present but init failed — run: rtk init -g --auto-patch --no-trust-filters"
  }
  # Codex rejects --auto-patch/--no-patch; still exits without a prompt.
  try { & rtk init -g --auto-patch --no-trust-filters --agent cursor } catch { }
  try { & rtk init -g --codex --no-trust-filters } catch { }
  try { & rtk init -g --auto-patch --no-trust-filters --opencode } catch { }
}
