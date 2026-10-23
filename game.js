/* =====================================================================
 *  坦克大战 · Tank Battle
 *  纯 HTML5 Canvas 实现，零外部依赖。
 *  方向键 / WASD 移动 · 空格 / J 开火 · P 暂停 · M 静音
 * ===================================================================== */
(() => {
  'use strict';

  /* ------------------------------- 常量 ------------------------------- */

  const TILE = 32;
  const COLS = 13;
  const ROWS = 13;
  const W = TILE * COLS;
  const H = TILE * ROWS;
  const TANK_SIZE = 28;
  const TAU = Math.PI * 2;
  const DPR = Math.min(2, window.devicePixelRatio || 1);

  const DIRS = {
    up: { x: 0, y: -1, a: 0 },
    right: { x: 1, y: 0, a: Math.PI / 2 },
    down: { x: 0, y: 1, a: Math.PI },
    left: { x: -1, y: 0, a: -Math.PI / 2 },
  };
  const DIR_NAMES = ['up', 'right', 'down', 'left'];

  const T = { EMPTY: 0, BRICK: 1, STEEL: 2, WATER: 3, TREE: 4, BASE: 5 };
  const CHAR_TILE = {
    '.': T.EMPTY,
    '#': T.BRICK,
    '@': T.STEEL,
    '~': T.WATER,
    'T': T.TREE,
    'B': T.BASE,
  };
  const SOLID = new Set([T.BRICK, T.STEEL, T.WATER, T.BASE]);

  const PLAYER_SPAWN = { col: 4, row: 12 };
  const ENEMY_SPAWNS = [
    { col: 0, row: 0 },
    { col: 6, row: 0 },
    { col: 12, row: 0 },
  ];

  const ENEMY_TYPES = {
    basic: { speed: 52, hp: 1, score: 100, color: '#c3c9d0', accent: '#5b646f', bulletSpeed: 175, shootDelay: 1.15 },
    fast: { speed: 92, hp: 1, score: 200, color: '#8fd3ff', accent: '#2c6c94', bulletSpeed: 190, shootDelay: 1.2 },
    power: { speed: 58, hp: 1, score: 300, color: '#f2b25c', accent: '#8a4a12', bulletSpeed: 255, shootDelay: 0.85 },
    armor: { speed: 46, hp: 3, score: 400, color: '#e0705a', accent: '#6e2015', bulletSpeed: 205, shootDelay: 1.0 },
  };

  const POWER_TYPES = ['star', 'heart', 'bomb', 'clock', 'shield'];
  const POWER_COLORS = {
    star: '#ffd54f',
    heart: '#ef5350',
    bomb: '#cfd8dc',
    clock: '#4fc3f7',
    shield: '#8f9dff',
  };

  /* ------------------------------- 地图 -------------------------------
   *  . 空地   # 砖墙   @ 钢墙   ~ 水面   T 树林   B 基地
   *  基地固定位于第 11-12 行、第 6-7 列，四周有砖墙保护。
   * ------------------------------------------------------------------ */

  const MAPS = [
    [
      '.............',
      '.##.##.##.##.',
      '.##.##.##.##.',
      '.............',
      '.##.......##.',
      '.##..@@@..##.',
      '....~@@@~....',
      '.##..@@@..##.',
      '.##.......##.',
      '.............',
      '.....####....',
      '.....#BB#....',
      '.....#BB#....',
    ],
    [
      '.............',
      '.#.#.#.#.#.#.',
      '.#.#.#.#.#.#.',
      '.............',
      '~~.##...##.~~',
      '~~.##...##.~~',
      '.............',
      '.TT.......TT.',
      '.TT.......TT.',
      '.............',
      '.....####....',
      '.....#BB#....',
      '.....#BB#....',
    ],
    [
      '.............',
      '..@@.....@@..',
      '..@@.....@@..',
      '..@@.....@@..',
      '....##.##....',
      '..@.##.##.@..',
      '..@.......@..',
      '..@.##.##.@..',
      '....##.##....',
      '.............',
      '.....####....',
      '.....#BB#....',
      '.....#BB#....',
    ],
    [
      '.............',
      '....@@.@@....',
      '.BB.@@.@@.BB.',
      '.BB.......BB.',
      '.BB.#####.BB.',
      '....#...#....',
      '.~~.#...#.~~.',
      '....#...#....',
      '.BB.#####.BB.',
      '.BB.......BB.',
      '.....####....',
      '.....#BB#....',
      '.....#BB#....',
    ],
  ];

  MAPS.forEach((rows, i) => {
    if (rows.length !== ROWS) throw new Error('地图 ' + i + ' 行数不正确');
    rows.forEach((r) => {
      if (r.length !== COLS) throw new Error('地图 ' + i + ' 列数不正确: ' + r);
    });
  });

  /* ------------------------------- DOM -------------------------------- */

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const ovTitle = document.getElementById('ov-title');
  const ovSub = document.getElementById('ov-sub');
  const ovBtn = document.getElementById('ov-btn');
  const hudScore = document.getElementById('hud-score');
  const hudLevel = document.getElementById('hud-level');
  const hudLives = document.getElementById('hud-lives');
  const hudPower = document.getElementById('hud-power');
  const hudEnemies = document.getElementById('hud-enemies');
  const hudHigh = document.getElementById('hud-high');
  const btnMute = document.getElementById('btn-mute');
  const btnRestart = document.getElementById('btn-restart');

  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  /* ------------------------------- 音效 ------------------------------- */

  const Sound = (() => {
    let ac = null;
    let muted = false;

    function ensure() {
      if (muted) return null;
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try { ac = new AC(); } catch (e) { return null; }
      }
      if (ac.state === 'suspended') ac.resume();
      return ac;
    }

    function beep(opts) {
      const a = ensure();
      if (!a) return;
      const { freq = 440, to = null, dur = 0.1, type = 'square', vol = 0.05, delay = 0 } = opts;
      const t0 = a.currentTime + delay;
      const osc = a.createOscillator();
      const gain = a.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(a.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    }

    function noise(dur = 0.3, vol = 0.1, delay = 0) {
      const a = ensure();
      if (!a) return;
      const len = Math.max(1, Math.floor(a.sampleRate * dur));
      const buf = a.createBuffer(1, len, a.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      }
      const src = a.createBufferSource();
      src.buffer = buf;
      const filter = a.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 850;
      const gain = a.createGain();
      gain.gain.value = vol;
      src.connect(filter).connect(gain).connect(a.destination);
      src.start(a.currentTime + delay);
    }

    return {
      init: ensure,
      isMuted: () => muted,
      toggle() { muted = !muted; return muted; },
      shoot(side) {
        beep({ freq: side === 'player' ? 660 : 380, to: 170, dur: 0.07, type: 'square', vol: 0.035 });
      },
      brick() { beep({ freq: 210, to: 110, dur: 0.06, type: 'triangle', vol: 0.04 }); },
      steel() { beep({ freq: 950, to: 520, dur: 0.05, type: 'sawtooth', vol: 0.025 }); },
      hit() { beep({ freq: 190, to: 80, dur: 0.08, type: 'square', vol: 0.05 }); },
      explode(big) {
        noise(big ? 0.5 : 0.26, big ? 0.16 : 0.09);
        beep({ freq: big ? 95 : 150, to: 32, dur: big ? 0.42 : 0.22, type: 'sine', vol: 0.1 });
      },
      power() {
        [523, 659, 784, 1046].forEach((f, i) =>
          beep({ freq: f, dur: 0.09, type: 'square', vol: 0.035, delay: i * 0.06 }));
      },
      level() {
        [392, 523, 659, 784].forEach((f, i) =>
          beep({ freq: f, dur: 0.2, type: 'triangle', vol: 0.05, delay: i * 0.13 }));
      },
      over() {
        [330, 262, 196, 131].forEach((f, i) =>
          beep({ freq: f, dur: 0.34, type: 'sawtooth', vol: 0.045, delay: i * 0.18 }));
      },
    };
  })();

  /* ------------------------------- 状态 ------------------------------- */

  const G = {
    state: 'menu',          // menu | playing | paused | levelclear | dying | gameover
    level: 1,
    score: 0,
    high: Number(localStorage.getItem('tank-battle-high') || 0) || 0,
    lives: 3,
    grid: [],
    base: null,
    baseDead: false,
    tanks: [],
    bullets: [],
    powerups: [],
    effects: [],
    player: null,
    spawnQueue: [],
    spawnIndex: 0,
    spawnTimer: 0,
    respawnTimer: 0,
    freeze: 0,
    shake: 0,
    time: 0,
    overTimer: 0,
    overReason: '',
  };

  const input = {
    held: new Set(),
    order: [],
    fire: false,
    touchDir: null,
    touchFire: false,
  };

  let overlayAction = null;
  let last = performance.now();

  /* ------------------------------ 工具 -------------------------------- */

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function rr(x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  function drawStarPath(cx, cy, outer, inner, points = 5) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = -Math.PI / 2 + (i * Math.PI) / points;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  /* ---------------------------- 地图与关卡 ---------------------------- */

  function findBase() {
    let minC = COLS, minR = ROWS, maxC = 0, maxR = 0, found = false;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (G.grid[y][x] === T.BASE) {
          found = true;
          minC = Math.min(minC, x);
          minR = Math.min(minR, y);
          maxC = Math.max(maxC, x);
          maxR = Math.max(maxR, y);
        }
      }
    }
    if (!found) {
      G.base = { x: 6 * TILE, y: 11 * TILE, w: TILE * 2, h: TILE * 2 };
    } else {
      G.base = {
        x: minC * TILE,
        y: minR * TILE,
        w: (maxC - minC + 1) * TILE,
        h: (maxR - minR + 1) * TILE,
      };
    }
  }

  function buildEnemyQueue(level) {
    const total = Math.min(20, 10 + (level - 1) * 2);
    const weights = {
      basic: Math.max(8, 55 - level * 6),
      fast: 15 + level * 2,
      power: 14 + level * 3,
      armor: 10 + level * 5,
    };
    const keys = Object.keys(weights);
    const totalWeight = keys.reduce((s, k) => s + weights[k], 0);
    const queue = [];
    for (let i = 0; i < total; i++) {
      let r = Math.random() * totalWeight;
      let picked = 'basic';
      for (const k of keys) {
        r -= weights[k];
        if (r <= 0) { picked = k; break; }
      }
      queue.push({ type: picked, bonus: (i + 1) % 4 === 0 });
    }
    return queue;
  }

  function loadLevel(n) {
    const map = MAPS[(n - 1) % MAPS.length];
    G.grid = map.map((row) => row.split('').map((ch) => CHAR_TILE[ch] ?? T.EMPTY));
    G.level = n;
    G.tanks = [];
    G.bullets = [];
    G.powerups = [];
    G.effects = [];
    G.player = null;
    G.freeze = 0;
    G.shake = 0;
    G.baseDead = false;
    G.respawnTimer = 0;
    G.spawnQueue = buildEnemyQueue(n);
    G.spawnIndex = 0;
    G.spawnTimer = 1.0;
    G.state = 'playing';
    findBase();
    spawnPlayer();
    updateHud();
  }

  /* ------------------------------ 坦克 -------------------------------- */

  function makeTank(opts) {
    return {
      x: opts.x,
      y: opts.y,
      w: TANK_SIZE,
      h: TANK_SIZE,
      dir: opts.dir || 'up',
      side: opts.side,
      alive: true,
      spawning: opts.spawning || 0,
      shield: opts.shield || 0,
      level: 1,
      speed: opts.speed || 60,
      hp: opts.hp || 1,
      maxHp: opts.hp || 1,
      color: opts.color || '#f5c542',
      accent: opts.accent || '#8a6a10',
      bulletSpeed: opts.bulletSpeed || 200,
      score: opts.score || 0,
      type: opts.type || 'player',
      bonus: !!opts.bonus,
      shootCd: 0,
      shootDelay: 1.1,
      think: 0,
      stuck: 0,
      flash: 0,
      tread: 0,
    };
  }

  function spawnPlayer() {
    const x = PLAYER_SPAWN.col * TILE + (TILE - TANK_SIZE) / 2;
    const y = PLAYER_SPAWN.row * TILE + (TILE - TANK_SIZE) / 2;
    for (const t of G.tanks) {
      if (t.alive && rectsOverlap(x, y, TANK_SIZE, TANK_SIZE, t.x, t.y, t.w, t.h)) {
        G.respawnTimer = 0.5;
        return;
      }
    }
    const p = makeTank({
      side: 'player',
      x, y,
      dir: 'up',
      speed: 104,
      shield: 3,
      color: '#f5c542',
      accent: '#8a6a10',
      bulletSpeed: 330,
      type: 'player',
    });
    p.shootCd = 0.25;
    G.player = p;
    G.tanks.push(p);
    updateHud();
  }

  function trySpawnEnemy() {
    if (!G.spawnQueue.length) return false;
    for (let k = 0; k < ENEMY_SPAWNS.length; k++) {
      const idx = (G.spawnIndex + k) % ENEMY_SPAWNS.length;
      const sp = ENEMY_SPAWNS[idx];
      const x = sp.col * TILE + (TILE - TANK_SIZE) / 2;
      const y = sp.row * TILE + (TILE - TANK_SIZE) / 2;
      const blocked = G.tanks.some((t) =>
        t.alive && rectsOverlap(x, y, TANK_SIZE, TANK_SIZE, t.x, t.y, t.w, t.h));
      if (blocked) continue;

      const queued = G.spawnQueue.shift();
      const def = ENEMY_TYPES[queued.type];
      const e = makeTank({
        side: 'enemy',
        x, y,
        dir: 'down',
        speed: def.speed,
        hp: def.hp,
        color: def.color,
        accent: def.accent,
        bulletSpeed: def.bulletSpeed,
        score: def.score,
        type: queued.type,
        bonus: queued.bonus,
        spawning: 1.1,
      });
      e.shootDelay = def.shootDelay;
      e.shootCd = 1.2 + Math.random();
      e.think = 0.2 + Math.random() * 0.4;
      G.tanks.push(e);
      G.spawnIndex = (idx + 1) % ENEMY_SPAWNS.length;
      return true;
    }
    return false;
  }

  /* ---------------------------- 碰撞与移动 ---------------------------- */

  function tankHitsTile(x, y, w, h) {
    if (x < 0 || y < 0 || x + w > W || y + h > H) return true;
    const x0 = Math.floor(x / TILE);
    const x1 = Math.floor((x + w - 0.001) / TILE);
    const y0 = Math.floor(y / TILE);
    const y1 = Math.floor((y + h - 0.001) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (SOLID.has(G.grid[ty][tx])) return true;
      }
    }
    return false;
  }

  function tankBlocked(self, x, y) {
    if (tankHitsTile(x, y, self.w, self.h)) return true;
    for (const o of G.tanks) {
      if (o === self || !o.alive) continue;
      if (rectsOverlap(x, y, self.w, self.h, o.x, o.y, o.w, o.h)) return true;
    }
    return false;
  }

  function snapTank(t) {
    if (t.dir === 'left' || t.dir === 'right') {
      const ty = Math.round((t.y - (TILE - TANK_SIZE) / 2) / TILE) * TILE + (TILE - TANK_SIZE) / 2;
      if (ty !== t.y && !tankBlocked(t, t.x, ty)) t.y = ty;
    } else {
      const tx = Math.round((t.x - (TILE - TANK_SIZE) / 2) / TILE) * TILE + (TILE - TANK_SIZE) / 2;
      if (tx !== t.x && !tankBlocked(t, tx, t.y)) t.x = tx;
    }
  }

  function setDir(t, dir) {
    if (t.dir === dir) return;
    t.dir = dir;
    snapTank(t);
  }

  function moveTank(t, dir, dt) {
    setDir(t, dir);
    const speed = t.speed;
    const d = DIRS[dir];
    const dist = speed * dt;
    if (dist <= 0) return false;
    for (let f = 1; f > 0.05; f -= 0.25) {
      const step = dist * f;
      const nx = t.x + d.x * step;
      const ny = t.y + d.y * step;
      if (!tankBlocked(t, nx, ny)) {
        t.x = nx;
        t.y = ny;
        t.tread += step;
        return true;
      }
    }
    return false;
  }

  function probeMove(t, dir) {
    let x = t.x;
    let y = t.y;
    const center = (TILE - TANK_SIZE) / 2;
    if (dir === 'left' || dir === 'right') {
      y = Math.round((y - center) / TILE) * TILE + center;
    } else {
      x = Math.round((x - center) / TILE) * TILE + center;
    }
    const d = DIRS[dir];
    return !tankBlocked(t, x + d.x * 5, y + d.y * 5);
  }

  /* ------------------------------ 射击 -------------------------------- */

  function shoot(t) {
    if (!t.alive || t.spawning > 0) return;
    const maxBullets = t.side === 'player' ? (t.level >= 2 ? 2 : 1) : 1;
    let mine = 0;
    for (const b of G.bullets) if (b.owner === t && b.alive) mine++;
    if (mine >= maxBullets) return;

    const d = DIRS[t.dir];
    const cx = t.x + t.w / 2;
    const cy = t.y + t.h / 2;
    const bx = cx + d.x * (t.w / 2) - 4;
    const by = cy + d.y * (t.h / 2) - 4;

    G.bullets.push({
      x: bx,
      y: by,
      w: 8,
      h: 8,
      dir: t.dir,
      speed: t.side === 'player' ? (t.level >= 2 ? 400 : 320) : t.bulletSpeed,
      owner: t,
      side: t.side,
      alive: true,
      power: t.side === 'player' && t.level >= 3,
    });

    t.shootCd = t.side === 'player' ? (t.level >= 2 ? 0.22 : 0.32) : t.shootDelay;
    Sound.shoot(t.side);
    G.effects.push({
      kind: 'muzzle',
      x: cx + d.x * 16,
      y: cy + d.y * 16,
      t: 0,
      dur: 0.07,
      dir: t.dir,
    });
  }

  function bulletHitsTiles(b) {
    const x0 = Math.max(0, Math.floor(b.x / TILE));
    const x1 = Math.min(COLS - 1, Math.floor((b.x + b.w - 0.01) / TILE));
    const y0 = Math.max(0, Math.floor(b.y / TILE));
    const y1 = Math.min(ROWS - 1, Math.floor((b.y + b.h - 0.01) / TILE));
    let hit = false;
    let brokeBrick = false;
    let hitSteel = false;

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const cell = G.grid[ty][tx];
        if (cell === T.BRICK) {
          G.grid[ty][tx] = T.EMPTY;
          hit = true;
          brokeBrick = true;
        } else if (cell === T.STEEL) {
          hit = true;
          hitSteel = true;
          if (b.power) G.grid[ty][tx] = T.EMPTY;
        } else if (cell === T.BASE) {
          hit = true;
          destroyBase();
        }
      }
    }

    if (hit) {
      if (brokeBrick) Sound.brick();
      else if (hitSteel) Sound.steel();
      addSpark(b.x + b.w / 2, b.y + b.h / 2, 5);
    }
    return hit;
  }

  function bulletHitsTanks(b) {
    for (const t of G.tanks) {
      if (!t.alive || t === b.owner || t.side === b.side) continue;
      if (t.spawning > 0) continue;
      if (!rectsOverlap(b.x, b.y, b.w, b.h, t.x, t.y, t.w, t.h)) continue;
      if (t.shield > 0) {
        addSpark(b.x + 4, b.y + 4, 6);
        Sound.steel();
        return true;
      }
      if (t.side === 'player') {
        destroyPlayer(t);
      } else {
        damageEnemy(t, b);
      }
      return true;
    }
    return false;
  }

  function updateBullets(dt) {
    const list = G.bullets;

    for (const b of list) {
      if (!b.alive) continue;
      let remaining = b.speed * dt;
      const d = DIRS[b.dir];
      while (remaining > 0 && b.alive) {
        const step = Math.min(6, remaining);
        remaining -= step;
        b.x += d.x * step;
        b.y += d.y * step;

        if (b.x < -8 || b.y < -8 || b.x > W + 8 || b.y > H + 8) {
          b.alive = false;
          break;
        }
        if (bulletHitsTiles(b)) { b.alive = false; break; }
        if (bulletHitsTanks(b)) { b.alive = false; break; }
      }
    }

    // 子弹相撞
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < list.length; j++) {
        const c = list[j];
        if (!c.alive || c.side === a.side) continue;
        if (rectsOverlap(a.x, a.y, a.w, a.h, c.x, c.y, c.w, c.h)) {
          a.alive = false;
          c.alive = false;
          addSpark((a.x + c.x) / 2 + 4, (a.y + c.y) / 2 + 4, 5);
          break;
        }
      }
    }

    G.bullets = list.filter((b) => b.alive);
  }

  /* --------------------------- 伤害与死亡 ----------------------------- */

  function addScore(n) {
    G.score += n;
    if (G.score > G.high) G.high = G.score;
  }

  function damageEnemy(t, b) {
    t.hp -= 1;
    t.flash = 0.12;
    if (t.hp <= 0) {
      t.alive = false;
      addBoom(t.x + t.w / 2, t.y + t.h / 2, true);
      Sound.explode(true);
      addScore(t.score);
      addFloatingText(t.x + t.w / 2, t.y - 2, '+' + t.score, '#ffd76a');
      if (t.bonus) dropPowerup(t.x + t.w / 2, t.y + t.h / 2);
      G.shake = Math.max(G.shake, 6);
    } else {
      addSpark(b.x + 4, b.y + 4, 7);
      Sound.hit();
    }
  }

  function destroyPlayer(p) {
    if (!p.alive) return;
    p.alive = false;
    addBoom(p.x + p.w / 2, p.y + p.h / 2, true);
    Sound.explode(true);
    G.shake = Math.max(G.shake, 9);
    G.player = null;
    G.lives -= 1;
    G.respawnTimer = 1.5;
    updateHud();
    if (G.lives <= 0) beginGameOver('生命耗尽', 1.5);
  }

  function destroyBase() {
    if (G.baseDead) return;
    G.baseDead = true;
    const cx = G.base.x + G.base.w / 2;
    const cy = G.base.y + G.base.h / 2;
    addBoom(cx, cy, true);
    addBoom(cx - 12, cy + 6, false);
    addBoom(cx + 12, cy + 2, false);
    Sound.explode(true);
    G.shake = 14;
    beginGameOver('基地被摧毁', 1.7);
  }

  function beginGameOver(reason, delay) {
    if (G.state !== 'playing') return;
    G.state = 'dying';
    G.overTimer = delay;
    G.overReason = reason;
  }

  function finishGameOver() {
    G.state = 'gameover';
    saveHigh();
    Sound.over();
    updateHud();
    showOverlay('游戏结束', G.overReason + '\n最终得分  ' + G.score + '  ·  最高分  ' + G.high, '再来一局', startGame);
  }

  /* ----------------------------- 敌人 AI ------------------------------ */

  function pickTargetPos(t) {
    if (G.player && G.player.alive && Math.random() < 0.35) {
      return { x: G.player.x + G.player.w / 2, y: G.player.y + G.player.h / 2 };
    }
    return { x: G.base.x + G.base.w / 2, y: G.base.y + G.base.h / 2 };
  }

  function chooseEnemyDir(t) {
    const target = pickTargetPos(t);
    const dx = target.x - (t.x + t.w / 2);
    const dy = target.y - (t.y + t.h / 2);

    let preferred;
    if (Math.abs(dx) > Math.abs(dy)) preferred = dx > 0 ? 'right' : 'left';
    else preferred = dy > 0 ? 'down' : 'up';

    if (Math.random() < 0.28) {
      preferred = DIR_NAMES[(Math.random() * 4) | 0];
    }

    const rest = DIR_NAMES.filter((d) => d !== preferred);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }

    for (const d of [preferred, ...rest]) {
      if (probeMove(t, d)) {
        setDir(t, d);
        return;
      }
    }
    setDir(t, preferred);
  }

  function enemyAligned(t) {
    const cx = t.x + t.w / 2;
    const cy = t.y + t.h / 2;
    const targets = [];
    if (G.player && G.player.alive) {
      targets.push({ x: G.player.x + G.player.w / 2, y: G.player.y + G.player.h / 2 });
    }
    if (G.base) {
      targets.push({ x: G.base.x + G.base.w / 2, y: G.base.y + G.base.h / 2 });
    }

    for (const tg of targets) {
      const dx = tg.x - cx;
      const dy = tg.y - cy;
      if (t.dir === 'up' && Math.abs(dx) < 22 && dy < 0) return true;
      if (t.dir === 'down' && Math.abs(dx) < 22 && dy > 0) return true;
      if (t.dir === 'left' && Math.abs(dy) < 22 && dx < 0) return true;
      if (t.dir === 'right' && Math.abs(dy) < 22 && dx > 0) return true;
    }
    return false;
  }

  function updateEnemies(dt) {
    for (const t of G.tanks) {
      if (t.side !== 'enemy' || !t.alive) continue;

      if (t.spawning > 0) {
        t.spawning -= dt;
        if (t.spawning < 0) t.spawning = 0;
        continue;
      }

      t.flash = Math.max(0, t.flash - dt);
      if (G.freeze > 0) continue;

      t.shootCd = Math.max(0, t.shootCd - dt);
      t.think -= dt;

      if (t.think <= 0) {
        t.think = 0.35 + Math.random() * 1.1;
        chooseEnemyDir(t);
      }

      if (!moveTank(t, t.dir, dt)) {
        t.stuck += dt;
        if (t.stuck > 0.28) {
          t.stuck = 0;
          chooseEnemyDir(t);
        }
      } else {
        t.stuck = 0;
      }

      if (t.shootCd <= 0) {
        if (enemyAligned(t) || Math.random() < 0.02) {
          shoot(t);
        }
      }
    }
  }

  /* ------------------------------ 玩家 -------------------------------- */

  function currentDir() {
    if (input.touchDir) return input.touchDir;
    for (const code of input.order) {
      if (input.held.has(code)) return KEY_DIR[code];
    }
    return null;
  }

  function updatePlayer(dt) {
    const p = G.player;
    if (!p || !p.alive) return;

    p.shield = Math.max(0, p.shield - dt);
    p.flash = Math.max(0, p.flash - dt);
    p.shootCd = Math.max(0, p.shootCd - dt);

    const dir = currentDir();
    if (dir) moveTank(p, dir, dt);

    if ((input.fire || input.touchFire) && p.shootCd <= 0) shoot(p);
  }

  function updateSpawns(dt) {
    if (!G.player && G.lives > 0) {
      G.respawnTimer -= dt;
      if (G.respawnTimer <= 0) spawnPlayer();
    }

    const aliveEnemies = G.tanks.reduce((n, t) => n + (t.side === 'enemy' && t.alive ? 1 : 0), 0);
    if (G.spawnQueue.length > 0 && aliveEnemies < 4) {
      G.spawnTimer -= dt;
      if (G.spawnTimer <= 0) {
        const ok = trySpawnEnemy();
        G.spawnTimer = ok ? Math.max(0.9, 2.4 - G.level * 0.12) : 0.35;
      }
    }
  }

  /* ------------------------------ 道具 -------------------------------- */

  function dropPowerup(x, y) {
    const type = POWER_TYPES[(Math.random() * POWER_TYPES.length) | 0];
    G.powerups.push({
      x: clamp(x - 13, 2, W - 28),
      y: clamp(y - 13, 2, H - 28),
      w: 26,
      h: 26,
      type,
      t: 0,
      life: 14,
    });
  }

  function applyPowerup(pu) {
    const p = G.player;
    Sound.power();
    addScore(200);
    const cx = pu.x + 13;
    const cy = pu.y + 13;

    if (pu.type === 'star') {
      if (p) p.level = Math.min(3, p.level + 1);
      addFloatingText(cx, cy, '火力 +1', '#ffd54f');
    } else if (pu.type === 'heart') {
      G.lives += 1;
      addFloatingText(cx, cy, '+1 生命', '#ef5350');
    } else if (pu.type === 'bomb') {
      for (const t of G.tanks) {
        if (t.side === 'enemy' && t.alive && t.spawning <= 0) {
          t.alive = false;
          addBoom(t.x + t.w / 2, t.y + t.h / 2, true);
          addScore(t.score);
        }
      }
      G.shake = Math.max(G.shake, 10);
      Sound.explode(true);
      addFloatingText(cx, cy, '清屏！', '#ffb74d');
    } else if (pu.type === 'clock') {
      G.freeze = 6;
      addFloatingText(cx, cy, '冻结 6s', '#4fc3f7');
    } else if (pu.type === 'shield') {
      if (p) p.shield = Math.max(p.shield, 8);
      addFloatingText(cx, cy, '护盾 8s', '#8f9dff');
    }
    updateHud();
  }

  function updatePowerups(dt) {
    let picked = false;
    for (const pu of G.powerups) {
      pu.t += dt;
      pu.life -= dt;
      if (!picked && G.player && G.player.alive &&
          pu.life > 0 &&
          rectsOverlap(G.player.x, G.player.y, G.player.w, G.player.h, pu.x, pu.y, pu.w, pu.h)) {
        applyPowerup(pu);
        pu.life = 0;
        picked = true;
      }
    }
    G.powerups = G.powerups.filter((pu) => pu.life > 0);
  }

  /* ------------------------------ 特效 -------------------------------- */

  function addBoom(x, y, big) {
    const parts = [];
    const n = big ? 14 : 7;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = (big ? 70 : 42) * (0.35 + Math.random());
      parts.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        size: 1.5 + Math.random() * 2.6,
      });
    }
    G.effects.push({
      kind: 'boom',
      x, y,
      t: 0,
      dur: big ? 0.55 : 0.32,
      size: big ? 48 : 26,
      parts,
    });
  }

  function addSpark(x, y, n) {
    const parts = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = 40 + Math.random() * 90;
      parts.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        size: 1 + Math.random() * 2,
      });
    }
    G.effects.push({ kind: 'spark', x, y, t: 0, dur: 0.22, parts });
  }

  function addFloatingText(x, y, text, color) {
    G.effects.push({ kind: 'text', x, y, text, color, t: 0, dur: 0.95 });
  }

  function updateEffects(dt) {
    for (const e of G.effects) {
      e.t += dt;
      if (e.parts) {
        for (const p of e.parts) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 0.9;
          p.vy *= 0.9;
        }
      }
    }
    G.effects = G.effects.filter((e) => e.t < e.dur);
  }

  /* ------------------------------ 更新 -------------------------------- */

  function checkLevelClear() {
    if (G.state !== 'playing') return;
    if (G.spawnQueue.length > 0) return;
    if (G.tanks.some((t) => t.side === 'enemy' && t.alive)) return;
    if (G.respawnTimer > 0) return;
    if (G.lives <= 0) return;

    G.state = 'levelclear';
    addScore(1000);
    saveHigh();
    updateHud();
    Sound.level();
    showOverlay(
      '第 ' + G.level + ' 关完成',
      '本关奖励 +1000\n当前得分  ' + G.score,
      '进入下一关',
      nextLevel
    );
  }

  function update(dt) {
    G.time += dt;
    G.shake = Math.max(0, G.shake - dt * 28);
    updateEffects(dt);

    if (G.state === 'dying') {
      G.overTimer -= dt;
      if (G.overTimer <= 0) finishGameOver();
      return;
    }
    if (G.state !== 'playing') return;

    G.freeze = Math.max(0, G.freeze - dt);

    updatePlayer(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updatePowerups(dt);
    updateSpawns(dt);

    G.tanks = G.tanks.filter((t) => t.alive);
    if (G.player && !G.player.alive) G.player = null;

    checkLevelClear();
    updateHud();
  }

  /* ------------------------------ 渲染 -------------------------------- */

  function drawBrickTile(px, py) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, TILE, TILE);
    ctx.clip();
    ctx.fillStyle = '#24110a';
    ctx.fillRect(px, py, TILE, TILE);
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 8 : 0;
      const y = py + row * 8 + 1;
      for (let x = px - 16 + off; x < px + TILE; x += 16) {
        ctx.fillStyle = '#a3481f';
        ctx.fillRect(x + 1, y, 14, 6);
        ctx.fillStyle = 'rgba(255, 190, 140, 0.18)';
        ctx.fillRect(x + 1, y, 14, 1.5);
      }
    }
    ctx.restore();
  }

  function drawSteelTile(px, py) {
    const g = ctx.createLinearGradient(px, py, px + TILE, py + TILE);
    g.addColorStop(0, '#b9c4cf');
    g.addColorStop(0.5, '#88939f');
    g.addColorStop(1, '#5b6570');
    ctx.fillStyle = g;
    ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 2, py + 2, TILE - 4, TILE - 4);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fillRect(px + 5, py + 5, 5, 5);
    ctx.fillRect(px + TILE - 10, py + TILE - 10, 5, 5);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(px + TILE - 10, py + 5, 5, 5);
    ctx.fillRect(px + 5, py + TILE - 10, 5, 5);
  }

  function drawWaterTile(px, py) {
    ctx.fillStyle = '#0c2a49';
    ctx.fillRect(px, py, TILE, TILE);
    const g = ctx.createLinearGradient(px, py, px, py + TILE);
    g.addColorStop(0, 'rgba(70, 150, 220, 0.3)');
    g.addColorStop(1, 'rgba(8, 34, 70, 0.25)');
    ctx.fillStyle = g;
    ctx.fillRect(px, py, TILE, TILE);

    ctx.strokeStyle = 'rgba(130, 210, 255, 0.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 2; i++) {
      const yy = py + 10 + i * 12;
      ctx.beginPath();
      for (let x = 0; x <= TILE; x += 4) {
        const wy = yy + Math.sin((px + x) * 0.25 + G.time * 3 + i * 2.2) * 2;
        if (x === 0) ctx.moveTo(px + x, wy);
        else ctx.lineTo(px + x, wy);
      }
      ctx.stroke();
    }
  }

  function drawTreeGround(px, py) {
    ctx.fillStyle = '#0d2413';
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = '#14351c';
    ctx.beginPath();
    ctx.arc(px + 10, py + 12, 8, 0, TAU);
    ctx.arc(px + 23, py + 20, 9, 0, TAU);
    ctx.fill();
  }

  function drawGround() {
    ctx.fillStyle = '#0d1116';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(120, 160, 200, 0.045)';
    ctx.lineWidth = 1;
    for (let x = TILE; x < W; x += TILE) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, H);
      ctx.stroke();
    }
    for (let y = TILE; y < H; y += TILE) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(W, y + 0.5);
      ctx.stroke();
    }

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const cell = G.grid[y][x];
        const px = x * TILE;
        const py = y * TILE;
        if (cell === T.BRICK) drawBrickTile(px, py);
        else if (cell === T.STEEL) drawSteelTile(px, py);
        else if (cell === T.WATER) drawWaterTile(px, py);
        else if (cell === T.TREE) drawTreeGround(px, py);
      }
    }
  }

  function drawTrees() {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (G.grid[y][x] !== T.TREE) continue;
        const px = x * TILE;
        const py = y * TILE;
        const seed = ((x * 73856093) ^ (y * 19349663)) >>> 0;
        ctx.globalAlpha = 0.94;
        for (let i = 0; i < 5; i++) {
          const ox = 7 + ((seed >> (i * 3)) % 18);
          const oy = 7 + ((seed >> (i * 3 + 1)) % 18);
          const r = 6 + ((seed >> (i * 2)) % 4);
          ctx.fillStyle = i % 2 ? '#1f5a2a' : '#2a7135';
          ctx.beginPath();
          ctx.arc(px + ox, py + oy, r, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawBase() {
    const b = G.base;
    if (!b) return;

    ctx.fillStyle = '#1a2028';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);

    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;

    if (G.baseDead) {
      ctx.fillStyle = '#33383f';
      for (let i = 0; i < 6; i++) {
        const ox = (i % 3) * 15 - 22;
        const oy = ((i / 3) | 0) * 16 - 8;
        ctx.fillRect(cx + ox, cy + oy, 13, 11);
      }
      ctx.fillStyle = 'rgba(239, 83, 80, ' + (0.35 + Math.sin(G.time * 4) * 0.2) + ')';
      ctx.beginPath();
      ctx.arc(cx, cy, 20, 0, TAU);
      ctx.fill();
      return;
    }

    ctx.save();
    ctx.translate(cx, cy + 2);
    const glow = 0.55 + Math.sin(G.time * 2) * 0.12;
    ctx.shadowColor = 'rgba(245, 197, 66, ' + glow + ')';
    ctx.shadowBlur = 16;

    const g = ctx.createLinearGradient(0, -24, 0, 24);
    g.addColorStop(0, '#ffe082');
    g.addColorStop(0.5, '#e8b93f');
    g.addColorStop(1, '#a8791b');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(20, -14);
    ctx.lineTo(18, 8);
    ctx.quadraticCurveTo(0, 27, -18, 8);
    ctx.lineTo(-20, -14);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#3a2606';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#2a1a05';
    drawStarPath(0, 0, 11, 4.6, 5);
    ctx.fill();
    ctx.restore();
  }

  function drawTankBody(t) {
    ctx.save();
    ctx.translate(t.x + t.w / 2, t.y + t.h / 2);
    ctx.rotate(DIRS[t.dir].a);

    // 履带
    ctx.fillStyle = '#1b2027';
    rr(-14, -13, 6, 26, 2);
    ctx.fill();
    rr(8, -13, 6, 26, 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    const treadOff = Math.floor(t.tread / 4) % 4;
    for (let i = -11 + treadOff; i <= 9; i += 4) {
      ctx.fillRect(-14, i, 6, 1.6);
      ctx.fillRect(8, i, 6, 1.6);
    }

    // 车体
    const g = ctx.createLinearGradient(-9, -13, 9, 13);
    g.addColorStop(0, t.color);
    g.addColorStop(1, t.accent);
    ctx.fillStyle = g;
    rr(-8.5, -12, 17, 24, 4);
    ctx.fill();

    // 装饰条
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.fillRect(-8.5, 5, 17, 2.5);

    if (t.level >= 2) {
      ctx.fillStyle = '#fff2b8';
      ctx.fillRect(-7, -8.5, 14, 1.5);
    }
    if (t.level >= 3) {
      ctx.fillStyle = '#ffe27a';
      ctx.fillRect(-7, -6, 14, 1.5);
    }

    // 炮塔
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, TAU);
    ctx.fill();
    ctx.fillStyle = t.color;
    ctx.beginPath();
    ctx.arc(0, 0, 5.6, 0, TAU);
    ctx.fill();

    // 炮管
    ctx.fillStyle = t.accent;
    rr(-2.4, -17, 4.8, 14, 1.6);
    ctx.fill();
    if (t.level >= 2) {
      ctx.fillStyle = '#ffe9a8';
      ctx.fillRect(-1.2, -17, 2.4, 3);
    }

    // 炮塔中心点
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, TAU);
    ctx.fill();

    // 受击闪白
    if (t.flash > 0) {
      ctx.globalAlpha = Math.min(1, t.flash * 6);
      ctx.fillStyle = '#ffffff';
      rr(-9, -12, 18, 24, 4);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // 奖励坦克闪烁描边
    if (t.bonus && t.side === 'enemy') {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 85, 85, ' + (0.45 + Math.sin(G.time * 12) * 0.35) + ')';
      ctx.lineWidth = 2;
      rr(t.x + 1, t.y + 1, t.w - 2, t.h - 2, 4);
      ctx.stroke();
      ctx.restore();
    }

    // 冻结覆盖
    if (G.freeze > 0 && t.side === 'enemy') {
      ctx.fillStyle = 'rgba(110, 200, 255, 0.22)';
      rr(t.x, t.y, t.w, t.h, 5);
      ctx.fill();
    }
  }

  function drawShield(t) {
    const cx = t.x + t.w / 2;
    const cy = t.y + t.h / 2;
    const pulse = 0.6 + Math.sin(G.time * 8) * 0.2;
    const alpha = t.shield < 1 ? (Math.sin(G.time * 22) > 0 ? 0.8 : 0.15) : 0.75;
    ctx.save();
    ctx.strokeStyle = 'rgba(140, 225, 255, ' + alpha * pulse + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, ' + alpha * 0.5 + ')';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, 15, G.time * 2, G.time * 2 + Math.PI * 1.4);
    ctx.stroke();
    ctx.restore();
  }

  function drawSpawnStar(t) {
    const cx = t.x + t.w / 2;
    const cy = t.y + t.h / 2;
    const p = 1 - t.spawning / 1.1;
    const r = 6 + p * 16;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(p * 5);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.5 + Math.sin(p * 30) * 0.4;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(0, r);
      ctx.stroke();
      ctx.rotate(Math.PI / 2);
    }
    ctx.restore();
  }

  function drawTanks() {
    for (const t of G.tanks) {
      if (!t.alive) continue;
      if (t.spawning > 0) drawSpawnStar(t);
      else drawTankBody(t);
      if (t.shield > 0 && t.alive) drawShield(t);
    }
  }

  function drawBullets() {
    for (const b of G.bullets) {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const col = b.side === 'player' ? '#ffe082' : '#ff8a65';
      ctx.save();
      ctx.shadowColor = col;
      ctx.shadowBlur = 10;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy, 1.6, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPowerIcon(type, cx, cy) {
    const col = POWER_COLORS[type];
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;

    if (type === 'star') {
      drawStarPath(cx, cy, 8.5, 3.8, 5);
      ctx.fill();
    } else if (type === 'heart') {
      ctx.beginPath();
      ctx.moveTo(cx, cy + 8);
      ctx.bezierCurveTo(cx - 12, cy - 1, cx - 7, cy - 10, cx, cy - 4);
      ctx.bezierCurveTo(cx + 7, cy - 10, cx + 12, cy - 1, cx, cy + 8);
      ctx.closePath();
      ctx.fill();
    } else if (type === 'bomb') {
      ctx.beginPath();
      ctx.arc(cx, cy + 2, 6.5, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 3, cy - 5);
      ctx.quadraticCurveTo(cx + 8, cy - 10, cx + 5, cy - 11);
      ctx.stroke();
    } else if (type === 'clock') {
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy - 4.5);
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + 3.5, cy + 1.5);
      ctx.stroke();
    } else if (type === 'shield') {
      ctx.beginPath();
      ctx.moveTo(cx, cy - 8);
      ctx.lineTo(cx + 7, cy - 4);
      ctx.lineTo(cx + 6, cy + 4);
      ctx.quadraticCurveTo(cx, cy + 10, cx - 6, cy + 4);
      ctx.lineTo(cx - 7, cy - 4);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawPowerups() {
    for (const pu of G.powerups) {
      if (pu.life < 3 && Math.floor(pu.life * 8) % 2 === 0) continue;
      const bob = Math.sin(pu.t * 4) * 2;
      const col = POWER_COLORS[pu.type];
      ctx.save();
      ctx.translate(pu.x + pu.w / 2, pu.y + pu.h / 2 + bob);
      ctx.shadowColor = col;
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#0e141b';
      rr(-13, -13, 26, 26, 6);
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      rr(-13, -13, 26, 26, 6);
      ctx.stroke();
      ctx.shadowBlur = 0;
      drawPowerIcon(pu.type, 0, 0);
      ctx.restore();
    }
  }

  function drawEffects() {
    for (const e of G.effects) {
      const p = Math.min(1, e.t / e.dur);

      if (e.kind === 'boom') {
        const alpha = 1 - p;
        const r = e.size * (0.35 + p * 0.85);
        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
        g.addColorStop(0, 'rgba(255, 248, 214, ' + alpha + ')');
        g.addColorStop(0.35, 'rgba(255, 173, 64, ' + alpha * 0.95 + ')');
        g.addColorStop(0.75, 'rgba(214, 72, 26, ' + alpha * 0.75 + ')');
        g.addColorStop(1, 'rgba(120, 20, 8, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, TAU);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 226, 160, ' + alpha * 0.6 + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r * 0.95, 0, TAU);
        ctx.stroke();

        for (const part of e.parts) {
          ctx.fillStyle = 'rgba(255, ' + (150 + ((part.size * 30) | 0)) + ', 60, ' + alpha + ')';
          ctx.fillRect(part.x, part.y, part.size, part.size);
        }
      } else if (e.kind === 'spark') {
        const alpha = 1 - p;
        for (const part of e.parts) {
          ctx.fillStyle = 'rgba(255, 236, 170, ' + alpha + ')';
          ctx.fillRect(part.x, part.y, part.size, part.size);
        }
      } else if (e.kind === 'muzzle') {
        const d = DIRS[e.dir];
        const alpha = 1 - p;
        ctx.fillStyle = 'rgba(255, 240, 170, ' + alpha + ')';
        ctx.beginPath();
        ctx.arc(e.x, e.y, 6 * (1 - p * 0.5) + 2, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 200, 80, ' + alpha * 0.8 + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(e.x - d.x * 2, e.y - d.y * 2);
        ctx.lineTo(e.x + d.x * 10, e.y + d.y * 10);
        ctx.stroke();
      } else if (e.kind === 'text') {
        const alpha = 1 - p;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = e.color;
        ctx.font = 'bold 12px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 4;
        ctx.fillText(e.text, e.x, e.y - p * 24);
        ctx.restore();
      }
    }
  }

  function drawFreezeBanner() {
    const a = Math.min(1, G.freeze);
    ctx.save();
    ctx.fillStyle = 'rgba(70, 160, 230, ' + 0.07 * a + ')';
    ctx.fillRect(0, 0, W, H);

    ctx.globalAlpha = Math.min(1, G.freeze);
    ctx.fillStyle = 'rgba(10, 22, 34, 0.75)';
    rr(W / 2 - 64, 8, 128, 24, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 210, 255, 0.55)';
    ctx.lineWidth = 1;
    rr(W / 2 - 64, 8, 128, 24, 12);
    ctx.stroke();
    ctx.fillStyle = '#a8e2ff';
    ctx.font = 'bold 11px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('❄ 冻结 ' + G.freeze.toFixed(1) + 's', W / 2, 21);
    ctx.restore();
  }

  function render() {
    ctx.save();
    if (G.shake > 0.3) {
      ctx.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake);
    }

    drawGround();
    drawBase();
    drawPowerups();
    drawTanks();
    drawBullets();
    drawTrees();
    drawEffects();

    ctx.restore();

    if (G.freeze > 0 && G.state === 'playing') drawFreezeBanner();
  }

  /* ------------------------------ HUD --------------------------------- */

  const hudCache = {};

  function setText(el, key, value) {
    if (hudCache[key] === value) return;
    hudCache[key] = value;
    el.textContent = value;
  }

  function updateHud() {
    setText(hudScore, 'score', String(G.score));
    setText(hudHigh, 'high', String(Math.max(G.high, G.score)));
    setText(hudLevel, 'level', String(G.level));
    setText(hudEnemies, 'enemies', String(
      G.spawnQueue.length + G.tanks.reduce((n, t) => n + (t.side === 'enemy' && t.alive ? 1 : 0), 0)
    ));
    setText(hudPower, 'power', 'Lv.' + (G.player ? G.player.level : 1));

    let hearts;
    if (G.lives <= 0) hearts = '—';
    else if (G.lives <= 5) hearts = '♥'.repeat(G.lives);
    else hearts = '♥'.repeat(5) + ' +' + (G.lives - 5);
    setText(hudLives, 'lives', hearts);
  }

  function saveHigh() {
    try {
      localStorage.setItem('tank-battle-high', String(G.high));
    } catch (e) { /* 忽略隐私模式下的写入错误 */ }
  }

  /* ---------------------------- 覆盖层与流程 -------------------------- */

  function showOverlay(title, sub, btn, action) {
    ovTitle.textContent = title;
    ovSub.textContent = sub;
    ovBtn.textContent = btn;
    overlayAction = action;
    overlay.classList.remove('hidden');
  }

  function hideOverlay() {
    overlay.classList.add('hidden');
  }

  function startGame() {
    Sound.init();
    hideOverlay();
    G.score = 0;
    G.lives = 3;
    G.time = 0;
    G.shake = 0;
    loadLevel(1);
  }

  function nextLevel() {
    hideOverlay();
    loadLevel(G.level + 1);
  }

  function resumeGame() {
    if (G.state !== 'paused') return;
    G.state = 'playing';
    hideOverlay();
  }

  function togglePause() {
    if (G.state === 'playing') {
      G.state = 'paused';
      showOverlay('已暂停', '按 P 或点击按钮继续游戏', '继续游戏', resumeGame);
    } else if (G.state === 'paused') {
      resumeGame();
    }
  }

  function toggleMute() {
    const muted = Sound.toggle();
    btnMute.textContent = muted ? '🔇' : '🔊';
    btnMute.classList.toggle('off', muted);
    btnMute.setAttribute('aria-label', muted ? '取消静音' : '静音');
    if (!muted) Sound.init();
  }

  /* ------------------------------ 输入 -------------------------------- */

  const KEY_DIR = {
    ArrowUp: 'up',
    KeyW: 'up',
    ArrowDown: 'down',
    KeyS: 'down',
    ArrowLeft: 'left',
    KeyA: 'left',
    ArrowRight: 'right',
    KeyD: 'right',
  };

  function onKeyDown(e) {
    const code = e.code;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
      e.preventDefault();
    }
    if (e.repeat) return;

    Sound.init();

    if (KEY_DIR[code]) {
      input.held.add(code);
      input.order = input.order.filter((c) => c !== code);
      input.order.unshift(code);
    }
    if (code === 'Space' || code === 'KeyJ' || code === 'KeyK') {
      input.fire = true;
    }
    if (code === 'KeyP' || code === 'Escape') {
      togglePause();
    }
    if (code === 'KeyM') {
      toggleMute();
    }
    if (code === 'Enter') {
      if (!overlay.classList.contains('hidden') && overlayAction) overlayAction();
    }
  }

  function onKeyUp(e) {
    const code = e.code;
    if (KEY_DIR[code]) {
      input.held.delete(code);
      input.order = input.order.filter((c) => c !== code);
    }
    if (code === 'Space' || code === 'KeyJ' || code === 'KeyK') {
      input.fire = false;
    }
  }

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => {
    input.held.clear();
    input.order = [];
    input.fire = false;
    input.touchDir = null;
    input.touchFire = false;
    if (G.state === 'playing') togglePause();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.state === 'playing') togglePause();
  });

  // 触屏方向键
  document.querySelectorAll('[data-dir]').forEach((btn) => {
    const dir = btn.dataset.dir;
    const press = (e) => {
      e.preventDefault();
      Sound.init();
      input.touchDir = dir;
      btn.classList.add('on');
      try { btn.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    };
    const release = (e) => {
      e.preventDefault();
      if (input.touchDir === dir) input.touchDir = null;
      btn.classList.remove('on');
    };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('lostpointercapture', release);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  const fireBtn = document.querySelector('[data-fire]');
  if (fireBtn) {
    const down = (e) => {
      e.preventDefault();
      Sound.init();
      input.touchFire = true;
      try { fireBtn.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    };
    const up = (e) => {
      e.preventDefault();
      input.touchFire = false;
    };
    fireBtn.addEventListener('pointerdown', down);
    fireBtn.addEventListener('pointerup', up);
    fireBtn.addEventListener('pointercancel', up);
    fireBtn.addEventListener('lostpointercapture', up);
    fireBtn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  ovBtn.addEventListener('click', () => {
    Sound.init();
    if (overlayAction) overlayAction();
  });

  btnMute.addEventListener('click', toggleMute);

  btnRestart.addEventListener('click', () => {
    Sound.init();
    if (G.state === 'menu') startGame();
    else startGame();
  });

  /* ------------------------------ 主循环 ------------------------------ */

  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.05);

    if (G.state === 'playing' || G.state === 'dying') {
      update(dt);
    } else {
      G.time += dt;
      G.shake = Math.max(0, G.shake - dt * 28);
      updateEffects(dt);
    }

    render();
    requestAnimationFrame(frame);
  }

  /* ------------------------------ 启动 -------------------------------- */

  function init() {
    loadLevel(1);
    G.state = 'menu';
    updateHud();
    showOverlay('坦克大战', '保护基地，消灭所有敌方坦克', '开始游戏', startGame);
    requestAnimationFrame((t) => {
      last = t;
      requestAnimationFrame(frame);
    });
  }

  init();

  // 调试入口：可在控制台中查看游戏状态
  window.__tank = G;
})();
