# Buy Grid Recovery + Fixed Sell Hedge (MT5)

File: `BuyGridRecoveryHedge.mq5`

## Install
1. Copy `BuyGridRecoveryHedge.mq5` into MetaTrader 5 → `MQL5/Experts/`
2. Open MetaEditor → Compile (F7)
3. Attach to **XAUUSD** chart (any TF; logic is tick-based)
4. Allow Algo Trading

## Defaults
| Input | Default |
|-------|---------|
| Grid Step | 5.00 USD |
| Initial Buy | 0.01 |
| Sell Hedge | 0.01 (fixed) |
| Mini Profit | $0.20 (only before downside) |
| Basket Target | $96 |
| Daily DD | 30% |

## Flow
NEW CYCLE → BUY 0.01 → Upside OFF → wait downside  
↓ GridStep → BUY next lot + SELL 0.01 → Upside ON  
Both directions continue with fixed Buy lot array until basket ≥ $96  
or Mini $0.20 if still waiting for downside  
Daily DD ≥ 30% → close all, stop until next broker day
