import http from 'node:http';
import { URL } from 'node:url';

const listenPort = Number(process.env.OFFICE_POOL_GATEWAY_PORT ?? process.env.PORT ?? 3031);
const backendTarget = process.env.OFFICE_POOL_GATEWAY_BACKEND ?? 'http://localhost:3032';
const sandboxTarget = process.env.OFFICE_POOL_GATEWAY_SANDBOX ?? 'http://localhost:4199';

if (!Number.isInteger(listenPort) || listenPort <= 0) {
  throw new Error(`Invalid Office Pool gateway port: ${listenPort}`);
}

function targetFor(pathname) {
  if (pathname === '/health/office-pool-gateway') {
    return null;
  }
  if (pathname === '/office-pools' || pathname.startsWith('/office-pools/')) {
    return sandboxTarget;
  }
  return backendTarget;
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization,x-api-key,ngrok-skip-browser-warning',
  });
  res.end(payload);
}

function proxy(req, res, targetBase) {
  const incomingUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const targetUrl = new URL(incomingUrl.pathname + incomingUrl.search, targetBase);

  const headers = { ...req.headers };
  headers.host = targetUrl.host;

  const upstream = http.request(
    targetUrl,
    {
      method: req.method,
      headers,
    },
    (upstreamRes) => {
      const responseHeaders = { ...upstreamRes.headers };
      responseHeaders['access-control-allow-origin'] = '*';
      responseHeaders['access-control-allow-methods'] = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
      responseHeaders['access-control-allow-headers'] =
        'content-type,authorization,x-api-key,ngrok-skip-browser-warning';

      res.writeHead(upstreamRes.statusCode ?? 502, responseHeaders);
      upstreamRes.pipe(res);
    },
  );

  upstream.on('error', (error) => {
    sendJson(res, 502, {
      statusCode: 502,
      message: `Office Pool gateway upstream error for ${targetBase}: ${error.message}`,
      error: 'Bad Gateway',
    });
  });

  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  const incomingUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (req.method === 'OPTIONS') {
    return sendJson(res, 204, {});
  }

  if (incomingUrl.pathname === '/health/office-pool-gateway') {
    return sendJson(res, 200, {
      ok: true,
      service: 'office-pool-api-gateway',
      routes: {
        officePools: sandboxTarget,
        default: backendTarget,
      },
    });
  }

  const target = targetFor(incomingUrl.pathname);
  if (!target) {
    return sendJson(res, 404, {
      statusCode: 404,
      message: 'No gateway route',
      error: 'Not Found',
    });
  }

  return proxy(req, res, target);
});

server.listen(listenPort, () => {
  console.log(`Office Pool API gateway listening on http://localhost:${listenPort}`);
  console.log(`  /office-pools* -> ${sandboxTarget}`);
  console.log(`  everything else -> ${backendTarget}`);
});
