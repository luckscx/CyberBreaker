import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { WebSocketServer } from 'ws';
import { connectDb } from './db.js';
import { healthRouter } from './routes/health.js';
import { apiRouter } from './routes/index.js';
import { handleRoomWs } from './room/wsHandler.js';

const app = express();
app.use(morgan('combined'));
app.use(cors());
app.use(express.json());

app.use('/health', healthRouter);
app.use('/api/v1', apiRouter);

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = req.url || '';
  if (!url.startsWith('/ws/room/')) {
    console.log('[WS] upgrade rejected: path not /ws/room/', url);
    socket.destroy();
    return;
  }
  const [path, search] = url.split('?');
  const searchParams = new URLSearchParams(search || '');
  console.log('[WS] upgrade ok path=%s role=%s', path, searchParams.get('role'));
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req, path, searchParams);
  });
});

wss.on('connection', (ws: import('ws').WebSocket, _req: http.IncomingMessage, path: string, searchParams: URLSearchParams) => {
  console.log('[WS] connection path=%s role=%s', path, searchParams.get('role'));
  handleRoomWs(ws, path, searchParams);
});

const PORT = Number(process.env.PORT) || 3000;
server.listen(PORT, () => console.log(`Server listening on port ${PORT} (HTTP + WS)`));
connectDb().catch((e) => console.error('DB connect failed (API will fail until DB is up):', e));
