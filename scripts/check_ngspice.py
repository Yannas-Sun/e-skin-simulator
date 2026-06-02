from __future__ import annotations

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.ngspice_backend import ngspice_health


def main() -> None:
    health = ngspice_health()
    print(json.dumps(health, indent=2))
    if not health.get("available"):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
