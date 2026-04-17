import { useGetStats, getGetStatsQueryKey } from "@workspace/api-client-react";
import { Shield, ShieldAlert, ShieldCheck, ShieldQuestion, Activity, Target } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { cn } from "@/lib/utils";

export default function Stats() {
  const { data: stats, isLoading } = useGetStats({ query: { queryKey: getGetStatsQueryKey() } });

  if (isLoading || !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="font-mono text-primary animate-pulse flex items-center gap-3">
          <Activity className="h-5 w-5" />
          LOADING_TELEMETRY...
        </div>
      </div>
    );
  }

  const chartData = [
    { name: "Phishing", count: stats.phishing_count, color: "hsl(var(--destructive))" },
    { name: "AI Suspicious", count: stats.ai_suspicious_count, color: "hsl(var(--warning))" },
    { name: "Legitimate", count: stats.legitimate_count, color: "hsl(var(--safe))" },
  ];

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Analytics Dashboard</h2>
        <p className="text-muted-foreground font-mono text-sm">Aggregated telemetry and detection metrics across all scans.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Scans"
          value={stats.total}
          icon={Activity}
          color="hsl(var(--primary))"
          glowClass="neon-glow-primary"
        />
        <MetricCard
          title="Phishing Detected"
          value={stats.phishing_count}
          icon={ShieldAlert}
          color="hsl(var(--destructive))"
          glowClass="neon-glow-destructive"
          subtext={`${((stats.phishing_count / (stats.total || 1)) * 100).toFixed(1)}% rate`}
        />
        <MetricCard
          title="AI Suspicious"
          value={stats.ai_suspicious_count}
          icon={ShieldQuestion}
          color="hsl(var(--warning))"
          glowClass="neon-glow-warning"
          subtext={`${((stats.ai_suspicious_count / (stats.total || 1)) * 100).toFixed(1)}% rate`}
        />
        <MetricCard
          title="Legitimate"
          value={stats.legitimate_count}
          icon={ShieldCheck}
          color="hsl(var(--safe))"
          glowClass="neon-glow-safe"
          subtext={`${((stats.legitimate_count / (stats.total || 1)) * 100).toFixed(1)}% rate`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Class Distribution Chart */}
        <div className="glass-card rounded-xl p-6 lg:col-span-2 flex flex-col gap-6">
          <h3 className="text-sm font-mono text-muted-foreground uppercase tracking-widest border-b border-border pb-2">Verdict Distribution</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={120} tick={{ fill: "hsl(var(--muted-foreground))", fontFamily: "var(--font-mono)", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip 
                  cursor={{ fill: "hsl(var(--secondary))" }}
                  contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))", fontFamily: "var(--font-mono)", borderRadius: "8px" }}
                  itemStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={32}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} style={{ filter: `drop-shadow(0 0 8px ${entry.color}80)` }} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Averages */}
        <div className="glass-card rounded-xl p-6 flex flex-col gap-6">
          <h3 className="text-sm font-mono text-muted-foreground uppercase tracking-widest border-b border-border pb-2">Global Averages</h3>
          
          <div className="flex-1 flex flex-col justify-center gap-8">
            <div className="space-y-2">
              <div className="flex justify-between items-end">
                <div className="font-mono text-sm text-muted-foreground">Confidence</div>
                <div className="text-3xl font-mono font-bold text-primary neon-glow-primary bg-primary/10 px-3 py-1 rounded-lg border border-primary/20">
                  {(stats.avg_confidence).toFixed(1)}%
                </div>
              </div>
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${stats.avg_confidence}%`, boxShadow: '0 0 10px hsl(var(--primary))' }} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-end">
                <div className="font-mono text-sm text-muted-foreground">AI Score</div>
                <div className="text-3xl font-mono font-bold text-warning neon-glow-warning bg-warning/10 px-3 py-1 rounded-lg border border-warning/20">
                  {(stats.avg_ai_score).toFixed(1)}
                </div>
              </div>
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-warning" style={{ width: `${stats.avg_ai_score}%`, boxShadow: '0 0 10px hsl(var(--warning))' }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: number;
  icon: any;
  color: string;
  glowClass?: string;
  subtext?: string;
}

function MetricCard({ title, value, icon: Icon, color, glowClass, subtext }: MetricCardProps) {
  return (
    <div className="glass-card rounded-xl p-6 relative overflow-hidden flex flex-col justify-between group hover:border-border/80 transition-colors">
      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
        <Icon className="h-32 w-32" style={{ color }} />
      </div>
      <div className="relative">
        <div className="flex items-center gap-2 mb-4">
          <div className={cn("p-2 rounded-md bg-background/50 border border-border", glowClass)}>
            <Icon className="h-4 w-4" style={{ color }} />
          </div>
          <h3 className="font-mono text-xs text-muted-foreground uppercase tracking-widest">{title}</h3>
        </div>
        <div className="flex items-end gap-3">
          <div className="text-4xl font-mono font-bold" style={{ color }}>
            {value.toLocaleString()}
          </div>
          {subtext && (
            <div className="text-xs font-mono text-muted-foreground mb-1 border-l border-border pl-2">
              {subtext}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
