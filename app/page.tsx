'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'

import { PersonaChat } from './components/PersonaChat'
import {
  SegmentCard,
  type SegmentCardData,
  type SegmentStatus,
} from './components/SegmentCard'
import { buildIcpDescription } from '../lib/intake'
import { suggestSegments, suggestProblems } from '../lib/gemini'

// Prospect type for inspect modal
type Prospect = {
  id: string
  username: string
  score: number
  snippet: string
  subreddit: string
  post_url: string
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
    case 'paused':
      return 'Paused'
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
  const [segments, setSegments] = useState<SegmentCardData[]>([])
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [inspectingSegment, setInspectingSegment] = useState<SegmentCardData | null>(null)
  const [inspectingProspects, setInspectingProspects] = useState<Prospect[]>([])
  const [isLoadingProspects, setIsLoadingProspects] = useState(false)
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  // Wizard state
  type WizardStep = 'customer' | 'segment' | 'problem'

  const [wizardStep, setWizardStep] = useState<WizardStep>('customer')
  const [roughInput, setRoughInput] = useState('')
  const [wizardSelectedSegment, setWizardSelectedSegment] = useState<string | null>(null)
  const [wizardSelectedProblem, setWizardSelectedProblem] = useState<string | null>(null)
  const [aiSegments, setAiSegments] = useState<string[]>([])
  const [aiProblems, setAiProblems] = useState<string[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  // Hydrate from localStorage after mount to avoid SSR mismatch
  useEffect(() => {
    try {
      const stored = localStorage.getItem('agentx_segments')
      const storedId = localStorage.getItem('agentx_selected_segment_id')
      if (stored) {
        setSegments(JSON.parse(stored) as SegmentCardData[])
      }
      if (storedId) {
        setSelectedSegmentId(storedId)
      }
    } catch {
      // Ignore parse errors
    }
    setHydrated(true)
  }, [])

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
          subreddits: data.subreddits ?? [],
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

  async function handlePauseSegment(segment: SegmentCardData) {
    const newStatus = segment.status === 'paused' ? 'reading' : 'paused'
    try {
      const response = await fetch(`/api/segment/${segment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!response.ok) throw new Error('pause failed')
      // Update local state
      startTransition(() => {
        setSegments((current) =>
          current.map((s) =>
            s.id === segment.id ? { ...s, status: newStatus as SegmentStatus } : s
          )
        )
      })
    } catch {
      setBanner('Could not pause/resume segment — backend unreachable.')
    }
  }

  async function handleRenameSegment(segment: SegmentCardData, newName: string) {
    try {
      const response = await fetch(`/api/segment/${segment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona_name: newName }),
      })
      if (!response.ok) throw new Error('rename failed')
      // Update local state
      startTransition(() => {
        setSegments((current) =>
          current.map((s) =>
            s.id === segment.id ? { ...s, persona_name: newName } : s
          )
        )
      })
      setEditingSegmentId(null)
      setEditName('')
    } catch {
      setBanner('Could not rename segment — backend unreachable.')
    }
  }

  async function handleInspectSegment(segment: SegmentCardData) {
    setInspectingSegment(segment)
    setIsLoadingProspects(true)
    try {
      const response = await fetch(`/api/segment/${segment.id}/prospects`)
      if (!response.ok) throw new Error('fetch prospects failed')
      const data = await response.json() as { prospects: Prospect[] }
      setInspectingProspects(data.prospects || [])
    } catch {
      setInspectingProspects([])
    } finally {
      setIsLoadingProspects(false)
    }
  }

  function handleStartEdit(segment: SegmentCardData) {
    setEditingSegmentId(segment.id)
    setEditName(segment.persona_name || '')
  }

  function handleCancelEdit() {
    setEditingSegmentId(null)
    setEditName('')
  }

  // Wizard handlers
  async function handleAnalyzeCustomer() {
    if (!roughInput.trim()) return
    setIsAnalyzing(true)
    try {
      const segments = await suggestSegments(roughInput)
      setAiSegments(segments)
      setWizardStep('segment')
    } catch (error) {
      console.error('Failed to analyze customer:', error)
    } finally {
      setIsAnalyzing(false)
    }
  }

  async function handleSelectSegment() {
    if (!wizardSelectedSegment) return
    setIsAnalyzing(true)
    try {
      const problems = await suggestProblems(wizardSelectedSegment)
      setAiProblems(problems)
      setWizardStep('problem')
    } catch (error) {
      console.error('Failed to get problems:', error)
    } finally {
      setIsAnalyzing(false)
    }
  }

  function handleStartResearch() {
    const customer = wizardSelectedSegment || roughInput
    const problem = wizardSelectedProblem || ''
    setWizardCustomer(customer)
    setWizardProblem(problem)
    handleDiscover()
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
      <header className="top-tabs" role="banner">
        <div className="tab-logo">
          <img src="/logo.png" alt="Logo" />
        </div>
        <nav className="top-tabs__nav" aria-label="Workspace tabs">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'research'}
            aria-controls="panel-research"
            className={`top-tabs__tab ${activeTab === 'research' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('research')}
          >
            Research
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'board'}
            aria-controls="panel-board"
            className={`top-tabs__tab ${activeTab === 'board' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('board')}
          >
            Board
            {metrics.pending > 0 && <span className="badge">{metrics.pending}</span>}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'interview'}
            aria-controls="panel-interview"
            className={`top-tabs__tab ${activeTab === 'interview' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('interview')}
          >
            Interview
          </button>
        </nav>
      </header>

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
              <div className="wizard-step">
                {/* Step 1: Customer Input */}
                {wizardStep === 'customer' && (
                  <div className="wizard-step__content">
                    <div className="field wizard-field">
                      <label htmlFor="wizard-rough-input">
                        <span className="wizard-field__num">01</span>
                        Who is your customer?
                      </label>
                      <textarea
                        id="wizard-rough-input"
                        className="wizard-input-large"
                        value={roughInput}
                        onChange={(e) => setRoughInput(e.target.value)}
                        placeholder="Describe your customer in plain language... (e.g., 'SaaS founders who are struggling with pricing')"
                        rows={4}
                      />
                    </div>

                    <div className="wizard-examples">
                      <span className="wizard-examples__label">Examples:</span>
                      <div className="wizard-examples__chips">
                        <button
                          type="button"
                          className="wizard-example-chip"
                          onClick={() => setRoughInput('Bootstrapped SaaS founders with $10k-$100k MRR struggling with pricing')}
                        >
                          Bootstrapped SaaS founders
                        </button>
                        <button
                          type="button"
                          className="wizard-example-chip"
                          onClick={() => setRoughInput('Freelance designers who want to productize their services')}
                        >
                          Freelance designers
                        </button>
                        <button
                          type="button"
                          className="wizard-example-chip"
                          onClick={() => setRoughInput('Remote team managers dealing with async communication challenges')}
                        >
                          Remote team managers
                        </button>
                      </div>
                    </div>

                    <div className="wizard-nav">
                      <button
                        type="button"
                        className="primary"
                        onClick={handleAnalyzeCustomer}
                        disabled={isAnalyzing || !roughInput.trim()}
                      >
                        {isAnalyzing ? 'Analyzing…' : 'Next →'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 2: Segment Selection */}
                {wizardStep === 'segment' && (
                  <div className="wizard-step__content">
                    <div className="field wizard-field">
                      <label>
                        <span className="wizard-field__num">02</span>
                        Which segment fits best?
                      </label>
                    </div>

                    <div className="wizard-options">
                      {aiSegments.map((segment, index) => (
                        <button
                          key={index}
                          type="button"
                          className={`wizard-option ${wizardSelectedSegment === segment ? 'is-selected' : ''}`}
                          onClick={() => setWizardSelectedSegment(segment)}
                        >
                          <span className="wizard-option__radio" />
                          <span className="wizard-option__text">{segment}</span>
                        </button>
                      ))}
                    </div>

                    <div className="wizard-nav">
                      <button
                        type="button"
                        onClick={() => setWizardStep('customer')}
                      >
                        ← Back
                      </button>
                      <button
                        type="button"
                        className="primary"
                        onClick={handleSelectSegment}
                        disabled={isAnalyzing || !wizardSelectedSegment}
                      >
                        {isAnalyzing ? 'Analyzing…' : 'Next →'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 3: Problem Selection */}
                {wizardStep === 'problem' && (
                  <div className="wizard-step__content">
                    <div className="field wizard-field">
                      <label>
                        <span className="wizard-field__num">03</span>
                        What problem are they trying to solve?
                      </label>
                    </div>

                    <div className="wizard-options">
                      {aiProblems.map((problem, index) => (
                        <button
                          key={index}
                          type="button"
                          className={`wizard-option ${wizardSelectedProblem === problem ? 'is-selected' : ''}`}
                          onClick={() => setWizardSelectedProblem(problem)}
                        >
                          <span className="wizard-option__radio" />
                          <span className="wizard-option__text">{problem}</span>
                        </button>
                      ))}
                      <div className="wizard-option wizard-option--custom">
                        <span className="wizard-option__radio" />
                        <input
                          type="text"
                          placeholder="Or describe your own problem..."
                          value={wizardSelectedProblem && !aiProblems.includes(wizardSelectedProblem) ? wizardSelectedProblem : ''}
                          onChange={(e) => setWizardSelectedProblem(e.target.value)}
                          onFocus={() => setWizardSelectedProblem('')}
                        />
                      </div>
                    </div>

                    <div className="wizard-nav">
                      <button
                        type="button"
                        onClick={() => setWizardStep('segment')}
                      >
                        ← Back
                      </button>
                      <button
                        type="button"
                        className="primary"
                        onClick={handleStartResearch}
                        disabled={isDiscovering}
                      >
                        {isDiscovering ? 'Starting…' : 'Start Research'}
                      </button>
                    </div>
                  </div>
                )}
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
                    isEditing={editingSegmentId === segment.id}
                    editName={editName}
                    onSelect={(next) => setSelectedSegmentId(next.id)}
                    onChat={(next) => {
                      setSelectedSegmentId(next.id)
                      setActiveTab('interview')
                    }}
                    onRestart={(next) => void handleRestart(next)}
                    onPause={(next) => void handlePauseSegment(next)}
                    onInspect={(next) => void handleInspectSegment(next)}
                    onStartEdit={(next) => handleStartEdit(next)}
                    onCancelEdit={handleCancelEdit}
                    onSaveEdit={(next, name) => void handleRenameSegment(next, name)}
                    onEditNameChange={setEditName}
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

      {/* Inspect Modal */}
      {inspectingSegment && (
        <div
          className="inspect-modal"
          onClick={(e) => {
            if (e.target === e.currentTarget) setInspectingSegment(null)
          }}
        >
          <div className="inspect-modal__content">
            <div className="inspect-modal__header">
              <div>
                <h2>{inspectingSegment.persona_name ?? 'Unnamed Persona'}</h2>
                <p className="inspect-modal__subheader">{inspectingSegment.icp_description}</p>
              </div>
              <button
                type="button"
                className="inspect-modal__close"
                onClick={() => setInspectingSegment(null)}
                aria-label="Close modal"
              >
                ×
              </button>
            </div>

            <div className="inspect-modal__body">
              {/* Overview Section */}
              <section className="inspect-modal__section">
                <h3>Overview</h3>
                <div className="inspect-modal__stats">
                  <div className="inspect-modal__stat">
                    <dt>Posts Analyzed</dt>
                    <dd>{inspectingSegment.segment_size?.posts_indexed ?? 0}</dd>
                  </div>
                  <div className="inspect-modal__stat">
                    <dt>High-Relevance</dt>
                    <dd>{inspectingSegment.segment_size?.fragments_collected ?? 0}</dd>
                  </div>
                  <div className="inspect-modal__stat">
                    <dt>Subreddits</dt>
                    <dd>{inspectingSegment.subreddits.length}</dd>
                  </div>
                </div>
                {inspectingSegment.subreddits.length > 0 && (
                  <div className="inspect-modal__subreddits">
                    {inspectingSegment.subreddits.map((sub) => (
                      <span key={sub} className="inspect-modal__subreddit">
                        r/{sub}
                      </span>
                    ))}
                  </div>
                )}
              </section>

              {/* Prospects Section */}
              <section className="inspect-modal__section">
                <h3>Prospects</h3>
                {isLoadingProspects ? (
                  <div className="inspect-modal__loading">Loading prospects...</div>
                ) : inspectingProspects.length === 0 ? (
                  <div className="inspect-modal__empty">No prospects found.</div>
                ) : (
                  <div className="inspect-modal__prospects">
                    {inspectingProspects.map((prospect) => (
                      <div key={prospect.id} className="prospect-card">
                        <div className="prospect-card__header">
                          <span className="prospect-card__username">u/{prospect.username}</span>
                          <span className="prospect-card__score">{prospect.score}% match</span>
                        </div>
                        <p className="prospect-card__snippet">{prospect.snippet}</p>
                        <div className="prospect-card__meta">
                          <span className="prospect-card__subreddit">r/{prospect.subreddit}</span>
                        </div>
                        <div className="prospect-card__actions">
                          <a
                            href={prospect.post_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="prospect-card__link"
                          >
                            View Post →
                          </a>
                          <a
                            href={`https://reddit.com/user/${prospect.username}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="prospect-card__link prospect-card__link--secondary"
                          >
                            Reddit Profile →
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
