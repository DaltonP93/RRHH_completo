# Sistema de Asistencia — Nuevo Sistema

Reemplazo moderno de SisHoras con tiempo real, relojes ZKTeco, web y app móvil.

## Inicio rápido

```bash
# 1. Copiar variables de entorno
cp .env.example .env
# → Edita .env con tus IPs de relojes ZKTeco y contraseñas

# 2. Levantar todos los servicios
docker compose up -d

# 3. Ver logs en vivo
docker compose logs -f

# 4. Abrir el dashboard
open http://localhost:3000
# Usuario: admin | Contraseña: Admin1234!
```

## Estructura

```
nuevo-sistema/
├── docker-compose.yml     # Orquestación de todos los servicios
├── .env.example           # Variables de entorno (copiar a .env)
├── database/
│   └── init.sql           # Esquema MySQL completo con datos iniciales
├── api/                   # Core API (Node.js/Express + Socket.io)
├── bridge/                # ZKTeco Bridge (conecta los relojes)
├── analytics/             # Reportes (Python/FastAPI + Pandas)
├── web/                   # Dashboard (Next.js 14 + React)
└── mobile/                # App móvil (React Native — próximamente)
```

## Servicios

| Servicio  | Puerto | Descripción                        |
|-----------|--------|------------------------------------|
| Dashboard | :3000  | Panel web Next.js                  |
| Core API  | :4000  | API REST + WebSocket               |
| Analytics | :5000  | Reportes FastAPI                   |
| Bridge    | :8080  | Recepción PUSH de relojes ZKTeco   |
| MySQL     | :3306  | Base de datos                      |
| Redis     | :6379  | Pub/Sub y cache                    |

## Configurar relojes ZKTeco

### Modo PUSH (recomendado — tiempo real instantáneo)
En el menú del reloj:
- Comunicación → ADMS → Habilitar
- Dirección del servidor: `IP_del_servidor`
- Puerto: `8080`
- Activar "Tiempo real" / "Realtime"

### Modo Polling (alternativo)
En el `.env`:
```
ZKTECO_DEVICES=192.168.1.201,192.168.1.202
ZKTECO_PORT=4370
ZKTECO_POLL_INTERVAL=30000
```

## Desarrollo local (sin Docker)

```bash
# API
cd api && npm install && npm run dev

# Bridge
cd bridge && npm install && npm run dev

# Analytics
cd analytics && pip install -r requirements.txt && python main.py

# Web
cd web && npm install && npm run dev
```
