const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();

// Middlewares essenciais
app.use(helmet());
app.use(cors());
app.use(express.json());

// Configuração do banco de dados
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'data', 'database.db');
const db = new sqlite3.Database(dbPath);

// Criar tabelas
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS jogadores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        pontuacao INTEGER DEFAULT 0
    )`);
});

// Endpoint de teste
app.get('/ping', (req, res) => {
    res.json({ 
        status: 'pong', 
        server: 'Matchmaking Server',
        timestamp: new Date().toISOString()
    });
});

// Endpoints de users
app.post('/users', (req, res) => {
    const { name, email } = req.body;
    
    if (!name || !email) {
        return res.status(400).json({ error: 'Name and email are required' });
    }

    db.run(
        'INSERT INTO users (name, email) VALUES (?, ?)',
        [name, email],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.status(201).json({
                id: this.lastID,
                name,
                email
            });
        }
    );
});

app.get('/users', (req, res) => {
    db.all('SELECT * FROM users', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// Endpoints de jogadores
app.post('/jogadores', (req, res) => {
    const { nome, pontuacao } = req.body;
    
    if (!nome) {
        return res.status(400).json({ error: 'Nome é obrigatório' });
    }

    db.run(
        'INSERT INTO jogadores (nome, pontuacao) VALUES (?, ?)',
        [nome, pontuacao || 0],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.status(201).json({
                id: this.lastID,
                nome,
                pontuacao: pontuacao || 0
            });
        }
    );
});

app.get('/jogadores', (req, res) => {
    db.all('SELECT * FROM jogadores', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log('Endpoints disponíveis:');
    console.log(`- GET  /ping`);
    console.log(`- POST /users`);
    console.log(`- GET  /users`);
    console.log(`- POST /jogadores`);
    console.log(`- GET  /jogadores`);
});
