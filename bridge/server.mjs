#!/usr/bin/env node
// Kept for older instructions: the bridge now lives in the main server. Same as `aci start --no-open`.
import { start } from '../server/index.mjs';
start({}).then(s => console.log(`ACI server on ${s.url}  (projects: ${s.workspace})`)).catch(e => { console.error(e.message); process.exit(1); });
