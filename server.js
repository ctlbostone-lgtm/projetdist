// server.js - Version ultra-rapide avec heartbeat
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

// Stockage des connexions
const espConnections = new Map();   // mac -> WebSocket
const webClients = new Set();       // WebSocket (navigateurs)

// Heartbeat : ping toutes les 15 secondes pour garder la connexion active
setInterval(() => {
  // Ping vers tous les ESP32
  for (const [mac, ws] of espConnections.entries()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    } else {
      espConnections.delete(mac);
      broadcastToWebClients({ type: 'espDisconnected', mac });
    }
  }
  // Ping vers les clients web (optionnel)
  for (const client of webClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.ping();
    } else {
      webClients.delete(client);
    }
  }
}, 15000);

// Servir les fichiers statiques (avec cache désactivé pour le développement)
app.use(express.static(path.join(__dirname, 'public'), { etag: false, maxAge: 0 }));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

wss.on('connection', (ws, req) => {
  console.log('Nouvelle connexion WebSocket');

  let espMac = null;

  // Réponse immédiate au ping (keepalive)
  ws.on('pong', () => { /* heartbeat ok */ });

  ws.on('message', (data) => {
    const message = data.toString();
    try {
      const json = JSON.parse(message);
      const { type } = json;

      if (type === 'identify') {
        espMac = json.mac;
        espConnections.set(espMac, ws);
        console.log(`✅ ESP32 ${espMac} connecté (instantané)`);

        // Envoie immédiatement l'état initial à tous les clients web
        broadcastToWebClients({
          type: 'initStates',
          states: json.initialStates,
          mac: espMac
        });
        // Notifie la liste des ESP connectés
        broadcastEspList();
      }
      else if (type === 'state') {
        // Relai instantané aux clients web
        broadcastToWebClients({
          type: 'stateUpdate',
          pin: json.pin,
          state: json.state,
          mac: espMac
        });
      }
      else if (type === 'command') {
        // Commande d'un client web vers un ESP spécifique
        const targetEsp = espConnections.get(json.targetMac);
        if (targetEsp && targetEsp.readyState === WebSocket.OPEN) {
          targetEsp.send(JSON.stringify(json.command));
        } else {
          // Notifier le client que l'ESP n'est pas joignable
          ws.send(JSON.stringify({ type: 'error', message: 'ESP non connecté' }));
        }
      }
    } catch (err) {
      console.error('Message invalide:', err);
    }
  });

  ws.on('close', () => {
    if (espMac) {
      espConnections.delete(espMac);
      console.log(`❌ ESP32 ${espMac} déconnecté`);
      broadcastToWebClients({ type: 'espDisconnected', mac: espMac });
      broadcastEspList();
    } else {
      webClients.delete(ws);
      console.log('Client web déconnecté');
    }
  });

  // Si ce n'est pas un ESP32, c'est un client web
  if (!espMac) {
    webClients.add(ws);
    // Envoi immédiat de la liste des ESP déjà connectés
    ws.send(JSON.stringify({ type: 'espList', list: Array.from(espConnections.keys()) }));
  }
});

function broadcastToWebClients(payload) {
  const msg = JSON.stringify(payload);
  webClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

function broadcastEspList() {
  const list = Array.from(espConnections.keys());
  broadcastToWebClients({ type: 'espList', list });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
