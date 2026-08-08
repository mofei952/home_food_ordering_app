import { useEffect, useState } from "react";

import { ApiError } from "../api/client";
import { DishListPage } from "../features/dishes/DishListPage";
import {
  getSession,
  SessionResponse,
} from "../features/households/api";
import { FamilyPage } from "../features/households/FamilyPage";
import { OnboardingPage } from "../features/households/OnboardingPage";
import { TodayPage } from "../features/meals/TodayPage";
import { ChooseForMePage } from "../features/recommendations/ChooseForMePage";

type AppView = "today" | "dishes" | "choose" | "family";

export function App() {
  const [session, setSession] = useState<SessionResponse | null>();
  const [inviteCode, setInviteCode] = useState<string>();
  const [error, setError] = useState<string>();
  const [view, setView] = useState<AppView>("today");

  async function loadSession(newInviteCode?: string) {
    setError(undefined);
    setSession(undefined);
    try {
      const current = await getSession();
      setSession(current);
      setInviteCode(newInviteCode);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        setSession(null);
        return;
      }
      setError(
        caught instanceof ApiError
          ? caught.message
          : "服务暂时不可用，请稍后重试",
      );
    }
  }

  useEffect(() => {
    void loadSession();
  }, []);

  return (
    <main>
      <h1>家庭点菜</h1>
      {error ? (
        <section>
          <p role="alert" aria-label={error}>
            {error}
          </p>
          <button type="button" onClick={() => void loadSession(inviteCode)}>
            重试
          </button>
        </section>
      ) : session === undefined ? (
        <p>正在加载…</p>
      ) : session === null ? (
        <OnboardingPage onAuthenticated={loadSession} />
      ) : (
        <>
          <nav aria-label="主导航">
            <button
              type="button"
              aria-current={view === "today" ? "page" : undefined}
              onClick={() => setView("today")}
            >
              今天
            </button>
            <button
              type="button"
              aria-current={view === "dishes" ? "page" : undefined}
              onClick={() => setView("dishes")}
            >
              菜品
            </button>
            <button
              type="button"
              aria-current={view === "choose" ? "page" : undefined}
              onClick={() => setView("choose")}
            >
              帮我选
            </button>
            <button
              type="button"
              aria-current={view === "family" ? "page" : undefined}
              onClick={() => setView("family")}
            >
              家庭
            </button>
          </nav>
          {view === "today" ? (
            <TodayPage session={session} />
          ) : view === "dishes" ? (
            <DishListPage members={session.members} />
          ) : view === "choose" ? (
            <ChooseForMePage session={session} />
          ) : (
            <FamilyPage
              session={session}
              initialInviteCode={inviteCode}
              onLoggedOut={() => setSession(null)}
            />
          )}
        </>
      )}
    </main>
  );
}
