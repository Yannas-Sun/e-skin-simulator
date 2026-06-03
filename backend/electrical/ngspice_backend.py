from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[2]
PROJECT_NGSPICE = ROOT / "tools" / "ngspice" / "Spice64" / "bin" / "ngspice_con.exe"
VOLTAGE_PATTERN = re.compile(r"v\(vout\)\s*=\s*([-+0-9.eE]+)", re.IGNORECASE)
NODE_VOLTAGE_PATTERN = re.compile(r"v\(c(\d+)\)\s*=\s*([-+0-9.eE]+)", re.IGNORECASE)
NCS_VOLTAGE_PATTERN = re.compile(r"v\(ncs(\d+)\)\s*=\s*([-+0-9.eE]+)", re.IGNORECASE)
VERSION_PATTERN = re.compile(r"ngspice-(\d+(?:\.\d+)*)", re.IGNORECASE)


class NgSpiceError(RuntimeError):
    pass


@dataclass(frozen=True)
class NgSpiceBackend:
    executable: Path

    @classmethod
    def discover(cls) -> "NgSpiceBackend | None":
        candidates = [
            os.environ.get("NGSPICE_EXECUTABLE"),
            str(PROJECT_NGSPICE),
            shutil.which("ngspice_con"),
            shutil.which("ngspice"),
        ]
        for candidate in candidates:
            if candidate and Path(candidate).is_file():
                return cls(Path(candidate).resolve())
        return None

    def version(self) -> str:
        return _ngspice_version(str(self.executable))

    def _read_version(self) -> str:
        result = subprocess.run(
            [str(self.executable), "--version"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        output = f"{result.stdout}\n{result.stderr}"
        match = VERSION_PATTERN.search(output)
        if not match:
            raise NgSpiceError(f"Unable to read ngspice version from {self.executable}")
        return match.group(1)

    def simulate_voltage_divider(self, vcc: float, fsr_ohms: float, load_ohms: float) -> dict[str, float | str]:
        if vcc <= 0:
            raise ValueError("vcc must be positive")
        if fsr_ohms <= 0 or load_ohms <= 0:
            raise ValueError("resistance values must be positive")

        deck = f"""* e-skin FSR voltage-divider smoke test
Vexcitation vin 0 {vcc}
Rfsr vin vout {fsr_ohms}
Rload vout 0 {load_ohms}
.op
.control
run
print v(vout)
quit
.endc
.end
"""
        output = self._run_deck(deck)
        match = VOLTAGE_PATTERN.search(output)
        if not match:
            raise NgSpiceError(f"Unable to parse divider voltage from ngspice output:\n{output}")

        voltage = float(match.group(1))
        expected = vcc * load_ohms / (fsr_ohms + load_ohms)
        return {
            "engine": "ngspice",
            "version": self.version(),
            "executable": str(self.executable),
            "vcc": vcc,
            "fsrOhms": fsr_ohms,
            "loadOhms": load_ohms,
            "outputVoltage": voltage,
            "expectedVoltage": expected,
            "absoluteError": abs(voltage - expected),
        }

    def simulate_fsr_row(
        self,
        row_voltage: float,
        fsr_ohms: list[float],
        load_ohms: float,
        mux_on_ohms: float = 70.0,
    ) -> dict[str, object]:
        if load_ohms <= 0:
            raise ValueError("load_ohms must be positive")
        if mux_on_ohms < 0:
            raise ValueError("mux_on_ohms must be non-negative")
        if not fsr_ohms:
            raise ValueError("fsr_ohms must not be empty")
        if any(value <= 0 for value in fsr_ohms):
            raise ValueError("all FSR resistance values must be positive")
        if row_voltage <= 0:
            return {
                "engine": "ngspice",
                "version": self.version(),
                "executable": str(self.executable),
                "rowVoltage": row_voltage,
                "loadOhms": load_ohms,
                "muxOnOhms": mux_on_ohms,
                "nodeVoltages": [0.0 for _ in fsr_ohms],
            }

        rounded_fsr = tuple(round(float(value), 6) for value in fsr_ohms)
        node_voltages = _simulate_fsr_row_cached(
            executable=str(self.executable),
            row_voltage=round(float(row_voltage), 9),
            fsr_ohms=rounded_fsr,
            load_ohms=round(float(load_ohms), 6),
            mux_on_ohms=round(float(mux_on_ohms), 6),
        )
        return {
            "engine": "ngspice",
            "version": self.version(),
            "executable": str(self.executable),
            "rowVoltage": row_voltage,
            "loadOhms": load_ohms,
            "muxOnOhms": mux_on_ohms,
            "nodeVoltages": list(node_voltages),
        }

    def simulate_accel_cs_mux(
        self,
        selected_sensor: int,
        sensor_count: int = 16,
        vcc: float = 3.3,
        pullup_ohms: float = 10_000.0,
        decoder_sink_ohms: float = 70.0,
        input_leak_ohms: float = 1_000_000_000.0,
    ) -> dict[str, object]:
        if sensor_count <= 0:
            raise ValueError("sensor_count must be positive")
        if not 1 <= selected_sensor <= sensor_count:
            raise ValueError("selected_sensor must be within sensor_count")
        if vcc <= 0:
            raise ValueError("vcc must be positive")
        if pullup_ohms <= 0 or decoder_sink_ohms <= 0 or input_leak_ohms <= 0:
            raise ValueError("resistance values must be positive")

        node_voltages = _simulate_accel_cs_mux_cached(
            executable=str(self.executable),
            selected_sensor=int(selected_sensor),
            sensor_count=int(sensor_count),
            vcc=round(float(vcc), 9),
            pullup_ohms=round(float(pullup_ohms), 6),
            decoder_sink_ohms=round(float(decoder_sink_ohms), 6),
            input_leak_ohms=round(float(input_leak_ohms), 6),
        )
        return {
            "engine": "ngspice",
            "version": self.version(),
            "executable": str(self.executable),
            "selectedSensor": selected_sensor,
            "sensorCount": sensor_count,
            "vcc": vcc,
            "pullupOhms": pullup_ohms,
            "decoderSinkOhms": decoder_sink_ohms,
            "inputLeakOhms": input_leak_ohms,
            "ncsVoltages": list(node_voltages),
        }

    def health(self) -> dict[str, object]:
        divider = self.simulate_voltage_divider(vcc=3.3, fsr_ohms=10_000.0, load_ohms=10_000.0)
        accel_cs = self.simulate_accel_cs_mux(selected_sensor=3, sensor_count=4)
        return {
            "available": True,
            "engine": "ngspice",
            "version": divider["version"],
            "executable": divider["executable"],
            "smokeTest": {
                "circuit": "10 kOhm FSR + 10 kOhm load divider",
                "outputVoltage": divider["outputVoltage"],
                "expectedVoltage": divider["expectedVoltage"],
                "absoluteError": divider["absoluteError"],
                "passed": float(divider["absoluteError"]) < 1e-9,
            },
            "accelerometerCsSmokeTest": {
                "circuit": "4 active-low LIS3DH nCS lines with pull-ups and one decoder sink",
                "selectedSensor": accel_cs["selectedSensor"],
                "ncsVoltages": accel_cs["ncsVoltages"],
                "selectedLineLow": float(accel_cs["ncsVoltages"][2]) < 0.8,
                "unselectedLinesHigh": all(float(value) > 2.0 for index, value in enumerate(accel_cs["ncsVoltages"]) if index != 2),
            },
        }

    def _run_deck(self, deck: str) -> str:
        with tempfile.TemporaryDirectory(prefix="eskin-ngspice-") as temp_dir:
            deck_path = Path(temp_dir) / "circuit.cir"
            deck_path.write_text(deck, encoding="ascii")
            result = subprocess.run(
                [str(self.executable), "-b", str(deck_path)],
                capture_output=True,
                text=True,
                timeout=20,
                check=False,
            )
        output = f"{result.stdout}\n{result.stderr}"
        if result.returncode != 0:
            raise NgSpiceError(f"ngspice exited with code {result.returncode}:\n{output}")
        return output


def ngspice_health() -> dict[str, object]:
    backend = NgSpiceBackend.discover()
    if backend is None:
        return {
            "available": False,
            "engine": "ngspice",
            "error": "ngspice runtime not found. Place ngspice_con.exe under tools/ngspice/Spice64/bin/ or set NGSPICE_EXECUTABLE.",
        }
    try:
        return backend.health()
    except (NgSpiceError, OSError, subprocess.SubprocessError) as exc:
        return {
            "available": False,
            "engine": "ngspice",
            "executable": str(backend.executable),
            "error": str(exc),
        }


@lru_cache(maxsize=512)
def _simulate_fsr_row_cached(
    executable: str,
    row_voltage: float,
    fsr_ohms: tuple[float, ...],
    load_ohms: float,
    mux_on_ohms: float,
) -> tuple[float, ...]:
    deck_lines = [
        "* e-skin selected-row FSR network",
        f"Vrow vin 0 {row_voltage}",
        f"Rmux vin rowline {max(mux_on_ohms, 1e-6)}",
    ]
    for index, resistance in enumerate(fsr_ohms, start=1):
        deck_lines.extend(
            [
                f"Rfsr{index} rowline c{index} {resistance}",
                f"Rload{index} c{index} 0 {load_ohms}",
            ]
        )
    deck_lines.extend(
        [
            ".op",
            ".control",
            "run",
            "print " + " ".join(f"v(c{index})" for index in range(1, len(fsr_ohms) + 1)),
            "quit",
            ".endc",
            ".end",
        ]
    )
    backend = NgSpiceBackend(Path(executable))
    output = backend._run_deck("\n".join(deck_lines) + "\n")
    values: dict[int, float] = {}
    for match in NODE_VOLTAGE_PATTERN.finditer(output):
        values[int(match.group(1))] = float(match.group(2))
    if len(values) != len(fsr_ohms):
        raise NgSpiceError(f"Unable to parse all FSR row node voltages from ngspice output:\n{output}")
    return tuple(values[index] for index in range(1, len(fsr_ohms) + 1))


@lru_cache(maxsize=128)
def _simulate_accel_cs_mux_cached(
    executable: str,
    selected_sensor: int,
    sensor_count: int,
    vcc: float,
    pullup_ohms: float,
    decoder_sink_ohms: float,
    input_leak_ohms: float,
) -> tuple[float, ...]:
    deck_lines = [
        "* e-skin LIS3DH active-low chip-select decoder network",
        f"Vvcc vcc 0 {vcc}",
    ]
    for index in range(1, sensor_count + 1):
        deck_lines.extend(
            [
                f"Rpull{index} vcc ncs{index} {pullup_ohms}",
                f"Rleak{index} ncs{index} 0 {input_leak_ohms}",
            ]
        )
    deck_lines.append(f"Rdecode{selected_sensor} ncs{selected_sensor} 0 {decoder_sink_ohms}")
    deck_lines.extend(
        [
            ".op",
            ".control",
            "run",
            "print " + " ".join(f"v(ncs{index})" for index in range(1, sensor_count + 1)),
            "quit",
            ".endc",
            ".end",
        ]
    )
    backend = NgSpiceBackend(Path(executable))
    output = backend._run_deck("\n".join(deck_lines) + "\n")
    values: dict[int, float] = {}
    for match in NCS_VOLTAGE_PATTERN.finditer(output):
        values[int(match.group(1))] = float(match.group(2))
    if len(values) != sensor_count:
        raise NgSpiceError(f"Unable to parse all accelerometer nCS voltages from ngspice output:\n{output}")
    return tuple(values[index] for index in range(1, sensor_count + 1))


@lru_cache(maxsize=8)
def _ngspice_version(executable: str) -> str:
    return NgSpiceBackend(Path(executable))._read_version()
