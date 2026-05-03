/**
 * Tool-call classification — used by both Kodi (`tool-access-runtime`)
 * and the kodi-bridge plugin (autonomy interceptor, KOD-390).
 *
 * The classifier is intentionally name-only: it inspects the tool's
 * SLUG/NAME signature and classifies as one of `read | draft | write |
 * admin`. Kodi's runtime adds description- and tag-aware refinements
 * on top (see `getToolCategory` in `tool-access-runtime.ts`); the
 * plugin uses just this name-based classifier because it doesn't have
 * the rich SessionTool shape at hook time.
 *
 * Lifted verbatim from the verb sets that lived in
 * `apps/api/src/lib/tool-access-runtime.ts` pre-KOD-394 — extraction
 * is a refactor, not a behavior change.
 */

export type ToolActionClass = 'read' | 'draft' | 'write' | 'admin'

export const READ_VERBS: ReadonlySet<string> = new Set([
  'GET',
  'LIST',
  'FIND',
  'SEARCH',
  'FETCH',
  'READ',
  'RETRIEVE',
  'QUERY',
  'LOOKUP',
  'DESCRIBE',
  'VIEW',
  'CHECK',
  'COUNT',
  'INSPECT',
])

export const DRAFT_VERBS: ReadonlySet<string> = new Set([
  'DRAFT',
  'PREVIEW',
  'PREPARE',
  'SUGGEST',
  'PLAN',
  'OUTLINE',
  'SUMMARIZE',
])

export const WRITE_VERBS: ReadonlySet<string> = new Set([
  'CREATE',
  'UPDATE',
  'UPSERT',
  'DELETE',
  'SEND',
  'POST',
  'WRITE',
  'EDIT',
  'REMOVE',
  'ADD',
  'REPLY',
  'COMMENT',
  'MERGE',
  'APPROVE',
  'REJECT',
  'ASSIGN',
  'MOVE',
  'ARCHIVE',
  'UNARCHIVE',
  'CLOSE',
  'OPEN',
  'COMPLETE',
  'CANCEL',
  'PUBLISH',
  'SHARE',
  'TAG',
  'UNTAG',
  'STAR',
  'UNSTAR',
  'SYNC',
  'RUN',
  'EXECUTE',
  'TRIGGER',
  'UPLOAD',
  'IMPORT',
  'EXPORT',
])

export const ADMIN_KEYWORDS: readonly string[] = [
  'ADMIN',
  'SCIM',
  'PERMISSION',
  'ROLE',
  'INSTALL',
  'UNINSTALL',
  'WEBHOOK',
  'TOKEN',
  'SECRET',
  'AUTH_CONFIG',
  'INTEGRATION',
]

/**
 * Classify a tool call from its name signature alone.
 *
 * `toolName` may be a slug ("GMAIL_SEND_EMAIL"), a slug+name pair
 * (`"slug name"`), or a fully-qualified composio tool id — anything
 * uppercase-able and tokenizable on `[^A-Z0-9]+`.
 *
 * Order of evaluation (preserved from the original `getToolCategory`):
 *   1. signature contains an ADMIN_KEYWORD → admin
 *   2. signature contains `DELETE_USER` or `MANAGE_` → admin
 *      (these are common patterns that aren't single-word ADMIN keywords)
 *   3. signature contains `DRAFT` OR a DRAFT_VERBS token → draft
 *   4. a slug token matches READ_VERBS → read
 *   5. a slug token matches WRITE_VERBS → write
 *   6. fallback → read
 *
 * Note: callers in `autonomy/interceptor.ts` (KOD-390) treat unknown
 * tool names as `write` for policy evaluation. That promotion happens
 * at the policy layer, not here — this fn returns 'read' as the
 * conservative-display fallback to match Kodi-side display behavior.
 */
export function classifyToolCall(toolName: string): ToolActionClass {
  const sig = toolName.toUpperCase()
  const slugTokens = sig.split(/[^A-Z0-9]+/).filter(Boolean)

  if (
    ADMIN_KEYWORDS.some((kw) => sig.includes(kw)) ||
    sig.includes('DELETE_USER') ||
    sig.includes('MANAGE_')
  ) {
    return 'admin'
  }

  if (sig.includes('DRAFT') || slugTokens.some((t) => DRAFT_VERBS.has(t))) {
    return 'draft'
  }

  if (slugTokens.some((t) => READ_VERBS.has(t))) return 'read'

  if (slugTokens.some((t) => WRITE_VERBS.has(t))) return 'write'

  return 'read'
}
