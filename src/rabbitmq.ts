import amqp from "amqplib";

const RABBITMQ_URL =
  process.env.RABBITMQ_URL || "amqp://guest:guest@localhost:5672";
  // process.env.RABBITMQ_URL || "amqp://guest:guest@localhost:5673";

let connection: any; // amqp.Connection;
let channel: amqp.Channel;

export async function connectRabbitMQ(queueName: string) {
  connection = await amqp.connect(RABBITMQ_URL);
  channel = await connection.createChannel();
  await channel.assertQueue(queueName, { durable: true });
  return { connection, channel };
}

export async function sendToQueue(queueName: string, message: string) {
  const { connection, channel } = await connectRabbitMQ(queueName);
  channel.sendToQueue(queueName, Buffer.from(message));
  await channel.close();
  await connection.close();
}
