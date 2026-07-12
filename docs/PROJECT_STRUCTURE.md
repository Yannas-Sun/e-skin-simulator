# Project Structure and Runtime Connections

This document identifies the source of truth for each part of the simulator and
shows how frontend pages, Python APIs, virtual hardware, physical hardware, and
supporting tools connect.

## Runtime entry

```text
python server.py
  -> backend.server.main()
  -> http://127.0.0.1:8000
  -> static files from frontend/
  -> JSON endpoints under /api/
```

The root `server.py` is intentionally a small launcher. The active HTTP server,
serial session manager, and firmware upload service live in
`backend/server.py`.

## Page-to-backend map

| Page | JavaScript | API | Python implementation |
|---|---|---|---|
| Dashboard | `frontend/js/pages/dashboard.js` | `POST /api/simulate` | Pressure and throughput functions in `backend/dashboard.py` |
| FSR simulation | `frontend/js/pages/fsr-demo.js` | `POST /api/fsr-readout` | `backend/fsr/sampler.py` and `backend/fsr/hardware.py` |
| Manual ADC input | `frontend/js/pages/fsr-demo.js` | `POST /api/adc-mosi` | MAX11632 command model in `backend/fsr/` |
| ACC simulation | `frontend/js/pages/accelerometer-demo.js` | `POST /api/accel-readout` | `backend/accel/sampler.py` and `backend/accel/hardware.py` |
| Manual LIS3DH input | `frontend/js/pages/accelerometer-demo.js` | `POST /api/lis3dh-spi` | LIS3DH register model in `backend/accel/` |
| Physical hardware | `frontend/js/pages/hardware-live.js` | `/api/fsr-hardware-*` | `FSRHardwareSession` in `backend/server.py` and `pyserial` |
| Firmware upload | `frontend/js/pages/hardware-live.js` | `POST /api/flash-firmware` | Temporary sketch generation and Arduino CLI in `backend/server.py` |

## Backend packages

```text
backend/
  server.py                 HTTP routes, serial sessions, firmware upload
  dashboard.py              Module pressure and patch throughput calculations
  fsr/
    hardware.py             Clock, DMUX, FSR, divider, MAX11632, SPI
    sampler.py              MCU-like 16 x 16 scan program
  accel/
    hardware.py             CS decoder, LIS3DH registers, SPI behavior
    sampler.py              MCU-like 4 x 4 accelerometer scan program
  electrical/
    ngspice_backend.py      Optional analog node-voltage solver
```

`backend/accel/sampler.py` reuses `ModuleUplinkSPI` from
`backend/fsr/hardware.py` for the common MCU-to-FPGA link model.

The ngspice adapter creates temporary circuit decks at runtime. Files under
`circuits/ngspice/` are readable reference examples and are not loaded by the
application.

## Firmware source and upload flow

Firmware has one source of truth inside this repository:

```text
firmware/teensy41/
```

Upload targets resolve to:

```text
FSR only
  -> firmware/teensy41/fsr_adc_plexed_serial/

Combined, delta, and triggered scanning
  -> firmware/teensy41/Eskin/
```

The uploader copies the selected sketch directory into
`firmware/.build/`, modifies only that temporary copy, invokes the local
`tools/arduino-cli/arduino-cli.exe` or an `arduino-cli` available on `PATH`, and
then removes the temporary build. The tracked base sketch is never rewritten by
the web uploader.

## Optional acquisition tools

`tools/acquisition/` is independent from the web application. It provides a
Python recorder and retained MATLAB scripts for offline COM-port experiments.
It reads the same physical serial protocols but is not imported by the server.

## Documentation and assets

- `docs/datasheets/`: component datasheets used to design the behavioral models.
- `docs/references/`: planning reports and source publications.
- `docs/hardware/`: images embedded by the root README.
- `docs/demo/`: MP4 sources and GIF previews for GitHub.
- `circuits/ngspice/`: standalone reference SPICE decks.
- `frontend/assets/models/`: optional large module model used by the 3D viewer.
- `firmware/`: tracked Teensy 4.1 source sketches used by the uploader.

## Generated local state

These paths are reproducible and must not be committed:

```text
tools/acquisition/.venv/  Optional acquisition environment
tools/arduino-cli/*.exe   Optional local third-party Arduino CLI binary
firmware/.build/          Temporary prepared sketches and compiler output
%TEMP%/e-skin-simulator/  One-second serial byte meter
__pycache__/ and *.pyc    Python bytecode
*.mat                     Recorded experiment output
.agents/ and .codex/      Local Codex session metadata, not application source
```

## Source-of-truth rules

1. Edit uploadable physical firmware only under `firmware/teensy41/`.
2. Edit virtual hardware under `backend/fsr/` or `backend/accel/`.
3. Edit page behavior under `frontend/js/pages/`.
4. Keep real COM-port behavior in `hardware-live.js`, not simulation pages.
5. Treat system-temporary runtime data, virtual environments, bytecode, and
   recorded data as generated local state.
