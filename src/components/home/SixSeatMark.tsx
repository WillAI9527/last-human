export function SixSeatMark({ muted = false }: { muted?: boolean }) {
  const seat = muted ? "#7F8C99" : "#F2EDE4";
  const human = muted ? "#7F8C99" : "#E8BE6A";
  const crescent = muted ? "#7F8C99" : "#0F0D0C";

  return (
    <svg className="wolf-cover__mark" viewBox="0 0 512 512" aria-hidden="true">
      <path
        d="M250.1,160.2 A96,96 0 1,0 349.2,279.0 A78,78 0 0,1 250.1,160.2 Z"
        fill={crescent}
      />
      <circle cx="256" cy="88" r="18" fill={seat} />
      <circle cx="401.5" cy="172" r="18" fill={seat} />
      <circle cx="401.5" cy="340" r="18" fill={seat} />
      <circle cx="110.5" cy="172" r="18" fill={seat} />
      <circle cx="110.5" cy="340" r="18" fill={seat} />
      <circle cx="256" cy="424" r="26" fill={human} />
    </svg>
  );
}
