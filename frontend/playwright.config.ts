import { defineConfig, devices } from "@playwright/test";

const FRONTEND_PORT = Number(process.env.E2E_FRONTEND_PORT ?? "4173");
const BACKEND_PORT = Number(process.env.E2E_BACKEND_PORT ?? "8000");
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "sqlite+aiosqlite:////tmp/family-menu-e2e.db";

/**
 * Local e2e stack (no Docker):
 * - backend uvicorn + sqlite + memory image storage
 * - vite preview with /api proxy
 *
 * When Docker Compose is available, `scripts/verify.sh` can set E2E_BASE_URL
 * at the Caddy same-origin entry and E2E_SKIP_WEBSERVER=1.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://127.0.0.1:${FRONTEND_PORT}`,
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  webServer: process.env.E2E_SKIP_WEBSERVER
    ? undefined
    : [
        {
          command: [
            `cd ../backend`,
            `&& DATABASE_URL='${DATABASE_URL}'`,
            `ENVIRONMENT=development`,
            `IMAGE_STORAGE=memory`,
            `uv run python scripts/reset_sqlite_schema.py`,
            `&& DATABASE_URL='${DATABASE_URL}'`,
            `ENVIRONMENT=development`,
            `IMAGE_STORAGE=memory`,
            `uv run uvicorn app.main:app --host 127.0.0.1 --port ${BACKEND_PORT}`,
          ].join(" "),
          url: `http://127.0.0.1:${BACKEND_PORT}/api/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
        {
          command: `npm run dev -- --host 127.0.0.1 --port ${FRONTEND_PORT}`,
          url: `http://127.0.0.1:${FRONTEND_PORT}`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ],
});
