# Metals Trend Rider (MT5): XAUUSD / XAGUSD, H12

File: `MetalsTrendRider.mq5`. Research: `backend/trading/scripts/metals_trend_research.py`.
App mein yahi rules **Metals Rider** naam se Strateo / strategy catalogue mein hain (gold perps: PAXG, XAUT).

## Rules
Har faisla sirf **band candle** par hota hai, aur entry agli candle par.

| | |
|---|---|
| Timeframe | **H12** |
| LONG | close > pichhli 30 candles ka highest high **aur** close > EMA 200 |
| SHORT | close < pichhli 30 candles ka lowest low **aur** close < EMA 200 **aur** EMA 50 < EMA 200 |
| Initial stop | entry ∓ 2 × ATR(14, Wilder), broker par SL ke roop mein |
| Trailing | har band candle par SL = pichhli 15 candles ka low (long) / high (short). SL sirf aage khisakta hai |
| Exit | SL lagne par, ya ulta signal aane par (tab position palat jaati hai) |
| Size | SL lage to equity ka 1% jaaye; notional max 5× equity |

Koi fixed target nahi hai. Mahine mein ~1 trade aata hai, win rate ~45% hai, aur kamai kuch lambe trends se aati hai.

## H4 se H12 kyun
Pehla version H4 par tha. Bybit PAXGUSDT (gold token perp, Mar 2022 se) par check kiya to pata chala ki **H4 rules 2022-06 → 2024-06 ki choppy market mein haare**, MT5 jaise kam kharche par bhi. Timeframe bada karne par dono periods mein profitable settings badhti gayi:

| Timeframe | MT5 cost: combos jo dono periods mein profit mein | Exchange fee + funding |
|---|---|---|
| 4h | 39% | 3% |
| 8h | 72% | 0% |
| **12h** | **100%** | **100%** |
| 1d | 97% | 89% |

(36 combos: channel 20/30/55 × trail 10/15/20 × stop 2/3 ATR × shorts on/off.)

## Backtest (fees + spread + slippage + swap/funding ke saath), 1% risk

**PAXGUSDT 12h, Jun 2022 → Nov 2026 (4.4 saal):**

| | Return | CAGR | Max DD | Trades | Win | PF | Buy & hold |
|---|---|---|---|---|---|---|---|
| MT5 kharche | +33.4% | 6.7% | 11.8% | 50 | 44% | 2.31 | +94% |
| Exchange (Delta fee + GST + slippage + long funding) | +24.0% | 5.0% | 12.2% | 50 | 44% | 1.89 | +94% |
| — sirf 2022-06 → 2024-06 (choppy), exchange | +5.7% | | 4.8% | 21 | | 1.59 | +26% |
| — sirf 2024-07 → 2026-11 (trend), exchange | +17.3% | | 12.2% | 29 | | 2.05 | +54% |
| Tulna: wahi rules **4h** par, 2022-06 → 2024-06, exchange | **−13.3%** | | 15.7% | 69 | | 0.67 | |

**XAUUSD / XAGUSD H12, Dec 2024 → Nov 2026** (COMEX GC=F / SI=F, New York close par aligned, MT5 broker jaisa):

| | Return | Max DD | Trades | PF | Buy & hold |
|---|---|---|---|---|---|
| XAUUSD | +9.5% | 8.5% | 17 | 2.38 | +32.5% |
| XAUUSD, 3× cost | +9.3% | 8.5% | 17 | 2.32 | |
| XAGUSD | +12.4% | 10.9% | 18 | 2.28 | +36.4% |

- 36 ke 36 combos chaaron jagah profitable rahe: PAXG 2022–24, PAXG 2024–26, GC=F aur SI=F.
- Daily (GLD/SLV, 2007 → 2026, 20 saal): yahi rule family 48/48 combos gold aur silver dono par, dono decades mein profitable. Lekin kamai chhoti hai, ~1–2%/saal 1% risk par.

Kharche: gold 0.01%/side, silver 0.04%/side (MT5), ya Delta 0.079%/side (exchange). MT5 long swap = us saal ki US rate + 2.5% markup, short 1.5%/saal. Exchange long funding 0.01%/8h (~11%/saal); PAXG par funding fees se 3 guna zyada kharcha tha.

## Sach jo pata hona chahiye
- **Return chhota hai: ~5–7% saal 1% risk par.** Gold khud isse tez chadha (+94%). Is system ka fayda drawdown mein hai: gold Jan 2026 ke high se 37% gira, system ka max DD ~12% raha.
- 2% risk par PAXG (exchange kharche) +50.3% (9.7%/saal) raha, lekin max DD bhi 22.3% ho gaya.
- Profit zyaadatar longs se aaya. Shorts ka result mixed tha: 2022–23 aur silver par madad ki, lekin 2026 mein PAXG par loss diya.
- Win rate ~45% hai. PAXG par sabse lambi losing streak 7 trades ki thi, aur aisa phir ho sakta hai. EA band mat karna.
- Silver ka H12 data sirf ~2 saal ka hai (18 trades), isliye silver par bharosa gold se kam rakho.

## Minimum account (0.01 lot)
H12 par 2×ATR stop abhi gold mein ~$133 aur silver mein ~$3.6 hai, matlab 0.01 lot par loss ~$133 (gold) / ~$178 (silver).
- 1% risk par 0.01 lot ke liye equity chahiye: gold **~$13k**, silver **~$18k**
- `InpMinLotMaxRiskPct = 2` (default) par EA chhote account mein bhi min lot le lega, agar risk 2% tak ho (gold ~$6.6k se)
- Isse chhota account hai to broker ka micro lot (0.001) ya cent account use karo. Warna EA trade skip karke Experts log mein wajah likh dega

## Install
1. `MetalsTrendRider.mq5` ko MetaTrader 5 → `MQL5/Experts/` mein copy karo
2. MetaEditor mein compile karo (F7)
3. **XAUUSD** chart par lagao (chart ka TF kuch bhi ho, signal `InpTimeframe` = H12 par banta hai). Silver ke liye alag XAGUSD chart par lagao
4. Algo Trading on karo

## Pehle MT5 Strategy Tester mein verify karo
1. Strategy Tester → Expert: MetalsTrendRider, Symbol XAUUSD, Period H12
2. Modelling: **Every tick based on real ticks** (broker ka asli spread aur swap)
3. Dates: jitni history broker de, kam se kam 2015 → aaj
4. Deposit $15,000, leverage broker wala
5. Dekhne layak: Profit Factor > 1.3, Max DD < 20%, aur 2022–2023 jaise choppy saal mein bada loss na ho

## Inputs
| Input | Default | Matlab |
|---|---|---|
| InpTimeframe | H12 | Signal timeframe |
| InpChannel | 30 | Breakout channel |
| InpExitChannel | 15 | Trailing channel |
| InpStopATR | 2.0 | Initial stop, ATR ke multiple mein |
| InpEMAFast / InpEMASlow | 50 / 200 | Regime filter |
| InpAllowShorts | true | Shorts on/off |
| InpRiskPct | 1.0 | Har trade ka risk (% equity) |
| InpMinLotMaxRiskPct | 2.0 | Min lot tabhi lo jab uska risk ≤ ye % ho |
| InpMaxLeverage | 5.0 | Notional cap |
| InpMaxSpreadPoints | 0 | Entry tabhi jab spread ≤ ye ho (0 = off). Rollover ka chauda spread bachane ke liye, jaise gold par 50 |
| InpMagic | 260412 | Magic number |

Research dobara chalane ke liye:
```bash
backend/venv/bin/python backend/trading/scripts/metals_trend_research.py
```
