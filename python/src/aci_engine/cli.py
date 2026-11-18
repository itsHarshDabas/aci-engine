"""Launch the ACI editor (a Node.js app bundled inside this package).

`aci-engine` / `uvx aci-engine` / `python -m aci_engine` behave exactly like
`npx aci-engine`: start the local server and open the editor in the browser.
All arguments are passed through (try `aci-engine --help`).
"""
import os
import pathlib
import re
import shutil
import subprocess
import sys

APP = pathlib.Path(__file__).resolve().parent / "app"
MIN_NODE = 18


def _node_version(exe):
    try:
        out = subprocess.run([exe, "--version"], capture_output=True, text=True, timeout=10).stdout
    except (OSError, subprocess.SubprocessError):
        return 0
    m = re.match(r"v(\d+)", out.strip())
    return int(m.group(1)) if m else 0


def find_node():
    """System Node >= 18 if present (set ACI_NODE to force one), else the bundled wheel."""
    forced = os.environ.get("ACI_NODE")
    if forced:
        return forced
    system = shutil.which("node")
    if system and _node_version(system) >= MIN_NODE:
        return system
    try:
        import nodejs_wheel  # from nodejs-wheel-binaries
    except ImportError:
        nodejs_wheel = None
    if nodejs_wheel is not None:
        root = pathlib.Path(nodejs_wheel.__file__).resolve().parent
        exe = root / ("node.exe" if os.name == "nt" else "bin/node")
        if exe.exists():
            return str(exe)
    sys.stderr.write(
        "aci-engine needs Node.js %d or newer. Install it from https://nodejs.org "
        "or reinstall with: pip install --force-reinstall aci-engine\n" % MIN_NODE
    )
    raise SystemExit(1)


def _run(script, args):
    entry = APP / script
    if not entry.exists():
        sys.stderr.write("aci-engine: bundled app is missing (%s). This build is broken; please report it.\n" % entry)
        return 1
    try:
        return subprocess.call([find_node(), str(entry), *args])
    except KeyboardInterrupt:
        return 130


def main(argv=None):
    return _run("bin/aci.mjs", sys.argv[1:] if argv is None else argv)


def mcp(argv=None):
    return _run("bridge/mcp.mjs", sys.argv[1:] if argv is None else argv)


if __name__ == "__main__":
    raise SystemExit(main())
