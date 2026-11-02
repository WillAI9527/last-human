"use client";

import { HallFrame } from "@/components/wolf-council/HallFrame";
import { HistoryView } from "@/components/wolf-council/Records";

export default function HallHistoryPage() {
  return (
    <HallFrame active="history">
      <HistoryView />
    </HallFrame>
  );
}
