// Slim static + map server. Zero runtime dependencies (node:http only).
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC_DIR = join(ROOT, 'public');
const DATA_DIR = join(ROOT, '..', 'data');
const PORT = Number(process.env.PORT) || 5199;
// Loopback locally; a platform that health-checks the port (Render, Fly, a
// container) sets HOST=0.0.0.0 so the bind is reachable from outside the box.
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  // Served with the right type or the browser declines to install the app.
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  // Menu music, dropped into public/music by whoever is running the game.
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
};

// What this running process actually is. Render injects these at runtime, so
// GET /api/version is the deployed artifact answering for itself -- the only
// honest way to tell a finished deploy from a warm old instance still serving.
// Null everywhere else, which is the correct answer off Render.
const VERSION = {
  commit: process.env.RENDER_GIT_COMMIT ?? null,
  branch: process.env.RENDER_GIT_BRANCH ?? null,
  service: process.env.RENDER_SERVICE_NAME ?? null,
  startedAt: new Date().toISOString(),
};

const send = (res, status, body, type) => {
  res.writeHead(status, {
    'Content-Type': type ?? 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
};

// Reject anything that escapes the intended directory.
const safeJoin = (dir, name) => {
  const target = normalize(join(dir, name));
  return target.startsWith(normalize(dir)) ? target : null;
};


/**
 * Reads a map's header block and measures its grid, without parsing the whole
 * thing -- enough for the level select to describe a mission.
 */
function summarise(src) {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const header = {};
  let i = 0;
  for (; i < lines.length; i++) {
    if (lines[i].trim() === '---') { i++; break; }
    const m = /^\s*([a-z_]+)\s*:\s*(.*)$/i.exec(lines[i]);
    if (m) header[m[1].toLowerCase()] = m[2].trim();
  }
  const rows = lines.slice(i).filter((l) => l.length > 0);
  return {
    name: header.name ?? 'Unnamed',
    // Dev-only maps: the test range is served like any other file, and the
    // menu is what hides it. The server stays a dumb file server.
    dev: header.dev === 'true',
    theme: header.theme ?? 'jungle',
    objective: header.objective ?? 'eliminate',
    doctrine: header.doctrine ?? 'garrison',
    // Modifiers, so the level select can state the rule before the player
    // commits to a mission. `covert` carries its own wording and is left as it
    // is; anything else wearing `nokill` would otherwise advertise only half of
    // what it is asking for.
    nokill: header.nokill === 'true' || header.objective === 'covert',
    timeLimit: Math.max(0, Number(header.timelimit) || 0),
    brief: header.brief ?? '',
    mechanic: header.mechanic ?? '',
    order: Number(header.order) || 999,
    width: rows.reduce((w, r) => Math.max(w, r.length), 0),
    height: rows.length,
  };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const path = decodeURIComponent(url.pathname);

  try {
    // GET /api/version -> which commit this instance is running. Cheap, and the
    // health check target, so a deploy that boots but cannot serve fails loudly.
    if (path === '/api/version') {
      return send(res, 200, JSON.stringify(VERSION), MIME['.json']);
    }

    // GET /api/maps -> mission metadata for the level select, ordered by the
    // `order:` header so campaign sequence lives in the map files themselves.
    if (path === '/api/maps') {
      const files = (await readdir(DATA_DIR)).filter((f) => f.endsWith('.map'));
      const maps = [];
      for (const file of files) {
        const src = await readFile(join(DATA_DIR, file), 'utf8');
        maps.push({ id: file.slice(0, -4), ...summarise(src) });
      }
      maps.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
      return send(res, 200, JSON.stringify(maps), MIME['.json']);
    }

    // GET /api/maps/:name -> raw ASCII map from ../data
    if (path.startsWith('/api/maps/')) {
      const name = path.slice('/api/maps/'.length);
      const file = safeJoin(DATA_DIR, `${name}.map`);
      if (!file) return send(res, 400, 'Bad map name');
      return send(res, 200, await readFile(file), MIME['.map']);
    }

    const rel = path === '/' ? 'index.html' : path.slice(1);
    const file = safeJoin(PUBLIC_DIR, rel);
    if (!file) return send(res, 400, 'Bad path');
    return send(res, 200, await readFile(file), MIME[extname(file)] ?? 'application/octet-stream');
  } catch (err) {
    if (err.code === 'ENOENT') return send(res, 404, 'Not found');
    console.error(err);
    return send(res, 500, 'Server error');
  }
});

// Bind IPv4 explicitly. Binding the wildcard silently succeeds on IPv6 only
// when something already holds the IPv4 port, which splits requests between two
// servers -- far easier to debug as an outright failure.
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use. Try: PORT=5200 npm run dev\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Boots & Bullets  ->  http://localhost:${PORT}\n`);
});
