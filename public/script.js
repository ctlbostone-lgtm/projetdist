// public/script.js
const WS_URL = `wss://${window.location.host}/ws`;   // sur Render : wss://...
let ws = null;
let currentEspMac = null;       // MAC de l'ESP32 sélectionné
let espList = [];

// Éléments DOM
const wsStatusDiv = document.getElementById('wsStatus');
const espStatusDiv = document.getElementById('espStatus');
const cardsGrid = document.getElementById('cardsGrid');
const toastEl = document.getElementById('toast');

// Broches concernées
const pins = [16, 17, 18, 19];
let pinStates = { 16: 0, 17: 0, 18: 0, 19: 0 };

// Connexion WebSocket
function connectWebSocket() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    wsStatusDiv.innerHTML = '<i class="fas fa-plug"></i> Connecté';
    wsStatusDiv.className = 'status online';
    showToast('Connecté au serveur', 'success');
  };

  ws.onclose = () => {
    wsStatusDiv.innerHTML = '<i class="fas fa-plug"></i> Déconnecté';
    wsStatusDiv.className = 'status offline';
    espStatusDiv.innerHTML = '<i class="fas fa-server"></i> Aucun ESP32';
    showToast('Connexion perdue, reconnexion...', 'error');
    setTimeout(connectWebSocket, 3000);
  };

  ws.onerror = () => {
    console.error('WebSocket error');
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleServerMessage(data);
    } catch (e) {
      console.warn('Message non JSON', event.data);
    }
  };
}

function handleServerMessage(msg) {
  switch (msg.type) {
    case 'espList':
      espList = msg.list;
      if (espList.length > 0) {
        currentEspMac = espList[0];
        espStatusDiv.innerHTML = `<i class="fas fa-server"></i> ESP: ${currentEspMac.slice(-6)}`;
      } else {
        espStatusDiv.innerHTML = `<i class="fas fa-server"></i> Aucun ESP32 connecté`;
      }
      break;

    case 'initStates':
      // Réception de l'état initial des broches depuis l'ESP
      msg.states.forEach(s => {
        pinStates[s.pin] = s.state;
      });
      renderCards();
      break;

    case 'stateUpdate':
      pinStates[msg.pin] = msg.state;
      updateCardUI(msg.pin, msg.state);
      showToast(`Broche ${msg.pin} → ${msg.state ? 'ON' : 'OFF'}`, 'info');
      break;
  }
}

// Envoi d'une commande à l'ESP (via le serveur)
function sendCommand(command) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    showToast('WebSocket non connecté', 'error');
    return;
  }
  if (!currentEspMac) {
    showToast('Aucun ESP32 disponible', 'error');
    return;
  }
  const payload = {
    type: 'command',
    targetMac: currentEspMac,
    command: command
  };
  ws.send(JSON.stringify(payload));
}

// Actions immédiates
function setPinImmediate(pin, state) {
  sendCommand({ type: 'set', pin: pin, state: state ? 1 : 0 });
}

function programTimer(pin, delaySec, targetState) {
  if (isNaN(delaySec) || delaySec < 1) {
    showToast('Le délai doit être ≥ 1 seconde', 'error');
    return;
  }
  sendCommand({
    type: 'timer',
    pin: pin,
    state: targetState ? 1 : 0,
    delay: parseInt(delaySec)
  });
  showToast(`Temporisation programmée : broche ${pin} ${targetState ? 'ON' : 'OFF'} dans ${delaySec}s`, 'success');
}

// Rendu des cartes
function renderCards() {
  cardsGrid.innerHTML = '';
  pins.forEach(pin => {
    const state = pinStates[pin];
    const card = document.createElement('div');
    card.className = 'card';
    card.id = `card-${pin}`;
    card.innerHTML = `
      <div class="card-header">
        <span class="pin-badge"><i class="fas fa-tag"></i> GPIO ${pin}</span>
        <div class="led-indicator">
          <div class="led ${state ? 'on' : ''}" id="led-${pin}"></div>
          <span>${state ? 'ALLUMÉ' : 'ÉTEINT'}</span>
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
    btn.addEventListener('click', (e) => {
      const pin = parseInt(btn.dataset.pin);
      const state = parseInt(btn.dataset.state);
      setPinImmediate(pin, state);
    });
  });
  document.querySelectorAll('.timer-on, .timer-off').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const pin = parseInt(btn.dataset.pin);
      const targetState = parseInt(btn.dataset.state);
      const delayInput = document.getElementById(`delay-${pin}`);
      const delaySec = parseInt(delayInput.value);
      programTimer(pin, delaySec, targetState === 1);
    });
  });
}

function updateCardUI(pin, state) {
  const ledDiv = document.getElementById(`led-${pin}`);
  if (ledDiv) {
    if (state) ledDiv.classList.add('on');
    else ledDiv.classList.remove('on');
    const stateSpan = ledDiv.parentElement.querySelector('span');
    if (stateSpan) stateSpan.innerText = state ? 'ALLUMÉ' : 'ÉTEINT';
  }
}

function showToast(msg, type = 'info') {
  toastEl.innerText = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 2500);
}

// Initialisation
connectWebSocket();
