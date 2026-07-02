import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { KeycloakAdminService } from '../keycloak/keycloak-admin.service';

@Module({
  controllers: [UserController],
  providers: [UserService, KeycloakAdminService],
  exports: [UserService],
})
export class UserModule {}
