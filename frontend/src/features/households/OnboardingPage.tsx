import { FormEvent, useState } from "react";

import { ApiError } from "../../api/client";
import { createHousehold, joinHousehold } from "./api";

interface OnboardingPageProps {
  onAuthenticated: (inviteCode?: string) => void | Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "请求失败";
}

export function OnboardingPage({ onAuthenticated }: OnboardingPageProps) {
  const [inviteCode, setInviteCode] = useState<string>();
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    try {
      const result = await createHousehold({
        household_name: String(data.get("household_name")),
        owner_name: String(data.get("owner_name")),
        pin: String(data.get("pin")),
        timezone: String(data.get("timezone")),
      });
      setInviteCode(result.invite_code);
      await onAuthenticated(result.invite_code);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    try {
      await joinHousehold({
        invite_code: String(data.get("invite_code")),
        nickname: String(data.get("nickname")),
        pin: String(data.get("pin")),
      });
      await onAuthenticated();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <h2>开始使用</h2>
      {error && <p role="alert">{error}</p>}
      {inviteCode ? (
        <p>
          邀请码：
          <span data-testid="invite-code">{inviteCode}</span>
        </p>
      ) : null}

      <form aria-label="创建家庭" onSubmit={handleCreate}>
        <h3>创建家庭</h3>
        <label>
          家庭名称
          <input name="household_name" required maxLength={100} />
        </label>
        <label>
          创建者昵称
          <input name="owner_name" required maxLength={100} />
        </label>
        <label>
          PIN
          <input
            name="pin"
            required
            inputMode="numeric"
            pattern="\d{4,6}"
            type="password"
          />
        </label>
        <label>
          时区
          <input name="timezone" defaultValue="Asia/Shanghai" required />
        </label>
        <button disabled={submitting} type="submit">
          创建家庭
        </button>
      </form>

      <form aria-label="加入家庭" onSubmit={handleJoin}>
        <h3>加入家庭</h3>
        <label>
          邀请码
          <input
            name="invite_code"
            required
            minLength={8}
            maxLength={8}
            autoCapitalize="characters"
          />
        </label>
        <label>
          昵称
          <input name="nickname" required maxLength={100} />
        </label>
        <label>
          PIN
          <input
            name="pin"
            required
            inputMode="numeric"
            pattern="\d{4,6}"
            type="password"
          />
        </label>
        <button disabled={submitting} type="submit">
          加入家庭
        </button>
      </form>
    </section>
  );
}
