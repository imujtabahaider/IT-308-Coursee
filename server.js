'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = __dirname;
const SESSION_COOKIE = 'it308_session';
const SESSION_DURATION_SECONDS = 8 * 60 * 60;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 10;
const MAX_REQUEST_BODY_BYTES = 4096;
const PORT = Number(process.env.PORT || 3000);
const SITE_PASSWORD = process.env.SITE_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const loginAttempts = new Map();

if (Array.from(SITE_PASSWORD).length < 12) {
  console.error('Set SITE_PASSWORD to a password with at least 12 characters.');
  process.exit(1);
}

if (Buffer.byteLength(SESSION_SECRET) < 32) {
  console.error('Set SESSION_SECRET to a random value of at least 32 bytes.');
  process.exit(1);
}

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error('PORT must be a valid TCP port number.');
  process.exit(1);
}

const passwordDigest = crypto.createHash('sha256').update(SITE_PASSWORD).digest();

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.java': 'text/plain; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8',
};

function setSecurityHeaders(response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "object-src 'none'",
  ].join('; '));
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
}

function send(response, statusCode, contentType, body) {
  response.writeHead(statusCode, { 'Content-Type': contentType });
  response.end(body);
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
}

function loginPage(message = '') {
  const alert = message ? `<p class="error" role="alert">${message}</p>` : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sign in | IT-308</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #15243b; background: #f2f6f8; }
    body { min-height: 100vh; display: grid; place-items: center; margin: 0; padding: 1rem; }
    main { width: min(100%, 24rem); padding: 2rem; background: white; border: 1px solid #dbe4e9; border-radius: 1rem; box-shadow: 0 8px 26px #15243b12; }
    h1 { margin-top: 0; font-size: 1.6rem; }
    p { line-height: 1.5; }
    label { display: block; margin: 1.2rem 0 .4rem; font-weight: 600; }
    input { width: 100%; padding: .7rem; border: 1px solid #aebdc8; border-radius: .5rem; font: inherit; }
    button { margin-top: 1rem; padding: .7rem 1rem; border: 0; border-radius: .5rem; background: #147d70; color: white; font: inherit; font-weight: 700; cursor: pointer; }
    .error { color: #a32020; }
  </style>
</head>
<body>
  <main>
    <h1>IT-308 Website</h1>
    <p>Enter the site password to continue.</p>
    ${alert}
    <form method="post" action="/login">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
      <button type="submit">Continue</button>
    </form>
  </main>
</body>
</html>`;
}

function createSessionToken() {
  const payload = Buffer.from(JSON.stringify({
    expiresAt: Date.now() + SESSION_DURATION_SECONDS * 1000,
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');

  return `${payload}.${signature}`;
}

function hasValidSession(request) {
  const cookiePrefix = `${SESSION_COOKIE}=`;
  const cookie = (request.headers.cookie || '')
    .split(';')
    .map(value => value.trim())
    .find(value => value.startsWith(cookiePrefix));

  if (!cookie) return false;

  const token = cookie.slice(cookiePrefix.length);
  const separator = token.lastIndexOf('.');
  if (separator < 1) return false;

  const payload = token.slice(0, separator);
  const signature = Buffer.from(token.slice(separator + 1), 'base64url');
  const expectedSignature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest();

  if (signature.length !== expectedSignature.length
      || !crypto.timingSafeEqual(signature, expectedSignature)) {
    return false;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number.isSafeInteger(session.expiresAt) && session.expiresAt > Date.now();
  } catch {
    return false;
  }
}

function sessionCookie(token, maxAge) {
  const attributes = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
  ];

  if (process.env.NODE_ENV === 'production') attributes.push('Secure');
  return attributes.join('; ');
}

function getClientAddress(request) {
  return request.socket.remoteAddress || 'unknown';
}

function isRateLimited(address) {
  const attempts = loginAttempts.get(address);
  return Boolean(attempts && attempts.resetAt > Date.now() && attempts.count >= MAX_LOGIN_ATTEMPTS);
}

function recordFailedLogin(address) {
  const now = Date.now();
  for (const [key, attempts] of loginAttempts) {
    if (attempts.resetAt <= now) loginAttempts.delete(key);
  }

  const attempts = loginAttempts.get(address);

  if (!attempts || attempts.resetAt <= now) {
    loginAttempts.set(address, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }

  attempts.count += 1;
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;

    request.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_REQUEST_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
      } else if (!tooLarge) {
        chunks.push(chunk);
      }
    });

    request.on('end', () => {
      if (tooLarge) {
        const error = new Error('Request body is too large.');
        error.code = 'BODY_TOO_LARGE';
        reject(error);
      } else {
        resolve(Buffer.concat(chunks).toString('utf8'));
      }
    });

    request.on('error', reject);
  });
}

async function handleLogin(request, response) {
  const address = getClientAddress(request);

  if (isRateLimited(address)) {
    const attempts = loginAttempts.get(address);
    response.setHeader('Retry-After', Math.ceil((attempts.resetAt - Date.now()) / 1000));
    send(response, 429, 'text/html; charset=utf-8', loginPage('Too many attempts. Try again in 15 minutes.'));
    return;
  }

  const contentType = (request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/x-www-form-urlencoded') {
    send(response, 415, 'text/plain; charset=utf-8', 'Unsupported content type.');
    return;
  }

  let body;
  try {
    body = await readRequestBody(request);
  } catch (error) {
    if (error.code === 'BODY_TOO_LARGE') {
      send(response, 413, 'text/plain; charset=utf-8', 'Request body is too large.');
      return;
    }
    throw error;
  }

  const candidate = new URLSearchParams(body).get('password') || '';
  const candidateDigest = crypto.createHash('sha256').update(candidate).digest();

  if (!crypto.timingSafeEqual(candidateDigest, passwordDigest)) {
    recordFailedLogin(address);
    send(response, 401, 'text/html; charset=utf-8', loginPage('Incorrect password. Please try again.'));
    return;
  }

  loginAttempts.delete(address);
  response.setHeader('Set-Cookie', sessionCookie(createSessionToken(), SESSION_DURATION_SECONDS));
  redirect(response, '/');
}

function staticFilePath(pathname) {
  const decodedPath = decodeURIComponent(pathname);
  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');

  if (relativePath.split(/[\\/]/).some(part => part.startsWith('.'))) return null;

  const resolvedPath = path.resolve(ROOT, relativePath);
  const projectRelativePath = path.relative(ROOT, resolvedPath);
  if (!resolvedPath.startsWith(`${ROOT}${path.sep}`)
      || projectRelativePath.toLowerCase() === 'server.js') {
    return null;
  }

  const extension = path.extname(resolvedPath).toLowerCase();
  if (!Object.hasOwn(contentTypes, extension)) return null;
  return resolvedPath;
}

function addLogoutControl(html) {
  const control = `<form method="post" action="/logout" style="margin-left:auto"><button type="submit" style="border:1px solid #dbe4e9;border-radius:.65rem;background:transparent;color:inherit;padding:.45rem .7rem;font:inherit;cursor:pointer">Log out</button></form>`;
  return html.replace(/<\/nav>/i, `${control}</nav>`);
}

function serveStaticFile(request, response, pathname) {
  let filePath;
  try {
    filePath = staticFilePath(pathname);
  } catch {
    send(response, 400, 'text/plain; charset=utf-8', 'Invalid URL path.');
    return;
  }

  if (!filePath) {
    send(response, 404, 'text/plain; charset=utf-8', 'Not found.');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT' || error.code === 'EISDIR') {
        send(response, 404, 'text/plain; charset=utf-8', 'Not found.');
        return;
      }
      console.error('Failed to read requested site file:', error);
      send(response, 500, 'text/plain; charset=utf-8', 'Unable to load this page.');
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const body = extension === '.html'
      ? addLogoutControl(content.toString('utf8'))
      : content;
    send(response, 200, contentTypes[extension], body);
  });
}

async function handleRequest(request, response) {
  setSecurityHeaders(response);

  let pathname;
  try {
    pathname = new URL(request.url, 'http://localhost').pathname;
  } catch {
    send(response, 400, 'text/plain; charset=utf-8', 'Invalid request URL.');
    return;
  }

  if (pathname === '/healthz' && request.method === 'GET') {
    send(response, 200, 'text/plain; charset=utf-8', 'ok');
    return;
  }

  if (pathname === '/login' && request.method === 'GET') {
    if (hasValidSession(request)) {
      redirect(response, '/');
      return;
    }
    send(response, 200, 'text/html; charset=utf-8', loginPage());
    return;
  }

  if (pathname === '/login' && request.method === 'POST') {
    await handleLogin(request, response);
    return;
  }

  if (pathname === '/logout' && request.method === 'POST') {
    response.setHeader('Set-Cookie', sessionCookie('', 0));
    redirect(response, '/login');
    return;
  }

  if (!hasValidSession(request)) {
    redirect(response, '/login');
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    send(response, 405, 'text/plain; charset=utf-8', 'Method not allowed.');
    return;
  }

  serveStaticFile(request, response, pathname);
}

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch(error => {
    console.error('Request failed:', error);
    if (!response.headersSent) {
      send(response, 500, 'text/plain; charset=utf-8', 'An unexpected server error occurred.');
    } else {
      response.destroy();
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`IT-308 site server listening on port ${PORT}`);
});
