import { google } from '@ai-sdk/google'
import { generateText } from 'ai'
import { NextResponse } from 'next/server'
import { ChatSchema } from '../../../lib/validation'
import { getSegment, querySimilar } from '../../../lib/db'
import { embed as geminiEmbed } from '../../../lib/gemini'
import { MOCK_PERSONA } from '../../../lib/mockData'

type ChatMessage = {
  role?: string
  content?: unknown
}

function stringifyMessageContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === 'string'
          ? part
          : typeof part === 'object' && part !== null && 'text' in part
            ? String((part as { text?: unknown }).text ?? '')
            : ''
      )
      .filter(Boolean)
      .join(' ')
  }

  if (content == null) {
    return ''
  }

  return String(content)
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function buildFallbackReply(_personaName: string) {
  return `Honestly? I don't know how to answer that one. I've been thinking about it but I haven't really worked it out yet.`
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = ChatSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { segment_id, messages } = parsed.data
  const segment = await getSegment(segment_id)
  const soulDocument = segment?.soul_document ?? MOCK_PERSONA.soul_document
  const personaName = segment?.persona_name ?? MOCK_PERSONA.persona_name

  const typedMessages = messages as ChatMessage[]
  const lastUserMessage = [...typedMessages]
    .reverse()
    .find((message) => message.role === 'user')

  let evidenceBlock = ''

  if (segment && lastUserMessage) {
    try {
      const questionEmbedding = await geminiEmbed(
        stringifyMessageContent(lastUserMessage.content)
      )
      const chunks = await querySimilar(segment_id, questionEmbedding, 5)

      if (chunks.length > 0) {
        const safeChunks = chunks.map(escapeHtml).join('\n---\n')
        evidenceBlock = [
          '',
          'Draw on these things you have said or thought from real posts:',
          '<evidence>',
          safeChunks,
          '</evidence>',
        ].join('\n')
      }
    } catch {
      // Proceed without RAG evidence if retrieval fails.
    }
  }

  const systemPrompt = [
    soulDocument,
    evidenceBlock,
    '',
    `You are ${personaName} — a real person, not an assistant, not a coach, not a chatbot.`,
    `A founder is interviewing you. Answer from your own experience, fears, and frustrations.`,
    `Speak in first person. Be specific and direct. Disagree when something doesn't match your reality.`,
    `Never offer to help the founder. Never suggest what they should build. You are the customer being interviewed, not a consultant.`,
    `Never say you are an AI. Never break character. Keep responses to 2-4 sentences unless the question demands more.`,
  ]
    .filter(Boolean)
    .join('\n')

  const generateArgs = { system: systemPrompt, messages: messages as any }

  for (const model of ['gemini-3.1-pro-preview', 'gemini-2.0-flash']) {
    try {
      const result = await generateText({ model: google(model), ...generateArgs })
      return NextResponse.json({ persona_name: personaName, reply: result.text, fallback: false })
    } catch {
      // try next model
    }
  }

  return NextResponse.json({
    persona_name: personaName,
    reply: buildFallbackReply(personaName),
    fallback: true,
  })
}
