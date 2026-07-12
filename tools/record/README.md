# Teensy FSR Record Environment

This folder contains a local, fixed copy of the original `e-skin_original/script/record.py` workflow.

## Environment

The virtual environment is created at:

```powershell
.venv-record
```

Installed dependencies:

```text
pyserial
numpy
keyboard
scipy
PyQt5
pyqtgraph
PyOpenGL
```

Because this project path is very long on Windows, PyQt5 is installed in a short external package directory and linked back into `.venv-record` through:

```text
.venv-record/Lib/site-packages/pyqt-eskin-site.pth
```

The external package directory is:

```text
C:\Users\19334\pyqt-eskin-site
```

## Run

From the repository root:

FSR-only serial firmware:

```powershell
.\.venv-record\Scripts\python.exe tools\record\record.py COM5 16 data.mat --protocol fsr-serial
```

`src/Eskin/Eskin.ino` FSR-only cached mode:

```powershell
.\.venv-record\Scripts\python.exe tools\record\record.py COM5 16 data.mat --protocol eskin-fsr
```

`src/Eskin/Eskin.ino` immediate FSR + ACC mode:

```powershell
.\.venv-record\Scripts\python.exe tools\record\record.py COM5 16 data.mat --protocol eskin-combined
```

Arguments:

```text
COM5      Teensy serial port
16        FSR array size, for a 16 x 16 scan
data.mat  Optional output file
```

Press `a` to stop recording. The script writes:

```text
data       uint16 FSR samples, shape = samples x 256
fsr        uint16 FSR samples
acc        int16 accelerometer samples, only for eskin-combined
timestamp  uint32 timestamps, shape = samples x 2
```

This script is intended for the original FSR serial workflow, especially firmware shaped like `src/fsr_adc_plexed_serial/fsr_adc_plexed_serial.ino`.

If the script opens the COM port but times out after reading 4 bytes, the Teensy is probably running `src/Eskin/Eskin.ino` while the script is using the default `fsr-serial` protocol. Use `--protocol eskin-combined` for the integrated FSR + ACC check.

## Original Scripts

The original hardware scripts and firmware sketches have been copied into:

```text
tools/record/original_scripts
```

Useful Python entry points:

```powershell
.\.venv-record\Scripts\python.exe tools\record\original_scripts\src\Eskin\plot.py COM5
.\.venv-record\Scripts\python.exe tools\record\original_scripts\src\Eskin\read.py COM5
.\.venv-record\Scripts\python.exe tools\record\original_scripts\src\MUXEDADC\plot.py COM5
.\.venv-record\Scripts\python.exe tools\record\original_scripts\src\MUXEDADC\plot2.py COM5
.\.venv-record\Scripts\python.exe tools\record\original_scripts\src\MUXEDADC\read.py COM5
.\.venv-record\Scripts\python.exe tools\record\original_scripts\src\customFSR\main.py
```

Useful MATLAB entry points copied for reference:

```text
tools/record/original_scripts/script/serialComFSR.m
tools/record/original_scripts/script/serialComEskinCombined.m
tools/record/original_scripts/script/tcpComFSR.m
```

These MATLAB scripts still need MATLAB to run.

`serialComEskinCombined.m` is adapted for `src/Eskin/Eskin.ino` mode 3. It performs a 100-frame tare at startup, reports hardware/UI FPS in the plot title, and applies display-only per-layer deadband/gain:

```matlab
layer1_gain = 1.0;
layer2_gain = 0.25;
layer1_deadband = 8;
layer2_deadband = 35;
```

Increase `layer2_deadband` if layer 2 shows static spikes after tare. Decrease `layer2_gain` if layer 2 is visually much more sensitive than layer 1. These values only change the display; they do not change the raw serial data.
