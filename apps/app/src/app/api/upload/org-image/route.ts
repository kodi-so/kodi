import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db, eq, orgMembers, organizations } from '@kodi/db'
import { uploadObject, deleteObject, keyFromUrl } from '@/lib/r2'

const MAX_SIZE_BYTES = 2 * 1024 * 1024 // 2 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

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

  if (!(ALLOWED_TYPES as readonly string[]).includes(file.type)) {
    return NextResponse.json(
      { error: 'Only JPEG, PNG, WebP, and GIF images are supported' },
      { status: 400 }
    )
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'Image must be under 2 MB' }, { status: 400 })
  }

  // Fetch current image so we can clean up the old R2 object on overwrite
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: { image: true },
  })

  const body = Buffer.from(await file.arrayBuffer())
  const ext = EXT[file.type] ?? 'bin'
  const key = `org-images/${orgId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const imageUrl = await uploadObject(key, body, file.type)

  await db.update(organizations).set({ image: imageUrl }).where(eq(organizations.id, orgId))

  // Best-effort cleanup of old R2 object (don't fail the request if this errors)
  if (org?.image) {
    const oldKey = keyFromUrl(org.image)
    if (oldKey) {
      deleteObject(oldKey).catch((err) =>
        console.warn('[r2] Failed to delete old org image:', err)
      )
    }
  }

  return NextResponse.json({ image: imageUrl })
}

export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const orgId = url.searchParams.get('orgId')
  if (!orgId) {
    return NextResponse.json({ error: 'orgId required' }, { status: 400 })
  }

  const membership = await db.query.orgMembers.findFirst({
    where: (m, { and, eq }) => and(eq(m.orgId, orgId), eq(m.userId, session.user.id)),
  })
  if (!membership || membership.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: { image: true },
  })

  await db.update(organizations).set({ image: null }).where(eq(organizations.id, orgId))

  // Best-effort R2 cleanup
  if (org?.image) {
    const key = keyFromUrl(org.image)
    if (key) {
      deleteObject(key).catch((err) =>
        console.warn('[r2] Failed to delete org image on remove:', err)
      )
    }
  }

  return NextResponse.json({ ok: true })
}
