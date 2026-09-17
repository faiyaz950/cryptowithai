/**
 * User account aur exchange connections — backend ke asli endpoints.
 *
 * Pehle desk ka login sirf browser mein chalta tha: koi bhi email aur koi bhi
 * password "login" kar deta tha, backend ko pata tak nahi chalta tha. Exchange
 * API keys (jinse asli paisa trade hota hai) us tarah ke login ke peeche nahi
 * rakhi ja sakti, isliye ab har request backend ke session token se jaati hai.
 */

const API_BASE = process.env.NEXT_PUBLIC_CRYPTO_API_URL || "http://127.0.0.1:8000/api";

export class AccountApiError extends Error {
  status: number;
  /** Backend ka machine-readable reason, jaise "ip_not_whitelisted". */
  reason: string | null;
  /** Delta ne jis IP ko reject kiya — user ko whitelist karne ke liye dikhaya jaata hai. */
  clientIp: string | null;

  constructor(message: string, status: number, reason: string | null = null, clientIp: string | null = null) {
    super(message);
    this.name = "AccountApiError";
    this.status = status;
    this.reason = reason;
    this.clientIp = clientIp;
  }
}

async function request<T>(
  path: string,
  { method = "GET", body, token }: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new AccountApiError(
      "Server se connect nahi ho paya. Free hosting par server jaagne mein thoda time lagta hai — dobara try karein.",
      0,
    );
  }

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.success === false) {
    throw new AccountApiError(
      String(data.error || `Request fail hui (${res.status})`),
      res.status,
      (data.reason as string) ?? null,
      (data.client_ip as string) ?? null,
    );
  }
  return data as T;
}

/* ── Auth ──────────────────────────────────────────────── */

export interface AccountUser {
  id: number;
  username: string;
  full_name: string;
  email: string;
  email_verified: boolean;
}

interface SessionResponse {
  token: string;
  expires_at: string;
  user: AccountUser;
}

export function registerAccount(fullName: string, email: string, password: string) {
  return request<SessionResponse>("/auth/register", {
    method: "POST",
    body: { full_name: fullName, email, password },
  });
}

export function loginAccount(email: string, password: string) {
  return request<SessionResponse>("/auth/login", { method: "POST", body: { email, password } });
}

export function fetchMe(token: string) {
  return request<{ user: AccountUser }>("/auth/me", { token });
}

export function logoutAccount(token: string) {
  return request<{ message: string }>("/auth/logout", { method: "POST", token });
}

/* ── Exchanges (BYOK) ──────────────────────────────────── */

export type ExchangeId = "delta" | "binance" | "bybit";

export interface ExchangeAccount {
  id: number;
  exchange: ExchangeId;
  label: string;
  /** Sirf pehle aur aakhri 4 akshar — poori key backend kabhi wapas nahi bhejta. */
  key_hint: string;
  is_active: boolean;
  can_trade: boolean;
  can_withdraw: boolean;
  permissions_verified: boolean;
  last_error: string;
  last_verified_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ExchangeBalance {
  asset: string;
  balance: number;
  available: number;
}

export function listExchangeAccounts(token: string) {
  return request<{ data: ExchangeAccount[] }>("/byok/exchange-accounts", { token }).then((r) => r.data);
}

export function connectExchangeAccount(
  token: string,
  input: { exchange: ExchangeId; label: string; apiKey: string; secretKey: string },
) {
  return request<{ data: { exchange_account_id: number; key_hint: string } }>("/byok/exchange-accounts", {
    method: "POST",
    token,
    body: { exchange: input.exchange, label: input.label, api_key: input.apiKey, secret_key: input.secretKey },
  }).then((r) => r.data);
}

export function verifyExchangeAccount(token: string, accountId: number) {
  return request<{ data: { permissions_verified: boolean } }>(
    `/byok/exchange-accounts/${accountId}/verify`,
    { method: "POST", token },
  );
}

/** Disconnect — backend encrypted key aur secret dono permanently delete karta hai. */
export function deleteExchangeAccount(token: string, accountId: number) {
  return request<{ message: string }>(`/byok/exchange-accounts/${accountId}`, { method: "DELETE", token });
}

export function fetchExchangeBalances(token: string, accountId: number) {
  return request<{ data: ExchangeBalance[] }>(`/byok/exchange-accounts/${accountId}/balances`, { token }).then(
    (r) => r.data,
  );
}
