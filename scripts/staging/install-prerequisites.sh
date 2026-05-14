#!/bin/bash
# =============================================================================
# install-prerequisites.sh
# Instala Docker CE y herramientas base en Ubuntu 22.04 para el entorno staging
# de SisHoras.
#
# Uso:
#   bash scripts/staging/install-prerequisites.sh
#
# Ejecutar como usuario con privilegios sudo (NO como root).
# =============================================================================
set -euo pipefail

# ── Colores para output ────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ── 1. Verificar Ubuntu 22.04 ─────────────────────────────────────────────────
info "Verificando sistema operativo..."

if [[ ! -f /etc/os-release ]]; then
  error "No se encontró /etc/os-release. Este script solo soporta Ubuntu 22.04."
  exit 1
fi

# shellcheck source=/dev/null
source /etc/os-release

if [[ "${ID:-}" != "ubuntu" ]]; then
  error "Sistema operativo detectado: '${ID:-desconocido}'. Se requiere Ubuntu."
  exit 1
fi

if [[ "${VERSION_ID:-}" != "22.04" ]]; then
  error "Versión de Ubuntu detectada: '${VERSION_ID:-desconocida}'. Se requiere Ubuntu 22.04 LTS."
  exit 1
fi

success "Sistema operativo: Ubuntu ${VERSION_ID} (${VERSION_CODENAME}) — OK"

# ── 2. Verificar que no se ejecuta como root ──────────────────────────────────
if [[ "$EUID" -eq 0 ]]; then
  error "No ejecute este script como root. Use un usuario con sudo."
  exit 1
fi

info "Usuario actual: $(whoami)"

# ── 3. Actualizar repositorios e instalar paquetes base ───────────────────────
info "Actualizando repositorios de apt..."
sudo apt-get update -qq

info "Instalando paquetes base..."
sudo apt-get install -y \
  ca-certificates \
  curl \
  gnupg \
  lsb-release \
  git \
  wget \
  unzip \
  build-essential \
  ufw \
  htop \
  nano \
  jq

success "Paquetes base instalados."

# ── 4. Agregar repositorio Docker CE oficial ──────────────────────────────────
info "Configurando repositorio Docker CE..."

# Crear directorio para keyrings si no existe
sudo install -m 0755 -d /etc/apt/keyrings

# Descargar y agregar clave GPG de Docker
if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  success "Clave GPG de Docker agregada."
else
  warn "Clave GPG de Docker ya existe, omitiendo."
fi

# Agregar el repositorio
DOCKER_REPO_FILE="/etc/apt/sources.list.d/docker.list"
if [[ ! -f "${DOCKER_REPO_FILE}" ]]; then
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu \
$(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee "${DOCKER_REPO_FILE}" > /dev/null
  success "Repositorio Docker CE agregado."
else
  warn "Repositorio Docker CE ya configurado, omitiendo."
fi

sudo apt-get update -qq

# ── 5. Instalar Docker CE y plugins ───────────────────────────────────────────
info "Instalando Docker CE, CLI, Containerd y plugins Buildx y Compose..."

sudo apt-get install -y \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin

success "Docker CE instalado."

# ── 6. Agregar usuario al grupo docker ────────────────────────────────────────
CURRENT_USER="${USER:-$(id -un)}"

if id -nG "$CURRENT_USER" | grep -qw docker; then
  warn "El usuario '${CURRENT_USER}' ya pertenece al grupo docker."
else
  info "Agregando '${CURRENT_USER}' al grupo docker..."
  sudo usermod -aG docker "$CURRENT_USER"
  success "Usuario '${CURRENT_USER}' agregado al grupo docker."
fi

# ── 7. Habilitar y arrancar Docker ────────────────────────────────────────────
info "Habilitando el servicio Docker para que inicie con el sistema..."
sudo systemctl enable docker --quiet
sudo systemctl start docker
success "Servicio Docker activo."

# ── 8. Validaciones finales ───────────────────────────────────────────────────
echo ""
info "=== Validaciones ==="

DOCKER_VERSION=$(docker --version 2>/dev/null || echo "NO ENCONTRADO")
if echo "$DOCKER_VERSION" | grep -q "Docker version"; then
  success "docker --version    → ${DOCKER_VERSION}"
else
  error "docker no encontrado o no responde: ${DOCKER_VERSION}"
  exit 1
fi

COMPOSE_VERSION=$(docker compose version 2>/dev/null || echo "NO ENCONTRADO")
if echo "$COMPOSE_VERSION" | grep -q "Docker Compose version"; then
  success "docker compose      → ${COMPOSE_VERSION}"
else
  error "docker compose plugin no encontrado: ${COMPOSE_VERSION}"
  exit 1
fi

GIT_VERSION=$(git --version 2>/dev/null || echo "NO ENCONTRADO")
if echo "$GIT_VERSION" | grep -q "git version"; then
  success "git --version       → ${GIT_VERSION}"
else
  error "git no encontrado: ${GIT_VERSION}"
  exit 1
fi

# ── 9. Instrucciones de cierre/reapertura de sesión ───────────────────────────
echo ""
echo -e "${YELLOW}============================================================${NC}"
echo -e "${YELLOW} ACCION REQUERIDA: Cierre y reabra la sesión SSH${NC}"
echo -e "${YELLOW}============================================================${NC}"
echo ""
echo "  El usuario '${CURRENT_USER}' fue agregado al grupo 'docker', pero"
echo "  el cambio solo surte efecto en sesiones nuevas."
echo ""
echo "  1. Cierre esta sesión SSH:"
echo "       exit"
echo ""
echo "  2. Vuelva a conectarse:"
echo "       ssh <usuario>@<ip-del-servidor>"
echo ""
echo "  3. Verifique el grupo:"
echo "       groups \$USER | grep docker"
echo ""
echo "  4. Pruebe Docker sin sudo:"
echo "       docker run --rm hello-world"
echo ""
echo "  5. Luego continue con:"
echo "       bash scripts/staging/bootstrap-project.sh"
echo ""
echo -e "${GREEN}Instalación de prerequisites completada exitosamente.${NC}"
