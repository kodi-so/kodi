'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from '@/lib/auth-client'
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Separator,
} from '@kodi/ui'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') ?? '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  async function handleGoogleSignIn() {
    setGoogleLoading(true)
    setError('')
    try {
      await signIn.social({ provider: 'google', callbackURL: redirectTo })
    } catch {
      setError('Failed to sign in with Google. Please try again.')
      setGoogleLoading(false)
    }
  }

  async function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await signIn.email({
        email,
        password,
        callbackURL: redirectTo,
      })
      if (result?.error) {
        setError(result.error.message ?? 'Invalid email or password.')
        setLoading(false)
      } else {
        router.push(redirectTo)
      }
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-8 text-[#223239]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(223,174,86,0.2),transparent_26%),radial-gradient(circle_at_82%_18%,rgba(111,168,140,0.12),transparent_22%),linear-gradient(180deg,#f9f7f0_0%,#f6f4ee_36%,#f0ece1_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(62,80,86,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(62,80,86,0.05)_1px,transparent_1px)] bg-[size:88px_88px] opacity-40 [mask-image:linear-gradient(180deg,rgba(0,0,0,0.28),transparent_82%)]"
      />

      <div className="relative mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,0.8fr)] lg:items-center">
        <section className="rounded-[2rem] border border-white/80 bg-white/74 p-7 shadow-[0_28px_70px_rgba(34,50,57,0.12)] backdrop-blur-sm sm:p-10">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[0_14px_28px_rgba(34,50,57,0.08)]">
              <Image
                src="/brand/kodi-logo.png"
                alt=""
                width={34}
                height={34}
                className="h-auto w-8 object-contain"
                priority
              />
            </span>
            <div>
              <p className="font-brand text-xl tracking-[-0.05em] text-[#223239]">
                Kodi
              </p>
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#6f8388]">
                Control room
              </p>
            </div>
          </div>

          <p className="mt-10 text-xs uppercase tracking-[0.22em] text-[#6f8388]">
            Welcome back
          </p>
          <h1 className="mt-4 max-w-[10ch] font-brand text-[clamp(2.8rem,6vw,4.8rem)] leading-[0.95] tracking-[-0.06em] text-[#223239]">
            Step back into the work Kodi is carrying.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-[#4d6369]">
            Review what moved, approve what matters, and give Kodi more of the
            operational load so your team can stay focused on the bigger system.
          </p>

          <div className="mt-8 grid gap-3">
            <div className="rounded-[1.35rem] border border-[#c9d2d4] bg-white/80 px-5 py-4">
              <p className="text-sm text-[#223239]">Live meeting support</p>
              <p className="mt-1 text-sm leading-7 text-[#5d7379]">
                Kodi keeps context straight while the room is still deciding.
              </p>
            </div>
            <div className="rounded-[1.35rem] border border-[#c9d2d4] bg-white/80 px-5 py-4">
              <p className="text-sm text-[#223239]">Controlled autonomy</p>
              <p className="mt-1 text-sm leading-7 text-[#5d7379]">
                Choose where Kodi drafts, where it asks, and where it executes.
              </p>
            </div>
            <div className="rounded-[1.35rem] border border-[#DFAE56]/18 bg-[linear-gradient(180deg,rgba(223,174,86,0.2),rgba(223,174,86,0.08))] px-5 py-4 text-[#223239]">
              <p className="text-sm">One shared AI teammate for the team</p>
              <p className="mt-1 text-sm leading-7 text-[#4b5f65]">
                Meetings, updates, approvals, and execution stay connected.
              </p>
            </div>
          </div>
        </section>

        <Card className="rounded-[2rem] border-white/10 bg-[linear-gradient(180deg,rgba(46,63,69,0.96),rgba(31,44,49,0.98))] shadow-[0_30px_80px_rgba(8,13,16,0.28)]">
          <CardHeader className="space-y-2 pb-8">
            <CardTitle className="font-brand text-[2.35rem] tracking-[-0.05em] text-white">
              Sign in
            </CardTitle>
            <CardDescription className="text-[#9db0b4]">
              Use the account that has access to your Kodi workspace.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <Button
              onClick={handleGoogleSignIn}
              disabled={googleLoading || loading}
              variant="outline"
              className="h-11 w-full gap-3 rounded-xl border-white/10 bg-white/6 text-[#f4f1e8] hover:border-white/16 hover:bg-white/10"
            >
              {googleLoading ? (
                <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              ) : (
                <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
              )}
              Continue with Google
            </Button>

            <div className="flex items-center gap-3">
              <Separator className="flex-1 bg-white/10" />
              <span className="text-xs uppercase tracking-[0.18em] text-[#81959a]">
                Or
              </span>
              <Separator className="flex-1 bg-white/10" />
            </div>

            <form onSubmit={handleEmailSignIn} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-[0.16em] text-[#9db0b4]">
                  Email
                </label>
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-11 rounded-xl border-white/10 bg-white/6 text-white placeholder:text-[#7f9398] focus-visible:ring-[#DFAE56]"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-[0.16em] text-[#9db0b4]">
                  Password
                </label>
                <Input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-11 rounded-xl border-white/10 bg-white/6 text-white placeholder:text-[#7f9398] focus-visible:ring-[#DFAE56]"
                />
              </div>

              {error && (
                <Alert className="border-[#D97A63]/30 bg-[#D97A63]/12 text-[#ffd8ce]">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                disabled={loading || googleLoading}
                className="h-11 w-full rounded-xl bg-[#DFAE56] text-sm text-[#223239] hover:bg-[#e8bf70]"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 rounded-full border-2 border-[#223239]/30 border-t-[#223239] animate-spin" />
                    Signing in…
                  </span>
                ) : (
                  'Sign in'
                )}
              </Button>
            </form>

            <p className="text-center text-sm text-[#9db0b4]">
              Don&apos;t have an account?{' '}
              <Link
                href="/signup"
                className="text-[#F0C570] transition hover:text-[#f6d289]"
              >
                Create one
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F6F4EE]">
          <div className="h-6 w-6 rounded-full border-2 border-[#DFAE56]/40 border-t-[#DFAE56] animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
