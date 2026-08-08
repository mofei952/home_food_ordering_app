import { apiFetch } from "../../api/client";

export type MemberRole = "owner" | "member";
export type MemberStatus = "active" | "disabled";

export interface HouseholdSummary {
  id: string;
  name: string;
  timezone: string;
}

export interface MemberSummary {
  id: string;
  nickname: string;
  role: MemberRole;
  status: MemberStatus;
}

export interface AuthResponse {
  household: HouseholdSummary;
  member: MemberSummary;
}

export interface CreateHouseholdResponse extends AuthResponse {
  invite_code: string;
}

export interface SessionResponse extends AuthResponse {
  members: MemberSummary[];
}

export interface CreateHouseholdInput {
  household_name: string;
  owner_name: string;
  pin: string;
  timezone: string;
}

export interface JoinHouseholdInput {
  invite_code: string;
  nickname: string;
  pin: string;
}

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
