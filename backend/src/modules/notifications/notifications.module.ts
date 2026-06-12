import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PushToken } from './entities/push-token.entity';
import { PushService } from './push.service';
import { PushController } from './push.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PushToken])],
  providers: [PushService],
  controllers: [PushController],
  exports: [PushService],
})
export class NotificationsModule {}
