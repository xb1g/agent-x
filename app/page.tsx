'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'

import { PersonaChat } from './components/PersonaChat'
import {
  SegmentCard,
  type SegmentCardData,
  type SegmentStatus,
} from './components/SegmentCard'
import {
  buildIcpDescription,
  buildQuery,
  dedupeSubreddits,
  extractSuggestedSubreddits,
} from '../lib/intake'
import { normalizeSubreddit } from '../lib/validation'

type SuggestionResponse = {
  subreddits?: string[]
}

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

const SUGGEST_STEPS = [
  'Analyzing your inputs…',
  'Connecting to Reddit…',
  'Searching communities…',
  'Filtering relevant results…',
  'Preparing your shortlist…',
]

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
  const [suggestStep, setSuggestStep] = useState(0)
  const [subreddits, setSubreddits] = useState<string[]>([])
  const [subredditDraft, setSubredditDraft] = useState('')
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
  const [isSuggesting, setIsSuggesting] = useState(false)
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)

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

  // Cycle through fake progress steps while suggesting.
  useEffect(() => {
    if (!isSuggesting) {
      setSuggestStep(0)
      return
    }
    setSuggestStep(1)
    const id = setInterval(() => {
      setSuggestStep((s) => Math.min(s + 1, SUGGEST_STEPS.length))
    }, 550)
    return () => clearInterval(id)
  }, [isSuggesting])

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
  }, [activeRunId, icpDescription, startTransition, subreddits])

  function handleAddSubreddit() {
    const normalized = normalizeSubreddit(subredditDraft).replace(/^\/+/, '')
    logClient('manual_add_attempt', {
      draft: subredditDraft,
      normalized,
      currentShortlist: subreddits,
    })
    if (!normalized) return

    if (subreddits.includes(normalized)) {
      setBanner(`r/${normalized} is already in the shortlist.`)
      setSubredditDraft('')
      return
    }

    if (subreddits.length >= 5) {
      setBanner('The shortlist is capped at five subreddits.')
      return
    }

    startTransition(() => {
      setSubreddits((current) => dedupeSubreddits([...current, normalized]))
    })
    setSubredditDraft('')
    setBanner(`Added r/${normalized} to the shortlist.`)
    logClient('manual_add_success', { added: normalized })
  }

  async function handleSuggestSubreddits() {
    const query = buildQuery(wizardCustomer, wizardProblem)
    if (query.length < 10) {
      setBanner('Fill in your customer and their problem to get suggestions.')
      return
    }

    logClient('suggest_start', {
      queryLength: query.length,
      hasCustomer: !!wizardCustomer.trim(),
      hasProblem: !!wizardProblem.trim(),
      currentShortlist: subreddits,
    })
    setIsSuggesting(true)
    setBanner(null)

    try {
      const response = await fetch('/api/suggest-subreddits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ icp_description: query }),
      })
      logClient('suggest_response', {
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get('content-type'),
      })

      if (!response.ok) {
        throw new Error('suggestions failed')
      }

      const contentType = response.headers.get('content-type') ?? ''
      const payload = contentType.includes('application/json')
        ? ((await response.json()) as SuggestionResponse | string[])
        : await response.text()

      const next = extractSuggestedSubreddits(payload)
      logClient('suggest_payload_parsed', {
        next,
        rawPayloadType: Array.isArray(payload) ? 'array' : typeof payload,
      })
      if (!next.length) {
        setBanner('No subreddit suggestions came back. Add one manually to continue.')
        logClient('suggest_empty')
        return
      }

      startTransition(() => {
        setSubreddits(next)
      })
      setBanner(`Shortlisted ${next.length} subreddit${next.length === 1 ? '' : 's'}.`)
    } catch {
      logClient('suggest_failed')
      setBanner('Suggestions were unavailable. Add one or more subreddits manually to continue.')
    } finally {
      setIsSuggesting(false)
    }
  }

  async function handleDiscover() {
    const trimmed = icpDescription
    if (!trimmed) return

    const shortlist = dedupeSubreddits(subreddits)
    logClient('discover_attempt', {
      icpLength: trimmed.length,
      shortlist,
    })
    if (!shortlist.length) {
      setBanner('Add at least one subreddit before starting discovery.')
      logClient('discover_blocked_no_shortlist')
      return
    }

    setIsDiscovering(true)
    setBanner(null)

    const tempSegment: SegmentCardData = {
      id: uid('segment'),
      icp_description: trimmed,
      subreddits: shortlist,
      status: 'indexing',
      status_message: 'The coordinator has kicked off the background discovery pipeline.',
      persona_name: null,
      segment_size: {
        posts_indexed: 0,
        fragments_collected: 0,
        subreddits: shortlist,
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
          subreddits: shortlist,
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

      setBanner('Discovery started. The board will update as segments resolve.')
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
          <div className="shell-stat">
            <span>Shortlist</span>
            <strong>{subreddits.length}</strong>
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
              <div className="status-line">{isPending || isSuggesting || isDiscovering ? 'Working' : 'Idle'}</div>
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

                <div className="wizard-suggest-row">
                  <button
                    type="button"
                    className="primary wizard-suggest-btn"
                    onClick={handleSuggestSubreddits}
                    disabled={isSuggesting}
                  >
                    {isSuggesting ? 'Finding subreddits…' : 'Suggest subreddits'}
                  </button>
                </div>

                {isSuggesting && suggestStep > 0 && (
                  <div className="suggest-progress">
                    <div className="suggest-progress__bar">
                      <div
                        className="suggest-progress__fill"
                        style={{ width: `${(suggestStep / SUGGEST_STEPS.length) * 100}%` }}
                      />
                    </div>
                    <span className="suggest-progress__label">
                      {SUGGEST_STEPS[suggestStep - 1]}
                    </span>
                  </div>
                )}

                <div className="field" style={{ marginTop: 18 }}>
                  <label>Discovery shortlist</label>
                  <div className="chip-row">
                    {subreddits.length ? (
                      subreddits.map((subreddit) => (
                        <button
                          key={subreddit}
                          type="button"
                          className={`chip ${subreddits.includes(subreddit) ? 'is-selected' : ''}`}
                          onClick={() =>
                            startTransition(() => {
                              setSubreddits((current) => current.filter((item) => item !== subreddit))
                            })
                          }
                        >
                          r/{subreddit}
                        </button>
                      ))
                    ) : (
                      <div className="chip-row__empty">
                        No subreddits yet — click "Suggest subreddits" or add one below.
                      </div>
                    )}
                  </div>
                  <div className="field__help">Max five. Click a chip to remove it.</div>
                </div>

                <div className="field">
                  <label htmlFor="subreddit-draft">Add subreddit manually</label>
                  <div className="field__inline">
                    <input
                      id="subreddit-draft"
                      value={subredditDraft}
                      onChange={(event) => setSubredditDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          handleAddSubreddit()
                        }
                      }}
                      placeholder="e.g. SaaS or indiehackers"
                    />
                    <button type="button" onClick={handleAddSubreddit} disabled={!subredditDraft.trim()}>
                      Add
                    </button>
                  </div>
                </div>

                <div className="actions">
                  <button
                    type="button"
                    className="primary"
                    onClick={handleDiscover}
                    disabled={isDiscovering || subreddits.length === 0}
                  >
                    {isDiscovering ? 'Launching…' : 'Research this segment'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setWizardCustomer('')
                      setWizardProblem('')
                      setSubredditDraft('')
                      setSubreddits([])
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
                  <div className="signal-meta__item">
                    <dt>Shortlist</dt>
                    <dd>{subreddits.length}</dd>
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
                      <strong>Confirm the subreddits</strong>
                      <small>The shortlist should feel plausible to someone inside the segment.</small>
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
          <PersonaChat key={selectedSegment?.id ?? 'empty'} segment={selectedSegment} />
        </section>
      </main>

      {banner ? (
        <aside className="toast" role="status" aria-live="polite">
          <strong>Board update</strong>
          {banner}
        </aside>
      ) : null}
    </div>
  )
}
