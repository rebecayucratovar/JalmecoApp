#!/usr/bin/env bash
# Despliega la última versión de `main` en el VPS. Lo corre GitHub Actions por SSH (o a mano).
#   cd /opt/jalmeco && ./deploy/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file backend/.env)

echo "==> Bajando cambios de main"
git fetch --quiet origin main
git reset --hard origin/main   # el servidor no tiene cambios propios: siempre igual a main

echo "==> Construyendo y levantando"
"${COMPOSE[@]}" up -d --build --remove-orphans

echo "==> Esperando a la API"
# Cualquier respuesta HTTP (aunque sea 405) = gunicorn ya atiende
PRUEBA=$'import urllib.request as u, urllib.error as e\ntry:\n    u.urlopen("http://localhost:8000/api/v1/auth/refresh", timeout=3)\nexcept e.HTTPError:\n    pass'
lista=0
for _ in $(seq 1 45); do
  if "${COMPOSE[@]}" exec -T backend python -c "$PRUEBA" 2>/dev/null; then lista=1; break; fi
  sleep 2
done
if [ "$lista" -ne 1 ]; then
  echo "!! La API no respondió en 90 s. Revisa: ${COMPOSE[*]} logs backend --tail 50" >&2
  exit 1
fi

"${COMPOSE[@]}" ps
docker image prune -f >/dev/null   # borrar imágenes viejas (que no se llene el disco)
echo "==> Listo: $(git log -1 --format='%h %s')"
