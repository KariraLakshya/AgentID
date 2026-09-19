import { useState, useEffect, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type View = "dashboard" | "agents" | "permissions" | "audit" | "revocation";
type AgentStatus = "active" | "revoked" | "suspended";

interface Agent {
  id: string;
  name: string;
  org: string;
  role: string;
  status: AgentStatus;
  issuedBy: string;
  issuedAt: string;
  expiresAt: string;
  lastSeen: string;
  actionsToday: number;
  deniedToday: number;
  scope: string[];
  denied: string[];
}

interface AuditEntry {
  id: string;
  agentId: string;
  agentName: string;
  tool: string;
  action: string;
  outcome: "allowed" | "denied";
  reason: string;
  timestamp: string;
  techDetail: string;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const AGENTS: Agent[] = [
  {
    id: "agt_9kX2mP",
    name: "DataSync Agent",
    org: "Acme Corp / Data Team",
    role: "Read-only data pipeline assistant",
    status: "active",
    issuedBy: "Custos Root CA · Acme Corp",
    issuedAt: "Sep 12, 2026",
    expiresAt: "Sep 12, 2026, 18:00 UTC",
    lastSeen: "2 minutes ago",
    actionsToday: 87,
    deniedToday: 0,
    scope: [
      "Read from production database (SELECT only)",
      "Write to data warehouse staging tables",
      "Send notifications via Slack #data-alerts",
      "Access S3 bucket: acme-analytics-export",
    ],
    denied: [
      "Write or delete from production database",
      "Access customer PII fields",
      "Call external APIs not on the allowlist",
      "Escalate its own permissions",
    ],
  },
  {
    id: "agt_3nR7qL",
    name: "Support Assistant",
    org: "Acme Corp / Customer Success",
    role: "Tier-1 support ticket responder",
    status: "active",
    issuedBy: "Custos Root CA · Acme Corp",
    issuedAt: "Sep 10, 2026",
    expiresAt: "Sep 19, 2026, 23:59 UTC",
    lastSeen: "14 minutes ago",
    actionsToday: 43,
    deniedToday: 2,
    scope: [
      "Read support tickets in Zendesk",
      "Post replies to tickets (not close)",
      "Look up account info for authenticated users",
      "Escalate tickets to human agents",
    ],
    denied: [
      "Issue refunds or credits",
      "Access billing information",
      "Close or delete tickets",
      "Impersonate human agents",
    ],
  },
  {
    id: "agt_7wF1tK",
    name: "Deploy Bot",
    org: "Acme Corp / Infrastructure",
    role: "Automated deployment orchestrator",
    status: "revoked",
    issuedBy: "Custos Root CA · Acme Corp",
    issuedAt: "Sep 1, 2026",
    expiresAt: "Revoked Sep 19, 2026, 09:14 UTC",
    lastSeen: "1 hour ago",
    actionsToday: 12,
    deniedToday: 1,
    scope: [
      "Trigger deployments in staging environment",
      "Read CI/CD pipeline status",
      "Post deploy summaries to #deploys",
    ],
    denied: [
      "Deploy to production without approval",
      "Modify infrastructure configuration",
      "Access secrets outside deploy scope",
      "Approve its own pull requests",
    ],
  },
  {
    id: "agt_5jH8cM",
    name: "Compliance Monitor",
    org: "Acme Corp / Legal",
    role: "Regulatory data auditor",
    status: "active",
    issuedBy: "Custos Root CA · Acme Corp",
    issuedAt: "Aug 28, 2026",
    expiresAt: "Nov 28, 2026, 00:00 UTC",
    lastSeen: "Just now",
    actionsToday: 0,
    deniedToday: 0,
    scope: [
      "Read audit logs (read-only)",
      "Export compliance reports as PDF",
      "Access anonymized usage metrics",
    ],
    denied: [
      "Read or write user personal data",
      "Modify any audit records",
      "Take actions on behalf of other agents",
    ],
  },
];

const AUDIT_LOG: AuditEntry[] = [
  {
    id: "evt_001",
    agentId: "agt_9kX2mP",
    agentName: "DataSync Agent",
    tool: "Database",
    action: "SELECT * FROM orders WHERE date > 2026-09-18",
    outcome: "allowed",
    reason: "Within read-only scope for production database",
    timestamp: "09:41:02",
    techDetail: "sig:sha256:a3f9...c12e · policy:db-readonly-v2 · ttl:3600s",
  },
  {
    id: "evt_002",
    agentId: "agt_3nR7qL",
    agentName: "Support Assistant",
    tool: "Zendesk",
    action: "Fetch ticket #TK-18842 for customer review",
    outcome: "allowed",
    reason: "Reading tickets is permitted for this agent",
    timestamp: "09:40:55",
    techDetail: "sig:sha256:b7d2...44f1 · policy:support-read-v1 · ttl:1800s",
  },
  {
    id: "evt_003",
    agentId: "agt_3nR7qL",
    agentName: "Support Assistant",
    tool: "Billing API",
    action: "GET /billing/invoices for account #8821",
    outcome: "denied",
    reason: "Billing information access is not permitted for this agent",
    timestamp: "09:40:31",
    techDetail: "sig:sha256:c9e4...77a2 · policy:support-read-v1 · denied:billing-scope",
  },
  {
    id: "evt_004",
    agentId: "agt_9kX2mP",
    agentName: "DataSync Agent",
    tool: "S3",
    action: "PUT acme-analytics-export/2026-09-19/orders.parquet",
    outcome: "allowed",
    reason: "Write access to analytics export bucket is permitted",
    timestamp: "09:39:18",
    techDetail: "sig:sha256:d1a8...90b3 · policy:s3-export-v1 · ttl:3600s",
  },
  {
    id: "evt_005",
    agentId: "agt_7wF1tK",
    agentName: "Deploy Bot",
    tool: "GitHub Actions",
    action: "Trigger workflow: deploy-to-staging.yml",
    outcome: "denied",
    reason: "This agent's access was revoked at 09:14 UTC",
    timestamp: "09:38:44",
    techDetail: "sig:sha256:e2c0...15d9 · revoked:2026-09-19T09:14:00Z · status:401",
  },
  {
    id: "evt_006",
    agentId: "agt_5jH8cM",
    agentName: "Compliance Monitor",
    tool: "Audit Log",
    action: "Export audit records Sep 1 – Sep 19 as PDF",
    outcome: "allowed",
    reason: "Read and export access to audit logs is permitted",
    timestamp: "09:37:55",
    techDetail: "sig:sha256:f4b1...28e7 · policy:compliance-read-v3 · ttl:7200s",
  },
  {
    id: "evt_007",
    agentId: "agt_9kX2mP",
    agentName: "DataSync Agent",
    tool: "Slack",
    action: 'Post message to #data-alerts: "Sync complete"',
    outcome: "allowed",
    reason: "Slack notifications to #data-alerts are permitted",
    timestamp: "09:36:30",
    techDetail: "sig:sha256:g5c2...39f8 · policy:slack-notify-v1 · ttl:3600s",
  },
  {
    id: "evt_008",
    agentId: "agt_3nR7qL",
    agentName: "Support Assistant",
    tool: "Zendesk",
    action: "Close ticket #TK-18801 as resolved",
    outcome: "denied",
    reason: "Closing tickets requires human agent approval",
    timestamp: "09:35:22",
    techDetail: "sig:sha256:h6d3...40g9 · policy:support-read-v1 · denied:ticket-close",
  },
];

// ─── Icons ────────────────────────────────────────────────────────────────────

const Icon = {
  Shield: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  Grid: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  ),
  Agents: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  ),
  Lock: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  Activity: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  Revoke: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </svg>
  ),
  Check: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  X: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  ChevronDown: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  ChevronRight: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 6 15 12 9 18" />
    </svg>
  ),
  Key: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="15" r="5" />
      <path d="M11.95 10.05L17.9 4.1M20 2l2 2-2.5 2.5L17 4" />
    </svg>
  ),
  Fingerprint: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12C2 6.5 6.5 2 12 2a10 10 0 0 1 8 4" />
      <path d="M5 19.5C5.5 18 6 15 6 12c0-3.3 2.7-6 6-6 1.8 0 3.4.8 4.5 2" />
      <path d="M11 12c0 .9-.1 1.8-.3 2.6M14 12.6c-.1 2.2-.8 4.3-2 6M12 12a4 4 0 0 0-4 4c0 1.5-.2 3-.5 4.5M17 12c0 2.9-.5 5.6-1.5 8M22 12c0 5.5-4.5 10-10 10" />
    </svg>
  ),
  Building: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="9" width="18" height="12" rx="1" />
      <path d="M8 9V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v4" />
      <line x1="12" y1="12" x2="12" y2="15" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  ),
  Tag: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  ),
  BadgeCheck: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  ),
  AlertTriangle: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  ExternalLink: () => (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  ),
  Cpu: () => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="1" x2="9" y2="4" />
      <line x1="15" y1="1" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="23" />
      <line x1="15" y1="20" x2="15" y2="23" />
      <line x1="20" y1="9" x2="23" y2="9" />
      <line x1="20" y1="15" x2="23" y2="15" />
      <line x1="1" y1="9" x2="4" y2="9" />
      <line x1="1" y1="15" x2="4" y2="15" />
    </svg>
  ),
};

// ─── Shared Components ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AgentStatus }) {
  const styles = {
    active: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    revoked: "bg-red-500/10 text-red-600 border-red-500/20",
    suspended: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  };
  const labels = { active: "Active", revoked: "Revoked", suspended: "Suspended" };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs font-medium ${styles[status]}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${status === "active" ? "bg-emerald-400 live-dot" : status === "revoked" ? "bg-red-400" : "bg-amber-400"}`}
      />
      {labels[status]}
    </span>
  );
}

function OutcomeBadge({ outcome }: { outcome: "allowed" | "denied" }) {
  return outcome === "allowed" ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs font-medium">
      <Icon.Check /> Allowed
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border bg-red-500/10 text-red-600 border-red-500/20 text-xs font-medium">
      <Icon.X /> Denied
    </span>
  );
}

function Card({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`rounded-lg border bg-[var(--card)] border-[var(--border)] shadow-sm ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const NAV_ITEMS: { id: View; label: string; icon: keyof typeof Icon }[] = [
  { id: "dashboard", label: "Dashboard", icon: "Grid" },
  { id: "agents", label: "Agents", icon: "Agents" },
  { id: "permissions", label: "Permissions", icon: "Lock" },
  { id: "audit", label: "Audit Log", icon: "Activity" },
  { id: "revocation", label: "Revoke Access", icon: "Revoke" },
];

function Sidebar({ active, onNav }: { active: View; onNav: (v: View) => void }) {
  return (
    <aside
      style={{
        width: 220,
        minWidth: 220,
        background: "var(--sidebar-bg)",
        borderRight: "1px solid var(--sidebar-border)",
      }}
      className="flex flex-col h-full"
    >
      {/* Logo */}
      <div className="px-5 py-5 border-b" style={{ borderColor: "var(--sidebar-border)" }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shadow-sm"
            style={{
              background: "var(--sidebar-accent-gradient)",
              color: "white",
              boxShadow: "0 0 0 4px var(--sidebar-glow)",
            }}
          >
            <Icon.Shield />
          </div>
          <div>
            <div
              className="font-semibold text-sm tracking-tight"
              style={{ color: "var(--sidebar-foreground)" }}
            >
              Custos
            </div>
            <div
              className="text-[10px] tracking-widest uppercase"
              style={{ color: "var(--sidebar-muted)" }}
            >
              Trust Layer
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2">
        <div
          className="text-[10px] font-medium tracking-widest uppercase px-3 mb-2"
          style={{ color: "var(--sidebar-muted)" }}
        >
          Navigation
        </div>
        {NAV_ITEMS.map((item) => {
          const IconComp = Icon[item.icon] as () => React.ReactElement;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNav(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm mb-0.5 transition-all text-left cursor-pointer ${
                isActive ? "text-white font-medium shadow-sm" : "hover:bg-white/5"
              }`}
              style={{
                background: isActive ? "var(--sidebar-accent-gradient)" : undefined,
                color: isActive ? "white" : "var(--sidebar-muted)",
              }}
            >
              <IconComp />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t" style={{ borderColor: "var(--sidebar-border)" }}>
        <div className="text-xs" style={{ color: "var(--sidebar-muted)" }}>
          <div className="font-medium mb-0.5" style={{ color: "var(--sidebar-foreground)" }}>
            Acme Corp
          </div>
          <div>4 agents · 3 active</div>
        </div>
      </div>
    </aside>
  );
}

// ─── Dashboard View ───────────────────────────────────────────────────────────

function Dashboard({ onNav }: { onNav: (v: View) => void }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  const recentEntries = AUDIT_LOG.slice(0, 5);

  return (
    <div className="p-8 space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
          Sat, Sep 19, 2026 · Acme Corp workspace
        </p>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Agents", value: "4", sub: "1 revoked", subColor: "text-red-600" },
          {
            label: "Active Now",
            value: "3",
            sub: "Live credentials",
            subColor: "text-emerald-600",
          },
          { label: "Actions Today", value: "142", sub: "↑ 18% vs yesterday", subColor: "" },
          {
            label: "Denied Today",
            value: "3",
            sub: "2.1% denial rate",
            subColor: "text-amber-600",
          },
        ].map((s) => (
          <Card key={s.label} className="p-5">
            <div className="text-xs font-medium mb-2" style={{ color: "var(--muted-foreground)" }}>
              {s.label}
            </div>
            <div className="text-3xl font-semibold tracking-tight">{s.value}</div>
            <div
              className={`text-xs mt-1 ${s.subColor || ""}`}
              style={!s.subColor ? { color: "var(--muted-foreground)" } : {}}
            >
              {s.sub}
            </div>
          </Card>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-3 gap-4">
        {/* Agent status */}
        <Card className="p-5 col-span-1">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-medium">Agent Status</div>
            <button
              onClick={() => onNav("agents")}
              className="text-xs flex items-center gap-1 hover:opacity-70 transition-opacity"
              style={{ color: "var(--primary)" }}
            >
              View all <Icon.ExternalLink />
            </button>
          </div>
          <div className="space-y-3">
            {AGENTS.map((agent) => (
              <div key={agent.id} className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{agent.name}</div>
                  <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    {agent.role.slice(0, 30)}…
                  </div>
                </div>
                <StatusBadge status={agent.status} />
              </div>
            ))}
          </div>
        </Card>

        {/* Recent activity */}
        <Card className="p-5 col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium">Live Activity</div>
              <span
                className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded"
                style={{ background: "rgba(21,128,61,0.1)", color: "#15803D" }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 live-dot" />
                LIVE
              </span>
            </div>
            <button
              onClick={() => onNav("audit")}
              className="text-xs flex items-center gap-1 hover:opacity-70 transition-opacity"
              style={{ color: "var(--primary)" }}
            >
              Full log <Icon.ExternalLink />
            </button>
          </div>
          <div className="space-y-2">
            {recentEntries.map((entry, i) => (
              <div
                key={entry.id}
                className="flex items-center gap-3 py-2 border-b border-[var(--border)] last:border-0 animate-slide-in"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div
                  className="w-16 text-xs font-mono flex-shrink-0"
                  style={{
                    color: "var(--muted-foreground)",
                    fontFamily: "var(--font-family-mono)",
                  }}
                >
                  {entry.timestamp}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium" style={{ color: "#B7410E" }}>
                    {entry.agentName}
                  </span>
                  <span className="text-xs mx-1" style={{ color: "var(--muted-foreground)" }}>
                    ·
                  </span>
                  <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    {entry.tool}
                  </span>
                </div>
                <OutcomeBadge outcome={entry.outcome} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Security posture */}
      <Card className="p-5">
        <div className="text-sm font-medium mb-4">Security Posture</div>
        <div className="grid grid-cols-3 gap-6">
          {[
            {
              label: "Credential Expiry",
              value: "1 expires today",
              color: "#CA8A04",
              desc: "DataSync Agent credential expires Sep 19 at 18:00 UTC",
            },
            {
              label: "Scope Violations",
              value: "None in 7 days",
              color: "#15803D",
              desc: "All denied actions were caught by policy — no scope escapes",
            },
            {
              label: "Revoked Agents",
              value: "1 active revocation",
              color: "#B91C1C",
              desc: "Deploy Bot was revoked today. All subsequent attempts denied.",
            },
          ].map((item) => (
            <div key={item.label}>
              <div className="text-xs mb-1" style={{ color: "var(--muted-foreground)" }}>
                {item.label}
              </div>
              <div className="text-sm font-semibold mb-1" style={{ color: item.color }}>
                {item.value}
              </div>
              <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                {item.desc}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Agents View ──────────────────────────────────────────────────────────────

function CredentialFact({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="py-2.5 border-b border-[var(--border)] last:border-0">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex-shrink-0" style={{ color: "var(--muted-foreground)" }}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs mb-0.5" style={{ color: "var(--muted-foreground)" }}>
            {label}
          </div>
          <div className="text-sm font-medium">{value}</div>
          {detail && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs mt-1 hover:opacity-70 transition-opacity"
              style={{ color: "var(--primary)" }}
            >
              {expanded ? <Icon.ChevronDown /> : <Icon.ChevronRight />}
              {expanded ? "Hide technical detail" : "How this is verified"}
            </button>
          )}
          {expanded && detail && (
            <div
              className="mt-2 p-2 rounded text-xs"
              style={{
                background: "var(--secondary)",
                color: "var(--muted-foreground)",
                fontFamily: "var(--font-family-mono)",
              }}
            >
              {detail}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AgentCard({
  agent,
  onRevoke,
}: {
  agent: Agent;
  onRevoke: () => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <Card
      className={`transition-all ${agent.status === "revoked" ? "opacity-80" : ""}`}
      style={{
        borderLeft: `3px solid ${agent.status === "revoked" ? "var(--danger)" : agent.deniedToday > 0 ? "var(--warning)" : "transparent"}`,
      }}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                background:
                  agent.status === "active" ? "rgba(183,65,14,0.12)" : "rgba(185,28,28,0.08)",
                color: agent.status === "active" ? "#B7410E" : "#B91C1C",
              }}
            >
              <Icon.Cpu />
            </div>
            <div>
              <div className="font-semibold text-sm">{agent.name}</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                {agent.role}
              </div>
              <div
                className="text-xs mt-1 font-mono"
                style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-family-mono)" }}
              >
                {agent.id}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge status={agent.status} />
            {agent.status === "active" && (
              <button
                onClick={onRevoke}
                className="text-xs px-2.5 py-1 rounded border transition-all hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-600"
                style={{ border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
              >
                Revoke
              </button>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="flex gap-4 mt-4 pt-4 border-t border-[var(--border)]">
          {[
            { label: "Actions today", value: agent.actionsToday },
            { label: "Denied today", value: agent.deniedToday, danger: agent.deniedToday > 0 },
            { label: "Last seen", value: agent.lastSeen },
            {
              label: "Expires",
              value:
                agent.expiresAt.length > 20 ? agent.expiresAt.slice(0, 20) + "…" : agent.expiresAt,
              warn: agent.expiresAt.includes("Sep 19") && agent.status === "active",
            },
          ].map((s) => (
            <div key={s.label} className="flex-1">
              <div className="text-xs mb-0.5" style={{ color: "var(--muted-foreground)" }}>
                {s.label}
              </div>
              <div
                className="text-sm font-medium"
                style={s.danger ? { color: "#B91C1C" } : s.warn ? { color: "#CA8A04" } : {}}
              >
                {String(s.value)}
              </div>
            </div>
          ))}
        </div>

        {/* Credential accordion */}
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 text-xs mt-3 hover:opacity-70 transition-opacity"
          style={{ color: "var(--primary)" }}
        >
          {open ? <Icon.ChevronDown /> : <Icon.ChevronRight />}
          {open ? "Hide credential details" : "View credential details"}
        </button>
      </div>

      {open && (
        <div className="px-5 pb-5 border-t border-[var(--border)] pt-4 animate-slide-in">
          <div className="flex items-center gap-2 mb-3">
            <span
              className="text-xs font-semibold tracking-wider uppercase"
              style={{ color: "var(--muted-foreground)" }}
            >
              Cryptographic Identity
            </span>
            <span
              className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded"
              style={{ background: "rgba(21,128,61,0.1)", color: "#15803D" }}
            >
              <Icon.BadgeCheck /> Verified
            </span>
          </div>
          <CredentialFact
            icon={<Icon.Building />}
            label="Issued by — who granted this agent its identity"
            value={agent.issuedBy}
          />
          <CredentialFact
            icon={<Icon.Agents />}
            label="Belongs to — the agent this credential identifies"
            value={`${agent.name} · ${agent.org}`}
          />
          <CredentialFact
            icon={<Icon.Tag />}
            label="What it claims — this agent's declared role and scope"
            value={agent.role}
          />
          <CredentialFact
            icon={<Icon.Fingerprint />}
            label="How it's verified — cryptographic proof of authenticity"
            value="Signature valid · Issued Sep 12, 2026 · Not tampered"
            detail={`X.509 certificate · SHA-256 with RSA · Signed by Custos Root CA\nSerial: 4A:3F:...:C2:1D · Valid: ${agent.issuedAt} → ${agent.expiresAt}\nSubject: CN=${agent.id}, O=Acme Corp, OU=AI Agents`}
          />
        </div>
      )}
    </Card>
  );
}

function AgentsView({ onNav }: { onNav: (v: View) => void }) {
  return (
    <div className="p-8 space-y-5 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Agents</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            4 agents · 3 active · 1 revoked
          </p>
        </div>
        <button
          onClick={() => onNav("revocation")}
          className="text-sm px-3 py-1.5 rounded border flex items-center gap-2 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-600 transition-all"
          style={{ border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
        >
          <Icon.Revoke /> Revoke an agent
        </button>
      </div>
      <div className="space-y-4">
        {AGENTS.map((agent) => (
          <AgentCard key={agent.id} agent={agent} onRevoke={() => onNav("revocation")} />
        ))}
      </div>
    </div>
  );
}

// ─── Permissions View ─────────────────────────────────────────────────────────

function PermissionsView() {
  const [selected, setSelected] = useState(AGENTS[0].id);
  const agent = AGENTS.find((a) => a.id === selected)!;

  return (
    <div className="p-8 space-y-5 animate-fade-in">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Permissions</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
          What each agent is allowed — and not allowed — to do.
        </p>
      </div>

      {/* Agent selector */}
      <div className="flex gap-2 flex-wrap">
        {AGENTS.map((a) => (
          <button
            key={a.id}
            onClick={() => setSelected(a.id)}
            className={`text-sm px-3 py-1.5 rounded border transition-all ${selected === a.id ? "border-indigo-500/50 text-white" : "hover:border-white/10"}`}
            style={{
              background: selected === a.id ? "rgba(183,65,14,0.15)" : "var(--card)",
              border: `1px solid ${selected === a.id ? "rgba(183,65,14,0.4)" : "var(--border)"}`,
              color: selected === a.id ? "white" : "var(--muted-foreground)",
            }}
          >
            {a.name}
            {a.status === "revoked" && (
              <span className="ml-1.5 text-xs text-red-600">(revoked)</span>
            )}
          </button>
        ))}
      </div>

      {agent && (
        <div className="animate-slide-in" key={agent.id}>
          {/* Agent header */}
          <Card className="p-5 mb-4">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(183,65,14,0.12)", color: "#B7410E" }}
              >
                <Icon.Cpu />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-sm">{agent.name}</div>
                <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {agent.role} · {agent.org}
                </div>
              </div>
              <StatusBadge status={agent.status} />
            </div>
            {agent.status === "revoked" && (
              <div
                className="mt-3 p-3 rounded text-sm flex items-start gap-2"
                style={{
                  background: "rgba(185,28,28,0.08)",
                  border: "1px solid rgba(185,28,28,0.2)",
                  color: "#B91C1C",
                }}
              >
                <span className="mt-0.5">⚠</span>
                This agent's access has been revoked. All permissions below are now inactive. New
                requests are denied immediately.
              </div>
            )}
          </Card>

          {/* Two-column permissions */}
          <div className="grid grid-cols-2 gap-4">
            {/* Allowed */}
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <div
                  className="w-5 h-5 rounded flex items-center justify-center"
                  style={{ background: "rgba(21,128,61,0.15)", color: "#15803D" }}
                >
                  <Icon.Check />
                </div>
                <div className="text-sm font-semibold">Allowed</div>
                <span className="text-xs ml-auto" style={{ color: "var(--muted-foreground)" }}>
                  {agent.scope.length} permissions
                </span>
              </div>
              <div className="space-y-3">
                {agent.scope.map((item, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div
                      className="mt-0.5 w-4 h-4 rounded-sm flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(21,128,61,0.1)", color: "#15803D" }}
                    >
                      <Icon.Check />
                    </div>
                    <div className="text-sm">{item}</div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Denied */}
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <div
                  className="w-5 h-5 rounded flex items-center justify-center"
                  style={{ background: "rgba(185,28,28,0.12)", color: "#B91C1C" }}
                >
                  <Icon.X />
                </div>
                <div className="text-sm font-semibold">Not Permitted</div>
                <span className="text-xs ml-auto" style={{ color: "var(--muted-foreground)" }}>
                  {agent.denied.length} restrictions
                </span>
              </div>
              <div className="space-y-3">
                {agent.denied.map((item, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div
                      className="mt-0.5 w-4 h-4 rounded-sm flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(185,28,28,0.08)", color: "#B91C1C" }}
                    >
                      <Icon.X />
                    </div>
                    <div className="text-sm">{item}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Credential summary */}
          <Card className="p-5 mt-4">
            <div className="text-xs font-medium mb-3" style={{ color: "var(--muted-foreground)" }}>
              Credential scope
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-xs mb-0.5" style={{ color: "var(--muted-foreground)" }}>
                  Issued
                </div>
                <div>{agent.issuedAt}</div>
              </div>
              <div>
                <div className="text-xs mb-0.5" style={{ color: "var(--muted-foreground)" }}>
                  Expires / revoked
                </div>
                <div
                  className={
                    agent.status === "revoked"
                      ? "text-red-600"
                      : agent.expiresAt.includes("Sep 19")
                        ? "text-amber-600"
                        : ""
                  }
                >
                  {agent.expiresAt}
                </div>
              </div>
              <div>
                <div className="text-xs mb-0.5" style={{ color: "var(--muted-foreground)" }}>
                  Issued by
                </div>
                <div>{agent.issuedBy}</div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── Audit Log View ───────────────────────────────────────────────────────────

function AuditLogView() {
  const [filter, setFilter] = useState<"all" | "allowed" | "denied">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [liveEntries, setLiveEntries] = useState(AUDIT_LOG);

  // Simulate live entries arriving
  useEffect(() => {
    const extras: AuditEntry[] = [
      {
        id: "evt_live_1",
        agentId: "agt_9kX2mP",
        agentName: "DataSync Agent",
        tool: "Database",
        action: "SELECT COUNT(*) FROM users WHERE created_at > 2026-09-18",
        outcome: "allowed",
        reason: "Within read-only scope for production database",
        timestamp: "09:41:" + String(Math.floor(Math.random() * 60)).padStart(2, "0"),
        techDetail: "sig:sha256:z9a1...b33c · policy:db-readonly-v2 · ttl:3600s",
      },
      {
        id: "evt_live_2",
        agentId: "agt_3nR7qL",
        agentName: "Support Assistant",
        tool: "Zendesk",
        action: "Reply to ticket #TK-18842 with resolution",
        outcome: "allowed",
        reason: "Posting replies to tickets is permitted",
        timestamp: "09:41:" + String(Math.floor(Math.random() * 60)).padStart(2, "0"),
        techDetail: "sig:sha256:y8z2...c44d · policy:support-read-v1 · ttl:1800s",
      },
    ];
    let i = 0;
    const t = setInterval(() => {
      if (i < extras.length) {
        setLiveEntries((prev) => [{ ...extras[i], id: extras[i].id + Date.now() }, ...prev]);
        i++;
      }
    }, 6000);
    return () => clearInterval(t);
  }, []);

  const filtered = liveEntries.filter((e) => (filter === "all" ? true : e.outcome === filter));

  return (
    <div className="p-8 space-y-5 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">Audit Log</h1>
            <span
              className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded"
              style={{ background: "rgba(21,128,61,0.1)", color: "#15803D" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 live-dot" />
              Live
            </span>
          </div>
          <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            Every action, signed and tamper-evident. Sep 19, 2026.
          </p>
        </div>
        {/* Filter */}
        <div
          className="flex rounded overflow-hidden border"
          style={{ border: "1px solid var(--border)" }}
        >
          {(["all", "allowed", "denied"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1.5 text-xs capitalize transition-all"
              style={{
                background: filter === f ? "var(--primary)" : "var(--card)",
                color: filter === f ? "white" : "var(--muted-foreground)",
                borderRight: f !== "denied" ? "1px solid var(--border)" : undefined,
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <Card>
        {/* Table header */}
        <div
          className="grid px-5 py-2.5 border-b border-[var(--border)]"
          style={{ gridTemplateColumns: "70px 160px 120px 1fr 100px 24px" }}
        >
          {["Time", "Agent", "Tool", "Action", "Outcome", ""].map((h) => (
            <div
              key={h}
              className="text-xs font-medium uppercase tracking-wider"
              style={{ color: "var(--muted-foreground)" }}
            >
              {h}
            </div>
          ))}
        </div>

        {/* Entries */}
        <div className="divide-y divide-[var(--border)]">
          {filtered.map((entry, i) => (
            <div key={entry.id}>
              <div
                className="grid px-5 py-3 items-center hover:bg-white/[0.02] cursor-pointer transition-colors animate-slide-in"
                style={{
                  gridTemplateColumns: "70px 160px 120px 1fr 100px 24px",
                  animationDelay: `${Math.min(i, 5) * 0.04}s`,
                }}
                onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
              >
                <div
                  className="text-xs"
                  style={{
                    fontFamily: "var(--font-family-mono)",
                    color: "var(--muted-foreground)",
                  }}
                >
                  {entry.timestamp}
                </div>
                <div className="text-xs font-medium" style={{ color: "#B7410E" }}>
                  {entry.agentName}
                </div>
                <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {entry.tool}
                </div>
                <div className="text-xs pr-4 truncate" style={{ color: "var(--foreground)" }}>
                  {entry.action}
                </div>
                <OutcomeBadge outcome={entry.outcome} />
                <div style={{ color: "var(--muted-foreground)" }}>
                  {expandedId === entry.id ? <Icon.ChevronDown /> : <Icon.ChevronRight />}
                </div>
              </div>

              {/* Expanded detail */}
              {expandedId === entry.id && (
                <div
                  className="px-5 pb-4 animate-slide-in"
                  style={{ borderTop: "1px solid var(--border)" }}
                >
                  <div className="pt-3 grid grid-cols-2 gap-4">
                    <div>
                      <div
                        className="text-xs mb-1.5 font-medium"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        Decision rationale
                      </div>
                      <div
                        className="text-sm p-3 rounded"
                        style={{ background: "var(--secondary)" }}
                      >
                        {entry.reason}
                      </div>
                    </div>
                    <div>
                      <div
                        className="text-xs mb-1.5 font-medium"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        Technical proof
                      </div>
                      <div
                        className="text-xs p-3 rounded"
                        style={{
                          background: "var(--secondary)",
                          fontFamily: "var(--font-family-mono)",
                          color: "var(--muted-foreground)",
                          lineHeight: 1.6,
                        }}
                      >
                        {entry.techDetail}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
            No entries for this filter.
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Revocation View ──────────────────────────────────────────────────────────

type RevokePhase = "select-agent" | "select-scope" | "confirm" | "revoking" | "done";
type RevokeMode = "all" | "specific";

function RevocationView() {
  const [selected, setSelected] = useState<Agent | null>(null);
  const [mode, setMode] = useState<RevokeMode>("all");
  const [checkedPerms, setCheckedPerms] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<RevokePhase>("select-agent");
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeAgents = AGENTS.filter((a) => a.status === "active");

  const togglePerm = (perm: string) => {
    setCheckedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) next.delete(perm);
      else next.add(perm);
      return next;
    });
  };

  const selectAll = () => {
    if (selected) setCheckedPerms(new Set(selected.scope));
  };

  const clearAll = () => setCheckedPerms(new Set());

  const revokedPerms = mode === "all" ? (selected?.scope ?? []) : Array.from(checkedPerms);
  const keptPerms =
    mode === "specific" && selected ? selected.scope.filter((p) => !checkedPerms.has(p)) : [];

  const startRevoke = () => {
    setPhase("revoking");
    setProgress(0);
    setLogs([]);
    const isPartial = mode === "specific";
    const steps = isPartial
      ? [
          `Updating policy for ${selected?.name}…`,
          `Removing ${revokedPerms.length} permission${revokedPerms.length !== 1 ? "s" : ""} from credential scope…`,
          "Reissuing scoped credential with remaining permissions…",
          "Broadcasting updated policy to enforcement points…",
          "Flushing stale tokens from edge nodes…",
          "Updating audit log with scope change event…",
          `Done — ${keptPerms.length} permission${keptPerms.length !== 1 ? "s" : ""} remain active.`,
        ]
      : [
          "Invalidating credential in Custos Root CA…",
          "Broadcasting revocation to all policy enforcement points…",
          "Flushing cached tokens from edge nodes (0/3)…",
          "Flushing cached tokens from edge nodes (3/3)…",
          "Updating audit log with revocation event…",
          "Notifying workspace administrators…",
          "Revocation complete. All access cut off.",
        ];
    let step = 0;
    intervalRef.current = setInterval(() => {
      if (step < steps.length) {
        setLogs((prev) => [...prev, steps[step]]);
        setProgress(Math.round(((step + 1) / steps.length) * 100));
        step++;
      } else {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setTimeout(() => setPhase("done"), 300);
      }
    }, 400);
  };

  const reset = () => {
    setSelected(null);
    setMode("all");
    setCheckedPerms(new Set());
    setPhase("select-agent");
    setProgress(0);
    setLogs([]);
  };

  const pickAgent = (agent: Agent) => {
    setSelected(agent);
    setCheckedPerms(new Set());
    setPhase("select-scope");
  };

  return (
    <div className="p-8 animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Revoke Access</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
          Cut off an agent's access — all at once, or only the permissions you choose.
        </p>
      </div>

      {/* Step breadcrumb */}
      <div
        className="flex items-center gap-2 mb-6 text-xs"
        style={{ color: "var(--muted-foreground)" }}
      >
        {(["select-agent", "select-scope", "confirm"] as RevokePhase[]).map((p, i) => {
          const labels: Record<string, string> = {
            "select-agent": "1. Choose agent",
            "select-scope": "2. Choose permissions",
            confirm: "3. Confirm",
          };
          const phases: RevokePhase[] = [
            "select-agent",
            "select-scope",
            "confirm",
            "revoking",
            "done",
          ];
          const currentIdx = phases.indexOf(phase);
          const stepIdx = phases.indexOf(p);
          const isActive = phase === p;
          const isDone = currentIdx > stepIdx;
          return (
            <span key={p} className="flex items-center gap-2">
              {i > 0 && <span>›</span>}
              <span
                style={{
                  color: isActive
                    ? "var(--foreground)"
                    : isDone
                      ? "#15803D"
                      : "var(--muted-foreground)",
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {isDone ? "✓ " : ""}
                {labels[p]}
              </span>
            </span>
          );
        })}
      </div>

      <div className="max-w-2xl space-y-4">
        {/* Step 1: Select agent */}
        {phase === "select-agent" && (
          <Card className="p-5 animate-slide-in">
            <div className="text-sm font-medium mb-3">Select an agent</div>
            <div className="space-y-2">
              {activeAgents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => pickAgent(agent)}
                  className="w-full text-left flex items-center justify-between p-3.5 rounded border transition-all hover:border-indigo-500/30 hover:bg-indigo-500/5"
                  style={{ border: "1px solid var(--border)", background: "var(--secondary)" }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded flex items-center justify-center"
                      style={{ background: "rgba(183,65,14,0.1)", color: "#B7410E" }}
                    >
                      <Icon.Cpu />
                    </div>
                    <div>
                      <div className="text-sm font-medium">{agent.name}</div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                        {agent.role}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                      {agent.scope.length} permissions
                    </span>
                    <StatusBadge status={agent.status} />
                    <Icon.ChevronRight />
                  </div>
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* Step 2: Select scope */}
        {phase === "select-scope" && selected && (
          <div className="space-y-4 animate-slide-in">
            {/* Agent recap */}
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded flex items-center justify-center"
                  style={{ background: "rgba(183,65,14,0.1)", color: "#B7410E" }}
                >
                  <Icon.Cpu />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold">{selected.name}</div>
                  <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    {selected.role}
                  </div>
                </div>
                <button
                  onClick={reset}
                  className="text-xs hover:opacity-70 transition-opacity"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Change agent
                </button>
              </div>
            </Card>

            {/* Mode toggle */}
            <Card className="p-5">
              <div className="text-sm font-medium mb-4">What do you want to revoke?</div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setMode("all")}
                  className="p-4 rounded-lg border text-left transition-all"
                  style={{
                    border: `1px solid ${mode === "all" ? "rgba(185,28,28,0.5)" : "var(--border)"}`,
                    background: mode === "all" ? "rgba(185,28,28,0.07)" : "var(--secondary)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                      style={{
                        borderColor: mode === "all" ? "#B91C1C" : "var(--muted-foreground)",
                      }}
                    >
                      {mode === "all" && <div className="w-2 h-2 rounded-full bg-red-400" />}
                    </div>
                    <div
                      className="text-sm font-semibold"
                      style={{ color: mode === "all" ? "#B91C1C" : "var(--foreground)" }}
                    >
                      Revoke all access
                    </div>
                  </div>
                  <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    Cut off every permission at once. The agent will be fully revoked and denied
                    everywhere immediately.
                  </div>
                </button>

                <button
                  onClick={() => setMode("specific")}
                  className="p-4 rounded-lg border text-left transition-all"
                  style={{
                    border: `1px solid ${mode === "specific" ? "rgba(183,65,14,0.5)" : "var(--border)"}`,
                    background: mode === "specific" ? "rgba(183,65,14,0.07)" : "var(--secondary)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                      style={{
                        borderColor:
                          mode === "specific" ? "var(--primary)" : "var(--muted-foreground)",
                      }}
                    >
                      {mode === "specific" && (
                        <div className="w-2 h-2 rounded-full bg-indigo-400" />
                      )}
                    </div>
                    <div
                      className="text-sm font-semibold"
                      style={{ color: mode === "specific" ? "#B7410E" : "var(--foreground)" }}
                    >
                      Revoke specific permissions
                    </div>
                  </div>
                  <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    Choose which permissions to remove. The agent stays active with its remaining
                    access intact.
                  </div>
                </button>
              </div>
            </Card>

            {/* Permission checklist — only for 'specific' */}
            {mode === "specific" && (
              <Card className="p-5 animate-slide-in">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-sm font-medium">Select permissions to revoke</div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                      Checked = will be revoked · Unchecked = stays active
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={selectAll}
                      className="text-xs hover:opacity-70 transition-opacity"
                      style={{ color: "var(--primary)" }}
                    >
                      Select all
                    </button>
                    <span style={{ color: "var(--border)" }}>·</span>
                    <button
                      onClick={clearAll}
                      className="text-xs hover:opacity-70 transition-opacity"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {selected.scope.map((perm, i) => {
                    const checked = checkedPerms.has(perm);
                    return (
                      <button
                        key={i}
                        onClick={() => togglePerm(perm)}
                        className="w-full flex items-start gap-3 p-3 rounded border text-left transition-all"
                        style={{
                          border: `1px solid ${checked ? "rgba(185,28,28,0.3)" : "var(--border)"}`,
                          background: checked ? "rgba(185,28,28,0.05)" : "var(--secondary)",
                        }}
                      >
                        {/* Checkbox */}
                        <div
                          className="mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all"
                          style={{
                            border: `1.5px solid ${checked ? "#B91C1C" : "var(--muted-foreground)"}`,
                            background: checked ? "#B91C1C" : "transparent",
                          }}
                        >
                          {checked && <Icon.Check />}
                        </div>
                        <div className="flex-1">
                          <div
                            className="text-sm"
                            style={{
                              color: checked ? "#B91C1C" : "var(--foreground)",
                              textDecoration: checked ? "line-through" : "none",
                            }}
                          >
                            {perm}
                          </div>
                          {checked && (
                            <div
                              className="text-xs mt-0.5"
                              style={{ color: "#B91C1C", opacity: 0.7 }}
                            >
                              Will be revoked
                            </div>
                          )}
                        </div>
                        {/* Status pill on the right */}
                        <div className="flex-shrink-0 mt-0.5">
                          {checked ? (
                            <span
                              className="text-xs px-1.5 py-0.5 rounded"
                              style={{ background: "rgba(185,28,28,0.1)", color: "#B91C1C" }}
                            >
                              Revoke
                            </span>
                          ) : (
                            <span
                              className="text-xs px-1.5 py-0.5 rounded"
                              style={{ background: "rgba(21,128,61,0.08)", color: "#15803D" }}
                            >
                              Keep
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Summary footer */}
                {(checkedPerms.size > 0 || selected.scope.length > 0) && (
                  <div className="mt-4 pt-4 border-t border-[var(--border)] flex items-center gap-4 text-xs">
                    <span style={{ color: "#B91C1C" }}>{checkedPerms.size} to revoke</span>
                    <span style={{ color: "var(--border)" }}>·</span>
                    <span style={{ color: "#15803D" }}>
                      {selected.scope.length - checkedPerms.size} to keep
                    </span>
                  </div>
                )}
              </Card>
            )}

            {/* Continue button */}
            <div className="flex gap-2">
              <button
                onClick={() => setPhase("confirm")}
                disabled={mode === "specific" && checkedPerms.size === 0}
                className="flex-1 py-2 rounded text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ background: mode === "all" ? "#B91C1C" : "var(--primary)" }}
              >
                {mode === "all"
                  ? "Review full revocation →"
                  : checkedPerms.size === 0
                    ? "Select at least one permission"
                    : `Review revocation of ${checkedPerms.size} permission${checkedPerms.size !== 1 ? "s" : ""} →`}
              </button>
              <button
                onClick={reset}
                className="px-4 py-2 rounded text-sm border transition-all hover:bg-white/5"
                style={{ border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Confirm */}
        {phase === "confirm" && selected && (
          <Card className="p-5 animate-slide-in">
            <div className="text-sm font-semibold mb-4">Confirm revocation</div>

            {/* Agent */}
            <div
              className="p-3 rounded-lg mb-4 flex items-center gap-3"
              style={{ background: "var(--secondary)", border: "1px solid var(--border)" }}
            >
              <div
                className="w-7 h-7 rounded flex items-center justify-center"
                style={{ background: "rgba(183,65,14,0.1)", color: "#B7410E" }}
              >
                <Icon.Cpu />
              </div>
              <div>
                <div className="text-sm font-semibold">{selected.name}</div>
                <div
                  className="text-xs"
                  style={{
                    color: "var(--muted-foreground)",
                    fontFamily: "var(--font-family-mono)",
                  }}
                >
                  {selected.id}
                </div>
              </div>
            </div>

            {/* What gets revoked */}
            <div className="mb-4">
              <div
                className="text-xs font-medium mb-2"
                style={{ color: "var(--muted-foreground)" }}
              >
                {mode === "all"
                  ? "All permissions will be revoked:"
                  : `${revokedPerms.length} permission${revokedPerms.length !== 1 ? "s" : ""} will be revoked:`}
              </div>
              <div className="space-y-1.5">
                {revokedPerms.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-sm p-2 rounded"
                    style={{
                      background: "rgba(185,28,28,0.06)",
                      border: "1px solid rgba(185,28,28,0.15)",
                    }}
                  >
                    <Icon.X />
                    <span style={{ color: "#B91C1C" }}>{p}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* What stays */}
            {mode === "specific" && keptPerms.length > 0 && (
              <div className="mb-4">
                <div
                  className="text-xs font-medium mb-2"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {keptPerms.length} permission{keptPerms.length !== 1 ? "s" : ""} will stay active:
                </div>
                <div className="space-y-1.5">
                  {keptPerms.map((p, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-sm p-2 rounded"
                      style={{
                        background: "rgba(21,128,61,0.05)",
                        border: "1px solid rgba(21,128,61,0.15)",
                      }}
                    >
                      <Icon.Check />
                      <span style={{ color: "#15803D" }}>{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Warning */}
            <div
              className="p-3 rounded text-sm mb-4"
              style={{
                background: "rgba(185,28,28,0.07)",
                border: "1px solid rgba(185,28,28,0.2)",
                color: "#B91C1C",
              }}
            >
              {mode === "all"
                ? "⚠ This agent will lose all access immediately. This cannot be undone without re-issuing a new credential."
                : `⚠ The selected permissions will be revoked immediately. The agent will continue to operate with its ${keptPerms.length} remaining permission${keptPerms.length !== 1 ? "s" : ""}.`}
            </div>

            <div className="flex gap-2">
              <button
                onClick={startRevoke}
                className="flex-1 py-2 rounded text-sm font-semibold text-white transition-all hover:opacity-90"
                style={{ background: "#B91C1C" }}
              >
                {mode === "all"
                  ? "Revoke all access now"
                  : `Revoke ${revokedPerms.length} permission${revokedPerms.length !== 1 ? "s" : ""} now`}
              </button>
              <button
                onClick={() => setPhase("select-scope")}
                className="px-4 py-2 rounded text-sm border transition-all hover:bg-white/5"
                style={{ border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
              >
                Back
              </button>
            </div>
          </Card>
        )}

        {/* Step 4+5: Revoking / Done */}
        {(phase === "revoking" || phase === "done") && selected && (
          <div className="space-y-4 animate-slide-in">
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold">
                  {phase === "done"
                    ? mode === "all"
                      ? "All access revoked"
                      : `${revokedPerms.length} permission${revokedPerms.length !== 1 ? "s" : ""} revoked`
                    : "Applying revocation…"}
                </div>
                {phase === "done" ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs font-medium bg-red-500/10 text-red-600 border-red-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                    {mode === "all" ? "Fully Revoked" : "Partially Revoked"}
                  </span>
                ) : (
                  <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    {progress}%
                  </span>
                )}
              </div>

              <div
                className="h-1.5 rounded-full mb-4 overflow-hidden"
                style={{ background: "var(--secondary)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${progress}%`,
                    background: phase === "done" ? "#B91C1C" : "var(--primary)",
                  }}
                />
              </div>

              <div className="space-y-1.5 min-h-[100px]">
                {logs.map((log, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs animate-slide-in">
                    <span
                      style={{
                        color:
                          i === logs.length - 1 && phase === "done"
                            ? "#15803D"
                            : "var(--muted-foreground)",
                      }}
                    >
                      {i === logs.length - 1 && phase === "done" ? "✓" : "›"}
                    </span>
                    <span
                      style={{
                        color:
                          i === logs.length - 1 && phase === "done"
                            ? "#15803D"
                            : "var(--foreground)",
                      }}
                    >
                      {log}
                    </span>
                  </div>
                ))}
              </div>

              {phase === "done" && (
                <div className="mt-5 pt-4 border-t border-[var(--border)] animate-slide-in">
                  {/* Summary of what happened */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div
                      className="p-3 rounded"
                      style={{
                        background: "rgba(185,28,28,0.06)",
                        border: "1px solid rgba(185,28,28,0.15)",
                      }}
                    >
                      <div className="text-xs mb-1" style={{ color: "var(--muted-foreground)" }}>
                        Revoked
                      </div>
                      <div className="text-sm font-semibold text-red-600">
                        {revokedPerms.length} permission{revokedPerms.length !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <div
                      className="p-3 rounded"
                      style={{
                        background: "rgba(21,128,61,0.05)",
                        border: "1px solid rgba(21,128,61,0.12)",
                      }}
                    >
                      <div className="text-xs mb-1" style={{ color: "var(--muted-foreground)" }}>
                        Still active
                      </div>
                      <div className="text-sm font-semibold text-emerald-600">
                        {keptPerms.length} permission{keptPerms.length !== 1 ? "s" : ""}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs mb-4" style={{ color: "var(--muted-foreground)" }}>
                    Signed by Custos Root CA · Propagated to all endpoints ·{" "}
                    {new Date().toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}{" "}
                    UTC
                  </div>
                  <button
                    onClick={reset}
                    className="text-sm w-full py-2 rounded border hover:bg-white/5 transition-all"
                    style={{ border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
                  >
                    Done
                  </button>
                </div>
              )}
            </Card>

            {phase === "done" && (
              <Card className="p-5 animate-slide-in revoke-flash">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  <div className="text-xs font-medium">Post-revocation denials (live)</div>
                </div>
                <div className="space-y-2">
                  {revokedPerms.slice(0, 2).map((perm, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-xs py-2 border-b border-[var(--border)] last:border-0"
                    >
                      <div>
                        <span style={{ color: "#B7410E" }}>{selected.name}</span>
                        <span className="mx-1" style={{ color: "var(--muted-foreground)" }}>
                          ·
                        </span>
                        <span style={{ color: "var(--muted-foreground)" }}>
                          {perm.slice(0, 40)}
                          {perm.length > 40 ? "…" : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span style={{ color: "var(--muted-foreground)" }}>Just now</span>
                        <OutcomeBadge outcome="denied" />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── App Shell ────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<View>("dashboard");

  const views: Record<View, React.ReactNode> = {
    dashboard: <Dashboard onNav={setView} />,
    agents: <AgentsView onNav={setView} />,
    permissions: <PermissionsView />,
    audit: <AuditLogView />,
    revocation: <RevocationView />,
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "var(--background)",
      }}
    >
      <Sidebar active={view} onNav={setView} />
      <main style={{ flex: 1, overflow: "auto" }}>{views[view]}</main>
    </div>
  );
}
