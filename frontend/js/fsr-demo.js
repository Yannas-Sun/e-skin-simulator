const demo = {
  row: 1,
  objectRow: 8,
  col: 8,
  objectSize: 72,
  objectMass: 620,
  refreshRate: 10,
  auto: false,
  timer: null,
  fifoTimer: null,
  fifoPlayback: null,
  hardware: null,
  mosiResult: null,
  placingObject: false,
  receivedCodes: Array.from({ length: 16 }, () => Array(16).fill(null)),
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

async function requestHardwareState() {
  const response = await fetch("/api/fsr-readout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      row: demo.row,
      objectRow: demo.objectRow,
      col: demo.col,
      objectSize: demo.objectSize,
      objectMass: demo.objectMass,
      refreshRate: demo.refreshRate,
    }),
  });
  demo.hardware = await response.json();
  startFifoPlayback(demo.hardware);
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
  const columns = demo.hardware.columns;
  const active = columns[demo.col - 1];
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
  scanState.textContent = demo.auto ? "auto scan" : "manual";
  svgEl.classList.toggle("no-animation", demo.refreshRate > 10);
  renderAdcInputTable();
  const rates = demo.hardware.mcu.lineRates;
  const uplink = demo.hardware.moduleUplink;
  const uplinkRates = uplink.lineRates;
  const spiLines = [
    `Internal ADC SPI, ADC -> STM32G474`,
    `REFRESH = ${demo.hardware.mcu.framesPerSecond.toFixed(0)} full 16x16 frame/s`,
    `COUNTED = ${demo.hardware.mcu.rowsCounted} row scans/frame`,
    ``,
    `Line          per frame        per second`,
    `Address       ${rates.Address.perFrame.toFixed(0).padStart(5)} bit       ${formatRate(rates.Address.perSecond, rates.Address.unit)}`,
    `SCK           ${rates.SCK.perFrame.toFixed(0).padStart(5)} pulse     ${formatRate(rates.SCK.perSecond, rates.SCK.unit)}`,
    `MOSI          ${rates.MOSI.perFrame.toFixed(0).padStart(5)} bit       ${formatRate(rates.MOSI.perSecond, rates.MOSI.unit)}`,
    `MISO          ${rates.MISO.perFrame.toFixed(0).padStart(5)} bit       ${formatRate(rates.MISO.perSecond, rates.MISO.unit)}`,
    `CS            ${rates.CS.perFrame.toFixed(0).padStart(5)} assert    ${formatRate(rates.CS.perSecond, rates.CS.unit)}`,
    `CS edges      ${rates.CS.edgesPerFrame.toFixed(0).padStart(5)} edge      ${rates.CS.edgesPerSecond.toFixed(0)} edge/s`,
    ``,
    `MAX11632 setup: ${demo.hardware.adc.setupCommand.hex} ${demo.hardware.adc.setupCommand.binary}`,
    `MAX11632 averaging: ${demo.hardware.adc.averagingCommand.hex} ${demo.hardware.adc.averagingCommand.binary}`,
    `MAX11632 reset byte ref: ${demo.hardware.adc.resetCommand.hex} ${demo.hardware.adc.resetCommand.binary}`,
    `MAX11632 conversion: ${demo.hardware.spi.command.hex} ${demo.hardware.spi.command.binary}`,
    `FIFO output: 16 x 16-bit words, each 0000 + 12-bit ADC code`,
    ``,
    `Module uplink SPI, STM32G474 -> ${uplink.upperLayer}`,
    `MODE = ${uplink.mode}`,
    `COMMAND = ${uplink.command.label}, ${uplink.command.bits} bit/frame`,
    `RESULT = ${uplink.samplesPerFrame} samples x ${uplink.sampleBits} bit + ${uplink.metadataBytes} B metadata`,
    `Required SCK = ${formatRate(uplink.clock.requiredSckHz, "pulse")}`,
    ``,
    `Line          per frame        per second`,
    `SCK           ${uplinkRates.SCK.perFrame.toFixed(0).padStart(5)} pulse     ${formatRate(uplinkRates.SCK.perSecond, uplinkRates.SCK.unit)}`,
    `MOSI          ${uplinkRates.MOSI.perFrame.toFixed(0).padStart(5)} bit       ${formatRate(uplinkRates.MOSI.perSecond, uplinkRates.MOSI.unit)}`,
    `MISO          ${uplinkRates.MISO.perFrame.toFixed(0).padStart(5)} bit       ${formatRate(uplinkRates.MISO.perSecond, uplinkRates.MISO.unit)}`,
    `CS            ${uplinkRates.CS.perFrame.toFixed(0).padStart(5)} assert    ${formatRate(uplinkRates.CS.perSecond, uplinkRates.CS.unit)}`,
  ];
  if (demo.mosiResult) {
    spiLines.push("", ...manualMosiLines(demo.mosiResult));
  }
  spiFrame.textContent = spiLines.join("\n");
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
      lines.push(`   MISO:`);
      for (const word of tx.misoWords) {
        lines.push(`   ${word.hex} ${word.binary} bytes=[${word.bytes.join(", ")}]`);
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
  root.appendChild(svg("rect", { x: layout.dmuxX, y: layout.dmuxY, width: layout.dmuxW, height: layout.dmuxH, rx: 7, class: "block dmux" }));
  addText(root, "DMUX", layout.dmuxX + layout.dmuxW / 2, layout.dmuxY - 22, { class: "block-title", "text-anchor": "middle" });
  for (const rowState of demo.hardware.dmuxRows) {
    const row = rowState.row;
    const y = rowY(row);
    const active = rowState.selected;
    const diodeX = layout.dmuxX + layout.dmuxW + 28;
    addText(root, `R${row}`, layout.dmuxX + 28, y + 5, { class: row === demo.row ? "row-label active-label" : "row-label" });
    addText(root, rowState.state, layout.dmuxX + 78, y + 5, { class: active ? "active-label dmux-state" : "pin-label dmux-state" });
    line(root, layout.dmuxX + layout.dmuxW, y, diodeX - 11, y, active ? "wire active-wire" : "wire ground-wire");
    drawDiode(root, diodeX, y, active ? "diode active-diode" : "diode");
    line(root, diodeX + 10, y, layout.arrayX, y, active ? "wire active-wire" : "wire ground-wire");
  }
}

function drawArray(root, columns) {
  const fifoCol = fifoCursorCol();
  root.appendChild(svg("rect", { x: layout.arrayX, y: layout.arrayY, width: layout.arrayW, height: layout.arrayH, class: "array-bg" }));
  root.appendChild(svg("rect", { x: layout.arrayX, y: layout.arrayY, width: layout.arrayW, height: layout.arrayH, class: "array-hit-target" }));
  addText(root, "FSR array: 16 rows x 16 columns", layout.arrayX + layout.arrayW / 2, layout.arrayY - 20, { class: "block-title", "text-anchor": "middle" });

  for (let row = 1; row <= 16; row += 1) {
    const y = rowY(row);
    line(root, layout.arrayX, y, layout.arrayX + layout.arrayW, y, row === demo.row ? "array-row active-wire" : "array-row");
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
      const fifoActive = row === demo.row && col === fifoCol;
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
    const resistorX = cx + 14;
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
        class: row === demo.row && col === fifoCol ? "heatmap-cell active-scan" : "heatmap-cell",
        fill: `hsl(${hue}, 78%, ${lightness}%)`,
      }));
    }
  }
  addText(root, `scan row R${demo.row}, threshold ${heatmapDetectionCode()}`, x0, y0 + layout.heatmapSize + 22, { class: "clock-head" });
}

function refreshRateExplanation() {
  const displayedFrameRate = demo.refreshRate / 16;
  const actualFrameRate = demo.refreshRate;
  return `Visual row stepping is illustrative: displayed full-frame rate ${displayedFrameRate.toFixed(2)} Hz vs actual hardware setting ${actualFrameRate} Hz, ratio 1:16. Right-side transfer rates use the actual hardware setting.`;
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

function startFifoPlayback(hardware) {
  const rowIndex = hardware.row - 1;
  const words = hardware.spi?.words || [];
  if (rowIndex < 0 || rowIndex >= 16 || words.length !== 16) return;
  if (demo.fifoTimer) window.clearInterval(demo.fifoTimer);
  demo.fifoTimer = null;
  demo.fifoPlayback = {
    active: true,
    row: hardware.row,
    col: 1,
    words: words.slice(0, 16),
  };
  applyFifoWord();
  const interval = Math.max(18, Math.min(120, (1000 / Math.max(1, demo.refreshRate)) / 16));
  demo.fifoTimer = window.setInterval(() => {
    if (!demo.fifoPlayback?.active) return;
    demo.fifoPlayback.col += 1;
    if (demo.fifoPlayback.col > demo.fifoPlayback.words.length) {
      window.clearInterval(demo.fifoTimer);
      demo.fifoTimer = null;
      demo.fifoPlayback.active = false;
      drawCircuit();
      return;
    }
    applyFifoWord();
  }, interval);
}

function applyFifoWord() {
  if (!demo.fifoPlayback?.active) return;
  const rowIndex = demo.fifoPlayback.row - 1;
  const colIndex = demo.fifoPlayback.col - 1;
  demo.receivedCodes[rowIndex][colIndex] = demo.fifoPlayback.words[colIndex];
  drawCircuit();
}

function fifoCursorCol() {
  if (!demo.fifoPlayback?.active || demo.fifoPlayback.row !== demo.row) return null;
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
  demo.objectRow = row;
  demo.col = col;
  updateDemo();
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
  await requestHardwareState();
  drawCircuit();
}

function syncFromControls() {
  demo.objectSize = Number(objectSizeRange.value);
  demo.objectMass = Number(objectMassRange.value);
  demo.refreshRate = Number(refreshRateRange.value);
  restartAutoScanTimer();
  updateDemo();
}

async function runManualMosi() {
  runMosi.disabled = true;
  mosiStatus.textContent = "running MOSI bytes through virtual MAX11632...";
  try {
    demo.mosiResult = await requestManualMosi();
    mosiStatus.textContent = `done: ${demo.mosiResult.misoWords.length} MISO word(s)`;
    drawCircuit();
  } catch (error) {
    demo.mosiResult = null;
    mosiStatus.textContent = error.message;
    drawCircuit();
  } finally {
    runMosi.disabled = false;
  }
}

function stepRow() {
  demo.row = demo.row === 16 ? 1 : demo.row + 1;
  updateDemo();
}

function toggleAutoScan() {
  demo.auto = !demo.auto;
  document.getElementById("autoScan").classList.toggle("active", demo.auto);
  restartAutoScanTimer();
  updateDemo();
}

function restartAutoScanTimer() {
  if (demo.timer) window.clearInterval(demo.timer);
  demo.timer = null;
  if (!demo.auto) return;
  demo.timer = window.setInterval(stepRow, Math.max(1, 1000 / demo.refreshRate));
}

objectSizeRange.addEventListener("input", syncFromControls);
objectMassRange.addEventListener("input", syncFromControls);
refreshRateRange.addEventListener("input", syncFromControls);
svgEl.addEventListener("pointerdown", beginObjectPlacement);
window.addEventListener("pointermove", updateObjectPlacement);
window.addEventListener("pointerup", endObjectPlacement);
document.getElementById("autoScan").addEventListener("click", toggleAutoScan);
runMosi.addEventListener("click", runManualMosi);

updateDemo();
