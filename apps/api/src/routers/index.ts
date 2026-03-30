import { router } from '../trpc'
import { instanceRouter } from './instance/router'
import { chatRouter } from './chat/router'
import { inviteRouter } from './invite/router'
import { orgRouter } from './org/router'
import { zoomRouter } from './zoom/router'
import { meetingRouter } from './meeting/router'
import { workRouter } from './work/router'

export const appRouter = router({
  instance: instanceRouter,
  chat: chatRouter,
  invite: inviteRouter,
  org: orgRouter,
  zoom: zoomRouter,
  meeting: meetingRouter,
  work: workRouter,
})

export type AppRouter = typeof appRouter
