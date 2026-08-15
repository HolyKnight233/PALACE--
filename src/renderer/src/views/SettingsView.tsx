import { useEffect, useRef, useState } from 'react'
import type { Persona, ProviderId } from '../../../shared/types'
import TrashView from './TrashView'
import Dropdown from './Dropdown'

interface Props {
  onSaved: (name: string, themeColor: string) => void
}

const PROVIDERS: Array<{ id: ProviderId; label: string; baseURL: string; model: string }> = [
  { id: 'deepseek', label: 'DeepSeek', baseURL: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
  { id: 'custom', label: '自定义', baseURL: '', model: '' }
]

const DEEPSEEK_MODELS: Array<{ id: string; label: string }> = [
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
  { id: 'deepseek-chat', label: 'DeepSeek Chat (V3)' },
  { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner (R1)' }
]

export default function SettingsView({ onSaved }: Props): React.JSX.Element {
  const [open, setOpen] = useState<string | null>(null)

  // 角色列表 + 当前正在编辑的角色（null 表示列表视图）
  const [personas, setPersonas] = useState<Persona[]>([])
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null)
  const editingPersonaIdRef = useRef<string | null>(null)
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [personality, setPersonality] = useState('')
  const [speakingStyle, setSpeakingStyle] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [personaSupplements, setPersonaSupplements] = useState('')
  const [personaSupplementsEnabled, setPersonaSupplementsEnabled] = useState(true)
  const [defaultLanguage, setDefaultLanguage] = useState('')
  const [themeColor, setThemeColor] = useState('#4f7cff')
  const [hidden, setHidden] = useState(false)
  const [showUnhideConfirm, setShowUnhideConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [generateHidden, setGenerateHidden] = useState(false)

  const [provider, setProvider] = useState<ProviderId>('deepseek')
  const [baseURL, setBaseURL] = useState('')
  const [model, setModel] = useState('')
  const [temperature, setTemperature] = useState('0.7')
  const [apiKey, setApiKey] = useState('')
  const [hasApiKey, setHasApiKey] = useState(false)
  const [launchAtLogin, setLaunchAtLogin] = useState(false)
  const [closeToTray, setCloseToTray] = useState(true)
  const [pomodoroShowMotto, setPomodoroShowMotto] = useState(true)
  const [pomodoroMottoByPersona, setPomodoroMottoByPersona] = useState(true)
  const [pomodoroOpen, setPomodoroOpen] = useState(true)

  const [savedMsg, setSavedMsg] = useState('')
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [showGenerate, setShowGenerate] = useState(false)
  const [generateReq, setGenerateReq] = useState('')
  const [generating, setGenerating] = useState(false)

  const loadPersonas = async (): Promise<void> => {
    setPersonas(await window.agentApi.getPersonas())
  }

  const fillPersonaForm = (p: Persona): void => {
    setName(p.name)
    setRole(p.role)
    setPersonality(p.personality.join(', '))
    setSpeakingStyle(p.speakingStyle)
    setSystemPrompt(p.systemPrompt)
    setPersonaSupplements(p.supplements ?? '')
    setPersonaSupplementsEnabled(p.supplementsEnabled ?? true)
    setDefaultLanguage(p.defaultLanguage)
    setThemeColor(p.themeColor)
    setHidden(p.hidden ?? false)
  }

  const loadSettings = async (): Promise<void> => {
    const s = await window.agentApi.getSettings()
    setProvider(s.provider)
    setBaseURL(s.baseURL)
    setModel(s.model)
    setTemperature(String(s.temperature))
    setHasApiKey(s.hasApiKey)
    setLaunchAtLogin(s.launchAtLogin)
    setCloseToTray(s.closeToTray)
    setPomodoroShowMotto(s.pomodoroShowMotto ?? true)
    setPomodoroMottoByPersona(s.pomodoroMottoByPersona ?? true)
    setPomodoroOpen(await window.agentApi.isPomodoroOpen())
  }

  const refreshEditingPersona = async (): Promise<void> => {
    const id = editingPersonaIdRef.current
    if (!id) return
    const ps = await window.agentApi.getPersonas()
    const p = ps.find((x) => x.id === id)
    if (!p) {
      setEditingPersonaId(null)
      editingPersonaIdRef.current = null
      return
    }
    // 只刷新 AI 自动更新的补充提示词，避免覆盖用户正在编辑的其它字段。
    setPersonaSupplements(p.supplements ?? '')
    setPersonaSupplementsEnabled(p.supplementsEnabled ?? true)
  }

  useEffect(() => {
    void loadPersonas()
    void loadSettings()
    const offPersona = window.agentApi.onPersonaChanged(() => {
      void loadPersonas()
      void refreshEditingPersona()
    })
    const offPomodoroOpen = window.agentApi.onPomodoroOpenChanged(setPomodoroOpen)
    return () => {
      offPersona()
      offPomodoroOpen()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggle = (id: string): void => setOpen((o) => (o === id ? null : id))

  const openPersona = async (id: string): Promise<void> => {
    const ps = await window.agentApi.getPersonas()
    setPersonas(ps)
    const p = ps.find((x) => x.id === id)
    if (!p) return
    fillPersonaForm(p)
    setEditingPersonaId(id)
    editingPersonaIdRef.current = id
  }

  const backToList = (): void => {
    setEditingPersonaId(null)
    editingPersonaIdRef.current = null
  }

  const handleCreatePersona = async (): Promise<void> => {
    const created = await window.agentApi.createPersona()
    await openPersona(created.id)
  }

  const handleDeletePersona = async (id: string): Promise<void> => {
    await window.agentApi.deletePersona(id)
    if (editingPersonaId === id) setEditingPersonaId(null)
    await loadPersonas()
  }

  const buildPersonaPayload = (): Persona => ({
    id: editingPersonaId ?? '',
    name: name.trim() || '小助手',
    role: role.trim(),
    personality: personality
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean),
    speakingStyle: speakingStyle.trim(),
    systemPrompt: systemPrompt.trim(),
    supplements: personaSupplements.trim(),
    supplementsEnabled: personaSupplementsEnabled,
    defaultLanguage: defaultLanguage.trim() || '中文',
    themeColor: themeColor || '#4f7cff',
    hidden
  })

  const handleSavePersona = async (): Promise<void> => {
    if (!editingPersonaId) return
    const saved = await window.agentApi.savePersona(buildPersonaPayload())
    onSaved(saved.name, saved.themeColor)
    await loadPersonas()
    setSavedMsg('角色已保存')
    setTimeout(() => setSavedMsg(''), 2000)
  }

  const handleResetPersona = async (): Promise<void> => {
    const d = await window.agentApi.getDefaultPersona()
    fillPersonaForm(d)
  }

  const toggleHidden = async (next: boolean): Promise<void> => {
    if (!editingPersonaId) return
    setHidden(next)
    setShowUnhideConfirm(false)
    const saved = await window.agentApi.savePersona({ ...buildPersonaPayload(), hidden: next })
    onSaved(saved.name, saved.themeColor)
    await loadPersonas()
  }

  const openGenerate = (): void => {
    setGenerateReq('')
    setShowGenerate(true)
  }

  const handleGenerate = async (): Promise<void> => {
    setGenerating(true)
    try {
      const g = await window.agentApi.generatePersona(generateReq)
      setName(g.name)
      setRole(g.role)
      setPersonality(g.personality.join(', '))
      setSpeakingStyle(g.speakingStyle)
      setSystemPrompt(g.systemPrompt)
      setPersonaSupplements('')
      setPersonaSupplementsEnabled(true)
      setThemeColor(g.themeColor)
      setDefaultLanguage(g.defaultLanguage)
      setHidden(generateHidden)
      setShowGenerate(false)
      setSavedMsg('已生成，点保存角色生效')
      setTimeout(() => setSavedMsg(''), 3000)
    } finally {
      setGenerating(false)
    }
  }

  const handleProviderChange = (id: ProviderId): void => {
    setProvider(id)
    const def = PROVIDERS.find((p) => p.id === id)
    if (def) {
      setBaseURL(def.baseURL)
      setModel(def.model)
    }
  }

  const handleResetSettings = async (): Promise<void> => {
    const d = await window.agentApi.getDefaultSettings()
    setProvider(d.provider)
    setBaseURL(d.baseURL)
    setModel(d.model)
    setTemperature(String(d.temperature))
    setLaunchAtLogin(d.launchAtLogin)
    setCloseToTray(d.closeToTray)
    setPomodoroShowMotto(d.pomodoroShowMotto ?? true)
    setPomodoroMottoByPersona(d.pomodoroMottoByPersona ?? true)
  }

  const handleSaveSettings = async (): Promise<void> => {
    await window.agentApi.saveSettings({
      provider,
      baseURL: baseURL.trim(),
      model: model.trim(),
      temperature: Number(temperature) || 0.7,
      timezone: 'Asia/Shanghai',
      launchAtLogin,
      closeToTray,
      pomodoroShowMotto,
      pomodoroMottoByPersona,
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {})
    })
    setApiKey('')
    setHasApiKey(true)
    setSavedMsg('设置已保存')
    setTimeout(() => setSavedMsg(''), 2000)
  }

  const handleTest = async (): Promise<void> => {
    setTesting(true)
    setTestResult(null)
    try {
      setTestResult(await window.agentApi.testConnection())
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="settings-accordion">
      <div className="accordion-section">
        <button className="accordion-toggle" onClick={() => toggle('role')}>
          <span className="accordion-title">角色</span>
          <span className="accordion-sub">{personas.length} 个角色</span>
          <span className="accordion-caret">{open === 'role' ? '▾' : '▸'}</span>
        </button>
        {open === 'role' && (
          <div className="accordion-body">
            {editingPersonaId === null ? (
              <div>
                <div className="row-actions">
                  <button className="btn btn-primary" onClick={() => void handleCreatePersona()}>
                    新建角色
                  </button>
                </div>
                <div className="persona-list">
                  {personas.map((p) => (
                    <div key={p.id} className="persona-row" onClick={() => void openPersona(p.id)}>
                      <span className="persona-swatch" style={{ background: p.themeColor || '#4f7cff' }} />
                      <span className="persona-row-name">{p.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div className="row-actions">
                  <button className="btn" onClick={backToList}>
                    返回
                  </button>
                </div>
                <div className="form">
                  <div className="field">
                    <label>名字</label>
                    <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  {!hidden && (
                    <>
                      <div className="field">
                        <label>主题色</label>
                        <div className="color-field">
                          <input className="input" type="color" value={themeColor} onChange={(e) => setThemeColor(e.target.value)} />
                          <span className="color-hex mono">{themeColor}</span>
                        </div>
                      </div>
                      <div className="field">
                        <label>角色定位</label>
                        <textarea className="textarea textarea-sm" placeholder="例如：一个贴心、可靠的个人桌面助理" value={role} onChange={(e) => setRole(e.target.value)} />
                      </div>
                      <div className="field">
                        <label>性格特点（用逗号分隔）</label>
                        <textarea className="textarea textarea-sm" placeholder="例如：友善, 耐心, 有条理" value={personality} onChange={(e) => setPersonality(e.target.value)} />
                      </div>
                      <div className="field">
                        <label>说话风格</label>
                        <textarea className="textarea textarea-sm" placeholder="例如：简洁、自然、乐于帮忙" value={speakingStyle} onChange={(e) => setSpeakingStyle(e.target.value)} />
                      </div>
                      <div className="field">
                        <label>自定义系统提示词（可选，会附加到人设之后）</label>
                        <textarea className="textarea" placeholder="例如：你只回答和用户工作相关的问题……" value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} />
                      </div>
                      <div className="field">
                        <label>补充提示词（AI 在聊天中逐步补全的人设细节）</label>
                        <textarea className="textarea" placeholder="例如：说话喜欢用短句；只讨论技术话题……" value={personaSupplements} onChange={(e) => setPersonaSupplements(e.target.value)} />
                        <label className="checkbox">
                          <input type="checkbox" checked={personaSupplementsEnabled} onChange={(e) => setPersonaSupplementsEnabled(e.target.checked)} />
                          启用补充提示词（启用后自动补全写入）
                        </label>
                      </div>
                      <div className="field">
                        <label>默认语言</label>
                        <input className="input" value={defaultLanguage} onChange={(e) => setDefaultLanguage(e.target.value)} />
                      </div>
                    </>
                  )}
                  <div className="row-actions">
                    <button className="btn btn-primary" onClick={() => void handleSavePersona()}>
                      保存角色
                    </button>
                    <button className="btn" onClick={openGenerate}>
                      随机生成
                    </button>
                    <button className="btn" onClick={() => void handleResetPersona()}>
                      恢复默认
                    </button>
                    {hidden ? (
                      <button className="btn" onClick={() => setShowUnhideConfirm(true)}>
                        显示人设细节
                      </button>
                    ) : (
                      <button className="btn" onClick={() => void toggleHidden(true)}>
                        隐藏人设细节
                      </button>
                    )}
                    <button className="btn btn-danger" disabled={personas.length <= 1} onClick={() => setShowDeleteConfirm(true)}>
                      删除角色
                    </button>
                    {savedMsg && <span className="hint">{savedMsg}</span>}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="accordion-section">
        <button className="accordion-toggle" onClick={() => toggle('model')}>
          <span className="accordion-title">模型</span>
          <span className="accordion-caret">{open === 'model' ? '▾' : '▸'}</span>
        </button>
        {open === 'model' && (
          <div className="accordion-body">
            <div className="form">
              <div className="field">
                <label>服务商</label>
                <Dropdown
                  value={provider}
                  options={PROVIDERS.map((p) => ({ value: p.id, label: p.label }))}
                  onChange={(v) => handleProviderChange(v as ProviderId)}
                />
              </div>
              <div className="field">
                <label>API 地址（baseURL）</label>
                <input className="input mono" value={baseURL} onChange={(e) => setBaseURL(e.target.value)} />
              </div>
              <div className="field">
                <label>模型</label>
                {provider === 'deepseek' ? (
                  <Dropdown
                    value={model}
                    options={[
                      ...DEEPSEEK_MODELS.map((m) => ({ value: m.id, label: m.label })),
                      ...(model && !DEEPSEEK_MODELS.some((m) => m.id === model) ? [{ value: model, label: model }] : [])
                    ]}
                    onChange={setModel}
                  />
                ) : (
                  <input className="input mono" value={model} onChange={(e) => setModel(e.target.value)} />
                )}
              </div>
              <div className="field">
                <label>温度（0–2）</label>
                <input className="input" type="number" min="0" max="2" step="0.1" value={temperature} onChange={(e) => setTemperature(e.target.value)} />
              </div>
              <div className="field">
                <label>API Key {hasApiKey && <span className="hint">（已保存）</span>}</label>
                <input className="input mono" type="password" placeholder={hasApiKey ? '留空则不修改已保存的 Key' : '粘贴你的 API Key'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
              </div>
              <div className="hint">API Key 使用系统加密（DPAPI）保存在本机，不会明文落盘，也不会发送到前端。</div>
              <div className="row-actions">
                <button className="btn btn-primary" onClick={() => void handleSaveSettings()}>
                  保存设置
                </button>
                <button className="btn" disabled={testing} onClick={() => void handleTest()}>
                  {testing ? '测试中…' : '测试连接'}
                </button>
                <button className="btn" onClick={() => void handleResetSettings()}>
                  恢复默认
                </button>
              </div>
              {testResult && (
                <div className={testResult.ok ? 'result-ok' : 'result-err'}>
                  {testResult.ok ? '✓ ' : '✗ '}
                  {testResult.message}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="accordion-section">
        <button className="accordion-toggle" onClick={() => toggle('trash')}>
          <span className="accordion-title">回收站</span>
          <span className="accordion-caret">{open === 'trash' ? '▾' : '▸'}</span>
        </button>
        {open === 'trash' && (
          <div className="accordion-body">
            <TrashView />
          </div>
        )}
      </div>

      <div className="accordion-section">
        <button className="accordion-toggle" onClick={() => toggle('pomodoro')}>
          <span className="accordion-title">番茄钟</span>
          <span className="accordion-caret">{open === 'pomodoro' ? '▾' : '▸'}</span>
        </button>
        {open === 'pomodoro' && (
          <div className="accordion-body">
            <div className="form">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={pomodoroOpen}
                  onChange={(e) => {
                    setPomodoroOpen(e.target.checked)
                    void window.agentApi.setPomodoroOpen(e.target.checked)
                  }}
                />
                打开番茄钟窗口
              </label>
              <label className="checkbox">
                <input type="checkbox" checked={pomodoroShowMotto} onChange={(e) => setPomodoroShowMotto(e.target.checked)} />
                显示格言
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={pomodoroMottoByPersona}
                  disabled={!pomodoroShowMotto}
                  onChange={(e) => setPomodoroMottoByPersona(e.target.checked)}
                />
                格言由当前选中角色表达（需先开启显示格言）
              </label>
              <div className="row-actions">
                <button className="btn btn-primary" onClick={() => void handleSaveSettings()}>
                  保存番茄钟设置
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="accordion-section">
        <button className="accordion-toggle" onClick={() => toggle('system')}>
          <span className="accordion-title">系统</span>
          <span className="accordion-caret">{open === 'system' ? '▾' : '▸'}</span>
        </button>
        {open === 'system' && (
          <div className="accordion-body">
            <div className="form">
              <label className="checkbox">
                <input type="checkbox" checked={launchAtLogin} onChange={(e) => setLaunchAtLogin(e.target.checked)} />
                开机自动启动
              </label>
              <label className="checkbox">
                <input type="checkbox" checked={closeToTray} onChange={(e) => setCloseToTray(e.target.checked)} />
                关闭窗口时最小化到托盘
              </label>
              <div className="row-actions">
                <button className="btn btn-primary" onClick={() => void handleSaveSettings()}>
                  保存系统设置
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showGenerate && (
        <>
          <div className="modal-overlay" onClick={() => setShowGenerate(false)} />
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">随机生成角色</span>
              <button className="btn" onClick={() => setShowGenerate(false)}>
                关闭
              </button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>要求（可选，留空则纯随机）</label>
                <textarea
                  className="textarea"
                  placeholder="例如：一个温柔知性的图书管理员，喜欢用短句"
                  value={generateReq}
                  onChange={(e) => setGenerateReq(e.target.value)}
                />
              </div>
              <label className="checkbox">
                <input type="checkbox" checked={generateHidden} onChange={(e) => setGenerateHidden(e.target.checked)} />
                此角色默认隐藏人设细节
              </label>
              <div className="row-actions">
                <button className="btn btn-primary" disabled={generating} onClick={() => void handleGenerate()}>
                  {generating ? '生成中…' : '生成'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {showUnhideConfirm && (
        <>
          <div className="modal-overlay" onClick={() => setShowUnhideConfirm(false)} />
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">显示人设细节</span>
            </div>
            <div className="modal-body">
              <div className="hint">确定要显示这个人设的细节吗？</div>
              <div className="row-actions">
                <button className="btn btn-primary" onClick={() => void toggleHidden(false)}>
                  确定
                </button>
                <button className="btn" onClick={() => setShowUnhideConfirm(false)}>
                  取消
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {showDeleteConfirm && (
        <>
          <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)} />
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">删除角色</span>
            </div>
            <div className="modal-body">
              <div className="hint">确定要删除这个角色吗？删除后它会进入回收站，与该角色关联的对话将失效，但可随时恢复。</div>
              <div className="row-actions">
                <button
                  className="btn btn-danger"
                  onClick={() => {
                    setShowDeleteConfirm(false)
                    if (editingPersonaId) void handleDeletePersona(editingPersonaId)
                  }}
                >
                  确定删除
                </button>
                <button className="btn" onClick={() => setShowDeleteConfirm(false)}>
                  取消
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
