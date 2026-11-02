"use client";

import { HallFrame } from "@/components/wolf-council/HallFrame";
import { SettingsView } from "@/components/wolf-council/Records";

export default function HallSettingsPage() {
  return (
    <HallFrame active="settings">
      <SettingsView />
    </HallFrame>
  );
}
