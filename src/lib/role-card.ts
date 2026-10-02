import type { Role } from "@/types/game";

const ROLE_CARD_FILE: Record<Role, string> = {
  Werewolf: "werewolf",
  WhiteWolfKing: "white-wolf-king",
  Seer: "seer",
  Witch: "witch",
  Hunter: "hunter",
  Guard: "guard",
  Idiot: "idiot",
  Villager: "villager",
};

/** Baked role card (frame, name, and skill line). WebP, with a PNG of the same name beside it. */
export function roleCardUrl(role: Role | string | null | undefined): string {
  const file = role && role in ROLE_CARD_FILE ? ROLE_CARD_FILE[role as Role] : "villager";
  return `/roles/${file}.webp`;
}
