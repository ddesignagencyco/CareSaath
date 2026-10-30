# First-time setup for the CareSaath backend.
# Usage (from repo root):  powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
# Flags: -SkipDocker  (use your own Postgres/Redis)   -SkipSeed   -Start (run dev server at the end)
param(
  [switch]$SkipDocker,
  [switch]$SkipSeed,
  [switch]$Start
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root "backend"

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Run($cmd) {
  Write-Host "    $cmd" -ForegroundColor DarkGray
  Invoke-Expression $cmd
  if ($LASTEXITCODE -ne 0) { throw "Command failed (exit $LASTEXITCODE): $cmd" }
}

Step "Checking prerequisites"
foreach ($tool in @("node", "npm")) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool is not installed or not on PATH." }
}
if ([int]((node -v) -replace '^v(\d+).*', '$1') -lt 22) { Write-Warning "Node 22+ is recommended (CI uses 22)." }

Step "Creating .env from .env.example (if missing)"
$envFile = Join-Path $root ".env"
if (-not (Test-Path $envFile)) {
  Copy-Item (Join-Path $root ".env.example") $envFile
  Write-Host "    Created $envFile - edit secrets/Cloudinary keys as needed."
} else {
  Write-Host "    .env already exists, leaving it untouched."
}

if (-not $SkipDocker) {
  Step "Starting Postgres and Redis (docker compose)"
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker not found. Install Docker Desktop, or re-run with -SkipDocker and point .env at your own Postgres/Redis."
  }
  Run "docker compose -f `"$root\docker\docker-compose.yml`" up -d"

  Step "Waiting for Postgres to accept connections"
  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    docker compose -f "$root\docker\docker-compose.yml" exec -T postgres pg_isready -U caresaath 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 2
  }
  if (-not $ready) { throw "Postgres did not become ready in time." }
}

Push-Location $backend
try {
  Step "Installing dependencies"
  Run "npm install"

  # Fixes TS2339 'Property visit/\$transaction does not exist on PrismaService':
  # the Prisma client lives in src/generated/prisma (gitignored) and must be generated.
  Step "Generating Prisma client"
  Run "npx prisma generate --config prisma7.config.ts"

  Step "Applying database migrations"
  Run "npx prisma migrate deploy --config prisma7.config.ts"

  Step "Building backend"
  Run "npm run build"

  if (-not $SkipSeed) {
    Step "Seeding reference/demo data"
    Run "npm run seed"
  }

  Write-Host "`nSetup complete. Start the API with:  cd backend; npm run start:dev" -ForegroundColor Green
  if ($Start) { Run "npm run start:dev" }
} finally {
  Pop-Location
}
