# Changelog

## 2026-06-28 - Split Real Hardware Console from FSR Simulation

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Feature]** Added a dedicated real-hardware FSR console page.
   - `frontend/hardware-live.html` separates physical COM-port readout from the FSR software simulation page.
   - The dashboard toolbar now links to `Hardware Live` next to the existing FSR and accelerometer demos.

2. **[Feature]** Added simultaneous two-layer hardware visualization.
   - The new hardware page displays Layer 1 and Layer 2 at the same time.
   - Each layer has a flexible smooth 2D heatmap and a smooth 3D surface view.
   - The smooth heatmap interpolates between the 16 x 16 hardware samples instead of showing only hard square cells.

3. **[Feature]** Moved firmware upload into the hardware page with sample-frequency input.
   - The hardware page includes target selection, serial port, FQBN, and sample-frequency fields.
   - Firmware upload closes any active serial readout before compiling and uploading.
   - For combined firmware, the backend prepares a temporary sketch copy with `ACC_SAMPLE_RATE` and `FSR_SAMPLE_RATE` set from the requested sample frequency.
   - The original hardware sketch files are not modified by this workflow.
   - Temporary firmware build directories are now cleaned automatically after compile/upload attempts, including Windows/OneDrive read-only generated sketch folders.
   - Added a `Combined FSR + ACC Delta` firmware target that burns a selective FSR transmission loop using full-sync, delta, and no-change frame markers.
   - Added a `Combined FSR Triggered Scan` firmware target with a user-set baseline-relative trigger threshold: idle mode scans only Layer 1 at fixed 10 Hz, then switches to user-selected high-frequency two-layer scanning when Layer 1 changes from its stored baseline beyond the threshold, returning to idle after about one second below threshold and refreshing the baseline.
   - Triggered firmware mode now labels the sample-rate field as `High-speed frequency`, explains that idle mode is fixed at 10 Hz, and automatically raises an accidentally low active frequency to `200 Hz` when the target is selected.
   - Triggered scan now uses baseline-relative activation so raw values that decrease under pressure can still wake high-speed scanning while idle raw offsets do not keep the module awake.
   - The hardware `Tare` button now also sends a `T` control byte to compatible triggered firmware, clearing the MCU-side trigger baseline so the next idle scan records the new reference.
   - Triggered scan wake-up now checks baseline-relative changes on both FSR layers during the fixed 10 Hz idle scan, so pressure on either layer can switch the module into the selected high-frequency streaming mode.
   - The Layer 1/2 3D surface plots now draw semi-transparent side skirts down to the base plane and use a slightly lower z scale, reducing the apparent floating-surface artifact.

4. **[Logic]** Expanded hardware frame payloads for live throughput and two-layer rendering.
   - `/api/fsr-hardware-frame` now returns all available raw layers, delta layers, normalized layers, per-layer peaks, serial bytes per frame, and estimated serial bit rate.
   - The frontend measures UI frame rate and serial bytes per second from successfully received hardware frames.
   - Real hardware acquisition is now decoupled from frontend polling: the Python backend continuously scans the Teensy in a background stream and the browser samples the cached result at a fixed 10 Hz.
   - Frontend request-rate controls were removed so displayed serial throughput reflects backend-measured Teensy-to-PC hardware transfer rather than browser polling speed.
   - Added `eskin-combined-stream`, where the Teensy actively emits ACC plus two-layer FSR frames at the flashed `FSR_SAMPLE_RATE` and the backend only receives and caches new frames.
   - Active stream frames include an `ESKN` marker so the backend can synchronize to frame boundaries before decoding timestamps, ACC samples, and FSR layers.
   - Combined active-stream firmware generation now applies a Teensy-side Layer 2 displayed row 8 calibration factor of `1/7` before serial transmission to compensate for the observed over-sensitive row.
   - Hardware frame payloads now include the full 16-device ACC array so combined FSR/ACC visualizations can be driven by the same serial frame.
   - Added `eskin-combined-delta`, where the backend reconstructs the complete FSR map from `ESKF` full frames, `ESKD` changed-cell frames, and `ESKN` no-change heartbeats.

5. **[Feature]** Added live COM5 frame-data inspection.
   - The hardware page now shows the latest protocol, port, FSR timestamp, ACC timestamp, frame payload size, baseline state, and ACC preview from the current serial frame.
   - This makes the raw COM5 payload visible beside the smooth FSR heatmaps, 3D surfaces, and transfer-rate metrics.
   - The frame-data panel now highlights MCU-to-PC serial throughput in `Mbit`/`Mb/s` terms, while still showing the equivalent frame size in bytes.
   - Serial throughput no longer uses browser polling rate or frame-size estimation as the displayed value.
   - Serial throughput is now measured from actual bytes read from the COM port: the backend writes received serial bytes into a temporary meter file, reads that file size once per second, reports the previous second's bit rate, then truncates the file for the next second.

6. **[Appearance]** Redrew the hardware FSR plots using the MATLAB reference visualization style.
   - `frontend/js/hardware-live.js` now follows the plotting approach from `serialComEskinCombined.m`: tare-based delta layers, fixed display limit behavior, colorbar-style scaling, and MATLAB-like `surf(layer)` views.
   - The 2D plots now use matrix heatmap rendering with grid ticks, colorbars, and per-layer maximum readouts.
   - The 3D plots now use surface mesh rendering with z-axis scaling and colorbar references to better match the MATLAB validation workflow.
   - The individual Layer 1/2 3D surface plots now use a larger centered projection and a filled low-value base plane, reducing unused white space and visual holes.
   - Added a right-side combined 3D view inspired by the original PyQtGraph `plot.py`, overlaying Layer 1, Layer 2, and LIS3DH samples in one live scene.
   - The combined 3D view now uses clearer soft continuous rendering with smooth ribbon sampling and subtle peak highlights, removing visible mesh edges without washing out the data.
   - The combined 3D view can now be rotated by dragging directly on the canvas, while live data continues updating.
   - The combined 3D view now keeps the FSR surfaces anchored to a visible ground plane and supports mouse-wheel zoom.
   - The hardware page default display limit was lowered from `300` to `150` for more sensitive visualization.

7. **[Appearance]** Made the live hardware page more compact and faster by default.
   - `frontend/hardware-live.html` now starts `Live request rate` at the maximum slider value of `120 Hz`.
   - The Layer 1/2 2D heatmap canvases and 3D surface canvases were reduced in size.
   - `frontend/styles.css` now constrains the hardware plot card widths and maximum plot heights so all real-time views fit more comfortably on screen.

8. **[Fix]** Improved serial session lifecycle handling.
   - Opening a different protocol on the same COM port now closes the previous hardware session first.
   - Hardware read or tare failures now release the COM port immediately.
   - `POST /api/fsr-hardware-close` is used by the frontend before page unload, protocol changes, and firmware upload.

9. **[Fix]** Made firmware sketch preparation robust against locked editor folders.
   - Temporary firmware copies now ignore `.vscode`, `.git`, build caches, `__pycache__`, and other non-sketch artifacts.
   - Firmware builds now use timestamped temporary folders under `.codex_firmware_build`, avoiding failures when an older copied sketch directory is locked by Windows, OneDrive, or an editor.
   - Combined firmware preparation now rewrites the temporary sketch into an active streaming firmware, so the burned sample frequency controls Teensy-side output timing instead of PC request timing.

10. **[Fix]** Corrected combined FSR two-layer frame unpacking.
   - The backend now decodes `eskin-combined` FSR payloads according to the firmware order `[fsr_l1_row1, fsr_l2_row1, fsr_l1_row2, fsr_l2_row2, ...]`.
   - This fixes the issue where Layer 1 and Layer 2 were split as the first and second half of the payload, causing each layer to show only part of the physical sensing area.
   - The decoded matrix orientation now matches the MATLAB reference `reshape(fsr_vec, 2*n, n)` workflow used in `serialComEskinCombined.m`.
   - Layer 2 now uses a higher default deadband of `35`, matching the MATLAB script and reducing second-layer idle noise spikes.

11. **[Cleanup]** Removed real-hardware controls from the simulated FSR page.
   - `frontend/fsr-demo.html` is again focused on virtual ADC/MUX/SPI simulation.
   - Real COM-port workflows now live in the dedicated hardware console.

## 2026-06-28 - Add Hardware Live FSR Display and Local Firmware Tooling

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Feature]** Added real-hardware FSR visualization to the FSR readout page.
   - `frontend/fsr-demo.html` now includes a `Real Hardware FSR` control block for selecting serial port, firmware protocol, FSR layer, live streaming, and tare.
   - The newly added `2D FSR Heatmap` and `3D FSR Surface` panels now use physical Teensy serial frames only.
   - These hardware plots no longer fall back to simulated object-placement data; if hardware is offline, they stay in a hardware idle/waiting state.

2. **[Logic]** Added backend hardware-frame APIs for connected e-skin boards.
   - `POST /api/fsr-hardware-frame` reads live FSR frames from a serial-connected Teensy at 500000 baud.
   - `POST /api/fsr-hardware-tare` captures baseline frames and returns delta values for subsequent live visualization.
   - The backend supports `fsr-serial`, `eskin-fsr`, and `eskin-combined` protocols, matching the original `fsr_adc_plexed_serial.ino` and `Eskin.ino` firmware formats.
   - Hardware payloads include raw values, normalized display values, selected layer, timestamp, protocol metadata, baseline state, maximum value, and estimated hardware FPS.

3. **[Feature]** Added one-click firmware upload controls to the dashboard.
   - `frontend/index.html` now includes a `One-click Firmware` card with `Burn FSR` and `Burn Combo` buttons.
   - `POST /api/flash-firmware` compiles and uploads only the fixed, approved firmware targets: FSR-only and combined FSR+ACC.
   - The API reports compile/upload stage, command output, target sketch, port, FQBN, and actionable error messages.

4. **[Environment]** Installed and relocated Arduino CLI for Teensy firmware workflows.
   - Arduino CLI 1.5.1 was installed at `D:\study\Programing\arduino\arduino-cli.exe`.
   - The previous `D:\Arduino\arduino-cli` copy was removed after the new location was verified.
   - User PATH was updated to include `D:\study\Programing\arduino`.
   - Teensy board support `teensy:avr 1.62.0` was verified, including `teensy:avr:teensy41` for Teensy 4.1.
   - `backend/server.py` now has a fallback path to the new Arduino CLI location so the web upload button works even before a terminal PATH refresh.

5. **[Environment]** Added local Python support for hardware recording and serial readout.
   - `pyserial` was installed for the Python environment used by the local backend so `/api/fsr-hardware-frame` can access COM ports.
   - A local `.venv-record/` environment was created for original hardware data collection scripts.
   - The local record environment includes serial/data tooling used by the original e-skin scripts, including `pyserial`, `numpy`, `keyboard`, and `scipy`.
   - The `.venv-record/` folder remains ignored by Git.

6. **[Tooling]** Added local hardware recording helpers for FSR and combined FSR+ACC capture.
   - `tools/record/record.py` supports `fsr-serial`, `eskin-fsr`, and `eskin-combined` acquisition modes.
   - `tools/record/original_scripts/` contains copied/adapted original scripts for MATLAB and Python visualization workflows.
   - `serialComEskinCombined.m` was adapted for combined mode `0xD0`, 100-frame tare, hardware FPS display, UI FPS display, and tunable layer deadband/gain.
   - `run_commands.txt` records concise local commands for listing ports, recording data, and running the original visualization scripts.
   - `tools/` and `.venv-record/` remain local ignored directories and are not intended for normal software-repository pushes.

7. **[Appearance]** Added and refined FSR readout visualization panels.
   - The FSR page now has separate right-side canvas panels for 2D heatmap and 3D surface display.
   - The readout sidebar can be collapsed from an edge arrow instead of a separate toolbar button.
   - The FSR demo height and scroll behavior were adjusted to better fill the browser viewport.

8. **[Logic]** Continued FSR scan-path refinement for the simulator mode.
   - The simulator scan flow distinguishes one-cell, one-row, and full-frame backend responses according to refresh-rate ranges.
   - Manual ADC MOSI playback can animate returned MISO words into the FSR scan display.
   - The SPI transfer summary was simplified to focus on MCU-to-ADC and MCU-to-FPGA line throughput.

## 2026-06-03 - Add ngspice ACC Drive and Backend Subpackages

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Logic]** Added ngspice-backed electrical solving for the LIS3DH accelerometer chip-select layer.
   - `backend/accel/hardware.py` now models the 16 active-low nCS lines as pull-up networks with one selected decoder sink.
   - `backend/electrical/ngspice_backend.py` can solve the accelerometer nCS voltages and returns selected-line and unselected-line smoke-test data through `/api/ngspice-health`.
   - The accelerometer sampler now returns nCS voltage, logic state, and solver metadata with each selected LIS3DH transfer.
   - Added `circuits/ngspice/accel-cs-mux.cir` as a standalone ACC chip-select reference deck.

2. **[Repo]** Split the backend into hardware-specific subpackages.
   - FSR code now lives in `backend/fsr/`.
   - LIS3DH accelerometer code now lives in `backend/accel/`.
   - Shared circuit-level solver code now lives in `backend/electrical/`.
   - Existing public API endpoints and the root `python server.py` launcher remain unchanged.

3. **[Docs]** Added GitHub-rendered README documentation inside backend subfolders.
   - Moved the FSR hardware class guide to `backend/fsr/README.md`.
   - Added a new ACC hardware class guide at `backend/accel/README.md`.
   - Added backend and electrical package README files so GitHub displays the structure directly in each folder.

4. **[Appearance]** Exposed the ACC electrical solver state in the accelerometer demo.
   - The SPI transfer panel now reports whether ACC chip-select voltages came from `ngspice` or the Python fallback.
   - Manual LIS3DH SPI runs now show the selected nCS voltage and solver engine.

## 2026-06-03 - Document FSR Hardware Classes

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Docs]** Added a class-by-class guide for `backend/fsr_hardware.py`.
   - `docs/fsr_hardware_classes.md` explains `Clock`, `MCUTransferCounter`, `ModuleUplinkSPI`, `Resistor`, `FSR`, `DMUX`, `ADC`, `SPIBus`, and `FSRArray`.
   - The guide documents each class's role, key methods, data fields, and position in the FSR scan chain.

2. **[Docs]** Added hardware-flow diagrams and solver notes.
   - The documentation clarifies how pressure becomes FSR resistance, ngspice row voltage, ADC FIFO words, MISO data, and finally heatmap updates.
   - It also records the current modeling limits and future analog effects that can be added.

## 2026-06-03 - Add Dashboard Fusion 3D Model Preview

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Feature]** Added a load-on-demand Fusion OBJ preview to the dashboard.
   - The right panel now includes a `Fusion 3D Model` card with load and fullscreen controls.
   - `frontend/js/module-3d-viewer.js` loads `Module.obj` and `Module.mtl` through Three.js with orbit controls, auto-rotation, and responsive resizing.

2. **[Feature]** Added static serving for model assets.
   - `backend/server.py` now serves files under `/assets/models/` with safe path resolution, MIME detection, and `HEAD` support.

3. **[Repo]** Added Git LFS tracking for large Fusion OBJ model assets.
   - `.gitattributes` tracks `frontend/assets/models/*.obj` through Git LFS so the 3D export can be pushed without exceeding GitHub's normal file-size limit.
   - Added the Fusion `Module.obj` and `Module.mtl` preview assets.

4. **[Dependency]** Vendored the minimal Three.js modules needed by the viewer.
   - Added `three.module.js`, `OrbitControls.js`, `MTLLoader.js`, and `OBJLoader.js` under `frontend/vendor/three/`.
   - The dashboard import map points to these local files instead of a CDN.

5. **[Cleanup]** Removed the old ngspice helper scripts and updated documentation.
   - Deleted `scripts/install_ngspice.ps1` and `scripts/check_ngspice.py`.
   - README and backend error text now describe direct runtime discovery via `NGSPICE_EXECUTABLE`, project-local `tools/ngspice`, or `PATH`.

## 2026-06-03 - Connect ngspice to the FSR Readout Path

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Logic]** Connected ngspice to the interactive FSR row readout path.
   - `FSRArray.read_row()` now solves the selected row through ngspice before the Python MAX11632 model performs SAR conversion, FIFO storage, and MISO readback.
   - The solved electrical network includes the selected row source, MUX on-resistance, 16 FSR resistors, and 16 column load resistors to ground.

2. **[Performance]** Cached repeated ngspice row solves and avoided unnecessary electrical solves during transfer-count statistics.
   - Repeated row resistance patterns reuse cached ngspice output.
   - MCU line-rate statistics now count protocol events directly instead of re-solving analog voltages.

3. **[Appearance]** Exposed the active electrical solver in the FSR demo SPI frame panel.
   - The page now reports whether the scan used `ngspice` or the Python fallback.

4. **[Docs]** Updated the ngspice documentation boundary.
   - Added `circuits/ngspice/fsr-selected-row.cir` as a standalone selected-row reference deck.
   - Clarified that the FSR demo uses ngspice for row voltages while ADC/FIFO/SPI remain Python hardware models.

## 2026-06-02 - Make Dashboard Grid Snapping Permanent

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Logic]** Made honeycomb-grid snapping mandatory for dashboard module placement.
   - Module dragging, grouped movement, and pasted modules now always resolve to the nearest valid honeycomb cell.
   - Removed the optional free-placement branch so users cannot accidentally leave modules between cells.

2. **[Appearance]** Removed the `Snap` toggle from the dashboard toolbar.
   - The toolbar now exposes only actions that remain meaningful when edge-aligned module placement is always enabled.

## 2026-06-02 - Deploy Optional ngspice Electrical Backend

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Feature]** Added an optional ngspice circuit-simulation adapter.
   - `backend/ngspice_backend.py` discovers the project-local ngspice console runtime or a configured system executable.
   - The adapter can solve an FSR voltage divider and parse the resulting output-node voltage from ngspice.

2. **[Feature]** Added an ngspice backend health endpoint.
   - `GET /api/ngspice-health` runs a `3.3 V`, `10 kOhm + 10 kOhm` voltage-divider smoke test.
   - The response reports the discovered executable, ngspice version, output voltage, expected voltage, and pass state.

3. **[Tooling]** Added reproducible Windows installation and verification scripts.
   - `scripts/install_ngspice.ps1` downloads the official Windows 64-bit ngspice release into the ignored local `tools/ngspice/` directory.
   - `scripts/check_ngspice.py` verifies runtime discovery and runs the same circuit-level smoke test from Python.
   - `circuits/ngspice/fsr-divider.cir` provides a standalone reference deck.

4. **[Docs]** Documented the electrical-backend deployment boundary.
   - The interactive FSR UI continues to use the fast Python behavioral model for now.
   - ngspice is deployed alongside it for incremental migration of FSR, resistor, and MUX calculations.

## 2026-06-02 - Organize Software Repository Layout

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Repo]** Kept local hardware workspaces outside software pushes.
   - `prototype/`, `tools/`, and `screenshot/` are now ignored by Git.
   - KiCad projects remain available locally without being mixed into the runnable simulator repository.

2. **[Docs]** Consolidated software documentation under `docs/`.
   - Component PDFs now live under `docs/datasheets/`.
   - Demo MP4 and GIF files now live under `docs/demo/`, and README preview paths were updated accordingly.

3. **[Cleanup]** Removed generated local artifacts.
   - Cleared Python caches, empty log files, temporary inspection output, and local screenshots.

## 2026-05-23 - Add Address-Stepped Accelerometer Scan Animation

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Logic]** Changed the LIS3DH heatmap update path to commit one scanned sensor at a time.
   - The accelerometer demo now updates only the currently addressed LIS3DH cell after its MISO bytes are decoded.
   - Object placement no longer refreshes the full heatmap at once; stale cells remain until their own address is scanned again.

2. **[Appearance]** Added address-based scan visualization to the accelerometer page.
   - The selected array cell, chip-select route, address bits, and heatmap cell now highlight as the scan advances through `nCS_1` to `nCS_16`.
   - A compact status line shows the active address and notes that the heatmap is committed after the `XL/XH/YL/YH/ZL/ZH` readback.

3. **[Fix]** Corrected the accelerometer circuit layout and object interaction.
   - The accelerometer SVG now uses a focused viewBox and no longer inherits the FSR page's wide minimum SVG width.
   - The CS MUX, MCU address lines, SPI bus, scan status text, and heatmap are repositioned to avoid the previous visual overlap.
   - The vibration object now supports pointer drag instead of only click-to-place movement.

## 2026-05-20 - Add Programmable LIS3DH Accelerometer Demo

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Feature]** Added a new programmable LIS3DH accelerometer-array demo page.
   - `frontend/accelerometer-demo.html` and `frontend/js/accelerometer-demo.js` show a 4 x 4 LIS3DH array with shared SPI, CS MUX selection, manual SPI input, and a MISO-derived heatmap.
   - The dashboard now links to the new `Accel Demo` page next to the FSR demo.

2. **[Logic]** Added virtual LIS3DH hardware and scan-controller models.
   - `backend/accel_hardware.py` models LIS3DH registers, the SPI command byte format, auto-increment reads, signed X/Y/Z output registers, the 16-channel CS MUX, and counted line activity.
   - `backend/accel_sampler.py` runs the initial full-frame scan: one CS-selected LIS3DH at a time, using `0xE8` to read `OUT_X_L` through `OUT_Z_H`.

3. **[Logic]** Added accelerometer readout APIs.
   - `/api/accel-readout` returns the full simulated frame and per-line traffic statistics.
   - `/api/lis3dh-spi` lets users send custom LIS3DH SPI bytes and inspect the resulting MISO bytes.

4. **[Appearance]** Added accelerometer-array circuit and heatmap visualization.
   - The page shows the MCU, A1-A4 address lines, CS MUX, 4 x 4 accelerometer array, shared SPI lines, object vibration footprint, and hardware heatmap.
   - Vibration strength and object size are adjustable from the controls panel.

5. **[Docs]** Documented the new LIS3DH demo in the README.
   - The README now lists the accelerometer demo features, usage entry point, and project files.

## 2026-05-19 - Move Prototype Hardware to Dedicated Branch

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Repo]** Moved KiCad prototype hardware files out of `main`.
   - The prototype schematic, project file, and PCB placeholder now live on branch `codex/hardware-prototype`.
   - `main` is kept focused on the software simulator, demos, documentation, and virtual hardware model.

2. **[Repo]** Moved hardware datasheets to the hardware branch.
   - `DATA SHEET/MAX11626-MAX11633 (ADC).pdf` is removed from `main`.
   - `DATA SHEET/cd74hc4067.pdf` was added to `codex/hardware-prototype` before that branch was pushed.

3. **[Docs]** Replaced the previous main-branch KiCad changelog entries with this branch-migration note.
   - Detailed prototype schematic history is preserved on the hardware branch.

## 2026-05-18 - Normalize README Demo Preview Layout

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Docs]** Reordered the README demo previews.
   - The programmable FSR readout demo now appears before the module-network dashboard demo.

2. **[Appearance]** Normalized README demo preview display width.
   - Both README previews now use the same `width="100%"` display rule.
   - `demo/demo2-preview.gif` was regenerated at the same source width as the dashboard preview.

## 2026-05-18 - Refresh FSR Readout Demo Preview

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Assets]** Replaced the programmable FSR readout demo recording with the updated `demo/demo2.mp4`.
   - The repository now stores the latest hardware-readout workflow video for the project homepage.

2. **[Assets]** Regenerated the GitHub-renderable FSR readout GIF preview.
   - `demo/demo2-preview.gif` was rebuilt from the updated MP4 so the README preview matches the current demo.

## 2026-05-18 - Refresh Dashboard Demo Preview

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Assets]** Replaced the module-network dashboard demo recording with the updated `demo/demo1.mp4`.
   - The repository now stores the latest dashboard workflow video supplied for the project homepage.

2. **[Assets]** Regenerated the GitHub-renderable dashboard GIF preview.
   - `demo/demo1-preview.gif` was rebuilt from the updated MP4 so the README preview matches the current demo.

## 2026-05-18 - Replace README Video Tags with Visible GIF Previews

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Docs]** Replaced README `<video>` tags with GitHub-renderable embedded GIF previews.
   - GitHub removes repository-hosted `<video>` players from README rendering, which caused the demo section to appear blank.
   - The README now displays `demo/demo1-preview.gif` and `demo/demo2-preview.gif` directly on the repository homepage.

2. **[Assets]** Added two lightweight animated previews generated from the MP4 recordings.
   - `demo/demo1-preview.gif` previews the module-network dashboard workflow.
   - `demo/demo2-preview.gif` previews the programmable FSR readout workflow.
   - The original MP4 files remain in `demo/` for the full-quality recordings.

## 2026-05-18 - Embed Demo Videos in GitHub README

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Docs]** Changed the GitHub repository homepage demo section from file links to embedded video players.
   - The README now places the dashboard demo and programmable FSR readout demo directly under their feature descriptions.
   - The videos use repository-hosted MP4 assets so visitors can watch them from the GitHub project page.

2. **[Rollback]** Removed the demo-video panel from the local dashboard UI.
   - The simulator dashboard no longer shows the two repository demo videos in the right-side control panel.
   - The frontend CSS for the dashboard video cards was removed.

3. **[Rollback]** Removed the local backend `/demo/` video-serving route.
   - Video display is now handled by the GitHub README, so the Python simulator server no longer exposes repository-level MP4 files.

## 2026-05-18 - Show Demo Videos on the Homepage

Changes are ordered from most important to least important. Each change is labeled with a type.

Superseded by `2026-05-18 - Embed Demo Videos in GitHub README`, which removes these videos from the local dashboard and keeps them on the GitHub repository homepage instead.

1. **[Feature]** Embedded the two demo videos directly on the dashboard homepage.
   - The right-side panel now includes playable video cards for the module-network dashboard and programmable FSR readout demo.
   - Each video is paired with a concise feature description, so users can understand the simulated workflow without opening the README.

2. **[Logic]** Added backend static serving for repository demo videos.
   - The Python server now exposes `/demo/demo1.mp4` and `/demo/demo2.mp4` from the repository-level `demo/` folder.
   - MP4 responses support `HEAD` and byte-range requests so browser video controls can load metadata and seek more reliably.

3. **[Docs]** Repeated the active-development notice in the homepage video section.
   - The page now states that scan strategies, physical MCU-in-the-loop testing, event-driven sensing, compression, and multi-patch communication remain under development.

## 2026-05-18 - Add Demo Videos and Repository Description

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Docs]** Added demo-video documentation to the repository README.
   - The README now describes the dashboard workflow video and the programmable FSR readout video.
   - The feature list was expanded to cover MOSI/MISO command testing, ADC/FIFO-derived heatmap generation, and future MCU-in-the-loop use.

2. **[Assets]** Added two MP4 demo videos under `demo/`.
   - `demo/demo1.mp4` documents the module-network dashboard and pressure-visualization workflow.
   - `demo/demo2.mp4` documents the programmable FSR readout, ADC FIFO, MOSI input, and MISO output workflow.

3. **[Docs]** Marked the project as actively under development.
   - The README now states that additional scan strategies, external MCU workflows, event-driven sensing, VAE-style encoding, and multi-patch communication models will be updated later.

## 2026-05-15 - Unified Scan and Heatmap Pipeline

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Logic]** Unified scan strategy across all refresh-rate visualization modes.
   - All modes now follow the same MUX row order and ADC FIFO column order: R1-R16, then C1-C16 per row.
   - High-frequency direct mode no longer requests all rows in parallel; it performs the same sequential row scan without drawing the animation.
   - Heatmap storage is updated per scanned FIFO word rather than by treating a row as one visual batch.

2. **[Appearance]** Kept animation differences strictly visual.
   - 1 Hz can still show row and FIFO column playback.
   - 1-10 Hz shows only the MUX row scan while cell values are still committed in FIFO order.
   - Above 10 Hz hides both row and column scan highlights while keeping the same scan-derived heatmap data path.

## 2026-05-15 - Hide MUX Scan in Direct Mode

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Logic]** Removed visible MUX row stepping above 10 Hz.
   - High-frequency direct mode now scans all 16 rows through the backend API and writes the full heatmap from ADC/FIFO results.
   - The front end no longer advances the displayed row or highlights the DMUX-selected row above 10 Hz.

2. **[Appearance]** Hid direct-mode scan highlights.
   - Address lines, DMUX row outputs, array row highlight, and heatmap active-cell outline are suppressed in direct mode.
   - The heatmap status label now reports direct full-frame scan instead of a moving row.

## 2026-05-15 - Correct Full-Frame Refresh Semantics

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Logic]** Recalibrated refresh-rate visualization around full 16x16 frame scans.
   - `1 Hz` now means the hardware completes one full 16x16 scan per second.
   - The UI demonstration runs at the intended 1/16 speed: at 1 Hz, one visible full scan takes 16 seconds, one row takes 1 second, and one FIFO column step takes 1/16 second.
   - Only 1 Hz shows both row and FIFO column animation; 1-10 Hz shows row animation only; above 10 Hz writes scanned heatmap data without scan animation.

2. **[Appearance]** Adjusted side-panel and protocol-table sizing.
   - The left control panel width was increased by 1.5x.
   - The MAX11632 input-byte table gives the Register column more room.

## 2026-05-15 - Frequency-Aware Scan Visualization

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Logic]** Decoupled object movement from active scan playback.
   - Moving the pressure object no longer restarts the current FIFO cursor at C1.
   - The next hardware scan samples the latest object position, so heatmap updates still come only from scanned ADC/FIFO data.

2. **[Logic]** Added refresh-rate-dependent visualization modes.
   - At 5 Hz or below, the demo shows full FIFO column playback.
   - Above 5 Hz, the demo hides vertical FIFO playback and only shows row scanning.
   - Above 100 Hz, the demo disables scan animation and writes heatmap rows directly from scanned data.

3. **[Interaction]** Manual MOSI playback now forces a 5 Hz animated display.
   - Running user-entered MOSI bytes stops Auto Scan, sets the visual refresh control to 5 Hz, and shows the FIFO animation.
   - Manual MISO output moved from the right readout panel into the left control panel.

4. **[Appearance]** Updated the FSR demo layout.
   - Default refresh rate is now 5 Hz.
   - The right data panel is wider.
   - Column load-resistor symbols were moved slightly right for clearer spacing.

## 2026-05-15 - FIFO Playback Scheduling Fix

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Logic]** Fixed FIFO animation being reset to the first column at high refresh rates.
   - Auto Scan now waits for the current C1-C16 FIFO playback to finish before advancing to the next row.
   - Refresh-rate data statistics still use the configured hardware refresh rate; only the illustrative UI playback is throttled.

2. **[Interaction]** Reduced redundant updates while placing the pressure object.
   - Dragging over the same FSR grid cell no longer restarts the FIFO playback.
   - Hardware-state requests now avoid overlapping updates that could reset the scan cursor.

## 2026-05-15 - FIFO Column Scan Animation

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Feature]** Added FIFO-style vertical scan playback to the FSR demo.
   - After each selected-row conversion, the UI now replays ADC FIFO output from C1 to C16.
   - The middle circuit highlights the current vertical column being clocked out through MISO.
   - The hardware heatmap updates cells in FIFO order instead of painting the full row at once.

2. **[Appearance]** Added a visible FIFO readout cursor.
   - The active column line, selected FSR cell, sample node, and readout path now use a blue FIFO scan highlight.
   - The current reading label shows the active FIFO row and column during playback.

## 2026-05-15 - Manual ADC MOSI Program

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Feature]** Added a programmable MAX11632 MOSI input simulator.
   - The FSR demo now accepts one or more user-entered MOSI bytes.
   - The backend decodes each byte as a MAX11632 input byte and executes setup, averaging, reset, or conversion behavior.
   - Conversion commands produce real simulated MISO output from the virtual ADC FIFO.

2. **[Logic]** Added channel-range handling for MAX11632 scan modes.
   - Conversion mode `00` scans AIN0 through the selected channel.
   - Conversion mode `01` scans from the selected channel through AIN15.
   - Conversion mode `10` repeats one channel according to the averaging-register scan count.
   - Conversion mode `11` returns a single selected-channel result.

3. **[Appearance]** Replaced the Step Row button with manual MOSI controls.
   - The left control panel now has a MOSI byte input area and a Run MOSI button.
   - Manual MOSI/MISO results are shown inside the SPI transfer panel.

## 2026-05-15 - ADC DOUT Format and Wider Readout Panel

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Logic]** Made the simulated ADC FIFO output explicit as MAX11632 DOUT words.
   - Each conversion now exposes the 16-bit DOUT word, binary DOUT text, and two output bytes.
   - The 16-bit word keeps the datasheet format: four leading zeros followed by the 12-bit ADC code, MSB first.
   - Reset-register metadata now matches the datasheet wording: `RESET=1` clears FIFO and `RESET=0` resets registers.

2. **[Appearance]** Doubled the FSR demo right-side data panel width.
   - The demo grid now gives the readout panel 620 px instead of 310 px.
   - This gives the SPI transfer details and MAX11632 command table more room.

## 2026-05-15 - MAX11632 Input Byte Table

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Logic]** Added the MAX11632 input data byte table to the hardware ADC model.
   - The simulated ADC now exposes Conversion, Setup, Averaging, and Reset register byte formats from the datasheet.
   - Added builders and decoders for setup, conversion, averaging, and active-low reset input bytes.
   - Normal scan output now reports the setup byte, averaging-disabled byte, reset-not-asserted byte, and AIN0-AIN15 conversion byte from the same backend model.

2. **[Appearance]** Added a MAX11632 input-byte table to the FSR demo page.
   - The right-side panel now displays the MSB-first bit layout for all four ADC command/register byte types.
   - The SPI transfer panel now includes the averaging and reset-state bytes alongside setup and conversion.

3. **[Docs]** Added the new ADC datasheet to the repository and expanded dashboard protocol notes.
   - The homepage now lists the Averaging and Reset byte formats in addition to Setup and Conversion.

## 2026-05-15 - MAX11632 SPI Protocol Alignment

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Logic]** Updated the ADC simulation to match the MAX11632 command and result format.
   - The internal ADC scan command is now `0xF8`, meaning conversion register `1 1111 00 0` for AIN0-AIN15 scan.
   - MAX11632 FIFO readout is now counted as 16-bit words per channel, with four leading zeros plus the 12-bit ADC code.
   - Internal ADC SPI throughput now includes 256 MISO bits per row instead of only the 192 valid ADC bits.

2. **[Docs]** Added protocol notes on the dashboard.
   - The homepage now documents the FPGA-to-STM32G474 custom command frame.
   - It also documents the MAX11632 setup byte, conversion byte, single-channel command template, full AIN0-AIN15 command, and ADC result format.

3. **[Appearance]** Updated FSR demo readout text.
   - The SPI transfer panel now displays MAX11632 setup and conversion bytes.
   - The readout logic describes the 16-bit FIFO word format.

## 2026-05-15 - Module MCU Uplink SPI Model

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Logic]** Added a module-to-upper-layer SPI transfer model.
   - The FSR demo now models STM32G474 as the module MCU.
   - After the initial raw 16x16 scan, STM32G474 sends one raw frame to an upper FPGA/Hub over SPI.
   - The uplink model includes SCK, MOSI command, MISO raw result, CS windows, metadata, and required SCK rate.

2. **[Appearance]** Updated the FSR demo architecture view.
   - The circuit now labels the module MCU as STM32G474.
   - A Patch FPGA/Hub block and four SPI uplink wires are shown near the module MCU.

3. **[Docs]** Updated the readout text for the initial no-algorithm scan mode.
   - The right-side transfer panel separates internal ADC SPI from module uplink SPI.
   - The readout logic states that no event-driven or encoder algorithm is currently applied.

## 2026-05-14 - Remove Live Waveform Display

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Appearance]** Removed the real-time waveform panel from the FSR demo.
   - The demo no longer displays CLK/SCK, Address, MOSI, MISO, or CS waveforms.
   - Removed the dedicated waveform CSS and rendering code to avoid misleading timing visuals.

2. **[Docs]** Clarified the refresh-rate visualization ratio.
   - The refresh-rate note now states that visual row stepping is illustrative.
   - It shows the displayed full-frame rate versus the actual hardware full-frame rate as a 1:16 ratio.
   - Right-side transfer-rate statistics are explicitly described as using the actual hardware setting.

## 2026-05-14 - Stable Clock Waveform Rendering

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Logic]** Fixed CLK/SCK aliasing in the waveform display.
   - The clock waveform is now rendered analytically from the hardware time axis instead of browser-frame sampling.
   - The visual clock period is stable while still changing width according to the configured SPI clock frequency.

2. **[Appearance]** Kept CLK/SCK low outside actual SPI transfer windows.
   - Clock pulses are only drawn during ADC command and FIFO-read phases.
   - Non-clock signals continue to show live sampled transfer-window history.

## 2026-05-14 - Hardware-Driven Live Waveforms

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Logic]** Replaced decorative waveform animation with live hardware-state sampling.
   - Auto Scan now samples the virtual hardware timing phases on each browser frame.
   - CLK/SCK toggles only during command and FIFO read phases, using the configured SPI clock.
   - ADDRESS, MOSI, MISO, and CS go high only when their corresponding hardware transfer window is active.

2. **[Appearance]** Converted the bottom waveform panel into a scrolling history display.
   - The visible waveforms now change only from sampled hardware line states.
   - When Auto Scan is off, the waveform panel stops updating and reports idle state.

## 2026-05-14 - Rolling Transfer Waveforms

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Appearance]** Replaced the bottom four-step readout strip with a rolling waveform panel.
   - The FSR demo now shows Address, CLK/SCK, MOSI, MISO, and CS in the former process-label area.
   - CLK and SCK are merged into one waveform, with denser and narrower pulses as configured clock frequency increases.

2. **[Logic]** Changed waveform levels to represent transfer windows.
   - MOSI is high only during ADC command transmission.
   - MISO is high only during ADC FIFO readout.
   - CS and Address show high only during their active transfer/setup windows.

## 2026-05-14 - Scan Waveform Visualization

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Appearance]** Added a waveform panel for the scan lines.
   - The FSR demo now visualizes CLK, Address, SCK, MOSI, MISO, and CS waveforms.
   - The top waveform displays the current configured CLK/SCK value.

2. **[Docs]** Clarified the refresh-rate control in the UI.
   - The controls now state that visualization speed is illustrative.
   - The right-side throughput counter remains based on the actual configured full-frame refresh rate.

## 2026-05-14 - State-Driven SPI Line Highlighting

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Logic]** Replaced animation-driven SPI highlighting with MCU transaction state.
   - The backend now reports per-line activity for the current row transfer.
   - SCK, MOSI, MISO, and CS are highlighted only when the current MCU row transaction uses them.

2. **[Appearance]** Removed the phase animation from the SPI bus display.
   - SPI lines now behave like A1-A4: a static hardware-state view for the current scan row.
   - The circuit view labels each active SPI line with its current transferred amount or value.

## 2026-05-14 - Softer FSR Heatmap Gradient

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Logic]** Smoothed the simulated pressure field under the square object.
   - FSR force now uses a softer radial falloff inside the object footprint.
   - The center-to-edge pressure difference is reduced for a more natural heatmap.

2. **[Appearance]** Restored persistent scanned-cell coloring in the large FSR array.
   - Cells turn red after they have been scanned through MISO and exceed the threshold.
   - Unscanned cells remain neutral, so the object no longer appears fully detected before scanning.

3. **[Appearance]** Reduced heatmap contrast.
   - Heatmap intensity uses a wider ADC-code dynamic range so neighboring force levels differ less abruptly.

## 2026-05-14 - Restore Scanned-Only FSR Highlighting

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Logic]** Fixed the ADC idle baseline used by the FSR display.
   - Idle code now represents the unpressed FSR voltage-divider output, not `0 V`.
   - This prevents unpressed cells from crossing the detection threshold.

2. **[Appearance]** Restored scanned-only red highlighting in the FSR array.
   - The large FSR grid now turns cells red only on the currently scanned row.
   - Previously scanned rows no longer remain red in the circuit array view.

## 2026-05-14 - MCU-Measured Line Throughput

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Logic]** Moved line-rate reporting from clock formulas to an MCU event counter.
   - The sampler now counts Address, SCK, MOSI, MISO, and CS activity while simulating one full 16-row frame.
   - Per-second values are derived from the counted per-frame events and the selected full-frame refresh rate.

2. **[Appearance]** Updated the SPI Frame panel to show MCU-counted throughput.
   - The panel now displays per-frame and per-second values for all five requested lines.
   - The display explicitly labels the source as the MCU transfer counter.

## 2026-05-14 - Scan Line Throughput Display

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Logic]** Calculated scan-line transfer rates from full-frame refresh rate.
   - Refresh rate is treated as completed `16 x 16` scan frames per second.
   - Address, SCK, MOSI, MISO, and CS rates are calculated from 16 row scans per frame.

2. **[Appearance]** Replaced the SPI frame text with per-line throughput values.
   - The panel now reports Address, SCK, MOSI, MISO, and CS activity per second.
   - The display keeps the current MOSI command and active SPI phase as context.

## 2026-05-14 - Visible SPI Phase and Heatmap Scaling

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Appearance]** Made SPI line changes visible instead of using real sub-millisecond timing directly.
   - The visual layer now cycles through command, conversion, and FIFO-read phases at a human-readable pace.
   - The underlying backend clock still reports the real refresh-rate-derived timing.

2. **[Appearance]** Improved FSR heatmap sensitivity.
   - Heatmap color now subtracts the ADC idle baseline before scaling intensity.
   - Detection threshold now tracks the idle ADC code plus a small offset, so lighter loads become visible.

## 2026-05-14 - SPI Phase Animation and Hardware Clock

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Logic]** Added a unified backend hardware clock derived from the selected refresh rate.
   - The clock now exposes frame period, row period, SPI bits per row, and derived SCK frequency.
   - ADC/SPI transaction timing is divided into command, conversion, and FIFO-read phases.

2. **[Appearance]** Animated SPI lines according to the active transfer phase.
   - Command phase highlights CS, MOSI, and SCK.
   - FIFO read phase highlights CS, MISO, and SCK.
   - The demo now displays the current SPI phase and derived SCK rate.

3. **[Logic]** Lowered the FSR demo heatmap detection threshold.
   - Hardware heatmap cells now become active at a lower ADC code, making lighter object loads visible sooner.

## 2026-05-14 - ADC FIFO Scan Logic

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Logic]** Reworked the virtual ADC into a command-driven FIFO device.
   - MCU now pulls CS low, sends a MOSI scan command for AIN0-AIN15, and releases CS.
   - ADC then samples each channel, performs SAR conversion, writes results into FIFO, and pulls EOC low.
   - MCU performs a second CS-low read phase and clocks the 16 FIFO words out on MISO.

2. **[Logic]** Added the ADC MOSI command bit layout.
   - The scan command now follows `bit7 CH3 CH2 CH1 CH0 SC1 SC0 X`.
   - This earlier abstract command was later replaced by the MAX11632-specific `0xF8` AIN0-AIN15 scan command.

3. **[Feature]** Exposed ADC transaction details in the API response.
   - Responses now include FIFO depth, EOC state, scan conversions, and SPI command/read transactions.

4. **[Appearance]** Updated the FSR demo text to match the two-phase ADC behavior.
   - The SPI frame display now shows command, conversion, EOC, and FIFO read phases.
   - The demo now lists MOSI command format, binary value, hex value, and named bit fields.

## 2026-05-13 - Project Folder Reorganization

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Structure]** Split the project into clear backend, frontend, and documentation folders.
   - Python server and hardware simulation files now live under `backend/`.
   - HTML, CSS, and JavaScript assets now live under `frontend/`.
   - Reference PDFs now live under `docs/references/`.

2. **[Compatibility]** Added a root `server.py` launcher.
   - The project can still be started with `python server.py` from the repository root.

3. **[Docs]** Updated the README project structure section.
   - The file map now reflects the reorganized folder layout.

## 2026-05-12 - Persistent MISO Heatmap Cache

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Logic]** Kept previous MISO heatmap data while moving the FSR object.
   - Moving the object or changing object settings no longer clears the received heatmap.
   - A row updates only when that row is scanned again and a new MISO frame is received.

## 2026-05-12 - MISO-Driven FSR Heatmap

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Logic]** Changed the FSR heatmap to update only from transmitted MISO data.
   - The Python API no longer sends a full hidden 16 x 16 scan matrix.
   - The frontend updates one heatmap row only after receiving that row's SPI/MISO ADC words.

2. **[Logic]** Removed frontend object-position inference from detection display.
   - FSR colors now come from cached received ADC codes, not from object placement geometry.
   - Moving or resizing the object clears the received-data cache until new MISO frames arrive.

## 2026-05-12 - Hardware Heatmap Refresh

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Logic]** Moved FSR detection display data fully onto the hardware simulator output.
   - The Python hardware scan now returns a full 16 x 16 ADC scan matrix.
   - FSR cell colors and the heatmap are driven by this returned hardware matrix instead of frontend geometry checks.

2. **[Feature]** Added FSR refresh-rate control.
   - Refresh rate is adjustable up to 700 Hz.
   - Animation effects are disabled automatically above 10 Hz.

3. **[Appearance]** Replaced the right-side clock trace with a hardware heatmap.
   - The heatmap visualizes simulated ADC codes from the hardware scan matrix.

## 2026-05-12 - FSR Object Footprint Alignment

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Appearance]** Removed manual row and column sliders from the FSR controls.
   - Scan row is now controlled by Step Row or Auto Scan.
   - Object column and row are controlled directly by placing the object on the array.

2. **[Logic]** Aligned the square object footprint with covered FSR cells.
   - Object size now maps directly to the rendered square side length.
   - The Python pressure model and frontend covered-cell rendering use the same square footprint geometry.

## 2026-05-12 - FSR Square Object Coverage

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Appearance]** Changed the FSR pressure object to a square.
   - The object drawing now uses a square footprint and supports a larger size range.
   - Removed the local highlighted FSR label and inline FSR resistor symbol from the object area.

2. **[Logic]** Updated covered and detected FSR states.
   - All FSR cells covered by the square object are shown in red.
   - During auto scan, covered cells on the currently scanned row are shown in blue.

3. **[Appearance]** Cleaned remaining circuit alignment issues.
   - Removed the animated orange vertical signal line through the object area.
   - Lowered the MCU so its lower edge aligns with the ADC, allowing the CS line to connect cleanly.

## 2026-05-12 - FSR Object Controls and Binary SPI

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Feature]** Added dashboard-style object controls to the FSR demo.
   - The placed FSR object now has adjustable size and mass.
   - Object size changes the pressure footprint and object mass changes pressure intensity.

2. **[Logic]** Updated the Python FSR pressure model.
   - The virtual FSR array now distributes pressure across rows and columns from the object's footprint.
   - The sampler accepts object size and mass instead of only a single force percentage.

3. **[Logic]** Switched SPI trace values to binary.
   - MOSI now displays an 8-bit binary row-read command.
   - MISO now displays the 12-bit binary ADC code returned for the object column.

## 2026-05-12 - FSR Pressure Object Scan

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Feature]** Added object placement on the FSR demo array.
   - Users can click or drag on the 16 x 16 FSR array to place the pressure object.
   - Auto scan now sweeps rows while reading pressure from the placed object position.

2. **[Logic]** Separated scanned row from object row in the Python sampler.
   - `/api/fsr-readout` now accepts `objectRow` independently from the selected scan row.
   - The per-clock scan trace reports changing MOSI read commands and MISO ADC words.

3. **[Appearance]** Fixed remaining floating bus lines.
   - A4 now terminates inside the DMUX address area.
   - SCK and the other SPI lines now enter the ADC body instead of stopping above it.

## 2026-05-12 - Dashboard Occupancy and FSR Clock I/O

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Logic]** Prevented overlapping e-skin modules on the dashboard.
   - New modules are placed on the nearest free honeycomb cell.
   - Dragging or pasting modules now rejects positions that would place two modules on the same cell.

2. **[Appearance]** Tightened FSR circuit wiring.
   - Address, ADC, SPI, and ground connections now extend into their target blocks or symbols to avoid floating-line gaps.

3. **[Feature]** Added MCU clock I/O visibility during FSR auto scan.
   - The FSR demo now shows per-clock address output, ADC input summary, and SPI MISO output in the circuit area.

## 2026-05-12 - FSR Circuit Visual Cleanup

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Appearance]** Cleaned the DMUX-to-MCU address bus.
   - A1, A2, A3, and A4 are now vertical, parallel lines.
   - Removed extra grey explanatory labels near the address and row-select area.

2. **[Appearance]** Cleaned the ADC/load-resistor area.
   - Removed the long ADC sampling annotation text from the circuit drawing.
   - Removed the C1-C16 parallel sampling annotation above the ADC.

3. **[Logic]** Corrected the drawn load-resistor grounding connection.
   - Column load resistors now visibly connect to their ground symbols.

4. **[Docs]** Standardized changelog type labels.
   - Existing changelog entries now use explicit change-type tags.
   - Future changelog entries should follow the same type-tagged format.

## 2026-05-12 - FSR Bus Rendering and SPI Model

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Feature]** Added a Python SPI hardware interface.
   - `SPIBus` now defines SCK, MOSI, MISO, and CS as explicit virtual hardware lines.
   - The sampler records what each SPI line carries during the ADC readout frame.

2. **[Appearance]** Simplified the FSR circuit drawing.
   - The row-address bus now shows only A1, A2, A3, and A4.
   - The address bus is rendered as four simple straight lines.

3. **[Appearance]** Removed the bottom waveform analyzer.
   - The FSR page now focuses on the circuit and bus connections instead of separate logic traces.

4. **[Appearance]** Updated SPI visualization.
   - The circuit now draws SCK, MOSI, MISO, and CS between the MCU and ADC.

## 2026-05-12 - Programmable FSR Virtual Hardware

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Logic]** Split hardware simulation from demo rendering.
   - Added `fsr_hardware.py` for virtual hardware primitives.
   - Added `fsr_sampler.py` for the programmable sampling sequence.
   - The browser no longer owns the FSR resistance, voltage-divider, ADC, or row-address calculations.

2. **[Feature]** Added explicit Python hardware classes.
   - `DMUX` is controlled by A1-A4 and exposes one selected row as Vcc while grounding all other rows.
   - `ADC` performs parallel 16-channel sampling and converts voltages to 12-bit codes.
   - `Resistor`, `FSR`, and `FSRArray` model the load resistor, force-dependent FSR resistance, and 16 x 16 matrix.

3. **[Logic]** Added a programmable readout controller.
   - `FSRReadoutProgram.tick(...)` executes address, analog, conversion, and SPI-transfer phases.
   - The structure is intentionally similar to firmware or Verilog-style sequencing.

4. **[Feature]** Added a backend API for the FSR demo.
   - `/api/fsr-readout` returns DMUX row states, address bits, column node voltages, ADC codes, SPI frame words, and logic traces.
   - The frontend now visualizes this returned hardware state.

5. **[Docs]** Updated documentation.
   - README now lists the Python virtual hardware and programmable sampler files.

## 2026-05-12 - FSR Readout Circuit Correction

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Logic]** Corrected the FSR column readout topology.
   - The column output is now drawn as a voltage-divider sampling node.
   - Each column node connects to a 10 kOhm load resistor to GND.
   - The ADC is shown as a high-impedance sampler of the node, rather than as part of the resistor current path.

2. **[Logic]** Corrected DMUX row-drive behavior.
   - Only the selected row is marked as `Vcc`.
   - All non-selected rows are marked as `GND`.
   - A diode is shown on each row output to indicate reverse-current blocking.

3. **[Logic]** Clarified parallel ADC sampling.
   - During each selected-row scan, C1-C16 are shown as simultaneous column signals into the 16-channel ADC.
   - The SPI frame now states that all 16 column words are returned to the MCU for the active row.

4. **[Appearance]** Added row-address logic visualization.
   - Four logic traces, A0-A3, were added below the circuit.
   - Auto scan now makes the address waveforms advance with the selected row.

5. **[Appearance]** Re-routed MCU address wiring.
   - The A0-A3 address bus now travels from the MCU to the DMUX select input in the left-side control area.
   - The address bus no longer overlaps the column load resistors or ADC area.
