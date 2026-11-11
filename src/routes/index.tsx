import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, ShoppingBag, Star, X, MessageCircle, Flame, Sparkles } from "lucide-react";
import { menu, catOrder, byId, suggestionsFor, type Item } from "@/lib/menu";
import heroAsset from "@/assets/acai-hero.png.asset.json";
import { t, money, WA_NUMBER, type Lang } from "@/lib/i18n";

const HERO = "https://pedidosya.dhmedia.io/image/pedidosya/profile-headers/418b1ef7-2e08-452d-8088-2beeb91ee43b.jpeg?quality=70&width=1920";
const LOGO = "https://pedidosya.dhmedia.io/image/pedidosya/restaurants/7518bb4e-f76a-44be-b9ca-e6026ce62950.jpg?quality=70&width=200";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Modo Açaí · Pedí açaí y helados en Posadas" },
      { name: "description", content: "Cardápio completo de Modo Açaí: bowls de açaí, helados, paletas y bebidas. Pedí por WhatsApp en segundos." },
      { property: "og:title", content: "Modo Açaí · Posadas" },
      { property: "og:description", content: "Açaí y helados artesanales. Pedí por WhatsApp en segundos." },
    ],
  }),
  component: Index,
});

type Cart = Record<string, number>;

function Index() {
  const [lang, setLang] = useState<Lang>("es");
  const [cart, setCart] = useState<Cart>({});
  const [open, setOpen] = useState(false);
  const [upsell, setUpsell] = useState<Item[] | null>(null);
  const [bump, setBump] = useState(0);
  const L = t[lang];

  useEffect(() => {
    const s = localStorage.getItem("ma-cart"); if (s) setCart(JSON.parse(s));
    const l = localStorage.getItem("ma-lang") as Lang | null; if (l) setLang(l);
  }, []);
  useEffect(() => { localStorage.setItem("ma-cart", JSON.stringify(cart)); }, [cart]);
  useEffect(() => { localStorage.setItem("ma-lang", lang); }, [lang]);

  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  const total = Object.entries(cart).reduce((a, [id, q]) => a + byId(id).price * q, 0);
  const inc = (id: string, d = 1) => setCart((c) => { const q = (c[id] ?? 0) + d; const n = { ...c }; if (q <= 0) delete n[id]; else n[id] = q; return n; });
  const add = (it: Item, suggest = true) => {
    inc(it.id); setBump((b) => b + 1);
    if (suggest) { const s = suggestionsFor(it.cat, Object.keys(cart).concat(it.id)); setUpsell(s.length ? s : null); }
  };
  const deals = menu.filter((m) => m.old);

  return (
    <div className="min-h-screen pb-32">
      {/* top bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <img src={LOGO} alt="Modo Açaí" className="h-9 w-9 rounded-full object-cover ring-2 ring-primary" />
            <span className="font-display text-lg font-extrabold">Modo Açaí</span>
          </div>
          <div className="flex rounded-full border border-border bg-muted p-1 text-xs font-bold">
            {(["es", "en"] as Lang[]).map((l) => (
              <button key={l} onClick={() => setLang(l)} className={`rounded-full px-3 py-1 uppercase transition ${lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{l}</button>
            ))}
          </div>
        </div>
        <nav className="no-scrollbar mx-auto flex max-w-5xl gap-2 overflow-x-auto px-4 pb-3">
          {["deals", ...catOrder].map((c) => (
            <a key={c} href={`#${c}`} className="whitespace-nowrap rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium hover:border-primary">
              {c === "deals" ? `🔥 ${L.deal}` : L.cats[c as Item["cat"]]}
            </a>
          ))}
        </nav>
      </header>

      {/* hero */}
      <section className="mx-auto max-w-5xl px-4 pt-6">
        <h1 className="sr-only">{L.tagline}</h1>
        <a href="#acai" className="block overflow-hidden rounded-3xl shadow-card">
          <img src={heroAsset.url} alt={L.tagline} className="aspect-[16/9] w-full object-cover" />
        </a>
      </section>

      {/* deals */}
      <section id="deals" className="mx-auto max-w-5xl scroll-mt-32 px-4 pt-10">
        <h2 className="mb-4 flex items-center gap-2 text-2xl font-extrabold"><Flame className="text-accent" /> {L.deal}</h2>
        <div className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4">
          {deals.map((it) => (
            <button key={it.id} onClick={() => add(it)} className="relative w-64 shrink-0 snap-start overflow-hidden rounded-3xl bg-card-grad text-left shadow-card transition active:scale-95">
              {it.img && <img src={it.img} alt={it.name[lang]} loading="lazy" className="h-40 w-full object-cover" />}
              <span className="absolute left-3 top-3 rounded-full bg-accent px-2.5 py-1 text-xs font-extrabold text-accent-foreground">-{Math.round((1 - it.price / it.old!) * 100)}%</span>
              <div className="p-4">
                <div className="font-display font-bold">{it.name[lang]}</div>
                <div className="mt-1 flex items-center justify-between">
                  <div><span className="text-lg font-extrabold text-primary">{money(it.price)}</span> <s className="text-xs text-muted-foreground">{money(it.old!)}</s></div>
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground"><Plus className="h-5 w-5" /></span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {catOrder.map((c) => (
        <section key={c} id={c} className="mx-auto max-w-5xl scroll-mt-32 px-4 pt-10">
          <h2 className="mb-4 text-2xl font-extrabold">{L.cats[c]}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {menu.filter((m) => m.cat === c).map((it) => (
              <ItemRow key={it.id} it={it} lang={lang} qty={cart[it.id] ?? 0} onAdd={() => add(it)} onDec={() => inc(it.id, -1)} />
            ))}
          </div>
        </section>
      ))}

      {/* floating whatsapp */}
      <a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noreferrer" aria-label={L.chat} className="fixed bottom-24 right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-whatsapp text-primary-foreground shadow-card">
        <MessageCircle className="h-7 w-7" />
      </a>

      {/* sticky cart bar */}
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 p-4">
          <button key={bump} onClick={() => setOpen(true)} className="animate-pop mx-auto flex w-full max-w-md items-center justify-between rounded-full bg-primary px-6 py-4 font-bold text-primary-foreground shadow-glow">
            <span className="flex items-center gap-2"><ShoppingBag className="h-5 w-5" /> {count} {L.items}</span>
            <span>{L.viewCart} · {money(total)}</span>
          </button>
        </div>
      )}

      {upsell && <UpsellSheet items={upsell} lang={lang} onAdd={(it) => { add(it, false); setUpsell((u) => u!.filter((x) => x.id !== it.id)); }} onClose={() => setUpsell(null)} onCheckout={() => { setUpsell(null); setOpen(true); }} />}
      {open && <CartSheet cart={cart} lang={lang} total={total} inc={inc} add={(it) => add(it, false)} onClose={() => setOpen(false)} />}
    </div>
  );
}

function Thumb({ it, lang, className }: { it: Item; lang: Lang; className: string }) {
  return it.img
    ? <img src={it.img} alt={it.name[lang]} loading="lazy" className={`${className} object-cover`} />
    : <div className={`${className} grid place-items-center bg-secondary text-3xl`}>{it.cat === "bebidas" ? "🥤" : "🍧"}</div>;
}

function ItemRow({ it, lang, qty, onAdd, onDec }: { it: Item; lang: Lang; qty: number; onAdd: () => void; onDec: () => void }) {
  const L = t[lang];
  return (
    <div className="flex gap-3 rounded-3xl border border-border bg-card-grad p-3 shadow-card">
      <Thumb it={it} lang={lang} className="h-24 w-24 shrink-0 rounded-2xl" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start gap-2">
          <h3 className="font-display font-bold leading-tight">{it.name[lang]}</h3>
          {it.popular && <span className="shrink-0 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-bold uppercase text-accent">{L.popular}</span>}
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{it.desc[lang]}</p>
        <div className="mt-auto flex items-center justify-between pt-2">
          <div><span className="font-extrabold text-primary">{money(it.price)}</span>{it.old && <s className="ml-1 text-xs text-muted-foreground">{money(it.old)}</s>}</div>
          {qty === 0 ? (
            <button onClick={onAdd} className="flex items-center gap-1 rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground transition active:scale-90"><Plus className="h-4 w-4" />{L.add}</button>
          ) : (
            <Stepper qty={qty} onInc={onAdd} onDec={onDec} />
          )}
        </div>
      </div>
    </div>
  );
}

function Stepper({ qty, onInc, onDec }: { qty: number; onInc: () => void; onDec: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-full bg-secondary p-1">
      <button onClick={onDec} className="grid h-7 w-7 place-items-center rounded-full bg-muted"><Minus className="h-4 w-4" /></button>
      <span className="w-4 text-center font-bold">{qty}</span>
      <button onClick={onInc} className="grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground"><Plus className="h-4 w-4" /></button>
    </div>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-background/70 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border bg-popover p-5 shadow-card sm:rounded-3xl">
        {children}
      </div>
    </div>
  );
}

function UpsellSheet({ items, lang, onAdd, onClose, onCheckout }: { items: Item[]; lang: Lang; onAdd: (i: Item) => void; onClose: () => void; onCheckout: () => void }) {
  const L = t[lang];
  return (
    <Sheet onClose={onClose}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-xl font-extrabold"><Sparkles className="h-5 w-5 text-primary" />{L.upsellTitle}</h3>
        <button onClick={onClose}><X /></button>
      </div>
      <div className="space-y-2">
        {items.map((it) => (
          <button key={it.id} onClick={() => onAdd(it)} className="flex w-full items-center gap-3 rounded-2xl bg-card p-2 text-left active:scale-95">
            <Thumb it={it} lang={lang} className="h-14 w-14 rounded-xl" />
            <span className="flex-1 text-sm font-bold">{it.name[lang]}<br /><span className="text-primary">+{money(it.price)}</span></span>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground"><Plus className="h-5 w-5" /></span>
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button onClick={onClose} className="rounded-full border border-border py-3 font-bold">{lang === "es" ? "Seguir viendo" : "Keep browsing"}</button>
        <button onClick={onCheckout} className="rounded-full bg-primary py-3 font-bold text-primary-foreground">{L.viewCart}</button>
      </div>
    </Sheet>
  );
}

function CartSheet({ cart, lang, total, inc, add, onClose }: { cart: Cart; lang: Lang; total: number; inc: (id: string, d?: number) => void; add: (i: Item) => void; onClose: () => void }) {
  const L = t[lang];
  const [name, setName] = useState(""); const [address, setAddress] = useState(""); const [note, setNote] = useState(""); const [pay, setPay] = useState<"cash" | "transfer">("cash");
  const ids = Object.keys(cart);
  const saved = ids.reduce((a, id) => a + ((byId(id).old ?? byId(id).price) - byId(id).price) * (cart[id] ?? 0), 0);
  const recs = useMemo(() => {
    const cats = new Set(ids.map((i) => byId(i).cat));
    const r = [...cats].flatMap((c) => suggestionsFor(c, ids));
    return [...new Map(r.map((x) => [x.id, x])).values()].slice(0, 4);
  }, [cart]);
  const send = () => {
    const lines = ids.map((id) => `• ${(cart[id] ?? 0)}x ${byId(id).name.es} — ${money(byId(id).price * (cart[id] ?? 0))}`);
    const msg = [t.es.hi, "", ...lines, "", `*Total: ${money(total)}*`, `Nombre: ${name}`, `Entrega: ${address}`, `Pago: ${pay === "cash" ? "Efectivo" : "Transferencia"}`, note && `Nota: ${note}`].filter(Boolean).join("\n");
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, "_blank");
  };
  return (
    <Sheet onClose={onClose}>
      <div className="mb-4 flex items-center justify-between"><h3 className="text-2xl font-extrabold">{L.cart}</h3><button onClick={onClose}><X /></button></div>
      {ids.length === 0 ? <p className="text-muted-foreground">{L.empty}</p> : (
        <>
          <div className="space-y-3">
            {ids.map((id) => { const it = byId(id); return (
              <div key={id} className="flex items-center gap-3">
                <Thumb it={it} lang={lang} className="h-12 w-12 rounded-xl" />
                <div className="flex-1 text-sm"><div className="font-bold">{it.name[lang]}</div><div className="text-muted-foreground">{money(it.price * (cart[id] ?? 0))}</div></div>
                <Stepper qty={(cart[id] ?? 0)} onInc={() => inc(id)} onDec={() => inc(id, -1)} />
              </div>); })}
          </div>
          {recs.length > 0 && (
            <div className="mt-5">
              <div className="mb-2 text-sm font-bold text-muted-foreground">{L.upsellCart}</div>
              <div className="no-scrollbar flex gap-2 overflow-x-auto">
                {recs.map((it) => (
                  <button key={it.id} onClick={() => add(it)} className="w-28 shrink-0 rounded-2xl bg-card p-2 text-left text-xs active:scale-95">
                    <Thumb it={it} lang={lang} className="mb-1 h-20 w-full rounded-xl" />
                    <div className="line-clamp-1 font-bold">{it.name[lang]}</div>
                    <div className="font-bold text-primary">+{money(it.price)}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mt-5 space-y-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={L.name} className="w-full rounded-2xl border border-input bg-muted px-4 py-3 outline-none focus:border-primary" />
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={L.address} className="w-full rounded-2xl border border-input bg-muted px-4 py-3 outline-none focus:border-primary" />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={L.note} className="w-full rounded-2xl border border-input bg-muted px-4 py-3 outline-none focus:border-primary" />
            <div className="grid grid-cols-2 gap-2">
              {(["cash", "transfer"] as const).map((p) => (
                <button key={p} onClick={() => setPay(p)} className={`rounded-2xl border py-2.5 text-sm font-bold ${pay === p ? "border-primary bg-primary/15 text-primary" : "border-input"}`}>{L[p]}</button>
              ))}
            </div>
          </div>
          <div className="mt-5 flex items-end justify-between">
            <span className="text-muted-foreground">{L.total}{saved > 0 && <span className="ml-2 rounded-full bg-accent/20 px-2 py-0.5 text-xs font-bold text-accent">{L.save} {money(saved)}</span>}</span>
            <span className="font-display text-3xl font-extrabold">{money(total)}</span>
          </div>
          <button disabled={!name || !address} onClick={send} className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-whatsapp py-4 font-bold text-primary-foreground shadow-glow disabled:opacity-40">
            <MessageCircle className="h-5 w-5" />{L.checkout}
          </button>
        </>
      )}
    </Sheet>
  );
}
