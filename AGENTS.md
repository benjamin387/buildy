<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Buildy Codex Rules

Project: Buildy interior design / construction SaaS platform.

Stack:
- Next.js App Router
- TypeScript
- Tailwind
- Prisma
- PostgreSQL
- Vercel

Rules:
- Never push directly to main.
- Always create a feature branch.
- Always open a pull request.
- Preserve the existing Next.js App Router layout under `app/`.
- Keep the current route-group structure intact: `(auth)`, `(client)`, `(platform)`, `(sign)`, `api`, `public`, and `supplier-quote`.
- Do not move routes to the Pages Router or flatten route groups unless the task explicitly requires a routing migration.
- Read the relevant bundled Next.js App Router docs in `node_modules/next/dist/docs/` before changing routing, layouts, file conventions, or build config.
- Default to server components. Add `"use client"` only when browser-only APIs, client-side state, or client hooks are required.
- Do not remove existing modules.
- Preserve luxury enterprise admin UI.
- Use mobile responsive layouts.
- Reuse existing patterns in `app`, `lib`, `prisma`, and `components`.
- Keep changes TypeScript-first and make `npm run lint`, `npm run typecheck`, and `npm run build` pass before finalizing.
- If database changes are needed, update `prisma/schema.prisma` and include migration notes.
- Never expose secrets in frontend code.
