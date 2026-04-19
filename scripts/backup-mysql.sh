#!/usr/bin/env bash
# scripts/backup-mysql.sh
# Backup diario comprimido de la BD `asistencia`.
# Instalar en crontab:
#   0 2 * * * /var/www/html/Gestion_Horas/scripts/backup-mysql.sh >> /var/log/sishoras-backup.log 2>&1

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/sishoras}"
DB_NAME="${DB_NAME:-asistencia}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

mkdir -p "$BACKUP_DIR"

DATE=$(date +%Y-%m-%d)
FILE="$BACKUP_DIR/${DB_NAME}_${DATE}.sql.gz"

echo "[$(date '+%F %T')] Iniciando backup de $DB_NAME..."

# mysqldump → gzip directo. --single-transaction para consistencia sin bloquear.
mysqldump \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --events \
  --default-character-set=utf8mb4 \
  "$DB_NAME" | gzip -9 > "$FILE"

SIZE=$(du -h "$FILE" | cut -f1)
echo "[$(date '+%F %T')] ✅ Backup creado: $FILE ($SIZE)"

# Eliminar backups más viejos que RETENTION_DAYS
find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
echo "[$(date '+%F %T')] Backups viejos purgados (> $RETENTION_DAYS días)"

# Verificar integridad — que el archivo no esté corrupto
if gzip -t "$FILE"; then
  echo "[$(date '+%F %T')] Integridad OK"
else
  echo "[$(date '+%F %T')] ❌ ARCHIVO CORRUPTO: $FILE"
  exit 1
fi
