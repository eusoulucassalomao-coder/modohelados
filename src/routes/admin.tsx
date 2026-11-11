import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Boxes, ClipboardList, LogOut, Package, RefreshCw, Users } from "lucide-react";
import { getCurrentUser, getSession, isSupabaseConfigured, selectRows, signIn, signOut, updateRow, type AuthUser } from "@/lib/supabase";
import { money } from "@/lib/i18n";

export const Route = createFileRoute("/admin")({ component: AdminPage });

type Tab = "orders" | "products" | "customers";
type Status = "new" | "confirmed" | "preparing" | "out_for_delivery" | "delivered" | "cancelled";
type Order = {
  id: string; order_number: number; customer_id: string; status: Status; payment_method: string;
  delivery_address: string; customer_note: string | null; total: number; created_at: string;
  customer?: { name: string; phone: string } | null;
  order_items?: { product_name: { es: string; en: string }; quantity: number; line_total: number }[];
};
type Product = { id: string; name: { es: string; en: string }; description: { es: string; en: string }; cat: string; price: number; old_price: number | null; available: boolean; image_url: string | null; popular: boolean; featured: boolean };
type Customer = { id: string; name: string; phone: string; default_address: string | null; last_order_at: string | null };

const statusLabels: Record<Status, string> = {
  new: "Nuevo", confirmed: "Confirmado", preparing: "En preparación",
  out_for_delivery: "En reparto", delivered: "Entregado", cancelled: "Cancelado",
};
const statusStyles: Record<Status, string> = {
  new: "bg-sky-500/15 text-sky-300", confirmed: "bg-blue-500/15 text-blue-300",
  preparing: "bg-amber-500/15 text-amber-300", out_for_delivery: "bg-violet-500/15 text-violet-300",
  delivered: "bg-emerald-500/15 text-emerald-300", cancelled: "bg-rose-500/15 text-rose-300",
};

function AdminPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("orders");
  const [productGroup, setProductGroup] = useState<"deals" | "regular">("regular");
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerFilter, setCustomerFilter] = useState<"all" | "recent" | "inactive">("all");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [o, p, c] = await Promise.all([
        selectRows<Order>("orders", { select: "*,customer:customers(name,phone),order_items(*)", order: "created_at.desc", limit: "150" }),
        selectRows<Product>("products", { select: "*", order: "cat.asc,name.asc" }),
        selectRows<Customer>("customers", { select: "*", order: "last_order_at.desc.nullslast", limit: "500" }),
      ]);
      setOrders(o); setProducts(p); setCustomers(c);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudieron cargar los datos."); }
  }, []);

  useEffect(() => {
    let active = true;
    const check = async () => {
      if (!isSupabaseConfigured) { if (active) setChecking(false); return; }
      const session = getSession();
      if (!session) { if (active) setChecking(false); return; }
      try {
        const current = await getCurrentUser();
        if (!current) return;
        const profiles = await selectRows<{ id: string; active: boolean; role: string }>("staff_profiles", {
          select: "id,active,role", id: `eq.${current.id}`, limit: "1",
        });
        if (active) {
          setUser(current);
          setAuthorized(Boolean(profiles[0]?.active && ["owner", "staff"].includes(profiles[0]?.role)));
        }
      } catch { /* no profile or expired session */ }
      finally { if (active) setChecking(false); }
    };
    void check();
    return () => { active = false; };
  }, []);

  useEffect(() => { if (authorized) void load(); }, [authorized, load]);

  const stats = useMemo(() => {
    const activeOrders = orders.filter((o) => !["delivered", "cancelled"].includes(o.status));
    const revenue = orders.filter((o) => o.status !== "cancelled").reduce((sum, o) => sum + o.total, 0);
    const today = new Date().toDateString();
    const todayOrders = orders.filter((o) => new Date(o.created_at).toDateString() === today);
    return { active: activeOrders.length, revenue, today: todayOrders.length, customers: customers.length };
  }, [orders, customers]);

  const customerSegments = useMemo(() => {
    const now = Date.now();
    return customers.reduce((counts, customer) => {
      if (!customer.last_order_at) { counts.withoutDate += 1; return counts; }
      const timestamp = new Date(customer.last_order_at).getTime();
      if (!Number.isFinite(timestamp)) { counts.withoutDate += 1; return counts; }
      const days = Math.max(0, Math.floor((now - timestamp) / 86_400_000));
      if (days >= 10) counts.inactive += 1;
      else counts.recent += 1;
      return counts;
    }, { recent: 0, inactive: 0, withoutDate: 0 });
  }, [customers]);

  const filteredCustomers = useMemo(() => customers.filter((customer) => {
    if (!customer.last_order_at) return customerFilter === "all";
    const timestamp = new Date(customer.last_order_at).getTime();
    if (!Number.isFinite(timestamp)) return customerFilter === "all";
    const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
    if (customerFilter === "inactive") return days >= 10;
    if (customerFilter === "recent") return days < 10;
    return true;
  }), [customers, customerFilter]);

  const login = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setLoginError("");
    try {
      const session = await signIn(email.trim(), password);
      const profiles = await selectRows<{ id: string; active: boolean; role: string }>("staff_profiles", {
        select: "id,active,role", id: `eq.${session.user.id}`, limit: "1",
      });
      if (!profiles[0]?.active || !["owner", "staff"].includes(profiles[0].role)) {
        await signOut(); throw new Error("Este usuario no está autorizado para acceder al panel.");
      }
      setUser(session.user); setAuthorized(true); setPassword("");
    } catch (e) { setLoginError(e instanceof Error ? e.message : "No se pudo iniciar sesión."); }
    finally { setBusy(false); }
  };

  const changeStatus = async (order: Order, status: Status) => {
    try {
      await updateRow("orders", { id: `eq.${order.id}` }, { status });
      setOrders((old) => old.map((o) => o.id === order.id ? { ...o, status } : o));
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo actualizar el pedido."); }
  };

  const changeProduct = async (product: Product, values: Partial<Product>) => {
    try {
      await updateRow("products", { id: `eq.${product.id}` }, values);
      setProducts((old) => old.map((p) => p.id === product.id ? { ...p, ...values } : p));
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo actualizar el producto."); }
  };

  const logout = async () => { await signOut(); setUser(null); setAuthorized(false); };

  if (!isSupabaseConfigured) return <Shell><Notice>Configurá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en las variables de entorno de Vercel para habilitar el panel.</Notice></Shell>;
  if (checking) return <Shell><p className="text-sm text-white/60">Verificando acceso...</p></Shell>;
  if (!authorized) return <Shell>
    <form onSubmit={login} className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/[0.04] p-7 shadow-2xl">
      <div className="mb-6 flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-lime-300 text-zinc-950"><Package /></div><div><h1 className="text-xl font-extrabold">Modo Açaí</h1><p className="text-xs text-white/50">Panel de administración</p></div></div>
      <label className="mb-1 block text-sm text-white/70">Correo electrónico</label>
      <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="mb-4 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-lime-300" />
      <label className="mb-1 block text-sm text-white/70">Contraseña</label>
      <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mb-4 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-lime-300" />
      {loginError && <p role="alert" className="mb-3 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">{loginError}</p>}
      <button disabled={busy} className="w-full rounded-xl bg-lime-300 px-4 py-3 font-bold text-zinc-950 disabled:opacity-50">{busy ? "Ingresando..." : "Ingresar"}</button>
      <a href="/" className="mt-4 block text-center text-sm text-white/50 hover:text-white">Volver al menú</a>
    </form>
  </Shell>;

  return <Shell>
    <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-[.2em] text-lime-300">Modo Açaí · Posadas</p><h1 className="mt-1 text-3xl font-extrabold">Panel de control</h1><p className="mt-1 text-sm text-white/50">{user?.email}</p></div>
      <div className="flex gap-2"><button onClick={() => void load()} className="rounded-xl border border-white/10 p-3 hover:bg-white/5" aria-label="Actualizar"><RefreshCw size={18}/></button><button onClick={() => void logout()} className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm hover:bg-white/5"><LogOut size={17}/> Salir</button></div>
    </header>
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Activos (últimos 150)" value={String(stats.active)} icon={<ClipboardList/>}/>
      <Stat label="Pedidos de hoy" value={String(stats.today)} icon={<BarChart3/>}/>
      <Stat label="Ventas (últimos 150)" value={money(stats.revenue)} icon={<Package/>}/>
      <Stat label="Clientes" value={String(stats.customers)} icon={<Users/>}/>
    </div>
    <nav className="mb-5 flex gap-2 overflow-x-auto">
      {([{id:"orders",label:"Pedidos",icon:<ClipboardList size={16}/>},{id:"products",label:"Productos",icon:<Boxes size={16}/>},{id:"customers",label:"Clientes",icon:<Users size={16}/>} ] as const).map((item) =>
        <button key={item.id} onClick={() => setTab(item.id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold ${tab===item.id?"bg-lime-300 text-zinc-950":"border border-white/10 text-white/65 hover:bg-white/5"}`}>{item.icon}{item.label}</button>
      )}
    </nav>
    {error && <p role="alert" className="mb-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
    {tab === "orders" && <section className="space-y-3">
      <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Últimos pedidos</h2><span className="text-xs text-white/45">{orders.length} registros</span></div>
      {orders.length===0 ? <Empty>No hay pedidos registrados todavía.</Empty> : orders.map((order) => <article key={order.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="flex items-center gap-2"><h3 className="font-extrabold">Pedido #{order.order_number}</h3><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusStyles[order.status]}`}>{statusLabels[order.status]}</span></div><p className="mt-1 text-sm text-white/60">{order.customer?.name || "Cliente"} · {order.customer?.phone || "Sin teléfono"}</p><p className="text-xs text-white/40">{new Date(order.created_at).toLocaleString("es-AR")}</p></div>
          <strong className="text-xl text-lime-300">{money(order.total)}</strong>
        </div>
        <div className="my-3 space-y-1 border-y border-white/10 py-3 text-sm text-white/65">
          {(order.order_items||[]).map((item,i)=><p key={i}>{item.quantity}× {item.product_name?.es || "Producto"} <span className="float-right">{money(item.line_total)}</span></p>)}
          <p className="pt-1 text-xs">Entrega: {order.delivery_address} · Pago: {order.payment_method==="cash"?"Efectivo":"Transferencia"}</p>
          {order.customer_note && <p className="text-xs">Nota: {order.customer_note}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2"><label className="text-xs text-white/45">Estado</label><select value={order.status} onChange={(e)=>void changeStatus(order,e.target.value as Status)} className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm">{Object.entries(statusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><a className="ml-auto text-sm font-semibold text-lime-300 hover:underline" href={`https://wa.me/${(order.customer?.phone||"").replace(/\D/g,"")}`} target="_blank" rel="noreferrer">WhatsApp cliente ↗</a></div>
      </article>)}
    </section>}
    {tab === "products" && <section><h2 className="mb-3 text-xl font-bold">Catálogo · {products.length} productos</h2><div className="mb-4 flex gap-2"><button onClick={()=>setProductGroup("deals")} className={`rounded-xl px-4 py-2 text-sm font-bold ${productGroup==="deals"?"bg-lime-300 text-zinc-950":"border border-white/10 text-white/65"}`}>🔥 Ofertas del día ({products.filter(p=>p.featured).length})</button><button onClick={()=>setProductGroup("regular")} className={`rounded-xl px-4 py-2 text-sm font-bold ${productGroup==="regular"?"bg-lime-300 text-zinc-950":"border border-white/10 text-white/65"}`}>Productos normales ({products.filter(p=>!p.featured).length})</button></div><div className="space-y-2">{products.filter(p=>productGroup==="deals"?p.featured:!p.featured).map((product)=><article key={product.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3">
      {product.image_url ? <img src={product.image_url} alt="" className="h-14 w-14 rounded-xl object-cover"/> : <div className="grid h-14 w-14 place-items-center rounded-xl bg-white/5"><Package/></div>}
      <div className="min-w-0 flex-1"><p className="truncate font-bold">{product.name.es}</p><p className="text-xs text-white/45">{product.cat}</p></div>
      <label className="flex items-center gap-2 text-sm"><span className="text-white/50">$</span><input type="number" min="0" step="50" defaultValue={product.price} onBlur={(e)=>{const v=Number(e.target.value);if(Number.isFinite(v)&&v>=0&&v!==product.price)void changeProduct(product,{price:v});}} className="w-24 rounded-lg border border-white/10 bg-black/20 px-2 py-2"/></label>
      <label className="flex items-center gap-2 text-xs text-amber-300"><input type="checkbox" checked={product.featured} onChange={(e)=>void changeProduct(product,{featured:e.target.checked})}/> Oferta del día</label>
      <label className="flex items-center gap-2 text-xs text-white/60"><input type="checkbox" checked={product.available} onChange={(e)=>void changeProduct(product,{available:e.target.checked})}/> Disponible</label>
    </article>)}</div></section>}
    {tab === "customers" && <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-bold">Clientes · {customers.length}</h2><p className="mt-1 text-xs text-white/45">Clasificación según la última compra registrada</p></div><button onClick={() => void load()} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/65 hover:bg-white/5">Actualizar clientes</button></div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <button onClick={() => setCustomerFilter("all")} className={`rounded-xl border p-3 text-left ${customerFilter === "all" ? "border-lime-300 bg-lime-300/10" : "border-white/10 bg-white/[0.03]"}`}><span className="block text-xs text-white/55">Todos</span><strong className="mt-1 block text-xl">{customers.length}</strong></button>
        <button onClick={() => setCustomerFilter("recent")} className={`rounded-xl border p-3 text-left ${customerFilter === "recent" ? "border-emerald-300 bg-emerald-300/10" : "border-white/10 bg-white/[0.03]"}`}><span className="block text-xs text-white/55">Recientes · menos de 10 días</span><strong className="mt-1 block text-xl">{customerSegments.recent}</strong></button>
        <button onClick={() => setCustomerFilter("inactive")} className={`rounded-xl border p-3 text-left ${customerFilter === "inactive" ? "border-amber-300 bg-amber-300/10" : "border-white/10 bg-white/[0.03]"}`}><span className="block text-xs text-white/55">Sin comprar · 10+ días</span><strong className="mt-1 block text-xl">{customerSegments.inactive}</strong></button>
      </div>
      {customerSegments.withoutDate > 0 && <p className="mb-3 text-xs text-white/40">{customerSegments.withoutDate} cliente(s) sin fecha de última compra registrada; aparecen únicamente en “Todos”.</p>}
      {customers.length===0 ? <Empty>Los clientes aparecerán automáticamente cuando realicen su primer pedido.</Empty> : filteredCustomers.length===0 ? <Empty>No hay clientes en esta categoría.</Empty> : <div className="space-y-2">{filteredCustomers.map((customer)=>{
        const lastOrder = customer.last_order_at ? new Date(customer.last_order_at) : null;
        const hasValidDate = lastOrder !== null && Number.isFinite(lastOrder.getTime());
        const days = hasValidDate && lastOrder ? Math.max(0, Math.floor((Date.now() - lastOrder.getTime()) / 86_400_000)) : null;
        const inactive = days !== null && days >= 10;
        const lastOrderLabel = hasValidDate && lastOrder ? `Última compra: ${lastOrder.toLocaleDateString("es-AR")} · hace ${days} día(s)` : "Sin fecha de última compra";
        return <article key={customer.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="min-w-0"><p className="font-bold">{customer.name}</p><p className="text-sm text-white/55">{customer.phone}</p><p className="text-xs text-white/35">{customer.default_address||"Sin dirección guardada"}</p><p className="mt-1 text-xs text-white/50">{lastOrderLabel}</p></div><div className="flex items-center gap-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${inactive ? "bg-amber-500/15 text-amber-300" : days === null ? "bg-white/10 text-white/50" : "bg-emerald-500/15 text-emerald-300"}`}>{inactive ? `${days} días sin comprar` : days === null ? "Sin fecha" : "Reciente"}</span><a className="text-sm font-semibold text-lime-300" href={`https://wa.me/${customer.phone.replace(/\D/g,"")}`} target="_blank" rel="noreferrer">Contactar ↗</a></div></article>;
      })}</div>}
    </section>}
    <footer className="mt-10 border-t border-white/10 pt-4 text-xs text-white/35">Panel privado · Los datos se consultan directamente desde Supabase.</footer>
  </Shell>;
}

function Shell({children}:{children:React.ReactNode}) { return <main className="min-h-screen bg-[#10120e] px-4 py-8 text-white sm:px-6"><div className="mx-auto w-full max-w-5xl">{children}</div></main>; }
function Stat({label,value,icon}:{label:string;value:string;icon:React.ReactNode}) { return <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="mb-3 flex items-center justify-between text-lime-300">{icon}<span className="text-xs text-white/45">{label}</span></div><p className="text-2xl font-extrabold">{value}</p></article>; }
function Empty({children}:{children:React.ReactNode}) { return <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-white/45">{children}</div>; }
function Notice({children}:{children:React.ReactNode}) { return <div className="max-w-lg rounded-2xl border border-amber-300/20 bg-amber-300/10 p-5 text-sm text-amber-100">{children}</div>; }
