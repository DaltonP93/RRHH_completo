#!/usr/bin/env bash
# staging-smoke-api.sh — Smoke test de endpoints de API en staging.
#
# Uso:
#   bash scripts/staging-smoke-api.sh
#   BASE_URL=http://10.81.28.24 bash scripts/staging-smoke-api.sh
#   SMOKE_SLEEP=1.5 BASE_URL=http://localhost bash scripts/staging-smoke-api.sh
#   BASE_URL=http://localhost TOKEN=xxx bash scripts/staging-smoke-api.sh
#
# Variables de entorno:
#   BASE_URL     (default: http://localhost)   URL base SIN puerto (API via Nginx :80)
#   SMOKE_USER   (default: admin)
#   SMOKE_PASS   (default: Admin1234!)
#   TOKEN        si se provee, omite el login automático
#   ORIGIN       (default: http://10.81.28.24) header Origin para CORS
#   SMOKE_SLEEP  (default: 1.2)  segundos entre requests (evita rate-limit Nginx)
#
# Requiere: curl
# Salida:   PASS/FAIL por endpoint + resumen final; exit 1 si hay FAILs

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost}"
SMOKE_USER="${SMOKE_USER:-admin}"
SMOKE_PASS="${SMOKE_PASS:-Admin1234!}"
TOKEN="${TOKEN:-}"
ORIGIN="${ORIGIN:-http://10.81.28.24}"
SMOKE_SLEEP="${SMOKE_SLEEP:-1.5}"

PASS=0
FAIL=0

# ─── Obtener token si no fue provisto ────────────────────────────────────────
if [ -z "$TOKEN" ]; then
  echo "Autenticando como '${SMOKE_USER}' en ${BASE_URL}/api/auth/login ..."
  LOGIN_RESP=$(curl -s --max-time 20 --connect-timeout 5 \
    -X POST "${BASE_URL}/api/auth/login" \
    -H "Content-Type: application/json" \
    -H "Origin: ${ORIGIN}" \
    -d "{\"username\":\"${SMOKE_USER}\",\"password\":\"${SMOKE_PASS}\"}" 2>/dev/null || true)

  # Extraer accessToken — soporta con o sin espacio tras los dos puntos
  TOKEN=$(echo "$LOGIN_RESP" | grep -oP '"accessToken"\s*:\s*"\K[^"]+' | head -1 || true)

  if [ -z "$TOKEN" ]; then
    TOKEN=$(echo "$LOGIN_RESP" | grep -oP '"token"\s*:\s*"\K[^"]+' | head -1 || true)
  fi

  if [ -z "$TOKEN" ]; then
    echo ""
    echo "ERROR: No se pudo obtener token de autenticación."
    echo "Respuesta del servidor:"
    echo "$LOGIN_RESP" | head -c 500
    echo ""
    exit 1
  fi

  echo "Token obtenido OK (primeros 20 chars): ${TOKEN:0:20}..."
  sleep "$SMOKE_SLEEP"
fi
echo ""

# ─── Helper de check (con token) ─────────────────────────────────────────────
check() {
  local label="$1"
  local url="$2"
  local expected_status="${3:-200}"

  local body_file
  body_file="$(mktemp)"

  local status
  status=$(curl -s --max-time 20 --connect-timeout 5 \
    -o "$body_file" -w "%{http_code}" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Origin: ${ORIGIN}" \
    "$url" 2>/dev/null || echo "000")

  if [ "$status" = "$expected_status" ]; then
    echo "PASS  [$status] $label"
    PASS=$((PASS + 1))
  else
    local preview
    preview=$(tr '\n' ' ' < "$body_file" 2>/dev/null | head -c 250 || true)
    echo "FAIL  [$status] $label  (expected $expected_status)  ${preview}"
    FAIL=$((FAIL + 1))
  fi

  rm -f "$body_file"
  sleep "$SMOKE_SLEEP"
}

# ─── Helper para endpoints públicos (sin token) ───────────────────────────────
check_public() {
  local label="$1"
  local url="$2"
  local expected_status="${3:-200}"

  local body_file
  body_file="$(mktemp)"

  local status
  status=$(curl -s --max-time 20 --connect-timeout 5 \
    -o "$body_file" -w "%{http_code}" \
    -H "Origin: ${ORIGIN}" \
    "$url" 2>/dev/null || echo "000")

  if [ "$status" = "$expected_status" ]; then
    echo "PASS  [$status] $label"
    PASS=$((PASS + 1))
  else
    local preview
    preview=$(tr '\n' ' ' < "$body_file" 2>/dev/null | head -c 250 || true)
    echo "FAIL  [$status] $label  (expected $expected_status)  ${preview}"
    FAIL=$((FAIL + 1))
  fi

  rm -f "$body_file"
  sleep "$SMOKE_SLEEP"
}

echo "=== Staging smoke test — ${BASE_URL}  (sleep ${SMOKE_SLEEP}s entre requests) ==="
echo ""

echo "--- Health (público) ---"
check_public "GET /api/health"                                 "${BASE_URL}/api/health"

echo ""
echo "--- ZKTeco / Bridge ---"
check "GET /api/zkteco/diagnostics"                           "${BASE_URL}/api/zkteco/diagnostics"
check "GET /api/bridge/devices (alias)"                       "${BASE_URL}/api/bridge/devices"

echo ""
echo "--- Personas ---"
check "GET /api/employees"                                    "${BASE_URL}/api/employees"
check "GET /api/positions"                                    "${BASE_URL}/api/positions"
check "GET /api/departments"                                  "${BASE_URL}/api/departments"
check "GET /api/branches"                                     "${BASE_URL}/api/branches"

echo ""
echo "--- Nómina ---"
check "GET /api/payroll-runs"                                 "${BASE_URL}/api/payroll-runs"
check "GET /api/payroll-runs?year=2026"                       "${BASE_URL}/api/payroll-runs?year=2026"
check "GET /api/settlement-types"                             "${BASE_URL}/api/settlement-types"
check "GET /api/payroll-monthly-parameters"                   "${BASE_URL}/api/payroll-monthly-parameters"
check "GET /api/payroll-params (alias)"                       "${BASE_URL}/api/payroll-params"
check "GET /api/payroll-parameters (alias)"                   "${BASE_URL}/api/payroll-parameters"
check "GET /api/salary-advances"                              "${BASE_URL}/api/salary-advances"
check "GET /api/salary-advances?year=2026"                    "${BASE_URL}/api/salary-advances?year=2026"
check "GET /api/payroll-concepts"                             "${BASE_URL}/api/payroll-concepts"
check "GET /api/payroll-types"                                "${BASE_URL}/api/payroll-types"
check "GET /api/payroll/preview?year=2026&month=5"            "${BASE_URL}/api/payroll/preview?year=2026&month=5"
check "GET /api/aguinaldo"                                    "${BASE_URL}/api/aguinaldo"

echo ""
echo "--- Cumplimiento ---"
check "GET /api/compliance"                                   "${BASE_URL}/api/compliance"
check "GET /api/compliance/mtess"                             "${BASE_URL}/api/compliance/mtess"
check "GET /api/compliance/mtess?year=2026"                   "${BASE_URL}/api/compliance/mtess?year=2026"
check "GET /api/compliance/ips"                               "${BASE_URL}/api/compliance/ips"
check "GET /api/compliance/labor-planillas"                   "${BASE_URL}/api/compliance/labor-planillas"
check "GET /api/compliance/social-security-rates"             "${BASE_URL}/api/compliance/social-security-rates"
check "GET /api/compliance/status?company_id=1"               "${BASE_URL}/api/compliance/status?company_id=1"
check "GET /api/compliance/calendar?company_id=1"             "${BASE_URL}/api/compliance/calendar?company_id=1"

echo ""
echo "--- Documentos ---"
check "GET /api/documents"                                    "${BASE_URL}/api/documents"
check "GET /api/document-audit"                               "${BASE_URL}/api/document-audit"
check "GET /api/document-folders"                             "${BASE_URL}/api/document-folders"
check "GET /api/document-templates"                           "${BASE_URL}/api/document-templates"
check "GET /api/document-templates/variables"                 "${BASE_URL}/api/document-templates/variables"

echo ""
echo "--- KPI / Competencias ---"
check "GET /api/kpi-goals"                                    "${BASE_URL}/api/kpi-goals"
check "GET /api/kpi-goals/progress?year=2026&month=5"         "${BASE_URL}/api/kpi-goals/progress?year=2026&month=5"
check "GET /api/appraisals"                                   "${BASE_URL}/api/appraisals"
check "GET /api/competencies"                                 "${BASE_URL}/api/competencies"

echo ""
echo "--- Reportes ---"
TODAY=$(date +%Y-%m-%d)
check "GET /api/reports/daily?date=${TODAY}"                  "${BASE_URL}/api/reports/daily?date=${TODAY}"
check "GET /api/reports/monthly?year=2026&month=5"            "${BASE_URL}/api/reports/monthly?year=2026&month=5"

echo ""
echo "=== Resultado: ${PASS} PASS | ${FAIL} FAIL ==="

if [ "${FAIL}" -gt 0 ]; then
  exit 1
fi
exit 0
