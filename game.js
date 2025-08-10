(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  // Buat jalur oval ganda (loop utama & loop cabang)
  function makeOval(cx, cy, rx, ry, segments = 200) {
    const pts = [];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * 2 * Math.PI;
      pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
    }
    return pts;
  }

  // Jalur utama: oval besar
  const mainPath = makeOval(W/2, H/2, 260, 160, 220);

  // Jalur cabang: oval kecil mirip di kanan bawah
  const branchPath = makeOval(W/2 + 60, H/2 + 40, 140, 90, 160);

  // Titik switch untuk masuk dan keluar cabang
  const switchEnterIndex = 42;
  const switchExitIndex = 12;

  // Fungsi untuk buat sambungan antar jalur (jalur cabang <-> utama)
  function makeConnector(aPath, aIndex, bPath, bIndex, steps=20) {
    const a = aPath[aIndex];
    const b = bPath[bIndex];
    const pts = [];
    for (let i=0; i <= steps; i++) {
      const t = i/steps;
      // smoothstep curve
      const tt = t*t*(3-2*t);
      pts.push({
        x: a.x*(1-tt) + b.x*tt,
        y: a.y*(1-tt) + b.y*tt
      });
    }
    return pts;
  }

  // Sambungan masuk (main ke branch)
  const connectorEnter = makeConnector(mainPath, switchEnterIndex, branchPath, switchExitIndex, 25);

  // Sambungan keluar (branch ke main)
  const branchExitBackIndex = (switchExitIndex + Math.floor(branchPath.length/2)) % branchPath.length;
  const mainEnterBackIndex = (switchEnterIndex + Math.floor(mainPath.length/2)) % mainPath.length;
  const connectorExit = makeConnector(branchPath, branchExitBackIndex, mainPath, mainEnterBackIndex, 25);

  // Hitung panjang jalur & segment
  function computeLengths(path) {
    const segLen = [];
    let total = 0;
    for (let i=0; i < path.length; i++) {
      const a = path[i];
      const b = path[(i+1) % path.length];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      segLen.push(d);
      total += d;
    }
    const cum = [0];
    for (let i=0; i < segLen.length; i++) cum.push(cum[i] + segLen[i]);
    return {segLen, total, cum};
  }

  const mainInfo = computeLengths(mainPath);
  const branchInfo = computeLengths(branchPath);
  const connectorEnterInfo = computeLengths(connectorEnter);
  const connectorExitInfo = computeLengths(connectorExit);

  // Cari titik pada jarak d di path
  function pointAtDistance(path, info, d) {
    const L = info.total;
    d = ((d % L) + L) % L;
    const cum = info.cum;
    let idx = 0;
    while (idx < path.length && !(cum[idx] <= d && d <= cum[idx+1])) idx++;
    const a = path[idx];
    const b = path[(idx+1) % path.length];
    const segLen = info.segLen[idx];
    const t = segLen === 0 ? 0 : (d - cum[idx]) / segLen;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    return { x, y, ang, idx, t, d };
  }

  // Cari jarak terdekat di path ke titik (px, py)
  function nearestDistanceOnPath(path, info, px, py) {
    let bestD = 0;
    let bestDist = Infinity;
    for (let i=0; i < path.length; i++) {
      const a = path[i];
      const b = path[(i+1) % path.length];
      const vx = b.x - a.x, vy = b.y - a.y;
      const wx = px - a.x, wy = py - a.y;
      const vv = vx*vx + vy*vy;
      let t = vv === 0 ? 0 : (wx*vx + wy*vy) / vv;
      t = Math.max(0, Math.min(1, t));
      const sx = a.x + vx*t;
      const sy = a.y + vy*t;
      const dist = Math.hypot(px - sx, py - sy);
      const dToSegStart = info.cum[i] + info.segLen[i] * t;
      if (dist < bestDist) {
        bestDist = dist;
        bestD = dToSegStart;
      }
    }
    return { d: ((bestD % info.total) + info.total) % info.total, dist: bestDist };
  }

  // Status kereta dan jalur
  let trackName = "main";
  let trackPath = mainPath;
  let trackInfo = mainInfo;
  let posD = 50;
  let speed = 0;
  const maxSpeed = 6;
  const carriageCount = 4;
  const carriageSpacing = 34;

  // Titik switch dan jarak terdekat untuk pindah jalur
  const switchMainD = mainInfo.cum[switchEnterIndex];
  const switchBranchEnterD = branchInfo.cum[switchExitIndex];
  const switchBranchExitD = branchInfo.cum[branchExitBackIndex];
  const switchMainReturnD = mainInfo.cum[mainEnterBackIndex];
  const switchRadius = 38;

  // Input keyboard
  const keys = {};
  window.addEventListener('keydown', e => {
    if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      keys[e.key] = true;
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', e => {
    if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      keys[e.key] = false;
      e.preventDefault();
    }
  });

  // Update posisi kereta dan pindah jalur jika perlu
  function updatePhysics() {
    if (keys['ArrowRight']) speed += 0.12;
    if (keys['ArrowLeft']) speed -= 0.12;
    if (speed > maxSpeed) speed = maxSpeed;
    if (speed < -maxSpeed) speed = -maxSpeed;
    if (!keys['ArrowRight'] && !keys['ArrowLeft']) speed *= 0.97;

    posD += speed;

    if (trackName === "main") {
      posD = ((posD % trackInfo.total) + trackInfo.total) % trackInfo.total;
      if (Math.abs(posD - switchMainD) < switchRadius) {
        if (keys['ArrowUp']) {
          trackName = "connectorEnter";
          trackPath = connectorEnter;
          trackInfo = connectorEnterInfo;
          posD = 0;
        }
      }
    }
    else if (trackName === "connectorEnter") {
      if (posD >= trackInfo.total) {
        trackName = "branch";
        trackPath = branchPath;
        trackInfo = branchInfo;
        const p = pointAtDistance(connectorEnter, connectorEnterInfo, posD);
        const nearest = nearestDistanceOnPath(branchPath, branchInfo, p.x, p.y);
        posD = nearest.d;
      }
    }
    else if (trackName === "branch") {
      posD = ((posD % trackInfo.total) + trackInfo.total) % trackInfo.total;
      if (Math.abs(posD - switchBranchExitD) < switchRadius) {
        if (keys['ArrowDown']) {
          trackName = "connectorExit";
          trackPath = connectorExit;
          trackInfo = connectorExitInfo;
          posD = 0;
        }
      }
    }
    else if (trackName === "connectorExit") {
      if (posD >= trackInfo.total) {
        trackName = "main";
        trackPath = mainPath;
        trackInfo = mainInfo;
        const p = pointAtDistance(connectorExit, connectorExitInfo, posD);
        const nearest = nearestDistanceOnPath(mainPath, mainInfo, p.x, p.y);
        posD = nearest.d;
      }
    }
  }

  // Gambar jalur dan kereta
  function drawTrack(path, info, opts = {}) {
    const lineWidth = opts.lineWidth || 20;
    const color = opts.color || '#6b4b2b';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Track dasar
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
    ctx.closePath();
    ctx.stroke();

    // Rel kereta (2 garis)
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#222';
    ctx.beginPath();
    for (let i = 0; i < path.length; i++) {
      const p = path[i];
      const n = path[(i + 1) % path.length];
      const t = Math.atan2(n.y - p.y, n.x - p.x);
      const off = 12;
      const x1 = p.x + Math.sin(t) * off, y1 = p.y - Math.cos(t) * off;
      if (i === 0) ctx.moveTo(x1, y1);
      else ctx.lineTo(x1, y1);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i < path.length; i++) {
      const p = path[i];
      const n = path[(i + 1) % path.length];
      const t = Math.atan2(n.y - p.y, n.x - p.x);
      const off = -12;
      const x1 = p.x + Math.sin(t) * off, y1 = p.y - Math.cos(t) * off;
      if (i === 0) ctx.moveTo(x1, y1);
      else ctx.lineTo(x1, y1);
    }
    ctx.closePath();
    ctx.stroke();

    // Sleepers (tiang rel)
    if (opts.ties) {
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 2;
      const spacing = 30;
      for (let d = 0; d < info.total; d += spacing) {
        const p = pointAtDistance(path, info, d);
        const a = p.ang;
        const lx = Math.cos(a + Math.PI / 2) * 14, ly = Math.sin(a + Math.PI / 2) * 14;
        ctx.beginPath();
        ctx.moveTo(p.x - lx, p.y - ly);
        ctx.lineTo(p.x + lx, p.y + ly);
        ctx.stroke();
      }
    }
  }

  function drawConnector(conn) {
    ctx.save();
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#5c3f2a';
    ctx.beginPath();
    ctx.moveTo(conn[0].x, conn[0].y);
    for (let i = 1; i < conn.length; i++) ctx.lineTo(conn[i].x, conn[i].y);
    ctx.stroke();

    ctx.lineWidth = 3;
    ctx.strokeStyle = '#111';
    ctx.beginPath();
    ctx.moveTo(conn[0].x, conn[0].y);
    for (let i = 1; i < conn.length; i++) ctx.lineTo(conn[i].x, conn[i].y);
    ctx.stroke();

    ctx.restore();
  }

  function drawSwitchMarker(x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.fillStyle = '#ffd24d';
    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.shadowBlur = 5;
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#b37f00';
    ctx.stroke();
    ctx.restore();
  }

  function drawCarriage(x, y, ang, i, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    if (i > 0) {
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(22, 0);
      ctx.lineTo(38, 0);
      ctx.stroke();
    }
    const w = i === 0 ? 50 : 40;
    const h = i === 0 ? 28 : 20;

    ctx.fillStyle = 'rgba(0,0,0,0.13)';
    ctx.fillRect(-w / 2 + 5, -h / 2 + 10, w, h);

    ctx.fillStyle = color;
    ctx.fillRect(-w / 2, -h / 2, w, h);

    if (i > 0) {
      ctx.fillStyle = '#fff';
      for (let k = 0; k < 2; k++) {
        ctx.fillRect(-w/4 + k*12, -h/4, 6, 10);
      }
    }
    ctx.restore();
  }

  // Render tiap frame
  function render() {
    ctx.clearRect(0, 0, W, H);

    // Gambar jalur
    drawTrack(mainPath, mainInfo, {lineWidth: 20, color: '#6b4b2b', ties: true});
    drawTrack(branchPath, branchInfo, {lineWidth: 20, color: '#5a3a24', ties: true});
    drawConnector(connectorEnter);
    drawConnector(connectorExit);

    // Gambar marker switch
    const swMain = mainPath[switchEnterIndex];
    const swBranchEnter = branchPath[switchExitIndex];
    const swBranchExit = branchPath[branchExitBackIndex];
    const swMainReturn = mainPath[mainEnterBackIndex];
    drawSwitchMarker(swMain.x, swMain.y);
    drawSwitchMarker(swBranchEnter.x, swBranchEnter.y);
    drawSwitchMarker(swBranchExit.x, swBranchExit.y);
    drawSwitchMarker(swMainReturn.x, swMainReturn.y);

    // Gambar kereta & gerbong
    for (let i = 0; i < carriageCount; i++) {
      let dOffset = posD - i * carriageSpacing;
      let t = pointAtDistance(trackPath, trackInfo, dOffset);
      drawCarriage(t.x, t.y, t.ang, i, i === 0 ? '#004080' : '#0077cc');
    }

    // Tampilkan status track dan speed
    const statusText = `Track: ${trackName} | Speed: ${speed.toFixed(2)} px/frame`;
    document.getElementById('status').textContent = statusText;
  }

  // Main loop
  function loop() {
    updatePhysics();
    render();
    requestAnimationFrame(loop);
  }

  loop();
})();
