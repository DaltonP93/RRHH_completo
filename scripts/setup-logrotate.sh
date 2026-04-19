#!/usr/bin/env bash
# scripts/setup-logrotate.sh
# Configura rotación de logs de PM2 para que no llenen el disco.
#
# Uso (una sola vez en el servidor):
#   bash scripts/setup-logrotate.sh

set -e

echo "📦 Instalando pm2-logrotate..."
pm2 install pm2-logrotate

echo "⚙️  Configurando políticas..."
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'   # rotación diaria

echo "✅ Listo. Logs rotarán al superar 50 MB o diariamente, conservando 14 días."
pm2 conf pm2-logrotate
