"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import {
  fetchAccountGuard,
  saveAccountGuard,
  type AccountGuardState,
  type WorkerHeartbeat,
} from "@/lib/cryptoApi";

/**
 * Account kill switch for every server bot. Open positions stay managed
 * until Flatten is pressed. The worker heartbeat shows the thread is alive
 * even when this page is closed.
 */
export default function StrateoGuard({ token }: { token: string | null }) {
  const [open, setOpen] = useState(false);
  const [guard, setGuard] = useState<AccountGuardState | null>(null);
  const [worker, setWorker] = useState<WorkerHeartbeat | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetchAccountGuard(token);
      setGuard(res.guard);
      setWorker(res.worker);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load safety settings");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (patch: Parameters<typeof saveAccountGuard>[1]) => {
    if (!token) return;
    setBusy(true);
    try {
      const res = await saveAccountGuard(token, patch);
      setGuard(res.guard);
      setWorker(res.worker);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  if (!token) return null;
  const killed = Boolean(guard?.kill_switch);
  const alive = Boolean(worker?.running && worker.last_tick_at);
  const lastAlert = guard?.alerts?.[guard.alerts.length - 1];

  return (
    <div className="st-guard" data-killed={killed}>
      <button type="button" onClick={() => setOpen((v) => !v)} title="Account kill switch and bot heartbeat">
        <span className="st-guard-dot" data-on={alive} />
        <ShieldAlert className="w-3.5 h-3.5" aria-hidden />
        {killed ? "Killed" : "Safety"}
      </button>
      {open && (
        <div className="st-guard-pop">
          <p className="st-guard-lead">
            {alive
              ? `Bot worker is alive${worker?.bots ? ` · ${worker.bots} bot${worker.bots === 1 ? "" : "s"}` : ""}.`
              : "Bot worker heartbeat has not arrived yet."}
          </p>
          <label className="st-guard-row">
            <span>Daily loss limit %</span>
            <input
              type="number"
              min={0.1}
              max={50}
              step={0.5}
              defaultValue={guard?.max_daily_loss_pct ?? 5}
              disabled={busy}
              onBlur={(e) => void save({ max_daily_loss_pct: Number(e.target.value) })}
            />
          </label>
          <label className="st-guard-row">
            <span>Max open positions</span>
            <input
              type="number"
              min={1}
              max={20}
              step={1}
              defaultValue={guard?.max_open_positions ?? 5}
              disabled={busy}
              onBlur={(e) => void save({ max_open_positions: Number(e.target.value) })}
            />
          </label>
          <label className="st-guard-row">
            <span>Max exposure %</span>
            <input
              type="number"
              min={10}
              max={500}
              step={10}
              defaultValue={guard?.max_exposure_pct ?? 200}
              disabled={busy}
              onBlur={(e) => void save({ max_exposure_pct: Number(e.target.value) })}
            />
          </label>
          <label className="st-guard-row">
            <span>Telegram chat id</span>
            <input
              type="text"
              placeholder={guard?.telegram_configured ? "chat id" : "set TELEGRAM_BOT_TOKEN"}
              defaultValue={guard?.telegram_chat_id ?? ""}
              disabled={busy}
              onBlur={(e) => void save({ telegram_chat_id: e.target.value.trim() })}
            />
          </label>
          <div className="st-guard-actions">
            <button type="button" disabled={busy} onClick={() => void save({ kill_switch: !killed, flatten: false })}>
              {killed ? "Resume entries" : "Kill switch"}
            </button>
            <button type="button" disabled={busy} onClick={() => void save({ flatten: true, kill_switch: true })}>
              Stop all + flatten
            </button>
          </div>
          {lastAlert && <p className="st-guard-alert">{lastAlert.text}</p>}
          {error && <p className="st-guard-alert">{error}</p>}
          <p className="st-guard-note">
            Kill switch pauses new entries. Open trades keep their stops. Flatten closes them on the next worker tick.
            {guard?.email_configured ? " Email alerts are on." : ""}
            {guard?.telegram_configured ? "" : " Telegram needs TELEGRAM_BOT_TOKEN on the server."}
          </p>
        </div>
      )}
    </div>
  );
}
