import animate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./index.html"
  ],
  theme: {
    extend: {
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 4px)',
        sm: 'calc(var(--radius) - 8px)'
      },
      fontFamily: {
        display: ['Red Hat Display', 'system-ui', 'sans-serif'],
        body: ['Montserrat', 'system-ui', 'sans-serif']
      },
      colors: {
        /* Marca — os valores vivem em src/index.css (:root) */
        ink: 'hsl(var(--am-ink) / <alpha-value>)',
        cream: 'hsl(var(--am-cream) / <alpha-value>)',
        coral: 'hsl(var(--am-coral) / <alpha-value>)',
        'coral-deep': 'hsl(var(--am-coral-deep) / <alpha-value>)',
        'coral-soft': 'hsl(var(--am-coral-soft) / <alpha-value>)',
        apricot: 'hsl(var(--am-apricot) / <alpha-value>)',
        'green-lum': 'hsl(var(--am-green-lum) / <alpha-value>)',
        'green-deep': 'hsl(var(--am-green-deep) / <alpha-value>)',
        'green-dark': 'hsl(var(--am-green-dark) / <alpha-value>)',
        success: 'hsl(var(--success) / <alpha-value>)',

        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          foreground: 'hsl(var(--accent-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))'
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        card: 'var(--shadow-card)'
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out'
      }
    }
  },
  plugins: [animate],
};
