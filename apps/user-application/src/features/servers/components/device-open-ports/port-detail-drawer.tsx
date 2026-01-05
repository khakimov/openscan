'use client';

import * as Collapsible from "@radix-ui/react-collapsible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, Terminal } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import type { TransformedDevice } from "@repo/contracts/device";
import type { PortDetail } from "./types";
import { formatRawPortOutput } from "./formatters";

interface PortDetailDrawerProps {
  port: PortDetail;
  portEnrichment: PortDetail['enrichment'];
  isExpanded: boolean;
  deviceDetail?: TransformedDevice;
}

export function PortDetailDrawer({
  port,
  portEnrichment,
  isExpanded,
  deviceDetail,
}: PortDetailDrawerProps) {
  const formattedOutput = formatRawPortOutput(port);
  const [screenshotModalOpen, setScreenshotModalOpen] = useState(false);

  const handleCopy = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(message);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  return (
    <Collapsible.Root open={isExpanded}>
      <Collapsible.Content className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-top-px data-[state=open]:slide-in-from-top-px">
        <div className="px-8 py-4 space-y-4 border-l-4 border-primary/20">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  <Terminal className="w-3 h-3 mr-1" />
                  Formatted Scan Output
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2"
                onClick={() =>
                  handleCopy(formattedOutput, "Formatted output copied to clipboard")
                }
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
            <Textarea
              readOnly
              value={formattedOutput}
              className="font-mono text-xs bg-muted/30 border-muted resize-none min-h-[120px] max-h-[200px]"
              style={{
                fontFamily:
                  'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              }}
            />
          </div>

          {port.httpxProbe && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    <Terminal className="w-3 h-3 mr-1" />
                    HTTPx Probe Results
                  </Badge>
                  {port.httpxProbe.statusCode && (
                    <Badge
                      variant={
                        port.httpxProbe.statusCode >= 200 && port.httpxProbe.statusCode < 300
                          ? "default"
                          : "secondary"
                      }
                      className="text-xs"
                    >
                      {port.httpxProbe.statusCode}
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() =>
                    handleCopy(
                      JSON.stringify(port.httpxProbe, null, 2),
                      "HTTPx data copied to clipboard",
                    )
                  }
                >
                  <Copy className="w-3 h-3" />
                </Button>
              </div>

              {port.httpxProbe.screenshot && deviceDetail?.id && (
                <div className="space-y-2">
                  <Badge variant="outline" className="text-xs">
                    Screenshot
                  </Badge>
                  <button
                    type="button"
                    onClick={() => setScreenshotModalOpen(true)}
                    className="block border rounded-md overflow-hidden bg-muted/30 hover:ring-2 hover:ring-primary/50 transition-all max-w-xs cursor-pointer"
                  >
                    <img
                      src={`/api/screenshots?r2Key=${encodeURIComponent(port.httpxProbe.screenshot)}&deviceId=${encodeURIComponent(deviceDetail.id)}`}
                      alt={`Screenshot of ${port.httpxProbe.scheme}://${deviceDetail.name || deviceDetail.ip}:${port.port}`}
                      className="w-full h-auto object-cover max-h-48"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  </button>
                  <p className="text-xs text-muted-foreground">Click to view full size</p>
                </div>
              )}

              <pre className="text-xs bg-muted/50 p-3 rounded-md border overflow-auto max-h-64 font-mono">
                {JSON.stringify(port.httpxProbe, null, 2)}
              </pre>
            </div>
          )}

          {port.service?.fingerprintMatches?.length ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  Fingerprint Matches
                </Badge>
                {port.service.confidence !== null &&
                  port.service.confidence !== undefined && (
                    <Badge variant="secondary" className="text-xs">
                      Confidence {port.service.confidence}/10
                    </Badge>
                  )}
              </div>

              <div className="grid gap-2">
                {port.service.fingerprintMatches.map((fp) => (
                  <div key={`${fp.probe}-${fp.length ?? "len"}`} className="border rounded-md p-3 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <div className="font-mono text-xs">{fp.probe}</div>
                      {typeof fp.length === "number" && (
                        <Badge variant="outline" className="text-[10px]">
                          {fp.length} bytes
                        </Badge>
                      )}
                    </div>
                    {fp.response && (
                      <div className="mt-2">
                        <div className="font-mono text-[10px] whitespace-pre-wrap break-words bg-background/70 p-2 rounded">
                          {fp.response.length > 200
                            ? `${fp.response.substring(0, 200)}…`
                            : fp.response}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {portEnrichment?.summary && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  CVE Vulnerabilities
                </Badge>
                <span className="text-xs text-muted-foreground">
                  ({portEnrichment.summary.cveCount} total
                  {portEnrichment.summary.criticalCount > 0 && `, ${portEnrichment.summary.criticalCount} critical`}
                  {portEnrichment.summary.highCount > 0 && `, ${portEnrichment.summary.highCount} high`})
                </span>
              </div>
              <div className="space-y-2">
                <pre className="text-xs bg-muted/50 p-3 rounded-md border overflow-auto max-h-64">
                  {JSON.stringify(portEnrichment, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </Collapsible.Content>

      {/* Screenshot Modal */}
      <Dialog open={screenshotModalOpen} onOpenChange={setScreenshotModalOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] p-0" aria-describedby={undefined}>
          <DialogHeader className="p-6 pb-2">
            <DialogTitle>
              Screenshot: {port.httpxProbe?.scheme}://{deviceDetail?.name || deviceDetail?.ip}:{port.port}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto p-6 pt-2">
            {port.httpxProbe?.screenshot && deviceDetail?.id && (
              <img
                src={`/api/screenshots?r2Key=${encodeURIComponent(port.httpxProbe.screenshot)}&deviceId=${encodeURIComponent(deviceDetail.id)}`}
                alt={`Screenshot of ${port.httpxProbe.scheme}://${deviceDetail.name || deviceDetail.ip}:${port.port}`}
                className="w-full h-auto rounded-md"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Collapsible.Root>
  );
}
