import { motion } from "framer-motion";

interface BarGaugeProps {
  label: string;
  value: number;
  color: string;
}

export function BarGauge({ label, value, color }: BarGaugeProps) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-mono">
        <span className="text-muted-foreground uppercase tracking-wider">{label}</span>
        <span className="font-bold" style={{ color }}>{value}/100</span>
      </div>
      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ 
            backgroundColor: color,
            boxShadow: `0 0 10px ${color}`
          }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
        />
      </div>
    </div>
  );
}
