import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@/index.css'

export function mount(node: React.ReactNode) {
  createRoot(document.getElementById('root')!).render(<StrictMode>{node}</StrictMode>)
}
