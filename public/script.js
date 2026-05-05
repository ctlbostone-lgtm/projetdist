// public/script.js - Version avec affichage permanent des boutons
let ws = null;
let currentEspMac = null;
let pinStates = { 16: 0, 17: 0, 18: 0, 19: 0 };
let reconnectAttempts = 0;

const WS_URL = `wss://${window.location.host}/ws`;
const pins = [16, 17, 18, 19];

// Éléments DOM
const wsStatusDiv = document.getElementById('wsStatus');
const espStatusDiv = document.getElementById('espStatus');
const cardsGrid = document.getElementById('cardsGrid');
const toastEl = document.getElementById('toast');

// Connexion WebSocket robuste
function connectWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  
  ws = new WebSocket(WS_URL);
  
  ws.onopen = () => {
    wsStatusDiv.innerHTML = '<i class="fas fa-plug"></i> Connecté';
    wsStatusDiv.className = 'status online';
    reconnectAttempts = 0;
    showToast('Connecté au serveur', 'success');
    // Demander la liste des ESP (utile si le serveur ne l'envoie pas automatiquement)
    // Le serveur envoie espList à la connexion du client, donc pas besoin.
  };
  
  ws.onclose = () => {
    wsStatusDiv.innerHTML = '<i class="fas fa-plug"></i> Déconnecté';
    wsStatusDiv.className = 'status offline';
    espStatusDiv.innerHTML = '<i class="fas fa-server"></i> Aucun ESP32';
    showToast('Connexion perdue, reconnexion...', 'error');
    let delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 5000);
    setTimeout(connectWebSocket, delay);
    reconnectAttempts++;
  };
  
  ws.onerror = (err) => {
    console.error('WebSocket error:', err);
    ws.close();
  };
  
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleServerMessage(data);
    } catch (e) {
      console.warn('Message non JSON:', event.data);
    }
  };
}

function handleServerMessage(msg) {
  switch (msg.type) {
    case 'espList':
      if (msg.list && msg.list.length > 0) {
        currentEspMac = msg.list[0];
        espStatusDiv.innerHTML = `<i class="fas fa-server"></i> ESP: ${currentEspMac.slice(-6)}`;
      } else {
        currentEspMac = null;
        espStatusDiv.innerHTML = '<i class="fas fa-server"></i> Aucun ESP32';
      }
      break;
      
    case 'initStates':
      if (msg.states) {
        msg.states.forEach(s => {
          pinStates[s.pin] = s.state;
        });
        renderCards(); // Met à jour l'affichage avec les bons états
      }
      break;
      
    case 'stateUpdate':
      pinStates[msg.pin] = msg.state;
      updateCardUI(msg.pin, msg.state);
      showToast(`Broche ${msg.pin} → ${msg.state ? 'ON' : 'OFF'}`, 'info');
      break;
      
    default:
      break;
  }
}

function sendCommand(command) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    showToast('WebSocket non connecté', 'error');
    return false;
  }
  if (!currentEspMac) {
    showToast('Aucun ESP32 disponible', 'error');
    return false;
  }
  const payload = {
    type: 'command',
    targetMac: currentEspMac,
    command: command
  };
  ws.send(JSON.stringify(payload));
  return true;
}

function setPinImmediate(pin, state) {
  sendCommand({ type: 'set', pin: pin, state: state ? 1 : 0 });
}

function programTimer(pin, delaySec, targetState) {
  if (isNaN(delaySec) || delaySec < 1) {
    showToast('Le délai doit être ≥ 1 seconde', 'error');
    return;
  }
  if (sendCommand({
    type: 'timer',
    pin: pin,
    state: targetState ? 1 : 0,
    delay: parseInt(delaySec)
  })) {
    showToast(`Temporisation programmée : broche ${pin} ${targetState ? 'ON' : 'OFF'} dans ${delaySec}s`, 'success');
  }
}

// Crée ou met à jour l'affichage des cartes (toujours présent)
function renderCards() {
  if (!cardsGrid) return;
  // On vide la grille et on recrée pour être sûr d'avoir les bons états
  cardsGrid.innerHTML = '';
  pins.forEach(pin => {
    const state = pinStates[pin] === 1; // boolean
    const card = document.createElement('div');
    card.className = 'card';
    card.id = `card-${pin}`;
    card.innerHTML = `
      <div class="card-header">
        <span class="pin-badge"><i class="fas fa-tag"></i> GPIO ${pin}</span>
        <div class="led-indicator">
          <div class="led ${state ? 'on' : ''}" id="led-${pin}"></div>
          <span id="state-text-${pin}">${state ? 'ALLUMÉ' : 'ÉTEINT'}</span>
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-on" data-pin="${pin}" data-state="1"><i class="fas fa-power-off"></i> ON</button>
        <button class="btn btn-off" data-pin="${pin}" data-state="0"><i class="fas fa-ban"></i> OFF</button>
      </div>
      <div class="timer-section">
        <span class="timer-label"><i class="far fa-clock"></i> Programmer temporisation</span>
        <div class="timer-control">
          <input type="number" id="delay-${pin}" min="1" max="3600" placeholder="secondes" value="5">
          <button class="timer-on" data-pin="${pin}" data-state="1"><i class="fas fa-hourglass-start"></i> ON</button>
          <button class="timer-off" data-pin="${pin}" data-state="0"><i class="fas fa-hourglass-end"></i> OFF</button>
        </div>
      </div>
    `;
    cardsGrid.appendChild(card);
  });
  
  // Attacher les événements après création
  document.querySelectorAll('.btn-on, .btn-off').forEach(btn => {
    btn.removeEventListener('click', handleImmediateClick);
    btn.addEventListener('click', handleImmediateClick);
  });
  document.querySelectorAll('.timer-on, .timer-off').forEach(btn => {
    btn.removeEventListener('click', handleTimerClick);
    btn.addEventListener('click', handleTimerClick);
  });
}

function handleImmediateClick(e) {
  const btn = e.currentTarget;
  const pin = parseInt(btn.dataset.pin);
  const state = parseInt(btn.dataset.state);
  setPinImmediate(pin, state);
}

function handleTimerClick(e) {
  const btn = e.currentTarget;
  const pin = parseInt(btn.dataset.pin);
  const targetState = parseInt(btn.dataset.state);
  const delayInput = document.getElementById(`delay-${pin}`);
  if (delayInput) {
    const delaySec = parseInt(delayInput.value);
    programTimer(pin, delaySec, targetState === 1);
  }
}

function updateCardUI(pin, state) {
  const ledDiv = document.getElementById(`led-${pin}`);
  if (ledDiv) {
    if (state) ledDiv.classList.add('on');
    else ledDiv.classList.remove('on');
  }
  const stateSpan = document.getElementById(`state-text-${pin}`);
  if (stateSpan) {
    stateSpan.innerText = state ? 'ALLUMÉ' : 'ÉTEINT';
  }
}

function showToast(msg, type = 'info') {
  if (!toastEl) return;
  toastEl.innerText = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 2500);
}

// Initialisation au chargement
document.addEventListener('DOMContentLoaded', () => {
  // Crée les cartes immédiatement (avec état LOW par défaut)
  renderCards();
  // Puis tente la connexion WebSocket
  connectWebSocket();
});
