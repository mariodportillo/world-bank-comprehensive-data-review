import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = fileURLToPath(new URL('../web/', import.meta.url));
const types = {'.html': 'text/html', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml'};
const port = Number(process.env.PORT || 4173);
createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const target = resolve(root, '.' + (path === '/' ? '/index.html' : path));
    if (!target.startsWith(root.endsWith(sep) ? root : root + sep)) {
      res.writeHead(403).end('Forbidden'); return;
    }
    const data = await readFile(target);
    res.writeHead(200, {'Content-Type': `${types[extname(target)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store'});
    res.end(data);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`World Bank Comprehensive Data Review: http://127.0.0.1:${port}`));
