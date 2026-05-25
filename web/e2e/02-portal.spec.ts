import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test.describe('Portal', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/portal')
    await page.waitForLoadState('networkidle')
  })

  test('/portal loads with at least 8 module cards visible', async ({ page }) => {
    // Module cards are rendered as clickable link elements with rounded card styling
    const cards = page.locator('a .rounded-2xl, a [class*="card"], a [class*="Card"]')
    const count = await cards.count()
    expect(count).toBeGreaterThanOrEqual(8)
  })

  test('no element with data-testid="main-sidebar" on /portal', async ({ page }) => {
    const mainSidebar = page.locator('[data-testid="main-sidebar"]')
    const isVisible = await mainSidebar.isVisible().catch(() => false)
    expect(isVisible).toBe(false)
  })

  test('no nav[data-sidebar] or aside[data-sidebar] on /portal', async ({ page }) => {
    const sidebar = page.locator('nav[data-sidebar], aside[data-sidebar]')
    const isVisible = await sidebar.isVisible().catch(() => false)
    expect(isVisible).toBe(false)
  })

  test('main module cards are visible: personas, asistencia, nomina', async ({ page }) => {
    await expect.soft(page.locator('a[href="/empleados"], a[href="/personas"]').first()).toBeVisible({ timeout: 8000 })
    await expect.soft(page.locator('a[href="/asistencia"]').first()).toBeVisible({ timeout: 8000 })
    await expect.soft(page.locator('a[href="/nomina"]').first()).toBeVisible({ timeout: 8000 })
  })

  test('main module cards are visible: pagos, documentos, competencias', async ({ page }) => {
    await expect.soft(page.locator('a[href="/bancos"], a[href="/pagos"]').first()).toBeVisible({ timeout: 8000 })
    await expect.soft(page.locator('a[href="/documentos"]').first()).toBeVisible({ timeout: 8000 })
    await expect.soft(page.locator('a[href="/competencias"]').first()).toBeVisible({ timeout: 8000 })
  })

  test('main module cards are visible: cumplimiento, reportes, configuracion, seguridad, auditoria', async ({ page }) => {
    await expect.soft(page.locator('a[href="/cumplimiento"]').first()).toBeVisible({ timeout: 8000 })
    await expect.soft(page.locator('a[href="/reportes"]').first()).toBeVisible({ timeout: 8000 })
    await expect.soft(page.locator('a[href="/configuracion"]').first()).toBeVisible({ timeout: 8000 })
    await expect.soft(page.locator('a[href*="seguridad"]').first()).toBeVisible({ timeout: 8000 })
    await expect.soft(page.locator('a[href="/auditoria"]').first()).toBeVisible({ timeout: 8000 })
  })

  test('clicking "Gestión de Personas" card navigates to /empleados', async ({ page }) => {
    // Try the direct href link first, then fall back to text matching
    const personasLink = page.locator('a[href="/empleados"], a[href="/personas"]').first()
    const isVisible = await personasLink.isVisible().catch(() => false)

    if (isVisible) {
      await personasLink.click()
      await page.waitForURL(/\/(empleados|personas)/, { timeout: 10000 })
      expect(page.url()).toMatch(/\/(empleados|personas)/)
    } else {
      // Fall back to text-based locator
      const textLink = page.locator('a:has-text("Personas"), a:has-text("Empleados")').first()
      await expect(textLink).toBeVisible({ timeout: 8000 })
      await textLink.click()
      await page.waitForURL(/\/(empleados|personas)/, { timeout: 10000 })
      expect(page.url()).toMatch(/\/(empleados|personas)/)
    }
  })

  test('clicking "Asistencia y Relojes" card navigates to /asistencia', async ({ page }) => {
    const asistenciaLink = page.locator('a[href="/asistencia"]').first()
    const isVisible = await asistenciaLink.isVisible().catch(() => false)

    if (isVisible) {
      await asistenciaLink.click()
      await page.waitForURL(/\/asistencia/, { timeout: 10000 })
      expect(page.url()).toMatch(/\/asistencia/)
    } else {
      const textLink = page.locator('a:has-text("Asistencia")').first()
      await expect(textLink).toBeVisible({ timeout: 8000 })
      await textLink.click()
      await page.waitForURL(/\/asistencia/, { timeout: 10000 })
      expect(page.url()).toMatch(/\/asistencia/)
    }
  })
})
