import { Injectable } from '@nestjs/common';
import { fetchRemoteImage } from './safe-fetch';

/** Baixa imagens de links externos com as proteções de rede; existe como serviço para os testes não dependerem da internet. */
@Injectable()
export class RemoteImageService {
  download(url: string): Promise<Buffer> { return fetchRemoteImage(url); }
}
