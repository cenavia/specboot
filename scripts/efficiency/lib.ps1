# Shared helpers for SpecBoot efficiency installers (Windows PowerShell).

$ErrorActionPreference = 'Continue'

if (-not $env:SPECBOOT_DATA) { $env:SPECBOOT_DATA = Join-Path $HOME '.specboot-data' }
$script:EffSkills = Join-Path $env:SPECBOOT_DATA 'efficiency-skills'
New-Item -ItemType Directory -Force -Path $script:EffSkills | Out-Null

function Eff-Log([string]$Message) { Write-Host $Message }
function Eff-Ok([string]$Message) { Write-Host "  ok    $Message" }
function Eff-Warn([string]$Message) { Write-Host "  warn  $Message" }
function Eff-Fail([string]$Message) { Write-Host "  FAIL  $Message" }

function Eff-Have([string]$Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Eff-Fetch([string]$Url, [string]$Dest) {
  $dir = Split-Path -Parent $Dest
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Dest
}

function Eff-WriteSkill([string]$Name, [string]$Body) {
  $dir = Join-Path $script:EffSkills $Name
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Set-Content -Path (Join-Path $dir 'SKILL.md') -Value $Body -Encoding utf8
  Eff-Ok "efficiency skill ready: $Name"
}
