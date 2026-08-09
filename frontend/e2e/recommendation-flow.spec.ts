import {
  createHouseholdAsOwner,
  expect,
  seedDishes,
  test,
} from "./fixtures";

test("ingredient match, accept, and history snapshot survive rename", async ({
  page,
}) => {
  await createHouseholdAsOwner(page, {
    householdName: "选菜之家",
    ownerName: "小林",
    pin: "1234",
  });

  const sessionResponse = await page.request.get("/api/session");
  expect(sessionResponse.ok()).toBeTruthy();
  const session = await sessionResponse.json();
  const cookId = session.member.id as string;

  await seedDishes(page, [
    {
      name: "番茄炒蛋",
      category: "荤菜",
      cook_ids: [cookId],
      ingredients: ["番茄", "鸡蛋"],
    },
    {
      name: "青椒肉丝",
      category: "荤菜",
      cook_ids: [cookId],
      ingredients: ["青椒", "猪肉"],
    },
    {
      name: "紫菜蛋花汤",
      category: "汤",
      cook_ids: [cookId],
      ingredients: ["紫菜", "鸡蛋"],
    },
  ]);

  await page.getByRole("link", { name: "帮我选" }).click();
  await page.getByLabel("番茄").check();
  await page.getByLabel("鸡蛋").check();
  await page.getByRole("button", { name: "按食材查找" }).click();
  await expect(page.getByRole("heading", { name: "现在就能做" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "现在就能做" }).getByText("番茄炒蛋"),
  ).toBeVisible();

  // Deterministic pick via API seed, then accept through the UI control.
  const randomResponse = await page.request.post("/api/recommendations/random", {
    data: {
      available_ingredient_ids: [],
      cook_ids: [],
      categories: [],
      seed: Number(process.env.E2E_RANDOM_SEED ?? "42"),
    },
  });
  expect(randomResponse.ok()).toBeTruthy();

  await page.getByRole("button", { name: "随机一道" }).click();
  await expect(page.getByTestId("selected-dish")).toBeVisible();
  await page.getByRole("button", { name: "就吃这个" }).click();
  await expect(page.getByText("已加入今晚想吃清单")).toBeVisible();

  const selectedDishId = await page
    .getByTestId("selected-dish")
    .getAttribute("data-dish-id");
  expect(selectedDishId).not.toBeNull();

  const dishResponse = await page.request.get(`/api/dishes/${selectedDishId}`);
  expect(dishResponse.ok()).toBeTruthy();
  const dish = await dishResponse.json();
  const snapshotName = dish.name as string;

  await page.getByRole("link", { name: "今天" }).click();
  await page.getByRole("button", { name: "晚餐" }).click();
  await page
    .getByRole("button", { name: `加入最终菜单：${snapshotName}` })
    .click();
  await page.getByRole("button", { name: "确认菜单" }).click();
  await expect(page.getByText("最后修改：小林")).toBeVisible();

  const renameResponse = await page.request.patch(
    `/api/dishes/${selectedDishId}`,
    {
      data: {
        name: "新的菜名",
        category: dish.category,
        cook_ids: dish.cooks.map((cook: { id: string }) => cook.id),
        ingredients: dish.ingredients.map(
          (item: { name: string }) => item.name,
        ),
        image_key: dish.image_key,
      },
    },
  );
  expect(
    renameResponse.ok(),
    `rename failed: ${renameResponse.status()} ${await renameResponse.text()}`,
  ).toBeTruthy();

  await page.getByRole("link", { name: "家庭" }).click();
  await page.getByRole("link", { name: "历史菜单" }).click();
  await expect(page.getByText(snapshotName)).toBeVisible();
  await expect(page.getByText("新的菜名")).not.toBeVisible();
});
