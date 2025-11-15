'use client';

import { Fragment } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChevronRight } from "lucide-react";
import { cn } from "@/utils/cn";
import type { TransformedDevice } from "@repo/contracts/device";
import type { PortDetail } from "./types";
import {
  parseLastSeenTimestamp,
  formatRelativeTime,
} from "./formatters";
import { formatServiceForDisplay } from "@/features/assets/utils/service-display";
import { PortDetailDrawer } from "./port-detail-drawer";

interface OpenPortsTableProps {
  ports: PortDetail[];
  expandedPorts: Set<string>;
  onToggle: (portKey: string) => void;
  deviceDetail?: TransformedDevice;
}

export function OpenPortsTable({
  ports,
  expandedPorts,
  onToggle,
  deviceDetail,
}: OpenPortsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[50px]" />
          <TableHead>Port</TableHead>
          <TableHead className="max-w-xs">Service</TableHead>
          <TableHead>Last Scan</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ports.map((port) => {
          const portKey = `${port.protocol ?? "tcp"}-${port.port}`;
          const isExpanded = expandedPorts.has(portKey);
          const serviceDisplay = formatServiceForDisplay(port.service);
          const lastSeen = parseLastSeenTimestamp(port.lastSeen ?? null);
          // ✅ Read CVE enrichment directly from port (single source of truth)
          const portEnrichment = port.enrichment;
          const hasDetails =
            port.httpxProbe ||
            (port.service &&
              (port.service.confidence !== null ||
                port.service.method ||
                port.service.cpe ||
                port.service.fingerprintMatches?.length ||
                portEnrichment));

          return (
            <Fragment key={portKey}>
              <TableRow
                className={cn(
                  hasDetails && "cursor-pointer hover:bg-muted/50 transition-colors",
                  isExpanded && "bg-muted/30",
                )}
                onClick={() => hasDetails && onToggle(portKey)}
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
                    <span className="truncate">{serviceDisplay.label}</span>

                    {/* Show Unverified badge for low-confidence detections */}
                    {serviceDisplay.badge === 'unverified' && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-600/50">
                            Unverified
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="text-xs space-y-1">
                            {serviceDisplay.confidence !== undefined && serviceDisplay.confidence !== null ? (
                              <p>Scanner confidence: {serviceDisplay.confidence}/10 (below threshold)</p>
                            ) : (
                              <p>Service detection had low certainty</p>
                            )}
                            {serviceDisplay.rawName && (
                              <p className="text-muted-foreground">
                                Reported: {serviceDisplay.rawName}
                              </p>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )}

                    {/* Tunnel badge */}
                    {port.service?.tunnel && (
                      <Badge variant="outline" className="text-xs">
                        {port.service.tunnel}
                      </Badge>
                    )}

                    {/* CVE badge */}
                    {portEnrichment?.summary && portEnrichment.summary.cveCount > 0 && (
                      <Badge
                        variant={
                          portEnrichment.summary.criticalCount > 0
                            ? "destructive"
                            : portEnrichment.summary.highCount > 0
                              ? "default"
                              : "secondary"
                        }
                        className="text-xs"
                      >
                        {portEnrichment.summary.cveCount} CVE{portEnrichment.summary.cveCount !== 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {lastSeen ? (
                    <div className="flex flex-col" suppressHydrationWarning>
                      <span className="text-sm" suppressHydrationWarning>
                        {formatRelativeTime(lastSeen)}
                      </span>
                      <span className="text-xs text-muted-foreground" suppressHydrationWarning>
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
              {isExpanded && hasDetails ? (
                <TableRow>
                  <TableCell colSpan={4} className="bg-muted/10 border-b p-0">
                    <PortDetailDrawer
                      port={port}
                      portEnrichment={portEnrichment}
                      isExpanded={isExpanded}
                      deviceDetail={deviceDetail}
                    />
                  </TableCell>
                </TableRow>
              ) : null}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
