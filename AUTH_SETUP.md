# Password-protected site setup

The site now runs through a Node.js server. All pages and static files require the shared site password; the password is not stored in the source files.

## Requirements

- Node.js 18 or newer
- HTTPS when deployed publicly

## Run locally

From this directory in PowerShell:

```powershell
$env:SITE_PASSWORD = Read-Host "Choose a site password (at least 12 characters)"
$env:SESSION_SECRET = node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
npm start
```

Open `http://localhost:3000`. Keep the terminal open while using the site. The values are environment variables for that PowerShell session and are not written into the project.

## Deploy

Deploy this directory to a Node.js host, set `SITE_PASSWORD` and `SESSION_SECRET` as private environment variables in the host's settings, and use `npm start` as the start command. Generate a different random `SESSION_SECRET` for production and enable HTTPS. Set `NODE_ENV=production` so session cookies are marked `Secure`.

Use a unique password of at least 12 characters. Do not put either environment variable in source code, commit it, or share it publicly. Changing `SESSION_SECRET` signs out all active sessions.

Sessions expire after eight hours. Login attempts are temporarily rate-limited after repeated failures. The `/healthz` endpoint is public for hosting health checks and does not expose site content.
