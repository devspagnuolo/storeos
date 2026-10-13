import { Injectable } from '@nestjs/common';
import { ExternalServiceError } from '../../../shared/domain/errors';
import { toCents } from '../../../shared/domain/money';
import { verifyHmacSha256 } from '../../../shared/infrastructure/crypto/encryption.service';
import { HttpClient } from '../../../shared/infrastructure/http/http-client';
import { ErpCredentials, ErpCustomer, ErpOrderInput, ErpOrderStatus, ErpProduct, ErpProvider, ErpStock, Page } from './erp-provider';

const API = 'https://api.bling.com.br/Api/v3';
const PAGE_SIZE = 100;

interface BlingList<T> {
  data?: T[];
}
interface BlingOne<T> {
  data?: T;
}
interface BlingProductSummary {
  id: number;
  nome: string;
  codigo: string;
  preco: number;
  situacao: string;
  formato?: string;
  descricaoCurta?: string;
  imagemURL?: string;
}
interface BlingProductDetail extends BlingProductSummary {
  descricaoComplementar?: string;
  gtin?: string;
  pesoBruto?: number;
  pesoLiquido?: number;
  dimensoes?: { largura?: number; altura?: number; profundidade?: number };
  tributacao?: { ncm?: string };
  midia?: { imagens?: { externas?: { link: string }[]; internas?: { link: string }[] } };
  categoria?: { id: number };
  marca?: string;
  estoque?: { saldoVirtualTotal?: number };
  variacoes?: { id: number; nome?: string; codigo: string; preco?: number; estoque?: { saldoVirtualTotal?: number } }[];
}

/**
 * Adaptador Bling API v3 (OAuth2). Credenciais: { clientId, clientSecret, accessToken, refreshToken, expiresAt }.
 * Importante: validar contra a conta/sandbox Bling do cliente — campos opcionais variam por tipo de conta.
 */
@Injectable()
export class BlingProvider implements ErpProvider {
  readonly key = 'bling';

  constructor(private readonly http: HttpClient) {}

  async authenticate(credentials: ErpCredentials, authorizationCode?: string): Promise<ErpCredentials> {
    const { clientId, clientSecret } = credentials;
    if (!clientId || !clientSecret) throw new ExternalServiceError('clientId/clientSecret do Bling ausentes', 'ERP_NOT_CONFIGURED');
    const form = authorizationCode
      ? new URLSearchParams({ grant_type: 'authorization_code', code: authorizationCode })
      : new URLSearchParams({ grant_type: 'refresh_token', refresh_token: credentials.refreshToken ?? '' });
    const res = await this.http.request<{ access_token?: string; refresh_token?: string; expires_in?: number; error?: { description?: string } }>({
      method: 'POST',
      url: `${API}/oauth/token`,
      headers: { authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded', accept: '1.0' },
      rawBody: form.toString(),
      retries: 1,
    });
    if (!res.ok || !res.data?.access_token) {
      throw new ExternalServiceError(`Bling recusou a autenticação: ${res.data?.error?.description ?? res.status}`, 'ERP_AUTH_FAILED');
    }
    return {
      ...credentials,
      accessToken: res.data.access_token,
      refreshToken: res.data.refresh_token ?? credentials.refreshToken ?? '',
      expiresAt: String(Date.now() + (res.data.expires_in ?? 21_600) * 1000),
    };
  }

  async healthCheck(credentials: ErpCredentials): Promise<{ ok: boolean; detail?: string }> {
    try {
      const res = await this.get<unknown>(credentials, '/produtos', { pagina: 1, limite: 1 });
      return res.ok ? { ok: true } : { ok: false, detail: `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
  }

  async listProducts(credentials: ErpCredentials, page: number): Promise<Page<ErpProduct>> {
    const list = await this.get<BlingList<BlingProductSummary>>(credentials, '/produtos', { pagina: page, limite: PAGE_SIZE, criterio: 2, tipo: 'P' });
    this.assertOk(list, 'listar produtos');
    const summaries = (list.data?.data ?? []).filter((p) => p.formato !== 'V'); // variações vêm dentro do pai
    const items: ErpProduct[] = [];
    for (const s of summaries) {
      const detail = await this.get<BlingOne<BlingProductDetail>>(credentials, `/produtos/${s.id}`);
      if (!detail.ok || !detail.data?.data) continue;
      const p = detail.data.data;
      const images = [...(p.midia?.imagens?.externas ?? []), ...(p.midia?.imagens?.internas ?? [])].map((i) => i.link).filter(Boolean);
      const base: ErpProduct = {
        externalId: String(p.id),
        sku: p.codigo,
        name: p.nome,
        priceCents: toCents(String(p.preco ?? 0)),
        description: p.descricaoComplementar ?? p.descricaoCurta,
        ean: p.gtin || undefined,
        ncm: p.tributacao?.ncm?.replace(/\D/g, '') || undefined,
        weightGrams: p.pesoBruto || p.pesoLiquido ? Math.round((p.pesoBruto ?? p.pesoLiquido ?? 0) * 1000) : undefined,
        widthMm: p.dimensoes?.largura ? Math.round(p.dimensoes.largura * 10) : undefined,
        heightMm: p.dimensoes?.altura ? Math.round(p.dimensoes.altura * 10) : undefined,
        lengthMm: p.dimensoes?.profundidade ? Math.round(p.dimensoes.profundidade * 10) : undefined,
        imageUrls: images.length ? images : p.imagemURL ? [p.imagemURL] : [],
        active: p.situacao === 'A',
        stock: p.estoque?.saldoVirtualTotal,
        brandName: p.marca || undefined,
      };
      items.push(base);
      for (const v of p.variacoes ?? []) {
        items.push({ ...base, externalId: String(v.id), sku: v.codigo, name: v.nome ?? `${p.nome} ${v.codigo}`, priceCents: toCents(String(v.preco ?? p.preco ?? 0)), stock: v.estoque?.saldoVirtualTotal, parentExternalId: String(p.id), ean: undefined });
      }
    }
    return { items, nextPage: (list.data?.data ?? []).length >= PAGE_SIZE ? page + 1 : null };
  }

  async listStock(credentials: ErpCredentials, externalIds: string[], warehouseId?: string): Promise<ErpStock[]> {
    const out: ErpStock[] = [];
    for (let i = 0; i < externalIds.length; i += 50) {
      const chunk = externalIds.slice(i, i + 50);
      const res = await this.get<BlingList<{ produto: { id: number; codigo?: string }; saldoVirtualTotal: number; depositos?: { id: number; saldoVirtual: number }[] }>>(credentials, '/estoques/saldos', { 'idsProdutos[]': chunk });
      this.assertOk(res, 'consultar estoque');
      for (const row of res.data?.data ?? []) {
        const quantity = warehouseId ? (row.depositos?.find((d) => String(d.id) === warehouseId)?.saldoVirtual ?? 0) : row.saldoVirtualTotal;
        out.push({ externalId: String(row.produto.id), sku: row.produto.codigo ?? '', quantity: Math.max(0, Math.floor(quantity)) });
      }
    }
    return out;
  }

  async listCustomers(credentials: ErpCredentials, page: number): Promise<Page<ErpCustomer>> {
    const res = await this.get<BlingList<{ id: number; nome: string; email?: string; telefone?: string; celular?: string; numeroDocumento?: string }>>(credentials, '/contatos', { pagina: page, limite: PAGE_SIZE });
    this.assertOk(res, 'listar contatos');
    const rows = res.data?.data ?? [];
    return {
      items: rows.map((c) => ({ externalId: String(c.id), name: c.nome, email: c.email || undefined, phone: c.celular || c.telefone || undefined, document: c.numeroDocumento?.replace(/\D/g, '') || undefined })),
      nextPage: rows.length >= PAGE_SIZE ? page + 1 : null,
    };
  }

  async createOrder(credentials: ErpCredentials, order: ErpOrderInput, config: Record<string, unknown>): Promise<{ externalId: string; externalNumber?: string }> {
    const doc = order.customer.document?.replace(/\D/g, '');
    const body = {
      numeroLoja: order.number,
      data: order.placedAt.toISOString().slice(0, 10),
      contato: {
        nome: order.customer.name,
        tipoPessoa: doc && doc.length === 14 ? 'J' : 'F',
        numeroDocumento: doc,
        email: order.customer.email,
        telefone: order.customer.phone,
      },
      itens: order.lines.map((l) => ({
        codigo: l.sku,
        descricao: l.name,
        quantidade: l.quantity,
        valor: l.unitPriceCents / 100,
        unidade: 'UN',
      })),
      transporte: {
        frete: order.shippingCents / 100,
        etiqueta: {
          nome: order.customer.name,
          endereco: order.shippingAddress.street,
          numero: order.shippingAddress.number,
          complemento: order.shippingAddress.complement,
          bairro: order.shippingAddress.district,
          municipio: order.shippingAddress.city,
          uf: order.shippingAddress.state,
          cep: order.shippingAddress.zipCode,
        },
      },
      ...(order.discountCents > 0 ? { desconto: { valor: order.discountCents / 100, unidade: 'REAIS' } } : {}),
      observacoes: [`Pedido STOREOS #${order.number}`, `Pagamento: ${order.paymentMethod}`, order.notes].filter(Boolean).join(' | '),
      ...(config.salesChannelId ? { loja: { id: Number(config.salesChannelId) } } : {}),
    };
    const res = await this.send<BlingOne<{ id: number }> & { error?: { description?: string; fields?: unknown[] } }>(credentials, 'POST', '/pedidos/vendas', body);
    if (!res.ok || !res.data?.data?.id) {
      throw new ExternalServiceError(`Bling recusou o pedido ${order.number}: ${res.data?.error?.description ?? `HTTP ${res.status}`}`, 'ERP_ORDER_REJECTED');
    }
    return { externalId: String(res.data.data.id), externalNumber: order.number };
  }

  async getOrderStatus(credentials: ErpCredentials, externalId: string, config: Record<string, unknown>): Promise<ErpOrderStatus | null> {
    const res = await this.get<BlingOne<{ id: number; situacao?: { id: number; valor?: number }; notaFiscal?: { id?: number }; transporte?: { volumes?: { codigoRastreamento?: string; servico?: string }[]; contato?: { nome?: string } } }>>(credentials, `/pedidos/vendas/${encodeURIComponent(externalId)}`);
    if (res.status === 404) return null;
    this.assertOk(res, 'consultar pedido');
    const o = res.data?.data;
    if (!o) return null;
    const statusMap = (config.statusMap ?? {}) as Record<string, ErpOrderStatus['mapped']>;
    const out: ErpOrderStatus = { externalId, statusId: o.situacao ? String(o.situacao.id) : undefined, mapped: o.situacao ? statusMap[String(o.situacao.id)] : undefined };
    const volume = o.transporte?.volumes?.find((v) => v.codigoRastreamento);
    if (volume) {
      out.trackingCode = volume.codigoRastreamento;
      out.carrier = volume.servico;
    }
    if (o.notaFiscal?.id) {
      const nfe = await this.get<BlingOne<{ numero?: string; chaveAcesso?: string; linkDanfe?: string; link?: string }>>(credentials, `/nfe/${o.notaFiscal.id}`);
      if (nfe.ok && nfe.data?.data) out.invoice = { number: nfe.data.data.numero, key: nfe.data.data.chaveAcesso, url: nfe.data.data.linkDanfe ?? nfe.data.data.link };
    }
    return out;
  }

  /** Assinatura: header X-Bling-Signature-256 = sha256=<HMAC-SHA256(corpo, clientSecret)>. */
  parseWebhook(headers: Record<string, string | string[] | undefined>, rawBody: Buffer, credentials: ErpCredentials) {
    const signature = String(headers['x-bling-signature-256'] ?? '');
    const valid = Boolean(credentials.clientSecret && signature && verifyHmacSha256(credentials.clientSecret, rawBody, signature));
    let payload: { eventId?: string; event?: string; data?: { id?: number | string; pedido?: { id?: number | string } } } = {};
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return { valid: false, eventId: 'invalid' };
    }
    const event = payload.event ?? '';
    const resource = event.startsWith('order') ? 'order' : event.startsWith('invoice') ? 'invoice' : event.startsWith('stock') ? 'stock' : event.startsWith('product') ? 'product' : undefined;
    return { valid, eventId: payload.eventId ?? `${event}:${payload.data?.id ?? ''}`, resource, externalId: payload.data?.id ? String(payload.data.id) : payload.data?.pedido?.id ? String(payload.data.pedido.id) : undefined } as ReturnType<ErpProvider['parseWebhook']>;
  }

  // ── HTTP ──

  private get<T>(credentials: ErpCredentials, path: string, query?: Record<string, string | number | (string | number)[]>) {
    return this.http.request<T>({ url: `${API}${path}`, query, headers: this.auth(credentials), timeoutMs: 20_000 });
  }

  private send<T>(credentials: ErpCredentials, method: 'POST' | 'PUT' | 'PATCH', path: string, body: unknown) {
    return this.http.request<T>({ method, url: `${API}${path}`, body, headers: this.auth(credentials), timeoutMs: 25_000, retries: 0 });
  }

  private auth(credentials: ErpCredentials): Record<string, string> {
    if (!credentials.accessToken) throw new ExternalServiceError('Bling não autorizado — reconecte a integração', 'ERP_NOT_AUTHORIZED');
    return { authorization: `Bearer ${credentials.accessToken}` };
  }

  private assertOk(res: { ok: boolean; status: number }, action: string): void {
    if (res.ok) return;
    if (res.status === 401) throw new ExternalServiceError('Token do Bling expirado ou revogado', 'ERP_NOT_AUTHORIZED');
    if (res.status === 429) throw new ExternalServiceError('Limite de requisições do Bling atingido', 'ERP_RATE_LIMITED');
    throw new ExternalServiceError(`Bling: falha ao ${action} (HTTP ${res.status})`, 'ERP_ERROR');
  }
}
