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
    if (-not (Eff-RunQuiet 'uv' @('tool', 'install', '--python', '3.13', 'headroom-ai[all]'))) {
      $null = Eff-RunQuiet 'uv' @('tool', 'install', 'headroom-ai[all]')
    }
    Eff-RefreshPath
    if (Eff-Have 'headroom') {
      Eff-Ok 'headroom installed via uv tool'
      $installed = $true
    }
  }
  if (-not $installed -and (Eff-Have 'pipx')) {
    if (-not (Eff-RunQuiet 'pipx' @('install', '--python', 'python3.13', 'headroom-ai[all]'))) {
      $null = Eff-RunQuiet 'pipx' @('install', 'headroom-ai[all]')
    }
    Eff-RefreshPath
    if (Eff-Have 'headroom') {
      Eff-Ok 'headroom installed via pipx'
      $installed = $true
    }
  }
  if (-not $installed -and (Eff-Have 'pip')) {
    $null = Eff-RunQuiet 'pip' @('install', '--user', 'headroom-ai[all]')
    Eff-RefreshPath
    if (Eff-Have 'headroom') {
      Eff-Ok 'headroom installed via pip --user'
      $installed = $true
    }
  }
  if (-not $installed -and (Eff-Have 'py')) {
    $null = Eff-RunQuiet 'py' @('-3', '-m', 'pip', 'install', '--user', 'headroom-ai[all]')
    Eff-RefreshPath
    if (Eff-Have 'headroom') {
      Eff-Ok 'headroom installed via py -3 -m pip --user'
      $installed = $true
    }
  }
  if (-not $installed) {
    Eff-Fail 'headroom not installed (need uv, pipx, pip, or py + Python 3.11+; pip --user scripts may need %APPDATA%\Python\Scripts on PATH)'
  }
}

if (Eff-Have 'headroom') {
  if (Eff-RunQuiet 'headroom' @('mcp', 'install')) {
    Eff-Ok 'headroom mcp install'
  } else {
    Eff-Warn 'headroom present; MCP not auto-wired - run: headroom mcp install  (use absolute path for Codex if PATH is incomplete)'
  }
}

Eff-Exit
