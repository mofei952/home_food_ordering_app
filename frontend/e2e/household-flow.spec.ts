import { devices } from "@playwright/test";

import {
  createHouseholdAsOwner,
  expect,
  joinHouseholdAsMember,
  seedDishes,
  test,
} from "./fixtures";

test("two members order and confirm dinner", async ({ browser }) => {
  const owner = await browser.newContext({ ...devices["iPhone 13"] });
  const member = await browser.newContext({ ...devices["Pixel 7"] });

  try {
    const ownerPage = await owner.newPage();
    const invite = await createHouseholdAsOwner(ownerPage, {
      householdName: "我家",
      ownerName: "小林",
      pin: "1234",
    });

    const memberPage = await member.newPage();
    await joinHouseholdAsMember(memberPage, {
      inviteCode: invite,
      nickname: "小周",
      pin: "5678",
    });

    const sessionResponse = await ownerPage.request.get("/api/session");
    expect(sessionResponse.ok()).toBeTruthy();
    const session = await sessionResponse.json();
    const dishes = Array.from({ length: 15 }, (_, index) => ({
      name: index === 0 ? "番茄炒蛋" : `家常菜${index + 1}`,
      category: (index === 0 ? "荤菜" : "其他") as "荤菜" | "其他",
      cook_ids: [session.member.id as string],
      ingredients: index === 0 ? ["番茄", "鸡蛋"] : [`食材${index + 1}`],
    }));
    await seedDishes(ownerPage, dishes);

    await ownerPage.goto("/");
    await ownerPage.getByRole("button", { name: "晚餐" }).click();
    await ownerPage.getByRole("button", { name: "点番茄炒蛋" }).click();
    await expect(ownerPage.getByTestId("requesters-番茄炒蛋")).toHaveText(
      "小林",
    );

    await memberPage.goto("/");
    await memberPage.getByRole("button", { name: "晚餐" }).click();
    await memberPage.getByRole("button", { name: "点番茄炒蛋" }).click();

    // Backend sorts requester nicknames; 周 precedes 林 in code-point order.
    await expect(memberPage.getByTestId("requesters-番茄炒蛋")).toHaveText(
      "小周、小林",
    );
    await memberPage
      .getByRole("button", { name: "加入最终菜单：番茄炒蛋" })
      .click();
    await memberPage.getByRole("button", { name: "确认菜单" }).click();
    await expect(memberPage.getByText("最后修改：小周")).toBeVisible();

    await ownerPage.reload();
    await expect(ownerPage.getByText("最后修改：小周")).toBeVisible();
  } finally {
    await owner.close();
    await member.close();
  }
});
