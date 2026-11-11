-- Modo Açaí CRM schema and initial catalog
create extension if not exists pgcrypto;
create sequence if not exists public.order_number_seq start with 1001;

create table if not exists public.products (
 id text primary key, cat text not null check (cat in ('acai','helados','paletas','bebidas','accesorios')),
 name jsonb not null, description jsonb not null, price integer not null check (price >= 0),
 old_price integer check (old_price is null or old_price >= 0), image_url text,
 popular boolean not null default false, featured boolean not null default false,
 available boolean not null default true, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.customers (
 id uuid primary key default gen_random_uuid(), name text not null, phone text not null unique,
 default_address text, notes text, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), last_order_at timestamptz
);
create table if not exists public.orders (
 id uuid primary key default gen_random_uuid(), order_number bigint not null unique default nextval('public.order_number_seq'),
 customer_id uuid not null references public.customers(id),
 status text not null default 'new' check (status in ('new','confirmed','preparing','out_for_delivery','delivered','cancelled')),
 payment_method text not null check (payment_method in ('cash','transfer')), delivery_address text not null,
 customer_note text, subtotal integer not null check (subtotal >= 0), total integer not null check (total >= 0),
 source text not null default 'menu', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.order_items (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
 product_id text references public.products(id) on delete set null, product_name jsonb not null,
 quantity integer not null check (quantity > 0 and quantity <= 99),
 unit_price integer not null check (unit_price >= 0), line_total integer not null check (line_total >= 0)
);
create table if not exists public.staff_profiles (
 id uuid primary key references auth.users(id) on delete cascade, email text not null unique,
 full_name text, role text not null default 'staff' check (role in ('owner','staff')),
 active boolean not null default true, created_at timestamptz not null default now()
);

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create or replace function private.is_staff() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.staff_profiles where id=(select auth.uid()) and active=true);
$$;
create or replace function private.is_owner() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.staff_profiles where id=(select auth.uid()) and active=true and role='owner');
$$;
grant execute on function private.is_staff() to authenticated;
grant execute on function private.is_owner() to authenticated;
create or replace function public.bootstrap_modo_staff() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if lower(new.email)='modo@helados.com' then
  insert into public.staff_profiles(id,email,full_name,role,active)
  values(new.id,lower(new.email),coalesce(new.raw_user_meta_data->>'full_name','Administrador Modo Açaí'),'owner',true)
  on conflict(id) do update set email=excluded.email,role='owner',active=true;
 end if;
 return new;
end;
$$;
drop trigger if exists on_auth_user_created_modo_staff on auth.users;
create trigger on_auth_user_created_modo_staff after insert on auth.users for each row execute procedure public.bootstrap_modo_staff();

create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at=now(); return new; end;
$$;
drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products for each row execute procedure public.set_updated_at();
drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at before update on public.customers for each row execute procedure public.set_updated_at();
drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at before update on public.orders for each row execute procedure public.set_updated_at();

alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.staff_profiles enable row level security;

drop policy if exists "Catalog visibility" on public.products;
drop policy if exists "Authenticated catalog visibility" on public.products;
drop policy if exists "Public can view available products" on public.products;
drop policy if exists "Staff can view all products" on public.products;
create policy "Catalog visibility" on public.products for select to anon using(available=true);
create policy "Authenticated catalog visibility" on public.products for select to authenticated using(available=true or private.is_staff());
drop policy if exists "Staff can insert products" on public.products;
create policy "Staff can insert products" on public.products for insert to authenticated with check(private.is_staff());
drop policy if exists "Staff can update products" on public.products;
create policy "Staff can update products" on public.products for update to authenticated using(private.is_staff()) with check(private.is_staff());
drop policy if exists "Owners can delete products" on public.products;
create policy "Owners can delete products" on public.products for delete to authenticated using(private.is_owner());

drop policy if exists "Staff can view customers" on public.customers;
create policy "Staff can view customers" on public.customers for select to authenticated using(private.is_staff());
drop policy if exists "Staff can update customers" on public.customers;
create policy "Staff can update customers" on public.customers for update to authenticated using(private.is_staff()) with check(private.is_staff());
drop policy if exists "Staff can view orders" on public.orders;
create policy "Staff can view orders" on public.orders for select to authenticated using(private.is_staff());
drop policy if exists "Staff can update orders" on public.orders;
create policy "Staff can update orders" on public.orders for update to authenticated using(private.is_staff()) with check(private.is_staff());
drop policy if exists "Staff can view order items" on public.order_items;
create policy "Staff can view order items" on public.order_items for select to authenticated using(private.is_staff());
drop policy if exists "Staff can view own staff profile" on public.staff_profiles;
create policy "Staff can view own staff profile" on public.staff_profiles for select to authenticated using(id=(select auth.uid()) or private.is_owner());
drop policy if exists "Owners can add staff" on public.staff_profiles;
create policy "Owners can add staff" on public.staff_profiles for insert to authenticated with check(private.is_owner());
drop policy if exists "Owners can update staff" on public.staff_profiles;
create policy "Owners can update staff" on public.staff_profiles for update to authenticated using(private.is_owner()) with check(private.is_owner());
drop policy if exists "Owners can remove staff" on public.staff_profiles;
create policy "Owners can remove staff" on public.staff_profiles for delete to authenticated using(private.is_owner());

create or replace function public.place_order(p_name text,p_phone text,p_address text,p_note text,p_payment text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v_customer_id uuid; v_order_id uuid; v_order_number bigint; v_total integer:=0;
 v_item jsonb; v_product public.products%rowtype; v_qty integer; v_phone text;
begin
 if length(trim(coalesce(p_name,'')))<2 then raise exception 'Nombre inválido'; end if;
 v_phone:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
 if length(v_phone)<8 or length(v_phone)>16 then raise exception 'Teléfono inválido'; end if;
 if length(trim(coalesce(p_address,'')))<3 then raise exception 'Dirección inválida'; end if;
 if p_payment not in ('cash','transfer') then raise exception 'Forma de pago inválida'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>50 then raise exception 'Items inválidos'; end if;
 insert into public.customers(name,phone,default_address,last_order_at) values(trim(p_name),v_phone,trim(p_address),now())
 on conflict(phone) do update set name=excluded.name,default_address=excluded.default_address,last_order_at=now() returning id into v_customer_id;
 insert into public.orders(customer_id,payment_method,delivery_address,customer_note,subtotal,total)
 values(v_customer_id,p_payment,trim(p_address),nullif(trim(coalesce(p_note,'')),''),0,0)
 returning id,order_number into v_order_id,v_order_number;
 for v_item in select value from jsonb_array_elements(p_items) loop
  if coalesce((v_item->>'quantity')::integer,0)<1 or (v_item->>'quantity')::integer>99 then raise exception 'Cantidad inválida'; end if;
  v_qty:=(v_item->>'quantity')::integer;
  select * into v_product from public.products where id=v_item->>'product_id' and available=true;
  if not found then raise exception 'Producto no disponible'; end if;
  v_total:=v_total+v_product.price*v_qty;
  insert into public.order_items(order_id,product_id,product_name,quantity,unit_price,line_total)
  values(v_order_id,v_product.id,v_product.name,v_qty,v_product.price,v_product.price*v_qty);
 end loop;
 update public.orders set subtotal=v_total,total=v_total where id=v_order_id;
 return jsonb_build_object('id',v_order_id,'order_number',v_order_number,'total',v_total,'status','new');
end;
$$;
revoke all on function public.place_order(text,text,text,text,text,jsonb) from public;
grant execute on function public.place_order(text,text,text,text,text,jsonb) to anon,authenticated;
revoke all on function public.bootstrap_modo_staff() from public,anon,authenticated;
revoke all on function public.is_staff() from public,anon,authenticated;
revoke all on function public.is_owner() from public,anon,authenticated;
grant execute on function private.is_staff() to authenticated;
grant execute on function private.is_owner() to authenticated;

drop function if exists public.is_staff();
drop function if exists public.is_owner();

grant select on public.products to anon,authenticated;
grant insert,update,delete on public.products to authenticated;
grant select,update on public.customers to authenticated;
grant select,update on public.orders to authenticated;
grant select on public.order_items to authenticated;
grant select,insert,update,delete on public.staff_profiles to authenticated;

create index if not exists orders_customer_id_idx on public.orders(customer_id);
create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists orders_status_created_at_idx on public.orders(status,created_at desc);
create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists order_items_product_id_idx on public.order_items(product_id);
create index if not exists products_cat_available_idx on public.products(cat,available);

insert into public.products(id,cat,name,description,price,old_price,image_url,popular,featured,available) values
('p0','helados','{"es":"Helado 1/4","en":"Ice cream 1/4 kg"}'::jsonb,'{"es":"Delicioso helado artesanal, con una variedad de sabores para disfrutar.","en":"Handmade ice cream with a variety of flavors to enjoy."}'::jsonb,6750,7500,'https://pedidosya.dhmedia.io/image/pedidosya/products/37d1273b-0c30-47f2-856b-e09b28b4d4b8.jpeg?quality=85&width=600',true,true,true),
('p1','helados','{"es":"Açaí 1kg","en":"Açaí 1 kg"}'::jsonb,'{"es":"1 kilo de açaí. los toppings se venden por separado y se pueden agregar al pedido. incluyen frutas, ingredientes secos y salsas","en":"1 kilo of açaí. Toppings sold separately: fruits, dry toppings and sauces."}'::jsonb,28000,null,'https://pedidosya.dhmedia.io/image/pedidosya/products/71c44472-279b-48b7-afff-e17cb415903f.jpeg?quality=85&width=600',false,false,true),
('p2','helados','{"es":"Helado 1/2 kg","en":"Ice cream 1/2 kg"}'::jsonb,'{"es":"Elegí la combinación de sabores que mas te gusten para disfrutar de un momento agradable.","en":"Pick the flavor combo you love most for a sweet moment."}'::jsonb,10150,14500,'https://pedidosya.dhmedia.io/image/pedidosya/products/9ee50637-5555-49cb-9b2b-5b633923824f.jpeg?quality=85&width=600',true,true,true),
('p3','helados','{"es":"Açaí 1/2 kg","en":"Açaí 1/2 kg"}'::jsonb,'{"es":"1/2 kilo de açaí. los toppings se venden por separado y se pueden agregar al pedido. incluyen frutas, ingredientes secos y salsas","en":"1/2 kilo of açaí. Toppings sold separately: fruits, dry toppings and sauces."}'::jsonb,15500,null,'https://pedidosya.dhmedia.io/image/pedidosya/products/482bc5c5-0036-4cf9-ae1a-5c867618284a.jpeg?quality=85&width=600',false,false,true),
('p4','helados','{"es":"Açaí 1/4 kg","en":"Açaí 1/4 kg"}'::jsonb,'{"es":"1/4 kilo de açaí. los toppings se venden por separado y se pueden agregar al pedido. incluyen frutas, ingredientes secos y salsas","en":"1/4 kilo of açaí. Toppings sold separately: fruits, dry toppings and sauces."}'::jsonb,9000,null,'https://pedidosya.dhmedia.io/image/pedidosya/products/7bcc3adc-0b49-452f-9dc1-99eefcd1e02f.jpeg?quality=85&width=600',false,false,true),
('p5','helados','{"es":"Helado 1kg","en":"Ice cream 1 kg"}'::jsonb,'{"es":"Elegí la combinación de sabores que mas te gusten para disfrutar de un momento agradable","en":"Pick the flavor combo you love most for a sweet moment."}'::jsonb,23000,null,'https://pedidosya.dhmedia.io/image/pedidosya/products/e8b97f2c-377d-4268-af53-15d7c6a4e383.jpeg?quality=85&width=600',true,true,true),
('p6','paletas','{"es":"Paleta açaí con paçoca","en":"Açaí pop with paçoca"}'::jsonb,'{"es":"Paleta de açaí relleno con paçoca","en":"Açaí popsicle filled with paçoca."}'::jsonb,6000,null,'https://pedidosya.dhmedia.io/image/pedidosya/products/aed18dfd-cebd-4a49-95e2-c58eb473105d.jpeg?quality=85&width=600',false,false,true),
('p7','paletas','{"es":"Paleta açaí con leche condensada","en":"Açaí pop with condensed milk"}'::jsonb,'{"es":"Paleta de açaí por fuera rellenas de leche condensada","en":"Açaí popsicle filled with condensed milk."}'::jsonb,6000,null,'https://pedidosya.dhmedia.io/image/pedidosya/products/7024de9e-ac93-4994-b91f-d5349c6b1380.jpeg?quality=85&width=600',false,false,true),
('p8','acai','{"es":"Açaí tentación grande","en":"Açaí temptation large"}'::jsonb,'{"es":"Açaí acompañado de salsa de chocolate con avellanas, frutillas, obleas, kit kat, pelotitas chocolate y rocklets","en":"Açaí with hazelnut chocolate sauce, strawberries, wafers, kit kat, chocolate balls and rocklets"}'::jsonb,11000,null,'https://pedidosya.dhmedia.io/image/pedidosya/products/8560107b-f6b0-4fc4-90d7-32e7b6512b0b.jpeg?quality=85&width=600',false,false,true),
('p9','acai','{"es":"Açaí obletón grande","en":"Açaí wafer large"}'::jsonb,'{"es":"Açaí acompañado de paçoca (mantecol), frutilla, coockie selecta, dulce de leche y obleas.","en":"Açaí with paçoca, strawberry, Selecta cookie, dulce de leche and wafers."}'::jsonb,11000,null,'https://pedidosya.dhmedia.io/image/pedidosya/products/ecbf9ba1-c396-44ce-bcab-37fd6c05fc01.jpeg?quality=85&width=600',false,false,true),
('p10','acai','{"es":"Açaí natural grande","en":"Açaí natural large"}'::jsonb,'{"es":"Açaí acompañado de coco rallado, leche condensada, granola, mani y banana.","en":"Açaí with shredded coconut, condensed milk, granola, peanuts and banana."}'::jsonb,9900,11000,'https://pedidosya.dhmedia.io/image/pedidosya/products/b1fd0846-1ee9-47ba-86af-7466e2f5776e.jpeg?quality=85&width=600',true,true,true),
('p11','acai','{"es":"Açaí tropical grande","en":"Açaí tropical large"}'::jsonb,'{"es":"Incluye leche condensada, semillas de chia, leche nido, kiwi, banana y frutilla.","en":"Includes condensed milk, chia seeds, Nido milk, kiwi, banana and strawberry."}'::jsonb,11000,null,'https://pedidosya.dhmedia.io/image/pedidosya/products/f97b3485-dc7b-4455-a073-f405b17419d9.jpeg?quality=85&width=600',true,true,true),
('p12','acai','{"es":"Açaí frutos rojos grande","en":"Açaí berries large"}'::jsonb,'{"es":"Açaí acompañado de salsa de chocolate con avellanas, coockie selecta, frutos rojos y leche nido.","en":"Açaí with hazelnut chocolate sauce, Selecta cookie, berries and Nido milk."}'::jsonb,11000,null,'https://pedidosya.dhmedia.io/image/pedidosya/products/7609b603-64bc-4041-a02d-1851bed41a90.jpeg?quality=85&width=600',true,true,true),
('p13','acai','{"es":"Açaí frutos rojos chico","en":"Açaí berries small"}'::jsonb,'{"es":"Açai, leche nido, cookie selecta, salsa de chocolate con avellanas y frutos rojos","en":"Açaí, Nido milk, Selecta cookie, hazelnut chocolate sauce and berries"}'::jsonb,6000,null,'https://pedidosya.dhmedia.io/image/pedidosya/products/acc50aa2-fbb4-4963-9063-9b60b0c5f6a6.jpeg?quality=85&width=600',false,false,true),
('p14','acai','{"es":"Açaí tropical chico","en":"Açaí tropical small"}'::jsonb,'{"es":"Açai, leche nido, leche condensada, kiwi, banana, frutilla","en":"Açaí, Nido milk, condensed milk, kiwi, banana, strawberry"}'::jsonb,6000,null,'https://pedidosya.dhmedia.io/image/pedidosya/products/ac7cd503-4fea-46ac-8ea7-eb43cd5fbd75.jpeg?quality=85&width=600',true,true,true),
('p15','acai','{"es":"Açaí natural chico","en":"Açaí natural small"}'::jsonb,'{"es":"Açai, coco rayado, leche condensada, mani, granola y banana","en":"Açaí, shredded coconut, condensed milk, peanuts, granola and banana"}'::jsonb,6000,null,'https://pedidosya.dhmedia.io/image/pedidosya/products/13ec3c53-823a-4041-aa3b-1a3b2aaec3a2.jpeg?quality=85&width=600',false,false,true),
('p16','acai','{"es":"Açaí obletón chico","en":"Açaí wafer small"}'::jsonb,'{"es":"Açai, paçoca (mantecol), cookie selecta, dulce de leche, frutilla, obleas","en":"Açaí, paçoca, Selecta cookie, dulce de leche, strawberry, wafers"}'::jsonb,6000,null,'https://pedidosya.dhmedia.io/image/pedidosya/products/9a5565b4-1f9d-4605-96b7-272636cabd20.jpeg?quality=85&width=600',false,false,true),
('p17','acai','{"es":"Açaí tentación chico","en":"Açaí temptation small"}'::jsonb,'{"es":"Açai, salsa de chocolate con avellanas, frutillas, obleas, kit kat, y rocklets","en":"Açaí, hazelnut chocolate sauce, strawberries, wafers, kit kat, and rocklets"}'::jsonb,6000,null,'https://pedidosya.dhmedia.io/image/pedidosya/products/b7037e0d-b2c4-4bec-880e-47b2721eaae7.jpeg?quality=85&width=600',false,false,true),
('p18','acai','{"es":"Açaí argento chico","en":"Açaí argento small"}'::jsonb,'{"es":"Açaí acompañado de banana, chocolinas, maní y dulce de leche.","en":"Açaí with banana, chocolate cookies, peanuts and dulce de leche."}'::jsonb,6000,null,'https://pedidosya.dhmedia.io/image/pedidosya/products/93c3cc7c-6e0c-46e0-b63f-dd4724e16117.jpeg?quality=85&width=600',false,false,true),
('p19','acai','{"es":"Açaí choco oreo chico","en":"Açaí choco oreo small"}'::jsonb,'{"es":"Açaí acompañado con kit kat, oreos, pelotitas de chocolate y salsa de chocolate con avellanas.","en":"Açaí with kit kat, Oreos, chocolate balls and hazelnut chocolate sauce."}'::jsonb,6000,null,'https://pedidosya.dhmedia.io/image/pedidosya/products/60657a80-3391-41e1-a15e-b19abebdd992.jpeg?quality=85&width=600',true,true,true),
('p20','acai','{"es":"Açaí premium chico","en":"Açaí premium small"}'::jsonb,'{"es":"Açaí acompañado con nueces, almendras, leche en polvo y salsa de chocolate con avellanas.","en":"Açaí with walnuts, almonds, powdered milk and hazelnut chocolate sauce."}'::jsonb,6000,null,'https://pedidosya.dhmedia.io/image/pedidosya/products/9256b469-1e12-4dd1-a5d4-b2240193019e.jpeg?quality=85&width=600',false,false,true),
('p21','acai','{"es":"Açaí clásico chico","en":"Açaí classic small"}'::jsonb,'{"es":"Açaí acompañado con leche en polvo y leche condensada.","en":"Açaí with powdered milk and condensed milk."}'::jsonb,6000,null,'https://pedidosya.dhmedia.io/image/pedidosya/products/00ab0ec8-02f4-4adb-a64c-104fa869e468.jpeg?quality=85&width=600',false,false,true),
('p22','acai','{"es":"Açaí argento grande","en":"Açaí argento large"}'::jsonb,'{"es":"Açaí acompañado de banana, chocolinas, maní y dulce de leche.","en":"Açaí with banana, chocolate cookies, peanuts and dulce de leche."}'::jsonb,11000,null,'https://pedidosya.dhmedia.io/image/pedidosya/products/0bdbcb08-212e-4099-a6c1-fc8e239c92a0.jpeg?quality=85&width=600',false,false,true),
('p23','acai','{"es":"Açaí choco oreo grande","en":"Açaí choco oreo large"}'::jsonb,'{"es":"Açaí acompañado con kit kat, oreos, pelotitas de chocolate y salsa de chocolate con avellanas.","en":"Açaí with kit kat, Oreos, chocolate balls and hazelnut chocolate sauce."}'::jsonb,11000,null,'https://pedidosya.dhmedia.io/image/pedidosya/products/1758141b-f567-4177-a79f-4694094f727f.jpeg?quality=85&width=600',false,false,true),
('p24','acai','{"es":"Açaí premium grande","en":"Açaí premium large"}'::jsonb,'{"es":"Açaí acompañado con nueces, almendras, leche en polvo y salsa de chocolate con avellanas.","en":"Açaí with walnuts, almonds, powdered milk and hazelnut chocolate sauce."}'::jsonb,11000,null,'https://pedidosya.dhmedia.io/image/pedidosya/products/a9cca6f6-f841-4ae2-85e5-8a33b2afd4cc.jpeg?quality=85&width=600',false,false,true),
('p25','acai','{"es":"Açaí clásico grande","en":"Açaí classic large"}'::jsonb,'{"es":"Açaí acompañado con leche en polvo y leche condensada.","en":"Açaí with powdered milk and condensed milk."}'::jsonb,11000,null,'https://pedidosya.dhmedia.io/image/pedidosya/products/c0e3fb70-961c-4c99-b8be-e997447e0cc3.jpeg?quality=85&width=600',false,false,true),
('p26','acai','{"es":"Combo argento+clásico","en":"Argento + Classic combo"}'::jsonb,'{"es":"2 vasos de açaí chicos. 1 argento: dulce de leche, maní, chocolinas y banana. 1 clásico: leche condensada y leche en polvo","en":"2 small açaí cups. Argento: dulce de leche, peanuts, chocolate cookies, banana. Classic: condensed milk and powdered milk."}'::jsonb,10800,12000,'https://pedidosya.dhmedia.io/image/pedidosya/products/b1fd0846-1ee9-47ba-86af-7466e2f5776e.jpeg?quality=85&width=600',false,false,true),
('p27','accesorios','{"es":"Vasito","en":"Small cup"}'::jsonb,'{"es":"Práctico vasito, perfecto para disfrutar tu helado o postre.","en":"Handy cup, perfect for your ice cream."}'::jsonb,400,null,'https://pedidosya.dhmedia.io/image/pedidosya/products/7e7301c3-4831-432a-a59c-3316edeaa5a1.jpeg?quality=85&width=600',false,false,true),
('p28','accesorios','{"es":"Cucurucho","en":"Cone"}'::jsonb,'{"es":"Cucurucho crujiente, ideal para acompañar tu helado favorito.","en":"Crunchy cone for your favorite ice cream."}'::jsonb,500,null,'https://pedidosya.dhmedia.io/image/pedidosya/products/6b6dbe4c-5239-43e7-a765-9acaa5d697a5.jpeg?quality=85&width=600',true,true,true),
('p29','bebidas','{"es":"Batido","en":"Milkshake"}'::jsonb,'{"es":"Refrescante batido preparado con 3 bochas de helado y leche fresca.","en":"Refreshing shake with 3 scoops of ice cream and fresh milk."}'::jsonb,7000,null,'https://pedidosya.dhmedia.io/image/pedidosya/products/d22198b8-0ad8-497d-85fb-3a1d7d030f87.jpeg?quality=85&width=600',false,false,true),
('p30','bebidas','{"es":"Seven-up de limón lata 355 ml","en":"Seven-up lemon can 355 ml"}'::jsonb,'{"es":"Lata de 7up 355ml","en":"Can of 7up 355ml"}'::jsonb,2500,null,'https://pedidosya.dhmedia.io/image/pedidosya/products/6749ba984c1f8c15d50daf73.jpg?quality=85&width=600',false,false,true),
('p31','bebidas','{"es":"Gaseosa Pepsi 500 ml","en":"Pepsi 500 ml"}'::jsonb,'{"es":"500 ml","en":"500 ml"}'::jsonb,2000,null,'https://pedidosya.dhmedia.io/image/pedidosya/products/da61ef85-4a19-47ce-a970-a85eaf68932a.jpeg?quality=85&width=600',false,false,true),
('p32','bebidas','{"es":"Bebida Red Bull 355 ml","en":"Red Bull 355 ml"}'::jsonb,'{"es":"Red bull clasico","en":"Classic Red Bull"}'::jsonb,4700,null,null,false,false,true),
('p33','bebidas','{"es":"Pepsi Lata 355 ml","en":"Pepsi can 355 ml"}'::jsonb,'{"es":"Lata de pepsi de 355ml","en":"Can of pepsi de 355ml"}'::jsonb,2500,null,null,false,false,true),
('p34','bebidas','{"es":"Red bull green edition","en":"Red bull green edition"}'::jsonb,'{"es":"Sabor fruta del dragon","en":"Dragon fruit flavor"}'::jsonb,3500,null,null,false,false,true),
('p35','bebidas','{"es":"Red bull red edition","en":"Red bull red edition"}'::jsonb,'{"es":"Sabor sandia","en":"Watermelon flavor"}'::jsonb,3500,null,null,false,false,true),
('p36','bebidas','{"es":"Gaseosa 7Up Lima Limón 500 ml","en":"7Up lemon-lime 500 ml"}'::jsonb,'{"es":"Sabor lima limon","en":"Lemon-lime flavor"}'::jsonb,2000,null,null,false,false,true),
('p37','bebidas','{"es":"Gaseosa Paso De Los Toros Pomelo 500 ml","en":"Paso De Los Toros grapefruit 500 ml"}'::jsonb,'{"es":"Sabor pomelo","en":"Grapefruit flavor"}'::jsonb,2000,null,null,false,false,true),
('p38','bebidas','{"es":"Agua Mineral Eco De Los Andes Sin Gas 500 ml","en":"Mineral water Eco De Los Andes still 500 ml"}'::jsonb,'{"es":"Agua sin gas","en":"Still water"}'::jsonb,1500,null,null,false,false,true),
('p39','bebidas','{"es":"Agua Mineral Eco De Los Andes Con Gas 500 ml","en":"Mineral water Eco De Los Andes sparkling 500 ml"}'::jsonb,'{"es":"Agua eco con gas","en":"Sparkling water"}'::jsonb,1500,null,null,false,false,true),
('p40','bebidas','{"es":"Paso de los toros pomelo 269 ml","en":"Paso de los toros grapefruit 269 ml"}'::jsonb,'{"es":"Lata sabor pomelo 269ml","en":"Grapefruit can 269ml"}'::jsonb,2000,null,null,false,false,true)
on conflict(id) do update set cat=excluded.cat,name=excluded.name,description=excluded.description,price=excluded.price,
old_price=excluded.old_price,image_url=excluded.image_url,popular=excluded.popular,featured=excluded.featured,available=true;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-images','product-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists "Public can view product images" on storage.objects;
create policy "Public can view product images" on storage.objects for select to anon,authenticated using(bucket_id='product-images');
drop policy if exists "Staff can upload product images" on storage.objects;
create policy "Staff can upload product images" on storage.objects for insert to authenticated with check(bucket_id='product-images' and private.is_staff());
drop policy if exists "Staff can update product images" on storage.objects;
create policy "Staff can update product images" on storage.objects for update to authenticated using(bucket_id='product-images' and private.is_staff()) with check(bucket_id='product-images' and private.is_staff());
drop policy if exists "Owners can delete product images" on storage.objects;
create policy "Owners can delete product images" on storage.objects for delete to authenticated using(bucket_id='product-images' and private.is_owner());
