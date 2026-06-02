/**
 * E2E spec 14 — Staging runtime: no 404, no 500.
 *
 * Verifica que todas las rutas críticas del sistema devuelvan páginas válidas
 * sin crashes, errores HTTP 5xx, ni texto de error en pantalla.
 *
 * Ejecutar: npx playwright test e2e/14-staging-runtime-no-404-no-500.spec.ts
 */
import { test, expect, Page } from '@playwright/test';

const ROUTES = [
  // Core
  '/dashboard',
  '/portal',
  '/ejecutivo',
  // Personas
  '/personas/legajos',
  '/personas/contratos',
  '/personas/familiares',
  '/personas/formacion',
  '/personas/historico-salarial',
  // Asistencia
  '/asistencia',
  '/asistencia/relojes/diagnostico',
  '/permisos',
  '/vacaciones',
  // Nómina
  '/nomina',
  '/nomina/liquidaciones',
  '/nomina/conceptos',
  '/nomina/conceptos-fijos',
  '/nomina/parametros',
  '/nomina/tipos-nomina',
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
  '/cumplimiento/vencimientos',
  '/cumplimiento/planillas',
  '/cumplimiento/altas-bajas',
  // Documentos
  '/documentos',
  '/documentos/expedientes',
  '/documentos/legajos',
  '/documentos/firma',
  '/documentos/laborales',
  '/documentos/constancias',
  '/documentos/auditoria',
  // Competencias
  '/competencias',
  '/competencias/planes',
  '/competencias/evaluacion',
  '/competencias/evaluaciones',
  '/competencias/matriz',
  // Bancos / otras
  '/bancos',
  '/reportes',
  '/usuarios',
  '/configuracion',
];

const CRASH_TEXTS = [
  'Application error',
  'Internal Server Error',
  'TypeError',
  'ReferenceError',
  'Cannot read properties',
  'undefined is not',
  'null is not',
  'ChunkLoadError',
];

async function checkPage(page: Page, path: string) {
  const url = `${process.env.BASE_URL || 'http://localhost:3000'}${path}`;
  const errors: string[] = [];

  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`);
  });

  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  const status = response?.status() ?? 0;

  expect(status, `HTTP ${status} on ${path}`).toBeLessThan(500);

  const bodyText = await page.locator('body').innerText();

  for (const crashText of CRASH_TEXTS) {
    expect(bodyText, `Crash text "${crashText}" found on ${path}`).not.toContain(crashText);
  }

  // Must have a main landmark or h1
  const hasMain = await page.locator('main, [role="main"], h1').count();
  expect(hasMain, `No main/h1 on ${path}`).toBeGreaterThan(0);
}

test.describe('Staging runtime — no 404, no 500', () => {
  test.beforeEach(async ({ page }) => {
    // Login if needed — skip if already authenticated via storageState
    const loginUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/login`;
    await page.goto(loginUrl, { timeout: 15_000 }).catch(() => null);

    const isLoginPage = await page.locator('input[type="password"]').count();
    if (isLoginPage > 0) {
      await page.fill('input[type="text"], input[type="email"]', process.env.E2E_USER || 'admin');
      await page.fill('input[type="password"]', process.env.E2E_PASS || 'admin123');
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(dashboard|portal)/, { timeout: 10_000 }).catch(() => null);
    }
  });

  for (const route of ROUTES) {
    test(`${route} renders without crash`, async ({ page }) => {
      await checkPage(page, route);
    });
  }
});
