# Logging System Documentation

This document describes the comprehensive logging system implemented in the degen-poker application.

## Overview

The application uses **Pino**, a fast and lightweight logging library for Node.js, with structured logging throughout the codebase. Logging is implemented at all levels:

- API routes (server-side)
- Game logic (server-side)
- React hooks (client-side)
- Error boundaries (client-side)
- Real-time subscriptions

## Installation

The logging system uses the following dependencies:

```bash
npm install pino pino-pretty
```

- `pino`: Fast JSON logger for Node.js
- `pino-pretty`: Pretty-print Pino logs for development

## Configuration

### Environment Variables

- `LOG_LEVEL`: Set the minimum log level (default: `debug` in development, `info` in production)
  - Options: `debug`, `info`, `warn`, `error`
  - Example: `LOG_LEVEL=debug`

### Log Files

Logs are output to:

- **Development**: Console with pretty formatting (via `pino-pretty`)
- **Production**: JSON format to stdout (for log aggregation services)

## Usage

### Server-Side Logging

#### API Routes

API routes use the `logApiRoute` helper for consistent logging:

```typescript
import { logApiRoute } from "@/lib/logger";

export async function POST(request: Request) {
  const log = logApiRoute("POST", "/api/example");

  try {
    const body = await request.json();
    log.start({ bodyKeys: Object.keys(body) });

    // Your logic here

    log.success({ result: "data" });
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error(error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

Available methods on `log`:

- `start(data?)`: Log request start
- `info(message, data?)`: Log informational message
- `debug(message, data?)`: Log debug message
- `warn(message, data?)`: Log warning message
- `success(data?)`: Log successful completion
- `error(error, data?)`: Log error

#### Module Logging

For other server-side modules, create a module-specific logger:

```typescript
import { createLogger } from "@/lib/logger";

const myLogger = createLogger("module-name");

myLogger.info({ key: "value" }, "Something happened");
myLogger.error({ error }, "Error occurred");
```

### Client-Side Logging

#### React Components and Hooks

Use `clientLogger` for client-side logging:

```typescript
import { clientLogger } from "@/lib/logger";

export function MyComponent() {
  useEffect(() => {
    clientLogger.info("Component mounted", { componentName: "MyComponent" });

    return () => {
      clientLogger.debug("Component unmounting");
    };
  }, []);

  const handleClick = () => {
    try {
      // Your logic
      clientLogger.info("Action successful", { action: "click" });
    } catch (error) {
      clientLogger.error("Action failed", error);
    }
  };

  return <button onClick={handleClick}>Click me</button>;
}
```

Available methods:

- `debug(message, data?)`: Development-only logs
- `info(message, data?)`: Informational logs
- `warn(message, data?)`: Warning logs
- `error(message, error?)`: Error logs

## Error Handling

### Error Boundary

Wrap your application with the `ErrorBoundary` component to catch React errors:

```typescript
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}
```

Custom fallback UI:

```typescript
<ErrorBoundary fallback={<div>Custom error UI</div>}>
  {children}
</ErrorBoundary>
```

### Global Error Handler

Add the `GlobalErrorHandler` to catch unhandled errors and promise rejections:

```typescript
import { GlobalErrorHandler } from "@/components/GlobalErrorHandler";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <GlobalErrorHandler />
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}
```

## Security Considerations

### Sensitive Data

The logging system includes security measures to prevent logging sensitive information:

1. **Hole Cards**: Player hole cards are NEVER logged. The `sanitizePlayerData` helper redacts card data:

```typescript
import { sanitizePlayerData } from "@/lib/logger";

const playerData = { cards: ["Ah", "Kh", "Qd", "Jd"] };
const safe = sanitizePlayerData(playerData);
// Result: { cards: "[REDACTED]" }
```

2. **Session IDs**: While session IDs are logged for debugging, they should not contain personally identifiable information.

3. **Passwords/Secrets**: Never log passwords, API keys, or other secrets.

## Log Levels

Logs are organized by severity:

| Level   | Usage                                    | Example                               |
| ------- | ---------------------------------------- | ------------------------------------- |
| `debug` | Development details, function entry/exit | "Shuffling deck with seed"            |
| `info`  | General information, state changes       | "Player joined room"                  |
| `warn`  | Unexpected but handled situations        | "Player attempted action out of turn" |
| `error` | Errors requiring attention               | "Failed to fetch game state"          |

## Structured Logging

All logs use structured data for easy parsing and filtering:

```typescript
// Good: Structured logging
logger.info({ roomId, playerCount: 5 }, "Room initialized");

// Bad: String concatenation
logger.info("Room " + roomId + " initialized with " + playerCount + " players");
```

Benefits:

- Easy to filter logs by field (e.g., all logs for `roomId=123`)
- Machine-readable for log aggregation services
- Consistent format across the application

## Log Examples

### API Route Logs

```json
{
  "level": "INFO",
  "module": "api",
  "method": "POST",
  "path": "/api/game/deal-hand",
  "msg": "POST /api/game/deal-hand - Request started",
  "roomId": "abc123",
  "playerCount": 4
}
```

### Game Logic Logs

```json
{
  "level": "INFO",
  "module": "poker-pot",
  "msg": "Splitting pot",
  "totalPlayers": 4,
  "potSize": 1000,
  "boardACards": 5,
  "boardBCards": 5
}
```

### Client-Side Logs

```
[INFO] useGameState: Game state fetched { roomId: 'abc123', phase: 'flop', potSize: 500 }
```

## Monitoring & Debugging

### Development

In development, logs are pretty-printed to the console with colors and timestamps.

### Production

In production, consider integrating with a log aggregation service:

- **Datadog**: For comprehensive monitoring
- **Loggly**: For centralized log management
- **CloudWatch**: For AWS deployments
- **Sentry**: For error tracking (especially client-side)

### Filtering Logs

Filter by module:

```bash
# Server logs
LOG_LEVEL=debug npm run dev | grep poker-deck

# Show only errors
LOG_LEVEL=error npm run dev
```

## Best Practices

1. **Always log at appropriate levels**: Use `debug` for development details, `info` for normal operations, `warn` for anomalies, `error` for failures.

2. **Include context**: Always include relevant IDs (roomId, sessionId, playerId) in log data.

3. **Log state changes**: Log when important state changes occur (hand starts, player joins, betting round advances).

4. **Don't log sensitive data**: Never log passwords, hole cards, or personal information.

5. **Use structured data**: Always use the data parameter for machine-readable logs.

6. **Log errors with context**: When logging errors, include contextual information:

   ```typescript
   log.error(error, { roomId, action: "dealing cards", playerCount: 4 });
   ```

7. **Keep messages concise**: The message should be a brief summary; details go in the data object.

## Troubleshooting

### Logs not appearing

1. Check `LOG_LEVEL` environment variable
2. Ensure you're using the correct logger (`logger` for server, `clientLogger` for client)
3. Check console filters in browser DevTools

### Too many logs

1. Increase `LOG_LEVEL` to `info` or `warn`
2. Remove debug logs from production builds
3. Filter logs by module or component

### Performance concerns

Pino is designed to be fast, but:

- Avoid logging in tight loops
- Use `debug` level for verbose logs (they can be disabled in production)
- Consider async logging for high-throughput scenarios

## Future Enhancements

Potential improvements to the logging system:

1. **Remote logging**: Send logs to a centralized service
2. **Log rotation**: Rotate log files to prevent disk space issues
3. **Performance metrics**: Add timing metrics for API calls
4. **User session tracking**: Track user sessions across requests
5. **Alert integration**: Trigger alerts on error patterns
