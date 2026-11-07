import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Scene, { type Hover } from "./Scene";
import { LIMITS, pack, perLayer, type PackResult } from "./engine/pack";
import { PRODUCTS, type Product } from "./engine/products";
import AddProduct from "./AddProduct";
import Tour from "./Tour";
import { PRESETS } from "./presets";

const fmt = (n: number, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Animates a number toward its target, so stats count rather than jump. */
function useTween(value: number, ms = 450) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      const v = a + (value - a) * e;
      setShown(v);
      from.current = v;
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage blocked: the setting lasts for this visit only */
    }
  },
};

const CUSTOM_KEY = "loadout.customProducts";
const TOUR_KEY = "loadout.tourSeen";

/** A product saved by an earlier visit, checked so a bad entry can never stop the app. */
function isProduct(x: unknown): x is Product {
  if (!x || typeof x !== "object") return false;
  const p = x as Product;
  const positive = [p.length, p.width, p.height, p.weight].every((n) => typeof n === "number" && Number.isFinite(n) && n > 0);
  return (
    typeof p.id === "string" &&
    typeof p.name === "string" &&
    typeof p.category === "string" &&
    typeof p.color === "string" &&
    positive &&
    p.height <= LIMITS.maxLoadHeight &&
    p.weight <= LIMITS.maxLoadWeight &&
    perLayer(p) > 0
  );
}

function loadCustom(): Product[] {
  try {
    const list = JSON.parse(store.get(CUSTOM_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter(isProduct).map((p) => ({ ...p, detail: typeof p.detail === "string" ? p.detail : "" })) : [];
  } catch {
    return [];
  }
}

const EMPTY: PackResult = { pallets: [], totalCases: 0, totalWeight: 0 };
const reduceMotionQuery = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
/** Hover previews are for a mouse; on touch a tap would leave the preview stuck on. */
const mouse = (fn: () => void) => (e: React.PointerEvent) => {
  if (e.pointerType === "mouse") fn();
};

export default function App() {
  const [qty, setQty] = useState<Record<string, number>>(() => ({ ...PRESETS[0].qty }));
  const [preset, setPreset] = useState<string | null>(PRESETS[0].id);
  const [palletIdx, setPalletIdx] = useState(0);
  const [buildRun, setBuildRun] = useState(0);
  const [pinLayer, setPinLayer] = useState<number | null>(null);
  const [hoverLayer, setHoverLayer] = useState<number | null>(null);
  const [focusProduct, setFocusProduct] = useState<string | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const reduceMotion = !!reduceMotionQuery?.matches;
  const [custom, setCustom] = useState<Product[]>(loadCustom);
  const [adding, setAdding] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [tour, setTour] = useState<null | "first" | "asked">(() => (store.get(TOUR_KEY) ? null : "first"));

  useEffect(() => store.set(CUSTOM_KEY, JSON.stringify(custom)), [custom]);

  const allProducts = useMemo(() => [...PRODUCTS, ...custom], [custom]);
  const byId = useMemo(() => Object.fromEntries(allProducts.map((p) => [p.id, p])) as Record<string, Product>, [allProducts]);
  const categories = useMemo(() => [...new Set(allProducts.map((p) => p.category))], [allProducts]);

  // typing stays instant; the build catches up a moment later on very large orders
  const order = useDeferredValue(qty);
  const { result, error } = useMemo(() => {
    try {
      return { result: pack(allProducts.map((p) => ({ product: p, qty: order[p.id] ?? 0 }))), error: null };
    } catch (e) {
      return { result: EMPTY, error: e instanceof Error ? e.message : "This order could not be built." };
    }
  }, [order, allProducts]);
  const pallets = result.pallets;
  const idx = Math.min(palletIdx, Math.max(0, pallets.length - 1));
  const pallet = pallets[idx] ?? null;

  // a new build makes old layer and case picks meaningless
  useEffect(() => {
    setPinLayer(null);
    setHoverLayer(null);
    setHover(null);
  }, [pallet, buildRun]);

  useEffect(() => {
    if (!justAdded) return;
    document.getElementById(`line-${justAdded}`)?.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
    const t = window.setTimeout(() => setJustAdded(null), 1800);
    return () => window.clearTimeout(t);
  }, [justAdded, reduceMotion]);

  const set = (id: string, v: number) => {
    setPreset(null);
    setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(999, Math.round(v) || 0)) }));
  };
  const loadPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)!;
    setQty({ ...p.qty });
    setPreset(id);
    setPalletIdx(0);
    setBuildRun((n) => n + 1);
  };
  const closeTour = () => {
    store.set(TOUR_KEY, "1");
    setTour(null);
  };

  const focusLayer = hoverLayer ?? pinLayer;
  const onPallet = (id: string | null) => !!id && !!pallet?.boxes.some((b) => b.productId === id);
  const shownProduct = onPallet(focusProduct) ? focusProduct : null;

  const hPct = pallet ? pallet.loadHeight / LIMITS.maxLoadHeight : 0;
  const wPct = pallet ? pallet.loadWeight / LIMITS.maxLoadWeight : 0;
  const tPallets = useTween(pallets.length);
  const tHeight = useTween(pallet?.loadHeight ?? 0);
  const tWeight = useTween(pallet?.loadWeight ?? 0);
  const tCube = useTween((pallet?.cubeUse ?? 0) * 100);
  const tCases = useTween(result.totalCases);
  const tTotalW = useTween(result.totalWeight);

  const hovered = hover && pallet ? pallet.boxes[hover.index] : null;
  const layersTopFirst = pallet ? pallet.layers.map((l, i) => ({ ...l, i })).reverse() : [];

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="mark" aria-hidden="true">
            <i />
            <i />
            <b />
          </span>
          <span className="word">Loadout</span>
          <span className="ver">Pallet builder for DSD orders</span>
        </div>
        <div className="topr">
          <button type="button" className="howbtn" onClick={() => setTour("asked")}>
            <span className="play" aria-hidden="true" />
            How it works
          </button>
          <a className="by" href="https://github.com/imonyousuf" target="_blank" rel="noopener">
            Built by Imon Yousuf
          </a>
        </div>
      </header>

      <main className="layout">
        <section className="stage" aria-label="3D view of the built pallet">
          <Scene
            pallet={pallet}
            products={byId}
            buildId={`${idx}:${buildRun}`}
            focusLayer={focusLayer}
            focusProduct={shownProduct}
            onHover={setHover}
            autoRotate={autoRotate && !hover && focusLayer === null}
            reduceMotion={reduceMotion}
          />

          <div className="stats">
            <div className="stat big">
              <span className="k">Pallets</span>
              <span className="v">{fmt(tPallets)}</span>
            </div>
            <div className="stat">
              <span className="k">Height</span>
              <span className="v">
                {fmt(tHeight, 1)}
                <small> / {LIMITS.maxLoadHeight} in</small>
              </span>
              <Meter pct={hPct} />
            </div>
            <div className="stat">
              <span className="k">Weight</span>
              <span className="v">
                {fmt(tWeight)}
                <small> / {fmt(LIMITS.maxLoadWeight)} lb</small>
              </span>
              <Meter pct={wPct} />
            </div>
            <div className="stat">
              <span className="k">Cube used</span>
              <span className="v">
                {fmt(tCube)}
                <small>%</small>
              </span>
              <Meter pct={pallet?.cubeUse ?? 0} good />
            </div>
          </div>

          {pallets.length > 0 && (
            <nav className="tabs" aria-label="Pallets">
              {pallets.map((p, i) => {
                const has = !!focusProduct && p.boxes.some((b) => b.productId === focusProduct);
                return (
                  <button
                    key={i}
                    type="button"
                    className={(i === idx ? "on" : "") + (has ? " has" : "")}
                    style={has ? ({ "--c": byId[focusProduct!]?.color } as React.CSSProperties) : undefined}
                    onClick={() => {
                      setPalletIdx(i);
                      setBuildRun((n) => n + 1);
                    }}
                    aria-label={`Pallet ${i + 1}: ${p.boxes.length} cases, ${fmt(p.loadHeight, 1)} inches`}
                    aria-current={i === idx ? "true" : undefined}
                  >
                    <span className="tbar">
                      <i style={{ height: `${(p.loadHeight / LIMITS.maxLoadHeight) * 100}%` }} />
                    </span>
                    <span className="tl">P{i + 1}</span>
                    <span className="tn">{p.boxes.length} cs</span>
                  </button>
                );
              })}
            </nav>
          )}

          <div className="tools">
            <button type="button" onClick={() => setBuildRun((n) => n + 1)} disabled={!pallet}>
              Replay<span className="hide-s"> build</span>
            </button>
            <button type="button" className={autoRotate ? "on" : ""} onClick={() => setAutoRotate((v) => !v)} aria-pressed={autoRotate}>
              Orbit
            </button>
          </div>

          {hovered && byId[hovered.productId] && (
            <div className="tip" role="status">
              <span className="sw" style={{ background: byId[hovered.productId].color }} />
              <div>
                <b>{byId[hovered.productId].name}</b>
                <span>
                  Layer {hover!.layer + 1} · {fmt(hovered.weight, 1)} lb · {fmt(hovered.dx, 1)} × {fmt(hovered.dz, 1)} in
                </span>
              </div>
            </div>
          )}

          {!pallet && (
            <div className="empty">
              {error ? (
                <>
                  <b>This order can’t be built</b>
                  <span>{error}</span>
                </>
              ) : (
                <>
                  <b>Nothing to build yet</b>
                  <span>Set some cases, or pick an example order.</span>
                </>
              )}
            </div>
          )}

          {pallet && (
            <aside className="layers" aria-label="Layers on this pallet, top first">
              <div className="lh">
                <span>Layers</span>
                <span>P{idx + 1}</span>
              </div>
              <ol>
                {layersTopFirst.map((l) => {
                  const counts = l.productIds.map((id) => ({ id, n: pallet.boxes.filter((b) => Math.abs(b.y - l.y) < 1e-6 && b.productId === id).length }));
                  const names = l.productIds.map((id) => byId[id]?.name ?? id).join(" and ");
                  return (
                    <li key={l.i}>
                      <button
                        type="button"
                        className={focusLayer === l.i ? "on" : ""}
                        aria-pressed={pinLayer === l.i}
                        aria-label={`Layer ${l.i + 1}: ${l.count} cases of ${names}`}
                        onPointerEnter={mouse(() => setHoverLayer(l.i))}
                        onPointerLeave={mouse(() => setHoverLayer(null))}
                        onClick={() => setPinLayer((f) => (f === l.i ? null : l.i))}
                      >
                        <span className="ln">L{l.i + 1}</span>
                        <span className="lbar">
                          {counts.map((c) => (
                            <i key={c.id} style={{ flex: c.n, background: byId[c.id]?.color }} />
                          ))}
                        </span>
                        <span className="lmeta">
                          {l.count} · {l.kind}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </aside>
          )}
        </section>

        <aside className="order" aria-label="Order">
          <div className="oh">
            <h1>Build an order</h1>
            <p>Set the cases for one store. Loadout works out the layers, keeps heavy cases low and chips on top, and splits the load across pallets.</p>
          </div>

          <div className="presets" role="group" aria-label="Example orders">
            {PRESETS.map((p) => (
              <button key={p.id} type="button" className={preset === p.id ? "on" : ""} aria-pressed={preset === p.id} onClick={() => loadPreset(p.id)}>
                <b>{p.name}</b>
                <span>{p.note}</span>
              </button>
            ))}
          </div>

          {categories.map((cat) => {
            const items = allProducts.filter((p) => p.category === cat);
            const cases = items.reduce((n, p) => n + (qty[p.id] ?? 0), 0);
            return (
              <section className="cat" key={cat} aria-label={cat}>
                <div className="ch">
                  <span>{cat}</span>
                  <span>{cases ? `${fmt(cases)} cases` : ""}</span>
                </div>
                <ul className="lines">
                  {items.map((p) => {
                    const per = perLayer(p);
                    const v = qty[p.id] ?? 0;
                    const isCustom = !PRODUCTS.some((x) => x.id === p.id);
                    return (
                      <li
                        key={p.id}
                        id={`line-${p.id}`}
                        onPointerEnter={mouse(() => setFocusProduct(v ? p.id : null))}
                        onPointerLeave={mouse(() => setFocusProduct(null))}
                        className={(v ? "" : "zero") + (justAdded === p.id ? " new" : "")}
                      >
                        <span className="sw" style={{ background: p.color }} />
                        <div className="pi">
                          <b>
                            {p.name}
                            {isCustom && (
                              <button
                                type="button"
                                className="del"
                                aria-label={`Remove ${p.name}`}
                                onClick={() => {
                                  setFocusProduct(null);
                                  setCustom((c) => c.filter((x) => x.id !== p.id));
                                  setQty((q) => {
                                    const n = { ...q };
                                    delete n[p.id];
                                    return n;
                                  });
                                }}
                              >
                                Remove
                              </button>
                            )}
                          </b>
                          <span>{p.detail}</span>
                          <span className="pm">
                            {per} per layer · {fmt(p.weight, p.weight % 1 ? 1 : 0)} lb
                          </span>
                        </div>
                        <div className="step">
                          <button type="button" onClick={() => set(p.id, v - 1)} aria-label={`One less ${p.name}`} disabled={v === 0}>
                            −
                          </button>
                          <input
                            id={`qty-${p.id}`}
                            inputMode="numeric"
                            value={v}
                            aria-label={`${p.name} cases`}
                            onChange={(e) => set(p.id, Number(e.target.value.replace(/\D/g, "")))}
                            onFocus={(e) => e.target.select()}
                            onKeyDown={(e) => {
                              if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                              e.preventDefault();
                              set(p.id, v + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1));
                            }}
                          />
                          <button type="button" onClick={() => set(p.id, v + 1)} aria-label={`One more ${p.name}`} disabled={v >= 999}>
                            +
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          {adding ? (
            <AddProduct
              categories={categories}
              taken={allProducts.map((p) => p.name.toLowerCase())}
              colorIndex={custom.length}
              onCancel={() => setAdding(false)}
              onAdd={(p, startQty) => {
                setCustom((c) => [...c, p]);
                setQty((q) => ({ ...q, [p.id]: startQty }));
                setPreset(null);
                setAdding(false);
                setJustAdded(p.id);
              }}
            />
          ) : (
            <button type="button" className="addbtn" onClick={() => setAdding(true)}>
              <span aria-hidden="true">+</span> Add a product
            </button>
          )}

          <div className="totals">
            <div>
              <span>Cases</span>
              <b>{fmt(tCases)}</b>
            </div>
            <div>
              <span>Total weight</span>
              <b>{fmt(tTotalW)} lb</b>
            </div>
            <button
              type="button"
              className="clear"
              onClick={() => {
                setQty({});
                setPreset(null);
              }}
              disabled={result.totalCases === 0 && Object.values(qty).every((n) => !n)}
            >
              Clear
            </button>
          </div>

          <p className="fine">
            Case sizes are typical for each format, for illustration. Skid 48 × 40 in, load up to 60 in and 2,200 lb.{" "}
            <a href="https://github.com/imonyousuf" target="_blank" rel="noopener">
              Built by Imon Yousuf
            </a>
          </p>
        </aside>
      </main>

      {tour && <Tour first={tour === "first"} onClose={closeTour} />}
    </div>
  );
}

function Meter({ pct, good }: { pct: number; good?: boolean }) {
  const p = Math.max(0, Math.min(1, pct));
  const tone = good ? "" : p > 0.97 ? "hot" : p > 0.85 ? "warm" : "";
  return (
    <span className={`meter ${tone}`} aria-hidden="true">
      <i style={{ width: `${p * 100}%` }} />
    </span>
  );
}
