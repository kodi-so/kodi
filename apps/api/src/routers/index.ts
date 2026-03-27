import { router } from '../trpc'
import { instanceRouter } from './instance/router'
import { chatRouter } from './chat/router'
import { inviteRouter } from './invite/router'

export const appRouter = router({
  instance: instanceRouter,
  chat: chatRouter,
  invite: inviteRouter,
})

export type AppRouter = typeof appRouter
