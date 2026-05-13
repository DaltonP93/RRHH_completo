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

## Módulos RRHH Platform

### Gestión de Empresas y Sucursales
- Multiempresa y multisucursal
- Números patronales MTESS e IPS
- [/empresas](/empresas)

### Nómina y Liquidaciones
- Perfiles salariales por empleado
- Conceptos salariales (ingresos, descuentos, aportes)
- Liquidaciones mensuales con cálculo IPS
- Aguinaldo (1/12 de remuneraciones)
- Anticipos de salario y aguinaldo
- [/nomina/liquidaciones](/nomina/liquidaciones)

### Bancos y Pagos
- Lotes de pago por banco
- Exportación CSV/Excel según layout bancario
- Soporte para Banco GNB, Itaú, ueno, Familiar, Continental y otros
- [/bancos](/bancos)

### Cumplimiento Legal Paraguay
- Comunicaciones MTESS/REOP (altas, bajas, liquidaciones, vacaciones, aguinaldo)
- Planillas laborales anuales REOP
- IPS/REI: cálculo y registro de aportes (9% obrero + 16.5% patronal)
- Calendario de vencimientos por terminación de número patronal
- [/cumplimiento](/cumplimiento)

### Gestión Documental
- Plantillas con campos dinámicos ({{employee.full_name}}, {{payroll.net_pay}}, etc.)
- Documentos por empleado: contratos, recibos, autorizaciones
- Firma digital dibujada en pantalla
- Trazabilidad completa: quién creó, envió, vio, firmó, con IP y timestamp
- Hash SHA-256 de documentos
- [/documentos](/documentos)

### Gestión por Competencias
- Catálogo de competencias por categoría y tipo
- Matriz de competencias por cargo con niveles requeridos (1-5)
- Ciclos de evaluación: autoevaluación, evaluación por jefe, 360°
- Cálculo automático de brechas con severidad
- Planes de desarrollo individuales
- Catálogo de capacitaciones y seguimiento
- [/competencias](/competencias)

### Motor de Notificaciones Multicanal
- Canales: Interno, Email, WhatsApp, Telegram, SMS, Push Web/PWA, Webhook
- Plantillas configurables por evento y canal
- Cola con reintentos automáticos
- Preferencias por usuario/empleado
- Logs de entrega completos
- [/notificaciones-config](/notificaciones-config)

### Seguridad Granular (RBAC + ABAC)
- Módulos y permisos atómicos (formato: módulo.entidad.acción)
- Roles configurables por empresa/sucursal/departamento
- Permisos por campo sensible (salario, cuenta bancaria, datos médicos)
- Alcances: global, empresa, sucursal, área, equipo, propio
- 10 roles base: SUPER_ADMIN, ADMIN_EMPRESA, GERENTE_RRHH, ANALISTA_RRHH, JEFE_AREA, TESORERIA, CONTABILIDAD, AUDITOR, EMPLEADO, SOPORTE_TI
- [/seguridad-avanzada](/seguridad-avanzada)
