/** Example orders, in cases per product. */
export const PRESETS: { id: string; name: string; note: string; qty: Record<string, number> }[] = [
  {
    id: "corner",
    name: "Corner store",
    note: "Weekly top-up",
    qty: { cans24: 30, fridge12: 42, bottle24: 25, twoLitre: 16, sports: 12, water: 20, chips: 8 },
  },
  {
    id: "grocery",
    name: "Grocery Friday",
    note: "Weekend build",
    qty: { cans24: 90, fridge12: 63, bottle24: 40, twoLitre: 45, sports: 24, water: 30, chips: 14 },
  },
  {
    id: "promo",
    name: "Promo display",
    note: "One end cap",
    qty: { cans24: 0, fridge12: 84, bottle24: 0, twoLitre: 20, sports: 0, water: 0, chips: 10 },
  },
];
