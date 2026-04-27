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
- Do not remove existing modules.
- Preserve luxury enterprise admin UI.
- Use mobile responsive layouts.
- Reuse existing patterns in app, lib, prisma, and components.
- Run npm run build before finalizing.
- If database changes are needed, update prisma/schema.prisma and include migration notes.
- Never expose secrets in frontend code.
