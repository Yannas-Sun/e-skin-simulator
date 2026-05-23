const demo = {
  sensor: 1,
  objectRow: 2.5,
  objectCol: 2.5,
  objectSize: 96,
  vibrationG: 2.4,
  refreshRate: 25,
  auto: false,
  timer: null,
  scanRun: 0,
  hardware: null,
  received: Array(16).fill(null),
};

const svgEl = document.getElementById("accelCircuit");
const objectSizeRange = document.getElementById("objectSizeRange");
const vibrationRange = document.getElementById("vibrationRange");
const refreshRateRange = document.getElementById("refreshRateRange");
const objectSizeValue = document.getElementById("objectSizeValue");
const vibrationValue = document.getElementById("vibrationValue");
const refreshRateValue = document.getElementById("refreshRateValue");
const refreshRateNote = document.getElementById("refreshRateNote");
const autoScan = document.getElementById("autoScan");
const scanState = document.getElementById("scanState");
const activeSensor = document.getElementById("activeSensor");
const xReading = document.getElementById("xReading");
const yReading = document.getElementById("yReading");
const zReading = document.getElementById("zReading");
const magnitudeReading = document.getElementById("magnitudeReading");
const spiFrame = document.getElementById("spiFrame");
const registerTable = document.getElementById("registerTable");
const manualSpi = document.getElementById("manualSpi");
const runSpi = document.getElementById("runSpi");
const spiStatus = document.getElementById("spiStatus");
const manualOutput = document.getElementById("manualOutput");

const layout = {
  muxX: 72,
  muxY: 585,
  muxW: 540,
  muxH: 95,
  mcuX: 70,
  mcuY: 720,
  mcuW: 230,
  mcuH: 86,
  arrayX: 360,
  arrayY: 105,
  arrayW: 540,
  arrayH: 420,
  heatmapX: 982,
  heatmapY: 130,
  heatmapSize: 190,
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

function rect(parent, attrs) {
  parent.appendChild(svg("rect", attrs));
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

function cellPosition(sensor) {
  const col = (sensor - 1) % 4;
  const row = Math.floor((sensor - 1) / 4);
  const cellW = layout.arrayW / 4;
  const cellH = layout.arrayH / 4;
  return {
    x: layout.arrayX + col * cellW,
    y: layout.arrayY + row * cellH,
    cx: layout.arrayX + col * cellW + cellW / 2,
    cy: layout.arrayY + row * cellH + cellH / 2,
    w: cellW,
    h: cellH,
    row: row + 1,
    col: col + 1,
  };
}

function colorFor(value) {
  const t = Math.max(0, Math.min(1, value / 4.5));
  const stops = [
    [232, 244, 241],
    [92, 184, 195],
    [242, 196, 71],
    [215, 87, 69],
  ];
  const scaled = t * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const a = stops[index];
  const b = stops[index + 1];
  const rgb = a.map((channel, i) => Math.round(channel + (b[i] - channel) * local));
  return `rgb(${rgb.join(",")})`;
}

async function fetchHardware(sensor = demo.sensor) {
  const response = await fetch("/api/accel-readout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sensor,
      objectRow: demo.objectRow,
      objectCol: demo.objectCol,
      objectSize: demo.objectSize,
      vibrationG: demo.vibrationG,
      refreshRate: demo.refreshRate,
    }),
  });
  return response.json();
}

async function requestManualSpi() {
  const response = await fetch("/api/lis3dh-spi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sensor: demo.sensor,
      objectRow: demo.objectRow,
      objectCol: demo.objectCol,
      objectSize: demo.objectSize,
      vibrationG: demo.vibrationG,
      mosi: manualSpi.value,
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "SPI program failed");
  return result;
}

function applyFrameData(state) {
  const sensor = state.selectedSensor;
  const sample = state.selectedTransfer.sample;
  demo.received[sensor - 1] = {
    sensor,
    row: Math.floor((sensor - 1) / 4) + 1,
    col: ((sensor - 1) % 4) + 1,
    value: sample.magnitudeG,
    raw: sample.raw,
    bytes: state.selectedTransfer.miso.slice(1),
    address: state.mux.address,
    addressBits: state.mux.addressBits,
  };
}

async function update(sensor = demo.sensor) {
  demo.hardware = await fetchHardware(sensor);
  applyFrameData(demo.hardware);
  drawCircuit();
}

function drawCircuit() {
  if (!demo.hardware) return;
  svgEl.innerHTML = "";
  const root = svg("g");
  svgEl.appendChild(root);
  addText(root, "Complete LIS3DH Accelerometer Readout Circuit", 640, 48, { class: "circuit-title", "text-anchor": "middle" });
  drawMcu(root);
  drawMux(root);
  drawArray(root);
  drawObject(root);
  drawHeatmap(root);
  drawSpi(root);
  drawScanStatus(root);
  updateReadouts();
  renderRegisterTable();
}

function drawMcu(root) {
  rect(root, { x: layout.mcuX, y: layout.mcuY, width: layout.mcuW, height: layout.mcuH, rx: 8, class: "block mcu" });
  addText(root, "STM32G474", layout.mcuX + layout.mcuW / 2, layout.mcuY + 34, { class: "block-title", "text-anchor": "middle" });
  addText(root, "module MCU", layout.mcuX + layout.mcuW / 2, layout.mcuY + 58, { class: "small-label", "text-anchor": "middle" });
  const labels = ["A1", "A2", "A3", "A4"];
  labels.forEach((label, index) => {
    const x = layout.mcuX + 40 + index * 42;
    const bit = demo.hardware.mux.addressBits[index]?.level ?? 0;
    line(root, x, layout.mcuY, x, layout.muxY + layout.muxH, bit ? "wire active-wire" : "wire");
    addText(root, label, x, layout.mcuY - 8, { class: bit ? "pin-label active-label" : "pin-label", "text-anchor": "middle" });
  });
}

function drawMux(root) {
  rect(root, { x: layout.muxX, y: layout.muxY, width: layout.muxW, height: layout.muxH, rx: 4, class: "block dmux" });
  addText(root, "CS MUX / Decoder", layout.muxX + layout.muxW / 2, layout.muxY + 54, { class: "block-title", "text-anchor": "middle" });
  addText(root, "only one nCS low", layout.muxX + layout.muxW / 2, layout.muxY + 76, { class: "small-label", "text-anchor": "middle" });
}

function drawArray(root) {
  rect(root, { x: layout.arrayX, y: layout.arrayY, width: layout.arrayW, height: layout.arrayH, class: "array-bg accel-array-bg" });
  addText(root, "Accelerometer array: 4 rows x 4 LIS3DH", layout.arrayX + layout.arrayW / 2, layout.arrayY - 22, { class: "block-title", "text-anchor": "middle" });
  for (let sensor = 1; sensor <= 16; sensor += 1) {
    const pos = cellPosition(sensor);
    const item = demo.received[sensor - 1];
    const value = item?.value ?? 0;
    const selected = sensor === demo.hardware.selectedSensor;
    const fill = colorFor(value);
    const margin = 16;
    rect(root, {
      x: pos.x + margin,
      y: pos.y + margin,
      width: pos.w - margin * 2,
      height: pos.h - margin * 2,
      rx: 6,
      class: selected ? "accel-cell accel-cell-active accel-cell-scanning" : "accel-cell",
      fill,
    });
    addText(root, `A${sensor}`, pos.cx, pos.cy - 8, { class: "block-title", "text-anchor": "middle" });
    addText(root, item ? `${value.toFixed(2)}g` : "no data", pos.cx, pos.cy + 18, { class: "small-label", "text-anchor": "middle" });
    line(root, pos.cx, pos.y + pos.h, pos.cx, layout.muxY, selected ? "wire active-wire" : "wire sample-wire");
    if (selected) {
      root.appendChild(svg("circle", {
        cx: pos.cx,
        cy: layout.muxY - 10,
        r: 6,
        class: "scan-token",
      }));
    }
  }
}

function drawObject(root) {
  const cellW = layout.arrayW / 4;
  const cellH = layout.arrayH / 4;
  const cx = layout.arrayX + (demo.objectCol - 0.5) * cellW;
  const cy = layout.arrayY + (demo.objectRow - 0.5) * cellH;
  const radius = Math.max(28, demo.objectSize * 0.8);
  root.appendChild(svg("circle", {
    cx,
    cy,
    r: radius,
    class: "vibration-object",
  }));
  addText(root, `${demo.vibrationG.toFixed(1)}g`, cx, cy + 5, { class: "object-label", "text-anchor": "middle" });
}

function drawHeatmap(root) {
  const x0 = layout.heatmapX;
  const y0 = layout.heatmapY;
  rect(root, { x: x0 - 14, y: y0 - 42, width: layout.heatmapSize + 28, height: layout.heatmapSize + 76, rx: 7, class: "heatmap-panel" });
  addText(root, "Hardware heatmap", x0, y0 - 18, { class: "clock-title" });
  const cell = layout.heatmapSize / 4;
  for (let sensor = 1; sensor <= 16; sensor += 1) {
    const row = Math.floor((sensor - 1) / 4);
    const col = (sensor - 1) % 4;
    const item = demo.received[sensor - 1];
    rect(root, {
      x: x0 + col * cell,
      y: y0 + row * cell,
      width: cell,
      height: cell,
      class: sensor === demo.hardware.selectedSensor ? "heatmap-cell active-scan" : "heatmap-cell",
      fill: colorFor(item?.value ?? 0),
    });
    addText(root, `A${sensor}`, x0 + col * cell + cell / 2, y0 + row * cell + cell / 2 + 4, { class: "clock-row", "text-anchor": "middle" });
  }
  const selected = demo.hardware.selectedSensor;
  const selectedItem = demo.received[selected - 1];
  addText(root, `last write: A${selected} addr ${demo.hardware.mux.address.toString(2).padStart(4, "0")}`, x0, y0 + layout.heatmapSize + 22, { class: "clock-row" });
  addText(root, selectedItem ? "heatmap cell updated after MISO decode" : "waiting for first MISO decode", x0, y0 + layout.heatmapSize + 36, { class: "clock-row" });
}

function drawSpi(root) {
  const y0 = layout.arrayY + layout.arrayH + 45;
  const labels = [
    ["SCK", "spi-sck"],
    ["MOSI", "spi-mosi"],
    ["MISO", "spi-miso"],
    ["CS", "spi-cs"],
  ];
  labels.forEach(([label, cls], index) => {
    const y = y0 + index * 22;
    const active = demo.auto || demo.hardware.selectedSensor === demo.sensor;
    line(root, layout.mcuX + layout.mcuW, y, layout.arrayX, y, active ? `spi-wire spi-active ${cls}` : `spi-wire ${cls}`);
    addText(root, label, layout.mcuX + layout.mcuW + 12, y + 5, { class: active ? "pin-label active-label" : "pin-label" });
  });
  addText(root, "Shared SPI bus", layout.arrayX - 4, y0 - 13, { class: "small-label", "text-anchor": "end" });
}

function drawScanStatus(root) {
  const x = layout.muxX;
  const y = layout.muxY - 52;
  const address = demo.hardware.mux.address;
  const bits = demo.hardware.mux.addressBits.map((bit) => bit.level).join("");
  addText(root, `Address ${bits} selects nCS_${demo.hardware.selectedSensor}`, x, y, {
    class: "scan-status",
  });
  addText(root, "heatmap commits one cell after that LIS3DH returns XL/XH/YL/YH/ZL/ZH on MISO", x + 238, y, {
    class: "clock-row",
  });
  root.appendChild(svg("circle", {
    cx: x - 16 + ((address % 16) / 15) * 120,
    cy: y - 4,
    r: 5,
    class: "scan-token",
  }));
}

function updateReadouts() {
  const sample = demo.hardware.selectedTransfer.sample;
  activeSensor.textContent = `A${demo.hardware.selectedSensor}`;
  xReading.textContent = `${sample.g.x.toFixed(2)} g`;
  yReading.textContent = `${sample.g.y.toFixed(2)} g`;
  zReading.textContent = `${(sample.g.z - 1).toFixed(2)} g`;
  magnitudeReading.textContent = `${sample.magnitudeG.toFixed(2)} g`;
  objectSizeValue.textContent = `${demo.objectSize} mm`;
  vibrationValue.textContent = `${demo.vibrationG.toFixed(1)} g`;
  refreshRateValue.textContent = `${demo.refreshRate} Hz`;
  refreshRateNote.textContent = `${demo.refreshRate} full 4x4 frame/s; each frame performs 16 CS-selected LIS3DH reads.`;
  scanState.textContent = demo.auto ? "auto scan" : "manual";

  const rates = demo.hardware.mcu.lineRates;
  const uplink = demo.hardware.moduleUplink;
  const lines = [
    `Internal accelerometer SPI, LIS3DH -> STM32G474`,
    `REFRESH = ${demo.hardware.mcu.framesPerSecond.toFixed(0)} full 4x4 frame/s`,
    `COUNTED = ${demo.hardware.mcu.sensorsCounted} sensor reads/frame`,
    ``,
    `Line          per frame        per second`,
    `Address       ${rates.Address.perFrame.toFixed(0).padStart(5)} bit       ${formatRate(rates.Address.perSecond, rates.Address.unit)}`,
    `SCK           ${rates.SCK.perFrame.toFixed(0).padStart(5)} pulse     ${formatRate(rates.SCK.perSecond, rates.SCK.unit)}`,
    `MOSI          ${rates.MOSI.perFrame.toFixed(0).padStart(5)} bit       ${formatRate(rates.MOSI.perSecond, rates.MOSI.unit)}`,
    `MISO          ${rates.MISO.perFrame.toFixed(0).padStart(5)} bit       ${formatRate(rates.MISO.perSecond, rates.MISO.unit)}`,
    `CS            ${rates.CS.perFrame.toFixed(0).padStart(5)} assert    ${formatRate(rates.CS.perSecond, rates.CS.unit)}`,
    ``,
    `LIS3DH command: ${demo.hardware.lis3dh.readCommand.command.hex} ${demo.hardware.lis3dh.readCommand.command.binary}`,
    `Meaning: READ=1, MS=1, register=0x28`,
    `MISO: dummy + XL XH YL YH ZL ZH`,
    ``,
    `Module uplink SPI, STM32G474 -> ${uplink.upperLayer}`,
    `RESULT = ${uplink.samplesPerFrame} sensors x ${uplink.sampleBits} bit + ${uplink.metadataBytes} B metadata`,
    `Required SCK = ${formatRate(uplink.clock.requiredSckHz, "pulse")}`,
  ];
  spiFrame.textContent = lines.join("\n");
}

function renderRegisterTable() {
  if (!registerTable || !demo.hardware?.lis3dh?.registerTable) return;
  registerTable.innerHTML = "";
  for (const row of demo.hardware.lis3dh.registerTable) {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.textContent = row.address ? `${row.name} ${row.address}` : row.name;
    tr.appendChild(th);
    for (const bit of row.bits) {
      const td = document.createElement("td");
      td.textContent = bit;
      tr.appendChild(td);
    }
    while (tr.children.length < 9) {
      const td = document.createElement("td");
      td.textContent = "";
      tr.appendChild(td);
    }
    registerTable.appendChild(tr);
  }
}

function manualLines(result) {
  const sample = result.sample;
  return [
    `Manual LIS3DH SPI`,
    `SENSOR = A${result.selectedSensor}`,
    `OPERATION = ${result.operation}`,
    `MOSI = ${result.mosi.map((byte) => byte.hex).join(" ")}`,
    `MISO = ${result.miso.map((byte) => byte.hex).join(" ")}`,
    ``,
    result.decodedCommand
      ? `CMD ${result.decodedCommand.binary}: read=${Number(result.decodedCommand.read)}, ms=${Number(result.decodedCommand.autoIncrement)}, addr=${result.decodedCommand.addressHex}`
      : `No command decoded`,
    ``,
    `X ${sample.raw.x.toString().padStart(6)} = ${sample.g.x.toFixed(3)} g`,
    `Y ${sample.raw.y.toString().padStart(6)} = ${sample.g.y.toFixed(3)} g`,
    `Z ${sample.raw.z.toString().padStart(6)} = ${sample.g.z.toFixed(3)} g`,
    `Dynamic magnitude = ${sample.magnitudeG.toFixed(3)} g`,
  ].join("\n");
}

function startAutoScan() {
  demo.auto = true;
  demo.scanRun += 1;
  const runId = demo.scanRun;
  autoScan.textContent = "Stop Scan";
  const period = Math.max(70, 1000 / (demo.refreshRate * 16));
  const scanNext = async () => {
    if (!demo.auto || runId !== demo.scanRun) return;
    demo.sensor = (demo.sensor % 16) + 1;
    const state = await fetchHardware(demo.sensor);
    if (!demo.auto || runId !== demo.scanRun) return;
    demo.hardware = state;
    applyFrameData(state);
    drawCircuit();
    if (demo.auto && runId === demo.scanRun) {
      demo.timer = setTimeout(scanNext, period);
    }
  };
  scanNext();
}

function stopAutoScan() {
  demo.auto = false;
  demo.scanRun += 1;
  autoScan.textContent = "Auto Scan";
  clearTimeout(demo.timer);
  demo.timer = null;
  drawCircuit();
}

objectSizeRange.addEventListener("input", async (event) => {
  demo.objectSize = Number(event.target.value);
  await update();
});

vibrationRange.addEventListener("input", async (event) => {
  demo.vibrationG = Number(event.target.value) / 10;
  await update();
});

refreshRateRange.addEventListener("input", async (event) => {
  demo.refreshRate = Number(event.target.value);
  if (demo.auto) {
    stopAutoScan();
    startAutoScan();
  }
  await update();
});

autoScan.addEventListener("click", () => {
  if (demo.auto) stopAutoScan();
  else startAutoScan();
});

runSpi.addEventListener("click", async () => {
  try {
    spiStatus.textContent = "running SPI bytes through virtual LIS3DH...";
    const result = await requestManualSpi();
    manualOutput.textContent = manualLines(result);
    spiStatus.textContent = `done: ${result.miso.length} MISO byte(s)`;
  } catch (error) {
    spiStatus.textContent = error.message;
  }
});

svgEl.addEventListener("pointerdown", async (event) => {
  const rectBox = svgEl.getBoundingClientRect();
  const x = ((event.clientX - rectBox.left) / rectBox.width) * 1280;
  const y = ((event.clientY - rectBox.top) / rectBox.height) * 880;
  if (x >= layout.arrayX && x <= layout.arrayX + layout.arrayW && y >= layout.arrayY && y <= layout.arrayY + layout.arrayH) {
    const cellW = layout.arrayW / 4;
    const cellH = layout.arrayH / 4;
    demo.objectCol = Math.max(1, Math.min(4, (x - layout.arrayX) / cellW + 0.5));
    demo.objectRow = Math.max(1, Math.min(4, (y - layout.arrayY) / cellH + 0.5));
    const col = Math.max(1, Math.min(4, Math.floor((x - layout.arrayX) / cellW) + 1));
    const row = Math.max(1, Math.min(4, Math.floor((y - layout.arrayY) / cellH) + 1));
    demo.sensor = (row - 1) * 4 + col;
    await update(demo.sensor);
  }
});

update();
