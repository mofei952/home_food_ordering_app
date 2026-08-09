import { useEffect, useState } from "react";

import { ApiError } from "../../api/client";
import { MemberAvatar } from "../../ui/MemberAvatar";
import { useToast } from "../../ui/Toast";
import { HistoryPage } from "../history/HistoryPage";
import { todayInTimezone } from "../meals/api";
import { rotateInvite, SessionResponse } from "./api";

interface FamilyPageProps {
  session: SessionResponse;
  onInviteRotated?: (inviteCode: string) => void;
  onLoggedOut: () => void;
}

const roleLabel = {
  owner: "创建者",
  member: "成员",
} as const;

export function FamilyPage({
  session,
  onInviteRotated,
}: FamilyPageProps) {
  const { push: toast } = useToast();
  const [inviteCode, setInviteCode] = useState(session.invite_code);
  const [error, setError] = useState<string>();

  useEffect(() => {
    setInviteCode(session.invite_code);
  }, [session.invite_code]);

  async function handleRotateInvite() {
    if (!window.confirm("刷新后旧邀请码将立即失效，确定继续？")) {
      return;
    }
    setError(undefined);
    try {
      const result = await rotateInvite();
      setInviteCode(result.invite_code);
      onInviteRotated?.(result.invite_code);
      toast("邀请码已刷新");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "请求失败");
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteCode);
      toast("邀请码已复制");
    } catch {
      toast("请手动复制邀请码");
    }
  }

  return (
    <div className="page">
      <div className="card">
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <MemberAvatar nickname={session.member.nickname} />
          <div>
            <p style={{ margin: 0, fontWeight: 700 }}>{session.member.nickname}</p>
            <p className="page__lead" style={{ margin: 0 }}>
              {session.household.name} · {roleLabel[session.member.role]}
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <p className="alert-inline" role="alert">
          {error}
        </p>
      ) : null}

      <div className="card invite-reveal" style={{ padding: "1rem" }}>
        <p className="page__lead" style={{ margin: 0 }}>
          当前邀请码（登录后可随时查看）
        </p>
        <span className="invite-reveal__code" data-testid="invite-code">
          {inviteCode}
        </span>
        <button type="button" className="btn--soft" onClick={() => void copyInvite()}>
          复制
        </button>
      </div>

      {session.member.role === "owner" ? (
        <button type="button" data-write="true" onClick={() => void handleRotateInvite()}>
          刷新邀请码
        </button>
      ) : null}

      <section className="card" aria-label="家庭成员">
        <h3 style={{ margin: "0 0 0.75rem", fontSize: "var(--text-title)" }}>
          家庭成员
        </h3>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {session.members.map((member) => (
            <li
              key={member.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.65rem",
                padding: "0.5rem 0",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              <MemberAvatar nickname={member.nickname} />
              <span>
                {member.nickname} · {roleLabel[member.role]}
                {member.status === "disabled" ? " · 已停用" : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <HistoryPage endDate={todayInTimezone(session.household.timezone)} />
    </div>
  );
}
