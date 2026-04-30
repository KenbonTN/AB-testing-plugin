import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { framer } from 'framer-plugin'
import { App } from './App'

// Tell Framer the plugin panel dimensions — without this call Framer
// keeps showing its own loading spinner indefinitely.
framer.showUI({
  position: "top right",
  width: 320, 
  height: 720, 
  resizable: false,
});

const root = createRoot(document.getElementById('root')!)

root.render(
  <StrictMode>
    <App />
  </StrictMode>
)
