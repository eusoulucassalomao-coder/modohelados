# Modo Açaí

Cardápio digital bilíngue (ES/EN), checkout integrado ao WhatsApp e CRM administrativo.

## Stack

- React + TypeScript + TanStack Start
- Vite + Tailwind CSS
- Supabase Auth, Postgres, Row Level Security e Storage
- Deploy pela branch `main` no Vercel

## Variáveis de ambiente

Configure no Vercel (Production, Preview e Development):

- `VITE_SUPABASE_URL=https://zlbyzmfzcnqdunbgjedp.supabase.co`
- `VITE_SUPABASE_ANON_KEY`: chave pública `sb_publishable_...` do projeto Supabase

A chave publishable/anon pode ser usada no navegador. Nunca configure a `service_role` no frontend.

## Banco de dados

A estrutura está em `supabase/migrations/20261111170000_modo_acai_crm.sql`.
O projeto Supabase `modo-acai` já recebeu a migração e os 41 produtos iniciais.

Tabelas:
- `products`: catálogo e disponibilidade
- `customers`: cadastro por telefone
- `orders` e `order_items`: pedidos e itens
- `staff_profiles`: permissões de proprietário/equipe

O checkout chama a função `place_order`. O preço é recalculado no banco a partir do catálogo, e só depois do registro confirmado o WhatsApp é aberto com o número do pedido.

## Primeiro acesso administrativo

1. No Supabase, abra **Authentication → Users → Add user → Create new user**.
2. Crie o usuário de teste `modo@helados.com`, defina uma senha temporária forte e confirme o e-mail se o painel oferecer essa opção.
3. O trigger do banco cria o perfil `owner` para esse e-mail.
4. Acesse `/admin` no domínio publicado pelo Vercel.

A senha não é armazenada no repositório. Para trocar o proprietário ou adicionar usuários autorizados, atualize os perfis em `staff_profiles` usando uma conta de proprietário. Nunca compartilhe credenciais administrativas.

## Funcionalidades do painel

- Pedidos recentes, itens, total, cliente, forma de pagamento e endereço
- Atualização do status: novo, confirmado, em preparação, em reparto, entregue ou cancelado
- Cadastro e histórico básico de clientes
- Edição de preço e disponibilidade dos produtos

## Desenvolvimento local

Use Bun (o repositório mantém `bun.lock`):

```sh
bun install --frozen-lockfile
cp .env.example .env
bun run dev
```

## CI

O GitHub Actions executa `bun install --frozen-lockfile` e `bun run build` a cada push em `main` e em pull requests.
