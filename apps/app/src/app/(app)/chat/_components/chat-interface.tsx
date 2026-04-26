'use client'

import { DashboardAssistant } from '../../dashboard/_components/dashboard-assistant'
import { ChatSidebar } from './chat-sidebar'
import { ChatChannelView } from './chat-channel-view'
import { ChatThreadView } from './chat-thread-view'
import { MobileConversationTabs } from './chat-mobile-tabs'
import { useChatState } from './use-chat-state'
import { KODI_DM_ID } from './chat-types'

export function ChatInterface({
  orgId,
  orgName,
  initialPrompt,
  initialDirectId,
  initialChannelId,
  initialThreadId,
}: {
  orgId: string
  orgName: string
  initialPrompt?: string | null
  initialDirectId?: string | null
  initialChannelId?: string | null
  initialThreadId?: string | null
}) {
  const chat = useChatState({
    orgId,
    initialPrompt,
    initialDirectId,
    initialChannelId,
    initialThreadId,
  })

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <ChatSidebar
        orgName={orgName}
        channels={chat.channels}
        loadingChannels={chat.loadingChannels}
        selectedDirectId={chat.selectedDirectId}
        selectedChannelId={chat.selectedChannelId}
        creatingChannel={chat.creatingChannel}
        createChannelError={chat.createChannelError}
        onSelectDirect={chat.selectDirect}
        onSelectChannel={chat.selectChannel}
        onCreateChannel={chat.createChannel}
      />

      <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <MobileConversationTabs
          channels={chat.channels}
          selectedDirectId={chat.selectedDirectId}
          selectedChannelId={chat.selectedChannelId}
          creatingChannel={chat.creatingChannel}
          createChannelError={chat.createChannelError}
          onSelectDirect={chat.selectDirect}
          onSelectChannel={chat.selectChannel}
          onCreateChannel={chat.createChannel}
        />

        <div className="min-h-0 flex-1">
          {chat.selectedDirectId === KODI_DM_ID ? (
            <DashboardAssistant
              orgId={orgId}
              orgName={orgName}
              embedded
              initialThreadId={
                initialDirectId === KODI_DM_ID ? initialThreadId : null
              }
              buildThreadUrl={(threadId) =>
                chat.buildChatUrl({ directId: KODI_DM_ID, threadId })
              }
            />
          ) : !chat.selectedThreadId ? (
            <ChatChannelView
              channel={chat.selectedChannel}
              rootMessages={chat.rootMessages}
              repliesByThread={chat.repliesByThread}
              respondingRootIds={chat.respondingRootIds}
              loadingMessages={chat.loadingMessages}
              loadingOlder={chat.loadingOlder}
              hasMoreOlder={chat.hasMoreOlder}
              onLoadOlder={() => void chat.loadOlderMessages()}
              draft={chat.messageDraft}
              onDraftChange={chat.setMessageDraft}
              onSend={() => void chat.sendMessage({ message: chat.messageDraft })}
              sending={chat.sendingMain}
              error={chat.error}
              onOpenThread={chat.openThread}
            />
          ) : (
            <ChatThreadView
              rootMessage={chat.selectedThreadRoot}
              replies={chat.selectedThreadReplies}
              loadingMessages={chat.loadingMessages}
              channelSlug={chat.selectedChannel?.slug ?? 'general'}
              draft={chat.threadDraft}
              onDraftChange={chat.setThreadDraft}
              onSend={() =>
                chat.selectedThreadRoot
                  ? void chat.sendMessage({
                      message: chat.threadDraft,
                      threadRootMessageId: chat.selectedThreadRoot.id,
                    })
                  : undefined
              }
              sending={chat.sendingThread}
              error={chat.error}
              onClose={chat.closeThread}
            />
          )}
        </div>
      </section>
    </div>
  )
}
