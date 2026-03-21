'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'

import { PersonaChat } from './components/PersonaChat'
import {
  SegmentCard,
  type SegmentCardData,
  type SegmentStatus,
} from './components/SegmentCard'
import {
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
}

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

export default function Page() {
  const [icpDescription, setIcpDescription] = useState(
    'Bootstrapped SaaS founders who are frustrated with pricing, churn, and feature creep.',
  )
  const [subreddits, setSubreddits] = useState<string[]>([])
  const [subredditDraft, setSubredditDraft] = useState('')
  const [segments, setSegments] = useState<SegmentCardData[]>([])
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null)
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isSuggesting, setIsSuggesting] = useState(false)
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)

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
    const trimmed = icpDescription.trim()
    if (!trimmed) return

    logClient('suggest_start', {
      icpLength: trimmed.length,
      currentShortlist: subreddits,
    })
    setIsSuggesting(true)
    setBanner(null)

    try {
      const response = await fetch('/api/suggest-subreddits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ icp_description: trimmed }),
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
    const trimmed = icpDescription.trim()
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

  function handleResetBoard() {
    startTransition(() => {
      setSegments([])
      setSelectedSegmentId(null)
      setSubreddits([])
      setSubredditDraft('')
      setActiveRunId(null)
      setBanner('Board cleared.')
    })
  }

  const liveSegments = segments
  const boardLabel = liveSegments.length > 0 ? 'Live slate' : 'Empty slate'

  return (
    <div className="app-shell">
      <section className="container intake-shell">
        <section className="panel panel--priority">
          <div className="panel__title">
            <div>
              <p className="eyebrow">Discovery intake</p>
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
              <div className="field">
                <label htmlFor="icp">ICP description</label>
                <textarea
                  id="icp"
                  value={icpDescription}
                  onChange={(event) => setIcpDescription(event.target.value)}
                  placeholder="Describe the founders, operators, or buyers you want to understand."
                />
                <div className="field__help">
                  Keep it specific enough to surface pain signals, but not so narrow that the board
                  goes quiet.
                </div>
              </div>

              <div className="field">
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
                      No subreddits selected yet. Use suggestions or add them manually.
                    </div>
                  )}
                </div>
                <div className="field__help">Max five subreddits are worth keeping in the shortlist.</div>
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
                    Add subreddit
                  </button>
                </div>
              </div>

              <div className="actions">
                <button type="button" className="primary" onClick={handleSuggestSubreddits} disabled={isSuggesting}>
                  {isSuggesting ? 'Suggesting…' : 'Suggest subreddits'}
                </button>
                <button type="button" onClick={handleResetBoard}>
                  Reset board
                </button>
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
                  onClick={() => setBanner('Discovery only starts from the shortlist you confirm here.')}
                  disabled={subreddits.length === 0}
                >
                  Explain shortlist
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
                    <strong>Describe the ICP</strong>
                    <small>Start with the buying context and the pressure points.</small>
                  </div>
                </div>
                <div className="timeline__step">
                  <span>2</span>
                  <div>
                    <strong>Confirm the subreddits</strong>
                    <small>The shortlist should feel plausible to someone inside the segment.</small>
                  </div>
                </div>
                <div className="timeline__step">
                  <span>3</span>
                  <div>
                    <strong>Research and interview</strong>
                    <small>The board updates while the persona room stays open.</small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </section>

      <header className="masthead container">
        <section className="masthead__intro">
          <div>
            <p className="eyebrow">Customer Discovery Board</p>
            <h1>Turn ICP notes into a living interview board.</h1>
            <p>
              Enter a founder profile, shortlist the right subreddits, and keep the composite
              persona ready across sessions while the pipeline runs in the background.
            </p>
          </div>

          <div className="status-line" aria-live="polite">
            <span className="status-dot" />
            {activeRunId
              ? `Run active • ${formatStatus('indexing')}`
              : selectedSegment
                ? `Focused on ${selectedSegment.persona_name ?? 'the selected segment'}`
                : 'Waiting for the first discovery run'}
          </div>
        </section>

        <aside className="masthead__signal" aria-label="Discovery pulse">
          <div className="signal-orbit">
            <span className="signal-orbit__core" />
            <span className="signal-orbit__bar" />
            <span className="signal-orbit__bar" />
            <span className="signal-orbit__bar" />
            <span className="signal-orbit__bar" />
            <span className="signal-orbit__bar" />
          </div>

          <dl className="signal-meta">
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
        </aside>
      </header>

      <main className="container workspace-grid">
        <section className="workspace workspace--board">
          <div className="workspace__title">
            <p className="eyebrow">Segment board</p>
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
                  onChat={(next) => setSelectedSegmentId(next.id)}
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

        <PersonaChat key={selectedSegment?.id ?? 'empty'} segment={selectedSegment} />
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
