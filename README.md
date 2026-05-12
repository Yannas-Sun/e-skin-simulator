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

## Features

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
- Open an FSR readout demo showing DMUX row selection, 16 x 16 FSR voltage-divider readout, 16-channel ADC sampling, and SPI transfer back to the MCU

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

## Files

- `server.py` - Python HTTP server and simulation API
- `index.html` - application layout
- `fsr-demo.html` - interactive FSR readout circuit demo
- `styles.css` - user interface styling
- `app.js` - workspace interaction, rendering, and API calls
- `fsr-demo.js` - DMUX, FSR, ADC, and MCU readout visualization logic
- `E_skin_plan_report.pdf` - source planning report and project background
