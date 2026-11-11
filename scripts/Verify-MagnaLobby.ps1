# Builder/reviewer proof against the existing dev Play service. No production writes.
param(
    [string]$MagnaRoot = 'E:\projects\nexus\websites\www.magnacms.com',
    [string]$Site = ''
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$tokenId = ''
$previousTable = $env:MAGNA_AUTH_TABLE_NAME
try {
    $env:MAGNA_AUTH_TABLE_NAME = 'magnacms-dev-auth'
    Push-Location $MagnaRoot
    try {
        $python = Join-Path $MagnaRoot '.venv\Scripts\python.exe'
        $mint = & $python -m shell.bff.auth.api_tokens create --label 'gcr-lobby-verification' 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) { throw 'Could not mint the dev verification token.' }
        $env:GCR_PROOF_API_TOKEN = [regex]::Match($mint, 'mgt_[A-Za-z0-9_\-]+').Value
        $tokenId = [regex]::Match($mint, 'token id:\s*(\S+)').Groups[1].Value
        if (-not $env:GCR_PROOF_API_TOKEN -or -not $tokenId) { throw 'Could not parse the dev verification token.' }
    } finally { Pop-Location }
    Push-Location $repoRoot
    try {
        & node scripts/verify-magna-lobby.mjs --site $Site
        if ($LASTEXITCODE -ne 0) { throw 'Garbage Can Race lobby proof failed.' }
    } finally { Pop-Location }
} finally {
    Remove-Item Env:GCR_PROOF_API_TOKEN -ErrorAction SilentlyContinue
    $env:MAGNA_AUTH_TABLE_NAME = $previousTable
    if ($tokenId) {
        $env:MAGNA_AUTH_TABLE_NAME = 'magnacms-dev-auth'
        Push-Location $MagnaRoot
        try {
            $null = & $python -m shell.bff.auth.api_tokens revoke --token-id $tokenId
            if ($LASTEXITCODE -ne 0) { throw 'Dev verification token revocation failed.' }
        } finally {
            Pop-Location
            $env:MAGNA_AUTH_TABLE_NAME = $previousTable
        }
    }
}
