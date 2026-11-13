# Jalmeco GPS

Sistema de seguimiento de técnicos de campo. Monorepo con tres partes:

| Carpeta      | Tecnología                                        | Rol                                              |
|--------------|---------------------------------------------------|--------------------------------------------------|
| `backend/`   | Django + Django REST Framework + GeoDjango        | API REST y worker (sincronización con Odoo, alertas) |
| `web-admin/` | React + Vite + TypeScript                         | Panel web del administrador                      |
| `mobile/`    | Flutter                                           | App Android del técnico                          |

Base de datos: **PostgreSQL + PostGIS**. En desarrollo la base de datos y el backend corren en **Docker**.

```
JalmecoApp/
├── README.md
├── .gitignore
├── docker-compose.yml      # servicios: db (PostGIS) + backend
├── backend/                # proyecto Django "config"
│   ├── config/             # settings, urls, wsgi/asgi
│   ├── usuarios/           # apps (vacías por ahora)
│   ├── jornadas/
│   ├── ubicaciones/
│   ├── alertas/
│   ├── odoo_sync/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── .env.example
├── web-admin/              # React + Vite + TS
└── mobile/                 # Flutter (Android)
```

## Requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (incluye Docker Compose)
- [Node.js](https://nodejs.org/) 20.19+ y npm
- [Flutter](https://docs.flutter.dev/get-started/install) 3.32+ con Android SDK
- Git

## Clonar el repositorio

```bash
git clone https://github.com/rebecayucratovar/JalmecoApp.git
cd JalmecoApp
code .        # abrir en VS Code (opcional)
```

## 1. Backend (Django + PostGIS en Docker)

```bash
# Crear el archivo de variables de entorno a partir del ejemplo
cp backend/.env.example backend/.env        # PowerShell: Copy-Item backend\.env.example backend\.env

# Levantar base de datos + backend + worker (tareas periódicas)
docker compose up --build

# En otra terminal: migraciones y superusuario
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py createsuperuser
```

- API: http://localhost:8000
- Admin de Django: http://localhost:8000/admin
- PostgreSQL/PostGIS: `localhost:5432`
- Worker: `docker compose logs -f worker` (solo registra cuando hace algo).
  Probar una vuelta: `docker compose exec backend python manage.py worker --una-vez`
- Pruebas: `docker compose exec backend python manage.py test`

> Los valores por defecto de `docker-compose.yml` para la base de datos (`jalmeco` / `jalmeco` / `jalmeco`)
> coinciden con `.env.example`. Si los cambias en `backend/.env`, exporta también `DB_NAME`, `DB_USER`
> y `DB_PASSWORD` en tu terminal o ejecuta `docker compose --env-file backend/.env up`.

Variables de entorno (`backend/.env`): `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `DB_NAME`, `DB_USER`,
`DB_PASSWORD`, `DB_HOST`, `DB_PORT` `ODOO_*` y `EMAIL_*` (ver `.env.example`). **Nunca subas `.env` al repositorio**, solo `.env.example`.

### Entorno virtual local (opcional, para el editor)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
```

> Ejecutar Django fuera de Docker requiere GDAL/GEOS instalados en el sistema (GeoDjango).
> Por eso se recomienda usar Docker.

## 2. Web admin (React + Vite + TypeScript)

```bash
cd web-admin
npm install
npm run dev
```

Abre http://localhost:5173 (con el backend levantado). Detalles en [web-admin/README.md](web-admin/README.md).

## 3. Mobile (Flutter, Android)

```bash
cd mobile
flutter pub get
flutter run          # con un emulador Android abierto o un dispositivo conectado
```

> Desde el emulador Android, el backend local se accede en `http://10.0.2.2:8000`.
