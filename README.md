# Couch of Power

Browser game and simulations for the party game **Couch of Power** (also known as Four on the Couch).

**Site (GitHub Pages):** https://denyspiven.github.io/Couch-of-Power/

## Rules (short)

- 8 people, 2 teams of 4, 9 seats in a circle; seats 1–4 are the **couch**, one seat is empty.
- Everyone holds a secret paper with a name.
- Whoever has the empty seat on their **right** calls a name; whoever holds that paper sits in the empty seat and **swaps papers** with the caller.
- Goal: get all 4 teammates on the couch.
- Start: teams alternate around the circle, couch is 2+2, empty seat is opposite the couch (seat 7 of 9).
- Official rules: do not call the name on your own paper; do not call the same name twice in a row.

## Pages

| Page | What it does |
|------|----------------|
| [Game](./index.html) | Manual play: circle, couch, papers, moves, win |
| [Simulations](./sim.html) | Win stats across unique seatings (mirrors removed) |
| [Stats](./stats.html) | Saved simulation runs from this browser |

## Development

```bash
npm install
npm run dev      # http://localhost:5173/Couch-of-Power/
npm test
npm run build
```

Static build output is in `dist/`. Deploy to Pages via `.github/workflows/pages.yml` (after push to `master`, enable Pages: Source = **GitHub Actions**).

## Notes

- Static Vite site, no backend.
- UI and docs in English.
- Core logic: `src/game/engine.js`; rules: `src/game/rules.js`; strategies: `src/game/strategies.js`; seating census: `src/game/configs.js`.
- Table setup (players, team sizes, couch, empty seat) is editable and stored in `localStorage`.
- Default 8p layouts: **630** raw → **318** unique under mirror → **163** with A↔B swap; **314** playable.
