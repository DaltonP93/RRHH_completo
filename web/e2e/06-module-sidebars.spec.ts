import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test.describe('Module sidebars', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('/empleados sidebar title contains "Personas" or "Empleados"', async ({ page }) => {
    await page.goto('/empleados')
    await page.waitForLoadState('networkidle')

    // The ModuleSidebar should have a title indicating the Personas/Empleados module
    const sidebarTitle = page.locator(
      'nav, aside, [class*="sidebar"], [class*="Sidebar"]',
    )
    const titleText = await sidebarTitle.first().textContent().catch(() => '')
    expect(titleText).toMatch(/Personas|Empleados/i)
  })

  test('/asistencia sidebar has link to /asistencia/tiempo-real', async ({ page }) => {
    await page.goto('/asistencia')
    await page.waitForLoadState('networkidle')

    const tiempoRealLink = page.locator('a[href="/asistencia/tiempo-real"]')
    await expect(tiempoRealLink).toBeVisible({ timeout: 10000 })
  })

  test('/nomina sidebar has link to /nomina/liquidaciones', async ({ page }) => {
    await page.goto('/nomina')
    await page.waitForLoadState('networkidle')

    const liquidacionesLink = page.locator('a[href="/nomina/liquidaciones"]')
    await expect(liquidacionesLink).toBeVisible({ timeout: 10000 })
  })

  test('/seguridad/roles sidebar has link to /seguridad/roles', async ({ page }) => {
    await page.goto('/seguridad/roles')
    await page.waitForLoadState('networkidle')

    // The sidebar should contain a link to /seguridad/roles (itself, as active item, or another nav link)
    const rolesLink = page.locator('a[href="/seguridad/roles"]')
    await expect(rolesLink).toBeVisible({ timeout: 10000 })
  })
})
