const express = require('express');
const redis = require('redis');
const { Pool } = require('pg');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// Middleware de segurança
app.use(helmet());
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*'
}));

// Rate limiting para proteção contra spam
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 100, // máximo 100 requests por minuto por IP
    message: { error: 'Muitas requisições. Tente novamente em 1 minuto.' }
});
app.use('/matchmaking', limiter);

app.use(express.json({ limit: '10kb' }));

// Configuração Redis
const redisClient = redis.createClient({
    url: process.env.REDIS_URL || process.env.REDISCLOUD_URL || 'redis://localhost:6379',
    socket: {
        connectTimeout: 60000,
        lazyConnect: true,
        reconnectStrategy: (retries) => Math.min(retries * 50, 500)
    }
});

// Configuração PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        redis: redisClient.isReady ? 'connected' : 'disconnected'
    });
});

// Inicialização com tratamento de erro
async function init() {
    try {
        // Conectar Redis
        await redisClient.connect();
        console.log('✅ Redis conectado');
        
        // Configurar handling de erros Redis
        redisClient.on('error', (err) => console.error('❌ Redis Error:', err));
        redisClient.on('connect', () => console.log('🔄 Redis Conectando...'));
        redisClient.on('ready', () => console.log('✅ Redis Pronto'));
        
        // Criar tabelas PostgreSQL
        await pool.query(`
            CREATE TABLE IF NOT EXISTS matchmaking_rooms (
                id SERIAL PRIMARY KEY,
                room_name VARCHAR(64) NOT NULL UNIQUE,
                player_ids TEXT[] NOT NULL,
                created_by VARCHAR(64) NOT NULL,
                target_room VARCHAR(64),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE INDEX IF NOT EXISTS idx_rooms_target ON matchmaking_rooms(target_room);
            CREATE INDEX IF NOT EXISTS idx_rooms_created ON matchmaking_rooms(created_by);
            CREATE INDEX IF NOT EXISTS idx_rooms_updated ON matchmaking_rooms(updated_at);
        `);
        console.log('✅ PostgreSQL tabelas criadas');
        
    } catch (error) {
        console.error('❌ Erro na inicialização:', error);
        process.exit(1);
    }
}

// Função otimizada para encontrar match
async function findMatch(roomName) {
    try {
        const waitingRooms = await redisClient.lRange('waiting_rooms', 0, -1);
        
        for (let otherRoom of waitingRooms) {
            if (otherRoom !== roomName) {
                await redisClient.lRem('waiting_rooms', 1, otherRoom);
                await redisClient.lRem('waiting_rooms', 1, roomName);
                return otherRoom;
            }
        }
        
        await redisClient.lPush('waiting_rooms', roomName);
        return null;
    } catch (error) {
        console.error('Erro no findMatch:', error);
        return null;
    }
}

// Endpoint principal de matchmaking
app.post('/matchmaking', async (req, res) => {
    try {
        const { action, playerId, roomName, players } = req.body;
        
        // Validação de entrada
        if (!action || !playerId) {
            return res.status(400).json({ error: 'action e playerId são obrigatórios' });
        }
        
        if (action === "set_ready") {
            if (!roomName || !players) {
                return res.status(400).json({ error: 'roomName e players são obrigatórios' });
            }
            
            // Salva no PostgreSQL
            await pool.query(
                'INSERT INTO matchmaking_rooms (room_name, player_ids, created_by) VALUES ($1, $2, $3) ON CONFLICT (room_name) DO UPDATE SET player_ids = $2, updated_at = CURRENT_TIMESTAMP',
                [roomName, players.split(','), playerId]
            );
            
            // Busca match no Redis
            const matchedRoom = await findMatch(roomName);
            
            if (matchedRoom) {
                const targetRoomName = roomName;
                
                // Atualiza banco
                await pool.query(
                    'UPDATE matchmaking_rooms SET target_room = $1, updated_at = CURRENT_TIMESTAMP WHERE room_name IN ($2, $3)',
                    [targetRoomName, roomName, matchedRoom]
                );
                
                // Cache no Redis
                await redisClient.setEx(`match:${roomName}`, 300, targetRoomName);
                await redisClient.setEx(`match:${matchedRoom}`, 300, targetRoomName);
                
                res.json({ status: "match_found", room: targetRoomName });
            } else {
                res.json({ status: "waiting" });
            }
        }
        
        else if (action === "check_room") {
            // Cache Redis primeiro
            const cachedMatch = await redisClient.get(`match_player:${playerId}`);
            if (cachedMatch) {
                return res.json({ status: "found", room: cachedMatch });
            }
            
            // Fallback PostgreSQL
            const result = await pool.query(
                'SELECT target_room FROM matchmaking_rooms WHERE $1 = ANY(player_ids) AND target_room IS NOT NULL',
                [playerId]
            );
            
            if (result.rows.length > 0 && result.rows[0].target_room) {
                const targetRoom = result.rows[0].target_room;
                await redisClient.setEx(`match_player:${playerId}`, 300, targetRoom);
                res.json({ status: "found", room: targetRoom });
            } else {
                res.json({ status: "not_found" });
            }
        }
        
        else if (action === "unset_ready") {
            if (!roomName) {
                return res.status(400).json({ error: 'roomName é obrigatório para unset_ready' });
            }
            
            // Limpa Redis
            await redisClient.lRem('waiting_rooms', 0, roomName);
            await redisClient.del(`match_player:${playerId}`);
            
            // Limpa PostgreSQL
            await pool.query('DELETE FROM matchmaking_rooms WHERE created_by = $1', [playerId]);
            
            res.json({ status: "unset" });
        }
        
        else {
            res.status(400).json({ error: 'Action inválida' });
        }
        
    } catch (error) {
        console.error('Erro no matchmaking:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Limpeza automática otimizada
setInterval(async () => {
    try {
        // Limpa salas antigas do PostgreSQL
        const result = await pool.query(
            'DELETE FROM matchmaking_rooms WHERE updated_at < NOW() - INTERVAL \'10 minutes\''
        );
        if (result.rowCount > 0) {
            console.log(`🧹 Limpeza: ${result.rowCount} salas removidas`);
        }
        
        // Limpa cache Redis expirado
        const keys = await redisClient.keys('match:*');
        let expiredCount = 0;
        
        for (let key of keys) {
            const ttl = await redisClient.ttl(key);
            if (ttl <= 0) {
                await redisClient.del(key);
                expiredCount++;
            }
        }
        
        if (expiredCount > 0) {
            console.log(`🧹 Limpeza Redis: ${expiredCount} matches expirados removidos`);
        }
        
    } catch (error) {
        console.error('❌ Erro na limpeza automática:', error);
    }
}, 5 * 60 * 1000); // A cada 5 minutos

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('🔄 Desligando servidor...');
    await redisClient.disconnect();
    await pool.end();
    process.exit(0);
});

const PORT = process.env.PORT || 3000;

init().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Servidor de matchmaking rodando na porta ${PORT}`);
        console.log(`📍 Health check: http://localhost:${PORT}/health`);
    });
}).catch(console.error);
