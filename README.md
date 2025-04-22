# VeStream

A monorepo project using PNPM workspaces with a TypeScript backend (Express + WebSocket) and React frontend.

## Project Structure

```
vestream/
├── packages/
│   ├── backend/        # Express + WebSocket server
│   ├── frontend/       # React + Vite + TailwindCSS
│   └── shared/         # Shared TypeScript types
```

## Prerequisites

- Node.js >= 18
- PNPM >= 8

## Setup

1. Install dependencies:
```bash
pnpm install
```

2. Build shared package:
```bash
pnpm --filter @vestream/shared build
```

## Development

Start all packages in development mode:

```bash
pnpm dev
```

Or start individual packages:

```bash
# Backend
pnpm --filter @vestream/backend dev

# Frontend
pnpm --filter @vestream/frontend dev
```

## Building

Build all packages:

```bash
pnpm build
```

## Features

- TypeScript support across all packages
- Shared type definitions
- REST API endpoints
- WebSocket real-time communication
- React Router for frontend routing
- TailwindCSS for styling
- ESLint and Prettier for code formatting
- Hot module replacement in development 