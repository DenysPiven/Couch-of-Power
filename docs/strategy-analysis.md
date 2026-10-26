# Couch of Power — strategy analysis summary

Classic rules: 8 players, A4/B4, couch seats 0–3, empty starts opposite the couch (`empty@6`), caller = empty+1.

## Official start + perfect information (all papers known)

| Question | Answer |
|----------|--------|
| Who moves first? | Always team **A** (caller seat 7) |
| Can A force a win? | **Yes — 100%** of random paper deals tested (n=40) |
| How? | Keep the turn every move; finish in **8** moves → `AAAA` on the couch |
| If A blunders and gives B the turn? | With perfect play B often forces a win in **3–4** moves |

So: when both sides know every paper and A plays optimally, **first team wins in 100% of variants** (paper shuffles on the official seating).

## Heuristic matchups on official start (n≈300–500)

| Matchup | A win | B win | Draw (≤200 moves) |
|---------|------:|------:|------------------:|
| Greedy vs random | ~98% | 0% | ~2% |
| Keep-turn vs keep-turn | ~16% | 0% | ~84% |
| Greedy vs greedy | 0% | 0% | ~100% |
| Adversarial vs adversarial | 0% | 0% | ~100% |
| Random vs random | ~35% | ~37% | ~27% |

Draw here means no winner before the move limit — typical when both play “careful” heuristics and cycle.

## All unique playable seatings (not only official)

Mirror-canonical census: **314** playable layouts (from 630 raw).

| Matchup | First-caller wins | Second wins | Draw |
|---------|------------------:|------------:|-----:|
| Greedy vs greedy | **24.5%** | 0.3% | 75.2% |
| Keep vs keep | **23.9%** | 0% | 76.1% |

Outside the official start, first-to-move is **not** a 100% force under these heuristics; many positions stall.

## Takeaway

- **Official table + all papers known + optimal A** → first team wins **100%**.
- **All seatings + greedy/keep heuristics** → first caller wins only about **24–25%**; most games draw at the limit.
