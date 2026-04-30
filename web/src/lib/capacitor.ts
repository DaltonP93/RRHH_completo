/**
 * capacitor.ts — bridge para funciones nativas de Capacitor.
 * Todos los imports son dinámicos para evitar SSR crashes.
 * En navegador de escritorio las funciones caen a implementaciones web.
 */

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
    if (Notification?.permission === 'granted') new Notification(title, { body })
    return
  }
  const { LocalNotifications } = await import('@capacitor/local-notifications')
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
  const { PushNotifications } = await import('@capacitor/push-notifications')
  const perm = await PushNotifications.requestPermissions()
  if (perm.receive !== 'granted') return
  await PushNotifications.register()
  PushNotifications.addListener('registration', async ({ value }) => {
    await apiRegisterFn(value)
  })
}

// ── Cámara nativa ────────────────────────────────────────────────
export async function takeSelfieNative(): Promise<string | null> {
  if (!isNative()) return null
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
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
  const { Network } = await import('@capacitor/network')
  const s = await Network.getStatus()
  return { connected: s.connected, type: s.connectionType }
}

// ── Compartir archivo ────────────────────────────────────────────
export async function shareFile(url: string, title: string) {
  if (isNative()) {
    const { Share } = await import('@capacitor/share')
    await Share.share({ title, url, dialogTitle: title })
  } else {
    window.open(url, '_blank')
  }
}

// ── Status bar ───────────────────────────────────────────────────
export async function setStatusBarColor(color: string, isDark = true) {
  if (!isNative()) return
  const { StatusBar, Style } = await import('@capacitor/status-bar')
  await StatusBar.setBackgroundColor({ color })
  await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light })
}
