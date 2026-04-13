# SisHoras — Sistema de Gestión de Asistencia

## Descripción
Reemplazo del sistema ZKTeco (SisHoras legacy) por una aplicación web moderna.
Conecta a relojes biométricos ZKTeco y genera reportes de asistencia por empleado, día, semana y mes.

## Stack
- **API:** Node.js + Express, puerto 4000, JWT auth, Socket.io tiempo real
- **Web:** Next.js 14 App Router, puerto 3000, Tailwind CSS, Recharts
- **Analytics:** FastAPI Python 3.12, puerto 5000
- **Bridge:** Node.js ZKTeco bridge, puerto 8081 (API) / 8080 (PUSH relojes)
- **BD principal:** MySQL 8 → base de datos `asistencia`
- **BD fuente:** SQL Server `att2000` en servidor ADVENTISTA (IP: 10.81.28.8) — SOLO LECTURA
- **Cache/RT:** Redis puerto 6379

## Producción
- **Servidor:** Ubuntu 22.04, hostname `antigravity`, IP interna `10.81.28.20`
- **Dominio:** http://sishoras.saa.com.py
- **Directorio:** `/var/www/html/Gestion_Horas/`
- **Gestor de procesos:** PM2 (sishoras-api, sishoras-web, sishoras-bridge, sishoras-analytics)
- **Repo GitHub:** https://github.com/DaltonP93/Gestion_Horas.git

## Credenciales del sistema
- **Admin login:** usuario `admin` / contraseña `Admin1234!`
- **MySQL user:** sishoras / SisHoras2026!
- **MySQL root:** sin contraseña (auth_socket en Ubuntu)
- **att2000 SQL Server:** sa / nma.d.nh4

## Relojes ZKTeco
| Reloj | IP | SensorID |
|---|---|---|
| Comedor | 172.16.20.160 | 101 |
| Lavadero | 172.16.20.161 | 103 |
| Gerencia | 172.16.20.162 | 1 |
Puerto ZKTeco: 4370

## Estructura del proyecto
```
/
├── api/          Express API (src/index.js, src/routes/, src/services/)
├── web/          Next.js (src/app/(app)/ para páginas con sidebar)
├── bridge/       ZKTeco bridge
├── analytics/    FastAPI (.venv/ para Python)
├── database/     init.sql + migrations/
├── scripts/      test-connection.js, inspect-att2000.js
└── ecosystem.config.js   PM2 config
```

## Páginas implementadas
- `/login` — autenticación JWT
- `/dashboard` — KPIs en tiempo real vía Socket.io
- `/asistencia` — tabla diaria con live feed
- `/empleados` — listado con filtros
- `/empleados/[id]` — detalle con historial y edición inline
- `/empleados/nuevo` — formulario alta
- `/permisos` — gestión aprobación/rechazo
- `/reportes` — Marcadas (formato PDF ZKTeco), programados, SMTP
- `/usuarios` — CRUD usuarios con roles
- `/analytics/[id]` — gráficas por empleado (Recharts)
- `/configuracion` — configuración general

## Comandos frecuentes en producción
```bash
# Ver estado de servicios
pm2 status

# Ver logs en tiempo real
pm2 logs sishoras-api
pm2 logs sishoras-web

# Recargar tras cambio de código
pm2 reload sishoras-api
pm2 reload sishoras-web

# Actualizar desde GitHub
cd /var/www/html/Gestion_Horas && git pull origin main
cd web && npm run build && cd ..
pm2 reload all

# Base de datos
sudo mysql asistencia

# Reiniciar Nginx
systemctl reload nginx
```

## Flujo de sincronización att2000 → asistencia
1. API lee `att2000.CHECKINOUT` — campos: `USERID`, `CHECKTIME`, `CHECKTYPE` (I/O)
2. Mapea `USERID` → `employees.code`
3. Inserta en `attendance_logs` con type `in`/`out`
4. Calcula `daily_summary` (worked_minutes, late_minutes, status)

## Notas importantes
- Las páginas con sidebar van en `web/src/app/(app)/` (route group)
- El alias `@/*` → `src/*` está en `tsconfig.json`
- La API usa `process.env.DB_PASSWORD ?? ''` (no `||`) para permitir password vacío
- El bridge tiene DOS puertos: 8080 (PUSH ZKTeco) y 8081 (API bridge)
- Analytics Python usa venv en `/var/www/html/Gestion_Horas/analytics/.venv/`
