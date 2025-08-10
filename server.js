const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();

// Segurança básica
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10kb' }));

// Endpoint simples de ping-pong
app.get('/ping', (req, res) => {
    res.json({ status: 'pong', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📍 Teste: http://localhost:${PORT}/ping`);
});
