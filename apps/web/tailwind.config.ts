import type { Config } from 'tailwindcss';
export default { content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'], theme: { extend: { colors: { ink: '#111827', brand: '#5B3DF5' } } }, plugins: [] } satisfies Config;
