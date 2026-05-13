# SisHoras — Sistema Integral de Gestión de RRHH

> Plataforma completa de Recursos Humanos: asistencia biométrica, nómina, vacaciones, permisos, documentos, competencias y cumplimiento normativo.

---

## Tabla de contenidos

- [Descripción general](#descripción-general)
- [Módulos](#módulos)
- [Stack tecnológico](#stack-tecnológico)
- [Arquitectura](#arquitectura)
- [Requisitos previos](#requisitos-previos)
- [Instalación y puesta en marcha](#instalación-y-puesta-en-marcha)
- [Variables de entorno](#variables-de-entorno)
- [Base de datos](#base-de-datos)
- [Estructura del proyecto](#estructura-del-proyecto)
- [API — Endpoints principales](#api--endpoints-principales)
- [Notificaciones multi-canal](#notificaciones-multi-canal)
- [Integración ZKTeco](#integración-zkteco)
- [Despliegue en producción](#despliegue-en-producción)
- [Seguridad](#seguridad)
- [Contribuir](#contribuir)

---

## Descripción general

**SisHoras** es un sistema web moderno que reemplaza el software legado ZKTeco (SisHoras anterior) e integra todos los procesos de RRHH en una sola plataforma:

- Marcaciones biométricas en tiempo real desde relojes ZKTeco
- Nómina mensual con aportes IPS (Paraguay: 9 % empleado / 16,5 % patronal)
- Gestión de vacaciones, permisos y ausencias
- Expediente digital del empleado con documentos firmados
- Evaluaciones de competencias y planes de capacitación
- Cumplimiento MTESS / REOP con generación de planillas laborales
- Notificaciones granulares por canal (Email, WhatsApp, Telegram, SMS, Push Web)

---

## Módulos

| Módulo | Descripción |
|---|---|
| **Dashboard** | KPIs en tiempo real vía Socket.io (presentes, ausentes, tardanzas) |
| **Asistencia** | Tabla diaria, live feed de marcaciones, correcciones manuales |
| **Empleados** | CRUD completo, historial de asistencia, detalles RRHH |
| **Nómina** | Liquidación mensual, deducciones IPS, exportación PDF/Excel |
| **Vacaciones** | Solicitudes, aprobaciones, acumulado de días |
| **Permisos** | Flujo de aprobación, tipos configurables |
| **Documentos** | Expediente digital, firma electrónica, control de vencimientos |
| **Competencias** | Evaluaciones, brechas de habilidades, planes de capacitación |
| **Cumplimiento** | Planillas MTESS/REOP, indicadores normativos |
| **Reportes** | Analytics con gráficas (Recharts), exportación Excel, programados SMTP |
| **Notificaciones** | Multi-canal con matriz de configuración granular por evento |
| **Usuarios** | CRUD con roles (admin, RRHH, supervisor, empleado) |
| **Configuración** | Ajustes globales del sistema |

---

## Stack tecnológico

| Componente | Tecnología | Puerto |
|---|---|---|
| API REST | Node.js 20 + Express | 4000 |
| Frontend | Next.js 14 App Router + Tailwind CSS | 3000 |
| Analytics | FastAPI + Python 3.12 | 5000 |
| Bridge ZKTeco | Node.js + ZKLib | 8081 (API) / 8080 (PUSH) |
| Base de datos principal | MySQL 8 | 3306 |
| Base de datos origen | SQL Server — `att2000` (solo lectura) | 1433 |
| Cache / tiempo real | Redis 7 | 6379 |
| Gestor de procesos | PM2 | — |

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                         NGINX                               │
│  /        → Next.js :3000   /api/* → Express :4000          │
│  /analytics/* → FastAPI :5000                               │
└────────────────────────┬────────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
    Next.js 14       Express API    FastAPI
    (frontend)       (4000)         (5000)
          │              │              │
          │         ┌────┴────┐         │
          │         ▼         ▼         │
          │      MySQL 8   Redis 7 ◄────┘
          │         ▲
          │    Bridge ZKTeco
          │    (8081 API / 8080 PUSH)
          │         ▲
          └─────────┘
              Relojes
             ZKTeco TCP
```

**Flujo de marcaciones:**

1. El reloj biométrico envía la marcación al Bridge (PUSH ADMS o polling ZKLib)
2. El Bridge publica el evento en Redis (`attendance:new`)
3. La API consume el evento, mapea `USERID → employee.code` y graba en `attendance_logs`
4. Socket.io emite la actualización al dashboard en tiempo real
5. El Motor de Notificaciones evalúa la matriz y envía alertas según configuración

---

## Requisitos previos

- **Node.js** ≥ 20
- **Python** ≥ 3.12
- **MySQL** 8
- **Redis** 7
- **PM2** (producción): `npm install -g pm2`
- Acceso de red a los relojes ZKTeco (puerto TCP 4370)
- *(Opcional)* SQL Server con base de datos `att2000` para importar historial

---

## Instalación y puesta en marcha

### 1. Clonar el repositorio

```bash
git clone https://github.com/DaltonP93/rrhh_completo.git
cd rrhh_completo
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con los valores reales de tu entorno
```

Ver sección [Variables de entorno](#variables-de-entorno) para detalle completo.

### 3. Inicializar la base de datos

```bash
# Crear base de datos y ejecutar migraciones
mysql -u root -p < database/init.sql
# Aplicar todas las migraciones en orden
for f in database/migrations/*.sql; do mysql -u root -p asistencia < "$f"; done
```

### 4. Instalar dependencias

```bash
# API
cd api && npm install && cd ..

# Frontend
cd web && npm install && cd ..

# Bridge
cd bridge && npm install && cd ..

# Analytics
cd analytics && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && deactivate && cd ..
```

### 5. Iniciar en desarrollo

```bash
# API
cd api && npm run dev

# Frontend (en otra terminal)
cd web && npm run dev

# Bridge (en otra terminal)
cd bridge && npm run dev

# Analytics (en otra terminal)
cd analytics && source .venv/bin/activate && uvicorn main:app --reload --port 5000
```

### 6. Acceder

| Servicio | URL |
|---|---|
| Frontend | http://localhost:3000 |
| API | http://localhost:4000 |
| Analytics | http://localhost:5000 |
| Bridge | http://localhost:8081 |

Credenciales por defecto (desarrollo): `admin` / cambiar en primer inicio de sesión.

---

## Variables de entorno

Copiar `.env.example` a `.env` y completar **todos** los valores. Nunca commitear archivos `.env` con datos reales.

### Base de datos principal (MySQL)

```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=asistencia
DB_USER=asistencia_user
DB_PASSWORD=<contraseña_segura>
```

### Base de datos origen ZKTeco (SQL Server — solo lectura)

```env
ATT_HOST=<hostname_o_ip_servidor>
ATT_PORT=1433
ATT_USER=sa
ATT_PASSWORD=<contraseña>
ATT_DATABASE=att2000
```

### Autenticación JWT

```env
JWT_SECRET=<string_aleatorio_largo>
JWT_REFRESH_SECRET=<otro_string_diferente>
```

### URLs de servicios

```env
FRONTEND_URL=http://localhost:3000
API_URL=http://localhost:4000
ANALYTICS_URL=http://localhost:5000
```

### Claves internas

```env
BRIDGE_API_KEY=<genera_clave_aleatoria>
ANALYTICS_API_KEY=<genera_clave_aleatoria>
NEXT_PUBLIC_ANALYTICS_API_KEY=<clave_publica_analytics>
```

### Relojes ZKTeco

```env
ZKTECO_DEVICES=<ip_reloj1>:4370,<ip_reloj2>:4370
ZKTECO_PORT=4370
ZKTECO_POLL_INTERVAL=30000
ZKTECO_AUTO_POLL=false   # true para polling automático
```

### Notificaciones

```env
# Email (SMTP)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=noreply@empresa.com

# WhatsApp (WAHA o Meta Cloud API)
WHATSAPP_PROVIDER=WAHA
WAHA_API_URL=http://localhost:3001
WAHA_SESSION=default

# Telegram
TELEGRAM_BOT_TOKEN=

# Web Push (VAPID)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_EMAIL=admin@empresa.com
```

---

## Base de datos

El esquema principal está en `database/init.sql`. Las migraciones incrementales se encuentran en `database/migrations/` (archivos `001` a `051`).

### Tablas principales

| Tabla | Descripción |
|---|---|
| `employees` | Empleados con código, cargo, departamento |
| `attendance_logs` | Marcaciones normalizadas (in/out) |
| `daily_summary` | Resumen diario calculado (trabajado, tardanza, estado) |
| `payroll_periods` / `payroll_items` | Liquidaciones de nómina |
| `vacation_requests` | Solicitudes de vacaciones |
| `leave_requests` | Permisos y ausencias |
| `documents` | Expediente digital |
| `competency_evaluations` | Evaluaciones de competencias |
| `notification_channels` | Canales habilitados (EMAIL, WHATSAPP, etc.) |
| `notification_event_catalog` | Catálogo de 40+ eventos configurables |
| `notification_preferences` | Preferencias por usuario × evento × canal |
| `notification_queue` | Cola de envío con estado y reintentos |

### Sincronización att2000 → asistencia

```
att2000.CHECKINOUT (SQL Server, solo lectura)
  └── USERID → employees.code
  └── CHECKTIME → attendance_logs.timestamp
  └── CHECKTYPE (I/O) → attendance_logs.type (in/out)
       └── Calcula daily_summary (worked_minutes, late_minutes, status)
```

---

## Estructura del proyecto

```
/
├── api/                    Express API
│   └── src/
│       ├── index.js        Entry point, Socket.io
│       ├── routes/         Todos los endpoints REST
│       ├── services/       notificationEngine, payroll, sync...
│       └── config/         DB, Redis, att2000, logger
│
├── web/                    Next.js 14 App Router
│   └── src/
│       ├── app/
│       │   ├── login/
│       │   └── (app)/      Páginas con sidebar (auth required)
│       │       ├── dashboard/
│       │       ├── asistencia/
│       │       ├── empleados/
│       │       ├── nomina/
│       │       ├── vacaciones/
│       │       ├── permisos/
│       │       ├── documentos/
│       │       ├── competencias/
│       │       ├── cumplimiento/
│       │       ├── reportes/
│       │       ├── notificaciones-config/
│       │       ├── mis-notificaciones/
│       │       ├── usuarios/
│       │       └── configuracion/
│       ├── components/
│       │   ├── layout/     Sidebar, Header
│       │   ├── ui/         Componentes base
│       │   └── rrhh/       EmployeeRRHHDetails, etc.
│       └── lib/
│           └── api.ts      Axios client, helpers de URL
│
├── bridge/                 ZKTeco Bridge
│   └── src/
│       ├── index.js        API + polling + PUSH server
│       ├── zkManager.js    ZKLib wrapper
│       ├── pushServer.js   Servidor ADMS para push de relojes
│       └── discovery.js    Descubrimiento LAN de relojes
│
├── analytics/              FastAPI Python
│   ├── main.py
│   └── routers/            reports, kpis, export
│
├── database/
│   ├── init.sql            Schema completo
│   └── migrations/         001 – 051 migraciones
│
├── scripts/                Utilidades de mantenimiento
├── docker-compose.yml      Stack completo en Docker
├── ecosystem.config.js     PM2 configuración
└── .env.example            Plantilla de variables
```

---

## API — Endpoints principales

### Autenticación
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | Login con usuario/contraseña |
| POST | `/api/auth/refresh` | Renovar token JWT |
| POST | `/api/auth/logout` | Cerrar sesión |
| GET | `/api/auth/me` | Perfil del usuario actual |

### Empleados
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/employees` | Listar con filtros y paginación |
| POST | `/api/employees` | Crear empleado |
| GET | `/api/employees/:id` | Detalle de empleado |
| PUT | `/api/employees/:id` | Actualizar empleado |
| GET | `/api/employees/:id/attendance` | Historial de asistencia |
| GET | `/api/employees/:id/rrhh` | Datos RRHH completos |

### Asistencia
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/attendance` | Asistencia por fecha/departamento |
| GET | `/api/attendance/live` | Últimas marcaciones en tiempo real |
| POST | `/api/attendance/manual` | Registro manual de marcación |
| POST | `/api/attendance/sync` | Sincronizar desde att2000 |

### Nómina
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/payroll` | Listar períodos de nómina |
| POST | `/api/payroll/calculate` | Calcular nómina del período |
| GET | `/api/payroll/:id/export` | Exportar PDF/Excel |

### Notificaciones
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/notification-channels` | Canales configurados |
| GET | `/api/notification-event-catalog` | Catálogo de eventos |
| GET | `/api/notification-matrix` | Matriz eventos × canales |
| PUT | `/api/notification-matrix` | Activar/desactivar celda de matriz |
| GET | `/api/notification-preferences/my` | Preferencias del usuario actual |
| PUT | `/api/notification-preferences/my/batch` | Guardar preferencias en lote |
| GET | `/api/notification-queue` | Cola de envíos pendientes |
| GET | `/api/notification-delivery-logs` | Historial de entregas |

### Bridge ZKTeco
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Health check del bridge |
| GET | `/devices` | Lista de relojes configurados |
| POST | `/devices/:id/sync` | Forzar sincronización inmediata |
| POST | `/devices/:id/diagnose` | Diagnóstico paso a paso |
| GET | `/discovery?subnet=192.168.1` | Descubrir relojes en la red |

---

## Notificaciones multi-canal

El sistema incluye un motor de notificaciones granular con:

- **7 canales**: INTERNAL (bandeja), EMAIL, WHATSAPP, TELEGRAM, SMS, PUSH_WEB, WEBHOOK
- **40+ eventos** organizados en 9 categorías: RRHH, ASISTENCIA, NOMINA, VACACIONES, PERMISOS, DOCUMENTOS, COMPETENCIAS, CUMPLIMIENTO, SISTEMA
- **Matriz de configuración**: cada evento puede activarse o desactivarse por canal, con plantilla de mensaje personalizable
- **Preferencias por usuario**: cada empleado configura qué notificaciones recibir y en qué canales
- **Horario silencioso**: bloque horario configurable donde no se envían notificaciones no urgentes
- **Cola con reintentos**: todos los envíos pasan por una cola persistente con estado (pending, sent, failed) y registro de entrega

### Configurar canales (admins)

Ir a **Configuración → Notificaciones** → pestaña *Canales* para habilitar cada canal e ingresar las credenciales SMTP, API keys, etc.

### Configurar preferencias personales

Cada usuario puede ir a **Mis Notificaciones** para activar/desactivar eventos por canal y configurar su horario silencioso.

---

## Integración ZKTeco

El Bridge soporta dos modos de conexión con los relojes:

### Modo PUSH (recomendado)
El reloj envía marcaciones en tiempo real al servidor (protocolo ADMS):
- Configurar en el reloj: `Comm → ADMS → Server Address` = IP del servidor, puerto 8080
- El Bridge escucha en el puerto 8080 y publica cada marcación en Redis

### Modo Polling
El Bridge se conecta al reloj periódicamente vía ZKLib:
- Activar con `ZKTECO_AUTO_POLL=true` en `.env`
- Intervalo configurable con `ZKTECO_POLL_INTERVAL` (ms)
- **Nota**: el protocolo ZKTeco solo admite una conexión TCP simultánea; con polling activo, la API no puede conectar al reloj bajo demanda

### Descubrir relojes en la red

```bash
curl "http://localhost:8081/discovery?subnet=192.168.1&port=4370"
```

### Diagnosticar un reloj

```bash
curl -X POST http://localhost:8081/diagnose \
  -H "Content-Type: application/json" \
  -d '{"ip": "192.168.1.100", "port": 4370}'
```

---

## Despliegue en producción

### Con PM2

```bash
# Compilar frontend
cd web && npm run build && cd ..

# Iniciar todos los servicios
pm2 start ecosystem.config.js

# Ver estado
pm2 status

# Ver logs
pm2 logs api
pm2 logs web

# Recargar tras actualización
git pull origin main
cd web && npm run build && cd ..
pm2 reload all
```

### Con Docker Compose

```bash
# Copiar y configurar variables
cp .env.example .env
# Editar .env con valores reales

# Iniciar stack completo
docker compose up -d

# Ver logs
docker compose logs -f api
```

### Nginx (proxy inverso)

Ejemplo de configuración:

```nginx
server {
    listen 80;
    server_name tudominio.com;

    location /api/ {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    location /analytics/ {
        proxy_pass http://localhost:5000/;
    }

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## Seguridad

- **Autenticación**: JWT con access token (15 min) + refresh token (7 días)
- **Autorización**: RBAC + ABAC — roles: `admin`, `rrhh`, `supervisor`, `employee`
- **Credenciales**: nunca almacenadas en el repositorio; siempre en variables de entorno
- **SQL Server att2000**: acceso estrictamente de solo lectura
- **HTTPS**: configurar en Nginx con certificado TLS (Let's Encrypt recomendado)
- **Headers de seguridad**: Helmet.js habilitado en la API
- **Rate limiting**: protección contra fuerza bruta en `/api/auth/login`

> ⚠️ **Importante**: No commitear archivos `.env`, credenciales, certificados ni IPs internas. El `.gitignore` ya está configurado para excluirlos.

---

## Contribuir

1. Crear una rama desde `main`: `git checkout -b feature/mi-feature`
2. Desarrollar y testear los cambios
3. Confirmar que no se incluye información sensible: `git diff --staged`
4. Enviar pull request con descripción clara de los cambios

---

*SisHoras — Sistema Integral de Gestión de RRHH*
