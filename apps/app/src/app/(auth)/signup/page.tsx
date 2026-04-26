import { redirect } from 'next/navigation'

// Magic link handles both sign-in and sign-up from the same flow.
// New users get an account created automatically on first sign-in.
export default function SignUpPage({
  searchParams,
}: {
  searchParams: Record<string, string>
}) {
  const params = new URLSearchParams(searchParams)
  const redirectParam = params.get('redirect')
  const destination = redirectParam
    ? `/login?redirect=${encodeURIComponent(redirectParam)}`
    : '/login'
  redirect(destination)
}
