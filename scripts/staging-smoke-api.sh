#!/usr/bin/env bash
# staging-smoke-api.sh — Smoke test de endpoints de API en staging.
#
# Uso: BASE_URL=http://staging:4000 TOKEN=xxxx bash scripts/staging-smoke-api.sh
#
# Requiere: curl, jq (opcional pero recomendado)
# Salida:   PASS/FAIL por endpoint + resumen final

BASE_URL="${BASE_URL:-http://localhost:4000}"
TOKEN="${TOKEN:-}"

PASS=0
FAIL=0

check() {
  local label="$1"
  local url="$2"
  local expected_status="${3:-200}"

  local status
  if [ -n "$TOKEN" ]; then
    status=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$url")
  else
    status=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  fi

  if [ "$status" = "$expected_status" ]; then
    echo "PASS  [$status] $label"
    PASS=$((PASS + 1))
  else
    echo "FAIL  [$status] $label  (expected $expected_status)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Staging smoke test — $BASE_URL ==="
echo ""

echo "--- Health ---"
check "GET /api/health"                                "$BASE_URL/api/health"

echo ""
echo "--- ZKTeco / Bridge ---"
check "GET /api/zkteco/diagnostics"                    "$BASE_URL/api/zkteco/diagnostics"
check "GET /api/bridge/devices (alias)"                "$BASE_URL/api/bridge/devices"

echo ""
echo "--- Personas ---"
check "GET /api/employees"                             "$BASE_URL/api/employees"
check "GET /api/positions"                             "$BASE_URL/api/positions"
check "GET /api/departments"                           "$BASE_URL/api/departments"
check "GET /api/branches"                              "$BASE_URL/api/branches"

echo ""
echo "--- Nómina ---"
check "GET /api/payroll-runs"                          "$BASE_URL/api/payroll-runs"
check "GET /api/settlement-types"                      "$BASE_URL/api/settlement-types"
check "GET /api/payroll-monthly-parameters"            "$BASE_URL/api/payroll-monthly-parameters"
check "GET /api/salary-advances"                       "$BASE_URL/api/salary-advances"
check "GET /api/payroll-concepts"                      "$BASE_URL/api/payroll-concepts"
check "GET /api/payroll-types"                         "$BASE_URL/api/payroll-types"

echo ""
echo "--- Cumplimiento ---"
check "GET /api/compliance/mtess"                      "$BASE_URL/api/compliance/mtess"
check "GET /api/compliance/ips"                        "$BASE_URL/api/compliance/ips"
check "GET /api/compliance/labor-planillas"            "$BASE_URL/api/compliance/labor-planillas"
check "GET /api/compliance/social-security-rates"      "$BASE_URL/api/compliance/social-security-rates"
check "GET /api/compliance/status?company_id=1"        "$BASE_URL/api/compliance/status?company_id=1"
check "GET /api/compliance/calendar?company_id=1"      "$BASE_URL/api/compliance/calendar?company_id=1"

echo ""
echo "--- Documentos ---"
check "GET /api/documents"                             "$BASE_URL/api/documents"
check "GET /api/document-folders"                      "$BASE_URL/api/document-folders"
check "GET /api/document-templates"                    "$BASE_URL/api/document-templates"
check "GET /api/document-templates/variables"          "$BASE_URL/api/document-templates/variables"

echo ""
echo "--- KPI / Competencias ---"
check "GET /api/kpi-goals"                             "$BASE_URL/api/kpi-goals"
check "GET /api/kpi-goals/progress"                    "$BASE_URL/api/kpi-goals/progress"
check "GET /api/appraisals"                            "$BASE_URL/api/appraisals"
check "GET /api/competencies"                          "$BASE_URL/api/competencies"

echo ""
echo "--- Reportes ---"
check "GET /api/reports/daily?date=$(date +%Y-%m-%d)" "$BASE_URL/api/reports/daily?date=$(date +%Y-%m-%d)"

echo ""
echo "=== Resultado: $PASS PASS | $FAIL FAIL ==="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
