/**
 * capacitor.ts — bridge para funciones nativas de Capacitor.
 * Los paquetes @capacitor/* son opcionales (solo se usan en builds nativos).
 * En web todo cae a implementaciones nativas del browser.
 *
 * Los imports dinámicos usan Function() para evitar que TypeScript intente
 * resolver tipos de módulos que no están instalados en el proyecto web.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// Importar dinámicamente sin que TS valide los tipos del módulo
async function cap(pkg: string): Promise<any> {
  return new Function('p', 'return import(p)')(pkg)
}

export function isNative(): boolean {
  if (typeof window === 'undefined') return false
  return !!(window as any).Capacitor?.isNativePlatform?.()
}

export function platform(): 'ios' | 'android' | 'web' {
  if (typeof window === 'undefined') return 'web'
  return (window as any).Capacitor?.getPlatform?.() || 'web'
}

// ── Notificaciones locales ───────────────────────────────────────
export async function scheduleLocalNotification(title: string, body: string, atMs?: number) {
  if (!isNative()) {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body })
    }
    return
  }
  const { LocalNotifications } = await cap('@capacitor/local-notifications')
  await LocalNotifications.schedule({
    notifications: [{
      id: Date.now(),
      title,
      body,
      schedule: atMs ? { at: new Date(atMs) } : undefined,
    }],
  })
}

// ── Push Notifications ───────────────────────────────────────────
export async function registerPushToken(apiRegisterFn: (token: string) => Promise<void>) {
  if (!isNative()) return
  const { PushNotifications } = await cap('@capacitor/push-notifications')
  const perm = await PushNotifications.requestPermissions()
  if (perm.receive !== 'granted') return
  await PushNotifications.register()
  PushNotifications.addListener('registration', async ({ value }: { value: string }) => {
    await apiRegisterFn(value)
  })
}

// ── Cámara nativa ────────────────────────────────────────────────
export async function takeSelfieNative(): Promise<string | null> {
  if (!isNative()) return null
  const { Camera, CameraResultType, CameraSource } = await cap('@capacitor/camera')
  const photo = await Camera.getPhoto({
    quality: 80,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Camera,
  })
  return photo.dataUrl || null
}

// ── Red / offline ────────────────────────────────────────────────
export async function getNetworkStatus(): Promise<{ connected: boolean; type: string }> {
  if (!isNative()) return { connected: navigator.onLine, type: 'unknown' }
  const { Network } = await cap('@capacitor/network')
  const s = await Network.getStatus()
  return { connected: s.connected, type: s.connectionType }
}

// ── Compartir archivo ────────────────────────────────────────────
export async function shareFile(url: string, title: string) {
  if (isNative()) {
    const { Share } = await cap('@capacitor/share')
    await Share.share({ title, url, dialogTitle: title })
  } else {
    window.open(url, '_blank')
  }
}

// ── Status bar ───────────────────────────────────────────────────
export async function setStatusBarColor(color: string, isDark = true) {
  if (!isNative()) return
  const { StatusBar, Style } = await cap('@capacitor/status-bar')
  await StatusBar.setBackgroundColor({ color })
  await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light })
}
