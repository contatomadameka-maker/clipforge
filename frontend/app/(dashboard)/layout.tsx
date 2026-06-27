"use client";

// ─────────────────────────────────────────────────────────────
// frontend/app/(dashboard)/layout.tsx
// Layout compartilhado: sidebar + topbar para todas as páginas
// ─────────────────────────────────────────────────────────────

import Link from "next/link";
import { usePathname } from "next/navigation";

// ── Ícones SVG inline (sem dependência externa) ───────────────

function IconGrid() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
function IconVideo() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
    </svg>
  );
}
function IconFolder() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  );
}
function IconPlay() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M10 8l6 4-6 4V8z" />
    </svg>
  );
}
function IconTikTok() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 12a4 4 0 100 8 4 4 0 000-8z" /><path d="M15 2v10M15 2a4 4 0 004 4" />
    </svg>
  );
}
function IconTemplate() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
    </svg>
  );
}
function IconSettings() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}
function IconBell() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
    </svg>
  );
}
function IconTrend() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

// ── Nav items ─────────────────────────────────────────────────

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: <IconGrid /> },
  { href: "/videos", label: "Meus vídeos", icon: <IconVideo />, badge: "23" },
  { href: "/projects", label: "Projetos", icon: <IconFolder /> },
];

const createItems = [
  { href: "/studio", label: "Studio — YouTube", icon: <IconPlay /> },
  { href: "/tiktok", label: "TikTok Shop", icon: <IconTikTok /> },
  { href: "/templates", label: "Templates", icon: <IconTemplate /> },
];

const accountItems = [
  { href: "/settings/credits", label: "Créditos e plano", icon: <IconSettings /> },
  { href: "/settings", label: "Configurações", icon: <IconSettings /> },
];

// ── Sidebar ───────────────────────────────────────────────────

function Sidebar() {
  const pathname = usePathname();

  function NavItem({
    href,
    label,
    icon,
    badge,
  }: {
    href: string;
    label: string;
    icon: React.ReactNode;
    badge?: string;
  }) {
    const isActive = pathname === href || pathname.startsWith(href + "/");
    return (
      <Link
        href={href}
        className={`flex items-center gap-2.5 px-2.5 py-2 rounded-[6px] text-[13px] transition-all duration-100
          ${isActive
            ? "bg-purple-dim text-purple-light"
            : "text-text-2 hover:bg-surface-2 hover:text-text"
          }`}
      >
        <span className={isActive ? "text-purple-light" : "text-text-3"}>
          {icon}
        </span>
        <span className="flex-1">{label}</span>
        {badge && (
          <span className="text-[10px] font-semibold bg-green-dim text-green border border-green-border rounded-full px-2 py-0.5">
            {badge}
          </span>
        )}
      </Link>
    );
  }

  return (
    <aside className="fixed top-0 left-0 bottom-0 w-[220px] bg-surface border-r border-border flex flex-col z-10">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
        <div className="w-8 h-8 rounded-[9px] bg-purple flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24">
            <path d="M5 3l14 9-14 9V3z" />
          </svg>
        </div>
        <span className="font-tight text-[17px] font-bold text-text tracking-tight">
          ClipForge
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2.5 py-4 flex flex-col gap-0.5 overflow-y-auto">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-text-3 px-2 pb-1.5 pt-1">
          Menu
        </p>
        {navItems.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}

        <p className="text-[10px] font-semibold uppercase tracking-widest text-text-3 px-2 pb-1.5 pt-4">
          Criar
        </p>
        {createItems.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}

        <p className="text-[10px] font-semibold uppercase tracking-widest text-text-3 px-2 pb-1.5 pt-4">
          Conta
        </p>
        {accountItems.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-border">
        {/* Créditos */}
        <div className="bg-surface-2 border border-border rounded-[10px] p-3 mb-2.5">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-[10px] text-text-3">Créditos restantes</p>
              <p className="text-[15px] font-semibold text-text">
                840{" "}
                <span className="text-[12px] font-normal text-text-3">/ 2.000</span>
              </p>
            </div>
          </div>
          <div className="h-[3px] bg-border-strong rounded-full overflow-hidden">
            <div className="h-full w-[42%] bg-purple rounded-full" />
          </div>
        </div>

        {/* Upgrade */}
        <button className="w-full flex items-center justify-center gap-1.5 py-2 rounded-[6px] border border-purple-border bg-purple-dim text-purple-light text-[12px] font-medium hover:bg-purple/20 transition-colors mb-3">
          <IconTrend />
          Fazer upgrade para Creator
        </button>

        {/* User */}
        <div className="flex items-center gap-2.5 px-1">
          <div className="w-8 h-8 rounded-full bg-purple-dim border border-purple-border flex items-center justify-center text-[11px] font-semibold text-purple-light flex-shrink-0">
            DL
          </div>
          <div>
            <p className="text-[12px] font-medium text-text">Dirlei</p>
            <p className="text-[10px] text-text-3">Plano Pro</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ── Topbar ────────────────────────────────────────────────────

function Topbar() {
  return (
    <header className="h-14 bg-surface border-b border-border flex items-center px-7 gap-4 sticky top-0 z-5">
      <p className="flex-1 text-[13px] text-text-2">
        Bom dia, <strong className="text-text font-medium">Dirlei</strong> — o que vamos criar hoje?
      </p>
      <div className="flex items-center gap-1.5 bg-surface-2 border border-border rounded-[6px] px-3 py-1.5 cursor-text">
        <span className="text-text-3"><IconSearch /></span>
        <span className="text-[12px] text-text-3">Buscar vídeos e projetos...</span>
      </div>
      <button className="relative w-9 h-9 rounded-[6px] border border-border bg-surface-2 flex items-center justify-center text-text-2 hover:border-border-strong transition-colors">
        <IconBell />
        <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-purple border-2 border-surface" />
      </button>
    </header>
  );
}

// ── Layout ────────────────────────────────────────────────────

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar />
      <div className="ml-[220px] flex-1 flex flex-col">
        <Topbar />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
