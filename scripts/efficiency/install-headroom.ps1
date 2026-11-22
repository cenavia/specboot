# Install Headroom CLI (Python) and attempt MCP wiring (Windows).
$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot 'lib.ps1')

Eff-Log 'efficiency: headroom'

if (Eff-Have 'headroom') {
  $ver = (& headroom --version 2>$null | Select-Object -First 1)
  if (-not $ver) { $ver = 'present' }
  Eff-Ok "headroom already on PATH ($ver)"
} else {
  $installed = $false
  if (Eff-Have 'uv') {
    try {
      & uv tool install --python 3.13 'headroom-ai[all]' 2>$null | Out-Null
    } catch { }
    if (-not (Eff-Have 'headroom')) {
      try { & uv tool install 'headroom-ai[all]' 2>$null | Out-Null } catch { }
    }
    $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')
    if (Eff-Have 'headroom') {
      Eff-Ok 'headroom installed via uv tool'
      $installed = $true
    }
  }
  if (-not $installed -and (Eff-Have 'pipx')) {
    try {
      & pipx install --python python3.13 'headroom-ai[all]' 2>$null | Out-Null
    } catch {
      try { & pipx install 'headroom-ai[all]' 2>$null | Out-Null } catch { }
    }
    if (Eff-Have 'headroom') {
      Eff-Ok 'headroom installed via pipx'
      $installed = $true
    }
  }
  if (-not $installed -and (Eff-Have 'pip')) {
    try {
      & pip install --user 'headroom-ai[all]' 2>$null | Out-Null
      $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')
      if (Eff-Have 'headroom') {
        Eff-Ok 'headroom installed via pip --user'
        $installed = $true
      }
    } catch { }
  }
  if (-not $installed -and (Eff-Have 'py')) {
    try {
      & py -3 -m pip install --user 'headroom-ai[all]' 2>$null | Out-Null
      $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')
      if (Eff-Have 'headroom') {
        Eff-Ok 'headroom installed via py -3 -m pip --user'
        $installed = $true
      }
    } catch { }
  }
  if (-not $installed) {
    Eff-Fail 'headroom not installed (need uv, pipx, pip, or py + Python 3.11+)'
  }
}

if (Eff-Have 'headroom') {
  try {
    & headroom mcp install 2>$null | Out-Null
    Eff-Ok 'headroom mcp install'
  } catch {
    Eff-Warn "headroom present; MCP not auto-wired — run: headroom mcp install  (use absolute path for Codex if PATH is incomplete)"
  }
}
