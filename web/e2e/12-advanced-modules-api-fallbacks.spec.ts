import { test, expect } from '@playwright/test'

/**
 * Validates that advanced-module endpoints return 200 (not 500) even when
 * the underlying tables do not yet exist in staging (pre-migration 076).
 *
 * All tested routes must respond with either:
 *   - 200 + array / { data: [] }
 *   - 401/403 (auth required — acceptable, not a server error)
 *
 * They must NEVER return 500, 502, or 503.
 */

const ENDPOINTS = [
  '/api/document-templates',
  '/api/competencies',
  '/api/competency-categories',
  '/api/competency-levels',
  '/api/performance-cycles',
  '/api/appraisals',
]

test.describe('Advanced modules API — non-500 fallbacks', () => {
  for (const endpoint of ENDPOINTS) {
    test(`GET ${endpoint} returns non-500`, async ({ request }) => {
      const r = await request.get(endpoint)
      expect(r.status(), `${endpoint} returned ${r.status()}`).not.toBe(500)
      expect(r.status()).not.toBe(502)
      expect(r.status()).not.toBe(503)
    })
  }

  test('GET /api/document-templates returns array or data wrapper on 200', async ({ request }) => {
    const r = await request.get('/api/document-templates')
    if (r.status() === 200) {
      const body = await r.json()
      // Must be array or { data: [] } or { ok: true, data: [] }
      const isArray = Array.isArray(body)
      const hasData = Array.isArray(body?.data)
      expect(isArray || hasData, 'document-templates body must be array or have .data array').toBe(true)
    }
  })

  test('GET /api/competencies returns array on 200', async ({ request }) => {
    const r = await request.get('/api/competencies')
    if (r.status() === 200) {
      const body = await r.json()
      expect(Array.isArray(body) || Array.isArray(body?.data)).toBe(true)
    }
  })

  test('GET /api/competency-levels returns array on 200', async ({ request }) => {
    const r = await request.get('/api/competency-levels')
    if (r.status() === 200) {
      const body = await r.json()
      expect(Array.isArray(body) || Array.isArray(body?.data)).toBe(true)
    }
  })

  test('GET /api/performance-cycles returns array on 200', async ({ request }) => {
    const r = await request.get('/api/performance-cycles')
    if (r.status() === 200) {
      const body = await r.json()
      expect(Array.isArray(body) || Array.isArray(body?.data)).toBe(true)
    }
  })

  test('GET /api/appraisals returns data wrapper on 200', async ({ request }) => {
    const r = await request.get('/api/appraisals')
    if (r.status() === 200) {
      const body = await r.json()
      // Appraisals returns { ok, data, total }
      const isArray = Array.isArray(body)
      const hasData = Array.isArray(body?.data)
      expect(isArray || hasData).toBe(true)
    }
  })
})
