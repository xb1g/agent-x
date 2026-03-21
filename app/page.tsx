'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'

import { PersonaChat } from './components/PersonaChat'
import {
  SegmentCard,
  type SegmentCardData,
  type SegmentStatus,
} from './components/SegmentCard'

type SuggestionResponse = {
  subreddits?: string[]
}

type DiscoverResponse = {
  segment_id?: string
  status?: SegmentStatus
}

type SegmentResponse = SegmentCardData & {
  segment_size?: SegmentCardData['segment_size']
}

const DEMO_SEGMENTS: SegmentCardData[] = [
  {
    id: 'demo-bootstrapped-saas',
    icp_description:
      'Bootstrapped SaaS founders who feel pricing, churn, and feature creep colliding at the same time.',
    subreddits: ['SaaS', 'indiehackers', 'startups'],
    status: 'ready',
    status_message: null,
    persona_name: 'Maya',
    segment_size: {
      posts_indexed: 42,
      fragments_collected: 16,
      subreddits: ['SaaS', 'indiehackers', 'startups'],
      label: 'Signal dense',
    },
    pain_signals: ['Pricing anxiety', 'Churn loops', 'Founder overload'],
    updated_at: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
  },
  {
    id: 'demo-ai-agency',
    icp_description:
      'AI agency operators trying to keep clients happy while every workflow still changes every week.',
    subreddits: ['agency', 'Entrepreneur', 'smallbusiness'],
    status: 'reading',
    status_message: 'Deep reader agents are collecting the strongest complaint threads.',
    persona_name: 'Noah',
    segment_size: {
      posts_indexed: 28,
      fragments_collected: 9,
      subreddits: ['agency', 'Entrepreneur', 'smallbusiness'],
      label: 'Reading queue',
    },
    pain_signals: ['Scope drift', 'Tool fatigue', 'Retainer pressure'],
    updated_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
  {
    id: 'demo-marketplace',
    icp_description:
      'Solo operators selling digital products who need more buyers without adding another channel to manage.',
    subreddits: ['buildinpublic', 'marketing', 'freelance'],
    status: 'synthesizing',
    status_message: 'A synthesis pass is condensing fragments into a usable voice.',
    persona_name: 'Ari',
    segment_size: {
      posts_indexed: 67,
      fragments_collected: 24,
      subreddits: ['buildinpublic', 'marketing', 'freelance'],
      label: 'Almost ready',
    },
    pain_signals: ['Lumpy demand', 'Launch anxiety', 'Lead scarcity'],
    updated_at: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
  },
]

const EMPTY_SUBREDDITS = ['SaaS', 'indiehackers', 'startups']

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeSubreddit(value: string): string {
  return value.trim().replace(/^r\//i, '').replace(/^\/+/, '')
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.map(normalizeSubreddit).filter(Boolean))).slice(0, 5)
}

function fallbackSubreddits(icp: string): string[] {
  const value = icp.toLowerCase()
  const pool = new Set<string>()

  if (value.includes('saas') || value.includes('founder') || value.includes('pricing')) {
    pool.add('SaaS')
    pool.add('indiehackers')
    pool.add('startups')
  }

  if (value.includes('agency') || value.includes('client') || value.includes('marketing')) {
    pool.add('agency')
    pool.add('marketing')
    pool.add('Entrepreneur')
  }

  if (value.includes('solo') || value.includes('indie') || value.includes('freelance')) {
    pool.add('freelance')
    pool.add('buildinpublic')
    pool.add('smallbusiness')
  }

  if (value.includes('ai') || value.includes('automation') || value.includes('workflow')) {
    pool.add('ArtificialIntelligence')
    pool.add('ChatGPT')
    pool.add('automation')
  }

  while (pool.size < 5) {
    for (const subreddit of EMPTY_SUBREDDITS) {
      pool.add(subreddit)
      if (pool.size >= 5) break
    }
    if (pool.size >= 5) break
  }

  return Array.from(pool).slice(0, 5)
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

function parseSubreddits(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) {
      return dedupe(parsed.map((item) => String(item)))
    }
  } catch {
    // fall through to heuristics
  }

  return dedupe(
    trimmed
      .split(/[\n,]/g)
      .map((item) => item.trim())
      .filter(Boolean),
  )
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

export default function Page() {
  const [icpDescription, setIcpDescription] = useState(
    'Bootstrapped SaaS founders who are frustrated with pricing, churn, and feature creep.',
  )
  const [subreddits, setSubreddits] = useState<string[]>(['SaaS', 'indiehackers', 'startups'])
  const [segments, setSegments] = useState<SegmentCardData[]>(DEMO_SEGMENTS)
  const [selectedSegmentId, setSelectedSegmentId] = useState(DEMO_SEGMENTS[0]?.id ?? null)
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
        const response = await fetch(`/api/segment/${activeRunId}`)
        if (!response.ok) return

        const data = (await response.json()) as Partial<SegmentResponse>
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
            data.pain_signals ?? ['Waiting for the first high-signal posts to surface.'],
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

  async function handleSuggestSubreddits() {
    const trimmed = icpDescription.trim()
    if (!trimmed) return

    setIsSuggesting(true)
    setBanner(null)

  try {
      const response = await fetch('/api/suggest-subreddits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ icp_description: trimmed }),
      })

      if (!response.ok) {
        throw new Error('suggestions failed')
      }

      const contentType = response.headers.get('content-type') ?? ''
      const payload = contentType.includes('application/json')
        ? ((await response.json()) as SuggestionResponse | string[])
        : await response.text()

      const next = Array.isArray(payload)
        ? payload
        : typeof payload === 'string'
          ? parseSubreddits(payload)
          : Array.isArray(payload.subreddits)
            ? payload.subreddits
            : []

      startTransition(() => {
        setSubreddits(next.length ? dedupe(next) : fallbackSubreddits(trimmed))
      })
    } catch {
      startTransition(() => {
        setSubreddits(fallbackSubreddits(trimmed))
      })
      setBanner('Model suggestions were unavailable, so local heuristics filled the shortlist.')
    } finally {
      setIsSuggesting(false)
    }
  }

  async function handleDiscover() {
    const trimmed = icpDescription.trim()
    if (!trimmed) return

    const shortlist = subreddits.length ? subreddits : fallbackSubreddits(trimmed)

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

      if (!response.ok) {
        throw new Error('discover failed')
      }

      const payload = (await response.json()) as DiscoverResponse
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
      setSegments(DEMO_SEGMENTS)
      setSelectedSegmentId(DEMO_SEGMENTS[0]?.id ?? null)
      setSubreddits(['SaaS', 'indiehackers', 'startups'])
      setActiveRunId(null)
      setBanner('Board reset to the starter slate.')
    })
  }

  const liveSegments = segments
  const boardLabel = liveSegments.some((segment) => !segment.id.startsWith('demo-'))
    ? 'Live slate'
    : 'Starter slate'

  return (
    <div className="app-shell">
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

      <main className="container page-grid">
        <section className="panel">
          <div className="panel__title">
            <div>
              <p className="eyebrow">Discovery intake</p>
              <h2>Describe the segment and choose the signal sources.</h2>
              <p>Start broad, then let the suggestions narrow the board before you launch.</p>
            </div>
            <div className="status-line">{isPending || isSuggesting || isDiscovering ? 'Working' : 'Idle'}</div>
          </div>

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
            <label>Suggested subreddits</label>
        <div className="chip-row">
              {subreddits.map((subreddit) => (
                <button
                  key={subreddit}
                  type="button"
                  className={`chip ${subreddits.includes(subreddit) ? 'is-selected' : ''}`}
                  onClick={() =>
                    startTransition(() => {
                      setSubreddits((current) =>
                        current.includes(subreddit)
                          ? current.filter((item) => item !== subreddit)
                          : current.length >= 5
                            ? current
                            : [...current, subreddit],
                      )
                    })
                  }
                >
                  r/{subreddit}
                </button>
              ))}
            </div>
            <div className="field__help">Max five subreddits are worth keeping in the shortlist.</div>
          </div>

          <div className="actions">
            <button type="button" className="primary" onClick={handleSuggestSubreddits} disabled={isSuggesting}>
              {isSuggesting ? 'Suggesting…' : 'Suggest subreddits'}
            </button>
            <button type="button" onClick={handleResetBoard}>
              Reset board
            </button>
            <button type="button" className="primary" onClick={handleDiscover} disabled={isDiscovering}>
              {isDiscovering ? 'Launching…' : 'Research this segment'}
            </button>
            <button type="button" onClick={() => setBanner('Selected subreddits stay pinned until you change them.')}>
              Explain shortlist
            </button>
          </div>

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
        </section>

        <section className="workspace">
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
                <h3>No segments yet. Use the intake panel to launch the first run.</h3>
                <p>
                  The starter slate will appear here until the API returns live segment data.
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
