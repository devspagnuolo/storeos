import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  { ignores: ['.next/**', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  // Imagens vêm de hosts arbitrários por loja; next/image exigiria configurar cada domínio.
  { rules: { '@next/next/no-img-element': 'off' } },
];

export default config;
