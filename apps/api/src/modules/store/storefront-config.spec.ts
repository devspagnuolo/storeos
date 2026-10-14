import { BadRequestException } from '@nestjs/common';
import { sanitizeStorefrontConfig } from './storefront-config';

describe('sanitizeStorefrontConfig', () => {
  it('accepts and normalizes safe storefront content', () => {
    expect(sanitizeStorefrontConfig({
      heroTitle: '  Nova coleção  ',
      heroImageUrl: 'https://cdn.example.com/banner.webp',
      accentColor: '#abcdef',
    })).toEqual({
      heroTitle: 'Nova coleção',
      heroImageUrl: 'https://cdn.example.com/banner.webp',
      accentColor: '#ABCDEF',
    });
  });

  it('rejects unknown fields and unsafe image protocols', () => {
    expect(() => sanitizeStorefrontConfig({ script: '<script>' })).toThrow(BadRequestException);
    expect(() => sanitizeStorefrontConfig({ heroImageUrl: 'javascript:alert(1)' })).toThrow(BadRequestException);
  });

  it('limits user-controlled text', () => {
    expect(() => sanitizeStorefrontConfig({ announcementText: 'x'.repeat(101) })).toThrow(BadRequestException);
  });
});
