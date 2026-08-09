import { FormEvent, useState } from "react";

import { ApiError } from "../../api/client";
import { BottomSheet } from "../../ui/BottomSheet";
import { SegmentedControl } from "../../ui/SegmentedControl";
import { useToast } from "../../ui/Toast";
import { createHousehold, joinHousehold } from "./api";

interface OnboardingPageProps {
  onAuthenticated: () => void | Promise<void>;
}

type Mode = "create" | "join";

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "请求失败";
}

export function OnboardingPage({ onAuthenticated }: OnboardingPageProps) {
  const { push: toast } = useToast();
  const [mode, setMode] = useState<Mode>("create");
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
      await onAuthenticated();
      toast("家庭已创建");
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
      toast("欢迎加入家庭");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  async function copyInvite() {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      toast("邀请码已复制");
    } catch {
      toast("请手动复制邀请码");
    }
  }

  return (
    <div className="page" style={{ maxWidth: "40rem", margin: "0 auto" }}>
      <div className="onboarding-hero">
        <h1>家庭点菜</h1>
        <p>少争论，快点菜 — 记录你家会做的菜，一起决定今天吃什么</p>
      </div>

      {error ? (
        <p className="alert-inline" role="alert">
          {error}
        </p>
      ) : null}

      {inviteCode ? (
        <div className="card invite-reveal">
          <p className="page__lead">把邀请码发给家人</p>
          <span className="invite-reveal__code" data-testid="invite-code">
            {inviteCode}
          </span>
          <button type="button" className="btn--soft" onClick={() => void copyInvite()}>
            复制邀请码
          </button>
        </div>
      ) : null}

      <div className="onboarding-card">
        <SegmentedControl
          aria-label="入门方式"
          value={mode}
          onChange={setMode}
          options={[
            { value: "create", label: "创建家庭" },
            { value: "join", label: "加入家庭" },
          ]}
        />

        {mode === "create" ? (
          <form
            aria-label="创建家庭"
            className="form-stack"
            style={{ marginTop: "1rem" }}
            onSubmit={handleCreate}
          >
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
        ) : (
          <form
            aria-label="加入家庭"
            className="form-stack"
            style={{ marginTop: "1rem" }}
            onSubmit={handleJoin}
          >
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
        )}
      </div>
    </div>
  );
}
