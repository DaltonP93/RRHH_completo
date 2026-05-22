import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test.describe('Page reload (F5) stability', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('reload on /portal still shows module cards (no blank screen)', async ({ page }) => {
    await page.goto('/portal')
    await page.waitForLoadState('networkidle')

    // Reload the page
    await page.reload()
    await page.waitForLoadState('networkidle')

    // After reload, portal should still render module cards
    const cards = page.locator('a .rounded-2xl, a [class*="card"], a [class*="Card"]')
    const count = await cards.count()
    expect(count).toBeGreaterThanOrEqual(1)

    // Page should not be blank — at minimum a heading or card should be visible
    const content = page.locator('h1, h2, a[href="/asistencia"], a[href="/empleados"]').first()
    await expect(content).toBeVisible({ timeout: 10000 })
  })

  test('reload on /seguridad/roles still shows content (no blank screen)', async ({ page }) => {
    await page.goto('/seguridad/roles')
    await page.waitForLoadState('networkidle')

    await page.reload()
    await page.waitForLoadState('networkidle')

    // After reload, page should still render a heading or table
    const content = page.locator('h1, h2, table, [class*="table"]').first()
    await expect(content).toBeVisible({ timeout: 10000 })

    // Should not show a blank/empty body
    const bodyText = await page.locator('body').textContent()
    expect(bodyText?.trim().length).toBeGreaterThan(50)
  })

  test('reload on /mi-portal still shows cards (no blank screen)', async ({ page }) => {
    await page.goto('/mi-portal')
    await page.waitForLoadState('networkidle')

    await page.reload()
    await page.waitForLoadState('networkidle')

    // /mi-portal should render autoservicio cards after reload
    const content = page
      .locator('h1, h2, main, [class*="card"], [class*="Card"]')
      .first()
    await expect(content).toBeVisible({ timeout: 10000 })

    const bodyText = await page.locator('body').textContent()
    expect(bodyText?.trim().length).toBeGreaterThan(50)
  })
})
