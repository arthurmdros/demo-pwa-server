// sendNotification.ts
import { sendToQueue } from "./rabbitmq.js";

const message = process.argv[2] || "Notificação de teste";
sendToQueue("notifications", message).then(() =>
  console.log("Mensagem enviada:", message)
);
