"use client";

import { useParams } from "next/navigation";
import { CouncilRoom } from "@/components/wolf-council/CouncilRoom";
import { HallFrame } from "@/components/wolf-council/HallFrame";

export default function CouncilPage() {
  const params = useParams<{ board: string }>();
  const boardId = typeof params.board === "string" ? params.board : "";
  return (
    <HallFrame active="council">
      <CouncilRoom key={boardId} boardId={boardId} />
    </HallFrame>
  );
}
