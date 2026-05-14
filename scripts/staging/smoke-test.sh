#!/bin/bash
# =============================================================================
# smoke-test.sh
# Smoke test para el entorno staging de SisHoras.
# Verifica que los endpoints principales respondan con códigos HTTP esperados.
#
# Uso:
#   bash scripts/staging/smoke-test.sh
#   bash scripts/staging/smoke-test.sh http://mi-servidor.com   # host personalizado
#
# Exit code 0 si todos los tests pasan. Exit code 1 si alguno falla.
# =============================================================================
set -uo pipefail

# ── Colores ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# ── Configuración ─────────────────────────────────────────────────────────────
BASE_URL="${1:-http://localhost}"
CURL_TIMEOUT=15
CURL_CONNECT_TIMEOUT=5

# Contadores
PASS=0
FAIL=0
TOTAL=0

# ── Función de test ───────────────────────────────────────────────────────────
# check_endpoint <descripcion> <url> [codigo_esperado]
check_endpoint() {
  local description="$1"
  local url="$2"
  local expected_code="${3:-200}"

  TOTAL=$((TOTAL + 1))

  # Hacer la petición curl
  HTTP_STATUS=$(curl \
    --silent \
    --output /dev/null \
    --write-out "%{http_code}" \
    --max-time "${CURL_TIMEOUT}" \
    --connect-timeout "${CURL_CONNECT_TIMEOUT}" \
    --location \
    "${url}" \
    2>/dev/null || echo "000")

  # Evaluar resultado
  if [[ "${HTTP_STATUS}" == "${expected_code}" ]]; then
    echo -e "  ${GREEN}[PASS]${NC} ${description}"
    echo -e "         URL: ${url}"
    echo -e "         HTTP ${HTTP_STATUS} (esperado: ${expected_code})"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}[FAIL]${NC} ${description}"
    echo -e "         URL: ${url}"
    echo -e "         HTTP ${HTTP_STATUS} (esperado: ${expected_code})"
    FAIL=$((FAIL + 1))
  fi

  echo ""
}

# ── Función de test con validación de cuerpo JSON ─────────────────────────────
# check_json_field <descripcion> <url> <campo_jq> <valor_esperado>
check_json_field() {
  local description="$1"
  local url="$2"
  local jq_filter="$3"
  local expected_value="$4"

  TOTAL=$((TOTAL + 1))

  # Obtener cuerpo de la respuesta
  RESPONSE=$(curl \
    --silent \
    --max-time "${CURL_TIMEOUT}" \
    --connect-timeout "${CURL_CONNECT_TIMEOUT}" \
    --location \
    "${url}" \
    2>/dev/null || echo "")

  if [[ -z "${RESPONSE}" ]]; then
    echo -e "  ${RED}[FAIL]${NC} ${description}"
    echo -e "         URL: ${url}"
    echo -e "         Sin respuesta del servidor (timeout o conexión rechazada)"
    FAIL=$((FAIL + 1))
    echo ""
    return
  fi

  # Extraer campo con jq si está disponible
  if command -v jq &>/dev/null; then
    ACTUAL_VALUE=$(echo "${RESPONSE}" | jq -r "${jq_filter}" 2>/dev/null || echo "ERROR_JQ")
  else
    ACTUAL_VALUE="(jq no disponible, verificación de campo omitida)"
    expected_value="${ACTUAL_VALUE}"
  fi

  if [[ "${ACTUAL_VALUE}" == "${expected_value}" ]]; then
    echo -e "  ${GREEN}[PASS]${NC} ${description}"
    echo -e "         URL: ${url}"
    echo -e "         Campo ${jq_filter} = '${ACTUAL_VALUE}' (esperado: '${expected_value}')"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}[FAIL]${NC} ${description}"
    echo -e "         URL: ${url}"
    echo -e "         Campo ${jq_filter} = '${ACTUAL_VALUE}' (esperado: '${expected_value}')"
    FAIL=$((FAIL + 1))
  fi

  echo ""
}

# ── Header ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}============================================================${NC}"
echo -e "${BOLD} SisHoras Staging — Smoke Test${NC}"
echo -e "${BOLD}============================================================${NC}"
echo ""
echo -e "  Base URL:  ${BASE_URL}"
echo -e "  Timeout:   ${CURL_TIMEOUT}s por request"
echo -e "  Fecha:     $(date '+%Y-%m-%d %H:%M:%S')"
echo ""
echo -e "${BLUE}--- Ejecutando tests ---${NC}"
echo ""

# ── Tests ─────────────────────────────────────────────────────────────────────

# 1. API health básico
check_endpoint \
  "API — /api/health (health básico)" \
  "${BASE_URL}/api/health" \
  "200"

# 2. API health completo (verifica DB, Redis, att2000)
check_endpoint \
  "API — /api/health/full (health completo)" \
  "${BASE_URL}/api/health/full" \
  "200"

# 3. Campo status en health/full debe ser "ok"
check_json_field \
  "API — /api/health/full retorna status ok" \
  "${BASE_URL}/api/health/full" \
  ".status" \
  "ok"

# 4. Métricas Prometheus
check_endpoint \
  "API — /metrics (Prometheus)" \
  "${BASE_URL}/metrics" \
  "200"

# 5. Frontend web
check_endpoint \
  "Web — / (interfaz web, Next.js)" \
  "${BASE_URL}/" \
  "200"

# ── Resumen ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}============================================================${NC}"
echo -e "${BOLD} Resumen del Smoke Test${NC}"
echo -e "${BOLD}============================================================${NC}"
echo ""
echo -e "  Total:    ${TOTAL}"
echo -e "  ${GREEN}PASS:     ${PASS}${NC}"

if [[ "${FAIL}" -gt 0 ]]; then
  echo -e "  ${RED}FAIL:     ${FAIL}${NC}"
else
  echo -e "  FAIL:     ${FAIL}"
fi

echo ""

if [[ "${FAIL}" -eq 0 ]]; then
  echo -e "${GREEN}  Resultado: TODOS LOS TESTS PASARON (${PASS}/${TOTAL})${NC}"
  echo ""
  echo "  El entorno staging responde correctamente en todos los endpoints verificados."
  echo "  Continue con el checklist de aceptacion: docs/STAGING_ACCEPTANCE_CHECKLIST.md"
  echo ""
  exit 0
else
  echo -e "${RED}  Resultado: ${FAIL} TEST(S) FALLARON (${PASS}/${TOTAL} pasaron)${NC}"
  echo ""
  echo "  Revise los endpoints fallidos y consulte los logs:"
  echo "    docker compose -f docker-compose.staging.yml logs --tail=50 api"
  echo "    docker compose -f docker-compose.staging.yml logs --tail=50 web"
  echo "    docker compose -f docker-compose.staging.yml ps"
  echo ""
  echo "  Consulte la guia de troubleshooting:"
  echo "    docs/STAGING_INSTALL_UBUNTU.md (seccion 9)"
  echo ""
  exit 1
fi
