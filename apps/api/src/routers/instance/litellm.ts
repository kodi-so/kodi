import { createLiteLLMClient } from '@kodi/db'
import { requireLiteLLM } from '../../env'

function getClient() {
  const { LITELLM_PROXY_URL, LITELLM_MASTER_KEY } = requireLiteLLM()
  return createLiteLLMClient(LITELLM_PROXY_URL, LITELLM_MASTER_KEY)
}

export const createCustomer = (
  userId: string,
  maxBudgetDollars: number,
) => getClient().createCustomer(userId, maxBudgetDollars)

export const generateKey = (
  userId: string,
  maxBudgetDollars: number,
) => getClient().generateKey(userId, maxBudgetDollars)

export const getKeyInfo = (virtualKey: string) =>
  getClient().getKeyInfo(virtualKey)

export const updateKeyBudget = (
  virtualKey: string,
  newBudgetDollars: number,
) => getClient().updateKeyBudget(virtualKey, newBudgetDollars)

export const deleteCustomer = (userId: string) =>
  getClient().deleteCustomer(userId)
