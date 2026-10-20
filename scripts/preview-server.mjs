import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, sep, extname, join} from 'node:path';
import {homedir} from 'node:os';
import {devRuntime} from './dev-runtime.mjs';

export async function servePreview(port = 3086) {
  const {root} = await devRuntime();
  const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.ttf': 'font/ttf'};
  let skinCss = '';
  try {
    const path = process.env.DSH_EF_SKIN_CLIENT ?? join(homedir(), '.dsh/profiles/web/node_modules/@smalltailqwq/dsh-client-ui-skin-maid-atelier/lib/client.js');
    const source = await readFile(path, 'utf8');
    const literal = source.match(/const css = ("(?:[^"\\]|\\.)*");/);
    if (literal) skinCss = JSON.parse(literal[1]);
  } catch {}
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (url.pathname === '/existing-skin.css') { response.writeHead(200, {'Content-Type': types['.css']}).end(skinCss);return; }
      const pathname = url.pathname === '/' ? '/preview/index.html' : url.pathname;
      if (!['/preview/', '/lib/', '/assets/'].some(prefix => pathname.startsWith(prefix))) { response.writeHead(404).end();return; }
      const path = resolve(root, '.' + decodeURIComponent(pathname));
      if (!path.startsWith(resolve(root) + sep)) { response.writeHead(403).end();return; }
      const data = await readFile(path);
      response.writeHead(200, {'Content-Type': types[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}).end(data);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  return server;
}
if (process.argv[1] && import.meta.url === new URL('file:///' + process.argv[1].replaceAll('\\', '/')).href) {
  const port = Number(process.env.PORT ?? 3086);
  await servePreview(port);
  console.log(`Preview: http://127.0.0.1:${port}/ (demonstration catalog; no model calls)`);
}
