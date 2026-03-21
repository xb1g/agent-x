import { NextResponse } from 'next/server'
import { getSegment, getLogs } from '../../../../lib/db'

type SegmentRouteContext =
  | { params: { id: string } }
  | { params: Promise<{ id: string }> }

async function resolveParams(context: SegmentRouteContext) {
  return await Promise.resolve(context.params)
}

export async function GET(_req: Request, context: SegmentRouteContext) {
  const { id } = await resolveParams(context)
  console.log('[api/segment] lookup_start', { id })
  const [segment, logs] = await Promise.all([
    getSegment(id),
    getLogs(id),
  ])

  if (!segment) {
    console.warn('[api/segment] lookup_missing', { id })
    return NextResponse.json({ error: 'Segment not found' }, { status: 404 })
  }

  console.log('[api/segment] lookup_success', {
    id,
    status: segment.status,
    persona_name: segment.persona_name,
    status_message: segment.status_message,
  })

  return NextResponse.json({ ...segment, logs })
}
