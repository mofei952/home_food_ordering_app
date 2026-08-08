import { useEffect, useState } from "react";

import { ApiError } from "../api/client";
import {
  getSession,
  SessionResponse,
} from "../features/households/api";
import { FamilyPage } from "../features/households/FamilyPage";
import { OnboardingPage } from "../features/households/OnboardingPage";

export function App() {
  const [session, setSession] = useState<SessionResponse | null>();
  const [inviteCode, setInviteCode] = useState<string>();
  const [error, setError] = useState<string>();

  async function loadSession(newInviteCode?: string) {
    try {
      const current = await getSession();
      setSession(current);
      setInviteCode(newInviteCode);
      setError(undefined);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status !== 401) {
        setError(caught.message);
      }
      setSession(null);
    }
  }

  useEffect(() => {
    void loadSession();
  }, []);

  return (
    <main>
      <h1>家庭点菜</h1>
      {error && <p role="alert">{error}</p>}
      {session === undefined ? (
        <p>正在加载…</p>
      ) : session === null ? (
        <OnboardingPage onAuthenticated={loadSession} />
      ) : (
        <FamilyPage
          session={session}
          initialInviteCode={inviteCode}
          onLoggedOut={() => setSession(null)}
        />
      )}
    </main>
  );
}
