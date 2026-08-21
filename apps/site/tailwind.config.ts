import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./index.html",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '1.5rem',
			screens: {
				'2xl': '1240px'
			}
		},
		extend: {
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

				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				}
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 4px)',
				sm: 'calc(var(--radius) - 8px)'
			},
			fontFamily: {
				display: ['Red Hat Display', 'system-ui', 'sans-serif'],
				body: ['Montserrat', 'system-ui', 'sans-serif'],
			},
			boxShadow: {
				soft: 'var(--shadow-soft)',
				card: 'var(--shadow-card)',
			},
		}
	},
	plugins: [],
} satisfies Config;
