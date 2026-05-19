# Staging Fixes Applied — SisHoras (branch: feature/ux-modular-rbac-multiempresa)

Registro de correcciones aplicadas durante la validación en staging. Cada fix describe el síntoma, la causa raíz y la solución implementada.

---

## Fix 1 — CORS: páginas llamaban directamente a `localhost:4000`

**Síntoma:** Peticiones bloqueadas por CORS en el navegador. La consola mostraba:
```
Access to XMLHttpRequest at 'http://localhost:4000/api/...' from origin 'https://staging.example.com' has been blocked by CORS policy.
```

**Causa:** Múltiples páginas del frontend definían su propia constante `API` hardcodeada:
```ts
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
```
y hacían `fetch(API + '/api/...')` directamente. En producción/staging la variable de entorno no estaba configurada y la URL fallaba al origen incorrecto.

**Archivos afectados:**
- `web/src/app/(app)/empresas/page.tsx`
- `web/src/app/(app)/bancos/page.tsx`
- `web/src/app/(app)/nomina/aguinaldo/page.tsx`
- `web/src/app/(app)/nomina/conceptos/page.tsx`
- `web/src/app/(app)/nomina/liquidaciones/page.tsx`
- `web/src/app/(app)/nomina/liquidaciones/[id]/page.tsx`
- `web/src/app/(app)/nomina/anticipos/page.tsx`
- `web/src/app/(app)/mis-notificaciones/page.tsx`
- `web/src/app/(app)/documentos/[id]/page.tsx`
- `web/src/app/(app)/documentos/page.tsx`
- `web/src/app/(app)/notificaciones-config/page.tsx`
- `web/src/app/(app)/competencias/planes/page.tsx`
- `web/src/app/(app)/cumplimiento/page.tsx`
- `web/src/app/(app)/competencias/page.tsx`
- `web/src/app/(app)/seguridad-avanzada/page.tsx`
- `web/src/app/(app)/cargos/page.tsx`

**Solución:** Reemplazar todos los usos de la constante local `API` por `import { api } from '@/lib/api'`. La función `api` en `web/src/lib/api.ts` normaliza `NEXT_PUBLIC_API_URL` y usa el mismo origen (ruta relativa `/api`) cuando la variable está vacía:

```ts
// web/src/lib/api.ts — comportamiento clave
const API_URL = normalizeApiUrl(process.env.NEXT_PUBLIC_API_URL)
// Si NEXT_PUBLIC_API_URL='' o no está seteada → API_URL = '' → rutas relativas al mismo origen
```

**Configuración requerida en `.env.local` del web:**
```
NEXT_PUBLIC_API_URL=/api
```

Detrás de nginx, `/api/*` se hace proxy a `:4000`. Con esta configuración no hay CORS porque el navegador hace las peticiones al mismo host/puerto del frontend.

Después de cambiar `.env.local` es necesario reconstruir el build de Next.js:
```bash
cd web && npm run build
pm2 reload web
```

---

## Fix 2 — Tabla `audit_events` faltante: login fallaba al registrar el evento

**Síntoma:**
```
audit.log falló (login_ok): Table 'asistencia.audit_events' doesn't exist
```
El login completaba pero lanzaba un error en el log de la API porque `api/src/services/audit.js` intentaba insertar en `audit_events` al registrar el evento `login_ok`.

**Causa:** La tabla `audit_events` no existía en la base de datos. Las migraciones anteriores a 063 no la creaban.

**Solución:** Aplicar la migración 063 (`database/migrations/063_me_audit_schema_fix.sql`), que crea:
- `audit_events` (con índices en `user_id`, `action`, `created_at`)
- `user_permissions` (permisos granulares por módulo por usuario)
- Columnas adicionales en `users`: `company_id`, `department_id`, `branch_id`, `display_name`, `avatar_url`, `phone`

```bash
mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME < database/migrations/063_me_audit_schema_fix.sql
```

---

## Fix 3 — Claves `nav.*` mostrándose como texto crudo

**Síntoma:** El sidebar y la navegación mostraban claves sin traducir, por ejemplo:
```
nav.companies
nav.settlements
nav.banks_payments
```
en lugar del texto esperado ("Empresas", "Liquidaciones", "Pagos").

**Causa:** El componente `Sidebar.tsx` usa i18n keys que no estaban definidas en los archivos de locale (`es.json`, `en.json`, `pt.json`). El fallback de `I18nProvider.t()` devuelve la clave cruda cuando no encuentra traducción en ningún diccionario.

**Claves faltantes identificadas:**
`nav.companies`, `nav.positions`, `nav.payroll_hub`, `nav.settlements`, `nav.salary_concepts`, `nav.aguinaldo`, `nav.advances`, `nav.banks_payments`, `nav.compliance`, `nav.document_mgmt`, `nav.competencies`, `nav.dev_plans`, `nav.notifications_config`, `nav.security_advanced`, `nav.my_notifications`.

**Solución:** Agregar las traducciones faltantes en los tres archivos de locale. Ejemplo para `es.json`:
```json
"nav": {
  "companies":             "Empresas",
  "positions":             "Cargos",
  "payroll_hub":           "Nómina",
  "settlements":           "Liquidaciones",
  "salary_concepts":       "Conceptos Salariales",
  "aguinaldo":             "Aguinaldo",
  "advances":              "Anticipos",
  "banks_payments":        "Bancos y Pagos",
  "compliance":            "Cumplimiento",
  "document_mgmt":         "Documentos",
  "competencies":          "Competencias",
  "dev_plans":             "Planes de Desarrollo",
  "notifications_config":  "Configuración de Notificaciones",
  "security_advanced":     "Seguridad Avanzada",
  "my_notifications":      "Mis Notificaciones"
}
```

**Comportamiento del fallback** (en `I18nProvider.tsx`):
1. Busca la clave en el locale activo.
2. Si no la encuentra, busca en `es` (default).
3. Si tampoco existe, devuelve la clave cruda.

---

## Fix 4 — `notification_channels` CORS: frontend llamaba `localhost:4000` directamente

**Síntoma:** La página `/notificaciones-config` no cargaba los canales de notificación en staging. La consola mostraba error CORS al cargar `http://localhost:4000/api/notification-channels`.

**Causa:** `web/src/app/(app)/notificaciones-config/page.tsx` definía `const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'` y construía URLs como `${API}/api/notification-channels` sin usar el cliente axios centralizado.

**Solución:** Reemplazar la constante local con `import { api } from '@/lib/api'` y usar `api.get('/api/notification-channels')`. Asegurarse de que `NEXT_PUBLIC_API_URL=/api` esté seteado (ver Fix 1).

---

## Fix 5 — Usuario `admin` promovido a `super_admin`

**Síntoma:** El usuario `admin` existente tenía `role = 'admin'` en la tabla `users`, lo que impedía que pasara el bypass de `super_admin` en los middlewares de permisos.

**Solución:** La migración 065 ejecuta:
```sql
UPDATE users SET role = 'super_admin' WHERE username = 'admin';
```
y además inserta en `user_roles` con el rol `super_admin` y scope global (sin `company_id` ni `branch_id`).

```bash
mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME < database/migrations/065_seed_superadmin_roles_permissions.sql
```

---

## Fix 6 — Tablas `user_roles` y `user_scopes` faltantes

**Síntoma:** El middleware `requirePermission` fallaba con:
```
Table 'asistencia.user_roles' doesn't exist
```
Lo que causaba que todas las rutas protegidas devolvieran 500 (falla abierta según el diseño del middleware, pero el log mostraba el error).

**Solución:** Aplicar la migración 064, que crea `roles`, `permissions_catalog`, `role_permissions`, `user_roles`, `user_scopes`, `field_permissions`, `module_catalog` y `module_menu_items`.

```bash
mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME < database/migrations/064_rbac_abac_multiempresa.sql
```

---

## Fix 7 — Tabla `settings` no sembrada: `attendance.source_mode` faltante

**Síntoma:** La API retornaba error al consultar el modo de fuente de asistencia porque la tabla `settings` estaba vacía o no existía.

**Solución:** La migración 062 crea la tabla `settings` e inserta los valores por defecto:
```sql
INSERT IGNORE INTO settings (`key`, `value`) VALUES
  ('attendance.source_mode', 'legacy_att2000'),
  ('system.timezone',        'America/Asuncion'),
  ('system.language',        'es'),
  ('notifications.enabled',  'true');
```

```bash
mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME < database/migrations/062_login_settings_schema_fix.sql
```

---

## Tablas creadas por las migraciones 061–065

Las siguientes tablas son creadas por las migraciones del branch `feature/ux-modular-rbac-multiempresa`. Todas las sentencias usan `CREATE TABLE IF NOT EXISTS`, por lo que son idempotentes.

**Migración 061** (`061_notifications_multicanal.sql`):
- `notification_channels`
- `notification_event_catalog`
- `notification_events`
- `notification_queue`
- `notification_delivery_logs`
- `notification_preferences`
- `notification_templates`
- `internal_notifications`
- `notification_settings`
- `system_settings`
- `user_notifications`

**Migración 062** (`062_login_settings_schema_fix.sql`):
- `settings`
- `company_settings`
- (ALTER) columnas de seguridad en `users`: `must_change_password`, `last_login`, `failed_login_attempts`, `locked_until`, `two_factor_enabled`, `two_factor_secret`

**Migración 063** (`063_me_audit_schema_fix.sql`):
- `audit_events`
- `user_permissions`
- (ALTER) columnas de perfil en `users`: `company_id`, `department_id`, `branch_id`, `display_name`, `avatar_url`, `phone`

**Migración 064** (`064_rbac_abac_multiempresa.sql`):
- `roles`
- `permissions_catalog`
- `role_permissions`
- `user_roles`
- `user_scopes`
- `field_permissions`
- `module_catalog`
- `module_menu_items`

**Migración 065** (`065_seed_superadmin_roles_permissions.sql`):
- (solo DML) Siembra los 15 roles base, promueve `admin` a `super_admin`, asigna scope global, asigna todos los permisos al rol `super_admin`, siembra menú items por módulo.

**Total: 23 tablas nuevas + 2 tablas alteradas.**

---

## Cómo aplicar las migraciones

**Opción A — una por una en orden:**
```bash
mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME < database/migrations/061_notifications_multicanal.sql
mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME < database/migrations/062_login_settings_schema_fix.sql
mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME < database/migrations/063_me_audit_schema_fix.sql
mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME < database/migrations/064_rbac_abac_multiempresa.sql
mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME < database/migrations/065_seed_superadmin_roles_permissions.sql
```

**Opción B — script de aplicación masiva:**
```bash
#!/bin/bash
# run-migrations.sh
set -e
for f in database/migrations/0{61,62,63,64,65}_*.sql; do
  echo "Applying $f ..."
  mysql -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$f"
  echo "OK: $f"
done
```

Todos los archivos de migración son idempotentes: usan `CREATE TABLE IF NOT EXISTS`, `INSERT IGNORE` y `ON DUPLICATE KEY UPDATE`, por lo que pueden aplicarse múltiples veces sin errores.

---

## Cómo verificar el estado tras aplicar

```bash
# 1. Verificar que audit_events existe
curl -s -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<PASSWORD>"}' | jq .
# Debe devolver accessToken sin errores en el log de la API

# 2. Verificar super_admin y permisos efectivos
TOKEN=$(curl -s -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<PASSWORD>"}' | jq -r .accessToken)

curl -s http://localhost/api/user-scopes/1/effective-permissions \
  -H "Authorization: Bearer $TOKEN" | jq '.permission_codes | length'
# Debe devolver 63 (total de permisos en el catálogo) o más

# 3. Verificar que settings está sembrado
curl -s http://localhost/api/settings \
  -H "Authorization: Bearer $TOKEN" | jq '."attendance.source_mode"'
# Debe devolver "legacy_att2000"

# 4. Verificar módulos del portal
curl -s http://localhost/api/modules \
  -H "Authorization: Bearer $TOKEN" | jq '.[].code'
# Debe listar los 11 módulos
```

---

## Troubleshooting

### "audit.log falló (login_ok): Table 'asistencia.audit_events' doesn't exist"

La tabla `audit_events` no fue creada. Aplicar la migración 063:
```bash
mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME < database/migrations/063_me_audit_schema_fix.sql
```

### "nav.companies mostrando como clave cruda"

Dos posibles causas:
1. `NEXT_PUBLIC_API_URL` no está configurado correctamente → verificar `.env.local` del web contiene `NEXT_PUBLIC_API_URL=/api` y reconstruir: `cd web && npm run build && pm2 reload web`.
2. Claves faltantes en los archivos de locale → agregar las claves `nav.companies` y afines a `web/src/i18n/locales/{es,en,pt}.json`.

### "CORS error al llamar localhost:4000"

El frontend está haciendo peticiones directas a `localhost:4000` en lugar de usar rutas relativas.

1. Asegurarse que `.env.local` del web contiene:
   ```
   NEXT_PUBLIC_API_URL=/api
   ```
2. Reconstruir el build de Next.js:
   ```bash
   cd web && npm run build && pm2 reload web
   ```
3. Si el error persiste en páginas específicas, verificar que la página usa `import { api } from '@/lib/api'` en lugar de una constante local `API = 'http://localhost:4000'`.

### "super_admin no puede ver todas las empresas"

El usuario `admin` no tiene el rol `super_admin` en `user_roles` o no tiene scope `global` en `user_scopes`. Aplicar la migración 065:
```bash
mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME < database/migrations/065_seed_superadmin_roles_permissions.sql
```
Verificar:
```sql
SELECT u.username, ur.company_id, ur.branch_id, r.code AS role_code
FROM users u
JOIN user_roles ur ON ur.user_id = u.id
JOIN roles r ON r.id = ur.role_id
WHERE u.username = 'admin';
-- Debe mostrar role_code=super_admin, company_id=NULL, branch_id=NULL

SELECT scope_type FROM user_scopes WHERE user_id = (SELECT id FROM users WHERE username = 'admin');
-- Debe mostrar scope_type=global
```

### "Table 'asistencia.user_roles' doesn't exist" en logs de la API

Las tablas del sistema RBAC no fueron creadas. Aplicar la migración 064:
```bash
mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME < database/migrations/064_rbac_abac_multiempresa.sql
```
