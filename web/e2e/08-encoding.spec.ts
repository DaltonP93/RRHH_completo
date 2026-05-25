import { test, expect } from '@playwright/test'

/**
 * Encoding tests — verify that the API does not return mojibake (double-encoded UTF-8).
 *
 * Mojibake examples caused by charset mismatch:
 *   "NÃ³" instead of "Nó"
 *   "Ã³"  instead of "ó"
 *   "Ã­"  instead of "í"
 *   "marcaciÃ³n" instead of "marcación"
 *   "importaciÃ³n" instead of "importación"
 *   "AuditorÃ­a" instead of "Auditoría"
 */

test.describe('API response encoding', () => {
  test('GET /api/roles response body contains no mojibake characters', async ({ request }) => {
    const response = await request.get('/api/roles', { timeout: 10000 })
    expect(response.status()).toBe(200)

    const text = await response.text()

    // These patterns indicate double-encoded UTF-8 (Latin-1 interpreted as UTF-8)
    expect(text).not.toContain('NÃ³')
    expect(text).not.toContain('Ã³')
    expect(text).not.toContain('Ã­')
    expect(text).not.toContain('Ã³') // alt representation of Ã³
  })

  test('GET /api/permissions response body contains no mojibake characters', async ({ request }) => {
    const response = await request.get('/api/permissions', { timeout: 10000 })
    expect(response.status()).toBe(200)

    const text = await response.text()

    expect(text).not.toContain('marcaciÃ³n')
    expect(text).not.toContain('importaciÃ³n')
    expect(text).not.toContain('AuditorÃ­a')
    expect(text).not.toContain('Ã³')
    expect(text).not.toContain('Ã­')
  })
})
