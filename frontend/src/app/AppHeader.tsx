import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";

const TITLES: Record<string, string> = {
  "/": "今天",
  "/dishes": "菜品",
  "/choose": "帮我选",
  "/family": "家庭",
};

interface AppHeaderProps {
  actions?: ReactNode;
}

export function AppHeader({ actions }: AppHeaderProps) {
  const { pathname } = useLocation();
  const title = TITLES[pathname] ?? "家庭点菜";

  return (
    <header className="app-header">
      <h1 className="app-header__title">{title}</h1>
      {actions ? <div className="app-header__actions">{actions}</div> : null}
    </header>
  );
}
