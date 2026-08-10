# ESKIN SPI-to-USB FSR bridge

This directory is the standalone full-matrix FSR acquisition and visualisation
application. It is used with either the STM32 `fsr1` or `fsr2` application.

## Data path

```text
16 x 16 FSR
  -> STM32 MUX + MAX11633 acquisition
  -> STM32 SPI3 slave
  -> Teensy 4.1 SPI master
  -> USB CDC
  -> Python heatmap and diagnostic tools
```

The wire frame is 515 bytes:

```text
byte 0       0xA5 magic
bytes 1..2   uint16 sequence, little-endian
bytes 3..514 256 uint16 samples, little-endian
```

The matrix is transported as `[MUX][ADC]`. Each sample must be in the 12-bit
range `0..4095`.

## Files

| File | Purpose |
|---|---|
| `ESKIN_SPI_USB_BRIDGE.ino` | Teensy 4.1 SPI-master to USB CDC bridge |
| `live_fsr_heatmap.py` | Complete PCB-shaped 16 x 16 raw ADC heatmap and raw-frame saving |
| `read_teensy_fsr.py` | Binary frame reader and protocol/sequence diagnostics |
| `test_adc_rows.py` | Guided baseline/press test for selected physical rows |
| `test_peak_neighborhood.py` | Shows only the strongest cell and its eight physical neighbours |
| `build_flash_normalized_fsr1.py` | Historical/optional MCU-normalised FSR1 firmware builder; not used by the raw GUI |
| `data/` | Historical calibration plus generated raw-frame and row-test results |

## One-command FSR1 test

From PowerShell:

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\flash_fsr1_pair.cmd" COM9
```

From CMD:

```cmd
"D:\study\programming\ESKIN\firmware\tools\commands\flash_fsr1_pair.cmd" COM9
```

This builds/flashes the STM32 FSR1 application, compiles/uploads this Teensy
bridge, waits for USB reconnection, and opens the FSR1 heatmap automatically.

## One-command FSR2 test

From PowerShell:

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\flash_fsr2_pair.cmd" COM9
```

This uses the STM32 FSR2 application and opens the same raw heatmap with the
FSR2 orientation and FSR2 data path.

## GUI controls and outputs

The heatmap supports:

- the validated physical transpose and orientation for each region;
- direct display of the unmodified STM32 `0..4095` ADC codes;
- saving timestamped raw 16 x 16 frames;
- live frame rate, sequence-gap and data-range status;
- automatic FSR1/FSR2 raw-output folders selected by `--region`.

Calibration is intentionally disabled. Historical JSON files under
`data/calibration/` are retained for traceability but are not loaded by the
live GUI.

Direct GUI commands, when matching firmware is already loaded:

```powershell
python -u live_fsr_heatmap.py --port COM9 --region fsr1
python -u live_fsr_heatmap.py --port COM9 --region fsr2
python -u live_fsr_heatmap.py --demo --region fsr1
```

Do not open Arduino Serial Monitor or another Python reader while the GUI owns
the COM port.

Current observation (2026-08-09): FSR2 responds normally; FSR1 frames remain
continuous but contain only raw values `0/1`. See
[`../../../docs/FSR_TEST_ERROR.md`](../../../docs/FSR_TEST_ERROR.md).
