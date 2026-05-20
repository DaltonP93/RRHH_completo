import { Page } from '@playwright/test'

export async function login(page: Page, username = 'admin', password = 'admin123') {
  await page.goto('/login')
  await page.fill(
    'input[name="username"], input[placeholder*="usuario" i], input[type="text"]:first-of-type',
    username,
  )
  await page.fill('input[name="password"], input[type="password"]', password)
  await page.click('button[type="submit"], button:has-text("Iniciar")')
  await page.waitForURL(/\/(portal|dashboard|mi-portal)/, { timeout: 10000 })
}
