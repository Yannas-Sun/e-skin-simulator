import argparse
import time
from pathlib import Path

import keyboard
import numpy as np
import serial
from scipy.io import savemat


def read_exact(port, size):
    data = port.read(size)
    if len(data) != size:
        raise TimeoutError(f"Expected {size} bytes, received {len(data)} bytes")
    return data


def command_for(mode, n):
    return ((mode & 0x03) << 6) | (n & 0x3F)


def read_fsr_serial(arduino, n):
    arduino.write(bytes([n]))
    ts0 = int.from_bytes(read_exact(arduino, 4), "little")
    ts1 = int.from_bytes(read_exact(arduino, 4), "little")
    raw = read_exact(arduino, n * n * 2)
    fsr = np.frombuffer(raw, dtype="<u2").copy()
    return [ts0, ts1], None, fsr


def read_eskin_fsr(arduino, n):
    arduino.write(bytes([command_for(0, n)]))
    ts_fsr = int.from_bytes(read_exact(arduino, 4), "little")
    if ts_fsr == 0:
        return [0, ts_fsr], None, None
    raw = read_exact(arduino, n * n * 2)
    fsr = np.frombuffer(raw, dtype="<u2").copy()
    return [0, ts_fsr], None, fsr


def read_eskin_combined(arduino, n):
    arduino.write(bytes([command_for(3, n)]))
    ts_acc = int.from_bytes(read_exact(arduino, 4), "little")
    ts_fsr = int.from_bytes(read_exact(arduino, 4), "little")
    acc_raw = read_exact(arduino, 16 * 3 * 2)
    fsr_raw = read_exact(arduino, 2 * n * n * 2)
    acc = np.frombuffer(acc_raw, dtype="<i2").copy().reshape(16, 3)
    fsr = np.frombuffer(fsr_raw, dtype="<u2").copy().reshape(2, n, n)
    return [ts_acc, ts_fsr], acc, fsr


def main():
    parser = argparse.ArgumentParser(description="Record data from the original Teensy e-skin firmware.")
    parser.add_argument("port", help="Teensy serial port, for example COM5")
    parser.add_argument("n_array", type=int, help="FSR array size, for example 16")
    parser.add_argument("output", nargs="?", default="data.mat", help="Output .mat file")
    parser.add_argument(
        "--protocol",
        choices=["fsr-serial", "eskin-fsr", "eskin-combined"],
        default="fsr-serial",
        help=(
            "fsr-serial: src/fsr_adc_plexed_serial format; "
            "eskin-fsr: src/Eskin mode 0 cached FSR format; "
            "eskin-combined: src/Eskin mode 3 immediate ACC + two-layer FSR format"
        ),
    )
    parser.add_argument("--baud", type=int, default=500000, help="Serial baud rate")
    args = parser.parse_args()

    port_name = args.port
    n = args.n_array
    output = Path(args.output)

    if not 1 <= n <= 32:
        raise ValueError("n_array should be between 1 and 32")

    fsr_frames = []
    acc_frames = []
    timestamps = []

    readers = {
        "fsr-serial": read_fsr_serial,
        "eskin-fsr": read_eskin_fsr,
        "eskin-combined": read_eskin_combined,
    }
    reader = readers[args.protocol]

    print(f"Opening {port_name} at {args.baud} baud")
    print(f"Protocol: {args.protocol}")
    print("Press 'a' to stop recording")

    with serial.Serial(port_name, args.baud, timeout=3) as arduino:
        time.sleep(1)

        while True:
            if keyboard.is_pressed("a"):
                break

            ts, acc, fsr = reader(arduino, n)
            timestamps.append(ts)
            if acc is not None:
                acc_frames.append(acc)
            if fsr is not None:
                fsr_frames.append(fsr)

            if fsr is None:
                print(f"samples={len(timestamps)} ts={ts} no FSR payload yet")
                time.sleep(0.05)
                continue

            if len(fsr_frames) % 25 == 0 or len(fsr_frames) == 1:
                fsr_flat = np.asarray(fsr).reshape(-1)
                msg = f"samples={len(fsr_frames)} ts={ts} fsr0={int(fsr_flat[0])}"
                if acc is not None:
                    msg += f" accA1={acc[0].tolist()}"
                print(msg)

    savemat(output, {
        "fsr": np.asarray(fsr_frames, dtype=np.uint16),
        "acc": np.asarray(acc_frames, dtype=np.int16),
        "timestamp": np.asarray(timestamps, dtype=np.uint32),
        "protocol": args.protocol,
    })
    print(f"Saved {len(fsr_frames)} FSR frames and {len(acc_frames)} ACC frames to {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
