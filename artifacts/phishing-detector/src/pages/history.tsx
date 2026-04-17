import { useState } from "react";
import { useGetPredictionHistory, getGetPredictionHistoryQueryKey } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { ChevronDown, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { cn } from "@/lib/utils";

export default function History() {
  const { data: history, isLoading } = useGetPredictionHistory({ query: { queryKey: getGetPredictionHistoryQueryKey() } });
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const getVerdictConfig = (prediction: string) => {
    switch (prediction) {
      case "Legitimate":
        return { color: "hsl(var(--safe))", icon: ShieldCheck, bgClass: "bg-safe/10 text-safe border-safe/30" };
      case "AI-Generated Suspicious":
        return { color: "hsl(var(--warning))", icon: ShieldQuestion, bgClass: "bg-warning/10 text-warning border-warning/30" };
      case "Phishing":
        return { color: "hsl(var(--destructive))", icon: ShieldAlert, bgClass: "bg-destructive/10 text-destructive border-destructive/30" };
      default:
        return { color: "hsl(var(--muted))", icon: ShieldQuestion, bgClass: "bg-muted/10 text-muted border-muted/30" };
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Scan Log</h2>
        <p className="text-muted-foreground font-mono text-sm">Historical record of analyzed payloads and threat verdicts.</p>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <Table>
          <TableHeader className="bg-secondary/50">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="font-mono text-xs text-muted-foreground tracking-widest w-[180px]">TIMESTAMP</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground tracking-widest">PAYLOAD PREVIEW</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground tracking-widest">VERDICT</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground tracking-widest">THREAT</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground tracking-widest text-right">CONFIDENCE</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <div className="flex items-center justify-center font-mono text-sm text-primary animate-pulse">
                    LOADING_LOGS...
                  </div>
                </TableCell>
              </TableRow>
            ) : !history?.items.length ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center font-mono text-muted-foreground">
                  NO_LOGS_FOUND
                </TableCell>
              </TableRow>
            ) : (
              history.items.map((item) => {
                const config = getVerdictConfig(item.prediction);
                const Icon = config.icon;
                const isExpanded = expandedId === item.id;

                return (
                  <React.Fragment key={item.id}>
                    <TableRow 
                      className="border-border/50 group cursor-pointer hover:bg-secondary/30 transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {format(new Date(item.created_at), "yyyy-MM-dd HH:mm:ss")}
                      </TableCell>
                      <TableCell className="max-w-[300px]">
                        <div className="truncate text-sm text-foreground/80 font-mono">
                          {item.text_preview}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-mono uppercase font-bold", config.bgClass)}>
                          <Icon className="h-3.5 w-3.5" />
                          {item.prediction}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-mono px-2 py-0.5 rounded border bg-background/50 border-border" style={{ color: config.color }}>
                          {item.threat_level}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold">
                        {item.confidence.toFixed(1)}%
                      </TableCell>
                      <TableCell>
                        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", isExpanded && "rotate-180")} />
                      </TableCell>
                    </TableRow>
                    
                    {isExpanded && (
                      <TableRow className="bg-secondary/10 hover:bg-secondary/10 border-b border-border/50">
                        <TableCell colSpan={6} className="p-0">
                          <div className="p-6 grid grid-cols-3 gap-6 animate-in slide-in-from-top-2 duration-200">
                            <div className="col-span-2 space-y-4">
                              <h4 className="font-mono text-xs text-muted-foreground uppercase tracking-widest">Full Preview</h4>
                              <div className="bg-background/50 border border-border p-4 rounded-lg font-mono text-sm text-foreground/80 whitespace-pre-wrap max-h-48 overflow-y-auto">
                                {item.text_preview}
                              </div>
                            </div>
                            <div className="space-y-4">
                              <h4 className="font-mono text-xs text-muted-foreground uppercase tracking-widest">Analysis Details</h4>
                              <div className="space-y-2 font-mono text-sm">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">ML Score</span>
                                  <span>{item.ml_score.toFixed(1)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Rule Score</span>
                                  <span>{item.rule_score.toFixed(1)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">AI Score</span>
                                  <span>{item.ai_score.toFixed(1)}</span>
                                </div>
                                <div className="flex justify-between pt-2 border-t border-border/50">
                                  <span className="text-muted-foreground">Tone</span>
                                  <span className="text-right max-w-[120px] truncate" title={item.tone}>{item.tone}</span>
                                </div>
                                <div className="flex justify-between pt-2">
                                  <span className="text-muted-foreground">Keywords</span>
                                  <span className={item.keywords.length > 0 ? "text-destructive" : ""}>{item.keywords.length} found</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
