# DAIS 2026 - Lakebase setup for Virtue Foundation dataset
# Run from PowerShell in this directory:
#   powershell -ExecutionPolicy Bypass -File .\complete-lakebase-setup.ps1

$ErrorActionPreference = 'Continue'

# Refresh PATH (new terminals often miss WinGet-installed CLIs)
$env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')

function Resolve-DatabricksCli {
    $cmd = Get-Command databricks -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $winget = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\Databricks.DatabricksCLI_Microsoft.Winget.Source_8wekyb3d8bbwe\databricks.exe'
    if (Test-Path $winget) { return $winget }
    throw 'databricks CLI not found. Install: winget install Databricks.DatabricksCLI, then reopen PowerShell.'
}

$Databricks = Resolve-DatabricksCli

function Invoke-Databricks {
    param([string[]]$CliArgs)
    & $Databricks @CliArgs 2>&1
}

function Write-CliJsonFile {
    param([object]$Object, [string]$FileName)
    $path = Join-Path $PSScriptRoot $FileName
    $json = $Object | ConvertTo-Json -Depth 10 -Compress
    [System.IO.File]::WriteAllText($path, $json)
    return "@$path"
}

function Log-Output([object]$value) {
    if ($null -eq $value) { Log '(no output)' }
    else { Log (($value | Out-String).TrimEnd()) }
}

# Workspace: Cornell (gnp26@cornell.edu) — Lakebase + dataset live here
$Profile = 'dbc-69c2f85e-61ee'
$WorkspaceHost = 'https://dbc-69c2f85e-61ee.cloud.databricks.com'
$Catalog = 'databricks_virtue_foundation_dataset_dais_2026'
$Schema = 'virtue_foundation_dataset'
$LakebaseProject = 'hackathon-app'
$LakebaseCatalog = 'hackathon_lb'
$Branch = "projects/$LakebaseProject/branches/production"
$Log = Join-Path $PSScriptRoot 'setup-run-output.txt'

function Log([string]$msg) { Add-Content -Path $Log -Value $msg -Encoding utf8 }

# Known PKs from discover-schema (2026-06-15). Script still auto-lists all tables.
$KnownPrimaryKeys = @{
    facilities                         = @('unique_id')
    india_post_pincode_directory       = @('pincode', 'officename')
    nfhs_5_district_health_indicators  = @('district_name', 'state_ut')
}

Remove-Item $Log -ErrorAction SilentlyContinue
Log "=== Lakebase setup $(Get-Date -Format o) ==="
Log "Profile: $Profile"
Log ""

Log "=== 1. CLI version ==="
Log "Using: $Databricks"
Log-Output (Invoke-Databricks @('--version'))
Log ''

Log '=== 2. List tables ==='
$tablesJson = (Invoke-Databricks @('tables', 'list', $Catalog, $Schema, '--profile', $Profile, '-o', 'json') | Out-String)
Log-Output $tablesJson
Log ''

if ([string]::IsNullOrWhiteSpace($tablesJson)) {
    Log 'ERROR: tables list returned no output. Check catalog/schema names and profile auth.'
    exit 1
}

$tables = @()
try {
    $parsed = $tablesJson | ConvertFrom-Json
    if ($parsed -is [array]) { $tables = $parsed }
    elseif ($parsed.tables) { $tables = $parsed.tables }
    else { $tables = @($parsed) }
} catch {
    Log "ERROR parsing tables JSON: $_"
    exit 1
}

$tableNames = $tables | ForEach-Object { if ($_.name) { $_.name } else { $_.table_name } } | Where-Object { $_ }
Log "Table count: $($tableNames.Count)"
Log ($tableNames -join ', ')
Log ''

Log '=== 3. Lakebase project ==='
$projectsJson = (Invoke-Databricks @('postgres', 'list-projects', '--profile', $Profile, '-o', 'json') | Out-String)
Log-Output $projectsJson

$existingProject = $null
try {
    $projects = $projectsJson | ConvertFrom-Json
    if ($projects) {
        $existingProject = $projects | Where-Object {
            $_.name -eq "projects/$LakebaseProject" -or $_.project_id -eq $LakebaseProject
        } | Select-Object -First 1
        if (-not $existingProject) {
            $existingProject = $projects | Select-Object -First 1
            if ($existingProject) {
                $LakebaseProject = ($existingProject.name -replace '^projects/', '')
                $Branch = "projects/$LakebaseProject/branches/production"
                Log "Using existing project: $LakebaseProject"
            }
        }
    }
} catch {
    Log "WARN: could not parse list-projects output"
}

$projectExists = $null -ne $existingProject

if (-not $projectExists) {
    Log ''
    Log '--- create-project ---'
    $projJsonPath = Write-CliJsonFile -Object @{ spec = @{ display_name = 'Hackathon App' } } -FileName '.tmp-create-project.json'
    $createProj = (Invoke-Databricks @('postgres', 'create-project', $LakebaseProject, '--json', $projJsonPath, '--profile', $Profile) | Out-String)
    Log-Output $createProj
    if ($createProj -match 'Lakebase is not enabled') {
        Log ''
        Log 'BLOCKER: CLI cannot create Lakebase projects on this workspace yet.'
        Log 'Create a project in the UI first:'
        Log '  https://dbc-69c2f85e-61ee.cloud.databricks.com/lakebase/projects'
        Log 'Name it: hackathon-app'
        Log 'Then re-run this script.'
        exit 1
    }
    if ($createProj -match 'Error:') {
        Log 'ERROR: create-project failed. See log above.'
        exit 1
    }
}
Log ''

Log '=== 4. Register Lakebase UC catalog ==='
$catJsonPath = Write-CliJsonFile -Object @{
    spec = @{
        postgres_database = 'databricks_postgres'
        branch            = $Branch
    }
} -FileName '.tmp-create-catalog.json'
$catOut = (Invoke-Databricks @('postgres', 'create-catalog', $LakebaseCatalog, '--json', $catJsonPath, '--profile', $Profile) | Out-String)
Log-Output $catOut
Log ''

Log '=== 5. discover-schema + PK candidates ==='
$pkReport = @()
foreach ($name in $tableNames) {
    $fqn = "${Catalog}.${Schema}.$name"
    Log "--- $fqn ---"
    $disc = (Invoke-Databricks @('experimental', 'aitools', 'tools', 'discover-schema', $fqn, '--profile', $Profile) | Out-String)
    Log-Output $disc
    Log ''

    $pk = $KnownPrimaryKeys[$name]
    if (-not $pk) {
        if ($disc -match 'unique_id:') { $pk = @('unique_id') }
        elseif ($disc -match '\bid:\s') { $pk = @('id') }
        else { $pk = @('REVIEW_MANUALLY') }
    }
    $pkReport += [pscustomobject]@{ Table = $name; PrimaryKey = ($pk -join ', ') }
}
Log 'PK summary:'
$pkReport | ForEach-Object { Log "  $($_.Table): $($_.PrimaryKey)" }
Log ''

Log '=== 6. Create synced tables (SNAPSHOT - marketplace read-only, CDF not alterable) ==='
foreach ($name in $tableNames) {
    $src = "${Catalog}.${Schema}.$name"
    $dest = "${LakebaseCatalog}.public.$name"
    $pkCols = $KnownPrimaryKeys[$name]
    if (-not $pkCols) {
        if ($name -match 'pincode') { $pkCols = @('pincode', 'officename') }
        elseif ($name -match 'district|nfhs') { $pkCols = @('district_name', 'state_ut') }
        else { $pkCols = @('unique_id') }
    }

    $pkJson = ($pkCols | ForEach-Object { "`"$_`"" }) -join ', '
    $syncSpec = @{
        spec = @{
            source_table_full_name             = $src
            primary_key_columns                = $pkCols
            scheduling_policy                  = 'SNAPSHOT'
            branch                             = $Branch
            postgres_database                  = 'databricks_postgres'
            create_database_objects_if_missing = $true
            new_pipeline_spec                  = @{
                storage_catalog = 'workspace'
                storage_schema  = 'default'
            }
        }
    }
    $syncJsonPath = Write-CliJsonFile -Object $syncSpec -FileName ".tmp-sync-$name.json"

    Log "--- create-synced-table $dest ---"
    Log "PK: $($pkCols -join ', ')"
    $syncOut = (Invoke-Databricks @('postgres', 'create-synced-table', $dest, '--json', $syncJsonPath, '--profile', $Profile) | Out-String)
    Log-Output $syncOut
    Log ''
}

Log '=== 7. Sync status ==='
foreach ($name in $tableNames) {
    $syncName = "synced_tables/${LakebaseCatalog}.public.$name"
    Log "--- get-synced-table $syncName ---"
    Log-Output (Invoke-Databricks @('postgres', 'get-synced-table', $syncName, '--profile', $Profile, '-o', 'json') | Out-String)
    Log ''
}

Log '=== DONE ==='
Write-Host "Complete. Log: $Log"
