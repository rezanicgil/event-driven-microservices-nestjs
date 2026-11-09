// Supply a dedicated confirm channel for this single relay.
export async function publishToQueue(channel, queue, event) {
  let returned = false;
  const onReturn = message => {
    if (message.properties.messageId === event.event_id) returned = true;
  };
  channel.on('return', onReturn);
  try {
    await new Promise((resolve, reject) => {
      channel.sendToQueue(queue, Buffer.from(JSON.stringify(event)), {
        mandatory: true,
        persistent: true,
        messageId: event.event_id,
        contentType: 'application/json',
      }, error => error ? reject(error) : resolve());
    });
    if (returned) throw Error('No queue accepted the event');
  } finally {
    channel.off('return', onReturn);
  }
}
