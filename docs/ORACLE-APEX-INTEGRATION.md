# Integración con Oracle APEX
## Sistema de Asistencia → Oracle APEX

---

## Visión General

El Sistema de Asistencia expone una REST API que Oracle APEX puede consumir
directamente usando **REST Data Sources** o llamadas PL/SQL.

```
Sistema de Asistencia          Oracle APEX Application
┌──────────────────┐           ┌────────────────────────┐
│  REST API :4000  │◄─────────►│  REST Data Source      │
│  GET /integration│  HTTP     │  Interactive Reports    │
│  POST /checkin   │  JSON     │  Charts / Dashboards   │
│  Webhooks POST   │◄─────────►│  PL/SQL Procedures     │
└──────────────────┘           └────────────────────────┘
```

---

## Parte 1 — Configurar Web Credential en Oracle APEX

En Oracle APEX, antes de crear los REST Data Sources, configura las credenciales:

1. Ve a **App Builder → Workspace Utilities → Web Credentials**
2. Haz clic en **Create**
3. Configura:

```
Name:                 Asistencia API
Static ID:            ASISTENCIA_API
Authentication Type:  HTTP Header
Prompt 1 Name:        X-API-Key
Prompt 1 Value:       TU_CLAVE_API_AQUI
```

---

## Parte 2 — REST Data Sources en Oracle APEX

### 2.1 — Asistencia de Hoy

Crea un REST Data Source para mostrar la asistencia del día actual.

**Configuración:**
```
Name:          Asistencia Hoy
URL:           http://TU_SERVIDOR:4000/api/integration/attendance/today
Method:        GET
Web Credential: Asistencia API
Row Selector:  $.data[*]
```

**Columnas que devuelve:**
| Columna             | Tipo    | Descripción              |
|---------------------|---------|--------------------------|
| employee_id         | NUMBER  | ID del empleado          |
| employee_code       | VARCHAR | Código en el reloj       |
| employee_name       | VARCHAR | Nombre completo          |
| department          | VARCHAR | Departamento             |
| scheduled_in        | VARCHAR | Hora de entrada planificada |
| scheduled_out       | VARCHAR | Hora de salida planificada  |
| first_in            | DATE    | Primera entrada del día  |
| last_out            | DATE    | Última salida del día    |
| worked_minutes      | NUMBER  | Minutos trabajados       |
| late_minutes        | NUMBER  | Minutos de retardo       |
| status              | VARCHAR | present/absent/late      |

### 2.2 — Empleados

```
URL:     http://TU_SERVIDOR:4000/api/integration/employees
Method:  GET
Row Selector: $.data[*]
```

### 2.3 — Estadísticas del Día (KPIs)

```
URL:     http://TU_SERVIDOR:4000/api/integration/stats/summary
Method:  GET
Row Selector: $
```

---

## Parte 3 — PL/SQL para consumir la API

### 3.1 — Paquete de integración

```sql
CREATE OR REPLACE PACKAGE pkg_asistencia AS

  -- Constantes de conexión
  c_api_base  CONSTANT VARCHAR2(200) := 'http://TU_SERVIDOR:4000';
  c_api_key   CONSTANT VARCHAR2(100) := 'TU_CLAVE_API_AQUI';

  -- Tipos de datos
  TYPE t_empleado IS RECORD (
    employee_id     NUMBER,
    employee_code   VARCHAR2(30),
    employee_name   VARCHAR2(150),
    department      VARCHAR2(100),
    status          VARCHAR2(30),
    first_in        VARCHAR2(30),
    last_out        VARCHAR2(30),
    worked_minutes  NUMBER,
    late_minutes    NUMBER
  );

  TYPE t_empleados IS TABLE OF t_empleado INDEX BY PLS_INTEGER;

  -- Funciones principales
  FUNCTION get_asistencia_hoy(
    p_dept_id NUMBER DEFAULT NULL
  ) RETURN t_empleados;

  PROCEDURE registrar_marcaje(
    p_employee_code VARCHAR2,
    p_tipo          VARCHAR2 DEFAULT NULL,   -- 'in' o 'out'
    p_timestamp     TIMESTAMP DEFAULT SYSTIMESTAMP
  );

  FUNCTION get_stats_hoy RETURN CLOB;

END pkg_asistencia;
/

CREATE OR REPLACE PACKAGE BODY pkg_asistencia AS

  -- Función auxiliar: llamada HTTP GET
  FUNCTION http_get(p_url VARCHAR2) RETURN CLOB IS
    l_response  CLOB;
    l_request   UTL_HTTP.REQ;
    l_response_obj UTL_HTTP.RESP;
    l_buffer    VARCHAR2(32767);
  BEGIN
    l_request := UTL_HTTP.BEGIN_REQUEST(p_url, 'GET', 'HTTP/1.1');
    UTL_HTTP.SET_HEADER(l_request, 'X-API-Key', c_api_key);
    UTL_HTTP.SET_HEADER(l_request, 'Accept', 'application/json');
    UTL_HTTP.SET_HEADER(l_request, 'Content-Type', 'application/json');

    l_response_obj := UTL_HTTP.GET_RESPONSE(l_request);

    DBMS_LOB.CREATETEMPORARY(l_response, TRUE);
    BEGIN
      LOOP
        UTL_HTTP.READ_TEXT(l_response_obj, l_buffer, 32767);
        DBMS_LOB.APPEND(l_response, l_buffer);
      END LOOP;
    EXCEPTION
      WHEN UTL_HTTP.END_OF_BODY THEN NULL;
    END;

    UTL_HTTP.END_RESPONSE(l_response_obj);
    RETURN l_response;
  END http_get;

  -- Función auxiliar: llamada HTTP POST
  FUNCTION http_post(p_url VARCHAR2, p_body CLOB) RETURN CLOB IS
    l_response  CLOB;
    l_request   UTL_HTTP.REQ;
    l_response_obj UTL_HTTP.RESP;
    l_buffer    VARCHAR2(32767);
    l_body_raw  RAW(32767);
  BEGIN
    l_request := UTL_HTTP.BEGIN_REQUEST(p_url, 'POST', 'HTTP/1.1');
    UTL_HTTP.SET_HEADER(l_request, 'X-API-Key', c_api_key);
    UTL_HTTP.SET_HEADER(l_request, 'Content-Type', 'application/json');
    UTL_HTTP.SET_HEADER(l_request, 'Content-Length', LENGTH(p_body));

    l_body_raw := UTL_RAW.CAST_TO_RAW(SUBSTR(p_body, 1, 32767));
    UTL_HTTP.WRITE_RAW(l_request, l_body_raw);

    l_response_obj := UTL_HTTP.GET_RESPONSE(l_request);

    DBMS_LOB.CREATETEMPORARY(l_response, TRUE);
    BEGIN
      LOOP
        UTL_HTTP.READ_TEXT(l_response_obj, l_buffer, 32767);
        DBMS_LOB.APPEND(l_response, l_buffer);
      END LOOP;
    EXCEPTION
      WHEN UTL_HTTP.END_OF_BODY THEN NULL;
    END;

    UTL_HTTP.END_RESPONSE(l_response_obj);
    RETURN l_response;
  END http_post;

  -- Obtener asistencia de hoy
  FUNCTION get_asistencia_hoy(
    p_dept_id NUMBER DEFAULT NULL
  ) RETURN t_empleados IS
    l_url     VARCHAR2(500);
    l_json    CLOB;
    l_result  t_empleados;
    l_count   NUMBER;
  BEGIN
    l_url := c_api_base || '/api/integration/attendance/today';
    IF p_dept_id IS NOT NULL THEN
      l_url := l_url || '?dept_id=' || p_dept_id;
    END IF;

    l_json := http_get(l_url);

    -- Parsear JSON con APEX_JSON
    APEX_JSON.PARSE(l_json);
    l_count := APEX_JSON.GET_COUNT(p_path => 'data');

    FOR i IN 1..l_count LOOP
      l_result(i).employee_id    := APEX_JSON.GET_NUMBER(p_path => 'data[%d].employee_id',    p0 => i);
      l_result(i).employee_code  := APEX_JSON.GET_VARCHAR2(p_path => 'data[%d].employee_code', p0 => i);
      l_result(i).employee_name  := APEX_JSON.GET_VARCHAR2(p_path => 'data[%d].employee_name', p0 => i);
      l_result(i).department     := APEX_JSON.GET_VARCHAR2(p_path => 'data[%d].department',    p0 => i);
      l_result(i).status         := APEX_JSON.GET_VARCHAR2(p_path => 'data[%d].status',        p0 => i);
      l_result(i).first_in       := APEX_JSON.GET_VARCHAR2(p_path => 'data[%d].first_in',      p0 => i);
      l_result(i).last_out       := APEX_JSON.GET_VARCHAR2(p_path => 'data[%d].last_out',      p0 => i);
      l_result(i).worked_minutes := APEX_JSON.GET_NUMBER(p_path => 'data[%d].worked_minutes',  p0 => i);
      l_result(i).late_minutes   := APEX_JSON.GET_NUMBER(p_path => 'data[%d].late_minutes',    p0 => i);
    END LOOP;

    RETURN l_result;
  END get_asistencia_hoy;

  -- Registrar marcaje desde Oracle APEX
  PROCEDURE registrar_marcaje(
    p_employee_code VARCHAR2,
    p_tipo          VARCHAR2 DEFAULT NULL,
    p_timestamp     TIMESTAMP DEFAULT SYSTIMESTAMP
  ) IS
    l_url     VARCHAR2(500);
    l_body    CLOB;
    l_response CLOB;
    l_ts_str  VARCHAR2(30);
  BEGIN
    l_url    := c_api_base || '/api/integration/checkin';
    l_ts_str := TO_CHAR(p_timestamp AT TIME ZONE 'America/Guatemala',
                        'YYYY-MM-DD"T"HH24:MI:SS".000Z"');

    -- Construir JSON
    APEX_JSON.INITIALIZE_CLOB_OUTPUT;
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('employee_code', p_employee_code);
    APEX_JSON.WRITE('timestamp', l_ts_str);
    IF p_tipo IS NOT NULL THEN
      APEX_JSON.WRITE('type', p_tipo);
    END IF;
    APEX_JSON.CLOSE_OBJECT;
    l_body := APEX_JSON.GET_CLOB_OUTPUT;
    APEX_JSON.FREE_OUTPUT;

    l_response := http_post(l_url, l_body);

    -- Verificar respuesta
    APEX_JSON.PARSE(l_response);
    IF APEX_JSON.GET_BOOLEAN(p_path => 'ok') != TRUE THEN
      RAISE_APPLICATION_ERROR(-20001, 'Error en marcaje: ' ||
        APEX_JSON.GET_VARCHAR2(p_path => 'error'));
    END IF;

  EXCEPTION
    WHEN OTHERS THEN
      RAISE_APPLICATION_ERROR(-20002,
        'Error registrando marcaje para ' || p_employee_code || ': ' || SQLERRM);
  END registrar_marcaje;

  -- Obtener estadísticas del día
  FUNCTION get_stats_hoy RETURN CLOB IS
  BEGIN
    RETURN http_get(c_api_base || '/api/integration/stats/summary');
  END get_stats_hoy;

END pkg_asistencia;
/
```

### 3.2 — Proceso de carga en tabla Oracle (sincronización)

```sql
-- Crear tabla local para cache de asistencia
CREATE TABLE att_asistencia_hoy (
  employee_id     NUMBER,
  employee_code   VARCHAR2(30),
  employee_name   VARCHAR2(150),
  department      VARCHAR2(100),
  status          VARCHAR2(30),
  first_in        VARCHAR2(30),
  last_out        VARCHAR2(30),
  worked_minutes  NUMBER,
  late_minutes    NUMBER,
  fecha_sync      TIMESTAMP DEFAULT SYSTIMESTAMP,
  CONSTRAINT pk_att_asistencia PRIMARY KEY (employee_id)
);

-- Procedimiento de sincronización
CREATE OR REPLACE PROCEDURE sync_asistencia_hoy IS
  l_empleados pkg_asistencia.t_empleados;
BEGIN
  l_empleados := pkg_asistencia.get_asistencia_hoy;

  -- Limpiar tabla y recargar
  DELETE FROM att_asistencia_hoy;

  FOR i IN 1..l_empleados.COUNT LOOP
    INSERT INTO att_asistencia_hoy VALUES (
      l_empleados(i).employee_id,
      l_empleados(i).employee_code,
      l_empleados(i).employee_name,
      l_empleados(i).department,
      l_empleados(i).status,
      l_empleados(i).first_in,
      l_empleados(i).last_out,
      l_empleados(i).worked_minutes,
      l_empleados(i).late_minutes,
      SYSTIMESTAMP
    );
  END LOOP;

  COMMIT;
  DBMS_OUTPUT.PUT_LINE('Sync completado: ' || l_empleados.COUNT || ' empleados');
END sync_asistencia_hoy;
/

-- Ejecutar manualmente o programar con DBMS_SCHEDULER:
BEGIN
  DBMS_SCHEDULER.CREATE_JOB(
    job_name        => 'JOB_SYNC_ASISTENCIA',
    job_type        => 'STORED_PROCEDURE',
    job_action      => 'sync_asistencia_hoy',
    repeat_interval => 'FREQ=MINUTELY;INTERVAL=5',  -- cada 5 minutos
    enabled         => TRUE
  );
END;
/
```

---

## Parte 4 — Recibir Webhooks en Oracle APEX (ORDS)

Configura Oracle APEX para recibir notificaciones en tiempo real cuando
un empleado marca en el reloj.

### 4.1 — Crear endpoint REST en ORDS

```sql
-- Módulo REST para recibir webhooks
BEGIN
  ORDS.DEFINE_MODULE(
    p_module_name    => 'asistencia',
    p_base_path      => '/asistencia/',
    p_is_published   => TRUE
  );

  ORDS.DEFINE_TEMPLATE(
    p_module_name    => 'asistencia',
    p_pattern        => 'webhook/attendance'
  );

  ORDS.DEFINE_HANDLER(
    p_module_name    => 'asistencia',
    p_pattern        => 'webhook/attendance',
    p_method         => 'POST',
    p_source_type    => ORDS.source_type_plsql,
    p_source         => q'[
      DECLARE
        l_body       CLOB := :body_text;
        l_event      VARCHAR2(100);
        l_emp_id     NUMBER;
        l_emp_name   VARCHAR2(150);
        l_timestamp  VARCHAR2(50);
        l_type       VARCHAR2(20);
        l_late_min   NUMBER;
      BEGIN
        -- Validar firma HMAC (opcional pero recomendado)
        -- IF :x_webhook_signature IS NULL THEN
        --   :status := 401;
        --   RETURN;
        -- END IF;

        -- Parsear el payload del webhook
        APEX_JSON.PARSE(l_body);
        l_event     := APEX_JSON.GET_VARCHAR2('event');
        l_emp_id    := APEX_JSON.GET_NUMBER('data.employeeId');
        l_emp_name  := APEX_JSON.GET_VARCHAR2('data.employeeName');
        l_timestamp := APEX_JSON.GET_VARCHAR2('data.timestamp');
        l_type      := APEX_JSON.GET_VARCHAR2('data.type');
        l_late_min  := APEX_JSON.GET_NUMBER('data.lateMinutes');

        -- Guardar en tabla de log
        INSERT INTO att_webhook_log (
          event_type, employee_id, employee_name,
          mark_timestamp, mark_type, late_minutes, received_at
        ) VALUES (
          l_event, l_emp_id, l_emp_name,
          TO_TIMESTAMP(SUBSTR(l_timestamp,1,19), 'YYYY-MM-DD"T"HH24:MI:SS'),
          l_type, l_late_min, SYSTIMESTAMP
        );
        COMMIT;

        -- Si llegó tarde, enviar notificación interna
        IF l_type = 'in' AND l_late_min > 0 THEN
          -- Aquí puedes llamar a tu sistema de notificaciones
          -- APEX_MAIL.SEND(...)
          NULL;
        END IF;

        :status := 200;
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('ok', TRUE);
        APEX_JSON.CLOSE_OBJECT;
      END;
    ]'
  );

  COMMIT;
END;
/

-- Tabla de log de webhooks
CREATE TABLE att_webhook_log (
  id              NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type      VARCHAR2(50),
  employee_id     NUMBER,
  employee_name   VARCHAR2(150),
  mark_timestamp  TIMESTAMP,
  mark_type       VARCHAR2(20),
  late_minutes    NUMBER,
  received_at     TIMESTAMP DEFAULT SYSTIMESTAMP
);
```

### 4.2 — Registrar el webhook en el Sistema de Asistencia

```sql
-- Registrar el endpoint de Oracle APEX como webhook receptor
DECLARE
  l_body CLOB := '{
    "name": "Oracle APEX - Notificaciones RH",
    "url": "https://apex.empresa.com/ords/hr/asistencia/webhook/attendance",
    "secret": "mi_secreto_compartido",
    "events": ["attendance.checkin", "attendance.checkout", "alert.late"]
  }';
BEGIN
  -- Llamar al API para registrar el webhook
  -- (También se puede hacer desde el Dashboard web del sistema)
  pkg_asistencia.http_post_void(
    p_url  => 'http://TU_SERVIDOR:4000/api/webhooks',
    p_body => l_body
  );
END;
/
```

---

## Parte 5 — Reportes en Oracle APEX

### 5.1 — Interactive Report con datos en tiempo real

En una página de Oracle APEX, crea un **SQL Query** que use la tabla de cache:

```sql
SELECT
  employee_code,
  employee_name,
  department,
  CASE status
    WHEN 'present'    THEN '✅ Presente'
    WHEN 'late'       THEN '⚠️ Retardo'
    WHEN 'absent'     THEN '❌ Ausente'
    WHEN 'permission' THEN '📋 Permiso'
    ELSE '—'
  END AS estado,
  TO_CHAR(TO_TIMESTAMP(SUBSTR(first_in,1,19), 'YYYY-MM-DD"T"HH24:MI:SS'),
          'HH24:MI') AS hora_entrada,
  TO_CHAR(TO_TIMESTAMP(SUBSTR(last_out,1,19), 'YYYY-MM-DD"T"HH24:MI:SS'),
          'HH24:MI') AS hora_salida,
  FLOOR(worked_minutes / 60) || ':' ||
    LPAD(MOD(worked_minutes, 60), 2, '0') AS horas_trabajadas,
  late_minutes || ' min' AS retardo
FROM att_asistencia_hoy
ORDER BY
  CASE status
    WHEN 'absent' THEN 1
    WHEN 'late'   THEN 2
    ELSE 3
  END,
  employee_name
```

### 5.2 — Gráfica de KPIs (Chart Region)

```sql
-- Para una gráfica de torta con el estado de asistencia del día
SELECT
  CASE status
    WHEN 'present'    THEN 'Presentes'
    WHEN 'late'       THEN 'Con retardo'
    WHEN 'absent'     THEN 'Ausentes'
    WHEN 'permission' THEN 'En permiso'
    ELSE 'Sin datos'
  END AS label,
  COUNT(*) AS value,
  CASE status
    WHEN 'present'    THEN '#22c55e'
    WHEN 'late'       THEN '#f59e0b'
    WHEN 'absent'     THEN '#ef4444'
    WHEN 'permission' THEN '#8b5cf6'
    ELSE '#94a3b8'
  END AS color
FROM att_asistencia_hoy
GROUP BY status
ORDER BY value DESC
```

---

## Parte 6 — Permisos de Red (ACL) en Oracle

Para que Oracle pueda llamar HTTP al Sistema de Asistencia,
debes configurar el ACL de red:

```sql
-- Conceder acceso de red al usuario de APEX (ejecutar como DBA)
BEGIN
  DBMS_NETWORK_ACL_ADMIN.CREATE_ACL(
    acl         => 'asistencia_api.xml',
    description => 'Acceso al Sistema de Asistencia',
    principal   => 'APEX_USER',         -- reemplaza con tu usuario APEX
    is_grant    => TRUE,
    privilege   => 'connect'
  );

  DBMS_NETWORK_ACL_ADMIN.ADD_PRIVILEGE(
    acl       => 'asistencia_api.xml',
    principal => 'APEX_USER',
    is_grant  => TRUE,
    privilege => 'resolve'
  );

  DBMS_NETWORK_ACL_ADMIN.ASSIGN_ACL(
    acl  => 'asistencia_api.xml',
    host => 'TU_SERVIDOR_ASISTENCIA'   -- IP o hostname
  );

  COMMIT;
END;
/
```

---

## Resumen de Endpoints para Oracle APEX

| Endpoint                              | Método | Descripción                          |
|---------------------------------------|--------|--------------------------------------|
| `/api/integration/attendance/today`   | GET    | Asistencia del día actual            |
| `/api/integration/attendance/range`   | GET    | Rango de fechas (nómina)             |
| `/api/integration/employees`          | GET    | Lista de empleados activos           |
| `/api/integration/stats/summary`      | GET    | KPIs del día                         |
| `/api/integration/checkin`            | POST   | Registrar marcaje desde APEX         |
| `/api/webhooks`                       | POST   | Registrar URL receptora de eventos   |
| `/api/docs`                           | GET    | Documentación interactiva (Swagger)  |

**Autenticación:** Header `X-API-Key: TU_CLAVE_API`
