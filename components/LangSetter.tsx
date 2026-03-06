'use client'

import { useEffect } from 'react'

interface LangSetterProps {
  locale: string
}

export default function LangSetter({ locale }: LangSetterProps) {
  useEffect(() => {
    document.documentElement.setAttribute('lang', locale)
  }, [locale])

  return null
}
