# Auditoría de Conciliación de Marcaciones — RRHH ERP

> Última actualización: 2026-05-27  
> Propósito: Diagnosticar por qué empleados aparecen `absent` con `first_in: null` pese a tener relojes ZKTeco activos.

---

## Resumen ejecutivo

La cadena de marcaciones tiene **dos fuentes de entrada** y **dos tablas de destino**:

```
[att2000 SQL Server]  →  sync/import  →  attendance_logs  →  daily_summary
[ZKTeco Bridge]       →  webhook      →  attendance_logs  →  daily_summary
                                                          ↓
                                                   Reporte / UI
```

Síntomas observados en staging:
- `first_in: null`, `last_out: null`, `worked_minutes: null`, `status: "absent"`
- `department: "This Company"` (indica que `employees.department_id` es NULL o FK inválida)
- `employee_name` incompleto (indica `first_name`/`last_name` no cargados)

---

## Tablas involucradas

### MySQL local (base de datos `asistencia`)

| Tabla | Rol | Campos clave |
|---|---|---|
| `employees` | Padrón maestro de empleados | `id`, `code` (= ZKTeco USERID), `first_name`, `last_name`, `department_id`, `schedule_id`, `status` |
| `departments` | Estructura organizativa | `id`, `name`, `company_id` |
| `schedules` | Turnos/horarios | `id`, `name`, `check_in`, `check_out`, `tolerance_in` |
| `devices` | Relojes biométricos ZKTeco | `id`, `name`, `ip_address`, `port`, `last_sync_at`, `last_error` |
| `attendance_logs` | **Marcaciones crudas unificadas** | `id`, `employee_id`, `timestamp`, `type` (in/out/break_start/break_end), `source` (device/mobile/manual/att2000), `raw_data` JSON |
| `daily_summary` | **Resumen diario procesado** | `id`, `employee_id`, `date`, `first_in`, `last_out`, `worked_minutes`, `late_minutes`, `overtime_minutes`, `status` (present/absent/late/permission/holiday/weekend), `justification` |
| `source_employee_map` | Mapeo att2000 → empleado interno | `source_user_id` (att2000 USERID), `source_badge_number`, `employee_id`, `match_status` |
| `attendance_import_staging` | Buffer de importación att2000 | `sync_run_id`, `source_user_id`, `check_time`, `normalized_type`, `employee_id`, `import_status` |
| `unknown_attendance_events` | Marcaciones sin empleado mapeado | `source_user_id`, `badge_number`, `check_time` |
| `source_sync_runs` | Historial de sincronizaciones | `sync_type`, `status`, `total_read`, `inserted`, `errors`, `started_at`, `finished_at` |
| `attendance_reconciliation_results` | Discrepancias auditadas | `employee_id`, `date`, `issue_type`, `source_count`, `local_count` |

### SQL Server att2000 (solo lectura)

| Tabla | Descripción | Campos relevantes |
|---|---|---|
| `CHECKINOUT` | Marcaciones crudas del reloj | `USERID` (FK → USERINFO), `CHECKTIME` (datetime), `CHECKTYPE` (I=entrada, O=salida) |
| `USERINFO` | Usuarios registrados en ZKTeco | `USERID` (PK), `BADGENUMBER`, `Name`, `DEFAULTDEPTID` |
| `DEPARTMENTS` | Departamentos att2000 | `DEPTID`, `DEPTNAME` |

---

## Flujo de datos — Ruta 1: Bridge ZKTeco (tiempo real)

```
Reloj ZKTeco (push / polling)
    ↓
bridge/ (puerto 8080/8081)
    ↓  POST /api/attendance/bridge/webhook  (clave interna BRIDGE_API_KEY)
attendanceController.bridgeWebhook()
    ↓  lookup: employees WHERE code = USERID
    ↓  INSERT INTO attendance_logs (employee_id, timestamp, type, source='device')
    ↓  recalcDailySummary(employee_id, date)
    ↓  UPDATE daily_summary
```

**Punto de falla frecuente:** `employees.code` no coincide con `USERID` del reloj.  
Verificar: `SELECT code FROM employees WHERE status='active' LIMIT 20;`

---

## Flujo de datos — Ruta 2: Sincronización att2000 (batch)

```
att2000.CHECKINOUT  →  POST /api/sync/att2000/import-punches
    ↓  Lee USERID, CHECKTIME, CHECKTYPE
    ↓  Busca employee: employees WHERE code = USERID
       Si no encuentra → escribe en unknown_attendance_events
    ↓  INSERT attendance_import_staging
    ↓  INSERT attendance_logs (source='att2000')
    ↓  recalcDailySummary() para cada employee afectado
```

---

## Flujo de datos — Ruta 3: Recálculo batch (scheduler)

```
Cron diario (scheduler.js → bulkRecalcDailySummary)
    ↓  Lee attendance_logs WHERE DATE(timestamp) = hoy
    ↓  GROUP BY employee_id
    ↓  Calcula first_in, last_out, worked_minutes, late_minutes
    ↓  UPSERT daily_summary
```

Si `attendance_logs` está vacía → `daily_summary` queda con `status='absent'` para todos.

---

## Problemas diagnosticados y causas probables

### Problema 1: `department: "This Company"` en lugar del nombre real

**Causa:** `employees.department_id` es NULL o apunta a un departamento con `name = 'This Company'` (departamento raíz/default creado en init.sql).

**Verificación:**
```sql
SELECT d.name, COUNT(e.id) AS empleados
FROM employees e
LEFT JOIN departments d ON d.id = e.department_id
WHERE e.status = 'active'
GROUP BY d.name;
```

**Acción:** Importar estructura de departamentos desde att2000 via `POST /api/sync/departments` o asignar manualmente `department_id`.

---

### Problema 2: `employee_name` en blanco

**Causa:** `employees.first_name` o `last_name` vacíos después de importación.

**Verificación:**
```sql
SELECT id, code, first_name, last_name, status
FROM employees
WHERE (first_name IS NULL OR first_name = '')
  AND status = 'active'
LIMIT 20;
```

**Acción:** Reimportar desde att2000.USERINFO via `POST /api/sync/employees`.

---

### Problema 3: `first_in: null` — marcaciones no llegan a `attendance_logs`

**Causa A:** `employees.code` no coincide con USERID de ZKTeco/att2000.  
**Causa B:** Bridge no está en modo polling/push o BRIDGE_API_KEY no está configurada.  
**Causa C:** att2000 sync no se ejecutó hoy (revisar `source_sync_runs`).  
**Causa D:** Marcaciones llegan a `unknown_attendance_events` (USERID sin match).

**Verificación:**
```sql
-- ¿Cuántas marcaciones existen hoy?
SELECT COUNT(*) FROM attendance_logs WHERE DATE(timestamp) = CURDATE();

-- ¿Hay eventos sin mapear?
SELECT COUNT(*) FROM unknown_attendance_events;

-- ¿Qué códigos tiene ZKTeco que no están en employees?
SELECT source_user_id, COUNT(*) AS punches
FROM unknown_attendance_events
GROUP BY source_user_id
ORDER BY punches DESC
LIMIT 20;
```

---

### Problema 4: `daily_summary` no se recalcula

**Causa:** `bulkRecalcDailySummary` no fue invocado después de insertar en `attendance_logs`.

**Acción manual:**
```bash
# Via API (admin)
curl -X POST http://localhost/api/attendance/recalc-summary \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-05-27"}'
```

---

## Endpoint de diagnóstico

`GET /api/attendance/reconciliation-diagnostics?date=YYYY-MM-DD`

Devuelve el estado completo de la cadena para una fecha dada:

```json
{
  "ok": true,
  "date": "2026-05-27",
  "sources": {
    "att2000": {
      "available": true,
      "total": 150000,
      "today": 42,
      "users_in_userinfo": 85,
      "last_event_at": "2026-05-27T08:32:11",
      "last_event_user": "1023"
    },
    "zkteco_bridge": {
      "available": true,
      "devices": 3,
      "last_poll_at": "2026-05-27T08:35:00",
      "raw_events_today": 42
    },
    "local_raw": {
      "total": 48300,
      "today": 42,
      "by_source": [{"source": "device", "cnt": 42}]
    },
    "processed": {
      "daily_summary_today": 42,
      "absent_today": 5
    }
  },
  "mapping": {
    "employees_active": 87,
    "employees_with_code": 82,
    "employees_without_code": 5,
    "unmatched_punches_total": 3
  },
  "samples": {
    "latest_raw": [...],
    "latest_processed": [...],
    "unmatched": [...]
  }
}
```

Requerir: rol `admin`, `super_admin` o `hr`.

---

## Pasos de corrección recomendados (en orden)

1. **Verificar devices** — `GET /api/zkteco/diagnostics` → confirmar que `bridge.status=ok` y `devices≥1`
2. **Importar empleados** — `POST /api/sync/employees` → poblar `employees` desde att2000.USERINFO
3. **Importar departamentos** — `POST /api/sync/departments` → asignar `employees.department_id`
4. **Importar marcaciones** — `POST /api/sync/attendance` con rango de fechas
5. **Verificar mapeo** — revisar `unknown_attendance_events` y asignar `employees.code` correcto
6. **Recalcular** — `POST /api/attendance/recalc-summary` con la fecha deseada
7. **Verificar** — `GET /api/attendance/reconciliation-diagnostics?date=HOY`

---

## Referencias de código

| Funcionalidad | Archivo |
|---|---|
| Diagnóstico reconciliación | `api/src/routes/attendance.js` — `GET /reconciliation-diagnostics` |
| Sync att2000 (batch) | `api/src/routes/sync.js` — `POST /att2000/import-*` |
| Webhook bridge (tiempo real) | `api/src/controllers/attendanceController.js` — `bridgeWebhook` |
| Recálculo daily_summary | `api/src/services/scheduler.js` — `bulkRecalcDailySummary()` |
| Diagnóstico att2000 | `api/src/routes/sync.js` — `GET /att2000/diagnose` |
| Diagnóstico bridge | `api/src/index.js` — `GET /api/zkteco/diagnostics` |
