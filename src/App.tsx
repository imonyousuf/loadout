import { useEffect, useMemo, useRef, useState } from "react";
import Scene, { type Hover } from "./Scene";
import { LIMITS, layerPattern, pack } from "./engine/pack";
import { PRODUCTS, type Product } from "./engine/products";
import AddProduct from "./AddProduct";
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

const CUSTOM_KEY = "loadout.customProducts";
function loadCustom(): Product[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    const list = raw ? (JSON.parse(raw) as Product[]) : [];
    return Array.isArray(list) ? list.filter((p) => p && p.id && p.length > 0 && p.width > 0 && p.height > 0) : [];
  } catch {
    return [];
  }
}

const reduceMotionQuery = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

export default function App() {
  const [qty, setQty] = useState<Record<string, number>>(() => ({ ...PRESETS[0].qty }));
  const [preset, setPreset] = useState<string | null>(PRESETS[0].id);
  const [palletIdx, setPalletIdx] = useState(0);
  const [buildRun, setBuildRun] = useState(0);
  const [focusLayer, setFocusLayer] = useState<number | null>(null);
  const [focusProduct, setFocusProduct] = useState<string | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const reduceMotion = !!reduceMotionQuery?.matches;
  const [custom, setCustom] = useState<Product[]>(loadCustom);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom));
    } catch {
      /* storage blocked: custom products last for this visit only */
    }
  }, [custom]);

  const allProducts = useMemo(() => [...PRODUCTS, ...custom], [custom]);
  const byId = useMemo(() => Object.fromEntries(allProducts.map((p) => [p.id, p])) as Record<string, Product>, [allProducts]);
  const categories = useMemo(() => [...new Set(allProducts.map((p) => p.category))], [allProducts]);

  const result = useMemo(() => pack(allProducts.map((p) => ({ product: p, qty: qty[p.id] ?? 0 }))), [qty, allProducts]);
  const pallets = result.pallets;
  const idx = Math.min(palletIdx, Math.max(0, pallets.length - 1));
  const pallet = pallets[idx] ?? null;

  useEffect(() => setFocusLayer(null), [idx]);

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
        <a className="by" href="https://github.com/imonyousuf" target="_blank" rel="noopener">
          Built by Imon Yousuf
        </a>
      </header>

      <main className="layout">
        <section className="stage" aria-label="3D view of the built pallet">
          <Scene
            pallet={pallet}
            products={byId}
            buildId={`${idx}:${buildRun}`}
            focusLayer={focusLayer}
            focusProduct={focusProduct}
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
              <Meter pct={(pallet?.cubeUse ?? 0)} good />
            </div>
          </div>

          {pallets.length > 0 && (
            <nav className="tabs" aria-label="Pallets">
              {pallets.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  className={i === idx ? "on" : ""}
                  onClick={() => {
                    setPalletIdx(i);
                    setBuildRun((n) => n + 1);
                  }}
                  aria-label={`Pallet ${i + 1}: ${p.boxes.length} cases`}
                >
                  <span className="tbar">
                    <i style={{ height: `${(p.loadHeight / LIMITS.maxLoadHeight) * 100}%` }} />
                  </span>
                  <span className="tl">P{i + 1}</span>
                  <span className="tn">{p.boxes.length}</span>
                </button>
              ))}
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

          {hovered && (
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
              <b>Nothing to build yet</b>
              <span>Add cases on the left, or load an example order.</span>
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
                  return (
                    <li
                      key={l.i}
                      className={focusLayer === l.i ? "on" : ""}
                      onMouseEnter={() => setFocusLayer(l.i)}
                      onMouseLeave={() => setFocusLayer(null)}
                      onClick={() => setFocusLayer((f) => (f === l.i ? null : l.i))}
                    >
                      <span className="ln">L{l.i + 1}</span>
                      <span className="lbar">
                        {counts.map((c) => (
                          <i key={c.id} style={{ flex: c.n, background: byId[c.id].color }} />
                        ))}
                      </span>
                      <span className="lmeta">
                        {l.count} · {l.kind}
                      </span>
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
              <button key={p.id} type="button" className={preset === p.id ? "on" : ""} onClick={() => loadPreset(p.id)}>
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
                  <span>{cases ? `${cases} cases` : ""}</span>
                </div>
                <ul className="lines">
                  {items.map((p) => {
                    const per = layerPattern(p.length, p.width).length;
                    const v = qty[p.id] ?? 0;
                    const isCustom = !PRODUCTS.some((x) => x.id === p.id);
                    return (
                      <li key={p.id} onMouseEnter={() => setFocusProduct(v ? p.id : null)} onMouseLeave={() => setFocusProduct(null)} className={v ? "" : "zero"}>
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
                            {per} per layer · {p.weight} lb
                          </span>
                        </div>
                        <div className="step">
                          <button type="button" onClick={() => set(p.id, v - 1)} aria-label={`One less ${p.name}`}>
                            −
                          </button>
                          <input
                            id={`qty-${p.id}`}
                            inputMode="numeric"
                            value={v}
                            aria-label={`${p.name} cases`}
                            onChange={(e) => set(p.id, Number(e.target.value.replace(/\D/g, "")))}
                            onFocus={(e) => e.target.select()}
                          />
                          <button type="button" onClick={() => set(p.id, v + 1)} aria-label={`One more ${p.name}`}>
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
            >
              Clear
            </button>
          </div>

          <p className="fine">Case sizes are typical for each format, for illustration. Skid 48 × 40 in, load up to 60 in and 2,200 lb.</p>
        </aside>
      </main>
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
