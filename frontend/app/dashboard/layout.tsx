"use client";

// ─────────────────────────────────────────────────────────────
// frontend/app/(dashboard)/layout.tsx
// Layout compartilhado: sidebar + topbar
// ─────────────────────────────────────────────────────────────

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

// ── Ícones ────────────────────────────────────────────────────

const Icon = ({ d }: { d: string }) => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

// ── Nav items ─────────────────────────────────────────────────

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" },
  { href: "/videos",    label: "Meus vídeos", icon: "M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z", badge: "23" },
  { href: "/projects",  label: "Projetos",    icon: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" },
];

const createItems = [
  { href: "/studio",    label: "Studio — YouTube", icon: "M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { href: "/tiktok",    label: "TikTok Shop",      icon: "M9 12a4 4 0 100 8 4 4 0 000-8zM15 2v10M15 2a4 4 0 004 4" },
  { href: "/templates", label: "Templates",        icon: "M3 3h18v4H3zM3 9h18v4H3zM3 15h18v4H3z" },
];

const accountItems = [
  { href: "/settings/credits", label: "Créditos e plano", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { href: "/settings",         label: "Configurações",   icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
];

// ── Sidebar ───────────────────────────────────────────────────

function SidebarContent() {
  const pathname = usePathname();

  function NavItem({ href, label, icon, badge }: { href: string; label: string; icon: string; badge?: string }) {
    const isActive = pathname === href || pathname.startsWith(href + "/");
    return (
      <Link
        href={href}
        className={`flex items-center gap-2.5 px-2.5 py-2 rounded-[6px] text-[13px] transition-all duration-100
          ${isActive ? "bg-[rgba(124,109,245,0.12)] text-[#a99cf8]" : "text-[#9090a8] hover:bg-[#1a1a22] hover:text-[#f0f0f5]"}`}
      >
        <span className={isActive ? "text-[#a99cf8]" : "text-[#55556a]"}>
          <Icon d={icon} />
        </span>
        <span className="flex-1">{label}</span>
        {badge && (
          <span className="text-[10px] font-semibold bg-[rgba(62,207,142,0.10)] text-[#3ecf8e] border border-[rgba(62,207,142,0.22)] rounded-full px-2 py-0.5">
            {badge}
          </span>
        )}
      </Link>
    );
  }

  return (
    <aside className="fixed top-0 left-0 bottom-0 w-[220px] flex flex-col z-10" style={{ background: "#131318", borderRight: "1px solid rgba(255,255,255,0.07)" }}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="w-8 h-8 rounded-[9px] flex items-center justify-center flex-shrink-0" style={{ background: "#7c6df5" }}>
          <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24">
            <path d="M5 3l14 9-14 9V3z" />
          </svg>
        </div>
        <span className="text-[17px] font-bold text-[#f0f0f5]" style={{ letterSpacing: "-0.02em" }}>
          ClipForge
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2.5 py-4 flex flex-col gap-0.5 overflow-y-auto">
        <p className="text-[10px] font-semibold uppercase text-[#55556a] px-2 pb-1.5 pt-1" style={{ letterSpacing: "0.07em" }}>Menu</p>
        {navItems.map((item) => <NavItem key={item.href} {...item} />)}

        <p className="text-[10px] font-semibold uppercase text-[#55556a] px-2 pb-1.5 pt-4" style={{ letterSpacing: "0.07em" }}>Criar</p>
        {createItems.map((item) => <NavItem key={item.href} {...item} />)}

        <p className="text-[10px] font-semibold uppercase text-[#55556a] px-2 pb-1.5 pt-4" style={{ letterSpacing: "0.07em" }}>Conta</p>
        {accountItems.map((item) => <NavItem key={item.href} {...item} />)}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="rounded-[10px] p-3 mb-2.5" style={{ background: "#1a1a22", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-[10px] text-[#55556a]">Créditos restantes</p>
              <p className="text-[15px] font-semibold text-[#f0f0f5]">
                840 <span className="text-[12px] font-normal text-[#55556a]">/ 2.000</span>
              </p>
            </div>
          </div>
          <div className="h-[3px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.12)" }}>
            <div className="h-full w-[42%] rounded-full" style={{ background: "#7c6df5" }} />
          </div>
        </div>

        <button className="w-full flex items-center justify-center gap-1.5 py-2 rounded-[6px] text-[#a99cf8] text-[12px] font-medium mb-3" style={{ border: "1px solid rgba(124,109,245,0.25)", background: "rgba(124,109,245,0.12)" }}>
          Fazer upgrade para Creator
        </button>

        <div className="flex items-center gap-2.5 px-1">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold text-[#a99cf8] flex-shrink-0" style={{ background: "rgba(124,109,245,0.12)", border: "1px solid rgba(124,109,245,0.25)" }}>
            DL
          </div>
          <div>
            <p className="text-[12px] font-medium text-[#f0f0f5]">Dirlei</p>
            <p className="text-[10px] text-[#55556a]">Plano Pro</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ── Topbar ────────────────────────────────────────────────────

function Topbar() {
  return (
    <header className="h-14 flex items-center px-7 gap-4 sticky top-0 z-5" style={{ background: "#131318", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
      <p className="flex-1 text-[13px] text-[#9090a8]">
        Bom dia, <strong className="text-[#f0f0f5] font-medium">Dirlei</strong> — o que vamos criar hoje?
      </p>
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] cursor-text" style={{ background: "#1a1a22", border: "1px solid rgba(255,255,255,0.07)" }}>
        <svg className="w-3.5 h-3.5 text-[#55556a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
        </svg>
        <span className="text-[12px] text-[#55556a]">Buscar vídeos e projetos...</span>
      </div>
      <button className="relative w-9 h-9 rounded-[6px] flex items-center justify-center text-[#9090a8]" style={{ border: "1px solid rgba(255,255,255,0.07)", background: "#1a1a22" }}>
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full" style={{ background: "#7c6df5", border: "1.5px solid #131318" }} />
      </button>
    </header>
  );
}

// ── Layout ────────────────────────────────────────────────────

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen" style={{ background: "#0c0c0f" }}>
      <Suspense fallback={null}>
        <SidebarContent />
      </Suspense>
      <div className="ml-[220px] flex-1 flex flex-col">
        <Topbar />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
