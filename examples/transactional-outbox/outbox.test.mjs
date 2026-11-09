import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { schema, createOrder, relayPending, consume } from './outbox.mjs';

async function database(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(schema);
  return db;
}

test('failed event insert rolls back the order', async t => {
  const db = await database(t);
  await db.exec('ALTER TABLE outbox ADD CONSTRAINT inject_failure CHECK (false)');
  await assert.rejects(createOrder(db), /inject_failure/);
  assert.deepEqual((await db.query('SELECT * FROM orders')).rows, []);
  assert.deepEqual((await db.query('SELECT * FROM outbox')).rows, []);
});

test('lost acknowledgement replays the same event and produces one fulfilment request', async t => {
  const db = await database(t);
  const { orderId, eventId } = await createOrder(db);
  const deliveries = [];
  async function publish(event) {
    deliveries.push(event.event_id);
    await consume(db, event);
    if (deliveries.length === 1) throw Error('acknowledgement lost');
  }
  await assert.rejects(relayPending(db, publish), /acknowledgement lost/);
  await relayPending(db, publish);
  await relayPending(db, publish);
  assert.deepEqual(deliveries, [eventId, eventId]);
  assert.deepEqual((await db.query('SELECT order_id FROM fulfilment_requests')).rows, [{ order_id: orderId }]);
});
