import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Shield, LayoutDashboard, History, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const [location] = useLocation();

  const links = [
    { href: "/", label: "Threat Detector", icon: Shield },
    { href: "/history", label: "Scan History", icon: History },
    { href: "/stats", label: "Analytics", icon: Activity },
  ];

  return (
    <div className="flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar px-4 py-6">
      <div className="mb-8 flex items-center gap-3 px-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 neon-glow-primary border border-primary/20">
          <Shield className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="font-bold text-foreground tracking-tight leading-none">AEGIS</h1>
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mt-1">Hybrid Intel</p>
        </div>
      </div>

      <nav className="flex-1 space-y-2">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = location === link.href;

          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-primary/10 text-primary border border-primary/20 neon-glow-primary"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-2 w-2 rounded-full bg-safe neon-glow-safe animate-pulse" />
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">System Status</span>
          </div>
          <div className="text-sm font-medium text-foreground">All systems operational</div>
        </div>
      </div>
    </div>
  );
}
