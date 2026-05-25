# Design System — Enterprise RRHH Paraguay

## Concepto

Sistema visual corporativo para operadores de RRHH, administración y gerencia. Estilo ERP/SaaS denso e informativo, similar a BambooHR, Workday o SAP SuccessFactors. No es landing page ni dashboard de marketing — es herramienta de trabajo diaria.

---

## Design Tokens (`globals.css`)

### Colores

| Variable | Valor | Uso |
|---|---|---|
| `--background` | `#f1f5f9` (slate-100) | Fondo de página |
| `--surface-0` | `#f1f5f9` | Fondo de página |
| `--surface-1` | `#ffffff` | Cards/paneles |
| `--surface-2` | `#f8fafc` | Filas hover/alternadas |
| `--border-subtle` | `#e2e8f0` (slate-200) | Bordes de cards |
| `--border-strong` | `#cbd5e1` (slate-300) | Bordes destacados |
| `--accent` | `#1e293b` (slate-800) | Botón primario |
| `--accent-hover` | `#0f172a` (slate-900) | Hover primario |
| `--accent-muted` | `#64748b` (slate-500) | Texto secundario |
| `--status-ok` | `#059669` | Estado ok/activo |
| `--status-warn` | `#d97706` | Advertencia |
| `--status-error` | `#dc2626` | Error/rechazo |
| `--status-info` | `#2563eb` | Información |
| `--status-neutral` | `#64748b` | Neutro |

### Tipografía

- **Display/Títulos**: sistema (sin webfont externa — no agrega bundle)
- **Datos/Números**: `JetBrains Mono` → `Fira Mono` → `ui-monospace` (fallback, siempre disponible)
- **Tamaños compactos**: `text-xs` (12px) para datos, `text-[10px]`/`text-[11px]` para labels
- **Tabular numbers**: `font-feature-settings: 'tnum' 1` en body — alineación de columnas numéricas

---

## Espaciado (escala compacta ERP)

| Token | Valor | Clase Tailwind equivalente |
|---|---|---|
| `--space-page` | `1.25rem` | `p-5` |
| `--space-section` | `1rem` | `gap-4` |
| `--space-card` | `0.75rem` | `p-3` |

Regla general: usar **`p-3`** en interior de cards, **`p-5`** como padding de página, **`gap-3`** entre elementos del grid.

---

## Componentes del sistema

### `StatusBadge` (`components/ui/StatusBadge.tsx`)

Badge de estado consistente para toda la app.

```tsx
<StatusBadge status="pending" />
<StatusBadge status="accepted" showIcon />
<StatusBadge status="submitted" label="Presentado" size="sm" />
```

**Estados soportados:** `active`, `inactive`, `pending`, `approved`, `rejected`, `error`, `draft`, `generated`, `submitted`, `accepted`, `observed`, `corrected`, `archived`, `available`, `in_progress`, `pending_migration`, `disabled`

---

### `EmptyState` (`components/ui/EmptyState.tsx`)

Estado vacío empresarial. No pantallas en blanco.

```tsx
<EmptyState
  icon={FileText}
  title="No hay presentaciones MTESS"
  description="Generá una nueva presentación o importá un acuse existente."
  action={{ label: 'Generar presentación', onClick: () => {} }}
  secondaryAction={{ label: 'Ver historial', onClick: () => {} }}
/>
```

---

### `EnterprisePageHeader` (`components/ui/EnterprisePageHeader.tsx`)

Header compacto de página con breadcrumb y acciones.

```tsx
<EnterprisePageHeader
  icon={Shield}
  iconColor="bg-red-600"
  title="MTESS / REOP"
  subtitle="Presentaciones ante el Ministerio de Trabajo"
  breadcrumbs={[
    { label: 'Portal', href: '/portal' },
    { label: 'Cumplimiento', href: '/cumplimiento' },
    { label: 'MTESS/REOP' },
  ]}
  actions={<button className="ent-btn"><Plus size={13} /> Nueva presentación</button>}
/>
```

---

### `DataToolbar` (`components/ui/DataToolbar.tsx`)

Barra de herramientas para tablas: búsqueda, filtros, exportar.

```tsx
<DataToolbar
  onSearch={q => setFilter(q)}
  searchPlaceholder="Buscar empleado..."
  onRefresh={loadData}
  onExport={exportCsv}
  count={items.length}
  countLabel="presentaciones"
  filters={
    <select className="ent-input">
      <option>Todos los estados</option>
    </select>
  }
/>
```

---

### `MetricStrip` (`components/ui/MetricStrip.tsx`)

Fila de KPIs compacta (4 columnas).

```tsx
<MetricStrip metrics={[
  { label: 'Empleados', value: '247', icon: Users, iconColor: 'bg-blue-600' },
  { label: 'Presentes hoy', value: '198', icon: Clock, iconColor: 'bg-emerald-600', trend: 'up', trendValue: '+3%' },
  { label: 'Ausentes', value: '12', icon: AlertCircle, iconColor: 'bg-red-500', trend: 'down' },
  { label: 'Pendientes', value: '5', icon: Bell, iconColor: 'bg-orange-500' },
]} />
```

---

### `SectionPanel` (`components/ui/SectionPanel.tsx`)

Card/panel con header opcional.

```tsx
<SectionPanel title="Historial de liquidaciones" actions={<button>Ver todo</button>}>
  <table>...</table>
</SectionPanel>
```

---

### `Skeleton` / `SkeletonTable` / `SkeletonCard` (`components/ui/Skeleton.tsx`)

```tsx
import { SkeletonTable } from '@/components/ui/Skeleton'
{loading ? <SkeletonTable rows={5} cols={4} /> : <table>...</table>}
```

---

## Clases CSS utilitarias

| Clase | Descripción |
|---|---|
| `.ent-page` | Padding de página + max-width |
| `.ent-table th/td` | Estilos compactos de tabla |
| `.ent-input` | Input compacto enterprise |
| `.ent-btn` | Botón primario (slate-800) |
| `.ent-btn-ghost` | Botón secundario (borde) |
| `.ent-btn-danger` | Botón destructivo (red-600) |

---

## Animaciones

| Clase | Efecto | Duración |
|---|---|---|
| `.slide-in` | Entrada desde arriba | 200ms |
| `.fade-in` | Fade in | 250ms |
| `.slide-in-right` | Entrada desde derecha | 200ms |
| `.stagger-in > *` | Hijos con delay escalonado | 40ms por hijo |
| `.card-lift` | Elevación hover sutil | 150ms |
| `.pulse-live` | Pulso para indicadores live | 1.5s infinito |
| `.skeleton-shimmer` | Shimmer en skeletons | 1.5s infinito |

---

## Portal ERP

El portal (`/portal`) sigue el patrón:

1. **Top bar**: nombre del usuario, fecha/hora, estado del sistema (API, Relojes, BD)
2. **KPI strip**: 4 métricas clave (empleados, marcaciones hoy, aprobaciones, incidencias)
3. **Grid de módulos (4 col)**: tarjetas compactas con icono, nombre corto, descripción, links rápidos
4. **Accesos frecuentes**: 12 shortcuts a rutas de uso diario
5. **Panel derecho**: pendientes + alertas + calendario de vencimientos

---

## Sidebar contextual

`ModuleSidebar` muestra navegación específica del módulo activo. Características:

- Ancho: `w-52` (208px) — compacto
- Border izquierda activa: `border-l-2 border-slate-700`
- Tamaño de texto: `text-[12px]` — denso
- Icono activo: toma el color del módulo
- Overflow-y auto — no se cortan ítems en pantallas chicas

---

## Reglas de estilo

1. **Sin tarjetas gigantes** — padding máximo `p-4`, nunca `p-8` en cards operativas
2. **Sin gradientes de fondo** — solo en headers de módulos (strip de color)
3. **Sin emojis** — usar iconos Lucide
4. **Sin fuentes externas** — JetBrains Mono es fallback de sistema
5. **Tablas compactas** — `text-xs`, `py-2.5`, sin `py-4` salvo en páginas de detalle
6. **Empty states descriptivos** — siempre explicar qué hacer, no solo "sin datos"
7. **Colores consistentes** — cada módulo tiene su color y no lo comparte
8. **Botones primarios**: siempre `bg-slate-800` (no azul genérico)
