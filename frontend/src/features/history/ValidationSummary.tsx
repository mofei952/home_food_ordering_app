import { FormEvent, useState } from "react";

import { ApiError } from "../../api/client";
import {
  DECISION_SOURCE_LABELS,
  formatPercent,
  putValidationCheckin,
  type MetricsSummary,
} from "./api";

export interface ValidationSummaryProps {
  summary: MetricsSummary | null;
  weekStart: string;
  onCheckinSaved?: () => void;
}

export function ValidationSummary({
  summary,
  weekStart,
  onCheckinSaved,
}: ValidationSummaryProps) {
  const [homeMealCount, setHomeMealCount] = useState("");
  const [offlineDiscussionCount, setOfflineDiscussionCount] = useState("");
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    setSaved(false);
    const home = Number(homeMealCount);
    const offline = Number(offlineDiscussionCount);
    if (
      !Number.isInteger(home) ||
      home < 0 ||
      !Number.isInteger(offline) ||
      offline < 0
    ) {
      setError("请填写非负整数");
      return;
    }
    setSaving(true);
    try {
      await putValidationCheckin(weekStart, {
        home_meal_count: home,
        offline_discussion_count: offline,
      });
      setSaved(true);
      onCheckinSaved?.();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const sources = summary?.decision_source_counts;

  return (
    <section aria-labelledby="validation-summary-heading">
      <h3 id="validation-summary-heading">两周验证摘要</h3>

      {summary ? (
        <dl>
          <div>
            <dt>通过应用确定菜单的餐次占比</dt>
            <dd>{formatPercent(summary.app_decided_meal_ratio)}</dd>
          </div>
          <div>
            <dt>打开到确认的中位秒数</dt>
            <dd>
              {summary.median_confirmation_seconds === null
                ? "暂无"
                : `${summary.median_confirmation_seconds} 秒`}
            </dd>
          </div>
          <div>
            <dt>决定来源使用次数</dt>
            <dd>
              {DECISION_SOURCE_LABELS.direct} {sources?.direct ?? 0} ·{" "}
              {DECISION_SOURCE_LABELS.random} {sources?.random ?? 0} ·{" "}
              {DECISION_SOURCE_LABELS.ingredient} {sources?.ingredient ?? 0}
            </dd>
          </div>
          <div>
            <dt>确认后修改次数</dt>
            <dd>{summary.menu_modified_count}</dd>
          </div>
          {summary.offline_discussion_count !== null &&
          summary.offline_discussion_count !== undefined ? (
            <div>
              <dt>线下反复讨论次数（汇总）</dt>
              <dd>{summary.offline_discussion_count}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p>正在加载验证指标…</p>
      )}

      {summary && summary.confirmation_details.length > 0 ? (
        <details>
          <summary>点菜数量与确认时间明细</summary>
          <table>
            <thead>
              <tr>
                <th scope="col">日期</th>
                <th scope="col">点菜数</th>
                <th scope="col">参与人数</th>
                <th scope="col">确认秒数</th>
              </tr>
            </thead>
            <tbody>
              {summary.confirmation_details.map((row) => (
                <tr key={row.meal_slot_id}>
                  <td>{row.local_date ?? "—"}</td>
                  <td>{row.request_count ?? "—"}</td>
                  <td>{row.participant_count ?? "—"}</td>
                  <td>{row.confirmation_seconds ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}

      <form aria-label="每周验证问卷" onSubmit={(event) => void handleSubmit(event)}>
        <h4>本周问卷（{weekStart} 起）</h4>
        <p>
          以下两项由成员手动填写，不是应用自动采集。
        </p>
        <label>
          实际家庭用餐数
          <span>（手动填写）</span>
          <input
            name="home_meal_count"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={homeMealCount}
            onChange={(event) => setHomeMealCount(event.target.value)}
            required
          />
        </label>
        <label>
          线下反复讨论次数
          <span>（手动填写）</span>
          <input
            name="offline_discussion_count"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={offlineDiscussionCount}
            onChange={(event) => setOfflineDiscussionCount(event.target.value)}
            required
          />
        </label>
        {error ? <p role="alert">{error}</p> : null}
        {saved ? <p role="status">已保存本周问卷</p> : null}
        <button type="submit" disabled={saving}>
          保存本周问卷
        </button>
      </form>
    </section>
  );
}
