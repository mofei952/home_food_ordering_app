interface MemberAvatarProps {
  nickname: string;
  className?: string;
}

export function MemberAvatar({ nickname, className = "" }: MemberAvatarProps) {
  const initial = nickname.trim().charAt(0) || "?";
  return (
    <span className={`avatar ${className}`.trim()} aria-hidden>
      {initial}
    </span>
  );
}

interface AvatarStackProps {
  nicknames: string[];
}

export function AvatarStack({ nicknames }: AvatarStackProps) {
  const visible = nicknames.slice(0, 4);
  return (
    <span className="avatar-stack" aria-hidden>
      {visible.map((name) => (
        <MemberAvatar key={name} nickname={name} />
      ))}
    </span>
  );
}
