# Install CodeGraph CLI + MCP wire (Windows). Per-project: codegraph init.
$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot 'lib.ps1')

Eff-Log 'efficiency: codegraph'

if (-not (Eff-Have 'codegraph')) {
  $installed = $false
  if (Eff-Have 'npm') {
    try {
      & npm install -g @colbymchenry/codegraph 2>$null | Out-Null
      if (Eff-Have 'codegraph') {
        Eff-Ok 'codegraph installed via npm -g'
        $installed = $true
      }
    } catch {
      Eff-Warn 'npm install -g @colbymchenry/codegraph failed; trying install.ps1'
    }
  }
  if (-not $installed) {
    try {
      Invoke-RestMethod https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.ps1 | Invoke-Expression
      if (Eff-Have 'codegraph') {
        Eff-Ok 'codegraph installed via install.ps1'
        $installed = $true
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
  # -y = non-interactive. Keep host stdio so interactive confirm is visible and can advance.
  $wired = $false
  try {
    & codegraph install -y
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "exit $LASTEXITCODE" }
    $wired = $true
    Eff-Ok 'codegraph install -y (MCP wired globally for auto-detected agents)'
  } catch {
    $canPrompt = [Environment]::UserInteractive -and -not [Console]::IsInputRedirected
    if ($canPrompt) {
      Eff-Warn 'non-interactive codegraph install failed — confirm prompts to continue'
      try {
        & codegraph install
        if (-not ($LASTEXITCODE -and $LASTEXITCODE -ne 0)) {
          $wired = $true
          Eff-Ok 'codegraph install (interactive confirm)'
        }
      } catch { }
    }
  }
  if (-not $wired) {
    Eff-Warn "codegraph CLI present but install failed — run: codegraph install -y"
  }
  Eff-Warn 'per project: cd <repo>; codegraph init  (keep .codegraph/ out of client git)'
}
