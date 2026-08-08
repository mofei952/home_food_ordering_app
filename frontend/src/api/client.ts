export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }

  static async fromResponse(response: Response): Promise<ApiError> {
    const body = await response.json().catch(() => ({}));
    return new ApiError(
      body.detail ?? "请求失败",
      response.status,
      body.code ?? "http_error",
    );
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) throw await ApiError.fromResponse(response);
  return response.json() as Promise<T>;
}
