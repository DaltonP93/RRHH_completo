import { test, expect, Page } from '@playwright/test'
import { login } from './helpers/auth'

// Use persisted auth state when available; falls back to login() per-test if the file
// does not exist yet (CI will create it via a global setup step).
test.use({ storageState: { path: 'playwright/.auth/admin.json', forceReset: false } as any })

const CRASH_REGEX = /Application error|client-side exception|Uncaught TypeError/i

const ROUTES = [
  { path: '/portal',                      name: 'portal' },
  { path: '/empleados',                   name: 'empleados' },
  { path: '/personas/sucursales',         name: 'personas/sucursales' },
  { path: '/asistencia/tiempo-real',      name: 'asistencia/tiempo-real' },
  { path: '/asistencia/relojes/diagnostico', name: 'asistencia/relojes/diagnostico' },
  { path: '/nomina',                      name: 'nomina' },
  { path: '/cumplimiento',                name: 'cumplimiento' },
  { path: '/documentos',                  name: 'documentos' },
  { path: '/competencias',                name: 'competencias' },
  { path: '/reportes',                    name: 'reportes' },
  { path: '/auditoria',                   name: 'auditoria' },
  { path: '/seguridad/roles',             name: 'seguridad/roles' },
]

// ---------------------------------------------------------------------------
// Helper: navigate to a page and run all stability assertions
// ---------------------------------------------------------------------------
async function checkPage(page: Page, path: string): Promise<void> {
  const httpErrors: string[] = []
  const consoleErrors: string[] = []

  // Collect HTTP 5xx responses
  page.on('response', (response) => {
    const status = response.status()
    if (status === 500 || status === 502 || status === 503) {
      httpErrors.push(`HTTP ${status} → ${response.url()}`)
    }
  })

  // Collect console errors
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text())
    }
  })

  // Navigate and wait for the network to settle
  await page.goto(path)
  await page.waitForLoadState('networkidle')

  // 1. No crash overlay text visible
  const pageContent = await page.content()
  const crashMatch = pageContent.match(CRASH_REGEX)
  expect(
    crashMatch,
    `Crash text found on ${path}: "${crashMatch?.[0]}"`,
  ).toBeNull()

  // 2. No 500/502/503 HTTP responses
  expect(
    httpErrors,
    `Server errors on ${path}: ${httpErrors.join(' | ')}`,
  ).toHaveLength(0)

  // 3. Page has at least a <main> or <h1> element (not a blank render)
  const hasMain = await page.locator('main').count()
  const hasH1   = await page.locator('h1').count()
  expect(
    hasMain + hasH1,
    `Page ${path} has neither <main> nor <h1> — likely blank or unrendered`,
  ).toBeGreaterThan(0)
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
test.describe('Business flow navigation', () => {
  // Ensure we are authenticated before each test. If storageState is already
  // loaded by Playwright's global setup the login() call is a no-op (redirect
  // happens immediately); if not, it performs the full login.
  test.beforeEach(async ({ page }) => {
    // Attempt a lightweight auth check; if not logged in, use the helper.
    await page.goto('/portal')
    const url = page.url()
    if (url.includes('/login')) {
      await login(page, process.env.TEST_USER || 'admin', process.env.TEST_PASS || 'admin123')
    }
  })

  for (const { path: routePath, name } of ROUTES) {
    test(`${name} — no crash, no 500, has main/h1`, async ({ page }) => {
      await checkPage(page, routePath)
    })
  }
})
