# saas-kit

[![Watch the video](https://img.youtube.com/vi/TWQv_tr5ABI/maxresdefault.jpg)](https://www.youtube.com/watch?v=TWQv_tr5ABI&t=1s)

A monorepo SaaS application with user-facing frontend and data service backend.

## Project Structure

```
├── apps/
│   ├── user-application/          # TanStack Start frontend deployed to Cloudflare
│   │   ├── public/docs/           # Markdown docs consumed by the docs routes
│   │   └── src/                   # Routes, components, and middleware
│   └── data-service/              # API worker scaffold (Cloudflare Worker)
├── packages/
│   └── data-ops/                  # Shared auth/database layer and migrations
│       ├── config/                # Better Auth CLI + Drizzle configuration
│       ├── migrations/            # Drizzle migrations pushed to Cloudflare D1
│       └── src/                   # Reusable auth helpers, queries, and setup
├── pnpm-workspace.yaml            # Workspace configuration for the monorepo
└── README.md
```

## Setup

```bash
pnpm run setup
```

This installs all dependencies and builds required packages.

## Development

### User Application
```bash
pnpm run dev:user-application
```

### Data Service
```bash
pnpm run dev:data-service
```

## Deployment

### User Application (Cloudflare)
```bash
pnpm run deploy:user-application
```

### Data Service
```bash
pnpm run deploy:data-service
```

## Working with Individual Apps

You can also navigate into any sub-application directory and work with it independently in your IDE:

```bash
cd packages/user-application
# Open in your preferred IDE
```
