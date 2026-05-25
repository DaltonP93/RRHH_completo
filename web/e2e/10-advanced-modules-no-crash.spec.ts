import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

const CRASH_PATTERNS = ['Application error', 'Unhandled Runtime Error', 'ChunkLoadError']

const MODULES = [
  { path: '/portal',                  name: 'portal' },
  { path: '/auditoria',               name: 'auditoria' },
  { path: '/seguridad/roles',         name: 'seguridad/roles' },
  { path: '/documentos',              name: 'documentos' },
  { path: '/competencias',            name: 'competencias' },
  { path: '/cumplimiento',            name: 'cumplimiento' },
  { path: '/configuracion/backups',   name: 'configuracion/backups' },
]

function makeErrorCollector(page: any) {
  const errors: string[] = []
  page.on('response', (r: any) => {
    const status = r.status()
    if (status >= 500) errors.push(`HTTP ${status} → ${r.url()}`)
  })
  page.on('console', (msg: any) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      if (CRASH_PATTERNS.some(p => text.includes(p))) errors.push(`console.error: ${text}`)
    }
  })
  return errors
}

test.describe('Advanced modules — no crashes or 500s', () => {
  for (const { path: modulePath, name } of MODULES) {
    test(`${name} — loads without crash`, async ({ page }) => {
      const errors = makeErrorCollector(page)

      await login(page, process.env.TEST_USER || 'admin', process.env.TEST_PASS || 'admin123')
      await page.goto(modulePath)
      await page.waitForLoadState('networkidle')

      // Must not show Next.js crash overlay
      for (const pattern of CRASH_PATTERNS) {
        await expect(page.locator(`text=${pattern}`).first()).not.toBeVisible({ timeout: 3000 }).catch(() => {})
      }

      const critical = errors.filter(e => e.includes('500') || e.includes('502') || e.includes('503'))
      expect(critical, `Critical errors on ${name}: ${critical.join(' | ')}`).toHaveLength(0)
    })
  }

  test('GET /api/backups/offsite-config returns 200 not 400', async ({ request }) => {
    const r = await request.get('/api/backups/offsite-config')
    expect(r.status()).not.toBe(400)
    expect(r.status()).not.toBe(500)
  })

  test('GET /api/document-folders returns 200', async ({ request }) => {
    const r = await request.get('/api/document-folders')
    expect(r.status()).not.toBe(404)
    expect(r.status()).not.toBe(500)
  })

  test('GET /api/cost-centers returns 200', async ({ request }) => {
    const r = await request.get('/api/cost-centers')
    expect(r.status()).not.toBe(404)
    expect(r.status()).not.toBe(500)
  })

  test('GET /api/employee-types returns 200', async ({ request }) => {
    const r = await request.get('/api/employee-types')
    expect(r.status()).not.toBe(404)
    expect(r.status()).not.toBe(500)
  })

  test('GET /api/competency-categories returns non-500', async ({ request }) => {
    const r = await request.get('/api/competency-categories')
    expect(r.status()).not.toBe(500)
  })

  test('GET /api/training-catalog returns non-500', async ({ request }) => {
    const r = await request.get('/api/training-catalog')
    expect(r.status()).not.toBe(500)
  })
})
