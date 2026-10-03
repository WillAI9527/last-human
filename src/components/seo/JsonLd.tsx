import Script from "next/script";
import { absoluteUrl, getSiteUrl } from "@/lib/site-url";

interface JsonLdProps {
  id?: string;
  data: object;
}

export function JsonLd({ id = "json-ld", data }: JsonLdProps) {
  return (
    <Script
      id={id}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
      strategy="afterInteractive"
    />
  );
}

export function getGameJsonLd() {
  const siteUrl = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: "LAST HUMAN · 最后的真人",
    alternateName: ["最后的真人", "AI Werewolf", "AI狼人杀"],
    url: siteUrl,
    description:
      "Play Werewolf with AI opponents. A single-player social deduction game where AI players reason, bluff, accuse, defend, and vote through the full Werewolf flow.",
    image: absoluteUrl("/og-image.png"),
    genre: ["Social Deduction", "Strategy", "Party Game", "AI Game"],
    gamePlatform: ["Web Browser", "Mobile Browser"],
    applicationCategory: "Game",
    operatingSystem: "Any",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
    author: {
      "@type": "Organization",
      name: "LAST HUMAN",
    },
    keywords:
      "AI werewolf, play werewolf online, werewolf game online, play werewolf alone, single player werewolf, AI mafia game, werewolf with AI opponents, social deduction game",
    inLanguage: ["en", "zh-CN"],
    numberOfPlayers: {
      "@type": "QuantitativeValue",
      minValue: 1,
      maxValue: 1,
    },
    playMode: "SinglePlayer",
  };
}

export function getWebsiteJsonLd() {
  const siteUrl = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "LAST HUMAN · 最后的真人",
    alternateName: "最后的真人",
    url: siteUrl,
    description:
      "Play Werewolf with AI opponents online. A single-player social deduction game with classic roles, AI dialogue, voting, bluffing, and optional voice acting.",
    potentialAction: {
      "@type": "PlayAction",
      target: siteUrl,
      name: "Play AI Werewolf",
    },
  };
}

export function getOrganizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "LAST HUMAN",
    url: getSiteUrl(),
    logo: absoluteUrl("/logo.png"),
    sameAs: ["https://github.com/WillAI9527/last-human"],
  };
}

export function getFAQJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What is AI Werewolf?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "AI Werewolf is a single-player version of the classic Werewolf (Mafia) social deduction game where you play against AI opponents that speak, reason, bluff, and vote.",
        },
      },
      {
        "@type": "Question",
        name: "Can I play Werewolf alone?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. LAST HUMAN lets you play Werewolf as the only human at the table. Every other seat is an AI.",
        },
      },
      {
        "@type": "Question",
        name: "How do AI players work in the game?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "AI players only know what their role should know. They follow speeches, vote history, night outcomes, and their own faction goal to accuse, defend, bluff, and vote.",
        },
      },
      {
        "@type": "Question",
        name: "Is LAST HUMAN free to play?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. Open the page, sign your name, and start. Each IP can start 3 games per day.",
        },
      },
      {
        "@type": "Question",
        name: "What roles are available in the game?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "The game includes classic Werewolf roles: Werewolf, Seer, Witch, Hunter, Guard, and Villager. Role composition varies based on player count (8-12 players).",
        },
      },
    ],
  };
}

export function getHowToJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to Play AI Werewolf",
    description:
      "Learn how to play Werewolf with AI opponents in this single-player social deduction game.",
    image: absoluteUrl("/og-image.png"),
    totalTime: "PT15M",
    step: [
      {
        "@type": "HowToStep",
        name: "Enter Your Name",
        text: "Open the page and enter your name to begin.",
        position: 1,
      },
      {
        "@type": "HowToStep",
        name: "Choose Game Settings",
        text: "Select player count (8-12), difficulty level, and sound preferences.",
        position: 2,
      },
      {
        "@type": "HowToStep",
        name: "Receive Your Role",
        text: "You'll be assigned a random role: Werewolf, Seer, Witch, Hunter, Guard, or Villager.",
        position: 3,
      },
      {
        "@type": "HowToStep",
        name: "Play Night Phase",
        text: "Use your role abilities during the night phase. Werewolves kill, Seer checks, Witch uses potions, Guard protects.",
        position: 4,
      },
      {
        "@type": "HowToStep",
        name: "Day Discussion",
        text: "Discuss with AI players, share information, and identify suspicious behavior.",
        position: 5,
      },
      {
        "@type": "HowToStep",
        name: "Vote",
        text: "Vote to eliminate a suspected werewolf. The player with most votes is eliminated.",
        position: 6,
      },
      {
        "@type": "HowToStep",
        name: "Win the Game",
        text: "Villagers win by eliminating all werewolves. Werewolves win when they equal or outnumber villagers.",
        position: 7,
      },
    ],
  };
}
