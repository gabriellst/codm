// Criterion 2 (embed variant) — PGlite with assets embedded for `bun build --compile`
import { PGlite } from "@electric-sql/pglite"
// Bun embeds these files into the single binary; the imports resolve to /$bunfs paths at runtime
import pgliteWasmPath from "./node_modules/@electric-sql/pglite/dist/pglite.wasm" with { type: "file" }
import pgliteDataPath from "./node_modules/@electric-sql/pglite/dist/pglite.data" with { type: "file" }
import initdbWasmPath from "./node_modules/@electric-sql/pglite/dist/initdb.wasm" with { type: "file" }

const dataDir = process.argv[2]
if (!dataDir) {
  console.error("usage: main <data-dir>")
  process.exit(2)
}

const [pgliteWasmModule, initdbWasmModule, fsBundleBuf] = await Promise.all([
  WebAssembly.compile(await Bun.file(pgliteWasmPath).arrayBuffer()),
  WebAssembly.compile(await Bun.file(initdbWasmPath).arrayBuffer()),
  Bun.file(pgliteDataPath).arrayBuffer(),
])

const db = new PGlite(dataDir, {
  pgliteWasmModule,
  initdbWasmModule,
  fsBundle: new Blob([fsBundleBuf]),
})
await db.query(`CREATE TABLE IF NOT EXISTS spikes (id serial primary key, name text not null, at timestamptz default now())`)
await db.query(`INSERT INTO spikes (name) VALUES ($1)`, [`run-${Date.now()}`])
const res = await db.query<{ id: number; name: string }>(`SELECT id, name FROM spikes ORDER BY id`)
console.log("rows:", res.rows.length)
for (const r of res.rows) console.log(` - ${r.id}: ${r.name}`)
await db.close()
console.log("PGLITE_OK cwd=" + process.cwd() + " execPath=" + process.execPath)
