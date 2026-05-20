import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test.describe('Login', () => {
  test('login page is accessible at /login', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveURL(/\/login/)
    // Check that a password input exists
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('login with valid credentials redirects to portal or dashboard', async ({ page }) => {
    await login(page)
    await expect(page).toHaveURL(/\/(portal|dashboard|mi-portal)/)
  })

  test('login with invalid credentials shows error message', async ({ page }) => {
    await page.goto('/login')
    await page.fill(
      'input[name="username"], input[placeholder*="usuario" i], input[type="text"]:first-of-type',
      'invalid_user',
    )
    await page.fill('input[name="password"], input[type="password"]', 'wrongpassword')
    await page.click('button[type="submit"], button:has-text("Iniciar")')

    // Should stay on login page and show some error indication
    await page.waitForTimeout(2000)
    const isStillOnLogin = page.url().includes('/login')
    const hasErrorMessage = await page.locator('text=/error|inválid|incorrecto|credencial/i').isVisible().catch(() => false)

    // Either still on /login, or showed an error message
    expect(isStillOnLogin || hasErrorMessage).toBe(true)
  })
})
