'use client'

import { createContext, useContext, useEffect, useState } from 'react'

export type Lang = 'en' | 'zh'

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: 'en',
  setLang: () => {},
})

const STORAGE_KEY = 'gbi-lang'

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en')

  // Restore the previously chosen language on mount so a page refresh keeps it.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (saved === 'zh' || saved === 'en') setLangState(saved)
    } catch {
      // ignore storage access errors (private mode, etc.)
    }
  }, [])

  function setLang(next: Lang) {
    setLangState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore
    }
  }

  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>
}

export function useLang() {
  return useContext(LangContext)
}
