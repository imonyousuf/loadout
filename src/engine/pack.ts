import type { Product } from "./products";

/** A standard North American skid: 48 × 40 in. */
export const PALLET = { length: 48, width: 40, deckHeight: 5.5, weight: 45 } as const;
/** Limits for one built pallet (load only, deck excluded). */
export const LIMITS = { maxLoadHeight: 60, maxLoadWeight: 2200 } as const;
/** Cases whose heights differ by at most this much may share a mixed layer, so its top stays flat enough to stack on. */
const HEIGHT_TOLERANCE = 0.6;
/** The widest gap a loader leaves between two cases when squaring a layer out to the edges of the load. */
export const MAX_SEAM = 2.5;
/** A case must touch the cases below over at least this share of its base, with its middle over that contact. */
export const MIN_CONTACT = 0.4;

export interface OrderLine {
  product: Product;
  qty: number;
}

/** One placed case. x runs along the 48 in side, z along the 40 in side, y is up. */
export interface Box {
  productId: string;
  x: number;
  y: number;
  z: number;
  /** footprint along x and z after rotation, and height */
  dx: number;
  dz: number;
  dy: number;
  weight: number;
  /** order in which the case is placed, used to animate the build */
  seq: number;
}

interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

type Flat = Omit<Box, "y" | "seq">;

export interface Layer {
  /** full: a whole pattern of one product; part: some cases of one product; mixed: several products */
  kind: "full" | "part" | "mixed";
  /** covers the deck with a complete pattern, so another whole layer can sit on it */
  whole: boolean;
  height: number;
  weight: number;
  fragile: boolean;
  boxes: Flat[];
  /** whole layers: the pattern spot each case sits in, used to square the layer up */
  cells?: Rect[];
  /** part layers: every spot of the product's own pattern, so the layer can be seated over the cases below */
  pattern?: Rect[];
  /** set while stacking, to remember which pallets were already checked */
  id?: number;
}

export interface Pallet {
  boxes: Box[];
  layers: { y: number; height: number; kind: Layer["kind"]; whole: boolean; count: number; productIds: string[] }[];
  loadHeight: number;
  loadWeight: number;
  /** share of the load's bounding volume filled by cases, 0..1 */
  cubeUse: number;
}

export interface PackResult {
  pallets: Pallet[];
  totalCases: number;
  totalWeight: number;
}

const extent = (rects: Rect[]) => ({
  w: Math.max(...rects.map((r) => r.x + r.w)) - Math.min(...rects.map((r) => r.x)),
  d: Math.max(...rects.map((r) => r.z + r.d)) - Math.min(...rects.map((r) => r.z)),
});

/**
 * The best grid of identical cases on the pallet deck.
 * Tries splitting the deck into two blocks along either side, each block a grid of the case
 * in one orientation, and keeps the split that fits the most cases (then the one that spreads
 * widest, so it squares up with fewer gaps).
 */
export function layerPattern(length: number, width: number, L = PALLET.length, W = PALLET.width): Rect[] {
  const grid = (ox: number, oz: number, spanX: number, spanZ: number, a: number, b: number): Rect[] => {
    const out: Rect[] = [];
    const nx = Math.floor(spanX / a + 1e-9);
    const nz = Math.floor(spanZ / b + 1e-9);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) out.push({ x: ox + i * a, z: oz + j * b, w: a, d: b });
    return out;
  };
  let best: Rect[] = [];
  let bestRagged = Infinity;
  let bestArea = 0;
  /** two blocks side by side; `ragged` is how far their outer edges differ, which squaring can't hide */
  const consider = (one: Rect[], two: Rect[], alongX: boolean) => {
    const rects = [...one, ...two];
    if (!rects.length) return;
    const e = extent(rects);
    const area = e.w * e.d;
    const ragged = one.length && two.length ? Math.abs(alongX ? extent(one).d - extent(two).d : extent(one).w - extent(two).w) : 0;
    const better =
      rects.length > best.length ||
      (rects.length === best.length && (ragged < bestRagged - 1e-6 || (Math.abs(ragged - bestRagged) <= 1e-6 && area > bestArea + 1e-6)));
    if (better) {
      best = rects;
      bestRagged = ragged;
      bestArea = area;
    }
  };
  for (const [a, b] of [
    [length, width],
    [width, length],
  ]) {
    // split along x: k columns of (a × b), the rest rotated
    for (let k = 0; k * a <= L + 1e-9; k++) consider(grid(0, 0, k * a, W, a, b), grid(k * a, 0, L - k * a, W, b, a), true);
    // split along z
    for (let k = 0; k * b <= W + 1e-9; k++) consider(grid(0, 0, L, k * b, a, b), grid(0, k * b, L, W - k * b, b, a), false);
  }
  return centre(best, L, W);
}

/** Shift a set of rectangles so the group sits in the middle of the deck. */
function centre(rects: Rect[], L: number, W: number): Rect[] {
  if (!rects.length) return rects;
  const minX = Math.min(...rects.map((r) => r.x));
  const minZ = Math.min(...rects.map((r) => r.z));
  const { w, d } = extent(rects);
  const ox = (L - w) / 2 - minX;
  const oz = (W - d) / 2 - minZ;
  return rects.map((r) => ({ ...r, x: r.x + ox, z: r.z + oz }));
}

/**
 * Square a layer out to a target footprint, the way a loader pushes cases to the edges of the
 * load: the columns (or rows) of the pattern spread apart until the outside cases are flush, and
 * the cases inside each column spread the same way. No gap grows past MAX_SEAM; whatever slack is
 * left is shared out as a margin so the layer stays centred.
 */
function squareCells(cells: Rect[], tw: number, td: number): Rect[] {
  if (!cells.length) return cells;
  const ox = (PALLET.length - tw) / 2;
  const oz = (PALLET.width - td) / 2;

  /** positions for items of the given sizes along a span: flush ends, even seams up to MAX_SEAM */
  const lay = (sizes: number[], span: number): number[] | null => {
    const used = sizes.reduce((a, b) => a + b, 0);
    if (used > span + 1e-6) return null;
    const seams = sizes.length - 1;
    const slack = span - used;
    const seam = seams > 0 ? Math.min(MAX_SEAM, slack / seams) : 0;
    let at = (slack - seam * seams) / 2;
    return sizes.map((s) => {
      const p = at;
      at += s + seam;
      return p;
    });
  };

  const attempt = (byColumns: boolean): Rect[] | null => {
    const along = (r: Rect) => (byColumns ? r.x : r.z);
    const size = (r: Rect) => (byColumns ? r.w : r.d);
    const across = (r: Rect) => (byColumns ? r.z : r.x);
    const crossSize = (r: Rect) => (byColumns ? r.d : r.w);
    const lines = new Map<string, Rect[]>();
    for (const r of cells) {
      const key = `${along(r).toFixed(3)}:${size(r).toFixed(3)}`;
      if (!lines.has(key)) lines.set(key, []);
      lines.get(key)!.push(r);
    }
    const sorted = [...lines.values()].sort((a, b) => along(a[0]) - along(b[0]));
    for (let i = 1; i < sorted.length; i++) {
      if (along(sorted[i][0]) < along(sorted[i - 1][0]) + size(sorted[i - 1][0]) - 1e-6) return null;
    }
    const linePos = lay(sorted.map((l) => size(l[0])), byColumns ? tw : td);
    if (!linePos) return null;
    const out = new Map<Rect, Rect>();
    for (let i = 0; i < sorted.length; i++) {
      const items = [...sorted[i]].sort((a, b) => across(a) - across(b));
      const pos = lay(items.map(crossSize), byColumns ? td : tw);
      if (!pos) return null;
      items.forEach((r, k) =>
        out.set(r, byColumns ? { x: ox + linePos[i], z: oz + pos[k], w: r.w, d: r.d } : { x: ox + pos[k], z: oz + linePos[i], w: r.w, d: r.d }),
      );
    }
    return cells.map((r) => out.get(r)!);
  };
  return attempt(true) ?? attempt(false) ?? cells;
}

/**
 * MaxRects bin packing for one mixed layer (best short side fit, rotation allowed).
 * Returns the position for a case, or null when it does not fit.
 */
class MaxRects {
  free: Rect[];
  constructor(L: number, W: number) {
    this.free = [{ x: 0, z: 0, w: L, d: W }];
  }
  insert(a: number, b: number): Rect | null {
    let best: Rect | null = null;
    let bestShort = Infinity;
    let bestLong = Infinity;
    for (const f of this.free) {
      for (const [w, d] of [
        [a, b],
        [b, a],
      ]) {
        if (w <= f.w + 1e-9 && d <= f.d + 1e-9) {
          const short = Math.min(f.w - w, f.d - d);
          const long = Math.max(f.w - w, f.d - d);
          if (short < bestShort || (short === bestShort && long < bestLong)) {
            best = { x: f.x, z: f.z, w, d };
            bestShort = short;
            bestLong = long;
          }
        }
      }
    }
    if (best) this.place(best);
    return best;
  }
  private place(used: Rect) {
    const next: Rect[] = [];
    for (const f of this.free) {
      if (!overlaps(f, used)) {
        next.push(f);
        continue;
      }
      if (used.x > f.x) next.push({ x: f.x, z: f.z, w: used.x - f.x, d: f.d });
      if (used.x + used.w < f.x + f.w) next.push({ x: used.x + used.w, z: f.z, w: f.x + f.w - used.x - used.w, d: f.d });
      if (used.z > f.z) next.push({ x: f.x, z: f.z, w: f.w, d: used.z - f.z });
      if (used.z + used.d < f.z + f.d) next.push({ x: f.x, z: used.z + used.d, w: f.w, d: f.z + f.d - used.z - used.d });
    }
    // drop free rectangles contained in another
    this.free = next.filter((r, i) => !next.some((o, j) => j !== i && contains(o, r) && (!contains(r, o) || j < i)));
  }
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.z < b.z + b.d - 1e-9 && b.z < a.z + a.d - 1e-9;
const contains = (o: Rect, r: Rect) => r.x >= o.x - 1e-9 && r.z >= o.z - 1e-9 && r.x + r.w <= o.x + o.w + 1e-9 && r.z + r.d <= o.z + o.d + 1e-9;
const toRect = (b: Flat): Rect => ({ x: b.x, z: b.z, w: b.dx, d: b.dz });
const midDist = (r: Rect) => Math.hypot(r.x + r.w / 2 - PALLET.length / 2, r.z + r.d / 2 - PALLET.width / 2);

/** How many cases of a product make one layer: its best pattern, or fewer when the weight limit says so. */
export function perLayer(p: Pick<Product, "length" | "width" | "weight">): number {
  const pattern = layerPattern(p.length, p.width).length;
  return Math.max(0, Math.min(pattern, Math.floor(LIMITS.maxLoadWeight / p.weight + 1e-9)));
}

/** The spots of a pattern nearest the middle of the deck, so a short layer sits as one tight block. */
function nearestCentre(spots: Rect[], count: number): Rect[] {
  return [...spots].sort((a, b) => midDist(a) - midDist(b) || a.x - b.x || a.z - b.z).slice(0, count);
}

function layerOf(p: Product, spots: Rect[], kind: Layer["kind"]): Layer {
  const pattern = layerPattern(p.length, p.width);
  return {
    kind,
    whole: kind === "full",
    height: p.height,
    weight: p.weight * spots.length,
    fragile: !!p.fragile,
    boxes: spots.map((r) => ({ productId: p.id, x: r.x, z: r.z, dx: r.w, dz: r.d, dy: p.height, weight: p.weight })),
    cells: kind === "full" ? spots : undefined,
    pattern: kind === "part" ? pattern : undefined,
  };
}

/** How a footprint rests on the cases below: share of it touching, and whether its middle is over that contact. */
function contact(r: Rect, below: Flat[]): { share: number; balanced: boolean } {
  let area = 0;
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const d of below) {
    const ax = Math.max(r.x, d.x);
    const bx = Math.min(r.x + r.w, d.x + d.dx);
    const az = Math.max(r.z, d.z);
    const bz = Math.min(r.z + r.d, d.z + d.dz);
    if (bx - ax > 1e-6 && bz - az > 1e-6) {
      area += (bx - ax) * (bz - az);
      x0 = Math.min(x0, ax);
      x1 = Math.max(x1, bx);
      z0 = Math.min(z0, az);
      z1 = Math.max(z1, bz);
    }
  }
  const cx = r.x + r.w / 2;
  const cz = r.z + r.d / 2;
  const mx = 0.05 * r.w;
  const mz = 0.05 * r.d;
  return { share: area / (r.w * r.d), balanced: cx >= x0 + mx && cx <= x1 - mx && cz >= z0 + mz && cz <= z1 - mz };
}

const steadyCase = (r: Rect, below: Flat[]) => {
  const c = contact(r, below);
  return c.balanced && c.share >= MIN_CONTACT - 1e-9;
};

/** True when every case of `upper` rests steadily on the cases of `lower`. */
export function steadyOn(lower: Pick<Layer, "boxes">, upper: Pick<Layer, "boxes">): boolean {
  return upper.boxes.every((u) => steadyCase(toRect(u), lower.boxes));
}

/** The smallest share of any case's base in `upper` that touches a case in `lower`. */
export function support(lower: Pick<Layer, "boxes">, upper: Pick<Layer, "boxes">): number {
  return Math.min(1, ...upper.boxes.map((u) => contact(toRect(u), lower.boxes).share));
}

interface Target {
  w: number;
  d: number;
}

/** Square a whole layer up to the pallet's footprint, each case centred in its spot. */
function squareUp(layer: Layer, t: Target): Layer {
  if (!layer.cells) return layer;
  const cells = squareCells(layer.cells, t.w, t.d);
  return {
    ...layer,
    cells,
    boxes: layer.boxes.map((b, k) => ({ ...b, x: cells[k].x + (cells[k].w - b.dx) / 2, z: cells[k].z + (cells[k].d - b.dz) / 2 })),
  };
}

/**
 * Seat a part layer over the layer below it: the spots of its own pattern (squared up like the
 * layers under it) that rest steadily on cases, nearest the middle first, so a short layer sits
 * as one tight block over the one beneath.
 */
function seat(layer: Layer, below: Layer | undefined, t: Target | null): Layer {
  if (layer.kind !== "part" || !layer.pattern) return layer;
  const spots = t ? squareCells(layer.pattern, t.w, t.d) : layer.pattern;
  const chosen = below
    ? spots
        .map((r) => ({ r, ok: steadyCase(r, below.boxes), c: contact(r, below.boxes).share, d: midDist(r) }))
        .sort((a, b) => Number(b.ok) - Number(a.ok) || a.d - b.d || b.c - a.c || a.r.x - b.r.x || a.r.z - b.r.z)
        .slice(0, layer.boxes.length)
        .map((x) => x.r)
    : nearestCentre(spots, layer.boxes.length);
  return { ...layer, boxes: layer.boxes.map((b, k) => ({ ...b, x: chosen[k].x, z: chosen[k].z, dx: chosen[k].w, dz: chosen[k].d })) };
}

/** Re-pack a mixed layer inside the pallet's footprint when it would stick out past it. */
function tuck(layer: Layer, t: Target | null): Layer {
  if (layer.kind !== "mixed" || layer.whole || !t) return layer;
  const e = extent(layer.boxes.map(toRect));
  if (e.w <= t.w + 1e-6 && e.d <= t.d + 1e-6) return layer;
  const bin = new MaxRects(t.w, t.d);
  const placed: Flat[] = [];
  for (const b of layer.boxes) {
    const r = bin.insert(Math.max(b.dx, b.dz), Math.min(b.dx, b.dz));
    if (!r) return layer;
    placed.push({ ...b, x: r.x, z: r.z, dx: r.w, dz: r.d });
  }
  const c = centre(placed.map(toRect), PALLET.length, PALLET.width);
  return { ...layer, boxes: placed.map((b, k) => ({ ...b, x: c[k].x, z: c[k].z })) };
}

/**
 * Turn an order into built pallets.
 *
 * 1. Every product gets its best full-layer pattern; whole layers come first.
 * 2. Leftover cases share mixed layers with cases of a similar height.
 * 3. Layers go onto as few pallets as the limits allow, the way a loader builds them: whole drink
 *    layers heavy-to-light at the bottom and spread evenly, part layers above them, crushable
 *    products on top, every whole layer squared up to the same footprint, and nothing set down
 *    where it would hang over empty space.
 */
export function pack(order: OrderLine[]): PackResult {
  const lines = order.filter((l) => l.qty > 0);
  for (const { product: p } of lines) {
    if (layerPattern(p.length, p.width).length === 0) throw new Error(`${p.name} does not fit on a pallet`);
    if (p.height > LIMITS.maxLoadHeight) throw new Error(`${p.name} is taller than the height limit`);
    if (p.weight > LIMITS.maxLoadWeight) throw new Error(`${p.name} is heavier than a pallet can carry`);
  }

  const full: Layer[] = [];
  const short: Layer[] = [];
  const leftovers: Product[] = [];
  for (const { product: p, qty } of lines) {
    const pattern = layerPattern(p.length, p.width);
    const cap = perLayer(p);
    if (cap < pattern.length) {
      // too heavy for a whole pattern: layers of as many cases as the weight limit allows
      for (let left = qty; left > 0; left -= cap) short.push(layerOf(p, nearestCentre(pattern, Math.min(cap, left)), "part"));
      continue;
    }
    const nFull = Math.floor(qty / pattern.length);
    for (let i = 0; i < nFull; i++) full.push(layerOf(p, pattern, "full"));
    for (let i = 0; i < qty - nFull * pattern.length; i++) leftovers.push(p);
  }

  const all = [...full, ...short, ...mixedLayers(leftovers)];
  all.forEach((l, i) => (l.id = i));
  const byWeight = (a: Layer, b: Layer) => b.weight / b.boxes.length - a.weight / a.boxes.length || b.height - a.height;
  const pallets = stackLayers(
    all.filter((l) => !l.fragile && l.whole).sort(byWeight),
    all.filter((l) => !l.fragile && !l.whole),
    all.filter((l) => l.fragile),
  );
  return {
    pallets,
    totalCases: lines.reduce((s, l) => s + l.qty, 0),
    totalWeight: lines.reduce((s, l) => s + l.qty * l.product.weight, 0),
  };
}

interface Stack {
  base: Layer[];
  partial: Layer[];
  fragile: Layer[];
  h: number;
  w: number;
}

const footprint = (l: Layer) => l.boxes.reduce((s, b) => s + b.dx * b.dz, 0);
const biggerFirst = (a: Layer, b: Layer) =>
  footprint(b) - footprint(a) || b.weight / b.boxes.length - a.weight / a.boxes.length || b.height - a.height;

/**
 * A pallet's layers bottom to top: whole drink layers, then part layers (widest first), then
 * crushable ones. Every whole layer is squared up to the load's footprint, so the pallet reads as
 * one solid block; part layers are seated over the layer beneath them.
 */
function stacked(s: Stack): Layer[] {
  const order = [
    ...s.base,
    ...[...s.partial].sort(biggerFirst),
    ...[...s.fragile].sort((a, b) => Number(b.whole) - Number(a.whole) || biggerFirst(a, b)),
  ];
  // the load's footprint: wide enough for every layer on it, so whole layers square out to it
  // and part layers sit inside it
  let tw = 0;
  let td = 0;
  for (const l of order) {
    const e = extent(l.cells ?? l.pattern ?? l.boxes.map(toRect));
    tw = Math.max(tw, e.w);
    td = Math.max(td, e.d);
  }
  const target: Target | null = order.length ? { w: tw, d: td } : null;
  const out: Layer[] = [];
  for (const l of order) {
    const below = out[out.length - 1];
    out.push(l.whole && target ? squareUp(l, target) : seat(tuck(l, target), below, target));
  }
  return out;
}

/** True when no case on the pallet hangs over empty space. */
function steady(s: Stack, memo?: Map<string, boolean>): boolean {
  const ids = (ls: Layer[]) => ls.map((l) => l.id ?? -1);
  const key = memo && `${ids(s.base).join(",")}|${ids(s.partial).sort().join(",")}|${ids(s.fragile).sort().join(",")}`;
  const known = key !== undefined ? memo!.get(key) : undefined;
  if (known !== undefined) return known;
  const ls = stacked(s);
  let ok = true;
  for (let i = 1; i < ls.length && ok; i++) if (!steadyOn(ls[i - 1], ls[i])) ok = false;
  if (key !== undefined) memo!.set(key, ok);
  return ok;
}

const fits = (s: Stack, l: Layer) =>
  s.h + l.height <= LIMITS.maxLoadHeight + 1e-9 && s.w + l.weight <= LIMITS.maxLoadWeight + 1e-9;
const isEmpty = (s: Stack) => !s.base.length && !s.partial.length && !s.fragile.length;
const hasDrinks = (s: Stack) => s.base.length + s.partial.length > 0;
const group = (s: Stack, l: Layer) => (l.fragile ? s.fragile : l.whole ? s.base : s.partial);
function put(s: Stack, l: Layer) {
  group(s, l).push(l);
  s.h += l.height;
  s.w += l.weight;
}
function take(s: Stack, l: Layer) {
  const g = group(s, l);
  g.splice(g.lastIndexOf(l), 1);
  s.h -= l.height;
  s.w -= l.weight;
}

/**
 * Put layers onto pallets.
 * Starting from the fewest pallets the totals could fit on, each whole drink layer goes on the
 * shortest pallet it fits on, which keeps every pallet heavy at the bottom and evenly tall.
 * Crushable layers then claim the flat tops of drink pallets, and part layers fill in where they
 * leave nothing hanging. A short search tries other spots before adding one more pallet.
 */
function stackLayers(base: Layer[], partial: Layer[], fragile: Layer[]): Pallet[] {
  const every = [...base, ...partial, ...fragile];
  if (!every.length) return [];
  const rest = [
    ...fragile.filter((l) => l.whole),
    ...[...partial].sort(biggerFirst),
    ...fragile.filter((l) => !l.whole).sort(biggerFirst),
  ];
  const start = Math.max(
    1,
    Math.ceil(every.reduce((s, l) => s + l.height, 0) / LIMITS.maxLoadHeight - 1e-9),
    Math.ceil(every.reduce((s, l) => s + l.weight, 0) / LIMITS.maxLoadWeight - 1e-9),
  );
  const fresh = (n: number): Stack[] => Array.from({ length: n }, () => ({ base: [], partial: [], fragile: [], h: 0, w: 0 }));
  const prefer = (l: Layer) =>
    l.fragile
      ? // crushable: ride on drinks, on the pallet with the most headroom
        (a: Stack, b: Stack) => Number(hasDrinks(b)) - Number(hasDrinks(a)) || a.h - b.h || a.w - b.w
      : // part layers: stay off pallets that carry chips, then the most headroom
        (a: Stack, b: Stack) => Number(a.fragile.length > 0) - Number(b.fragile.length > 0) || a.h - b.h || a.w - b.w;

  const memo = new Map<string, boolean>();
  for (let n = start; n <= start + 8; n++) {
    const stacks = fresh(n);
    let ok = true;
    for (const l of base) {
      const target = stacks
        .filter((s) => fits(s, l))
        .sort((a, b) => a.h - b.h || a.w - b.w)
        .find((s) => {
          put(s, l);
          const good = steady(s, memo);
          take(s, l);
          return good;
        });
      if (!target) {
        ok = false;
        break;
      }
      put(target, l);
    }
    if (!ok) continue;

    let budget = 300 + 25 * rest.length;
    const place = (i: number): boolean => {
      if (i === rest.length) return true;
      if (--budget < 0) return false;
      const l = rest[i];
      let triedEmpty = false;
      for (const s of stacks.filter((s) => fits(s, l)).sort(prefer(l))) {
        if (isEmpty(s)) {
          if (triedEmpty) continue; // every empty pallet is the same choice
          triedEmpty = true;
        }
        put(s, l);
        if (steady(s, memo) && place(i + 1)) return true;
        take(s, l);
      }
      return false;
    };
    if (place(0)) return stacks.filter((s) => !isEmpty(s)).map(build);
  }

  // Fallback for unusual orders: same rules, greedy, opening a new pallet whenever nothing fits.
  const stacks: Stack[] = [];
  for (const l of [...base, ...rest]) {
    let target = stacks
      .filter((s) => fits(s, l))
      .sort(prefer(l))
      .find((s) => {
        put(s, l);
        const good = steady(s);
        take(s, l);
        return good;
      });
    if (!target) stacks.push((target = fresh(1)[0]));
    put(target, l);
  }
  return stacks.map(build);
}

function build(s: Stack): Pallet {
  const pallet: Pallet = { boxes: [], layers: [], loadHeight: 0, loadWeight: 0, cubeUse: 0 };
  let seq = 0;
  for (const layer of stacked(s)) {
    const y = pallet.loadHeight;
    for (const b of layer.boxes) pallet.boxes.push({ ...b, y, seq: seq++ });
    pallet.layers.push({ y, height: layer.height, kind: layer.kind, whole: layer.whole, count: layer.boxes.length, productIds: [...new Set(layer.boxes.map((b) => b.productId))] });
    pallet.loadHeight += layer.height;
    pallet.loadWeight += layer.weight;
  }
  const vol = pallet.boxes.reduce((t, b) => t + b.dx * b.dz * b.dy, 0);
  pallet.cubeUse = pallet.loadHeight ? vol / (PALLET.length * PALLET.width * pallet.loadHeight) : 0;
  return pallet;
}

/** Pack leftover cases into as few mixed layers as possible, grouping similar heights. */
function mixedLayers(cases: Product[]): Layer[] {
  // heaviest and tallest first, crushable products in their own layers
  const queue = [...cases].sort((a, b) => Number(!!a.fragile) - Number(!!b.fragile) || b.height - a.height || b.weight - a.weight);
  const layers: Layer[] = [];
  while (queue.length) {
    const first = queue[0];
    const mates = (p: Product, weight: number) =>
      !!p.fragile === !!first.fragile &&
      Math.abs(p.height - first.height) <= HEIGHT_TOLERANCE &&
      weight + p.weight <= LIMITS.maxLoadWeight + 1e-9;
    const pattern = layerPattern(first.length, first.width);

    // Option 1: the first product's own pattern, each spot taken by a case that fills it
    // (500 mL bottles and water share spots, cans and fridge packs do not)
    const slots: { i: number; r: Rect }[] = [];
    {
      const used = new Set<number>();
      let weight = 0;
      for (const r of pattern) {
        const i = queue.findIndex((p, k) => !used.has(k) && mates(p, weight) && fillsSpot(p, r));
        if (i < 0) continue;
        used.add(i);
        weight += queue[i].weight;
        slots.push({ i, r });
      }
    }

    // Option 2: MaxRects over the open deck
    const loose: { i: number; r: Rect }[] = [];
    {
      const bin = new MaxRects(PALLET.length, PALLET.width);
      let weight = 0;
      queue.forEach((p, i) => {
        if (!mates(p, weight)) return;
        const r = bin.insert(p.length, p.width);
        if (r) {
          loose.push({ i, r });
          weight += p.weight;
        }
      });
    }

    const pick = slots.length >= loose.length ? slots : loose;
    const whole = pick === slots && slots.length === pattern.length;
    const layer: Layer = { kind: "mixed", whole, height: 0, weight: 0, fragile: !!first.fragile, boxes: [] };
    for (const { i, r } of pick) {
      const p = queue[i];
      // turn the case to match its spot and centre it there
      const turn = r.w >= r.d !== p.length >= p.width;
      const dx = turn ? p.width : p.length;
      const dz = turn ? p.length : p.width;
      layer.boxes.push({ productId: p.id, x: r.x + (r.w - dx) / 2, z: r.z + (r.d - dz) / 2, dx, dz, dy: p.height, weight: p.weight });
      layer.height = Math.max(layer.height, p.height);
      layer.weight += p.weight;
    }
    if (pick === slots) layer.cells = slots.map((s) => s.r);
    const taken = new Set(pick.map((x) => x.i));
    for (let i = queue.length - 1; i >= 0; i--) if (taken.has(i)) queue.splice(i, 1);

    const ids = new Set(layer.boxes.map((b) => b.productId));
    if (ids.size === 1) {
      // one product: a full layer, or a part layer that sits as one tight block in the middle
      const prod = first.id === layer.boxes[0].productId ? first : cases.find((c) => c.id === layer.boxes[0].productId)!;
      const own = layerPattern(prod.length, prod.width);
      const spots = whole ? own : nearestCentre(own, layer.boxes.length);
      layer.kind = whole ? "full" : "part";
      layer.cells = whole ? own : undefined;
      layer.pattern = whole ? undefined : own;
      layer.boxes = layer.boxes.map((b, k) => ({ ...b, x: spots[k].x, z: spots[k].z, dx: spots[k].w, dz: spots[k].d }));
    } else if (!whole) {
      // several products: centre the group on the deck
      layer.cells = undefined;
      const c = centre(layer.boxes.map(toRect), PALLET.length, PALLET.width);
      layer.boxes = layer.boxes.map((b, k) => ({ ...b, x: c[k].x, z: c[k].z }));
    }
    layers.push(layer);
  }
  return layers;
}

/** A case fills a pattern spot when it fits inside it (either way round) and covers almost all of it. */
function fillsSpot(p: Product, r: Rect): boolean {
  const fits = (p.length <= r.w + 1e-9 && p.width <= r.d + 1e-9) || (p.width <= r.w + 1e-9 && p.length <= r.d + 1e-9);
  return fits && (p.length * p.width) / (r.w * r.d) >= 0.9;
}
