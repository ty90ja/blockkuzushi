'use strict';

// ============================================================
//  定数
// ============================================================
const COLS              = 10;
const ROWS              = 6;
const BLOCK_PAD         = 2;
const BLOCK_AREA        = 0.52;
const BALL_SPEED        = 5.5;
const BALL_RADIUS       = 8;
const BAR_SPEED         = 8.5;
const BAR_HEIGHT        = 14;
const LIVES_MAX         = 3;
const LASER_SPEED_MULT  = 1.5;
const LASER_COOLDOWN    = 10;
const WAVE_CHARGE_FRAMES = 180;  // 3秒 (60fps基準)

const BLOCK_COLORS = [
  'rgba(230, 50,  50,  0.88)',
  'rgba(230, 130, 40,  0.88)',
  'rgba(210, 210, 40,  0.88)',
  'rgba(50,  200, 80,  0.88)',
  'rgba(50,  130, 230, 0.88)',
  'rgba(160, 50,  230, 0.88)',
];

// ============================================================
//  DOM
// ============================================================
const canvas          = document.getElementById('gameCanvas');
const ctx             = canvas.getContext('2d');
const laserBtn        = document.getElementById('laserBtn');
const ballBtn         = document.getElementById('ballBtn');
const waveChargeInner = document.getElementById('waveChargeInner');

// ============================================================
//  背景画像
// ============================================================
const bgImg = new Image();
bgImg._ready = false;
bgImg._failed = false;
bgImg.onload  = () => { bgImg._ready = true; };
bgImg.onerror = () => { bgImg._failed = true; };
bgImg.src = 'images/bg.jpg';

// ============================================================
//  ゲーム変数
// ============================================================
let CW, CH, BLOCK_W, BLOCK_H, BAR_W;

let gameState = 'start';
let score, lives, destroyed, total;
let blocks;
let ball, bar;
let extraBalls    = [];   // 黄色分裂弾（落下してもゲームオーバーなし）
let laserActive   = false;
let laserCooldown = 0;
let laserHoldTime = 0;    // レーザー長押し経過フレーム
let waveCannonReady = false;
let lastFrameTime = 0;

// 波動砲エフェクト
let waveFlash = 0;  // 残りフレーム数

// ============================================================
//  リサイズ
// ============================================================
function resize() {
  const maxW = Math.min(window.innerWidth, 480);
  const btnH  = document.getElementById('controls').offsetHeight || 76;
  const maxH  = window.innerHeight - btnH;

  CW = maxW;
  CH = Math.min(maxH, Math.floor(maxW * 1.65));

  canvas.width  = CW;
  canvas.height = CH;
  canvas.style.width  = CW + 'px';
  canvas.style.height = CH + 'px';

  BLOCK_W = CW / COLS;
  BLOCK_H = (CH * BLOCK_AREA) / ROWS;
  BAR_W   = Math.floor(CW * 0.22);

  if (bar) {
    bar.y = CH - 50;
    bar.w = BAR_W;
    bar.h = BAR_HEIGHT;
  }
}

// ============================================================
//  初期化
// ============================================================
function initGame() {
  score       = 0;
  lives       = LIVES_MAX;
  destroyed   = 0;
  total       = COLS * ROWS;

  blocks = Array.from({ length: ROWS }, () => new Array(COLS).fill(true));

  bar = { x: CW / 2 - BAR_W / 2, y: CH - 50, w: BAR_W, h: BAR_HEIGHT };

  extraBalls      = [];
  laserActive     = false;
  laserCooldown   = 0;
  laserHoldTime   = 0;
  waveCannonReady = false;
  waveFlash       = 0;
  waveChargeInner.style.width = '0%';
  laserBtn.classList.remove('active', 'wavecannon');

  resetBall();
  gameState = 'playing';
}

function resetBall() {
  const angle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 3);
  ball = {
    x:  CW / 2,
    y:  bar.y - BALL_RADIUS - 2,
    vx: Math.cos(angle),
    vy: Math.sin(angle),
    r:  BALL_RADIUS,
  };
  if (ball.vy > 0) ball.vy = -ball.vy;
  normalizeVel(ball);
}

function normalizeVel(b) {
  const mag = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  if (mag > 0) { b.vx /= mag; b.vy /= mag; }
}

// ============================================================
//  更新
// ============================================================
function update(dt) {
  if (gameState !== 'playing') return;

  // レーザークールダウン
  if (laserCooldown > 0) laserCooldown -= dt;

  // レーザー長押しチャージ
  if (laserActive) {
    laserHoldTime += dt;
    const pct = Math.min(laserHoldTime / WAVE_CHARGE_FRAMES * 100, 100);
    waveChargeInner.style.width = pct + '%';
    if (laserHoldTime >= WAVE_CHARGE_FRAMES && !waveCannonReady) {
      waveCannonReady = true;
      laserBtn.classList.add('wavecannon');
    }
  }

  // バー自動追跡 (レーザー or 波動砲チャージ中は停止)
  if (!laserActive) {
    const target = ball.x - bar.w / 2;
    const diff   = target - bar.x;
    const move   = Math.sign(diff) * Math.min(Math.abs(diff), BAR_SPEED * dt);
    bar.x = Math.max(0, Math.min(CW - bar.w, bar.x + move));
  }

  // ボール移動
  const spd = BALL_SPEED * (laserActive ? LASER_SPEED_MULT : 1) * dt;
  ball.x += ball.vx * spd;
  ball.y += ball.vy * spd;

  // 壁反射
  if (ball.x - ball.r < 0) {
    ball.x  = ball.r;
    ball.vx = Math.abs(ball.vx);
  } else if (ball.x + ball.r > CW) {
    ball.x  = CW - ball.r;
    ball.vx = -Math.abs(ball.vx);
  }
  if (ball.y - ball.r < 0) {
    ball.y  = ball.r;
    ball.vy = Math.abs(ball.vy);
  }

  // バーとの衝突
  if (
    ball.vy > 0 &&
    ball.y + ball.r >= bar.y &&
    ball.y - ball.r <= bar.y + bar.h &&
    ball.x + ball.r >= bar.x &&
    ball.x - ball.r <= bar.x + bar.w
  ) {
    ball.y = bar.y - ball.r;
    const hitPos = Math.max(-0.9, Math.min(0.9,
      (ball.x - (bar.x + bar.w / 2)) / (bar.w / 2)
    ));
    ball.vx = hitPos;
    ball.vy = -Math.sqrt(Math.max(0, 1 - hitPos * hitPos));
    normalizeVel(ball);
  }

  // ブロック衝突
  checkBlockCollisionForBall(ball);

  // 通常レーザー発射
  if (laserActive && !waveCannonReady && laserCooldown <= 0) {
    fireLaser();
    laserCooldown = LASER_COOLDOWN;
  }

  // 黄色ボール更新
  updateExtraBalls(dt);

  // 波動砲エフェクト更新
  if (waveFlash > 0) waveFlash -= dt;

  // ボール落下
  if (ball.y - ball.r > CH) {
    lives--;
    if (lives <= 0) {
      gameState = 'gameover';
    } else {
      resetBall();
    }
  }

  // クリア判定
  if (destroyed >= total) {
    gameState = 'win';
  }
}

// ============================================================
//  黄色ボール（分裂弾）
// ============================================================
function fireExtraBalls() {
  if (gameState !== 'playing') return;
  const cx = bar.x + bar.w / 2;
  const cy = bar.y - BALL_RADIUS - 2;
  // 左斜め上 (135°) と右斜め上 (45°)
  extraBalls.push({ x: cx, y: cy, vx: -Math.SQRT1_2, vy: -Math.SQRT1_2, r: BALL_RADIUS });
  extraBalls.push({ x: cx, y: cy, vx:  Math.SQRT1_2, vy: -Math.SQRT1_2, r: BALL_RADIUS });
}

function updateExtraBalls(dt) {
  const spd = BALL_SPEED * dt;
  extraBalls = extraBalls.filter(b => {
    b.x += b.vx * spd;
    b.y += b.vy * spd;

    // 壁反射
    if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx); }
    else if (b.x + b.r > CW) { b.x = CW - b.r; b.vx = -Math.abs(b.vx); }
    if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy); }

    // バー反射
    if (
      b.vy > 0 &&
      b.y + b.r >= bar.y && b.y - b.r <= bar.y + bar.h &&
      b.x + b.r >= bar.x && b.x - b.r <= bar.x + bar.w
    ) {
      b.y = bar.y - b.r;
      b.vy = -Math.abs(b.vy);
    }

    // ブロック衝突
    checkBlockCollisionForBall(b);

    // 画面外に落ちたら除去（ゲームオーバーなし）
    return b.y - b.r <= CH;
  });
}

// ============================================================
//  波動砲
// ============================================================
function fireWaveCannon() {
  const centerX  = bar.x + bar.w / 2;
  const halfWidth = BLOCK_W * 1.25;  // 2.5ブロック幅 / 2

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!blocks[r][c]) continue;
      const bkCX = c * BLOCK_W + BLOCK_W / 2;
      if (bkCX >= centerX - halfWidth && bkCX <= centerX + halfWidth) {
        blocks[r][c] = false;
        destroyed++;
        score += 8;
      }
    }
  }
  waveFlash = 15;  // 閃光エフェクト
}

// ============================================================
//  ブロック衝突（汎用）
// ============================================================
function checkBlockCollisionForBall(b) {
  const bx = b.x, by = b.y, br = b.r;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!blocks[r][c]) continue;

      const bkX = c * BLOCK_W + BLOCK_PAD;
      const bkY = r * BLOCK_H + BLOCK_PAD;
      const bkW = BLOCK_W - BLOCK_PAD * 2;
      const bkH = BLOCK_H - BLOCK_PAD * 2;

      const cx = Math.max(bkX, Math.min(bx, bkX + bkW));
      const cy = Math.max(bkY, Math.min(by, bkY + bkH));
      const dx = bx - cx;
      const dy = by - cy;

      if (dx * dx + dy * dy < br * br) {
        blocks[r][c] = false;
        destroyed++;
        score += 10;

        if (Math.abs(dy) >= Math.abs(dx)) {
          b.vy = -b.vy;
        } else {
          b.vx = -b.vx;
        }
        normalizeVel(b);
        return;
      }
    }
  }
}

function fireLaser() {
  const laserX = bar.x + bar.w / 2;
  const col    = Math.floor(laserX / BLOCK_W);
  if (col < 0 || col >= COLS) return;

  for (let r = ROWS - 1; r >= 0; r--) {
    if (blocks[r][col]) {
      blocks[r][col] = false;
      destroyed++;
      score += 5;
      return;
    }
  }
}

// ============================================================
//  描画
// ============================================================
function draw() {
  ctx.clearRect(0, 0, CW, CH);

  // 背景
  if (bgImg._ready) {
    ctx.drawImage(bgImg, 0, 0, CW, CH);
  } else {
    const grad = ctx.createLinearGradient(0, 0, 0, CH);
    grad.addColorStop(0, '#0a0a2e');
    grad.addColorStop(1, '#1a0840');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CW, CH);
  }

  // プレイエリアの暗めオーバーレイ
  const playY = CH * BLOCK_AREA;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fillRect(0, playY, CW, CH - playY);

  // ブロック
  drawBlocks();

  // 波動砲エフェクト（チャージ中 or 閃光）
  if (gameState === 'playing') {
    if (waveFlash > 0) {
      drawWaveCannonFlash();
    } else if (laserActive && waveCannonReady) {
      drawWaveCannonBeam();
    } else if (laserActive) {
      drawLaserBeam();
    }
  }

  // ボール・バー・黄色ボール
  if (gameState !== 'start') {
    drawExtraBalls();
    drawBall();
    drawBar();
  }

  // HUD
  if (gameState !== 'start') drawHUD();

  // スクリーンオーバーレイ
  if      (gameState === 'start')    drawStartScreen();
  else if (gameState === 'gameover') drawGameOverScreen();
  else if (gameState === 'win')      drawWinScreen();
}

function drawBlocks() {
  if (!blocks) return;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!blocks[r][c]) continue;

      const x = c * BLOCK_W + BLOCK_PAD;
      const y = r * BLOCK_H + BLOCK_PAD;
      const w = BLOCK_W - BLOCK_PAD * 2;
      const h = BLOCK_H - BLOCK_PAD * 2;

      ctx.fillStyle = BLOCK_COLORS[r % BLOCK_COLORS.length];
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 3);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

function drawExtraBalls() {
  for (const b of extraBalls) {
    // 影
    ctx.beginPath();
    ctx.arc(b.x + 2, b.y + 2, b.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fill();

    // 本体（黄色グラデーション）
    const grad = ctx.createRadialGradient(
      b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.1,
      b.x, b.y, b.r
    );
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.5, '#ffee44');
    grad.addColorStop(1, '#ff9900');
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // 輝きリング
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r + 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 220, 0, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawBall() {
  ctx.beginPath();
  ctx.arc(ball.x + 2, ball.y + 2, ball.r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fill();

  const grad = ctx.createRadialGradient(
    ball.x - ball.r * 0.3, ball.y - ball.r * 0.3, ball.r * 0.1,
    ball.x, ball.y, ball.r
  );
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(1, '#aaccff');
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
}

function drawBar() {
  const grad = ctx.createLinearGradient(bar.x, bar.y, bar.x, bar.y + bar.h);
  if (waveCannonReady) {
    grad.addColorStop(0, '#ffff99');
    grad.addColorStop(1, '#ccaa00');
  } else if (laserActive) {
    grad.addColorStop(0, '#ff9999');
    grad.addColorStop(1, '#cc2222');
  } else {
    grad.addColorStop(0, '#88bbff');
    grad.addColorStop(1, '#2255cc');
  }

  ctx.beginPath();
  ctx.roundRect(bar.x, bar.y, bar.w, bar.h, 5);
  ctx.fillStyle = grad;
  ctx.fill();

  const strokeColor = waveCannonReady
    ? 'rgba(255,255,100,0.9)'
    : laserActive
      ? 'rgba(255,180,180,0.7)'
      : 'rgba(180,220,255,0.7)';
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawLaserBeam() {
  const lx  = bar.x + bar.w / 2;
  const col = Math.floor(lx / BLOCK_W);
  let endY  = 0;

  if (col >= 0 && col < COLS) {
    for (let r = ROWS - 1; r >= 0; r--) {
      if (blocks[r][col]) {
        endY = r * BLOCK_H + BLOCK_H;
        break;
      }
    }
  }

  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  ctx.moveTo(lx, bar.y);
  ctx.lineTo(lx, endY);
  ctx.strokeStyle = '#ff6666';
  ctx.lineWidth = 18;
  ctx.stroke();

  ctx.globalAlpha = 1;
  const lgrad = ctx.createLinearGradient(0, bar.y, 0, endY);
  lgrad.addColorStop(0, '#ff4444');
  lgrad.addColorStop(1, 'rgba(255, 220, 80, 0.5)');
  ctx.beginPath();
  ctx.moveTo(lx, bar.y);
  ctx.lineTo(lx, endY);
  ctx.strokeStyle = lgrad;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();
}

function drawWaveCannonBeam() {
  const cx      = bar.x + bar.w / 2;
  const beamW   = BLOCK_W * 2.5;
  const left    = cx - beamW / 2;

  ctx.save();

  // 外側グロー
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#ffff44';
  ctx.fillRect(left, 0, beamW, bar.y);

  // 中央コア
  ctx.globalAlpha = 0.85;
  const lgrad = ctx.createLinearGradient(0, 0, 0, bar.y);
  lgrad.addColorStop(0, 'rgba(255,255,200,0.95)');
  lgrad.addColorStop(1, 'rgba(255,200,0,0.7)');
  ctx.fillStyle = lgrad;
  ctx.fillRect(cx - 6, 0, 12, bar.y);

  // 輝きライン
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, bar.y);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}

function drawWaveCannonFlash() {
  const cx    = bar.x + bar.w / 2;
  const beamW = BLOCK_W * 2.5;
  const alpha = Math.min(1, waveFlash / 8);

  ctx.save();
  ctx.globalAlpha = alpha * 0.7;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(cx - beamW / 2, 0, beamW, CH);
  ctx.restore();
}

function drawHUD() {
  const pad = 8;
  const hh  = 22;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, CH - hh, CW, hh);

  ctx.font = 'bold 13px monospace';

  ctx.fillStyle = '#ffe080';
  ctx.textAlign = 'left';
  ctx.fillText('SCORE: ' + score, pad, CH - 6);

  ctx.textAlign = 'center';
  let hearts = '';
  for (let i = 0; i < LIVES_MAX; i++) hearts += i < lives ? '❤' : '♡';
  ctx.fillStyle = '#ff8888';
  ctx.fillText(hearts, CW / 2, CH - 6);

  const pct = Math.floor(destroyed / total * 100);
  ctx.fillStyle = '#88ddff';
  ctx.textAlign = 'right';
  ctx.fillText(pct + '%', CW - pad, CH - 6);
}

// ============================================================
//  スクリーンオーバーレイ
// ============================================================
function drawOverlay(alpha) {
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.fillRect(0, 0, CW, CH);
}

function drawStartScreen() {
  drawOverlay(0.72);
  const cx = CW / 2;

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px "Hiragino Sans", "Noto Sans JP", sans-serif';
  ctx.fillText('ブロック崩し', cx, CH * 0.38);

  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '17px "Hiragino Sans", "Noto Sans JP", sans-serif';
  ctx.fillText('タップして開始', cx, CH * 0.48);

  ctx.font = '13px "Hiragino Sans", "Noto Sans JP", sans-serif';
  ctx.fillStyle = 'rgba(255, 230, 150, 0.9)';
  const rules = [
    '🏓 バーは自動でボールを追いかけます',
    '◎ 分裂弾：左右45°に黄色ボール発射',
    '⚡ レーザー砲：ブロックを直接破壊',
    '💥 3秒長押し→波動砲で列ごと消滅',
  ];
  rules.forEach((line, i) => {
    ctx.fillText(line, cx, CH * 0.57 + i * 24);
  });
}

function drawGameOverScreen() {
  drawOverlay(0.7);
  ctx.textAlign = 'center';

  ctx.fillStyle = '#ff6666';
  ctx.font = 'bold 36px "Hiragino Sans", "Noto Sans JP", sans-serif';
  ctx.fillText('GAME OVER', CW / 2, CH * 0.42);

  ctx.fillStyle = '#ffe080';
  ctx.font = '20px monospace';
  ctx.fillText('SCORE: ' + score, CW / 2, CH * 0.52);

  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '16px "Hiragino Sans", "Noto Sans JP", sans-serif';
  ctx.fillText('タップしてもう一度', CW / 2, CH * 0.62);
}

function drawWinScreen() {
  drawOverlay(0.5);
  ctx.textAlign = 'center';

  ctx.fillStyle = '#ffdd44';
  ctx.font = 'bold 36px "Hiragino Sans", "Noto Sans JP", sans-serif';
  ctx.fillText('CLEAR!', CW / 2, CH * 0.42);

  ctx.fillStyle = '#ffffff';
  ctx.font = '20px monospace';
  ctx.fillText('SCORE: ' + score, CW / 2, CH * 0.52);

  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '16px "Hiragino Sans", "Noto Sans JP", sans-serif';
  ctx.fillText('タップしてもう一度', CW / 2, CH * 0.62);
}

// ============================================================
//  ゲームループ
// ============================================================
function gameLoop(timestamp) {
  const dt = lastFrameTime
    ? Math.min((timestamp - lastFrameTime) / (1000 / 60), 2.5)
    : 1;
  lastFrameTime = timestamp;

  update(dt);
  draw();

  requestAnimationFrame(gameLoop);
}

// ============================================================
//  イベント
// ============================================================
canvas.addEventListener('pointerdown', () => {
  if (gameState === 'start' || gameState === 'gameover' || gameState === 'win') {
    initGame();
  }
});

// 分裂弾ボタン
ballBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  ballBtn.classList.add('active');
  fireExtraBalls();
});
ballBtn.addEventListener('pointerup',    (e) => { e.preventDefault(); ballBtn.classList.remove('active'); });
ballBtn.addEventListener('pointerleave', (e) => { e.preventDefault(); ballBtn.classList.remove('active'); });

// レーザー砲ボタン
function laserOn(e) {
  e.preventDefault();
  laserActive = true;
  laserBtn.classList.add('active');
}
function laserOff(e) {
  e.preventDefault();
  // 波動砲チャージ完了していたら発射
  if (waveCannonReady && gameState === 'playing') {
    fireWaveCannon();
  }
  laserActive     = false;
  laserHoldTime   = 0;
  waveCannonReady = false;
  waveChargeInner.style.width = '0%';
  laserBtn.classList.remove('active', 'wavecannon');
}

laserBtn.addEventListener('mousedown',  laserOn,  { passive: false });
laserBtn.addEventListener('mouseup',    laserOff, { passive: false });
laserBtn.addEventListener('mouseleave', laserOff, { passive: false });
laserBtn.addEventListener('touchstart', laserOn,  { passive: false });
laserBtn.addEventListener('touchend',   laserOff, { passive: false });
laserBtn.addEventListener('touchcancel',laserOff, { passive: false });

// ============================================================
//  起動
// ============================================================
window.addEventListener('resize', () => {
  resize();
  draw();
});

resize();
requestAnimationFrame(gameLoop);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
