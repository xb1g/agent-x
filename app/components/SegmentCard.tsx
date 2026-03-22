'use client'

import { useState } from 'react'

export type SegmentStatus = 'indexing' | 'reading' | 'synthesizing' | 'ready' | 'failed' | 'paused'

export type SegmentSize = {
  posts_indexed: number
  fragments_collected: number
  subreddits: string[]
  label: string
}

export type SegmentCardData = {
  id: string
  icp_description: string
  subreddits: string[]
  status: SegmentStatus
  status_message: string | null
  persona_name: string | null
  segment_size: SegmentSize | null
  pain_signals: string[]
  updated_at: string
  logs?: string[]
}

type SegmentCardProps = {
  segment: SegmentCardData
  isSelected?: boolean
  isEditing?: boolean
  editName?: string
  onSelect?: (segment: SegmentCardData) => void
  onChat?: (segment: SegmentCardData) => void
  onRestart?: (segment: SegmentCardData) => void
  onPause?: (segment: SegmentCardData) => void
  onInspect?: (segment: SegmentCardData) => void
  onStartEdit?: (segment: SegmentCardData) => void
  onCancelEdit?: () => void
  onSaveEdit?: (segment: SegmentCardData, newName: string) => void
  onEditNameChange?: (name: string) => void
}

function formatCompact(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`
  return String(value)
}

function statusTone(status: SegmentStatus): string {
  return status
}

function statusLabel(status: SegmentStatus): string {
  switch (status) {
    case 'indexing':
      return 'Indexing'
    case 'reading':
      return 'Reading'
    case 'synthesizing':
      return 'Synthesizing'
    case 'ready':
      return 'Ready'
    case 'failed':
      return 'Failed'
    case 'paused':
      return 'Paused'
  }
}

export function SegmentCard({
  segment,
  isSelected = false,
  isEditing = false,
  editName = '',
  onSelect,
  onChat,
  onRestart,
  onPause,
  onInspect,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditNameChange,
}: SegmentCardProps) {
  const [showLogs, setShowLogs] = useState(false)

  return (
    <article className={`segment-card ${isSelected ? 'is-selected' : ''}`}>
      <div className="segment-card__top">
        <div>
          <p className="segment-card__eyebrow">{segment.subreddits.join(' · ')}</p>
          <h3 className="segment-card__title">
            {segment.persona_name ?? 'Unnamed persona'}
          </h3>
        </div>
        <span className="status-pill" data-tone={statusTone(segment.status)}>
          {statusLabel(segment.status)}
        </span>
      </div>

      <p className="segment-card__desc">{segment.icp_description}</p>

      <div className="segment-card__signals" aria-label="Pain signals">
        {segment.pain_signals.map((signal) => (
          <span key={signal} className="signal-tag">
            {signal}
          </span>
        ))}
      </div>

      <dl className="segment-card__meta">
        <div>
          <dt>Posts indexed</dt>
          <dd>
            {segment.segment_size ? formatCompact(segment.segment_size.posts_indexed) : '—'}
          </dd>
        </div>
        <div>
          <dt>Fragments</dt>
          <dd>
            {segment.segment_size
              ? formatCompact(segment.segment_size.fragments_collected)
              : '—'}
          </dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{new Date(segment.updated_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</dd>
        </div>
      </dl>

      <div className="segment-card__actions">
        {isEditing ? (
          <>
            <input
              type="text"
              value={editName}
              onChange={(e) => onEditNameChange?.(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveEdit?.(segment, editName)
                if (e.key === 'Escape') onCancelEdit?.()
              }}
              autoFocus
              className="segment-card__edit-input"
              placeholder="Enter persona name"
            />
            <button type="button" className="primary" onClick={() => onSaveEdit?.(segment, editName)}>
              Save
            </button>
            <button type="button" onClick={() => onCancelEdit?.()}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => onInspect?.(segment)} title="Inspect segment">
              🔍 Inspect
            </button>
            <button type="button" onClick={() => onPause?.(segment)} title={segment.status === 'paused' ? 'Resume' : 'Pause'}>
              {segment.status === 'paused' ? '▶︎ Resume' : '⏸ Pause'}
            </button>
            <button type="button" onClick={() => onStartEdit?.(segment)} title="Rename">
              ✏️ Rename
            </button>
            {segment.status === 'failed' ? (
              <button type="button" className="primary" onClick={() => onRestart?.(segment)}>
                Restart
              </button>
            ) : (
              <button
                type="button"
                className="primary"
                onClick={() => onChat?.(segment)}
                disabled={segment.status !== 'ready'}
                title={segment.status !== 'ready' ? 'Persona not ready yet' : undefined}
              >
                Chat with persona
              </button>
            )}
            {segment.logs && segment.logs.length > 0 && (
              <button type="button" onClick={() => setShowLogs((v) => !v)}>
                {showLogs ? 'Hide logs' : `Logs (${segment.logs.length})`}
              </button>
            )}
          </>
        )}
      </div>

      {showLogs && segment.logs && segment.logs.length > 0 && (
        <div className="segment-card__logs">
          <p className="eyebrow" style={{ marginBottom: 6 }}>Agent logs</p>
          <div className="segment-card__logs-list">
            {[...segment.logs].reverse().map((log, i) => (
              <p key={i} className="segment-card__log-line">{log}</p>
            ))}
          </div>
        </div>
      )}

      {segment.status_message ? (
        <p className="field__help" style={{ marginTop: 12 }}>
          {segment.status_message}
        </p>
      ) : null}
    </article>
  )
}
