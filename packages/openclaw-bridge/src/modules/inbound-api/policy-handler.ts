import {
  parsePolicyResponse,
  type PolicyLoader,
} from '../autonomy/policy'
import type {
  UpdatePolicyHandler,
  UpdatePolicyHandlerResult,
} from './router'

/**
 * Inbound `POST /plugins/kodi-bridge/agents/update-policy` handler.
 *
 * Body shape — same as Kodi's `GET /api/openclaw/agents/:id/autonomy`
 * response (KOD-389): `{ agent_id, autonomy_level, overrides }`. Kodi
 * pushes the freshly-saved policy here after a `PUT /api/openclaw/agents/
 * :id/autonomy` (KOD-392) so the plugin's loader can update its cache
 * without a follow-up GET round-trip.
 *
 * On a malformed body we return 400; the plugin still has whatever was
 * in the cache previously. The Kodi caller is expected to retry on 5xx,
 * not on 400 (KOD-381 contract pattern).
 */
export function createUpdatePolicyHandler(
  loader: PolicyLoader,
): UpdatePolicyHandler {
  return async (rawBody): Promise<UpdatePolicyHandlerResult> => {
    const policy = parsePolicyResponse(rawBody)
    if (!policy) {
      return {
        kind: 'badRequest',
        message:
          'body must match { agent_id, autonomy_level: strict|normal|lenient|yolo, overrides: object|null }',
      }
    }
    loader.setPolicy(policy)
    return { kind: 'ok', body: { ok: true } }
  }
}
