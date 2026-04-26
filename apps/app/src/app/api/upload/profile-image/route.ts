import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { deleteObject, keyFromUrl, uploadObject } from '@/lib/r2'
import {
  IMAGE_EXTENSION_BY_UPLOAD_TYPE,
  MAX_IMAGE_UPLOAD_BYTES,
  isAllowedImageUploadType,
} from '@/lib/image-upload'
import { db, eq, user } from '@kodi/db'

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (!isAllowedImageUploadType(file.type)) {
    return NextResponse.json(
      { error: 'Only JPEG, PNG, WebP, and GIF images are supported' },
      { status: 400 }
    )
  }

  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'Image must be under 2 MB' }, { status: 400 })
  }

  const existingUser = await db.query.user.findFirst({
    where: eq(user.id, session.user.id),
    columns: { image: true },
  })

  const body = Buffer.from(await file.arrayBuffer())
  const ext = IMAGE_EXTENSION_BY_UPLOAD_TYPE[file.type]
  const key = `user-images/${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const imageUrl = await uploadObject(key, body, file.type)

  await db.update(user).set({ image: imageUrl }).where(eq(user.id, session.user.id))

  if (existingUser?.image) {
    const oldKey = keyFromUrl(existingUser.image)
    if (oldKey) {
      deleteObject(oldKey).catch((err) =>
        console.warn('[r2] Failed to delete old profile image:', err)
      )
    }
  }

  return NextResponse.json({ image: imageUrl })
}

export async function DELETE() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const existingUser = await db.query.user.findFirst({
    where: eq(user.id, session.user.id),
    columns: { image: true },
  })

  await db.update(user).set({ image: null }).where(eq(user.id, session.user.id))

  if (existingUser?.image) {
    const key = keyFromUrl(existingUser.image)
    if (key) {
      deleteObject(key).catch((err) =>
        console.warn('[r2] Failed to delete profile image on remove:', err)
      )
    }
  }

  return NextResponse.json({ ok: true })
}
