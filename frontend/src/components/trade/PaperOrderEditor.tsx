"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  modifyPaperOrder,
  setPaperBracket,
  symbolLabel,
  type DemoOrder,
  type PaperPosition,
} from "@/lib/cryptoApi";

export type PaperEditTarget =
  | { kind: "order"; order: DemoOrder }
  | { kind: "position"; position: PaperPosition };

interface Props {
  target: PaperEditTarget;
  /** Is symbol ka abhi ka bhaav — Target/SL ki sahi taraf aur % dikhane ke liye. */
  mark: number | null | undefined;
  onClose: () => void;
  /** `order` = modify ke baad ka order (fill ho gaya ho to status "filled"). */
  onSaved: (message: string, order?: DemoOrder) => void | Promise<void>;
}

function num(s: string): number | null {
  const v = Number(s);
  return s.trim() && Number.isFinite(v) && v > 0 ? v : null;
}

function str(n: number | null | undefined): string {
  return n == null ? "" : String(n);
}

function fmt(n: number): string {
  const digits = n >= 1000 ? 2 : n >= 1 ? 4 : 8;
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

/**
 * Paper order / position badalne ka dialog.
 * Order (pending): type, limit price, qty, Target/SL. Position: sirf Target/SL.
 */
export default function PaperOrderEditor({ target, mark, onClose, onSaved }: Props) {
  const { token } = useAuth();
  const isOrder = target.kind === "order";
  const order = isOrder ? target.order : null;
  const position = isOrder ? null : target.position;
  const symbol = order?.symbol ?? position!.symbol;
  const long = order ? order.side === "buy" : position!.side === "long";

  const [type, setType] = useState<"market" | "limit">(order?.order_type === "market" ? "market" : "limit");
  const [price, setPrice] = useState(str(order?.price));
  const [qty, setQty] = useState(str(order?.quantity));
  const [tp, setTp] = useState(str(order ? order.take_profit : position!.take_profit));
  const [sl, setSl] = useState(str(order ? order.stop_loss : position!.stop_loss));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Target/SL kis bhaav se tole: order par fill price (limit ya abhi ka), position par entry.
  const ref = order ? (type === "limit" ? num(price) : mark ?? null) : position!.entry_price;
  const size = order ? num(qty) ?? 0 : position!.size;
  const dir = long ? 1 : -1;

  const hint = (value: string, kind: "tp" | "sl") => {
    const v = num(value);
    if (v == null || !ref) return null;
    const pct = ((v - ref) / ref) * 100;
    const pnl = (v - ref) * size * dir;
    const wrong = kind === "tp" ? pnl <= 0 : pnl >= 0;
    return (
      <span className="po-hint" data-tone={wrong ? "warn" : kind === "tp" ? "up" : "down"}>
        {wrong
          ? kind === "tp"
            ? `Target ${long ? "upar" : "neeche"} hona chahiye`
            : `SL ${long ? "neeche" : "upar"} hona chahiye`
          : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}% · ${pnl >= 0 ? "+" : ""}${fmt(pnl)}`}
      </span>
    );
  };

  const save = async () => {
    if (!token) return;
    setError("");
    setBusy(true);
    try {
      if (order) {
        const q = num(qty);
        if (!q) throw new Error("Valid quantity daaliye");
        if (type === "limit" && !num(price)) throw new Error("Limit price daaliye");
        const res = await modifyPaperOrder(token, {
          order_id: order.order_id,
          order_type: type,
          quantity: q,
          ...(type === "limit" ? { price: num(price) } : {}),
          stop_loss: num(sl),
          take_profit: num(tp),
        });
        await onSaved(res.message || "Order update ho gaya", res.data);
      } else {
        const res = await setPaperBracket(token, { symbol, stop_loss: num(sl), take_profit: num(tp) });
        await onSaved(res.message || "Target/SL update ho gaya");
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update nahi hua");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cm-dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cm-dialog po-dialog" role="dialog" aria-modal="true" aria-label="Paper order modify">
        <div className="cm-dialog-head">
          <h2>
            {isOrder ? "Order modify" : "Target / Stop loss"}
            <span className="po-sub">
              {`${symbolLabel(symbol)} · ${long ? (isOrder ? "Buy" : "Long") : isOrder ? "Sell" : "Short"}`}
              {mark ? ` · abhi ${fmt(mark)}` : ""}
            </span>
          </h2>
          <button type="button" className="cm-dialog-x" onClick={onClose} aria-label="Band karein">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="po-body">
          {position && (
            <div className="po-facts tnum">
              <span>Size <b>{position.size}</b></span>
              <span>Entry <b>{fmt(position.entry_price)}</b></span>
              {position.mark_price != null && <span>Mark <b>{fmt(position.mark_price)}</b></span>}
            </div>
          )}

          {order && (
            <>
              <div>
                <span className="trade-label">Order type</span>
                <div className="trade-seg trade-seg-full">
                  <button type="button" className="trade-seg-btn" data-active={type === "limit"} onClick={() => setType("limit")}>
                    Limit
                  </button>
                  <button type="button" className="trade-seg-btn" data-active={type === "market"} onClick={() => setType("market")}>
                    Market (abhi fill)
                  </button>
                </div>
              </div>
              <div className="po-grid">
                <label>
                  <span className="trade-label">Limit price</span>
                  <input
                    className="trade-input"
                    type="number"
                    min="0"
                    step="any"
                    value={type === "market" ? str(mark) : price}
                    disabled={type === "market"}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </label>
                <label>
                  <span className="trade-label">Quantity</span>
                  <input className="trade-input" type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
                </label>
              </div>
            </>
          )}

          <div className="po-grid">
            <label>
              <span className="trade-label po-label">
                Target
                {tp && (
                  <button type="button" onClick={() => setTp("")} className="po-clear">hatao</button>
                )}
              </span>
              <input
                className="trade-input"
                type="number"
                min="0"
                step="any"
                placeholder={long ? "Upar ka bhaav" : "Neeche ka bhaav"}
                value={tp}
                onChange={(e) => setTp(e.target.value)}
              />
              {hint(tp, "tp")}
            </label>
            <label>
              <span className="trade-label po-label">
                Stop loss
                {sl && (
                  <button type="button" onClick={() => setSl("")} className="po-clear">hatao</button>
                )}
              </span>
              <input
                className="trade-input"
                type="number"
                min="0"
                step="any"
                placeholder={long ? "Neeche ka bhaav" : "Upar ka bhaav"}
                value={sl}
                onChange={(e) => setSl(e.target.value)}
              />
              {hint(sl, "sl")}
            </label>
          </div>

          <p className="po-note">
            {isOrder
              ? "Market chunne par order abhi ke bhaav par turant fill hoga. Target/SL fill ke baad position par lag jaate hain."
              : "Bhaav Target ya Stop loss chhoote hi position abhi ke bhaav par apne aap band ho jaati hai (desk khula ho tab har ~10 second check hota hai)."}
          </p>

          {error && (
            <p className="po-error">
              <AlertCircle className="w-3.5 h-3.5 flex-none" />
              {error}
            </p>
          )}
        </div>

        <div className="po-foot">
          <button type="button" className="trade-btn" onClick={onClose}>
            Rehne do
          </button>
          <button type="button" className="trade-btn trade-btn-primary" onClick={() => void save()} disabled={busy}>
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
