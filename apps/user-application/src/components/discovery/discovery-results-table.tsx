import { Checkbox } from "@/components/ui/checkbox";

export interface DiscoveryResultItem {
  host: string;
  ip: string;
}

interface DiscoveryResultsTableProps {
  /**
   * List of discovered hosts
   */
  items: DiscoveryResultItem[];

  /**
   * Set of selected host strings
   */
  selectedHosts: Set<string>;

  /**
   * Callback when selection changes
   */
  onSelectionChange: (selectedHosts: Set<string>) => void;

  /**
   * Target domain being scanned (for display)
   */
  targetDomain?: string;

  /**
   * Maximum height for scrollable area (default: max-h-96)
   */
  maxHeight?: string;
}

export function DiscoveryResultsTable({
  items,
  selectedHosts,
  onSelectionChange,
  targetDomain,
  maxHeight = "max-h-96",
}: DiscoveryResultsTableProps) {
  const isAllSelected =
    items.length > 0 && selectedHosts.size === items.length;

  const handleSelectAll = (checked: boolean | "indeterminate") => {
    if (checked === true) {
      const allHosts = items.map((item) => item.host);
      onSelectionChange(new Set(allHosts));
    } else {
      onSelectionChange(new Set());
    }
  };

  const handleToggleHost = (host: string, checked: boolean) => {
    const newSelected = new Set(selectedHosts);
    if (checked) {
      newSelected.add(host);
    } else {
      newSelected.delete(host);
    }
    onSelectionChange(newSelected);
  };

  return (
    <div className="space-y-2">
      {targetDomain && (
        <div className="text-sm font-medium text-muted-foreground">
          {targetDomain} ({items.length} subdomain{items.length !== 1 ? "s" : ""} discovered)
        </div>
      )}
      <div className={`${maxHeight} overflow-y-auto border rounded`}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-black text-white">
            <tr>
              <th className="h-8 px-4 text-left">
                <Checkbox
                  id="select-all"
                  checked={isAllSelected}
                  onCheckedChange={handleSelectAll}
                />
              </th>
              <th className="h-8 px-4 text-left font-semibold">Host</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const isSelected = selectedHosts.has(item.host);

              return (
                <tr
                  key={index}
                  className="border-t border-slate-700 hover:bg-slate-700/50"
                >
                  <td className="px-4 py-3">
                    <Checkbox
                      id={`result-${index}`}
                      checked={isSelected}
                      onCheckedChange={(checked) =>
                        handleToggleHost(item.host, checked === true)
                      }
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-mono text-slate-100">
                        {item.host}
                      </span>
                      <span className="font-mono text-xs text-slate-400 mt-0.5">
                        {item.ip}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="h-5 text-xs text-muted-foreground">
        {selectedHosts.size > 0 ? (
          <>
            {selectedHosts.size} subdomain{selectedHosts.size !== 1 ? "s" : ""}{" "}
            selected
          </>
        ) : (
          <span className="opacity-0">0 subdomains selected</span>
        )}
      </div>
    </div>
  );
}
