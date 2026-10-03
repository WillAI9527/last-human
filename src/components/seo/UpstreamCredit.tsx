const UPSTREAM_REPO_URL = "https://github.com/oil-oil/wolfcha";

export function UpstreamCredit({ className }: { className?: string }) {
  return (
    <a href={UPSTREAM_REPO_URL} target="_blank" rel="noopener noreferrer" className={className}>
      基于 Wolfcha（Apache 2.0）二次开发
    </a>
  );
}
