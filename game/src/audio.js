// All sound is synthesized with WebAudio: no audio files, nothing to download.
// Engine hum, sirens, gunshots, pickups and a lazy sun-soaked bass line.
function createAudio() {
  var audio = {
    context: null,
    master: null,
    muted: false,
    engineOsc: null,
    engineGain: null,
    sirenTimer: 0,
    musicTimer: 0,
    musicStep: 0,
  };

  audio.ensure = function ensure() {
    if (audio.context) {
      if (audio.context.state === 'suspended') audio.context.resume();
      return;
    }
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audio.context = new Ctx();
      audio.master = audio.context.createGain();
      audio.master.gain.value = 0.35;
      audio.master.connect(audio.context.destination);
      audio.engineOsc = audio.context.createOscillator();
      audio.engineOsc.type = 'sawtooth';
      audio.engineOsc.frequency.value = 50;
      audio.engineGain = audio.context.createGain();
      audio.engineGain.gain.value = 0;
      var filter = audio.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;
      audio.engineOsc.connect(filter);
      filter.connect(audio.engineGain);
      audio.engineGain.connect(audio.master);
      audio.engineOsc.start();
    } catch (err) {
      audio.context = null;
    }
  };

  audio.setMuted = function setMuted(muted) {
    audio.muted = muted;
    if (audio.master) audio.master.gain.value = muted ? 0 : 0.35;
  };

  function tone(freq, seconds, type, volume, when) {
    if (!audio.context || audio.muted) return;
    var start = audio.context.currentTime + (when || 0);
    var osc = audio.context.createOscillator();
    var gain = audio.context.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume || 0.2, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start(start);
    osc.stop(start + seconds + 0.02);
  }

  function noise(seconds, volume, filterFreq) {
    if (!audio.context || audio.muted) return;
    var length = Math.floor(audio.context.sampleRate * seconds);
    var buffer = audio.context.createBuffer(1, length, audio.context.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    var source = audio.context.createBufferSource();
    source.buffer = buffer;
    var filter = audio.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 1200;
    var gain = audio.context.createGain();
    gain.gain.value = volume || 0.3;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(audio.master);
    source.start();
  }

  audio.shot = function shot() {
    noise(0.14, 0.5, 2600);
    tone(160, 0.1, 'square', 0.16);
  };
  audio.punch = function punch() { noise(0.08, 0.3, 500); };
  audio.pickup = function pickup() {
    tone(660, 0.09, 'sine', 0.22);
    tone(990, 0.14, 'sine', 0.2, 0.08);
  };
  audio.cash = function cash() {
    tone(880, 0.08, 'triangle', 0.22);
    tone(1174, 0.08, 'triangle', 0.22, 0.07);
    tone(1568, 0.16, 'triangle', 0.22, 0.14);
  };
  audio.crash = function crash() { noise(0.25, 0.4, 700); };
  audio.sirenBlip = function sirenBlip() {
    tone(720, 0.22, 'sine', 0.1);
    tone(540, 0.22, 'sine', 0.1, 0.22);
  };
  audio.missionDone = function missionDone() {
    [523, 659, 784, 1046].forEach(function (freq, i) { tone(freq, 0.18, 'triangle', 0.24, i * 0.11); });
  };
  audio.busted = function busted() {
    [392, 330, 262].forEach(function (freq, i) { tone(freq, 0.3, 'sawtooth', 0.16, i * 0.18); });
  };

  // Called every frame: engine pitch follows speed, siren wails while wanted,
  // and a slow bass line keeps the city feeling sun-soaked.
  audio.update = function update(dt, speed, wanted) {
    if (!audio.context || audio.muted) return;
    if (audio.engineGain) {
      var target = speed > 20 ? 0.05 + Math.min(0.09, speed / 6000) : 0;
      audio.engineGain.gain.value += (target - audio.engineGain.gain.value) * Math.min(1, dt * 6);
      audio.engineOsc.frequency.value = 46 + speed * 0.16;
    }
    if (wanted > 0) {
      audio.sirenTimer -= dt;
      if (audio.sirenTimer <= 0) {
        audio.sirenTimer = 0.9;
        audio.sirenBlip();
      }
    }
    audio.musicTimer -= dt;
    if (audio.musicTimer <= 0) {
      audio.musicTimer = 0.42;
      var bass = [110, 110, 130.8, 98, 110, 146.8, 130.8, 98];
      tone(bass[audio.musicStep % bass.length], 0.36, 'triangle', 0.07);
      if (audio.musicStep % 4 === 2) tone(440, 0.2, 'sine', 0.03);
      audio.musicStep += 1;
    }
  };

  return audio;
}
