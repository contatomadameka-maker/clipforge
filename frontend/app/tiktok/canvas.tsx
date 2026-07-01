"use client";

// frontend/app/tiktok/page.tsx
// Wrapper com dynamic import para evitar SSR do React Flow

import dynamic from "next/dynamic";

const TikTokCanvas = dynamic(
  () => import("./canvas"),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center" style={{ background: "#07070d" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#7c6df5]/30 border-t-[#7c6df5] rounded-full animate-spin" />
          <p className="text-sm text-[#55556a]">Carregando canvas...</p>
        </div>
      </div>
    ),
  }
);

export default function TikTokPage() {
  return <TikTokCanvas />;
}
