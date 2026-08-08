import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiFetch } from "../../api/client";
import { FamilyPage } from "./FamilyPage";
import { OnboardingPage } from "./OnboardingPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OnboardingPage", () => {
  it("offers separate create and join forms", () => {
    render(<OnboardingPage onAuthenticated={vi.fn()} />);

    const createForm = screen.getByRole("form", { name: "创建家庭" });
    expect(within(createForm).getByLabelText("家庭名称")).toBeVisible();
    expect(within(createForm).getByLabelText("创建者昵称")).toBeVisible();
    expect(within(createForm).getByRole("button", { name: "创建家庭" })).toBeVisible();

    const joinForm = screen.getByRole("form", { name: "加入家庭" });
    expect(within(joinForm).getByLabelText("邀请码")).toBeVisible();
    expect(within(joinForm).getByLabelText("昵称")).toBeVisible();
    expect(within(joinForm).getByRole("button", { name: "加入家庭" })).toBeVisible();
  });

  it("creates a household and reveals the one-time invite code", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          household: { id: "h1", name: "我家", timezone: "Asia/Shanghai" },
          member: { id: "m1", nickname: "小林", role: "owner", status: "active" },
          invite_code: "ABCDEFGH",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const authenticated = vi.fn();
    render(<OnboardingPage onAuthenticated={authenticated} />);

    const form = screen.getByRole("form", { name: "创建家庭" });
    fireEvent.change(within(form).getByLabelText("家庭名称"), {
      target: { value: "我家" },
    });
    fireEvent.change(within(form).getByLabelText("创建者昵称"), {
      target: { value: "小林" },
    });
    fireEvent.change(within(form).getByLabelText("PIN"), {
      target: { value: "1234" },
    });
    fireEvent.submit(form);

    expect(await screen.findByText("邀请码：ABCDEFGH")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/households",
      expect.objectContaining({
        credentials: "include",
        method: "POST",
        body: JSON.stringify({
          household_name: "我家",
          owner_name: "小林",
          pin: "1234",
          timezone: "Asia/Shanghai",
        }),
      }),
    );
    expect(authenticated).toHaveBeenCalledOnce();
  });
});

describe("FamilyPage", () => {
  const session = {
    household: { id: "h1", name: "我家", timezone: "Asia/Shanghai" },
    member: { id: "m1", nickname: "小林", role: "owner" as const, status: "active" as const },
    members: [
      { id: "m1", nickname: "小林", role: "owner" as const, status: "active" as const },
      { id: "m2", nickname: "小周", role: "member" as const, status: "active" as const },
    ],
  };

  it("shows household members, current role, and owner invite controls", () => {
    render(<FamilyPage session={session} onLoggedOut={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "我家" })).toBeVisible();
    expect(screen.getByText("当前角色：创建者")).toBeVisible();
    expect(screen.getByText(/小林/)).toBeVisible();
    expect(screen.getByText(/小周/)).toBeVisible();
    expect(screen.getByRole("button", { name: "刷新邀请码" })).toBeVisible();
  });
});

it("apiFetch turns API failures into typed errors", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "PIN 错误", code: "invalid_pin" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );

  await expect(apiFetch("/api/session")).rejects.toEqual(
    new ApiError("PIN 错误", 401, "invalid_pin"),
  );
});

it("apiFetch translates structured validation errors into Chinese", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: [
            {
              type: "string_pattern_mismatch",
              loc: ["body", "pin"],
              msg: "String should match pattern '^\\d{4,6}$'",
              input: "abc",
            },
          ],
        }),
        {
          status: 422,
          headers: { "Content-Type": "application/json" },
        },
      ),
    ),
  );

  let error: unknown;
  try {
    await apiFetch("/api/households");
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).message).toBe("PIN 必须为 4 到 6 位数字");
  expect((error as ApiError).message).not.toContain("[object Object]");
  expect((error as ApiError).message).not.toContain("String should");
});
