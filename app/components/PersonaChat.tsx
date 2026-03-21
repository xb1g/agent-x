'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import type { SegmentCardData } from './SegmentCard'

type ChatRole = 'user' | 'assistant'

type ChatMessage = {
  id: string
  role: ChatRole
  content: string
}

type PersonaChatProps = {
  segment: SegmentCardData | null
  className?: string
}

type ChatApiResponse = {
  reply?: string
  persona_name?: string
  fallback?: boolean
}

const QUICK_PROMPTS = [
  'What are you trying to get done this week?',
  'What keeps you from solving this today?',
  'What would make this feel worth paying for?',
  'Show me where the current workflow breaks.',
]

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function markdownPreview(segment: SegmentCardData | null): string {
  if (!segment) {
    return 'Pick a segment to reveal the working memory behind the persona.'
  }

  const size = segment.segment_size
  const summary = [
    `ICP: ${segment.icp_description}`,
    `Subreddits: ${segment.subreddits.join(', ')}`,
    size ? `Signal: ${size.posts_indexed} posts, ${size.fragments_collected} fragments, ${size.label}` : null,
    segment.status_message ? `Status: ${segment.status_message}` : null,
  ]
    .filter(Boolean)
    .join('\n\n')

  return summary
}

function fallbackReply(question: string, segment: SegmentCardData | null): string {
  const persona = segment?.persona_name ?? 'the persona'
  const clean = question.trim().toLowerCase()

  if (clean.includes('price') || clean.includes('pay')) {
    return `${persona} will pay when the outcome is immediate and the risk of keeping the current workflow feels higher than the subscription.`
  }

  if (clean.includes('why') || clean.includes('stuck') || clean.includes('problem')) {
    return `${persona} is stuck between urgency and distrust. They want a simpler path, but only if it feels grounded in how they already work.`
  }

  if (clean.includes('workflow') || clean.includes('process') || clean.includes('today')) {
    return `${persona} is already improvising around a brittle process. They want fewer handoffs, fewer tabs, and a clearer decision point.`
  }

  return `${persona} hears this as a request for clarity: reduce the guesswork, show the next step, and make progress visible without adding another tool to manage.`
}

export function PersonaChat({ segment, className }: PersonaChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const viewportRef = useRef<HTMLDivElement | null>(null)

  const intro = useMemo(() => {
    if (!segment) {
      return 'Select a segment to open the interview room.'
    }

    return `You're interviewing ${segment.persona_name ?? 'the selected persona'}. Keep the questions specific, grounded, and concrete.`
  }, [segment])

  useEffect(() => {
    setMessages([
      {
        id: makeId('assistant'),
        role: 'assistant',
        content: intro,
      },
    ])
    setDraft('')
  }, [intro, segment?.id])

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, isSending])

  async function sendMessage(nextDraft: string) {
    const trimmed = nextDraft.trim()
    if (!trimmed || !segment) return

    const nextMessages: ChatMessage[] = [
      ...messages,
      { id: makeId('user'), role: 'user', content: trimmed },
    ]

    setMessages(nextMessages)
    setDraft('')
    setIsSending(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          segment_id: segment.id,
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
        }),
      })

      if (!response.ok) {
        throw new Error('chat failed')
      }

      const contentType = response.headers.get('content-type') ?? ''
      let reply = ''

      if (contentType.includes('application/json')) {
        const payload = (await response.json()) as ChatApiResponse
        reply = payload.reply?.trim() ?? ''
      } else {
        reply = (await response.text()).trim()
      }

      reply = reply || fallbackReply(trimmed, segment)

      setMessages((current) => [
        ...current,
        { id: makeId('assistant'), role: 'assistant', content: reply },
      ])
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 450))
      setMessages((current) => [
        ...current,
        {
          id: makeId('assistant'),
          role: 'assistant',
          content: fallbackReply(trimmed, segment),
        },
      ])
    } finally {
      setIsSending(false)
    }
  }

  return (
    <section className={['chat-panel', className].filter(Boolean).join(' ')}>
      <div className="chat-panel__header">
        <p className="eyebrow">Persona interview</p>
        <h2>{segment?.persona_name ?? 'Select a segment'}</h2>
        <p>{segment ? segment.icp_description : 'The chat room stays ready while the board is still loading.'}</p>
      </div>

      <div className="chat-panel__memory">
        <h3>Working memory</h3>
        <div className="soul-markdown">{markdownPreview(segment)}</div>
      </div>

      <div ref={viewportRef} className="chat-panel__stream" aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className="message" data-role={message.role}>
            <div className="message__meta">{message.role === 'user' ? 'Founder' : 'Persona'}</div>
            <div className="message__bubble">{message.content}</div>
          </div>
        ))}
        {isSending ? (
          <div className="typing">
            <span>Persona is thinking</span>
            <span className="typing__dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </div>
        ) : null}
      </div>

      <div className="composer">
        <div className="composer__quick">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => setDraft(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            void sendMessage(draft)
          }}
        >
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={
              segment
                ? `Ask ${segment.persona_name ?? 'this persona'} a question...`
                : 'Select a segment to start the interview.'
            }
            disabled={!segment || isSending}
          />
          <div className="composer__footer">
            <span>{segment ? 'Streaming-friendly fallback enabled when the API is offline.' : 'Choose a segment to unlock chat.'}</span>
            <button type="submit" className="primary" disabled={!segment || isSending || !draft.trim()}>
              {isSending ? 'Sending…' : 'Send question'}
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
