'use client'

import { useParams } from 'next/navigation'
import { IntegrationsPage } from '../_components/integrations-page'

export default function IntegrationDetailPage() {
  const params = useParams<{ toolkitSlug: string }>()
  const slug = decodeURIComponent(params.toolkitSlug)
  return <IntegrationsPage initialToolkitSlug={slug} />
}
