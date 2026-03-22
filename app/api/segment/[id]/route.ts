import { NextResponse } from 'next/server'
import { getSegment, getLogs, updateSegment, type SegmentStatus } from '../../../../lib/db'

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

const VALID_STATUSES: SegmentStatus[] = ['indexing', 'reading', 'synthesizing', 'ready', 'failed']

export async function PATCH(req: Request, context: SegmentRouteContext) {
  const { id } = await resolveParams(context)
  console.log('[api/segment] patch_start', { id })

  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { status, persona_name } = body as { status?: string; persona_name?: string }
  const updates: { status?: SegmentStatus; persona_name?: string } = {}

  if (status !== undefined) {
    if (VALID_STATUSES.includes(status as SegmentStatus)) {
      updates.status = status as SegmentStatus
    } else {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }
  }

  if (persona_name !== undefined) {
    updates.persona_name = persona_name
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  try {
    await updateSegment(id, updates)
    console.log('[api/segment] patch_success', { id, updates })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[api/segment] patch_failed', { id, error })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update segment' },
      { status: 500 }
    )
  }
}
