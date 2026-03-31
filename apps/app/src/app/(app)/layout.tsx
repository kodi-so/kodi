import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'

async function getValidSession(headersList: Awaited<ReturnType<typeof headers>>) {
  const cookieString = headersList.get('cookie') || ''
  
  // Extract ALL session tokens from the cookie (there may be multiple due to cross-subdomain cookies)
  const tokenRegex = /__Secure-better-auth\.session_token=([^;]+)/g
  const tokens: string[] = []
  let match
  while ((match = tokenRegex.exec(cookieString)) !== null) {
    tokens.push(match[1])
  }
  
  console.log('[AppLayout] DEBUG: found', tokens.length, 'session token(s) in cookie')
  tokens.forEach((token, i) => {
    console.log(`[AppLayout] DEBUG: token ${i + 1} = ${token.substring(0, 20)}...`)
  })
  
  // Try the first token with the full headers (better-auth's default behavior)
  let session = await auth.api.getSession({ headers: headersList })
  if (session) {
    console.log('[AppLayout] DEBUG: session found with first token')
    return session
  }
  
  console.log('[AppLayout] DEBUG: first token failed, trying remaining tokens...')
  
  // If that didn't work and we have multiple tokens, try each one individually
  // by creating new headers with only that token
  for (let i = 1; i < tokens.length; i++) {
    console.log(`[AppLayout] DEBUG: trying token ${i + 1}...`)
    const customHeaders = new Headers(headersList)
    customHeaders.set('cookie', `__Secure-better-auth.session_token=${tokens[i]}`)
    
    try {
      session = await auth.api.getSession({ headers: customHeaders })
      if (session) {
        console.log(`[AppLayout] DEBUG: ✓ session found with token ${i + 1}`)
        return session
      }
    } catch (e) {
      console.log(`[AppLayout] DEBUG: token ${i + 1} lookup failed:`, e instanceof Error ? e.message : e)
    }
  }
  
  return null
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers()
  
  try {
    const session = await getValidSession(headersList)
    
    if (!session) {
      console.log('[AppLayout] DEBUG: no valid session found, redirecting to /login')
      redirect('/login')
    }
    
    return <AppShell>{children}</AppShell>
  } catch (error) {
    console.error('[AppLayout] ERROR: getSession threw:', error instanceof Error ? error.message : error)
    throw error
  }
}
