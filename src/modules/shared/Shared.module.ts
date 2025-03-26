import { Global, Module, Provider } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import * as temporal from '@temporalio/client'
import { Redis as IORedis } from 'ioredis'
import * as redis from 'redis'
import { ConfigService, LoggerService } from 'src/lib/nestjs-utils'
import { settings } from 'src/unbody.settings'
import {
  IOREDIS_CLIENT,
  REDIS_CLIENT,
  TEMPORAL_CLIENT,
  TEMPORAL_CONNECTION,
  UNBODY_SETTINGS,
} from './tokens'

const providers: Provider[] = [
  {
    provide: ConfigService,
    useValue: new ConfigService(),
  },
  {
    provide: LoggerService,
    inject: [ConfigService],
    useFactory: (configService: ConfigService) =>
      new LoggerService(configService),
  },
  {
    provide: REDIS_CLIENT,
    inject: [ConfigService, LoggerService],
    useFactory: async (configService: ConfigService) =>
      redis.createClient({
        url: configService.get('services.redis.uri'),
      }),
  },
  {
    provide: IOREDIS_CLIENT,
    inject: [ConfigService, LoggerService],
    useFactory: async (configService: ConfigService, logger: LoggerService) => {
      const uri = configService.get<string>('services.redis.uri')
      const client = new IORedis(uri!)
      return new Promise((resolve, reject) => {
        client.once('error', (err) => {
          if (err.message.includes('ECONNREFUSED')) {
            err.message = `Failed to connect to REDIS: ${err.message}`
            logger.userMessage.error(err, {
              suggestion: `Please ensure that:
1. Redis is running
2. The following environment variable is set correctly:
- REDIS_URI
`,
            })
          }
          process.exit(1)
        })

        client.on('connect', () => {
          resolve(client)
        })
      })
    },
  },
  {
    provide: TEMPORAL_CONNECTION,
    inject: [ConfigService],
    useFactory: async (configService: ConfigService) =>
      temporal.Connection.connect({
        ...configService.get('services.temporal'),
      }),
  },
  {
    provide: TEMPORAL_CLIENT,
    inject: [TEMPORAL_CONNECTION],
    useFactory: (connection: temporal.Connection) =>
      new temporal.Client({ connection }),
  },
  {
    provide: UNBODY_SETTINGS,
    useValue: settings,
  },
]

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get('services.mongodb.uri'),
      }),
    }),
  ],
  providers: [ConfigService, LoggerService, ...providers],
  exports: [ConfigService, LoggerService, ...providers],
})
export class SharedModule {
  constructor() {}
}
