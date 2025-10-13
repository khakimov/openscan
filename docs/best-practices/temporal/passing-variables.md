# Temporal Workflow Data Flow Best Practices

Based on the patterns observed in the `compete-scraper` project, this document outlines best practices for passing data in and out of Temporal workflows.

## 1. Input Parameter Validation

### Use Schema Validation Libraries
The compete-scraper project uses multiple validation approaches:

#### TypeBox for Simple Types
```typescript
// schemas/extract-products-params.ts
import { Type, type Static } from "@sinclair/typebox";

export const EXTRACT_PRODUCTS_PARAMS = Type.Object({
  companyName: Type.String(),
  companyURL: Type.String(),
  maxPages: Type.Optional(
    Type.Integer({ maximum: MAXIMUM_EXTRACTION_PAGES, minimum: 1 })
  ),
  force: Type.Optional(Type.Boolean()),
  competitorId: Type.Optional(Type.String()),
});

export type ExtractProductsParams = Static<typeof EXTRACT_PRODUCTS_PARAMS>;
```

#### Zod for Complex Validation
```typescript
// workflows/suggestCompanyContext/schemas.ts
import { z } from "zod";

const suggestCompanyContextParamsSchema = z.object({
  companyId: z.number().optional().nullable(),
  companyName: z.string(),
  companyURL: z.string().url(), // URL validation
  isEvaluation: z.boolean().optional(),
});

export type SuggestCompanyContextParams = z.infer<
  typeof suggestCompanyContextParamsSchema
>;
```

#### Ajv for JSON Schema Validation
```typescript
// activities/extractProductSuggestions.ts
import Ajv from "ajv";

function validateProductSuggestions(messageContent: string | null) {
  const products = parseArray<ProductSuggestionType[]>(messageContent);
  const ajv = new Ajv();
  const validate = ajv.compile(PRODUCT_SUGGESTIONS_SCHEMA);
  const valid = validate(products);
  if (!valid) {
    throw new Error(`Invalid product suggestions: ${validate.errors}`);
  }
  return products;
}
```

### Best Practice: Centralize Schema Definitions
- Keep all schemas in a dedicated `schemas/` directory
- Export both the schema and the derived TypeScript type
- Use the same schema for validation and type definitions

## 2. Workflow Input Pattern

### Simple, Flat Input Objects
Workflows should accept simple parameter objects that are easy to validate:

```typescript
// Good: Flat structure with clear types
export async function extractProducts({
  companyName,
  companyURL,
  maxPages,
  force,
  competitorId,
}: ExtractProductsParams) {
  // ...
}

// Avoid: Deeply nested structures
// export async function extractProducts(params: {
//   company: { name: string; url: string; };
//   options: { maxPages?: number; force?: boolean; };
// })
```

## 3. Workflow State Management

### Use Query Handlers for State
The compete-scraper pattern for exposing workflow state:

```typescript
// workflows/extractProducts/workflow.ts
import { defineQuery, setHandler } from "@temporalio/workflow";

export const GET_EXTRACT_PRODUCTS_STATE_ID = "getExtractProductsState";
export const getState = defineQuery<ExtractProductsState>(
  GET_EXTRACT_PRODUCTS_STATE_ID
);

export async function extractProducts(params: ExtractProductsParams) {
  const state: ExtractProductsState = {
    status: "started",
  };

  // Register the query handler
  setHandler(getState, () => state);

  // Update state throughout workflow
  state.status = "extracting";
  state.productSuggestions = await extractProductSuggestions(/*...*/);

  state.status = "done";
  return state;
}
```

### State Types Should Be Comprehensive
```typescript
type ExtractProductsState = {
  status: ExtractStatus; // Enum for all possible states
  productSuggestions?: ProductSuggestionType[];
  generationId?: string;
  error?: string; // Include error information
  progress?: number; // Include progress if applicable
};
```

## 4. Activity Data Flow

### Activities Should Be Pure Functions
Activities should:
- Accept all required parameters explicitly
- Not rely on global state
- Return structured results

```typescript
// Good: All dependencies passed explicitly
export async function extractProductSuggestions({
  generationId,
  isEvaluation,
  companyId,
  companyName,
  companyURL,
  notes,
  llmNotes,
}: ExtractProductSuggestionsParams) {
  // Activity implementation
  return {
    products: [...],
    generationId: "...",
  };
}
```

### Use Proxy Activities with Options
```typescript
import { proxyActivities } from "@temporalio/workflow";

const { extractProductSuggestions, storeProducts } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "30 minutes",
    retry: {
      initialInterval: "1s",
      maximumInterval: "30s",
      backoffCoefficient: 2,
      maximumAttempts: 3,
    },
  });
```

## 5. Error Handling Pattern

### Graceful Degradation
The compete-scraper shows a pattern of continuing execution even when non-critical operations fail:

```typescript
// workflows/extractProducts/workflow.ts
state.status = "storing";
try {
  const storeResult = await storeProducts(params);
  console.info('Products stored successfully', storeResult);
} catch (error) {
  console.error('Failed to store products:', error);
  // Continue execution - don't fail the workflow if storage fails
}
state.status = "done";
```

## 6. Workflow ID Patterns

### Encode Context in Workflow IDs
```typescript
// util/workflowIds.ts
export function getCompanyIdFromWorkflowId(workflowId: string): number {
  // Extract company ID from workflow ID pattern
  // Example: "extract-products-company-123-timestamp"
  const parts = workflowId.split('-');
  return parseInt(parts[3]);
}
```

### Generate Unique IDs
```typescript
import { uuid4 } from "@temporalio/workflow";

export async function suggestCompanyContext(params) {
  const generationId = uuid4(); // Generate unique ID for this execution
  // Use generationId throughout the workflow
}
```

## 7. Type Safety Best Practices

### Use Type Inference
```typescript
// Let TypeScript infer types from schemas
export type SuggestCompanyContextParams = z.infer<
  typeof suggestCompanyContextParamsSchema
>;

// Use Static type from TypeBox
export type ExtractProductsParams = Static<typeof EXTRACT_PRODUCTS_PARAMS>;
```

### Maintain Type Consistency
- Use the same type definitions across workflows, activities, and API boundaries
- Export types from a central location
- Avoid type duplication

## 8. Activity Options Configuration

### Centralize Activity Options
```typescript
// constants.ts
export const LLM_ACTIVITY_OPTIONS = {
  startToCloseTimeout: "5 minutes",
  retry: {
    initialInterval: "1s",
    maximumInterval: "30s",
    backoffCoefficient: 2,
    maximumAttempts: 3,
  },
};

// Use consistently across workflows
const activities = proxyActivities<typeof activities>(LLM_ACTIVITY_OPTIONS);
```

## 9. Data Transformation Patterns

### Keep Transformations Explicit
```typescript
function getStoreProductsParams(
  productSuggestions: ProductSuggestionsResult,
  competitorId?: string,
  companyName?: string
): StoreProductsParams {
  return {
    ...productSuggestions,
    companyId: getCompanyId(),
    competitorId,
    companyName,
  };
}
```

## 10. Best Practices Summary

1. **Validate Early**: Validate input parameters at the workflow entry point
2. **Type Everything**: Use TypeScript types derived from validation schemas
3. **Flat Structures**: Prefer flat parameter objects over nested structures
4. **Explicit Dependencies**: Pass all required data explicitly to activities
5. **State Queries**: Use query handlers to expose workflow state
6. **Error Recovery**: Handle non-critical failures gracefully
7. **Centralize Configuration**: Keep activity options and constants in one place
8. **Pure Activities**: Design activities as pure functions
9. **Schema Reuse**: Use the same schemas for validation and type generation
10. **Trace Everything**: Include tracing and logging for debugging

## Example: Applying These Patterns

Here's how to structure a new workflow following these patterns:

```typescript
// schemas/port-scan.ts
import { z } from "zod";

export const portScanInputSchema = z.object({
  target: z.string().ip(), // or .url()
  ports: z.array(z.number()).optional(),
  timeout: z.number().default(30000),
});

export type PortScanInput = z.infer<typeof portScanInputSchema>;

// workflows/port-scan/workflow.ts
import { defineQuery, setHandler, proxyActivities } from "@temporalio/workflow";
import type { PortScanInput } from "../../schemas/port-scan";

const activities = proxyActivities<typeof import("./activities")>({
  startToCloseTimeout: "10 minutes",
});

export const getPortScanState = defineQuery<PortScanState>("getPortScanState");

export async function portScanWorkflow(input: PortScanInput) {
  // Validate input (schema validation happens at API layer)
  const state: PortScanState = {
    status: "scanning",
    target: input.target,
  };

  setHandler(getPortScanState, () => state);

  try {
    const results = await activities.runNmapScan(input);
    state.results = results;
    state.status = "completed";
  } catch (error) {
    state.error = error.message;
    state.status = "failed";
  }

  return state;
}
```

This approach ensures type safety, proper validation, and clear data flow throughout the workflow lifecycle.