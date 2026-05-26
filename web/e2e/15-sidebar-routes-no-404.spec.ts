/**
 * E2E spec 15 — Todas las rutas del sidebar no deben devolver 404, 500 ni crash.
 *
 * Cubre exactamente los hrefs registrados en ModuleSidebar.tsx + rutas de documentos.
 * Ejecutar: npx playwright test e2e/15-sidebar-routes-no-404.spec.ts
 */
import { test, expect, Page } from '@playwright/test';

const SIDEBAR_ROUTES = [
  // Dashboard
  '/dashboard',
  '/portal',
  // Personas
  '/personas/legajos',
  '/personas/contratos',
  '/personas/familiares',
  '/personas/formacion',
  '/personas/historico-salarial',
  // Asistencia
  '/asistencia',
  '/asistencia/relojes/diagnostico',
  '/asistencia/tiempo-real',
  '/mi-asistencia',
  '/permisos',
  '/vacaciones',
  // Nómina
  '/nomina',
  '/nomina/liquidaciones',
  '/nomina/conceptos',
  '/nomina/conceptos-fijos',
  '/nomina/tipos-nomina',
  '/nomina/parametros',
  '/nomina/preavisos',
  '/nomina/premios',
  '/nomina/retenciones',
  '/nomina/anticipos',
  '/nomina/liquidacion-salida',
  '/nomina/aguinaldo',
  // Cumplimiento
  '/cumplimiento',
  '/cumplimiento/mtess',
  '/cumplimiento/ips',
  '/cumplimiento/planillas',
  '/cumplimiento/altas-bajas',
  '/cumplimiento/exportaciones',
  '/cumplimiento/calendario',
  '/cumplimiento/vencimientos',
  // Documentos
  '/documentos',
  '/documentos/plantillas',
  '/documentos/expedientes',
  '/documentos/legajos',
  '/documentos/firma',
  '/documentos/laborales',
  '/documentos/constancias',
  '/documentos/auditoria',
  // Competencias
  '/competencias',
  '/competencias/evaluacion',
  '/competencias/evaluaciones',
  '/competencias/planes',
  '/competencias/matriz',
  '/competencias/niveles',
  '/competencias/ciclos',
  '/competencias/capacitacion',
  '/competencias/catalogo',
  // Analítica / Ejecutivo
  '/ejecutivo',
  '/reportes',
  // Configuración
  '/configuracion',
  '/configuracion/empresas',
  '/configuracion/parametros',
  '/configuracion/bancos',
  '/configuracion/sedes',
  '/configuracion/turnos',
  '/configuracion/feriados',
  '/configuracion/metas',
  // Seguridad
  '/seguridad',
  '/seguridad/roles',
  '/seguridad/permisos',
  '/seguridad/sesiones',
  // Sistema
  '/sistema',
  '/sistema/salud',
  '/sistema/backups',
];

const CRASH_PATTERNS = [
  'Application error',
  'Internal Server Error',
  'ChunkLoadError',
  'TypeError:',
  'Cannot read properties of',
  'is not a function',
  'Unhandled Runtime Error',
];

async function checkRoute(page: Page, path: string) {
  const base = process.env.BASE_URL || 'http://localhost:3000';
  const consoleErrors: string[] = [];

  const handler = (msg: any) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  };
  page.on('console', handler);

  try {
    const response = await page.goto(`${base}${path}`, {
      waitUntil: 'domcontentloaded',
      timeout: 25_000,
    });

    const status = response?.status() ?? 0;
    expect(status, `HTTP ${status} at ${path}`).toBeLessThan(500);
    expect(status, `404 at ${path}`).not.toBe(404);

    const bodyText = await page.locator('body').innerText({ timeout: 5_000 }).catch(() => '');
    for (const pattern of CRASH_PATTERNS) {
      expect(bodyText, `Crash "${pattern}" at ${path}`).not.toContain(pattern);
    }

    const mainCount = await page.locator('main, [role="main"], h1').count();
    expect(mainCount, `No main/h1 at ${path}`).toBeGreaterThan(0);
  } finally {
    page.off('console', handler);
  }
}

test.describe('Sidebar routes — no 404, no 500, no crash', () => {
  test.beforeEach(async ({ page }) => {
    const base = process.env.BASE_URL || 'http://localhost:3000';
    await page.goto(`${base}/login`, { timeout: 15_000 }).catch(() => null);
    const hasPassword = await page.locator('input[type="password"]').count();
    if (hasPassword > 0) {
      await page.fill('input[type="text"], input[type="email"]', process.env.E2E_USER || 'admin');
      await page.fill('input[type="password"]', process.env.E2E_PASS || 'Admin1234!');
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(dashboard|portal)/, { timeout: 12_000 }).catch(() => null);
    }
  });

  for (const route of SIDEBAR_ROUTES) {
    test(`${route}`, async ({ page }) => {
      await checkRoute(page, route);
    });
  }
});
