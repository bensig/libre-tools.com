import { Buffer } from 'buffer'
// bip39 (used by the /rekey key derivation) relies on Node's Buffer global,
// which Vite does not provide in the browser. Polyfill it before app code runs.
if (typeof globalThis.Buffer === 'undefined') globalThis.Buffer = Buffer

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './theme.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
