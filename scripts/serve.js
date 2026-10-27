import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env.PORT || 4285);
const host = process.env.HOST || "127.0.0.1";
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".png": "image/png",
  ".webp": "image/webp",
  ".md": "text/plain",
};
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const path = decodeURIComponent(
      url.pathname === "/" ? "/index.html" : url.pathname,
    );
    const allowed =
      /^\/(index\.html|styles\.css|THIRD_PARTY_NOTICES\.md|(?:src|assets)\/[\w./-]+)$/.test(
        path,
      );
    const file = resolve(root, `.${path}`);
    const hasHiddenSegment = path
      .split("/")
      .some((segment) => segment.startsWith("."));
    if (
      !allowed ||
      hasHiddenSegment ||
      !file.startsWith(resolve(root) + sep) ||
      !["GET", "HEAD"].includes(req.method)
    ) {
      res.writeHead(404);
      res.end();
      return;
    }
    const bytes = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(req.method === "HEAD" ? undefined : bytes);
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(port, host, () =>
  console.log(`Queen's Garden: http://${host}:${port}`),
);
