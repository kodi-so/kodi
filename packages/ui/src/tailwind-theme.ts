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
      elevated: 'hsl(var(--kodi-panel-elevated))',
      sidebar: 'hsl(var(--kodi-sidebar))',
      'sidebar-elevated': 'hsl(var(--kodi-sidebar-elevated))',
      line: 'hsl(var(--kodi-border))',
      'line-strong': 'hsl(var(--kodi-border-strong))',
      ink: 'hsl(var(--kodi-text))',
      quiet: 'hsl(var(--kodi-text-muted))',
      subtle: 'hsl(var(--kodi-text-subtle))',
      accent: 'hsl(var(--kodi-accent))',
      'accent-soft': 'hsl(var(--kodi-accent-soft))',
      'accent-strong': 'hsl(var(--kodi-accent-strong))',
      'accent-foreground': 'hsl(var(--kodi-accent-foreground))',
      success: 'hsl(var(--kodi-success))',
      'success-soft': 'hsl(var(--kodi-success-soft))',
      warning: 'hsl(var(--kodi-warning))',
      'warning-soft': 'hsl(var(--kodi-warning-soft))',
      danger: 'hsl(var(--kodi-danger))',
      'danger-soft': 'hsl(var(--kodi-danger-soft))',
      info: 'hsl(var(--kodi-info))',
      'info-soft': 'hsl(var(--kodi-info-soft))',
    },
  },
  borderRadius: {
    lg: 'var(--radius)',
    md: 'calc(var(--radius) - 2px)',
    sm: 'calc(var(--radius) - 6px)',
  },
  boxShadow: {
    soft: '0 28px 60px -36px hsl(var(--kodi-shadow) / 0.24)',
    panel:
      '0 28px 60px -36px hsl(var(--kodi-shadow) / 0.24), inset 0 1px 0 hsl(var(--kodi-panel-elevated))',
  },
  fontFamily: {
    sans: ['var(--font-abeezee)', 'system-ui', 'sans-serif'],
  },
}
