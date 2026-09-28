# CallTrack API

Express API that stores the shared call-outcome counters and derives the totals the dashboard displays.

## Endpoints

| Method | Path         | Description |
| ------ | ------------ | ----------- |
| GET    | `/health`    | Liveness probe used by Render. Includes `sheetConfigured`. |
| GET    | `/api/state` | Current record: `state`, `derived` totals, `updatedAt`. |
| PUT    | `/api/state` | Replace all counters. Body is the state object (optionally wrapped in `{ "state": ... }`). |
| POST   | `/api/reset` | Restore the initial sample counters. |
| POST   | `/api/derive`| Re-derive totals without writing. |
| POST   | `/api/report` | Record an operator's report and forward it to the shared sheet. |

`PUT /api/state` rejects unknown keys, missing keys, and negative or non-numeric values with `400`.

## Reports

`POST /api/report` accepts:

```json
{
  "operator": "Asha Menon",
  "state": { "courseNA": 19, "...": 0 },
  "clusters": [{ "code": "CL-01", "college": "St. Xavier's College" }]
}
```

`operator` and a complete `state` are required. Cluster entries missing a code or college name are
dropped rather than rejected, so a half-typed row never blocks a report. The client does not send a
timestamp: the server records the moment of submission and returns it as `reportDate` and
`reportTime`, split into separate columns and formatted in `REPORT_TIMEZONE`. This keeps a wrong
laptop clock or a wrong timezone from corrupting the record. The response also reports
`delivered: "sheet"` or `delivered: "local"`, plus the number of clusters recorded.

When `REPORT_WEBHOOK_URL` is set, the report is forwarded to that endpoint — a Google Sheet via
Apps Script, see [GOOGLE_SHEET_SETUP.md](./GOOGLE_SHEET_SETUP.md). If the sheet is unset or
unreachable, the report is appended to `data/reports.csv` and `data/reports-clusters.csv` instead,
and the operator is told it did not reach the sheet.

## Local run

```bash
npm install
npm run dev
```

Server starts on `http://localhost:3001`.

## Environment

| Variable             | Default                                       | Purpose |
| -------------------- | --------------------------------------------- | ------- |
| `PORT`               | `3001`                                        | Render sets this automatically. |
| `CORS_ORIGIN`        | `http://localhost:3000,http://localhost:5173` | Comma-separated list of allowed frontend origins. |
| `DATA_DIR`           | `./data`                                      | Directory holding `state.json`. |
| `REPORT_WEBHOOK_URL` | empty                                         | Endpoint that receives reports. Empty disables sheet delivery. |
| `REPORT_TIMEZONE`    | `UTC`                                          | Timezone the report date and time are recorded in, e.g. `Asia/Kolkata`. |
| `REPORTS_FILE`       | `$DATA_DIR/reports.csv`                       | Fallback log path. |

## Deploy to Render

1. Push this folder to its own Git repository.
2. In Render, create a **Web Service** and point it at that repository, or use the included `render.yaml` as a Blueprint.
3. Set `CORS_ORIGIN` to your Vercel URL, for example `https://your-app.vercel.app`.
4. Deploy. Render injects `PORT`; the service listens on it.

State is persisted to `data/state.json`. Render's free tier uses an ephemeral filesystem, so that file is cleared on redeploy or restart. Use a persistent disk or an external database if counts must survive redeploys.
