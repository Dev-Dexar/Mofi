import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import '@/hooks/useAppSettings' // starts asking for the live rules right away
import App from '@/app/App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
