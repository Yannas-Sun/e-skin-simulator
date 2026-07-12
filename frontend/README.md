# Frontend Structure

The frontend uses plain HTML, CSS, and JavaScript. HTML entry points stay at
the `frontend/` root so existing URLs remain stable.

```text
frontend/
  index.html                    Dashboard and module network
  fsr-demo.html                 Programmable FSR simulation
  accelerometer-demo.html       Programmable LIS3DH simulation
  hardware-live.html            Physical Teensy serial console and uploader
  styles.css                    Compatibility import for older cached pages
  css/
    app.css                     Shared responsive styles
  js/
    pages/
      dashboard.js              Module placement and `/api/simulate`
      fsr-demo.js               FSR scan visualization and ADC commands
      accelerometer-demo.js     LIS3DH scan visualization and SPI commands
      hardware-live.js          COM port data, tare, metrics, and upload UI
    components/
      module-3d-viewer.js        Optional Three.js OBJ preview
  assets/models/                Module OBJ and material assets
  vendor/three/                 Vendored Three.js modules
```

All pages are served by `backend/server.py`. Do not open the HTML files
directly because their API requests require the Python server.

The responsibility boundary is intentional:

- Simulation pages communicate only with virtual-hardware APIs.
- `hardware-live.html` is the only page that owns real serial acquisition,
  tare, throughput metrics, and firmware upload controls.
- The dashboard contains assembly and pressure-network behavior only.
