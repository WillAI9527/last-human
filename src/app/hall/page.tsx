"use client";

import { HallFrame } from "@/components/wolf-council/HallFrame";
import { HallGrid } from "@/components/wolf-council/HallGrid";

export default function HallPage() {
  return (
    <HallFrame active="hall">
      <HallGrid />
    </HallFrame>
  );
}
