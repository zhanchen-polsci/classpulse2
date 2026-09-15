# ClassPulse

ClassPulse is a lightweight classroom-response web app for tutors. Students join by QR code without accounts, answer anonymously as individuals or groups, and tutors see live results with bar charts and word clouds.

## Features

- Anonymous student join link and QR code
- Individual or group responses
- Multiple choice, multi-select, and open-ended questions
- `Other` option with student-written answer for closed questions
- Live tutor dashboard
- Presentation mode
- Downloadable SVG visuals

## Run Locally

```bash
node server.js
```

Then open:

```text
http://127.0.0.1:4173
```

For student phones on the same Wi-Fi, run:

```bash
HOST=0.0.0.0 node server.js
```

For students on any network, deploy to a public HTTPS host such as Render.

## Render Settings

Use these settings when creating a Render Web Service:

```text
Runtime: Node
Build command: leave blank
Start command: node server.js
```

Environment variables:

```text
NODE_ENV=production
PUBLIC_URL=https://your-render-url.onrender.com
DATABASE_URL=your-postgres-internal-database-url
```

After deployment, open the public URL, create a session, and share the QR code from the tutor dashboard.

## Data Note

By default, local development stores session data in:

```text
work/classpulse-db.json
```

This file is intentionally not committed to GitHub.

On Render, set `DATABASE_URL` to a Postgres connection string. When `DATABASE_URL` is present, ClassPulse stores sessions, questions, and responses in Postgres instead of the local JSON file.
