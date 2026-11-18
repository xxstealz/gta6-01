// The HUD: money, health, wanted stars, ammo, speed, the mission objective,
// message feed and the title / pause / busted / complete overlays. All DOM,
// so the text stays crisp in screenshots.
function createHud() {
  return {
    money: document.getElementById('money'),
    healthFill: document.getElementById('health-fill'),
    healthText: document.getElementById('health-text'),
    stars: document.getElementById('stars'),
    clock: document.getElementById('clock'),
    ammo: document.getElementById('ammo'),
    speed: document.getElementById('speed'),
    objectiveTitle: document.getElementById('objective-title'),
    objectiveText: document.getElementById('objective-text'),
    message: document.getElementById('message'),
    hint: document.getElementById('hint'),
    overlay: document.getElementById('overlay'),
    overlayTitle: document.getElementById('overlay-title'),
    overlayText: document.getElementById('overlay-text'),
    overlayButtons: document.getElementById('overlay-buttons'),
    minimap: document.getElementById('minimap'),
  };
}

function starsText(wanted) {
  var text = '';
  for (var i = 0; i < 5; i += 1) text += i < wanted ? '★' : '☆';
  return text;
}

function updateHud(hud, state) {
  var player = state.player;
  hud.money.textContent = '$' + player.money.toLocaleString('en-US');
  hud.healthFill.style.width = Math.max(0, player.health) + '%';
  hud.healthFill.style.background = player.health > 50 ? '#2ecc71' : player.health > 25 ? '#f39c12' : '#e5534b';
  hud.healthText.textContent = Math.max(0, Math.round(player.health)) + ' HP';
  hud.stars.textContent = starsText(player.wanted);
  hud.stars.style.color = player.wanted > 0 ? '#ffd94d' : 'rgba(255,255,255,0.35)';
  hud.clock.textContent = timePhase(state.clockMinutes).label + ' ' + formatClock(state.clockMinutes);
  hud.ammo.textContent = state.playerCar ? '🚗' : '🔫 ' + player.ammo;
  var speed = state.playerCar ? Math.abs(Math.round(state.playerCar.speed * 0.18)) : 0;
  hud.speed.textContent = state.playerCar ? speed + ' km/h' : '';
  var mission = currentMission(state);
  if (mission) {
    hud.objectiveTitle.textContent = mission.title;
    hud.objectiveText.textContent = state.missionMessage || mission.brief;
    if (mission.timer && state.screen === 'play') {
      hud.objectiveText.textContent += ' — ' + Math.ceil(state.missionTimer) + ' detik tersisa';
    }
  } else {
    hud.objectiveTitle.textContent = 'Solmar Bay — Bebas';
    hud.objectiveText.textContent = 'Semua misi selesai. Jelajahi kota, cari uang, atau mulai lagi.';
  }
  if (state.messageTimer > 0) {
    hud.message.textContent = state.message;
    hud.message.style.opacity = '1';
  } else {
    hud.message.style.opacity = '0';
  }
  hud.hint.textContent = state.playerCar
    ? 'WASD mengemudi • Spasi rem tangan • E keluar mobil • Drag mouse kamera • M suara • P jeda'
    : 'WASD jalan • Shift lari • E masuk mobil • F pukul • Klik tembak • Drag mouse kamera • M suara • P jeda';
}

function showOverlay(hud, state, onStart, onContinue, onRestart) {
  var overlay = hud.overlay;
  overlay.classList.remove('hidden');
  hud.overlayButtons.innerHTML = '';
  if (state.screen === 'title') {
    hud.overlayTitle.textContent = 'SOLMAR BAY';
    hud.overlayText.innerHTML =
      'Kota matahari, mobil cepat, dan polisi yang tidak pernah tidur.<br><br>' +
      '<b>Rico Solano</b> pulang ke Solmar Bay dengan utang dan satu rencana: lima pekerjaan, ' +
      'satu pelarian terakhir. Jelajahi kota jalan kaki atau naik mobil, curi mobil, kabur dari polisi, ' +
      'dan selesaikan semua misi.<br><br>' +
      'WASD bergerak • E masuk/keluar mobil • F pukul • Klik mouse menembak • Drag mouse putar kamera • Spasi rem tangan • P jeda';
    addButton(hud, '▶  MULAI PETUALANGAN', onStart);
    if (state.hasSave) addButton(hud, '↻  LANJUTKAN (SAVE)', onContinue);
  } else if (state.screen === 'paused') {
    hud.overlayTitle.textContent = 'JEDA';
    hud.overlayText.textContent = 'Istirahat sebentar. Kota menunggu.';
    addButton(hud, '▶  LANJUT', onStart);
    addButton(hud, '💾  SIMPAN', function () { state.saveRequested(); });
  } else if (state.screen === 'busted') {
    hud.overlayTitle.textContent = 'TERTANGKAP!';
    hud.overlayText.textContent = 'Polisi Solmar Bay menangkap Rico. Uang jaminan $200 — tapi cerita belum selesai.';
    addButton(hud, '↻  COBA LAGI', onRestart);
  } else if (state.screen === 'wasted') {
    hud.overlayTitle.textContent = 'RICO TUMBANG';
    hud.overlayText.textContent = 'Solmar Bay memang keras. Bangkit dan coba lagi.';
    addButton(hud, '↻  COBA LAGI', onRestart);
  } else if (state.screen === 'complete') {
    hud.overlayTitle.textContent = 'SOLMAR BAY — TAMAT!';
    hud.overlayText.innerHTML =
      'Semua ' + MISSIONS.length + ' misi selesai! Rico bebas, utang lunas, dan kota ini miliknya.<br><br>' +
      'Uang akhir: <b>$' + state.player.money.toLocaleString('en-US') + '</b> • Mobil dicuri: <b>' + state.stats.carsStolen + '</b>';
    addButton(hud, '↻  MAIN LAGI', onRestart);
  }
}

function addButton(hud, label, onClick) {
  var button = document.createElement('button');
  button.textContent = label;
  button.addEventListener('click', onClick);
  hud.overlayButtons.appendChild(button);
}

function hideOverlay(hud) {
  hud.overlay.classList.add('hidden');
}
