# Auditoría UX/Negocio — Sistema RRHH Paraguay

**Fecha:** Mayo 2026  
**Alcance:** Módulos de gestión de personas, nómina, cumplimiento legal, bancos, documentos, competencias, seguridad y configuración.

---

## 1. Resumen ejecutivo

El sistema RRHH fue diseñado para cumplir con la normativa laboral paraguaya (MTESS, IPS, Código Laboral Ley 213/93 y sus modificaciones). Esta auditoría identifica brechas UX, inconsistencias terminológicas y mejoras de experiencia de usuario para el perfil de operadores RRHH en Paraguay.

---

## 2. Módulos auditados

| Módulo | Ruta principal | Estado |
|---|---|---|
| Portal | `/portal` | Funcional |
| Gestión de Personas | `/empleados` | Funcional |
| Legajos | `/personas/legajos` | Implementado |
| Contratos | `/personas/contratos` | Implementado |
| Familiares | `/personas/familiares` | Implementado |
| Asistencia | `/asistencia` | Funcional |
| Nómina | `/nomina` | Funcional |
| Preavisos | `/nomina/preavisos` | Implementado |
| Premios y Bonos | `/nomina/premios` | Implementado |
| Retenciones Judiciales | `/nomina/retenciones` | Implementado |
| Cumplimiento Legal | `/cumplimiento` | Funcional |
| MTESS/REOP | `/cumplimiento/mtess` | Implementado |
| IPS/REI | `/cumplimiento/ips` | Implementado |
| Bancos | `/bancos` | Funcional |
| Lotes de Pago | `/bancos/lotes` | Implementado |
| Cuentas Empleados | `/bancos/cuentas-empleados` | Implementado |
| Documentos | `/documentos` | Funcional |
| Competencias | `/competencias` | Funcional |
| Seguridad | `/seguridad/roles` | Funcional |
| Auditoría | `/auditoria` | Funcional |
| Configuración | `/configuracion` | Funcional |

---

## 3. Hallazgos por módulo

### 3.1 Terminología MTESS — CRÍTICO (resuelto)

**Problema:** El sistema usaba el término "Nueva Comunicación MTESS" que corresponde al vocabulario del portal MTESS web, no al proceso interno de RRHH. En Paraguay, el proceso interno se denomina "presentación".

**Corrección aplicada:**
- "Nueva Comunicación" → "Nueva presentación"
- "Registrar" (en modal) → "Registrar envío"
- Título del modal → "Nueva presentación MTESS / REOP"

**Fundamento normativo:** La Resolución MTESS N° 467/2024 refiere al proceso como "presentación de comunicaciones" ante el Ministerio, no como "comunicación" per se.

---

### 3.2 Sidebar — Expansión de menús

**Problema:** Los módulos tenían menús truncados sin mostrar submódulos clave. El operador RRHH debía navegar sin guía visual.

**Mejoras aplicadas:**
- Personas: agregados Legajos, Contratos, Familiares, Formación/Títulos, Histórico Salarial
- Nómina: agregados Conceptos Fijos, Parámetros Mensuales, Tipos de Nómina, Preavisos, Premios, Retenciones Judiciales, Liquidación de Salida
- Pagos: agregados Cuentas Empleados, Lotes de Pago, Historial de Pagos, Exportación Bancaria
- Cumplimiento: agregados MTESS/REOP, IPS/REI, Planillas Laborales, Altas y Bajas, Exportaciones, Acuses, Calendario
- Competencias: agregados Matriz, Categorías, Niveles, Ciclos de Desempeño, Capacitación, Catálogo de Cursos
- Seguridad: agregados Sesiones Activas, Auditoría de Accesos
- Configuración: agregados Empresas, Parámetros Generales, Bancos y Entidades

---

### 3.3 Errores 404/500 en módulos avanzados

**Problema (resuelto en PR anterior):** Los endpoints sin tabla propia devolvían 500 o eran capturados por wildcards `/:id` de otros routers.

**Solución:** Stubs explícitos registrados ANTES de los routers con wildcards, con fallback `[]` si la tabla no existe aún.

---

### 3.4 Estados vacíos — Mejora UX

**Problema:** Páginas nuevas sin datos mostraban pantallas en blanco o spinner infinito.

**Criterio aplicado:** Cada módulo muestra un mensaje descriptivo en el idioma del negocio, explicando por qué no hay datos y qué acción tomar.

Ejemplos:
- Preavisos: "No hay preavisos registrados. Se registran al iniciar un proceso de desvinculación."
- Lotes de pago: "No hay lotes generados. Los lotes se crean a partir de liquidaciones aprobadas."
- IPS: "Los aportes se calculan al aprobar una liquidación."

---

### 3.5 Español — Correcciones de registro formal

| Incorrecto | Correcto | Fundamento |
|---|---|---|
| "Nueva Comunicación" | "Nueva presentación" | Vocabulario MTESS PY |
| "Comunicación MTESS" | "Presentación MTESS/REOP" | Nombre oficial del formulario |
| "Registrar" (acción principal) | "Registrar envío" | Claridad de acción |
| "Empleados / Cargos" como único menú | Full tree con legajos, contratos | Cobertura funcional |

---

## 4. Reglas de negocio verificadas

### 4.1 Cálculo IPS (Ley 98/92)
- Aporte obrero: 9% del salario imponible
- Aporte patronal: 16.5% del salario imponible
- Total: 25.5%
- El sistema muestra estos porcentajes en el módulo IPS/REI como recordatorio operativo

### 4.2 Aguinaldo (Art. 243-244 Código Laboral)
- Pago proporcional al tiempo trabajado en el año
- Equivale a 1/12 del total de salarios del año
- Tasa configurada: `aguinaldo_rate = 0.0833`

### 4.3 Preaviso de desvinculación (Art. 84 Código Laboral)
- Hasta 1 año: 30 días
- 1 a 5 años: 45 días
- Más de 5 años: 60 días
- El módulo `/nomina/preavisos` registra estos plazos y genera alerta de vencimiento

### 4.4 Comunicaciones MTESS obligatorias
Las presentaciones obligatorias según reglamentación son:
- Alta de trabajador (dentro de 30 días del inicio)
- Baja de trabajador (dentro de 30 días)
- Vacaciones (antes del inicio)
- Suspensión temporal
- Accidente laboral
- Planilla anual de salarios (enero de cada año)

---

## 5. Recomendaciones pendientes

| Prioridad | Mejora | Módulo |
|---|---|---|
| Alta | Validación RUC/CI en formularios de empleados | Personas |
| Alta | Exportación XML/TXT para carga masiva en portal MTESS | Cumplimiento |
| Media | Notificaciones automáticas por vencimiento MTESS | Cumplimiento / Notificaciones |
| Media | Integración directa con portal web del MTESS (API pública si disponible) | Cumplimiento |
| Media | Dashboard de compliance con semáforo de estado | Cumplimiento |
| Baja | Firma digital de documentos laborales (ley de firma electrónica PY) | Documentos |
| Baja | Portal del empleado para autogestión de constancias | Portal |

---

## 6. Criterios de aceptación E2E

Para que un módulo se considere operativo, debe cumplir:
1. Cargar sin error HTTP 500/502/503
2. No mostrar overlay "Application error" ni "Unhandled Runtime Error" de Next.js
3. Mostrar estado vacío descriptivo si no hay datos (no pantalla en blanco)
4. Botones de acción visibles aunque no haya datos
5. Sidebar correctamente resaltando la sección activa

---

## 7. Cobertura de tests E2E

Los tests Playwright cubren:
- Navegación a todos los módulos sin crash (`10-advanced-modules-no-crash.spec.ts`)
- Endpoints API críticos devuelven non-500 (`11-new-module-routes.spec.ts`)
- Autenticación y flujos de login
- Roles y permisos básicos
