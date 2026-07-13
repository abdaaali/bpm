import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, Headers, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { CaseService } from './case.service';

@Controller('cases')
export class CaseController {
  constructor(private readonly svc: CaseService) {}

  private tenant(h: Record<string, string>) { return h['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001'; }
  private actor(h: Record<string, string>) { return h['x-user-id']; }
  private roles(h: Record<string, string>) { return (h['x-user-roles'] || '').split(',').filter(Boolean); }

  @Get('stats')
  stats(@Headers() h: Record<string, string>) {
    return this.svc.getStats(this.tenant(h));
  }

  @Get('ops-overview')
  opsOverview(@Headers() h: Record<string, string>) {
    return this.svc.getOpsOverview(this.tenant(h));
  }

  @Get('my-queue/stats')
  myQueueStats(@Headers() h: Record<string, string>) {
    return this.svc.getMyQueueStats(this.tenant(h), this.actor(h));
  }

  @Get('my-work')
  myWork(@Headers() h: Record<string, string>) {
    return this.svc.getMyWork(this.tenant(h), this.actor(h));
  }

  @Get('taxonomy')
  taxonomy() {
    return this.svc.getTaxonomy();
  }

  @Get('by-division')
  byDivision(@Headers() h: Record<string, string>) {
    return this.svc.getByDivision(this.tenant(h));
  }

  @Get('by-department')
  byDepartment(@Headers() h: Record<string, string>, @Query('divisionId') divisionId: string) {
    return this.svc.getByDepartment(this.tenant(h), divisionId);
  }

  @Get()
  findAll(
    @Headers() h: Record<string, string>,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('requesterId') requesterId?: string,
    @Query('teamId') teamId?: string,
    @Query('search') search?: string,
    @Query('breached') breached?: string,
  ) { return this.svc.findAll(this.tenant(h), { type, status, priority, assigneeId, requesterId, teamId, search, breached }, page, pageSize); }

  @Get(':id')
  findOne(@Headers() h: Record<string, string>, @Param('id') id: string) {
    return this.svc.findOne(this.tenant(h), id, this.actor(h));
  }

  @Post()
  create(@Headers() h: Record<string, string>, @Body() dto: any) {
    return this.svc.create(this.tenant(h), dto, this.actor(h));
  }

  @Put(':id')
  update(@Headers() h: Record<string, string>, @Param('id') id: string, @Body() dto: any) {
    return this.svc.update(this.tenant(h), id, dto, this.actor(h));
  }

  @Patch(':id/transition')
  transition(@Headers() h: Record<string, string>, @Param('id') id: string, @Body() dto: { status: string; comment?: string }) {
    return this.svc.transition(this.tenant(h), id, dto.status, dto, this.actor(h));
  }

  @Post(':id/claim')
  claim(@Headers() h: Record<string, string>, @Param('id') id: string) {
    return this.svc.claimCase(this.tenant(h), id, this.actor(h));
  }

  // ── SLA pause / exclusion (stop-the-clock) ──
  @Get('meta/sla-pause-reasons')
  slaPauseReasons() {
    return this.svc.getPauseReasons();
  }

  @Post(':id/sla/pause')
  pauseSla(@Headers() h: Record<string, string>, @Param('id') id: string, @Body() dto: { reason: string; note?: string }) {
    return this.svc.pauseSla(this.tenant(h), id, dto, this.actor(h));
  }

  @Post(':id/sla/resume')
  resumeSla(@Headers() h: Record<string, string>, @Param('id') id: string, @Body() dto: { note?: string }) {
    return this.svc.resumeSla(this.tenant(h), id, dto || {}, this.actor(h));
  }

  @Get(':id/sla/pauses')
  getSlaPauses(@Headers() h: Record<string, string>, @Param('id') id: string) {
    return this.svc.getSlaPauses(this.tenant(h), id);
  }

  @Post(':id/declare-major')
  declareMajor(@Headers() h: Record<string, string>, @Param('id') id: string, @Body() dto: { reason?: string; mimId?: string; expected_version?: number }) {
    return this.svc.declareMajorIncident(this.tenant(h), id, dto || {}, this.actor(h));
  }

  // ── Vendor escalation ──
  @Get(':id/vendor-escalations')
  getVendorEscalations(@Headers() h: Record<string, string>, @Param('id') id: string) {
    return this.svc.getVendorEscalations(this.tenant(h), id);
  }

  @Post(':id/vendor-escalations')
  raiseVendorEscalation(@Headers() h: Record<string, string>, @Param('id') id: string, @Body() dto: { vendorCode: string; reason?: string; pauseSla?: boolean }) {
    return this.svc.raiseVendorEscalation(this.tenant(h), id, dto, this.actor(h));
  }

  @Patch(':id/vendor-escalations/:eid')
  updateVendorEscalation(@Headers() h: Record<string, string>, @Param('id') id: string, @Param('eid') eid: string, @Body() dto: { status?: string; notes?: string }) {
    return this.svc.updateVendorEscalation(this.tenant(h), id, eid, dto || {}, this.actor(h));
  }

  // Parent-child: list a ticket's child cases (Work Orders / sub-tickets)…
  @Get(':id/children')
  getChildren(@Headers() h: Record<string, string>, @Param('id') id: string) {
    return this.svc.getChildren(this.tenant(h), id);
  }

  // …and assign a Work Order from a ticket as a child case.
  @Post(':id/work-orders')
  createWorkOrder(@Headers() h: Record<string, string>, @Param('id') id: string, @Body() dto: any) {
    return this.svc.createWorkOrder(this.tenant(h), id, dto, this.actor(h));
  }

  // Associative links (related records) between cases.
  @Get('meta/link-types')
  linkTypes() { return this.svc.linkTypes(); }

  @Get(':id/links')
  getLinks(@Headers() h: Record<string, string>, @Param('id') id: string) {
    return this.svc.getLinks(this.tenant(h), id);
  }

  @Post(':id/links')
  addLink(@Headers() h: Record<string, string>, @Param('id') id: string, @Body() dto: any) {
    return this.svc.addLink(this.tenant(h), id, dto, this.actor(h));
  }

  @Delete(':id/links/:linkId')
  removeLink(@Headers() h: Record<string, string>, @Param('id') id: string, @Param('linkId') linkId: string) {
    return this.svc.removeLink(this.tenant(h), id, linkId, this.actor(h));
  }

  @Patch(':id/assign')
  assign(@Headers() h: Record<string, string>, @Param('id') id: string, @Body() dto: { assigneeId?: string; teamId?: string }) {
    return this.svc.assign(this.tenant(h), id, dto.assigneeId || null, dto.teamId || null, this.actor(h));
  }

  @Get(':id/comments')
  getComments(@Headers() h: Record<string, string>, @Param('id') id: string, @Query('internal') internal?: string) {
    return this.svc.getComments(this.tenant(h), id, internal === 'true');
  }

  @Post(':id/comments')
  addComment(@Headers() h: Record<string, string>, @Param('id') id: string, @Body() dto: { body: string; internal?: boolean }) {
    return this.svc.addComment(this.tenant(h), id, this.actor(h) || '', dto.body, dto.internal || false);
  }
}
