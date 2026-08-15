import { useState } from 'react'
import type { FileMovePreview, OrganizeMode } from '../../../shared/types'

export default function FilesView(): React.JSX.Element {
  const [folder, setFolder] = useState('')
  const [mode, setMode] = useState<OrganizeMode>('by-extension')
  const [regexPattern, setRegexPattern] = useState('')
  const [targetBase, setTargetBase] = useState('')
  const [preview, setPreview] = useState<FileMovePreview[] | null>(null)
  const [resultMsg, setResultMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const chooseFolder = async (): Promise<void> => {
    const picked = await window.agentApi.chooseFolder()
    if (picked) setFolder(picked)
  }

  const buildRule = (): { sourceFolder: string; mode: OrganizeMode; regexPattern?: string; targetBase?: string } => ({
    sourceFolder: folder,
    mode,
    regexPattern: mode === 'by-name-pattern' ? regexPattern : undefined,
    targetBase: targetBase.trim() || undefined
  })

  const handlePreview = async (): Promise<void> => {
    if (!folder) return
    setBusy(true)
    setResultMsg(null)
    try {
      const items = await window.agentApi.filesPreview(buildRule())
      setPreview(items)
    } catch (err) {
      setResultMsg({ ok: false, text: String(err) })
    } finally {
      setBusy(false)
    }
  }

  const handleExecute = async (): Promise<void> => {
    if (!folder || !preview || preview.length === 0) return
    setBusy(true)
    setResultMsg(null)
    try {
      const res = await window.agentApi.filesExecute(buildRule())
      setPreview(null)
      setResultMsg({
        ok: res.failed.length === 0,
        text: `已移动 ${res.moved} 个文件` + (res.failed.length > 0 ? `，失败 ${res.failed.length} 个` : '')
      })
    } catch (err) {
      setResultMsg({ ok: false, text: String(err) })
    } finally {
      setBusy(false)
    }
  }

  const handleUndo = async (): Promise<void> => {
    setBusy(true)
    setResultMsg(null)
    try {
      const res = await window.agentApi.filesUndoLast()
      setResultMsg({
        ok: true,
        text: res.batchId ? `已撤销最近一次整理，恢复 ${res.restored} 个文件` : '没有可撤销的整理记录'
      })
    } catch (err) {
      setResultMsg({ ok: false, text: String(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="files-view">
      <div className="card">
        <div className="section-title">文件整理</div>
        <div className="form">
          <div className="row-actions">
            <input
              className="input"
              placeholder="要整理的文件夹路径"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
            />
            <button className="btn" onClick={() => void chooseFolder()}>
              选择文件夹
            </button>
          </div>

          <div className="grid-2">
            <div className="field">
              <label>整理方式</label>
              <select className="select" value={mode} onChange={(e) => setMode(e.target.value as OrganizeMode)}>
                <option value="by-extension">按扩展名分组</option>
                <option value="by-date">按修改月份分组</option>
                <option value="by-name-pattern">按文件名正则分组</option>
              </select>
            </div>
            <div className="field">
              <label>目标根目录（可选，默认 = 源文件夹）</label>
              <input
                className="input"
                placeholder="留空则整理到源文件夹内"
                value={targetBase}
                onChange={(e) => setTargetBase(e.target.value)}
              />
            </div>
          </div>

          {mode === 'by-name-pattern' && (
            <div className="field">
              <label>文件名正则（第一个捕获组作为子文件夹名）</label>
              <input
                className="input mono"
                placeholder="例如 ^(.+?)- 或 ^报告-(\d{4})"
                value={regexPattern}
                onChange={(e) => setRegexPattern(e.target.value)}
              />
            </div>
          )}

          <div className="hint">
            说明：预览只会显示将要移动的文件，不会真正移动；点击「执行整理」后才会移动，并可一键撤销。
          </div>

          <div className="row-actions">
            <button className="btn" disabled={!folder || busy} onClick={() => void handlePreview()}>
              预览
            </button>
            <button
              className="btn btn-primary"
              disabled={!preview || preview.length === 0 || busy}
              onClick={() => void handleExecute()}
            >
              执行整理
            </button>
            <button className="btn" disabled={busy} onClick={() => void handleUndo()}>
              撤销上一次
            </button>
          </div>
        </div>
      </div>

      {resultMsg && (
        <div className="card">
          <div className={resultMsg.ok ? 'result-ok' : 'result-err'}>{resultMsg.text}</div>
        </div>
      )}

      {preview && (
        <div className="card">
          <div className="section-title">预览（{preview.length} 个文件）</div>
          {preview.length === 0 ? (
            <div className="empty">没有需要整理的文件。</div>
          ) : (
            <div className="preview-list">
              {preview.map((p) => (
                <div key={p.source} className="preview-row">
                  <span className="preview-src" title={p.source}>
                    {p.source}
                  </span>
                  <span className="preview-arrow">→</span>
                  <span className="preview-dst" title={p.destination}>
                    {p.destination}
                    {p.conflict ? '（目标已存在，将自动改名）' : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
