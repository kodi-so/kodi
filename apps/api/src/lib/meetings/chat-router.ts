import { db, eq, meetingSessions } from '@kodi/db'
import type { MeetingChatEvent } from './events'
import { sendRecallBotChatMessage } from '../providers/recall/client'
import { generateMeetingAnswer } from './answer-engine'
import {
  createAnswerRequest,
  markAnswerDeliveredToChat,
  markAnswerFailed,
  markAnswerGrounded,
  suppressAnswer,
  transitionAnswerState,
} from './answer-lifecycle'
import { getWorkspaceMeetingCopilotConfig, resolveMeetingSessionControls } from './copilot-policy'

type OrgIdentity = {
  id: string
  name: string
  slug: string
}

type ChatRouterContext = {
  meetingSessionId: string
  org: OrgIdentity
  chatEvent: MeetingChatEvent
}

// Detect whether a chat message is a direct mention of the bot.
// Matches "@Kodi", "@kodi", or any configured bot display name.
export function detectMentionInMessage(
  content: string,
  botNames: string[]
): { isMention: boolean; question: string } {
  const trimmed = content.trim()

  for (const name of botNames) {
    if (!name) continue
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`^@${escaped}\\b\\s*`, 'i')
    if (pattern.test(trimmed)) {
      return {
        isMention: true,
        question: trimmed.replace(pattern, '').trim(),
      }
    }
  }

  return { isMention: false, question: trimmed }
}

// Check whether the chat message was sent by the bot itself to prevent echo loops.
export function isBotOwnMessage(
  chatEvent: MeetingChatEvent,
  botDisplayName: string
): boolean {
  const senderName = chatEvent.message.sender?.displayName ?? ''
  return senderName.toLowerCase() === botDisplayName.toLowerCase()
}

// Main entry point called from the ingestion pipeline after a chat event is persisted.
export async function routeMeetingChatEvent(ctx: ChatRouterContext): Promise<void> {
  const { meetingSessionId, org, chatEvent } = ctx

  const content = chatEvent.message.content ?? ''
  if (!content.trim()) return

  const [meetingSession, copilotConfig] = await Promise.all([
    db.query.meetingSessions.findFirst({
      where: (fields, { eq }) => eq(fields.id, meetingSessionId),
    }),
    getWorkspaceMeetingCopilotConfig(db, org),
  ])

  if (!meetingSession) return

  const { settings, identity } = copilotConfig
  const botNames = [identity.displayName, 'kodi'].filter(Boolean)

  // Prevent echo: ignore messages the bot sent itself
  if (isBotOwnMessage(chatEvent, identity.displayName)) return

  const { isMention, question } = detectMentionInMessage(content, botNames)

  if (!isMention) return
  if (!question) return

  // Check participation mode and controls
  const controls = await resolveMeetingSessionControls(db, {
    meetingSessionId,
    orgId: org.id,
    settings,
  })

  if (controls.liveResponsesDisabled) {
    return
  }

  if (
    controls.participationMode === 'listen_only' ||
    controls.participationMode === 'chat_enabled' === false
  ) {
    return
  }

  // Create the answer record
  const answer = await createAnswerRequest({
    meetingSessionId,
    orgId: org.id,
    requestedByUserId: null,
    source: 'chat',
    question,
  })

  await transitionAnswerState(answer.id, meetingSessionId, 'preparing')

  // Generate the answer
  const result = await generateMeetingAnswer({
    orgId: org.id,
    meetingSession,
    question,
  })

  if (!result.ok) {
    if (result.reason === 'no-context') {
      await suppressAnswer(
        answer.id,
        meetingSessionId,
        'No meeting context available yet.'
      )
    } else {
      await markAnswerFailed(answer.id, meetingSessionId, result.reason)
    }
    return
  }

  await markAnswerGrounded(answer.id, meetingSessionId, result.answerText, result.grounding)

  // Deliver to Zoom chat
  const botSessionId = meetingSession.providerBotSessionId
  if (!botSessionId) {
    await markAnswerFailed(
      answer.id,
      meetingSessionId,
      'No active bot session to deliver chat reply.'
    )
    return
  }

  try {
    await sendRecallBotChatMessage(botSessionId, result.answerText)
    await markAnswerDeliveredToChat(answer.id, meetingSessionId)
  } catch (err) {
    await markAnswerFailed(
      answer.id,
      meetingSessionId,
      err instanceof Error ? err.message : 'Failed to send chat message.'
    )
  }
}
