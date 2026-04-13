# Guía de Puesta en Producción — SisHoras Nuevo Sistema

## ¿Qué falta antes de probar?

### 1. Configurar variables de entorno

```bash
cp .env.example .env
```

Editar `.env` con los valores reales:

```env
# MySQL (nuevo sistema)
DB_HOST=localhost
DB_PORT=3306
DB_NAME=asistencia
DB_USER=root
DB_PASSWORD=TU_PASSWORD_MYSQL

# SQL Server att2000 (SOLO LECTURA)
ATT_HOST=ADVENTISTA        # nombre del servidor o IP
ATT_PORT=1433
ATT_USER=sa
ATT_PASSWORD=TU_PASSWORD_SA
ATT_DATABASE=att2000

# JWT (generar strings aleatorios largos)
JWT_SECRET=cambia_esto_por_string_aleatorio_32chars
JWT_REFRESH_SECRET=otro_string_diferente_32chars

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# SMTP (opcional — para reportes por email)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu@gmail.com
SMTP_PASS=app_password_gmail
SMTP_FROM=Sistema RH <tu@gmail.com>

# Claves internas
BRIDGE_API_KEY=clave_puente_segura
INTEGRATION_API_KEY=clave_integracion_apex
ANALYTICS_API_KEY=analytics_secret_key

# URLs
FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_ANALYTICS_URL=http://localhost:5000
```

---

### 2. Crear la base de datos MySQL

```sql
CREATE DATABASE asistencia CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Ejecutar los scripts en orden:

```bash
mysql -u root -p asistencia < database/init.sql
mysql -u root -p asistencia < database/migrations/002_notifications_schedules.sql
```

---

### 3. Instalar dependencias

```bash
# API
cd api && npm install

# Web
cd ../web && npm install

# Scripts de utilidad
cd ../scripts && npm install
```

---

### 4. Probar conexión a SQL Server (att2000)

```bash
cd scripts
node test-connection.js
```

Si falla, verificar:
- Que el servidor `ADVENTISTA` esté accesible por red
- Que el usuario `sa` tenga permisos de lectura en `att2000`
- Que el puerto 1433 no esté bloqueado por firewall

---

### 5. Primera sincronización de datos

```bash
# Con la API corriendo (npm run dev en /api):
curl -X POST http://localhost:4000/api/sync/full \
  -H "Authorization: Bearer TU_TOKEN_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"dateFrom":"2026-01-01","dateTo":"2026-04-12"}'
```

O desde la UI: **Configuración → Sincronización att2000 → Sync completo**

---

### 6. Correr en desarrollo local

```bash
# Terminal 1 — API
cd api && npm run dev

# Terminal 2 — Web
cd web && npm run dev

# Terminal 3 — Analytics (Python)
cd analytics && pip install -r requirements.txt && python main.py

# Terminal 4 — Redis (si no está corriendo)
redis-server
```

Abrir: http://localhost:3000

**Usuario por defecto:**
- Username: `admin`
- Password: `Admin1234!`

---

### 7. Con Docker (recomendado para producción)

```bash
docker-compose up -d
```

Esto levanta: MySQL, Redis, API, Web, Analytics, Bridge, Nginx.

---

## Checklist de producción

- [ ] Cambiar contraseña del admin por defecto
- [ ] Configurar SMTP en Reportes → Email SMTP
- [ ] Crear usuarios de RH y supervisores en /usuarios
- [ ] Correr sync completo desde att2000
- [ ] Asignar horarios a los empleados sincronizados
- [ ] Configurar al menos 1 reporte automático mensual
- [ ] Probar marcaje manual desde /asistencia
- [ ] Verificar que el dashboard muestra datos en tiempo real

---

## Arquitectura de puertos

| Servicio    | Puerto | URL                          |
|-------------|--------|------------------------------|
| Web         | 3000   | http://localhost:3000        |
| API         | 4000   | http://localhost:4000        |
| Analytics   | 5000   | http://localhost:5000        |
| Bridge ZK   | 8080   | http://localhost:8080        |
| MySQL       | 3306   | —                            |
| Redis       | 6379   | —                            |

## Páginas disponibles

| URL                    | Descripción                              |
|------------------------|------------------------------------------|
| /dashboard             | KPIs en tiempo real + feed marcajes      |
| /asistencia            | Tabla diaria + marcaje manual            |
| /empleados             | CRUD empleados                           |
| /empleados/[id]        | Detalle + historial por empleado         |
| /empleados/nuevo       | Alta de empleado                         |
| /analytics/[id]        | Gráficas analytics por empleado          |
| /permisos              | Gestión de permisos y ausencias          |
| /reportes              | Marcadas / Mensual / Automáticos / SMTP  |
| /usuarios              | CRUD usuarios del sistema (roles/acceso) |
| /configuracion         | Relojes ZKTeco, sync, webhooks, API      |
