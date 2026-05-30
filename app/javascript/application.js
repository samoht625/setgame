// Entry point for the build script in your package.json
import { createRoot } from 'react-dom/client'
import App from './components/App'

document.addEventListener('DOMContentLoaded', () => {
  // Both / (multiplayer) and /s (solitaire) render the same shell;
  // the App decides which mode to show based on the current path.
  const rootElement = document.getElementById('root') || document.getElementById('solitaire-root')
  if (rootElement) {
    createRoot(rootElement).render(<App />)
  }
})
