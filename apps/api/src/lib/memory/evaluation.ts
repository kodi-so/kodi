import type { NormalizedMemoryUpdateEvent } from './events'

export type MemoryUpdateScopeDecision = 'org' | 'member' | 'both' | 'none'

export type MemoryUpdateAction =
  | 'ignore'
  | 'update_existing'
  | 'create_new'
  | 'delete_obsolete'
  | 'trigger_structural_maintenance'

export type MemoryUpdateDurability = 'durable' | 'temporary'

export type MemoryUpdateEvaluation = {
  scope: MemoryUpdateScopeDecision
  action: MemoryUpdateAction
  durability: MemoryUpdateDurability
  shouldWrite: boolean
  confidence: 'low' | 'medium' | 'high'
  rationale: string[]
  signalTags: string[]
}

const ORG_SIGNAL_PATTERNS: Array<[string, RegExp]> = [
  ['project_state', /\b(project|roadmap|launch|milestone|customer|team|org|company|process)\b/i],
  ['decision', /\b(decid(?:e|ed|ing)|decision|agreed|approved|resolved)\b/i],
  ['next_steps', /\b(next step|next steps|owner|ownership|follow[- ]?up|action item|deadline|due)\b/i],
]

const MEMBER_SIGNAL_PATTERNS: Array<[string, RegExp]> = [
  ['preference', /\b(prefer|preference|working style|async|sync|remind me|remember that i|i prefer)\b/i],
  ['private_context', /\b(private|personal|my responsibility|my current work|my commitment|1:1|direct message)\b/i],
  ['responsibility', /\b(responsib(?:ility|ilities)|commitment|task list|working style)\b/i],
]

const TEMPORARY_SIGNAL_PATTERNS = [
  /\b(hello|thanks|thank you|sounds good|great|okay|ok|noted|cool)\b/i,
]

export function evaluateMemoryUpdateEvent(
  event: NormalizedMemoryUpdateEvent
): MemoryUpdateEvaluation {
  const text = extractEventText(event)
  const signalTags = collectSignalTags(text)
  const rationale: string[] = []

  if (event.source === 'meeting') {
    if (event.payload.trigger === 'completed') {
      rationale.push('Meeting completion can change shared current state.')
      return buildEvaluation({
        scope: 'org',
        action: 'update_existing',
        durability: 'durable',
        confidence: 'medium',
        rationale,
        signalTags: uniqueStrings([...signalTags, 'meeting_completion']),
      })
    }

    if (event.payload.trigger === 'transcript_updated') {
      rationale.push('Final meeting transcript evidence is durable enough to inspect further.')
      return buildEvaluation({
        scope: 'org',
        action: 'update_existing',
        durability: 'durable',
        confidence: 'medium',
        rationale,
        signalTags: uniqueStrings([...signalTags, 'meeting_transcript']),
      })
    }

    rationale.push('This meeting state change looks temporary rather than durable.')
    return ignoredEvaluation(rationale, uniqueStrings([...signalTags, 'meeting_state']))
  }

  if (event.source === 'user_request') {
    rationale.push('Explicit user requests should flow into the durable memory pipeline.')
    return buildEvaluation({
      scope: inferScopeFromTextAndVisibility(event, signalTags),
      action: 'update_existing',
      durability: 'durable',
      confidence: 'high',
      rationale,
      signalTags: uniqueStrings([...signalTags, 'explicit_request']),
    })
  }

  if (event.source === 'openclaw_proposal') {
    rationale.push('OpenClaw memory proposals are intended as durable memory candidates.')
    return buildEvaluation({
      scope: inferScopeFromTextAndVisibility(event, signalTags),
      action:
        event.payload.operation === 'delete'
          ? 'delete_obsolete'
          : event.payload.operation === 'move' || event.payload.operation === 'rename'
            ? 'trigger_structural_maintenance'
            : 'update_existing',
      durability: 'durable',
      confidence: 'medium',
      rationale,
      signalTags: uniqueStrings([...signalTags, 'agent_proposal']),
    })
  }

  if (event.source === 'work_item') {
    if (/\b(assign|block|complete|reopen|due|priority|owner)\b/i.test(event.payload.changeType)) {
      rationale.push('Work item state changes can update durable current work and ownership context.')
      return buildEvaluation({
        scope: event.visibility === 'private' ? 'member' : 'org',
        action: 'update_existing',
        durability: 'durable',
        confidence: 'medium',
        rationale,
        signalTags: uniqueStrings([...signalTags, 'work_item_change']),
      })
    }

    rationale.push('This work item change does not look durable enough yet.')
    return ignoredEvaluation(rationale, uniqueStrings([...signalTags, 'work_item_change']))
  }

  if (event.source === 'integration_sync') {
    if (/\b(created|updated|deleted|synced|status|owner)\b/i.test(event.payload.eventType)) {
      rationale.push('Integration sync changes can affect durable org context.')
      return buildEvaluation({
        scope: 'org',
        action: 'update_existing',
        durability: 'durable',
        confidence: 'medium',
        rationale,
        signalTags: uniqueStrings([...signalTags, 'integration_sync']),
      })
    }

    rationale.push('This integration sync event does not clearly change durable memory.')
    return ignoredEvaluation(rationale, uniqueStrings([...signalTags, 'integration_sync']))
  }

  if (looksTemporary(text) && signalTags.length === 0) {
    rationale.push('The event reads like transient conversational chatter.')
    return ignoredEvaluation(rationale, ['temporary_chat'])
  }

  if (signalTags.length === 0) {
    rationale.push('The event does not contain a durable decision, preference, next step, or ownership signal yet.')
    return ignoredEvaluation(rationale, [])
  }

  rationale.push('The event contains durable conversational signals worth routing into memory.')
  return buildEvaluation({
    scope: inferScopeFromTextAndVisibility(event, signalTags),
    action: 'update_existing',
    durability: 'durable',
    confidence: signalTags.length >= 2 ? 'high' : 'medium',
    rationale,
    signalTags,
  })
}

function extractEventText(event: NormalizedMemoryUpdateEvent) {
  const metadata = event.metadata ?? {}
  const parts = [
    event.summary,
    stringValue(metadata.userMessage),
    stringValue(metadata.assistantMessage),
    stringValue(metadata.text),
    stringValue(metadata.meetingTitle),
  ]

  return parts.filter(Boolean).join('\n').trim()
}

function collectSignalTags(text: string) {
  const tags = new Set<string>()

  for (const [tag, pattern] of ORG_SIGNAL_PATTERNS) {
    if (pattern.test(text)) tags.add(tag)
  }

  for (const [tag, pattern] of MEMBER_SIGNAL_PATTERNS) {
    if (pattern.test(text)) tags.add(tag)
  }

  return [...tags]
}

function inferScopeFromTextAndVisibility(
  event: NormalizedMemoryUpdateEvent,
  signalTags: string[]
): MemoryUpdateScopeDecision {
  const hasOrgSignals = signalTags.some((tag) =>
    ['project_state', 'decision', 'next_steps'].includes(tag)
  )
  const hasMemberSignals = signalTags.some((tag) =>
    ['preference', 'private_context', 'responsibility'].includes(tag)
  )

  if (hasOrgSignals && hasMemberSignals) {
    return 'both'
  }

  if (hasOrgSignals) {
    return 'org'
  }

  if (hasMemberSignals) {
    return event.actor?.orgMemberId || event.visibility === 'private'
      ? 'member'
      : 'org'
  }

  if (event.visibility === 'shared') {
    return 'org'
  }

  if (event.visibility === 'private') {
    return event.actor?.orgMemberId ? 'member' : 'org'
  }

  return 'org'
}

function buildEvaluation(input: {
  scope: MemoryUpdateScopeDecision
  action: MemoryUpdateAction
  durability: MemoryUpdateDurability
  confidence: 'low' | 'medium' | 'high'
  rationale: string[]
  signalTags: string[]
}): MemoryUpdateEvaluation {
  return {
    ...input,
    shouldWrite: input.scope !== 'none' && input.action !== 'ignore',
    rationale: uniqueStrings(input.rationale),
    signalTags: uniqueStrings(input.signalTags),
  }
}

function ignoredEvaluation(
  rationale: string[],
  signalTags: string[]
): MemoryUpdateEvaluation {
  return buildEvaluation({
    scope: 'none',
    action: 'ignore',
    durability: 'temporary',
    confidence: 'low',
    rationale,
    signalTags,
  })
}

function looksTemporary(text: string) {
  return TEMPORARY_SIGNAL_PATTERNS.some((pattern) => pattern.test(text))
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}
