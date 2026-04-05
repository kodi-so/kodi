export const kodiTailwindTheme = {
  colors: {
    border: 'hsl(var(--border))',
    input: 'hsl(var(--input))',
    ring: 'hsl(var(--ring))',
    background: 'hsl(var(--background))',
    foreground: 'hsl(var(--foreground))',
    primary: {
      DEFAULT: 'hsl(var(--primary))',
      foreground: 'hsl(var(--primary-foreground))',
    },
    secondary: {
      DEFAULT: 'hsl(var(--secondary))',
      foreground: 'hsl(var(--secondary-foreground))',
    },
    muted: {
      DEFAULT: 'hsl(var(--muted))',
      foreground: 'hsl(var(--muted-foreground))',
    },
    accent: {
      DEFAULT: 'hsl(var(--accent))',
      foreground: 'hsl(var(--accent-foreground))',
    },
    destructive: {
      DEFAULT: 'hsl(var(--destructive))',
      foreground: 'hsl(var(--destructive-foreground))',
    },
    card: {
      DEFAULT: 'hsl(var(--card))',
      foreground: 'hsl(var(--card-foreground))',
    },
    popover: {
      DEFAULT: 'hsl(var(--popover))',
      foreground: 'hsl(var(--popover-foreground))',
    },
    brand: {
      canvas: 'hsl(var(--kodi-canvas))',
      panel: 'hsl(var(--kodi-panel))',
      muted: 'hsl(var(--kodi-panel-muted))',
      line: 'hsl(var(--kodi-border))',
      ink: 'hsl(var(--kodi-text))',
      quiet: 'hsl(var(--kodi-text-muted))',
      accent: 'hsl(var(--kodi-accent))',
      accentStrong: 'hsl(var(--kodi-accent-strong))',
      success: 'hsl(var(--kodi-success))',
      warning: 'hsl(var(--kodi-warning))',
      danger: 'hsl(var(--kodi-danger))',
    },
  },
  borderRadius: {
    lg: 'var(--radius)',
    md: 'calc(var(--radius) - 2px)',
    sm: 'calc(var(--radius) - 6px)',
  },
  boxShadow: {
    soft: '0 28px 60px -36px rgba(68, 49, 16, 0.24)',
  },
  fontFamily: {
    sans: ['var(--font-abeezee)', 'system-ui', 'sans-serif'],
  },
}
