const live = {
  enabled: false,
  timer: null,
  inFlight: false,
  frame: null,
  lastError: null,
  framesThisSecond: 0,
  lastStatsAt: performance.now(),
  uiFps: 0,
};

const livePort = document.getElementById("livePort");
const liveProtocol = document.getElementById("liveProtocol");
const displayLimit = document.getElementById("displayLimit");
const displayLimitValue = document.getElementById("displayLimitValue");
const deadband = document.getElementById("deadband");
const deadbandValue = document.getElementById("deadbandValue");
const toggleLive = document.getElementById("toggleLive");
const tareLive = document.getElementById("tareLive");
const liveState = document.getElementById("liveState");
const liveStatus = document.getElementById("liveStatus");
const firmwareTarget = document.getElementById("firmwareTarget");
const firmwareSampleHz = document.getElementById("firmwareSampleHz");
const firmwareSampleHzLabel = document.getElementById("firmwareSampleHzLabel");
const firmwareSampleHzNote = document.getElementById("firmwareSampleHzNote");
const firmwareTriggerThreshold = document.getElementById("firmwareTriggerThreshold");
const firmwareFqbnLive = document.getElementById("firmwareFqbnLive");
const flashHardwareFirmware = document.getElementById("flashHardwareFirmware");
const hardwareFlashStatus = document.getElementById("hardwareFlashStatus");
const hardwareFps = document.getElementById("hardwareFps");
const uiFps = document.getElementById("uiFps");
const serialRate = document.getElementById("serialRate");
const frameBytes = document.getElementById("frameBytes");
const layer1Peak = document.getElementById("layer1Peak");
const layer2Peak = document.getElementById("layer2Peak");
const layer1State = document.getElementById("layer1State");
const layer2State = document.getElementById("layer2State");
const frameDataPreview = document.getElementById("frameDataPreview");

const canvases = {
  layer1Heatmap: document.getElementById("layer1Heatmap"),
  layer2Heatmap: document.getElementById("layer2Heatmap"),
  layer1Surface: document.getElementById("layer1Surface"),
  layer2Surface: document.getElementById("layer2Surface"),
  combinedScene: document.getElementById("combinedScene"),
};

const combinedView = {
  yaw: -Math.PI / 4,
  pitch: 0.72,
  zoom: 1,
  dragging: false,
  lastX: 0,
  lastY: 0,
};

function hardwarePayload() {
  return {
    port: livePort.value || "COM5",
    baud: 500000,
    protocol: liveProtocol.value,
    layer: "max",
    n: 16,
    displayLimit: Number(displayLimit.value),
    deadband: Number(deadband.value),
    layer2Deadband: Math.max(Number(deadband.value), 35),
  };
}

function colorFor(value, alpha = 1) {
  const v = Math.max(0, Math.min(1, value));
  if (v < 0.25) return `rgba(${Math.round(58 - v * 80)}, ${Math.round(74 + v * 230)}, ${Math.round(166 + v * 230)}, ${alpha})`;
  if (v < 0.55) return `rgba(${Math.round(35 + v * 120)}, ${Math.round(152 + v * 130)}, ${Math.round(190 - v * 120)}, ${alpha})`;
  if (v < 0.78) return `rgba(${Math.round(118 + v * 120)}, ${Math.round(190 + v * 60)}, ${Math.round(65 - v * 45)}, ${alpha})`;
  return `rgba(${Math.round(245 + v * 10)}, ${Math.round(210 - v * 120)}, ${Math.round(45 - v * 35)}, ${alpha})`;
}

function sampleGrid(grid, y, x) {
  if (!grid?.length) return 0;
  const rows = grid.length;
  const cols = grid[0].length;
  const yy = Math.max(0, Math.min(rows - 1, y));
  const xx = Math.max(0, Math.min(cols - 1, x));
  const y0 = Math.floor(yy);
  const x0 = Math.floor(xx);
  const y1 = Math.min(rows - 1, y0 + 1);
  const x1 = Math.min(cols - 1, x0 + 1);
  const fy = yy - y0;
  const fx = xx - x0;
  const top = grid[y0][x0] * (1 - fx) + grid[y0][x1] * fx;
  const bottom = grid[y1][x0] * (1 - fx) + grid[y1][x1] * fx;
  return top * (1 - fy) + bottom * fy;
}

function drawColorbar(ctx, x, y, width, height, limit) {
  const steps = 80;
  for (let index = 0; index < steps; index += 1) {
    const v = 1 - index / (steps - 1);
    ctx.fillStyle = colorFor(v);
    ctx.fillRect(x, y + (index / steps) * height, width, height / steps + 1);
  }
  ctx.strokeStyle = "rgba(21, 32, 31, 0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);
  ctx.fillStyle = "#24302c";
  ctx.font = "11px ui-monospace, Consolas, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(String(Math.round(limit)), x + width + 6, y + 2);
  ctx.fillText("0", x + width + 6, y + height);
}

function drawMatlabHeatmap(canvas, normalizedGrid, valueGrid, title) {
  const ctx = canvas.getContext("2d");
  const plot = { x: 38, y: 34, size: Math.min(canvas.width - 108, canvas.height - 64) };
  const low = document.createElement("canvas");
  low.width = 256;
  low.height = 256;
  const lctx = low.getContext("2d");
  const image = lctx.createImageData(low.width, low.height);
  for (let py = 0; py < low.height; py += 1) {
    for (let px = 0; px < low.width; px += 1) {
      const gy = (py / (low.height - 1)) * 15;
      const gx = (px / (low.width - 1)) * 15;
      const value = sampleGrid(normalizedGrid, gy, gx);
      const color = colorFor(value).match(/\d+/g).map(Number);
      const offset = (py * low.width + px) * 4;
      image.data[offset] = color[0];
      image.data[offset + 1] = color[1];
      image.data[offset + 2] = color[2];
      image.data[offset + 3] = 255;
    }
  }
  lctx.putImageData(image, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(low, plot.x, plot.y, plot.size, plot.size);

  ctx.strokeStyle = "rgba(21, 32, 31, 0.28)";
  ctx.lineWidth = 1;
  for (let index = 0; index <= 16; index += 1) {
    const pos = plot.x + (index / 16) * plot.size;
    const row = plot.y + (index / 16) * plot.size;
    ctx.beginPath();
    ctx.moveTo(pos, plot.y);
    ctx.lineTo(pos, plot.y + plot.size);
    ctx.moveTo(plot.x, row);
    ctx.lineTo(plot.x + plot.size, row);
    ctx.stroke();
  }

  ctx.strokeStyle = "#24302c";
  ctx.lineWidth = 1.2;
  ctx.strokeRect(plot.x, plot.y, plot.size, plot.size);
  ctx.fillStyle = "#24302c";
  ctx.font = "12px ui-monospace, Consolas, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(title, plot.x + plot.size / 2, 10);
  ctx.textBaseline = "middle";
  [1, 8, 16].forEach((tick) => {
    const pos = plot.x + ((tick - 0.5) / 16) * plot.size;
    const row = plot.y + ((tick - 0.5) / 16) * plot.size;
    ctx.fillText(String(tick), pos, plot.y + plot.size + 14);
    ctx.textAlign = "right";
    ctx.fillText(String(tick), plot.x - 8, row);
    ctx.textAlign = "center";
  });
  const peak = Math.max(0, ...valueGrid.flat());
  ctx.textAlign = "left";
  ctx.fillText(`max ${peak.toFixed(1)}`, plot.x, canvas.height - 15);
  drawColorbar(ctx, plot.x + plot.size + 18, plot.y, 14, plot.size, Number(displayLimit.value || 300));
}

function projectSurfacePoint(row, col, value, originX, originY, dx, dy, maxH) {
  return {
    x: originX + (col - row) * dx,
    y: originY + (col + row - 15) * dy - value * maxH,
  };
}

function drawMatlabSurface(canvas, normalizedGrid, valueGrid, title) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fbfdfc";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const originX = canvas.width * 0.5;
  const originY = canvas.height * 0.72;
  const dx = canvas.width * 0.029;
  const dy = canvas.height * 0.0145;
  const maxH = canvas.height * 0.40;

  ctx.fillStyle = "#24302c";
  ctx.font = "12px ui-monospace, Consolas, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(title, canvas.width / 2, 9);

  const baseCorners = [
    projectSurfacePoint(0, 0, 0, originX, originY, dx, dy, maxH),
    projectSurfacePoint(0, 15, 0, originX, originY, dx, dy, maxH),
    projectSurfacePoint(15, 15, 0, originX, originY, dx, dy, maxH),
    projectSurfacePoint(15, 0, 0, originX, originY, dx, dy, maxH),
  ];
  ctx.fillStyle = "rgba(221, 229, 245, 0.72)";
  ctx.strokeStyle = "rgba(21, 32, 31, 0.24)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  baseCorners.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  for (let row = 0; row < 16; row += 1) {
    for (let col = 0; col < 16; col += 1) {
      const corners = [
        { row, col, value: normalizedGrid[row]?.[col] || 0 },
        { row, col: col + 1, value: normalizedGrid[row]?.[Math.min(15, col + 1)] || 0 },
        { row: row + 1, col: col + 1, value: normalizedGrid[Math.min(15, row + 1)]?.[Math.min(15, col + 1)] || 0 },
        { row: row + 1, col, value: normalizedGrid[Math.min(15, row + 1)]?.[col] || 0 },
      ];
      for (let index = 0; index < corners.length; index += 1) {
        const a = corners[index];
        const b = corners[(index + 1) % corners.length];
        const mean = (a.value + b.value) / 2;
        if (mean < 0.03) continue;
        const topA = projectSurfacePoint(a.row, a.col, a.value, originX, originY, dx, dy, maxH);
        const topB = projectSurfacePoint(b.row, b.col, b.value, originX, originY, dx, dy, maxH);
        const baseB = projectSurfacePoint(b.row, b.col, 0, originX, originY, dx, dy, maxH);
        const baseA = projectSurfacePoint(a.row, a.col, 0, originX, originY, dx, dy, maxH);
        ctx.fillStyle = colorFor(Math.max(0.05, mean * 0.82), 0.30 + mean * 0.34);
        ctx.strokeStyle = "rgba(21, 32, 31, 0.10)";
        ctx.lineWidth = 0.35;
        ctx.beginPath();
        ctx.moveTo(topA.x, topA.y);
        ctx.lineTo(topB.x, topB.y);
        ctx.lineTo(baseB.x, baseB.y);
        ctx.lineTo(baseA.x, baseA.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  for (let row = 0; row < 16; row += 1) {
    for (let col = 0; col < 16; col += 1) {
      const v00 = normalizedGrid[row]?.[col] || 0;
      const v01 = normalizedGrid[row]?.[Math.min(15, col + 1)] || v00;
      const v10 = normalizedGrid[Math.min(15, row + 1)]?.[col] || v00;
      const v11 = normalizedGrid[Math.min(15, row + 1)]?.[Math.min(15, col + 1)] || v00;
      const p00 = projectSurfacePoint(row, col, v00, originX, originY, dx, dy, maxH);
      const p01 = projectSurfacePoint(row, col + 1, v01, originX, originY, dx, dy, maxH);
      const p11 = projectSurfacePoint(row + 1, col + 1, v11, originX, originY, dx, dy, maxH);
      const p10 = projectSurfacePoint(row + 1, col, v10, originX, originY, dx, dy, maxH);
      const mean = (v00 + v01 + v10 + v11) / 4;
      ctx.fillStyle = colorFor(Math.max(0.08, mean), mean > 0.01 ? 0.98 : 0.88);
      ctx.strokeStyle = mean > 0.01 ? "rgba(21, 32, 31, 0.28)" : "rgba(78, 92, 130, 0.15)";
      ctx.lineWidth = mean > 0.01 ? 0.55 : 0.35;
      ctx.beginPath();
      ctx.moveTo(p00.x, p00.y);
      ctx.lineTo(p01.x, p01.y);
      ctx.lineTo(p11.x, p11.y);
      ctx.lineTo(p10.x, p10.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  ctx.strokeStyle = "rgba(21, 32, 31, 0.45)";
  ctx.lineWidth = 1.1;
  const zAxisBase = projectSurfacePoint(15, 0, 0, originX, originY, dx, dy, maxH);
  ctx.beginPath();
  ctx.moveTo(zAxisBase.x, zAxisBase.y);
  ctx.lineTo(zAxisBase.x, zAxisBase.y - maxH);
  ctx.stroke();
  ctx.fillStyle = "#24302c";
  ctx.font = "11px ui-monospace, Consolas, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("0", zAxisBase.x + 5, zAxisBase.y);
  ctx.fillText(String(displayLimit.value || 300), zAxisBase.x + 5, zAxisBase.y - maxH);
  const peak = Math.max(0, ...valueGrid.flat());
  ctx.fillText(`max ${peak.toFixed(1)}`, 12, canvas.height - 16);
  drawColorbar(ctx, canvas.width - 44, 35, 12, canvas.height - 74, Number(displayLimit.value || 300));
}

function resizeCanvasToDisplay(canvas) {
  if (!canvas) return;
  const scale = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * scale));
  const height = Math.max(1, Math.round(rect.height * scale));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function projectCombinedPoint(x, y, z, canvas) {
  const cosYaw = Math.cos(combinedView.yaw);
  const sinYaw = Math.sin(combinedView.yaw);
  const cosPitch = Math.cos(combinedView.pitch);
  const sinPitch = Math.sin(combinedView.pitch);
  const rotatedX = x * cosYaw - y * sinYaw;
  const rotatedY = x * sinYaw + y * cosYaw;
  const centerX = canvas.width * 0.5;
  const baseY = canvas.height * 0.64;
  const sx = canvas.width * 0.031 * combinedView.zoom;
  const sy = canvas.height * 0.031 * cosPitch * combinedView.zoom;
  const sz = canvas.height * 0.2 * sinPitch * combinedView.zoom;
  return {
    x: centerX + rotatedX * sx,
    y: baseY + rotatedY * sy - z * sz,
  };
}

function smoothStep(value) {
  const v = Math.max(0, Math.min(1, value));
  return v * v * (3 - 2 * v);
}

function softDot(ctx, x, y, radius, color, alpha) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`);
  gradient.addColorStop(0.55, `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha * 0.36})`);
  gradient.addColorStop(1, `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0)`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawSoftRibbon(ctx, points, color, width, alpha) {
  if (points.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length - 1; index += 1) {
    const midX = (points[index].x + points[index + 1].x) / 2;
    const midY = (points[index].y + points[index + 1].y) / 2;
    ctx.quadraticCurveTo(points[index].x, points[index].y, midX, midY);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
  ctx.restore();
}

function drawCombinedSurface(ctx, canvas, normalizedGrid, color, zOffset, label) {
  const samples = 58;
  const rowWidth = Math.max(2.2, canvas.width * 0.006);
  for (let row = samples - 1; row >= 0; row -= 1) {
    const softLine = [];
    const highlightLine = [];
    for (let col = 0; col < samples; col += 1) {
      const gridRow = (row / (samples - 1)) * 15;
      const gridCol = (col / (samples - 1)) * 15;
      const raw = sampleGrid(normalizedGrid, gridRow, gridCol);
      const value = smoothStep(raw);
      const point = projectCombinedPoint(gridCol - 7.5, gridRow - 7.5, zOffset + value * 0.82, canvas);
      softLine.push(point);
      if (value > 0.34) highlightLine.push(point);
    }
    drawSoftRibbon(ctx, softLine, color, rowWidth * 2.2, 0.10);
    drawSoftRibbon(ctx, softLine, color, rowWidth, 0.30);
    drawSoftRibbon(ctx, highlightLine, [245, 248, 230], rowWidth * 0.8, 0.18);
  }
  for (let row = 0; row < 16; row += 1) {
    for (let col = 0; col < 16; col += 1) {
      const value = smoothStep(normalizedGrid[row]?.[col] || 0);
      if (value < 0.16) continue;
      const point = projectCombinedPoint(col - 7.5, row - 7.5, zOffset + value * 0.82, canvas);
      softDot(ctx, point.x, point.y, Math.max(5, canvas.width * 0.012) * (0.8 + value), color, 0.10 + value * 0.18);
    }
  }
  ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
  ctx.font = `${Math.round(canvas.width * 0.021)}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = "left";
  ctx.fillText(label, 18, label === "Layer 1" ? 54 : 78);
}

function drawCombinedGround(ctx, canvas) {
  const corners = [
    projectCombinedPoint(-8, -8, 0, canvas),
    projectCombinedPoint(8, -8, 0, canvas),
    projectCombinedPoint(8, 8, 0, canvas),
    projectCombinedPoint(-8, 8, 0, canvas),
  ];
  ctx.fillStyle = "rgba(205, 232, 224, 0.06)";
  ctx.strokeStyle = "rgba(205, 232, 224, 0.22)";
  ctx.lineWidth = Math.max(1, canvas.width * 0.002);
  ctx.beginPath();
  corners.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawCombinedAcc(ctx, canvas, acc) {
  if (!Array.isArray(acc) || acc.length < 16) return;
  const lookup = [0, 7, 8, 9, 5, 6, 15, 10, 4, 2, 12, 11, 3, 1, 14, 13];
  lookup.forEach((sourceIndex, targetIndex) => {
    const sample = acc[sourceIndex] || [0, 0, 0];
    const ix = Math.floor(targetIndex / 4);
    const iy = targetIndex % 4;
    const x = ix * 4 - 6 + (Number(sample[0]) || 0) / 16384;
    const y = iy * 4 - 6 + (Number(sample[1]) || 0) / 16384;
    const z = 1.25 + (Number(sample[2]) || 0) / 16384;
    const point = projectCombinedPoint(x, y, z, canvas);
    softDot(ctx, point.x, point.y, Math.max(5, canvas.width * 0.012), [82, 132, 255], 0.36);
    ctx.fillStyle = "rgba(190, 214, 255, 0.92)";
    ctx.beginPath();
    ctx.arc(point.x, point.y, Math.max(1.8, canvas.width * 0.0038), 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawCombinedScene(canvas, layer1, layer2, frame) {
  if (!canvas) return;
  resizeCanvasToDisplay(canvas);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#122623");
  gradient.addColorStop(1, "#07110f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const base = projectCombinedPoint(0, 0, 0, canvas);
  const baseGlow = ctx.createRadialGradient(base.x, base.y, 0, base.x, base.y, canvas.width * 0.42);
  baseGlow.addColorStop(0, "rgba(200, 235, 225, 0.10)");
  baseGlow.addColorStop(1, "rgba(200, 235, 225, 0)");
  ctx.fillStyle = baseGlow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawCombinedGround(ctx, canvas);

  drawCombinedSurface(ctx, canvas, layer1.normalized, [230, 85, 76], 0, "Layer 1");
  drawCombinedSurface(ctx, canvas, layer2.normalized, [67, 210, 117], 0.04, "Layer 2");
  drawCombinedAcc(ctx, canvas, frame?.acc);

  ctx.fillStyle = "#dcebe6";
  ctx.font = `${Math.round(canvas.width * 0.027)}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = "left";
  ctx.fillText("Real-time 3D Plot", 18, 28);
  ctx.fillStyle = "rgba(220, 235, 230, 0.7)";
  ctx.font = `${Math.round(canvas.width * 0.018)}px ui-monospace, Consolas, monospace`;
  ctx.fillText("drag to rotate   wheel to zoom   red: layer 1   green: layer 2   blue: LIS3DH", 18, canvas.height - 22);
}

function emptyGrid() {
  return Array.from({ length: 16 }, () => Array(16).fill(0));
}

function layersFromFrame() {
  const normalized = live.frame?.layersNormalized || [];
  const values = live.frame?.layersValues || [];
  return [
    {
      normalized: normalized[0] || emptyGrid(),
      values: values[0] || emptyGrid(),
    },
    {
      normalized: normalized[1] || emptyGrid(),
      values: values[1] || emptyGrid(),
    },
  ];
}

function render() {
  const [layer1, layer2] = layersFromFrame();
  drawMatlabHeatmap(canvases.layer1Heatmap, layer1.normalized, layer1.values, "FSR layer 1 delta");
  drawMatlabHeatmap(canvases.layer2Heatmap, layer2.normalized, layer2.values, "FSR layer 2 delta");
  drawMatlabSurface(canvases.layer1Surface, layer1.normalized, layer1.values, "surf(layer 1)");
  drawMatlabSurface(canvases.layer2Surface, layer2.normalized, layer2.values, "surf(layer 2)");
  drawCombinedScene(canvases.combinedScene, layer1, layer2, live.frame);
  updateMetrics();
}

function formatBytes(bytes) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB/s`;
  if (bytes >= 1000) return `${(bytes / 1000).toFixed(1)} kB/s`;
  return `${bytes.toFixed(0)} B/s`;
}

function formatBytesFromBits(bits) {
  return formatBytes((Number(bits) || 0) / 8);
}

function formatBits(bytes) {
  const bits = bytes * 8;
  if (bits >= 1_000_000) return `${(bits / 1_000_000).toFixed(2)} Mb/s`;
  if (bits >= 1000) return `${(bits / 1000).toFixed(1)} kb/s`;
  return `${bits.toFixed(0)} bit/s`;
}

function formatBitRate(bits) {
  const value = Number(bits) || 0;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} Mb/s`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)} kb/s`;
  return `${value.toFixed(0)} bit/s`;
}

function formatMbitFromBytes(bytes) {
  return `${((Number(bytes) || 0) * 8 / 1_000_000).toFixed(4)} Mbit`;
}

function updateMetrics() {
  const frame = live.frame;
  const hardwareSerialBits = Number(frame?.serialBitsPerSecond || 0);
  hardwareFps.textContent = frame?.hardwareFps ? frame.hardwareFps.toFixed(1) : "0.0";
  uiFps.textContent = live.uiFps.toFixed(1);
  serialRate.textContent = `${formatBitRate(hardwareSerialBits)} / ${formatBytesFromBits(hardwareSerialBits)}`;
  frameBytes.textContent = frame?.serialBytesPerFrame ? `${frame.serialBytesPerFrame} B` : "0 B";
  layer1Peak.textContent = frame?.layerMaxValues?.[0] ? frame.layerMaxValues[0].toFixed(1) : "0";
  layer2Peak.textContent = frame?.layerMaxValues?.[1] ? frame.layerMaxValues[1].toFixed(1) : "0";
  layer1State.textContent = frame?.layersNormalized?.[0] ? "live" : "waiting";
  layer2State.textContent = frame?.layersNormalized?.[1] ? "live" : "not available";
  if (!frameDataPreview) return;
  if (!frame) {
    frameDataPreview.textContent = "No hardware frame yet.";
    return;
  }
  const acc = frame.accPreview?.length
    ? frame.accPreview.map((item, index) => `A${index + 1}: [${item.join(", ")}]`).join("\n")
    : "not included by selected protocol";
  const frameBytesValue = Number(frame.serialBytesPerFrame || 0);
  frameDataPreview.textContent = [
    "MCU -> PC serial data",
    `measured rate: ${formatBitRate(hardwareSerialBits)} (${formatBytesFromBits(hardwareSerialBits)})`,
    `per frame: ${formatMbitFromBytes(frameBytesValue)} / ${frameBytesValue} B`,
    `hardware FPS: ${Number(frame.hardwareFps || 0).toFixed(1)}`,
    `frame type: ${frame.frameType || "raw"}`,
    `changed cells: ${frame.changedCount ?? "n/a"}`,
    "",
    `protocol: ${frame.protocol}`,
    `port: ${frame.port}`,
    `FSR timestamp: ${frame.tsFsr ?? "n/a"}`,
    `ACC timestamp: ${frame.tsAcc ?? "n/a"}`,
    `baseline: ${frame.baselineReady ? "tare applied" : "raw values"}`,
    "",
    "ACC preview:",
    acc,
  ].join("\n");
}

function updateStatus() {
  toggleLive.classList.toggle("active", live.enabled);
  displayLimitValue.textContent = displayLimit.value;
  deadbandValue.textContent = `${deadband.value} / ${Math.max(Number(deadband.value), 35)} L2`;
  if (!live.enabled) {
    liveState.textContent = "offline";
    liveStatus.textContent = "Open the serial stream to begin hardware visualization.";
    return;
  }
  if (live.lastError) {
    liveState.textContent = "error";
    liveStatus.textContent = live.lastError;
    return;
  }
  liveState.textContent = live.frame ? "live" : "connecting";
  liveStatus.textContent = live.frame
    ? `${live.frame.protocol} on ${live.frame.port}, baseline ${live.frame.baselineReady ? "on" : "raw"}`
    : `Opening ${livePort.value || "COM5"}...`;
}

async function closeHardwareSession() {
  await fetch("/api/fsr-hardware-close", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ port: livePort.value || "COM5" }),
  }).catch(() => {});
}

async function fetchFrame() {
  if (!live.enabled || live.inFlight) return;
  live.inFlight = true;
  try {
    const response = await fetch("/api/fsr-hardware-frame", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(hardwarePayload()),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Hardware frame unavailable");
    live.frame = result;
    live.lastError = null;
    live.framesThisSecond += 1;
    const now = performance.now();
    if (now - live.lastStatsAt >= 1000) {
      const seconds = (now - live.lastStatsAt) / 1000;
      live.uiFps = live.framesThisSecond / seconds;
      live.framesThisSecond = 0;
      live.lastStatsAt = now;
    }
    render();
  } catch (error) {
    live.lastError = error.message;
    await closeHardwareSession();
  } finally {
    live.inFlight = false;
    updateStatus();
  }
}

function restartLiveTimer() {
  if (live.timer) window.clearInterval(live.timer);
  live.timer = null;
  if (!live.enabled) return;
  fetchFrame();
  live.timer = window.setInterval(fetchFrame, 100);
}

async function toggleLiveMode() {
  live.enabled = !live.enabled;
  if (!live.enabled) {
    await closeHardwareSession();
    live.frame = null;
    live.lastError = null;
    live.uiFps = 0;
    render();
  }
  restartLiveTimer();
  updateStatus();
}

async function tare() {
  tareLive.disabled = true;
  liveStatus.textContent = "Capturing tare frames...";
  try {
    const response = await fetch("/api/fsr-hardware-tare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...hardwarePayload(), frames: 20 }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Tare failed");
    liveStatus.textContent = `Tare complete: ${result.frames} frames. MCU trigger baseline reset.`;
    await fetchFrame();
  } catch (error) {
    live.lastError = error.message;
  } finally {
    tareLive.disabled = false;
    updateStatus();
  }
}

function firmwareLog(result) {
  const lines = [
    result.ok ? "Upload complete" : "Upload failed",
    `target: ${result.label || result.target || "unknown"}`,
    `port: ${result.port || livePort.value || "COM5"}`,
    `sampleHz: ${result.sampleHz || firmwareSampleHz.value}`,
    `baselineDeltaThreshold: ${result.triggerThreshold ?? firmwareTriggerThreshold?.value ?? "n/a"}`,
  ];
  if (result.frequencyMode) lines.push(`frequency: ${result.frequencyMode}`);
  if (result.temporaryBuildCleaned) lines.push("temporary build: cleaned");
  else if (result.preparedSketch) lines.push(`prepared: ${result.preparedSketch}`);
  if (result.sketch) lines.push(`sketch: ${result.sketch}`);
  if (result.stage) lines.push(`stage: ${result.stage}`);
  if (result.error) lines.push(`error: ${result.error}`);
  if (result.stdout) lines.push("", "stdout:", result.stdout.trim());
  if (result.stderr) lines.push("", "stderr:", result.stderr.trim());
  return lines.join("\n");
}

function updateFirmwareModeHelp() {
  if (!firmwareTarget || !firmwareSampleHz) return;
  const isTriggered = firmwareTarget.value === "combined-triggered";
  if (firmwareSampleHzLabel) {
    firmwareSampleHzLabel.textContent = isTriggered ? "High-speed frequency" : "Sample frequency";
  }
  if (firmwareSampleHzNote) {
    firmwareSampleHzNote.textContent = isTriggered
      ? "Idle is fixed at 10 Hz. This value controls active scanning after either FSR layer changes from the Tare baseline beyond the threshold."
      : "Used as the firmware scan/output rate.";
  }
  if (isTriggered && Number(firmwareSampleHz.value || 0) <= 10) {
    firmwareSampleHz.value = "200";
  }
}

async function flashFirmware() {
  flashHardwareFirmware.disabled = true;
  hardwareFlashStatus.textContent = "Closing serial session, compiling, and uploading...";
  const wasLive = live.enabled;
  live.enabled = false;
  restartLiveTimer();
  await closeHardwareSession();
  try {
    const response = await fetch("/api/flash-firmware", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target: firmwareTarget.value,
        port: livePort.value || "COM5",
        fqbn: firmwareFqbnLive.value || "teensy:avr:teensy41",
        sampleHz: Number(firmwareSampleHz.value || 50),
        triggerThreshold: Number(firmwareTriggerThreshold?.value || 150),
      }),
    });
    const result = await response.json();
    hardwareFlashStatus.textContent = firmwareLog(result);
  } catch (error) {
    hardwareFlashStatus.textContent = `Upload failed\nerror: ${error.message}`;
  } finally {
    flashHardwareFirmware.disabled = false;
    live.enabled = wasLive;
    restartLiveTimer();
    updateStatus();
  }
}

toggleLive.addEventListener("click", toggleLiveMode);
tareLive.addEventListener("click", tare);
flashHardwareFirmware.addEventListener("click", flashFirmware);
firmwareTarget.addEventListener("change", updateFirmwareModeHelp);
if (canvases.combinedScene) {
  canvases.combinedScene.addEventListener("pointerdown", (event) => {
    combinedView.dragging = true;
    combinedView.lastX = event.clientX;
    combinedView.lastY = event.clientY;
    canvases.combinedScene.setPointerCapture(event.pointerId);
  });
  canvases.combinedScene.addEventListener("pointermove", (event) => {
    if (!combinedView.dragging) return;
    const dx = event.clientX - combinedView.lastX;
    const dy = event.clientY - combinedView.lastY;
    combinedView.lastX = event.clientX;
    combinedView.lastY = event.clientY;
    combinedView.yaw += dx * 0.008;
    combinedView.pitch = Math.max(0.18, Math.min(1.22, combinedView.pitch + dy * 0.006));
    render();
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
    canvases.combinedScene.addEventListener(eventName, (event) => {
      combinedView.dragging = false;
      if (event.pointerId !== undefined) {
        try {
          canvases.combinedScene.releasePointerCapture(event.pointerId);
        } catch {}
      }
    });
  });
  canvases.combinedScene.addEventListener("wheel", (event) => {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    const factor = direction > 0 ? 1.08 : 0.92;
    combinedView.zoom = Math.max(0.55, Math.min(2.5, combinedView.zoom * factor));
    render();
  }, { passive: false });
}
[displayLimit, deadband].forEach((control) => {
  control.addEventListener("input", () => {
    updateStatus();
    restartLiveTimer();
  });
});
[livePort, liveProtocol].forEach((control) => {
  control.addEventListener("change", async () => {
    await closeHardwareSession();
    live.frame = null;
    live.lastError = null;
    render();
    restartLiveTimer();
  });
});

window.addEventListener("beforeunload", closeHardwareSession);
updateFirmwareModeHelp();
render();
updateStatus();
