import { useMemo, useState } from "react";
import { LIMITS, PALLET, layerPattern } from "./engine/pack";
import { CUSTOM_COLORS, type Product } from "./engine/products";

interface Props {
  categories: string[];
  /** product names already in use, lower case */
  taken: string[];
  colorIndex: number;
  onAdd: (p: Product, startQty: number) => void;
  onCancel: () => void;
}

const num = (s: string) => {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

/** A small form for a product the user carries that is not in the built-in list. */
export default function AddProduct({ categories, taken, colorIndex, onAdd, onCancel }: Props) {
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const [category, setCategory] = useState(categories[0] ?? "");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [qty, setQty] = useState("10");
  const [fragile, setFragile] = useState(false);
  const [tried, setTried] = useState(false);

  const L = num(length);
  const W = num(width);
  const H = num(height);
  const Wt = num(weight);
  const color = CUSTOM_COLORS[colorIndex % CUSTOM_COLORS.length];

  const check = useMemo(() => {
    const errors: Partial<Record<"name" | "category" | "size" | "height" | "weight", string>> = {};
    const n = name.trim();
    if (!n) errors.name = "Give the product a name.";
    else if (taken.includes(n.toLowerCase())) errors.name = "There is already a product with this name.";
    if (!category.trim()) errors.category = "Pick or type a category.";
    let per = 0;
    if (!(L > 0) || !(W > 0)) errors.size = "Enter the case length and width in inches.";
    else {
      per = layerPattern(Math.max(L, W), Math.min(L, W)).length;
      if (per === 0) errors.size = `This case is bigger than the ${PALLET.length} × ${PALLET.width} in skid.`;
    }
    if (!(H > 0)) errors.height = "Enter the case height in inches.";
    else if (H > LIMITS.maxLoadHeight) errors.height = `Taller than the ${LIMITS.maxLoadHeight} in load limit.`;
    if (!(Wt > 0)) errors.weight = "Enter the case weight in pounds.";
    else if (Wt > LIMITS.maxLoadWeight) errors.weight = `Heavier than a full pallet allows.`;
    const layers = per && H > 0 ? Math.floor(LIMITS.maxLoadHeight / H) : 0;
    return { errors, per, layers, ok: Object.keys(errors).length === 0 };
  }, [name, taken, category, L, W, H, Wt]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!check.ok) return;
    const id = "custom-" + name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now().toString(36);
    onAdd(
      {
        id,
        name: name.trim(),
        detail: detail.trim() || `${fmt(Math.max(L, W))} × ${fmt(Math.min(L, W))} × ${fmt(H)} in`,
        category: category.trim(),
        length: Math.max(L, W),
        width: Math.min(L, W),
        height: H,
        weight: Wt,
        fragile,
        color,
      },
      Math.max(0, Math.min(999, Math.round(num(qty)) || 0)),
    );
  };

  const err = (k: keyof typeof check.errors) =>
    tried && check.errors[k] ? (
      <span className="ferr" role="alert">
        {check.errors[k]}
      </span>
    ) : null;

  return (
    <form className="addform" onSubmit={submit} noValidate>
      <div className="afh">
        <span className="sw" style={{ background: color }} />
        <b>Add a product</b>
      </div>

      <label className="fl">
        <span>Name</span>
        <input id="np-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Iced tea 12-pack" autoFocus />
        {err("name")}
      </label>

      <div className="frow">
        <label className="fl">
          <span>Category</span>
          <input id="np-cat" list="np-cats" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Pick or type a new one" />
          <datalist id="np-cats">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          {err("category")}
        </label>
        <label className="fl">
          <span>Pack (optional)</span>
          <input id="np-detail" value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="12 × 500 mL" />
        </label>
      </div>

      <fieldset className="fl">
        <legend>Case size, inches</legend>
        <div className="dims">
          <input id="np-l" inputMode="decimal" value={length} onChange={(e) => setLength(e.target.value)} placeholder="L" aria-label="Length in inches" />
          <i>×</i>
          <input id="np-w" inputMode="decimal" value={width} onChange={(e) => setWidth(e.target.value)} placeholder="W" aria-label="Width in inches" />
          <i>×</i>
          <input id="np-h" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="H" aria-label="Height in inches" />
        </div>
        {err("size") || err("height")}
      </fieldset>

      <div className="frow">
        <label className="fl">
          <span>Weight per case, lb</span>
          <input id="np-wt" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="22" />
          {err("weight")}
        </label>
        <label className="fl">
          <span>Cases to start</span>
          <input id="np-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
      </div>

      <label className="fcheck">
        <input id="np-fragile" type="checkbox" checked={fragile} onChange={(e) => setFragile(e.target.checked)} />
        <span>Crushable, always goes on top (like chips)</span>
      </label>

      <p className="fpreview" aria-live="polite">
        {check.per > 0 ? (
          <>
            Fits <b>{check.per}</b> per layer{check.layers ? <>, up to <b>{check.layers}</b> layers high</> : null}
          </>
        ) : (
          "Enter a case size to see how it fits on the skid."
        )}
      </p>

      <div className="factions">
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary">
          Add to order
        </button>
      </div>
    </form>
  );
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();
