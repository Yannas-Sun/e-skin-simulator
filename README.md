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

## Demo Videos

The repository includes two embedded demo videos to document the current simulator behavior.

### Module Network Dashboard

Demonstrates the modular e-skin dashboard, including honeycomb-style module placement, object interaction, patch-oriented pressure visualization, module identifiers, and data-throughput feedback.

<video src="https://github.com/Yannas-Sun/e-skin-simulator/raw/main/demo/demo1.mp4" controls width="100%"></video>

### Programmable FSR Readout Demo

Demonstrates the programmable FSR readout page, including MUX-controlled row scanning, ADC/FIFO-based column readout, MOSI command input, MISO output inspection, and hardware-derived heatmap generation.

<video src="https://github.com/Yannas-Sun/e-skin-simulator/raw/main/demo/demo2.mp4" controls width="100%"></video>

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

## Project Structure

```text
software-simulation/
  server.py                    # root launcher; keeps `python server.py` working
  backend/
    server.py                  # Python HTTP server and simulation API
    fsr_hardware.py            # virtual DMUX, ADC, resistor, FSR, and FSR array primitives
    fsr_sampler.py             # programmable scan controller using the virtual hardware
  frontend/
    index.html                 # module-network dashboard
    fsr-demo.html              # FSR readout circuit demo
    styles.css                 # shared UI styling
    js/
      app.js                   # dashboard interaction, rendering, and API calls
      fsr-demo.js              # FSR visualization and MISO-driven heatmap logic
  demo/
    demo1.mp4                  # dashboard workflow demo
    demo2.mp4                  # programmable FSR readout demo
  docs/
    references/                # project reports and source PDFs
  CHANGELOG.md                 # ordered record of pushed changes
```
