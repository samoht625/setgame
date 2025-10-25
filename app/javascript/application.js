// Entry point for the build script in your package.json
// Initialize ActionCable consumer
import "./cable"

// Mount React app
import { createRoot } from 'react-dom/client'
import App from './components/App'
import SolitaireApp from './solitaire/SolitaireApp'

document.addEventListener('DOMContentLoaded', () => {
  const solitaireRoot = document.getElementById('solitaire-root')
  if (solitaireRoot) {
    const reactRoot = createRoot(solitaireRoot)
    reactRoot.render(<SolitaireApp />)
    return
  }

  const root = document.getElementById('root')
  if (root) {
    const reactRoot = createRoot(root)
    reactRoot.render(<App />)
  }
})
