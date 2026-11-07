# Loadout

Loadout turns a store's beverage order into built pallets and shows the stack in 3D.
Set the cases per product, and it works out each product's best layer pattern, keeps heavy
cases low and crushable chips on top, mixes leftover cases into shared layers, and splits the
load across pallets at the height and weight limits.

## How the packing works

`src/engine/pack.ts`, with tests in `src/engine/pack.test.ts`.

1. **Layer patterns.** For each case size, try splitting the 48 × 40 in deck into two blocks,
   each a grid of the case in one orientation, and keep the split that fits the most cases
   (10 cases of 24 × 500 mL instead of the 9 a plain grid gives).
2. **Full layers first.** Every product fills as many whole layers as it can.
3. **Mixed layers.** Leftover cases of a similar height share layers, placed with MaxRects
   bin packing (best short side fit, rotation allowed).
4. **Stacking.** Heaviest layers first, full layers before mixed, crushable products last.
   A new pallet starts whenever the next layer would pass 60 in or 2,200 lb.

The tests check that every case is placed once, nothing overlaps or leaves the deck, every
pallet stays under its limits, nothing heavy sits on chips, and results are deterministic.

## Run it

```bash
npm install
npm run dev     # local app
npm test        # packing engine tests
npm run build
```

## Built with

React, TypeScript, Vite, three.js with React Three Fiber, Vitest.

Case sizes are typical values for each format, for illustration.
