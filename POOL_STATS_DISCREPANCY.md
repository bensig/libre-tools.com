# Loan Pool Metrics Audit

## Summary
- The on-chain table `loan::globalstats` lags behind live per-pool figures by **≈7,578.81 USDT** in the `outstanding_amount` field.
- The `loan` contract’s USDT balance (`get_currency_balance`) is **≈46,245.85 USDT**, while `loan::poolstats` still reports **≈46,269.69 USDT** available, leaving a **≈23.84 USDT** surplus in pool-level accounting.
- The previous UI logic trusted `globalstats`, which produced a “Tether Pool Size” of ~157 K USDT. Live pool data shows the correct total near **164.6 K USDT**.

## Data Sources
| Source | Query | Key Fields |
| --- | --- | --- |
| Token balance | `get_currency_balance` (`code=usdt.libre`, `account=loan`, `symbol=USDT`) | Available USDT held by the loan contract |
| Global stats | `loan::globalstats` (`scope=loan`) | Aggregate `outstanding_amount`, `deposit`, etc. |
| Pool stats | `loan::poolstats` (`scope=loan`) | Per-pool `available`, `outstanding_amount`, `deposit`, etc. |
| Active loans | `loan::loan` (`scope=loan`) | Individual loan `outstanding_amount` values |

## Reproducing the Discrepancy
1. **Fetch the loan contract balance**
   ```bash
   curl -s https://lb.libre.org/v1/chain/get_currency_balance \
     -d '{"code":"usdt.libre","account":"loan","symbol":"USDT"}'
   ```
   Expected: `["46245.84948047 USDT"]`

2. **Fetch aggregate global stats**
   ```bash
   curl -s https://lb.libre.org/v1/chain/get_table_rows \
     -d '{"code":"loan","table":"globalstats","scope":"loan","limit":1,"json":true}'
   ```
   Expected: `outstanding_amount` ≈ `110772.98522487 USDT`

3. **Fetch per-pool stats**
   ```bash
   curl -s https://lb.libre.org/v1/chain/get_table_rows \
     -d '{"code":"loan","table":"poolstats","scope":"loan","limit":1000,"json":true}'
   ```
   Sum `available` → ≈ `46269.69123702 USDT`
   Sum `outstanding_amount` → ≈ `118351.79815108 USDT`

4. **Fetch active loans to confirm totals**
   ```bash
   curl -s https://lb.libre.org/v1/chain/get_table_rows \
     -d '{"code":"loan","table":"loan","scope":"loan","limit":1000,"json":true}'
   ```
   Sum `outstanding_amount` for `status == 0` → matches pool outstanding: ≈ `118351.79815108 USDT`

5. **Compare aggregates**
   - `globalstats.outstanding_amount` vs. pooled/loan totals → gap ≈ **7,578.81 USDT**.
   - `poolstats.available` vs. actual contract balance → gap ≈ **23.84 USDT**.

## Interpretation
- `loan::poolstats` and `loan::loan` provide up-to-date outstanding balances; the UI should rely on them for live utilization.
- `globalstats` appears to update less frequently (likely during a periodic `process` action). When stale, downstream tools under-report pool liquidity.
- A small residual between the contract balance and pooled availability suggests funds already moved out (e.g., in redemption handling) but not yet reflected in `poolstats`.

## Verifying the UI
1. Start the app: `npm run dev`
2. Visit `http://localhost:5173/loans/mainnet/active`
3. Confirm the dashboard cards show:
   - **Tether Pool Size** ≈ 164.6 K USDT
   - **Available** ≈ 46.27 K USDT
   - **Utilized** ≈ 118.35 K USDT
4. Cross-check pool totals under a browser console by re-running the curl requests above.

## Next Steps
- Keep the UI sourced from live per-pool data (implemented in `src/LoanTracker.jsx`).
- Notify contract maintainers so `loan::globalstats` remains synchronized (e.g., ensure maintenance jobs run consistently).
- Investigate the 23.84 USDT surplus in `poolstats.available` to verify whether redemption bookkeeping needs an adjustment.
