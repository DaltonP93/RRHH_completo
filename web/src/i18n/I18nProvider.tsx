'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import es from './locales/es.json'
import en from './locales/en.json'
import pt from './locales/pt.json'

export type Locale = 'es' | 'en' | 'pt'

const DICTS: Record<Locale, any> = { es, en, pt }
const STORAGE_KEY = 'sishoras_locale'
const DEFAULT: Locale = 'es'

type I18nContextValue = {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

function getNested(obj: any, path: string): string | undefined {
  return path.split('.').reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), obj)
}

function interpolate(str: string, vars?: Record<string, string | number>) {
  if (!vars) return str
  return str.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`))
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = localStorage.getItem(STORAGE_KEY) as Locale | null
    if (stored && DICTS[stored]) setLocaleState(stored)
    else {
      const browser = navigator.language?.slice(0, 2).toLowerCase()
      if (browser === 'en' || browser === 'pt') setLocaleState(browser as Locale)
    }
  }, [])

  function setLocale(l: Locale) {
    setLocaleState(l)
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, l)
      document.documentElement.lang = l
    }
  }

  function t(key: string, vars?: Record<string, string | number>) {
    const fromCurrent = getNested(DICTS[locale], key)
    if (typeof fromCurrent === 'string') return interpolate(fromCurrent, vars)
    const fromDefault = getNested(DICTS[DEFAULT], key)
    if (typeof fromDefault === 'string') return interpolate(fromDefault, vars)
    return key
  }

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    return {
      locale: DEFAULT,
      setLocale: () => {},
      t: (key: string, vars?: Record<string, string | number>) => {
        const v = getNested(DICTS[DEFAULT], key)
        return typeof v === 'string' ? interpolate(v, vars) : key
      },
    }
  }
  return ctx
}

export function useTranslation() {
  return useI18n()
}
