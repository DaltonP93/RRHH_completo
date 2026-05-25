# Mapeo de Módulos: Sistema Legacy ANAMNESIS/RRHH → Plataforma Nueva

Este documento describe la correspondencia entre los módulos del sistema legacy (ANAMNESIS) y los módulos de la plataforma RRHH nueva.

## Resumen ejecutivo

El sistema legacy ANAMNESIS gestiona recursos humanos en Paraguay con enfoque en cumplimiento MTESS/IPS y nómina básica. La plataforma nueva amplía estas capacidades con módulos de competencias, documentos digitales, seguridad granular y analítica en tiempo real.

---

## Tabla de mapeo principal

| Módulo legacy (ANAMNESIS) | Módulo nuevo | Ruta nueva | Estado |
|---|---|---|---|
| Fichero de Personal | Gestión de Personas / Legajos | `/personas/legajos` | Migrado |
| Contratos de Trabajo | Personas / Contratos | `/personas/contratos` | Migrado |
| Familiares / Cargas | Personas / Familiares | `/personas/familiares` | Migrado |
| Títulos y Estudios | Personas / Formación | `/personas/formacion` | Migrado |
| Historial de Salarios | Personas / Histórico Salarial | `/personas/historico-salarial` | Migrado |
| Asistencia Diaria | Asistencia / Marcaciones | `/asistencia` | Migrado |
| Relojes ZKTeco | Asistencia / Diagnóstico | `/asistencia/relojes/diagnostico` | Migrado |
| Liquidaciones Mensuales | Nómina / Liquidaciones | `/nomina/liquidaciones` | Migrado |
| Conceptos de Liquidación | Nómina / Conceptos Salariales | `/nomina/conceptos` | Migrado |
| Conceptos Fijos | Nómina / Conceptos Fijos | `/nomina/conceptos-fijos` | Migrado |
| Tipos de Nómina | Nómina / Tipos de Nómina | `/nomina/tipos-nomina` | Migrado |
| Preaviso de Desvinculación | Nómina / Preavisos | `/nomina/preavisos` | Nuevo |
| Bonificaciones | Nómina / Premios y Bonos | `/nomina/premios` | Nuevo |
| Embargos Judiciales | Nómina / Retenciones Judiciales | `/nomina/retenciones` | Nuevo |
| Liquidación de Haberes | Nómina / Liquidación de Salida | `/nomina/liquidacion-salida` | Migrado |
| Aguinaldo | Nómina / Aguinaldo | `/nomina/aguinaldo` | Migrado |
| Vacaciones | Nómina / Vacaciones | `/vacaciones` | Migrado |
| Anticipos de Salario | Nómina / Anticipos | `/nomina/anticipos` | Migrado |
| Parámetros del Mes | Nómina / Parámetros Mensuales | `/nomina/parametros` | Migrado |
| Planilla MTESS | Cumplimiento / MTESS/REOP | `/cumplimiento/mtess` | Migrado |
| REI-IPS | Cumplimiento / IPS/REI | `/cumplimiento/ips` | Migrado |
| Planillas Laborales | Cumplimiento / Planillas | `/cumplimiento/planillas` | Migrado |
| Altas/Bajas MTESS | Cumplimiento / Altas y Bajas | `/cumplimiento/altas-bajas` | Migrado |
| Calendario Vencimientos | Cumplimiento / Calendario | `/cumplimiento/calendario` | Migrado |
| Cuentas Bancarias | Bancos / Cuentas Empleados | `/bancos/cuentas-empleados` | Migrado |
| Acreditación Bancaria | Bancos / Lotes de Pago | `/bancos/lotes` | Migrado |
| Historial de Pagos | Bancos / Historial | `/bancos/pagos` | Migrado |
| Expedientes (papel) | Documentos / Expedientes | `/documentos/expedientes` | Digitalizado |
| Constancias Laborales | Documentos / Constancias | `/documentos/constancias` | Digitalizado |

---

## Detalle por módulo

### 1. Fichero de Personal → Gestión de Personas

**Legacy (ANAMNESIS):**
- Tabla: `PERSONAL` (campos: COD_EMP, NOM_EMP, FEC_NAC, CI, TEL, DIR)
- Datos normalizados manualmente en planillas Excel complementarias

**Nuevo:**
- Tabla: `employees` + `employee_profiles`
- API: `GET /api/employees`, `GET /api/employees/:id`
- Campos adicionales: `cost_center_id`, `employee_type_id`, `photo_url`, `contract_type`

**Diferencias clave:**
- El sistema nuevo soporta múltiples contratos por empleado
- Cargos enlazados a tabla `positions` (no texto libre)
- Sucursales enlazadas a tabla `branches`

---

### 2. Cumplimiento MTESS/IPS

**Legacy (ANAMNESIS):**
- Módulo: `MTESS_COMUNICACIONES`
- Términos usados: "Comunicación MTESS", "Enviar comunicación", "Nueva comunicación"
- Flujo: Datos → Generar TXT → Subir portal MTESS manual

**Nuevo (terminología corregida):**
- Términos: "Presentación MTESS/REOP", "Generar presentación", "Registrar envío", "Registrar acuse", "Historial de presentaciones"
- API: `POST /api/compliance/mtess`, `PUT /api/compliance/mtess/:id`
- Estados: `pending` → `generated` → `submitted` → `accepted` / `rejected`

**Mapeo de tipos:**

| Legacy ANAMNESIS | Nuevo sistema | Descripción |
|---|---|---|
| TIPO_ALTA | ALTA | Alta del trabajador |
| TIPO_BAJA | BAJA | Baja del trabajador |
| TIPO_VAC | VACACIONES | Comunicación de vacaciones |
| TIPO_PERM | PERMISO | Permiso laboral |
| TIPO_SUSP | SUSPENSION | Suspensión |
| TIPO_ACC | ACCIDENTE | Accidente laboral |
| TIPO_LIQ | LIQUIDACION | Liquidación mensual |
| TIPO_AGU | AGUINALDO | Aguinaldo |
| TIPO_PLAN | PLANILLA_ANUAL | Planilla anual |
| TIPO_AMON | AMONESTACION | Amonestación |

---

### 3. Nómina

**Legacy (ANAMNESIS):**
- Tabla: `LIQUIDACIONES` + `CONCEPTOS_LIQ`
- Conceptos codificados: HB (Haber Básico), HC (Hora Cátedra), OT (Horas Extra), etc.
- IPS calculado manualmente sobre salario bruto

**Nuevo:**
- Tablas: `payroll_runs`, `payroll_run_items`, `payroll_concepts`
- Cálculo automático IPS: empleado 9%, patronal 16.5% sobre salario imponible
- Integración con MTESS para altas/bajas automáticas

**Parámetros a migrar:**
- Salario Mínimo Legal: configurar en `/nomina/parametros` (campo `minimum_wage`)
- Tasas IPS: `ips_employee_rate` = 0.09, `ips_employer_rate` = 0.165
- Tasa aguinaldo: `aguinaldo_rate` = 0.0833 (1/12 del salario anual)

---

### 4. Relojes ZKTeco

**Legacy (ANAMNESIS):**
- Conexión directa por IP fija (hardcoded en config)
- Descarga manual de marcaciones vía software ZKTeco

**Nuevo:**
- Bridge Node.js en puerto 8081 (API) / 8080 (PUSH ZKTeco)
- Relojes configurables por BD o variable `ZKTECO_DEVICES`
- Auto-sincronización con intervalo configurable `ZKTECO_POLL_INTERVAL`
- Diagnóstico en tiempo real: `/asistencia/relojes/diagnostico`

---

## Datos a migrar en producción

### Script de migración sugerido

Los datos del sistema ANAMNESIS deben exportarse y cargarse en la nueva BD respetando las tablas y llaves foráneas. El proceso sugerido:

1. Exportar desde ANAMNESIS a CSV por módulo
2. Transformar campos con el mapeo de la tabla anterior
3. Cargar en orden: `branches` → `departments` → `positions` → `employees` → `contracts` → `payroll_concepts` → `payroll_runs`
4. Verificar integridad referencial antes de activar en producción

> **Importante:** No eliminar datos del sistema legacy hasta verificar la migración completa con al menos 2 ciclos de nómina.

---

## Notas de compatibilidad

- Los RUC/CI de empleados deben coincidir entre sistemas para el mapeo
- Las cuentas bancarias deben re-registrarse en el nuevo sistema (no se migran por seguridad)
- Las contraseñas de usuarios no se migran — todos deben hacer reset al primer login
