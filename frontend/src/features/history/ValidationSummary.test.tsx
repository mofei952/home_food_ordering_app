import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ValidationSummary } from "./ValidationSummary";
import type { MetricsSummary } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

const summary: MetricsSummary = {
  median_confirmation_seconds: 150,
  app_decided_meal_ratio: 0.75,
  decision_source_counts: {
    direct: 2,
    random: 1,
    ingredient: 1,
  },
  menu_modified_count: 1,
  confirmation_details: [
    {
      meal_slot_id: "slot-1",
      local_date: "2026-08-04",
      meal_type: "dinner",
      request_count: 3,
      participant_count: 2,
      confirmation_seconds: 150,
    },
  ],
  offline_discussion_count: 1,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ValidationSummary", () => {
  it("renders Chinese metrics and labels manual check-in fields", () => {
    render(
      <ValidationSummary summary={summary} weekStart="2026-08-03" />,
    );

    expect(screen.getByText("两周验证摘要")).toBeVisible();
    expect(screen.getByText("通过应用确定菜单的餐次占比")).toBeVisible();
    expect(screen.getByText("75%")).toBeVisible();
    expect(screen.getByText("150 秒")).toBeVisible();
    expect(screen.getByText(/直接点菜 2/)).toBeVisible();
    expect(screen.getByText("确认后修改次数")).toBeVisible();

    expect(screen.getByLabelText(/实际家庭用餐数/)).toBeVisible();
    expect(screen.getByLabelText(/线下反复讨论次数/)).toBeVisible();
    expect(screen.getAllByText("（手动填写）").length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByText("以下两项由成员手动填写，不是应用自动采集。"),
    ).toBeVisible();
  });

  it("submits weekly validation check-in", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        week_start: "2026-08-03",
        home_meal_count: 4,
        offline_discussion_count: 1,
        updated_at: "2026-08-08T00:00:00Z",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onCheckinSaved = vi.fn();

    render(
      <ValidationSummary
        summary={summary}
        weekStart="2026-08-03"
        onCheckinSaved={onCheckinSaved}
      />,
    );

    fireEvent.change(screen.getByLabelText(/实际家庭用餐数/), {
      target: { value: "4" },
    });
    fireEvent.change(screen.getByLabelText(/线下反复讨论次数/), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存本周问卷" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/validation-checkins/2026-08-03",
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      home_meal_count: 4,
      offline_discussion_count: 1,
    });
    await waitFor(() => expect(onCheckinSaved).toHaveBeenCalled());
    expect(screen.getByRole("status")).toHaveTextContent("已保存本周问卷");
  });

  it("shows 暂无 when ratio and median are null", () => {
    render(
      <ValidationSummary
        summary={{
          ...summary,
          median_confirmation_seconds: null,
          app_decided_meal_ratio: null,
          confirmation_details: [],
          offline_discussion_count: null,
        }}
        weekStart="2026-08-03"
      />,
    );
    expect(screen.getAllByText("暂无").length).toBeGreaterThanOrEqual(2);
  });

  it("rejects non-integer and negative check-in values without calling the API", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ValidationSummary summary={summary} weekStart="2026-08-03" />,
    );
    const form = screen.getByRole("form", { name: "每周验证问卷" });

    fireEvent.change(screen.getByLabelText(/实际家庭用餐数/), {
      target: { value: "1.5" },
    });
    fireEvent.change(screen.getByLabelText(/线下反复讨论次数/), {
      target: { value: "0" },
    });
    // submit() bypasses native step/min so we assert the React guard.
    fireEvent.submit(form);

    expect(screen.getByRole("alert")).toHaveTextContent("请填写非负整数");
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/实际家庭用餐数/), {
      target: { value: "-1" },
    });
    fireEvent.submit(form);

    expect(screen.getByRole("alert")).toHaveTextContent("请填写非负整数");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows loading copy when summary is null", () => {
    render(<ValidationSummary summary={null} weekStart="2026-08-03" />);
    expect(screen.getByText("正在加载验证指标…")).toBeVisible();
  });
});
