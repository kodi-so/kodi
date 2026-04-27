import { proofBandItems } from '@/content/marketing/homepage'

export function ProofBand() {
  return (
    <div className="border-y border-border/60 bg-card/50 py-10">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <dl className="grid grid-cols-1 divide-y divide-border/50 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {proofBandItems.map((item) => (
            <div
              key={item.stat}
              className="flex flex-col items-center gap-1 px-6 py-6 text-center first:pt-0 last:pb-0 sm:py-0"
            >
              <dt className="text-3xl tracking-[-0.05em] text-foreground">
                {item.stat}
              </dt>
              <dd className="text-sm text-muted-foreground">{item.label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
