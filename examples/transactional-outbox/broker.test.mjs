import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import amqp from 'amqplib';
import { PGlite } from '@electric-sql/pglite';
import { schema, createOrder, relayPending, consume } from './outbox.mjs';
import { publishToQueue } from './broker.mjs';

test('an unroutable order stays pending and is delivered after the queue exists', async t => {
  const connection = await amqp.connect(process.env.AMQP_URL || 'amqp://localhost');
  t.after(() => connection.close());
  const channel = await connection.createConfirmChannel();
  const queue = 'orders-' + randomUUID();
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(schema);
  const { orderId, eventId } = await createOrder(db);
  const publish = event => publishToQueue(channel, queue, event);

  await assert.rejects(relayPending(db, publish), /No queue accepted/);
  assert.equal((await db.query('SELECT published_at FROM outbox')).rows[0].published_at, null);

  await channel.assertQueue(queue, { exclusive: true });
  await relayPending(db, publish);
  assert.ok((await db.query('SELECT published_at FROM outbox')).rows[0].published_at);
  const message = await channel.get(queue, { noAck: false });
  assert.equal(message.properties.messageId, eventId);
  await consume(db, JSON.parse(message.content));
  channel.ack(message);
  await relayPending(db, publish);
  assert.equal(await channel.get(queue), false);
  assert.deepEqual((await db.query('SELECT order_id FROM fulfilment_requests')).rows, [{ order_id: orderId }]);
});
