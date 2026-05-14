#!/bin/bash
# =============================================================================
# bootstrap-project.sh
# Inicializa el entorno de staging de SisHoras: valida configuración, crea
# directorios necesarios y levanta los servicios con Docker Compose.
#
# Uso:
#   bash scripts/staging/bootstrap-project.sh
#
# Ejecutar desde la raíz del repositorio.
# =============================================================================
set -euo pipefail

# ── Colores ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ── Directorio raíz del proyecto ──────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

info "Directorio del proyecto: ${PROJECT_ROOT}"
cd "${PROJECT_ROOT}"

# ── 1. Verificar/crear archivo .env ───────────────────────────────────────────
info "Verificando archivo .env..."

if [[ ! -f ".env" ]]; then
  if [[ -f ".env.example" ]]; then
    warn "Archivo .env no encontrado. Copiando desde .env.example..."
    cp .env.example .env
    warn "Se ha creado .env desde .env.example."
    warn "IMPORTANTE: Edite .env y configure todas las variables obligatorias antes de continuar."
    echo ""
    echo "  nano .env"
    echo ""
    read -r -p "¿Desea continuar sin editar .env ahora? [s/N]: " CONTINUE_WITHOUT_EDIT
    CONTINUE_WITHOUT_EDIT="${CONTINUE_WITHOUT_EDIT:-N}"
    if [[ ! "${CONTINUE_WITHOUT_EDIT}" =~ ^[Ss]$ ]]; then
      info "Saliendo. Edite .env y vuelva a ejecutar este script."
      exit 0
    fi
  else
    error "No se encontró ni .env ni .env.example en el directorio raíz."
    error "Por favor cree el archivo .env con las variables requeridas."
    exit 1
  fi
else
  success "Archivo .env encontrado."
fi

# ── 2. Validar variables obligatorias ─────────────────────────────────────────
info "Validando variables obligatorias en .env..."

# shellcheck source=/dev/null
set -a
source .env 2>/dev/null || true
set +a

MISSING_VARS=()

check_var() {
  local var_name="$1"
  local var_value="${!var_name:-}"
  if [[ -z "${var_value}" ]]; then
    MISSING_VARS+=("${var_name}")
  else
    success "${var_name} → definida"
  fi
}

check_var "DB_PASSWORD"
check_var "JWT_SECRET"
check_var "DB_NAME"

if [[ ${#MISSING_VARS[@]} -gt 0 ]]; then
  echo ""
  error "Las siguientes variables obligatorias están vacías o no definidas en .env:"
  for var in "${MISSING_VARS[@]}"; do
    error "  - ${var}"
  done
  echo ""
  error "Edite el archivo .env y defina estas variables antes de continuar."
  error "  nano .env"
  exit 1
fi

success "Variables obligatorias validadas."

# Advertencia adicional sobre JWT_SECRET corto
JWT_SECRET_LEN=${#JWT_SECRET}
if [[ "${JWT_SECRET_LEN}" -lt 32 ]]; then
  warn "JWT_SECRET tiene solo ${JWT_SECRET_LEN} caracteres. Se recomienda al menos 32."
  warn "Genere uno seguro con: openssl rand -hex 32"
fi

# ── 3. Crear directorios necesarios ───────────────────────────────────────────
info "Creando directorios necesarios..."

DIRS=(
  "uploads/documents"
  "backups/daily"
  "backups/monthly"
  "logs"
)

for dir in "${DIRS[@]}"; do
  if [[ ! -d "${dir}" ]]; then
    mkdir -p "${dir}"
    success "Creado: ${dir}/"
  else
    warn "Ya existe: ${dir}/ — omitiendo."
  fi
done

# ── 4. Verificar que docker-compose.staging.yml existe ───────────────────────
if [[ ! -f "docker-compose.staging.yml" ]]; then
  error "No se encontró docker-compose.staging.yml en la raíz del proyecto."
  error "Asegúrese de estar en el directorio correcto del repositorio."
  exit 1
fi

success "docker-compose.staging.yml encontrado."

# ── 5. Levantar servicios con Docker Compose ──────────────────────────────────
echo ""
info "Iniciando docker compose staging (--build). Esto puede tardar varios minutos..."
echo ""

docker compose -f docker-compose.staging.yml up -d --build

echo ""
success "docker compose up completado."

# ── 6. Esperar a que los healthchecks pasen ───────────────────────────────────
info "Esperando a que los servicios estén healthy (máx 120 segundos)..."

WAIT_SECONDS=0
MAX_WAIT=120
SLEEP_INTERVAL=5

while [[ "${WAIT_SECONDS}" -lt "${MAX_WAIT}" ]]; do
  UNHEALTHY=$(docker compose -f docker-compose.staging.yml ps --format json 2>/dev/null \
    | grep -c '"Health":"unhealthy"' || true)
  STARTING=$(docker compose -f docker-compose.staging.yml ps --format json 2>/dev/null \
    | grep -c '"Health":"starting"' || true)

  if [[ "${UNHEALTHY}" -eq 0 && "${STARTING}" -eq 0 ]]; then
    success "Todos los healthchecks pasados."
    break
  fi

  info "  Servicios iniciando... (${WAIT_SECONDS}s / ${MAX_WAIT}s)"
  sleep "${SLEEP_INTERVAL}"
  WAIT_SECONDS=$((WAIT_SECONDS + SLEEP_INTERVAL))
done

if [[ "${WAIT_SECONDS}" -ge "${MAX_WAIT}" ]]; then
  warn "Tiempo de espera agotado. Verifique manualmente el estado de los servicios."
fi

# ── 7. Estado de los contenedores ─────────────────────────────────────────────
echo ""
info "=== Estado de los contenedores ==="
docker compose -f docker-compose.staging.yml ps

# ── 8. Logs recientes de la API ───────────────────────────────────────────────
echo ""
info "=== Últimas 100 líneas de logs de la API ==="
docker compose -f docker-compose.staging.yml logs --tail=100 api

# ── 9. URL de acceso ──────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN} SisHoras Staging — Servicios levantados${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""

# Detectar IP pública o usar hostname
SERVER_IP=$(curl -s --max-time 3 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')

echo "  Frontend web:     http://${SERVER_IP}/"
echo "  API health:       http://${SERVER_IP}/api/health"
echo "  API health full:  http://${SERVER_IP}/api/health/full"
echo "  Métricas:         http://${SERVER_IP}/metrics"
echo "  Analytics docs:   http://${SERVER_IP}:5000/docs"
echo "  Bridge status:    http://${SERVER_IP}:8081/health"
echo ""
echo "  Para verificar todos los endpoints:"
echo "    bash scripts/staging/smoke-test.sh"
echo ""
echo "  Para ver logs en tiempo real:"
echo "    docker compose -f docker-compose.staging.yml logs -f"
echo ""
