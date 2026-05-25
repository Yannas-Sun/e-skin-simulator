# Changelog

## 2026-05-25 - Hardware README and Schematic Documentation

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Documentation]** Added a hardware branch README for the current `mainboard` 2.0 prototype.
   - The README opens with the PCB layout image and 3D render graph so the branch immediately shows the current board state.
   - Added a concise project background and working-principle summary for the STM32G474-based module architecture.

2. **[Documentation]** Added schematic visual documentation for the main functional blocks.
   - Embedded the complete schematic SVG and linked the PDF version.
   - Added illustrated sections for MCU control, FSR row MUX scanning, FSR ADC column readout, ACC-layer selection, power conversion, USB power input, and module-to-module power links.

3. **[Repo]** Synced the latest local `mainboard` 2.0 KiCad files and generated graph assets to the hardware branch.
   - Included updated schematic, PCB, project metadata, custom symbols/footprints, 3D model, and `docs/Graph` image assets.

## 2026-05-25 - Mainboard 2.0 First Routed PCB

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Layout]** Completed the first full PCB layout and routing pass for the `mainboard` 2.0 hardware prototype.
   - The current pushed snapshot contains the routed `mainboard.kicad_pcb`, updated schematic, project metadata, custom footprint library, generated documentation, 3D model assets, and KiCad backup archives from the active local 2.0 project folder.
   - The PCB snapshot represents the first complete routed/layout version ready for DRC review, copper-pour verification, manufacturing-file cleanup, and final pre-fabrication checks.

2. **[Repo]** Reorganized the hardware branch to contain only the current `mainboard` 2.0 hardware project contents plus this changelog.
   - Removed the previous software simulator, demo, old prototype, and reference-document files from the hardware branch.
   - Preserved `CHANGELOG.md` as the branch-level hardware history while replacing the branch contents with the latest local 2.0 KiCad project files.

## 2026-05-24 - Hardware Snapshot Sync

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Hardware]** Synced the current local `mainboard` KiCad project state to the hardware branch.
   - Updated the PCB, schematic, project, and KiCad layout metadata from `prototype/new/mainbord`.
   - Preserved the current local component placement and hardware connectivity work as the latest tracked prototype snapshot.

2. **[Repo]** Added the latest KiCad auto-backup archives for the mainboard project.
   - These backups document the recent hardware editing history alongside the active KiCad files.
   - Transient KiCad lock files remain excluded from the pushed snapshot.

## 2026-05-23 - PCB Symmetry Adjustment

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Layout]** Mirrored right-side PCB components from their left-side counterparts.
   - Adjusted ADC2, MUX2, right-side FPC connectors, right-side power/debug connector placement, and ADC2 pull-down resistor positions from the current left-side layout around the board centerline.
   - Kept single centerline components such as the MCU, USB connector, ACC FPC, and central decoder unchanged.

2. **[Layout]** Preserved the existing board outline and net connectivity.
   - This update changes footprint placement and orientation only; schematic nets and component identities are unchanged.

## 2026-05-23 - Mainboard Hardware Prototype Update

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Hardware]** Renamed the KiCad prototype from `fsr_array` to `mainboard`.
   - Project, schematic, PCB, symbol library, footprint library, and KiCad library tables now use `mainboard` naming.
   - The custom footprint library now appears as `mainboard.pretty`.

2. **[Hardware]** Replaced the previous Teensy-style controller direction with an STM32G474CETx mainboard controller design.
   - Added STM32G474 MCU placement, 3.3 V supply usage, SWD programming header, reset/reference nets, and MCU-facing signal labels.
   - Added level-shifting support around the MCU for 3.3 V MCU signals and 5 V peripheral-side logic.

3. **[Hardware]** Updated the fixed divider resistors to SMT 10 kOhm-style resistor footprints.
   - Replaced the earlier custom single-pad resistor structure with paired SMT resistor pads tied between ADC input nodes and GND.
   - Adjusted resistor placement for ADC1/ADC2 symmetry and channel ordering.

4. **[Hardware]** Added FPC/FFC connector support for mainboard-to-layer interconnects.
   - Added `AFC01-S16FCA-00` footprint and schematic symbol for 16-channel FSR connections.
   - Preserved `AFC01-S22FCA-00` support for ACC-layer connections and mapped connector pins to the current PCB usage.

5. **[Layout]** Reworked the PCB outline and component placement toward a compact symmetric hexagonal module.
   - The board uses a six-sided outline and more symmetric placement around the MCU.
   - ADC, MUX, connector, resistor, USB, SWD, and mounting-hole placement has been iterated for a clearer mainboard layout.

6. **[Docs]** Added footprint-library documentation for the custom mainboard footprints.
   - `prototype/new/mainbord/FOOTPRINT_PIN_MAPPING.md` summarizes custom footprints and intended usage.
   - `prototype/new/mainbord/mainboard.pretty/footprint_mapping.html` provides a visual table for the footprint library.

7. **[Repo]** Replaced the old tracked `fsr_array` KiCad files on the hardware branch with the updated `mainboard` files.
   - The hardware branch now stores the current mainboard prototype rather than the earlier `fsr_array` project naming.

## 2026-05-19 - Replace Prototype Header MCU with STM32G474CETx

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Hardware]** Removed the old two-header MCU placeholder from the prototype schematic.
   - The `J11` and `J12` 24-pin MCU header symbols were removed from `prototype/mainboard/mainboard.kicad_sch`.
   - The old connector stub wiring in that MCU area was cleared to avoid leaving floating legacy header wiring.

2. **[Hardware]** Connected the new `STM32G474CETx` symbol according to the current module readout logic.
   - `PA0-PA3` are assigned to shared MUX row-address lines `MUX_A0-MUX_A3`.
   - `PB12-PB15` and `PB9-PB10` are assigned to ADC SPI, chip-select, and EOC signals.
   - `PA4-PA7` are reserved for the upper FPGA/HUB SPI interface.
   - MCU power pins are tied to `+3.3V` and `GND` net labels.

3. **[Docs]** Added an on-schematic note documenting the STM32G474CETx pin assignment.
   - The note summarizes the MUX address, ADC SPI/control, and upper-level SPI responsibilities.

## 2026-05-19 - Update Prototype Schematic MCU Interface

Changes are ordered from most important to least important. Each change is labeled with a type.

1. **[Hardware]** Updated the prototype KiCad schematic MCU section from the previous Teensy connector wording to the current STM32G474 module MCU interface.
   - The MCU connector title now reads `STM32G474 module MCU conn.`.
   - The two 24-pin prototype headers are now labeled `STM32G474_MCU_left_header` and `STM32G474_MCU_right_header`.

2. **[Docs]** Added an on-schematic note for the STM32G474 prototype header pair.
   - The note identifies the header pair as the interface for scan control, ADC SPI, and the upper-level interface.

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
