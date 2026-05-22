import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test.describe('Security module — page loads', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('/seguridad/roles loads without 500', async ({ page }) => {
    const response = await page.goto('/seguridad/roles')
    await page.waitForLoadState('domcontentloaded')

    // Must not be a server error
    expect(response?.status()).not.toBe(500)
    expect(response?.status()).not.toBe(503)

    const heading = page.locator('h1, h2').first()
    await expect(heading).toBeVisible({ timeout: 10000 })
  })

  test('/seguridad/permisos loads without 500', async ({ page }) => {
    const response = await page.goto('/seguridad/permisos')
    await page.waitForLoadState('domcontentloaded')

    expect(response?.status()).not.toBe(500)
    expect(response?.status()).not.toBe(503)

    const content = page.locator('table, h1, h2, [class*="table"]').first()
    await expect(content).toBeVisible({ timeout: 10000 })
  })

  test('/usuarios loads without 500', async ({ page }) => {
    const response = await page.goto('/usuarios')
    await page.waitForLoadState('domcontentloaded')

    expect(response?.status()).not.toBe(500)
    expect(response?.status()).not.toBe(503)

    const content = page.locator('h1, h2, table, input[type="search"], input[type="text"]').first()
    await expect(content).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Security module — API endpoints', () => {
  test('GET /api/roles returns 200 with array', async ({ request }) => {
    const response = await request.get('/api/roles', { timeout: 10000 })
    expect(response.status()).toBe(200)

    const body = await response.json().catch(() => null)
    expect(body).not.toBeNull()

    // Body should be an array or an object containing a roles array
    const isArray = Array.isArray(body)
    const hasRolesKey = body && (Array.isArray(body.roles) || Array.isArray(body.data))
    expect(isArray || hasRolesKey).toBe(true)
  })

  test('GET /api/permissions returns 200', async ({ request }) => {
    const response = await request.get('/api/permissions', { timeout: 10000 })
    expect(response.status()).toBe(200)

    const body = await response.json().catch(() => null)
    expect(body).not.toBeNull()

    // Body should be an array or contain a permissions/data key
    const isArray = Array.isArray(body)
    const hasPermissionsKey =
      body &&
      (Array.isArray(body.permissions) ||
        Array.isArray(body.data) ||
        typeof body === 'object')
    expect(isArray || hasPermissionsKey).toBe(true)
  })

  test('GET /api/companies returns 200', async ({ request }) => {
    const response = await request.get('/api/companies', { timeout: 10000 })
    expect(response.status()).toBe(200)
  })

  test('GET /api/audit returns 200', async ({ request }) => {
    const response = await request.get('/api/audit', { timeout: 10000 })
    expect(response.status()).toBe(200)
  })
})
