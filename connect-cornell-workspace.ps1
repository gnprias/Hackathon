# Connect CLI to Cornell workspace (Lakebase + Virtue Foundation dataset)
# Run: powershell -ExecutionPolicy Bypass -File .\connect-cornell-workspace.ps1

$env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')

function Resolve-DatabricksCli {
    $cmd = Get-Command databricks -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $winget = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\Databricks.DatabricksCLI_Microsoft.Winget.Source_8wekyb3d8bbwe\databricks.exe'
    if (Test-Path $winget) { return $winget }
    throw 'databricks CLI not found. Install: winget install Databricks.DatabricksCLI, then reopen PowerShell.'
}

$Databricks = Resolve-DatabricksCli
Write-Host "Using: $Databricks"

$HostUrl = 'https://dbc-69c2f85e-61ee.cloud.databricks.com'
$Profile = 'dbc-69c2f85e-61ee'

Write-Host "Logging in to $HostUrl as gnp26@cornell.edu ..."
Write-Host "Press Enter at the profile name prompt to accept: $Profile"
Write-Host ""

& $Databricks auth login --host $HostUrl --profile $Profile

Write-Host ""
Write-Host "=== Verify ==="
& $Databricks auth profiles
& $Databricks current-user me --profile $Profile
& $Databricks catalogs list --profile $Profile
& $Databricks postgres list-projects --profile $Profile -o json

Write-Host ""
Write-Host "If all succeeded, run:"
Write-Host "  powershell -ExecutionPolicy Bypass -File .\complete-lakebase-setup.ps1"
