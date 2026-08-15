import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import PomodoroWindow from './views/PomodoroWindow'

const isPomodoro = new URLSearchParams(window.location.search).get('view') === 'pomodoro'

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isPomodoro ? <PomodoroWindow /> : <App />}</StrictMode>
)
