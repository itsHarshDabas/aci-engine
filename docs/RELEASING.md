# Installing and releasing ACI

## Install (once published)

| Tool | Command | Notes |
|---|---|---|
| npm | `npx aci-engine` | Needs Node 18+. `npm i -g aci-engine` gives you the `aci` command. |
| pip | `pip install aci-engine` then `aci-engine` (or `aci`) | Brings its own Node.js, so no Node install is needed. |
| uv | `uvx aci-engine` | Same as pip, with nothing left installed. |

The npm name `aci` is taken, so the package is `aci-engine`. It installs three
commands: `aci-engine`, `aci` and `aci-mcp`. The Python package is a thin
launcher: it bundles the same files npm publishes and runs `bin/aci.mjs` with
your system Node (18+) or, if there is none, the Node from
`nodejs-wheel-binaries`. Set `ACI_NODE=/path/to/node` to force one.

## One-time setup

1. **npm:** on npmjs.com create a granular access token with publish rights,
   and add it to the GitHub repo as the secret `NPM_TOKEN`
   (Settings > Secrets and variables > Actions).
2. **PyPI:** on pypi.org go to Your projects > Publishing > Add a pending
   publisher: project `aci-engine`, owner `itsHarshDabas`, repo `aci-engine`,
   workflow `release.yml`, environment `pypi`. No token is needed.
3. In the GitHub repo, create the environment `pypi`
   (Settings > Environments > New environment).

## Each release

1. Bump `"version"` in `package.json` (the Python version follows it).
2. Merge to `main`.
3. `git tag v0.3.0 && git push origin v0.3.0` (use the new version).

`.github/workflows/release.yml` checks that the tag matches package.json, runs
the tests, publishes to npm and PyPI, and creates a GitHub release.

## Build locally

```sh
npm pack                      # npm tarball
python3 python/bundle.py      # copy the engine into the Python package
(cd python && uv build)       # wheel + sdist in python/dist/
```
