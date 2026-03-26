import { router } from '../trpc'
import { instanceRouter } from './instance/router'

export const appRouter = router({
  instance: instanceRouter,
})

export type AppRouter = typeof appRouter
