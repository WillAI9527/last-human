"use client";

import { Share2 } from "lucide-react";

interface AnalysisFooterProps {
  onShare?: () => void;
  onReturn?: () => void;
}

export function AnalysisFooter({ onShare, onReturn }: AnalysisFooterProps) {
  return (
    <footer className="pt-2 pb-6 flex flex-col gap-4">
      <button
        onClick={onShare}
        className="w-full bg-[#1A1714] text-[#F2EDE4] border border-[#A9B2BC] font-bold py-4 rounded-lg hover:bg-[#241f1b] hover:translate-y-[-1px] transition-all flex items-center justify-center gap-2 tracking-wider"
      >
        <Share2 className="w-4 h-4" />
        分享海报
      </button>
      <button
        onClick={onReturn}
        className="w-full bg-[#1A1714] text-[#F2EDE4] font-bold py-4 rounded-lg hover:bg-[#241f1b] transition border border-[#A9B2BC] tracking-wider"
      >
        返回大厅
      </button>
    </footer>
  );
}
