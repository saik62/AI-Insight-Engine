import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert, ShieldCheck, ShieldQuestion, Activity, AlertTriangle, Info, Link as LinkIcon, Hash, Scan } from "lucide-react";
import { 
  usePredictPhishing, 
  getGetPredictionHistoryQueryKey,
  getGetStatsQueryKey
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AnimatedArc } from "@/components/ui/animated-arc";
import { BarGauge } from "@/components/ui/bar-gauge";
import { cn } from "@/lib/utils";

export default function Home() {
  const [text, setText] = useState("");
  const queryClient = useQueryClient();
  const { mutate, data: result, isPending, error } = usePredictPhishing();

  const handleAnalyze = () => {
    if (!text.trim()) return;
    mutate({ data: { text } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPredictionHistoryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
      }
    });
  };

  const getVerdictConfig = (prediction: string | undefined) => {
    switch (prediction) {
      case "Legitimate":
        return { color: "hsl(var(--safe))", icon: ShieldCheck, glowClass: "neon-glow-safe", label: "LEGITIMATE" };
      case "AI-Generated Suspicious":
        return { color: "hsl(var(--warning))", icon: ShieldQuestion, glowClass: "neon-glow-warning", label: "AI-SUSPICIOUS" };
      case "Phishing":
        return { color: "hsl(var(--destructive))", icon: ShieldAlert, glowClass: "neon-glow-destructive", label: "PHISHING DETECTED" };
      default:
        return { color: "hsl(var(--muted))", icon: Activity, glowClass: "", label: "UNKNOWN" };
    }
  };

  const config = getVerdictConfig(result?.prediction);
  const VerdictIcon = config.icon;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <Scan className="h-8 w-8 text-primary animate-pulse" />
          Threat Detector
        </h2>
        <p className="text-muted-foreground font-mono text-sm">Paste raw email payload or message content for hybrid AI/ML analysis.</p>
      </div>

      <div className="glass-card rounded-xl p-1 relative overflow-hidden">
        <div className="relative">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste email headers and body here..."
            className="min-h-[200px] font-mono text-sm bg-transparent border-0 focus-visible:ring-0 resize-y p-4 text-foreground/90 placeholder:text-muted-foreground/50"
            disabled={isPending}
          />
          {isPending && (
            <div className="absolute inset-0 pointer-events-none flex flex-col justify-center items-center bg-background/40 backdrop-blur-[2px]">
              <div className="w-full h-1 bg-primary/50 absolute top-0 animate-scan neon-glow-primary" />
              <Activity className="h-12 w-12 text-primary animate-pulse mb-4 neon-glow-primary rounded-full" />
              <div className="text-primary font-mono text-sm uppercase tracking-widest animate-pulse">Running heuristic analysis...</div>
            </div>
          )}
        </div>
        
        <div className="p-3 bg-secondary/50 border-t border-border flex justify-between items-center rounded-b-lg">
          <div className="text-xs font-mono text-muted-foreground">
            {text.length} characters
          </div>
          <Button 
            onClick={handleAnalyze} 
            disabled={isPending || !text.trim()}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-mono font-bold tracking-wider uppercase px-8 neon-glow-primary transition-all"
          >
            {isPending ? "Analyzing..." : "Analyze Threat"}
          </Button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive font-mono text-sm flex items-center gap-2"
          >
            <AlertTriangle className="h-4 w-4" />
            Analysis failed. Please try again.
          </motion.div>
        )}

        {result && !isPending && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {/* Primary Verdict Card */}
            <div className="glass-card p-6 rounded-xl md:col-span-1 flex flex-col items-center justify-center text-center space-y-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: config.color, boxShadow: `0 0 20px ${config.color}` }} />
              
              <div className={cn("p-4 rounded-full bg-background/50 border", config.glowClass)} style={{ borderColor: `${config.color}40` }}>
                <VerdictIcon className="h-12 w-12" style={{ color: config.color }} />
              </div>
              
              <div>
                <div className="text-2xl font-bold tracking-tight uppercase" style={{ color: config.color }}>
                  {config.label}
                </div>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <span className="text-xs font-mono text-muted-foreground uppercase">Threat Level:</span>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-background border" style={{ color: config.color, borderColor: `${config.color}40` }}>
                    {result.threat_level}
                  </span>
                </div>
              </div>

              <AnimatedArc value={result.confidence} color={config.color} />
            </div>

            {/* Details Card */}
            <div className="glass-card p-6 rounded-xl md:col-span-2 flex flex-col gap-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-mono text-muted-foreground uppercase tracking-widest border-b border-border pb-2">Score Breakdown</h3>
                  <div className="space-y-4">
                    <BarGauge label="ML Score" value={result.ml_score} color="hsl(217, 91%, 60%)" />
                    <BarGauge label="Rule Score" value={result.rule_score} color="hsl(0, 85%, 58%)" />
                    <BarGauge label="AI Score" value={result.ai_score} color="hsl(38, 95%, 55%)" />
                  </div>
                </div>
                
                <div className="space-y-4">
                  <h3 className="text-sm font-mono text-muted-foreground uppercase tracking-widest border-b border-border pb-2">Analysis</h3>
                  <div className="flex flex-col gap-3">
                    <div>
                      <span className="text-xs font-mono text-muted-foreground uppercase">Tone: </span>
                      <span className="text-sm font-medium text-foreground">{result.tone}</span>
                    </div>
                    <div className="text-sm text-muted-foreground leading-relaxed border-l-2 border-primary/30 pl-3">
                      {result.explanation}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 pt-4 border-t border-border">
                {/* Keywords & URLs */}
                <div className="space-y-4">
                  <h3 className="text-sm font-mono text-muted-foreground uppercase tracking-widest">Indicators</h3>
                  <div className="space-y-3">
                    {result.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {result.keywords.map((kw, i) => (
                          <span key={i} className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
                            <Hash className="h-3 w-3" />
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}
                    {result.urls.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        {result.urls.map((url, i) => (
                          <span key={i} className="inline-flex items-center gap-1 text-xs font-mono text-primary bg-primary/5 px-2 py-1 rounded border border-primary/10 truncate max-w-full">
                            <LinkIcon className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{url}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {result.keywords.length === 0 && result.urls.length === 0 && (
                      <span className="text-xs font-mono text-muted-foreground">No suspicious indicators found.</span>
                    )}
                  </div>
                </div>

                {/* Suggestions */}
                <div className="space-y-4">
                  <h3 className="text-sm font-mono text-muted-foreground uppercase tracking-widest">Recommendations</h3>
                  <ul className="space-y-2">
                    {result.suggestions.map((suggestion, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                        <Info className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                        <span>{suggestion}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
