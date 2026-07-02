import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common'; import { Pool } from 'pg';
@Injectable() export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name); readonly pool: Pool;
  constructor() { this.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 }); this.pool.on('error', (e)=>this.logger.error('PG',e)); }
  async onModuleInit() { try { await this.pool.query('SELECT 1'); this.logger.log('DB connected'); } catch(e){this.logger.error(`DB failed: ${e.message}`);} }
  async onModuleDestroy() { await this.pool.end(); }
  async query(text: string, params?: any[]) { const c=await this.pool.connect(); try{return await c.query(text,params);}finally{c.release();} }
  paginate(p:number,ps:number){const pp=Math.max(1,p),pps=Math.min(100,Math.max(1,ps));return{limit:pps,offset:(pp-1)*pps};}
}
