import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import * as amqplib from 'amqplib';

const EXCHANGE_NAME = 'microservices.events';
const EXCHANGE_TYPE = 'topic' as const;

interface EventMessage {
  eventType: string;
  timestamp: string;
  correlationId: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private connection: Awaited<ReturnType<typeof amqplib.connect>>;
  private channel: Awaited<ReturnType<Awaited<ReturnType<typeof amqplib.connect>>['createChannel']>>;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private async connect() {
    try {
      const url = process.env.RABBITMQ_URL || 'amqp://admin:admin123@localhost:5672';
      this.connection = await amqplib.connect(url);
      this.channel = await this.connection.createChannel();

      await this.channel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, { durable: true });

      this.logger.info('Connected to RabbitMQ', { context: 'RabbitMQService' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to connect to RabbitMQ', {
        context: 'RabbitMQService',
        error: errorMessage,
      });
      throw error;
    }
  }

  private async disconnect() {
    try {
      await this.channel?.close();
      await this.connection?.close();
      this.logger.info('Disconnected from RabbitMQ', { context: 'RabbitMQService' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Error disconnecting from RabbitMQ', {
        context: 'RabbitMQService',
        error: errorMessage,
      });
    }
  }

  async publish(routingKey: string, message: EventMessage): Promise<void> {
    try {
      const messageBuffer = Buffer.from(JSON.stringify(message));
      this.channel.publish(EXCHANGE_NAME, routingKey, messageBuffer, {
        persistent: true,
        contentType: 'application/json',
      });

      this.logger.info('Message published', {
        context: 'RabbitMQService',
        routingKey,
        correlationId: message.correlationId,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to publish message', {
        context: 'RabbitMQService',
        routingKey,
        error: errorMessage,
      });
      throw error;
    }
  }
}
