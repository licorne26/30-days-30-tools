import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'

function readSaved(): 'light' | 'dark' | null {
  try {
    const v = localStorage.getItem('theme')
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  useEffect(() => {
    // Follow the system setting until the visitor picks a theme themselves.
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => {
      if (!readSaved()) setDark(e.matches)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light')
    } catch {
      /* private mode: keep it in memory only */
    }
  }

  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="切换深浅色">
      {dark ? <Sun /> : <Moon />}
    </Button>
  )
}
