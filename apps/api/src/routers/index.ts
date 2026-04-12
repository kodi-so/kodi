import { router } from '../trpc'
import { instanceRouter } from './instance/router'
import { chatRouter } from './chat/router'
import { dashboardAssistantRouter } from './dashboard-assistant/router'
import { inviteRouter } from './invite/router'
import { orgRouter } from './org/router'
import { meetingRouter } from './meeting/router'
import { workRouter } from './work/router'
import { toolAccessRouter } from './tool-access/router'
import { approvalRouter } from './approval/router'

export const appRouter = router({
  instance: instanceRouter,
  chat: chatRouter,
  dashboardAssistant: dashboardAssistantRouter,
  approval: approvalRouter,
  invite: inviteRouter,
  org: orgRouter,
  meeting: meetingRouter,
  work: workRouter,
  toolAccess: toolAccessRouter,
})

export type AppRouter = typeof appRouter
