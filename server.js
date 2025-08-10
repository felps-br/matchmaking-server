const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');

const app = express();

// Configuração do PostgreSQL
const pool = new Pool({
  connectionString: "postgresql://bd:XmqvawsgHdEMIi6yts1vthuEMWC7E6qm@dpg-d2cfdhadbo4c73bn7690-a/bd_74h6",
  ssl: {
    rejectUnauthorized: false // Necessário para conexões externas
  }
});

// Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10kb' }));

// Verificar conexão com o banco
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Erro ao conectar ao PostgreSQL:', err.stack);
  }
  console.log('Conectado ao PostgreSQL com sucesso!');
  release();
});

// Criar tabelas (executa apenas uma vez)
async function createTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS jogadores (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        pontuacao INTEGER DEFAULT 0
      )
    `);
    
    console.log('Tabelas criadas/verificadas com sucesso');
  } catch (err) {
    console.error('Erro ao criar tabelas:', err);
  }
}

createTables();

// Endpoint de teste
app.get('/ping', (req, res) => {
  res.json({ 
    status: 'pong', 
    database: 'PostgreSQL',
    timestamp: new Date().toISOString() 
  });
});

// Endpoints para users
app.post('/users', async (req, res) => {
  const { name, email } = req.body;
  
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  try {
    const { rows } = await pool.query(
      'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
      [name, email]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') { // Violação de unique constraint
      return res.status(409).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.get('/users', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoints para jogadores
app.post('/jogadores', async (req, res) => {
  const { nome, pontuacao } = req.body;
  
  if (!nome) {
    return res.status(400).json({ error: 'Nome é obrigatório' });
  }

  try {
    const { rows } = await pool.query(
      'INSERT INTO jogadores (nome, pontuacao) VALUES ($1, $2) RETURNING *',
      [nome, pontuacao || 0]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/jogadores', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM jogadores');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log('📌 Endpoints disponíveis:');
  console.log('- GET  /ping');
  console.log('- POST /users');
  console.log('- GET  /users');
  console.log('- POST /jogadores');
  console.log('- GET  /jogadores');
});
