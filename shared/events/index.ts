// Exchange and Queue names
export const EXCHANGE_NAME = 'microservices.events';
export const EXCHANGE_TYPE = 'topic';

// Routing Keys
export const ROUTING_KEYS = {
  ORDER_CREATED: 'order.created',
  ORDER_UPDATED: 'order.updated',
  ORDER_CANCELLED: 'order.cancelled',
  PAYMENT_COMPLETED: 'payment.completed',
  PAYMENT_FAILED: 'payment.failed',
  INVENTORY_RESERVED: 'inventory.reserved',
  INVENTORY_OUT_OF_STOCK: 'inventory.out_of_stock',
  NOTIFICATION_SENT: 'notification.sent',
} as const;

// Queue Names
export const QUEUES = {
  PAYMENT_SERVICE: 'payment-service-queue',
  INVENTORY_SERVICE: 'inventory-service-queue',
  NOTIFICATION_SERVICE: 'notification-service-queue',
} as const;

// Event Interfaces
export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
}

export interface OrderCreatedEvent {
  eventType: typeof ROUTING_KEYS.ORDER_CREATED;
  timestamp: string;
  correlationId: string;
  payload: {
    orderId: string;
    userId: string;
    items: OrderItem[];
    totalAmount: number;
    currency: string;
  };
}

export interface OrderUpdatedEvent {
  eventType: typeof ROUTING_KEYS.ORDER_UPDATED;
  timestamp: string;
  correlationId: string;
  payload: {
    orderId: string;
    status: string;
    previousStatus: string;
  };
}

export interface OrderCancelledEvent {
  eventType: typeof ROUTING_KEYS.ORDER_CANCELLED;
  timestamp: string;
  correlationId: string;
  payload: {
    orderId: string;
    reason: string;
  };
}

export interface PaymentCompletedEvent {
  eventType: typeof ROUTING_KEYS.PAYMENT_COMPLETED;
  timestamp: string;
  correlationId: string;
  payload: {
    orderId: string;
    paymentId: string;
    amount: number;
    currency: string;
    method: string;
  };
}

export interface PaymentFailedEvent {
  eventType: typeof ROUTING_KEYS.PAYMENT_FAILED;
  timestamp: string;
  correlationId: string;
  payload: {
    orderId: string;
    reason: string;
    errorCode: string;
  };
}

export interface InventoryReservedEvent {
  eventType: typeof ROUTING_KEYS.INVENTORY_RESERVED;
  timestamp: string;
  correlationId: string;
  payload: {
    orderId: string;
    reservationId: string;
    items: Array<{
      productId: string;
      quantity: number;
    }>;
  };
}

export interface InventoryOutOfStockEvent {
  eventType: typeof ROUTING_KEYS.INVENTORY_OUT_OF_STOCK;
  timestamp: string;
  correlationId: string;
  payload: {
    orderId: string;
    productId: string;
    requestedQuantity: number;
    availableQuantity: number;
  };
}

export interface NotificationSentEvent {
  eventType: typeof ROUTING_KEYS.NOTIFICATION_SENT;
  timestamp: string;
  correlationId: string;
  payload: {
    notificationId: string;
    userId: string;
    type: 'email' | 'sms' | 'push';
    template: string;
  };
}

export type MicroserviceEvent =
  | OrderCreatedEvent
  | OrderUpdatedEvent
  | OrderCancelledEvent
  | PaymentCompletedEvent
  | PaymentFailedEvent
  | InventoryReservedEvent
  | InventoryOutOfStockEvent
  | NotificationSentEvent;

// Helper function to create events
export function createEvent<T extends MicroserviceEvent>(
  eventType: T['eventType'],
  payload: T['payload'],
  correlationId?: string,
): T {
  return {
    eventType,
    timestamp: new Date().toISOString(),
    correlationId: correlationId || generateCorrelationId(),
    payload,
  } as T;
}

export function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}
