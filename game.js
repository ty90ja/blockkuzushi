'use strict';

// ============================================================
//  定数
// ============================================================
const COLS         = 10;
const ROWS         = 6;
const BLOCK_PAD    = 2;           // ブロック間の隙間 (px)
const BLOCK_AREA   = 0.52;        // 画面上部のブロックエリア割合
const BALL_SPEED   = 5.5;         // ボール速度 (px / 60fps フレーム)
const BALL_RADIUS  = 8;
const BAR_SPEED    = 8.5;         // バー最大速度 (px / フレーム)
const BAR_HEIGHT   = 14;
const LIVES_MAX    = 3;
const LASER_SPEED_MULT  = 1.5;   // レーザー中のボール速度倍率
const LASER_COOLDOWN    = 10;    // ブロック破壊間隔 (フレーム)

// ブロック色 (行ごと)
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
const canvas   = document.getElementById('gameCanvas');
const ctx      = canvas.getContext('2d');
const laserBtn = document.getElementById('laserBtn');

// ============================================================
//  背景画像
//  差し替えたい場合は images/bg.jpg を置き換えるだけでOK
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
let CW, CH, BLOCK_W, BLOCK_H, BAR_W;  // キャンバスサイズ (resize で決定)

let gameState = 'start';   // 'start' | 'playing' | 'gameover' | 'win'
let score, lives, destroyed, total;
let blocks;                // 2D boolean array
let ball, bar;
let laserActive = false;
let laserCooldown = 0;
let lastFrameTime = 0;

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

  // 再プレイ中はバー位置を修正
  if (bar) {
    bar.y = CH - 50;
    bar.w = BAR_W;
    bar.h = BAR_HEIGHT;
  }
}

// ============================================================
//  ゲーム初期化
// ============================================================
function initGame() {
  score     = 0;
  lives     = LIVES_MAX;
  destroyed = 0;
  total     = COLS * ROWS;

  blocks = Array.from({ length: ROWS }, () => new Array(COLS).fill(true));

  bar = { x: CW / 2 - BAR_W / 2, y: CH - 50, w: BAR_W, h: BAR_HEIGHT };

  resetBall();
  laserActive   = false;
  laserCooldown = 0;
  gameState     = 'playing';
}

function resetBall() {
  // 少しランダムな上向き角度
  const angle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 3);
  ball = {
    x:  CW / 2,
    y:  bar.y - BALL_RADIUS - 2,
    vx: Math.cos(angle),
    vy: Math.sin(angle),
    r:  BALL_RADIUS,
  };
  // vy は必ず上向き (負)
  if (ball.vy > 0) ball.vy = -ball.vy;
  normalizeVel();
}

function normalizeVel() {
  const mag = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
  if (mag > 0) { ball.vx /= mag; ball.vy /= mag; }
}

// ============================================================
//  更新
// ============================================================
function update(dt) {
  if (gameState !== 'playing') return;

  // --- レーザークールダウン ---
  if (laserCooldown > 0) laserCooldown -= dt;

  // --- バー自動追跡 (レーザー中は停止) ---
  if (!laserActive) {
    const target = ball.x - bar.w / 2;
    const diff   = target - bar.x;
    const move   = Math.sign(diff) * Math.min(Math.abs(diff), BAR_SPEED * dt);
    bar.x = Math.max(0, Math.min(CW - bar.w, bar.x + move));
  }

  // --- ボール移動 ---
  const spd = BALL_SPEED * (laserActive ? LASER_SPEED_MULT : 1) * dt;
  ball.x += ball.vx * spd;
  ball.y += ball.vy * spd;

  // --- 壁反射 ---
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

  // --- バーとの衝突 ---
  if (
    ball.vy > 0 &&
    ball.y + ball.r >= bar.y &&
    ball.y - ball.r <= bar.y + bar.h &&
    ball.x + ball.r >= bar.x &&
    ball.x - ball.r <= bar.x + bar.w
  ) {
    ball.y = bar.y - ball.r;
    const hitPos  = Math.max(-0.9, Math.min(0.9,
      (ball.x - (bar.x + bar.w / 2)) / (bar.w / 2)
    ));
    ball.vx = hitPos;
    ball.vy = -Math.sqrt(Math.max(0, 1 - hitPos * hitPos));
    normalizeVel();
  }

  // --- ブロック衝突 ---
  checkBlockCollisions();

  // --- レーザー発射 ---
  if (laserActive && laserCooldown <= 0) {
    fireLaser();
    laserCooldown = LASER_COOLDOWN;
  }

  // --- ボール落下 → ライフ減少 ---
  if (ball.y - ball.r > CH) {
    lives--;
    if (lives <= 0) {
      gameState = 'gameover';
    } else {
      resetBall();
    }
  }

  // --- 全ブロック破壊 → クリア ---
  if (destroyed >= total) {
    gameState = 'win';
  }
}

function checkBlockCollisions() {
  const bx = ball.x, by = ball.y, br = ball.r;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!blocks[r][c]) continue;

      const bkX = c * BLOCK_W + BLOCK_PAD;
      const bkY = r * BLOCK_H + BLOCK_PAD;
      const bkW = BLOCK_W - BLOCK_PAD * 2;
      const bkH = BLOCK_H - BLOCK_PAD * 2;

      // 最近傍点
      const cx = Math.max(bkX, Math.min(bx, bkX + bkW));
      const cy = Math.max(bkY, Math.min(by, bkY + bkH));
      const dx = bx - cx;
      const dy = by - cy;

      if (dx * dx + dy * dy < br * br) {
        blocks[r][c] = false;
        destroyed++;
        score += 10;

        // 反射方向を決定
        if (Math.abs(dy) >= Math.abs(dx)) {
          ball.vy = -ball.vy;
        } else {
          ball.vx = -ball.vx;
        }
        normalizeVel();
        return; // 1フレーム1ブロックまで
      }
    }
  }
}

function fireLaser() {
  const laserX = bar.x + bar.w / 2;
  const col    = Math.floor(laserX / BLOCK_W);
  if (col < 0 || col >= COLS) return;

  // バー側 (下) から一番近いブロックを破壊
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

  // --- 背景画像 (ブロックが消えるほど見えてくる) ---
  if (bgImg._ready) {
    ctx.drawImage(bgImg, 0, 0, CW, CH);
  } else {
    // 画像未ロード時のグラデーション
    const grad = ctx.createLinearGradient(0, 0, 0, CH);
    grad.addColorStop(0, '#0a0a2e');
    grad.addColorStop(1, '#1a0840');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CW, CH);
  }

  // --- プレイエリア (バー・ボール周辺) に暗めのオーバーレイ ---
  const playY = CH * BLOCK_AREA;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fillRect(0, playY, CW, CH - playY);

  // --- ブロック (生きているものだけ描画 → 破壊済みは背景が透けて見える) ---
  drawBlocks();

  // --- レーザービーム ---
  if (laserActive && gameState === 'playing') {
    drawLaserBeam();
  }

  // --- ボール ---
  if (gameState !== 'start') {
    drawBall();
    drawBar();
  }

  // --- スコア・ライフ表示 ---
  if (gameState !== 'start') drawHUD();

  // --- スクリーンオーバーレイ ---
  if      (gameState === 'start')    drawStartScreen();
  else if (gameState === 'gameover') drawGameOverScreen();
  else if (gameState === 'win')      drawWinScreen();
}

function drawBlocks() {
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

function drawBall() {
  // 影
  ctx.beginPath();
  ctx.arc(ball.x + 2, ball.y + 2, ball.r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fill();

  // 本体
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
  if (laserActive) {
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

  ctx.strokeStyle = laserActive ? 'rgba(255,180,180,0.7)' : 'rgba(180,220,255,0.7)';
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
        endY = r * BLOCK_H + BLOCK_H; // ブロック下端まで光線を伸ばす
        break;
      }
    }
  }

  // グロー (外側)
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  ctx.moveTo(lx, bar.y);
  ctx.lineTo(lx, endY);
  ctx.strokeStyle = '#ff6666';
  ctx.lineWidth = 18;
  ctx.stroke();

  // コア (内側)
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

function drawHUD() {
  const pad = 8;
  const hh  = 22;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, CH - hh, CW, hh);

  ctx.font = 'bold 13px monospace';

  // スコア
  ctx.fillStyle = '#ffe080';
  ctx.textAlign = 'left';
  ctx.fillText('SCORE: ' + score, pad, CH - 6);

  // ライフ (ハート)
  ctx.textAlign = 'center';
  let hearts = '';
  for (let i = 0; i < LIVES_MAX; i++) hearts += i < lives ? '❤' : '♡';
  ctx.fillStyle = '#ff8888';
  ctx.fillText(hearts, CW / 2, CH - 6);

  // 進捗
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

  // ルール説明
  ctx.font = '13px "Hiragino Sans", "Noto Sans JP", sans-serif';
  ctx.fillStyle = 'rgba(255, 230, 150, 0.9)';
  const rules = [
    '🏓 バーは自動でボールを追いかけます',
    '⚡ レーザーボタンでブロックを直接破壊',
    '⚠️ レーザー中はバーが止まり速度UP',
  ];
  rules.forEach((line, i) => {
    ctx.fillText(line, cx, CH * 0.58 + i * 24);
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

// タップ / クリックで開始・リスタート
canvas.addEventListener('pointerdown', () => {
  if (gameState === 'start' || gameState === 'gameover' || gameState === 'win') {
    initGame();
  }
});

// レーザーボタン (マウス & タッチ両対応)
function laserOn(e) {
  e.preventDefault();
  laserActive = true;
  laserBtn.classList.add('active');
}
function laserOff(e) {
  e.preventDefault();
  laserActive = false;
  laserBtn.classList.remove('active');
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

// サービスワーカー登録
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
