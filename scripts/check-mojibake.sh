#!/usr/bin/env bash
# check-mojibake.sh — Detecta caracteres mojibake (Latin-1 re-codificados como UTF-8)
# en los fuentes del frontend.
#
# Uso: bash scripts/check-mojibake.sh
# Exit 1 si se encuentran mojibake, 0 si está limpio.
#
# Los patrones buscados son secuencias UTF-8 que corresponden a Latin-1 mal decodificado:
#   Ã³ = ó doble-codificado    Ã© = é    Ã­ = í    Ã¡ = á    Ã± = ñ
#   Ã  = à   Ã¼ = ü   Ã¶ = ö   Ã¢ = â   â€™ = ' (comilla)

set -euo pipefail

SEARCH_DIR="${1:-web/src}"
FOUND=0

echo "Buscando mojibake en ${SEARCH_DIR} ..."

declare -A PATTERNS=(
  ["NÃ³mina"]="Nómina mal codificado"
  ["marcaciÃ³n"]="marcación mal codificado"
  ["auditorÃ­a"]="auditoría mal codificado"
  ["electrÃ³nico"]="electrónico mal codificado"
  ["configuraciÃ³n"]="configuración mal codificado"
  ["comunicaciÃ³n"]="comunicación mal codificado"
  ["administraciÃ³n"]="administración mal codificado"
  ["informaciÃ³n"]="información mal codificado"
  ["autenticaciÃ³n"]="autenticación mal codificado"
  ["documentaciÃ³n"]="documentación mal codificado"
  ["gestiÃ³n"]="gestión mal codificado"
  ["acciÃ³n"]="acción mal codificado"
  ["TÃ©cnico"]="Técnico mal codificado"
  ["MarcaciÃ³n"]="Marcación mal codificado"
  ["AuditorÃ­a"]="Auditoría mal codificado"
)

for pattern in "${!PATTERNS[@]}"; do
  desc="${PATTERNS[$pattern]}"
  matches=$(grep -rn "$pattern" "$SEARCH_DIR" 2>/dev/null | grep -v ".next\|node_modules\|tsbuildinfo" | wc -l || echo "0")
  matches=$(echo "$matches" | tr -d '[:space:]')
  if [ "$matches" -gt 0 ]; then
    echo "FAIL  [$matches ocurrencias] $desc ($pattern)"
    grep -rn "$pattern" "$SEARCH_DIR" 2>/dev/null | grep -v ".next\|node_modules\|tsbuildinfo" | head -3
    FOUND=$((FOUND + 1))
  fi
done

# También buscar secuencias Ã seguidas de cualquier carácter (genérico)
GENERIC=$(grep -rPn "Ã[³©­¡±¼¶]" "$SEARCH_DIR" 2>/dev/null | grep -v ".next\|node_modules\|tsbuildinfo" | wc -l || echo "0")
GENERIC=$(echo "$GENERIC" | tr -d '[:space:]')
if [ "$GENERIC" -gt 0 ]; then
  echo "FAIL  [$GENERIC ocurrencias] Secuencias Ã+vocal (mojibake genérico)"
  grep -rPn "Ã[³©­¡±¼¶]" "$SEARCH_DIR" 2>/dev/null | grep -v ".next\|node_modules\|tsbuildinfo" | head -5
  FOUND=$((FOUND + 1))
fi

echo ""
if [ "$FOUND" -gt 0 ]; then
  echo "ERROR: Se encontraron ${FOUND} tipos de mojibake. Corregir encoding antes de hacer push."
  exit 1
else
  echo "OK: No se encontraron caracteres mojibake en ${SEARCH_DIR}."
  exit 0
fi
