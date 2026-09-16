/**
 * Delta Exchange India ka public live candle feed.
 *
 * Polling har kuch second mein poori candle dobara mangwata hai, isliye chart
 * jhatke se badalta tha. Delta ki apni site WebSocket se chalti hai: har trade
 * par aakhri candle ka OHLC turant aata hai, aur interval poora hote hi agli
 * candle apne aap shuru ho jaati hai. Ye module wahi feed deta hai.
 *
 * Public market data hai, isliye koi API key nahi lagti aur browser seedha
 * Delta se judta hai — backend (Render free tier) beech mein nahi aata.
 *
 * Browser se test kiya: saare desk timeframes (1m, 3m, 5m, 15m, 30m, 1h, 4h,
 * 1d) ke channel subscribe hote hain, aur live candle ka `volume` aur
 * `candle_start_time` REST candles se same minute par hu-ba-hu match karte hain.
 */

const DELTA_SOCKET_URL = "wss://socket.india.delta.exchange";

/** Desk ke timeframes jinka Delta par live channel hai. */
const LIVE_RESOLUTIONS = new Set(["1m", "3m", "5m", "15m", "30m", "1h", "4h", "1d"]);

/**
 * Itni der kuch na aaye to connection mara hua maano aur dobara judo.
 * `enable_heartbeat` ke baad Delta har ~5s heartbeat bhejta hai (bina trade ke
 * bhi — check kiya), to 20s matlab chaar heartbeat chhoot gaye.
 */
const SILENCE_MS = 20_000;

/** Reconnect ka wait: 1s, 2s, 4s … 15s tak. */
const MAX_BACKOFF_MS = 15_000;

export interface LiveBar {
  /** Candle shuru hone ka time, milliseconds — REST candles ke `time` jaisa. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type LiveStatus = "connecting" | "live" | "unsupported";

/** Desk "BTCUSDT" bhejta hai, Delta India "BTCUSD" — backend ka `to_delta_symbol` wala rule. */
export function deltaLiveSymbol(symbol: string): string {
  const s = symbol.toUpperCase();
  return s.endsWith("USDT") ? s.slice(0, -1) : s;
}

export function supportsLiveCandles(interval: string): boolean {
  return LIVE_RESOLUTIONS.has(interval.toLowerCase());
}

/**
 * Ek symbol + timeframe ki live candles. Har update par `onBar` chalta hai —
 * same `time` ho to wahi candle badli, naya `time` ho to nayi candle shuru.
 * Connection toote to apne aap dobara judta hai. Wapas mili function se band.
 */
export function subscribeLiveCandles(
  symbol: string,
  interval: string,
  onBar: (bar: LiveBar) => void,
  onStatus?: (status: LiveStatus) => void,
): () => void {
  const resolution = interval.toLowerCase();
  if (!supportsLiveCandles(resolution) || typeof WebSocket === "undefined") {
    onStatus?.("unsupported");
    return () => {};
  }

  const channel = `candlestick_${resolution}`;
  const deltaSymbol = deltaLiveSymbol(symbol);

  let socket: WebSocket | null = null;
  let stopped = false;
  let attempt = 0;
  let lastStatus: LiveStatus | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let silenceTimer: ReturnType<typeof setTimeout> | undefined;

  /** Sirf badlav par bolo — har tick par "live" bhejna bekaar re-render hai. */
  const setStatus = (status: LiveStatus) => {
    if (status === lastStatus) return;
    lastStatus = status;
    onStatus?.(status);
  };

  const armSilenceTimer = () => {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => socket?.close(), SILENCE_MS);
  };

  const connect = () => {
    if (stopped) return;
    setStatus("connecting");
    const ws = new WebSocket(DELTA_SOCKET_URL);
    socket = ws;

    ws.onopen = () => {
      attempt = 0;
      // Patle coin par kai second tak trade nahi hota — heartbeat se connection
      // zinda dikhta rehta hai aur silence timer bekaar reconnect nahi karta.
      ws.send(JSON.stringify({ type: "enable_heartbeat" }));
      ws.send(JSON.stringify({
        type: "subscribe",
        payload: { channels: [{ name: channel, symbols: [deltaSymbol] }] },
      }));
      armSilenceTimer();
    };

    ws.onmessage = (event) => {
      armSilenceTimer();
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (data.type !== channel || data.symbol !== deltaSymbol) return;

      const bar: LiveBar = {
        // Delta microseconds bhejta hai.
        time: Math.floor(Number(data.candle_start_time) / 1000),
        open: Number(data.open),
        high: Number(data.high),
        low: Number(data.low),
        close: Number(data.close),
        volume: Number(data.volume ?? 0),
      };
      if (![bar.time, bar.open, bar.high, bar.low, bar.close].every(Number.isFinite)) return;

      setStatus("live");
      onBar(bar);
    };

    ws.onerror = () => ws.close();

    ws.onclose = () => {
      clearTimeout(silenceTimer);
      if (stopped || socket !== ws) return;
      setStatus("connecting");
      const wait = Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS);
      attempt += 1;
      reconnectTimer = setTimeout(connect, wait);
    };
  };

  connect();

  return () => {
    stopped = true;
    clearTimeout(reconnectTimer);
    clearTimeout(silenceTimer);
    const ws = socket;
    socket = null;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close();
    }
  };
}
