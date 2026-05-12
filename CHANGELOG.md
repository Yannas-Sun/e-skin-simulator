# Changelog

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
