import type { KodiBridgeModule } from '../../types/module'

/**
 * `autonomy` — per-agent policy evaluation, deferred-approval queue,
 * resume-via-injection. Real impl: M5 (KOD-389, 390, 415, 416).
 */
export const autonomyModule: KodiBridgeModule = {
  id: 'autonomy',
  register: () => {
    // KOD-389 policy loader; KOD-390 interceptor; KOD-415 durable queue; KOD-416 resume.
  },
}
