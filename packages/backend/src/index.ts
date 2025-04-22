import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import type { WSMessage } from '@vestream/shared';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json());

// REST endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('New WebSocket connection');

  // Send welcome message
  const message: WSMessage = {
    type: 'MESSAGE',
    payload: 'Welcome to the server!',
    timestamp: new Date().toISOString(),
  };
  ws.send(JSON.stringify(message));

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString()) as WSMessage;
      // Broadcasting to all clients
      wss.clients.forEach((client) => {
        if (client !== ws) {
          client.send(JSON.stringify(message));
        }
      });
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 