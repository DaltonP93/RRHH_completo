import { test, expect } from '@playwright/test'

test.describe('API health checks', () => {
  test('GET /api/health returns { status: "ok" }', async ({ request }) => {
    const response = await request.get('/api/health', { timeout: 10000 })
    expect(response.status()).toBe(200)

    const body = await response.json().catch(() => null)
    expect(body).not.toBeNull()
    expect(body).toHaveProperty('status')
    expect(body.status).toBe('ok')
  })

  test('no occurrence of "localhost:4000" in /portal HTML response', async ({ page, request }) => {
    // Check the raw HTML source of /portal (using the request context to bypass client-side rendering)
    const response = await request.get('/portal')
    const text = await response.text()

    // localhost:4000 must not leak into SSR/SSG HTML
    expect(text).not.toContain('localhost:4000')
  })

  test('GET /api/permissions returns valid JSON (no 500)', async ({ request }) => {
    const response = await request.get('/api/permissions', { timeout: 10000 })

    expect(response.status()).not.toBe(500)
    expect(response.status()).not.toBe(503)
    expect(response.status()).toBe(200)

    const body = await response.json().catch(() => null)
    expect(body).not.toBeNull()
  })

  test('GET /api/roles returns valid JSON (no 500)', async ({ request }) => {
    const response = await request.get('/api/roles', { timeout: 10000 })

    expect(response.status()).not.toBe(500)
    expect(response.status()).not.toBe(503)
    expect(response.status()).toBe(200)

    const body = await response.json().catch(() => null)
    expect(body).not.toBeNull()
  })

  test('GET /api/companies returns valid JSON (no 500)', async ({ request }) => {
    const response = await request.get('/api/companies', { timeout: 10000 })

    expect(response.status()).not.toBe(500)
    expect(response.status()).not.toBe(503)
    expect(response.status()).toBe(200)

    const body = await response.json().catch(() => null)
    expect(body).not.toBeNull()
  })

  test('GET /api/audit returns valid JSON (no 500)', async ({ request }) => {
    const response = await request.get('/api/audit', { timeout: 10000 })

    expect(response.status()).not.toBe(500)
    expect(response.status()).not.toBe(503)
    expect(response.status()).toBe(200)

    const body = await response.json().catch(() => null)
    expect(body).not.toBeNull()
  })
})
