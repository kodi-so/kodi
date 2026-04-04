import { redirect } from 'next/navigation'

export default function LegacyZoomRedirectPage() {
  redirect('/meetings')
}
