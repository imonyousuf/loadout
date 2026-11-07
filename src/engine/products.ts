/**
 * Case sizes for common beverage and snack formats.
 * Dimensions are typical values for illustration, in inches; weights in pounds.
 * length >= width; height is the case standing upright (never laid on its side).
 */
export interface Product {
  id: string;
  name: string;
  /** one short line shown under the name */
  detail: string;
  length: number;
  width: number;
  height: number;
  weight: number;
  /** crushable: always packed on top, never under other cases */
  fragile?: boolean;
  /** display colour for the 3D case */
  color: string;
}

export const PRODUCTS: Product[] = [
  { id: "cans24", name: "Cans 24-pack", detail: "24 × 355 mL, tray", length: 16, width: 10.75, height: 4.9, weight: 19.5, color: "#e8473b" },
  { id: "fridge12", name: "Fridge pack", detail: "12 × 355 mL", length: 15.6, width: 5.4, height: 4.9, weight: 9.6, color: "#2f6fe4" },
  { id: "bottle24", name: "Bottles 24", detail: "24 × 500 mL", length: 15.6, width: 10.5, height: 8.4, weight: 27.5, color: "#3fb6a8" },
  { id: "twoLitre", name: "2 L bottles", detail: "8 × 2 L", length: 17.4, width: 8.7, height: 12.6, weight: 37.5, color: "#f2b632" },
  { id: "sports", name: "Sports drink", detail: "24 × 710 mL", length: 16.6, width: 11.1, height: 9.4, weight: 41, color: "#8a5cf6" },
  { id: "water", name: "Water", detail: "24 × 500 mL", length: 15.6, width: 10.4, height: 8.3, weight: 27, color: "#9fd3f5" },
  { id: "chips", name: "Chips", detail: "12 bags, fragile", length: 19, width: 12.5, height: 14, weight: 5.5, fragile: true, color: "#f5f1e6" },
];

export const PRODUCT_BY_ID: Record<string, Product> = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
