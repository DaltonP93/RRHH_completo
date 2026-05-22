import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test.describe('Login', () => {
  test('login page loads at /login', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('valid super_admin credentials redirect to /portal', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')

    await page.fill(
      'input[name="username"], input[placeholder*="usuario" i], input[type="text"]:first-of-type',
      'admin',
    )
    await page.fill('input[name="password"], input[type="password"]', 'admin123')
    await page.click('button[type="submit"], button:has-text("Iniciar")')
    await page.waitForURL(/\/(portal|dashboard|mi-portal)/, { timeout: 15000 })

    const url = page.url()
    expect(url).toMatch(/\/portal/)
  })

  test('invalid credentials show error message', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')

    await page.fill(
      'input[name="username"], input[placeholder*="usuario" i], input[type="text"]:first-of-type',
      'invalid_user_xyz',
    )
    await page.fill('input[name="password"], input[type="password"]', 'wrongpassword999')
    await page.click('button[type="submit"], button:has-text("Iniciar")')

    await page.waitForTimeout(3000)

    const isStillOnLogin = page.url().includes('/login')
    const hasErrorMessage = await page
      .locator('text=/error|inválid|incorrecto|credencial|contraseña/i')
      .isVisible()
      .catch(() => false)

    expect(isStillOnLogin || hasErrorMessage).toBe(true)
  })

  test('after login, /portal has no element with data-testid="main-sidebar"', async ({ page }) => {
    await login(page)
    await page.goto('/portal')
    await page.waitForLoadState('networkidle')

    const mainSidebar = page.locator('[data-testid="main-sidebar"]')
    const isVisible = await mainSidebar.isVisible().catch(() => false)
    expect(isVisible).toBe(false)
  })
})
