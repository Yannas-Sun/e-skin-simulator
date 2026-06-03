# Modular e-Skin Network Simulator

This project is a lightweight software simulator for exploring scalable electronics in a modular, multi-layer electronic skin system. It is based on the planning work in `E_skin_plan_report.pdf`, which studies how an existing multi-modal e-skin platform can be redesigned into a compact, modular architecture with better data, power, and calibration scalability.

## Background

The simulated e-skin module follows the hardware structure described in the report:

- Hexagonal honeycomb-style module geometry
- Two internal `16 x 16` FSR force-sensing layers
- One `4 x 4` LIS3DH accelerometer layer
- Module-level sensing with patch-level aggregation
- Data throughput estimated from `560 channels/module` at a configurable sampling rate

The simulator is intended as an early design and communication tool rather than a high-fidelity finite-element or electronics model.

## Hardware Module Preview

The simulator is developed alongside a modular hardware prototype. Each hexagonal module is designed as a compact stack containing a local mainboard, a distributed accelerometer layer, and a folded FSR pressure-sensing array.

![Complete multi-layer e-skin module render](docs/hardware/module-render.png)

The same geometry supports patch-level assembly. The render below shows a five-module configuration that motivates the simulator's honeycomb workspace, patch grouping, and scalable data-throughput tools.

![Five-module e-skin patch render](docs/hardware/multi-module-demo.png)

The complete PCB layouts, schematics, layer renders, and hardware development notes are maintained on the [`codex/hardware-prototype` branch](https://github.com/Yannas-Sun/e-skin-simulator/tree/codex/hardware-prototype).

## Development Status

This project is still under active development. The current repository captures the first programmable simulation workflow, hardware-readout demo, and visualization interface. New functions will continue to be added, including richer scan strategies, external MCU-in-the-loop testing, event-driven sensing experiments, encoder/VAE-style data compression, and more complete multi-patch communication models.

## Features

### Module Network Dashboard

- Drag hexagonal e-skin modules into a honeycomb grid
- Assemble modules into arbitrary edge-aligned networks
- Box-select multiple modules or test objects
- Move, copy, paste, and delete selected items
- Combine selected modules into a patch
- Click a patch label or outline to focus the workspace view on that patch
- Show heatmap and throughput data for the focused patch until another item is selected
- Drag test objects onto the module network
- Choose object shape: circle, square, or triangle
- Adjust object size and mass
- Zoom the workspace using the mouse wheel, centered on the cursor
- Display a live pressure heatmap matching the assembled module topology
- Show module IDs on the heatmap
- Estimate real-time data throughput and Ethernet link use

### Programmable FSR Readout Demo

- Open an FSR readout demo showing DMUX row selection, 16 x 16 FSR voltage-divider readout, 16-channel ADC sampling, and four-wire SPI transfer back to the MCU
- Run the FSR demo from programmable Python virtual hardware classes rather than frontend-only formulas
- Simulate a MAX11632-style ADC command flow, including setup, averaging, reset, conversion input bytes, FIFO readout, EOC behavior, and 16-bit MISO output words
- Enter custom MOSI byte sequences from the web UI and inspect the resulting MISO FIFO output
- Generate the FSR heatmap from scanned ADC/FIFO data rather than directly from object placement
- Switch visualization behavior by refresh rate while keeping the same scan pipeline: MUX row scan followed by ADC FIFO column output
- Use the simulator as a bridge toward physical MCU testing, where an external MCU can later drive or validate the same command and data-transfer logic

### Programmable LIS3DH Accelerometer Demo

- Open an accelerometer demo showing a 4 x 4 LIS3DH array with shared SPI and individual chip-select control through a MUX
- Simulate LIS3DH SPI command encoding: `R/W`, multi-byte auto-increment, and 6-bit register address
- Read `OUT_X_L` through `OUT_Z_H` using the datasheet-style `0xE8` command byte
- Adjust the virtual object's vibration strength and footprint
- Decode X/Y/Z acceleration only from returned MISO register bytes
- Generate the hardware heatmap from decoded MISO data rather than direct object placement
- Display counted SPI traffic for address lines, SCK, MOSI, MISO, CS, and the upstream MCU-to-FPGA frame

## Demo Videos

The repository includes two embedded demo previews to document the current simulator behavior. The original MP4 recordings are kept in `docs/demo/`, while the GIF previews below are used because GitHub README pages do not render repository-hosted MP4 files as inline players.

### Programmable FSR Readout Demo

Demonstrates the programmable FSR readout page, including MUX-controlled row scanning, ADC/FIFO-based column readout, MOSI command input, MISO output inspection, and hardware-derived heatmap generation.

<img src="docs/demo/demo2-preview.gif" alt="Programmable FSR readout demo" width="100%">

### Module Network Dashboard

Demonstrates the modular e-skin dashboard, including honeycomb-style module placement, object interaction, patch-oriented pressure visualization, module identifiers, and data-throughput feedback.

<img src="docs/demo/demo1-preview.gif" alt="Module network dashboard demo" width="100%">

These videos show the current state of the prototype. The simulator remains in progress, and future videos will be updated as new hardware models, external MCU workflows, scan strategies, and algorithm experiments are added.

## Running

This project uses only the Python standard library for the backend and plain HTML/CSS/JavaScript for the frontend.

```powershell
python server.py
```

Then open:

```text
http://127.0.0.1:8000
```

Use the HTTP address above rather than opening `index.html` directly, because the frontend calls the Python backend API at `/api/simulate`.

## ngspice Electrical Backend

The project includes an optional ngspice adapter for circuit-level simulation. The current deployment uses the official Windows 64-bit ngspice console executable and keeps the downloaded runtime under the ignored local `tools/ngspice/` directory.

Install or verify the local runtime:

```powershell
powershell.exe -ExecutionPolicy Bypass -File scripts/install_ngspice.ps1
python scripts/check_ngspice.py
```

The health endpoint runs a `3.3 V` FSR voltage-divider smoke test through ngspice:

```text
http://127.0.0.1:8000/api/ngspice-health
```

The interactive FSR demo now uses ngspice for the selected-row electrical network. For each scanned row, Python computes the current FSR resistance values, ngspice solves the row source, MUX on-resistance, 16 FSRs, and 16 load resistors, then the Python MAX11632 model converts those node voltages into FIFO and MISO words. The dashboard-level module heatmap still uses the fast Python pressure model.

## Basic Usage

1. Drag an `e-Skin Module` from the right panel into the workspace.
2. Arrange modules on the honeycomb grid.
3. Drag a test object into the workspace.
4. Adjust object size, mass, and sampling rate from the right panel.
5. Read the pressure heatmap and data throughput from the left panel.
6. Drag on empty workspace space to box-select multiple items.
7. Use toolbar buttons or shortcuts:
   - `Copy`
   - `Paste`
   - `Delete`
   - `Ctrl+C`
   - `Ctrl+V`
   - `Delete` / `Backspace`
8. Click `FSR Demo` to inspect the hardware readout path for one 16 x 16 FSR layer.
9. Click `Accel Demo` to inspect the LIS3DH accelerometer-array readout path.

## Project Structure

```text
software-simulation/
  server.py                    # root launcher; keeps `python server.py` working
  backend/
    server.py                  # Python HTTP server and simulation API
    accel_hardware.py          # virtual LIS3DH, accelerometer CS MUX, and SPI transfer primitives
    accel_sampler.py           # programmable LIS3DH scan controller using the virtual hardware
    fsr_hardware.py            # virtual DMUX, ADC, resistor, FSR, and FSR array primitives
    fsr_sampler.py             # programmable scan controller using the virtual hardware
    ngspice_backend.py         # optional circuit-level ngspice adapter and health check
  circuits/
    ngspice/
      fsr-divider.cir          # standalone FSR voltage-divider smoke-test circuit
      fsr-selected-row.cir     # selected-row FSR network with MUX on-resistance and 16 load dividers
  frontend/
    accelerometer-demo.html    # LIS3DH accelerometer-array readout demo
    index.html                 # module-network dashboard
    fsr-demo.html              # FSR readout circuit demo
    styles.css                 # shared UI styling
    js/
      app.js                   # dashboard interaction, rendering, and API calls
      accelerometer-demo.js    # LIS3DH visualization and MISO-driven heatmap logic
      fsr-demo.js              # FSR visualization and MISO-driven heatmap logic
  docs/
    datasheets/                # component datasheets used by the virtual hardware models
    demo/
      demo1.mp4                # dashboard workflow demo
      demo2.mp4                # programmable FSR readout demo
    hardware/                  # module and patch renders used by this README
    references/                # project reports and source PDFs
  scripts/
    install_ngspice.ps1        # reproducible local Windows ngspice installer
    check_ngspice.py           # ngspice discovery and divider smoke test
  CHANGELOG.md                 # ordered record of pushed changes
```

Local KiCad prototypes and downloaded helper tools can live beside the simulator under `prototype/` and `tools/`. They are intentionally excluded from software pushes so the repository stays focused on the runnable simulation platform.
