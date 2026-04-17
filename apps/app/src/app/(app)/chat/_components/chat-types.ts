export const KODI_DM_ID = 'kodi'

export type Channel = {
  id: string
  orgId: string
  name: string
  slug: string
  createdBy: string | null
  createdAt: string | Date
}

export type Message = {
  id: string
  orgId: string
  channelId: string
  threadRootMessageId: string | null
  userId: string | null
  role: 'user' | 'assistant'
  content: string
  status: string | null
  createdAt: string | Date
  userName?: string | null
  userImage?: string | null
}
