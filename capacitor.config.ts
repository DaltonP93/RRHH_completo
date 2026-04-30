import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'py.com.saa.sishoras',
  appName: 'SisHoras',
  webDir: 'web/out',           // next export → out/
  server: {
    // En desarrollo apunta al servidor web para HMR.
    // En producción remover esta sección y usar webDir.
    url: process.env.CAPACITOR_DEV_URL || 'https://sishoras.saa.com.py',
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#0f172a',
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_sishoras',
      iconColor: '#3b82f6',
    },
    Camera: {
      // Permisos de cámara para selfie check-in
    },
    Filesystem: {
      // Lectura/escritura de reportes descargados
    },
    Network: {
      // Detectar offline para cola de marcajes
    },
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: 'automatic',
    scrollEnabled: true,
  },
}

export default config
