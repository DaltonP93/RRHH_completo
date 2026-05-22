import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test.describe('Navigation — ModuleSidebar and Portal back-link', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('navigating to /empleados shows ModuleSidebar with "← Portal" link', async ({ page }) => {
    await page.goto('/empleados')
    await page.waitForLoadState('networkidle')

    // ModuleSidebar should render a "← Portal" link or a link to /portal
    const portalLink = page.locator('a[href="/portal"]')
    await expect(portalLink).toBeVisible({ timeout: 10000 })

    // The link text should contain "Portal"
    const linkText = await portalLink.first().textContent()
    expect(linkText).toMatch(/Portal/i)
  })

  test('navigating to /asistencia shows sidebar with "Asistencia" module title', async ({ page }) => {
    await page.goto('/asistencia')
    await page.waitForLoadState('networkidle')

    // Sidebar should contain the module title "Asistencia"
    const moduleTitle = page.locator(
      'nav:has-text("Asistencia"), aside:has-text("Asistencia"), [class*="sidebar"]:has-text("Asistencia")',
    )
    await expect(moduleTitle.first()).toBeVisible({ timeout: 10000 })
  })

  test('clicking "← Portal" from /empleados redirects to /portal', async ({ page }) => {
    await page.goto('/empleados')
    await page.waitForLoadState('networkidle')

    const portalLink = page.locator('a[href="/portal"]').first()
    await expect(portalLink).toBeVisible({ timeout: 10000 })

    await portalLink.click()
    await expect(page).toHaveURL(/\/portal/, { timeout: 10000 })
  })

  test('/mi-portal loads without server error', async ({ page }) => {
    const response = await page.goto('/mi-portal')
    await page.waitForLoadState('domcontentloaded')

    // Should not be a 500-level server error
    const status = response?.status() ?? 200
    expect(status).not.toBe(500)
    expect(status).not.toBe(503)

    // Page should render some content
    const content = page.locator('h1, h2, main, [class*="card"], [class*="Card"]').first()
    await expect(content).toBeVisible({ timeout: 10000 })
  })

  test('/admin/ver-como loads without error for super_admin', async ({ page }) => {
    const response = await page.goto('/admin/ver-como')
    await page.waitForLoadState('domcontentloaded')

    const status = response?.status() ?? 200
    // Accept 200 or redirects (3xx) — just not a server crash
    expect(status).not.toBe(500)
    expect(status).not.toBe(503)

    // Should show either a user list or a redirect to portal/login
    const content = page
      .locator(
        'h1, h2, table, input[type="search"], input[type="text"], a[href="/portal"]',
      )
      .first()
    await expect(content).toBeVisible({ timeout: 10000 })
  })
})
