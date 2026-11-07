import { describe, expect, it } from "vitest";
import { LIMITS, MAX_SEAM, PALLET, layerPattern, pack, perLayer, steadyOn, type Box, type Pallet } from "./pack";
import { PRODUCTS, PRODUCT_BY_ID } from "./products";
import { PRESETS } from "../presets";

const p = (id: string) => PRODUCT_BY_ID[id];
const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.dx - 1e-6 && b.x < a.x + a.dx - 1e-6 &&
  a.z < b.z + b.dz - 1e-6 && b.z < a.z + a.dz - 1e-6 &&
  a.y < b.y + b.dy - 1e-6 && b.y < a.y + a.dy - 1e-6;

/** Seeded random orders, the same on every run. */
function randomOrders(count: number, seed = 11) {
  let r = seed;
  const rand = () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648;
  return Array.from({ length: count }, () =>
    PRODUCTS.map((prod) => ({ product: prod, qty: rand() < 0.3 ? 0 : Math.floor(rand() * (prod.fragile ? 20 : 70)) })),
  );
}

/** Every layer of a pallet with its cases, bottom first. */
const layersOf = (pl: Pallet) => pl.layers.map((l) => ({ ...l, boxes: pl.boxes.filter((b) => Math.abs(b.y - l.y) < 1e-6) }));

const bigOrder = () => [
  { product: p("cans24"), qty: 140 },
  { product: p("fridge12"), qty: 37 },
  { product: p("bottle24"), qty: 61 },
  { product: p("twoLitre"), qty: 45 },
  { product: p("sports"), qty: 23 },
  { product: p("water"), qty: 50 },
  { product: p("chips"), qty: 19 },
];

describe("layerPattern", () => {
  it("fits every product on the deck at least once", () => {
    for (const prod of PRODUCTS) expect(layerPattern(prod.length, prod.width).length).toBeGreaterThan(0);
  });

  it("keeps every case on the deck and apart from the others", () => {
    for (const prod of PRODUCTS) {
      const r = layerPattern(prod.length, prod.width);
      for (const a of r) {
        expect(a.x).toBeGreaterThanOrEqual(-1e-9);
        expect(a.z).toBeGreaterThanOrEqual(-1e-9);
        expect(a.x + a.w).toBeLessThanOrEqual(PALLET.length + 1e-9);
        expect(a.z + a.d).toBeLessThanOrEqual(PALLET.width + 1e-9);
      }
      for (let i = 0; i < r.length; i++)
        for (let j = i + 1; j < r.length; j++) {
          const a = r[i], b = r[j];
          const hit = a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.z < b.z + b.d - 1e-9 && b.z < a.z + a.d - 1e-9;
          expect(hit).toBe(false);
        }
    }
  });

  it("beats a plain single-orientation grid when rotating helps", () => {
    // 15.6 × 10.5 cases: a plain grid fits 3 × 3 = 9, mixing orientations fits 10
    expect(layerPattern(15.6, 10.5).length).toBeGreaterThanOrEqual(10);
  });
});

describe("pack", () => {
  it("places every case exactly once", () => {
    const res = pack(bigOrder());
    const placed = res.pallets.reduce((s, pl) => s + pl.boxes.length, 0);
    expect(placed).toBe(res.totalCases);
    for (const line of bigOrder()) {
      const n = res.pallets.flatMap((pl) => pl.boxes).filter((b) => b.productId === line.product.id).length;
      expect(n).toBe(line.qty);
    }
  });

  it("never overlaps cases or leaves the deck", () => {
    for (const pl of pack(bigOrder()).pallets) {
      for (const b of pl.boxes) {
        expect(b.x).toBeGreaterThanOrEqual(-1e-6);
        expect(b.z).toBeGreaterThanOrEqual(-1e-6);
        expect(b.x + b.dx).toBeLessThanOrEqual(PALLET.length + 1e-6);
        expect(b.z + b.dz).toBeLessThanOrEqual(PALLET.width + 1e-6);
      }
      for (let i = 0; i < pl.boxes.length; i++)
        for (let j = i + 1; j < pl.boxes.length; j++) expect(intersects(pl.boxes[i], pl.boxes[j])).toBe(false);
    }
  });

  it("stays under the height and weight limits on every pallet", () => {
    for (const pl of pack(bigOrder()).pallets) {
      expect(pl.loadHeight).toBeLessThanOrEqual(LIMITS.maxLoadHeight + 1e-6);
      expect(pl.loadWeight).toBeLessThanOrEqual(LIMITS.maxLoadWeight + 1e-6);
      expect(Math.max(...pl.boxes.map((b) => b.y + b.dy))).toBeLessThanOrEqual(pl.loadHeight + 1e-6);
    }
  });

  it("never puts a heavy case on top of chips", () => {
    for (const pl of pack(bigOrder()).pallets) {
      const chips = pl.boxes.filter((b) => b.productId === "chips");
      if (!chips.length) continue;
      const lowestChip = Math.min(...chips.map((b) => b.y));
      const above = pl.boxes.filter((b) => b.y >= lowestChip && b.productId !== "chips");
      expect(above).toEqual([]);
    }
  });

  it("rides chips on top of drinks instead of starting a pallet with them", () => {
    for (const preset of PRESETS) {
      const res = pack(PRODUCTS.map((prod) => ({ product: prod, qty: preset.qty[prod.id] ?? 0 })));
      for (const pl of res.pallets) {
        const chips = pl.boxes.filter((b) => b.productId === "chips");
        const drinks = pl.boxes.filter((b) => b.productId !== "chips");
        if (chips.length) expect(drinks.length, `${preset.name}: a pallet holds only chips`).toBeGreaterThan(0);
        for (const c of chips) expect(c.y, `${preset.name}: chips on the deck`).toBeGreaterThan(0);
      }
    }
  });

  it("keeps every pallet heavy at the bottom", () => {
    for (const pl of pack(bigOrder()).pallets) {
      const sturdy = pl.layers.filter((l) => !l.productIds.includes("chips"));
      const avg = sturdy.map((l) => {
        const boxes = pl.boxes.filter((b) => Math.abs(b.y - l.y) < 1e-6);
        return boxes.reduce((s, b) => s + b.weight, 0) / boxes.length;
      });
      const fullAvg = avg.filter((_, i) => sturdy[i].kind === "full");
      for (let i = 1; i < fullAvg.length; i++) expect(fullAvg[i]).toBeLessThanOrEqual(fullAvg[i - 1] + 1e-6);
    }
  });

  it("spreads the load so pallets come out close in height", () => {
    const hs = pack(bigOrder()).pallets.map((pl) => pl.loadHeight);
    expect(Math.max(...hs) - Math.min(...hs)).toBeLessThan(20);
  });

  it("puts heavier full layers lower than lighter ones", () => {
    const pl = pack([
      { product: p("fridge12"), qty: 40 },
      { product: p("sports"), qty: 40 },
    ]).pallets[0];
    const firstSports = Math.min(...pl.boxes.filter((b) => b.productId === "sports").map((b) => b.y));
    const firstFridge = Math.min(...pl.boxes.filter((b) => b.productId === "fridge12").map((b) => b.y));
    expect(firstSports).toBeLessThan(firstFridge);
  });

  it("opens a new pallet when one would get too tall", () => {
    const res = pack([{ product: p("twoLitre"), qty: 60 }]);
    expect(res.pallets.length).toBeGreaterThan(1);
  });

  it("rests every case on the cases below it", () => {
    const orders = [...PRESETS.map((preset) => PRODUCTS.map((prod) => ({ product: prod, qty: preset.qty[prod.id] ?? 0 }))), ...randomOrders(120)];
    for (const order of orders) {
      for (const pl of pack(order).pallets) {
        const ls = layersOf(pl);
        // each case touches the layer below over enough of its base, with its middle over that contact
        for (let i = 1; i < ls.length; i++) expect(steadyOn(ls[i - 1], ls[i]), `layer ${i + 1} of ${ls.length}`).toBe(true);
      }
    }
  });

  it("squares every whole layer on a pallet up to one footprint", () => {
    const orders = [...PRESETS.map((preset) => PRODUCTS.map((prod) => ({ product: prod, qty: preset.qty[prod.id] ?? 0 }))), ...randomOrders(80, 3)];
    for (const order of orders) {
      for (const pl of pack(order).pallets) {
        const whole = layersOf(pl).filter((l) => l.whole);
        if (whole.length < 2) continue;
        const box = (l: (typeof whole)[number]) => ({
          x0: Math.min(...l.boxes.map((b) => b.x)),
          x1: Math.max(...l.boxes.map((b) => b.x + b.dx)),
          z0: Math.min(...l.boxes.map((b) => b.z)),
          z1: Math.max(...l.boxes.map((b) => b.z + b.dz)),
        });
        const boxes = whole.map(box);
        const outer = {
          x0: Math.min(...boxes.map((b) => b.x0)),
          x1: Math.max(...boxes.map((b) => b.x1)),
          z0: Math.min(...boxes.map((b) => b.z0)),
          z1: Math.max(...boxes.map((b) => b.z1)),
        };
        // no whole layer sits in from the outside of the load by more than one seam
        for (const b of boxes) {
          expect(b.x0 - outer.x0).toBeLessThanOrEqual(MAX_SEAM / 2 + 1e-6);
          expect(outer.x1 - b.x1).toBeLessThanOrEqual(MAX_SEAM / 2 + 1e-6);
          expect(b.z0 - outer.z0).toBeLessThanOrEqual(MAX_SEAM + 1e-6);
          expect(outer.z1 - b.z1).toBeLessThanOrEqual(MAX_SEAM + 1e-6);
        }
      }
    }
  });

  it("never sets drinks on top of chips, in any order", () => {
    for (const order of randomOrders(120, 5)) {
      for (const pl of pack(order).pallets) {
        const ls = layersOf(pl);
        const firstChips = ls.findIndex((l) => l.productIds.includes("chips"));
        if (firstChips < 0) continue;
        for (const l of ls.slice(firstChips)) expect(l.productIds).toEqual(["chips"]);
      }
    }
  });

  it("lets cases of the same size share one complete layer", () => {
    // 6 bottles and 4 waters are both about 15.6 × 10.5: together they make one whole layer
    const res = pack([
      { product: p("bottle24"), qty: 16 },
      { product: p("water"), qty: 14 },
    ]);
    const layers = res.pallets.flatMap((pl) => pl.layers);
    const shared = layers.filter((l) => l.productIds.length === 2);
    expect(shared.length).toBe(1);
    expect(shared[0].whole).toBe(true);
    expect(shared[0].count).toBe(10);
  });

  it("splits a product too heavy for a whole layer", () => {
    const kegs = { id: "kegs", name: "Kegs", detail: "", category: "Beer", length: 16, width: 16, height: 14, weight: 450, color: "#fff" };
    expect(perLayer(kegs)).toBe(4);
    const res = pack([{ product: kegs, qty: 12 }]);
    expect(res.pallets.flatMap((pl) => pl.boxes).length).toBe(12);
    for (const pl of res.pallets) expect(pl.loadWeight).toBeLessThanOrEqual(LIMITS.maxLoadWeight + 1e-6);
  });

  it("packs a large order fast enough to follow every keystroke", () => {
    const order = PRODUCTS.map((prod) => ({ product: prod, qty: 150 }));
    const t = performance.now();
    pack(order);
    expect(performance.now() - t).toBeLessThan(1000);
  });

  it("is deterministic", () => {
    expect(pack(bigOrder())).toEqual(pack(bigOrder()));
  });

  it("packs a product the user adds", () => {
    const iced = { id: "custom-iced", name: "Iced tea", detail: "", category: "Tea", length: 13, width: 9, height: 7.5, weight: 21, color: "#fff" };
    const res = pack([{ product: iced, qty: 33 }, { product: p("water"), qty: 12 }]);
    expect(res.pallets.flatMap((pl) => pl.boxes).filter((b) => b.productId === "custom-iced").length).toBe(33);
  });

  it("refuses a case that is bigger than the skid", () => {
    const huge = { id: "huge", name: "Huge", detail: "", category: "X", length: 60, width: 50, height: 10, weight: 10, color: "#fff" };
    expect(() => pack([{ product: huge, qty: 1 }])).toThrow();
  });

  it("returns no pallets for an empty order", () => {
    expect(pack([]).pallets).toEqual([]);
    expect(pack([{ product: p("water"), qty: 0 }]).pallets).toEqual([]);
  });
});
