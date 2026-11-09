# One order, two event deliveries

An order can reach PostgreSQL while the payment service never hears about it. In the [NestJS reference project](https://github.com/rezanicgil/event-driven-microservices-nestjs), the order handler saves the purchase and then publishes to RabbitMQ. If the process stops between those operations, the broker has nothing to deliver.

## Test the first failure

The smaller example writes the order and an outbox row with a stable event ID in one database transaction. Its first test forces the event insert to fail. After rollback, both tables are empty. This checks the property the customer cares about: every committed order has a record of the work still to be delivered.

## Lose the acknowledgement

A relay delivers a pending event and marks it published after acknowledgement. The second test lets the consumer finish and then drops that acknowledgement. The next relay run delivers the same event ID again. The consumer inserts the ID into a table with a primary key and creates a fulfilment request in the same transaction. A repeated ID skips the fulfilment step. Two deliveries produce one request.

## Where the guarantee ends

The example runs a single relay with PGlite and a simulated publisher. A real RabbitMQ deployment needs publisher confirms and routing checks. Multiple relay workers would need to coordinate claims. Charging a card would add another boundary: the payment provider would need to support a stable idempotency key, with a way to reconcile an unknown outcome.

[Read the implementation and run both tests](https://github.com/rezanicgil/event-driven-microservices-nestjs/tree/main/examples/transactional-outbox).
