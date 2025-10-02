import amqp from "amqplib";

// const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://guest:guest@localhost:5673";

let connection: any; // amqp.Connection;
let channel: amqp.Channel;


export async function connectRabbitMQ(queueName: string) {
  const url = process.env.RABBITMQ_URL; // vem do Railway
  if (!url) throw new Error("❌ RABBITMQ_URL não configurada!");

  console.log("🔗 Conectando no RabbitMQ:", url);

  connection = await amqp.connect(url);
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
