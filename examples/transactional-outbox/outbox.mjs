import { randomUUID } from 'node:crypto';

export const schema = `
  CREATE TABLE orders (id uuid PRIMARY KEY);
  CREATE TABLE outbox (
    event_id uuid PRIMARY KEY,
    order_id uuid NOT NULL UNIQUE REFERENCES orders(id),
    published_at timestamptz
  );
  CREATE TABLE processed_events (event_id uuid PRIMARY KEY);
  CREATE TABLE fulfilment_requests (order_id uuid NOT NULL);
`;

export async function createOrder(db, orderId = randomUUID()) {
  return db.transaction(async tx => {
    const inserted = await tx.query(
      'INSERT INTO orders (id) VALUES ($1) ON CONFLICT (id) DO NOTHING RETURNING id',
      [orderId]
    );
    if (!inserted.rows.length) {
      const existing = await tx.query('SELECT event_id FROM outbox WHERE order_id = $1', [orderId]);
      if (!existing.rows.length) throw Error('Order has no creation event');
      return { orderId, eventId: existing.rows[0].event_id };
    }
    const eventId = randomUUID();
    await tx.query('INSERT INTO outbox (event_id, order_id) VALUES ($1, $2)', [eventId, orderId]);
    return { orderId, eventId };
  });
}

// One relay instance. The publisher resolves after acknowledgement.
export async function relayPending(db, publish) {
  const { rows } = await db.query('SELECT event_id, order_id FROM outbox WHERE published_at IS NULL');
  for (const event of rows) {
    await publish(event);
    await db.query('UPDATE outbox SET published_at = now() WHERE event_id = $1', [event.event_id]);
  }
}

export async function consume(db, event) {
  await db.transaction(async tx => {
    const claim = await tx.query(
      'INSERT INTO processed_events VALUES ($1) ON CONFLICT DO NOTHING RETURNING event_id',
      [event.event_id]
    );
    if (claim.rows.length) {
      await tx.query('INSERT INTO fulfilment_requests VALUES ($1)', [event.order_id]);
    }
  });
}
