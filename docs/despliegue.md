# Despliegue en producción (Hostinger)

Dónde vive cada parte:

| Parte | Dónde | Dirección (ejemplo) |
|---|---|---|
| Panel web (React, archivos estáticos) | Hosting web de Hostinger, subdominio | `https://gps.jalmeco.com.bo` |
| API + base de datos + worker (Docker) | VPS de Hostinger | `https://api.jalmeco.com.bo` |
| App del técnico (APK) | celulares | llama a `https://api.jalmeco.com.bo/api/v1` |

Los nombres `gps.` y `api.` son sugerencias: si usan otros, reemplazarlos en todo este documento.

Despliegue automático (GitHub Actions):

- `.github/workflows/backend.yml`: en cada cambio en `backend/` corre las pruebas; al llegar a
  `main`, entra al VPS por SSH y corre `deploy/deploy.sh`.
- `.github/workflows/panel.yml`: en cada cambio en `web-admin/` revisa y prueba; al llegar a `main`,
  compila el panel y lo sube a Hostinger por FTP.

Se trabaja en ramas → se revisa → se fusiona a `main` → se despliega solo.

---

## 1. VPS (una sola vez)

### 1.1 Crear el VPS

En hPanel → **VPS**:

- Plan: **KVM 1** (4 GB de RAM) alcanza para ~50 personas; **KVM 2** si quieren margen.
- Sistema: plantilla **Ubuntu 24.04 with Docker** (trae Docker instalado).
- Ubicación: la más cercana a Bolivia que ofrezcan (São Paulo / Estados Unidos).
- Cargar una **llave SSH** (no solo contraseña). En Windows: `ssh-keygen -t ed25519` y pegar el
  contenido de `C:\Users\<usuario>\.ssh\id_ed25519.pub`.
- Anotar la **IP** del VPS.

### 1.2 DNS

En hPanel → **Dominios → jalmeco.com.bo → DNS / Nameservers**, crear:

| Tipo | Nombre | Apunta a | TTL |
|---|---|---|---|
| A | `api` | IP del VPS | 3600 |

(El subdominio `gps` del panel se crea en el paso 2; Hostinger arma su DNS solo.)

Comprobar desde la PC (puede tardar unos minutos): `nslookup api.jalmeco.com.bo` → debe dar la IP del VPS.

### 1.3 Seguridad del servidor

Entrar: `ssh root@IP_DEL_VPS`

```bash
# Actualizaciones de seguridad automáticas
apt update && apt upgrade -y
apt install -y unattended-upgrades fail2ban git rsync
dpkg-reconfigure -f noninteractive unattended-upgrades

# Usuario para desplegar (GitHub Actions entra con este, no con root)
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh && cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh

# Firewall: solo SSH y web
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp
ufw --force enable

# SSH solo con llave (sin contraseñas)
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh
```

Además, en hPanel → VPS → **Firewall**, dejar abiertos solo 22, 80 y 443.

> Antes de cerrar la sesión de root, probar en otra ventana que `ssh deploy@IP_DEL_VPS` entra.

### 1.4 Bajar el código

Como el repositorio es privado, el VPS necesita una **llave de solo lectura** (deploy key):

```bash
su - deploy
ssh-keygen -t ed25519 -N "" -f ~/.ssh/github_jalmeco
cat ~/.ssh/github_jalmeco.pub
```

Copiar esa línea en GitHub → repositorio → **Settings → Deploy keys → Add deploy key** (sin marcar
"Allow write access"). Luego:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/github_jalmeco
EOF
sudo mkdir -p /opt/jalmeco && sudo chown deploy:deploy /opt/jalmeco
git clone git@github.com:rebecayucratovar/JalmecoApp.git /opt/jalmeco
```

### 1.5 Variables de producción

```bash
cd /opt/jalmeco
cp deploy/env.produccion.example backend/.env
chmod 600 backend/.env
python3 -c "import secrets; print(secrets.token_urlsafe(50))"   # → SECRET_KEY
python3 -c "import secrets; print(secrets.token_urlsafe(32))"   # → DB_PASSWORD
nano backend/.env
```

Completar: `SECRET_KEY`, `DB_PASSWORD`, `ADMIN_URL` (algo como `gestion-k3x9/`), los dominios,
`ODOO_USUARIO` / `ODOO_API_KEY` (el usuario de integración) y el correo (`EMAIL_HOST_USER`,
`EMAIL_HOST_PASSWORD`).

### 1.6 Primer despliegue

```bash
chmod +x deploy/*.sh
./deploy/deploy.sh
```

La primera vez tarda unos minutos (construye la imagen). Caddy saca el certificado HTTPS solo, si el
DNS del paso 1.2 ya apunta al VPS. Comprobar en el navegador:
`https://api.jalmeco.com.bo/api/v1/auth/refresh` → debe responder (un error 405 está bien: significa
que la API responde).

Crear el primer administrador:

```bash
docker compose -f docker-compose.prod.yml --env-file backend/.env exec backend \
  python manage.py crear_admin --email carla@jalmeco.com.bo --nombre "Carla …"
```

(pide la contraseña por consola).

### 1.7 Respaldos diarios

```bash
sudo crontab -e
# agregar:
0 3 * * * /opt/jalmeco/deploy/backup.sh >> /var/log/jalmeco-backup.log 2>&1
```

Probar a mano una vez: `sudo /opt/jalmeco/deploy/backup.sh`. Guarda 14 días en
`/var/backups/jalmeco`. Para copiar al NAS, completar `NAS_DESTINO` en `backend/.env` (requiere
acceso SSH del VPS al NAS). **Un respaldo solo sirve si se probó restaurarlo**: la orden está al final
de `deploy/backup.sh`.

---

## 2. Panel en el hosting de Hostinger (una sola vez)

1. hPanel → **Sitios web → jalmeco.com.bo → Dominios → Subdominios** → crear `gps`.
   Anotar su carpeta (p. ej. `public_html/gps/` o `domains/gps.jalmeco.com.bo/public_html/`).
2. hPanel → **Seguridad → SSL**: activar el certificado gratis para `gps.jalmeco.com.bo`.
3. hPanel → **Archivos → Cuentas FTP**: crear una cuenta **limitada a la carpeta del subdominio**.
   Anotar servidor, usuario y contraseña.

---

## 3. GitHub (una sola vez)

Repositorio → **Settings**:

**Environments → New environment → `produccion`**. Opcional: "Required reviewers" para aprobar cada
despliegue a mano.

**Secrets and variables → Actions**:

| Tipo | Nombre | Valor |
|---|---|---|
| Secret | `VPS_HOST` | IP del VPS |
| Secret | `VPS_USUARIO` | `deploy` |
| Secret | `VPS_CLAVE_SSH` | llave **privada** para entrar como `deploy` (ver abajo) |
| Secret | `FTP_SERVIDOR` | servidor FTP de Hostinger (p. ej. `ftp.jalmeco.com.bo`) |
| Secret | `FTP_USUARIO` | usuario de la cuenta FTP del paso 2.3 |
| Secret | `FTP_CLAVE` | su contraseña |
| Variable | `VITE_API_URL` | `https://api.jalmeco.com.bo/api/v1` |
| Variable | `FTP_CARPETA` | `./` si la cuenta FTP ya está limitada a la carpeta del subdominio |

Llave para GitHub Actions (una aparte, solo para desplegar). En el VPS, como `deploy`:

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/actions -C "github-actions"
cat ~/.ssh/actions.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/actions        # → copiar TODO (incluidas las líneas BEGIN/END) en el secret VPS_CLAVE_SSH
rm ~/.ssh/actions         # la privada solo queda en GitHub
```

Activar **Settings → Code security → Dependabot alerts** (avisa de dependencias con vulnerabilidades).

Probar: **Actions → Backend / Panel web → Run workflow** sobre `main`.

---

## 4. App del técnico (APK)

La dirección de la API se fija al compilar:

```bash
cd mobile
flutter build apk --release --dart-define=API_URL=https://api.jalmeco.com.bo/api/v1
```

El APK queda en `mobile/build/app/outputs/flutter-apk/app-release.apk`. Para producción debe ir
**firmado** con la llave de la empresa (guardar esa llave y su contraseña en un lugar seguro: sin ella
no se pueden publicar actualizaciones).

En cada celular: instalar, dar permiso de ubicación "Todo el tiempo" y **quitar la optimización de
batería** para la app.

---

## 5. Día a día

| Tarea | Cómo |
|---|---|
| Publicar cambios | Fusionar a `main`: GitHub prueba y despliega solo |
| Ver si algo falló | GitHub → **Actions** (rojo = falló, nada se desplegó) |
| Logs del servidor | `docker compose -f docker-compose.prod.yml --env-file backend/.env logs -f backend worker` |
| Reiniciar todo | `./deploy/deploy.sh` |
| Cambiar una variable | editar `backend/.env` y correr `./deploy/deploy.sh` |
| Restaurar un respaldo | ver el final de `deploy/backup.sh` |

## Lista de seguridad

- [ ] `DEBUG=False`, `SECRET_KEY` y `DB_PASSWORD` al azar (el backend no arranca con la clave de ejemplo)
- [ ] `ADMIN_URL` distinto de `admin/`
- [ ] Firewall: solo 22, 80, 443. La base de datos no publica puertos
- [ ] SSH solo con llave; fail2ban y actualizaciones automáticas activos
- [ ] `backend/.env` con permisos 600 y nunca en GitHub
- [ ] HTTPS en `api.` (Caddy) y en `gps.` (SSL de Hostinger)
- [ ] CORS: solo `https://gps.jalmeco.com.bo`
- [ ] Respaldo diario funcionando y una restauración probada
- [ ] Usuario de Odoo de integración con permisos mínimos
- [ ] APK firmado; llave de firma guardada fuera del repositorio
- [ ] Dependabot activo
