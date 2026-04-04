import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import PickSubmission from './PickSubmission.jsx'

const params = new URLSearchParams(window.location.search)
const path = window.location.pathname
const isMobile = window.innerWidth <= 768

console.log("Current path:", path)
console.log("Params:", params.toString())

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {path.includes('pick') ? <PickSubmission /> : <App />}
  </StrictMode>
)