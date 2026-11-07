# Loadout

Loadout turns a store's beverage order into built pallets and shows the stack in 3D.
Set the cases per product, and it works out each product's best layer pattern, keeps heavy
cases low and crushable chips on top, mixes leftover cases into shared layers, and splits the
load across pallets at the height and weight limits.

## How the packing works

`src/engine/pack.ts`, with tests in `src/engine/pack.test.ts`.

1. **Layer patterns.** For each case size, try splitting the 48 × 40 in deck into two blocks,
   each a grid of the case in one orientation. Keep the split that fits the most cases
   (10 cases of 24 × 500 mL instead of the 9 a plain grid gives), and among equals the one whose
   blocks line up, so it squares up cleanly.
2. **Full layers first.** Every product fills as many whole layers as it can. A product too
   heavy for a whole layer gets layers of as many cases as the 2,200 lb limit allows.
3. **Shared and part layers.** Leftover cases that fill the same spots (500 mL bottles and
   water) make complete layers together. Other leftovers of nearly the same height share a layer
   packed with MaxRects, and a few cases of one product sit as one tight block in the middle.
4. **Stacking like a loader.** Start from the fewest pallets the totals allow. Each whole drink
   layer goes on the shortest pallet it fits on, keeping every pallet heavy at the bottom and
   evenly tall. Chips then claim the flat tops of drink pallets, and part layers fill in where
   they leave nothing hanging. A short search tries other spots before adding a pallet.
5. **Square and steady.** Every whole layer on a pallet is pushed out to the same footprint, the
   way a loader squares a load, so each pallet reads as one solid block. Each case must touch the
   cases below over at least 40% of its base with its middle over that contact, so nothing hangs
   over empty space.

The 22 tests check that every case is placed once, nothing overlaps or leaves the deck, every
pallet stays under 60 in and 2,200 lb, nothing is ever set on chips, every case rests on the
cases below it, whole layers square up to one footprint, heavy products split instead of
failing, a large order packs fast enough to follow typing, and results are deterministic.

## Your own products

Use **Add a product** to enter a name, category, case size and weight. The form shows how many
fit per layer before you add it. Products you add are saved in your browser.

## The tour

A first visit opens a short video tour; **How it works** in the header plays it again. The video is
made with [HyperFrames](https://hyperframes.heygen.com) from real footage of the app: `tour/`
holds the recorder and the film project. Opening the app with `?capture` puts the 3D view in
recording mode, where it draws one exact frame each time the recorder steps it.

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
