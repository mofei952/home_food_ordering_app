import { useEffect, useState } from "react";

import { ApiError } from "../../api/client";
import { formatLocalDate, shiftLocalDate } from "../meals/api";
import {
  getHistory,
  getMetricsSummary,
  isoWeekMonday,
  MEAL_TYPE_LABELS,
  type HistoryEntry,
  type MetricsSummary,
} from "./api";
import { ValidationSummary } from "./ValidationSummary";

export interface HistoryPageProps {
  /** Inclusive end date (YYYY-MM-DD), defaults to today in local browser time. */
  endDate?: string;
  /** Lookback window in days for history + summary (default 14). */
  windowDays?: number;
}

function defaultEndDate(): string {
  return formatLocalDate(new Date());
}

export function HistoryPage({
  endDate = defaultEndDate(),
  windowDays = 14,
}: HistoryPageProps) {
  const from = shiftLocalDate(endDate, -(windowDays - 1));
  const to = endDate;
  const weekStart = isoWeekMonday(to);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(undefined);
    try {
      const [nextHistory, nextSummary] = await Promise.all([
        getHistory(from, to),
        getMetricsSummary(from, to),
      ]);
      setHistory(nextHistory);
      setSummary(nextSummary);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "加载历史失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when range changes
  }, [from, to]);

  return (
    <section aria-labelledby="history-heading">
      <h2 id="history-heading">历史菜单</h2>
      <p>
        {from} 至 {to}
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {loading ? <p>正在加载…</p> : null}

      {!loading && history.length === 0 ? <p>这段时间还没有已确认的菜单。</p> : null}

      <ol>
        {history.map((entry) => (
          <li key={entry.meal_slot_id}>
            <article>
              <h3>
                <time dateTime={entry.local_date}>{entry.local_date}</time>
                {" · "}
                {MEAL_TYPE_LABELS[entry.meal_type]}
              </h3>
              <ul>
                {entry.menu.map((item) => (
                  <li key={item.dish_id}>{item.dish_name}</li>
                ))}
              </ul>
              {entry.last_modified_by ? (
                <p>
                  最后修改：{entry.last_modified_by.nickname}
                  {entry.last_modified_at
                    ? ` · ${new Date(entry.last_modified_at).toLocaleString("zh-CN")}`
                    : ""}
                </p>
              ) : null}
            </article>
          </li>
        ))}
      </ol>

      <ValidationSummary
        summary={summary}
        weekStart={weekStart}
        onCheckinSaved={() => void load()}
      />
    </section>
  );
}
