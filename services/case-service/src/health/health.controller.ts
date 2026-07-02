import { Controller, Get } from '@nestjs/common'; import { DatabaseService } from '../database/database.service';
@Controller('health') export class HealthController { constructor(private readonly db:DatabaseService){}
  @Get() async check(){try{await this.db.query('SELECT 1');return{status:'ok',service:'case-service'};}catch(e){return{status:'error',message:e.message};}}
}
