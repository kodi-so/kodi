import { NextRequest, NextResponse } from 'next/server'

type DemoRequestBody = {
  name?: string
  email?: string
  company?: string
  message?: string
}

export async function POST(req: NextRequest) {
  let body: DemoRequestBody
  try {
    body = (await req.json()) as DemoRequestBody
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { name, email, company, message } = body

  if (!email || !name) {
    return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
  }

  const utmSource = req.nextUrl.searchParams.get('utm_source')
  const referrer = req.headers.get('referer')

  /* Log the lead — replace with your email/CRM integration */
  console.log('[demo-request]', {
    name,
    email,
    company,
    message,
    utmSource,
    referrer,
    receivedAt: new Date().toISOString(),
  })

  return NextResponse.json({ ok: true }, { status: 200 })
}
