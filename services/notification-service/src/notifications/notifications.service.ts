import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { Notification, NotificationType, NotificationStatus } from './entities/notification.entity';
import { RabbitMQService } from '../common/rabbitmq/rabbitmq.service';
import { MetricsService } from '../common/metrics/metrics.service';

const ROUTING_KEYS = {
  PAYMENT_COMPLETED: 'payment.completed',
  PAYMENT_FAILED: 'payment.failed',
  INVENTORY_RESERVED: 'inventory.reserved',
  INVENTORY_OUT_OF_STOCK: 'inventory.out_of_stock',
};

@Injectable()
export class NotificationsService implements OnModuleInit {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @Inject(WINSTON_MODULE_PROVIDER)
    private readonly logger: Logger,
    private readonly rabbitMQService: RabbitMQService,
    private readonly metricsService: MetricsService,
  ) {}

  async onModuleInit() {
    // Subscribe to all relevant events
    await this.rabbitMQService.subscribe(
      ROUTING_KEYS.PAYMENT_COMPLETED,
      this.handlePaymentCompleted.bind(this),
    );

    await this.rabbitMQService.subscribe(
      ROUTING_KEYS.PAYMENT_FAILED,
      this.handlePaymentFailed.bind(this),
    );

    await this.rabbitMQService.subscribe(
      ROUTING_KEYS.INVENTORY_RESERVED,
      this.handleInventoryReserved.bind(this),
    );

    await this.rabbitMQService.subscribe(
      ROUTING_KEYS.INVENTORY_OUT_OF_STOCK,
      this.handleOutOfStock.bind(this),
    );

    this.logger.info('Notification service subscribed to events', {
      context: 'NotificationsService',
      events: Object.values(ROUTING_KEYS),
    });
  }

  private async handlePaymentCompleted(event: any): Promise<void> {
    this.logger.info('Processing PaymentCompleted event', {
      context: 'NotificationsService',
      orderId: event.payload.orderId,
      correlationId: event.correlationId,
    });

    this.metricsService.incrementEventsConsumed(ROUTING_KEYS.PAYMENT_COMPLETED);

    await this.sendNotification({
      userId: 'user-from-order', // In real app, fetch from order
      orderId: event.payload.orderId,
      type: NotificationType.EMAIL,
      template: 'payment_success',
      content: `Your payment of ${event.payload.amount} ${event.payload.currency} for order ${event.payload.orderId} was successful!`,
      correlationId: event.correlationId,
      triggeredByEvent: ROUTING_KEYS.PAYMENT_COMPLETED,
    });
  }

  private async handlePaymentFailed(event: any): Promise<void> {
    this.logger.info('Processing PaymentFailed event', {
      context: 'NotificationsService',
      orderId: event.payload.orderId,
      correlationId: event.correlationId,
    });

    this.metricsService.incrementEventsConsumed(ROUTING_KEYS.PAYMENT_FAILED);

    await this.sendNotification({
      userId: 'user-from-order',
      orderId: event.payload.orderId,
      type: NotificationType.EMAIL,
      template: 'payment_failed',
      content: `Your payment for order ${event.payload.orderId} failed. Reason: ${event.payload.reason}`,
      correlationId: event.correlationId,
      triggeredByEvent: ROUTING_KEYS.PAYMENT_FAILED,
    });
  }

  private async handleInventoryReserved(event: any): Promise<void> {
    this.logger.info('Processing InventoryReserved event', {
      context: 'NotificationsService',
      orderId: event.payload.orderId,
      correlationId: event.correlationId,
    });

    this.metricsService.incrementEventsConsumed(ROUTING_KEYS.INVENTORY_RESERVED);

    await this.sendNotification({
      userId: 'user-from-order',
      orderId: event.payload.orderId,
      type: NotificationType.EMAIL,
      template: 'inventory_reserved',
      content: `Items for your order ${event.payload.orderId} have been reserved and are being prepared for shipment.`,
      correlationId: event.correlationId,
      triggeredByEvent: ROUTING_KEYS.INVENTORY_RESERVED,
    });
  }

  private async handleOutOfStock(event: any): Promise<void> {
    this.logger.info('Processing OutOfStock event', {
      context: 'NotificationsService',
      orderId: event.payload.orderId,
      correlationId: event.correlationId,
    });

    this.metricsService.incrementEventsConsumed(ROUTING_KEYS.INVENTORY_OUT_OF_STOCK);

    await this.sendNotification({
      userId: 'user-from-order',
      orderId: event.payload.orderId,
      type: NotificationType.EMAIL,
      template: 'out_of_stock',
      content: `Unfortunately, some items in your order ${event.payload.orderId} are out of stock. We will contact you shortly.`,
      correlationId: event.correlationId,
      triggeredByEvent: ROUTING_KEYS.INVENTORY_OUT_OF_STOCK,
    });
  }

  private async sendNotification(data: {
    userId: string;
    orderId?: string;
    type: NotificationType;
    template: string;
    content: string;
    correlationId: string;
    triggeredByEvent: string;
  }): Promise<Notification> {
    const notification = this.notificationRepository.create({
      ...data,
      status: NotificationStatus.PENDING,
    });

    await this.notificationRepository.save(notification);

    // Mock sending notification (in real app, integrate with email/SMS provider)
    this.logger.info('Sending notification (MOCK)', {
      context: 'NotificationsService',
      notificationId: notification.id,
      type: notification.type,
      template: notification.template,
      content: notification.content,
    });

    // Simulate successful send
    notification.status = NotificationStatus.SENT;
    await this.notificationRepository.save(notification);

    this.metricsService.incrementNotificationsSent(notification.type, notification.template);

    this.logger.info('Notification sent successfully', {
      context: 'NotificationsService',
      notificationId: notification.id,
      correlationId: data.correlationId,
    });

    return notification;
  }

  async findAll(): Promise<Notification[]> {
    return this.notificationRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findByOrder(orderId: string): Promise<Notification[]> {
    return this.notificationRepository.find({
      where: { orderId },
      order: { createdAt: 'DESC' },
    });
  }
}
