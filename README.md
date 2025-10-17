# openscan

[![Watch the video](https://img.youtube.com/vi/TWQv_tr5ABI/maxresdefault.jpg)](https://www.youtube.com/watch?v=TWQv_tr5ABI&t=1s)

A security scanning and asset discovery platform with distributed workflow orchestration.

## Project Structure

```
├── apps/
│   ├── user-application/          # TanStack Start web app (Cloudflare Workers)
│   │   ├── public/docs/           # Documentation
│   │   └── src/                   # Routes, components, features
│   └── temporal-worker/           # Standalone workflow worker (Node.js)
│       └── src/
│           ├── workflows/         # Discovery, scanning workflows
│           └── activities/        # Subdomain discovery, port scanning
├── packages/
│   ├── data-ops/                  # Database operations (D1 + Drizzle ORM)
│   │   ├── migrations/            # Database migrations
│   │   └── src/                   # Auth, queries, schema
│   ├── temporal/                  # Workflow contracts and types
│   ├── config/                    # Shared configuration
│   ├── logger/                    # Logging utilities
│   └── validation/                # Shared validation schemas
├── pnpm-workspace.yaml
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

### Temporal Worker
```bash
pnpm run dev:worker
```

## Deployment

### User Application (Cloudflare)
```bash
pnpm run deploy:user-application
```

### Temporal Worker (Self-hosted)
```bash
pnpm run build:worker
pnpm run start:worker
```

## Working with Individual Apps

You can also navigate into any sub-application directory and work with it independently in your IDE:

```bash
cd packages/user-application
# Open in your preferred IDE
```
