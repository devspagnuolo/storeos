import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createHmac, randomUUID } from 'node:crypto';

const hmac = (key: Buffer | string, value: string) => createHmac('sha256', key).update(value).digest();

@Injectable()
export class StoreAssetsService {
  async uploadLogo(storeId: string, file: { buffer: Buffer; mimetype: string }) {
    const logoUrl = await this.uploadImage(storeId, file, 'brand');
    return { logoUrl };
  }

  async uploadHero(storeId: string, file: { buffer: Buffer; mimetype: string }) {
    const heroImageUrl = await this.uploadImage(storeId, file, 'storefront');
    return { heroImageUrl };
  }

  private async uploadImage(storeId: string, file: { buffer: Buffer; mimetype: string }, folder: 'brand' | 'storefront') {
    const extensionByType: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'image/x-icon': 'ico',
      'image/vnd.microsoft.icon': 'ico',
    };
    const extension = extensionByType[file.mimetype];
    if (!extension || !this.matchesSignature(file.buffer, file.mimetype)) {
      throw new BadRequestException('Use uma imagem PNG, JPG, WebP ou ICO válida.');
    }

    const { STOREOS_R2_ACCOUNT_ID: accountId, STOREOS_R2_ACCESS_KEY_ID: accessKey, STOREOS_R2_SECRET_ACCESS_KEY: secretKey, STOREOS_R2_BUCKET: bucket, STOREOS_R2_PUBLIC_URL: publicUrl } = process.env;
    if (!accountId || !accessKey || !secretKey || !bucket || !publicUrl) {
      throw new ServiceUnavailableException('O armazenamento de imagens ainda não foi configurado.');
    }

    const host = accountId + '.r2.cloudflarestorage.com';
    const objectKey = 'stores/' + storeId + '/' + folder + '/' + randomUUID() + '.' + extension;
    const uri = '/' + bucket + '/' + objectKey.split('/').map(encodeURIComponent).join('/');
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const scope = dateStamp + '/auto/s3/aws4_request';
    const query = [
      ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
      ['X-Amz-Credential', accessKey + '/' + scope],
      ['X-Amz-Date', amzDate],
      ['X-Amz-Expires', '300'],
      ['X-Amz-SignedHeaders', 'content-type;host'],
    ].map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(value)).join('&');
    const canonicalRequest = ['PUT', uri, query, 'content-type:' + file.mimetype + '\nhost:' + host + '\n', 'content-type;host', 'UNSIGNED-PAYLOAD'].join('\n');
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
    const dateKey = hmac('AWS4' + secretKey, dateStamp);
    const regionKey = hmac(dateKey, 'auto');
    const serviceKey = hmac(regionKey, 's3');
    const signingKey = hmac(serviceKey, 'aws4_request');
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    const endpoint = 'https://' + host + uri + '?' + query + '&X-Amz-Signature=' + signature;
    const response = await fetch(endpoint, { method: 'PUT', headers: { 'content-type': file.mimetype }, body: file.buffer as unknown as BodyInit });
    if (!response.ok) throw new ServiceUnavailableException('Não foi possível salvar a imagem da loja.');
    return publicUrl.replace(/\/$/, '') + '/' + objectKey.split('/').map(encodeURIComponent).join('/');
  }

  private matchesSignature(buffer: Buffer, mime: string) {
    if (mime === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (mime === 'image/jpeg') return buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
    if (mime === 'image/webp') return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
    if (mime === 'image/x-icon' || mime === 'image/vnd.microsoft.icon') return buffer[0] === 0 && buffer[1] === 0 && buffer[2] === 1 && buffer[3] === 0;
    return false;
  }
}
