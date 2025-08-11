const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');
const path = require('path');

// Configuração do Express
const app = express();

// Middlewares
app.use(helmet());
app.use(cors());

// Configuração do PostgreSQL
const pool = new Pool({
  connectionString: "postgresql://bd:XmqvawsgHdEMIi6yts1vthuEMWC7E6qm@dpg-d2cfdhadbo4c73bn7690-a/bd_74h6",
  ssl: { rejectUnauthorized: false }
});

// Verificação de conexão
pool.connect((err, client, release) => {
  if (err) {
    console.error('Erro ao conectar ao PostgreSQL:', err.stack);
    process.exit(1);
  }
  console.log('✅ Conectado ao PostgreSQL com sucesso!');
  release();
});

// Criação das tabelas
async function createTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS matchmaking_rooms (
        id SERIAL PRIMARY KEY,
        room_name VARCHAR(64) NOT NULL UNIQUE,
        player_id TEXT NOT NULL,
        created_by VARCHAR(64) NOT NULL,
        target_room VARCHAR(64) DEFAULT NULL,
        last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabela matchmaking_rooms criada/verificada');
  } catch (err) {
    console.error('❌ Erro ao criar tabelas:', err);
  }
}

// Endpoint de teste
app.get('/ping', (req, res) => {
  res.json({ 
    status: 'online', 
    database: 'PostgreSQL',
    timestamp: new Date().toISOString() 
  });
});

// Endpoint principal do matchmaking via GET
app.get('/matchmaking', async (req, res) => {
  const action = req.query.action;
  const playerId = req.query.playerId;

  try {
    switch (action) {
      case 'set_ready':
        await handleSetReady(req, res);
        break;
      case 'check_room':
        await handleCheckRoom(req, res);
        break;
      case 'unset_ready':
        await handleUnsetReady(req, res);
        break;
      default:
        res.status(400).json({ error: 'Ação inválida' });
    }
  } catch (err) {
    console.error('Erro no matchmaking:', err);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Função: Cria/Atualiza sala e tenta emparelhar
async function handleSetReady(req, res) {
  const roomName = req.query.roomName;
  const players = req.query.players;
  const playerId = req.query.playerId;

  await pool.query(
    `INSERT INTO matchmaking_rooms (room_name, player_id, created_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (room_name) 
     DO UPDATE SET player_id = $2, last_update = CURRENT_TIMESTAMP`,
    [roomName, players, playerId]
  );

  const { rows } = await pool.query(
    `SELECT room_name FROM matchmaking_rooms 
     WHERE room_name != $1 AND target_room IS NULL 
     ORDER BY last_update ASC LIMIT 1`,
    [roomName]
  );

  if (rows.length > 0) {
    const otherRoom = rows[0].room_name;
    const targetRoomName = roomName;

    await pool.query(
      `UPDATE matchmaking_rooms 
       SET target_room = $1 
       WHERE room_name IN ($2, $3)`,
      [targetRoomName, roomName, otherRoom]
    );

    res.json({ status: "ready_set" });
  } else {
    res.json({ status: "waiting" });
  }
}

// Função: Verifica se a sala está pronta
async function handleCheckRoom(req, res) {
  const playerId = req.query.playerId;

  const { rows } = await pool.query(
    `SELECT target_room FROM matchmaking_rooms 
     WHERE $1 = ANY(string_to_array(player_id, ','))`,
    [playerId]
  );

  if (rows.length > 0 && rows[0].target_room) {
    res.json({ status: "found", room: rows[0].target_room });
  } else {
    res.json({ status: "not_found" });
  }
}

// Função: Remove sala
async function handleUnsetReady(req, res) {
  const playerId = req.query.playerId;

  await pool.query(
    'DELETE FROM matchmaking_rooms WHERE created_by = $1',
    [playerId]
  );

  res.json({ status: "unset" });
}

// Inicialização
const PORT = process.env.PORT || 10000;
app.listen(PORT, async () => {
  await createTables();
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log('📌 Endpoints disponíveis:');
  console.log('- GET /ping');
  console.log('- GET /matchmaking?action=set_ready&roomName=Sala1&players=1,2&playerId=Jogador1');
  console.log('- GET /matchmaking?action=check_room&playerId=Jogador1');
  console.log('- GET /matchmaking?action=unset_ready&playerId=Jogador1');
});
