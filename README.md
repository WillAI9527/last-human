# LAST HUMAN · 最后的真人

Public demo of a single-human Werewolf table. You take one seat. Every other player is an AI.

This repository is a modified fork of [oil-oil/wolfcha](https://github.com/oil-oil/wolfcha) (Apache-2.0). The original copyright and the Apache-2.0 `LICENSE` are kept. See `NOTICE` for the major modifications.

## Play

The home page is the game setup. Sign your name and start. Each IP can start 3 games per Singapore calendar day.

## Local development

Requirements: Node.js and [pnpm](https://pnpm.io/).

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

The app builds and the setup screen loads with no environment variables. A game needs `ZENMUX_API_KEY`. Without it, the setup screen says the server is not configured.

```bash
pnpm test:single-player-context
pnpm build
```

## License

[Apache-2.0](./LICENSE). Background music is CC0; see `public/bgm/LICENSE-BGM.md`.
