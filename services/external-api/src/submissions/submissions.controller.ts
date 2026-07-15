import { Controller, Get, Param, UseGuards, Req } from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('api/ext/submissions')
@UseGuards(JwtAuthGuard)
export class SubmissionsController {
  constructor(private readonly svc: SubmissionsService) {}

  @Get(':assignmentId')
  findByAssignment(@Param('assignmentId') assignmentId: string, @Req() req: any) {
    const { tenant_id, company_id } = req.user;
    return this.svc.findByAssignment(assignmentId, company_id, tenant_id);
  }
}
