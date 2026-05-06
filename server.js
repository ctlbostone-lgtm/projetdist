// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

const espConnections = new Map();   // mac -> ws
const webClients = new Set();       // ws clients web

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Fonction pour envoyer la liste des ESP à tous les clients web
function broadcastEspList() {
  const list = Array.from(espConnections.keys());
  const msg = JSON.stringify({ type: 'espList', list });
  webClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

// Heartbeat pour détecter les ESP silencieux (ping toutes les 30s, timeout 10s)
function startHeartbeat(ws, mac) {
  let isAlive = true;
  ws.on('pong', () => isAlive = true);
  const interval = setInterval(() => {
    if (!isAlive) {
      console.log(`ESP ${mac} mort, déconnexion`);
      ws.terminate();
      espConnections.delete(mac);
      broadcastEspList();
      clearInterval(interval);
    } else {
      isAlive = false;
      ws.ping();
    }
  }, 30000);
  ws.on('close', () => clearInterval(interval));
}

wss.on('connection', (ws, req) => {
  let espMac = null;
  console.log('Nouveau client connecté');

  ws.on('message', (data) => {
    try {
      const json = JSON.parse(data);
      if (json.type === 'identify') {
        espMac = json.mac;
        espConnections.set(espMac, ws);
        console.log(`ESP32 ${espMac} connecté (instantané)`);
        startHeartbeat(ws, espMac);
        broadcastEspList();  // Notifie tous les web clients immédiatement
        // Envoie l'état initial au client web qui vient de se connecter? Non, ici ws est l'ESP.
        // On va plutôt envoyer l'état initial à tous les web clients
        broadcastToWebClients({ type: 'initStates', states: json.initialStates });
      } 
      else if (json.type === 'state') {
        broadcastToWebClients({ type: 'stateUpdate', pin: json.pin, state: json.state });
      }
      else if (json.type === 'command') {
        const target = espConnections.get(json.targetMac);
        if (target && target.readyState === WebSocket.OPEN) {
          target.send(JSON.stringify(json.command));
        }
      }
    } catch (err) { console.error('Message invalide'); }
  });

  ws.on('close', () => {
    if (espMac) {
      espConnections.delete(espMac);
      broadcastEspList();
      console.log(`ESP ${espMac} déconnecté`);
    } else {
      webClients.delete(ws);
    }
  });

  // Si ce n'est pas un ESP (pas encore identifié), c'est un client web
  if (!espMac) {
    webClients.add(ws);
    // Envoi immédiat de la liste des ESP actuellement connectés
    const list = Array.from(espConnections.keys());
    ws.send(JSON.stringify({ type: 'espList', list }));
  }
});

function broadcastToWebClients(msg) {
  const data = JSON.stringify(msg);
  webClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Serveur prêt sur http://localhost:${PORT}`));
