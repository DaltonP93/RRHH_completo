/**
 * E2E spec 16 — Página de conciliación de marcaciones.
 *
 * Verifica que /asistencia/conciliacion:
 *   - Carga sin 404 ni 500
 *   - Muestra el encabezado esperado
 *   - No lanza errores JS fatales en consola
 *   - Contiene el selector de fecha y el botón Actualizar
 *
 * Ejecutar: npx playwright test e2e/16-attendance-reconciliation.spec.ts
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Conciliación de Marcaciones', () => {
  test('página carga sin errores', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', err => errors.push(err.message));

    await login(page);
    const response = await page.goto('/asistencia/conciliacion');

    // No debe ser 404/500
    expect(response?.status()).not.toBe(404);
    expect(response?.status()).not.toBe(500);

    // Encabezado visible
    await expect(page.getByRole('heading', { name: /conciliaci[oó]n/i })).toBeVisible({ timeout: 15000 });

    // Controles de filtro presentes
    await expect(page.locator('input[type="date"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /actualizar/i })).toBeVisible();

    // Sin errores JS fatales (ignorar los de red del bridge/att2000 que pueden estar offline)
    const fatalErrors = errors.filter(e =>
      !e.includes('fetch') &&
      !e.includes('net::') &&
      !e.includes('Failed to load resource') &&
      !e.includes('att2000') &&
      !e.includes('ECONNREFUSED')
    );
    expect(fatalErrors).toHaveLength(0);
  });

  test('sidebar "Reconciliación" apunta a /asistencia/conciliacion', async ({ page }) => {
    await login(page);
    await page.goto('/asistencia');

    // Buscar el link Reconciliación en el sidebar
    const link = page.locator('a[href="/asistencia/conciliacion"]');
    await expect(link).toBeVisible({ timeout: 10000 });
    await expect(link).toContainText(/reconciliaci[oó]n/i);
  });

  test('secciones de diagnóstico se renderizan', async ({ page }) => {
    await login(page);
    await page.goto('/asistencia/conciliacion');

    await expect(page.getByRole('heading', { name: /conciliaci[oó]n/i })).toBeVisible({ timeout: 15000 });

    const cards = page.locator('text=/att2000|Bridge ZKTeco|attendance_logs|daily_summary/i');
    await expect(cards.first()).toBeVisible({ timeout: 20000 });
  });

  test('panel de importación es visible y operable', async ({ page }) => {
    await login(page);
    await page.goto('/asistencia/conciliacion');

    await expect(page.getByRole('heading', { name: /conciliaci[oó]n/i })).toBeVisible({ timeout: 15000 });

    // El panel de import debe tener los controles de fecha y el botón
    await expect(page.locator('select').filter({ hasText: /importar|recalcular/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /importar|recalcular/i })).toBeVisible();
  });
});
