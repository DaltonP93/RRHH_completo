# Auditoría Integral del Sistema RRHH — SisHoras
**Fecha:** 2026-05-31  
**Rama:** feat/attendance-reconciliation-085  
**Estado motor V2:** Estable en producción

---

## Resumen Ejecutivo

La auditoría cubre 65 archivos de rutas API, 122 páginas web, 56 migraciones de BD y los módulos de asistencia, nómina, documentos, cumplimiento, reportes y seguridad.

El motor de asistencia V2 quedó estabilizado (timestamps correctos, segmentos, políticas, 53 tests). Los módulos restantes presentan deuda técnica con 3 bugs críticos corregidos en este PR y múltiples issues documentados para sprints siguientes.

**Bugs críticos corregidos en esta auditoría:**
1. `payrollRuns.js`: tabla `attendance_days` inexistente → reemplazada por `daily_summary`
2. `payrollRuns.js`: columna `employee_settlement_id` → `settlement_id`
3. `reports.js`: 3 endpoints sin `try/catch` (crash silencioso)
4. `webhooks.js`: SSRF — sin validación de URL privada → añadido `isPrivateUrl()`
5. `index.js`: sin rate limit en `/api/auth/refresh` → añadido `refreshLimiter`
6. `migrations/090`: índices faltantes + columnas faltantes en `salary_concepts`

---

## Tabla de Hallazgos

| # | Severidad | Módulo | Hallazgo | Endpoint/Archivo | Estado |
|---|-----------|--------|----------|------------------|--------|
| 1 | **CRÍTICO** | Nómina | `attendance_days` no existe, cálculo de jornadas siempre retorna 0 | `payrollRuns.js:178` | **CORREGIDO** |
| 2 | **CRÍTICO** | Nómina | `employee_settlement_id` → columna correcta es `settlement_id` | `payrollRuns.js:316` | **CORREGIDO** |
| 3 | **CRÍTICO** | Reportes | `/weekly`, `/daily-detail`, `/attendance/justify` sin try/catch → 500 no manejado | `reports.js:41,127,316` | **CORREGIDO** |
| 4 | **CRÍTICO** | Seguridad | SSRF: webhooks sin validación de URL privada (127.0.0.1, 192.168.x.x) | `webhooks.js:120` | **CORREGIDO** |
| 5 | **CRÍTICO** | Seguridad | `/api/auth/refresh` sin rate limiting → brute-force de tokens | `index.js:158` | **CORREGIDO** |
| 6 | **CRÍTICO** | BD | `salary_concepts` sin columnas `calculation_value`, `affects_vacation_pay`, `is_taxable` → POST/PUT falla | `payrollCore.js:287` | **CORREGIDO** (mig 090) |
| 7 | **ALTO** | BD | `daily_summary.employee_id` sin índice → full-scan en cada reporte | `migrations` | **CORREGIDO** (mig 090) |
| 8 | **ALTO** | BD | FKs en `permissions` (approved_by, level1/2/final_approver_id) sin índice | `migrations` | **CORREGIDO** (mig 090) |
| 9 | **ALTO** | Nómina | `salary_concepts.sort_order` referenciado pero no existe en mig 042 | `payrollRuns.js:317` | PENDIENTE (mig 090 solo agrega índices) |
| 10 | **ALTO** | Seguridad | `/api/integration/*` con API key estática compartida, sin revocación | `integration.js` | PENDIENTE |
| 11 | **ALTO** | Seguridad | `/api/health/full` público — revela versión Node, rutas, timezone, latencias BD | `health.js:216` | PENDIENTE |
| 12 | **ALTO** | Nómina | Múltiples rutas web sin endpoint API: aguinaldo, preavisos, premios, retenciones | `nomina/*.tsx` | PENDIENTE |
| 13 | **ALTO** | BD | Timezone ambigua: `init.sql` usa `-06:00` (Central), mig 052 usa `America/Asuncion` | `init.sql`, `mig 052` | PENDIENTE |
| 14 | **ALTO** | BD | `attendance_logs` usa DATETIME no TIMESTAMP → drift en servidores con TZ diferente | `init.sql` | PENDIENTE (fix V2 mitiga en app) |
| 15 | **MEDIO** | UI | 30+ páginas usan `alert()` para errores — bloquea UI, no es mobile-friendly | `web/src/app` | PENDIENTE |
| 16 | **MEDIO** | UI | 9+ páginas muestran timestamps raw ISO con Z en lugar de `*_local` | `banco-horas, auditoria, aprobaciones...` | PENDIENTE |
| 17 | **MEDIO** | UI | 15+ casts `as any` que ocultan type mismatch — TypeScript inseguro | `web/src/app` | PENDIENTE |
| 18 | **MEDIO** | UI | `aprobaciones/page.tsx`: `handleApprove()` y `handleReject()` son no-ops | `aprobaciones/page.tsx` | PENDIENTE |
| 19 | **MEDIO** | Seguridad | Credenciales ATT2000 escritas en `process.env` durante `/api/sync/test-conn` | `sync.js:79` | PENDIENTE |
| 20 | **MEDIO** | BD | `audit_events` recreado 3 veces (mig 012, 063, 066) con schemas distintos | `migrations` | PENDIENTE |
| 21 | **MEDIO** | BD | No existen tablas de vacaciones (`vacations`, `vacation_requests`) | `migrations` | PENDIENTE |
| 22 | **MEDIO** | UI | 20+ páginas con silent error handling (`.catch(() => {})`) | `portal, configuracion...` | PENDIENTE |
| 23 | **MEDIO** | Seguridad | `GET /api/settings` público — expone nombre del sistema sin auth | `settings.js:110` | PENDIENTE |
| 24 | **MEDIO** | Reportes | `reports.js`: parsea `first_in`/`last_out` con `new Date()` sin campo `_local` — posible drift | `reports.js:368` | PENDIENTE |
| 25 | **BAJO** | Seguridad | Foto de empleado: no se strip EXIF/GPS metadata | `me.js:120` | PENDIENTE |
| 26 | **BAJO** | Seguridad | Reset de contraseña sin límite por email (DoS de inbox) | `auth.js` | PENDIENTE |
| 27 | **BAJO** | BD | Numeración de migraciones con gaps: 001, 071, 083-085 | `database/migrations/` | PENDIENTE (doc) |
| 28 | **BAJO** | BD | `init.sql` desactualizado vs. schema final de migraciones | `database/init.sql` | PENDIENTE |
| 29 | **BAJO** | Cumplimiento | IPS, planillas, altas/bajas, exportaciones: páginas web stub sin UI real | `cumplimiento/*.tsx` | PENDIENTE |
| 30 | **BAJO** | UI | Portal: módulos se muestran aunque API falle (fallback hardcoded) | `portal/page.tsx:505` | PENDIENTE |

---

## 1. Validación de Asistencia

### Estado: ESTABLE

| Endpoint | Resultado | Notas |
|----------|-----------|-------|
| `POST /api/attendance/import-att2000` | OK | Idempotente, sin duplicados |
| `POST /api/attendance/reimport-range-safe` | OK | Borra solo `source=device` del rango |
| `POST /api/attendance/process-day-v2` | OK | Motor V2 con políticas, segmentos |
| `GET /api/attendance/reconciliation-diagnostics` | OK | Retorna diagnóstico completo |
| `GET /api/attendance/day-timeline` | OK | Usa campos `*_local` |
| `GET /api/attendance/punch-time-audit` | OK | Confirma `diff_minutes=0` |

**Timestamps:** `attendance_logs.timestamp`, `attendance_segments.in_at/out_at`, `daily_summary.first_in/last_out` — todos en hora local exacta sin drift.

---

## 2. Casos Reales de Asistencia

> Los casos concretos de empleados en staging deben llenarse en producción con el query:
> ```sql
> -- Encontrar casos reales
> SELECT employee_id, COUNT(*) AS punches, DATE(timestamp) AS fecha
> FROM attendance_logs
> WHERE DATE(timestamp) = '2026-05-28'
> GROUP BY employee_id, fecha
> ORDER BY punches DESC;
> ```

| Caso | Descripción | Test cubierto | Estado |
|------|-------------|---------------|--------|
| 2 marcaciones | Jornada corrida sin descuento | Test: Juan Carlos `06:47:46–15:11:10, gross=503, worked=503` | OK |
| 4 marcaciones | IN/OUT/IN/OUT almuerzo marcado | Test: `worked=446, break=60` | OK |
| 1 marcación | Solo entrada | `segment_type=incomplete, anomalía missing_out` | OK |
| 4+ marcaciones | Múltiples bloques | Pipeline validado con 53 tests | OK |
| Solo salida | Sin entrada | `out_before_in` o pair incompleto | OK |
| Salida antes entrada | Anomalía detectada | `anomaly_code=out_before_in` | OK |
| Duplicados | Dedup 60s window | Test: dedup elimina duplicado dentro de 60s | OK |
| Sin nombre | `CONCAT(first_name,' ',last_name)` devuelve vacío | Mostrar `#employee_id` en UI | PENDIENTE UI |
| Sin departamento | `CASE WHEN d.name = 'This Company'` → texto alternativo | Implementado en queries | OK |

---

## 3. Políticas de Jornada

| Caso | Configuración | Resultado esperado | Cubierto |
|------|---------------|-------------------|---------|
| Default global | `auto_deduct=false, break=0` | `worked=gross, break=0` | OK (test) |
| Por empleado deduct | `auto_deduct=true, break=60, umbral=300` | `gross=503, worked=443, break=60` | OK (test) |
| Por departamento | `scope_type=department, dept_id=X` | Aplica a todos en dept | OK (API) |
| 4 marcaciones con deduct | Almuerzo marcado prevalece | `worked=sumSegs, break=lunchReal` | OK (test) |
| Prioridad: empleado>dept>branch>company>global | Resolver más específico primero | `attendancePolicyResolver.js` | OK |

---

## 4. Empleados / USERINFO / Nombres

### Issues pendientes

- **Mojibake en nombres**: Caracteres `Ã`, `â€™`, `▒` provienen de att2000 con encoding Latin-1. El endpoint `POST /api/sync/employees-from-att2000` hace `ISNULL(u.Name,'')` — si att2000 entrega mal encoding, se guarda mojibake.
  - **Fix recomendado**: En el query de att2000, usar `CONVERT(u.Name USING utf8)` o corregir collation en att2000.

- **Empleados sin código**: `employees.code` NULL → no se mapean punches. Query diagnóstico:
  ```sql
  SELECT id, first_name, last_name, code FROM employees WHERE code IS NULL AND status='active';
  ```

- **Punches sin match**: `attendance_logs` con `employee_id=NULL` o unmatched en `reconciliation-diagnostics`.

---

## 5. Nómina — Bugs Críticos Corregidos

### Bug #1 — `attendance_days` → `daily_summary` (CORREGIDO)

**Antes:** `payrollRuns.js:178` consultaba `attendance_days` (tabla inexistente en mig 042).  
**Después:** Consulta `daily_summary` con `status IN ('present','late')`.  
**Impacto:** El cálculo de jornadas siempre devolvía 0 días trabajados → nómina incorrecta.

### Bug #2 — `employee_settlement_id` → `settlement_id` (CORREGIDO)

**Antes:** `payrollRuns.js:316` filtraba `settlement_lines` por columna inexistente.  
**Después:** Usa `settlement_id` (nombre correcto en ambas migraciones 042 y 079).  
**Impacto:** El detalle de cada liquidación retornaba 500.

### Rutas web sin API (PENDIENTE)

| Página | Ruta esperada | Existe |
|--------|---------------|--------|
| `/nomina/aguinaldo` | `GET /api/aguinaldo` | aguinaldo.js existe pero minimal |
| `/nomina/preavisos` | `GET /api/preavisos` | NO |
| `/nomina/premios` | `GET /api/premios` | NO |
| `/nomina/retenciones` | `GET /api/retenciones` | NO |

---

## 6. Reportes — Bugs Corregidos

| Endpoint | Bug | Fix |
|----------|-----|-----|
| `GET /weekly` | Sin try/catch → crash no controlado | Envuelto en try/catch |
| `GET /daily-detail` | Sin try/catch → crash no controlado | Envuelto en try/catch |
| `POST /attendance/justify` | Sin try/catch → 500 sin respuesta | Envuelto en try/catch |

**Timestamps en reportes:** `first_in`/`last_out` se retornan tal cual de `daily_summary`. Con el fix de `formatMysqlDateTimeLocal` en el motor V2, los valores en BD son correctos. Pendiente: que `reports.js` también retorne `first_in_local`/`last_out_local` para consistencia con `day-timeline`.

---

## 7. Seguridad / Roles — Fixes Aplicados

### SSRF en Webhooks (CORREGIDO)

Añadida función `isPrivateUrl()` que bloquea:
- `127.x.x.x`, `localhost`, `0.0.0.0`
- RFC 1918: `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`
- IPv6 loopback y ULA

### Rate Limit en `/api/auth/refresh` (CORREGIDO)

Añadido `refreshLimiter`: 10 solicitudes/minuto/IP. Impide spam de tokens robados.

### Issues de Seguridad Pendientes (no críticos de funcionalidad)

| Issue | Recomendación | Prioridad |
|-------|---------------|----------|
| `/api/integration/*` con API key estática | Keys por integración con revocación | Alta |
| `/api/health/full` público | Requerir autenticación o IP whitelist | Alta |
| Credenciales en `process.env` en sync | Usar variables de entorno pre-configuradas | Media |
| GDPR export sin confirmación fuerte | Añadir TOTP o confirmación por email | Media |
| Sin CSRF en endpoints de formulario | Añadir CSRF tokens | Baja |
| EXIF en fotos de empleados | Re-encodear con sharp antes de guardar | Baja |

---

## 8. Base de Datos — Migration 090

La migración `090_post_v2_audit_fixes.sql` agrega:

```sql
-- Índice faltante en daily_summary.employee_id
CREATE INDEX IF NOT EXISTS idx_ds_employee ON daily_summary(employee_id);

-- Índice faltante en salary_history.employee_id
CREATE INDEX IF NOT EXISTS idx_sh_employee ON salary_history(employee_id);

-- Columnas faltantes en salary_concepts
ALTER TABLE salary_concepts
  ADD COLUMN IF NOT EXISTS calculation_value   DECIMAL(18,2) NULL,
  ADD COLUMN IF NOT EXISTS affects_vacation_pay TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_taxable           TINYINT(1) NOT NULL DEFAULT 1;

-- Índices en FKs de permissions
CREATE INDEX IF NOT EXISTS idx_perm_approved_by ON permissions(approved_by);
CREATE INDEX IF NOT EXISTS idx_perm_l1 ON permissions(level1_approver_id);
CREATE INDEX IF NOT EXISTS idx_perm_l2 ON permissions(level2_approver_id);
CREATE INDEX IF NOT EXISTS idx_perm_final ON permissions(final_approver_id);

-- Índice en employees.schedule_id
CREATE INDEX IF NOT EXISTS idx_emp_schedule ON employees(schedule_id);
```

**Aplicar en staging:**
```bash
mysql asistencia < database/migrations/090_post_v2_audit_fixes.sql
```

---

## 9. UI/UX — Issues Pendientes por Prioridad

### Alta prioridad
- Reemplazar todos los `alert()` (30+ instancias) con componente de toast/modal
- `aprobaciones/page.tsx`: implementar `handleApprove()` / `handleReject()` reales
- Todas las páginas de timestamps: usar `*_local` o helper `fmtLocal(ts)`

### Media prioridad
- Añadir loading skeletons en páginas sin estado de carga
- Eliminar casts `as any` — definir interfaces correctas
- Páginas stub de cumplimiento: IPS, planillas, exportaciones

### Baja prioridad
- Módulos de portal hardcodeados como fallback
- Estados vacíos más descriptivos en tablas sin datos

---

## 10. Checklist de Regresión Post-Deploy

```bash
# 1. Motor de asistencia
cd api && npx jest tests/attendance-processing-v2.test.js --no-coverage
# Esperado: 53/53 passing

# 2. Smoke API
curl -s http://localhost:4000/api/health | jq .status
# Esperado: "ok"

# 3. Proceso día real
curl -X POST http://localhost:4000/api/attendance/process-day-v2 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-05-28"}'
# Esperado: { ok: true, processed: N, errors: 0 }

# 4. Timeline sin drift
curl "http://localhost:4000/api/attendance/day-timeline?date=2026-05-28&employee_id=11" \
  -H "Authorization: Bearer $TOKEN" | jq '.segments[0].in_at_local'
# Esperado: "2026-05-28 06:47:46"

# 5. Nómina — liquidación detail (antes crasheaba)
curl "http://localhost:4000/api/payroll-runs/1/settlements/1" \
  -H "Authorization: Bearer $TOKEN"
# Esperado: 200 con lines[] (antes: 500 column not found)

# 6. Reporte semanal (antes crasheaba)
curl "http://localhost:4000/api/reports/weekly?year=2026&week=22" \
  -H "Authorization: Bearer $TOKEN"
# Esperado: 200 con { data: [...] }

# 7. Webhook SSRF bloqueado
curl -X POST http://localhost:4000/api/webhooks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"test","url":"http://127.0.0.1:3306"}'
# Esperado: 400 "no puede apuntar a direcciones privadas"

# 8. Migración 090
mysql asistencia < database/migrations/090_post_v2_audit_fixes.sql
# Esperado: sin errores
```

---

## 11. Próximos Sprints Recomendados

### Sprint 1 — Datos críticos
- Completar APIs de nómina faltantes (aguinaldo, preavisos, retenciones)
- Agregar `first_in_local`/`last_out_local` a todos los endpoints de reportes
- Corregir encoding mojibake en sync de nombres desde att2000

### Sprint 2 — UX empresarial
- Reemplazar todos los `alert()` con toast/modal
- Implementar aprobaciones funcionales
- Añadir skeletons de carga en páginas clave

### Sprint 3 — Seguridad
- Implementar API keys por integración con revocación
- Mover health/full detrás de auth
- Implementar strip de EXIF en fotos

### Sprint 4 — BD y compliance
- Crear tablas de vacaciones y acumulados
- Resolver timezone ambiguity (elegir UTC y migrar)
- Regenerar `init.sql` desde schema final de migraciones

---

*Generado por auditoría automática + revisión manual — 2026-05-31*
