<#
.SYNOPSIS
    Deploy the Eigenthrope observer bots to Fly.io.

.DESCRIPTION
    Standalone deploy script - no dependency on any AI assistant being
    available. Run this from anywhere; it locates its own directory.

    Steps: typecheck (aborts on failure - never ship code that doesn't
    compile), then flyctl deploy. Warns (but does not block) if there
    are uncommitted git changes, since deploying straight from local disk
    without a prior commit is a normal, supported thing to do here - Fly
    builds from what's on disk, not from GitHub.

.PARAMETER SkipTypecheck
    Skip the TypeScript check and deploy directly. Not recommended.

.EXAMPLE
    .\deploy.ps1
.EXAMPLE
    .\deploy.ps1 -SkipTypecheck
#>

param(
    [switch]$SkipTypecheck
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Fail($msg) {
    Write-Host ""
    Write-Host "DEPLOY FAILED: $msg" -ForegroundColor Red
    exit 1
}

Write-Host "=== Eigenthrope bots deploy ===" -ForegroundColor Cyan
Write-Host "Working directory: $PSScriptRoot"
Write-Host ""

# --- Locate the Fly CLI ---
$flyctl = "$env:USERPROFILE\.fly\bin\flyctl.exe"
if (-not (Test-Path $flyctl)) {
    $onPath = Get-Command flyctl -ErrorAction SilentlyContinue
    if ($onPath) {
        $flyctl = $onPath.Source
    } else {
        Fail "flyctl not found at '$flyctl' or on PATH. Install from https://fly.io/docs/flyctl/install/ or fix the path in this script."
    }
}
Write-Host "Using flyctl: $flyctl"

# --- Typecheck ---
if (-not $SkipTypecheck) {
    Write-Host ""
    Write-Host "--- Typecheck ---" -ForegroundColor Cyan
    npm run typecheck
    if ($LASTEXITCODE -ne 0) {
        Fail "TypeScript check failed (exit $LASTEXITCODE). Fix the errors above before deploying - a broken build will crash the bot on startup."
    }
    Write-Host "Typecheck passed." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "--- Typecheck skipped (-SkipTypecheck) ---" -ForegroundColor Yellow
}

# --- Warn on uncommitted changes (informational only) ---
$gitStatus = git status --porcelain -- . 2>$null
if ($LASTEXITCODE -eq 0 -and $gitStatus) {
    Write-Host ""
    Write-Host "--- Uncommitted changes in bots/ ---" -ForegroundColor Yellow
    Write-Host $gitStatus
    Write-Host "Deploying anyway (Fly builds from local disk, not git)." -ForegroundColor Yellow
    Write-Host "Remember to git add / commit / push afterward so the repo matches what's live." -ForegroundColor Yellow
}

# --- Deploy ---
Write-Host ""
Write-Host "--- Deploying to Fly (eigenthrope-bots) ---" -ForegroundColor Cyan
& $flyctl deploy --ha=false
if ($LASTEXITCODE -ne 0) {
    Fail "flyctl deploy exited with code $LASTEXITCODE. Scroll up for the actual error - common causes: Fly session expired (run 'flyctl auth login'), Docker build failure, or a Fly.io outage."
}

Write-Host ""
Write-Host "=== Deploy succeeded ===" -ForegroundColor Green
Write-Host "Check bot behavior in Discord, or logs at https://fly.io/apps/eigenthrope-bots/monitoring"
Write-Host "(CLI log streaming is unreliable from some shells - the dashboard is the reliable source.)"
