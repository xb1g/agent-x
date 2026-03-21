import { NextResponse } from 'next/server'
import { getSegment } from '../../../../lib/db'

type SegmentRouteContext =
  | { params: { id: string } }
  | { params: Promise<{ id: string }> }

async function resolveParams(context: SegmentRouteContext) {
  return await Promise.resolve(context.params)
}

export async function GET(_req: Request, context: SegmentRouteContext) {
  const { id } = await resolveParams(context)
  const segment = await getSegment(id)

  if (!segment) {
    return NextResponse.json({ error: 'Segment not found' }, { status: 404 })
  }

  return NextResponse.json(segment)
}
