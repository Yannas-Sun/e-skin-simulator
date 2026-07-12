# Teensy 4.1 Firmware

This directory is the firmware source of truth used by the web uploader.
Nothing under the external hardware workspace is read during compile or upload.

## Source sketches

```text
firmware/
  teensy41/
    Eskin/
      Eskin.ino
      fsr.hpp
      lis3dh.cpp
      lis3dh.h
    fsr_adc_plexed_serial/
      fsr_adc_plexed_serial.ino
      fsr.hpp
```

| Web target | Base sketch | Prepared behavior |
|---|---|---|
| Combined FSR + ACC | `teensy41/Eskin/Eskin.ino` | Full ACC and two-layer FSR frames. |
| Combined FSR + ACC Delta | `teensy41/Eskin/Eskin.ino` | Full synchronization, delta, and no-change frames. |
| Combined FSR Triggered Scan | `teensy41/Eskin/Eskin.ino` | Fixed 10 Hz idle scan and configurable active scan. |
| FSR only | `teensy41/fsr_adc_plexed_serial/fsr_adc_plexed_serial.ino` | Host-commanded one- or two-layer FSR readout. |

The backend never edits these base sketches during a web upload. It copies the
selected sketch folder into `firmware/.build/`, applies frequency and mode
changes to that temporary copy, compiles and uploads it, then removes the build
folder.

Edit these files when a firmware change should become part of the repository.
Do not edit `firmware/.build/`; it is generated and ignored by Git.
