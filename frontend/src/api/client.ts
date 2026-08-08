function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validationMessage(detail: unknown): string {
  if (!Array.isArray(detail) || !isRecord(detail[0])) {
    return "提交内容格式不正确";
  }
  const location = detail[0].loc;
  const field = Array.isArray(location)
    ? location
        .filter((part): part is string => typeof part === "string")
        .at(-1)
    : undefined;
  const messages: Record<string, string> = {
    household_name: "家庭名称不能为空或格式不正确",
    owner_name: "创建者昵称不能为空或格式不正确",
    nickname: "昵称不能为空或格式不正确",
    pin: "PIN 必须为 4 到 6 位数字",
    invite_code: "邀请码格式不正确",
    timezone: "时区无效",
  };
  return field === undefined
    ? "提交内容格式不正确"
    : (messages[field] ?? "提交内容格式不正确");
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly currentVersion?: number,
    readonly relaxableFilters?: string[],
  ) {
    super(message);
  }

  static async fromResponse(response: Response): Promise<ApiError> {
    const parsed: unknown = await response.json().catch(() => ({}));
    const body = isRecord(parsed) ? parsed : {};
    const detail = body.detail;
    const message =
      response.status === 422
        ? validationMessage(detail)
        : typeof detail === "string"
          ? detail
          : "请求失败";
    const code =
      typeof body.code === "string" ? body.code : "http_error";
    const currentVersion =
      typeof body.current_version === "number"
        ? body.current_version
        : undefined;
    const relaxableFilters = Array.isArray(body.relaxable_filters)
      ? body.relaxable_filters.filter(
          (item): item is string => typeof item === "string",
        )
      : undefined;
    return new ApiError(
      message,
      response.status,
      code,
      currentVersion,
      relaxableFilters,
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
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
