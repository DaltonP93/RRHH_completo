# RBAC / ABAC Multiempresa — SisHoras

Sistema de control de acceso basado en roles (RBAC) con restricciones de alcance por atributo (ABAC) y soporte multiempresa. Implementado en la migración 064 y sembrado en la migración 065.

---

## Tablas del esquema

### `roles`

Catálogo de roles del sistema. 15 roles base sembrados por la migración 065.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | INT PK | Identificador |
| `code` | VARCHAR(80) UNIQUE | Código de rol (usado en `users.role` y en el middleware) |
| `name` | VARCHAR(120) | Nombre legible |
| `description` | TEXT | Descripción del rol |
| `level` | INT | Jerarquía numérica: nivel más bajo = más privilegio |
| `is_system` | TINYINT(1) | 1 = rol protegido de borrado |

**Roles base y jerarquía de nivel:**

| Código | Nombre | Nivel |
|---|---|---|
| `super_admin` | Super Administrador | 1 |
| `platform_admin` | Administrador de Plataforma | 2 |
| `company_admin` | Administrador de Empresa | 10 |
| `hr_admin` | Administrador RRHH | 20 |
| `hr_operator` | Operador RRHH | 25 |
| `payroll_admin` | Administrador Nómina | 30 |
| `payroll_operator` | Operador Nómina | 35 |
| `treasury_admin` | Administrador Tesorería | 40 |
| `compliance_admin` | Administrador Cumplimiento | 45 |
| `document_admin` | Administrador Documentos | 50 |
| `competency_admin` | Administrador Competencias | 55 |
| `supervisor` | Supervisor | 60 |
| `auditor` | Auditor | 90 |
| `readonly` | Solo lectura | 95 |
| `employee` | Empleado | 100 |

---

### `permissions_catalog`

Más de 60 permisos atómicos agrupados por módulo.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | INT PK | Identificador |
| `code` | VARCHAR(120) UNIQUE | Código del permiso (e.g. `payroll.view`) |
| `module_code` | VARCHAR(80) | Módulo dueño del permiso |
| `action` | VARCHAR(80) | Acción: `view`, `create`, `update`, `delete`, `approve`, `export`, etc. |
| `name` | VARCHAR(150) | Nombre legible |
| `is_sensitive` | TINYINT(1) | 1 = permiso sensible (salarios, datos personales) |

**Permisos por módulo:**

| Módulo | Permisos disponibles |
|---|---|
| `personas` | `people.view/create/update/delete/export/import/view_salary/update_salary`, `positions.view/create/update/delete`, `departments.view/create/update/delete` |
| `asistencia` | `attendance.view/create/update/delete/export/approve/sync`, `leaves.view/create/update/delete/approve` |
| `nomina` | `payroll.view/create/update/delete/approve/export/view_payslip` |
| `pagos` | `payments.view/create/approve/export` |
| `documentos` | `documents.view/create/update/delete/sign/export` |
| `competencias` | `competencies.view/create/update/delete/export` |
| `cumplimiento` | `compliance.view/create/update/delete/submit/export` |
| `reportes` | `reports.view/export` |
| `configuracion` | `config.view/update` |
| `seguridad` | `security.view/manage_users/manage_roles/manage_permissions/manage_scopes` |
| `auditoria` | `audit.view/export` |

---

### `role_permissions`

Relación M:N entre roles y permisos.

| Columna | Tipo | Descripción |
|---|---|---|
| `role_id` | INT FK → `roles.id` | Rol |
| `permission_id` | INT FK → `permissions_catalog.id` | Permiso |
| `allowed` | TINYINT(1) | 1 = concedido, 0 = explícitamente denegado |

PK compuesta: `(role_id, permission_id)`.

---

### `user_roles`

Asignación de roles a usuarios, con alcance opcional por empresa y sucursal.

| Columna | Tipo | Descripción |
|---|---|---|
| `user_id` | INT FK → `users.id` | Usuario |
| `role_id` | INT FK → `roles.id` | Rol asignado |
| `company_id` | INT NULL | Si no es NULL, el rol sólo aplica para esa empresa |
| `branch_id` | INT NULL | Si no es NULL, el rol sólo aplica para esa sucursal |

PK compuesta: `(user_id, role_id, company_id, branch_id)`. Un usuario puede tener el mismo rol con distintos alcances de empresa.

---

### `user_scopes`

Define el alcance de visibilidad de datos de un usuario.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | BIGINT PK | Identificador |
| `user_id` | INT FK → `users.id` | Usuario |
| `scope_type` | ENUM | Nivel del alcance — ver valores abajo |
| `company_id` | INT NULL | ID de empresa (para `company` y derivados) |
| `branch_id` | INT NULL | ID de sucursal (para `branch`) |
| `department_id` | INT NULL | ID de departamento (para `department`) |
| `employee_id` | INT NULL | ID de empleado propio (para `own`) |

**Valores de `scope_type`:**

| Valor | Descripción |
|---|---|
| `global` | Ve todos los datos de todas las empresas |
| `company` | Ve sólo los datos de `company_id` |
| `branch` | Ve sólo los datos de `branch_id` |
| `department` | Ve sólo los datos de `department_id` |
| `team` | Ve sólo los datos de su equipo |
| `own` | Ve sólo sus propios datos (`employee_id`) |

---

### `field_permissions`

Permisos a nivel de campo por rol y entidad. Permite ocultar o bloquear campos sensibles (e.g. salario) según rol.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | BIGINT PK | Identificador |
| `role_id` | INT FK → `roles.id` | Rol |
| `entity` | VARCHAR(80) | Entidad (e.g. `employee`, `payslip`) |
| `field_name` | VARCHAR(100) | Nombre del campo (e.g. `salary`, `document_number`) |
| `can_view` | TINYINT(1) | 1 = puede ver el campo |
| `can_update` | TINYINT(1) | 1 = puede editar el campo |

UNIQUE KEY en `(role_id, entity, field_name)`.

---

## Middleware — `api/src/middleware/permissions.js`

### `requirePermission(permCode)`

Middleware de ruta. Bloquea con HTTP 403 si el usuario no tiene el permiso indicado.

```js
const { requirePermission } = require('../middleware/permissions');

// Proteger un endpoint de nómina
router.get('/payroll', authenticate, requirePermission('payroll.view'), async (req, res) => {
  // ...
});
```

Comportamiento:
- Sin usuario autenticado → 401.
- `req.user.role === 'super_admin'` → pasa siempre (bypass total).
- Consulta `user_roles` → `role_permissions` → `permissions_catalog` para obtener el conjunto de permisos del usuario.
- Si el conjunto contiene `permCode` → pasa; sino → 403.
- En caso de error de base de datos, falla abierto (`next()`) para no bloquear usuarios.

### `requireAnyPermission(permCodes[])`

Igual que `requirePermission` pero acepta un array; pasa si el usuario tiene al menos uno.

```js
router.get('/reports', authenticate, requireAnyPermission(['reports.view', 'reports.export']), handler);
```

### `requireScope({ scope })`

Verifica que el usuario tenga un `user_scopes.scope_type` igual al requerido o `global`.

```js
router.get('/companies', authenticate, requireScope({ scope: 'global' }), handler);
```

### `filterByUserScope(req, baseWhere)`

Función helper (no middleware). Devuelve un objeto `where` de Sequelize enriquecido con los filtros de alcance del usuario. Usado en controladores para limitar resultados de listados.

```js
const where = await filterByUserScope(req, { status: 'active' });
const employees = await Employee.findAll({ where });
```

El `scope_type` se resuelve por prioridad: `global > company > branch > department > team > own`.

### `canAccessEmployee(user, employeeId)`

Función helper asíncrona. Devuelve `true` si el usuario tiene acceso al empleado indicado según su alcance. Combina `user_scopes` con los campos `company_id`, `branch_id`, `department_id` del empleado.

```js
if (!(await canAccessEmployee(req.user, req.params.id))) {
  return res.status(403).json({ error: 'Sin acceso a este empleado' });
}
```

### `canViewField(user, entity, fieldName)`

Función helper asíncrona. Consulta `field_permissions` para saber si el usuario puede ver un campo sensible de una entidad.

```js
const showSalary = await canViewField(req.user, 'employee', 'salary');
if (!showSalary) delete employee.salary;
```

---

## Cache de permisos

Los permisos de cada usuario se cachean en memoria con un TTL de 60 segundos.

```js
const _permCache = new Map(); // userId → { perms: Set<string>, expires: number }
```

- **TTL:** 60,000 ms (60 segundos).
- **Invalidación:** llamar a `clearPermCache(userId)` después de cambiar roles o permisos de un usuario. Llamar a `clearPermCache()` (sin argumento) para limpiar todo el cache.
- **Cuándo invalidar:** en los endpoints `assign-role`, `remove-role` y `set-scope` de `/api/user-scopes/*` ya se llama automáticamente.

---

## Comportamiento especial por rol

### `super_admin`

Bypass total en todos los middlewares de permisos y alcance. No consulta la base de datos de permisos. Se verifica con `req.user.role === 'super_admin'` en cada función de middleware.

La migración 065 promueve al usuario `admin` a `super_admin`, le asigna el rol en `user_roles` con `company_id = NULL, branch_id = NULL` (alcance global), y le asigna todos los permisos del catálogo.

### `company_admin`

Alcance limitado a su `company_id`. El middleware `filterByUserScope` agrega automáticamente `{ company_id: scope.company_id }` a todas las consultas cuando el `scope_type` es `company`.

### `employee`

`scope_type = 'own'`. Solo ve sus propios datos. `canAccessEmployee` devuelve `true` únicamente cuando `scope.employee_id === employeeId`.

---

## Cómo proteger un endpoint

```js
const { authenticate, authorize } = require('../middleware/auth');
const { requirePermission, requireAnyPermission } = require('../middleware/permissions');

// Solo usuarios con payroll.view (super_admin pasa siempre)
router.get('/payroll', authenticate, requirePermission('payroll.view'), handler);

// Cualquiera que pueda ver O exportar reportes
router.get('/reports', authenticate, requireAnyPermission(['reports.view', 'reports.export']), handler);

// Solo super_admin o admin (usando authorize del middleware de auth)
router.post('/critical', authenticate, authorize('super_admin', 'admin'), handler);
```

---

## Cómo asignar roles vía API

**Endpoint:** `POST /api/user-scopes/assign-role`

Requiere autenticación con rol `super_admin` o `admin`.

```bash
curl -X POST http://localhost:4000/api/user-scopes/assign-role \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 42,
    "role_code": "hr_admin",
    "company_id": 1,
    "branch_id": null
  }'
```

Respuesta exitosa (201):
```json
{ "message": "Rol asignado", "user_id": 42, "role_code": "hr_admin", "role_id": 3 }
```

Para remover un rol: `DELETE /api/user-scopes/remove-role` con `{ "user_id": 42, "role_id": 3 }`.

Para establecer alcance: `POST /api/user-scopes/set-scope` con `{ "user_id": 42, "scope_type": "company", "company_id": 1 }`.

---

## Cómo ver los permisos efectivos de un usuario

**Endpoint:** `GET /api/user-scopes/:user_id/effective-permissions`

```bash
curl http://localhost:4000/api/user-scopes/42/effective-permissions \
  -H "Authorization: Bearer $TOKEN"
```

Respuesta:
```json
{
  "user": { "id": 42, "username": "jperez", "role": "hr_admin" },
  "effective_permissions": [
    { "id": 1, "code": "people.view", "name": "Ver empleados", "role_code": "hr_admin", "role_name": "Administrador RRHH" },
    ...
  ],
  "scopes": [
    { "id": 5, "scope_type": "company", "company_id": 1, "branch_id": null }
  ],
  "permission_codes": ["people.view", "people.create", ...]
}
```

Para `super_admin`, `effective_permissions` contiene todos los permisos del catálogo con `"source": "super_admin_bypass"`.

---

## Consultar roles y alcances de un usuario

**Endpoint:** `GET /api/user-scopes?user_id=42`

Devuelve el usuario, sus roles asignados (con `company_id` y `branch_id` de asignación) y sus alcances.
