import type { Config } from 'tailwindcss'
import { kodiTailwindTheme } from '@kodi/ui/tailwind-theme'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      ...kodiTailwindTheme,
    },
  },
  plugins: [],
}

export default config
