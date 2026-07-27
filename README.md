# 🎸 Greedy Thiefs Repetionstid

En enkel webbapp för att hitta gemensam repetionstid för bandet Greedy Thiefs, inspirerad av Doodle.

## Funktioner

- **Enkelt gränssnitt**: Ange ditt namn och markera vilka tider du kan
- **Realtidöverblick**: Se direkt vilka tider som passar flest
- **Offline-first**: Data sparas i browser-lagring (localStorage)
- **Responsiv design**: Fungerar på mobil, tablet och desktop

## Installation

```bash
npm install
```

## Utveckling

```bash
npm run dev
```

Öppna sedan `http://localhost:5173` i din browser.

## Byggning

```bash
npm run build
```

Detta skapar en optimerad version i `dist/`-mappen.

## Deployment på Netlify

1. Öppna [Netlify](https://app.netlify.com)
2. Koppla denna Git-repo
3. Netlify bygger och deployer automatiskt (se `netlify.toml` för konfiguration)

Eller deploy direkt via Netlify CLI:

```bash
npm install -g netlify-cli
netlify deploy
```

## Teknologi

- **React** 19 för interaktivt gränssnitt
- **Vite** för snabb build och development
- **localStorage** för datalagrering
- **CSS Grid/Flexbox** för responsiv design
