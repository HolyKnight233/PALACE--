import { contextBridge, ipcRenderer } from 'electron'
import type { AgentApi, ChatStreamEvent } from '../shared/types'

const api: AgentApi = {
  getDefaultPersona: () => ipcRenderer.invoke('persona:getDefault'),
  savePersona: (persona) => ipcRenderer.invoke('persona:save', persona),
  getPersonas: () => ipcRenderer.invoke('persona:list'),
  createPersona: () => ipcRenderer.invoke('persona:create'),
  deletePersona: (id) => ipcRenderer.invoke('persona:delete', id),
  listTrashPersonas: () => ipcRenderer.invoke('persona:listTrash'),
  restorePersona: (id) => ipcRenderer.invoke('persona:restore', id),
  purgePersona: (id) => ipcRenderer.invoke('persona:purge', id),
  generatePersona: (requirement) => ipcRenderer.invoke('persona:generate', requirement),
  onPersonaChanged: (callback) => {
    const listener = (): void => callback()
    ipcRenderer.on('persona:changed', listener)
    return () => {
      ipcRenderer.removeListener('persona:changed', listener)
    }
  },

  getSettings: () => ipcRenderer.invoke('settings:get'),
  getDefaultSettings: () => ipcRenderer.invoke('settings:getDefault'),
  saveSettings: (update) => ipcRenderer.invoke('settings:save', update),
  testConnection: () => ipcRenderer.invoke('settings:test'),

  chatSend: (payload) => ipcRenderer.invoke('chat:send', payload),
  chatStop: (conversationId) => ipcRenderer.invoke('chat:stop', conversationId),
  chatNewConversation: (opts) => ipcRenderer.invoke('chat:newConversation', opts),
  listConversations: () => ipcRenderer.invoke('chat:listConversations'),
  getMessages: (conversationId) => ipcRenderer.invoke('chat:getMessages', conversationId),
  renameConversation: (conversationId, title) => ipcRenderer.invoke('chat:rename', conversationId, title),
  deleteConversation: (conversationId) => ipcRenderer.invoke('chat:delete', conversationId),
  listTrash: () => ipcRenderer.invoke('chat:listTrash'),
  restoreConversation: (conversationId) => ipcRenderer.invoke('chat:restore', conversationId),
  purgeConversation: (conversationId) => ipcRenderer.invoke('chat:purge', conversationId),
  onChatChanged: (callback) => {
    const listener = (): void => callback()
    ipcRenderer.on('chat:changed', listener)
    return () => {
      ipcRenderer.removeListener('chat:changed', listener)
    }
  },
  onChatEvent: (callback) => {
    const listener = (_e: Electron.IpcRendererEvent, event: ChatStreamEvent): void => callback(event)
    ipcRenderer.on('chat:event', listener)
    return () => {
      ipcRenderer.removeListener('chat:event', listener)
    }
  },

  listEvents: (range) => ipcRenderer.invoke('schedule:list', range),
  createEvent: (input) => ipcRenderer.invoke('schedule:create', input),
  updateEvent: (id, patch) => ipcRenderer.invoke('schedule:update', id, patch),
  deleteEvent: (id) => ipcRenderer.invoke('schedule:delete', id),
  onScheduleChanged: (callback) => {
    const listener = (): void => callback()
    ipcRenderer.on('schedule:changed', listener)
    return () => {
      ipcRenderer.removeListener('schedule:changed', listener)
    }
  },

  getPomodoros: () => ipcRenderer.invoke('pomodoro:list'),
  getActivePomodoro: () => ipcRenderer.invoke('pomodoro:getActive'),
  savePomodoro: (preset) => ipcRenderer.invoke('pomodoro:save', preset),
  setActivePomodoro: (id) => ipcRenderer.invoke('pomodoro:setActive', id),
  createPomodoro: () => ipcRenderer.invoke('pomodoro:create'),
  deletePomodoro: (id) => ipcRenderer.invoke('pomodoro:delete', id),
  onPomodoroChanged: (callback) => {
    const listener = (): void => callback()
    ipcRenderer.on('pomodoro:changed', listener)
    return () => {
      ipcRenderer.removeListener('pomodoro:changed', listener)
    }
  },

  pomodoroWindow: {
    open: () => ipcRenderer.invoke('pomodoro:open'),
    minimize: () => ipcRenderer.invoke('pomodoro:minimize'),
    close: () => ipcRenderer.invoke('pomodoro:close')
  },
  setPomodoroOpen: (open) => ipcRenderer.invoke('pomodoro:setOpen', open),
  isPomodoroOpen: () => ipcRenderer.invoke('pomodoro:isOpen'),
  setPomodoroCompact: (compact) => ipcRenderer.invoke('pomodoro:setCompact', compact),
  onPomodoroOpenChanged: (callback) => {
    const listener = (_e: Electron.IpcRendererEvent, open: boolean): void => callback(open)
    ipcRenderer.on('pomodoro:openChanged', listener)
    return () => {
      ipcRenderer.removeListener('pomodoro:openChanged', listener)
    }
  },

  setTheme: (color, personaId) => ipcRenderer.invoke('theme:set', color, personaId),
  onThemeChanged: (callback) => {
    const listener = (
      _e: Electron.IpcRendererEvent,
      payload: { color: string; personaId: string | null }
    ): void => callback(payload)
    ipcRenderer.on('theme:changed', listener)
    return () => {
      ipcRenderer.removeListener('theme:changed', listener)
    }
  },
  generateMotto: () => ipcRenderer.invoke('pomodoro:motto'),
  getPomodoroContext: () => ipcRenderer.invoke('pomodoro:getContext'),

  notify: (title, body) => ipcRenderer.invoke('notify', title, body),

  windowControls: {
    minimize: () => ipcRenderer.invoke('win:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('win:toggleMaximize'),
    isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
    close: () => ipcRenderer.invoke('win:close'),
    onMaximizedChange: (callback) => {
      const listener = (_e: Electron.IpcRendererEvent, maximized: boolean): void => callback(maximized)
      ipcRenderer.on('win:maximized', listener)
      return () => {
        ipcRenderer.removeListener('win:maximized', listener)
      }
    }
  }
}

contextBridge.exposeInMainWorld('agentApi', api)
