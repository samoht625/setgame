// Entry point for the build script in your package.json
// Initialize ActionCable consumer
import "./cable"

// Mount React app
import { createRoot } from 'react-dom/client'
import App from './components/App'

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('root')
  if (root) {
    const reactRoot = createRoot(root)
    reactRoot.render(<App />)
  }
})
