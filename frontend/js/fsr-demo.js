const demo = {
  row: 1,
  scanCol: 1,
  objectRow: 8,
  col: 8,
  objectSize: 72,
  objectMass: 620,
  refreshRate: 5,
  auto: false,
  timer: null,
  fifoTimer: null,
  fifoPlayback: null,
  updateInFlight: false,
  pendingUpdate: false,
  scanTick: 0,
  hardware: null,
  mosiResult: null,
  placingObject: false,
  receivedCodes: Array.from({ length: 16 }, () => Array(16).fill(null)),
  hardwareLive: {
    enabled: false,
    timer: null,
    frame: null,
    inFlight: false,
    lastError: null,
  },
};

const HEATMAP_DETECTION_OFFSET = 2;

const svgEl = document.getElementById("fsrCircuit");
const objectSizeRange = document.getElementById("objectSizeRange");
const objectMassRange = document.getElementById("objectMassRange");
const refreshRateRange = document.getElementById("refreshRateRange");
const objectSizeValue = document.getElementById("objectSizeValue");
const objectMassValue = document.getElementById("objectMassValue");
const refreshRateValue = document.getElementById("refreshRateValue");
const refreshRateNote = document.getElementById("refreshRateNote");
const scanState = document.getElementById("scanState");
const activeCell = document.getElementById("activeCell");
const fsrResistance = document.getElementById("fsrResistance");
const adcVoltage = document.getElementById("adcVoltage");
const adcCode = document.getElementById("adcCode");
const spiFrame = document.getElementById("spiFrame");
const adcInputTable = document.getElementById("adcInputTable");
const manualMosi = document.getElementById("manualMosi");
const runMosi = document.getElementById("runMosi");
const mosiStatus = document.getElementById("mosiStatus");
const misoOutput = document.getElementById("misoOutput");
const fsrDemoGrid = document.getElementById("fsrDemoGrid");
const toggleReadoutPanel = document.getElementById("toggleReadoutPanel");
const fsrHeatmap2d = document.getElementById("fsrHeatmap2d");
const fsrHeatmapCtx = fsrHeatmap2d?.getContext("2d");
const fsrSurface3d = document.getElementById("fsrSurface3d");
const fsrSurfaceCtx = fsrSurface3d?.getContext("2d");
const hardwarePort = document.getElementById("hardwarePort");
const hardwareProtocol = document.getElementById("hardwareProtocol");
const hardwareLayer = document.getElementById("hardwareLayer");
const hardwareLiveState = document.getElementById("hardwareLiveState");
const hardwareLiveStatus = document.getElementById("hardwareLiveStatus");
const toggleHardwareLive = document.getElementById("toggleHardwareLive");
const tareHardwareFsr = document.getElementById("tareHardwareFsr");
const fsrHeatmapSource = document.getElementById("fsrHeatmapSource");
const fsrSurfaceSource = document.getElementById("fsrSurfaceSource");

const layout = {
  dmuxX: 70,
  dmuxY: 150,
  dmuxW: 135,
  dmuxH: 390,
  mcuX: 70,
  mcuY: 659,
  mcuW: 210,
  mcuH: 112,
  arrayX: 335,
  arrayY: 130,
  arrayW: 710,
  arrayH: 410,
  adcX: 365,
  adcY: 675,
  adcW: 650,
  adcH: 96,
  heatmapX: 1062,
  heatmapY: 118,
  heatmapSize: 176,
};

function svg(tag, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function addText(parent, text, x, y, attrs = {}) {
  const node = svg("text", { x, y, ...attrs });
  node.textContent = text;
  parent.appendChild(node);
  return node;
}

function line(parent, x1, y1, x2, y2, className = "wire") {
  parent.appendChild(svg("line", { x1, y1, x2, y2, class: className }));
}

function path(parent, d, className = "wire") {
  parent.appendChild(svg("path", { d, class: className, fill: "none" }));
}

function resistor(parent, x, y, vertical = true, className = "component-line") {
  const points = [];
  const step = 5;
  for (let i = 0; i <= 8; i += 1) {
    const offset = i % 2 === 0 ? -5 : 5;
    if (vertical) points.push(`${x + offset},${y + i * step}`);
    else points.push(`${x + i * step},${y + offset}`);
  }
  parent.appendChild(svg("polyline", { points: points.join(" "), class: className, fill: "none" }));
}

function drawGround(parent, x, y) {
  line(parent, x, y, x, y + 10);
  line(parent, x - 10, y + 10, x + 10, y + 10);
  line(parent, x - 6, y + 16, x + 6, y + 16);
  line(parent, x - 2, y + 22, x + 2, y + 22);
}

function drawDiode(parent, x, y, className = "diode") {
  parent.appendChild(svg("polygon", {
    points: `${x - 9},${y - 8} ${x - 9},${y + 8} ${x + 5},${y}`,
    class: className,
  }));
  line(parent, x + 8, y - 10, x + 8, y + 10, className);
}

function addressBit(row, bit) {
  if (!isMuxScanVisible()) return 0;
  const bits = demo.hardware?.address?.bits;
  if (bits && bits[bit]) return bits[bit].level;
  return ((row - 1) >> bit) & 1;
}

function formatOhms(ohms) {
  if (ohms >= 1000) return `${(ohms / 1000).toFixed(1)} kOhm`;
  return `${Math.round(ohms)} Ohm`;
}

function formatRate(value, unit) {
  if (unit === "pulse") {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} Mpulse/s`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)} kpulse/s`;
    return `${value.toFixed(0)} pulse/s`;
  }
  if (unit === "assertion") {
    if (value >= 1000) return `${(value / 1000).toFixed(1)} kassert/s`;
    return `${value.toFixed(0)} assert/s`;
  }
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} Mb/s`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)} kb/s`;
  return `${value.toFixed(0)} b/s`;
}

function formatBitAndByteRate(bitsPerSecond) {
  const bits = Number(bitsPerSecond) || 0;
  const bytes = bits / 8;
  const bitText = bits >= 1_000_000
    ? `${(bits / 1_000_000).toFixed(2)} Mb/s`
    : bits >= 1000
      ? `${(bits / 1000).toFixed(1)} kb/s`
      : `${bits.toFixed(0)} bit/s`;
  const byteText = bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(2)} MB/s`
    : bytes >= 1000
      ? `${(bytes / 1000).toFixed(1)} kB/s`
      : `${bytes.toFixed(1)} B/s`;
  return `${bitText} (${byteText})`;
}

async function fetchHardwareRow(row) {
  const response = await fetch("/api/fsr-readout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      row,
      scanCol: demo.scanCol,
      objectRow: demo.objectRow,
      col: demo.col,
      objectSize: demo.objectSize,
      objectMass: demo.objectMass,
      refreshRate: demo.refreshRate,
    }),
  });
  return response.json();
}

async function requestHardwareState() {
  if (scanVisualizationMode() === "direct") {
    const frameState = await fetchHardwareRow(demo.row);
    demo.hardware = frameState;
    applyScannedFrame(frameState);
    stopFifoPlayback();
    demo.fifoPlayback = {
      active: false,
      row: null,
      col: null,
      words: [],
      mode: "direct",
    };
    drawCircuit();
    return;
  }
  demo.hardware = await fetchHardwareRow(demo.row);
  await showScanResult(demo.hardware);
}

async function requestManualMosi() {
  const response = await fetch("/api/adc-mosi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      row: demo.row,
      objectRow: demo.objectRow,
      col: demo.col,
      objectSize: demo.objectSize,
      objectMass: demo.objectMass,
      mosi: manualMosi.value,
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "MOSI program failed");
  return result;
}

function drawCircuit() {
  if (!demo.hardware) return;
  svgEl.innerHTML = "";
  const columns = displayColumns();
  const active = activePanelColumn(columns);
  const root = svg("g");
  svgEl.appendChild(root);

  addText(root, "Complete FSR Readout Circuit", 640, 48, { class: "circuit-title", "text-anchor": "middle" });

  drawMcu(root);
  drawDmux(root);
  drawArray(root, columns);
  drawAdc(root, columns);
  drawHardwareHeatmap(root);

  fsrResistance.textContent = formatOhms(active.fsrOhms);
  adcVoltage.textContent = `${active.nodeVoltage.toFixed(2)} V`;
  adcCode.textContent = String(active.code);
  const fifoCol = fifoCursorCol();
  activeCell.textContent = fifoCol ? `FIFO R${demo.row},C${fifoCol}` : `R${demo.objectRow},C${demo.col}`;
  objectSizeValue.textContent = `${demo.objectSize} mm`;
  objectMassValue.textContent = `${demo.objectMass} g`;
  refreshRateValue.textContent = `${demo.refreshRate} Hz`;
  refreshRateNote.textContent = refreshRateExplanation();
  scanState.textContent = demo.auto ? `auto scan #${demo.scanTick}` : "manual";
  svgEl.classList.toggle("no-animation", demo.refreshRate > 100);
  renderAdcInputTable();
  const rates = demo.hardware.mcu.lineRates;
  const uplink = demo.hardware.moduleUplink;
  const uplinkRates = uplink.lineRates;
  const spiLines = [
    `MCU <-> ADC SPI`,
    `Address: ${formatBitAndByteRate(rates.Address.perSecond)}`,
    `SCK: ${formatBitAndByteRate(rates.SCK.perSecond)}`,
    `MOSI: ${formatBitAndByteRate(rates.MOSI.perSecond)}`,
    `MISO: ${formatBitAndByteRate(rates.MISO.perSecond)}`,
    `CS: ${formatBitAndByteRate(rates.CS.edgesPerSecond)}`,
    ``,
    `MCU <-> FPGA SPI`,
    `SCK: ${formatBitAndByteRate(uplinkRates.SCK.perSecond)}`,
    `MOSI: ${formatBitAndByteRate(uplinkRates.MOSI.perSecond)}`,
    `MISO: ${formatBitAndByteRate(uplinkRates.MISO.perSecond)}`,
    `CS: ${formatBitAndByteRate(uplinkRates.CS.edgesPerSecond)}`,
  ];
  spiFrame.textContent = spiLines.join("\n");
  renderFsrVisuals();
  updateHardwareLiveLabels();
}

function heatColor(value, alpha = 1) {
  if (value <= 0) return `rgba(230, 244, 239, ${alpha})`;
  if (value < 0.35) return `rgba(${Math.round(91 + value * 180)}, ${Math.round(184 - value * 50)}, 199, ${alpha})`;
  if (value < 0.72) return `rgba(${Math.round(230 + value * 20)}, ${Math.round(194 - value * 80)}, 58, ${alpha})`;
  return `rgba(215, ${Math.round(96 - value * 45)}, 69, ${alpha})`;
}

function scannedIntensityGrid() {
  return Array.from({ length: 16 }, (_, row) =>
    Array.from({ length: 16 }, (_, col) => heatmapIntensity(demo.receivedCodes[row][col]))
  );
}

function visualIntensityGrid() {
  if (demo.hardwareLive.frame?.normalized) {
    return demo.hardwareLive.frame.normalized;
  }
  return Array.from({ length: 16 }, () => Array(16).fill(0));
}

function visualSourceLabel() {
  if (!demo.hardwareLive.enabled) return "hardware idle";
  if (demo.hardwareLive.frame?.normalized) return "live hardware frame";
  return "waiting for hardware";
}

function renderFsrVisuals() {
  renderFsrHeatmap2d();
  renderFsrSurface3d();
}

function renderFsrHeatmap2d() {
  if (!fsrHeatmapCtx || !fsrHeatmap2d) return;
  const ctx = fsrHeatmapCtx;
  const width = fsrHeatmap2d.width;
  const height = fsrHeatmap2d.height;
  const cell = width / 16;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f8fbf9";
  ctx.fillRect(0, 0, width, height);

  const grid = visualIntensityGrid();
  for (let row = 0; row < 16; row += 1) {
    for (let col = 0; col < 16; col += 1) {
      ctx.fillStyle = heatColor(grid[row][col]);
      ctx.fillRect(col * cell, row * cell, cell - 1, cell - 1);
    }
  }

  ctx.strokeStyle = "rgba(34, 91, 84, 0.32)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 16; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, height);
    ctx.moveTo(0, i * cell);
    ctx.lineTo(width, i * cell);
    ctx.stroke();
  }

  const col = Math.max(1, Math.min(16, fifoCursorCol()));
  ctx.strokeStyle = "#1e8aa5";
  ctx.lineWidth = 3;
  ctx.strokeRect((col - 1) * cell + 1, (demo.row - 1) * cell + 1, cell - 3, cell - 3);
}

function renderFsrSurface3d() {
  if (!fsrSurfaceCtx || !fsrSurface3d) return;
  const ctx = fsrSurfaceCtx;
  const width = fsrSurface3d.width;
  const height = fsrSurface3d.height;
  const grid = visualIntensityGrid();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f8fbf9";
  ctx.fillRect(0, 0, width, height);

  const originX = width / 2;
  const originY = height * 0.75;
  const dx = 11;
  const dy = 5.8;
  const maxH = 86;
  const cellW = 10;
  const cellH = 5;
  const cells = [];

  for (let row = 0; row < 16; row += 1) {
    for (let col = 0; col < 16; col += 1) {
      const value = grid[row][col];
      cells.push({
        value,
        x: originX + (col - row) * dx,
        y: originY + (col + row - 15) * dy,
        z: value * maxH,
      });
    }
  }

  for (const cell of cells) {
    const topY = cell.y - cell.z;
    ctx.strokeStyle = cell.value > 0.02 ? "rgba(43, 61, 57, 0.38)" : "rgba(43, 61, 57, 0.10)";
    ctx.beginPath();
    ctx.moveTo(cell.x, cell.y);
    ctx.lineTo(cell.x, topY);
    ctx.stroke();

    ctx.fillStyle = heatColor(cell.value, cell.value > 0 ? 0.92 : 0.45);
    ctx.beginPath();
    ctx.moveTo(cell.x, topY - cellH);
    ctx.lineTo(cell.x + cellW, topY);
    ctx.lineTo(cell.x, topY + cellH);
    ctx.lineTo(cell.x - cellW, topY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.fillStyle = "#66726e";
  ctx.font = "11px system-ui";
  ctx.fillText("Teensy hardware FSR surface", 12, height - 12);
}

function hardwarePayload() {
  return {
    port: hardwarePort?.value || "COM5",
    baud: 500000,
    protocol: hardwareProtocol?.value || "fsr-serial",
    layer: hardwareLayer?.value || "0",
    n: 16,
    displayLimit: 300,
    deadband: hardwareLayer?.value === "1" ? 35 : 8,
  };
}

function hardwarePollInterval() {
  return Math.max(30, Math.min(1000, 1000 / Math.max(1, demo.refreshRate)));
}

async function fetchHardwareLiveFrame() {
  const response = await fetch("/api/fsr-hardware-frame", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(hardwarePayload()),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || "Hardware frame unavailable");
  return result;
}

async function closeHardwareLiveSession(port = "") {
  try {
    await fetch("/api/fsr-hardware-close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(port ? { port } : {}),
    });
  } catch (error) {
    console.warn("Hardware close failed", error);
  }
}

async function runHardwareLiveTick() {
  if (!demo.hardwareLive.enabled || demo.hardwareLive.inFlight) return;
  demo.hardwareLive.inFlight = true;
  try {
    demo.hardwareLive.frame = await fetchHardwareLiveFrame();
    demo.hardwareLive.lastError = null;
    renderFsrVisuals();
  } catch (error) {
    demo.hardwareLive.lastError = error.message;
  } finally {
    demo.hardwareLive.inFlight = false;
    updateHardwareLiveLabels();
  }
}

function restartHardwareLiveTimer() {
  if (demo.hardwareLive.timer) window.clearInterval(demo.hardwareLive.timer);
  demo.hardwareLive.timer = null;
  if (!demo.hardwareLive.enabled) return;
  runHardwareLiveTick();
  demo.hardwareLive.timer = window.setInterval(runHardwareLiveTick, hardwarePollInterval());
}

async function toggleHardwareLiveMode() {
  const wasEnabled = demo.hardwareLive.enabled;
  demo.hardwareLive.enabled = !demo.hardwareLive.enabled;
  if (!demo.hardwareLive.enabled) {
    if (wasEnabled) await closeHardwareLiveSession(hardwarePort?.value || "");
    demo.hardwareLive.frame = null;
    demo.hardwareLive.lastError = null;
  }
  restartHardwareLiveTimer();
  renderFsrVisuals();
  updateHardwareLiveLabels();
}

async function tareHardwareFrame() {
  if (!tareHardwareFsr) return;
  tareHardwareFsr.disabled = true;
  hardwareLiveStatus.textContent = "Capturing hardware tare frames...";
  try {
    const response = await fetch("/api/fsr-hardware-tare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...hardwarePayload(), frames: 20 }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Tare failed");
    hardwareLiveStatus.textContent = `Tare complete: ${result.frames} frame(s).`;
    await runHardwareLiveTick();
  } catch (error) {
    demo.hardwareLive.lastError = error.message;
    updateHardwareLiveLabels();
  } finally {
    tareHardwareFsr.disabled = false;
  }
}

function updateHardwareLiveLabels() {
  const source = visualSourceLabel();
  if (fsrHeatmapSource) fsrHeatmapSource.textContent = source;
  if (fsrSurfaceSource) fsrSurfaceSource.textContent = source;
  if (toggleHardwareLive) toggleHardwareLive.classList.toggle("active", demo.hardwareLive.enabled);
  if (!hardwareLiveState || !hardwareLiveStatus) return;

  if (!demo.hardwareLive.enabled) {
    hardwareLiveState.textContent = "offline";
    hardwareLiveStatus.textContent = "2D/3D FSR plots use live Teensy frames when enabled.";
    return;
  }
  if (demo.hardwareLive.lastError) {
    hardwareLiveState.textContent = "error";
    hardwareLiveStatus.textContent = demo.hardwareLive.lastError;
    return;
  }
  const frame = demo.hardwareLive.frame;
  if (!frame) {
    hardwareLiveState.textContent = "connecting";
    hardwareLiveStatus.textContent = `Opening ${hardwarePayload().port} at 500000 baud...`;
    return;
  }
  hardwareLiveState.textContent = "live";
  const fps = frame.hardwareFps ? `${frame.hardwareFps.toFixed(1)} FPS` : "FPS pending";
  hardwareLiveStatus.textContent = `${frame.protocol} ${frame.port}, ${fps}, max ${frame.maxValue.toFixed(1)}, baseline ${frame.baselineReady ? "on" : "raw"}.`;
}

function manualMosiLines(result) {
  const lines = [
    `Manual MOSI program`,
    `INPUT = ${result.mosiBytes.join(" ") || "none"}`,
    `SETUP = ${result.setupState.hex} ${result.setupState.binary}`,
    `AVG = ${result.averagingState.hex} ${result.averagingState.binary}`,
    `MISO total = ${result.misoWords.length} x 16-bit word`,
  ];
  for (const tx of result.transactions) {
    lines.push(
      `#${tx.index} MOSI ${tx.mosi.hex} ${tx.mosi.binary}`,
      `   ${tx.decoded.tableRow}: ${tx.effect}`,
    );
    if (tx.misoWords.length) {
      const preview = tx.misoWords.length > 6
        ? [...tx.misoWords.slice(0, 4), { hex: "...", binary: `${tx.misoWords.length - 5} more word(s)` }, tx.misoWords[tx.misoWords.length - 1]]
        : tx.misoWords;
      lines.push(`   MISO: ${tx.misoWords.length} word(s)`);
      for (const word of preview) {
        lines.push(`   ${word.ain || ""} ${word.hex} ${word.binary}`.trim());
      }
    } else {
      lines.push(`   MISO: idle`);
    }
  }
  return lines;
}

function renderAdcInputTable() {
  if (!adcInputTable || !demo.hardware?.adc?.inputDataByteTable) return;
  adcInputTable.innerHTML = "";
  for (const row of demo.hardware.adc.inputDataByteTable) {
    const tr = document.createElement("tr");
    const register = document.createElement("th");
    register.scope = "row";
    register.textContent = row.register;
    tr.appendChild(register);
    for (const bit of row.bits) {
      const td = document.createElement("td");
      td.textContent = bit;
      tr.appendChild(td);
    }
    adcInputTable.appendChild(tr);
  }
}

function drawMcu(root) {
  root.appendChild(svg("rect", { x: layout.mcuX, y: layout.mcuY, width: layout.mcuW, height: layout.mcuH, rx: 8, class: "block mcu" }));
  addText(root, "STM32G474", layout.mcuX + layout.mcuW / 2, layout.mcuY + 48, { class: "block-title", "text-anchor": "middle" });
  addText(root, "module MCU", layout.mcuX + layout.mcuW / 2, layout.mcuY + 77, { class: "small-label", "text-anchor": "middle" });
  drawAddressBus(root);
  drawUplinkBus(root);
}

function drawUplinkBus(root) {
  const hubX = layout.mcuX;
  const hubY = layout.mcuY + layout.mcuH + 28;
  const hubW = layout.mcuW;
  const hubH = 58;
  root.appendChild(svg("rect", { x: hubX, y: hubY, width: hubW, height: hubH, rx: 8, class: "block fpga-hub" }));
  addText(root, "Upper FPGA/Hub", hubX + hubW / 2, hubY + 28, { class: "block-title", "text-anchor": "middle" });
  addText(root, "SPI command + raw frame", hubX + hubW / 2, hubY + 49, { class: "small-label", "text-anchor": "middle" });
  const lines = ["SCK", "MOSI", "MISO", "CS"];
  for (let i = 0; i < lines.length; i += 1) {
    const x = layout.mcuX + 34 + i * 45;
    line(root, x, layout.mcuY + layout.mcuH, x, hubY, "uplink-wire");
    addText(root, lines[i], x, hubY - 8, { class: "pin-label", "text-anchor": "middle" });
  }
}

function drawAddressBus(root) {
  const y1 = layout.dmuxY + layout.dmuxH - 1;
  const y2 = layout.mcuY;
  for (let bit = 0; bit < 4; bit += 1) {
    const x = layout.dmuxX + 32 + bit * 31;
    const level = addressBit(demo.row, bit);
    line(root, x, y1, x, y2, level ? "logic-wire high" : "logic-wire low");
    addText(root, `A${bit + 1}`, x - 8, y2 - 10, { class: level ? "active-label" : "pin-label" });
  }
}

function drawDmux(root) {
  const showMux = isMuxScanVisible();
  root.appendChild(svg("rect", { x: layout.dmuxX, y: layout.dmuxY, width: layout.dmuxW, height: layout.dmuxH, rx: 7, class: "block dmux" }));
  addText(root, "DMUX", layout.dmuxX + layout.dmuxW / 2, layout.dmuxY - 22, { class: "block-title", "text-anchor": "middle" });
  for (const rowState of demo.hardware.dmuxRows) {
    const row = rowState.row;
    const y = rowY(row);
    const active = showMux && rowState.selected;
    const diodeX = layout.dmuxX + layout.dmuxW + 28;
    addText(root, `R${row}`, layout.dmuxX + 28, y + 5, { class: active ? "row-label active-label" : "row-label" });
    addText(root, rowState.state, layout.dmuxX + 78, y + 5, { class: active ? "active-label dmux-state" : "pin-label dmux-state" });
    line(root, layout.dmuxX + layout.dmuxW, y, diodeX - 11, y, active ? "wire active-wire" : "wire ground-wire");
    drawDiode(root, diodeX, y, active ? "diode active-diode" : "diode");
    line(root, diodeX + 10, y, layout.arrayX, y, active ? "wire active-wire" : "wire ground-wire");
  }
}

function drawArray(root, columns) {
  const fifoCol = fifoCursorCol();
  const showMux = isMuxScanVisible();
  root.appendChild(svg("rect", { x: layout.arrayX, y: layout.arrayY, width: layout.arrayW, height: layout.arrayH, class: "array-bg" }));
  root.appendChild(svg("rect", { x: layout.arrayX, y: layout.arrayY, width: layout.arrayW, height: layout.arrayH, class: "array-hit-target" }));
  addText(root, "FSR array: 16 rows x 16 columns", layout.arrayX + layout.arrayW / 2, layout.arrayY - 20, { class: "block-title", "text-anchor": "middle" });

  for (let row = 1; row <= 16; row += 1) {
    const y = rowY(row);
    line(root, layout.arrayX, y, layout.arrayX + layout.arrayW, y, showMux && row === demo.row ? "array-row active-wire" : "array-row");
  }
  for (let col = 1; col <= 16; col += 1) {
    const x = colX(col);
    const columnActive = col === fifoCol;
    line(root, x, layout.arrayY + 18, x, layout.arrayY + layout.arrayH, columnActive ? "array-column fifo-scan-wire" : "array-column");
    addText(root, `C${col}`, x, layout.arrayY + layout.arrayH + 35, { class: columnActive ? "col-label active-label" : "col-label", "text-anchor": "middle" });
  }

  for (let row = 1; row <= 16; row += 1) {
    for (let col = 1; col <= 16; col += 1) {
      const x = colX(col);
      const y = rowY(row);
      const code = receivedCode(row, col);
      const scannedActive = code !== null && code >= heatmapDetectionCode();
      const fifoActive = showMux && row === demo.row && col === fifoCol;
      root.appendChild(svg("rect", {
        x: x - 10,
        y: y - 8,
        width: 20,
        height: 16,
        rx: 3,
        class: fifoActive ? "fsr-cell fifo-active" : scannedActive ? "fsr-cell covered" : "fsr-cell",
      }));
    }
  }

  drawPressureObject(root);

  for (let col = 1; col <= 16; col += 1) {
    const cx = colX(col);
    const nodeY = layout.adcY - 118;
    const resistorX = cx + 22;
    const bottomY = nodeY + 56;
    const fifoActive = col === fifoCol;
    root.appendChild(svg("circle", { cx, cy: nodeY, r: 4, class: fifoActive ? "sample-node active-node" : "sample-node" }));
    line(root, cx, layout.arrayY + layout.arrayH, cx, nodeY, fifoActive ? "wire fifo-scan-wire" : "wire sample-wire");
    line(root, cx, nodeY, cx, layout.adcY, fifoActive ? "wire fifo-scan-wire" : "wire sample-wire");
    line(root, cx, nodeY, resistorX, nodeY, fifoActive ? "wire fifo-scan-wire" : "wire");
    resistor(root, resistorX, nodeY, true, fifoActive ? "component-line active-component" : "component-line");
    line(root, resistorX, nodeY + 40, resistorX, bottomY, fifoActive ? "active-component" : "component-line");
    drawGround(root, resistorX, bottomY);
  }

  if (fifoCol) {
    const x = colX(fifoCol);
    path(root, `M ${x} ${layout.arrayY - 6} L ${x} ${layout.arrayY + layout.arrayH + 104}`, "fifo-readout-flow");
    addText(root, `FIFO -> MISO C${fifoCol}`, x + 12, layout.arrayY + 8, { class: "active-label fifo-label" });
  }
}

function drawAdc(root, columns) {
  root.appendChild(svg("rect", { x: layout.adcX, y: layout.adcY, width: layout.adcW, height: layout.adcH, rx: 8, class: "block adc" }));
  addText(root, "16-channel ADC", layout.adcX + layout.adcW / 2, layout.adcY + 58, { class: "block-title", "text-anchor": "middle" });
  for (const item of columns) {
    const x = colX(item.col);
    line(root, x, layout.adcY - 22, x, layout.adcY + 1, item.col === demo.col ? "wire active-wire" : "wire sample-wire");
  }
  drawSpiBus(root);
}

function drawSpiBus(root) {
  const lines = demo.hardware.spi.lines;
  const y0 = layout.adcY + 18;
  const activeLines = activeSpiLines();
  for (let i = 0; i < lines.length; i += 1) {
    const item = lines[i];
    const y = y0 + i * 20;
    const active = activeLines.has(item.name);
    const className = active ? `spi-wire spi-active spi-${item.name.toLowerCase()}` : "spi-wire";
    line(root, layout.mcuX + layout.mcuW, y, layout.adcX + 1, y, className);
    addText(root, item.name, layout.mcuX + layout.mcuW + 12, y + 5, { class: active ? "active-label" : "pin-label" });
    const state = demo.hardware.spi.lineState?.[item.name];
    if (state?.active) addText(root, state.label, layout.adcX + 8, y + 5, { class: "clock-head" });
  }
  addText(root, "state: current row transfer", layout.mcuX + layout.mcuW + 12, y0 + lines.length * 20 + 14, { class: "clock-head" });
}

function drawHardwareHeatmap(root) {
  const fifoCol = fifoCursorCol();
  const showMux = isMuxScanVisible();
  const x0 = layout.heatmapX;
  const y0 = layout.heatmapY;
  const cell = layout.heatmapSize / 16;
  root.appendChild(svg("rect", { x: x0 - 10, y: y0 - 30, width: layout.heatmapSize + 20, height: layout.heatmapSize + 54, rx: 6, class: "heatmap-panel" }));
  addText(root, "Hardware heatmap", x0, y0 - 10, { class: "clock-title" });
  for (let row = 1; row <= 16; row += 1) {
    for (let col = 1; col <= 16; col += 1) {
      const code = receivedCode(row, col);
      const normalized = heatmapIntensity(code);
      const hue = 205 - normalized * 205;
      const lightness = code === null ? 97 : 94 - normalized * 44;
      root.appendChild(svg("rect", {
        x: x0 + (col - 1) * cell,
        y: y0 + (row - 1) * cell,
        width: cell - 1,
        height: cell - 1,
        class: showMux && row === demo.row && col === fifoCol ? "heatmap-cell active-scan" : "heatmap-cell",
        fill: `hsl(${hue}, 78%, ${lightness}%)`,
      }));
    }
  }
  addText(root, showMux ? `scan row R${demo.row}, threshold ${heatmapDetectionCode()}` : `direct full-frame scan, threshold ${heatmapDetectionCode()}`, x0, y0 + layout.heatmapSize + 22, { class: "clock-head" });
}

function refreshRateExplanation() {
  if (demo.refreshRate > 10) {
    return `>10 Hz: scan animation is disabled. The heatmap is written directly from scanned ADC/FIFO data at ${demo.refreshRate} full 16x16 frame/s.`;
  }
  if (demo.refreshRate > 1) {
    return `1-10 Hz: one backend response carries one row. Timer = ${(1000 / (demo.refreshRate * 16)).toFixed(1)} ms/row, so ${demo.refreshRate} full 16x16 frame/s.`;
  }
  return `1 Hz: one backend response carries one ADC cell. Timer = ${(1000 / 256).toFixed(1)} ms/cell, so one full 16x16 frame is scanned per second.`;
}

function drawPressureObject(root) {
  const x = colX(demo.col);
  const y = rowY(demo.objectRow);
  const side = demo.objectSize;
  const g = svg("g", { class: "pressure-object", transform: `translate(${x} ${y})` });
  g.appendChild(svg("rect", { x: -side / 2, y: -side / 2, width: side, height: side, class: "pressure-square" }));
  g.appendChild(svg("rect", { x: -7, y: -7, width: 14, height: 14, class: "pressure-core" }));
  root.appendChild(g);
}

function rowY(row) {
  return layout.arrayY + 28 + (row - 1) * 23;
}

function colX(col) {
  return layout.arrayX + 42 + (col - 1) * 40;
}

function receivedCode(row, col) {
  return demo.receivedCodes[row - 1]?.[col - 1] ?? null;
}

function heatmapDetectionCode() {
  return (demo.hardware?.adc?.idleCode ?? 212) + HEATMAP_DETECTION_OFFSET;
}

function heatmapIntensity(code) {
  if (code === null) return 0;
  const idle = demo.hardware?.adc?.idleCode ?? 212;
  const signal = Math.max(0, code - idle);
  return Math.max(0, Math.min(1, signal / 1800));
}

function displayColumns() {
  return demo.hardware?.columns || [];
}

function activePanelColumn(columns) {
  if (demo.hardware?.adcColumn?.column) return demo.hardware.adcColumn.column;
  return columns[demo.col - 1] || columns[0] || {
    fsrOhms: 0,
    nodeVoltage: 0,
    code: 0,
  };
}

async function showScanResult(hardware, forceFifo = false) {
  if (hardware.responseMode === "cell") {
    stopFifoPlayback();
    demo.fifoPlayback = {
      active: true,
      row: hardware.row,
      col: hardware.scanCol,
      words: hardware.spi?.words?.slice(0, 1) || [],
      mode: "cell",
    };
    applyScannedCell(hardware);
    drawCircuit();
    return;
  }
  if (hardware.responseMode === "frame") {
    stopFifoPlayback();
    demo.fifoPlayback = {
      active: false,
      row: null,
      col: null,
      words: [],
      mode: "direct",
    };
    applyScannedFrame(hardware);
    drawCircuit();
    return;
  }
  const mode = forceFifo ? "fifo" : scanVisualizationMode();
  if (mode === "fifo") {
    startFifoPlayback(hardware);
    return;
  }
  stopFifoPlayback();
  demo.fifoPlayback = {
    active: false,
    row: hardware.row,
    col: null,
    words: hardware.spi?.words?.slice(0, 16) || [],
    mode,
  };
  await applyScannedRowCells(hardware, false);
  drawCircuit();
}

function scanVisualizationMode() {
  if (demo.refreshRate > 10) return "direct";
  if (demo.refreshRate > 1) return "row";
  return "fifo";
}

function isMuxScanVisible() {
  return scanVisualizationMode() !== "direct" || ["fifo", "cell", "manual"].includes(demo.fifoPlayback?.mode);
}

function applyScannedRow(hardware) {
  const rowIndex = hardware.row - 1;
  const words = hardware.spi?.words || [];
  if (rowIndex < 0 || rowIndex >= 16 || words.length !== 16) return;
  demo.receivedCodes[rowIndex] = words.slice(0, 16);
}

function applyScannedCell(hardware) {
  const rowIndex = hardware.row - 1;
  const colIndex = (hardware.scanCol || hardware.adcColumn?.col || 1) - 1;
  const word = hardware.adcColumn?.word ?? hardware.spi?.words?.[0];
  if (rowIndex < 0 || rowIndex >= 16 || colIndex < 0 || colIndex >= 16 || word === undefined) return;
  demo.receivedCodes[rowIndex][colIndex] = word;
}

function applyScannedFrame(hardware) {
  if (!hardware.frame?.rows?.length) return;
  for (const rowState of hardware.frame.rows) {
    const rowIndex = rowState.row - 1;
    if (rowIndex < 0 || rowIndex >= 16 || !Array.isArray(rowState.words)) continue;
    for (let colIndex = 0; colIndex < Math.min(16, rowState.words.length); colIndex += 1) {
      demo.receivedCodes[rowIndex][colIndex] = rowState.words[colIndex];
    }
  }
}

async function applyScannedRowCells(hardware, renderEachCell) {
  const rowIndex = hardware.row - 1;
  const words = hardware.spi?.words || [];
  if (rowIndex < 0 || rowIndex >= 16 || words.length !== 16) return;
  for (let colIndex = 0; colIndex < 16; colIndex += 1) {
    demo.receivedCodes[rowIndex][colIndex] = words[colIndex];
    if (renderEachCell) {
      drawCircuit();
      await sleep(cellUploadInterval());
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function stopFifoPlayback() {
  if (demo.fifoTimer) window.clearInterval(demo.fifoTimer);
  demo.fifoTimer = null;
  if (demo.fifoPlayback) demo.fifoPlayback.active = false;
}

function startFifoPlayback(hardware) {
  const rowIndex = hardware.row - 1;
  const words = hardware.spi?.words || [];
  if (rowIndex < 0 || rowIndex >= 16 || words.length !== 16) return;
  stopFifoPlayback();
  demo.fifoPlayback = {
    active: true,
    row: hardware.row,
    col: 1,
    words: words.slice(0, 16),
    mode: "fifo",
  };
  applyFifoWord();
  const interval = fifoPlaybackInterval();
  demo.fifoTimer = window.setInterval(() => {
    if (!demo.fifoPlayback?.active) return;
    demo.fifoPlayback.col += 1;
    if (demo.fifoPlayback.col > demo.fifoPlayback.words.length) {
      window.clearInterval(demo.fifoTimer);
      demo.fifoTimer = null;
      demo.fifoPlayback.active = false;
      drawCircuit();
      scheduleNextAutoRow();
      return;
    }
    applyFifoWord();
  }, interval);
}

function fifoPlaybackInterval() {
  return (1000 / Math.max(1, demo.refreshRate)) / 16;
}

function applyFifoWord() {
  if (!demo.fifoPlayback?.active) return;
  const rowIndex = demo.fifoPlayback.row - 1;
  const colIndex = demo.fifoPlayback.col - 1;
  demo.receivedCodes[rowIndex][colIndex] = demo.fifoPlayback.words[colIndex];
  drawCircuit();
}

function fifoCursorCol() {
  if (!demo.fifoPlayback?.active || !["fifo", "cell", "manual"].includes(demo.fifoPlayback.mode) || demo.fifoPlayback.row !== demo.row) return null;
  return demo.fifoPlayback.col;
}

function activeSpiLines() {
  const states = demo.hardware?.spi?.lineState || {};
  return new Set(Object.entries(states).filter(([, state]) => state.active).map(([name]) => name));
}

function clearReceivedHeatmap() {
  demo.receivedCodes = Array.from({ length: 16 }, () => Array(16).fill(null));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function circuitPoint(event) {
  const rect = svgEl.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * 1280,
    y: ((event.clientY - rect.top) / rect.height) * 880,
  };
}

function pointInArray(point) {
  return point.x >= layout.arrayX && point.x <= layout.arrayX + layout.arrayW && point.y >= layout.arrayY && point.y <= layout.arrayY + layout.arrayH;
}

function placeObjectFromPoint(point) {
  const col = clamp(Math.round((point.x - (layout.arrayX + 42)) / 40) + 1, 1, 16);
  const row = clamp(Math.round((point.y - (layout.arrayY + 28)) / 23) + 1, 1, 16);
  if (row === demo.objectRow && col === demo.col) return;
  demo.objectRow = row;
  demo.col = col;
  drawCircuit();
}

function beginObjectPlacement(event) {
  const point = circuitPoint(event);
  if (!pointInArray(point)) return;
  event.preventDefault();
  demo.placingObject = true;
  placeObjectFromPoint(point);
}

function updateObjectPlacement(event) {
  if (!demo.placingObject) return;
  placeObjectFromPoint(circuitPoint(event));
}

function endObjectPlacement() {
  demo.placingObject = false;
}

async function updateDemo() {
  if (demo.updateInFlight) {
    return;
  }
  demo.updateInFlight = true;
  try {
    await requestHardwareState();
    demo.scanTick += 1;
    if (demo.auto) advanceScanCursor();
  } catch (error) {
    // Keep the auto scanner recoverable if one backend request fails.
    console.error("FSR scan update failed", error);
  } finally {
    demo.updateInFlight = false;
  }
}

function syncFromControls() {
  demo.objectSize = Number(objectSizeRange.value);
  demo.objectMass = Number(objectMassRange.value);
  demo.refreshRate = Number(refreshRateRange.value);
  drawCircuit();
  restartAutoScanTimer();
  restartHardwareLiveTimer();
}

async function runManualMosi() {
  demo.auto = false;
  document.getElementById("autoScan").classList.remove("active");
  restartAutoScanTimer();
  demo.refreshRate = 5;
  refreshRateRange.value = "5";
  refreshRateValue.textContent = "5 Hz";
  runMosi.disabled = true;
  mosiStatus.textContent = "running MOSI bytes through virtual MAX11632...";
  try {
    demo.mosiResult = await requestManualMosi();
    mosiStatus.textContent = `done: ${demo.mosiResult.misoWords.length} MISO word(s)`;
    misoOutput.textContent = manualMosiLines(demo.mosiResult).join("\n");
    playManualMisoResult(demo.mosiResult);
  } catch (error) {
    demo.mosiResult = null;
    misoOutput.textContent = "MISO output unavailable.";
    mosiStatus.textContent = error.message;
    drawCircuit();
  } finally {
    runMosi.disabled = false;
  }
}

function playManualMisoResult(result) {
  if (!result.misoWords.length || !demo.hardware) {
    drawCircuit();
    return;
  }
  const words = demo.hardware.spi?.words?.slice(0, 16) || Array(16).fill(null);
  for (const word of result.misoWords) {
    const channel = Number(word.channel);
    if (Number.isInteger(channel) && channel >= 1 && channel <= 16) {
      words[channel - 1] = word.value;
    }
  }
  const hardware = {
    ...demo.hardware,
    row: result.row,
    spi: {
      ...demo.hardware.spi,
      words,
    },
  };
  demo.row = result.row;
  demo.hardware = hardware;
  startManualMisoPlayback(result, hardware, words);
}

function startManualMisoPlayback(result, hardware, baseWords) {
  stopFifoPlayback();
  const frames = result.misoWords
    .map((word, index) => ({
      index,
      channel: Number(word.channel),
      value: Number(word.value),
      binary: word.binary,
      hex: word.hex,
      ain: word.ain,
    }))
    .filter((word) => Number.isInteger(word.channel) && word.channel >= 1 && word.channel <= 16);
  if (!frames.length) {
    drawCircuit();
    return;
  }

  let frameIndex = 0;
  const words = baseWords.slice(0, 16);
  const applyFrame = () => {
    const frame = frames[frameIndex];
    words[frame.channel - 1] = frame.value;
    demo.receivedCodes[result.row - 1][frame.channel - 1] = frame.value;
    demo.fifoPlayback = {
      active: true,
      row: result.row,
      col: frame.channel,
      words,
      mode: "manual",
    };
    demo.hardware = {
      ...hardware,
      spi: {
        ...hardware.spi,
        words,
      },
    };
    mosiStatus.textContent = `animating MISO ${frameIndex + 1}/${frames.length}: ${frame.ain || `AIN${frame.channel - 1}`} ${frame.hex}`;
    drawCircuit();
    frameIndex += 1;
    if (frameIndex >= frames.length) {
      window.clearInterval(demo.fifoTimer);
      demo.fifoTimer = null;
      demo.fifoPlayback = {
        active: false,
        row: result.row,
        col: null,
        words,
        mode: "manual",
      };
      mosiStatus.textContent = `done: ${frames.length} MISO word(s) animated`;
      drawCircuit();
    }
  };

  applyFrame();
  if (frames.length > 1) {
    demo.fifoTimer = window.setInterval(applyFrame, manualPlaybackInterval());
  }
}

function manualPlaybackInterval() {
  return 120;
}

function applyManualMisoWords(result) {
  const rowIndex = result.row - 1;
  if (rowIndex < 0 || rowIndex >= 16) return;
  for (const word of result.misoWords) {
    const channel = Number(word.channel);
    if (Number.isInteger(channel) && channel >= 1 && channel <= 16) {
      demo.receivedCodes[rowIndex][channel - 1] = word.value;
    }
  }
}

function stepRow() {
  demo.row = demo.row === 16 ? 1 : demo.row + 1;
  updateDemo();
}

function advanceScanCursor() {
  const mode = scanVisualizationMode();
  if (mode === "direct") return;
  if (mode === "row") {
    demo.row = demo.row === 16 ? 1 : demo.row + 1;
    return;
  }
  if (demo.scanCol >= 16) {
    demo.scanCol = 1;
    demo.row = demo.row === 16 ? 1 : demo.row + 1;
  } else {
    demo.scanCol += 1;
  }
}

function stepCell() {
  advanceScanCursor();
  updateDemo();
}

function toggleAutoScan() {
  demo.auto = !demo.auto;
  document.getElementById("autoScan").classList.toggle("active", demo.auto);
  restartAutoScanTimer();
}

function toggleReadoutVisibility() {
  const hidden = fsrDemoGrid.classList.toggle("readout-hidden");
  toggleReadoutPanel.textContent = hidden ? "‹" : "›";
  toggleReadoutPanel.setAttribute("aria-label", hidden ? "Show readout panel" : "Hide readout panel");
  toggleReadoutPanel.setAttribute("aria-expanded", String(!hidden));
}

function restartAutoScanTimer() {
  if (demo.timer) window.clearInterval(demo.timer);
  demo.timer = null;
  if (!demo.auto) {
    return;
  }
  updateDemo();
  demo.timer = window.setInterval(updateDemo, autoScanDelay());
}

function scheduleNextAutoRow() {
  restartAutoScanTimer();
}

function autoScanDelay() {
  if (demo.refreshRate > 10) return 1000 / Math.max(1, demo.refreshRate);
  if (demo.refreshRate <= 1) return cellUploadInterval();
  return 1000 / (Math.max(1, demo.refreshRate) * 16);
}

function cellUploadInterval() {
  return 1000 / (Math.max(1, demo.refreshRate) * 256);
}

objectSizeRange.addEventListener("input", syncFromControls);
objectMassRange.addEventListener("input", syncFromControls);
refreshRateRange.addEventListener("input", syncFromControls);
svgEl.addEventListener("pointerdown", beginObjectPlacement);
window.addEventListener("pointermove", updateObjectPlacement);
window.addEventListener("pointerup", endObjectPlacement);
document.getElementById("autoScan").addEventListener("click", toggleAutoScan);
toggleReadoutPanel.addEventListener("click", toggleReadoutVisibility);
runMosi.addEventListener("click", runManualMosi);
toggleHardwareLive?.addEventListener("click", toggleHardwareLiveMode);
tareHardwareFsr?.addEventListener("click", tareHardwareFrame);
[hardwarePort, hardwareProtocol, hardwareLayer].forEach((control) => {
  if (!control) return;
  control.addEventListener("change", async () => {
    await closeHardwareLiveSession();
    demo.hardwareLive.frame = null;
    demo.hardwareLive.lastError = null;
    restartHardwareLiveTimer();
    renderFsrVisuals();
    updateHardwareLiveLabels();
  });
});

updateDemo();
