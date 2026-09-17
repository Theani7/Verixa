import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import SharedThread from './SharedThread'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

const shareMatch = window.location.pathname.match(/^\/t\/([\w-]+)\/?$/)

createRoot(root).render(
  <StrictMode>
    {shareMatch ? <SharedThread id={shareMatch[1]} /> : <App />}
  </StrictMode>,
)
