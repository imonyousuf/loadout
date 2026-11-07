import { describe, expect, it } from "vitest";
import { LIMITS, PALLET, layerPattern, pack, type Box } from "./pack";
import { PRODUCTS, PRODUCT_BY_ID } from "./products";

const p = (id: string) => PRODUCT_BY_ID[id];
const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.dx - 1e-6 && b.x < a.x + a.dx - 1e-6 &&
  a.z < b.z + b.dz - 1e-6 && b.z < a.z + a.dz - 1e-6 &&
  a.y < b.y + b.dy - 1e-6 && b.y < a.y + a.dy - 1e-6;

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

  it("is deterministic", () => {
    expect(pack(bigOrder())).toEqual(pack(bigOrder()));
  });

  it("returns no pallets for an empty order", () => {
    expect(pack([]).pallets).toEqual([]);
    expect(pack([{ product: p("water"), qty: 0 }]).pallets).toEqual([]);
  });
});
