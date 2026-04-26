import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db, eq, orgMembers, organizations } from '@kodi/db'

const MAX_SIZE_BYTES = 2 * 1024 * 1024 // 2 MB limit for base64 storage
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const orgId = url.searchParams.get('orgId')
  if (!orgId) {
    return NextResponse.json({ error: 'orgId required' }, { status: 400 })
  }

  // Verify caller is owner of the org
  const membership = await db.query.orgMembers.findFirst({
    where: (m, { and, eq }) => and(eq(m.orgId, orgId), eq(m.userId, session.user.id)),
  })
  if (!membership || membership.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Only JPEG, PNG, WebP, and GIF images are supported' }, { status: 400 })
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'Image must be under 2 MB' }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')
  const dataUrl = `data:${file.type};base64,${base64}`

  await db
    .update(organizations)
    .set({ image: dataUrl })
    .where(eq(organizations.id, orgId))

  return NextResponse.json({ image: dataUrl })
}
