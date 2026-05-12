const demo = {
  row: 1,
  col: 8,
  force: 62,
  auto: false,
  timer: null,
};

const svgEl = document.getElementById("fsrCircuit");
const rowSelect = document.getElementById("rowSelect");
const colSelect = document.getElementById("colSelect");
const forceSelect = document.getElementById("forceSelect");
const rowValue = document.getElementById("rowValue");
const colValue = document.getElementById("colValue");
const forceValue = document.getElementById("forceValue");
const scanState = document.getElementById("scanState");
const activeCell = document.getElementById("activeCell");
const fsrResistance = document.getElementById("fsrResistance");
const adcVoltage = document.getElementById("adcVoltage");
const adcCode = document.getElementById("adcCode");
const spiFrame = document.getElementById("spiFrame");

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
  const step = 7;
  for (let i = 0; i <= 8; i += 1) {
    const offset = i % 2 === 0 ? -7 : 7;
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

function fsrOhms(force) {
  const minR = 3500;
  const maxR = 180000;
  const f = Math.max(0, Math.min(1, force / 100));
  return maxR * (1 - f) ** 2 + minR;
}

function voltageFromResistance(resistance) {
  const pullDown = 10000;
  const vcc = 3.3;
  return vcc * (pullDown / (resistance + pullDown));
}

function formatOhms(ohms) {
  if (ohms >= 1000) return `${(ohms / 1000).toFixed(1)} kOhm`;
  return `${Math.round(ohms)} Ohm`;
}

function calculateColumns() {
  const values = [];
  for (let col = 1; col <= 16; col += 1) {
    const force = col === demo.col ? demo.force : Math.max(0, demo.force * 0.08 * Math.exp(-Math.abs(col - demo.col) / 2.5));
    const resistance = fsrOhms(force);
    const voltage = voltageFromResistance(resistance);
    values.push({
      col,
      force,
      resistance,
      voltage,
      code: Math.round((voltage / 3.3) * 4095),
    });
  }
  return values;
}

function drawCircuit() {
  svgEl.innerHTML = "";
  const columns = calculateColumns();
  const active = columns[demo.col - 1];
  const root = svg("g");
  svgEl.appendChild(root);

  addText(root, "Complete FSR Readout Circuit", 610, 42, { class: "circuit-title", "text-anchor": "middle" });

  drawMcu(root);
  drawDmux(root);
  drawArray(root, columns);
  drawAdc(root, columns);
  drawInfoFlow(root);

  fsrResistance.textContent = formatOhms(active.resistance);
  adcVoltage.textContent = `${active.voltage.toFixed(2)} V`;
  adcCode.textContent = String(active.code);
  activeCell.textContent = `R${demo.row},C${demo.col}`;
  rowValue.textContent = `R${demo.row}`;
  colValue.textContent = `C${demo.col}`;
  forceValue.textContent = `${demo.force}%`;
  scanState.textContent = demo.auto ? "auto scan" : "manual";
  spiFrame.textContent = [
    `ROW_SELECT = ${demo.row.toString(2).padStart(4, "0")}  // DMUX address`,
    `ADC_CH[${demo.col.toString().padStart(2, "0")}] = ${active.code.toString().padStart(4, " ")}`,
    `SPI: <CS low> 0x${active.code.toString(16).padStart(3, "0").toUpperCase()} <CS high>`,
  ].join("\n");
}

function drawMcu(root) {
  root.appendChild(svg("rect", { x: 60, y: 500, width: 190, height: 115, rx: 8, class: "block mcu" }));
  addText(root, "MCU", 155, 548, { class: "block-title", "text-anchor": "middle" });
  addText(root, "Teensy 4.1 style", 155, 576, { class: "small-label", "text-anchor": "middle" });
  addText(root, "A0-A3", 200, 490, { class: "pin-label" });
  addText(root, "SPI", 252, 564, { class: "pin-label" });
}

function drawDmux(root) {
  root.appendChild(svg("rect", { x: 85, y: 100, width: 120, height: 330, rx: 6, class: "block dmux" }));
  addText(root, "DMUX", 145, 85, { class: "block-title", "text-anchor": "middle" });
  addText(root, "Select", 65, 472, { class: "small-label" });
  path(root, "M205 490 L205 450 L145 450 L145 430", "wire active-wire");
  path(root, "M205 490 L205 430", "wire");
  for (let row = 1; row <= 16; row += 1) {
    const y = rowY(row);
    addText(root, `R${row}`, 110, y + 4, { class: row === demo.row ? "row-label active-label" : "row-label" });
    line(root, 205, y, 315, y, row === demo.row ? "wire active-wire" : "wire");
  }
  addText(root, "Vcc", 118, 128, { class: "pin-label" });
  addText(root, "GND", 116, 405, { class: "pin-label" });
}

function drawArray(root, columns) {
  root.appendChild(svg("rect", { x: 315, y: 86, width: 620, height: 385, class: "array-bg" }));
  addText(root, "FSR array: 16 rows x 16 columns", 625, 74, { class: "block-title", "text-anchor": "middle" });

  for (let row = 1; row <= 16; row += 1) {
    const y = rowY(row);
    line(root, 315, y, 935, y, row === demo.row ? "array-row active-wire" : "array-row");
  }
  for (let col = 1; col <= 16; col += 1) {
    const x = colX(col);
    line(root, x, 105, x, 535, col === demo.col ? "array-column active-wire" : "array-column");
    addText(root, `C${col}`, x, 563, { class: col === demo.col ? "col-label active-label" : "col-label", "text-anchor": "middle" });
  }

  for (let row = 1; row <= 16; row += 1) {
    for (let col = 1; col <= 16; col += 1) {
      const x = colX(col);
      const y = rowY(row);
      const selectedCell = row === demo.row && col === demo.col;
      const forceHalo = row === demo.row && Math.abs(col - demo.col) <= 1;
      root.appendChild(svg("rect", {
        x: x - 10,
        y: y - 8,
        width: 20,
        height: 16,
        rx: 3,
        class: selectedCell ? "fsr-cell selected" : forceHalo ? "fsr-cell neighbor" : "fsr-cell",
      }));
    }
  }

  const x = colX(demo.col);
  const y = rowY(demo.row);
  resistor(root, x - 32, y - 10, false, "component-line active-component");
  addText(root, `R${demo.row},${demo.col}`, x + 18, y - 18, { class: "active-label" });
  addText(root, "FSR", x + 18, y + 22, { class: "active-label" });

  for (let col = 1; col <= 16; col += 1) {
    const cx = colX(col);
    line(root, cx, 535, cx, 574, col === demo.col ? "wire active-wire" : "wire");
    resistor(root, cx, 574, true, col === demo.col ? "component-line active-component" : "component-line");
    drawGround(root, cx, 638);
  }
  addText(root, "16 x 10 kOhm pull-down resistors", 680, 685, { class: "small-label", "text-anchor": "middle" });
}

function drawAdc(root, columns) {
  root.appendChild(svg("rect", { x: 340, y: 585, width: 595, height: 95, rx: 7, class: "block adc" }));
  addText(root, "16-channel ADC", 638, 638, { class: "block-title", "text-anchor": "middle" });
  for (const item of columns) {
    const x = colX(item.col);
    line(root, x, 535, x, 585, item.col === demo.col ? "wire active-wire" : "wire");
  }
  path(root, "M340 632 L280 632 L280 563 L250 563", "wire active-wire");
  addText(root, "SPI com.", 275, 552, { class: "pin-label" });
}

function drawInfoFlow(root) {
  const row = rowY(demo.row);
  const col = colX(demo.col);
  path(root, `M205 ${row} L315 ${row} L${col} ${row} L${col} 585`, "signal-flow");
  path(root, "M340 632 L280 632 L280 563 L250 563", "signal-flow");
  addText(root, "1. MCU selects row", 58, 655, { class: "step-label" });
  addText(root, "2. DMUX drives one row", 300, 42, { class: "step-label" });
  addText(root, "3. Column voltage changes", 610, 502, { class: "step-label", "text-anchor": "middle" });
  addText(root, "4. ADC samples C1-C16", 965, 635, { class: "step-label" });
}

function rowY(row) {
  return 112 + (row - 1) * 22;
}

function colX(col) {
  return 350 + (col - 1) * 35;
}

function syncFromControls() {
  demo.row = Number(rowSelect.value);
  demo.col = Number(colSelect.value);
  demo.force = Number(forceSelect.value);
  drawCircuit();
}

function stepRow() {
  demo.row = demo.row === 16 ? 1 : demo.row + 1;
  rowSelect.value = demo.row;
  drawCircuit();
}

function toggleAutoScan() {
  demo.auto = !demo.auto;
  document.getElementById("autoScan").classList.toggle("active", demo.auto);
  if (demo.auto) {
    demo.timer = window.setInterval(stepRow, 520);
  } else {
    window.clearInterval(demo.timer);
  }
  drawCircuit();
}

rowSelect.addEventListener("input", syncFromControls);
colSelect.addEventListener("input", syncFromControls);
forceSelect.addEventListener("input", syncFromControls);
document.getElementById("singleStep").addEventListener("click", stepRow);
document.getElementById("autoScan").addEventListener("click", toggleAutoScan);

drawCircuit();
