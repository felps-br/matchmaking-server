const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();

// Segurança básica
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10kb' }));

// Configuração do banco de dados SQLite
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Erro ao conectar ao banco de dados:', err.message);
    } else {
        console.log('Conectado ao banco de dados SQLite');
        initializeDatabase();
    }
});

function initializeDatabase() {
    // Tabela de users (do exemplo anterior)
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Tabela de jogadores (novo exemplo)
    db.run(`CREATE TABLE IF NOT EXISTS jogadores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        pontuacao INTEGER DEFAULT 0
    )`);
}

// Endpoint simples de ping-pong
app.get('/ping', (req, res) => {
    res.json({ status: 'pong', timestamp: new Date().toISOString() });
});

// Endpoints para users (exemplo anterior)
app.get('/users', (req, res) => {
    db.all('SELECT * FROM users', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

app.post('/users', (req, res) => {
    const { name, email } = req.body;
    
    if (!name || !email) {
        return res.status(400).json({ error: 'Nome e email são obrigatórios' });
    }

    db.run(
        'INSERT INTO users (name, email) VALUES (?, ?)',
        [name, email],
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(409).json({ error: 'Email já está em uso' });
                }
                return res.status(500).json({ error: err.message });
            }
            
            res.status(201).json({
                id: this.lastID,
                name,
                email,
                message: 'Usuário criado com sucesso'
            });
        }
    );
});

// Endpoints para jogadores (novo exemplo)
app.post('/addPlayer', (req, res) => {
    const { nome, pontuacao } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });

    db.run(`INSERT INTO jogadores (nome, pontuacao) VALUES (?, ?)`,
        [nome, pontuacao || 0],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});

app.get('/listPlayers', (req, res) => {
    db.all(`SELECT * FROM jogadores`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📍 Endpoints disponíveis:`);
    console.log(`- GET  /ping`);
    console.log(`- GET  /users`);
    console.log(`- POST /users`);
    console.log(`- POST /addPlayer`);
    console.log(`- GET  /listPlayers`);
});

// Fechar a conexão com o banco de dados ao encerrar o servidor
process.on('SIGTERM', () => {
    db.close();
    process.exit(0);
});
