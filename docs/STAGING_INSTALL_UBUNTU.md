# Guía de Instalación en Staging — Ubuntu 22.04

> **Alcance:** Despliegue completo del sistema SisHoras en un servidor Ubuntu 22.04 limpio usando Docker Compose (staging). Siga los pasos en orden.

---

## 1. Requisitos mínimos del servidor

| Recurso          | Mínimo recomendado    |
|------------------|-----------------------|
| CPU              | 2 vCPU                |
| RAM              | 4 GB                  |
| Disco            | 40 GB SSD             |
| Sistema operativo| Ubuntu 22.04 LTS      |
| Puertos abiertos | 80, 443, 8080         |
| Acceso           | SSH con usuario no-root que tenga `sudo` |

Puertos requeridos:

- **80 / 443** — Nginx (interfaz web + API pública)
- **8080** — Bridge ZKTeco PUSH (relojes biométricos)

Verifique que su proveedor de nube o firewall perimetral tenga esos puertos habilitados antes de continuar.

---

## 2. Instalar Docker CE y el plugin Compose

Ejecute como usuario con privilegios `sudo` (no como `root` directo):

```bash
# Actualizar índice de paquetes e instalar dependencias base
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y \
  ca-certificates curl gnupg lsb-release \
  git wget unzip build-essential ufw htop nano jq

# Agregar la clave GPG oficial de Docker
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Agregar el repositorio Docker CE
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Instalar Docker CE y plugins
sudo apt-get update
sudo apt-get install -y \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin

# Agregar el usuario actual al grupo docker (evitar sudo en cada comando)
sudo usermod -aG docker "$USER"

# Verificar instalación
docker --version
docker compose version
git --version
```

> **Importante:** Después de `usermod -aG docker "$USER"`, **cierre la sesión SSH y vuelva a conectarse** para que el cambio de grupo surta efecto. Sin esto, obtendrá errores de permisos al ejecutar `docker` sin `sudo`.

---

## 3. Clonar el repositorio desde GitHub

```bash
# Ir al directorio donde vivirá el proyecto (ajuste según su servidor)
cd /opt

# Crear directorio y asignar propiedad
sudo mkdir -p sishoras
sudo chown "$USER":"$USER" sishoras

# Clonar el repositorio
git clone https://github.com/DaltonP93/Gestion_Horas.git sishoras
cd sishoras
```

> Si el repositorio es privado, configure una deploy key SSH o use un token de acceso personal antes de clonar.

---

## 4. Crear el archivo `.env` desde la plantilla

El archivo `.env.example` contiene todas las variables necesarias con valores de ejemplo o en blanco. Cópielo y edite los valores sensibles:

```bash
cp .env.example .env
nano .env
```

### 4.1 Variables obligatorias a configurar

Las siguientes variables **no tienen valor por defecto seguro** y deben ser establecidas explícitamente antes de levantar los servicios:

| Variable            | Descripción                                                                  |
|---------------------|------------------------------------------------------------------------------|
| `DB_HOST`           | Host del servidor MySQL. En Docker interno usar `mysql` (nombre del servicio). |
| `DB_PORT`           | Puerto MySQL. Valor: `3306`.                                                 |
| `DB_NAME`           | Nombre de la base de datos. Valor: `asistencia`.                             |
| `DB_USER`           | Usuario MySQL con acceso a la base `asistencia`.                             |
| `DB_PASSWORD`       | Contraseña del usuario MySQL. **Use una contraseña fuerte.**                 |
| `JWT_SECRET`        | Secreto para firmar tokens JWT. **Mínimo 32 caracteres aleatorios.**         |
| `REDIS_URL`         | URL de conexión a Redis. En Docker interno: `redis://redis:6379`.            |
| `ATT_HOST`          | Host del servidor SQL Server `att2000` (entorno Adventista, solo lectura).   |
| `ATT_PASSWORD`      | Contraseña del usuario de solo lectura en `att2000`.                         |
| `FRONTEND_URL`      | URL pública del frontend. Ej: `http://<ip-del-servidor>` o `https://staging.empresa.com`. |

#### Generar valores seguros para secretos

```bash
# Generar JWT_SECRET (64 caracteres hexadecimales)
openssl rand -hex 32

# Generar DB_PASSWORD aleatoria
openssl rand -base64 24
```

### 4.2 Variables opcionales relevantes para staging

```bash
# Exponer la API directamente en el puerto 4000 (útil para debugging con curl)
STAGING_EXPOSE_API=true

# SMTP para notificaciones por correo (opcional en staging)
SMTP_HOST=smtp.empresa.com
SMTP_PORT=587
SMTP_USER=noreply@empresa.com
SMTP_PASSWORD=...
```

---

## 5. Crear directorios necesarios

```bash
mkdir -p uploads/documents
mkdir -p backups/daily
mkdir -p backups/monthly
mkdir -p logs
```

---

## 6. Levantar los servicios con Docker Compose

```bash
docker compose -f docker-compose.staging.yml up -d --build
```

Este comando:
1. Construye las imágenes de `api`, `web`, `bridge` y `analytics` desde sus respectivos `Dockerfile`.
2. Descarga las imágenes base: `mysql:8.0`, `redis:7-alpine`, `nginx:alpine`.
3. Inicia todos los contenedores en segundo plano (`-d`).

La primera ejecución puede tardar entre 5 y 15 minutos dependiendo de la velocidad de conexión a Internet.

---

## 7. Verificación de logs y estado

### Ver estado de los contenedores

```bash
docker compose -f docker-compose.staging.yml ps
```

Todos los servicios deben aparecer en estado `Up` o `healthy`. Si alguno aparece `Restarting` o `Exited`, revisar sus logs.

### Ver logs en tiempo real

```bash
# API principal
docker compose -f docker-compose.staging.yml logs -f api

# Interfaz web (Next.js)
docker compose -f docker-compose.staging.yml logs -f web

# MySQL
docker compose -f docker-compose.staging.yml logs -f mysql

# Todos los servicios a la vez (Ctrl+C para salir)
docker compose -f docker-compose.staging.yml logs -f
```

---

## 8. Verificación de endpoints

Una vez que todos los contenedores estén en estado `Up` o `healthy`, verifique los endpoints:

```bash
# Health básico de la API
curl -s http://localhost/api/health | jq .

# Health completo (incluye MySQL, Redis y att2000)
curl -s http://localhost/api/health/full | jq .

# Métricas en formato Prometheus
curl -s http://localhost/metrics | head -20

# Interfaz web (debe retornar 200)
curl -s -o /dev/null -w "%{http_code}" http://localhost/

# Analytics Python (FastAPI)
curl -s http://localhost:5000/health | jq .

# Bridge ZKTeco
curl -s http://localhost:8081/health | jq .
```

O bien ejecute el script de smoke test incluido:

```bash
bash scripts/staging/smoke-test.sh
```

---

## 9. Troubleshooting

### 9.1 Puerto 80 o 443 ya está en uso

**Síntoma:**
```
Error response from daemon: driver failed programming external connectivity:
Bind for 0.0.0.0:80 failed: port is already allocated
```

**Solución:**
```bash
# Identificar qué proceso ocupa el puerto
sudo ss -tlnp | grep -E ':80|:443'
sudo lsof -i :80

# Si hay Apache o Nginx del sistema corriendo
sudo systemctl stop apache2 nginx
sudo systemctl disable apache2 nginx

# Volver a levantar
docker compose -f docker-compose.staging.yml up -d nginx
```

### 9.2 Puerto 8080 ocupado

```bash
sudo ss -tlnp | grep :8080
# Identificar el proceso y detenerlo antes de levantar el bridge
```

### 9.3 MySQL no levanta / contenedor reiniciando en loop

**Síntoma:** `docker ps` muestra el contenedor MySQL en estado `Restarting (1)`.

**Diagnóstico:**
```bash
docker compose -f docker-compose.staging.yml logs mysql | tail -30
```

**Causas comunes y soluciones:**

a) Variables de entorno faltantes en `.env`:
```bash
grep -E "DB_PASSWORD|DB_NAME|DB_USER|DB_ROOT_PASSWORD" .env
```

b) Volumen con datos de una instalación anterior incompatible:
```bash
# ADVERTENCIA: este comando borra todos los datos de MySQL del volumen
docker compose -f docker-compose.staging.yml down -v
docker compose -f docker-compose.staging.yml up -d --build
```

c) Memoria insuficiente (MySQL 8 requiere al menos 512 MB libres):
```bash
free -h
```

### 9.4 Redis sin conexión desde la API

**Síntoma:** `/api/health/full` retorna `"redis": false` o la API no arranca.

**Diagnóstico:**
```bash
docker compose -f docker-compose.staging.yml ps redis
docker compose -f docker-compose.staging.yml logs redis | tail -20

# Probar ping directamente desde dentro del contenedor Redis
docker compose -f docker-compose.staging.yml exec redis redis-cli ping
```

**Solución:** Verificar que `REDIS_URL=redis://redis:6379` use el nombre del servicio Docker (`redis`), no `localhost`.

```bash
grep REDIS_URL .env
# Si es incorrecto, corregirlo y hacer:
docker compose -f docker-compose.staging.yml restart api
```

### 9.5 att2000 no conecta (SQL Server externo)

**Síntoma:** `/api/health/full` muestra `"att2000": false` o errores MSSQL en los logs de la API.

**Diagnóstico:**
```bash
# Ver logs de la API filtrando por att2000
docker compose -f docker-compose.staging.yml logs api | grep -i "att2000\|mssql\|sqlserver\|ECONNREFUSED" | tail -20

# Verificar variables de entorno
grep -E "ATT_HOST|ATT_PORT|ATT_USER|ATT_PASSWORD|ATT2000" .env

# Probar conectividad de red al servidor att2000 (desde el host)
nc -zv "$ATT_HOST" 1433
```

**Causas comunes:**

- Variables `ATT_HOST`, `ATT_PORT`, `ATT_USER`, `ATT_PASSWORD` incorrectas o vacías en `.env`.
- El servidor SQL Server solo acepta conexiones desde IPs específicas — coordinar con el administrador del entorno Adventista para agregar la IP pública del servidor de staging a la lista de acceso permitido.
- Firewall del host bloqueando la salida al puerto 1433: `sudo ufw allow out to <ip-att2000> port 1433 proto tcp`.

### 9.6 API no responde en /api/health

```bash
# Ver si el contenedor está corriendo
docker compose -f docker-compose.staging.yml ps api

# Ver logs de arranque (últimas 50 líneas)
docker compose -f docker-compose.staging.yml logs --tail=50 api

# Verificar que MySQL y Redis estén healthy antes que la API
docker compose -f docker-compose.staging.yml ps mysql redis
```

### 9.7 Contenedor web (Next.js) no levanta

```bash
docker compose -f docker-compose.staging.yml logs web

# Problema típico: variables NEXT_PUBLIC_ no definidas en tiempo de build
grep -E "NEXT_PUBLIC|FRONTEND_URL" .env

# Rebuild forzado
docker compose -f docker-compose.staging.yml build --no-cache web
docker compose -f docker-compose.staging.yml up -d web
```

### 9.8 Reinicio limpio completo (staging, datos no persistentes)

```bash
# ADVERTENCIA: -v elimina todos los volúmenes (datos de MySQL). No usar en producción.
docker compose -f docker-compose.staging.yml down -v --remove-orphans
docker image prune -f
docker compose -f docker-compose.staging.yml up -d --build
```

---

## 10. Pasos siguientes tras instalación exitosa

1. Ejecutar el smoke test: `bash scripts/staging/smoke-test.sh`
2. Completar el checklist de aceptación: `docs/STAGING_ACCEPTANCE_CHECKLIST.md`
3. Importar catálogos iniciales: departamentos, usuarios, empleados desde att2000
4. Configurar los relojes ZKTeco para que apunten a `<IP_STAGING>:8080`
5. Verificar que el dashboard en tiempo real muestre eventos al fichar en un reloj

---

*Última revisión: Mayo 2026*
