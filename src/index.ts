import cors from "cors";
import express from "express";
import pkg from '../package.json' with { type: "json" };
import { connectRabbitMQ } from "./rabbitmq.js";
import { initDb } from "./utils/database/db.js";
import { buildPaginationResponse, getPaginationParams } from "./utils/pagination.js";
import { buildFilters, buildSorting } from "./utils/search.js";

const app = express();
app.use(cors());
app.use(express.json());

let db: any;
let rabbitChannel: any;
let rabbitConnection: any;
const clients: any[] = []; // SSE clients
const RABBIT_QUEUE = "notifications";
let lastQueueStatus: "connected" | "disconnected" = "disconnected";

// ---------------- GET raiz - versão ----------------
app.get("/", (req, res) => {
  res.json({
    name: pkg.name,
    version: pkg.version,
  });
});

// ---------------- FUNÇÃO DE NOTIFICAÇÃO SSE ----------------
function notifyClients(event: string, data: any) {
  clients.forEach((client) =>
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  );
}

// ---------------- FUNÇÃO DE CONEXÃO RABBIT ----------------
async function setupRabbit() {
  try {
    const { connection, channel } = await connectRabbitMQ(RABBIT_QUEUE);
    rabbitConnection = connection;
    rabbitChannel = channel;

    console.log("✅ Conectado ao RabbitMQ");

    // Inicializa status
    if (lastQueueStatus !== "connected") {
      notifyClients("status", "connected");
      lastQueueStatus = "connected";
    }

    // Consumidor da fila
    rabbitChannel.consume(RABBIT_QUEUE, (msg: any) => {
      if (msg) {
        const payload = msg.content.toString();
        notifyClients("message", payload);
        rabbitChannel.ack(msg);
      }
    });

    // Monitorar fechamento da conexão
    rabbitConnection.on("close", () => {
      console.error("❌ Conexão RabbitMQ fechada");
      notifyClients("status", "disconnected");
      lastQueueStatus = "disconnected";
      setTimeout(setupRabbit, 5000); // tenta reconectar
    });

    rabbitConnection.on("error", (err: any) => {
      console.error("❌ Erro no RabbitMQ:", err.message);
      notifyClients("status", "error");
    });

    // Monitoramento da fila a cada 5s
    setInterval(async () => {
      if (!rabbitChannel) return;

      try {
        await rabbitChannel.checkQueue(RABBIT_QUEUE);

        // se a fila voltou, notifica
        if (lastQueueStatus !== "connected") {
          console.log(`✅ Fila '${RABBIT_QUEUE}' voltou a ficar disponível`);
          notifyClients("status", "connected");
          lastQueueStatus = "connected";
        }
      } catch (err: any) {
        // se caiu, notifica
        if (lastQueueStatus !== "disconnected") {
          console.error(`❌ Fila '${RABBIT_QUEUE}' indisponível:`, err.message);
          notifyClients("status", "disconnected");
          lastQueueStatus = "disconnected";
        }
      }
    }, 5000);
  } catch (err: any) {
    console.error("⚠️ Falha ao conectar RabbitMQ:", err.message);
    notifyClients("status", "disconnected");
    lastQueueStatus = "disconnected";
    setTimeout(setupRabbit, 5000); // tenta reconectar
  }
}

// ---------------- INICIALIZAÇÃO ----------------
(async () => {
  db = await initDb();

  // Povoamento inicial
  await db.run(
    `INSERT OR IGNORE INTO users (id, name, email) VALUES (1, 'Arthur', 'arthur@teste.com')`
  );
  await db.run(
    `INSERT OR IGNORE INTO users (id, name, email) VALUES (2, 'Maria', 'maria@teste.com')`
  );
  await db.run(
    `INSERT OR IGNORE INTO users (id, name, email) VALUES (3, 'João', 'joao@teste.com')`
  );

  console.log("🚀 Banco inicializado e povoado");

  await setupRabbit(); // conecta ao RabbitMQ
})();

// ---------------- SSE - /notifications ----------------
app.get("/notifications", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  clients.push(newClient);

  console.log(`📡 Cliente ${clientId} conectado`);

  // envia status inicial
  res.write(
    `event: status\ndata: ${JSON.stringify({
      connected: lastQueueStatus === "connected",
    })}\n\n`
  );

  req.on("close", () => {
    console.log(`❌ Cliente ${clientId} desconectado`);
    clients.splice(clients.indexOf(newClient), 1);
  });
});

// ---------------- POST - enviar mensagem ----------------
app.post("/send", (req, res) => {
  const { message } = req.body;
  if (!message)
    return res.status(400).json({ error: "Mensagem não informada" });

  try {
    rabbitChannel.sendToQueue(RABBIT_QUEUE, Buffer.from(message));
    if (lastQueueStatus !== "connected") {
      notifyClients("status", "connected"); // se estava desconectado, atualiza
      lastQueueStatus = "connected";
    }
    return res.json({ status: "ok", sent: message });
  } catch (err: any) {
    console.error("❌ Erro ao enviar mensagem:", err.message);
    notifyClients("status", "disconnected");
    lastQueueStatus = "disconnected";
    return res.status(500).json({ error: "Erro ao enviar mensagem" });
  }
});
// ------------------ CRUD USERS ------------------

// GET all users
app.get("/users", async (req, res) => {
  try {
    // --- Apenas paginação é obrigatória ---
    const { page, limit, offset } = getPaginationParams(req);

    // --- Filtros opcionais ---
    const { whereSQL, params } = buildFilters(req, ["name", "email"]);

    // --- Ordenação opcional ---
    const { orderSQL, sortField, sortOrder } = buildSorting(req, ["id", "name", "email", "created_at"]);

    // --- Monta a query final ---
    const query = `
      SELECT * FROM users
      ${whereSQL}
      ${orderSQL}
      LIMIT ? OFFSET ?
    `;

    const users = await db.all(query, [...params, limit, offset]);

    const totalResult = await db.get(
      `SELECT COUNT(*) as total FROM users ${whereSQL}`,
      params
    );

    const response = buildPaginationResponse(users, totalResult.total, page, limit);

    res.json({
      ...response,
      sortField: sortField || null,
      sortOrder,
      filters: req.query,
    });
  } catch (err: any) {
    console.error("Erro ao buscar usuários:", err);
    res.status(500).json({ error: "Erro ao buscar usuários" });
  }
});

// POST new user
app.post("/users", async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: "Dados incompletos" });
  }

  try {
    const result = await db.run(
      `INSERT INTO users (name, email) VALUES (?, ?)`,
      name,
      email
    );

    // SQLite gera o lastID automaticamente
    const user = { id: result.lastID, name, email };
    res.status(201).json(user);
  } catch (err: any) {
    console.error("Erro ao criar usuário:", err);
    res.status(500).json({ error: "Erro ao criar usuário" });
  }
});

// PUT update user
app.put("/users/:id", async (req, res) => {
  const { id } = req.params;
  const { name, email } = req.body;
  if (!name || !email)
    return res.status(400).json({ error: "Dados incompletos" });

  try {
    await db.run(
      `UPDATE users SET name = ?, email = ? WHERE id = ?`,
      name,
      email,
      id
    );
    res.json({ id: Number(id), name, email });
  } catch (err: any) {
    console.error("Erro ao atualizar usuário:", err);
    res.status(500).json({ error: "Erro ao atualizar usuário" });
  }
});

// DELETE user
app.delete("/users/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.run(`DELETE FROM users WHERE id = ?`, id);
    res.json({ id: Number(id), deleted: true });
  } catch (err: any) {
    console.error("Erro ao deletar usuário:", err);
    res.status(500).json({ error: "Erro ao deletar usuário" });
  }
});

// GET user
app.get("/users/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const user = await db.get(`SELECT * FROM users WHERE id = ? LIMIT 1`, id);
    res.json(user);
  } catch (err: any) {
    console.error("Erro ao capturar usuário:", err);
    res.status(500).json({ error: "Erro ao capturar usuário" });
  }
});

// ------------------ START SERVER ------------------
app.listen(3000, () => {
  console.log("🚀 Backend rodando em http://localhost:3000");
});
