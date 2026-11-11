import raw from "@/data/menu.json";
export type Item = { id: string; cat: "acai" | "helados" | "paletas" | "bebidas" | "accesorios"; name: { es: string; en: string }; desc: { es: string; en: string }; price: number; old: number | null; img: string | null; popular: boolean };
export const menu = raw as Item[];
export const catOrder: Item["cat"][] = ["acai", "helados", "paletas", "bebidas", "accesorios"];
export const byId = (id: string) => menu.find((m) => m.id === id)!;
/** Cross-sell suggestions: what pairs best with what the customer just added. */
export function suggestionsFor(cat: Item["cat"], inCart: string[]): Item[] {
  const pick = (ids: string[]) => ids.map(byId).filter((i) => !inCart.includes(i.id));
  const paletas = menu.filter((m) => m.cat === "paletas").map((m) => m.id);
  const drinks = ["p29", "p31", "p30"]; // batido, pepsi, 7up
  const map: Record<Item["cat"], string[]> = {
    acai: [...paletas, ...drinks],
    helados: ["p28", ...paletas, "p29"],
    paletas: ["p20", "p13", ...drinks],
    bebidas: [...paletas, "p11"],
    accesorios: [...paletas, "p29"],
  };
  return pick(map[cat]).slice(0, 3);
}
