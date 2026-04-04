'use client'

import Image from 'next/image'
import { Suspense, useState } from 'react'
import { signIn } from '@/lib/auth-client'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
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
  // Where to send the user after login — honour ?redirect= if present
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
    } catch (e) {
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
    } catch (e) {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4">
      {/* Background glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(223,174,86,0.14) 0%, transparent 70%), radial-gradient(circle at 18% 18%, rgba(62,80,86,0.2) 0%, transparent 38%)',
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <span className="flex h-9 w-9 items-center justify-center">
            <Image
              src="/brand/kodi-logo.png"
              alt=""
              width={36}
              height={36}
              className="h-auto w-full object-contain invert drop-shadow-[0_12px_22px_rgba(255,255,255,0.08)]"
              priority
            />
          </span>
          <span className="font-brand text-xl tracking-[-0.04em] text-white">
            Kodi
          </span>
        </div>

        <Card className="rounded-2xl border-zinc-800 bg-zinc-900/80 backdrop-blur-sm">
          <CardHeader className="space-y-1 pb-7 text-center">
            <CardTitle className="font-brand text-center text-[2rem] tracking-[-0.04em] text-white">
              Welcome back
            </CardTitle>
            <CardDescription className="text-center text-zinc-500">
              Sign in to your account
            </CardDescription>
          </CardHeader>

          {/* Google Sign In */}
          <CardContent className="space-y-4">
            <Button
              onClick={handleGoogleSignIn}
              disabled={googleLoading || loading}
              variant="outline"
              className="mb-4 h-10 w-full gap-3 border-zinc-700 bg-zinc-800 text-zinc-200 hover:border-zinc-600 hover:bg-zinc-700 hover:text-zinc-100"
            >
              {googleLoading ? (
                <span className="w-4 h-4 rounded-full border-2 border-zinc-400 border-t-transparent animate-spin" />
              ) : (
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
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

            {/* Divider */}
            <div className="flex items-center gap-3 mb-4">
              <Separator className="flex-1 bg-zinc-800" />
              <span className="text-zinc-600 text-xs">or</span>
              <Separator className="flex-1 bg-zinc-800" />
            </div>

            {/* Email form */}
            <form onSubmit={handleEmailSignIn} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                  Email
                </label>
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-11 rounded-lg border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-600 focus-visible:ring-[#DFAE56]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                  Password
                </label>
                <Input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-11 rounded-lg border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-600 focus-visible:ring-[#DFAE56]"
                />
              </div>

              {error && (
                <Alert
                  variant="destructive"
                  className="border-red-500/20 bg-red-500/10 text-center text-red-400 [&>div]:pl-0"
                >
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                disabled={loading || googleLoading}
                className="h-11 w-full rounded-lg bg-[#DFAE56] text-sm font-semibold text-[#223239] hover:bg-[#e6b86a]"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    Signing in…
                  </span>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>

            <p className="text-center text-zinc-500 text-sm mt-6">
              Don't have an account?{' '}
              <Link
                href="/signup"
                className="font-medium text-[#DFAE56] transition-colors hover:text-[#edc786]"
              >
                Sign up!
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
        <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
