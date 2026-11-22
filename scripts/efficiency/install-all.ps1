# SpecBoot efficiency pack for Windows - run by `specboot install`.
$ErrorActionPreference = 'Continue'

. (Join-Path $PSScriptRoot 'lib.ps1')

Eff-Log 'specboot efficiency pack (Windows)'
Eff-Log "  DATA=$($env:SPECBOOT_DATA)"
Eff-Log "  HARNESS=$($env:HARNESS)"
Eff-Log "  PowerShell=$($PSVersionTable.PSVersion)"
Eff-Log ''

$failed = $false
function Run-One([string]$ScriptName) {
  $path = Join-Path $PSScriptRoot $ScriptName
  $global:LASTEXITCODE = 0
  try {
    & $path
    if ($LASTEXITCODE -ne 0) {
      Eff-Warn "$ScriptName exited $LASTEXITCODE"
      $script:failed = $true
    }
  } catch {
    Eff-Warn "$ScriptName failed: $($_.Exception.Message)"
    $script:failed = $true
  }
  Eff-Log ''
}

Run-One 'install-ponytail.ps1'
Run-One 'install-caveman.ps1'
Run-One 'install-codegraph.ps1'
Run-One 'install-rtk.ps1'
Run-One 'install-headroom.ps1'

Eff-Log 'efficiency pack finished'
if ($failed) { exit 1 }
exit 0
