# Event-Driven Microservices with NestJS

A production-ready event-driven microservices architecture built with NestJS, RabbitMQ, PostgreSQL, and Redis. Features complete observability stack with Prometheus and Grafana.

## Architecture Overview

```
┌─────────────┐     HTTP      ┌──────────────────┐
│   Client    │──────────────▶│  Order Service   │
└─────────────┘               │     :3001        │
                              └────────┬─────────┘
                                       │
                                       ▼ order.created
                              ┌──────────────────┐
                              │     RabbitMQ     │
                              │   Topic Exchange │
                              └────────┬─────────┘
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
                    ▼                  ▼                  ▼
          ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
          │ Payment Service │ │Inventory Service│ │    (future)     │
          │      :3002      │ │      :3003      │ │                 │
          └────────┬────────┘ └────────┬────────┘ └─────────────────┘
                   │                   │
                   │ payment.*         │ inventory.*
                   │                   │
                   └─────────┬─────────┘
                             ▼
                   ┌─────────────────┐
                   │  Notification   │
                   │    Service      │
                   │      :3004      │
                   └─────────────────┘
```

## Tech Stack

| Category | Technology |
|----------|------------|
| **Framework** | NestJS (Node.js) |
| **Message Broker** | RabbitMQ (Topic Exchange) |
| **Database** | PostgreSQL 15 |
| **Cache** | Redis 7 |
| **Monitoring** | Prometheus + Grafana |
| **Containerization** | Docker & Docker Compose |
| **Language** | TypeScript |

## Services

| Service | Port | Responsibilities |
|---------|------|------------------|
| **Order Service** | 3001 | Order management, event publishing |
| **Payment Service** | 3002 | Payment processing, Redis caching |
| **Inventory Service** | 3003 | Stock management, reservations |
| **Notification Service** | 3004 | Email/SMS notifications |

## Features

- **Event-Driven Architecture** - Loosely coupled services communicating via RabbitMQ
- **CQRS Pattern** - Separate read/write operations with event sourcing ready
- **Observability** - Prometheus metrics, Grafana dashboards, structured logging
- **Resilience** - Health checks, retry mechanisms, graceful shutdown
- **Type Safety** - Full TypeScript with strict mode
- **Docker Ready** - Complete containerization with docker-compose

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for local development)

### Start with Docker (Recommended)

```bash
# Clone the repository
git clone <repository-url>
cd event-driven-microservices-nestjs

# Start all services
docker compose up -d

# Check service status
docker compose ps
```

### Local Development

```bash
# Start infrastructure only
docker compose up -d rabbitmq redis order-db payment-db inventory-db notification-db prometheus grafana

# Install dependencies for each service
cd services/order-service && npm install && cd ../..
cd services/payment-service && npm install && cd ../..
cd services/inventory-service && npm install && cd ../..
cd services/notification-service && npm install && cd ../..

# Start services in development mode (separate terminals)
cd services/order-service && npm run start:dev
cd services/payment-service && npm run start:dev
cd services/inventory-service && npm run start:dev
cd services/notification-service && npm run start:dev
```

## API Reference

### Order Service (port 3001)

#### Create Order
```bash
curl -X POST http://localhost:3001/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "items": [
      {
        "productId": "prod-001",
        "productName": "Laptop",
        "quantity": 1,
        "price": 999.99
      }
    ]
  }'
```

#### Get All Orders
```bash
curl http://localhost:3001/orders
```

#### Get Order by ID
```bash
curl http://localhost:3001/orders/{orderId}
```

### Payment Service (port 3002)

#### Get Payment by Order ID
```bash
curl http://localhost:3002/payments/order/{orderId}
```

### Inventory Service (port 3003)

#### Get All Products
```bash
curl http://localhost:3003/inventory/products
```

#### Get Product by ID
```bash
curl http://localhost:3003/inventory/products/{productId}
```

### Notification Service (port 3004)

#### Get All Notifications
```bash
curl http://localhost:3004/notifications
```

## Event Flow

```
1. Client creates order via HTTP POST
2. Order Service saves order and publishes "order.created" event
3. Events are routed through RabbitMQ Topic Exchange:

   order.created
   ├── Payment Service (processes payment)
   │   └── Publishes: payment.completed OR payment.failed
   │
   └── Inventory Service (reserves stock)
       └── Publishes: inventory.reserved OR inventory.out_of_stock

4. Notification Service consumes all events and sends notifications
```

### Event Types

| Event | Publisher | Consumers |
|-------|-----------|-----------|
| `order.created` | Order Service | Payment, Inventory |
| `payment.completed` | Payment Service | Notification |
| `payment.failed` | Payment Service | Notification |
| `inventory.reserved` | Inventory Service | Notification |
| `inventory.out_of_stock` | Inventory Service | Notification |

## Monitoring & Observability

### Access Points

| Service | URL | Credentials |
|---------|-----|-------------|
| **Grafana** | http://localhost:3000 | admin / admin123 |
| **Prometheus** | http://localhost:9090 | - |
| **RabbitMQ Management** | http://localhost:15672 | admin / admin123 |

### Metrics

Each service exposes Prometheus metrics at `/metrics`:

- `http_requests_total` - Total HTTP requests by method, path, status
- `http_request_duration_seconds` - Request latency histogram
- `events_published_total` - Events published by type
- `events_consumed_total` - Events consumed by type
- Node.js runtime metrics (memory, CPU, GC, event loop)

### Grafana Dashboard

1. Navigate to http://localhost:3000
2. Login with admin/admin123
3. Go to Dashboards → Microservices Dashboard
4. View real-time metrics for all services

## Infrastructure

### Database Configuration

| Service | Host | Port | Database | User |
|---------|------|------|----------|------|
| Order | order-db | 5436 | order_db | order_user |
| Payment | payment-db | 5433 | payment_db | payment_user |
| Inventory | inventory-db | 5434 | inventory_db | inventory_user |
| Notification | notification-db | 5435 | notification_db | notification_user |

### RabbitMQ Configuration

- **Exchange**: `microservices.events` (topic)
- **Queues**: Auto-created per service with routing key bindings
- **Management UI**: http://localhost:15672

## Project Structure

```
.
├── docker-compose.yml          # Container orchestration
├── docker/
│   ├── grafana/               # Grafana provisioning
│   │   ├── dashboards/        # Pre-configured dashboards
│   │   └── provisioning/      # Datasource configuration
│   └── prometheus/            # Prometheus configuration
├── services/
│   ├── order-service/         # Order management service
│   ├── payment-service/       # Payment processing service
│   ├── inventory-service/     # Inventory management service
│   └── notification-service/  # Notification service
└── shared/                    # Shared types and utilities
```

## Development

### Running Tests

```bash
cd services/<service-name>
npm run test        # Unit tests
npm run test:e2e    # E2E tests
npm run test:cov    # Coverage report
```

### Linting

```bash
cd services/<service-name>
npm run lint
```

### Building for Production

```bash
docker compose build --no-cache
docker compose up -d
```

## Troubleshooting

### Services not starting
```bash
# Check logs
docker compose logs -f <service-name>

# Restart specific service
docker compose restart <service-name>
```

### Database connection issues
```bash
# Check if databases are healthy
docker compose ps

# Reset databases
docker compose down -v
docker compose up -d
```

### RabbitMQ connection issues
```bash
# Check RabbitMQ status
docker compose logs rabbitmq

# Access management UI
open http://localhost:15672
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [NestJS](https://nestjs.com/) - Progressive Node.js framework
- [RabbitMQ](https://www.rabbitmq.com/) - Message broker
- [Prometheus](https://prometheus.io/) - Monitoring system
- [Grafana](https://grafana.com/) - Observability platform
