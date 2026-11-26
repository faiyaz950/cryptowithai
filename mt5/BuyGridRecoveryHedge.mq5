//+------------------------------------------------------------------+
//|                                      BuyGridRecoveryHedge.mq5    |
//|  BUY GRID RECOVERY + FIXED SELL HEDGE — XAUUSD                   |
 //|  Implements the specified strategy EXACTLY. No extras.           |
//+------------------------------------------------------------------+
#property copyright "Cryptomantra"
#property version   "1.00"
#property strict

#include <Trade/Trade.mqh>

//============================ INPUTS =================================
input group "=== Core ==="
input long   InpMagic              = 260331;      // Magic Number
input double InpGridStep           = 5.00;        // Grid Step (USD price)
input double InpInitialBuyLot      = 0.01;        // Initial Buy Lot
input double InpSellHedgeLot       = 0.01;        // Sell Hedge Lot (fixed)
input double InpMiniProfitTarget   = 0.20;        // Mini Profit ($) before downside
input double InpBasketProfitTarget = 96.00;       // Basket Profit Target ($)
input double InpDailyDDLimitPct    = 30.0;        // Daily Drawdown Limit (%)
input int    InpSlippage           = 30;          // Slippage / Deviation (points)
input string InpTradeComment       = "BGRH";      // Trade Comment

input group "=== Visual ==="
input bool   InpEnableDashboard    = true;        // Enable Dashboard
input bool   InpEnableChartTheme   = true;        // Enable Chart Theme
input bool   InpShowVisualGrid     = true;        // Show Visual Grid Levels

//======================= PREDEFINED BUY LOTS =========================
// Exact sequence — do NOT calculate / martingale / fibonacci.
const double BUY_LOTS[] =
{
   0.01, 0.02, 0.03, 0.05, 0.08, 0.12, 0.18, 0.27,
   0.41, 0.62, 0.93, 1.40, 2.10, 3.15, 4.73, 7.10
};
const int BUY_LOT_COUNT = ArraySize(BUY_LOTS);

//======================= GLOBAL STATE ================================
CTrade trade;

bool     g_upsideGridActive   = false;   // OFF until first downside Buy
bool     g_dailyStopped       = false;
bool     g_hasBasket          = false;

int      g_buySeqIndex        = 0;       // next lot index to use (0 = next is 0.01)
double   g_initialBuyPrice    = 0.0;
double   g_lastBuyPrice       = 0.0;
double   g_lastSellPrice      = 0.0;

double   g_usedBuyLevels[];              // exact buy prices used this basket
double   g_usedSellLevels[];             // exact sell prices used this basket

double   g_dailyStartBalance  = 0.0;
int      g_brokerDayStamp     = 0;       // YYYYMMDD of stored day

// Chart theme backup
bool     g_themeSaved = false;
color    g_old_bg, g_old_fg, g_old_grid, g_old_bull, g_old_bear, g_old_bullcandle, g_old_bearcandle;
bool     g_old_show_grid = true;

string   DASH_PREFIX = "BGRH_DASH_";
string   GRID_PREFIX = "BGRH_GRID_";

//+------------------------------------------------------------------+
//| Helpers                                                          |
//+------------------------------------------------------------------+
double NormLot(double lots)
{
   double vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double vmax = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double vstep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   if(vstep <= 0) vstep = 0.01;
   lots = MathFloor(lots / vstep + 1e-12) * vstep;
   if(lots < vmin) lots = vmin;
   if(lots > vmax) lots = vmax;
   int digits = 0;
   double s = vstep;
   while(s < 1.0 - 1e-12 && digits < 8) { s *= 10.0; digits++; }
   return NormalizeDouble(lots, digits);
}

double NormPrice(double price)
{
   return NormalizeDouble(price, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS));
}

bool PriceUsed(const double &arr[], double price, double tol)
{
   int n = ArraySize(arr);
   for(int i = 0; i < n; i++)
      if(MathAbs(arr[i] - price) <= tol)
         return true;
   return false;
}

void AddUsedLevel(double &arr[], double price)
{
   int n = ArraySize(arr);
   ArrayResize(arr, n + 1);
   arr[n] = price;
}

int BrokerDayStamp()
{
   MqlDateTime dt;
   TimeToStruct(TimeTradeServer(), dt);
   return dt.year * 10000 + dt.mon * 100 + dt.day;
}

string StatusText()
{
   if(g_dailyStopped) return "DAILY STOPPED";
   if(!g_hasBasket)   return "NEW CYCLE";
   if(!g_upsideGridActive) return "WAITING FOR DOWNSIDE TRIGGER";
   return "GRID ACTIVE";
}

//+------------------------------------------------------------------+
//| Position / basket helpers                                        |
//+------------------------------------------------------------------+
bool IsOurPosition(ulong ticket)
{
   if(!PositionSelectByTicket(ticket)) return false;
   if(PositionGetString(POSITION_SYMBOL) != _Symbol) return false;
   if((long)PositionGetInteger(POSITION_MAGIC) != InpMagic) return false;
   return true;
}

int CountBuys()
{
   int c = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong t = PositionGetTicket(i);
      if(!IsOurPosition(t)) continue;
      if(PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) c++;
   }
   return c;
}

int CountSells()
{
   int c = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong t = PositionGetTicket(i);
      if(!IsOurPosition(t)) continue;
      if(PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_SELL) c++;
   }
   return c;
}

double BasketProfit()
{
   double p = 0.0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong t = PositionGetTicket(i);
      if(!IsOurPosition(t)) continue;
      p += PositionGetDouble(POSITION_PROFIT)
         + PositionGetDouble(POSITION_SWAP);
   }
   return p;
}

bool HasAnyBasketPosition()
{
   return (CountBuys() + CountSells()) > 0;
}

double LastBuyOpenPriceFromMarket()
{
   double last = 0.0;
   datetime lastTime = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong t = PositionGetTicket(i);
      if(!IsOurPosition(t)) continue;
      if(PositionGetInteger(POSITION_TYPE) != POSITION_TYPE_BUY) continue;
      datetime tm = (datetime)PositionGetInteger(POSITION_TIME);
      if(tm >= lastTime)
      {
         lastTime = tm;
         last = PositionGetDouble(POSITION_PRICE_OPEN);
      }
   }
   return last;
}

double LastSellOpenPriceFromMarket()
{
   double last = 0.0;
   datetime lastTime = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong t = PositionGetTicket(i);
      if(!IsOurPosition(t)) continue;
      if(PositionGetInteger(POSITION_TYPE) != POSITION_TYPE_SELL) continue;
      datetime tm = (datetime)PositionGetInteger(POSITION_TIME);
      if(tm >= lastTime)
      {
         lastTime = tm;
         last = PositionGetDouble(POSITION_PRICE_OPEN);
      }
   }
   return last;
}

//+------------------------------------------------------------------+
//| New day / Daily DD                                               |
//+------------------------------------------------------------------+
void EnsureNewDay()
{
   int stamp = BrokerDayStamp();
   if(stamp != g_brokerDayStamp)
   {
      g_brokerDayStamp = stamp;
      g_dailyStartBalance = AccountInfoDouble(ACCOUNT_EQUITY);
      g_dailyStopped = false;
      PrintFormat("BGRH: new broker day %d | DailyStartBalance=%.2f", stamp, g_dailyStartBalance);
   }
}

double DailyDrawdownPct()
{
   if(g_dailyStartBalance <= 0.0) return 0.0;
   double eq = AccountInfoDouble(ACCOUNT_EQUITY);
   if(eq >= g_dailyStartBalance) return 0.0;
   return ((g_dailyStartBalance - eq) / g_dailyStartBalance) * 100.0;
}

bool CheckDailyDD()
{
   EnsureNewDay();
   double dd = DailyDrawdownPct();
   if(dd >= InpDailyDDLimitPct)
   {
      if(!g_dailyStopped)
         PrintFormat("BGRH: Daily DD %.2f%% >= %.2f%% — closing and stopping for the day", dd, InpDailyDDLimitPct);
      CloseEntireBasket();
      g_dailyStopped = true;
      return true;
   }
   return false;
}

//+------------------------------------------------------------------+
//| Basket close / reset                                             |
//+------------------------------------------------------------------+
void ResetBasketTracking()
{
   g_upsideGridActive = false;
   g_hasBasket = false;
   g_buySeqIndex = 0;
   g_initialBuyPrice = 0.0;
   g_lastBuyPrice = 0.0;
   g_lastSellPrice = 0.0;
   ArrayResize(g_usedBuyLevels, 0);
   ArrayResize(g_usedSellLevels, 0);
   ClearVisualGrid();
}

bool CloseEntireBasket()
{
   bool ok = true;
   // Close buys then sells
   for(int pass = 0; pass < 2; pass++)
   {
      for(int i = PositionsTotal() - 1; i >= 0; i--)
      {
         ulong t = PositionGetTicket(i);
         if(!IsOurPosition(t)) continue;
         long type = PositionGetInteger(POSITION_TYPE);
         if(pass == 0 && type != POSITION_TYPE_BUY) continue;
         if(pass == 1 && type != POSITION_TYPE_SELL) continue;
         if(!trade.PositionClose(t))
         {
            PrintFormat("BGRH: close fail ticket=%I64u ret=%d", t, trade.ResultRetcode());
            ok = false;
         }
      }
   }
   // Confirm
   if(HasAnyBasketPosition())
   {
      // retry once
      Sleep(200);
      for(int i = PositionsTotal() - 1; i >= 0; i--)
      {
         ulong t = PositionGetTicket(i);
         if(!IsOurPosition(t)) continue;
         if(!trade.PositionClose(t))
            ok = false;
      }
   }
   ResetBasketTracking();
   return !HasAnyBasketPosition();
}

//+------------------------------------------------------------------+
//| Trade execution                                                  |
//+------------------------------------------------------------------+
bool OpenBuyLot(double lots, double &filledPrice)
{
   filledPrice = 0.0;
   if(g_buySeqIndex >= BUY_LOT_COUNT)
   {
      Print("BGRH: Buy lot sequence exhausted — no further buys");
      return false;
   }
   lots = NormLot(lots);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   if(!trade.Buy(lots, _Symbol, ask, 0, 0, InpTradeComment))
   {
      PrintFormat("BGRH: Buy fail lot=%.2f ret=%d", lots, trade.ResultRetcode());
      return false;
   }
   filledPrice = trade.ResultPrice();
   if(filledPrice <= 0) filledPrice = ask;
   filledPrice = NormPrice(filledPrice);
   return true;
}

bool OpenSellHedge(double &filledPrice)
{
   filledPrice = 0.0;
   double lots = NormLot(InpSellHedgeLot);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   if(!trade.Sell(lots, _Symbol, bid, 0, 0, InpTradeComment))
   {
      PrintFormat("BGRH: Sell hedge fail ret=%d", trade.ResultRetcode());
      return false;
   }
   filledPrice = trade.ResultPrice();
   if(filledPrice <= 0) filledPrice = bid;
   filledPrice = NormPrice(filledPrice);
   return true;
}

bool StartNewCycle()
{
   if(g_dailyStopped) return false;
   if(HasAnyBasketPosition()) return false;

   ResetBasketTracking();
   double lots = (g_buySeqIndex < BUY_LOT_COUNT) ? BUY_LOTS[g_buySeqIndex] : InpInitialBuyLot;
   // Force initial to input when index 0
   if(g_buySeqIndex == 0) lots = InpInitialBuyLot;

   double fill = 0.0;
   if(!OpenBuyLot(lots, fill))
      return false;

   // Advance sequence only after success
   g_buySeqIndex = 1; // next buy uses index 1 → 0.02
   g_initialBuyPrice = fill;
   g_lastBuyPrice = fill;
   g_hasBasket = true;
   g_upsideGridActive = false; // DISABLED until downside
   AddUsedLevel(g_usedBuyLevels, fill);
   PrintFormat("BGRH: NEW CYCLE initial BUY %.2f @ %.3f | UpsideGrid=OFF", lots, fill);
   return true;
}

// Attempt sell hedge if independent sell grid allows it.
// Does NOT block a successful buy — buy already executed before calling this.
void TrySellHedgeAt(double buyFillPrice)
{
   double tol = InpGridStep * 0.25; // tolerance for "same level"
   // Independent sell spacing from last used sell level
   if(ArraySize(g_usedSellLevels) > 0)
   {
      // nearest check: must be at least GridStep from EVERY used sell? Spec: "5 USD minimum spacing from previous/used Sell grid level"
      for(int i = 0; i < ArraySize(g_usedSellLevels); i++)
      {
         if(MathAbs(g_usedSellLevels[i] - buyFillPrice) < InpGridStep - 1e-8)
         {
            PrintFormat("BGRH: Sell hedge skipped — would violate sell grid spacing near %.3f", g_usedSellLevels[i]);
            return;
         }
         if(PriceUsed(g_usedSellLevels, buyFillPrice, tol))
         {
            Print("BGRH: Sell hedge skipped — duplicate sell level");
            return;
         }
      }
   }

   double sellFill = 0.0;
   if(!OpenSellHedge(sellFill))
      return; // buy already done; do not roll back buy / sequence

   g_lastSellPrice = sellFill;
   AddUsedLevel(g_usedSellLevels, sellFill);
}

bool ExecuteNextBuyGrid(bool isDownsideTrigger)
{
   if(g_buySeqIndex >= BUY_LOT_COUNT)
   {
      Print("BGRH: no more Buy lots in predefined sequence");
      return false;
   }

   double nextLot = BUY_LOTS[g_buySeqIndex];
   // Theoretical grid price from last buy
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double ref = (isDownsideTrigger || bid < g_lastBuyPrice) ? bid : ask;

   // Duplicate protection on intended level around lastBuy ± step
   double intendedDown = NormPrice(g_lastBuyPrice - InpGridStep);
   double intendedUp   = NormPrice(g_lastBuyPrice + InpGridStep);
   double intended = (ref <= g_lastBuyPrice) ? intendedDown : intendedUp;

   double tol = InpGridStep * 0.25;
   if(PriceUsed(g_usedBuyLevels, intended, tol))
   {
      // Already used this level — do nothing
      return false;
   }

   double fill = 0.0;
   if(!OpenBuyLot(nextLot, fill))
      return false; // do NOT advance sequence / mark level

   // Success — advance
   int usedIndex = g_buySeqIndex;
   g_buySeqIndex++;
   g_lastBuyPrice = fill;
   AddUsedLevel(g_usedBuyLevels, fill);

   if(isDownsideTrigger || (!g_upsideGridActive && fill < g_initialBuyPrice - InpGridStep * 0.5))
   {
      if(!g_upsideGridActive)
      {
         g_upsideGridActive = true;
         Print("BGRH: DOWNSIDE TRIGGER — UpsideGrid=ENABLED for rest of basket");
      }
   }

   TrySellHedgeAt(fill);
   PrintFormat("BGRH: BUY %.2f @ %.3f (seq %d) | UpsideGrid=%s", nextLot, fill, usedIndex, g_upsideGridActive ? "ON" : "OFF");
   return true;
}

//+------------------------------------------------------------------+
//| Grid detection                                                   |
//+------------------------------------------------------------------+
void ProcessGrid()
{
   if(g_dailyStopped) return;
   if(!g_hasBasket || !HasAnyBasketPosition()) return;
   if(g_lastBuyPrice <= 0) return;

   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double mid = (bid + ask) * 0.5;

   // --- Phase 1: upside disabled — only wait for downside OR mini profit ---
   if(!g_upsideGridActive)
   {
      // Mini profit on initial scalping basket
      double bp = BasketProfit();
      if(bp >= InpMiniProfitTarget)
      {
         PrintFormat("BGRH: Mini profit %.2f >= %.2f — close & new cycle", bp, InpMiniProfitTarget);
         if(CloseEntireBasket())
            StartNewCycle();
         return;
      }

      // Downside only: price <= LastBuy - GridStep
      if(bid <= g_lastBuyPrice - InpGridStep)
      {
         ExecuteNextBuyGrid(true);
      }
      // Upside: do NOTHING until downside triggered
      return;
   }

   // --- Phase 2: both directions active ---
   // Mini profit disabled after downside activation
   if(bid <= g_lastBuyPrice - InpGridStep)
   {
      ExecuteNextBuyGrid(false);
      return;
   }
   if(ask >= g_lastBuyPrice + InpGridStep)
   {
      ExecuteNextBuyGrid(false);
      return;
   }
}

//+------------------------------------------------------------------+
//| Basket profit target                                             |
//+------------------------------------------------------------------+
void CheckBasketTarget()
{
   if(!g_hasBasket || !HasAnyBasketPosition()) return;
   // Mini profit already handled in ProcessGrid before activation
   if(!g_upsideGridActive) return;

   double bp = BasketProfit();
   if(bp >= InpBasketProfitTarget)
   {
      PrintFormat("BGRH: Basket profit %.2f >= %.2f — close all & reset", bp, InpBasketProfitTarget);
      if(CloseEntireBasket() && !g_dailyStopped)
         StartNewCycle();
   }
}

//+------------------------------------------------------------------+
//| Restart recovery                                                 |
//+------------------------------------------------------------------+
void RecoverFromOpenPositions()
{
   ResetBasketTracking();
   int buys = CountBuys();
   int sells = CountSells();
   if(buys + sells == 0)
   {
      g_hasBasket = false;
      return;
   }

   g_hasBasket = true;
   ArrayResize(g_usedBuyLevels, 0);
   ArrayResize(g_usedSellLevels, 0);

   double earliestBuy = 0.0;
   datetime earliestBuyTime = 0;
   datetime latestBuyTime = 0;
   double latestBuy = 0.0;

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong t = PositionGetTicket(i);
      if(!IsOurPosition(t)) continue;
      long type = PositionGetInteger(POSITION_TYPE);
      double op = PositionGetDouble(POSITION_PRICE_OPEN);
      datetime tm = (datetime)PositionGetInteger(POSITION_TIME);
      if(type == POSITION_TYPE_BUY)
      {
         AddUsedLevel(g_usedBuyLevels, NormPrice(op));
         if(earliestBuyTime == 0 || tm < earliestBuyTime)
         {
            earliestBuyTime = tm;
            earliestBuy = op;
         }
         if(tm >= latestBuyTime)
         {
            latestBuyTime = tm;
            latestBuy = op;
         }
      }
      else if(type == POSITION_TYPE_SELL)
      {
         AddUsedLevel(g_usedSellLevels, NormPrice(op));
      }
   }

   g_initialBuyPrice = NormPrice(earliestBuy);
   g_lastBuyPrice = NormPrice(latestBuy > 0 ? latestBuy : LastBuyOpenPriceFromMarket());
   g_lastSellPrice = NormPrice(LastSellOpenPriceFromMarket());
   g_buySeqIndex = MathMin(buys, BUY_LOT_COUNT); // next index = number of buys done

   // Downside activation if more than 1 buy OR any sell exists OR a buy below initial
   g_upsideGridActive = (buys > 1) || (sells > 0);
   if(!g_upsideGridActive && buys == 1 && g_lastBuyPrice < g_initialBuyPrice - InpGridStep * 0.5)
      g_upsideGridActive = true;

   PrintFormat("BGRH: RECOVERED basket buys=%d sells=%d lastBuy=%.3f upside=%s seq=%d",
               buys, sells, g_lastBuyPrice, g_upsideGridActive ? "ON" : "OFF", g_buySeqIndex);
}

//+------------------------------------------------------------------+
//| Chart theme                                                      |
//+------------------------------------------------------------------+
void SaveChartTheme()
{
   if(g_themeSaved) return;
   g_old_bg = (color)ChartGetInteger(0, CHART_COLOR_BACKGROUND);
   g_old_fg = (color)ChartGetInteger(0, CHART_COLOR_FOREGROUND);
   g_old_grid = (color)ChartGetInteger(0, CHART_COLOR_GRID);
   g_old_bull = (color)ChartGetInteger(0, CHART_COLOR_CHART_UP);
   g_old_bear = (color)ChartGetInteger(0, CHART_COLOR_CHART_DOWN);
   g_old_bullcandle = (color)ChartGetInteger(0, CHART_COLOR_CANDLE_BULL);
   g_old_bearcandle = (color)ChartGetInteger(0, CHART_COLOR_CANDLE_BEAR);
   g_old_show_grid = (bool)ChartGetInteger(0, CHART_SHOW_GRID);
   g_themeSaved = true;
}

void ApplyChartTheme()
{
   if(!InpEnableChartTheme) return;
   SaveChartTheme();
   ChartSetInteger(0, CHART_COLOR_BACKGROUND, C'12,18,28');
   ChartSetInteger(0, CHART_COLOR_FOREGROUND, C'220,230,240');
   ChartSetInteger(0, CHART_COLOR_GRID, C'40,55,70');
   ChartSetInteger(0, CHART_SHOW_GRID, false);
   ChartSetInteger(0, CHART_COLOR_CHART_UP, C'0,200,150');
   ChartSetInteger(0, CHART_COLOR_CHART_DOWN, C'230,70,90');
   ChartSetInteger(0, CHART_COLOR_CANDLE_BULL, C'0,200,150');
   ChartSetInteger(0, CHART_COLOR_CANDLE_BEAR, C'230,70,90');
   ChartRedraw(0);
}

void RestoreChartTheme()
{
   if(!g_themeSaved) return;
   ChartSetInteger(0, CHART_COLOR_BACKGROUND, g_old_bg);
   ChartSetInteger(0, CHART_COLOR_FOREGROUND, g_old_fg);
   ChartSetInteger(0, CHART_COLOR_GRID, g_old_grid);
   ChartSetInteger(0, CHART_SHOW_GRID, g_old_show_grid);
   ChartSetInteger(0, CHART_COLOR_CHART_UP, g_old_bull);
   ChartSetInteger(0, CHART_COLOR_CHART_DOWN, g_old_bear);
   ChartSetInteger(0, CHART_COLOR_CANDLE_BULL, g_old_bullcandle);
   ChartSetInteger(0, CHART_COLOR_CANDLE_BEAR, g_old_bearcandle);
   ChartRedraw(0);
}

//+------------------------------------------------------------------+
//| Visual grid                                                      |
//+------------------------------------------------------------------+
void ClearVisualGrid()
{
   int total = ObjectsTotal(0, 0, -1);
   for(int i = total - 1; i >= 0; i--)
   {
      string name = ObjectName(0, i, 0, -1);
      if(StringFind(name, GRID_PREFIX) == 0)
         ObjectDelete(0, name);
   }
}

void UpdateVisualGrid()
{
   if(!InpShowVisualGrid) return;
   ClearVisualGrid();
   if(!g_hasBasket || g_lastBuyPrice <= 0) return;

   string n1 = GRID_PREFIX + "LAST_BUY";
   ObjectCreate(0, n1, OBJ_HLINE, 0, 0, g_lastBuyPrice);
   ObjectSetInteger(0, n1, OBJPROP_COLOR, clrAqua);
   ObjectSetInteger(0, n1, OBJPROP_STYLE, STYLE_SOLID);
   ObjectSetInteger(0, n1, OBJPROP_WIDTH, 1);
   ObjectSetString(0, n1, OBJPROP_TEXT, "Last BUY");

   if(g_lastSellPrice > 0)
   {
      string ns = GRID_PREFIX + "LAST_SELL";
      ObjectCreate(0, ns, OBJ_HLINE, 0, 0, g_lastSellPrice);
      ObjectSetInteger(0, ns, OBJPROP_COLOR, clrOrangeRed);
      ObjectSetInteger(0, ns, OBJPROP_STYLE, STYLE_DOT);
      ObjectSetString(0, ns, OBJPROP_TEXT, "Last SELL");
   }

   double nextDown = NormPrice(g_lastBuyPrice - InpGridStep);
   double nextUp = NormPrice(g_lastBuyPrice + InpGridStep);
   string nd = GRID_PREFIX + "NEXT_DOWN";
   ObjectCreate(0, nd, OBJ_HLINE, 0, 0, nextDown);
   ObjectSetInteger(0, nd, OBJPROP_COLOR, clrDodgerBlue);
   ObjectSetInteger(0, nd, OBJPROP_STYLE, STYLE_DASH);
   ObjectSetString(0, nd, OBJPROP_TEXT, "Next BUY down");

   if(g_upsideGridActive)
   {
      string nu = GRID_PREFIX + "NEXT_UP";
      ObjectCreate(0, nu, OBJ_HLINE, 0, 0, nextUp);
      ObjectSetInteger(0, nu, OBJPROP_COLOR, clrLime);
      ObjectSetInteger(0, nu, OBJPROP_STYLE, STYLE_DASH);
      ObjectSetString(0, nu, OBJPROP_TEXT, "Next BUY up");
   }
}

//+------------------------------------------------------------------+
//| Dashboard                                                        |
//+------------------------------------------------------------------+
void DashLabel(string id, int x, int y, string text, color clr, int fontSize = 9, bool bold = false)
{
   string name = DASH_PREFIX + id;
   if(ObjectFind(0, name) < 0)
   {
      ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, name, OBJPROP_ANCHOR, ANCHOR_LEFT_UPPER);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
   }
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetString(0, name, OBJPROP_FONT, bold ? "Arial Bold" : "Consolas");
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, fontSize);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
}

void DashRect(string id, int x, int y, int w, int h, color bg)
{
   string name = DASH_PREFIX + id;
   if(ObjectFind(0, name) < 0)
   {
      ObjectCreate(0, name, OBJ_RECTANGLE_LABEL, 0, 0, 0);
      ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, name, OBJPROP_BORDER_TYPE, BORDER_FLAT);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
   }
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, h);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, name, OBJPROP_COLOR, C'40,60,80');
   ObjectSetInteger(0, name, OBJPROP_WIDTH, 1);
}

void ClearDashboard()
{
   int total = ObjectsTotal(0, 0, -1);
   for(int i = total - 1; i >= 0; i--)
   {
      string name = ObjectName(0, i, 0, -1);
      if(StringFind(name, DASH_PREFIX) == 0)
         ObjectDelete(0, name);
   }
}

void UpdateDashboard()
{
   if(!InpEnableDashboard)
   {
      ClearDashboard();
      return;
   }

   int x = 12, y = 20, w = 320;
   DashRect("BG", x, y, w, 390, C'18,28,42');

   color stClr = clrSilver;
   string st = StatusText();
   if(st == "GRID ACTIVE") stClr = clrLime;
   else if(st == "WAITING FOR DOWNSIDE TRIGGER") stClr = clrGold;
   else if(st == "DAILY STOPPED") stClr = clrOrangeRed;
   else if(st == "NEW CYCLE") stClr = clrDodgerBlue;

   int yy = y + 10;
   DashLabel("T1", x + 12, yy, "BUY GRID RECOVERY + HEDGE", clrAqua, 10, true); yy += 20;
   DashLabel("T2", x + 12, yy, "STATUS: " + st, stClr, 10, true); yy += 18;
   DashLabel("T3", x + 12, yy, "Symbol: " + _Symbol + "   Magic: " + IntegerToString(InpMagic), clrSilver, 8); yy += 16;

   double bp = BasketProfit();
   color bpClr = (bp >= 0 ? clrLime : clrOrangeRed);
   DashLabel("P1", x + 12, yy, StringFormat("Basket Profit: $%.2f   Target: $%.2f", bp, InpBasketProfitTarget), bpClr, 9); yy += 16;
   DashLabel("P2", x + 12, yy, StringFormat("Mini Profit Target: $%.2f %s", InpMiniProfitTarget, g_upsideGridActive ? "(DISABLED)" : "(ACTIVE)"), clrSilver, 8); yy += 18;

   DashLabel("C1", x + 12, yy, StringFormat("BUY Count: %d     SELL Count: %d", CountBuys(), CountSells()), clrWhite, 9); yy += 16;
   string lotInfo = (g_buySeqIndex < BUY_LOT_COUNT)
                    ? StringFormat("Next Buy Lot: %.2f  (level %d/%d)", BUY_LOTS[g_buySeqIndex], g_buySeqIndex + 1, BUY_LOT_COUNT)
                    : "Next Buy Lot: EXHAUSTED";
   DashLabel("C2", x + 12, yy, lotInfo, clrAqua, 9); yy += 18;

   DashLabel("L1", x + 12, yy, StringFormat("Last BUY:  %.3f", g_lastBuyPrice), clrAqua, 9); yy += 14;
   DashLabel("L2", x + 12, yy, StringFormat("Last SELL: %.3f", g_lastSellPrice), clrOrange, 9); yy += 16;

   double nextBuy = 0.0;
   string nextBuyTxt = "—";
   if(g_hasBasket && g_lastBuyPrice > 0)
   {
      if(!g_upsideGridActive)
         nextBuyTxt = StringFormat("%.3f (down only)", NormPrice(g_lastBuyPrice - InpGridStep));
      else
         nextBuyTxt = StringFormat("%.3f / %.3f", NormPrice(g_lastBuyPrice - InpGridStep), NormPrice(g_lastBuyPrice + InpGridStep));
   }
   DashLabel("N1", x + 12, yy, "Next BUY grid: " + nextBuyTxt, clrDodgerBlue, 9); yy += 14;
   string nextSellTxt = (g_lastSellPrice > 0)
                        ? StringFormat("%.3f (±%.2f from last sell)", g_lastSellPrice, InpGridStep)
                        : "on next valid Buy";
   DashLabel("N2", x + 12, yy, "Next SELL grid: " + nextSellTxt, clrOrangeRed, 9); yy += 18;

   DashLabel("U1", x + 12, yy, StringFormat("Upside Grid:   %s", g_upsideGridActive ? "ACTIVE" : "WAITING"), g_upsideGridActive ? clrLime : clrGold, 9, true); yy += 14;
   DashLabel("U2", x + 12, yy, StringFormat("Downside Grid: %s", g_hasBasket ? (g_upsideGridActive ? "ACTIVE" : "WAITING") : "IDLE"), clrSilver, 9); yy += 18;

   EnsureNewDay();
   double dd = DailyDrawdownPct();
   DashLabel("D1", x + 12, yy, StringFormat("Daily Start Eq: %.2f", g_dailyStartBalance), clrSilver, 8); yy += 14;
   DashLabel("D2", x + 12, yy, StringFormat("Current Equity: %.2f", AccountInfoDouble(ACCOUNT_EQUITY)), clrWhite, 8); yy += 14;
   DashLabel("D3", x + 12, yy, StringFormat("Daily DD: %.2f%%   Limit: %.1f%%", dd, InpDailyDDLimitPct),
             (dd >= InpDailyDDLimitPct * 0.8 ? clrOrangeRed : clrSilver), 8); yy += 16;
   DashLabel("G1", x + 12, yy, StringFormat("Grid Step: %.2f USD", InpGridStep), clrSilver, 8);

   UpdateVisualGrid();
   ChartRedraw(0);
}

//+------------------------------------------------------------------+
//| OnInit / OnDeinit / OnTick                                       |
//+------------------------------------------------------------------+
int OnInit()
{
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(InpSlippage);
   trade.SetTypeFillingBySymbol(_Symbol);
   trade.SetAsyncMode(false);

   EnsureNewDay();
   if(g_dailyStartBalance <= 0)
      g_dailyStartBalance = AccountInfoDouble(ACCOUNT_EQUITY);

   ApplyChartTheme();
   RecoverFromOpenPositions();

   if(!g_hasBasket && !g_dailyStopped && !MQLInfoInteger(MQL_TESTER))
   {
      // Live: start cycle if flat. Tester: OnTick will start.
   }

   UpdateDashboard();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   ClearDashboard();
   ClearVisualGrid();
   RestoreChartTheme();
}

void OnTick()
{
   // 1. Daily DD (highest priority)
   if(CheckDailyDD())
   {
      UpdateDashboard();
      return;
   }

   EnsureNewDay();

   // Sync basket flag with market
   if(HasAnyBasketPosition())
      g_hasBasket = true;
   else if(g_hasBasket)
   {
      // Basket gone externally
      ResetBasketTracking();
   }

   // Start new cycle if flat and allowed
   if(!g_hasBasket && !g_dailyStopped)
   {
      StartNewCycle();
      UpdateDashboard();
      return;
   }

   // 2. Basket profit target (after activation; mini handled in grid)
   CheckBasketTarget();
   if(!g_hasBasket)
   {
      if(!g_dailyStopped) StartNewCycle();
      UpdateDashboard();
      return;
   }

   // 3–7. Grid / buys / sells
   ProcessGrid();

   // 8. Dashboard
   UpdateDashboard();
}

//+------------------------------------------------------------------+
//| Tester: also allow timer-less operation; OnTick is enough.       |
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction& trans,
                        const MqlTradeRequest& request,
                        const MqlTradeResult& result)
{
   // Keep last prices fresh after fills from recovery edge cases
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD)
   {
      double lb = LastBuyOpenPriceFromMarket();
      if(lb > 0) g_lastBuyPrice = NormPrice(lb);
      double ls = LastSellOpenPriceFromMarket();
      if(ls > 0) g_lastSellPrice = NormPrice(ls);
   }
}
//+------------------------------------------------------------------+
