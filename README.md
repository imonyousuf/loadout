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
3. **Part and mixed layers.** Leftover cases of one product take the spots of its pattern
   nearest the middle of the skid. Leftovers of several products with nearly the same height
   share a layer, placed with MaxRects bin packing and centred, so every layer has a flat top.
4. **Stacking like a loader.** Start from the fewest pallets the totals allow. Each sturdy
   layer goes on the shortest pallet it fits on, which keeps every pallet heavy at the bottom
   and spreads the headroom evenly. Crushable products (chips) then ride on top of the drink
   pallets. If anything does not fit under 60 in and 2,200 lb, try again with one more pallet.

The tests check that every case is placed once, nothing overlaps or leaves the deck, every
pallet stays under its limits, nothing heavy sits on chips, chips never start a pallet when
there is room on top of drinks, pallets stay heavy at the bottom, and results are deterministic.

## Your own products

Use **Add a product** to enter a name, category, case size and weight. The form shows how many
fit per layer before you add it. Products you add are saved in your browser.

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
