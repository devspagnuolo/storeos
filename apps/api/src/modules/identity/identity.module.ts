import { Module } from '@nestjs/common';
import { CustomerAuthService } from './application/customer-auth.service';
import { PasswordService } from './application/password.service';
import { PermissionCatalogService } from './application/permission-catalog.service';
import { StaffAuthService } from './application/staff-auth.service';
import { StoreBootstrapService } from './application/store-bootstrap.service';
import { TokenService } from './application/token.service';
import { TotpService } from './application/totp.service';
import { CustomerAuthController } from './presentation/customer-auth.controller';
import { StaffAuthController } from './presentation/staff-auth.controller';

@Module({
  controllers: [StaffAuthController, CustomerAuthController],
  providers: [
    PasswordService,
    TotpService,
    TokenService,
    PermissionCatalogService,
    StoreBootstrapService,
    StaffAuthService,
    CustomerAuthService,
  ],
  exports: [PasswordService, TokenService, StaffAuthService, CustomerAuthService, PermissionCatalogService, StoreBootstrapService],
})
export class IdentityModule {}
