import fs from "node:fs";
import http from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? "0.0.0.0";
const clientDistPath = path.join(__dirname, "dist/client");

const serverEntryPath = path.join(__dirname, "dist/server/server.js");
console.log("Starting runtime server");
console.log(`Loading SSR entry from: ${serverEntryPath}`);

const serverEntryPromise = import(pathToFileURL(serverEntryPath).href)
  .then((module) => module.default ?? module)
  .catch((error) => {
    console.error("Failed to import SSR entry:", error);
    process.exit(1);
  });

const mimeTypes = {
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".eot": "application/vnd.ms-fontobject",
  ".ttf": "font/ttf",
};

function getContentType(filePath) {
  return mimeTypes[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

async function serveStaticFile(url, res) {
  const { pathname } = new URL(url, "http://localhost");
  if (
    !pathname.startsWith("/assets/") &&
    pathname !== "/favicon.ico" &&
    pathname !== "/favicon.svg"
  ) {
    return false;
  }

  const relativePath = pathname.replace(/^[\/]/, "");
  const filePath = path.join(clientDistPath, relativePath);
  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(clientDistPath)) {
    return false;
  }

  try {
    const stat = await fs.promises.stat(normalized);
    if (!stat.isFile()) return false;
    const data = await fs.promises.readFile(normalized);
    res.writeHead(200, {
      "content-type": getContentType(normalized),
      "content-length": data.length,
    });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = req.url ?? "/";
    const handled = await serveStaticFile(reqUrl, res);
    if (handled) return;

    const app = await serverEntryPromise;
    const url = new URL(reqUrl, `http://${req.headers.host ?? "localhost"}`);
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: req.method === "GET" || req.method === "HEAD" ? null : req,
    });

    const response = await app.fetch(request, {}, {});
    const headers = Object.fromEntries(response.headers.entries());
    res.writeHead(response.status, headers);

    if (response.body) {
      const buffer = Buffer.from(await response.arrayBuffer());
      res.end(buffer);
    } else {
      res.end();
    }
  } catch (error) {
    console.error("Request error:", error);
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("Internal Server Error");
  }
});

server.on("error", (error) => {
  console.error("Server error:", error);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error("uncaughtException:", error);
});
process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection:", reason);
});
process.on("exit", (code) => {
  console.log(`Process exiting with code ${code}`);
});

server.listen(port, host, () => {
  console.log(`Server listening on ${host}:${port}`);
  console.log(
    `Environment: PORT=${process.env.PORT ?? 8080}, HOST=${host}, NODE_ENV=${process.env.NODE_ENV ?? "undefined"}`,
  );
});
