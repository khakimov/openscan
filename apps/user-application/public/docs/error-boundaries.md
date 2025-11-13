# Error Boundary Best Practices

This guide covers the recommended patterns for handling errors in the application using unified error components.

## Overview

The application uses a unified error boundary system following OpenPanel's status-aware pattern. All error boundaries use the same `ErrorLayout` primitive to ensure consistent styling, messaging, and navigation.

## Core Components

### ErrorLayout

The main error display component that provides consistent chrome across all error states.

```typescript
import { ErrorLayout } from '@/components/error-layout';

<ErrorLayout
  status={404}
  title="Page Not Found"
  message="The page you requested could not be found."
  actions={[
    { label: 'Go Home', to: '/' },
    { label: 'Go Back', onClick: () => window.history.back(), variant: 'outline' },
  ]}
/>
```

**Props:**
- `status` - HTTP status code (403, 404, 500) or custom error code
- `title` - Error title displayed prominently
- `message` - User-friendly error message
- `technicalDetails` - Optional ReactNode for stack traces/debug info
- `actions` - Array of action buttons with labels, handlers, and variants

### ErrorStackTrace

Collapsible technical details component for displaying stack traces and error reports.

```typescript
import { ErrorStackTrace } from '@/components/error-stack-trace';

<ErrorLayout
  status={500}
  title="Something went wrong"
  message="We encountered an unexpected error."
  technicalDetails={
    <ErrorStackTrace
      errorMessage={error.message}
      stack={error.stack}
    />
  }
  actions={[...]}
/>
```

**Props:**
- `errorMessage` - Error message to display in alert
- `stack` - Stack trace string (automatically collapsed)
- `onReportError` - Optional custom error reporting callback

## Status-Specific Errors

### 403 - Access Denied

Used when user lacks permission to access a resource.

```typescript
<ErrorLayout
  status={403}
  title="Access Denied"
  message="You don't have access to this organization."
  actions={[
    { label: 'Go Home', to: '/' },
    { label: 'Go Back', onClick: () => window.history.back(), variant: 'outline' },
  ]}
/>
```

### 404 - Not Found

Used when a resource doesn't exist.

```typescript
<ErrorLayout
  status={404}
  title="Organization Not Found"
  message="The organization you requested could not be found."
  actions={[
    { label: 'Go Home', to: '/' },
    { label: 'Go Back', onClick: () => window.history.back(), variant: 'outline' },
  ]}
/>
```

### 500 - Server Error

Used for unexpected errors with technical details.

```typescript
<ErrorLayout
  status={500}
  title="Something went wrong"
  message="We encountered an unexpected error. Please try again."
  technicalDetails={<ErrorStackTrace errorMessage={error.message} stack={error.stack} />}
  actions={[
    { label: 'Try Again', onClick: () => router.invalidate() },
    { label: 'Go Back', onClick: () => window.history.back(), variant: 'outline' },
  ]}
/>
```

## Route-Level Error Components

### Root Boundary (Default)

Location: `src/components/default-catch-boundary.tsx`

Used by: `src/routes/__root.tsx`

Catches all unhandled errors with "Try Again" action and optional stack trace.

```typescript
export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
  const router = useRouter();
  const isRoot = useMatch({ select: (state) => state.id === rootRouteId });

  const actions: ErrorAction[] = [
    { label: 'Try Again', onClick: () => router.invalidate() },
    isRoot
      ? { label: 'Go Home', to: '/' }
      : { label: 'Go Back', onClick: () => window.history.back() },
  ];

  return (
    <ErrorLayout
      status={500}
      title="Something went wrong"
      message="We encountered an unexpected error. Please try again."
      technicalDetails={<ErrorStackTrace ... />}
      actions={actions}
    />
  );
}
```

### Organization Boundary

Location: `src/routes/_app.$organizationId.tsx`

Handles 403 (access denied) vs 404 (not found) based on error statusCode.

```typescript
function OrganizationError({ error }: ErrorComponentProps) {
  const is403 = (error as any)?.statusCode === 403;

  return (
    <ErrorLayout
      status={is403 ? 403 : 404}
      title={is403 ? 'Access Denied' : 'Organization Not Found'}
      message={is403 ? "You don't have access..." : "Organization not found..."}
      actions={[
        { label: 'Go Home', to: '/' },
        { label: 'Go Back', onClick: () => window.history.back(), variant: 'outline' },
      ]}
    />
  );
}
```

## Action Patterns

### Navigation Actions

```typescript
// Link to specific route
{ label: 'Go Home', to: '/', variant: 'default' }

// Browser history
{ label: 'Go Back', onClick: () => window.history.back(), variant: 'outline' }
```

### Recovery Actions

```typescript
// Retry with router invalidation
{ label: 'Try Again', onClick: () => router.invalidate(), variant: 'default' }

// Refresh page
{ label: 'Refresh', onClick: () => window.location.reload(), variant: 'outline' }
```

### Reporting Actions

```typescript
// Open email client
{
  label: 'Report Error',
  onClick: () => {
    const subject = encodeURIComponent('Error Report');
    const body = encodeURIComponent(`Error: ${error.message}`);
    window.location.href = `mailto:support@example.com?subject=${subject}&body=${body}`;
  },
  variant: 'ghost'
}

// Custom Sentry/analytics integration
{
  label: 'Report Error',
  onClick: () => {
    captureException(error);
    toast.success('Error reported to our team');
  },
  variant: 'ghost'
}
```

## Adding New Error Boundaries

When adding a route-level error boundary:

1. **Import ErrorLayout**
   ```typescript
   import { ErrorLayout, type ErrorAction } from '@/components/error-layout';
   ```

2. **Determine status code**
   ```typescript
   const status = /* derive from error - 403, 404, 500, etc. */;
   ```

3. **Provide user-friendly messaging**
   ```typescript
   const title = "User-Facing Error Title";
   const message = "Clear explanation of what went wrong.";
   ```

4. **Add appropriate actions**
   ```typescript
   const actions: ErrorAction[] = [
     { label: 'Go Home', to: '/' },
     { label: 'Try Again', onClick: () => router.invalidate(), variant: 'outline' },
   ];
   ```

5. **Use ErrorLayout**
   ```typescript
   return (
     <ErrorLayout
       status={status}
       title={title}
       message={message}
       actions={actions}
     />
   );
   ```

## Testing

### Manual Testing

1. **404 Errors** - Navigate to `/non-existent-org` or `/org/non-existent-project`
2. **403 Errors** - Try accessing an organization without permission
3. **500 Errors** - Trigger runtime errors in components (temporary throw statement)

### Verifying Consistency

All error boundaries should:
- ✅ Use the same card layout and spacing
- ✅ Display status code alongside message
- ✅ Provide navigation actions
- ✅ Include error icon in consistent position
- ✅ Support both light and dark themes

## Best Practices

1. **Always use ErrorLayout** - Don't create one-off error UIs
2. **Provide specific status codes** - Use 403 vs 404 vs 500 appropriately
3. **Keep messages user-friendly** - Avoid technical jargon in main message
4. **Use technicalDetails for stack traces** - Keep debug info collapsible
5. **Offer contextual actions** - "Try Again" for 500s, "Go Home" for 404s
6. **Consistent action ordering** - Primary action first, navigation second
7. **Pure components** - Keep ErrorLayout hook-free for maximum reusability

## Future Enhancements

Potential improvements to the error system:

- **Analytics Integration** - Track error occurrences by status code
- **Sentry Integration** - Automatic error reporting with user consent
- **Custom Icons** - Status-specific icons (lock for 403, magnifying glass for 404)
- **Retry Strategies** - Exponential backoff for network errors
- **Offline Detection** - Special handling for network unavailability

## See Also

- [TanStack Router Error Handling](https://tanstack.com/router/latest/docs/guide/error-handling)
- [OpenPanel Error Boundaries](https://github.com/Openpanel-dev/openpanel/tree/main/apps/dashboard/src/components/errors)
