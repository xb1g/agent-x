import { NextResponse } from 'next/server'
import { suggestProblems } from '../../../../lib/gemini'

export async function POST(req: Request) {
  const { segment } = await req.json()

  if (!segment || typeof segment !== 'string') {
    return NextResponse.json({ error: 'segment required' }, { status: 400 })
  }

  const problems = await suggestProblems(segment)
  return NextResponse.json({ problems })
}
