import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { test as base, expect } from "@playwright/test";

const FRONTEND_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const REPO_ROOT = path.resolve(FRONTEND_ROOT, "..");
const BACKEND_ROOT = path.join(REPO_ROOT, "backend");

/**
 * Single shared SQLite file for the local e2e webServer.
 * Playwright may bump workerIndex when a worker restarts after a failure, so
 * we must not derive the DB path from workerIndex while one uvicorn is running.
 */
export function e2eDatabaseUrl(): string {
  return (
    process.env.DATABASE_URL ??
    "sqlite+aiosqlite:////tmp/family-menu-e2e.db"
  );
}

export function resetE2eDatabase(): void {
  const databaseUrl = e2eDatabaseUrl();
  execFileSync("uv", ["run", "python", "scripts/reset_sqlite_schema.py"], {
    cwd: BACKEND_ROOT,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      ENVIRONMENT: "development",
      IMAGE_STORAGE: "memory",
    },
    stdio: "inherit",
  });
}

type DishSeed = {
  name: string;
  category: "荤菜" | "素菜" | "主食" | "汤" | "其他";
  cook_ids: string[];
  ingredients: string[];
};

export const test = base.extend<{
  freshDatabase: void;
}>({
  freshDatabase: [
    async ({}, use) => {
      resetE2eDatabase();
      await use();
      resetE2eDatabase();
    },
    { scope: "worker", auto: true },
  ],
});

export { expect };

export async function createHouseholdAsOwner(
  page: import("@playwright/test").Page,
  options: {
    householdName?: string;
    ownerName?: string;
    pin?: string;
  } = {},
): Promise<string> {
  const householdName = options.householdName ?? "我家";
  const ownerName = options.ownerName ?? "小林";
  const pin = options.pin ?? "1234";

  await page.goto("/");
  const createForm = page.getByRole("form", { name: "创建家庭" });
  await createForm.getByLabel("家庭名称").fill(householdName);
  await createForm.getByLabel("创建者昵称").fill(ownerName);
  await createForm.getByLabel("PIN").fill(pin);
  await createForm.getByRole("button", { name: "创建家庭" }).click();

  await expect(page.getByRole("heading", { name: "今天吃什么？" })).toBeVisible();
  await page.getByRole("link", { name: "家庭" }).click();
  const invite = (await page.getByTestId("invite-code").textContent())?.trim();
  expect(invite).toBeTruthy();
  return invite!;
}

export async function joinHouseholdAsMember(
  page: import("@playwright/test").Page,
  options: {
    inviteCode: string;
    nickname?: string;
    pin?: string;
  },
): Promise<void> {
  await page.goto("/");
  const joinForm = page.getByRole("form", { name: "加入家庭" });
  await joinForm.getByLabel("邀请码").fill(options.inviteCode);
  await joinForm.getByLabel("昵称").fill(options.nickname ?? "小周");
  await joinForm.getByLabel("PIN").fill(options.pin ?? "5678");
  await joinForm.getByRole("button", { name: "加入家庭" }).click();
  await expect(page.getByText("今天吃什么？")).toBeVisible();
}

export async function seedDishes(
  page: import("@playwright/test").Page,
  dishes: DishSeed[],
): Promise<void> {
  for (const dish of dishes) {
    const response = await page.request.post("/api/dishes", { data: dish });
    expect(
      response.ok(),
      `create dish ${dish.name}: ${response.status()} ${await response.text()}`,
    ).toBeTruthy();
  }
}
