import { Module } from '@nestjs/common'
import { ConsumersModule } from '../consumers/consumers.module'
import { ProvidersModule } from '../providers/providers.module'
import { MetersController } from './meters.controller'
import { MetersService } from './meters.service'
import { RelayService } from './relay/relay.service'
import { TcpServer } from './tcp/tcp.server'

@Module({
  imports: [ProvidersModule, ConsumersModule],
  controllers: [MetersController],
  providers: [MetersService, TcpServer, RelayService],
  exports: [MetersService, RelayService, TcpServer],
})
export class MetersModule {}
