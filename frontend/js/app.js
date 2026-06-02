const state = {
  modules: [],
  objects: [],
  selectedShape: "circle",
  selectedObjectId: null,
  nextModuleId: 1,
  nextObjectId: 1,
  nextPatchId: 1,
  patches: [],
  activePatchId: null,
  drag: null,
  selection: null,
  selectedModules: new Set(),
  selectedObjects: new Set(),
  clipboard: null,
  zoom: 1,
  panX: 0,
  panY: 0,
  samplingHz: 700,
  lastPressure: new Map(),
};

const HEX_RADIUS = 62;

const workspace = document.getElementById("workspace");
const scene = document.getElementById("scene");
const gridCanvas = document.getElementById("gridCanvas");
const heatmap = document.getElementById("heatmap");
const hctx = heatmap.getContext("2d");
const moduleCount = document.getElementById("moduleCount");
const objectCount = document.getElementById("objectCount");
const activeTaxels = document.getElementById("activeTaxels");
const peakPressure = document.getElementById("peakPressure");
const throughput = document.getElementById("throughput");
const throughputBits = document.getElementById("throughputBits");
const linkUse = document.getElementById("linkUse");
const linkState = document.getElementById("linkState");
const linkNote = document.getElementById("linkNote");
const contactState = document.getElementById("contactState");
const sizeRange = document.getElementById("sizeRange");
const massRange = document.getElementById("massRange");
const sampleRange = document.getElementById("sampleRange");
const sizeValue = document.getElementById("sizeValue");
const massValue = document.getElementById("massValue");
const sampleValue = document.getElementById("sampleValue");
const selectedShape = document.getElementById("selectedShape");

function workspacePoint(event) {
  const rect = workspace.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left - state.panX) / state.zoom,
    y: (event.clientY - rect.top - state.panY) / state.zoom,
  };
}

function visibleWorldBounds() {
  const rect = workspace.getBoundingClientRect();
  const minX = -state.panX / state.zoom;
  const minY = -state.panY / state.zoom;
  return {
    minX,
    minY,
    maxX: minX + rect.width / state.zoom,
    maxY: minY + rect.height / state.zoom,
    width: rect.width / state.zoom,
    height: rect.height / state.zoom,
  };
}

function snapPoint(point) {
  const coord = pixelToAxial(point.x, point.y);
  return axialToPixel(coord.q, coord.r);
}

function honeycombOrigin() {
  return { x: 96, y: 92 };
}

function axialToPixel(q, r) {
  const origin = honeycombOrigin();
  return {
    x: origin.x + HEX_RADIUS * 1.5 * q,
    y: origin.y + HEX_RADIUS * Math.sqrt(3) * (r + q / 2),
  };
}

function pixelToAxial(x, y) {
  const origin = honeycombOrigin();
  const px = x - origin.x;
  const py = y - origin.y;
  const q = ((2 / 3) * px) / HEX_RADIUS;
  const r = ((-1 / 3) * px + (Math.sqrt(3) / 3) * py) / HEX_RADIUS;
  return roundAxial(q, r);
}

function roundAxial(q, r) {
  let x = q;
  let z = r;
  let y = -x - z;
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);

  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  return { q: rx, r: rz };
}

function honeycombCells() {
  const world = visibleWorldBounds();
  const cells = [];
  const span = Math.max(world.width, world.height);
  const range = Math.ceil(span / HEX_RADIUS) + 12;
  const center = pixelToAxial((world.minX + world.maxX) / 2, (world.minY + world.maxY) / 2);
  const qMin = center.q - range;
  const qMax = center.q + range;
  const rMin = center.r - range;
  const rMax = center.r + range;
  for (let q = qMin; q <= qMax; q += 1) {
    for (let r = rMin; r <= rMax; r += 1) {
      const center = axialToPixel(q, r);
      if (
        center.x > world.minX - HEX_RADIUS * 2 &&
        center.x < world.maxX + HEX_RADIUS * 2 &&
        center.y > world.minY - HEX_RADIUS * 2 &&
        center.y < world.maxY + HEX_RADIUS * 2
      ) {
        cells.push({ q, r, ...center });
      }
    }
  }
  return cells;
}

function nearestValidHoneycombPoint(point) {
  const cells = honeycombCells();
  let best = cells[0] || snapPoint(point);
  let bestDistance = Infinity;
  for (const cell of cells) {
    const distance = (cell.x - point.x) ** 2 + (cell.y - point.y) ** 2;
    if (distance < bestDistance) {
      best = cell;
      bestDistance = distance;
    }
  }
  return { x: best.x, y: best.y };
}

function cellKeyForPoint(point) {
  const coord = pixelToAxial(point.x, point.y);
  return `${coord.q},${coord.r}`;
}

function occupiedModuleCells(excludedIds = new Set()) {
  const cells = new Set();
  for (const module of state.modules) {
    if (excludedIds.has(module.id)) continue;
    cells.add(cellKeyForPoint(module));
  }
  return cells;
}

function canPlaceModulePositions(positions, excludedIds = new Set()) {
  const occupied = occupiedModuleCells(excludedIds);
  const pending = new Set();
  for (const position of positions) {
    const key = cellKeyForPoint(position);
    if (occupied.has(key) || pending.has(key)) return false;
    pending.add(key);
  }
  return true;
}

function nearestAvailableHoneycombPoint(point, excludedIds = new Set()) {
  const cells = honeycombCells();
  const occupied = occupiedModuleCells(excludedIds);
  let best = null;
  let bestDistance = Infinity;
  for (const cell of cells) {
    const key = `${cell.q},${cell.r}`;
    if (occupied.has(key)) continue;
    const distance = (cell.x - point.x) ** 2 + (cell.y - point.y) ** 2;
    if (distance < bestDistance) {
      best = cell;
      bestDistance = distance;
    }
  }
  if (best) return { x: best.x, y: best.y };
  return nearestValidHoneycombPoint(point);
}

function firstAvailablePasteOffset(sources, preferredDx, preferredDy) {
  if (!sources.length) return { dx: preferredDx, dy: preferredDy };
  const attempts = honeycombCells()
    .map((cell) => ({
      dx: cell.x - sources[0].x,
      dy: cell.y - sources[0].y,
      distance: (cell.x - sources[0].x - preferredDx) ** 2 + (cell.y - sources[0].y - preferredDy) ** 2,
    }))
    .sort((a, b) => a.distance - b.distance);

  for (const attempt of attempts) {
    const positions = sources.map((source) => ({ x: source.x + attempt.dx, y: source.y + attempt.dy }));
    if (canPlaceModulePositions(positions)) return { dx: attempt.dx, dy: attempt.dy };
  }
  return null;
}

function allocateModuleId() {
  const used = new Set(state.modules.map((module) => module.id));
  let id = 1;
  while (used.has(id)) id += 1;
  state.nextModuleId = Math.max(state.nextModuleId, id + 1);
  return id;
}

function allocatePatchId() {
  const used = new Set(state.patches.map((patch) => patch.id));
  let id = 1;
  while (used.has(id)) id += 1;
  state.nextPatchId = Math.max(state.nextPatchId, id + 1);
  return id;
}

function getPatchModules(patchId) {
  return state.modules.filter((module) => module.patchId === patchId);
}

function getMetricModules() {
  return state.activePatchId ? getPatchModules(state.activePatchId) : state.modules;
}

function prunePatches() {
  const existingModuleIds = new Set(state.modules.map((module) => module.id));
  state.patches = state.patches
    .map((patch) => ({
      ...patch,
      moduleIds: patch.moduleIds.filter((id) => existingModuleIds.has(id) && state.modules.some((module) => module.id === id && module.patchId === patch.id)),
    }))
    .filter((patch) => patch.moduleIds.length > 0);
  if (state.activePatchId && !state.patches.some((patch) => patch.id === state.activePatchId)) {
    state.activePatchId = null;
  }
}

function hexPoints(cx, cy, r) {
  return [0, 60, 120, 180, 240, 300]
    .map((angle) => {
      const rad = (Math.PI / 180) * angle;
      return `${cx + Math.cos(rad) * r},${cy + Math.sin(rad) * r}`;
    })
    .join(" ");
}

function setAttrs(el, attrs) {
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  return el;
}

function svg(tag, attrs = {}) {
  return setAttrs(document.createElementNS("http://www.w3.org/2000/svg", tag), attrs);
}

function drawTemplateDetails() {
  const taxelPreview = document.querySelector(".taxel-preview");
  const accelPreview = document.querySelector(".accel-preview");
  for (let row = 0; row < 6; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      const rect = svg("rect", {
        x: -35 + col * 14,
        y: -35 + row * 14,
        width: 6,
        height: 6,
        rx: 1,
        fill: "rgba(47,123,99,.22)",
      });
      taxelPreview.appendChild(rect);
    }
  }
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      accelPreview.appendChild(
        svg("circle", {
          cx: -28 + col * 19,
          cy: -28 + row * 19,
          r: 2.5,
          fill: "#1e8aa5",
        }),
      );
    }
  }
}

function renderGrid() {
  const rect = workspace.getBoundingClientRect();
  const world = visibleWorldBounds();
  const dpr = window.devicePixelRatio || 1;
  gridCanvas.width = rect.width * dpr;
  gridCanvas.height = rect.height * dpr;
  gridCanvas.style.width = `${rect.width}px`;
  gridCanvas.style.height = `${rect.height}px`;
  const ctx = gridCanvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.setTransform(dpr * state.zoom, 0, 0, dpr * state.zoom, dpr * state.panX, dpr * state.panY);
  ctx.strokeStyle = "rgba(47, 123, 99, 0.13)";
  ctx.lineWidth = 1 / state.zoom;

  ctx.fillStyle = "#fbfcfa";
  ctx.fillRect(world.minX, world.minY, world.width, world.height);

  for (const cell of honeycombCells()) {
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const a = (Math.PI / 180) * (60 * i);
      const px = cell.x + Math.cos(a) * HEX_RADIUS;
      const py = cell.y + Math.sin(a) * HEX_RADIUS;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  }
}

function renderScene() {
  scene.innerHTML = "";
  const world = visibleWorldBounds();
  scene.setAttribute("viewBox", `${world.minX} ${world.minY} ${world.width} ${world.height}`);
  document.querySelector(".workspace-hint").style.display = state.modules.length ? "none" : "block";

  for (const patch of state.patches) {
    scene.appendChild(renderPatchUnderlay(patch));
  }
  for (const module of state.modules) {
    scene.appendChild(renderModule(module));
  }
  for (const object of state.objects) {
    scene.appendChild(renderObject(object));
  }
  for (const patch of state.patches) {
    scene.appendChild(renderPatchBadge(patch));
  }
  if (state.selection) {
    scene.appendChild(renderSelectionBox());
  }
}

function patchBounds(patch) {
  const modules = getPatchModules(patch.id);
  if (!modules.length) return null;
  return modules.reduce(
    (box, module) => ({
      minX: Math.min(box.minX, module.x - module.radius - 12),
      minY: Math.min(box.minY, module.y - module.radius - 12),
      maxX: Math.max(box.maxX, module.x + module.radius + 12),
      maxY: Math.max(box.maxY, module.y + module.radius + 24),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

function renderPatchUnderlay(patch) {
  const bounds = patchBounds(patch);
  if (!bounds) return svg("g");
  const active = state.activePatchId === patch.id;
  const rect = svg("rect", {
    class: `patch-underlay ${active ? "active" : ""}`,
    x: bounds.minX,
    y: bounds.minY,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
    rx: 14,
  });
  rect.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    focusPatch(patch.id);
  });
  return rect;
}

function renderPatchBadge(patch) {
  const modules = getPatchModules(patch.id);
  if (!modules.length) return svg("g");
  const cx = modules.reduce((sum, module) => sum + module.x, 0) / modules.length;
  const cy = Math.min(...modules.map((module) => module.y - module.radius)) - 22;
  const g = svg("g", { class: `patch-badge ${state.activePatchId === patch.id ? "active" : ""}`, transform: `translate(${cx} ${cy})` });
  g.appendChild(svg("rect", { x: -24, y: -13, width: 48, height: 26, rx: 8 }));
  const label = svg("text", { x: 0, y: 4, "text-anchor": "middle" });
  label.textContent = `P${patch.id}`;
  g.appendChild(label);
  g.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    focusPatch(patch.id);
  });
  return g;
}

function renderModule(module) {
  const selected = state.selectedModules.has(module.id);
  const g = svg("g", { class: `sim-module ${selected ? "selected" : ""}`, "data-id": module.id, transform: `translate(${module.x} ${module.y})` });
  const r = module.radius;
  g.appendChild(svg("polygon", { class: "shell", points: hexPoints(0, 0, r) }));
  g.appendChild(svg("polygon", { class: "layer", points: hexPoints(0, 0, r * 0.77) }));
  g.appendChild(svg("polygon", { class: "layer", points: hexPoints(0, 0, r * 0.54) }));

  const values = state.lastPressure.get(module.id) || [];
  for (let row = 0; row < 16; row += 1) {
    for (let col = 0; col < 16; col += 1) {
      const index = row * 16 + col;
      const value = values[index] || 0;
      const x = -r * 0.72 + col * ((r * 1.44) / 15);
      const y = -r * 0.58 + row * ((r * 1.16) / 15);
      if (Math.abs(x) + Math.abs(y) * 0.58 > r * 0.98) continue;
      g.appendChild(
        svg("rect", {
          class: value > 0.22 ? "taxel hot" : "taxel",
          x: x - 2.2,
          y: y - 2.2,
          width: 4.4,
          height: 4.4,
          rx: 1,
          opacity: value > 0 ? 0.28 + value * 0.72 : 1,
        }),
      );
    }
  }

  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      g.appendChild(svg("circle", { class: "accel", cx: -27 + col * 18, cy: -27 + row * 18, r: 2.6 }));
    }
  }

  const label = svg("text", { x: 0, y: r + 16, "text-anchor": "middle" });
  label.textContent = `M${module.id}`;
  g.appendChild(label);
  g.addEventListener("pointerdown", (event) => beginDrag(event, "module", module.id));
  return g;
}

function renderObject(object) {
  const g = svg("g", {
    class: `sim-object ${state.selectedObjects.has(object.id) ? "selected" : ""}`,
    "data-id": object.id,
    transform: `translate(${object.x} ${object.y})`,
  });
  const half = object.size / 2;
  if (object.shape === "circle") {
    g.appendChild(svg("circle", { class: "body", cx: 0, cy: 0, r: half }));
  } else if (object.shape === "triangle") {
    g.appendChild(svg("polygon", { class: "body", points: `0,${-half} ${half},${half} ${-half},${half}` }));
  } else {
    g.appendChild(svg("rect", { class: "body", x: -half, y: -half, width: object.size, height: object.size, rx: 6 }));
  }
  const label = svg("text", { x: 0, y: 4 });
  label.textContent = `${object.mass}g`;
  g.appendChild(label);
  g.addEventListener("pointerdown", (event) => beginDrag(event, "object", object.id));
  g.addEventListener("click", () => selectObject(object.id));
  return g;
}

function renderSelectionBox() {
  const box = normalizedSelectionBox();
  return svg("rect", {
    class: "selection-box",
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
  });
}

function normalizedSelectionBox() {
  const start = state.selection.start;
  const current = state.selection.current;
  return {
    x: Math.min(start.x, current.x),
    y: Math.min(start.y, current.y),
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y),
  };
}

function beginDrag(event, kind, id) {
  event.preventDefault();
  event.stopPropagation();
  if (state.activePatchId && (kind !== "module" || !getPatchModules(state.activePatchId).some((module) => module.id === id))) {
    state.activePatchId = null;
    simulate();
  }
  const point = workspacePoint(event);
  const item = kind === "module" ? state.modules.find((module) => module.id === id) : state.objects.find((object) => object.id === id);
  const isAlreadySelected = kind === "module" ? state.selectedModules.has(id) : state.selectedObjects.has(id);
  if (!isAlreadySelected) {
    clearSelection();
    if (kind === "module") state.selectedModules.add(id);
    if (kind === "object") state.selectedObjects.add(id);
  }
  state.drag = {
    kind: "selection",
    id,
    anchorKind: kind,
    start: point,
    anchorStart: { x: item.x, y: item.y },
    moduleStarts: new Map(state.modules.filter((module) => state.selectedModules.has(module.id)).map((module) => [module.id, { x: module.x, y: module.y }])),
    objectStarts: new Map(state.objects.filter((object) => state.selectedObjects.has(object.id)).map((object) => [object.id, { x: object.x, y: object.y }])),
  };
  if (kind === "object") selectObject(id);
  renderScene();
  scene.setPointerCapture(event.pointerId);
}

function updateDrag(event) {
  if (!state.drag) return;
  const point = workspacePoint(event);
  if (state.drag.kind === "selection") {
    let dx = point.x - state.drag.start.x;
    let dy = point.y - state.drag.start.y;
    if (state.selectedModules.size) {
      const snappedAnchor = nearestValidHoneycombPoint({
        x: state.drag.anchorStart.x + dx,
        y: state.drag.anchorStart.y + dy,
      });
      dx = snappedAnchor.x - state.drag.anchorStart.x;
      dy = snappedAnchor.y - state.drag.anchorStart.y;
      const selectedIds = new Set(state.drag.moduleStarts.keys());
      const proposed = [...state.drag.moduleStarts.values()].map((start) => ({ x: start.x + dx, y: start.y + dy }));
      if (!canPlaceModulePositions(proposed, selectedIds)) {
        dx = 0;
        dy = 0;
      }
    }

    for (const module of state.modules) {
      const start = state.drag.moduleStarts.get(module.id);
      if (!start) continue;
      module.x = start.x + dx;
      module.y = start.y + dy;
    }
    for (const object of state.objects) {
      const start = state.drag.objectStarts.get(object.id);
      if (!start) continue;
      const world = visibleWorldBounds();
      object.x = Math.max(world.minX + 42, Math.min(world.maxX - 42, start.x + dx));
      object.y = Math.max(world.minY + 42, Math.min(world.maxY - 42, start.y + dy));
    }
  } else {
    state.selection.current = point;
    updateSelectionFromBox();
  }
  renderScene();
  scheduleSimulation();
}

function endDrag(event) {
  if (!state.drag) return;
  try {
    scene.releasePointerCapture(event.pointerId);
  } catch {
    // Pointer may already be released by the browser.
  }
  state.drag = null;
  state.selection = null;
  simulate();
}

function beginBoxSelection(event) {
  if (event.button !== 0 || event.target !== scene) return;
  const point = workspacePoint(event);
  state.activePatchId = null;
  clearSelection();
  state.selection = { start: point, current: point };
  state.drag = { kind: "box" };
  scene.setPointerCapture(event.pointerId);
  renderScene();
}

function clearSelection() {
  state.selectedModules.clear();
  state.selectedObjects.clear();
  state.selectedObjectId = null;
}

function rectsIntersect(a, b) {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}

function moduleBounds(module) {
  return {
    x: module.x - module.radius,
    y: module.y - module.radius * Math.sqrt(3) / 2,
    width: module.radius * 2,
    height: module.radius * Math.sqrt(3),
  };
}

function objectBounds(object) {
  const half = object.size / 2;
  return {
    x: object.x - half,
    y: object.y - half,
    width: object.size,
    height: object.size,
  };
}

function updateSelectionFromBox() {
  const box = normalizedSelectionBox();
  state.selectedModules.clear();
  state.selectedObjects.clear();
  for (const module of state.modules) {
    if (rectsIntersect(box, moduleBounds(module))) {
      state.selectedModules.add(module.id);
    }
  }
  for (const object of state.objects) {
    if (rectsIntersect(box, objectBounds(object))) {
      state.selectedObjects.add(object.id);
    }
  }
  const firstObject = state.objects.find((object) => state.selectedObjects.has(object.id));
  state.selectedObjectId = firstObject ? firstObject.id : null;
}

function makePatchFromSelection() {
  const selected = state.modules.filter((module) => state.selectedModules.has(module.id));
  if (!selected.length) return;
  const patchId = allocatePatchId();
  const selectedIds = selected.map((module) => module.id);

  for (const module of selected) {
    module.patchId = patchId;
  }
  for (const patch of state.patches) {
    patch.moduleIds = patch.moduleIds.filter((id) => !selectedIds.includes(id));
  }
  state.patches.push({ id: patchId, moduleIds: selectedIds });
  prunePatches();
  focusPatch(patchId);
}

function focusPatch(patchId) {
  const modules = getPatchModules(patchId);
  if (!modules.length) return;
  state.activePatchId = patchId;
  fitViewToModules(modules);
  renderGrid();
  renderScene();
  simulate();
}

function fitViewToModules(modules) {
  const rect = workspace.getBoundingClientRect();
  const bounds = modules.reduce(
    (box, module) => ({
      minX: Math.min(box.minX, module.x - module.radius - 36),
      minY: Math.min(box.minY, module.y - module.radius - 48),
      maxX: Math.max(box.maxX, module.x + module.radius + 36),
      maxY: Math.max(box.maxY, module.y + module.radius + 48),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);
  state.zoom = Math.max(0.45, Math.min(2.8, Math.min(rect.width / spanX, rect.height / spanY)));
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  state.panX = rect.width / 2 - centerX * state.zoom;
  state.panY = rect.height / 2 - centerY * state.zoom;
}

function deleteSelection() {
  if (!state.selectedModules.size && !state.selectedObjects.size) return;
  state.modules = state.modules.filter((module) => !state.selectedModules.has(module.id));
  state.objects = state.objects.filter((object) => !state.selectedObjects.has(object.id));
  prunePatches();
  clearSelection();
  renderScene();
  simulate();
}

function copySelection() {
  const modules = state.modules.filter((module) => state.selectedModules.has(module.id));
  const objects = state.objects.filter((object) => state.selectedObjects.has(object.id));
  if (!modules.length && !objects.length) return;
  const allItems = [
    ...modules.map((module) => ({ x: module.x, y: module.y })),
    ...objects.map((object) => ({ x: object.x, y: object.y })),
  ];
  const minX = Math.min(...allItems.map((item) => item.x));
  const minY = Math.min(...allItems.map((item) => item.y));
  state.clipboard = {
    modules: modules.map((module) => ({ x: module.x - minX, y: module.y - minY, radius: module.radius })),
    objects: objects.map((object) => ({
      x: object.x - minX,
      y: object.y - minY,
      shape: object.shape,
      size: object.size,
      mass: object.mass,
    })),
  };
}

function pasteSelection() {
  if (!state.clipboard) return;
  clearSelection();
  const pasteAnchor = nearestValidHoneycombPoint({ x: 118 + state.nextModuleId * 10, y: 110 + state.nextObjectId * 8 });
  const firstModule = state.clipboard.modules[0];
  let dx = firstModule ? pasteAnchor.x - firstModule.x : pasteAnchor.x;
  let dy = firstModule ? pasteAnchor.y - firstModule.y : pasteAnchor.y;
  if (firstModule) {
    const snappedFirst = nearestValidHoneycombPoint({ x: firstModule.x + dx, y: firstModule.y + dy });
    dx = snappedFirst.x - firstModule.x;
    dy = snappedFirst.y - firstModule.y;
    const available = firstAvailablePasteOffset(state.clipboard.modules, dx, dy);
    if (!available) return;
    dx = available.dx;
    dy = available.dy;
  }

  for (const source of state.clipboard.modules) {
    const id = allocateModuleId();
    const module = {
      id,
      x: source.x + dx,
      y: source.y + dy,
      radius: source.radius,
    };
    state.modules.push(module);
    state.selectedModules.add(module.id);
  }

  for (const source of state.clipboard.objects) {
    const world = visibleWorldBounds();
    const object = {
      id: state.nextObjectId,
      x: Math.max(world.minX + 42, Math.min(world.maxX - 42, source.x + dx)),
      y: Math.max(world.minY + 42, Math.min(world.maxY - 42, source.y + dy)),
      shape: source.shape,
      size: source.size,
      mass: source.mass,
    };
    state.objects.push(object);
    state.selectedObjects.add(object.id);
    state.selectedObjectId = object.id;
    state.nextObjectId += 1;
  }
  renderScene();
  simulate();
}

function createModule(point) {
  const next = nearestAvailableHoneycombPoint(point);
  state.modules.push({
    id: allocateModuleId(),
    x: next.x,
    y: next.y,
    radius: HEX_RADIUS,
  });
  state.activePatchId = null;
  renderScene();
  simulate();
}

function createObject(point, shape = state.selectedShape) {
  const object = {
    id: state.nextObjectId,
    shape,
    x: point.x,
    y: point.y,
    size: Number(sizeRange.value),
    mass: Number(massRange.value),
  };
  state.objects.push(object);
  state.nextObjectId += 1;
  state.activePatchId = null;
  selectObject(object.id);
  renderScene();
  simulate();
}

function selectObject(id) {
  const object = state.objects.find((item) => item.id === id);
  if (!object) return;
  state.activePatchId = null;
  if (!state.selectedObjects.has(id)) {
    clearSelection();
    state.selectedObjects.add(id);
  }
  state.selectedObjectId = id;
  sizeRange.value = object.size;
  massRange.value = object.mass;
  state.selectedShape = object.shape;
  updateControlLabels();
  document.querySelectorAll(".object-template").forEach((button) => {
    button.classList.toggle("active", button.dataset.shape === object.shape);
  });
  renderScene();
}

function updateSelectedObject() {
  const selectedObjects = state.objects.filter((item) => state.selectedObjects.has(item.id));
  for (const object of selectedObjects) {
    object.size = Number(sizeRange.value);
    object.mass = Number(massRange.value);
    object.shape = state.selectedShape;
  }
  state.samplingHz = Number(sampleRange.value);
  updateControlLabels();
  renderScene();
  scheduleSimulation();
}

function updateControlLabels() {
  sizeValue.textContent = `${sizeRange.value} mm`;
  massValue.textContent = `${massRange.value} g`;
  sampleValue.textContent = `${sampleRange.value} Hz`;
  selectedShape.textContent = state.selectedShape;
}

function handleWorkspaceWheel(event) {
  event.preventDefault();
  const rect = workspace.getBoundingClientRect();
  const screenX = event.clientX - rect.left;
  const screenY = event.clientY - rect.top;
  const worldX = (screenX - state.panX) / state.zoom;
  const worldY = (screenY - state.panY) / state.zoom;
  const factor = event.deltaY < 0 ? 1.1 : 0.9;
  const nextZoom = Math.max(0.45, Math.min(2.8, state.zoom * factor));
  state.zoom = nextZoom;
  state.panX = screenX - worldX * nextZoom;
  state.panY = screenY - worldY * nextZoom;
  renderGrid();
  renderScene();
}

let simulationTimer = null;
function scheduleSimulation() {
  window.clearTimeout(simulationTimer);
  simulationTimer = window.setTimeout(simulate, 80);
}

async function simulate() {
  const metricModules = getMetricModules();
  const payload = {
    modules: metricModules,
    objects: state.objects,
    samplingHz: state.samplingHz,
  };
  try {
    const response = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    state.lastPressure = new Map(result.pressure.cells.map((cell) => [cell.id, cell.values]));
    renderScene();
    renderHeatmap(result.pressure.cells, metricModules);
    updateMetrics(result);
  } catch (error) {
    linkNote.textContent = "Python backend is not reachable. Start it with: python server.py";
  }
}

function heatColor(value) {
  const threshold = 0.14;
  const v = Math.max(0, Math.min(1, (value - threshold) / (1 - threshold)));
  if (v < 0.33) {
    const t = v / 0.33;
    return lerpColor([221, 233, 228], [86, 183, 199], t);
  }
  if (v < 0.72) {
    const t = (v - 0.33) / 0.39;
    return lerpColor([86, 183, 199], [242, 196, 71], t);
  }
  const t = (v - 0.72) / 0.28;
  return lerpColor([242, 196, 71], [215, 87, 69], t);
}

function lerpColor(a, b, t) {
  return `rgb(${a.map((channel, index) => Math.round(channel + (b[index] - channel) * t)).join(",")})`;
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function pointInHexLocal(x, y, r) {
  return Math.abs(x) <= r && Math.abs(y) <= Math.sqrt(3) * r / 2 && Math.sqrt(3) * Math.abs(x) + Math.abs(y) <= Math.sqrt(3) * r;
}

function renderHeatmap(cells, sourceModules = getMetricModules()) {
  const w = heatmap.width;
  const h = heatmap.height;
  hctx.clearRect(0, 0, w, h);
  hctx.fillStyle = "#eef2ef";
  hctx.fillRect(0, 0, w, h);

  if (!cells.length) {
    hctx.fillStyle = "#8a9691";
    hctx.font = "15px system-ui";
    hctx.textAlign = "center";
    hctx.fillText(state.activePatchId ? "selected patch has no modules" : "assemble modules to see pressure", w / 2, h / 2);
    return;
  }

  const pressureById = new Map(cells.map((cell) => [cell.id, cell.values]));
  const modules = sourceModules.filter((module) => pressureById.has(module.id));
  if (!modules.length) return;

  const bounds = modules.reduce(
    (box, module) => ({
      minX: Math.min(box.minX, module.x - module.radius),
      minY: Math.min(box.minY, module.y - module.radius),
      maxX: Math.max(box.maxX, module.x + module.radius),
      maxY: Math.max(box.maxY, module.y + module.radius),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  const padding = 26;
  const scale = Math.min((w - padding * 2) / Math.max(1, bounds.maxX - bounds.minX), (h - padding * 2) / Math.max(1, bounds.maxY - bounds.minY));
  const offsetX = (w - (bounds.maxX - bounds.minX) * scale) / 2 - bounds.minX * scale;
  const offsetY = (h - (bounds.maxY - bounds.minY) * scale) / 2 - bounds.minY * scale;

  modules.forEach((module) => {
    const cx = module.x * scale + offsetX;
    const cy = module.y * scale + offsetY;
    const r = module.radius * scale;
    const values = pressureById.get(module.id) || [];
    const taxelSize = Math.max(2, (module.radius * 1.44 * scale) / 16);

    hctx.save();
    hctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const a = (Math.PI / 180) * (60 * i);
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i === 0) hctx.moveTo(px, py);
      else hctx.lineTo(px, py);
    }
    hctx.closePath();
    hctx.clip();

    values.forEach((value, index) => {
      const row = Math.floor(index / 16);
      const col = index % 16;
      const localX = -module.radius * 0.72 + col * ((module.radius * 1.44) / 15);
      const localY = -module.radius * 0.58 + row * ((module.radius * 1.16) / 15);
      if (!pointInHexLocal(localX, localY, module.radius * 0.98)) return;
      hctx.fillStyle = heatColor(value);
      hctx.fillRect(
        cx + localX * scale - taxelSize / 2,
        cy + localY * scale - taxelSize / 2,
        taxelSize,
        taxelSize,
      );
    });

    hctx.restore();
    hctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const a = (Math.PI / 180) * (60 * i);
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i === 0) hctx.moveTo(px, py);
      else hctx.lineTo(px, py);
    }
    hctx.closePath();
    hctx.strokeStyle = "rgba(21,32,31,.34)";
    hctx.lineWidth = 1.4;
    hctx.stroke();

    hctx.fillStyle = "rgba(255,255,255,.82)";
    roundedRect(hctx, cx - 15, cy - 10, 30, 20, 5);
    hctx.fill();
    hctx.fillStyle = "#15201f";
    hctx.font = "bold 11px system-ui";
    hctx.textAlign = "center";
    hctx.textBaseline = "middle";
    hctx.fillText(`M${module.id}`, cx, cy);
  });
}

function updateMetrics(result) {
  moduleCount.textContent = result.moduleCount;
  objectCount.textContent = result.objectCount;
  activeTaxels.textContent = result.pressure.activeTaxels;
  peakPressure.textContent = result.pressure.peakPressure.toFixed(2);
  contactState.textContent = result.pressure.activeTaxels ? "contact" : "idle";
  throughput.textContent = `${result.throughput.megabytesPerSecond.toFixed(2)} MB/s`;
  throughputBits.textContent = `${result.throughput.megabitsPerSecond.toFixed(1)} Mb/s`;
  linkUse.style.width = `${result.throughput.utilization.toFixed(1)}%`;
  linkState.textContent = result.throughput.link;
  const scope = state.activePatchId ? `Focused P${state.activePatchId}: ` : "";
  linkNote.textContent = `${scope}${result.throughput.patches} patch(es), ${result.throughput.utilization.toFixed(1)}% link use at ${state.samplingHz} Hz.`;
}

function setupDnD() {
  document.getElementById("moduleTemplate").addEventListener("dragstart", (event) => {
    event.dataTransfer.setData("text/plain", JSON.stringify({ type: "module" }));
  });

  document.querySelectorAll(".object-template").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedShape = button.dataset.shape;
      document.querySelectorAll(".object-template").forEach((item) => item.classList.toggle("active", item === button));
      updateControlLabels();
      updateSelectedObject();
    });
    button.addEventListener("dragstart", (event) => {
      state.selectedShape = button.dataset.shape;
      event.dataTransfer.setData("text/plain", JSON.stringify({ type: "object", shape: button.dataset.shape }));
    });
  });

  workspace.addEventListener("dragover", (event) => event.preventDefault());
  workspace.addEventListener("drop", (event) => {
    event.preventDefault();
    const data = JSON.parse(event.dataTransfer.getData("text/plain") || "{}");
    const point = workspacePoint(event);
    if (data.type === "module") createModule(point);
    if (data.type === "object") createObject(point, data.shape);
  });
  workspace.addEventListener("wheel", handleWorkspaceWheel, { passive: false });

  scene.addEventListener("pointerdown", beginBoxSelection);
  scene.addEventListener("pointermove", updateDrag);
  scene.addEventListener("pointerup", endDrag);
  scene.addEventListener("pointercancel", endDrag);
}

function setupControls() {
  sizeRange.addEventListener("input", updateSelectedObject);
  massRange.addEventListener("input", updateSelectedObject);
  sampleRange.addEventListener("input", updateSelectedObject);
  document.getElementById("copySelection").addEventListener("click", copySelection);
  document.getElementById("pasteSelection").addEventListener("click", pasteSelection);
  document.getElementById("makePatch").addEventListener("click", makePatchFromSelection);
  document.getElementById("deleteSelection").addEventListener("click", deleteSelection);
  document.getElementById("resetView").addEventListener("click", () => {
    state.modules = [];
    state.objects = [];
    state.patches = [];
    state.activePatchId = null;
    clearSelection();
    state.lastPressure = new Map();
    renderScene();
    renderHeatmap([]);
    simulate();
  });
  window.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
      event.preventDefault();
      copySelection();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
      event.preventDefault();
      pasteSelection();
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      deleteSelection();
      return;
    }
    if (event.key === "Escape" && state.activePatchId) {
      state.activePatchId = null;
      renderScene();
      simulate();
    }
  });
  window.addEventListener("resize", () => {
    renderGrid();
    renderScene();
  });
}

function boot() {
  drawTemplateDetails();
  renderGrid();
  renderScene();
  renderHeatmap([]);
  setupDnD();
  setupControls();
  updateControlLabels();
  simulate();
}

boot();
