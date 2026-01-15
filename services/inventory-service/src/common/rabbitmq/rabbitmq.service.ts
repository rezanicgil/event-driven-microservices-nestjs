import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import * as amqplib from 'amqplib';

const EXCHANGE_NAME = 'microservices.events';
const EXCHANGE_TYPE = 'topic' as const;
const QUEUE_NAME = 'inventory-service-queue';

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
  private messageHandlers: Map<string, (message: EventMessage) => Promise<void>> = new Map();

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
      await this.channel.assertQueue(QUEUE_NAME, { durable: true });

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

  async subscribe(routingKey: string, handler: (message: EventMessage) => Promise<void>): Promise<void> {
    await this.channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, routingKey);
    this.messageHandlers.set(routingKey, handler);

    await this.channel.consume(QUEUE_NAME, async (msg: amqplib.ConsumeMessage | null) => {
      if (msg) {
        try {
          const content = JSON.parse(msg.content.toString()) as EventMessage;
          const msgHandler = this.messageHandlers.get(msg.fields.routingKey);

          if (msgHandler) {
            await msgHandler(content);
            this.channel.ack(msg);
          } else {
            this.channel.nack(msg, false, false);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error('Error processing message', {
            context: 'RabbitMQService',
            error: errorMessage,
          });
          this.channel.nack(msg, false, false);
        }
      }
    });

    this.logger.info('Subscribed to routing key', {
      context: 'RabbitMQService',
      routingKey,
    });
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
