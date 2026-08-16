import { useEffect, useState } from 'react'
import { Settings, Timer } from 'lucide-react'
import DateTime from './DateTime'
import SchedulePanel from './SchedulePanel'
import SettingsView from './SettingsView'

interface Props {
  onPersonaSaved: (name: string, themeColor: string) => void
}

export default function RightPanel({ onPersonaSaved }: Props): React.JSX.Element {
  const [showSettings, setShowSettings] = useState(false)
  const [pomodoroOpen, setPomodoroOpen] = useState(false)

  useEffect(() => {
    void window.agentApi.isPomodoroOpen().then(setPomodoroOpen)
    return window.agentApi.onPomodoroOpenChanged(setPomodoroOpen)
  }, [])

  const togglePomodoro = (): void => {
    void window.agentApi.setPomodoroOpen(!pomodoroOpen)
  }

  return (
    <div className="right-panel">
      <div className={`right-scroll${showSettings ? '' : ' right-scroll-fixed'}`}>
        {showSettings ? (
          <>
            <div className="right-settings-head">
              <div className="right-settings-title">设置</div>
            </div>
            <SettingsView onSaved={onPersonaSaved} />
          </>
        ) : (
          <>
            <DateTime />
            <SchedulePanel />
          </>
        )}
      </div>

      <button
        className={`pomodoro-fab${pomodoroOpen ? ' active' : ''}`}
        onClick={togglePomodoro}
        title={pomodoroOpen ? '关闭番茄钟' : '打开番茄钟'}
      >
        <Timer size={20} />
      </button>

      <button
        className={`gear-btn${showSettings ? ' active' : ''}`}
        onClick={() => setShowSettings((v) => !v)}
        title="设置"
      >
        <Settings size={20} />
      </button>
    </div>
  )
}
