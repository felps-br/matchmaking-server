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
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// Configuração do PostgreSQL (substitua pela sua URL)
const pool = new Pool({
  connectionString: "postgresql://bd:XmqvawsgHdEMIi6yts1vthuEMWC7E6qm@dpg-d2cfdhadbo4c73bn7690-a/bd_74h6",
  ssl: {
    rejectUnauthorized: false
  }
});

// Verificação de conexão com o banco
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

// Endpoint principal do matchmaking
app.post('/matchmaking', async (req, res) => {
  const { action, playerId } = req.body;
  
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
  const { roomName, players, playerId } = req.body;
  
  // Insere ou atualiza a sala
  await pool.query(
    `INSERT INTO matchmaking_rooms (room_name, player_id, created_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (room_name) 
     DO UPDATE SET player_id = $2, last_update = CURRENT_TIMESTAMP`,
    [roomName, players, playerId]
  );

  // Procura por sala para emparelhar
  const { rows } = await pool.query(
    `SELECT room_name FROM matchmaking_rooms 
     WHERE room_name != $1 AND target_room IS NULL 
     ORDER BY last_update ASC LIMIT 1`,
    [roomName]
  );

  if (rows.length > 0) {
    const otherRoom = rows[0].room_name;
    const targetRoomName = roomName;

    // Atualiza ambas as salas
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
  const { playerId } = req.body;
  
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

// Função: Remove sala quando o jogador desiste
async function handleUnsetReady(req, res) {
  const { playerId } = req.body;
  
  await pool.query(
    'DELETE FROM matchmaking_rooms WHERE created_by = $1',
    [playerId]
  );
  
  res.json({ status: "unset" });
}

// Inicialização do servidor
const PORT = process.env.PORT || 10000;
app.listen(PORT, async () => {
  await createTables();
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log('📌 Endpoints disponíveis:');
  console.log('- GET  /ping');
  console.log('- POST /matchmaking (actions: set_ready, check_room, unset_ready)');
});
