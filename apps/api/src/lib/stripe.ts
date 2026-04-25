import Stripe from 'stripe'
import { requireStripeBilling } from '../env'

let _stripe: Stripe | undefined

export function getStripe(): Stripe {
  const { STRIPE_SECRET_KEY } = requireStripeBilling()
  _stripe ??= new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' })
  return _stripe
}
