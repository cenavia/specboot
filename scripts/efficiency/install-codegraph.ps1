# Install CodeGraph CLI + MCP wire (Windows). Per-project: codegraph init.
$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot 'lib.ps1')

Eff-Log 'efficiency: codegraph'

if (-not (Eff-Have 'codegraph')) {
  if (Eff-Have 'npm') {
    if ((Eff-RunQuiet 'npm' @('install', '-g', '@colbymchenry/codegraph')) -and (Eff-Have 'codegraph')) {
      Eff-Ok 'codegraph installed via npm -g'
    } else {
      Eff-Warn 'npm install -g @colbymchenry/codegraph failed; trying install.ps1'
    }
  }
  if (-not (Eff-Have 'codegraph')) {
    try {
      Invoke-RestMethod -UseBasicParsing https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.ps1 -ErrorAction Stop | Invoke-Expression
      Eff-RefreshPath
      if (Eff-Have 'codegraph') {
        Eff-Ok 'codegraph installed via install.ps1'
      } else {
        Eff-Fail 'codegraph install.ps1 ran but binary not on PATH (open a new shell)'
      }
    } catch {
      Eff-Fail "codegraph install.ps1 failed: $($_.Exception.Message)"
    }
  }
} else {
  $ver = (& codegraph --version 2>$null | Select-Object -First 1)
  if (-not $ver) { $ver = 'present' }
  Eff-Ok "codegraph already on PATH ($ver)"
}

if (Eff-Have 'codegraph') {
  # -y = non-interactive. Keep host stdio so an interactive confirm is visible and can advance.
  $wired = $false
  $global:LASTEXITCODE = 0
  & codegraph install -y
  if ($LASTEXITCODE -eq 0) {
    $wired = $true
    Eff-Ok 'codegraph install -y (MCP wired globally for auto-detected agents)'
  } else {
    $canPrompt = [Environment]::UserInteractive -and -not [Console]::IsInputRedirected
    if ($canPrompt) {
      Eff-Warn 'non-interactive codegraph install failed - confirm prompts to continue'
      $global:LASTEXITCODE = 0
      & codegraph install
      if ($LASTEXITCODE -eq 0) {
        $wired = $true
        Eff-Ok 'codegraph install (interactive confirm)'
      }
    }
  }
  if (-not $wired) {
    Eff-Warn 'codegraph CLI present but install failed - run: codegraph install -y'
  }
  Eff-Warn 'per project: cd <repo>; codegraph init  (keep .codegraph/ out of client git)'
}

Eff-Exit
