# UX Modular Portal — SisHoras

## Overview

After login, the root page (`/`) redirects to `/dashboard` if a valid `access_token` is present in `localStorage`, or to `/login` otherwise. The portal model described here is based on the `module_catalog` table seeded in migration 064, which defines 11 modules shown as cards. The intent is to evolve `/dashboard` into a portal landing page where admin users see module cards instead of a flat sidebar.

Current state: the global `Sidebar` component is still the primary navigation for all non-employee roles. The portal module cards are seeded in the database and drive contextual sidebar items via `module_menu_items`, but a dedicated `/portal` page backed by those cards is the target UX.

---

## Module Card Anatomy

Each card in the portal page maps to one row in `module_catalog` and exposes:

| Field | Purpose |
|---|---|
| `icon` | Lucide icon name (e.g. `Users`, `Clock`, `DollarSign`) |
| `name` | Display name shown as the card title |
| `description` | Short sentence shown below the title |
| `status` | Badge variant — see Status System section |
| `sort_order` | Integer controlling card order on the portal grid |
| `requires_permission` | Permission code (`permissions_catalog.code`); if set, hide the card from users who lack it |
| `route` | Next.js href the card navigates to on click |

---

## All 11 Modules

| # | `code` | Name | Route | Description |
|---|---|---|---|---|
| 1 | `personas` | Personas | `/empleados` | Gestión de empleados, cargos y departamentos |
| 2 | `asistencia` | Asistencia | `/asistencia` | Control de marcaciones, horarios y permisos |
| 3 | `nomina` | Nómina | `/nomina` | Liquidaciones, conceptos salariales y aguinaldo |
| 4 | `pagos` | Pagos | `/bancos` | Gestión bancaria y exportación de lotes de pago |
| 5 | `documentos` | Documentos | `/documentos` | Firma digital y gestión documental |
| 6 | `competencias` | Competencias | `/competencias` | Evaluación por competencias y planes de desarrollo |
| 7 | `cumplimiento` | Cumplimiento | `/cumplimiento` | Comunicaciones MTESS, IPS y planillas laborales |
| 8 | `reportes` | Reportes | `/reportes` | Reportes de asistencia, nómina y exportaciones |
| 9 | `configuracion` | Configuración | `/configuracion` | Configuración general del sistema y empresa |
| 10 | `seguridad` | Seguridad | `/seguridad/roles` | Usuarios, roles, permisos y alcances |
| 11 | `auditoria` | Auditoría | `/auditoria` | Registro de eventos y trazabilidad |

---

## ModuleSidebar.tsx

`ModuleSidebar` is the contextual sidebar variant intended for use inside individual module layouts. It is not yet created as a standalone component — the items it would display live in the `module_menu_items` table, seeded by migration 065.

**Planned contract:**

```tsx
// Accepts a single prop that scopes the nav items to one module
<ModuleSidebar moduleKey="asistencia" />
```

**How it works:**

1. On mount, it queries `GET /api/modules/:moduleKey/menu-items` (or reads a pre-fetched prop).
2. The API returns rows from `module_menu_items WHERE module_code = moduleKey AND is_active = 1 ORDER BY sort_order`.
3. Each item renders as a `Link` showing `icon` + `label`, activating when `pathname === route`.
4. Items with `requires_permission` set are filtered the same way the global Sidebar filters by `module.can_view`.
5. The component accepts an optional `theme` object (same shape as `SidebarSettings` in `Sidebar.tsx`) for consistent branding.

**Pre-seeded menu items by module (from migration 065):**

- `personas`: Dashboard Personas, Empleados, Cargos, Departamentos, Sucursales
- `asistencia`: Dashboard Asistencia, Marcaciones, Tiempo Real, Importación att2000, Horarios, Permisos, Aprobaciones, Banco de Horas
- `nomina`: Dashboard Nómina, Liquidaciones, Conceptos Salariales, Aguinaldo, Vacaciones Pagadas, Anticipos
- `pagos`: Dashboard Pagos, Bancos
- `documentos`: Documentos, Plantillas
- `seguridad`: Usuarios, Roles, Permisos, Alcances
- `auditoria`: Auditoría

---

## How to Add a New Module

**Step 1 — Add to `module_catalog`**

Insert a new row in the database (or add to a migration):

```sql
INSERT INTO module_catalog (code, name, description, icon, route, sort_order, status, requires_permission)
VALUES ('mi_modulo', 'Mi Módulo', 'Descripción breve', 'Layers', '/mi-modulo', 12, 'available', 'mi_modulo.view');
```

**Step 2 — Add menu items to `module_menu_items`**

```sql
INSERT INTO module_menu_items (module_code, label, route, icon, sort_order)
VALUES
  ('mi_modulo', 'Inicio', '/mi-modulo',         'LayoutDashboard', 1),
  ('mi_modulo', 'Listado', '/mi-modulo/listado', 'List',            2);
```

**Step 3 — Add to `MODULE_ITEMS` in `ModuleSidebar.tsx`**

Once `ModuleSidebar.tsx` is created, add a static fallback entry so the component works without a DB call:

```ts
const MODULE_ITEMS: Record<string, NavItem[]> = {
  // ... existing modules
  mi_modulo: [
    { href: '/mi-modulo',          label: 'Inicio',  icon: LayoutDashboard },
    { href: '/mi-modulo/listado',  label: 'Listado', icon: List },
  ],
}
```

**Step 4 — Add to `MODULES` in the portal page**

In the portal landing page component, add the module to the `MODULES` array so a card renders:

```ts
{ code: 'mi_modulo', icon: Layers, name: 'Mi Módulo', description: 'Descripción breve',
  route: '/mi-modulo', status: 'available', permission: 'mi_modulo.view' }
```

**Step 5 — Add the permission to `permissions_catalog`** (migration or seed):

```sql
INSERT INTO permissions_catalog (code, module_code, action, name)
VALUES ('mi_modulo.view', 'mi_modulo', 'view', 'Ver Mi Módulo');
```

---

## Status System

The `status` column in `module_catalog` controls the badge and interaction state of each module card.

| Value | Badge color | Meaning |
|---|---|---|
| `available` | Green | Module is fully functional |
| `in_progress` | Yellow / amber | Under active development; basic UI exists |
| `pending_migration` | Blue | Waiting for data migration from legacy system |
| `requires_permissions` | Orange | Visible only to users with the required permission |
| `error` | Red | Module has a runtime error or failed health check |
| `disabled` | Gray | Hidden or locked; not accessible to any user |

Cards with status `disabled` should be hidden from all users. Cards with `requires_permissions` are filtered on the frontend by checking the user's `effective_permissions` against the `requires_permission` field.

---

## i18n

The `I18nProvider` (`web/src/i18n/I18nProvider.tsx`) supports three locales: `es` (default), `en`, `pt`. Locale files live at `web/src/i18n/locales/{es,en,pt}.json`.

**Navigation keys used in `Sidebar.tsx`** (`nav.*` namespace):

```
nav.dashboard          nav.employees         nav.attendance
nav.attendance_live    nav.permissions        nav.approvals
nav.my_team            nav.reports            nav.executive
nav.payroll            nav.payroll_hub        nav.calendar
nav.vacations          nav.overtime_bank      nav.announcements
nav.training           nav.surveys            nav.appraisals
nav.onboarding         nav.companies          nav.positions
nav.settlements        nav.salary_concepts    nav.aguinaldo
nav.advances           nav.banks_payments     nav.compliance
nav.document_mgmt      nav.competencies       nav.dev_plans
nav.departments        nav.users              nav.audit
nav.settings           nav.system             nav.system_health
nav.sync_att2000       nav.notifications_config nav.security_advanced
nav.my_profile         nav.my_attendance      nav.my_permissions
nav.punch_qr_gps       nav.security           nav.my_notifications
nav.logout
nav.section_portal     nav.section_management nav.section_admin
```

**Keys present in `es.json` and `en.json`:** `dashboard`, `employees`, `attendance`, `permissions`, `approvals`, `my_team`, `reports`, `executive`, `payroll`, `calendar`, `vacations`, `custom_reports`, `overtime_bank`, `announcements`, `training`, `surveys`, `appraisals`, `onboarding`, `departments`, `users`, `audit`, `settings`, `system`, `system_health`, `backups`, `my_profile`, `my_attendance`, `my_permissions`, `punch_qr_gps`, `security`, `logout`, `section_portal`, `section_management`, `section_admin`, `attendance_live`, `sync_att2000`.

**Keys missing from locale files** (used in Sidebar but not defined in `es.json`/`en.json`): `companies`, `positions`, `payroll_hub`, `settlements`, `salary_concepts`, `aguinaldo`, `advances`, `banks_payments`, `compliance`, `document_mgmt`, `competencies`, `dev_plans`, `notifications_config`, `security_advanced`, `my_notifications`.

**Fallback behavior** (implemented in `I18nProvider.t()`):

1. Look up key in the current locale dictionary.
2. If not found, fall back to the `es` (default) dictionary.
3. If still not found, return the raw key string (e.g. `nav.companies` renders as-is).

This means missing keys are visible as raw strings in the UI until the locale files are updated. To fix, add the missing keys to all three locale JSON files.

---

## Layout

`AppLayout` (`web/src/app/(app)/layout.tsx`) wraps every page under `(app)/` with the global `Sidebar`, `TopBar`, `DeviceAlertBanner`, `MobileBottomNav`, and `HelpButton`.

```tsx
// web/src/app/(app)/layout.tsx
export default function AppLayout({ children }) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />           {/* global sidebar — backward compat */}
      <main className="flex-1 overflow-auto flex flex-col pb-20 md:pb-0">
        <TopBar />
        <div className="flex-1">{children}</div>
      </main>
      <DeviceAlertBanner />
      <MobileBottomNav />
      <HelpButton />
    </div>
  )
}
```

Modules that want a contextual `ModuleSidebar` instead of the global one can opt in by:
1. Creating a nested `layout.tsx` within their route segment (e.g. `(app)/asistencia/layout.tsx`).
2. Rendering `<ModuleSidebar moduleKey="asistencia" />` in place of (or alongside) `{children}`.
3. Wrapping in a `flex` container so the module sidebar sits to the left of the page content.

The global `Sidebar` remains active for backward compatibility; modules using `ModuleSidebar` should hide the global sidebar via a CSS class or a context flag to avoid double navigation.
