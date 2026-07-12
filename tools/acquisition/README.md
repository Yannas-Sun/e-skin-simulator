# Hardware Acquisition Tools

This directory contains optional offline tools for recording and plotting data
from the physical Teensy e-skin hardware. It is independent from the web
simulator runtime.

## Python environment

The local acquisition environment is kept beside these tools at
`tools/acquisition/.venv/`. To recreate it:

```powershell
python -m venv tools\acquisition\.venv
.\tools\acquisition\.venv\Scripts\python.exe -m pip install -r tools\acquisition\requirements.txt
```

## Record serial data

Run commands from the repository root:

```powershell
# FSR + ACC combined firmware
.\tools\acquisition\.venv\Scripts\python.exe tools\acquisition\record.py COM5 16 data_combined.mat --protocol eskin-combined

# FSR-only serial firmware
.\tools\acquisition\.venv\Scripts\python.exe tools\acquisition\record.py COM5 16 data_fsr.mat --protocol fsr-serial
```

Supported protocols:

| Protocol | Expected firmware payload |
|---|---|
| `fsr-serial` | One 16 x 16 FSR layer. |
| `eskin-fsr` | Cached FSR frame from the combined firmware. |
| `eskin-combined` | 16 accelerometers plus two 16 x 16 FSR layers. |

The output is a MATLAB `.mat` file containing FSR frames, optional ACC frames,
timestamps, and the selected protocol. Generated `.mat` files are ignored by
Git.

## MATLAB references

The `matlab/` directory contains the retained MATLAB acquisition and plotting
scripts:

```text
matlab/serialComEskinCombined.m
matlab/serialComFSR.m
matlab/tcpComFSR.m
```

## Firmware source of truth

Firmware is maintained in the same repository as the simulator. The web
uploader reads:

```text
firmware/teensy41/Eskin/Eskin.ino
firmware/teensy41/fsr_adc_plexed_serial/fsr_adc_plexed_serial.ino
```

Only one application can own `COM5` at a time. Close the web Hardware Live
session, Arduino Serial Monitor, or MATLAB before starting another recorder.
