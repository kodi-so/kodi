import { router } from '../trpc'
import { instanceRouter } from './instance/router'
import { chatRouter } from './chat/router'
import { orgRouter } from './org/router'

export const appRouter = router({
  instance: instanceRouter,
  chat: chatRouter,
  org: orgRouter,
})

export type AppRouter = typeof appRouter
