#!/bin/bash
# restore-backup.sh — Restaurar backup de MySQL + uploads
#
# Uso:
#   ./scripts/restore-backup.sh backups/daily/backup_2026-05-13_mysql.sql.gz
#   ./scripts/restore-backup.sh backups/daily/backup_2026-05-13_mysql.sql.gz --with-uploads backups/daily/backup_2026-05-13_uploads.tar.gz
#
# ADVERTENCIA: Este script sobreescribe la base de datos actual.
# Detener los servicios antes de restaurar:
#   pm2 stop all

set -euo pipefail

SQL_BACKUP="${1:-}"
UPLOADS_BACKUP=""
WITH_UPLOADS=false

# Parsear argumentos
shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-uploads)
      WITH_UPLOADS=true
      UPLOADS_BACKUP="${2:-}"
      shift 2
      ;;
    *) echo "Argumento desconocido: $1"; exit 1 ;;
  esac
done

if [[ -z "$SQL_BACKUP" ]]; then
  echo "Uso: $0 <archivo_backup.sql.gz> [--with-uploads <uploads.tar.gz>]"
  echo ""
  echo "Backups disponibles:"
  find backups/ -name "*.sql.gz" 2>/dev/null | sort -r | head -20
  exit 1
fi

if [[ ! -f "$SQL_BACKUP" ]]; then
  echo "ERROR: Archivo no encontrado: $SQL_BACKUP"
  exit 1
fi

# Leer variables de entorno
source .env 2>/dev/null || true
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-asistencia}"
DB_USER="${DB_USER:-asistencia_user}"
DB_PASSWORD="${DB_PASSWORD:-}"

echo "============================================================"
echo "  SisHoras — Restauración de Backup"
echo "============================================================"
echo "  Archivo SQL : $SQL_BACKUP"
echo "  Base datos  : $DB_NAME en $DB_HOST:$DB_PORT"
if $WITH_UPLOADS; then
  echo "  Uploads     : $UPLOADS_BACKUP"
fi
echo ""
echo "ADVERTENCIA: Esto sobreescribirá la base de datos actual."
read -p "Confirmar restauración (escribir 'si' para continuar): " CONFIRM

if [[ "$CONFIRM" != "si" ]]; then
  echo "Restauración cancelada."
  exit 0
fi

echo ""
echo "[1/$(($WITH_UPLOADS ? 3 : 2))] Restaurando MySQL desde $SQL_BACKUP ..."

# Descomprimir y restaurar
if [[ "$SQL_BACKUP" == *.gz ]]; then
  gunzip -c "$SQL_BACKUP" | mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" \
    --password="$DB_PASSWORD" "$DB_NAME"
else
  mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" \
    --password="$DB_PASSWORD" "$DB_NAME" < "$SQL_BACKUP"
fi

echo "    MySQL restaurado OK"

if $WITH_UPLOADS && [[ -n "$UPLOADS_BACKUP" ]]; then
  if [[ ! -f "$UPLOADS_BACKUP" ]]; then
    echo "ERROR: Archivo de uploads no encontrado: $UPLOADS_BACKUP"
    exit 1
  fi
  echo ""
  echo "[2/3] Restaurando uploads desde $UPLOADS_BACKUP ..."
  UPLOADS_DIR="${DOCUMENT_STORAGE_PATH:-./uploads}"
  PARENT_DIR=$(dirname "$UPLOADS_DIR")
  tar -xzf "$UPLOADS_BACKUP" -C "$PARENT_DIR"
  echo "    Uploads restaurados en $UPLOADS_DIR"
fi

echo ""
echo "[$(($WITH_UPLOADS ? 3 : 2))/$(($WITH_UPLOADS ? 3 : 2))] Verificando integridad..."
TABLES=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" \
  --password="$DB_PASSWORD" "$DB_NAME" \
  -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB_NAME';" -s --skip-column-names 2>/dev/null || echo "0")

echo "    Tablas en la base de datos: $TABLES"

echo ""
echo "============================================================"
echo "  Restauración completada exitosamente"
echo "  Reiniciar servicios: pm2 start ecosystem.config.js"
echo "============================================================"
