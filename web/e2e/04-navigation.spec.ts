import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test.describe('Navigation — ModuleSidebar and Portal back-link', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('clicking a module card shows ModuleSidebar with "← Portal" link', async ({ page }) => {
    await page.goto('/portal')
    await page.waitForSelector('a .rounded-2xl', { timeout: 10000 })

    // Click the Asistencia module card (maps to moduleKey "asistencia")
    const asistenciaLink = page.locator('a[href="/asistencia"]')
    await expect(asistenciaLink).toBeVisible()
    await asistenciaLink.click()

    // After navigation, ModuleSidebar should appear with a "← Portal" back link
    const portalBackLink = page.locator('a[href="/portal"]')
    await expect(portalBackLink).toBeVisible({ timeout: 10000 })
    await expect(portalBackLink).toContainText('Portal')
  })

  test('"← Portal" link takes user back to /portal without full sidebar', async ({ page }) => {
    // Navigate to a module page first so ModuleSidebar is shown
    await page.goto('/asistencia')
    await page.waitForLoadState('domcontentloaded')

    const portalBackLink = page.locator('a[href="/portal"]')
    await expect(portalBackLink).toBeVisible({ timeout: 10000 })

    // Click back to portal
    await portalBackLink.click()
    await expect(page).toHaveURL(/\/portal/, { timeout: 10000 })

    // On /portal the ModuleSidebar (with the Portal link) should no longer be rendered
    // because moduleKey is null — verify the module-level sidebar is gone
    // The "← Portal" link in sidebar should be gone (portal page has no sidebar)
    const sidebarPortalLink = page.locator('nav a[href="/portal"], aside a[href="/portal"]')
    const isVisible = await sidebarPortalLink.isVisible().catch(() => false)
    expect(isVisible).toBe(false)
  })
})
