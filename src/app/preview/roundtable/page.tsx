import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PreviewRoom } from "./preview-room";

export const dynamic = "force-dynamic";

export default function RoundtablePreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <Suspense fallback={null}>
      <PreviewRoom />
    </Suspense>
  );
}
