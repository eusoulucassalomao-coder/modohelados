const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "");
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const SESSION_KEY = "modo-acai-auth";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

export type AuthUser = { id: string; email?: string; user_metadata?: Record<string, unknown> };
export type AuthSession = { access_token: string; refresh_token: string; expires_at?: number; user: AuthUser };

function readSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null") as AuthSession | null; }
  catch { return null; }
}
function writeSession(session: AuthSession | null) {
  if (typeof window !== "undefined") {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  }
}
async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Supabase no está configurado.");
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token || readSession()?.access_token || SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await response.text();
  const data = body ? JSON.parse(body) : null;
  if (!response.ok && response.status === 401 && !path.startsWith("/auth/v1/token")) {
    const session = readSession();
    if (session?.refresh_token) {
      try {
        const refreshed = await request<AuthSession>("/auth/v1/token?grant_type=refresh_token", {
          method: "POST", body: JSON.stringify({ refresh_token: session.refresh_token }),
        }, SUPABASE_KEY);
        writeSession(refreshed);
        return request<T>(path, init, refreshed.access_token);
      } catch { writeSession(null); }
    }
  }
  if (!response.ok) throw new Error(data?.message || data?.msg || data?.error_description || data?.hint || "Error al comunicarse con Supabase.");
  return data as T;
}

export async function signIn(email: string, password: string) {
  const session = await request<AuthSession>("/auth/v1/token?grant_type=password", {
    method: "POST", body: JSON.stringify({ email, password }),
  }, SUPABASE_KEY);
  writeSession(session);
  return session;
}
export async function signOut() {
  const session = readSession();
  if (session) {
    try { await request("/auth/v1/logout", { method: "POST" }, session.access_token); }
    finally { writeSession(null); }
  }
}
export function getSession() { return readSession(); }
export async function getCurrentUser() {
  const session = readSession();
  if (!session) return null;
  try { return await request<AuthUser>("/auth/v1/user"); }
  catch { writeSession(null); return null; }
}
export async function selectRows<T>(table: string, query: Record<string, string> = {}) {
  const params = new URLSearchParams(query);
  return request<T[]>(`/rest/v1/${table}?${params.toString()}`);
}
export async function updateRow<T>(table: string, filters: Record<string, string>, values: Record<string, unknown>) {
  const params = new URLSearchParams(filters);
  return request<T[]>(`/rest/v1/${table}?${params.toString()}`, {
    method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(values),
  });
}
export async function insertRow<T>(table: string, values: Record<string, unknown>) {
  return request<T[]>(`/rest/v1/${table}`, {
    method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(values),
  });
}

export async function uploadProductImage(file: File, productId: string) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Supabase no está configurado.");
  const session = readSession();
  if (!session?.access_token) throw new Error("Tu sesión expiró. Iniciá sesión nuevamente.");
  const allowedTypes: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  };
  const extension = allowedTypes[file.type];
  if (!extension) throw new Error("Usá una imagen JPG, PNG o WebP.");
  if (file.size > 5 * 1024 * 1024) throw new Error("La imagen no puede superar los 5 MB.");
  const path = `${encodeURIComponent(productId)}-${Date.now()}.${extension}`;
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/product-images/${path}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": file.type,
      "x-upsert": "false",
      "Cache-Control": "3600",
    },
    body: file,
  });
  const body = await response.text();
  const data = body ? JSON.parse(body) : null;
  if (!response.ok) throw new Error(data?.message || data?.error || "No se pudo subir la imagen.");
  return `${SUPABASE_URL}/storage/v1/object/public/product-images/${path}`;
}

export async function callRpc<T>(name: string, args: Record<string, unknown>) {
  return request<T>(`/rest/v1/rpc/${name}`, { method: "POST", body: JSON.stringify(args) });
}
