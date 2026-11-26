//+------------------------------------------------------------------+
//|                                          MetalsTrendRider.mq5    |
//|  GOLD / SILVER TREND RIDER — XAUUSD & XAGUSD, H12                |
//|                                                                  |
//|  Rules (sirf band candle par faisla, agli candle par entry):     |
//|   LONG  : close > pichhli N candles ka highest high              |
//|           AND close > EMA(200)                                   |
//|   SHORT : close < pichhli N candles ka lowest low                |
//|           AND close < EMA(200) AND EMA(50) < EMA(200)            |
//|   Stop  : entry -/+ 2 x ATR(14, Wilder)                          |
//|   Trail : har band candle par stop = pichhli 15 candles ka       |
//|           low (long) / high (short) — sirf aage khisakta hai     |
//|   Exit  : stop, ya ulta signal (position palat jaati hai)        |
//|   Size  : stop lagne par equity ka InpRiskPct% hi jaaye          |
//|                                                                  |
//|  Research: backend/trading/scripts/metals_trend_research.py      |
//|  (fees + spread + swap ke saath, IS/OOS) — README dekho. H4 par  |
//|  2022-24 ki choppy market mein loss tha; H12 dono periods mein   |
//|  profit mein raha, isliye default H12 hai.                       |
//+------------------------------------------------------------------+
#property copyright "Cryptomantra"
#property version   "1.00"
#property strict

#include <Trade/Trade.mqh>

//============================ INPUTS =================================
input group "=== Strategy ==="
input ENUM_TIMEFRAMES InpTimeframe   = PERIOD_H12; // Signal timeframe
input int    InpChannel              = 30;         // Entry channel (bars)
input int    InpExitChannel          = 15;         // Trailing-stop channel (bars)
input double InpStopATR              = 2.0;        // Initial stop (x ATR)
input int    InpATRPeriod            = 14;         // ATR period (Wilder)
input int    InpEMAFast              = 50;         // Fast EMA (short filter)
input int    InpEMASlow              = 200;        // Slow EMA (regime)
input bool   InpAllowShorts          = true;       // Allow shorts

input group "=== Risk ==="
input double InpRiskPct              = 1.0;        // Risk per trade (% of equity)
input double InpMinLotMaxRiskPct     = 2.0;        // Min lot allowed only if its risk <= this %
input double InpMaxLeverage          = 5.0;        // Max notional / equity
input int    InpMaxSpreadPoints      = 0;          // Max spread for entry (points), 0 = off
input int    InpSlippage             = 30;         // Deviation (points)

input group "=== Misc ==="
input long   InpMagic                = 260412;     // Magic Number
input string InpTradeComment         = "MTR";      // Trade Comment
input bool   InpShowPanel            = true;       // Show status panel

//======================= GLOBAL STATE ================================
CTrade   trade;
int      g_emaFastHandle = INVALID_HANDLE;
int      g_emaSlowHandle = INVALID_HANDLE;
datetime g_lastBarTime   = 0;
int      g_pendingDir    = 0;      // +1 buy / -1 sell, waiting for a fill this bar
double   g_pendingStop   = 0.0;    // stop distance (price) for the pending entry
string   g_lastSignal    = "—";
int      g_entryFails    = 0;      // is candle mein kitni baar order reject hua

// ATR seed effect ~0 ho jaaye, isliye itni candles se Wilder ATR banate hain
#define WARMUP_BARS 600

//+------------------------------------------------------------------+
int OnInit()
{
   if(InpChannel < 2 || InpExitChannel < 1 || InpStopATR <= 0 || InpATRPeriod < 1 ||
      InpEMAFast < 1 || InpEMASlow <= InpEMAFast || InpRiskPct <= 0)
   {
      Print("MTR: invalid inputs");
      return INIT_PARAMETERS_INCORRECT;
   }
   g_emaFastHandle = iMA(_Symbol, InpTimeframe, InpEMAFast, 0, MODE_EMA, PRICE_CLOSE);
   g_emaSlowHandle = iMA(_Symbol, InpTimeframe, InpEMASlow, 0, MODE_EMA, PRICE_CLOSE);
   if(g_emaFastHandle == INVALID_HANDLE || g_emaSlowHandle == INVALID_HANDLE)
   {
      Print("MTR: EMA handle failed");
      return INIT_FAILED;
   }
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(InpSlippage);
   trade.SetTypeFillingBySymbol(_Symbol);

   // Attach ke waqt purani band candle ka signal nahi lete — sirf nayi candle close par faisla.
   g_lastBarTime = iTime(_Symbol, InpTimeframe, 0);
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   if(g_emaFastHandle != INVALID_HANDLE) IndicatorRelease(g_emaFastHandle);
   if(g_emaSlowHandle != INVALID_HANDLE) IndicatorRelease(g_emaSlowHandle);
   Comment("");
}

//+------------------------------------------------------------------+
void OnTick()
{
   datetime barTime = iTime(_Symbol, InpTimeframe, 0);
   if(barTime != 0 && barTime != g_lastBarTime)
   {
      g_lastBarTime = barTime;
      g_pendingDir  = 0;            // pichhli candle ka unfilled signal ab purana hai
      g_entryFails  = 0;
      OnBarClose();
   }
   if(g_pendingDir != 0)
      TryEntry();
   if(InpShowPanel)
      DrawPanel();
}

//+------------------------------------------------------------------+
//| Band candle (shift 1) par signal + trailing + exit               |
//+------------------------------------------------------------------+
void OnBarClose()
{
   int need = (int)MathMax(WARMUP_BARS, MathMax(InpChannel, InpExitChannel) + InpATRPeriod + 2);
   MqlRates r[];
   ArraySetAsSeries(r, false);                       // r[0] sabse purani, r[last] = band candle
   int got = CopyRates(_Symbol, InpTimeframe, 1, need, r);
   if(got < MathMax(InpChannel, InpExitChannel) + InpATRPeriod + 2)
   {
      Print("MTR: not enough history (", got, " bars)");
      return;
   }
   int last = got - 1;

   double emaF[1], emaS[1];
   if(CopyBuffer(g_emaFastHandle, 0, 1, 1, emaF) != 1 || CopyBuffer(g_emaSlowHandle, 0, 1, 1, emaS) != 1)
   {
      Print("MTR: EMA buffer not ready");
      return;
   }

   double close = r[last].close;
   double upper = r[last - 1].high, lower = r[last - 1].low;
   for(int j = last - InpChannel; j < last; j++)
   {
      upper = MathMax(upper, r[j].high);
      lower = MathMin(lower, r[j].low);
   }
   double trailLow = r[last].low, trailHigh = r[last].high;
   for(int j = last - InpExitChannel + 1; j <= last; j++)
   {
      trailLow  = MathMin(trailLow, r[j].low);
      trailHigh = MathMax(trailHigh, r[j].high);
   }
   double atr = WilderATR(r, got, InpATRPeriod);

   bool longSig  = close > upper && close > emaS[0];
   bool shortSig = InpAllowShorts && close < lower && close < emaS[0] && emaF[0] < emaS[0];
   g_lastSignal  = longSig ? "LONG breakout" : (shortSig ? "SHORT breakdown" : "no signal");

   ulong ticket = FindPosition();
   if(ticket != 0)
   {
      long type = PositionGetInteger(POSITION_TYPE);
      bool isLong = (type == POSITION_TYPE_BUY);

      // 1) Ulta signal -> band karo (aur neeche naya signal palat dega)
      if((isLong && shortSig) || (!isLong && longSig))
      {
         if(!trade.PositionClose(ticket))
            Print("MTR: reverse close failed ", trade.ResultRetcode());
         ticket = 0;
      }
      else
      {
         // 2) Channel trailing stop — sirf aage
         TrailStop(ticket, isLong, isLong ? trailLow : trailHigh);
         ticket = FindPosition();     // trail ne band kiya ho sakta hai
      }
   }

   if(ticket == 0 && atr > 0)
   {
      if(longSig)       { g_pendingDir = +1; g_pendingStop = InpStopATR * atr; }
      else if(shortSig) { g_pendingDir = -1; g_pendingStop = InpStopATR * atr; }
   }
}

//+------------------------------------------------------------------+
//| Wilder ATR — pandas ewm(alpha=1/n, adjust=False), research jaisa |
//+------------------------------------------------------------------+
double WilderATR(const MqlRates &r[], int count, int period)
{
   double alpha = 1.0 / period;
   double a = r[0].high - r[0].low;
   for(int i = 1; i < count; i++)
   {
      double pc = r[i - 1].close;
      double tr = MathMax(r[i].high - r[i].low, MathMax(MathAbs(r[i].high - pc), MathAbs(r[i].low - pc)));
      a = alpha * tr + (1.0 - alpha) * a;
   }
   return a;
}

//+------------------------------------------------------------------+
ulong FindPosition()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) == _Symbol && PositionGetInteger(POSITION_MAGIC) == InpMagic)
         return t;
   }
   return 0;
}

//+------------------------------------------------------------------+
void TrailStop(ulong ticket, bool isLong, double level)
{
   if(!PositionSelectByTicket(ticket)) return;
   double sl   = PositionGetDouble(POSITION_SL);
   double tp   = PositionGetDouble(POSITION_TP);
   double tick = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   double pt   = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   double minDist = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * pt;
   double bid  = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask  = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   level = NormalizePrice(level, tick);

   if(isLong)
   {
      if(sl > 0 && level <= sl) return;                 // peeche nahi jaata
      if(level >= bid)
      {
         // Naya stop price ke upar aa gaya = backtest mein candle open par stop hit hota
         trade.PositionClose(ticket);
         return;
      }
      if(level > bid - minDist)                         // broker stops-level ke andar — jitna paas ho sake
         level = NormalizePrice(bid - minDist, tick);
      if(sl > 0 && level <= sl) return;
   }
   else
   {
      if(sl > 0 && level >= sl) return;
      if(level <= ask)
      {
         trade.PositionClose(ticket);
         return;
      }
      if(level < ask + minDist)
         level = NormalizePrice(ask + minDist, tick);
      if(sl > 0 && level >= sl) return;
   }
   if(!trade.PositionModify(ticket, level, tp))
      Print("MTR: trail modify failed ", trade.ResultRetcode());
}

//+------------------------------------------------------------------+
void TryEntry()
{
   if(FindPosition() != 0) { g_pendingDir = 0; return; }

   if(InpMaxSpreadPoints > 0 && SymbolInfoInteger(_Symbol, SYMBOL_SPREAD) > InpMaxSpreadPoints)
      return;                                          // rollover ka chauda spread — agle tick par phir try

   double tick  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   double price = g_pendingDir > 0 ? SymbolInfoDouble(_Symbol, SYMBOL_ASK) : SymbolInfoDouble(_Symbol, SYMBOL_BID);
   if(price <= 0) return;

   double lots = CalcLots(g_pendingStop, price, g_pendingDir);
   if(lots <= 0) { g_pendingDir = 0; return; }

   double sl = NormalizePrice(price - g_pendingDir * g_pendingStop, tick);
   bool ok = g_pendingDir > 0
             ? trade.Buy(lots, _Symbol, 0.0, sl, 0.0, InpTradeComment)
             : trade.Sell(lots, _Symbol, 0.0, sl, 0.0, InpTradeComment);
   uint rc = trade.ResultRetcode();
   if(ok && (rc == TRADE_RETCODE_DONE || rc == TRADE_RETCODE_DONE_PARTIAL || rc == TRADE_RETCODE_PLACED))
   {
      g_pendingDir = 0;
      return;
   }
   Print("MTR: entry failed ", rc, " ", trade.ResultRetcodeDescription());
   if(++g_entryFails >= 3)
   {
      Print("MTR: 3 baar fail — is candle ka signal chhod diya");
      g_pendingDir = 0;
   }
}

//+------------------------------------------------------------------+
//| Lot size: stop lagne par equity ka InpRiskPct%                   |
//+------------------------------------------------------------------+
double CalcLots(double stopDist, double price, int dir)
{
   double equity    = AccountInfoDouble(ACCOUNT_EQUITY);
   double tickSize  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE_LOSS);
   if(tickValue <= 0) tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double vmax = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   if(equity <= 0 || tickSize <= 0 || tickValue <= 0 || step <= 0 || stopDist <= 0) return 0;

   double lossPerLot = stopDist / tickSize * tickValue;          // account currency
   double lots = equity * InpRiskPct / 100.0 / lossPerLot;

   // Notional cap (account currency mein)
   double notionalPerLot = price / tickSize * tickValue;
   if(notionalPerLot > 0)
      lots = MathMin(lots, equity * InpMaxLeverage / notionalPerLot);

   // Margin cap
   double margin = 0;
   ENUM_ORDER_TYPE ot = dir > 0 ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   double freeMargin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   if(OrderCalcMargin(ot, _Symbol, 1.0, price, margin) && margin > 0)
      lots = MathMin(lots, freeMargin * 0.9 / margin);

   lots = MathFloor(lots / step) * step;
   if(lots < vmin)
   {
      double minLotRisk = vmin * lossPerLot / equity * 100.0;
      if(minLotRisk <= InpMinLotMaxRiskPct && (margin <= 0 || vmin * margin <= freeMargin * 0.9))
         lots = vmin;
      else
      {
         PrintFormat("MTR: skip — min lot %.2f risk %.2f%% > %.2f%% (equity chhoti hai ya stop bada)",
                     vmin, minLotRisk, InpMinLotMaxRiskPct);
         return 0;
      }
   }
   lots = MathMin(lots, vmax);
   int digits = (int)MathMax(0, MathCeil(-MathLog10(step)));
   return NormalizeDouble(lots, digits);
}

double NormalizePrice(double p, double tick)
{
   if(tick <= 0) return NormalizeDouble(p, _Digits);
   return NormalizeDouble(MathRound(p / tick) * tick, _Digits);
}

//+------------------------------------------------------------------+
void DrawPanel()
{
   string pos = "flat";
   ulong t = FindPosition();
   if(t != 0)
   {
      pos = StringFormat("%s %.2f @ %s  SL %s  P/L %.2f",
                         PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY ? "LONG" : "SHORT",
                         PositionGetDouble(POSITION_VOLUME),
                         DoubleToString(PositionGetDouble(POSITION_PRICE_OPEN), _Digits),
                         DoubleToString(PositionGetDouble(POSITION_SL), _Digits),
                         PositionGetDouble(POSITION_PROFIT));
   }
   Comment(StringFormat("Metals Trend Rider  [%s %s]\nChannel %d / trail %d / stop %.1f ATR / risk %.2f%%\nLast bar: %s\nPosition: %s%s",
                        _Symbol, EnumToString(InpTimeframe), InpChannel, InpExitChannel, InpStopATR, InpRiskPct,
                        g_lastSignal, pos, g_pendingDir != 0 ? "\nEntry pending (spread wait)" : ""));
}
//+------------------------------------------------------------------+
