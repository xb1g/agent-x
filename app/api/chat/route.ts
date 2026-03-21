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

function buildFallbackReply(personaName: string) {
  return [
    `${personaName} here. I don't have enough live data yet, but I can still talk through the problem.`,
    'If you want, I can help you sharpen the ICP, identify the strongest pain points, or narrow the question you are trying to validate.',
  ].join(' ')
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
    `You are ${personaName}. Stay fully in character at all times.`,
    `Respond as ${personaName} would - use their voice, fears, and beliefs.`,
    'Never break character. Never say you are an AI.',
    'Keep responses conversational, 2-4 sentences unless more depth is needed.',
  ]
    .filter(Boolean)
    .join('\n\n')

  try {
    const result = await generateText({
      model: google('gemini-3.1-pro-preview'),
      system: systemPrompt,
      messages: messages as any,
    })

    return NextResponse.json({
      persona_name: personaName,
      reply: result.text,
      fallback: false,
    })
  } catch {
    return NextResponse.json({
      persona_name: personaName,
      reply: buildFallbackReply(personaName),
      fallback: true,
    })
  }
}
