"""Copy the JS engine (the files npm publishes) into src/aci_engine/app/ and
sync the Python version with package.json. Run before `uv build`/`python -m build`.

    python python/bundle.py
"""
import json
import pathlib
import re
import shutil

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent
APP = HERE / "src" / "aci_engine" / "app"

pkg = json.loads((REPO / "package.json").read_text(encoding="utf-8"))

if APP.exists():
    shutil.rmtree(APP)
APP.mkdir(parents=True)
for entry in pkg["files"] + ["package.json"]:
    src = REPO / entry.rstrip("/")
    if src.is_dir():
        shutil.copytree(src, APP / src.name, ignore=shutil.ignore_patterns("node_modules", ".DS_Store"))
    elif src.is_file():
        shutil.copy2(src, APP / src.name)
    else:
        raise SystemExit(f"bundle.py: {entry} listed in package.json files but missing")

shutil.copy2(REPO / "LICENSE", HERE / "LICENSE")
shutil.copy2(REPO / "README.md", HERE / "README.md")

init = HERE / "src" / "aci_engine" / "__init__.py"
text = init.read_text(encoding="utf-8")
init.write_text(re.sub(r'__version__ = "[^"]*"', f'__version__ = "{pkg["version"]}"', text), encoding="utf-8")
print(f"bundled aci-engine {pkg['version']} into {APP.relative_to(REPO)}")
