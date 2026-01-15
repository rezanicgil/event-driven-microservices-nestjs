import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { Product } from './entities/product.entity';
import { Reservation, ReservationStatus } from './entities/reservation.entity';
import { RabbitMQService } from '../common/rabbitmq/rabbitmq.service';
import { MetricsService } from '../common/metrics/metrics.service';

const ROUTING_KEYS = {
  ORDER_CREATED: 'order.created',
  INVENTORY_RESERVED: 'inventory.reserved',
  INVENTORY_OUT_OF_STOCK: 'inventory.out_of_stock',
};

@Injectable()
export class InventoryService implements OnModuleInit {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Reservation)
    private readonly reservationRepository: Repository<Reservation>,
    @Inject(WINSTON_MODULE_PROVIDER)
    private readonly logger: Logger,
    private readonly rabbitMQService: RabbitMQService,
    private readonly metricsService: MetricsService,
  ) {}

  async onModuleInit() {
    // Seed some products for testing
    await this.seedProducts();

    await this.rabbitMQService.subscribe(
      ROUTING_KEYS.ORDER_CREATED,
      this.handleOrderCreated.bind(this),
    );

    this.logger.info('Inventory service subscribed to order.created events', {
      context: 'InventoryService',
    });
  }

  private async seedProducts() {
    const existingProducts = await this.productRepository.count();
    if (existingProducts > 0) return;

    const products = [
      { sku: 'PROD-001', name: 'Laptop', quantity: 100, price: 999.99 },
      { sku: 'PROD-002', name: 'Keyboard', quantity: 500, price: 79.99 },
      { sku: 'PROD-003', name: 'Mouse', quantity: 300, price: 29.99 },
      { sku: 'PROD-004', name: 'Monitor', quantity: 50, price: 349.99 },
      { sku: 'PROD-005', name: 'Headphones', quantity: 200, price: 149.99 },
    ];

    for (const product of products) {
      await this.productRepository.save(this.productRepository.create(product));
    }

    this.logger.info('Seeded initial products', { context: 'InventoryService' });
  }

  private async handleOrderCreated(event: any): Promise<void> {
    const startTime = Date.now();

    this.logger.info('Processing OrderCreated event for inventory', {
      context: 'InventoryService',
      orderId: event.payload.orderId,
      correlationId: event.correlationId,
    });

    this.metricsService.incrementEventsConsumed(ROUTING_KEYS.ORDER_CREATED);

    try {
      const reservations: Reservation[] = [];
      let outOfStockItem: any = null;

      // Check and reserve stock for each item
      for (const item of event.payload.items) {
        // First try to find by productName (for demo), then by UUID if valid
        let product = await this.productRepository.findOne({
          where: { name: item.productName },
        });

        // If not found by name, try by SKU
        if (!product) {
          product = await this.productRepository.findOne({
            where: { sku: item.productId },
          });
        }

        if (!product) {
          this.logger.warn('Product not found', {
            context: 'InventoryService',
            productId: item.productId,
            productName: item.productName,
          });
          continue;
        }

        const available = product.quantity - product.reservedQuantity;
        if (available < item.quantity) {
          outOfStockItem = {
            productId: product.id,
            requestedQuantity: item.quantity,
            availableQuantity: available,
          };
          break;
        }

        product.reservedQuantity += item.quantity;
        await this.productRepository.save(product);

        const reservation = this.reservationRepository.create({
          orderId: event.payload.orderId,
          productId: product.id,
          quantity: item.quantity,
          status: ReservationStatus.ACTIVE,
          correlationId: event.correlationId,
        });
        reservations.push(await this.reservationRepository.save(reservation));
      }

      if (outOfStockItem) {
        // Rollback reservations
        for (const reservation of reservations) {
          const product = await this.productRepository.findOne({
            where: { id: reservation.productId },
          });
          if (product) {
            product.reservedQuantity -= reservation.quantity;
            await this.productRepository.save(product);
          }
          reservation.status = ReservationStatus.CANCELLED;
          await this.reservationRepository.save(reservation);
        }

        // Publish OutOfStock event
        const outOfStockEvent = {
          eventType: ROUTING_KEYS.INVENTORY_OUT_OF_STOCK,
          timestamp: new Date().toISOString(),
          correlationId: event.correlationId,
          payload: {
            orderId: event.payload.orderId,
            ...outOfStockItem,
          },
        };

        await this.rabbitMQService.publish(ROUTING_KEYS.INVENTORY_OUT_OF_STOCK, outOfStockEvent);
        this.metricsService.incrementEventsPublished(ROUTING_KEYS.INVENTORY_OUT_OF_STOCK);

        this.logger.warn('Inventory reservation failed - out of stock', {
          context: 'InventoryService',
          orderId: event.payload.orderId,
          correlationId: event.correlationId,
        });
      } else {
        // Publish InventoryReserved event
        const reservedEvent = {
          eventType: ROUTING_KEYS.INVENTORY_RESERVED,
          timestamp: new Date().toISOString(),
          correlationId: event.correlationId,
          payload: {
            orderId: event.payload.orderId,
            reservationId: reservations[0]?.id || 'batch',
            items: reservations.map((r) => ({
              productId: r.productId,
              quantity: r.quantity,
            })),
          },
        };

        await this.rabbitMQService.publish(ROUTING_KEYS.INVENTORY_RESERVED, reservedEvent);
        this.metricsService.incrementEventsPublished(ROUTING_KEYS.INVENTORY_RESERVED);

        this.logger.info('Inventory reserved successfully', {
          context: 'InventoryService',
          orderId: event.payload.orderId,
          reservationCount: reservations.length,
          correlationId: event.correlationId,
        });
      }
    } catch (error) {
      this.logger.error('Error processing inventory reservation', {
        context: 'InventoryService',
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

  async findAllProducts(): Promise<Product[]> {
    return this.productRepository.find();
  }

  async findProduct(id: string): Promise<Product> {
    return this.productRepository.findOne({ where: { id } });
  }

  async findReservationsByOrder(orderId: string): Promise<Reservation[]> {
    return this.reservationRepository.find({ where: { orderId } });
  }
}
