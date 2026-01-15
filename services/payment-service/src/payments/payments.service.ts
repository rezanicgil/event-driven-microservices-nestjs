import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { RabbitMQService } from '../common/rabbitmq/rabbitmq.service';
import { RedisService } from '../common/redis/redis.service';
import { MetricsService } from '../common/metrics/metrics.service';

const ROUTING_KEYS = {
  ORDER_CREATED: 'order.created',
  PAYMENT_COMPLETED: 'payment.completed',
  PAYMENT_FAILED: 'payment.failed',
};

@Injectable()
export class PaymentsService implements OnModuleInit {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @Inject(WINSTON_MODULE_PROVIDER)
    private readonly logger: Logger,
    private readonly rabbitMQService: RabbitMQService,
    private readonly redisService: RedisService,
    private readonly metricsService: MetricsService,
  ) {}

  async onModuleInit() {
    await this.rabbitMQService.subscribe(
      ROUTING_KEYS.ORDER_CREATED,
      this.handleOrderCreated.bind(this),
    );

    this.logger.info('Payment service subscribed to order.created events', {
      context: 'PaymentsService',
    });
  }

  private async handleOrderCreated(event: any): Promise<void> {
    const startTime = Date.now();

    this.logger.info('Processing OrderCreated event', {
      context: 'PaymentsService',
      orderId: event.payload.orderId,
      correlationId: event.correlationId,
    });

    this.metricsService.incrementEventsConsumed(ROUTING_KEYS.ORDER_CREATED);

    try {
      // Create payment record
      const payment = this.paymentRepository.create({
        orderId: event.payload.orderId,
        amount: event.payload.totalAmount,
        currency: event.payload.currency,
        status: PaymentStatus.PROCESSING,
        correlationId: event.correlationId,
      });

      await this.paymentRepository.save(payment);

      // Cache payment status
      await this.redisService.setJson(
        `payment:${payment.orderId}`,
        { paymentId: payment.id, status: payment.status },
        3600, // 1 hour TTL
      );

      // Simulate payment processing (mock)
      const isSuccessful = Math.random() > 0.2; // 80% success rate

      if (isSuccessful) {
        payment.status = PaymentStatus.COMPLETED;
        await this.paymentRepository.save(payment);

        // Update cache
        await this.redisService.setJson(
          `payment:${payment.orderId}`,
          { paymentId: payment.id, status: payment.status },
          3600,
        );

        // Publish PaymentCompleted event
        const completedEvent = {
          eventType: ROUTING_KEYS.PAYMENT_COMPLETED,
          timestamp: new Date().toISOString(),
          correlationId: event.correlationId,
          payload: {
            orderId: payment.orderId,
            paymentId: payment.id,
            amount: payment.amount,
            currency: payment.currency,
            method: payment.method,
          },
        };

        await this.rabbitMQService.publish(ROUTING_KEYS.PAYMENT_COMPLETED, completedEvent);
        this.metricsService.incrementEventsPublished(ROUTING_KEYS.PAYMENT_COMPLETED);

        this.logger.info('Payment completed successfully', {
          context: 'PaymentsService',
          orderId: payment.orderId,
          paymentId: payment.id,
          correlationId: event.correlationId,
        });
      } else {
        payment.status = PaymentStatus.FAILED;
        payment.errorMessage = 'Payment declined by processor';
        await this.paymentRepository.save(payment);

        // Update cache
        await this.redisService.setJson(
          `payment:${payment.orderId}`,
          { paymentId: payment.id, status: payment.status, error: payment.errorMessage },
          3600,
        );

        // Publish PaymentFailed event
        const failedEvent = {
          eventType: ROUTING_KEYS.PAYMENT_FAILED,
          timestamp: new Date().toISOString(),
          correlationId: event.correlationId,
          payload: {
            orderId: payment.orderId,
            reason: payment.errorMessage,
            errorCode: 'PAYMENT_DECLINED',
          },
        };

        await this.rabbitMQService.publish(ROUTING_KEYS.PAYMENT_FAILED, failedEvent);
        this.metricsService.incrementEventsPublished(ROUTING_KEYS.PAYMENT_FAILED);

        this.logger.warn('Payment failed', {
          context: 'PaymentsService',
          orderId: payment.orderId,
          paymentId: payment.id,
          correlationId: event.correlationId,
        });
      }
    } catch (error) {
      this.logger.error('Error processing payment', {
        context: 'PaymentsService',
        orderId: event.payload.orderId,
        correlationId: event.correlationId,
        error: error.message,
      });
      throw error;
    } finally {
      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.observeEventProcessing(ROUTING_KEYS.ORDER_CREATED, duration);
    }
  }

  async findByOrderId(orderId: string): Promise<Payment> {
    // Try cache first
    const cached = await this.redisService.getJson<any>(`payment:${orderId}`);
    if (cached) {
      this.logger.info('Payment found in cache', {
        context: 'PaymentsService',
        orderId,
      });
    }

    return this.paymentRepository.findOne({ where: { orderId } });
  }

  async findAll(): Promise<Payment[]> {
    return this.paymentRepository.find();
  }
}
