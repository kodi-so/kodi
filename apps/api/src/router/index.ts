import { router } from '../trpc'
import { instanceRouter } from './instance'

export const appRouter = router({
  instance: instanceRouter,
})

export type AppRouter = typeof appRouter
