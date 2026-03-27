import { router } from '../trpc'
import { instanceRouter } from './instance/router'
import { chatRouter } from './chat/router'

export const appRouter = router({
  instance: instanceRouter,
  chat: chatRouter,
})

export type AppRouter = typeof appRouter
