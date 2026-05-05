// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

const espConnections = new Map();   // mac -> WebSocket
const webClients = new Set();

// Anti-cold start : ping keepalive toutes les 30 secondes
setInterval(() => {
  // Envoi d'un message factice à tous les clients ESP pour garder le tunnel actif
  for (let [mac, ws] of espConnections.entries()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "ping" }));
    }
  }
}, 30000);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

wss.on('connection', (ws, req) => {
  let espMac = null;
  
  ws.on('message', (data) => {
    try {
      const json = JSON.parse(data.toString());
      if (json.type === 'identify') {
        espMac = json.mac;
        espConnections.set(espMac, ws);
        broadcastToWebClients({ type: 'espList', list: Array.from(espConnections.keys()) });
        broadcastToWebClients({ type: 'initStates', states: json.initialStates });
      }
      else if (json.type === 'state') {
        broadcastToWebClients({ type: 'stateUpdate', pin: json.pin, state: json.state });
      }
      else if (json.type === 'command') {
        const targetEsp = espConnections.get(json.targetMac);
        if (targetEsp && targetEsp.readyState === WebSocket.OPEN) {
          targetEsp.send(JSON.stringify(json.command));
        }
      }
      else if (json.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch(e) {}
  });
  
  ws.on('close', () => {
    if (espMac) espConnections.delete(espMac);
    else webClients.delete(ws);
    broadcastToWebClients({ type: 'espList', list: Array.from(espConnections.keys()) });
  });
  
  if (!espMac) {
    webClients.add(ws);
    ws.send(JSON.stringify({ type: 'espList', list: Array.from(espConnections.keys()) }));
  }
});

function broadcastToWebClients(payload) {
  const msg = JSON.stringify(payload);
  webClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Serveur prêt sur port ${PORT}`));
