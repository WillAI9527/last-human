export function BoardArt({ id }: { id: string }) {
  if (id === "business") {
    return (
      <svg viewBox="0 0 320 180" aria-hidden="true">
        <rect x="118" y="58" width="84" height="62" rx="8" fill="#6b442c" stroke="#e7c98a" />
        <rect x="146" y="78" width="28" height="18" rx="3" fill="#d7b56a" />
        <path d="M40 150h70l18-48 18 48h70" fill="none" stroke="#d7c4a2" strokeWidth="3" />
        <rect x="214" y="70" width="16" height="70" fill="#8d8f98" />
        <rect x="236" y="48" width="16" height="92" fill="#6e7380" />
        <rect x="258" y="86" width="16" height="54" fill="#9aa0ab" />
      </svg>
    );
  }
  if (id === "legal") {
    return (
      <svg viewBox="0 0 320 180" aria-hidden="true">
        <path d="M160 36v92" stroke="#e6c98a" strokeWidth="4" />
        <path d="M108 58h104" stroke="#e6c98a" strokeWidth="4" />
        <path d="M108 58l-28 42h56z" fill="#c9a25a" />
        <path d="M212 58l-28 42h56z" fill="#c9a25a" />
        <rect x="132" y="128" width="56" height="10" rx="2" fill="#8d6a32" />
        <rect x="36" y="78" width="46" height="58" rx="3" fill="#f3e2b8" />
        <path d="M250 150c18-28 28-28 40-8" fill="none" stroke="#e7d7a4" strokeWidth="3" />
      </svg>
    );
  }
  if (id === "learning") {
    return (
      <svg viewBox="0 0 320 180" aria-hidden="true">
        <rect x="92" y="96" width="120" height="18" rx="2" fill="#1f6b4a" />
        <rect x="100" y="78" width="120" height="18" rx="2" fill="#b4332a" />
        <rect x="84" y="60" width="120" height="18" rx="2" fill="#2a4e86" />
        <rect x="108" y="42" width="120" height="18" rx="2" fill="#d2b46a" />
        <path d="M236 40c20 30 8 70-6 96" fill="none" stroke="#f0e2b8" strokeWidth="4" />
      </svg>
    );
  }
  if (id === "social") {
    return (
      <svg viewBox="0 0 320 180" aria-hidden="true">
        <path d="M70 110l70-18 8 34-70 16z" fill="#d6a441" stroke="#f3dd9a" />
        <circle cx="196" cy="70" r="22" fill="#7a2030" stroke="#f0d7a2" />
        <rect x="214" y="88" width="14" height="36" rx="3" fill="#e07070" />
        <rect x="232" y="74" width="14" height="50" rx="3" fill="#d6b46a" />
        <rect x="250" y="96" width="14" height="28" rx="3" fill="#e07070" />
      </svg>
    );
  }
  if (id === "werewolf") {
    return (
      <svg viewBox="0 0 320 180" aria-hidden="true">
        <circle cx="214" cy="58" r="28" fill="#f4e7c4" />
        <path d="M40 150l36-48 18 22 24-40 20 28 16-18 22 56z" fill="#1c2433" />
        <path d="M120 150V92h16l8-18 8 18h16v58" fill="#2a241c" />
        <rect x="128" y="78" width="8" height="18" fill="#3a3228" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 320 180" aria-hidden="true">
      <circle cx="118" cy="108" r="22" fill="#e2b34a" stroke="#f6e2a8" />
      <circle cx="150" cy="96" r="16" fill="#c8962e" />
      <rect x="188" y="108" width="18" height="36" fill="#d6b46a" />
      <rect x="210" y="86" width="18" height="58" fill="#f0d48a" />
      <rect x="232" y="68" width="18" height="76" fill="#e2b34a" />
      <path d="M236 48l14-20 6 16z" fill="#f4e7c4" />
    </svg>
  );
}
