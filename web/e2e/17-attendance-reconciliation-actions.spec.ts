/**
 * E2E spec 17 — Acciones de la página de conciliación de marcaciones.
 *
 * Verifica que /asistencia/conciliacion:
 *   - Con sesión activa: no muestra HTTP 401, sí muestra contenido
 *   - El ImportPanel contiene los controles y el botón de acción
 *   - Los links rápidos apuntan a las rutas correctas
 *   - La página no genera errores JS fatales
 *
 * Ejecutar: npx playwright test e2e/17-attendance-reconciliation-actions.spec.ts
 */
import { test, expect, Page } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Acciones de Conciliación de Marcaciones', () => {
  test('con sesión activa no muestra 401 ni texto "Token requerido"', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await login(page);
    const response = await page.goto('/asistencia/conciliacion');

    expect(response?.status()).not.toBe(401);
    expect(response?.status()).not.toBe(404);
    expect(response?.status()).not.toBe(500);

    // Esperar heading
    await expect(page.getByRole('heading', { name: /conciliaci[oó]n/i })).toBeVisible({ timeout: 15000 });

    // No debe haber el texto literal "Token requerido" ni "HTTP 401" en el body
    const body = await page.textContent('body') ?? ''
    expect(body).not.toContain('Token requerido')
    expect(body).not.toContain('HTTP 401')

    // Sin errores JS fatales
    const fatal = errors.filter(e => !e.includes('fetch') && !e.includes('net::') && !e.includes('ECONNREFUSED'))
    expect(fatal).toHaveLength(0)
  });

  test('ImportPanel visible y operable', async ({ page }) => {
    await login(page);
    await page.goto('/asistencia/conciliacion');
    await expect(page.getByRole('heading', { name: /conciliaci[oó]n/i })).toBeVisible({ timeout: 15000 });

    // Selector de modo
    const modeSelect = page.locator('select').filter({ hasText: /importar|recalcular/i })
    await expect(modeSelect).toBeVisible({ timeout: 10000 });

    // Botón de acción
    const btn = page.getByRole('button', { name: /importar|recalcular/i })
    await expect(btn).toBeVisible();
    await expect(btn).not.toBeDisabled();

    // Inputs de fecha
    const dateInputs = page.locator('input[type="date"]')
    await expect(dateInputs.first()).toBeVisible();
  });

  test('links rápidos apuntan a rutas correctas', async ({ page }) => {
    await login(page);
    await page.goto('/asistencia/conciliacion');
    await expect(page.getByRole('heading', { name: /conciliaci[oó]n/i })).toBeVisible({ timeout: 15000 });

    await expect(page.locator('a[href="/sync/att2000"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('a[href="/asistencia/relojes/diagnostico"]')).toBeVisible();
    await expect(page.locator('a[href="/asistencia"]')).toBeVisible();
  });

  test('modo "solo recalcular" llama recalc-range, no import-att2000', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', req => {
      if (req.url().includes('/api/attendance/')) requests.push(req.url());
    });

    await login(page);
    await page.goto('/asistencia/conciliacion');
    await expect(page.getByRole('heading', { name: /conciliaci[oó]n/i })).toBeVisible({ timeout: 15000 });

    // Cambiar al modo "solo recalcular"
    const modeSelect = page.locator('select').filter({ hasText: /importar|recalcular/i })
    await modeSelect.selectOption('recalc_only');

    // Click en el botón
    const btn = page.getByRole('button', { name: /recalcular/i })
    await btn.click();

    // Esperar respuesta
    await page.waitForResponse(res => res.url().includes('/api/attendance/recalc-range'), { timeout: 15000 });

    const recalcCalls = requests.filter(u => u.includes('recalc-range'));
    const importCalls = requests.filter(u => u.includes('import-att2000'));
    expect(recalcCalls.length).toBeGreaterThan(0);
    expect(importCalls.length).toBe(0);
  });
});
