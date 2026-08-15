import { useState } from 'react'
import type { CalendarEvent, Conversation } from '../../../shared/types'
import ConversationList from './ConversationList'
import ScheduleList from './ScheduleList'
import ScheduleForm from './ScheduleForm'

interface Props {
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
}

type Mode = { kind: 'list' } | { kind: 'add' } | { kind: 'edit'; event: CalendarEvent }

export default function LeftPanel({
  conversations,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete
}: Props): React.JSX.Element {
  const [mode, setMode] = useState<Mode>({ kind: 'list' })

  if (mode.kind === 'add') {
    return (
      <div className="left-panel">
        <ScheduleForm onBack={() => setMode({ kind: 'list' })} onSaved={() => setMode({ kind: 'list' })} />
      </div>
    )
  }

  if (mode.kind === 'edit') {
    return (
      <div className="left-panel">
        <ScheduleForm
          event={mode.event}
          onBack={() => setMode({ kind: 'list' })}
          onSaved={() => setMode({ kind: 'list' })}
          onDeleted={() => setMode({ kind: 'list' })}
        />
      </div>
    )
  }

  return (
    <div className="left-panel">
      <ConversationList
        conversations={conversations}
        activeId={activeId}
        onSelect={onSelect}
        onNew={onNew}
        onRename={onRename}
        onDelete={onDelete}
      />
      <ScheduleList onAdd={() => setMode({ kind: 'add' })} onEdit={(event) => setMode({ kind: 'edit', event })} />
    </div>
  )
}
