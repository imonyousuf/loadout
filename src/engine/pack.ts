import type { Product } from "./products";

/** A standard North American skid: 48 × 40 in. */
export const PALLET = { length: 48, width: 40, deckHeight: 5.5, weight: 45 } as const;
/** Limits for one built pallet (load only, deck excluded). */
export const LIMITS = { maxLoadHeight: 60, maxLoadWeight: 2200 } as const;
/** Cases whose heights differ by at most this much may share a mixed layer, so its top stays flat enough to stack on. */
const HEIGHT_TOLERANCE = 0.6;

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

export interface Layer {
  /** full: a whole pattern of one product; part: some cases of one product; mixed: several products */
  kind: "full" | "part" | "mixed";
  height: number;
  weight: number;
  fragile: boolean;
  boxes: Omit<Box, "y" | "seq">[];
}

export interface Pallet {
  boxes: Box[];
  layers: { y: number; height: number; kind: Layer["kind"]; count: number; productIds: string[] }[];
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

interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

/**
 * The best grid of identical cases on the pallet deck.
 * Tries splitting the deck into two blocks along either side, each block a grid of the case
 * in one orientation, and keeps the split that fits the most cases.
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
  const consider = (rects: Rect[]) => {
    if (rects.length > best.length) best = rects;
  };
  for (const [a, b] of [
    [length, width],
    [width, length],
  ]) {
    // split along x: k columns of (a × b), the rest rotated
    for (let k = 0; k * a <= L + 1e-9; k++) {
      consider([...grid(0, 0, k * a, W, a, b), ...grid(k * a, 0, L - k * a, W, b, a)]);
    }
    // split along z
    for (let k = 0; k * b <= W + 1e-9; k++) {
      consider([...grid(0, 0, L, k * b, a, b), ...grid(0, k * b, L, W - k * b, b, a)]);
    }
  }
  return centre(best, L, W);
}

/** Shift a set of rectangles so the group sits in the middle of the deck. */
function centre(rects: Rect[], L: number, W: number): Rect[] {
  if (!rects.length) return rects;
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const maxZ = Math.max(...rects.map((r) => r.z + r.d));
  const ox = (L - maxX) / 2;
  const oz = (W - maxZ) / 2;
  return rects.map((r) => ({ ...r, x: r.x + ox, z: r.z + oz }));
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

/**
 * Turn an order into built pallets.
 *
 * 1. Every product gets its best full-layer pattern; whole layers come first.
 * 2. Leftover cases share mixed layers with cases of a similar height (MaxRects).
 * 3. Layers go onto as few pallets as the height and weight limits allow, the way a loader
 *    builds them: heavy layers at the bottom of every pallet, drink layers spread evenly so
 *    each pallet keeps headroom, and crushable products riding on top of that headroom.
 */
export function pack(order: OrderLine[]): PackResult {
  const lines = order.filter((l) => l.qty > 0);
  for (const { product: p } of lines) {
    if (layerPattern(p.length, p.width).length === 0) throw new Error(`${p.name} does not fit on a pallet`);
    if (p.height > LIMITS.maxLoadHeight) throw new Error(`${p.name} is taller than the height limit`);
  }

  const full: Layer[] = [];
  const leftovers: Product[] = [];
  for (const { product: p, qty } of lines) {
    const pattern = layerPattern(p.length, p.width);
    const nFull = Math.floor(qty / pattern.length);
    for (let i = 0; i < nFull; i++) {
      full.push({
        kind: "full",
        height: p.height,
        weight: p.weight * pattern.length,
        fragile: !!p.fragile,
        boxes: pattern.map((r) => ({ productId: p.id, x: r.x, z: r.z, dx: r.w, dz: r.d, dy: p.height, weight: p.weight })),
      });
    }
    for (let i = 0; i < qty - nFull * pattern.length; i++) leftovers.push(p);
  }

  const mixed = mixedLayers(leftovers);

  const byWeight = (a: Layer, b: Layer) => b.weight / b.boxes.length - a.weight / a.boxes.length || b.height - a.height;
  const stackOrder = [
    ...full.filter((l) => !l.fragile).sort(byWeight),
    ...mixed.filter((l) => !l.fragile).sort(byWeight),
    ...full.filter((l) => l.fragile).sort(byWeight),
    ...mixed.filter((l) => l.fragile).sort(byWeight),
  ];

  const pallets = stackLayers(stackOrder);
  return {
    pallets,
    totalCases: lines.reduce((s, l) => s + l.qty, 0),
    totalWeight: lines.reduce((s, l) => s + l.qty * l.product.weight, 0),
  };
}

/**
 * Put ordered layers onto pallets.
 * Starting from the fewest pallets the totals could fit on, each sturdy layer goes on the
 * shortest pallet it fits on, which keeps every pallet sorted heavy-to-light and leaves even
 * headroom. Crushable layers then go on the pallet with the most room left. If anything does
 * not fit, try again with one more pallet.
 */
function stackLayers(layers: Layer[]): Pallet[] {
  if (!layers.length) return [];
  const sturdy = layers.filter((l) => !l.fragile);
  const soft = layers.filter((l) => l.fragile);
  const totalH = layers.reduce((s, l) => s + l.height, 0);
  const totalW = layers.reduce((s, l) => s + l.weight, 0);
  const start = Math.max(1, Math.ceil(totalH / LIMITS.maxLoadHeight - 1e-9), Math.ceil(totalW / LIMITS.maxLoadWeight - 1e-9));

  for (let n = start; n <= layers.length; n++) {
    const stacks: { layers: Layer[]; h: number; w: number }[] = Array.from({ length: n }, () => ({ layers: [], h: 0, w: 0 }));
    const fits = (s: (typeof stacks)[number], l: Layer) => s.h + l.height <= LIMITS.maxLoadHeight + 1e-9 && s.w + l.weight <= LIMITS.maxLoadWeight + 1e-9;
    let ok = true;
    for (const l of sturdy) {
      const target = stacks.filter((s) => fits(s, l)).sort((a, b) => a.h - b.h || a.w - b.w)[0];
      if (!target) {
        ok = false;
        break;
      }
      target.layers.push(l);
      target.h += l.height;
      target.w += l.weight;
    }
    if (ok) {
      for (const l of soft) {
        // prefer a pallet that already carries drinks, then the one with the most headroom
        const target = stacks
          .filter((s) => fits(s, l))
          .sort((a, b) => Number(b.layers.some((x) => !x.fragile)) - Number(a.layers.some((x) => !x.fragile)) || a.h - b.h)[0];
        if (!target) {
          ok = false;
          break;
        }
        target.layers.push(l);
        target.h += l.height;
        target.w += l.weight;
      }
    }
    if (!ok) continue;

    return stacks
      .filter((s) => s.layers.length)
      .map((s) => {
        const pallet: Pallet = { boxes: [], layers: [], loadHeight: 0, loadWeight: 0, cubeUse: 0 };
        let seq = 0;
        for (const layer of s.layers) {
          const y = pallet.loadHeight;
          for (const b of layer.boxes) pallet.boxes.push({ ...b, y, seq: seq++ });
          pallet.layers.push({ y, height: layer.height, kind: layer.kind, count: layer.boxes.length, productIds: [...new Set(layer.boxes.map((b) => b.productId))] });
          pallet.loadHeight += layer.height;
          pallet.loadWeight += layer.weight;
        }
        const vol = pallet.boxes.reduce((t, b) => t + b.dx * b.dz * b.dy, 0);
        pallet.cubeUse = pallet.loadHeight ? vol / (PALLET.length * PALLET.width * pallet.loadHeight) : 0;
        return pallet;
      });
  }
  throw new Error("Could not fit the order on pallets");
}

/** Pack leftover cases into as few mixed layers as possible, grouping similar heights. */
function mixedLayers(cases: Product[]): Layer[] {
  // heaviest and tallest first, crushable products in their own layers
  const queue = [...cases].sort((a, b) => Number(!!a.fragile) - Number(!!b.fragile) || b.height - a.height || b.weight - a.weight);
  const layers: Layer[] = [];
  while (queue.length) {
    const first = queue[0];
    const bin = new MaxRects(PALLET.length, PALLET.width);
    const layer: Layer = { kind: "mixed", height: 0, weight: 0, fragile: !!first.fragile, boxes: [] };
    for (let i = 0; i < queue.length; ) {
      const p = queue[i];
      const sameClass = !!p.fragile === layer.fragile && Math.abs(p.height - first.height) <= HEIGHT_TOLERANCE;
      const spot = sameClass ? bin.insert(p.length, p.width) : null;
      if (spot) {
        layer.boxes.push({ productId: p.id, x: spot.x, z: spot.z, dx: spot.w, dz: spot.d, dy: p.height, weight: p.weight });
        layer.height = Math.max(layer.height, p.height);
        layer.weight += p.weight;
        queue.splice(i, 1);
      } else i++;
    }
    const ids = new Set(layer.boxes.map((b) => b.productId));
    if (ids.size === 1) {
      // one product: take the spots of its full pattern nearest the middle, so the part layer
      // sits as one tight block over the centre of the skid
      const prod = first.id === layer.boxes[0].productId ? first : cases.find((c) => c.id === layer.boxes[0].productId)!;
      const spots = layerPattern(prod.length, prod.width)
        .map((r) => ({ r, d: Math.hypot(r.x + r.w / 2 - PALLET.length / 2, r.z + r.d / 2 - PALLET.width / 2) }))
        .sort((a, b) => a.d - b.d || a.r.x - b.r.x || a.r.z - b.r.z)
        .slice(0, layer.boxes.length)
        .map((s) => s.r);
      layer.kind = "part";
      layer.boxes = layer.boxes.map((b, k) => ({ ...b, x: spots[k].x, z: spots[k].z, dx: spots[k].w, dz: spots[k].d }));
    } else {
      // several products: centre the group on the deck
      const c = centre(layer.boxes.map((b) => ({ x: b.x, z: b.z, w: b.dx, d: b.dz })), PALLET.length, PALLET.width);
      layer.boxes = layer.boxes.map((b, k) => ({ ...b, x: c[k].x, z: c[k].z }));
    }
    layers.push(layer);
  }
  return layers;
}
