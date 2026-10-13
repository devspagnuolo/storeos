import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { addOrderNoteSchema, adminOrderListQuery, changeOrderStatusSchema, paginationQuery } from '@storeos/contracts';
import { z } from 'zod';
import { AuthStoreId, CurrentAuth, CustomerAuth, Public, PublicStore, RequirePermissions } from '../../../shared/presentation/decorators/auth.decorators';
import { ZodBody, ZodQuery } from '../../../shared/presentation/pipes/zod';
import type { AuthContext, StoreContext } from '../../../shared/presentation/request.types';
import { OrdersService } from '../application/orders.service';

@ApiTags('Admin · Pedidos (OMS)')
@ApiBearerAuth()
@Controller('admin/orders')
export class OrdersAdminController {
  constructor(private readonly orders: OrdersService) {}

  @RequirePermissions('orders.read')
  @Get()
  list(@AuthStoreId() storeId: string, @ZodQuery(adminOrderListQuery) query: z.infer<typeof adminOrderListQuery>) {
    return this.orders.list(storeId, query);
  }

  @RequirePermissions('orders.read')
  @Get('status-counts')
  counts(@AuthStoreId() storeId: string) {
    return this.orders.statusCounts(storeId);
  }

  @RequirePermissions('orders.read')
  @Get(':id')
  get(@AuthStoreId() storeId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.get(storeId, id);
  }

  @RequirePermissions('orders.write')
  @HttpCode(200)
  @Post(':id/status')
  status(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @ZodBody(changeOrderStatusSchema) body: z.infer<typeof changeOrderStatusSchema>) {
    return this.orders.changeStatus(auth.storeId, id, body, auth.subjectId);
  }

  @RequirePermissions('orders.write')
  @HttpCode(204)
  @Post(':id/notes')
  async note(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @ZodBody(addOrderNoteSchema) body: z.infer<typeof addOrderNoteSchema>) {
    await this.orders.addNote(auth.storeId, id, body.message, body.visibleToCustomer, auth.subjectId);
  }
}

@ApiTags('Storefront · Pedidos')
@ApiHeader({ name: 'x-store-slug', required: false })
@Controller('store/orders')
export class StorefrontOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @CustomerAuth()
  @ApiBearerAuth()
  @Get()
  mine(@CurrentAuth() auth: AuthContext, @ZodQuery(paginationQuery) query: z.infer<typeof paginationQuery>) {
    return this.orders.listForCustomer(auth.storeId, auth.subjectId, query.page, query.pageSize);
  }

  @Public()
  @Get('track/lookup')
  track(@PublicStore() store: StoreContext, @Query('number') number = '', @Query('token') token = '') {
    return this.orders.getByTrackingToken(store.id, number, token);
  }

  @CustomerAuth()
  @ApiBearerAuth()
  @Get(':number')
  one(@CurrentAuth() auth: AuthContext, @Param('number') number: string) {
    return this.orders.getForCustomer(auth.storeId, auth.subjectId, number);
  }
}
