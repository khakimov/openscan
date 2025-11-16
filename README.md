# openscan

[![Watch the video](https://img.youtube.com/vi/TWQv_tr5ABI/maxresdefault.jpg)](https://www.youtube.com/watch?v=TWQv_tr5ABI&t=1s)

A security scanning and asset discovery platform with distributed workflow orchestration.

## Architecture

**Frontend:** TanStack Start (React 19) with TanStack Router & Query - deployed on Cloudflare Workers
**Backend:** Restate for durable workflow orchestration + Cloudflare D1 for data persistence
**Communication:** Universal postback architecture - worker sends HTTP callbacks to web app
**Deployment:** Multi-region Cloudflare Workers for global low-latency access

### Key Technologies

- **TanStack Start** - Full-stack React framework with SSR
- **Restate** - Distributed workflow orchestration
- **Cloudflare Workers** - Edge compute platform
- **Cloudflare D1** - Serverless SQLite database
- **Drizzle ORM** - Type-safe database operations
- **Better Auth** - Authentication system

## Key Features

- 🔍 **Subdomain Discovery** - Automated reconnaissance to find all internet-facing assets
- 🔒 **Port Scanning** - Comprehensive port analysis with service detection
- 📊 **Asset Inventory** - Centralized dashboard for all discovered resources
- ⚡ **Real-time Updates** - Optimistic UI with instant feedback
- 🔄 **Workflow Orchestration** - Reliable, resumable scans with Restate
- 📈 **Analytics** - Workers Analytics Engine for monitoring and metrics

## Project Structure

```
├── apps/
│   ├── user-application/          # TanStack Start web app (Cloudflare Workers)
│   │   ├── src/                   # Routes, components, features
│   │   │   ├── routes/            # File-based routing
│   │   │   ├── features/          # Feature modules (assets, scans, onboarding)
│   │   │   ├── components/        # Reusable UI components
│   │   │   ├── queries/           # TanStack Query definitions
│   │   │   └── server/            # Server functions and postback handlers
│   │   └── CLAUDE.md              # Development guide for Claude Code
│   ├── restate-worker/            # Restate workflow worker (Node.js)
│   │   └── src/
│   │       ├── discovery-service.ts    # Subdomain discovery workflows
│   │       ├── port-scanner.ts         # Port scanning workflows
│   │       ├── postback.ts             # HTTP callbacks to user-application
│   │       └── scanners/               # Scanner implementations
│   └── data-service/              # Cloudflare Workers data service
│       └── src/
│           ├── durable-objects/   # Stateful coordination
│           ├── hono/              # API routes
│           └── workflows/         # Data workflows
├── packages/
│   ├── data-ops/                  # Database operations (D1 + Drizzle ORM)
│   │   ├── migrations/            # SQL migrations
│   │   └── src/                   # Auth, queries, schema definitions
│   ├── contracts/                 # Workflow contracts and types
│   ├── constants/                 # Shared constants and utilities
│   ├── config/                    # Shared configuration
│   ├── logger/                    # Logging utilities
│   └── validation/                # Shared validation schemas
├── docs/                          # Architecture and best practices
│   ├── postback-architecture.md   # Universal postback system
│   ├── optimistic-ui-guide.md     # Optimistic UI patterns
│   └── best-practices/            # Development guidelines
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

### Restate Worker
```bash
pnpm run dev:worker
```

### Data Service
```bash
pnpm run dev:data-service
```

## Deployment

### User Application (Cloudflare Workers)
```bash
pnpm run deploy:user-application
```

### Restate Worker (Restate Cloud or Self-hosted)
```bash
pnpm run build:worker
pnpm run start:worker
```

### Data Service (Cloudflare Workers)
```bash
pnpm run deploy:data-service
```

## Working with Individual Apps

You can also navigate into any app or package directory and work with it independently:

```bash
cd apps/user-application
# Or
cd apps/restate-worker
# Or
cd packages/data-ops
# Open in your preferred IDE
```

## Documentation

See `/docs` for comprehensive guides on:
- [Postback Architecture](./docs/architecture/backend/postback-architecture.md) - Universal HTTP callback system
- [Optimistic UI Guide](./docs/optimistic-ui-guide.md) - Instant UI feedback patterns
- [Best Practices](./docs/best-practices/) - Development guidelines
