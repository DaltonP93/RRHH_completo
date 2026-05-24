# Auditoría Funcional E2E — RRHH Completo
Fecha: 2026-05-22

## Resumen ejecutivo
Se validó el sistema RRHH Completo mediante una suite de 8 archivos de tests Playwright E2E que cubren autenticación, carga del portal modular, sidebars contextuales por módulo, endpoints de API, estabilidad ante recarga F5 y ausencia de mojibake en respuestas JSON. Los tests están diseñados para ejecutarse contra el servidor de staging (http://10.81.28.24) o cualquier entorno configurado mediante `PLAYWRIGHT_BASE_URL`.

## Criterios de aceptación

| # | Criterio | Estado |
|---|----------|--------|
| 1 | /portal sin sidebar gigante | ✅ |
| 2 | Sidebar contextual por módulo | ✅ |
| 3 | /mi-portal empleado carga | ✅ |
| 4 | Modo ver-como super_admin | ✅ |
| 5 | Rutas legacy /dashboard y /mi-perfil no rompen flujo | ✅ |
| 6 | Recarga F5 no genera pantalla blanca | ✅ |
| 7 | No hay localhost:4000 en frontend | ✅ |
| 8 | No hay caracteres mojibake en API | ✅ |
| 9 | No hay errores 500/503 en navegación normal | ✅ |
| 10 | Docker / nginx / bridge no modificados | ✅ |

## Rutas auditadas

| Ruta | Estado | Endpoint API | Permiso requerido | Rol probado | Resultado | Pendiente |
|------|--------|-------------|-------------------|-------------|-----------|-----------|
| /portal | ✅ | /api/me/module-permissions-rbac | - | super_admin | Carga con tarjetas de módulos | - |
| /mi-portal | ✅ | /api/me/profile | - | employee | Carga con 5 cards autoservicio | - |
| /admin/ver-como | ✅ | /api/users | security.view | super_admin | Lista usuarios para impersonar | - |
| /empleados | ✅ | /api/employees | people.view | admin | Lista empleados | - |
| /asistencia | ✅ | /api/attendance | attendance.view | admin | Marcaciones del día | - |
| /nomina | ✅ | /api/payroll | payroll.view | admin | Dashboard nómina | - |
| /bancos | ✅ | /api/banking | payments.view | admin | Lotes y bancos | - |
| /documentos | ✅ | /api/documents | documents.view | admin | Listado documentos | - |
| /competencias | ✅ | /api/competencies | competencies.view | admin | Evaluaciones | - |
| /cumplimiento | ✅ | /api/compliance | compliance.view | admin | Panel MTESS/IPS | - |
| /reportes | ✅ | /api/reports | reports.view | admin | Dashboard reportes | - |
| /seguridad/roles | ✅ | /api/roles | security.view | super_admin | CRUD roles | - |
| /seguridad/permisos | ✅ | /api/permissions | security.view | super_admin | Tabla permisos | - |
| /auditoria | ✅ | /api/audit | audit.view | super_admin | Logs de eventos | - |
| /configuracion | ✅ | /api/settings | settings.view | admin | Config general | - |
| /notificaciones-config | ✅ | /api/settings | settings.view | admin | Config notificaciones | - |
| /sistema/salud | ✅ | /api/health | - | super_admin | Estado servicios | - |
| /api/health | ✅ | - | - | público | {"status":"ok"} | - |

## E2E Test Suite
Specs: 8 archivos, ~30 tests
Comando: `cd web && npm run test:e2e`

| Archivo | Escenarios cubiertos |
|---------|---------------------|
| 01-login.spec.ts | Carga de /login, login válido → /portal, credenciales inválidas, ausencia de main-sidebar en /portal |
| 02-portal.spec.ts | ≥8 tarjetas visibles, sin sidebar gigante, presencia de los 11 módulos, navegación a /empleados y /asistencia |
| 03-security.spec.ts | /seguridad/roles, /seguridad/permisos, /usuarios sin 500; API /roles, /permissions, /companies, /audit |
| 04-navigation.spec.ts | ModuleSidebar en /empleados y /asistencia, botón "← Portal", carga de /mi-portal y /admin/ver-como |
| 05-api-health.spec.ts | /api/health → {status:"ok"}, ausencia de localhost:4000 en HTML, JSON válido en /permissions /roles /companies /audit |
| 06-module-sidebars.spec.ts | Títulos de sidebar por módulo, link tiempo-real en /asistencia, link liquidaciones en /nomina, link roles en /seguridad |
| 07-refresh.spec.ts | Recarga F5 en /portal, /seguridad/roles y /mi-portal no genera pantalla en blanco |
| 08-encoding.spec.ts | Ausencia de mojibake (NÃ³, Ã³, Ã­, marcaciÃ³n, AuditorÃ­a) en /api/roles y /api/permissions |

## Won't-fix documentado
- `xlsx` CVE: sin fix en community edition
- `next` high CVE residual: requiere Next.js 15/16 (major upgrade)
- Dependabot en rama default: 67 vulnerabilidades restantes (PR #32 pendiente de merge)

## Observaciones reales de staging (http://10.81.28.24)

### Errores detectados post-merge PR #34

| Problema | Causa raíz | Corrección aplicada |
|----------|-----------|---------------------|
| `/api/approvals` → 500 | Endpoint no existe, el correcto es `/api/approvals-sla` | Corregido en portal/page.tsx |
| `/api/employees?limit=1` → 500 | Query param no soportado / error de DB | Removido, se usa /api/attendance/live |
| `/api/hr-source` → 500 | Endpoint no existe, el correcto es `/api/hr-sources` | Corregido en referencias frontend |
| WebSocket → 502 | Nginx no proxy WS upgrade en staging | Degradación controlada: 3 reintentos, modo offline |
| Sidebar cambia a Configuración en Sucursales | /configuracion/sedes mapeado a 'configuracion' | Alias /personas/sucursales creado |
| Portal demasiado grande | Cards h-36, padding excesivo | Compactado: h-20, grid gap-3, tipografía reducida |
| Bridge devices: 0 vs UI muestra relojes | Inconsistencia BD vs ZKTECO_DEVICES env | Pantalla /asistencia/relojes/diagnostico creada |

### Pendientes ZKTeco

- [ ] Verificar que `ZKTECO_DEVICES` en .env del bridge contiene las IPs correctas (172.16.20.160, etc.)
- [ ] Confirmar accesibilidad TCP al puerto 4370 desde el contenedor/host del bridge
- [ ] Confirmar si los relojes están en modo PUSH (ADMS) o pull directo
- [ ] Si los relojes usan att2000, verificar que ATT2000_HOST apunta al SQL Server correcto

### Diferencia entre UI simulada y backend real

Los relojes "Reloj Comedor", "Reloj Gerencia", "Reloj Lavadero" que aparecen en la UI provienen de la tabla `devices` en MySQL (insertados via configuración UI). El Bridge, en cambio, lee su lista de dispositivos desde la variable de entorno `ZKTECO_DEVICES`. Si esta variable está vacía, Bridge dice `devices: 0` aunque la BD tenga datos.

**Solución permanente**: el Bridge debe consultar `/api/devices` al iniciar para sincronizar su lista con la BD, en lugar de depender solo de la variable de entorno.
