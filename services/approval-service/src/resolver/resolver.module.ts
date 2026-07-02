import { Module, Global } from '@nestjs/common';
import { ApprovalResolverService } from './approval-resolver.service';

@Global()
@Module({ providers: [ApprovalResolverService], exports: [ApprovalResolverService] })
export class ResolverModule {}
