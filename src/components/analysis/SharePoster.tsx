"use client";

import { forwardRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Crown, Scroll } from "lucide-react";
import type { GameAnalysisData } from "@/types/analysis";
import { ROLE_NAMES } from "./constants";
import { buildSimpleAvatarUrl } from "@/lib/avatar-config";
import { useSiteUrl } from "@/components/seo/SiteUrlProvider";
import { AwardSeal } from "./AwardSeal";

export type PosterMode = "radar" | "portrait";

interface SharePosterProps {
  data: GameAnalysisData;
  mode?: PosterMode;
  overrideTag?: string | null;
}

const SITE_URL = "LAST HUMAN";

interface RadarChartProps {
  stats: GameAnalysisData["personalStats"]["radarStats"];
  isWolf: boolean;
}

function RadarChart({ stats, isWolf }: RadarChartProps) {
  const labels = isWolf
    ? ["逻辑", "发言", "存活", "隐匿", "冲票"]
    : ["逻辑", "发言", "存活", "技能", "投票"];
  const values = [stats.logic, stats.speech, stats.survival, stats.skillOrHide, stats.voteOrTicket];

  const size = 200;
  const center = size / 2;
  const radius = 50;
  const goldColor = "#c5a059";

  const getPoint = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / 5 - Math.PI / 2;
    const r = (radius * value) / 100;
    return { x: center + Math.cos(angle) * r, y: center + Math.sin(angle) * r };
  };

  const getLabelPoint = (index: number) => {
    const angle = (Math.PI * 2 * index) / 5 - Math.PI / 2;
    const r = radius + 28;
    return { x: center + Math.cos(angle) * r, y: center + Math.sin(angle) * r };
  };

  const gridLevels = [1, 2, 3, 4, 5];
  const dataPoints = values.map((v, i) => getPoint(i, v));
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {gridLevels.map((level) => {
        const points = Array.from({ length: 5 }, (_, i) => {
          const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
          const r = (radius * level) / 5;
          return `${center + Math.cos(angle) * r},${center + Math.sin(angle) * r}`;
        }).join(" ");
        return <polygon key={level} points={points} fill="none" stroke={goldColor} strokeOpacity={0.15} strokeWidth={0.5} />;
      })}

      {Array.from({ length: 5 }, (_, i) => {
        const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        return (
          <line key={i} x1={center} y1={center} x2={center + Math.cos(angle) * radius} y2={center + Math.sin(angle) * radius} stroke={goldColor} strokeOpacity={0.15} strokeWidth={0.5} />
        );
      })}

      <defs>
        <linearGradient id="radarGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={goldColor} stopOpacity={0.5} />
          <stop offset="100%" stopColor={goldColor} stopOpacity={0.1} />
        </linearGradient>
      </defs>
      <path d={dataPath} fill="url(#radarGradient)" stroke={goldColor} strokeWidth={1.5} />

      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="#1a1614" stroke={goldColor} strokeWidth={1.5} />
      ))}

      {labels.map((label, i) => {
        const p = getLabelPoint(i);
        const anchor = i === 0 ? "middle" : i < 3 ? "start" : "end";
        const dy = i === 0 ? -4 : i === 2 || i === 3 ? 4 : 0;
        return (
          <text key={i} x={p.x} y={p.y + dy} textAnchor={anchor} dominantBaseline="middle" fill={goldColor} fontSize={11} fontWeight="500">
            {label}
          </text>
        );
      })}
    </svg>
  );
}

export const SharePoster = forwardRef<HTMLDivElement, SharePosterProps>(
  function SharePoster({ data, mode = "radar", overrideTag }, ref) {
    const siteUrl = useSiteUrl();
    const { personalStats, result, duration, playerCount } = data;
    const isVillageWin = result === "village_win";
    const isWinner =
      (isVillageWin && personalStats.alignment === "village") ||
      (!isVillageWin && personalStats.alignment === "wolf");
    const isWolf = personalStats.alignment === "wolf";
    const primaryTag = overrideTag || personalStats.tags[0] || "待评估";
    const avatarUrl = buildSimpleAvatarUrl(personalStats.avatar);
    const { radarStats } = personalStats;
    const formatDuration = (seconds: number): string => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    return (
      <div
        ref={ref}
        className="w-[360px] h-[640px] bg-[#0f0e0d] text-white relative overflow-hidden flex flex-col"
        style={{ fontFamily: "'Noto Serif SC', serif" }}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-2 flex items-center justify-between border-b border-[#c5a059]/20">
          <div className="flex items-center space-x-1.5">
            <Scroll className="w-4 h-4 text-[#c5a059]" />
            <span className="text-[#c5a059] font-bold text-sm tracking-wider">LAST HUMAN</span>
          </div>
          <div
            className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${
              isWinner
                ? "bg-[#c5a059]/20 text-[#c5a059] border border-[#c5a059]/40"
                : "bg-white/10 text-white/80 border border-white/20"
            }`}
          >
            <Crown className="w-3 h-3" />
            {isVillageWin ? "好人获胜" : "狼人获胜"}
          </div>
        </div>

        {/* Player Info Row */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-12 h-12 rounded-full border-2 border-[#c5a059]/40 p-0.5 bg-black/40 overflow-hidden flex-shrink-0">
            <img src={avatarUrl} alt="Avatar" className="w-full h-full rounded-full object-cover" crossOrigin="anonymous" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold truncate">{personalStats.userName}</h2>
            <div className="flex items-center space-x-1.5 mt-1 text-[10px] text-white/60">
              <span className="px-1.5 py-0.5 border border-white/10 rounded bg-white/5 whitespace-nowrap">{ROLE_NAMES[personalStats.role]}</span>
              <span className="px-1.5 py-0.5 border border-white/10 rounded bg-white/5 whitespace-nowrap">{formatDuration(duration)}</span>
              <span className="px-1.5 py-0.5 border border-white/10 rounded bg-white/5 whitespace-nowrap">{playerCount}人局</span>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="px-4 pb-2">
          <div className="flex gap-2">
            <div className="flex-1 bg-black/40 rounded-lg py-2 px-3 border border-[#c5a059]/10 text-center">
              <div className="text-xl font-bold text-[#c5a059]">{personalStats.totalScore}</div>
              <div className="text-[9px] text-white/50 tracking-wider">综合评分</div>
            </div>
            <div className="flex-1 bg-black/40 rounded-lg py-2 px-3 border border-[#c5a059]/10 text-center">
              <div className="text-sm font-bold text-[#c5a059] leading-6">{primaryTag}</div>
              <div className="text-[9px] text-white/50 tracking-wider">获得称号</div>
            </div>
          </div>
        </div>

        {/* Content Section - Radar or Portrait */}
        {mode === "radar" ? (
          <div className="flex-1 px-4 py-1 flex flex-col">
            <div className="bg-black/30 rounded-lg p-2 border border-[#c5a059]/10 flex-1 flex flex-col justify-center">
              <div className="flex items-center justify-center">
                <RadarChart stats={radarStats} isWolf={isWolf} />
              </div>
              <div className="grid grid-cols-5 gap-1 text-center">
                <div>
                  <div className="text-sm font-bold text-[#c5a059]">{radarStats.logic}</div>
                  <div className="text-[8px] text-white/40">逻辑</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-[#c5a059]">{radarStats.speech}</div>
                  <div className="text-[8px] text-white/40">发言</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-[#c5a059]">{radarStats.survival}</div>
                  <div className="text-[8px] text-white/40">存活</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-[#c5a059]">{radarStats.skillOrHide}</div>
                  <div className="text-[8px] text-white/40">{isWolf ? "隐匿" : "技能"}</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-[#c5a059]">{radarStats.voteOrTicket}</div>
                  <div className="text-[8px] text-white/40">{isWolf ? "冲票" : "投票"}</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 px-4 py-1 flex flex-col">
            <div className="rounded-lg border border-[#c5a059]/10 flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 relative overflow-hidden bg-[#14110F]">
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4">
                  <AwardSeal />
                  <div className="text-[10px] text-[#A9B2BC] tracking-widest">本局称号</div>
                  <div className="text-2xl font-bold text-[#F2EDE4] tracking-wider">{primaryTag}</div>
                  {personalStats.tags.length > 1 && (
                    <div className="flex flex-wrap gap-1.5 justify-center mt-2">
                      {personalStats.tags.slice(1).map((tag, idx) => (
                        <span key={idx} className="px-2 py-0.5 text-[9px] text-[#c5a059] border border-[#c5a059]/30 rounded-full bg-black/40">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="p-3">
                <div className="grid grid-cols-5 gap-1 text-center">
                  <div>
                    <div className="text-sm font-bold text-[#c5a059]">{radarStats.logic}</div>
                    <div className="text-[8px] text-white/40">逻辑</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[#c5a059]">{radarStats.speech}</div>
                    <div className="text-[8px] text-white/40">发言</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[#c5a059]">{radarStats.survival}</div>
                    <div className="text-[8px] text-white/40">存活</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[#c5a059]">{radarStats.skillOrHide}</div>
                    <div className="text-[8px] text-white/40">{isWolf ? "隐匿" : "技能"}</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[#c5a059]">{radarStats.voteOrTicket}</div>
                    <div className="text-[8px] text-white/40">{isWolf ? "冲票" : "投票"}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Highlight Quote */}
        {personalStats.highlightQuote && (
          <div className="px-4 pb-2">
            <div className="bg-[#c5a059]/10 rounded-lg p-3 border border-[#c5a059]/20">
              <div className="text-[11px] text-[#c5a059] tracking-wider font-bold mb-1.5">金句时刻</div>
              <p className="text-[12px] text-white/85 italic leading-relaxed line-clamp-2">“{personalStats.highlightQuote}”</p>
            </div>
          </div>
        )}

        {/* Footer with QR Code */}
        <div className="px-4 py-4 bg-[#0a0908] border-t border-[#c5a059]/10 mt-auto">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[#c5a059] font-bold tracking-wider text-sm">{SITE_URL}</div>
              <div className="text-[9px] text-white/40 mt-0.5">最后的真人</div>
            </div>
            <div className="bg-white p-1.5 rounded">
              <QRCodeSVG value={siteUrl} size={52} level="M" bgColor="#ffffff" fgColor="#1a1614" />
            </div>
          </div>
        </div>
      </div>
    );
  }
);
