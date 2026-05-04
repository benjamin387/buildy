## Buildy

Buildy is a Next.js App Router SaaS platform for interior design, renovation, and construction operations.

## Getting Started

Install dependencies, configure environment variables, then run the development server:

```bash
npm install
npm run dev
```

## Environment Variables

Required for GeBIZ imports and cron sync:

```bash
GEBIZ_RSS_URL="https://example.com/gebiz/rss.xml"
GEBIZ_HUB_SUPABASE_URL="https://obtauarufcwgyiwilnar.supabase.co"
GEBIZ_HUB_SUPABASE_KEY="supabase-anon-jwt"
CRON_SECRET="replace-with-a-long-random-secret"
```

`GEBIZ_RSS_URL`
- Public GeBIZ RSS feed URL to import opportunities from.

`GEBIZ_HUB_SUPABASE_URL`
- Base URL for the `ai-operations-hub` Supabase project that exposes `public.tenders`.

`GEBIZ_HUB_SUPABASE_KEY`
- Supabase anon JWT used to read `public.tenders` through REST. RLS must allow public `SELECT`.

`CRON_SECRET`
- Shared bearer token used by manual imports and the Vercel cron endpoint.

## GeBIZ RSS Import

Manual import endpoint:

```bash
curl -X POST https://app.buildy.sg/api/gebiz/import \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Scheduled import endpoint:

- `GET /api/cron/gebiz-hub-sync`
- Intended for Vercel Cron daily at 02:00 SGT (`0 18 * * *` UTC)

New hub sync endpoint options:

```bash
curl -X POST https://app.buildy.sg/api/cron/gebiz-hub-sync \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

curl -X POST "https://app.buildy.sg/api/cron/gebiz-hub-sync?all=1&limit=1000" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

curl -X POST "https://app.buildy.sg/api/cron/gebiz-hub-sync?since=2026-05-01" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Legacy cron/manual endpoints retained in repo:

- `GET /api/cron/gebiz`
- `GET /api/cron/gebiz-import`

## Build Checks

```bash
npx prisma generate
npm run build
```

## Migration Notes

- The GeBIZ RSS auto-feed change adds a new additive table: `GebizOpportunity`.
- The migration is non-destructive and does not modify existing project, lead, or bidding records.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
