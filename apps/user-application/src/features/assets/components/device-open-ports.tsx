import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import * as Collapsible from "@radix-ui/react-collapsible";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronRight,
  Shield,
  AlertCircle,
  Info,
  Copy,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { toast } from "sonner";

interface DeviceOpenPortsProps {
  deviceDetail: DeviceDetail | undefined;
  isLoading: boolean;
}

type PortDetail = {
  port: number;
  protocol?: string;
  state?: string;
  service?: {
    name?: string | null;
    reportedName?: string | null;
    confidence?: number | null;
    product?: string | null;
    version?: string | null;
    extraInfo?: string | null;
    tunnel?: string | null;
    method?: string | null;
    cpe?: string | null;
    fingerprint?: string;
    fingerprintMatches?: Array<{
      probe: string;
      length?: number;
      response: string;
    }>;
  };
  discoveredBy?: string[];
  firstSeen?: number | null;
  lastSeen?: number | null;
};

function formatServiceInfo(service?: PortDetail["service"]) {
  if (!service) return "Unknown";

  // Build the main service description
  const mainParts = [];

  // Add service name
  if (service.name) {
    mainParts.push(service.name);
  }

  // Add product/version
  if (service.product) {
    const productStr = service.version
      ? `${service.product} ${service.version}`
      : service.product;
    mainParts.push(productStr);
  }

  // Add extra info
  if (service.extraInfo) {
    mainParts.push(service.extraInfo);
  }

  // Add tunnel info
  if (service.tunnel) {
    mainParts.push(`(${service.tunnel})`);
  }

  if (mainParts.length > 0) {
    return mainParts.join(" • ");
  }

  if (service.reportedName) {
    return `Unknown (reported: ${service.reportedName})`;
  }

  return "Unknown";
}

function formatRawPortOutput(port: PortDetail) {
  const protocol = port.protocol ?? "tcp";
  const state = port.state ?? "open";

  let output = `Port ${port.port}/${port.service?.name || "unknown"}: ${state}`;

  // Add service info
  if (port.service) {
    const serviceParts = [];
    if (port.service.name) serviceParts.push(`service: ${port.service.name}`);
    if (port.service.product) serviceParts.push(port.service.product);
    if (port.service.version) serviceParts.push(port.service.version);
    if (port.service.extraInfo) serviceParts.push(port.service.extraInfo);
    if (port.service.tunnel) serviceParts.push(port.service.tunnel);
    if (port.service.method) serviceParts.push(`method:${port.service.method}`);
    if (
      port.service.confidence !== null &&
      port.service.confidence !== undefined
    ) {
      serviceParts.push(`confidence:${port.service.confidence}`);
    }

    if (serviceParts.length > 0) {
      output += ` | ${serviceParts.join(" • ")}`;
    }
  }

  // Add CPE if available
  if (port.service?.cpe) {
    output += `\n        CPE: ${port.service.cpe}`;
  }

  // Add fingerprint probes
  if (
    port.service?.fingerprintMatches &&
    port.service.fingerprintMatches.length > 0
  ) {
    output += `\n        Fingerprint probes (${port.service.fingerprintMatches.length}):`;
    port.service.fingerprintMatches.forEach((fp, idx) => {
      if (fp.probe && fp.response) {
        const responseLength = fp.length || fp.response.length;
        const truncatedResponse =
          fp.response.length > 100
            ? `${fp.response.substring(0, 100)}...`
            : fp.response;
        output += `\n          - ${fp.probe}${responseLength > 0 ? ` [${responseLength}]` : ""}: ${truncatedResponse}`;
      } else if (fp.probe) {
        output += `\n          - ${fp.probe}`;
      }
    });
  }

  return output;
}

function parseLastSeenTimestamp(value?: number | null) {
  if (typeof value !== "number") return null;
  // Temporal artifacts store epoch seconds (optionally fractional)
  const milliseconds = value < 2_000_000_000 ? value * 1000 : value;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 60) {
    return diffMinutes === 1 ? "1 minute ago" : `${diffMinutes} minutes ago`;
  } else if (diffHours < 24) {
    return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
  } else {
    return diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;
  }
}

export function DeviceOpenPorts({
  deviceDetail,
  isLoading,
}: DeviceOpenPortsProps) {
  const [expandedPorts, setExpandedPorts] = useState<Set<string>>(new Set());

  const scanPortDetails = Array.isArray(deviceDetail?.scanStats?.ports)
    ? (deviceDetail?.scanStats?.ports as PortDetail[])
    : [];

  const fallbackDetails = Array.isArray(deviceDetail?.ports?.details)
    ? (deviceDetail?.ports?.details as PortDetail[])
    : Array.isArray(deviceDetail?.ports?.tcp)
      ? (deviceDetail?.ports?.tcp as number[]).map((port): PortDetail => ({
          port,
          protocol: "tcp",
          state: "open",
          service: undefined,
          discoveredBy: undefined,
          firstSeen: null,
          lastSeen: null,
        }))
      : [];

  const openPorts =
    scanPortDetails.length > 0 ? scanPortDetails : fallbackDetails;
  const openPortCount =
    deviceDetail?.scanStats?.openPortCount ?? openPorts.length;

  const togglePortExpanded = (portKey: string) => {
    setExpandedPorts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(portKey)) {
        newSet.delete(portKey);
      } else {
        newSet.add(portKey);
      }
      return newSet;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">Open Ports</h3>
        <div className="text-sm ">
          {openPortCount === 1 ? "1 port" : `${openPortCount} ports`}
        </div>
      </div>

      {isLoading && !deviceDetail ? (
        <div className="flex h-24 items-center justify-center">
          Loading open ports…
        </div>
      ) : openPorts.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]"></TableHead>
              <TableHead>Port</TableHead>
              <TableHead className="max-w-xs">Service</TableHead>
              <TableHead>Last Scan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {openPorts.map((port) => {
              const portKey = `${port.protocol ?? "tcp"}-${port.port}`;
              const isExpanded = expandedPorts.has(portKey);
              const serviceInfo = formatServiceInfo(port.service);
              const lastSeen = parseLastSeenTimestamp(port.lastSeen ?? null);
              const hasDetails =
                port.service &&
                (port.service.confidence !== null ||
                  port.service.method ||
                  port.service.cpe ||
                  port.service.fingerprintMatches?.length);

              return (
                <>
                  <TableRow
                    key={portKey}
                    className={cn(
                      hasDetails &&
                        "cursor-pointer hover:bg-muted/50 transition-colors",
                      isExpanded && "bg-muted/30",
                    )}
                    onClick={() => hasDetails && togglePortExpanded(portKey)}
                  >
                    <TableCell className="text-center">
                      {hasDetails && (
                        <div className="flex items-center justify-center">
                          <div className="p-1 hover:bg-muted rounded transition-transform duration-200">
                            <ChevronRight
                              className={cn(
                                "h-4 w-4 transition-transform duration-200",
                                isExpanded && "rotate-90",
                              )}
                            />
                          </div>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm">{port.port}</span>
                        <span className="text-[11px] uppercase text-muted-foreground">
                          {(port.protocol ?? "tcp").toUpperCase()}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="truncate">{serviceInfo}</span>
                        {port.service?.tunnel && (
                          <Badge variant="outline" className="text-xs">
                            {port.service.tunnel}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {lastSeen ? (
                        <div className="flex flex-col">
                          <span className="text-sm">
                            {formatRelativeTime(lastSeen)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {lastSeen.toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                  {isExpanded && hasDetails && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="bg-muted/10 border-b p-0"
                      >
                        <Collapsible.Root open={isExpanded}>
                          <Collapsible.Content className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-top-px data-[state=open]:slide-in-from-top-px">
                            <div className="px-8 py-4 space-y-4 border-l-4 border-primary/20">
                              {/* Formatted Scan Output Section */}
                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      <Terminal className="w-3 h-3 mr-1" />
                                      Formatted Scan Output
                                    </Badge>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2"
                                    onClick={async () => {
                                      try {
                                        await navigator.clipboard.writeText(
                                          formatRawPortOutput(port),
                                        );
                                        toast.success(
                                          "Formatted output copied to clipboard",
                                        );
                                      } catch (error) {
                                        toast.error(
                                          "Failed to copy to clipboard",
                                        );
                                      }
                                    }}
                                  >
                                    <Copy className="w-3 h-3" />
                                  </Button>
                                </div>
                                <Textarea
                                  readOnly
                                  value={formatRawPortOutput(port)}
                                  className="font-mono text-xs bg-muted/30 border-muted resize-none min-h-[120px] max-h-[200px]"
                                  style={{
                                    fontFamily:
                                      'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                                  }}
                                />
                              </div>

                              {port.service?.cpe && (
                                <div className="space-y-2">
                                  <Badge variant="outline" className="text-xs">
                                    CPE
                                  </Badge>
                                  <code className="block text-xs bg-muted px-3 py-2 rounded-md font-mono border">
                                    {port.service.cpe}
                                  </code>
                                </div>
                              )}

                              {port.service?.fingerprintMatches &&
                                port.service.fingerprintMatches.length > 0 && (
                                  <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                      <Badge
                                        variant="outline"
                                        className="text-xs"
                                      >
                                        Individual Fingerprint Probes
                                      </Badge>
                                      <span className="text-xs text-muted-foreground">
                                        (
                                        {port.service.fingerprintMatches.length}{" "}
                                        total)
                                      </span>
                                    </div>
                                    <div className="space-y-2 max-h-48 overflow-y-auto">
                                      {port.service.fingerprintMatches
                                        .slice(0, 3)
                                        .map((fp, idx) => (
                                          <div
                                            key={idx}
                                            className="bg-muted/50 p-3 rounded-md border"
                                          >
                                            {fp.probe && (
                                              <div className="text-xs text-muted-foreground mb-1 font-medium">
                                                Probe: {fp.probe}{" "}
                                                {fp.length && `[${fp.length}]`}
                                              </div>
                                            )}
                                            {fp.response && (
                                              <div className="text-xs font-mono bg-background p-2 rounded border break-all overflow-wrap-anywhere whitespace-pre-wrap max-w-full">
                                                {fp.response.length > 150
                                                  ? `${fp.response.substring(0, 150)}...`
                                                  : fp.response}
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      {port.service.fingerprintMatches.length >
                                        3 && (
                                        <div className="text-xs text-muted-foreground text-center py-2">
                                          ... and{" "}
                                          {port.service.fingerprintMatches
                                            .length - 3}{" "}
                                          more probes
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                            </div>
                          </Collapsible.Content>
                        </Collapsible.Root>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <div className="flex h-24 items-center justify-center text-muted-foreground">
          No open ports detected for this device.
        </div>
      )}
    </div>
  );
}
