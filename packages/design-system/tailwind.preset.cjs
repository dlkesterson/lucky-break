const baseConfig = {
  darkMode: ['class'],
  content: [],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
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
        combo: 'var(--accent-combo)',
        powerup: 'var(--accent-powerup)',
        bloom: 'var(--accent-bloom)',
        bg: 'var(--background)',
        fg: 'var(--foreground)',
        mutedTone: 'var(--muted)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        glow: {
          '0%, 100%': { filter: 'brightness(1)' },
          '50%': { filter: 'brightness(1.4)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        glow: 'glow 1.5s ease-in-out infinite alternate',
      },
      fontFamily: {
        display: [
          "var(--font-display, 'Luckiest Guy')",
          "var(--font-body, 'Overpass')",
          'system-ui',
          'sans-serif',
        ],
        body: [
          "var(--font-body, 'Overpass')",
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          "'Segoe UI'",
          'sans-serif',
        ],
        mono: [
          "var(--font-mono, 'Overpass Mono')",
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
        sans: [
          "var(--font-body, 'Overpass')",
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          "'Segoe UI'",
          'sans-serif',
        ],
      },
      boxShadow: {
        focus: '0 0 0 2px hsl(var(--ring)) / 0.5',
        surface: '0 12px 32px -12px rgba(15, 23, 42, 0.45)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

const mergeTheme = (overrideTheme = {}) => ({
  ...baseConfig.theme,
  ...overrideTheme,
  extend: {
    ...(baseConfig.theme?.extend ?? {}),
    ...(overrideTheme.extend ?? {}),
  },
});

module.exports = (overrides = {}) => {
  const { theme: overrideTheme = {}, ...rest } = overrides ?? {};
  return {
    ...baseConfig,
    ...rest,
    theme: mergeTheme(overrideTheme),
  };
};
