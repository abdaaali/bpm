import { Global, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { RolesCacheService } from './roles-cache.service';

// Global: PermissionsGuard is applied via @UseGuards(...) directly in ~15
// feature-module controllers across the gateway, none of which import this
// module — they've always resolved Reflector (a Nest core token) implicitly.
// Once the guard also depends on RolesCacheService, every one of those
// modules needs it resolvable too; @Global() + exporting it here is the only
// way to do that without touching all ~15 modules individually.
@Global()
@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  providers: [JwtStrategy, RolesCacheService],
  exports: [PassportModule, RolesCacheService],
})
export class AuthModule {}
