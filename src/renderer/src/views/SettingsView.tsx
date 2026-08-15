import { useEffect, useState } from 'react'
import type { Persona, ProviderId } from '../../../shared/types'

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
  // persona form
  const [activePersonaId, setActivePersonaId] = useState('default')
  const [personas, setPersonas] = useState<Persona[]>([])
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [personality, setPersonality] = useState('')
  const [speakingStyle, setSpeakingStyle] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [defaultLanguage, setDefaultLanguage] = useState('')
  const [themeColor, setThemeColor] = useState('#4f7cff')

  // presets modal
  const [showPresets, setShowPresets] = useState(false)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')

  // settings form
  const [provider, setProvider] = useState<ProviderId>('deepseek')
  const [baseURL, setBaseURL] = useState('')
  const [model, setModel] = useState('')
  const [temperature, setTemperature] = useState('0.7')
  const [apiKey, setApiKey] = useState('')
  const [hasApiKey, setHasApiKey] = useState(false)
  const [launchAtLogin, setLaunchAtLogin] = useState(false)
  const [closeToTray, setCloseToTray] = useState(true)

  const [savedMsg, setSavedMsg] = useState('')
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)

  const loadPersonaData = async (): Promise<void> => {
    const active = await window.agentApi.getPersona()
    setActivePersonaId(active.id)
    setName(active.name)
    setRole(active.role)
    setPersonality(active.personality.join(', '))
    setSpeakingStyle(active.speakingStyle)
    setSystemPrompt(active.systemPrompt)
    setDefaultLanguage(active.defaultLanguage)
    setThemeColor(active.themeColor)
    setPersonas(await window.agentApi.getPersonas())
  }

  useEffect(() => {
    void loadPersonaData()
    void window.agentApi.getSettings().then((s) => {
      setProvider(s.provider)
      setBaseURL(s.baseURL)
      setModel(s.model)
      setTemperature(String(s.temperature))
      setHasApiKey(s.hasApiKey)
      setLaunchAtLogin(s.launchAtLogin)
      setCloseToTray(s.closeToTray)
    })
    const off = window.agentApi.onPersonaChanged(() => void loadPersonaData())
    return off
  }, [])

  const handleProviderChange = (id: ProviderId): void => {
    setProvider(id)
    const def = PROVIDERS.find((p) => p.id === id)
    if (def) {
      setBaseURL(def.baseURL)
      setModel(def.model)
    }
  }

  const handleSavePersona = async (): Promise<void> => {
    const saved = await window.agentApi.savePersona({
      id: activePersonaId,
      name: name.trim() || '小助手',
      role: role.trim(),
      personality: personality
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
      speakingStyle: speakingStyle.trim(),
      systemPrompt: systemPrompt.trim(),
      defaultLanguage: defaultLanguage.trim() || '中文',
      themeColor: themeColor || '#4f7cff'
    })
    onSaved(saved.name, saved.themeColor)
    setSavedMsg('人设已保存 ✓')
    setTimeout(() => setSavedMsg(''), 2000)
  }

  const handleResetPersona = async (): Promise<void> => {
    const d = await window.agentApi.getDefaultPersona()
    setName(d.name)
    setRole(d.role)
    setPersonality(d.personality.join(', '))
    setSpeakingStyle(d.speakingStyle)
    setSystemPrompt(d.systemPrompt)
    setDefaultLanguage(d.defaultLanguage)
    setThemeColor(d.themeColor)
  }

  const handleSwitchPersona = async (id: string): Promise<void> => {
    await window.agentApi.setActivePersona(id)
  }

  const handleEditPersona = async (id: string): Promise<void> => {
    await window.agentApi.setActivePersona(id)
    setShowPresets(false)
  }

  const handleCreatePersona = async (): Promise<void> => {
    await window.agentApi.createPersona()
    setShowPresets(false)
  }

  const handleDeletePersona = async (id: string): Promise<void> => {
    await window.agentApi.deletePersona(id)
  }

  const commitRename = async (): Promise<void> => {
    if (renameId) {
      const p = personas.find((x) => x.id === renameId)
      if (p) await window.agentApi.savePersona({ ...p, name: renameText.trim() || p.name })
    }
    setRenameId(null)
  }

  const handleResetSettings = async (): Promise<void> => {
    const d = await window.agentApi.getDefaultSettings()
    setProvider(d.provider)
    setBaseURL(d.baseURL)
    setModel(d.model)
    setTemperature(String(d.temperature))
    setLaunchAtLogin(d.launchAtLogin)
    setCloseToTray(d.closeToTray)
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
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {})
    })
    setApiKey('')
    setHasApiKey(true)
    setSavedMsg('设置已保存 ✓')
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
    <div className="settings-view">
      <div className="settings-grid">
        <div className="card">
          <div className="card-title-row">
            <div className="section-title">人设</div>
            <button className="btn" onClick={() => setShowPresets(true)}>
              预设
            </button>
          </div>
          <div className="form">
            <div className="grid-2">
              <div className="field">
                <label>名字</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field">
                <label>主题色</label>
                <input
                  className="input"
                  type="color"
                  value={themeColor}
                  onChange={(e) => setThemeColor(e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label>角色定位</label>
              <input
                className="input"
                placeholder="例如：一个贴心、可靠的个人桌面助理"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
            </div>
            <div className="field">
              <label>性格特点（用逗号分隔）</label>
              <input
                className="input"
                placeholder="例如：友善, 耐心, 有条理"
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
              />
            </div>
            <div className="field">
              <label>说话风格</label>
              <input
                className="input"
                placeholder="例如：简洁、自然、乐于帮忙"
                value={speakingStyle}
                onChange={(e) => setSpeakingStyle(e.target.value)}
              />
            </div>
            <div className="field">
              <label>自定义系统提示词（可选，会附加到人设之后）</label>
              <textarea
                className="textarea"
                placeholder="例如：你只回答和用户工作相关的问题……"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
              />
            </div>
            <div className="field">
              <label>默认语言</label>
              <input className="input" value={defaultLanguage} onChange={(e) => setDefaultLanguage(e.target.value)} />
            </div>
            <div className="row-actions">
              <button className="btn btn-primary" onClick={() => void handleSavePersona()}>
                保存人设
              </button>
              <button className="btn" onClick={() => void handleResetPersona()}>
                恢复默认
              </button>
              {savedMsg && <span className="hint">{savedMsg}</span>}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="section-title">模型与系统</div>
          <div className="form">
            <div className="field">
              <label>服务商</label>
              <select className="select" value={provider} onChange={(e) => handleProviderChange(e.target.value as ProviderId)}>
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>API 地址（baseURL）</label>
              <input className="input mono" value={baseURL} onChange={(e) => setBaseURL(e.target.value)} />
            </div>
            <div className="field">
              <label>模型</label>
              {provider === 'deepseek' ? (
                <select className="select" value={model} onChange={(e) => setModel(e.target.value)}>
                  {DEEPSEEK_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                  {model && !DEEPSEEK_MODELS.some((m) => m.id === model) && (
                    <option value={model}>{model}</option>
                  )}
                </select>
              ) : (
                <input className="input mono" value={model} onChange={(e) => setModel(e.target.value)} />
              )}
            </div>
            <div className="field">
              <label>温度（0–2）</label>
              <input
                className="input"
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
              />
            </div>
            <div className="field">
              <label>API Key {hasApiKey && <span className="hint">（已保存）</span>}</label>
              <input
                className="input mono"
                type="password"
                placeholder={hasApiKey ? '留空则不修改已保存的 Key' : '粘贴你的 API Key'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
            <div className="hint">API Key 使用系统加密（DPAPI）保存在本机，不会明文落盘，也不会发送到前端。</div>
            <div className="grid-2">
              <label className="checkbox">
                <input type="checkbox" checked={launchAtLogin} onChange={(e) => setLaunchAtLogin(e.target.checked)} />
                开机自动启动
              </label>
              <label className="checkbox">
                <input type="checkbox" checked={closeToTray} onChange={(e) => setCloseToTray(e.target.checked)} />
                关闭窗口时最小化到托盘
              </label>
            </div>
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
      </div>

      {showPresets && (
        <>
          <div className="modal-overlay" onClick={() => setShowPresets(false)} />
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">预设管理</span>
              <button className="btn" onClick={() => setShowPresets(false)}>
                关闭
              </button>
            </div>
            <div className="modal-body">
              <button className="btn btn-primary" onClick={() => void handleCreatePersona()}>
                新建预设
              </button>
              <div className="preset-list">
                {personas.map((p) => (
                  <div key={p.id} className={`preset-row${p.id === activePersonaId ? ' active' : ''}`}>
                    {renameId === p.id ? (
                      <input
                        className="input"
                        autoFocus
                        value={renameText}
                        onChange={(e) => setRenameText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.nativeEvent.isComposing) void commitRename()
                          if (e.key === 'Escape') setRenameId(null)
                        }}
                        onBlur={() => void commitRename()}
                      />
                    ) : (
                      <div className="preset-name">
                        {p.name}
                        {p.id === activePersonaId && <span className="preset-badge">当前</span>}
                      </div>
                    )}
                    <div className="row-actions">
                      {p.id !== activePersonaId && (
                        <button className="btn" onClick={() => void handleSwitchPersona(p.id)}>
                          切换
                        </button>
                      )}
                      <button className="btn" onClick={() => void handleEditPersona(p.id)}>
                        编辑
                      </button>
                      <button
                        className="btn"
                        onClick={() => {
                          setRenameId(p.id)
                          setRenameText(p.name)
                        }}
                      >
                        重命名
                      </button>
                      <button
                        className="btn btn-danger"
                        disabled={personas.length <= 1}
                        onClick={() => void handleDeletePersona(p.id)}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
