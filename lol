<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Utilix — 404 / Secret Game</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #0d0d0f; --fg: #f2f2f7; --accent: #00c6ff; --accent2: #0072ff; --muted: #a0a0a7;
      --green: #2ee79d; --red: #ff5a7a; --yellow: #ffd166; --panel: #121217; --panel-2: #0f0f14;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      height: 100%; font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: radial-gradient(circle at top, #1a1a1d, var(--bg)); color: var(--fg);
      -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; overflow: hidden;
    }
    body { display: flex; flex-direction: column; min-height: 100vh; position: relative; }
    header {
      position: fixed; inset-inline: 0; top: 0; z-index: 1100; padding: 1rem 2rem;
      display: flex; justify-content: space-between; align-items: center;
      backdrop-filter: blur(10px); border-bottom: 1px solid rgba(255,255,255,0.02);
    }
    .logo { font-weight: 800; font-size: 1.25rem; background: linear-gradient(90deg, var(--accent), var(--accent2));
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    nav.header-nav ul { display: flex; gap: 1.25rem; list-style: none; align-items: center; }
    nav.header-nav a {
      color: var(--fg); text-decoration: none; font-weight: 600; position: relative; padding: 6px 6px; border-radius: 6px;
      transition: transform 0.15s ease; user-select: none;
    }
    nav.header-nav a::after { content: ''; position: absolute; left: 0; bottom: -6px; width: 0%; height: 2px; background: var(--accent); transition: width 0.28s ease; }
    nav.header-nav a:hover { transform: translateY(-2px); }
    nav.header-nav a:hover::after { width: 100%; }

    main {
      flex-grow: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;
      padding: 0 1rem; margin-top: 72px; position: relative; z-index: 10; user-select: none;
    }
    h1 {
      font-size: 7rem; font-weight: 800; background: linear-gradient(90deg, var(--accent), var(--accent2));
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 0.5rem;
      text-shadow: 0 0 15px rgba(0,198,255,0.9); letter-spacing: 0.05em;
    }
    h2 { font-weight: 600; font-size: 1.75rem; margin-bottom: 1.5rem; color: var(--muted); text-shadow: 0 0 6px rgba(0,198,255,0.3); }
    p  { color: var(--muted); margin-bottom: 2rem; max-width: 400px; line-height: 1.4; font-size: 1.1rem; text-shadow: 0 0 5px rgba(0,198,255,0.15); }
    a.button-home {
      display: inline-block; padding: 0.75rem 1.75rem; background: linear-gradient(90deg, var(--accent), var(--accent2)); color: white;
      border-radius: 50px; font-weight: 700; text-decoration: none; box-shadow: 0 8px 30px rgba(0,198,255,0.25);
      transition: transform 0.18s ease, box-shadow 0.18s ease; user-select: none;
    }
    a.button-home:hover { transform: translateY(-4px); box-shadow: 0 18px 60px rgba(0,198,255,0.45); }

    /* Canvases */
    #starfield { position: fixed; inset: 0; z-index: 1; pointer-events: none; background: transparent; filter: drop-shadow(0 0 2px rgba(0,198,255,0.3)); }
    #gameCanvas { position: fixed; inset: 0; z-index: 200; display: none; }

    /* HUD / Controls */
    .hud { position: fixed; top: 10px; left: 10px; z-index: 300; display: none; gap: 10px; align-items: center; font-weight: 700; }
    .hud .pill {
      background: rgba(20,20,30,0.6); border: 1px solid rgba(255,255,255,0.08); padding: 8px 12px; border-radius: 999px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.25); backdrop-filter: blur(6px);
    }
    .controls { position: fixed; top: 10px; right: 10px; z-index: 300; display: none; gap: 8px; }
    .ctrl-btn {
      background: linear-gradient(90deg, rgba(0,198,255,0.2), rgba(0,114,255,0.2));
      border: 1px solid rgba(255,255,255,0.12); color: var(--fg); padding: 8px 12px; border-radius: 10px; font-weight: 700;
      cursor: pointer; transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .ctrl-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(0,198,255,0.25); }

    /* Overlays */
    .overlay { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; z-index: 400; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px); }
    .panel {
      width: min(95vw, 820px); background: linear-gradient(180deg, var(--panel), var(--panel-2));
      border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 18px; box-shadow: 0 30px 100px rgba(0,0,0,0.55);
    }
    .panel h3 { font-size: 1.3rem; margin-bottom: 10px; }
    .panel small { color: var(--muted); }
    .upg-grid { margin-top: 12px; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
    .card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 12px; }
    .card h4 { margin-bottom: 6px; }
    .bar { height: 8px; background: rgba(255,255,255,0.08); border-radius: 6px; overflow: hidden; margin: 8px 0 10px; }
    .bar > span { display: block; height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent2)); width: 0%; }
    .card .meta { display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 8px; color: var(--muted); }
    .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 10px; }
    .btn {
      background: linear-gradient(90deg, var(--accent), var(--accent2)); border: none; color: white; padding: 8px 12px; border-radius: 10px; cursor: pointer; font-weight: 800;
      box-shadow: 0 10px 30px rgba(0,198,255,0.35);
    }
    .btn[disabled] { filter: grayscale(0.5); opacity: 0.6; cursor: not-allowed; }
    .ghost { background: transparent; color: var(--fg); border: 1px solid rgba(255,255,255,0.15); }
    .center { text-align: center; }
    .mode-buttons { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-top: 12px; }
    .subtitle { color: var(--muted); margin-top: 6px; }

    /* Boss bar */
    #bossBarWrap { position: fixed; top: 54px; left: 50%; transform: translateX(-50%); width: min(900px, 90vw);
      z-index: 305; display: none; }
    #bossBar { height: 16px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; overflow: hidden; }
    #bossBar > span { display:block; height:100%; width:0%; background: linear-gradient(90deg, #ff5a7a, #ffb770); }
    #bossLabel { font-weight: 800; font-size: 0.95rem; margin-bottom: 6px; text-align: center; }

    /* Utility */
    .hidden { display: none !important; }
    .show { display: flex !important; }
  </style>
</head>
<body>
  <!-- Normal 404 -->
  <header id="normalHeader">
    <div class="logo">Utilix</div>
    <nav class="header-nav" aria-label="Primary navigation">
      <ul>
        <li><a href="/">Home</a></li>
        <li><a href="/faq">FAQ</a></li>
        <li><a href="/setup">Setup</a></li>
      </ul>
    </nav>
  </header>

  <main id="normalMain" role="main" aria-labelledby="pageTitle">
    <h1 id="pageTitle">404</h1>
    <h2>Page Not Found</h2>
    <p>Sorry, the page you’re looking for doesn’t exist or has been moved.</p>
    <a href="/index.html" class="button-home" aria-label="Go back to homepage">Go to Home</a>
  </main>

  <!-- Background -->
  <canvas id="starfield"></canvas>

  <!-- Game -->
  <canvas id="gameCanvas"></canvas>

  <!-- HUD -->
  <div id="hud" class="hud">
    <div class="pill">Mode: <span id="hudMode">—</span></div>
    <div class="pill">Wave: <span id="hudWave">—</span></div>
    <div class="pill">Score: <span id="hudScore">0</span></div>
    <div class="pill">Credits: <span id="hudCredits">0</span></div>
    <div class="pill">HP: <span id="hudHP">100</span></div>
    <div class="pill">Evo: <span id="hudEvo">0</span></div>
  </div>
  <div id="controls" class="controls">
    <button class="ctrl-btn" id="btnUpgrades">Upgrades (U)</button>
    <button class="ctrl-btn" id="btnPause">Pause (Esc)</button>
    <button class="ctrl-btn" id="btnMute">Mute</button>
    <button class="ctrl-btn" id="btnExit">Exit</button>
  </div>

  <!-- Boss HP -->
  <div id="bossBarWrap">
    <div id="bossLabel">Boss</div>
    <div id="bossBar"><span></span></div>
  </div>

  <!-- Mode Selector -->
  <div id="overlayModes" class="overlay">
    <div class="panel center">
      <h3>Select Game Mode</h3>
      <p class="subtitle">Press <b>1</b> for Endless (Infinity) or <b>2</b> for Waves. Auto-starts Endless in <span id="modeCountdown">2</span>s.</p>
      <div class="mode-buttons">
        <button class="btn" id="btnModeEndless">Endless (Infinity)</button>
        <button class="btn ghost" id="btnModeWaves">Waves + Shop</button>
      </div>
      <div class="subtitle" style="margin-top:10px;">Move: A/D or ←/→ • Shoot: Space • Pause: Esc • Upgrades: U</div>
    </div>
  </div>

  <!-- Upgrade / Shop -->
  <div id="overlayUpgrades" class="overlay">
    <div class="panel">
      <div class="row" style="justify-content: space-between; align-items:center;">
        <h3>Ship Upgrades <small>(max level 20)</small></h3>
        <div class="row">
          <button class="btn ghost" id="btnReset">Reset Progress</button>
        </div>
      </div>
      <div class="upg-grid" id="upgGrid"></div>
      <div class="card" id="evoCard" style="display:none; margin-top:10px;">
        <h4>Evolution: Transform Hull</h4>
        <div class="meta"><span>Tier <span id="evoTier">0</span> ➜ <span id="evoNextTier">1</span></span><span>Permanent boost & new model</span></div>
        <ul style="margin-left:16px; color:var(--muted); line-height:1.4;">
          <li>+12% Damage & Fire Rate</li>
          <li>+15% Max HP</li>
          <li>+10% Speed</li>
          <li>New ship visuals</li>
        </ul>
        <div class="row" style="margin-top:8px;">
          <button class="btn" id="btnEvolve">Evolve — <span id="evoCost">2000</span>c</button>
          <small>Unlocks only when all core upgrades are level 20.</small>
        </div>
      </div>
      <div class="row" style="justify-content: space-between; margin-top: 14px;">
        <div class="pill">Credits: <span id="overlayCredits">0</span></div>
        <div class="row">
          <button class="btn ghost" id="closeUpgrades">Close (U)</button>
          <button class="btn" id="startNextWave">Start Next Wave</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Pause / Game Over -->
  <div id="overlayCenter" class="overlay">
    <div class="panel center">
      <h3 id="centerTitle">Paused</h3>
      <p id="centerSubtitle" class="subtitle">Press Esc to resume</p>
      <div class="row" style="justify-content:center; margin-top: 12px;">
        <button class="btn" id="centerResume">Resume</button>
        <button class="btn ghost" id="centerRestart">Restart</button>
        <button class="btn ghost" id="centerExit">Exit</button>
      </div>
    </div>
  </div>

  <script>
    /************** STARFIELD **************/
    const starCanvas = document.getElementById('starfield');
    const sctx = starCanvas.getContext('2d');
    let sw, sh, scx, scy;
    const maxDepth = 1200;
    const starCounts = { small: 300, medium: 200, large: 70 };
    const stars = [];
    const dustCount = 100; let dusts = [];
    const shootingStarCount = 8; let shootingStars = [];
    let baseHue = 190;
    const rr = (a,b)=>Math.random()*(b-a)+a;

    class Star{ constructor(cat){ this.cat=cat; this.init(); }
      init(){ this.x=(Math.random()*2-1)*sw; this.y=(Math.random()*2-1)*sh; this.z=Math.random()*maxDepth;
        this.base=this.cat==='small'?rr(0.15,0.5):this.cat==='medium'?rr(0.5,1.1):rr(1.1,2.0);
        this.speed=rr(0.4,1.8)*(this.cat==='large'?1.4:1); this.tw=rr(0.004,0.009); this.ph=Math.random()*Math.PI*2; }
      update(){ this.z-=this.speed; if(this.z<=1){ this.init(); this.z=maxDepth; } this.ph+=this.tw; }
      draw(){ const sx=scx+(this.x/this.z)*scx, sy=scy+(this.y/this.z)*scy, f=1-this.z/maxDepth, r=this.base*f*2;
        const tw=0.3*Math.sin(this.ph)+0.7, hue=(baseHue+60+this.ph*50)%360;
        const g=sctx.createRadialGradient(sx,sy,0,sx,sy,r*4); g.addColorStop(0,`hsla(${hue},100%,80%,${tw})`);
        g.addColorStop(0.5,`hsla(${hue},100%,60%,${tw*0.3})`); g.addColorStop(1,`hsla(${hue},100%,40%,0)`);
        sctx.fillStyle=g; sctx.beginPath(); sctx.arc(sx,sy,r,0,Math.PI*2); sctx.fill();
        sctx.fillStyle=`hsla(${hue},100%,90%,${tw})`; sctx.beginPath(); sctx.arc(sx,sy,r/2,0,Math.PI*2); sctx.fill(); } }
    class Dust{ constructor(){ this.reset(); }
      reset(){ this.x=Math.random()*sw; this.y=Math.random()*sh; this.r=rr(0.2,0.9); this.vx=rr(-0.01,0.01); this.vy=rr(-0.005,0.005);
        this.h=baseHue+rr(20,80); this.a=rr(0.05,0.15); this.tws=rr(0.002,0.004); this.ph=Math.random()*Math.PI*2; }
      update(){ this.x+=this.vx; this.y+=this.vy; this.ph+=this.tws; if(this.x>sw)this.x=0; else if(this.x<0)this.x=sw; if(this.y>sh)this.y=0; else if(this.y<0)this.y=sh; }
      draw(){ const a=this.a*(0.5+0.5*Math.sin(this.ph)); const g=sctx.createRadialGradient(this.x,this.y,0,this.x,this.y,this.r*5);
        g.addColorStop(0,`hsla(${this.h},100%,85%,${a})`); g.addColorStop(1,`hsla(${this.h},100%,30%,0)`); sctx.fillStyle=g; sctx.beginPath(); sctx.arc(this.x,this.y,this.r,0,Math.PI*2); sctx.fill(); } }
    class Meteor{ constructor(){ this.reset(); }
      reset(){ this.x=Math.random()*sw; this.y=Math.random()*sh*0.5; this.len=rr(80,130); this.sp=rr(20,45); this.a=Math.PI/4+(Math.random()-0.5)*0.3;
        this.alpha=0; this.amax=rr(0.6,1); this.ai=0.02; this.tr=this.len*0.7; this.active=false; this.wait=rr(1000,7000); this.waitc=0; }
      update(dt){ if(!this.active){ this.waitc+=dt; if(this.waitc>this.wait){ this.active=true; this.waitc=0; } return; }
        this.x+=this.sp*Math.cos(this.a)*(dt/16); this.y+=this.sp*Math.sin(this.a)*(dt/16);
        if(this.alpha<this.amax) this.alpha+=this.ai; if(this.alpha>this.amax) this.alpha=this.amax;
        this.len*=0.995; if(this.len<10||this.x>sw||this.y>sh) this.reset(); }
      draw(){ if(!this.active) return; sctx.save(); sctx.lineCap='round';
        const g=sctx.createLinearGradient(this.x,this.y,this.x-this.tr*Math.cos(this.a),this.y-this.tr*Math.sin(this.a));
        g.addColorStop(0,`rgba(255,255,255,${this.alpha})`); g.addColorStop(1,'rgba(255,255,255,0)');
        sctx.strokeStyle=g; sctx.lineWidth=2.5; sctx.shadowColor='white'; sctx.shadowBlur=8;
        sctx.beginPath(); sctx.moveTo(this.x,this.y); sctx.lineTo(this.x-this.tr*Math.cos(this.a),this.y-this.tr*Math.sin(this.a)); sctx.stroke();
        sctx.beginPath(); sctx.fillStyle=`rgba(255,255,255,${this.alpha})`; sctx.shadowBlur=14; sctx.shadowColor='white'; sctx.arc(this.x,this.y,2.2,0,Math.PI*2); sctx.fill(); sctx.restore(); } }

    function starInit(){
      sw=innerWidth; sh=innerHeight; scx=sw/2; scy=sh/2; starCanvas.width=sw; starCanvas.height=sh;
      stars.length=0; dusts.length=0; shootingStars.length=0;
      for(let i=0;i<starCounts.small;i++) stars.push(new Star('small'));
      for(let i=0;i<starCounts.medium;i++) stars.push(new Star('medium'));
      for(let i=0;i<starCounts.large;i++) stars.push(new Star('large'));
      for(let i=0;i<dustCount;i++) dusts.push(new Dust());
      for(let i=0;i<shootingStarCount;i++) shootingStars.push(new Meteor());
    }
    let slast=0; function starAnimate(t=0){
      const dt=t-slast; slast=t; baseHue+=0.03; if(baseHue>360) baseHue-=360;
      sctx.clearRect(0,0,sw,sh); dusts.forEach(d=>{ d.h=(baseHue+40)%360; d.update(); d.draw(); });
      stars.forEach(s=>{ s.update(); s.draw(); }); shootingStars.forEach(m=>{ m.update(dt); m.draw(); });
      requestAnimationFrame(starAnimate);
    }
    addEventListener('resize', starInit); starInit(); starAnimate();

    /************** GAME CORE **************/
    const normalHeader = document.getElementById('normalHeader');
    const normalMain = document.getElementById('normalMain');
    const gameCanvas = document.getElementById('gameCanvas');
    const g = gameCanvas.getContext('2d');

    // HUD refs
    const hud = document.getElementById('hud');
    const controls = document.getElementById('controls');
    const hudMode = document.getElementById('hudMode');
    const hudWave = document.getElementById('hudWave');
    const hudScore = document.getElementById('hudScore');
    const hudCredits = document.getElementById('hudCredits');
    const hudHP = document.getElementById('hudHP');
    const hudEvo = document.getElementById('hudEvo');

    // Overlays
    const overlayModes = document.getElementById('overlayModes');
    const modeCountdownEl = document.getElementById('modeCountdown');
    const overlayUpgrades = document.getElementById('overlayUpgrades');
    const overlayCenter = document.getElementById('overlayCenter');
    const overlayCredits = document.getElementById('overlayCredits');
    const centerTitle = document.getElementById('centerTitle');
    const centerSubtitle = document.getElementById('centerSubtitle');

    // Boss bar
    const bossBarWrap = document.getElementById('bossBarWrap');
    const bossBar = document.getElementById('bossBar').querySelector('span');
    const bossLabel = document.getElementById('bossLabel');

    // Buttons
    const btnModeEndless = document.getElementById('btnModeEndless');
    const btnModeWaves = document.getElementById('btnModeWaves');
    const btnUp = document.getElementById('btnUpgrades');
    const btnPause = document.getElementById('btnPause');
    const btnMute = document.getElementById('btnMute');
    const btnExit = document.getElementById('btnExit');
    const closeUpgrades = document.getElementById('closeUpgrades');
    const startNextWaveBtn = document.getElementById('startNextWave');
    const centerResume = document.getElementById('centerResume');
    const centerRestart = document.getElementById('centerRestart');
    const centerExit = document.getElementById('centerExit');
    const upgGrid = document.getElementById('upgGrid');
    const btnReset = document.getElementById('btnReset');

    // Evolution UI
    const evoCard = document.getElementById('evoCard');
    const evoTier = document.getElementById('evoTier');
    const evoNextTier = document.getElementById('evoNextTier');
    const evoCostEl = document.getElementById('evoCost');
    const btnEvolve = document.getElementById('btnEvolve');

    // Secret trigger
    const secretCode = "utilix";
    let typedKeys = "";

    // Save system
    const SAVE_KEY = 'utilix_save_v2';

    // Game state
    let W=innerWidth, H=innerHeight; function resizeGame(){ W=innerWidth; H=innerHeight; gameCanvas.width=W; gameCanvas.height=H; }
    addEventListener('resize', resizeGame);

    const keys={}; let gameRunning=false; let inShop=false; let paused=false; let muted=false;
    const clamp=(v,min,max)=>Math.max(min,Math.min(max,v)); const rand=(a,b)=>Math.random()*(b-a)+a;

    // Modes
    let mode=null; // 'endless' | 'waves'
    let endless={ time:0 };
    let wave=1, waveActive=false, enemiesToSpawn=0, spawnTimer=0;

    // Boss
    let boss=null;

    // Evo models
    const shipModels = [
      { name:'Mk I', color:'#9be7ff', outline:'#7fd2ff', dmg:1.00, firerate:1.00, hp:1.00, speed:1.00 },
      { name:'Mk II', color:'#a6ffe1', outline:'#79f7cf', dmg:1.12, firerate:1.12, hp:1.15, speed:1.10 },
      { name:'Mk III', color:'#ffd27e', outline:'#ffc357', dmg:1.25, firerate:1.25, hp:1.32, speed:1.21 },
      { name:'Mk IV', color:'#ff9bb8', outline:'#ff78a0', dmg:1.40, firerate:1.40, hp:1.50, speed:1.33 },
    ];
    const EVO_MAX = shipModels.length-1;
    function evolveCost(tier){ return 2000 * Math.pow(2, tier); } // 2000, 4000, 8000

    // Upgrades
    const MAX_LEVEL=20;
    const upgrades=[
      { id:'damage', name:'Laser Damage', desc:'+2 damage/level', level:1, max:MAX_LEVEL, baseCost:60,  value:()=> player.getDamage() },
      { id:'firerate', name:'Fire Rate', desc:'Shoot faster', level:1, max:MAX_LEVEL, baseCost:80, value:()=> Math.round(400/player.fireDelay*100)/100 },
      { id:'speed', name:'Ship Speed', desc:'+2 speed/level', level:1, max:MAX_LEVEL, baseCost:60, value:()=> player.speed },
      { id:'maxhp', name:'Hull Integrity', desc:'+10 max HP/level', level:1, max:MAX_LEVEL, baseCost:100, value:()=> player.maxHP },
      { id:'multishot', name:'Multishot', desc:'+1 bullet /5 lvls', level:1, max:MAX_LEVEL, baseCost:120, value:()=> player.getBulletCount() }
    ];
    const upgradeMap={}; upgrades.forEach(u=>upgradeMap[u.id]=u);

    // Player
    const player={
      x:0,y:0,w:36,h:36,
      model:0,
      speed:10,vx:0,hp:100,maxHP:100,
      score:0, credits:0, fireDelay:220, lastShot:0,
      baseDamage:10, baseDamageBoost:0,
      alive:true,
      getDamage(){ return Math.round((this.baseDamage + this.baseDamageBoost*2) * shipModels[this.model].dmg); },
      getBulletCount(){ return 1 + Math.floor((upgradeMap['multishot'].level-1)/5); },
      color(){ return shipModels[this.model].color; },
      outline(){ return shipModels[this.model].outline; }
    };

    const bullets=[], enemies=[], eBullets=[], powerups=[];
    let shieldTime=0, rapidTime=0;

    // Audio (safe small bleeps)
    function tone(freq, time=0.08, volume=0.03){
      if(muted) return;
      try{
        const ctx=(tone._ctx ||= new (window.AudioContext||window.webkitAudioContext)());
        const o=ctx.createOscillator(), g=ctx.createGain(); o.type='triangle'; o.frequency.value=freq; g.gain.value=volume;
        o.connect(g); g.connect(ctx.destination); o.start(); setTimeout(()=>o.stop(), time*1000);
      }catch(e){}
    }

    /************** SAVE / LOAD **************/
    function saveGame(){
      const data = {
        upgrades: upgrades.reduce((acc,u)=>{ acc[u.id]=u.level; return acc; },{}),
        model: player.model,
        credits: player.credits,
        maxHP: player.maxHP, // redundant but ok
        mode,
        highestWave: saveGame.highestWave || 1,
      };
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch(e){}
    }
    function loadGame(){
      try{
        const raw = localStorage.getItem(SAVE_KEY);
        if(!raw) return;
        const data = JSON.parse(raw);
        if(data.upgrades){
          for(const [id,lvl] of Object.entries(data.upgrades)){
            if(upgradeMap[id]) upgradeMap[id].level = Math.min(MAX_LEVEL, Math.max(1, lvl|0));
          }
        }
        player.model = Math.min(EVO_MAX, Math.max(0, (data.model|0)||0));
        player.credits = Math.max(0, (data.credits|0)||0);
        saveGame.highestWave = Math.max(1, (data.highestWave|0)||1);
      }catch(e){}
    }
    function resetProgress(){
      try{ localStorage.removeItem(SAVE_KEY); }catch(e){}
      upgrades.forEach(u=>u.level=1);
      player.model=0; player.credits=0;
      saveGame.highestWave=1;
      resetFromUpgrades();
      buildUpgradeCards();
      updateHUD();
    }

    /************** STATS APPLY **************/
    function resetFromUpgrades(){
      const model = shipModels[player.model];
      player.maxHP = Math.round((100 + (upgradeMap['maxhp'].level-1)*10) * model.hp);
      player.hp = Math.min(player.hp || player.maxHP, player.maxHP);
      player.baseDamageBoost = upgradeMap['damage'].level-1;
      player.speed = Math.round((10 + (upgradeMap['speed'].level-1)*2) * model.speed);
      const baseDelay = Math.max(60, 220 - (upgradeMap['firerate'].level-1)*8);
      player.fireDelay = Math.round(baseDelay / model.firerate);
    }

    function resetPlayer(){
      player.x=W/2; player.y=H-90; player.vx=0; player.hp=player.maxHP; player.score=0; player.alive=true;
      bullets.length=0; enemies.length=0; eBullets.length=0; powerups.length=0; boss=null;
      shieldTime=0; rapidTime=0;
    }

    /************** GAME START / MODES **************/
    function startGame(){
      normalHeader.classList.add('hidden'); normalMain.classList.add('hidden');
      gameCanvas.style.display='block'; hud.classList.add('show'); controls.classList.add('show');
      resizeGame(); resetFromUpgrades(); resetPlayer();
      overlayModes.classList.add('show');
      gameRunning=true; paused=true; inShop=false; mode=null; wave=1; endless.time=0; spawnTimer=0; enemiesToSpawn=0; waveActive=false;
      let sec=2; modeCountdownEl.textContent=sec;
      if (startGame._timer) clearInterval(startGame._timer);
      startGame._timer=setInterval(()=>{
        if(mode){ clearInterval(startGame._timer); return; }
        sec--; modeCountdownEl.textContent=sec;
        if(sec<=0){ clearInterval(startGame._timer); chooseEndless(); }
      },1000);
      lastTS = performance.now(); requestAnimationFrame(loop);
    }

    function chooseEndless(){
      if(mode==='endless') return;
      overlayModes.classList.remove('show');
      mode='endless'; hudMode.textContent='Endless';
      paused=false; inShop=false; endless.time=0; spawnTimer=0; boss=null; updateHUD();
      hudWave.textContent='∞';
      saveGame(); // remember mode
    }
    function chooseWaves(){
      if(mode==='waves') return;
      overlayModes.classList.remove('show');
      mode='waves'; hudMode.textContent='Waves';
      paused=true; inShop=true; wave = Math.max(1, saveGame.highestWave || 1); // continue from highest wave
      openShop(); // start at shop
      hudWave.textContent=wave;
      saveGame();
    }

    /************** SHOP / UPGRADES / EVOLUTION **************/
    function costFor(u){ const n=u.level; return Math.floor(u.baseCost*Math.pow(1.22,n-1) + n*6); }
    function applyUpgrade(u){
      if(u.level>=u.max) return false; const c=costFor(u); if(player.credits<c) return false;
      player.credits-=c; u.level++; resetFromUpgrades(); updateHUD(); buildUpgradeCards(); tone(880,0.05,0.05); saveGame(); return true;
    }

    function allCoreMaxed(){
      return ['damage','firerate','speed','maxhp','multishot'].every(id => upgradeMap[id].level>=MAX_LEVEL);
    }
    function buildUpgradeCards(){
      upgGrid.innerHTML='';
      upgrades.forEach(u=>{
        const pct=Math.round((u.level-1)/(u.max-1)*100);
        const card=document.createElement('div'); card.className='card';
        card.innerHTML=`
          <h4>${u.name}</h4>
          <div class="meta"><span>Level ${u.level}/${u.max}</span><span>Stat: ${u.value()}</span></div>
          <div class="bar"><span style="width:${pct}%"></span></div>
          <div class="row">
            <button class="btn" ${u.level>=u.max?'disabled':''} data-upg="${u.id}">
              ${u.level>=u.max?'Maxed':'Buy — ' + costFor(u) + 'c'}
            </button>
            <small>${u.desc}</small>
          </div>`;
        upgGrid.appendChild(card);
      });
      upgGrid.querySelectorAll('button[data-upg]').forEach(btn=>{
        btn.addEventListener('click',()=>applyUpgrade(upgradeMap[btn.getAttribute('data-upg')]));
      });

      // Evolution card visibility
      const canEvolve = allCoreMaxed() && player.model < EVO_MAX;
      evoCard.style.display = canEvolve ? 'block' : 'none';
      evoTier.textContent = player.model;
      evoNextTier.textContent = player.model+1;
      evoCostEl.textContent = evolveCost(player.model);
      startNextWaveBtn.style.display = (mode==='waves') ? 'inline-block' : 'none';
      overlayCredits.textContent=player.credits;
    }
    function openShop(){ inShop=true; paused=true; overlayUpgrades.classList.add('show'); buildUpgradeCards(); overlayCenter.classList.remove('show'); }
    function closeShop(){ inShop=false; paused=false; overlayUpgrades.classList.remove('show'); }

    btnEvolve.addEventListener('click', ()=>{
      const tier = player.model;
      const cost = evolveCost(tier);
      if(!allCoreMaxed() || tier>=EVO_MAX || player.credits < cost) return;
      player.credits -= cost;
      player.model++;
      resetFromUpgrades();
      // tiny flair
      tone(1200,0.08,0.06); setTimeout(()=>tone(1400,0.08,0.06),80); setTimeout(()=>tone(1600,0.08,0.06),160);
      buildUpgradeCards(); updateHUD(); saveGame();
    });

    btnReset.addEventListener('click', ()=>{
      if(confirm('Reset all progress? This cannot be undone.')){ resetProgress(); }
    });

    function startWave(n){
      wave=n; waveActive=true; boss=null; enemiesToSpawn=0; spawnTimer=0;
      hudWave.textContent=wave; bossBarWrap.style.display='none'; bossBar.style.width='0%';
      if(wave % 20 === 0){ // Boss wave
        spawnBoss();
      } else {
        enemiesToSpawn = 8 + Math.floor(wave*1.8);
        spawnTimer=0;
      }
      tone(440,0.08,0.05);
    }

    /************** ENEMIES / BOSS **************/
    function difficultyFactor(){
      return (mode==='waves') ? Math.max(1, wave) : 1 + (endless.time/10000); // +1 every 10s
    }
    function spawnEnemy(){
      const diff = difficultyFactor();
      const eliteChance = Math.min(0.5, 0.10 + diff*0.025);
      const type = Math.random() < eliteChance && (mode==='endless' || wave%3===0) ? 'elite' : 'grunt';
      const ew = (type==='elite'? 46 : 34), eh=ew;
      const speedBoost = diff*0.25;
      const e = {
        x: rand(ew, W-ew), y: -ew, w: ew, h: eh,
        vx: rand(-0.5,0.5), vy: rand(2+speedBoost, 3+speedBoost*1.4),
        hp: Math.round((type==='elite' ? 60 : 24) + diff*(type==='elite'? 18:10)),
        type, fireCooldown: rand(700,1400), lastFire: 0, alive: true
      };
      enemies.push(e);
    }

    function spawnBoss(){
      const diff = Math.max(1, wave/20); // scales every boss cycle
      const bhp = Math.round(1000 * diff * (1 + wave*0.15));
      boss = {
        x: W/2, y: 120, w: 160, h: 120,
        vx: 2.0, dir: 1, hp: bhp, hpMax: bhp,
        lastFire: 0, fireRate: 500, alive: true, t:0
      };
      bossBarWrap.style.display='block';
      bossLabel.textContent = `Boss — Wave ${wave}`;
      tone(200,0.12,0.06); setTimeout(()=>tone(180,0.12,0.06),100);
    }

    function updateBoss(dt){
      if(!boss) return;
      boss.t += dt;
      // Sway horizontally
      boss.x += boss.vx * boss.dir;
      if(boss.x < 120 || boss.x > W-120) boss.dir *= -1;

      // Fire patterns
      boss.lastFire += dt;
      const cycle = (boss.t/1000)%6;
      let rate = boss.fireRate;
      if(cycle<2){ rate = 420; } else if(cycle<4){ rate=260; } else { rate = 160; } // faster phases

      if(boss.lastFire > rate){
        boss.lastFire = 0;
        // radial burst
        for(let i=0;i<10;i++){
          const ang = (i/10) * Math.PI*2;
          eBullets.push({ x:boss.x, y:boss.y, vx:Math.cos(ang)*3.5, vy:Math.sin(ang)*3.5+0.5, r:5, dmg: 14 + Math.floor(difficultyFactor()*0.5) });
        }
        tone(320,0.05,0.05);
      }

      // Update boss HP bar
      const pct = clamp(boss.hp/boss.hpMax,0,1);
      bossBar.style.width = (pct*100).toFixed(1)+'%';
    }

    /************** SHOOTING / POWERUPS **************/
    function shoot(){
      const now=performance.now(); const delay=(rapidTime>0? player.fireDelay*0.55 : player.fireDelay);
      if(now - player.lastShot < delay) return; player.lastShot=now;
      const count=player.getBulletCount(); const spread=Math.min(0.28, 0.06*(count-1));
      for(let i=0;i<count;i++){
        const t=count===1?0:(i/(count-1)-0.5)*2; const angle=t*spread;
        bullets.push({ x:player.x, y:player.y-24, vx:Math.sin(angle)*12, vy:-14, r:4, dmg:player.getDamage() });
      }
      tone(1200,0.04,0.04);
    }
    function enemyShoot(e){
      eBullets.push({ x:e.x, y:e.y+e.h/2, vx:0, vy:6 + difficultyFactor()*0.6, r:4, dmg: 8 + Math.floor(difficultyFactor()*0.6) });
      tone(360,0.04,0.03);
    }
    function maybeDropPowerup(x,y){
      const roll=Math.random();
      if(roll<0.10)      powerups.push({ x,y,r:10, vy:2.5, type:'shield', ttl:10000 });
      else if(roll<0.20) powerups.push({ x,y,r:10, vy:2.5, type:'rapid', ttl:10000 });
      else if(roll<0.35) powerups.push({ x,y,r:9,  vy:3.0, type:'credit', amount:20+Math.floor(Math.random()*20), ttl:9000 });
    }

    /************** RENDER HELPERS **************/
    function drawShip(x,y,w,h){
      // different look per model
      const core = shipModels[player.model];
      g.save(); g.translate(x,y); g.fillStyle=core.color; g.strokeStyle=core.outline; g.lineWidth=2;
      g.beginPath(); g.moveTo(0,-h/2); g.lineTo(w/2,h/4); g.lineTo(0,h/3); g.lineTo(-w/2,h/4); g.closePath();
      g.shadowColor=core.color; g.shadowBlur=14; g.fill(); g.stroke();
      // canopy
      g.beginPath(); g.fillStyle='rgba(255,255,255,0.7)'; g.arc(0,-h/5, h/8 + player.model*2, 0, Math.PI*2); g.fill();
      g.restore();
    }
    function drawEnemy(e){
      g.save(); g.translate(e.x,e.y); g.fillStyle=e.type==='elite'?'#ff9bb8':'#ffd27e';
      g.fillRect(-e.w/2,-e.h/2,e.w,e.h); g.restore();
    }
    function drawBoss(b){
      if(!b) return; g.save(); g.translate(b.x,b.y);
      g.fillStyle='#ff6f91'; g.strokeStyle='#ffd1dc'; g.lineWidth=3;
      g.beginPath(); g.moveTo(-b.w/2, -b.h/3); g.lineTo(b.w/2, -b.h/3); g.lineTo(b.w/3, b.h/2); g.lineTo(-b.w/3, b.h/2); g.closePath();
      g.shadowColor='#ff6f91'; g.shadowBlur=20; g.fill(); g.stroke();
      g.restore();
    }
    function drawPowerup(p){
      g.save(); g.translate(p.x,p.y);
      g.fillStyle = p.type==='shield' ? '#6cf9ff' : p.type==='rapid' ? '#a1ff75' : '#ffd166';
      g.beginPath(); g.arc(0,0,p.r,0,Math.PI*2); g.fill(); g.restore();
    }

    /************** LOOP **************/
    let lastTS=0;
    function loop(t){
      if(!gameRunning) return;
      const dt=Math.min(32, t-lastTS); lastTS=t;
      if(!paused){ update(dt); render(); }
      requestAnimationFrame(loop);
    }

    function update(dt){
      if(shieldTime>0) shieldTime-=dt; if(rapidTime>0) rapidTime-=dt;

      // input
      let mv=0; if(keys['ArrowLeft']||keys['a']) mv-=1; if(keys['ArrowRight']||keys['d']) mv+=1;
      player.vx=mv*player.speed; player.x=clamp(player.x+player.vx, 30, W-30);
      if((keys[' ']||keys['Space']) && player.alive) shoot();

      // Spawning
      if(mode==='endless'){
        endless.time += dt;
        spawnTimer -= dt;
        const diff = difficultyFactor();
        const interval = Math.max(140, 700 / diff);
        const onScreenCap = 40;
        if(spawnTimer<=0 && enemies.length < onScreenCap){
          spawnEnemy(); spawnTimer = interval;
        }
      } else if(mode==='waves'){
        if(boss){
          updateBoss(dt);
        } else if(waveActive && enemiesToSpawn>0){
          spawnTimer -= dt;
          const interval = Math.max(180, 700 - wave*25);
          if(spawnTimer<=0){ spawnEnemy(); enemiesToSpawn--; spawnTimer=interval; }
        }
      }

      // Enemies update
      enemies.forEach(e=>{
        e.x += e.vx; e.y += e.vy;
        if(e.x<20 || e.x>W-20) e.vx *= -1;
        if(e.y > H+50) e.alive=false;
        e.lastFire += dt;
        const fireEvery = Math.max(450, e.fireCooldown - difficultyFactor()*20);
        if(e.lastFire > fireEvery && Math.random() < 0.03 + difficultyFactor()*0.002){
          e.lastFire = 0; enemyShoot(e);
        }
      });

      // bullets
      bullets.forEach(b=>{ b.x+=b.vx; b.y+=b.vy; });
      eBullets.forEach(b=>{ b.x+=b.vx; b.y+=b.vy; });

      // powerups
      powerups.forEach(p=>{ p.y += p.vy; p.ttl -= dt; });

      // collisions bullets -> enemies/boss
      for(let i=bullets.length-1;i>=0;i--){
        const b=bullets[i]; let hit=false;
        if(boss){
          if(Math.abs(b.x-boss.x) < boss.w/2 && Math.abs(b.y-boss.y) < boss.h/2){
            boss.hp -= b.dmg; hit=true; tone(700,0.03,0.03);
            if(boss.hp<=0){ boss.alive=false; boss=null; player.score += 500; player.credits += 400; bossBarWrap.style.display='none'; tone(240,0.1,0.06); tone(200,0.1,0.06); }
          }
        } else {
          for(let j=enemies.length-1;j>=0;j--){
            const e=enemies[j]; if(!e.alive) continue;
            if(Math.abs(b.x-e.x) < e.w/2+6 && Math.abs(b.y-e.y) < e.h/2+6){
              e.hp -= b.dmg; hit=true;
              if(e.hp<=0){
                e.alive=false; player.score += e.type==='elite'?50:20;
                player.credits += e.type==='elite'? 30 : 12; maybeDropPowerup(e.x,e.y); tone(220,0.06,0.05);
              } else tone(660,0.03,0.03);
              break;
            }
          }
        }
        if(hit) bullets.splice(i,1); else if(b.y<-20||b.x<-20||b.x>W+20) bullets.splice(i,1);
      }

      // enemy bullets -> player
      for(let i=eBullets.length-1;i>=0;i--){
        const b=eBullets[i];
        if(Math.abs(b.x-player.x) < player.w/2 + b.r && Math.abs(b.y-player.y) < player.h/2 + b.r){
          eBullets.splice(i,1);
          if(shieldTime<=0){
            player.hp -= b.dmg; if(player.hp<=0){ player.hp=0; gameOver(); return; } tone(180,0.05,0.05);
          } else tone(420,0.04,0.04);
        } else if(b.y>H+30||b.x<-30||b.x>W+30) eBullets.splice(i,1);
      }

      // enemy body -> player
      for(let i=enemies.length-1;i>=0;i--){
        const e=enemies[i]; if(!e.alive){ enemies.splice(i,1); continue; }
        if(Math.abs(e.x-player.x) < e.w/2 + player.w/2 && Math.abs(e.y-player.y) < e.h/2 + player.h/2){
          enemies.splice(i,1);
          if(shieldTime<=0){
            const dmg=e.type==='elite'?35:20; player.hp -= dmg; if(player.hp<=0){ player.hp=0; gameOver(); return; } tone(160,0.06,0.05);
          } else tone(420,0.04,0.04);
        }
      }

      // collect powerups
      for(let i=powerups.length-1;i>=0;i--){
        const p=powerups[i];
        if(p.ttl<=0 || p.y>H+20){ powerups.splice(i,1); continue; }
        if(Math.hypot(p.x-player.x, p.y-player.y) < (p.r + Math.max(player.w,player.h)/2 - 8)){
          if(p.type==='shield') shieldTime=6000;
          else if(p.type==='rapid') rapidTime=6000;
          else if(p.type==='credit') player.credits += p.amount;
          powerups.splice(i,1); tone(980,0.05,0.05);
        }
      }

      // finish wave?
      if(mode==='waves'){
        if(!boss && waveActive && enemiesToSpawn<=0 && enemies.length===0 && eBullets.length===0){
          waveActive=false;
          player.credits += 20 + Math.floor(wave*6);
          saveGame.highestWave = Math.max(saveGame.highestWave||1, wave);
          openShop(); saveGame();
        }
        if(boss && boss.hp<=0){
          waveActive=false;
          saveGame.highestWave = Math.max(saveGame.highestWave||1, wave);
          openShop(); saveGame();
        }
      }

      updateHUD();
    }

    function render(){
      g.clearRect(0,0,W,H);
      // player
      if(player.alive){ drawShip(player.x, player.y, player.w + player.model*4, player.h + player.model*4); }
      // bullets
      g.fillStyle='#9be7ff'; bullets.forEach(b=>{ g.beginPath(); g.arc(b.x,b.y,b.r,0,Math.PI*2); g.fill(); });
      // enemies & boss
      enemies.forEach(drawEnemy); drawBoss(boss);
      // enemy bullets
      g.fillStyle='#ff9bb8'; eBullets.forEach(b=>{ g.beginPath(); g.arc(b.x,b.y,b.r,0,Math.PI*2); g.fill(); });
      // powerups
      powerups.forEach(drawPowerup);
      // status
      g.font='12px Inter, sans-serif'; g.textAlign='left'; g.textBaseline='top';
      if(shieldTime>0){ g.fillStyle='#6cf9ff'; g.fillText('Shield ' + Math.ceil(shieldTime/1000)+'s', 12, H-28); }
      if(rapidTime>0){ g.fillStyle='#a1ff75'; g.fillText('Rapid ' + Math.ceil(rapidTime/1000)+'s', 100, H-28); }
    }

    function updateHUD(){
      hudScore.textContent = player.score;
      hudCredits.textContent = player.credits;
      hudHP.textContent = Math.max(0, Math.ceil(player.hp)) + '/' + player.maxHP;
      hudWave.textContent = (mode==='endless') ? '∞' : wave;
      hudEvo.textContent = player.model;
    }

    function gameOver(){
      player.alive=false; paused=true;
      centerTitle.textContent='Game Over';
      centerSubtitle.textContent='Score: ' + player.score + (mode==='waves' ? (' — Wave '+wave): '');
      overlayCenter.classList.add('show'); bossBarWrap.style.display='none';
      saveGame();
    }

    function pauseGame(){
      if(!gameRunning) return; paused=true;
      centerTitle.textContent='Paused'; centerSubtitle.textContent='Press Esc to resume';
      overlayCenter.classList.add('show');
    }
    function resumeGame(){
      if(!gameRunning) return; overlayCenter.classList.remove('show'); if(!inShop) paused=false;
    }
    function restartGame(){
      resetFromUpgrades(); resetPlayer();
      enemies.length=0; eBullets.length=0; powerups.length=0; bossBarWrap.style.display='none'; boss=null;
      if(mode==='endless'){ endless.time=0; paused=false; }
      if(mode==='waves'){ openShop(); }
      overlayCenter.classList.remove('show');
    }
    function exitGame(){
      gameRunning=false; paused=false; inShop=false;
      gameCanvas.style.display='none'; hud.classList.remove('show'); controls.classList.remove('show');
      overlayUpgrades.classList.remove('show'); overlayCenter.classList.remove('show'); overlayModes.classList.remove('show');
      normalHeader.classList.remove('hidden'); normalMain.classList.remove('hidden');
      saveGame();
    }

    /************** INPUT **************/
    document.addEventListener('keydown', (e)=>{
      // Secret code
      if(!gameRunning){
        typedKeys += e.key.toLowerCase(); typedKeys = typedKeys.slice(-secretCode.length);
        if(typedKeys === secretCode){ startGame(); }
      }

      keys[e.key]=true;

      if(e.key==='Escape'){
        if(!gameRunning) return;
        if(inShop){ closeShop(); return; }
        if(paused){ resumeGame(); } else { pauseGame(); }
      }
      const k=e.key.toLowerCase();
      if(k==='u' && gameRunning){ inShop ? closeShop() : openShop(); }
      if(e.key===' ' || e.key==='Space') e.preventDefault();

      // Mode quick keys
      if(gameRunning && overlayModes.classList.contains('show')){
        if(k==='1'){ chooseEndless(); }
        if(k==='2'){ chooseWaves(); }
      }
    });
    document.addEventListener('keyup', e=>{ keys[e.key]=false; });

    // Buttons
    btnModeEndless.addEventListener('click', chooseEndless);
    btnModeWaves.addEventListener('click', chooseWaves);
    btnUp.addEventListener('click', ()=> inShop? closeShop() : openShop());
    btnPause.addEventListener('click', ()=> paused? resumeGame() : pauseGame());
    btnMute.addEventListener('click', ()=>{ muted=!muted; btnMute.textContent = muted? 'Unmute' : 'Mute'; });
    btnExit.addEventListener('click', exitGame);
    closeUpgrades.addEventListener('click', closeShop);
    startNextWaveBtn.addEventListener('click', ()=>{
      closeShop();
      if(!waveActive){ startWave(wave); } // (re)start current wave
      else { /* no-op */ }
    });

    centerResume.addEventListener('click', resumeGame);
    centerRestart.addEventListener('click', restartGame);
    centerExit.addEventListener('click', exitGame);

    // HUD visibility sync
    const observer = new MutationObserver(()=>{
      const on = (gameCanvas.style.display==='block');
      hud.style.display = on? 'flex':'none'; controls.style.display = on? 'flex':'none';
    });
    observer.observe(gameCanvas, { attributes:true, attributeFilter:['style'] });

    // Save periodically & on unload
    setInterval(saveGame, 3000);
    window.addEventListener('beforeunload', saveGame);

    // Initial load
    loadGame();
    resetFromUpgrades();
    updateHUD();
  </script>
</body>
</html>
