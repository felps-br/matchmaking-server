const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(express.json());

// Caminho do banco (fica no servidor)
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Criar tabela se não existir
db.run(`CREATE TABLE IF NOT EXISTS jogadores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    pontuacao INTEGER DEFAULT 0
)`);

// Inserir jogador
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

// Listar jogadores
app.get('/listPlayers', (req, res) => {
    db.all(`SELECT * FROM jogadores`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
