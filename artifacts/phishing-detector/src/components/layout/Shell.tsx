import { Link, useLocation } from "wouter";
import { Shield, History, BarChart3, Activity } from "lucide-react";
import { useHealthCheck, getHealthCheckQueryKey } from "@workspace/api-client-react";

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: health } = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey() } });

  const navItems = [
    { href: "/", icon: Shield, label: "Detector" },
    { href: "/history", icon: History, label: "History" },
    { href: "/stats", icon: BarChart3, label: "Statistics" },
  ];

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden text-foreground">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-border/50 bg-card flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-border/50 gap-3">
          <Shield className="w-6 h-6 text-primary" />
          <span className="font-mono font-bold tracking-tight text-primary">PHISH_DEF</span>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2 rounded-md font-mono text-sm transition-colors ${isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        
        <div className="p-6 border-t border-border/50">
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <Activity className={`w-3 h-3 ${health?.status === "ok" ? "text-safe" : "text-destructive"}`} />
            SYS_STATUS: {health?.status === "ok" ? "ONLINE" : "OFFLINE"}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,rgba(0,255,255,0.03),transparent_50%)]" />
        <div className="flex-1 overflow-y-auto z-10 p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
