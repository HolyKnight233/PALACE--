import { useCallback, useEffect, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import type { Conversation, Persona } from '../../shared/types'
import ChatView from './views/ChatView'
import ConversationList from './views/ConversationList'
import RightPanel from './views/RightPanel'

function App(): React.JSX.Element {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [personas, setPersonas] = useState<Persona[]>([])
  const [trashPersonas, setTrashPersonas] = useState<Persona[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [maximized, setMaximized] = useState(false)

  const refreshConversations = useCallback(() => {
    window.agentApi.listConversations().then(setConversations)
  }, [])

  const loadPersonas = useCallback(() => {
    window.agentApi.getPersonas().then(setPersonas)
    window.agentApi.listTrashPersonas().then(setTrashPersonas)
  }, [])

  useEffect(() => {
    loadPersonas()
    refreshConversations()
  }, [refreshConversations, loadPersonas])

  useEffect(() => {
    const off = window.agentApi.onChatChanged(() => refreshConversations())
    return off
  }, [refreshConversations])

  useEffect(() => {
    const off = window.agentApi.onPersonaChanged(() => loadPersonas())
    return off
  }, [loadPersonas])

  // 主题色跟随当前选中对话所属角色自动切换（含回收站中的角色，保留其主题色）。
  useEffect(() => {
    const conv = conversations.find((c) => c.id === activeId)
    const persona =
      personas.find((p) => p.id === conv?.personaId) ?? trashPersonas.find((p) => p.id === conv?.personaId)
    const color = persona?.themeColor || '#4f7cff'
    document.documentElement.style.setProperty('--accent', color)
    window.agentApi.setTheme(color, persona?.id ?? null)
  }, [activeId, conversations, personas, trashPersonas])

  useEffect(() => {
    window.agentApi.windowControls.isMaximized().then(setMaximized)
    const off = window.agentApi.windowControls.onMaximizedChange(setMaximized)
    return off
  }, [])

  const selectConversation = (id: string): void => setActiveId(id)

  const startConversation = async (personaId: string): Promise<void> => {
    const conv = await window.agentApi.chatNewConversation({ personaId })
    setActiveId(conv.id)
    refreshConversations()
  }

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

  const applyPersona = (_name: string, _themeColor: string): void => {
    // 角色保存后刷新列表；主题色由上面的 useEffect 根据选中对话自动重算。
    loadPersonas()
  }

  const toggleMaximize = (): void => {
    void window.agentApi.windowControls.toggleMaximize().then(setMaximized)
  }

  const activeConv = conversations.find((c) => c.id === activeId)
  const activePersonaMissing = !!activeConv && !personas.some((p) => p.id === activeConv.personaId)

  return (
    <div className={`window${maximized ? ' maximized' : ''}`}>
      <div className="window-content">
        <div className="titlebar" onDoubleClick={toggleMaximize}>
          <div className="titlebar-title">PALACE</div>
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
            <Panel defaultSize={21.3} minSize={14} className="panel">
              <div className="left-scroll">
                <ConversationList
                  conversations={conversations}
                  activeId={activeId}
                  onSelect={selectConversation}
                  onStartConversation={startConversation}
                  onRename={handleRename}
                  onDelete={handleDelete}
                />
              </div>
            </Panel>
            <PanelResizeHandle className="resize-handle" />
            <Panel defaultSize={55.1} minSize={30} className="panel">
              <ChatView
                activeId={activeId}
                title={activeConv?.title ?? '新对话'}
                onCreated={handleCreated}
                personaMissing={activePersonaMissing}
              />
            </Panel>
            <PanelResizeHandle className="resize-handle" />
            <Panel defaultSize={23.6} minSize={20} className="panel">
              <RightPanel onPersonaSaved={applyPersona} />
            </Panel>
          </PanelGroup>
        </div>
      </div>
    </div>
  )
}

export default App
