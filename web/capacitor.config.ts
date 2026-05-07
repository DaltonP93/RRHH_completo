/// <reference types="@capacitor/cli" />
/**
 * Configuración Capacitor para SisHoras.
 *
 * MODO HÍBRIDO (recomendado para nuestro caso):
 * - La app web sigue corriendo en el servidor (https://sishoras.saa.com.py)
 * - La app nativa solo es un "shell" que carga esa URL en un WebView con
 *   permisos nativos. Así NO hay que reconstruir/redeployar la app cada vez
 *   que cambia el código web — se actualiza sola al recargar.
 *
 * MODO BUNDLE (alternativa estática):
 * - Comentar `server.url` y dejar `webDir: 'out'`
 * - Correr `npm run build:export` y luego `npx cap sync`
 * - El bundle queda dentro del APK/IPA — útil para offline pero hay que
 *   redeployar cada cambio.
 *
 * Empezar con modo HÍBRIDO. Cuando todo esté estable, evaluar bundle.
 */
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId:   'py.saa.sishoras',
  appName: 'SisHoras',
  webDir:  'out',           // necesario aunque uses server.url (Capacitor crea un index)

  // ── MODO HÍBRIDO ─────────────────────────────────────────────
  server: {
    url: 'https://sishoras.saa.com.py',
    cleartext: false,        // forzar HTTPS (requiere Let's Encrypt válido)
    androidScheme: 'https',
  },

  // ── Plugins ──────────────────────────────────────────────────
  plugins: {
    // Pantalla de splash mientras carga
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor:    '#0f172a',
      androidSplashResourceName: 'splash',
      androidScaleType:   'CENTER_CROP',
      showSpinner:        true,
      spinnerColor:       '#2563eb',
    },
    // Color de la status bar (notch / barra superior)
    StatusBar: {
      style:           'DARK',
      backgroundColor: '#0f172a',
      overlaysWebView: true,
    },
    // Geolocalización con alta precisión y permisos auto
    Geolocation: {
      // En iOS, NSLocationWhenInUseUsageDescription debe estar en Info.plist
      // En Android, ACCESS_FINE_LOCATION en AndroidManifest.xml (lo agrega Capacitor)
    },
    // Cámara — selfies y QR
    Camera: {
      // En iOS, NSCameraUsageDescription debe estar en Info.plist
      // En Android, CAMERA permission en AndroidManifest.xml
    },
  },

  // ── Configuración Android ────────────────────────────────────
  android: {
    allowMixedContent:        false,
    captureInput:             true,
    webContentsDebuggingEnabled: false,  // poner true para debug en Chrome DevTools
  },

  // ── Configuración iOS ────────────────────────────────────────
  ios: {
    contentInset: 'always',
  },
}

export default config
