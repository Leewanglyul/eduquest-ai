// M2-2.4a IME lab server. Throwaway: serves this folder over HTTP on the local network and stores
// posted traces in ./traces. No dependencies. Usage: node scripts/ime-lab/serve.mjs [port]
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] || 4177);
const files = { "/": ["index.html", "text/html; charset=utf-8"], "/index.html": ["index.html", "text/html; charset=utf-8"], "/lab.js": ["lab.js", "text/javascript; charset=utf-8"] };

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    if (req.method === "GET" && files[url.pathname]) {
      const [name, type] = files[url.pathname];
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
      res.end(await readFile(join(here, name)));
      return;
    }
    if (req.method === "POST" && url.pathname === "/trace") {
      const chunks = [];
      let size = 0;
      for await (const c of req) {
        size += c.length;
        if (size > 5_000_000) throw new Error("too large");
        chunks.push(c);
      }
      const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const slug = String(data.device || "unknown").replace(/[^\w가-힣]+/g, "_").slice(0, 60);
      const file = `${new Date().toISOString().replace(/[:.]/g, "-")}_${slug}.json`;
      await mkdir(join(here, "traces"), { recursive: true });
      await writeFile(join(here, "traces", file), JSON.stringify(data, null, 1));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ file }));
      console.log("saved", file);
      return;
    }
    res.writeHead(404).end("not found");
  } catch (err) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: String(err.message || err) }));
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`IME lab on port ${port}. Open on the device (same Wi-Fi):`);
  for (const list of Object.values(networkInterfaces()))
    for (const n of list || []) if (n.family === "IPv4" && !n.internal) console.log(`  http://${n.address}:${port}/`);
  console.log(`  http://localhost:${port}/ (this computer)`);
});
