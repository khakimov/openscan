# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

This is a **database-free Temporal worker** for security scanning workflows. Unlike the old worker (`apps/worker`), this worker:

- ✅ Returns results through Temporal (no database writes)
- ✅ Stateless deployment (no database credentials needed)
- ✅ Client decides where/how to persist results
- ✅ Simplified testing (no database fixtures)

**Key Workflows:**
- **Port Scanning** (`src/workflows/portscan/`) - Nmap/masscan/rustscan orchestration
- **Discovery** (`src/workflows/discovery/`) - Subdomain and host discovery

**Architecture:** See `docs/database-free-portscan-architecture.md` for detailed comparison with old database-dependent worker.

## Development Workflow

### Test-Driven Incremental Refactoring

When refactoring or implementing complex features, follow this proven approach:

**Phase 1: Establish Baseline**
1. **Write comprehensive tests FIRST** before touching implementation code
2. Use real fixtures (XML files, API responses) not mocks when possible
3. Cover all critical paths: success cases, edge cases, error handling
4. **Run tests and fix ALL bugs** to achieve green baseline (all tests passing)
5. **Freeze existing assertions** - these become your regression guards
   - ⚠️ **Do NOT modify existing test expectations during refactoring**
   - ✅ **DO add new tests** for new requirements/behavior after refactoring completes

**Phase 2: Incremental Changes**
1. **Make ONE small change at a time** (extract one module, one function)
2. **Run full test suite immediately** after each change using `pnpm test:run`
3. **Acceptance criteria**: Tests must show `N/N → N/N` (e.g., `19/19 → 19/19`)
4. If tests fail, fix immediately before moving forward - never proceed with failing tests
5. Never batch multiple extractions without verification

**Verification Commands:**
```bash
# After each extraction, run:
pnpm test:run              # Unit tests must stay green
pnpm typecheck             # No new TypeScript errors
pnpm build                 # Must compile cleanly

# For workflow changes, also verify:
# Temporal integration tests (when applicable)
```

**Phase 3: Verification**
1. Ensure all tests pass at end of each session (same count as start)
2. Verify no performance regressions
3. Confirm API surface remains compatible
4. Check that build succeeds with no new warnings

**Key Principles:**
- ✅ Tests first, implementation second
- ✅ Small incremental steps with verification after each
- ✅ Green baseline before refactoring (freeze assertions)
- ✅ Never skip test verification (`N/N → N/N` every time)
- ✅ Add new tests only AFTER behavior changes are complete
- ❌ No "big bang" rewrites
- ❌ No batching of changes without tests
- ❌ Never modify frozen test expectations during preservation

**Example (XML Parser Refactoring):**
```
1. Created 19 comprehensive tests → 11 passing, 8 failing
2. Fixed 8 bugs → 19/19 passing ✅ (green baseline)
3. Extracted utils.ts → tests still 19/19 ✅
4. Extracted metadata-parser.ts → tests still 19/19 ✅
5. Extracted os-parser.ts → tests still 19/19 ✅
6. Extracted port-parser.ts → tests still 19/19 ✅
7. Extracted host-parser.ts → tests still 19/19 ✅
8. Extracted types.ts → tests still 19/19 ✅
Result: Zero regressions, safe refactoring
```

## Work Tracking

We track work in Beads instead of Markdown. Run `bd quickstart` to see how.

## Git Commit Guidelines

**IMPORTANT: No AI attribution in commits**
- ❌ NEVER add "Generated with Claude Code" or similar attribution
- ❌ NEVER add "Co-Authored-By: Claude" lines
- ✅ Write clean, professional commit messages without AI mentions
- ✅ Focus on what changed and why, not who/what generated it

**Example (WRONG):**
```
fix: export portscanWorkflow

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>
```

**Example (CORRECT):**
```
fix(worker): export portscanWorkflow in workflow bundle

Critical fix for worker initialization - the portscanWorkflow function
must be exported from workflows/index.ts to be discoverable by Temporal.
```

## Commands

### Testing
- `pnpm test` - Run tests in watch mode
- `pnpm test:run` - Run tests once (CI mode)
- `pnpm test:ui` - Run tests with Vitest UI

### Development
- `pnpm dev` - Start worker with hot reload
- `pnpm build` - Build for production
- `pnpm typecheck` - Type checking only

## Architecture

This is a Temporal worker application that handles:
- Port scanning workflows
- Service discovery
- Asset enumeration

### Key Modules

**XML Parser** (`src/workflows/portscan/xml-parser/`)
- Modular architecture with clear separation of concerns
- `index.ts` - Public API and main orchestration
- `types.ts` - Centralized type definitions
- `utils.ts` - Pure utility functions
- `metadata-parser.ts` - Scanner metadata, timing, runstats
- `os-parser.ts` - OS detection and CPE extraction
- `port-parser.ts` - Port and service parsing
- `host-parser.ts` - Host-level orchestration
- Comprehensive test coverage in `__tests__/`

### Testing Philosophy

- Real fixtures over mocks (e.g., actual nmap XML files)
- Tests document expected behavior
- Tests serve as regression guards during refactoring
- Never modify tests during refactoring (only add new ones)

## Future Improvements

### XML Parser Module (portscan/xml-parser/)

**Fixture Management**
- Fixtures in `__tests__/fixtures/` are duplicates from `apps/worker/src/workflows/portscan/fixtures/`
- Consider: Hoist to shared package or add sync script to prevent drift when new samples arrive
- Current location works but requires manual sync when fixtures are updated

**Test Coverage Enhancements**
- Add negative-path fixtures (malformed `<service>`, partial `<osmatch>`)
- Current tests cover "happy path" - ensure graceful degradation is tested
- Example: XML with missing required fields, invalid CPE strings, corrupted service fingerprints

**Logging**
- All modules now use structured logging via `createLogger({ name: 'portscan-xml-parser' })`
- Operators can control log levels; stderr stays clean during CI
- No more raw `console.warn` calls
