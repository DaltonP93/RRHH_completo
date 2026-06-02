#!/usr/bin/env bash
# rrhh-api.sh — Helper de llamadas autenticadas a la API RRHH en staging.
#
# Uso:
#   source scripts/rrhh-api.sh           # cargar funciones en la sesión actual
#   rrhh_login                            # obtiene TOKEN (lo reutiliza si ya existe)
#   rrhh_get  "/api/employees"
#   rrhh_post "/api/attendance/process-day-v2" '{"date":"2026-05-28"}'
#
# Variables de entorno (con defaults de staging):
#   BASE_URL   (default: http://localhost)
#   ORIGIN     (default: http://10.81.28.24)
#   RRHH_USER  (default: admin)
#   RRHH_PASS  (default: Admin1234!)  — sobreescribir en producción
#
# Seguridad:
#   - El TOKEN se almacena solo en la variable de shell de la sesión activa.
#   - No se escribe en disco ni en archivos de historial.
#   - Las credenciales son defaults SOLO de staging; en producción usar:
#       RRHH_USER=xxx RRHH_PASS=yyy source scripts/rrhh-api.sh
#   - Este archivo NO debe commitearse con credenciales reales.
#
# Requiere: curl, grep (con PCRE -P o compatible), bash ≥ 4

BASE_URL="${BASE_URL:-http://localhost}"
ORIGIN="${ORIGIN:-http://10.81.28.24}"
RRHH_USER="${RRHH_USER:-admin}"
RRHH_PASS="${RRHH_PASS:-Admin1234!}"

# ─── rrhh_login ───────────────────────────────────────────────────────────────
# Obtiene accessToken de /api/auth/login y lo exporta como TOKEN.
# Reutiliza TOKEN si ya está definido y no está vacío.
rrhh_login() {
  if [ -n "${TOKEN:-}" ]; then
    echo "[rrhh] Token ya presente — reutilizando (primeros 20 chars): ${TOKEN:0:20}..."
    return 0
  fi

  echo "[rrhh] Autenticando como '${RRHH_USER}' en ${BASE_URL}/api/auth/login ..."
  local resp
  resp=$(curl -s -X POST "${BASE_URL}/api/auth/login" \
    -H "Content-Type: application/json" \
    -H "Origin: ${ORIGIN}" \
    -d "{\"username\":\"${RRHH_USER}\",\"password\":\"${RRHH_PASS}\"}" 2>/dev/null || true)

  # Intentar extraer accessToken con PCRE (GNU grep) o fallback a sed
  local tok
  tok=$(printf '%s' "$resp" | grep -oP '"accessToken"\s*:\s*"\K[^"]+' 2>/dev/null | head -1 || true)
  if [ -z "$tok" ]; then
    tok=$(printf '%s' "$resp" | grep -oP '"token"\s*:\s*"\K[^"]+' 2>/dev/null | head -1 || true)
  fi
  # Fallback sed si grep -P no está disponible (macOS)
  if [ -z "$tok" ]; then
    tok=$(printf '%s' "$resp" | sed -n 's/.*"accessToken"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1 || true)
  fi
  if [ -z "$tok" ]; then
    tok=$(printf '%s' "$resp" | sed -n 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1 || true)
  fi

  if [ -z "$tok" ]; then
    echo "[rrhh] ERROR: No se pudo obtener token." >&2
    echo "[rrhh] Respuesta del servidor (primeros 400 chars):" >&2
    printf '%s' "$resp" | head -c 400 >&2
    echo "" >&2
    return 1
  fi

  export TOKEN="$tok"
  echo "[rrhh] Token OK (primeros 20 chars): ${TOKEN:0:20}..."
}

# ─── _rrhh_force_relogin ──────────────────────────────────────────────────────
# Descarta el token actual y obtiene uno nuevo (para manejo de 401).
_rrhh_force_relogin() {
  unset TOKEN
  rrhh_login
}

# ─── rrhh_get ─────────────────────────────────────────────────────────────────
# Hace GET autenticado a $BASE_URL$1 y formatea la respuesta.
# Si recibe 401, renueva token automáticamente y reintenta una vez.
#
# Uso: rrhh_get "/api/endpoint?param=value"
rrhh_get() {
  local path="${1:?rrhh_get requiere un path (ej: /api/employees)}"
  rrhh_login || return 1

  local tmp status body
  tmp=$(mktemp)

  status=$(curl -s --connect-timeout 10 --max-time 30 \
    -o "$tmp" -w "%{http_code}" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Origin: ${ORIGIN}" \
    "${BASE_URL}${path}" 2>/dev/null || echo "000")

  body=$(cat "$tmp")
  rm -f "$tmp"

  # 401 → renovar token y reintentar una vez
  if [ "$status" = "401" ]; then
    echo "[rrhh] 401 recibido — renovando token y reintentando..." >&2
    _rrhh_force_relogin || return 1
    tmp=$(mktemp)
    status=$(curl -s --connect-timeout 10 --max-time 30 \
      -o "$tmp" -w "%{http_code}" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Origin: ${ORIGIN}" \
      "${BASE_URL}${path}" 2>/dev/null || echo "000")
    body=$(cat "$tmp")
    rm -f "$tmp"
  fi

  echo "[rrhh] GET ${path} → HTTP ${status}"
  printf '%s\n' "$body"
}

# ─── rrhh_post ────────────────────────────────────────────────────────────────
# Hace POST autenticado a $BASE_URL$1 con body JSON $2.
# Si recibe 401, renueva token automáticamente y reintenta una vez.
#
# Uso: rrhh_post "/api/endpoint" '{"key":"value"}'
rrhh_post() {
  local path="${1:?rrhh_post requiere un path}"
  # NOTA: ${2:-{}} se parsea como ${2:-{} + '}' literal → agrega '}' extra al body
  # cuando $2 está definido. Asignación en dos pasos para evitar la ambigüedad.
  local body="$2"
  [ -z "$body" ] && body='{}'
  rrhh_login || return 1

  local tmp status resp
  tmp=$(mktemp)

  # Pipar el body via stdin con printf '%s' garantiza que los bytes llegan
  # exactamente como están en $body — sin expansión de shell adicional,
  # sin trailing newline, sin interpretación de curl ('@' file reading, etc.).
  status=$(printf '%s' "$body" | curl -s --connect-timeout 10 --max-time 90 \
    -o "$tmp" -w "%{http_code}" \
    -X POST \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -H "Origin: ${ORIGIN}" \
    --data-binary @- \
    "${BASE_URL}${path}" 2>/dev/null || echo "000")

  resp=$(cat "$tmp")
  rm -f "$tmp"

  # 401 → renovar token y reintentar una vez
  if [ "$status" = "401" ]; then
    echo "[rrhh] 401 recibido — renovando token y reintentando..." >&2
    _rrhh_force_relogin || return 1
    tmp=$(mktemp)
    status=$(printf '%s' "$body" | curl -s --connect-timeout 10 --max-time 90 \
      -o "$tmp" -w "%{http_code}" \
      -X POST \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json" \
      -H "Origin: ${ORIGIN}" \
      --data-binary @- \
      "${BASE_URL}${path}" 2>/dev/null || echo "000")
    resp=$(cat "$tmp")
    rm -f "$tmp"
  fi

  echo "[rrhh] POST ${path} → HTTP ${status}"
  printf '%s\n' "$resp"
}

echo "[rrhh] Funciones cargadas: rrhh_login, rrhh_get, rrhh_post"
echo "[rrhh] BASE_URL=${BASE_URL}  RRHH_USER=${RRHH_USER}"
echo "[rrhh] Ejecutar 'rrhh_login' para autenticarse."
