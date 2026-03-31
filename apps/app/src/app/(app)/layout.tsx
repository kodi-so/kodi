import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers()
  const cookies = headersList.get('cookie')
  console.log('[AppLayout] DEBUG: cookie header =', cookies)
  
  try {
    const session = await auth.api.getSession({ headers: headersList })
    console.log('[AppLayout] DEBUG: session result =', session)
    
    if (!session) {
      console.log('[AppLayout] DEBUG: session is null/falsy, redirecting to /login')
      redirect('/login')
    }
    
    return <AppShell>{children}</AppShell>
  } catch (error) {
    console.error('[AppLayout] ERROR: getSession() threw:', error instanceof Error ? error.message : error)
    console.error('[AppLayout] ERROR: full error:', error)
    throw error
  }
}
