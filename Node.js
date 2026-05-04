// server.js
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

// Servir les fichiers statiques (frontend)
app.use(express.static(path.join(__dirname, 'public')));

// Route principale
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebSocket
wss.on('connection', (ws, req) => {
  console.log('Nouvelle connexion WebSocket');

  let espMac = null;

  ws.on('message', (data) => {
    const message = data.toString();
    console.log('Message reçu:', message);
    try {
      const json = JSON.parse(message);
      const { type } = json;

      if (type === 'identify') {
        // C'est un ESP32 qui s'identifie
        espMac = json.mac;
        espConnections.set(espMac, ws);
        console.log(`ESP32 ${espMac} connecté`);

        // Envoie l'état initial à tous les clients web
        broadcastToWebClients({
          type: 'initStates',
          states: json.initialStates
        });
      }
      else if (type === 'state') {
        // Mise à jour d'état d'une broche depuis l'ESP32
        broadcastToWebClients({
          type: 'stateUpdate',
          pin: json.pin,
          state: json.state
        });
      }
      else if (type === 'command') {
        // Commande provenant d'un client web → la rediriger vers l'ESP32
        const targetEsp = espConnections.get(json.targetMac);
        if (targetEsp && targetEsp.readyState === WebSocket.OPEN) {
          targetEsp.send(JSON.stringify(json.command));
        } else {
          console.warn(`ESP32 ${json.targetMac} non connecté`);
        }
      }
    } catch (err) {
      console.error('Message invalide:', err);
    }
  });

  ws.on('close', () => {
    if (espMac) {
      espConnections.delete(espMac);
      console.log(`ESP32 ${espMac} déconnecté`);
    } else {
      webClients.delete(ws);
      console.log('Client web déconnecté');
    }
  });

  // Si ce n'est pas un ESP32, c'est un client web
  if (!espMac) {
    webClients.add(ws);
    // Envoi de la liste des ESP actuellement connectés
    const espList = Array.from(espConnections.keys());
    ws.send(JSON.stringify({ type: 'espList', list: espList }));
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

// Port dynamique pour Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
