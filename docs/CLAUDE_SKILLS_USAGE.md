# Claude Code Skills — RRHH_completo

Referencia de las skills instaladas en este proyecto, cuándo usar cada una y cómo invocarlas.

---

## Skills instaladas

Las skills viven en `.claude/skills/` y están registradas en `skills-lock.json`.

| Skill | Fuente | Comando |
|---|---|---|
| `frontend-design` | `anthropics/skills` | `/frontend-design` |
| `hyperframes` | `heygen-com/hyperframes` | `/hyperframes` |
| `tailwind` | `heygen-com/hyperframes` | `/tailwind` |
| `css-animations` | `heygen-com/hyperframes` | `/css-animations` |
| `gsap` | `heygen-com/hyperframes` | `/gsap` |
| `animejs` | `heygen-com/hyperframes` | `/animejs` |
| `lottie` | `heygen-com/hyperframes` | `/lottie` |
| `waapi` | `heygen-com/hyperframes` | `/waapi` |
| `three` | `heygen-com/hyperframes` | `/three` |
| `typegpu` | `heygen-com/hyperframes` | `/typegpu` |
| `hyperframes-cli` | `heygen-com/hyperframes` | `/hyperframes-cli` |
| `hyperframes-media` | `heygen-com/hyperframes` | `/hyperframes-media` |
| `hyperframes-registry` | `heygen-com/hyperframes` | `/hyperframes-registry` |
| `remotion-to-hyperframes` | `heygen-com/hyperframes` | `/remotion-to-hyperframes` |
| `website-to-hyperframes` | `heygen-com/hyperframes` | `/website-to-hyperframes` |
| `contribute-catalog` | `heygen-com/hyperframes` | `/contribute-catalog` |
| `claude-settings-audit` | `getsentry/skills` | `/claude-settings-audit` |
| `whatsapp-automation` | `claude-office-skills/skills` | `/whatsapp-automation` |
| `skill-development` | `anthropics/claude-code` | `/skill-development` |
| `plugin-structure` | `anthropics/claude-code` | `/plugin-structure` |

---

## Comandos de instalación usados

```bash
# frontend-design
claude skills add anthropics/skills/skills/frontend-design

# hyperframes + todas las skills del ecosistema
claude skills add heygen-com/hyperframes/skills/hyperframes
claude skills add heygen-com/hyperframes/skills/tailwind
claude skills add heygen-com/hyperframes/skills/css-animations
claude skills add heygen-com/hyperframes/skills/gsap
claude skills add heygen-com/hyperframes/skills/animejs
claude skills add heygen-com/hyperframes/skills/lottie
claude skills add heygen-com/hyperframes/skills/waapi
claude skills add heygen-com/hyperframes/skills/three
claude skills add heygen-com/hyperframes/skills/typegpu
claude skills add heygen-com/hyperframes/skills/hyperframes-cli
claude skills add heygen-com/hyperframes/skills/hyperframes-media
claude skills add heygen-com/hyperframes/skills/hyperframes-registry
claude skills add heygen-com/hyperframes/skills/remotion-to-hyperframes
claude skills add heygen-com/hyperframes/skills/website-to-hyperframes
claude skills add heygen-com/hyperframes/skills/contribute-catalog

# claude-settings-audit
claude skills add getsentry/skills/skills/claude-settings-audit

# whatsapp-automation
claude skills add claude-office-skills/skills/whatsapp-automation

# skill-development + plugin-structure
claude skills add anthropics/claude-code/plugins/plugin-dev/skills/skill-development
claude skills add anthropics/claude-code/plugins/plugin-dev/skills/plugin-structure
```

---

## Cuándo usar cada skill

### `/frontend-design`
Usar cuando se pida rediseñar, crear o mejorar cualquier página o componente visual.  
Provee: guía de jerarquía visual, accesibilidad, tipografía, espaciado y patrones ERP.

**Trigger:** "rediseña la página X", "mejora el layout de Y", "crea un componente Z"

### `/hyperframes`
Usar junto con `frontend-design` para definir la estructura de componentes React/Next.js.  
Provee: composición de layouts, slots, props, skeleton, estados vacíos.

**Trigger:** toda tarea UI que involucre más de un componente nuevo.

### `/tailwind`
Usar para aplicar clases Tailwind correctamente, mantener el tema y evitar conflictos.  
Provee: convenciones de clases, tema extendido, responsive patterns.

**Trigger:** siempre que se escriban clases Tailwind en JSX/TSX.

### `/css-animations`
Usar para transiciones, hover states, skeleton loaders, feedback de estado.  
Provee: `transition-*`, `animate-*`, `@keyframes` declarativos sin JS.

**Trigger:** "agrega una animación a X", "suaviza la transición", "skeleton loader"

### `/gsap`
Usar **solo** cuando CSS no alcance: secuencias complejas, timeline de pasos, drag & drop animado.  
Regla en este proyecto: animaciones sobrias, máximo 300ms, sin efectos llamativos.

**Trigger:** "timeline animado", "secuencia de pasos visual", "microinteracción compleja"

### `/animejs`, `/waapi`, `/lottie`
Alternativas a GSAP para casos específicos:
- `animejs`: animaciones JS ligeras sin dependencia de GSAP
- `waapi`: Web Animations API nativa del browser
- `lottie`: reproducir archivos `.json` de After Effects

### `/three`, `/typegpu`
Para visualizaciones 3D o cálculos GPU. No aplica en este proyecto actualmente.

### `/hyperframes-cli`, `/hyperframes-media`, `/hyperframes-registry`, `/remotion-to-hyperframes`, `/website-to-hyperframes`, `/contribute-catalog`
Skills del ecosistema Hyperframes para operaciones CLI, exportación de media y catálogo de componentes.

### `/claude-settings-audit`
Usar para revisar el estado de `.claude/settings.local.json`, permisos, hooks y configuración de Claude Code en el proyecto.

**Trigger:** "audita la configuración de Claude", "revisa los permisos", "¿qué hooks hay activos?"

### `/whatsapp-automation`
Usar para tareas relacionadas con WhatsApp Business API: envío de notificaciones, plantillas, webhooks.  
Contexto en este proyecto: notificaciones de asistencia, alertas de permisos, resumen diario de marcadas.

**Trigger:** "envía un WhatsApp cuando X", "integra notificaciones de asistencia por WhatsApp"

### `/skill-development`
Usar cuando se necesite crear una nueva skill interna para este proyecto.  
Provee: estructura de SKILL.md, metadatos, ejemplos de uso.

**Trigger:** "crea una skill para X", "necesito una skill personalizada de Y"

### `/plugin-structure`
Usar junto con `skill-development` para definir la anatomía completa de un plugin.  
Provee: estructura de directorios, manifest, exports.

**Trigger:** siempre que se inicie una skill nueva.

---

## Validar que Claude detecta las skills

```bash
# Listar skills instaladas
claude skills list

# Verificar que el lock file está sincronizado
cat skills-lock.json | grep -c '"source"'  # debe devolver 20

# Verificar que los archivos existen
ls .claude/skills/
```

Si una skill no aparece en `claude skills list` pero está en `.claude/skills/`, reinstalar:

```bash
claude skills add <fuente>/<repo>/<ruta/SKILL.md>
```

---

## Cómo pedir tareas de UI/UX

### Formato de solicitud recomendado

```
Usando /frontend-design e /hyperframes:
Rediseña [nombre de página] en [ruta/página].

Contexto:
- Qué hace actualmente la página
- Qué problema tiene (demasiado espacio, confuso, etc.)
- Qué debe mejorar

Restricciones:
- Mantener diseño ERP compacto
- No romper la funcionalidad existente
- Tailwind únicamente, sin CSS custom salvo que sea necesario
```

### Ejemplo real

```
Usando /frontend-design, /hyperframes y /tailwind:
Rediseña la página /configuracion/asistencia/politicas.

Contexto:
- Gestión CRUD de políticas de jornada laboral
- Actualmente muestra cards simples sin densidad de información

Restricciones:
- Diseño tabla densa con acciones inline
- Sin modales a menos que sea imprescindible
- Consistente con el sidebar y el dashboard existente
- gsap solo si hay un cambio de estado que lo justifique
```

---

## Principios de diseño para este sistema

| Principio | Descripción |
|---|---|
| **Densidad ERP** | Tablas compactas, padding reducido, tipografía 12-14px en datos |
| **Sin decoración** | No gradientes, no ilustraciones, no iconos animados por defecto |
| **Feedback funcional** | Loading spinners, toast notifications, skeleton loaders — no animaciones de entrada decorativas |
| **Consistencia modular** | Mismo header, sidebar y patrones de tabla en todas las secciones |
| **Accesibilidad mínima** | Contraste WCAG AA, foco visible, labels en formularios |
| **Responsivo conservador** | Prioridad desktop; mobile como fallback, no al revés |

---

## Secciones del sistema y estado UI

| Sección | Ruta | Estado |
|---|---|---|
| Dashboard | `/dashboard` | Implementado |
| Asistencia diaria | `/asistencia` | Implementado |
| Conciliación | `/asistencia/conciliacion` | Implementado |
| Empleados | `/empleados` | Implementado |
| Permisos | `/permisos` | Implementado |
| Reportes | `/reportes` | Implementado |
| Usuarios | `/usuarios` | Implementado |
| Analytics | `/analytics/[id]` | Implementado |
| Configuración general | `/configuracion` | Implementado |
| Políticas de jornada | `/configuracion/asistencia/politicas` | Implementado (Phase 6) |
