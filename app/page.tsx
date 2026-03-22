'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'

import { PersonaChat } from './components/PersonaChat'
import {
  SegmentCard,
  type SegmentCardData,
  type SegmentStatus,
} from './components/SegmentCard'
import { buildIcpDescription } from '../lib/intake'

type DiscoverResponse = {
  segment_id?: string
  status?: SegmentStatus
}

type SegmentResponse = SegmentCardData & {
  segment_size?: SegmentCardData['segment_size']
  soul_document?: string | null
  logs?: string[]
}

type AppTab = 'research' | 'board' | 'interview'

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function extractPainSignals(soulDocument: string | null | undefined): string[] {
  if (!soulDocument) return []

  const lines = soulDocument.split('\n')
  const painSignals: string[] = []
  let inPainPoints = false

  for (const line of lines) {
    if (line.startsWith('## Pain Points')) {
      inPainPoints = true
      continue
    }

    if (inPainPoints && line.startsWith('## ')) {
      break
    }

    if (inPainPoints && /^\d+\./.test(line.trim())) {
      painSignals.push(
        line
          .replace(/^\d+\.\s*/, '')
          .split('—')[0]
          .trim()
      )
    }
  }

  return painSignals.slice(0, 3)
}

function formatStatus(status: SegmentStatus): string {
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
  }
}

function upsertSegment(list: SegmentCardData[], next: SegmentCardData): SegmentCardData[] {
  const index = list.findIndex((segment) => segment.id === next.id)

  if (index === -1) {
    return [next, ...list]
  }

  const copy = list.slice()
  copy[index] = next
  return copy
}

function logClient(event: string, details?: Record<string, unknown>) {
  console.log(`[discovery-intake] ${event}`, details ?? {})
}



const APP_TABS: Array<{
  id: AppTab
  label: string
  description: string
}> = [
  {
    id: 'research',
    label: 'Research',
    description: 'Define the segment and launch discovery.',
  },
  {
    id: 'board',
    label: 'Board',
    description: 'Track live segments and select a persona.',
  },
  {
    id: 'interview',
    label: 'Interview',
    description: 'Talk to the selected persona without losing context.',
  },
]

export default function Page() {
  const [activeTab, setActiveTab] = useState<AppTab>('research')
  const [wizardCustomer, setWizardCustomer] = useState('Bootstrapped SaaS founders')
  const [wizardProblem, setWizardProblem] = useState(
    'pricing confusion, churn, and feature creep',
  )
  const [segments, setSegments] = useState<SegmentCardData[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const stored = localStorage.getItem('agentx_segments')
      return stored ? (JSON.parse(stored) as SegmentCardData[]) : []
    } catch {
      return []
    }
  })
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('agentx_selected_segment_id') ?? null
  })
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)

  // Auto-dismiss toast after 5 seconds
  useEffect(() => {
    if (!banner) return
    const timeout = setTimeout(() => setBanner(null), 5000)
    return () => clearTimeout(timeout)
  }, [banner])

  const icpDescription = useMemo(
    () => buildIcpDescription(wizardCustomer, wizardProblem),
    [wizardCustomer, wizardProblem],
  )

  const selectedSegment = useMemo(
    () => segments.find((segment) => segment.id === selectedSegmentId) ?? null,
    [segments, selectedSegmentId],
  )

  const metrics = useMemo(() => {
    const active = segments.filter((segment) => segment.status !== 'failed').length
    const ready = segments.filter((segment) => segment.status === 'ready').length
    const pending = segments.filter(
      (segment) => segment.status === 'indexing' || segment.status === 'reading' || segment.status === 'synthesizing',
    ).length

    return { active, ready, pending }
  }, [segments])

  useEffect(() => {
    if (!segments.some((segment) => segment.id === selectedSegmentId)) {
      setSelectedSegmentId(segments[0]?.id ?? null)
    }
  }, [segments, selectedSegmentId])

  // Persist board to localStorage across sessions.
  useEffect(() => {
    try {
      localStorage.setItem('agentx_segments', JSON.stringify(segments))
    } catch {}
  }, [segments])

  useEffect(() => {
    try {
      if (selectedSegmentId) {
        localStorage.setItem('agentx_selected_segment_id', selectedSegmentId)
      } else {
        localStorage.removeItem('agentx_selected_segment_id')
      }
    } catch {}
  }, [selectedSegmentId])



  useEffect(() => {
    if (!activeRunId) return

    let cancelled = false
    let interval: number | undefined

    const poll = async () => {
      try {
        logClient('segment_poll_start', { activeRunId })
        const response = await fetch(`/api/segment/${activeRunId}`)
        logClient('segment_poll_response', {
          activeRunId,
          ok: response.ok,
          status: response.status,
        })
        if (!response.ok) return

        const data = (await response.json()) as Partial<SegmentResponse>
        logClient('segment_poll_payload', {
          id: data.id,
          status: data.status,
          persona_name: data.persona_name,
          status_message: data.status_message,
        })
        if (cancelled) return

        const nextSegment: SegmentCardData = {
          id: data.id ?? activeRunId,
          icp_description: data.icp_description ?? icpDescription,
          subreddits: data.subreddits ?? subreddits,
          status: data.status ?? 'indexing',
          status_message: data.status_message ?? null,
          persona_name: data.persona_name ?? null,
          segment_size: data.segment_size ?? null,
          pain_signals:
            data.pain_signals?.length
              ? data.pain_signals
              : extractPainSignals(data.soul_document).length
                ? extractPainSignals(data.soul_document)
                : ['Waiting for the first high-signal posts to surface.'],
          updated_at: new Date().toISOString(),
          logs: data.logs ?? [],
        }

        startTransition(() => {
          setSegments((current) => upsertSegment(current, nextSegment))
          if (nextSegment.status === 'ready' || nextSegment.status === 'failed') {
            setBanner(
              nextSegment.status === 'ready'
                ? `${nextSegment.persona_name ?? 'Persona'} is ready for interview.`
                : nextSegment.status_message ?? 'Discovery stalled before synthesis.',
            )
            setActiveRunId(null)
          }
        })
      } catch {
        logClient('segment_poll_failed', { activeRunId })
        // Keep polling until the run resolves or the component unmounts.
      }
    }

    void poll()
    interval = window.setInterval(poll, 3000)

    return () => {
      cancelled = true
      if (interval) {
        window.clearInterval(interval)
      }
    }
  }, [activeRunId, icpDescription])

  async function handleDiscover() {
    const trimmed = icpDescription
    if (!trimmed) return

    logClient('discover_attempt', {
      icpLength: trimmed.length,
    })

    setIsDiscovering(true)
    setBanner(null)

    const tempSegment: SegmentCardData = {
      id: uid('segment'),
      icp_description: trimmed,
      subreddits: [],
      status: 'indexing',
      status_message: 'Searching for relevant posts across Reddit...',
      persona_name: null,
      segment_size: {
        posts_indexed: 0,
        fragments_collected: 0,
        subreddits: [],
        label: 'Queued',
      },
      pain_signals: ['Starting discovery run'],
      updated_at: new Date().toISOString(),
    }

    startTransition(() => {
      setSegments((current) => upsertSegment(current, tempSegment))
      setSelectedSegmentId(tempSegment.id)
    })
    setActiveTab('board')

    try {
      const response = await fetch('/api/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          icp_description: trimmed,
        }),
      })
      logClient('discover_response', {
        ok: response.ok,
        status: response.status,
      })

      if (!response.ok) {
        throw new Error('discover failed')
      }

      const payload = (await response.json()) as DiscoverResponse
      logClient('discover_payload', payload as Record<string, unknown>)
      const runId = payload.segment_id ?? tempSegment.id

      setActiveRunId(runId)
      startTransition(() => {
        setSegments((current) =>
          upsertSegment(current, {
            ...tempSegment,
            id: runId,
            status: payload.status ?? 'indexing',
            status_message: 'Discovery is running in the background.',
          }),
        )
        setSelectedSegmentId(runId)
      })

      setBanner('Discovery started. Finding relevant posts...')
    } catch {
      logClient('discover_failed')
      setBanner('Discovery could not reach the backend, but the intake panel still works locally.')
      setActiveRunId(null)
      startTransition(() => {
        setSegments((current) =>
          upsertSegment(current, {
            ...tempSegment,
            status: 'failed',
            status_message: 'The discover route is offline in this workspace.',
            pain_signals: ['Backend unavailable'],
          }),
        )
      })
    } finally {
      setIsDiscovering(false)
    }
  }

  async function handleRestart(failed: SegmentCardData) {
    try {
      const response = await fetch('/api/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          icp_description: failed.icp_description,
          subreddits: failed.subreddits,
        }),
      })
      if (!response.ok) throw new Error('restart failed')
      const payload = (await response.json()) as { segment_id?: string; status?: SegmentStatus }
      const newId = payload.segment_id ?? uid('segment')
      startTransition(() => {
        // Replace the failed card with the new run in-place
        setSegments((current) =>
          current.map((s) =>
            s.id === failed.id
              ? {
                  ...failed,
                  id: newId,
                  status: payload.status ?? 'indexing',
                  status_message: 'Restarted.',
                  pain_signals: ['Restarting discovery run'],
                  logs: [],
                }
              : s
          )
        )
        setSelectedSegmentId(newId)
      })
      setActiveRunId(newId)
      setBanner('Discovery restarted.')
    } catch {
      setBanner('Could not restart — backend unreachable.')
    }
  }

  const liveSegments = segments
  const boardLabel = liveSegments.length > 0 ? 'Live slate' : 'Empty slate'
  const activeTabMeta = APP_TABS.find((tab) => tab.id === activeTab) ?? APP_TABS[0]
  const statusMessage = activeRunId
    ? `Run active • ${formatStatus('indexing')}`
    : selectedSegment
      ? `Focused on ${selectedSegment.persona_name ?? 'the selected segment'}`
      : 'Waiting for the first discovery run'

  return (
    <div className="app-shell">
      <header className="container shell-header">
        <div className="shell-header__intro">
          <div>
            <p className="eyebrow">Customer Discovery Workspace</p>
            <h1>Research, review the board, then interview the persona.</h1>
            <p>{activeTabMeta.description}</p>
          </div>

          <div className="status-line" aria-live="polite">
            <span className="status-dot" />
            {statusMessage}
          </div>
        </div>

        <div className="shell-header__meta">
          <div className="shell-stat">
            <span>Segments</span>
            <strong>{metrics.active}</strong>
          </div>
          <div className="shell-stat">
            <span>Ready</span>
            <strong>{metrics.ready}</strong>
          </div>
          <div className="shell-stat">
            <span>In flight</span>
            <strong>{metrics.pending}</strong>
          </div>

        </div>

        <nav className="tab-nav" aria-label="Workspace tabs">
          <div className="tab-list" role="tablist" aria-orientation="horizontal">
            {APP_TABS.map((tab) => (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`panel-${tab.id}`}
                className={`tab-pill ${activeTab === tab.id ? 'is-active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span>{tab.label}</span>
                <small>{tab.description}</small>
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main className="container tab-panels">
        <section
          id="panel-research"
          role="tabpanel"
          aria-labelledby="tab-research"
          hidden={activeTab !== 'research'}
          className="tab-panel"
        >
          <section className="panel panel--priority">
            <div className="panel__title">
              <div>
                <p className="eyebrow">Research</p>
                <h2>Put the segment, sources, and launch controls first.</h2>
                <p>
                  Define the ICP, confirm the real signal sources, and start discovery from the
                  first screen without relying on fallback defaults.
                </p>
              </div>
              <div className="status-line">{isPending || isDiscovering ? 'Working' : 'Idle'}</div>
            </div>

            <div className="panel__priority-grid">
              <div>
                <div className="field wizard-field">
                  <label htmlFor="wizard-customer">
                    <span className="wizard-field__num">01</span>
                    Who is your customer?
                  </label>
                  <input
                    id="wizard-customer"
                    className="wizard-input"
                    value={wizardCustomer}
                    onChange={(e) => setWizardCustomer(e.target.value)}
                    placeholder="e.g. Bootstrapped SaaS founders"
                  />
                </div>

                <div className="field wizard-field">
                  <label htmlFor="wizard-problem">
                    <span className="wizard-field__num">02</span>
                    What problem are they trying to solve?
                  </label>
                  <input
                    id="wizard-problem"
                    className="wizard-input"
                    value={wizardProblem}
                    onChange={(e) => setWizardProblem(e.target.value)}
                    placeholder="e.g. pricing confusion, churn, and feature creep"
                  />
                </div>

                <div className="actions" style={{ marginTop: 24 }}>
                  <button
                    type="button"
                    className="primary"
                    onClick={handleDiscover}
                    disabled={isDiscovering}
                  >
                    {isDiscovering ? 'Searching Reddit…' : 'Research this segment'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setWizardCustomer('')
                      setWizardProblem('')
                    }}
                  >
                    Clear inputs
                  </button>
                </div>
              </div>

              <div className="panel__priority-rail">
                <dl className="signal-meta intake-meta">
                  <div className="signal-meta__item">
                    <dt>Segments</dt>
                    <dd>{metrics.active}</dd>
                  </div>
                  <div className="signal-meta__item">
                    <dt>Ready</dt>
                    <dd>{metrics.ready}</dd>
                  </div>
                  <div className="signal-meta__item">
                    <dt>In flight</dt>
                    <dd>{metrics.pending}</dd>
                  </div>
                </dl>

                <div className="timeline" aria-label="Discovery flow">
                  <div className="timeline__step">
                    <span>1</span>
                    <div>
                      <strong>Define the segment</strong>
                      <small>Customer and problem context.</small>
                    </div>
                  </div>
                  <div className="timeline__step">
                    <span>2</span>
                    <div>
                      <strong>AI finds relevant posts</strong>
                      <small>Searches Reddit for people with similar problems.</small>
                    </div>
                  </div>
                  <div className="timeline__step">
                    <span>3</span>
                    <div>
                      <strong>Persona synthesized</strong>
                      <small>Deep analysis of pain points and motivations.</small>
                    </div>
                  </div>
                </div>

                {icpDescription && (
                  <div className="wizard-preview">
                    <p className="eyebrow" style={{ marginBottom: 6 }}>Query preview</p>
                    <p className="wizard-preview__text">{icpDescription}</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        </section>

        <section
          id="panel-board"
          role="tabpanel"
          aria-labelledby="tab-board"
          hidden={activeTab !== 'board'}
          className="tab-panel"
        >
          <section className="workspace workspace--board">
            <div className="workspace__title">
              <p className="eyebrow">Board</p>
              <h2>{boardLabel}</h2>
              <p>
                The board stays dense and readable. Open a segment to switch the interview room on
                the right.
              </p>
            </div>

            <div className="workspace__toolbar">
              <div className="metric">
                <dt>Selected</dt>
                <dd>{selectedSegment?.persona_name ?? 'None'}</dd>
              </div>
              <div className="metric">
                <dt>State</dt>
                <dd>{selectedSegment ? formatStatus(selectedSegment.status) : 'Idle'}</dd>
              </div>
              <div className="metric">
                <dt>Source count</dt>
                <dd>{selectedSegment?.subreddits.length ?? 0}</dd>
              </div>
            </div>

            <div className="segment-grid">
              {liveSegments.length ? (
                liveSegments.map((segment) => (
                  <SegmentCard
                    key={segment.id}
                    segment={segment}
                    isSelected={segment.id === selectedSegmentId}
                    onSelect={(next) => setSelectedSegmentId(next.id)}
                    onChat={(next) => {
                      setSelectedSegmentId(next.id)
                      setActiveTab('interview')
                    }}
                    onRestart={(next) => void handleRestart(next)}
                  />
                ))
              ) : (
                <div className="empty-state">
                  <p className="eyebrow">Empty board</p>
                  <h3>No segments yet. Launch a discovery run to populate the board.</h3>
                  <p>
                    The board only shows real runs from this workspace.
                  </p>
                </div>
              )}
            </div>
          </section>
        </section>

        <section
          id="panel-interview"
          role="tabpanel"
          aria-labelledby="tab-interview"
          hidden={activeTab !== 'interview'}
          className="tab-panel"
        >
          {segments.filter((s) => s.status === 'ready').length > 0 && (
            <div className="persona-picker">
              {segments.filter((s) => s.status === 'ready').map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`persona-picker__chip ${s.id === selectedSegmentId ? 'is-active' : ''}`}
                  onClick={() => setSelectedSegmentId(s.id)}
                >
                  {s.persona_name ?? s.icp_description.slice(0, 30)}
                </button>
              ))}
            </div>
          )}
          <PersonaChat key={selectedSegment?.id ?? 'empty'} segment={selectedSegment} />
        </section>
      </main>

      {banner ? (
        <aside className="toast" role="status" aria-live="polite">
          <div className="toast__content">
            <strong>Board update</strong>
            {banner}
          </div>
          <button
            type="button"
            className="toast__close"
            onClick={() => setBanner(null)}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </aside>
      ) : null}
    </div>
  )
}
