"use client";

import { Suspense } from "react";
import { Wizard } from "@/components/ops/Wizard";

export default function OpsHomePage() {
  return (
    <Suspense fallback={<div className="ops-skel-page" />}>
      <Wizard />
    </Suspense>
  );
}
