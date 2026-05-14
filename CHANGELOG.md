# Changelog

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
   - A full AIN0-AIN15 scan is represented as `10000110` with `CH=0000`, `SC=11`, and `X=0`.

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
