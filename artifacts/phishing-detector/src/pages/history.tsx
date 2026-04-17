import { useGetPredictionHistory, getGetPredictionHistoryQueryKey } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function History() {
  const { data: history, isLoading } = useGetPredictionHistory({ query: { queryKey: getGetPredictionHistoryQueryKey() } });

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <header>
        <h1 className="text-3xl font-mono font-bold tracking-tight text-foreground">Scan Log</h1>
        <p className="text-muted-foreground font-mono mt-2 text-sm">Historical record of analyzed payloads.</p>
      </header>

      <div className="border border-border/50 rounded-lg overflow-hidden bg-card">
        <Table>
          <TableHeader className="bg-background/50">
            <TableRow className="border-border/50">
              <TableHead className="font-mono text-xs text-muted-foreground">TIMESTAMP</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground">PAYLOAD_PREVIEW</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground">VERDICT</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground text-right">CONF</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center text-muted-foreground font-mono">
                  LOADING_LOGS...
                </TableCell>
              </TableRow>
            ) : !history?.items.length ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center text-muted-foreground font-mono">
                  NO_LOGS_FOUND
                </TableCell>
              </TableRow>
            ) : (
              history.items.map((item) => (
                <TableRow key={item.id} className="border-border/50 group">
                  <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(item.created_at), "yyyy-MM-dd HH:mm:ss")}
                  </TableCell>
                  <TableCell className="font-mono text-xs max-w-md truncate">
                    {item.text_preview}
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant="outline" 
                      className={`font-mono text-[10px] uppercase rounded-sm ${item.prediction === "Phishing" ? "text-destructive border-destructive/50 bg-destructive/10" : "text-safe border-safe/50 bg-safe/10"}`}
                    >
                      {item.prediction}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-right text-muted-foreground">
                    {(item.confidence * 100).toFixed(1)}%
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
