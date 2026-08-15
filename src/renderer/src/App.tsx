import { useCallback, useEffect, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import type { Conversation } from '../../shared/types'
import ChatView from './views/ChatView'
import LeftPanel from './views/LeftPanel'
import FilesView from './views/FilesView'
import SettingsView from './views/SettingsView'
import TrashView from './views/TrashView'

function App(): React.JSX.Element {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [maximized, setMaximized] = useState(false)

  const refreshConversations = useCallback(() => {
    window.agentApi.listConversations().then(setConversations)
  }, [])

  useEffect(() => {
    window.agentApi.getPersona().then((p) => {
      document.documentElement.style.setProperty('--accent', p.themeColor || '#4f7cff')
    })
    refreshConversations()
  }, [refreshConversations])

  useEffect(() => {
    const off = window.agentApi.onChatChanged(() => refreshConversations())
    return off
  }, [refreshConversations])

  useEffect(() => {
    const off = window.agentApi.onPersonaChanged(() => {
      window.agentApi.getPersona().then((p) => {
        document.documentElement.style.setProperty('--accent', p.themeColor || '#4f7cff')
      })
    })
    return off
  }, [])

  useEffect(() => {
    window.agentApi.windowControls.isMaximized().then(setMaximized)
    const off = window.agentApi.windowControls.onMaximizedChange(setMaximized)
    return off
  }, [])

  const selectConversation = (id: string): void => setActiveId(id)
  const newConversation = (): void => setActiveId(null)

  const handleCreated = (id: string): void => {
    setActiveId(id)
    refreshConversations()
  }

  const handleRename = async (id: string, title: string): Promise<void> => {
    await window.agentApi.renameConversation(id, title)
    refreshConversations()
  }

  const handleDelete = async (id: string): Promise<void> => {
    await window.agentApi.deleteConversation(id)
    if (activeId === id) setActiveId(null)
    refreshConversations()
  }

  const applyPersona = (_name: string, themeColor: string): void => {
    document.documentElement.style.setProperty('--accent', themeColor || '#4f7cff')
  }

  const toggleMaximize = (): void => {
    void window.agentApi.windowControls.toggleMaximize().then(setMaximized)
  }

  return (
    <div className={`window${maximized ? ' maximized' : ''}`}>
      <div className="window-content">
      <div className="titlebar" onDoubleClick={toggleMaximize}>
        <div className="titlebar-title">个人助手</div>
        <div className="titlebar-controls">
          <button className="titlebar-btn" onClick={() => void window.agentApi.windowControls.minimize()} title="最小化">
            ─
          </button>
          <button className="titlebar-btn" onClick={toggleMaximize} title="最大化/还原">
            {maximized ? '❐' : '□'}
          </button>
          <button className="titlebar-btn close" onClick={() => void window.agentApi.windowControls.close()} title="关闭">
            ×
          </button>
        </div>
      </div>
      <div className="app-body">
        <PanelGroup direction="horizontal" autoSaveId="main-layout-v2" className="app">
      <Panel defaultSize={20} minSize={16} className="panel">
        <LeftPanel
          conversations={conversations}
          activeId={activeId}
          onSelect={selectConversation}
          onNew={newConversation}
          onRename={handleRename}
          onDelete={handleDelete}
        />
      </Panel>
      <PanelResizeHandle className="resize-handle" />
      <Panel defaultSize={50} minSize={34} className="panel">
        <ChatView
          activeId={activeId}
          title={conversations.find((c) => c.id === activeId)?.title ?? '新对话'}
          onCreated={handleCreated}
        />
      </Panel>
      <PanelResizeHandle className="resize-handle" />
      <Panel defaultSize={30} minSize={20} className="panel">
        <div className="panel-scroll">
          <SettingsView onSaved={applyPersona} />
          <FilesView />
          <TrashView />
        </div>
      </Panel>
        </PanelGroup>
      </div>
      </div>
    </div>
  )
}

export default App
