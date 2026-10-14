import type { Config } from 'tailwindcss';
import colors from 'tailwindcss/colors';

/** Cor definida por variável CSS de canais RGB, para aceitar opacidade (bg-brand/10) e trocar no tema escuro. */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;
const scale = (name: string, steps: number[]) => Object.fromEntries(steps.map(step => [step, token(`${name}-${step}`)]));

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#111827',
        brand: { DEFAULT: token('brand'), fg: token('brand-fg') },
        surface: { DEFAULT: token('surface'), raised: token('surface-raised') },
        // Estas escalas trocam de valor no tema escuro (classe .dark); o restante da paleta do Tailwind segue igual.
        slate: { ...colors.slate, ...scale('slate', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) },
        violet: { ...colors.violet, ...scale('violet', [50, 100, 300]) },
        emerald: { ...colors.emerald, ...scale('emerald', [50, 100, 700, 800]) },
        red: { ...colors.red, ...scale('red', [50, 700]) },
        amber: { ...colors.amber, ...scale('amber', [50, 700, 800]) },
      },
      keyframes: { shimmer: { '100%': { transform: 'translateX(100%)' } } },
    },
  },
  plugins: [],
} satisfies Config;
