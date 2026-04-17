import { useState } from "react";
import { usePredictPhishing, getGetPredictionHistoryQueryKey, getGetStatsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, ShieldCheck, Scan, AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  const [text, setText] = useState("");
  const queryClient = useQueryClient();
  const predict = usePredictPhishing();

  const handleDetect = () => {
    if (!text.trim()) return;
    
    predict.mutate(
      { data: { text } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetPredictionHistoryQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
        }
      }
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <header>
        <h1 className="text-3xl font-mono font-bold tracking-tight text-foreground">Threat Detection Engine</h1>
        <p className="text-muted-foreground font-mono mt-2 text-sm">Paste raw email content or message payload for deep analysis.</p>
      </header>

      <div className="relative group">
        <div className={`absolute inset-0 border-2 rounded-lg pointer-events-none transition-colors duration-500 z-10 ${predict.isPending ? "border-primary shadow-[0_0_15px_rgba(0,255,255,0.5)]" : "border-border"}`} />
        
        {predict.isPending && (
          <div className="absolute inset-0 overflow-hidden rounded-lg pointer-events-none z-20">
            <div className="w-full h-1 bg-primary/80 shadow-[0_0_10px_rgba(0,255,255,0.8)] animate-scan" />
          </div>
        )}

        <Textarea 
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="PASTE_TARGET_PAYLOAD_HERE"
          className="min-h-[300px] font-mono text-sm resize-y bg-card border-none rounded-lg p-6 focus-visible:ring-0 z-0 relative"
          disabled={predict.isPending}
        />
      </div>

      <div className="flex justify-end">
        <Button 
          onClick={handleDetect} 
          disabled={!text.trim() || predict.isPending}
          className="font-mono w-40"
          size="lg"
        >
          {predict.isPending ? (
            <span className="flex items-center gap-2">
              <Scan className="w-4 h-4 animate-spin" />
              ANALYZING
            </span>
          ) : "DETECT"}
        </Button>
      </div>

      {predict.data && (
        <div className="animate-in slide-in-from-bottom-4 duration-500">
          <div className={`border rounded-lg p-6 ${predict.data.prediction === "Phishing" ? "bg-destructive/10 border-destructive/50" : "bg-safe/10 border-safe/50"}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                {predict.data.prediction === "Phishing" ? (
                  <ShieldAlert className="w-12 h-12 text-destructive" />
                ) : (
                  <ShieldCheck className="w-12 h-12 text-safe" />
                )}
                <div>
                  <h2 className="text-2xl font-mono font-bold tracking-tight uppercase">
                    {predict.data.prediction === "Phishing" ? "THREAT DETECTED" : "CLEAN"}
                  </h2>
                  <div className="text-sm font-mono text-muted-foreground flex items-center gap-2 mt-1">
                    CONFIDENCE LEVEL: {(predict.data.confidence * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono text-muted-foreground">
                  <span>CONFIDENCE</span>
                  <span>{(predict.data.confidence * 100).toFixed(1)}%</span>
                </div>
                <Progress value={predict.data.confidence * 100} className={`h-2 ${predict.data.prediction === "Phishing" ? "bg-destructive/20 [&>div]:bg-destructive" : "bg-safe/20 [&>div]:bg-safe"}`} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-background/50 p-4 rounded-md border border-border/50">
                  <div className="text-xs font-mono text-muted-foreground mb-1">ML_SCORE</div>
                  <div className="text-xl font-mono">{(predict.data.ml_score * 100).toFixed(1)}</div>
                </div>
                <div className="bg-background/50 p-4 rounded-md border border-border/50">
                  <div className="text-xs font-mono text-muted-foreground mb-1">RULE_SCORE</div>
                  <div className="text-xl font-mono">{(predict.data.rule_score * 100).toFixed(1)}</div>
                </div>
              </div>

              {predict.data.keywords.length > 0 && (
                <div className="space-y-3">
                  <div className="text-xs font-mono text-muted-foreground flex items-center gap-2">
                    <AlertTriangle className="w-3 h-3" />
                    FLAGGED_VECTORS
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {predict.data.keywords.map((kw, i) => (
                      <Badge key={i} variant="outline" className={`font-mono ${predict.data.prediction === "Phishing" ? "text-destructive border-destructive/30" : "text-primary border-primary/30"}`}>
                        {kw}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {predict.error && (
        <div className="p-4 border border-destructive/50 bg-destructive/10 text-destructive rounded-lg font-mono text-sm">
          ERROR_DURING_ANALYSIS
        </div>
      )}
    </div>
  );
}
