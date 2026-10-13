import { Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { addCartItemSchema, applyCouponSchema, cartIdentitySchema, shippingQuoteSchema, updateCartItemSchema } from '@storeos/contracts';
import { z } from 'zod';
import { CurrentAuthOptional, Public, PublicStore } from '../../../shared/presentation/decorators/auth.decorators';
import { ZodBody } from '../../../shared/presentation/pipes/zod';
import type { AuthContext, StoreContext } from '../../../shared/presentation/request.types';
import { CartService } from '../application/cart.service';

@ApiTags('Storefront · Carrinho')
@ApiHeader({ name: 'x-store-slug', required: false })
@Public()
@Controller('store/cart')
export class CartController {
  constructor(private readonly carts: CartService) {}

  private customerOf(auth?: AuthContext): string | null {
    return auth?.type === 'customer' ? auth.subjectId : null;
  }

  @Post()
  create(@PublicStore() store: StoreContext, @CurrentAuthOptional() auth?: AuthContext) {
    return this.carts.create(store.id, this.customerOf(auth));
  }

  @Get(':token')
  get(@PublicStore() store: StoreContext, @Param('token') token: string, @CurrentAuthOptional() auth?: AuthContext) {
    return this.carts.view(store.id, token, this.customerOf(auth));
  }

  @Post(':token/items')
  add(@PublicStore() store: StoreContext, @Param('token') token: string, @ZodBody(addCartItemSchema) body: z.infer<typeof addCartItemSchema>, @CurrentAuthOptional() auth?: AuthContext) {
    return this.carts.addItem(store.id, token, body.variantId, body.quantity, this.customerOf(auth));
  }

  @Patch(':token/items/:itemId')
  update(
    @PublicStore() store: StoreContext,
    @Param('token') token: string,
    @Param('itemId') itemId: string,
    @ZodBody(updateCartItemSchema) body: z.infer<typeof updateCartItemSchema>,
    @CurrentAuthOptional() auth?: AuthContext,
  ) {
    return this.carts.setQuantity(store.id, token, itemId, body.quantity, this.customerOf(auth));
  }

  @Delete(':token/items/:itemId')
  remove(@PublicStore() store: StoreContext, @Param('token') token: string, @Param('itemId') itemId: string, @CurrentAuthOptional() auth?: AuthContext) {
    return this.carts.setQuantity(store.id, token, itemId, 0, this.customerOf(auth));
  }

  @Put(':token/coupon')
  coupon(@PublicStore() store: StoreContext, @Param('token') token: string, @ZodBody(applyCouponSchema) body: z.infer<typeof applyCouponSchema>, @CurrentAuthOptional() auth?: AuthContext) {
    return this.carts.applyCoupon(store.id, token, body.code, this.customerOf(auth));
  }

  @Delete(':token/coupon')
  removeCoupon(@PublicStore() store: StoreContext, @Param('token') token: string, @CurrentAuthOptional() auth?: AuthContext) {
    return this.carts.removeCoupon(store.id, token, this.customerOf(auth));
  }

  @HttpCode(204)
  @Put(':token/identity')
  async identity(@PublicStore() store: StoreContext, @Param('token') token: string, @ZodBody(cartIdentitySchema) body: z.infer<typeof cartIdentitySchema>) {
    if (body.email) await this.carts.setIdentity(store.id, token, body.email);
  }

  @HttpCode(200)
  @Post(':token/shipping-quote')
  quote(@PublicStore() store: StoreContext, @Param('token') token: string, @ZodBody(shippingQuoteSchema) body: z.infer<typeof shippingQuoteSchema>) {
    return this.carts.quoteShipping(store.id, token, body.zipCode);
  }

  @HttpCode(200)
  @Post(':token/claim')
  claim(@PublicStore() store: StoreContext, @Param('token') token: string, @CurrentAuthOptional() auth?: AuthContext) {
    const customerId = this.customerOf(auth);
    if (!customerId) return this.carts.view(store.id, token);
    return this.carts.attachToCustomer(store.id, token, customerId);
  }
}
