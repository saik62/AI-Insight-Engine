import { useGetStats, getGetStatsQueryKey } from "@workspace/api-client-react";
import { Shield, ShieldAlert, ShieldCheck, Target, Activity } from "lucide-react";

export default function Stats() {
  const { data: stats, isLoading } = useGetStats({ query: { queryKey: getGetStatsQueryKey() } });

  if (isLoading || !stats) {
    return <div className="font-mono text-muted-foreground">LOADING_METRICS...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <header>
        <h1 className="text-3xl font-mono font-bold tracking-tight text-foreground">Global Metrics</h1>
        <p className="text-muted-foreground font-mono mt-2 text-sm">Aggregated telemetry data across all scans.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-card border border-border/50 p-6 rounded-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Activity className="w-24 h-24 text-primary" />
          </div>
          <div className="text-xs font-mono text-muted-foreground mb-4">TOTAL_SCANS</div>
          <div className="text-4xl font-mono font-bold text-primary">{stats.total}</div>
        </div>

        <div className="bg-card border border-destructive/20 p-6 rounded-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <ShieldAlert className="w-24 h-24 text-destructive" />
          </div>
          <div className="text-xs font-mono text-destructive mb-4">THREATS_DETECTED</div>
          <div className="text-4xl font-mono font-bold text-destructive">{stats.phishing_count}</div>
        </div>

        <div className="bg-card border border-safe/20 p-6 rounded-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <ShieldCheck className="w-24 h-24 text-safe" />
          </div>
          <div className="text-xs font-mono text-safe mb-4">CLEAN_PAYLOADS</div>
          <div className="text-4xl font-mono font-bold text-safe">{stats.safe_count}</div>
        </div>

        <div className="bg-card border border-border/50 p-6 rounded-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Target className="w-24 h-24 text-primary" />
          </div>
          <div className="text-xs font-mono text-muted-foreground mb-4">AVG_CONFIDENCE</div>
          <div className="text-4xl font-mono font-bold">{(stats.avg_confidence * 100).toFixed(1)}%</div>
        </div>
      </div>

      <div className="bg-card border border-border/50 p-8 rounded-lg mt-8">
        <div className="text-sm font-mono text-muted-foreground mb-6">THREAT_DISTRIBUTION</div>
        <div className="h-8 w-full bg-background rounded-full overflow-hidden flex border border-border/50">
          <div 
            className="h-full bg-destructive transition-all duration-1000 ease-out" 
            style={{ width: `${stats.total > 0 ? (stats.phishing_count / stats.total) * 100 : 0}%` }}
          />
          <div 
            className="h-full bg-safe transition-all duration-1000 ease-out" 
            style={{ width: `${stats.total > 0 ? (stats.safe_count / stats.total) * 100 : 0}%` }}
          />
        </div>
        <div className="flex justify-between mt-4 font-mono text-xs">
          <div className="text-destructive">PHISHING ({(stats.phishing_rate * 100).toFixed(1)}%)</div>
          <div className="text-safe">SAFE ({((1 - stats.phishing_rate) * 100).toFixed(1)}%)</div>
        </div>
      </div>
    </div>
  );
}
