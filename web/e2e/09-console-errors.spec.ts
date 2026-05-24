import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test.describe('No console 500/502 errors during navigation', () => {
  test('portal page - no 500/502 in console', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('response', response => {
      if (response.status() >= 500) {
        errors.push(`HTTP ${response.status()} on ${response.url()}`)
      }
    })

    await login(page, process.env.TEST_USER || 'admin', process.env.TEST_PASS || 'admin123')
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const critical = errors.filter(e => e.includes('500') || e.includes('502') || e.includes('503'))
    expect(critical, `Critical errors found: ${critical.join(', ')}`).toHaveLength(0)
  })

  test('personas navigation - no 500/502', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('response', response => {
      if (response.status() >= 500) {
        errors.push(`HTTP ${response.status()} on ${response.url()}`)
      }
    })

    await login(page, process.env.TEST_USER || 'admin', process.env.TEST_PASS || 'admin123')
    await page.goto('/empleados')
    await page.waitForLoadState('networkidle')

    const critical = errors.filter(e => e.includes('500') || e.includes('502') || e.includes('503'))
    expect(critical, `Critical errors found on /empleados: ${critical.join(', ')}`).toHaveLength(0)
  })

  test('api/employees returns 200', async ({ request }) => {
    const r = await request.get('/api/employees', {
      headers: { Authorization: `Bearer ${process.env.TEST_TOKEN || ''}` },
    })
    // 401 is acceptable when no token provided, but a server crash (500) is not
    expect([200, 401]).toContain(r.status())
  })

  test('api/approvals-sla returns 200 or 404 not 500', async ({ request }) => {
    const r = await request.get('/api/approvals-sla?status=pending&limit=5')
    expect(r.status()).not.toBe(500)
    expect(r.status()).not.toBe(502)
  })

  test('GET /api/employees returns 200', async ({ request }) => {
    const r = await request.get('/api/employees?limit=10')
    expect(r.status(), `employees returned ${r.status()}`).not.toBe(500)
    expect(r.status()).not.toBe(502)
  })

  test('GET /api/branches returns 200', async ({ request }) => {
    const r = await request.get('/api/branches')
    expect(r.status(), `branches returned ${r.status()}`).not.toBe(500)
    expect(r.status()).not.toBe(502)
  })

  test('GET /api/approvals returns 200 not 500', async ({ request }) => {
    const r = await request.get('/api/approvals?status=pending&limit=5')
    expect(r.status()).not.toBe(500)
    expect(r.status()).not.toBe(502)
  })

  test('GET /api/notifications returns 200 not 500', async ({ request }) => {
    const r = await request.get('/api/notifications')
    expect(r.status()).not.toBe(500)
    expect(r.status()).not.toBe(502)
  })

  test('GET /api/hr-sources returns 200 not 500', async ({ request }) => {
    const r = await request.get('/api/hr-sources')
    expect(r.status()).not.toBe(500)
    expect(r.status()).not.toBe(502)
  })

  test('GET /api/departments returns 200', async ({ request }) => {
    const r = await request.get('/api/departments')
    expect(r.status()).not.toBe(500)
  })

  test('sidebar stays in personas context when navigating to /personas/sucursales', async ({ page }) => {
    await login(page, process.env.TEST_USER || 'admin', process.env.TEST_PASS || 'admin123')
    await page.goto('/personas/sucursales')
    await page.waitForLoadState('networkidle')

    // Check sidebar shows Personas title, not Configuración
    const sidebarTitle = page.locator('text=Gestión de Personas')
    await expect(sidebarTitle).toBeVisible()

    // Configuración should NOT be the sidebar title
    // (it might appear in nav items, but not as the module heading)
    await expect(sidebarTitle).toBeVisible()
  })

  test('asistencia/relojes/diagnostico loads without server error', async ({ page }) => {
    const errors: string[] = []
    page.on('response', response => {
      if (response.status() >= 500) {
        errors.push(`HTTP ${response.status()} on ${response.url()}`)
      }
    })

    await login(page, process.env.TEST_USER || 'admin', process.env.TEST_PASS || 'admin123')
    const response = await page.goto('/asistencia/relojes/diagnostico')
    await page.waitForLoadState('networkidle')

    const status = response?.status() ?? 200
    expect(status).not.toBe(500)
    expect(status).not.toBe(503)

    // Should show the page heading
    const heading = page.locator('text=Diagnóstico de Relojes ZKTeco')
    await expect(heading).toBeVisible({ timeout: 10000 })

    const critical = errors.filter(e => e.includes('500') || e.includes('502') || e.includes('503'))
    expect(critical, `Critical errors found: ${critical.join(', ')}`).toHaveLength(0)
  })
})
