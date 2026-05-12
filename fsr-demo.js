const demo = {
  row: 1,
  col: 8,
  force: 62,
  auto: false,
  timer: null,
  hardware: null,
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

const layout = {
  dmuxX: 70,
  dmuxY: 150,
  dmuxW: 135,
  dmuxH: 390,
  mcuX: 70,
  mcuY: 635,
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

async function requestHardwareState() {
  const response = await fetch("/api/fsr-readout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      row: demo.row,
      col: demo.col,
      force: demo.force,
    }),
  });
  demo.hardware = await response.json();
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
  drawInfoFlow(root);
  drawLogicAnalyzer(root);

  fsrResistance.textContent = formatOhms(active.fsrOhms);
  adcVoltage.textContent = `${active.nodeVoltage.toFixed(2)} V`;
  adcCode.textContent = String(active.code);
  activeCell.textContent = `R${demo.row},C${demo.col}`;
  rowValue.textContent = `R${demo.row}`;
  colValue.textContent = `C${demo.col}`;
  forceValue.textContent = `${demo.force}%`;
  scanState.textContent = demo.auto ? "auto scan" : "manual";
  spiFrame.textContent = [
    `ROW_SELECT = ${demo.hardware.address.value.toString(2).padStart(4, "0")}  // A1-A4`,
    `ADC_CH[01..16] sampled simultaneously`,
    `ADC_CH[${demo.col.toString().padStart(2, "0")}] = ${active.code.toString().padStart(4, " ")}`,
    `SPI frame -> MCU: ${demo.hardware.spi.summary}`,
  ].join("\n");
}

function drawMcu(root) {
  root.appendChild(svg("rect", { x: layout.mcuX, y: layout.mcuY, width: layout.mcuW, height: layout.mcuH, rx: 8, class: "block mcu" }));
  addText(root, "MCU", layout.mcuX + layout.mcuW / 2, layout.mcuY + 48, { class: "block-title", "text-anchor": "middle" });
  addText(root, "Teensy 4.1 style", layout.mcuX + layout.mcuW / 2, layout.mcuY + 77, { class: "small-label", "text-anchor": "middle" });
  addText(root, "SPI com.", layout.mcuX + layout.mcuW + 18, layout.mcuY + 44, { class: "pin-label" });
  drawAddressBus(root);
}

function drawAddressBus(root) {
  const startX = layout.mcuX + 28;
  const endY = layout.dmuxY + layout.dmuxH + 18;
  addText(root, "A1-A4 row address", layout.mcuX + 8, layout.mcuY - 34, { class: "pin-label" });
  for (let bit = 0; bit < 4; bit += 1) {
    const x = startX + bit * 38;
    const y1 = layout.mcuY;
    const y2 = endY + bit * 9;
    const level = addressBit(demo.row, bit);
    line(root, x, y1, x, y2, level ? "logic-wire high" : "logic-wire low");
    line(root, x, y2, layout.dmuxX + 18 + bit * 28, y2, level ? "logic-wire high" : "logic-wire low");
    line(root, layout.dmuxX + 18 + bit * 28, y2, layout.dmuxX + 18 + bit * 28, layout.dmuxY + layout.dmuxH, level ? "logic-wire high" : "logic-wire low");
    addText(root, `A${bit + 1}`, x - 8, y1 - 10, { class: level ? "active-label" : "pin-label" });
  }
}

function drawDmux(root) {
  root.appendChild(svg("rect", { x: layout.dmuxX, y: layout.dmuxY, width: layout.dmuxW, height: layout.dmuxH, rx: 7, class: "block dmux" }));
  addText(root, "DMUX", layout.dmuxX + layout.dmuxW / 2, layout.dmuxY - 22, { class: "block-title", "text-anchor": "middle" });
  addText(root, "Select", layout.dmuxX - 18, layout.dmuxY + layout.dmuxH + 38, { class: "small-label" });
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
  addText(root, "Only selected row = Vcc", layout.dmuxX - 8, layout.dmuxY + layout.dmuxH + 66, { class: "small-label" });
  addText(root, "Other rows = GND", layout.dmuxX - 8, layout.dmuxY + layout.dmuxH + 86, { class: "small-label" });
}

function drawArray(root, columns) {
  root.appendChild(svg("rect", { x: layout.arrayX, y: layout.arrayY, width: layout.arrayW, height: layout.arrayH, class: "array-bg" }));
  addText(root, "FSR array: 16 rows x 16 columns", layout.arrayX + layout.arrayW / 2, layout.arrayY - 20, { class: "block-title", "text-anchor": "middle" });

  for (let row = 1; row <= 16; row += 1) {
    const y = rowY(row);
    line(root, layout.arrayX, y, layout.arrayX + layout.arrayW, y, row === demo.row ? "array-row active-wire" : "array-row");
  }
  for (let col = 1; col <= 16; col += 1) {
    const x = colX(col);
    line(root, x, layout.arrayY + 18, x, layout.arrayY + layout.arrayH, col === demo.col ? "array-column active-wire" : "array-column");
    addText(root, `C${col}`, x, layout.arrayY + layout.arrayH + 35, { class: col === demo.col ? "col-label active-label" : "col-label", "text-anchor": "middle" });
  }

  for (let row = 1; row <= 16; row += 1) {
    for (let col = 1; col <= 16; col += 1) {
      const x = colX(col);
      const y = rowY(row);
      const selectedCell = row === demo.row && col === demo.col;
      const column = columns[col - 1];
      const forceHalo = row === demo.row && column.force > 1;
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
  addText(root, `R${demo.row},${demo.col}`, x + 24, y - 18, { class: "active-label" });
  addText(root, "FSR", x + 24, y + 22, { class: "active-label" });

  for (let col = 1; col <= 16; col += 1) {
    const cx = colX(col);
    const nodeY = layout.adcY - 118;
    const resistorX = cx + 14;
    root.appendChild(svg("circle", { cx, cy: nodeY, r: 4, class: col === demo.col ? "sample-node active-node" : "sample-node" }));
    line(root, cx, layout.arrayY + layout.arrayH, cx, nodeY, col === demo.col ? "wire active-wire" : "wire sample-wire");
    line(root, cx, nodeY, cx, layout.adcY, col === demo.col ? "wire active-wire" : "wire sample-wire");
    line(root, cx, nodeY, resistorX, nodeY, col === demo.col ? "wire active-wire" : "wire");
    resistor(root, resistorX, nodeY, true, col === demo.col ? "component-line active-component" : "component-line");
    drawGround(root, resistorX, nodeY + 64);
  }
  addText(root, "ADC samples high-impedance column nodes; each node has a 10 kOhm load to GND", layout.arrayX + layout.arrayW / 2, layout.adcY - 12, { class: "small-label", "text-anchor": "middle" });
}

function drawAdc(root, columns) {
  root.appendChild(svg("rect", { x: layout.adcX, y: layout.adcY, width: layout.adcW, height: layout.adcH, rx: 8, class: "block adc" }));
  addText(root, "16-channel ADC", layout.adcX + layout.adcW / 2, layout.adcY + 58, { class: "block-title", "text-anchor": "middle" });
  for (const item of columns) {
    const x = colX(item.col);
    line(root, x, layout.adcY - 22, x, layout.adcY, item.col === demo.col ? "wire active-wire" : "wire sample-wire");
  }
  path(root, `M${layout.adcX} ${layout.adcY + 50} L${layout.mcuX + layout.mcuW + 30} ${layout.adcY + 50} L${layout.mcuX + layout.mcuW + 30} ${layout.mcuY + 46} L${layout.mcuX + layout.mcuW} ${layout.mcuY + 46}`, "wire active-wire");
  addText(root, "C1-C16 sampled in parallel", layout.adcX + layout.adcW - 18, layout.adcY - 18, { class: "active-label", "text-anchor": "end" });
}

function drawInfoFlow(root) {
  const row = rowY(demo.row);
  const col = colX(demo.col);
  path(root, `M${layout.dmuxX + layout.dmuxW} ${row} L${layout.arrayX} ${row} L${col} ${row} L${col} ${layout.adcY}`, "signal-flow");
  path(root, `M${layout.adcX} ${layout.adcY + 50} L${layout.mcuX + layout.mcuW + 30} ${layout.adcY + 50} L${layout.mcuX + layout.mcuW + 30} ${layout.mcuY + 46} L${layout.mcuX + layout.mcuW} ${layout.mcuY + 46}`, "signal-flow");
  addStep(root, "1", "MCU sets row address", 72, 820);
  addStep(root, "2", "DMUX drives selected row", 335, 820);
  addStep(root, "3", "Column divider voltages change", 620, 820);
  addStep(root, "4", "ADC samples and streams SPI", 945, 820);
}

function drawLogicAnalyzer(root) {
  const x0 = 120;
  const y0 = 865;
  const stepW = 82;
  const amp = 18;
  addText(root, "Auto scan row-address logic", x0, y0 - 30, { class: "block-title" });
  addText(root, demo.auto ? "running: row address increments on each scan step" : "manual: current row address is held", x0 + 305, y0 - 30, { class: "small-label" });
  for (let bit = 0; bit < demo.hardware.logic.length; bit += 1) {
    const trace = demo.hardware.logic[bit];
    const y = y0 + bit * 30;
    addText(root, trace.name, x0 - 36, y + 5, { class: "pin-label" });
    const points = [];
    for (let i = 0; i < trace.levels.length; i += 1) {
      const high = trace.levels[i].level;
      const x = x0 + i * stepW;
      const yy = y - (high ? amp : 0);
      if (i === 0) {
        points.push(`M${x} ${yy}`);
      } else {
        const prevHigh = trace.levels[i - 1].level;
        const prevY = y - (prevHigh ? amp : 0);
        points.push(`L${x} ${prevY}`);
        points.push(`L${x} ${yy}`);
      }
    }
    path(root, points.join(" "), bit === 0 ? "logic-wave high" : "logic-wave");
  }
}

function rowY(row) {
  return layout.arrayY + 28 + (row - 1) * 23;
}

function colX(col) {
  return layout.arrayX + 42 + (col - 1) * 40;
}

function addStep(root, num, text, x, y) {
  const g = svg("g", { class: "step-badge" });
  g.appendChild(svg("circle", { cx: x, cy: y - 5, r: 14 }));
  addText(g, num, x, y, { "text-anchor": "middle" });
  addText(g, text, x + 24, y, {});
  root.appendChild(g);
}

async function updateDemo() {
  await requestHardwareState();
  drawCircuit();
}

function syncFromControls() {
  demo.row = Number(rowSelect.value);
  demo.col = Number(colSelect.value);
  demo.force = Number(forceSelect.value);
  updateDemo();
}

function stepRow() {
  demo.row = demo.row === 16 ? 1 : demo.row + 1;
  rowSelect.value = demo.row;
  updateDemo();
}

function toggleAutoScan() {
  demo.auto = !demo.auto;
  document.getElementById("autoScan").classList.toggle("active", demo.auto);
  if (demo.auto) {
    demo.timer = window.setInterval(stepRow, 520);
  } else {
    window.clearInterval(demo.timer);
  }
  updateDemo();
}

rowSelect.addEventListener("input", syncFromControls);
colSelect.addEventListener("input", syncFromControls);
forceSelect.addEventListener("input", syncFromControls);
document.getElementById("singleStep").addEventListener("click", stepRow);
document.getElementById("autoScan").addEventListener("click", toggleAutoScan);

updateDemo();
