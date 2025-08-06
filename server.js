const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  }
});

// Middleware de segurança
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(compression());
app.use(morgan('combined'));

// CORS configurado para produção
app.use(cors({
  origin: [
    'https://earnest-tartufo-7d97ad.netlify.app',
    'http://localhost:5173',
    'http://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Armazenar sessões ativas em memória
const activeSessions = new Map();
const sessionData = new Map();

// Health check detalhado
app.get('/health', (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    activeSessions: activeSessions.size,
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  };

  res.json(health);
});

// Endpoint para conectar chip
app.post('/api/chips/connect', async (req, res) => {
  const { chipId, name, number } = req.body;
  
  try {
    console.log(`🔄 Iniciando conexão para chip: ${name} (${number})`);
    
    if (activeSessions.has(chipId)) {
      return res.status(400).json({ 
        error: 'Chip já possui uma sessão ativa' 
      });
    }

    const sessionName = `chip_${chipId}`;
    
    // Armazenar sessão
    activeSessions.set(chipId, { 
      id: chipId, 
      name, 
      number, 
      status: 'initializing',
      createdAt: new Date(),
      lastActivity: new Date()
    });

    // Simular processo de conexão WhatsApp
    setTimeout(() => {
      console.log(`📱 QR Code gerado para ${name}`);
      
      const qrCodeData = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==`;
      
      io.emit('qr-code', {
        chipId,
        qrCode: qrCodeData,
        attempts: 1,
        urlCode: `whatsapp://qr/${chipId}`
      });

      io.emit('connection-status', {
        chipId,
        status: 'qr-ready',
        session: sessionName
      });
    }, 2000);

    // Conexão bem-sucedida após 8 segundos
    setTimeout(() => {
      console.log(`✅ Chip ${name} conectado com sucesso!`);
      
      sessionData.set(chipId, {
        name,
        number,
        status: 'connected',
        connectedAt: new Date(),
        health: 'excellent',
        messagesSent: 0,
        messagesReceived: 0,
        lastActivity: new Date()
      });

      activeSessions.set(chipId, {
        ...activeSessions.get(chipId),
        status: 'connected'
      });

      io.emit('connection-status', {
        chipId,
        status: 'authenticated',
        session: sessionName
      });

      io.emit('chip-connected', {
        chipId,
        name,
        number,
        status: 'connected'
      });
    }, 8000);

    res.json({ 
      success: true, 
      message: 'Sessão iniciada. Aguarde o QR Code.',
      chipId,
      sessionName
    });

  } catch (error) {
    console.error(`❌ Erro ao conectar chip ${name}:`, error);
    res.status(500).json({ 
      error: 'Erro ao iniciar sessão do WhatsApp',
      details: error.message 
    });
  }
});

// Endpoint para enviar mensagem
app.post('/api/chips/:chipId/send-message', async (req, res) => {
  const { chipId } = req.params;
  const { to, message } = req.body;

  try {
    const session = activeSessions.get(chipId);
    
    if (!session || session.status !== 'connected') {
      return res.status(404).json({ 
        error: 'Chip não encontrado ou não conectado' 
      });
    }

    const messageId = uuidv4();
    
    console.log(`📤 Mensagem enviada via chip ${chipId} para ${to}: ${message}`);

    res.json({ 
      success: true, 
      messageId,
      status: 'sent'
    });

  } catch (error) {
    console.error(`❌ Erro ao enviar mensagem via chip ${chipId}:`, error);
    res.status(500).json({ 
      error: 'Erro ao enviar mensagem',
      details: error.message 
    });
  }
});

// Socket.IO para comunicação em tempo real
io.on('connection', (socket) => {
  console.log('🔌 Cliente conectado via Socket.IO:', socket.id);

  socket.on('disconnect', () => {
    console.log('🔌 Cliente desconectado:', socket.id);
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 ChipForce API rodando na porta ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`📱 Pronto para conectar chips WhatsApp!`);
});

module.exports = { app, server, io };
