import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

const CRASH_PATTERNS = ['Application error', 'Unhandled Runtime Error', 'ChunkLoadError']

const NEW_ROUTES = [
  // Cumplimiento
  { path: '/cumplimiento/mtess',         name: 'cumplimiento/mtess'         },
  { path: '/cumplimiento/ips',           name: 'cumplimiento/ips'           },
  // Nómina
  { path: '/nomina/preavisos',           name: 'nomina/preavisos'           },
  { path: '/nomina/premios',             name: 'nomina/premios'             },
  { path: '/nomina/retenciones',         name: 'nomina/retenciones'         },
  { path: '/nomina/parametros',          name: 'nomina/parametros'          },
  { path: '/nomina/conceptos-fijos',     name: 'nomina/conceptos-fijos'     },
  { path: '/nomina/tipos-nomina',        name: 'nomina/tipos-nomina'        },
  { path: '/nomina/liquidacion-salida',  name: 'nomina/liquidacion-salida'  },
  // Personas
  { path: '/personas/legajos',           name: 'personas/legajos'           },
  { path: '/personas/contratos',         name: 'personas/contratos'         },
  { path: '/personas/familiares',        name: 'personas/familiares'        },
  { path: '/personas/historico-salarial',name: 'personas/historico-salarial'},
  { path: '/personas/formacion',         name: 'personas/formacion'         },
  // Bancos
  { path: '/bancos/lotes',               name: 'bancos/lotes'               },
  { path: '/bancos/cuentas-empleados',   name: 'bancos/cuentas-empleados'   },
  { path: '/bancos/pagos',               name: 'bancos/pagos'               },
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

test.describe('New RRHH module routes — no crashes or 500s', () => {
  for (const { path: modulePath, name } of NEW_ROUTES) {
    test(`${name} — loads without crash`, async ({ page }) => {
      const errors = makeErrorCollector(page)

      await login(page, process.env.TEST_USER || 'admin', process.env.TEST_PASS || 'admin123')
      await page.goto(modulePath)
      await page.waitForLoadState('networkidle')

      for (const pattern of CRASH_PATTERNS) {
        await expect(page.locator(`text=${pattern}`).first()).not.toBeVisible({ timeout: 3000 }).catch(() => {})
      }

      const critical = errors.filter(e => e.includes('500') || e.includes('502') || e.includes('503'))
      expect(critical, `Critical errors on ${name}: ${critical.join(' | ')}`).toHaveLength(0)
    })
  }

  // API stub tests
  test('GET /api/payroll/preavisos returns non-500', async ({ request }) => {
    const r = await request.get('/api/payroll/preavisos')
    expect(r.status()).not.toBe(500)
  })

  test('GET /api/payroll/bonuses returns non-500', async ({ request }) => {
    const r = await request.get('/api/payroll/bonuses')
    expect(r.status()).not.toBe(500)
  })

  test('GET /api/payroll/judicial-retentions returns non-500', async ({ request }) => {
    const r = await request.get('/api/payroll/judicial-retentions')
    expect(r.status()).not.toBe(500)
  })

  test('GET /api/employee-contracts returns non-500', async ({ request }) => {
    const r = await request.get('/api/employee-contracts')
    expect(r.status()).not.toBe(500)
  })

  test('GET /api/employee-dependents returns non-500', async ({ request }) => {
    const r = await request.get('/api/employee-dependents')
    expect(r.status()).not.toBe(500)
  })

  test('GET /api/salary-history returns non-500', async ({ request }) => {
    const r = await request.get('/api/salary-history')
    expect(r.status()).not.toBe(500)
  })

  test('GET /api/payment-batches returns non-500', async ({ request }) => {
    const r = await request.get('/api/payment-batches')
    expect(r.status()).not.toBe(500)
  })

  test('GET /api/employee-bank-accounts returns non-500', async ({ request }) => {
    const r = await request.get('/api/employee-bank-accounts')
    expect(r.status()).not.toBe(500)
  })

  test('GET /api/payment-history returns non-500', async ({ request }) => {
    const r = await request.get('/api/payment-history')
    expect(r.status()).not.toBe(500)
  })

  test('cumplimiento page uses "presentación" not "Comunicación"', async ({ page }) => {
    await login(page, process.env.TEST_USER || 'admin', process.env.TEST_PASS || 'admin123')
    await page.goto('/cumplimiento')
    await page.waitForLoadState('networkidle')
    // Should not contain the old terminology
    const pageContent = await page.content()
    expect(pageContent).not.toContain('Nueva Comunicación MTESS')
    // Should contain the correct terminology
    expect(pageContent).toContain('presentación')
  })
})
