# Bot flow plan (Gainium jaisa)

> Status: sirf plan hai, code mein abhi kuch nahi badla.
> Reference: Gainium ka open-source dashboard (`Gainium/main-dash-sh`) aur unke help docs.
> Sirf flow aur idea lena hai. Unka code, naam ya design copy nahi karna.

## Abhi hamare code mein kya hai

- **Bot banana aur chalana ek hi file mein hai:** `frontend/src/components/trade/StrategyRunner.tsx` (~1800 lines). Form, chart, backtest, deploy modal aur bot controls sab yahin hain. Ye page `/trade/strategies/[id]` ke andar chhupa hai.
- **Backend:** `StrategyBot` model (`backend/trading/django_orm/models.py`) aur `/api/bots` (list, deploy, pause, resume, stop) kaam kar rahe hain.
- **Safety guard** (max daily loss, losing streak) `bot_worker.py` ke `_risk_entry_guard` mein chal raha hai.
- **Kami 1: band hue trades kahin save nahi hote.** Sirf `events` mein text lines jaati hain, aur API unme se aakhri 25 hi bhejta hai. Isliye bot ki deals table, win rate aur profit chart abhi nahi ban sakte.
- **Kami 2: backtest save nahi hote.** Na history hai, na "Load in settings". Drafts sirf browser ke localStorage mein hain.

## Naya flow (user ki nazar se)

```
Sidebar → Bots → "+ New bot"
  → Wizard: 1) Strategy chuno  2) Quick (Safe/Balanced/Growth) ya Manual
  → Workbench: [Form | Chart | Backtests] ek screen pe
  → Backtest → "Start Paper bot" (ya Live)
  → Bots list → kisi row pe click → Drawer (deals, events, profit) → Edit / Pause / Stop / Clone
```

## Phase 0: Backend foundation (sabse pehle yahi, baaki sab isi pe tika hai)

1. **Naya `BotDeal` table:** har band trade ki ek row. Fields: bot, coin, side, entry/exit time aur price, qty, PnL, fees, band hone ki wajah (SL / TP / trail / manual). Bot worker trade band karte waqt isme likhega.
2. **Naya `BacktestRun` table:** user, strategy, params, summary metrics aur time. Isse backtest history aur "Load in settings" dono ban jaayenge.
3. **`StrategyBot` mein naye fields:**
   - `name`
   - `group_id`: 3-coin deploy ke teeno bots ek group mein dikhenge
   - Events ko text ki jagah structured `{time, type, text}` banana
4. **Naye APIs:**
   - `GET /api/bots/<id>`
   - `GET /api/bots/<id>/deals`
   - `GET /api/bots/<id>/events`
   - `PATCH /api/bots/<id>`: settings edit, jo agle trade se lagengi
   - `POST /api/bots/<id>/clone`
   - Bulk pause / resume / stop
   - `POST /api/backtests`, `GET /api/backtests`

## Phase 1: Navigation aur routes

- Left sidebar banana, jisme ho: Overview, Bots, Terminal (abhi wala `/trade`), Portfolio, Screener, Risk, Calculators, AI, Club.
- Naye routes:
  - `/bots`: list
  - `/bots/new`: wizard
  - `/bots/new/[strategy]`: workbench
  - `/bots/[id]`: detail aur edit
- Purana `/trade/strategies/[id]` naye `/bots/new/[id]` pe redirect ho jaayega, taaki purane links na tootein.

## Phase 2: New bot wizard

- **Step 1, strategy cards:** catalogue se. Jo strategies bot chala sakti hain (`autoTrade`) unpe "Bot ready" badge. Baaki pe "Backtest only".
- **Step 2:** Quick (Safe/Balanced/Growth ke cards, jo `PresetPicker` pehle se hai) ya Manual (scratch se).

## Phase 3: Workbench (StrategyRunner ko todna)

- **Form, sections mein:**
  - Basic: name, Paper/Live, Delta account, coin(s), timeframe
  - Strategy params
  - Exit: SL/TP
  - **Bot Controller:** max daily loss aur losing streak (dono pehle se hain), plus naye "X profit pe band" aur "X trades ke baad band"
  - Advanced
- **Quick / Manual toggle:** Quick mein sirf coin, capital aur preset.
- **Chart:** abhi wala `CandleChart`, saath mein entry, SL aur TP ki lines.
- **Backtests:** har run ka ek card. Card kholne pe abhi wala `BacktestResults` (5 tabs). Har card pe "Load in settings".
- **Footer:** "Start Paper bot" / "Start Live bot". Saath mein checklist: backtest chala ya nahi, trades kitne hain, risk kitna hai.

## Phase 4: Bots list aur drawer

- **Table:** name, coin, Paper/Live, status, open position, realized/unrealized PnL, trades, win rate, kab start hua.
- Filters `MyStrategiesPanel` se reuse honge (All / Live / Paper / Paused / Draft / Archived). Checkbox se bulk actions.
- **Drawer:** summary, profit chart, deals table, events log, settings.
- **Drawer actions:** Pause, Resume, Stop, Stop & close position, Clone, Edit.

## Phase 5: Bot detail aur edit

- Wahi workbench, bas upar ek extra "Deals" tab.
- Edit karne pe change agle trade se lagega. Ye baat UI mein saaf likhi hogi.

## Phase 6: Overview aur onboarding

- Overview pe total balance, bots ka status, top deals aur latest orders.
- Checklist: Delta API connect karo → pehla backtest → paper bot → live bot.

## Phase 7: Baad mein

- Coin ke ATR aur drawdown se khud tune hone wale presets
- Confidence Grade (trades ki ginti se A+ se F)
- Strategy vs Random test (T-test)
- Multiple TP aur trailing TP
- Telegram alerts
- Trade Journal

## Order

Phase 0 → 1 → 3 → 4 → 2 → 5 → 6.

Workbench aur list ki value sabse zyada hai, aur wizard unke upar ek patli layer hai, isliye use baad mein rakha hai. Ek phase poora karke test karenge, phir agla shuru.

## Shuru karne se pehle decisions (abhi baaki hain)

1. **`/trade` ka kya karein?** Suggestion: ise "Terminal" (manual trading) bana dein, aur bot ka saara kaam `/bots` mein chala jaaye.
2. **Live se pehle paper zaroori ho?** Suggestion: haan, kam se kam kuch din ya kuch trades paper pe chalne ke baad hi "Start Live" khule.
3. **Multi-coin bot.** Suggestion: DB mein har coin ka alag bot hi rahe, UI mein `group_id` se ek saath dikhein.
4. **Drafts.** localStorage se hata ke backend mein save karein, taaki dusre device pe bhi dikhein?
