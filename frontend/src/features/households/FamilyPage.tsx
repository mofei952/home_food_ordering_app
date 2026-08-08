import { useState } from "react";

import { ApiError } from "../../api/client";
import { rotateInvite, SessionResponse } from "./api";

interface FamilyPageProps {
  session: SessionResponse;
  initialInviteCode?: string;
  onLoggedOut: () => void;
}

const roleLabel = {
  owner: "创建者",
  member: "成员",
} as const;

export function FamilyPage({
  session,
  initialInviteCode,
}: FamilyPageProps) {
  const [inviteCode, setInviteCode] = useState(initialInviteCode);
  const [error, setError] = useState<string>();

  async function handleRotateInvite() {
    setError(undefined);
    try {
      const result = await rotateInvite();
      setInviteCode(result.invite_code);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "请求失败");
    }
  }

  return (
    <section>
      <h2>{session.household.name}</h2>
      <p>当前角色：{roleLabel[session.member.role]}</p>
      {error && <p role="alert">{error}</p>}
      {inviteCode && <p>邀请码：{inviteCode}</p>}
      {session.member.role === "owner" && (
        <button type="button" onClick={handleRotateInvite}>
          刷新邀请码
        </button>
      )}

      <h3>家庭成员</h3>
      <ul>
        {session.members.map((member) => (
          <li key={member.id}>
            {member.nickname} · {roleLabel[member.role]}
            {member.status === "disabled" ? " · 已停用" : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}
