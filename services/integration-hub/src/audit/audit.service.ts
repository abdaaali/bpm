import { Injectable, Logger } from '@nestjs/common'; import { DatabaseService } from '../database/database.service';
@Injectable() export class AuditService { private readonly logger=new Logger(AuditService.name); constructor(private readonly db:DatabaseService){}
  async log(p:{tenantId:string;entityType:string;entityId:string;action:string;actorId?:string;beforeState?:any;afterState?:any;}){
    try{await this.db.query(`INSERT INTO audit_log(tenant_id,entity_type,entity_id,action,actor_id,before_state,after_state)VALUES($1,$2,$3,$4,$5,$6,$7)`,[p.tenantId,p.entityType,p.entityId,p.action,p.actorId||null,p.beforeState?JSON.stringify(p.beforeState):null,p.afterState?JSON.stringify(p.afterState):null]);}catch(e){this.logger.error(e.message);}
  }
}
