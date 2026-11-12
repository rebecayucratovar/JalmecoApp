#!/usr/bin/env bash
# Respaldo diario de la base de datos (lo corre cron a las 03:00; ver docs/despliegue.md).
# Guarda un .dump comprimido por día en /var/backups/jalmeco y borra los de más de 14 días.
# Si NAS_DESTINO está definido (p. ej. usuario@nas:/backups/jalmeco), además lo copia allá.
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; source backend/.env; set +a   # DB_NAME, DB_USER, NAS_DESTINO…

DESTINO=/var/backups/jalmeco
mkdir -p "$DESTINO"
chmod 700 "$DESTINO"   # solo root: tiene datos personales (ubicaciones)
ARCHIVO="$DESTINO/jalmeco-$(date +%Y%m%d-%H%M).dump"

docker compose -f docker-compose.prod.yml --env-file backend/.env exec -T db \
  pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$ARCHIVO"
chmod 600 "$ARCHIVO"

# Un respaldo vacío o cortado no sirve: avisar en el log de cron
if [ ! -s "$ARCHIVO" ]; then
  echo "!! Respaldo vacío: $ARCHIVO" >&2
  exit 1
fi

find "$DESTINO" -name 'jalmeco-*.dump' -mtime +14 -delete

if [ -n "${NAS_DESTINO:-}" ]; then
  rsync -a "$ARCHIVO" "$NAS_DESTINO/"
fi

echo "Respaldo OK: $ARCHIVO ($(du -h "$ARCHIVO" | cut -f1))"

# Restaurar (en un servidor nuevo, con la base vacía):
#   docker compose -f docker-compose.prod.yml --env-file backend/.env exec -T db \
#     pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists < jalmeco-AAAAMMDD-HHMM.dump
