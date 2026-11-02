"use client";

import Link from "next/link";
import { useEffect } from "react";
import { GearSix, House, ClockCounterClockwise, Crown } from "@phosphor-icons/react";
import { LocaleSwitcher } from "@/components/game/LocaleSwitcher";
import { useAppLocale } from "@/i18n/useAppLocale";
import { hallCopy } from "@/lib/wolf-council/copy";
import { withLocale } from "@/lib/wolf-council/paths";
import "./wolf-hall.css";

type HallSection = "hall" | "history" | "settings" | "council";

export function HallFrame({
  active,
  children,
}: {
  active: HallSection;
  children: React.ReactNode;
}) {
  const { locale } = useAppLocale();
  const copy = hallCopy(locale);
  const home = withLocale(locale, "/");
  const hall = withLocale(locale, "/hall");
  const history = withLocale(locale, "/hall/history");
  const settings = withLocale(locale, "/hall/settings");
  const crumb = active === "history" ? copy.navHistory : active === "settings" ? copy.navSettings : copy.navHall;

  useEffect(() => {
    const previous = document.title;
    document.title = `${copy.brand} · ${copy.hallTitle}`;
    return () => {
      document.title = previous;
    };
  }, [copy.brand, copy.hallTitle]);

  return (
    <div className="wolf-hall">
      <div className="wolf-hall__moon" aria-hidden="true" />
      <svg className="wolf-hall__castle" viewBox="0 0 800 180" aria-hidden="true">
        <path fill="#141820" d="M40 180l50-70 20 24 30-54 24 40 18-22 26 82H40zm180 0V70h18l10-24 10 24h18v110h-56zm120 0l40-78 16 30 22-46 18 36 20-24 24 82H340z" />
      </svg>
      <div className="wolf-hall__frame">
        <aside className="wolf-hall__side">
          <Link className="wolf-hall__brand" href={home}>
            <img src="/wolf-council/wolves/luna.jpg" alt="" />
            <div>
              <b>{copy.brand}</b>
              <span>{copy.brandSub}</span>
            </div>
          </Link>
          <nav className="wolf-hall__nav" aria-label={copy.navHall}>
            <Link href={home}><House size={18} /><span>{copy.navHome}</span></Link>
            <Link className={active === "hall" || active === "council" ? "is-active" : ""} href={hall}>
              <Crown size={18} /><span>{copy.navHall}</span>
            </Link>
            <Link className={active === "history" ? "is-active" : ""} href={history}>
              <ClockCounterClockwise size={18} /><span>{copy.navHistory}</span>
            </Link>
            <Link className={active === "settings" ? "is-active" : ""} href={settings}>
              <GearSix size={18} /><span>{copy.navSettings}</span>
            </Link>
          </nav>
          <p className="wolf-hall__foot">{copy.sideFoot}</p>
        </aside>
        <div className="wolf-hall__main">
          <header className="wolf-hall__top">
            <div className="wolf-hall__crumb">{copy.brand} · {crumb}</div>
            <div className="wolf-hall__actions">
              <LocaleSwitcher />
              <Link className="wolf-hall__gear" href={settings} aria-label={copy.navSettings}>
                <GearSix size={18} />
              </Link>
            </div>
          </header>
          <div className="wolf-hall__body">{children}</div>
        </div>
      </div>
    </div>
  );
}
