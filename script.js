(() => {
  'use strict';
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d', { alpha: false });
  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  resize();
  const COLORS = {
    sun1: '#ffeb4d', sun2: '#ff4db2', sun3: '#9d4dff',
    roadEdge: '#36D6B5', grid: 'rgba(54, 214, 181, 0.6)',
    playerBody: '#4dffd9',
    enemy1: '#ff4db2', enemy2: '#ffeb4d', enemy3: '#9d4dff',
  };
  const state = {
    running: false, playing: false, t: 0, dt: 0,
    score: 0, speed: 0, maxSpeed: 0, baseSpeed: 0.55, targetSpeed: 0.55,
    boost: 100, boosting: false, boostActive: false,
    playerX: 0, playerVX: 0, curve: 0, distance: 0,
    enemies: [], items: [], particles: [],
    spawnTimer: 0, itemTimer: 3,
    combo: 0, bestCombo: 0, comboTimer: 0,
    hiScore: +(localStorage.getItem('neonDrift_hi') || 0),
    touchActive: false, touchStartX: 0, touchCurrentX: 0,
    tiltEnabled: false, tiltGamma: 0,
    cameraShake: 0, roadOffset: 0, stars: [], mountains: [],
  };
  const CAMERA_DEPTH = 0.84;
  const ROAD_WIDTH = 2000;
  const SEGMENT_LENGTH = 200;
  const DRAW_DISTANCE = 200;
  const segments = [];
  function buildRoad() {
    segments.length = 0;
    const totalSegments = 2000;
    let curve = 0, curveDir = 0, curveLen = 0;
    for (let i = 0; i < totalSegments; i++) {
      if (curveLen <= 0) {
        curveDir = (Math.random() - 0.5) * 2.2;
        if (Math.random() < 0.4) curveDir = 0;
        curveLen = 40 + Math.random() * 120;
      }
      curveLen--;
      curve += (curveDir - curve) * 0.04;
      segments.push({ index: i, curve: curve, worldZ: i * SEGMENT_LENGTH });
    }
  }
  buildRoad();
  function initStars() {
    state.stars = [];
    for (let i = 0; i < 120; i++) {
      state.stars.push({
        x: Math.random(), y: Math.random() * 0.55,
        s: Math.random() * 1.8 + 0.3, tw: Math.random() * Math.PI * 2,
        c: Math.random() > 0.7 ? COLORS.sun2 : '#fff',
      });
    }
    state.mountains = [];
    for (let i = 0; i < 16; i++) {
      state.mountains.push({
        x: Math.random(), w: 0.12 + Math.random() * 0.22,
        h: 0.08 + Math.random() * 0.18, layer: Math.floor(Math.random() * 3),
      });
    }
  }
  initStars();
  function spawnEnemy() {
    const laneIdx = Math.floor(Math.random() * 3) - 1;
    const colors = [COLORS.enemy1, COLORS.enemy2, COLORS.enemy3];
    const c = colors[Math.floor(Math.random() * colors.length)];
    state.enemies.push({
      z: state.distance + 3200 + Math.random() * 800,
      x: laneIdx * 0.65, lane: laneIdx, color: c,
      speed: 0.15 + Math.random() * 0.08,
      type: Math.random() < 0.3 ? 'truck' : 'car', hit: false,
    });
  }
  function spawnItem() {
    const laneIdx = Math.floor(Math.random() * 3) - 1;
    state.items.push({
      z: state.distance + 2800 + Math.random() * 600,
      x: laneIdx * 0.65, lane: laneIdx,
      type: Math.random() < 0.25 ? 'boost' : 'coin',
      collected: false, rot: 0,
    });
  }
  function addParticles(x, y, count, color, opts = {}) {
    for (let i = 0; i < count; i++) {
      state.particles.push({
        x: x + (Math.random() - 0.5) * (opts.spread || 10),
        y: y + (Math.random() - 0.5) * (opts.spread || 10),
        vx: (Math.random() - 0.5) * (opts.vx || 8),
        vy: (Math.random() - 0.5) * (opts.vy || 8) - (opts.lift || 0),
        life: 1, decay: 0.015 + Math.random() * 0.025,
        size: (opts.size || 4) * (0.5 + Math.random()),
        color: color || COLORS.playerBody, gravity: opts.gravity || 0,
      });
    }
  }
  const input = { left: 0, right: 0 };
  function setupTouch() {
    const g = document.getElementById('game');
    g.addEventListener('touchstart', (e) => {
      if (!state.playing) return;
      if (e.target.closest('#boostBtn')) return;
      state.touchActive = true;
      state.touchStartX = e.touches[0].clientX;
      state.touchCurrentX = e.touches[0].clientX;
      e.preventDefault();
    }, { passive: false });
    g.addEventListener('touchmove', (e) => {
      if (!state.touchActive) return;
      state.touchCurrentX = e.touches[0].clientX;
      e.preventDefault();
    }, { passive: false });
    g.addEventListener('touchend', () => { state.touchActive = false; });
    g.addEventListener('touchcancel', () => { state.touchActive = false; });
    let mouseDown = false;
    g.addEventListener('mousedown', (e) => {
      if (!state.playing) return;
      if (e.target.closest('#boostBtn') || e.target.closest('.overlay')) return;
      mouseDown = true; state.touchActive = true;
      state.touchStartX = e.clientX; state.touchCurrentX = e.clientX;
    });
    g.addEventListener('mousemove', (e) => {
      if (!mouseDown) return;
      state.touchCurrentX = e.clientX;
    });
    window.addEventListener('mouseup', () => { mouseDown = false; state.touchActive = false; });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') input.left = 1;
      if (e.key === 'ArrowRight' || e.key === 'd') input.right = 1;
      if (e.key === 'Shift' || e.key === ' ') { state.boosting = true; e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') input.left = 0;
      if (e.key === 'ArrowRight' || e.key === 'd') input.right = 0;
      if (e.key === 'Shift' || e.key === ' ') state.boosting = false;
    });
    const boostBtn = document.getElementById('boostBtn');
    const startBoost = (e) => { state.boosting = true; e.preventDefault(); };
    const endBoost = () => { state.boosting = false; };
    boostBtn.addEventListener('touchstart', startBoost, { passive: false });
    boostBtn.addEventListener('touchend', endBoost);
    boostBtn.addEventListener('touchcancel', endBoost);
    boostBtn.addEventListener('mousedown', startBoost);
    boostBtn.addEventListener('mouseup', endBoost);
    boostBtn.addEventListener('mouseleave', endBoost);
  }
  setupTouch();
  const tiltToggle = document.getElementById('tiltToggle');
  tiltToggle.addEventListener('click', async () => {
    if (!state.tiltEnabled) {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
          const perm = await DeviceOrientationEvent.requestPermission();
          if (perm !== 'granted') return;
        } catch (e) { return; }
      }
      state.tiltEnabled = true;
      tiltToggle.textContent = 'TILT CONTROLS: ON';
      tiltToggle.classList.add('active');
      window.addEventListener('deviceorientation', (e) => { state.tiltGamma = e.gamma || 0; });
    } else {
      state.tiltEnabled = false;
      tiltToggle.textContent = 'TILT CONTROLS: OFF';
      tiltToggle.classList.remove('active');
    }
  });
  const startScreen = document.getElementById('startScreen');
  const overScreen = document.getElementById('overScreen');
  const countdownEl = document.getElementById('countdown');
  document.getElementById('hiScoreVal').textContent = state.hiScore.toLocaleString();
  document.getElementById('startBtn').addEventListener('click', () => {
    startScreen.classList.add('hidden');
    startCountdown();
  });
  document.getElementById('retryBtn').addEventListener('click', () => {
    overScreen.classList.add('hidden');
    resetGame(); startCountdown();
  });
  document.getElementById('menuBtn').addEventListener('click', () => {
    overScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    resetGame();
  });
  function resetGame() {
    state.score = 0; state.speed = 0; state.maxSpeed = 0;
    state.targetSpeed = state.baseSpeed;
    state.playerX = 0; state.playerVX = 0; state.boost = 100;
    state.enemies = []; state.items = []; state.particles = [];
    state.combo = 0; state.bestCombo = 0; state.comboTimer = 0;
    state.distance = 0; state.spawnTimer = 0.5; state.itemTimer = 2;
    state.cameraShake = 0; state.playing = false;
  }
  function startCountdown() {
    resetGame(); state.running = true;
    const show = (txt) => {
      countdownEl.textContent = txt;
      countdownEl.classList.remove('show');
      void countdownEl.offsetWidth;
      countdownEl.classList.add('show');
    };
    show('3');
    setTimeout(() => show('2'), 900);
    setTimeout(() => show('1'), 1800);
    setTimeout(() => { show('GO!'); state.playing = true; }, 2700);
  }
  function gameOver() {
    state.playing = false;
    document.getElementById('flash').classList.remove('show');
    void document.getElementById('flash').offsetWidth;
    document.getElementById('flash').classList.add('show');
    if (state.score > state.hiScore) {
      state.hiScore = state.score;
      localStorage.setItem('neonDrift_hi', state.hiScore);
    }
    document.getElementById('hiScoreVal').textContent = state.hiScore.toLocaleString();
    document.getElementById('finalScore').textContent = state.score.toLocaleString();
    document.getElementById('finalSpeed').textContent = Math.round(state.maxSpeed * 400);
    document.getElementById('finalCombo').textContent = '\u00d7' + state.bestCombo;
    document.getElementById('finalHi').textContent = state.hiScore.toLocaleString();
    setTimeout(() => { overScreen.classList.remove('hidden'); }, 900);
  }
  const comboEl = document.getElementById('combo');
  function showCombo(txt) {
    comboEl.textContent = txt;
    comboEl.classList.remove('show');
    void comboEl.offsetWidth;
    comboEl.classList.add('show');
  }
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now; state.dt = dt; state.t += dt;
    if (state.running) update(dt);
    render();
    requestAnimationFrame(loop);
  }
  function update(dt) {
    let steerInput = 0;
    if (state.touchActive) {
      const delta = (state.touchCurrentX - state.touchStartX) / (W * 0.25);
      steerInput = Math.max(-1, Math.min(1, delta));
    } else if (state.tiltEnabled) {
      steerInput = Math.max(-1, Math.min(1, state.tiltGamma / 25));
    } else {
      steerInput = (input.right - input.left);
    }
    if (state.playing) {
      if (state.boosting && state.boost > 0) {
        state.boostActive = true;
        state.boost = Math.max(0, state.boost - dt * 35);
        state.targetSpeed = state.baseSpeed * 1.8;
      } else {
        state.boostActive = false;
        state.boost = Math.min(100, state.boost + dt * 12);
        const progress = Math.min(1, state.distance / 80000);
        state.targetSpeed = state.baseSpeed * (1 + progress * 0.6);
      }
      state.speed += (state.targetSpeed - state.speed) * dt * 3;
      if (state.speed > state.maxSpeed) state.maxSpeed = state.speed;
      const steerStrength = 2.8;
      state.playerVX += steerInput * steerStrength * dt;
      state.playerVX -= state.curve * state.speed * 0.9 * dt;
      state.playerVX *= Math.pow(0.001, dt);
      state.playerX += state.playerVX * dt;
      if (state.playerX > 1.3) { state.playerX = 1.3; state.playerVX = 0; offRoad(); }
      if (state.playerX < -1.3) { state.playerX = -1.3; state.playerVX = 0; offRoad(); }
      state.distance += state.speed * 60 * dt * 16;
      state.score = Math.floor(state.distance / 10);
      const segIndex = Math.floor(state.distance / SEGMENT_LENGTH) % segments.length;
      state.curve = segments[segIndex].curve;
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        spawnEnemy();
        const difficulty = Math.min(1, state.distance / 60000);
        state.spawnTimer = 1.6 - difficulty * 0.9 + Math.random() * 0.4;
      }
      state.itemTimer -= dt;
      if (state.itemTimer <= 0) {
        spawnItem();
        state.itemTimer = 2.5 + Math.random() * 2;
      }
      for (let i = state.enemies.length - 1; i >= 0; i--) {
        const e = state.enemies[i];
        e.z -= e.speed * 60 * dt * 16;
        const rel = e.z - state.distance;
        if (rel < -800) {
          state.enemies.splice(i, 1);
          if (!e.hit) {
            state.combo++;
            state.comboTimer = 2.5;
            if (state.combo > state.bestCombo) state.bestCombo = state.combo;
            if (state.combo > 1 && state.combo % 3 === 0) {
              showCombo('\u00d7' + state.combo + ' COMBO!');
            }
            state.score += 50 * state.combo;
          }
          continue;
        }
        if (!e.hit && rel > -150 && rel < 250) {
          const dx = Math.abs(state.playerX - e.x);
          if (dx < 0.38) { e.hit = true; crash(); }
        }
      }
      for (let i = state.items.length - 1; i >= 0; i--) {
        const it = state.items[i];
        const rel = it.z - state.distance;
        it.rot += dt * 4;
        if (rel < -400) { state.items.splice(i, 1); continue; }
        if (!it.collected && rel > -150 && rel < 250) {
          const dx = Math.abs(state.playerX - it.x);
          if (dx < 0.35) {
            it.collected = true;
            if (it.type === 'coin') {
              state.score += 100;
              addParticles(W / 2, H * 0.7, 24, COLORS.sun1, { spread: 30, vx: 12, vy: 12, size: 6, gravity: 200 });
            } else {
              state.boost = Math.min(100, state.boost + 40);
              addParticles(W / 2, H * 0.7, 30, COLORS.enemy1, { spread: 40, vx: 16, vy: 16, size: 7 });
              showCombo('+BOOST');
            }
            state.items.splice(i, 1);
          }
        }
      }
      if (state.comboTimer > 0) {
        state.comboTimer -= dt;
        if (state.comboTimer <= 0) state.combo = 0;
      }
    }
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.x += p.vx; p.y += p.vy;
      p.vy += p.gravity * dt;
      p.vx *= 0.96; p.vy *= 0.96;
      p.life -= p.decay;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
    state.cameraShake *= Math.pow(0.001, dt);
    state.roadOffset = (state.roadOffset + state.speed * 16 * dt * 60) % SEGMENT_LENGTH;
    const speedKmh = Math.round(state.speed * 400);
    document.getElementById('speedVal').innerHTML = speedKmh + '<span class="unit">KM/H</span>';
    document.getElementById('scoreVal').textContent = state.score.toLocaleString();
    document.getElementById('speedFill').style.height = Math.min(100, speedKmh / 4) + '%';
    const boostArc = document.getElementById('boostArc');
    const boostBtn = document.getElementById('boostBtn');
    boostArc.style.strokeDashoffset = 289 * (1 - state.boost / 100);
    if (state.boost < 5) boostBtn.classList.add('empty');
    else boostBtn.classList.remove('empty');
  }
  function crash() {
    addParticles(W / 2, H * 0.7, 60, COLORS.enemy1, { spread: 60, vx: 20, vy: 20, size: 8, lift: 5 });
    addParticles(W / 2, H * 0.7, 40, COLORS.sun1, { spread: 60, vx: 15, vy: 15, size: 6 });
    state.cameraShake = 20; state.combo = 0;
    if (navigator.vibrate) navigator.vibrate([80, 40, 120]);
    gameOver();
  }
  function offRoad() {
    if (state.t - (state.lastOffRoad || 0) > 0.3) {
      addParticles(W / 2 + (state.playerX > 0 ? 120 : -120), H * 0.78, 8, '#ff4db2', { spread: 20, vx: 6, vy: 4, size: 4, gravity: 60 });
      state.lastOffRoad = state.t;
      state.cameraShake = 3;
    }
  }
  function render() {
    ctx.save();
    if (state.cameraShake > 0.5) {
      ctx.translate((Math.random() - 0.5) * state.cameraShake, (Math.random() - 0.5) * state.cameraShake);
    }
    const horizon = H * 0.55;
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#05020f');
    sky.addColorStop(0.4, '#0a0420');
    sky.addColorStop(0.7, '#1a0838');
    sky.addColorStop(1, '#3d0a5a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, horizon);
    for (const s of state.stars) {
      const tw = Math.sin(state.t * 2 + s.tw) * 0.4 + 0.6;
      ctx.fillStyle = s.c;
      ctx.globalAlpha = tw * 0.9;
      ctx.fillRect(s.x * W, s.y * horizon, s.s, s.s);
    }
    ctx.globalAlpha = 1;
    const sunX = W / 2 - state.curve * W * 0.6;
    const sunY = horizon - H * 0.18;
    const sunR = H * 0.12;
    const sunGrad = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
    sunGrad.addColorStop(0, COLORS.sun1);
    sunGrad.addColorStop(0.5, COLORS.sun2);
    sunGrad.addColorStop(1, COLORS.sun3);
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#05020f';
    for (let i = 0; i < 6; i++) {
      const stripeY = sunY + (i * 3.5) + i * 2;
      if (stripeY > sunY + 2) {
        const stripeH = 2 + i * 0.4;
        ctx.fillRect(sunX - sunR * 1.2, stripeY, sunR * 2.4, stripeH);
      }
    }
    const glow = ctx.createRadialGradient(sunX, sunY, sunR * 0.8, sunX, sunY, sunR * 3);
    glow.addColorStop(0, 'rgba(255, 77, 178, 0.35)');
    glow.addColorStop(1, 'rgba(255, 77, 178, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 3, 0, Math.PI * 2);
    ctx.fill();
    for (let layer = 2; layer >= 0; layer--) {
      const layerMts = state.mountains.filter(m => m.layer === layer);
      const parallax = (layer + 1) * 0.05;
      const offset = (state.distance * parallax * 0.0008) % 1;
      ctx.fillStyle = layer === 0 ? '#1e0a4a' : layer === 1 ? '#2a0e5e' : '#3d1470';
      ctx.globalAlpha = 0.6 + layer * 0.15;
      ctx.beginPath();
      ctx.moveTo(0, horizon);
      for (const m of layerMts) {
        const mx = ((m.x - offset + state.curve * parallax * 2) % 1 + 1) % 1;
        const px = mx * W;
        const mh = m.h * H * (0.6 + layer * 0.2);
        ctx.lineTo(px - m.w * W * 0.5, horizon);
        ctx.lineTo(px, horizon - mh);
        ctx.lineTo(px + m.w * W * 0.5, horizon);
      }
      ctx.lineTo(W, horizon);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const horizonGrad = ctx.createLinearGradient(0, horizon - 2, 0, horizon + 4);
    horizonGrad.addColorStop(0, 'rgba(255, 77, 178, 0)');
    horizonGrad.addColorStop(0.5, '#ff4db2');
    horizonGrad.addColorStop(1, 'rgba(255, 77, 178, 0)');
    ctx.fillStyle = horizonGrad;
    ctx.fillRect(0, horizon - 2, W, 6);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, horizon - 0.5, W, 1);
    drawGroundGrid(horizon);
    drawRoad(horizon);
    drawObjects(horizon);
    const fog = ctx.createLinearGradient(0, horizon - 20, 0, horizon + 60);
    fog.addColorStop(0, 'rgba(255, 77, 178, 0)');
    fog.addColorStop(0.3, 'rgba(255, 77, 178, 0.15)');
    fog.addColorStop(1, 'rgba(255, 77, 178, 0)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, horizon - 20, W, 80);
    if (state.boostActive) {
      ctx.strokeStyle = 'rgba(255, 235, 77, 0.6)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 14; i++) {
        const y = Math.random() * H;
        const len = 30 + Math.random() * 80;
        const x = Math.random() < 0.5 ? Math.random() * W * 0.3 : W - Math.random() * W * 0.3;
        ctx.globalAlpha = Math.random() * 0.7;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + len);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    for (const p of state.particles) {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 12;
      ctx.shadowColor = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.04;
    ctx.fillStyle = '#000';
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  function drawGroundGrid(horizon) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    const gridSpacing = 40;
    const offsetY = state.roadOffset * 0.8;
    for (let i = 1; i < 30; i++) {
      const d = i * gridSpacing + offsetY;
      const scale = CAMERA_DEPTH / d;
      const y = horizon + scale * 400;
      if (y > H) break;
      const alpha = Math.max(0, 1 - (i / 25));
      ctx.globalAlpha = alpha * 0.5;
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.35;
    const vp = W / 2 - state.curve * W * 0.4;
    for (let i = -8; i <= 8; i++) {
      if (i === 0) continue;
      const startX = W / 2 + i * (W / 6);
      ctx.beginPath();
      ctx.moveTo(startX, H);
      ctx.lineTo(vp + i * 12, horizon);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function drawRoad(horizon) {
    const cameraZ = state.distance;
    const playerSegIdx = Math.floor(cameraZ / SEGMENT_LENGTH);
    let dx = 0, x = 0, maxY = H;
    for (let n = 0; n < DRAW_DISTANCE; n++) {
      const segIdx = (playerSegIdx + n) % segments.length;
      const seg = segments[segIdx];
      const nextSeg = segments[(segIdx + 1) % segments.length];
      const z1 = seg.worldZ - cameraZ;
      const z2 = nextSeg.worldZ - cameraZ;
      if (z1 < 1 && z2 < 1) continue;
      const scale1 = CAMERA_DEPTH / Math.max(1, z1);
      const scale2 = CAMERA_DEPTH / Math.max(1, z2);
      const y1 = H / 2 - scale1 * (-800) * H / 2;
      const y2 = H / 2 - scale2 * (-800) * H / 2;
      const clampedY1 = Math.min(H, Math.max(horizon, y1));
      const clampedY2 = Math.min(H, Math.max(horizon, y2));
      if (clampedY2 >= maxY) continue;
      const roadW1 = scale1 * ROAD_WIDTH * 0.4;
      const roadW2 = scale2 * ROAD_WIDTH * 0.4;
      x += dx; dx += seg.curve;
      const cx1 = W / 2 + (x - state.playerX * 200) * scale1 * W * 0.5 / CAMERA_DEPTH;
      const cx2 = W / 2 + (x + dx - state.playerX * 200) * scale2 * W * 0.5 / CAMERA_DEPTH;
      const grassColor = (segIdx % 2 === 0) ? '#0d0620' : '#14082f';
      ctx.fillStyle = grassColor;
      ctx.fillRect(0, clampedY2, W, clampedY1 - clampedY2 + 1);
      const edgeColor1 = (segIdx % 2 === 0) ? COLORS.roadEdge : '#ff4db2';
      const edgeColor2 = (segIdx % 2 === 0) ? '#ff4db2' : COLORS.roadEdge;
      ctx.fillStyle = edgeColor1;
      ctx.beginPath();
      ctx.moveTo(cx1 - roadW1 - 14, clampedY1);
      ctx.lineTo(cx1 - roadW1, clampedY1);
      ctx.lineTo(cx2 - roadW2, clampedY2);
      ctx.lineTo(cx2 - roadW2 - 6, clampedY2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = edgeColor2;
      ctx.beginPath();
      ctx.moveTo(cx1 + roadW1, clampedY1);
      ctx.lineTo(cx1 + roadW1 + 14, clampedY1);
      ctx.lineTo(cx2 + roadW2 + 6, clampedY2);
      ctx.lineTo(cx2 + roadW2, clampedY2);
      ctx.closePath();
      ctx.fill();
      const roadShade = (segIdx % 2 === 0) ? '#1a0838' : '#150630';
      ctx.fillStyle = roadShade;
      ctx.beginPath();
      ctx.moveTo(cx1 - roadW1, clampedY1);
      ctx.lineTo(cx1 + roadW1, clampedY1);
      ctx.lineTo(cx2 + roadW2, clampedY2);
      ctx.lineTo(cx2 - roadW2, clampedY2);
      ctx.closePath();
      ctx.fill();
      if (segIdx % 3 === 0) {
        ctx.fillStyle = '#fff';
        ctx.globalAlpha = 0.85;
        const laneW1 = roadW1 * 0.03;
        const laneW2 = roadW2 * 0.03;
        for (const offset of [-0.33, 0.33]) {
          ctx.beginPath();
          ctx.moveTo(cx1 + offset * roadW1 * 2 - laneW1, clampedY1);
          ctx.lineTo(cx1 + offset * roadW1 * 2 + laneW1, clampedY1);
          ctx.lineTo(cx2 + offset * roadW2 * 2 + laneW2, clampedY2);
          ctx.lineTo(cx2 + offset * roadW2 * 2 - laneW2, clampedY2);
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      maxY = clampedY2;
      if (clampedY2 <= horizon) break;
    }
    ctx.shadowBlur = 12;
    ctx.shadowColor = COLORS.roadEdge;
    ctx.strokeStyle = 'rgba(54, 214, 181, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 10, horizon);
    ctx.lineTo(0, H);
    ctx.moveTo(W / 2 + 10, horizon);
    ctx.lineTo(W, H);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  function drawObjects(horizon) {
    const cameraZ = state.distance;
    const playerSegIdx = Math.floor(cameraZ / SEGMENT_LENGTH);
    const drawables = [];
    for (const e of state.enemies) {
      const z = e.z - cameraZ;
      if (z > 1 && z < DRAW_DISTANCE * SEGMENT_LENGTH) drawables.push({ type: 'enemy', z, obj: e });
    }
    for (const it of state.items) {
      const z = it.z - cameraZ;
      if (z > 1 && z < DRAW_DISTANCE * SEGMENT_LENGTH) drawables.push({ type: 'item', z, obj: it });
    }
    drawables.push({ type: 'player', z: 0, obj: null });
    drawables.sort((a, b) => b.z - a.z);
    function projectObject(worldZ, worldX) {
      let x = 0, dx = 0;
      const segs = Math.floor(worldZ / SEGMENT_LENGTH);
      for (let n = 0; n < segs && n < DRAW_DISTANCE; n++) {
        const segIdx = (playerSegIdx + n) % segments.length;
        x += dx; dx += segments[segIdx].curve;
      }
      const scale = CAMERA_DEPTH / Math.max(1, worldZ);
      const screenX = W / 2 + (x + worldX * 200 - state.playerX * 200) * scale * W * 0.5 / CAMERA_DEPTH;
      const screenY = H / 2 - scale * (-800) * H / 2;
      const sizeScale = scale * W * 0.5;
      return { x: screenX, y: Math.min(H, screenY), scale: sizeScale };
    }
    for (const d of drawables) {
      if (d.type === 'player') drawPlayer();
      else if (d.type === 'enemy') {
        const p = projectObject(d.z, d.obj.x);
        drawEnemy(p.x, p.y, p.scale, d.obj);
      } else if (d.type === 'item') {
        const p = projectObject(d.z, d.obj.x);
        drawItem(p.x, p.y, p.scale, d.obj);
      }
    }
  }
  function drawPlayer() {
    const px = W / 2 + state.playerX * 80;
    const py = H - H * 0.22;
    const bob = Math.sin(state.t * 18) * (state.boostActive ? 2.5 : 1);
    const tilt = state.playerVX * 0.06;
    const scale = W < 500 ? 0.85 : 1;
    ctx.save();
    ctx.translate(px, py + bob);
    ctx.rotate(tilt);
    ctx.scale(scale, scale);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(0, 34, 48, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    const underglow = ctx.createRadialGradient(0, 32, 0, 0, 32, 70);
    const glowColor = state.boostActive ? COLORS.sun1 : COLORS.playerBody;
    underglow.addColorStop(0, glowColor + 'dd');
    underglow.addColorStop(0.5, glowColor + '44');
    underglow.addColorStop(1, glowColor + '00');
    ctx.fillStyle = underglow;
    ctx.fillRect(-70, 10, 140, 70);
    if (state.boostActive) {
      const flameLen = 20 + Math.random() * 8;
      ctx.fillStyle = COLORS.sun1;
      ctx.shadowBlur = 20;
      ctx.shadowColor = COLORS.sun1;
      ctx.beginPath();
      ctx.moveTo(-20, 28); ctx.lineTo(-12, 28 + flameLen); ctx.lineTo(-4, 28);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(4, 28); ctx.lineTo(12, 28 + flameLen); ctx.lineTo(20, 28);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(-16, 28); ctx.lineTo(-12, 28 + flameLen * 0.6); ctx.lineTo(-8, 28);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(8, 28); ctx.lineTo(12, 28 + flameLen * 0.6); ctx.lineTo(16, 28);
      ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
    }
    const bodyGrad = ctx.createLinearGradient(0, -30, 0, 30);
    bodyGrad.addColorStop(0, '#0a1a2e');
    bodyGrad.addColorStop(0.5, COLORS.playerBody);
    bodyGrad.addColorStop(1, '#0a1a2e');
    ctx.shadowBlur = 16;
    ctx.shadowColor = COLORS.playerBody;
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(0, -36);
    ctx.lineTo(-14, -20);
    ctx.lineTo(-26, 8);
    ctx.lineTo(-30, 20);
    ctx.lineTo(-22, 30);
    ctx.lineTo(22, 30);
    ctx.lineTo(30, 20);
    ctx.lineTo(26, 8);
    ctx.lineTo(14, -20);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#4dffd9';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#4dffd9';
    ctx.beginPath();
    ctx.moveTo(-26, 8); ctx.lineTo(-30, 20); ctx.lineTo(-22, 30);
    ctx.moveTo(22, 30); ctx.lineTo(30, 20); ctx.lineTo(26, 8);
    ctx.stroke();
    ctx.shadowBlur = 0;
    const cockpit = ctx.createLinearGradient(0, -26, 0, 6);
    cockpit.addColorStop(0, '#ff4db2');
    cockpit.addColorStop(0.5, '#9d4dff');
    cockpit.addColorStop(1, '#1a0838');
    ctx.fillStyle = cockpit;
    ctx.beginPath();
    ctx.moveTo(0, -28); ctx.lineTo(-10, -12);
    ctx.lineTo(-14, 8); ctx.lineTo(14, 8);
    ctx.lineTo(10, -12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.moveTo(-4, -22); ctx.lineTo(-8, -8);
    ctx.lineTo(4, -8); ctx.lineTo(0, -22);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ff4db2';
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#ff4db2';
    ctx.fillRect(-1.5, -30, 3, 18);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ff4db2';
    ctx.shadowBlur = 14;
    ctx.shadowColor = '#ff4db2';
    ctx.fillRect(-26, 24, 8, 4);
    ctx.fillRect(18, 24, 8, 4);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#fff';
    ctx.fillRect(-10, -34, 4, 3);
    ctx.fillRect(6, -34, 4, 3);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-20, 12); ctx.lineTo(-16, 18);
    ctx.moveTo(-20, 16); ctx.lineTo(-16, 22);
    ctx.moveTo(20, 12); ctx.lineTo(16, 18);
    ctx.moveTo(20, 16); ctx.lineTo(16, 22);
    ctx.stroke();
    ctx.restore();
  }
  function drawEnemy(px, py, scale, e) {
    if (px < -100 || px > W + 100 || py > H + 50) return;
    const s = Math.min(1, scale * 0.015);
    if (s < 0.05) return;
    const w = 52 * s;
    const h = 66 * s;
    const yOffset = py - h * 0.3;
    ctx.save();
    ctx.translate(px, yOffset);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.ellipse(0, h * 0.5, w * 0.9, h * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    if (s > 0.2) {
      const under = ctx.createRadialGradient(0, h * 0.4, 0, 0, h * 0.4, w * 1.3);
      under.addColorStop(0, e.color + 'bb');
      under.addColorStop(1, e.color + '00');
      ctx.fillStyle = under;
      ctx.fillRect(-w * 1.4, -h * 0.2, w * 2.8, h * 1.2);
    }
    ctx.shadowBlur = s > 0.3 ? 12 : 6;
    ctx.shadowColor = e.color;
    const body = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    body.addColorStop(0, '#0a0420');
    body.addColorStop(0.5, e.color);
    body.addColorStop(1, '#0a0420');
    ctx.fillStyle = body;
    if (e.type === 'truck') {
      ctx.fillRect(-w * 0.55, -h * 0.5, w * 1.1, h);
    } else {
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.5);
      ctx.lineTo(-w * 0.4, -h * 0.2);
      ctx.lineTo(-w * 0.5, h * 0.3);
      ctx.lineTo(-w * 0.4, h * 0.5);
      ctx.lineTo(w * 0.4, h * 0.5);
      ctx.lineTo(w * 0.5, h * 0.3);
      ctx.lineTo(w * 0.4, -h * 0.2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    if (s > 0.15) {
      ctx.fillStyle = '#fff';
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#fff';
      ctx.fillRect(-w * 0.35, -h * 0.52, w * 0.18, 3);
      ctx.fillRect(w * 0.18, -h * 0.52, w * 0.18, 3);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(77, 255, 217, 0.35)';
      ctx.beginPath();
      ctx.moveTo(-w * 0.3, -h * 0.15);
      ctx.lineTo(w * 0.3, -h * 0.15);
      ctx.lineTo(w * 0.25, h * 0.1);
      ctx.lineTo(-w * 0.25, h * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 6;
      ctx.shadowColor = e.color;
      ctx.beginPath();
      ctx.moveTo(-w * 0.5, h * 0.3);
      ctx.lineTo(w * 0.5, h * 0.3);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }
  function drawItem(px, py, scale, it) {
    if (px < -50 || px > W + 50) return;
    const s = Math.min(1, scale * 0.012);
    if (s < 0.04) return;
    const size = 22 * s;
    ctx.save();
    ctx.translate(px, py - size);
    if (it.type === 'coin') {
      const squish = Math.abs(Math.cos(it.rot));
      ctx.fillStyle = COLORS.sun1;
      ctx.shadowBlur = 20 * s;
      ctx.shadowColor = COLORS.sun1;
      ctx.beginPath();
      ctx.ellipse(0, 0, size, size * (0.2 + squish * 0.8), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.6, size * (0.1 + squish * 0.5), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    } else {
      ctx.shadowBlur = 20 * s;
      ctx.shadowColor = COLORS.enemy1;
      ctx.fillStyle = COLORS.enemy1;
      const hover = Math.sin(it.rot * 2) * 3 * s;
      ctx.translate(0, hover);
      ctx.beginPath();
      ctx.moveTo(-size * 0.3, -size);
      ctx.lineTo(size * 0.3, -size * 0.2);
      ctx.lineTo(-size * 0.1, -size * 0.2);
      ctx.lineTo(size * 0.3, size);
      ctx.lineTo(-size * 0.1, size * 0.2);
      ctx.lineTo(-size * 0.3, size * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(-size * 0.15, -size * 0.7);
      ctx.lineTo(size * 0.15, -size * 0.15);
      ctx.lineTo(0, -size * 0.15);
      ctx.lineTo(size * 0.15, size * 0.7);
      ctx.lineTo(0, size * 0.15);
      ctx.lineTo(-size * 0.15, size * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  requestAnimationFrame(loop);
  document.body.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });
})();