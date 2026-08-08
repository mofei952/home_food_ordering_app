import { apiFetch } from "../../api/client";
import type { components } from "../../api/generated";

export type AuthResponse = components["schemas"]["AuthResponse"];
export type CreateHouseholdResponse =
  components["schemas"]["CreateHouseholdResponse"];
export type SessionResponse = components["schemas"]["SessionResponse"];
export type CreateHouseholdInput =
  components["schemas"]["CreateHouseholdRequest"];
export type JoinHouseholdInput =
  components["schemas"]["JoinHouseholdRequest"];

function post<T>(path: string, body?: object): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function createHousehold(
  input: CreateHouseholdInput,
): Promise<CreateHouseholdResponse> {
  return post("/api/households", input);
}

export function joinHousehold(input: JoinHouseholdInput): Promise<AuthResponse> {
  return post("/api/households/join", input);
}

export function getSession(): Promise<SessionResponse> {
  return apiFetch("/api/session");
}

export function rotateInvite(): Promise<{ invite_code: string }> {
  return post("/api/households/invite/rotate");
}
