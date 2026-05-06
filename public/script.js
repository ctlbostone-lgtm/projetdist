// public/script.js
const WS_URL = `wss://${window.location.host}/ws`;
let ws = null;
let currentEspMac = null;
let espList = [];
let pinStates = { 16: 0, 17: 0, 18: 0, 19: 0 };

const wsStatusDiv = document.getElementById('wsStatus');
const espStatusDiv = document.getElementById('espStatus');
const cardsGrid = document.getElementById('cardsGrid');
const toast = document.getElementById('toast');

function connect() {
  ws = new WebSocket(WS_URL);
  ws.onopen = () => {
    wsStatusDiv.innerHTML = '<i class="fas fa-plug"></i> Connecté';
    wsStatusDiv.className = 'status online';
    showToast('Connecté au serveur', '#2ecc71');
  };
  ws.onclose = () => {
    wsStatusDiv.innerHTML = '<i class="fas fa-plug"></i> Reconnexion...';
    wsStatusDiv.className = 'status offline';
    setTimeout(connect, 1000); // reconnexion rapide
  };
  ws.onerror = (err) => console.error('WebSocket error', err);
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleMessage(data);
    } catch(e) { console.warn(e); }
  };
}

function handleMessage(msg) {
  switch(msg.type) {
    case 'espList':
      espList = msg.list;
      if (espList.length > 0) {
        if (!currentEspMac || !espList.includes(currentEspMac)) {
          currentEspMac = espList[0];
        }
        espStatusDiv.innerHTML = `<i class="fas fa-server"></i> ESP: ${currentEspMac.slice(-6)}`;
        refreshUI();
      } else {
        espStatusDiv.innerHTML = `<i class="fas fa-server"></i> Aucun ESP`;
        cardsGrid.innerHTML = '<div class="card" style="text-align:center;">En attente d\'un ESP32...</div>';
      }
      break;
    case 'initStates':
      msg.states.forEach(s => pinStates[s.pin] = s.state);
      refreshUI();
      break;
    case 'stateUpdate':
      pinStates[msg.pin] = msg.state;
      updateSingleCard(msg.pin, msg.state);
      showToast(`Broche ${msg.pin} → ${msg.state ? 'ON' : 'OFF'}`, '#3498db');
      break;
  }
}

function sendCommand(cmd) {
  if (!ws || ws.readyState !== WebSocket.OPEN || !currentEspMac) {
    showToast('ESP non connecté', '#e74c3c');
    return;
  }
  ws.send(JSON.stringify({ type: 'command', targetMac: currentEspMac, command: cmd }));
}

function setPin(pin, state) {
  sendCommand({ type: 'set', pin, state: state ? 1 : 0 });
}

function programTimer(pin, delaySec, targetState) {
  if (delaySec < 1) { showToast('Délai ≥ 1s', '#e74c3c'); return; }
  sendCommand({ type: 'timer', pin, state: targetState ? 1 : 0, delay: parseInt(delaySec) });
  showToast(`Programmé: broche ${pin} ${targetState ? 'ON' : 'OFF'} dans ${delaySec}s`, '#f39c12');
}

function refreshUI() {
  const pins = [16,17,18,19];
  cardsGrid.innerHTML = '';
  for (let pin of pins) {
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
        <span class="timer-label"><i class="far fa-clock"></i> Programmer (secondes)</span>
        <div class="timer-control">
          <input type="number" id="delay-${pin}" min="1" max="3600" value="5">
          <button class="timer-on" data-pin="${pin}" data-state="1"><i class="fas fa-hourglass-start"></i> ON</button>
          <button class="timer-off" data-pin="${pin}" data-state="0"><i class="fas fa-hourglass-end"></i> OFF</button>
        </div>
      </div>
    `;
    cardsGrid.appendChild(card);
  }
  // Attacher événements après création
  document.querySelectorAll('.btn-on, .btn-off').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const pin = parseInt(btn.dataset.pin);
      const state = parseInt(btn.dataset.state);
      setPin(pin, state);
    });
  });
  document.querySelectorAll('.timer-on, .timer-off').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const pin = parseInt(btn.dataset.pin);
      const target = parseInt(btn.dataset.state);
      const delay = parseInt(document.getElementById(`delay-${pin}`).value);
      programTimer(pin, delay, target === 1);
    });
  });
}

function updateSingleCard(pin, state) {
  const led = document.getElementById(`led-${pin}`);
  if (led) {
    if (state) led.classList.add('on');
    else led.classList.remove('on');
    const span = led.parentElement.querySelector('span');
    if (span) span.innerText = state ? 'ALLUMÉ' : 'ÉTEINT';
  }
}

function showToast(msg, color) {
  toast.innerText = msg;
  toast.style.backgroundColor = color || '#333';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

connect();
