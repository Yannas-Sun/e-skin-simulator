const viewer = document.getElementById("moduleModelViewer");
const loadButton = document.getElementById("loadModuleModel");
const fullscreenButton = document.getElementById("fullscreenModuleModel");
const modelState = document.getElementById("modelState");

const MODEL_BASE = "/assets/models/";
const MODEL_OBJ = "Module.obj";
const MODEL_MTL = "Module.mtl";

let started = false;
let loadPromise = null;
let resizeScene = null;

function setState(text) {
  if (modelState) modelState.textContent = text;
}

function clearPlaceholder() {
  viewer.querySelector(".model-placeholder")?.remove();
}

function fitCameraToObject(THREE, camera, object, controls) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z);
  const distance = maxSize / (2 * Math.tan((Math.PI * camera.fov) / 360));

  camera.position.set(center.x + distance * 0.75, center.y - distance * 0.95, center.z + distance * 0.72);
  camera.near = Math.max(0.01, distance / 100);
  camera.far = distance * 100;
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.update();
}

function resizeRenderer(camera, renderer) {
  const width = Math.max(1, viewer.clientWidth);
  const height = Math.max(1, viewer.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

async function loadModel() {
  if (loadPromise) return loadPromise;
  loadPromise = loadModelScene().catch((error) => {
    loadPromise = null;
    throw error;
  });
  return loadPromise;
}

async function loadModelScene() {
  if (started || !viewer || !loadButton) return;
  started = true;
  loadButton.disabled = true;
  loadButton.textContent = "Loading model...";
  setState("loading");

  const [THREE, { OrbitControls }, { MTLLoader }, { OBJLoader }] = await Promise.all([
    import("three"),
    import("three/addons/controls/OrbitControls.js"),
    import("three/addons/loaders/MTLLoader.js"),
    import("three/addons/loaders/OBJLoader.js"),
  ]);

  clearPlaceholder();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf8fbf9);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  viewer.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.55;

  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfd8d2, 1.9));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(3, -4, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8ec8bd, 0.9);
  fill.position.set(-4, 3, 2);
  scene.add(fill);

  resizeRenderer(camera, renderer);

  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => {
    setState(total ? `${loaded}/${total}` : "loading");
  };

  const materials = await new Promise((resolve, reject) => {
    const loader = new MTLLoader(manager);
    loader.setPath(MODEL_BASE);
    loader.load(MODEL_MTL, resolve, undefined, reject);
  });
  materials.preload();

  const model = await new Promise((resolve, reject) => {
    const loader = new OBJLoader(manager);
    loader.setPath(MODEL_BASE);
    loader.setMaterials(materials);
    loader.load(
      MODEL_OBJ,
      resolve,
      (event) => {
        if (event.lengthComputable) {
          setState(`${Math.round((event.loaded / event.total) * 100)}%`);
        }
      },
      reject,
    );
  });

  model.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (!child.material) {
        child.material = new THREE.MeshStandardMaterial({ color: 0x5f806f, roughness: 0.72 });
      }
    }
  });
  scene.add(model);
  fitCameraToObject(THREE, camera, model, controls);
  setState("loaded");
  loadButton.textContent = "3D Model Loaded";

  const observer = new ResizeObserver(() => resizeRenderer(camera, renderer));
  observer.observe(viewer);
  resizeScene = () => resizeRenderer(camera, renderer);

  function animate() {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();
}

async function toggleFullscreen() {
  if (!viewer) return;
  if (!document.fullscreenElement) {
    await loadModel();
    await viewer.requestFullscreen();
  } else if (document.fullscreenElement === viewer) {
    await document.exitFullscreen();
  }
}

loadButton?.addEventListener("click", () => {
  loadModel().catch((error) => {
    console.error(error);
    started = false;
    loadButton.disabled = false;
    loadButton.textContent = "Retry 3D Model";
    setState("failed");
  });
});

fullscreenButton?.addEventListener("click", () => {
  toggleFullscreen().catch((error) => {
    console.error(error);
    setState("fullscreen failed");
  });
});

document.addEventListener("fullscreenchange", () => {
  const isFullscreen = document.fullscreenElement === viewer;
  if (fullscreenButton) fullscreenButton.textContent = isFullscreen ? "Exit Fullscreen" : "Fullscreen";
  resizeScene?.();
  window.setTimeout(() => resizeScene?.(), 80);
});
