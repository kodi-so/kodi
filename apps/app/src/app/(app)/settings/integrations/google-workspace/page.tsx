import { redirect } from 'next/navigation'

export default function LegacyGoogleWorkspaceRedirectPage() {
  redirect('/integrations/add')
}
