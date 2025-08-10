const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();

// Configuração segura do banco de dados
const ensureDatabaseDirectory = (dbPath) => {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

// Caminho do banco de dados - funciona tanto local quanto no Render
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'data', 'database.db');
ensureDatabaseDirectory(dbPath);

// Conexão com tratamento de erro robusto
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error('Falha ao conectar ao banco de dados:', err.message);
        process.exit(1); // Encerra o processo se não conseguir conectar
    }
    console.log(`Conectado ao banco de dados em ${dbPath}`);
});

// Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json());

// Criar tabelas com verificação de erro
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error('Erro ao criar tabela users:', err.message);
    });
    
    db.run(`CREATE TABLE IF NOT EXISTS jogadores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        pontuacao INTEGER DEFAULT 0
    )`, (err) => {
        if (err) console.error('Erro ao criar tabela jogadores:', err.message);
    });
});

// Endpoints (mantenha os mesmos do seu código anterior)
app.get('/ping', (req, res) => {
    res.json({ status: 'online', timestamp: new Date().toISOString() });
});

// ... (mantenha todos os outros endpoints como estão)

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log('Banco de dados:', dbPath);
});
