# Shared helpers for SpecBoot efficiency installers (Windows PowerShell 5.1 and PowerShell 7).
#
# Keep every .ps1 in this folder pure ASCII: Windows PowerShell 5.1 reads BOM-less files as
# Windows-1252, where the UTF-8 bytes of characters such as an em dash turn into smart quotes
# and break string parsing.
#
# Native commands never throw on a non-zero exit code, so check $LASTEXITCODE (Eff-RunQuiet,
# Eff-RunNoInput) instead of wrapping them in try/catch.

$ErrorActionPreference = 'Continue'

if (-not $env:SPECBOOT_DATA) { $env:SPECBOOT_DATA = Join-Path $HOME '.specboot-data' }
$script:EffSkills = Join-Path $env:SPECBOOT_DATA 'efficiency-skills'
$script:EffFailCount = 0
New-Item -ItemType Directory -Force -Path $script:EffSkills | Out-Null

function Eff-Log([string]$Message) { Write-Host $Message }
function Eff-Ok([string]$Message) { Write-Host "  ok    $Message" }
function Eff-Warn([string]$Message) { Write-Host "  warn  $Message" }
function Eff-Fail([string]$Message) { Write-Host "  FAIL  $Message"; $script:EffFailCount++ }

function Eff-Have([string]$Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

# Run a native command with all output hidden. Returns $true when it exits 0.
function Eff-RunQuiet([string]$Exe, [string[]]$CmdArgs = @()) {
  $global:LASTEXITCODE = 0
  try { & $Exe @CmdArgs *> $null } catch { return $false }
  return ($LASTEXITCODE -eq 0)
}

# Run a command line through cmd.exe with stdin from NUL and output hidden, so an installer
# that prompts fails fast instead of waiting on an invisible prompt. Returns $true on exit 0.
function Eff-RunNoInput([string]$CommandLine) {
  $global:LASTEXITCODE = 0
  & cmd.exe /d /c "$CommandLine < NUL > NUL 2>&1"
  return ($LASTEXITCODE -eq 0)
}

# Reload PATH from the registry so tools installed by winget/uv/pip are visible in this process.
function Eff-RefreshPath {
  $machine = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [System.Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user;$env:Path"
}

function Eff-Fetch([string]$Url, [string]$Dest) {
  $dir = Split-Path -Parent $Dest
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Dest -ErrorAction Stop
}

# Write SKILL.md as UTF-8 *without* BOM (Set-Content -Encoding utf8 adds a BOM on 5.1, and the
# frontmatter must start with '---' for specboot and the agents to read the skill name).
function Eff-WriteSkill([string]$Name, [string]$Body) {
  $dir = Join-Path $script:EffSkills $Name
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $text = ($Body -replace "`r`n", "`n").TrimStart([char]0xFEFF)
  if (-not $text.EndsWith("`n")) { $text += "`n" }
  [System.IO.File]::WriteAllText((Join-Path $dir 'SKILL.md'), $text, (New-Object System.Text.UTF8Encoding $false))
  Eff-Ok "efficiency skill ready: $Name"
}

# End a child installer: exit 1 when any Eff-Fail was reported, so install-all.ps1 can tell.
function Eff-Exit {
  if ($script:EffFailCount -gt 0) { exit 1 }
  exit 0
}
