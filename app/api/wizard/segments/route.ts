import { NextResponse } from 'next/server'
import { suggestSegments } from '../../../../lib/gemini'

export async function POST(req: Request) {
  const { roughInput } = await req.json()

  if (!roughInput || typeof roughInput !== 'string') {
    return NextResponse.json({ error: 'roughInput required' }, { status: 400 })
  }

  const segments = await suggestSegments(roughInput)
  return NextResponse.json({ segments })
}
