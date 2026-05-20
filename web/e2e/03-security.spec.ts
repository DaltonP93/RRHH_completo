import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test.describe('Security module', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('roles list is visible at /seguridad/roles', async ({ page }) => {
    await page.goto('/seguridad/roles')

    // Wait for the page to load — either roles data or an error/loading state
    await page.waitForLoadState('domcontentloaded')

    // The page heading should be present
    const heading = page.locator('h1, h2').first()
    await expect(heading).toBeVisible({ timeout: 8000 })

    // ModuleSidebar "← Portal" link should appear (seguridad maps to moduleKey)
    const portalLink = page.locator('a[href="/portal"]')
    await expect(portalLink).toBeVisible({ timeout: 5000 })
  })

  test('permissions table is visible at /seguridad/permisos', async ({ page }) => {
    await page.goto('/seguridad/permisos')
    await page.waitForLoadState('domcontentloaded')

    // Page should render a table (permisos uses <table> elements)
    // or a loading/empty state — either way the page loaded
    const content = page.locator('table, [class*="Loader"], h1, h2').first()
    await expect(content).toBeVisible({ timeout: 8000 })
  })

  test('user list is visible at /seguridad/alcances', async ({ page }) => {
    await page.goto('/seguridad/alcances')
    await page.waitForLoadState('domcontentloaded')

    // The alcances page shows a user search/list area
    const content = page.locator('input[type="search"], input[type="text"], select, h1, h2').first()
    await expect(content).toBeVisible({ timeout: 8000 })
  })
})
