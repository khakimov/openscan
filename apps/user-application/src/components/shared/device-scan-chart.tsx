import { useMemo } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import { format } from "date-fns";

export interface ScanHistoryItem {
  id: string;
  requestedAt: Date; // Timestamp from Drizzle
  resultSummary: {
    openPortCount?: number;
    ports?: Array<{
      port: number;
      protocol: string;
      state: string;
      service?: string;
    }>;
  };
}

interface DeviceScanChartProps {
  scanHistory: ScanHistoryItem[];
  className?: string;
}

interface ScanDataPoint {
  scan: number;
  ports: number;
  date: string;
  scanNumber: string;
  allPorts: number[];
}

export function DeviceScanChart({
  scanHistory,
  className = "h-12"
}: DeviceScanChartProps) {
  // Transform real scan history into chart data
  const chartData: ScanDataPoint[] = useMemo(() => {
    // Reverse to show oldest first (chronological order)
    const sortedHistory = [...scanHistory].reverse();

    return sortedHistory.map((scan, index) => {
      // Extract ports from resultSummary
      const ports = scan.resultSummary?.ports || [];
      const openPorts = ports
        .filter(p => p.state === 'open')
        .map(p => p.port)
        .sort((a, b) => a - b);

      // Handle requestedAt - Drizzle returns it as a Date object
      let dateStr = 'Unknown date';
      if (scan.requestedAt) {
        try {
          dateStr = format(new Date(scan.requestedAt), 'MMM dd, yyyy');
        } catch (e) {
          console.error('Date formatting error:', e, scan.requestedAt);
        }
      }

      return {
        scan: index + 1,
        ports: openPorts.length,
        date: dateStr,
        scanNumber: `Scan #${index + 1}`,
        allPorts: openPorts,
      };
    });
  }, [scanHistory]);

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
        >
          <XAxis
            dataKey="scan"
            hide
            type="number"
            domain={['dataMin', 'dataMax']}
          />
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload as ScanDataPoint;
                return (
                  <div className="bg-card border rounded-lg p-3 shadow-lg text-xs max-w-xs">
                    <div className="font-medium">{data.scanNumber}</div>
                    <div className="text-muted-foreground mb-2">{data.date}</div>

                    {data.allPorts.length > 0 ? (
                      <div>
                        <div className="flex items-center gap-1 mb-2">
                          <div className="w-2 h-2 rounded-full bg-primary"></div>
                          <span className="font-medium">
                            {data.allPorts.length} open ports:
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                          {data.allPorts.map((port) => (
                            <span
                              key={port}
                              className="px-1.5 py-0.5 bg-primary/10 text-primary rounded text-xs font-mono"
                            >
                              {port}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-muted"></div>
                        <span className="text-muted-foreground">No ports discovered yet</span>
                      </div>
                    )}
                  </div>
                );
              }
              return null;
            }}
          />
          <Line
            type="monotone"
            dataKey="ports"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 3, fill: "#3b82f6" }}
            activeDot={{
              r: 5,
              fill: "#3b82f6",
              strokeWidth: 2,
              stroke: "#ffffff"
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}