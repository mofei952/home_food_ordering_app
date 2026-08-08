import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { App } from "./App";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("renders the product name", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "家庭点菜" })).toBeVisible();
});

it("shows a Chinese service error and retry for session network failures", async () => {
  const fetchMock = vi
    .fn()
    .mockRejectedValue(new TypeError("Failed to fetch"));
  vi.stubGlobal("fetch", fetchMock);

  render(<App />);

  expect(
    await screen.findByRole("alert", {
      name: "服务暂时不可用，请稍后重试",
    }),
  ).toBeVisible();
  expect(
    screen.queryByRole("form", { name: "创建家庭" }),
  ).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
});
