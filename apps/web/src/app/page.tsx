import { HeroSection } from '@/components/marketing/hero-section'
import { ProofBand } from '@/components/marketing/proof-band'
import { StoryChapters } from '@/components/marketing/story-chapters'
import { LiveContextChapter } from '@/components/marketing/live-context-chapter'
import { ControlledAutonomyChapter } from '@/components/marketing/controlled-autonomy-chapter'
import { IntegrationsChapter } from '@/components/marketing/integrations-chapter'
import { AudienceChapter } from '@/components/marketing/audience-chapter'
import { TrustFaqChapter } from '@/components/marketing/trust-faq-chapter'
import { ClosingCta } from '@/components/marketing/closing-cta'

export default function HomePage() {
  return (
    <main>
      <HeroSection />
      <ProofBand />
      <StoryChapters />
      <LiveContextChapter />
      <ControlledAutonomyChapter />
      <IntegrationsChapter />
      <AudienceChapter />
      <TrustFaqChapter />
      <ClosingCta />
    </main>
  )
}
