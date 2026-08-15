import { contextBridge, ipcRenderer } from 'electron'
import type { AgentApi, ChatStreamEvent } from '../shared/types'

const api: AgentApi = {
  getPersona: () => ipcRenderer.invoke('persona:get'),
  getDefaultPersona: () => ipcRenderer.invoke('persona:getDefault'),
  savePersona: (persona) => ipcRenderer.invoke('persona:save', persona),
  getPersonas: () => ipcRenderer.invoke('persona:list'),
  setActivePersona: (id) => ipcRenderer.invoke('persona:setActive', id),
  createPersona: () => ipcRenderer.invoke('persona:create'),
  deletePersona: (id) => ipcRenderer.invoke('persona:delete', id),
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

  filesPreview: (rule) => ipcRenderer.invoke('files:preview', rule),
  filesExecute: (rule) => ipcRenderer.invoke('files:execute', rule),
  filesUndoLast: () => ipcRenderer.invoke('files:undoLast'),
  filesList: (folder) => ipcRenderer.invoke('files:list', folder),
  chooseFolder: () => ipcRenderer.invoke('files:chooseFolder'),

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
