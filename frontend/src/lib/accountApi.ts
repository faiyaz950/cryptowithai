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
  /** Account kab bana — profile page "member since" dikhata hai. */
  created_at?: string | null;
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

export function updateFullName(token: string, fullName: string) {
  return request<{ data: { full_name: string } }>("/profile/name", {
    method: "PATCH",
    token,
    body: { full_name: fullName },
  }).then((r) => r.data.full_name);
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

export interface EgressIps {
  /** Server ke outbound IP — exchange par key ki IP allowlist mein yahi jaate hain. */
  ips: string[];
  source: "configured" | "detected" | "unknown";
  /** false = ye poori list nahi hai, server kisi aur IP se bhi bahar ja sakta hai. */
  complete: boolean;
}

export function fetchEgressIps(token: string) {
  return request<{ data: EgressIps }>("/byok/egress-ips", { token }).then((r) => r.data);
}

export interface ExchangePosition {
  symbol: string;
  side: "long" | "short";
  size: number;
  entry_price: number;
  /** Public ticker se live mark — na mile to null. */
  mark_price: number | null;
  /** Entry se mark tak ka move, side ke hisaab se. Exact hai, estimate nahi. */
  move_pct: number | null;
  /** Sirf tab jab exchange khud bheje — hum khud PnL nahi ginte. */
  unrealized_pnl: number | null;
  realized_pnl: number;
  realized_funding: number;
  margin: number;
  liquidation_price: number | null;
}

export interface ExchangeOrder {
  id: number | string | null;
  symbol: string;
  side: string;
  order_type: string;
  size: number;
  unfilled_size: number;
  price: number | null;
  state: string;
  created_at: string;
}

interface Section<T> {
  items: T[];
  error: string;
}

export interface ExchangeOverview {
  account: {
    id: number;
    exchange: ExchangeId;
    label: string;
    key_hint: string;
    can_trade: boolean;
    permissions_verified: boolean;
    /** Abhi ke wallet call ka nateeja — list row se zyada taaza. */
    last_error: string;
    last_verified_at: string | null;
    created_at: string | null;
  };
  balances: Section<ExchangeBalance>;
  positions: Section<ExchangePosition>;
  orders: Section<ExchangeOrder>;
  /** Exchange ka apna profile (naam/email) — best effort, na mile to null. */
  exchange_profile: {
    account_name?: string;
    exchange_email?: string;
    exchange_username?: string;
    exchange_phone?: string;
    created_at?: string;
  } | null;
  totals: {
    cash: number;
    cash_available: number;
    open_positions: number;
    open_orders: number;
    unrealized_pnl: number | null;
    realized_pnl: number;
  };
  client_ip: string | null;
  fetched_at: string;
}

export interface MyPositions {
  /** false = user ne koi exchange joda hi nahi. Ye "koi position nahi" se alag baat hai. */
  connected: boolean;
  account_id?: number;
  exchange?: ExchangeId;
  label?: string;
  positions: ExchangePosition[];
  error: string;
}

/**
 * Desk ke liye: logged-in user ke apne account ki positions.
 *
 * Pehle desk `/delta/positions` maangta tha, jo server ki apni key se chalta
 * tha — yaani har visitor ko app owner ki positions dikhti thin aur user ko
 * apni nahi. Ab ye user ke token se uske apne account se aati hain.
 */
export function fetchMyPositions(token: string) {
  return request<{ data: MyPositions }>("/byok/positions", { token }).then((r) => r.data);
}

/** Profile page ka ek hi call — wallet, positions, orders aur exchange profile. */
export function fetchExchangeOverview(token: string, accountId: number) {
  return request<{ data: ExchangeOverview }>(`/byok/exchange-accounts/${accountId}/overview`, { token }).then(
    (r) => r.data,
  );
}

export function fetchExchangeBalances(token: string, accountId: number) {
  return request<{ data: ExchangeBalance[] }>(`/byok/exchange-accounts/${accountId}/balances`, { token }).then(
    (r) => r.data,
  );
}

/* ── BYOK orders (live exchange) ───────────────────────── */

export interface ByokOrder {
  order_id: string;
  symbol: string;
  side: string;
  order_type: string;
  quantity: number;
  price: number | null;
  status: string;
  timestamp?: string;
  exchange_account_id?: number;
}

export function placeByokOrder(
  token: string,
  payload: {
    exchange_account_id: number;
    symbol: string;
    side: "buy" | "sell";
    order_type: "market" | "limit";
    quantity: number;
    price?: number | null;
    reduce_only?: boolean;
  },
) {
  return request<{
    success: boolean;
    message?: string;
    data: {
      order_id: string;
      exchange_account_id: number;
      status: string;
      exchange: string;
    };
  }>("/byok/orders", {
    method: "POST",
    token,
    body: payload,
  });
}

export function fetchByokOrders(
  token: string,
  opts: { exchange_account_id?: number; limit?: number } = {},
) {
  const q = new URLSearchParams();
  if (opts.exchange_account_id != null) q.set("exchange_account_id", String(opts.exchange_account_id));
  if (opts.limit != null) q.set("limit", String(opts.limit));
  const qs = q.toString();
  return request<{ data: ByokOrder[] }>(`/byok/orders${qs ? `?${qs}` : ""}`, { token }).then((r) => r.data);
}

export function cancelByokOrder(
  token: string,
  payload: { exchange_account_id: number; order_id: string },
) {
  return request<{ success: boolean; message?: string; data?: unknown }>("/byok/orders/cancel", {
    method: "POST",
    token,
    body: payload,
  });
}
