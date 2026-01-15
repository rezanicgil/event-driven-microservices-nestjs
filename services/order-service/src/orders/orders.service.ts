import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { v4 as uuidv4 } from 'uuid';
import { Order, OrderStatus } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { RabbitMQService } from '../common/rabbitmq/rabbitmq.service';
import { MetricsService } from '../common/metrics/metrics.service';

const ROUTING_KEY_ORDER_CREATED = 'order.created';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    @Inject(WINSTON_MODULE_PROVIDER)
    private readonly logger: Logger,
    private readonly rabbitMQService: RabbitMQService,
    private readonly metricsService: MetricsService,
  ) {}

  async create(createOrderDto: CreateOrderDto): Promise<Order> {
    const correlationId = uuidv4();

    this.logger.info('Creating new order', {
      context: 'OrdersService',
      userId: createOrderDto.userId,
      correlationId,
    });

    const totalAmount = createOrderDto.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    const order = this.orderRepository.create({
      userId: createOrderDto.userId,
      totalAmount,
      currency: createOrderDto.currency || 'USD',
      status: OrderStatus.PENDING,
      items: createOrderDto.items.map((item) =>
        this.orderItemRepository.create({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          price: item.price,
        }),
      ),
    });

    const savedOrder = await this.orderRepository.save(order);

    // Publish OrderCreated event
    const event = {
      eventType: ROUTING_KEY_ORDER_CREATED,
      timestamp: new Date().toISOString(),
      correlationId,
      payload: {
        orderId: savedOrder.id,
        userId: savedOrder.userId,
        items: savedOrder.items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          price: item.price,
        })),
        totalAmount: savedOrder.totalAmount,
        currency: savedOrder.currency,
      },
    };

    await this.rabbitMQService.publish(ROUTING_KEY_ORDER_CREATED, event);
    this.metricsService.incrementEventsPublished(ROUTING_KEY_ORDER_CREATED);

    this.logger.info('Order created and event published', {
      context: 'OrdersService',
      orderId: savedOrder.id,
      correlationId,
    });

    return savedOrder;
  }

  async findAll(): Promise<Order[]> {
    return this.orderRepository.find({ relations: ['items'] });
  }

  async findOne(id: string): Promise<Order> {
    return this.orderRepository.findOne({
      where: { id },
      relations: ['items'],
    });
  }

  async updateStatus(id: string, status: OrderStatus): Promise<Order> {
    const order = await this.findOne(id);
    if (!order) {
      return null;
    }

    order.status = status;
    return this.orderRepository.save(order);
  }
}
