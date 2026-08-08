import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

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
import { AppShell } from "./AppShell";

export function App() {
  const [session, setSession] = useState<SessionResponse | null>();
  const [inviteCode, setInviteCode] = useState<string>();
  const [error, setError] = useState<string>();

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
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<TodayPage session={session} />} />
            <Route
              path="dishes"
              element={<DishListPage members={session.members} />}
            />
            <Route
              path="choose"
              element={<ChooseForMePage session={session} />}
            />
            <Route
              path="family"
              element={
                <FamilyPage
                  session={session}
                  initialInviteCode={inviteCode}
                  onLoggedOut={() => setSession(null)}
                />
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      )}
    </main>
  );
}
