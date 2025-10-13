# Scanner Contracts

Shared types, schemas, and utilities for network scanner integrations.

## Port Scheme Normalization

The `normalizeServiceScheme()` function provides intelligent port-to-service mapping with proper precedence to preserve scanner-detected service names while providing sensible fallbacks.

**Important**: The normalized scheme is stored in `ParsedPort.service.name`, NOT in `ParsedPort.protocol`. The `protocol` field must remain as the transport protocol (`tcp` or `udp`) for downstream processing (port merging, statistics, etc.).

### How It Works

The normalization follows a 4-step precedence model:

1. **Fix Known Misclassifications** - Correct common scanner errors
   - Port 443 labeled as `http` → `https`
   - Port 993 labeled as `imap` → `imaps`
   - Port 995 labeled as `pop3` → `pop3s`

2. **Preserve Scanner-Detected Names** - Use meaningful service names from scanners
   - Examples: `nginx`, `apache`, `mysql`, `ssh`
   - Skips generic names: `tcp`, `udp`, `unknown`, `tcpwrapped`

3. **Port-Based Fallback** - Use known port mappings when service name is missing/generic
   - Port 80 → `http`
   - Port 443 → `https`
   - Port 3306 → `mysql`
   - Port 22 → `ssh`
   - See `PORT_SCHEMES` map for full list (24+ common services)

4. **Protocol Fallback** - Use transport protocol as last resort
   - Returns `tcp` or `udp` when no other information is available

### Usage

```typescript
import { normalizeServiceScheme } from '@my-app/scanner-contracts';

// Example: nmap detects nginx on port 443
const scheme = normalizeServiceScheme(443, 'tcp', 'nginx');
// Returns: 'nginx' (preserves scanner detection)

// Example: port 443 with generic "tcpwrapped"
const scheme = normalizeServiceScheme(443, 'tcp', 'tcpwrapped');
// Returns: 'https' (uses port-based fallback)

// Example: unknown port with no service
const scheme = normalizeServiceScheme(54321, 'tcp');
// Returns: 'tcp' (protocol fallback)

// Example: known misclassification
const scheme = normalizeServiceScheme(443, 'tcp', 'http');
// Returns: 'https' (corrected)
```

### Current Port Mappings

#### Web Services
- `80` → `http`
- `443` → `https`
- `8080` → `http`
- `8443` → `https`
- `3000` → `http`

#### Email Services
- `25` → `smtp`
- `465` → `smtps`
- `587` → `smtp`
- `143` → `imap`
- `993` → `imaps`
- `110` → `pop3`
- `995` → `pop3s`

#### Databases
- `3306` → `mysql`
- `5432` → `postgresql`
- `1433` → `mssql`
- `27017` → `mongodb`
- `6379` → `redis`

#### Monitoring/Analytics
- `9200` → `elasticsearch`
- `5601` → `kibana`
- `9090` → `prometheus`

#### Other Services
- `22` → `ssh`
- `21` → `ftp`
- `3389` → `rdp`

### Adding New Port Mappings

To add new port-to-service mappings:

1. **Edit `port-schemes.ts`** - Add entry to `PORT_SCHEMES` map:
   ```typescript
   export const PORT_SCHEMES: ReadonlyMap<number, PortSchemeMapping> = new Map([
     // ... existing mappings
     [6379, { port: 6379, defaultScheme: 'redis' }],  // Add new mapping
   ]);
   ```

2. **Add Test Coverage** - Update `port-schemes.test.ts`:
   ```typescript
   it('includes database services', () => {
     expect(PORT_SCHEMES.get(6379)?.defaultScheme).toBe('redis');
   });
   ```

3. **Submit Pull Request** - Mappings are code-only (no runtime configuration)

### Helper Functions

#### `getKnownPorts(): number[]`
Returns all registered ports sorted numerically.

```typescript
import { getKnownPorts } from '@my-app/scanner-contracts';

const ports = getKnownPorts();
// [21, 22, 25, 80, 110, 143, 443, ...]
```

#### `getDefaultSchemeForPort(port: number): string | undefined`
Gets the default scheme for a specific port (returns undefined for unknown ports).

```typescript
import { getDefaultSchemeForPort } from '@my-app/scanner-contracts';

getDefaultSchemeForPort(443);   // 'https'
getDefaultSchemeForPort(99999); // undefined
```

#### `isGenericServiceName(serviceName: string): boolean`
Checks if a service name is generic/meaningless (tcp, udp, unknown, tcpwrapped, empty string).

Useful for determining whether to create service objects or use fallback logic.

```typescript
import { isGenericServiceName } from '@my-app/scanner-contracts';

isGenericServiceName('tcp');        // true
isGenericServiceName('unknown');    // true
isGenericServiceName('tcpwrapped'); // true
isGenericServiceName('nginx');      // false
isGenericServiceName('mysql');      // false
```

### Design Rationale

**Why Preserve Scanner Names?**
- Scanners like nmap detect actual running software (nginx, apache, mysql)
- This provides more accurate information than just the port number
- Example: SSH running on port 443 should show as `ssh`, not `https`

**Why Port-Based Fallbacks?**
- Many services don't advertise their names clearly
- Generic responses like "tcpwrapped" provide no useful information
- Port-based inference is better than showing just "tcp"

**Why Protocol as Last Resort?**
- For unknown ports with no service detection, showing "tcp" is accurate
- Avoids misleading users with incorrect service names
- Makes it clear that we don't know what service is running

### Testing

Run the test suite to verify port scheme normalization:

```bash
pnpm --filter @my-app/scanner-contracts test
```

Test coverage includes:
- Known misclassifications
- Scanner-detected service name preservation
- Port-based fallbacks
- Protocol fallback
- Edge cases (undefined, empty strings, whitespace)
- Real-world scenarios (nmap detections, custom ports)
