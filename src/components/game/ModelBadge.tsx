import type { ModelRef } from "@/types/game";
import { getModelLogoUrl } from "@/lib/avatar-config";
import { modelLogoNeedsLightInk } from "@/lib/model-logo";
import { cn } from "@/lib/utils";

export function ModelBadge({ modelRef }: { modelRef?: ModelRef }) {
  const modelId = modelRef?.model?.trim();
  return (
    <span
      className={cn("lh-model-badge", modelLogoNeedsLightInk(modelRef) && "lh-model-badge--light")}
      title={modelId || undefined}
      role="img"
      aria-label={modelId || undefined}
    >
      <img src={getModelLogoUrl(modelRef)} alt="" />
    </span>
  );
}
