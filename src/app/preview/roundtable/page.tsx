import { Suspense } from "react";
import { PreviewRoom } from "./preview-room";

export default function RoundtablePreviewPage() {
  return (
    <Suspense fallback={null}>
      <PreviewRoom />
    </Suspense>
  );
}
