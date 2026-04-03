import { redirect } from 'next/navigation'

export default function LegacyToolAccessRedirectPage() {
  redirect('/integrations/add')
}
