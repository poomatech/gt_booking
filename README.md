# Greedy Thiefs repetitionstid

Doodle-liknande tidpoll för att hitta en gemensam reptid för bandet. Bandet
klickar på en länk, skriver sitt namn och kryssar i de tider de kan — ingen
inloggning.

## Funktioner

- **Delad databas i realtid**: allas svar sparas gemensamt i Firestore och syns
  direkt hos de andra, oavsett webbläsare eller telefon
- **Tre veckor framåt**, från måndagen i innevarande vecka, två pass per dag
  (eftermiddag 12–17, kväll 17–21)
- **Deadline**: någon sätter när röstningen stänger; tider som ligger före
  deadline går inte att välja
- **Populäraste tiderna** visas först på sidan, men bara när minst två kan samma
  tid — dessförinnan finns det inget att välja mellan
- **Två vyer**: rutnät (en tabell per vecka) eller lista (en rubrik per dag).
  Lista är standard på mobil, rutnät på dator; eget val sparas
- **Byggd för skärmläsare**: allt nåbart med tangentbord, tillstånd via
  `aria-pressed`, statusmeddelanden via live-region, fokus flyttas när element
  försvinner. Ingen information ges enbart med färg

## Kräver Firestore-regler

Appen läser och skriver `gt_booking_people` och `gt_booking_state` i
Firebase-projektet `byggatexteer` — **utan inloggning**. Reglerna måste tillåta
det, annars visar appen "Databasen nekar åtkomst".

Se [`firestore.rules`](firestore.rules). Reglerna ska **läggas till** bland de
befintliga i Firebase-konsolen, inte ersätta dem: övriga collections är låsta
till ägarkontot och används av de andra apparna i repot.

Det innebär att vem som helst med adressen till sajten kan rösta, ändra deadline
eller rensa listan. Medvetet val — datan är reptider.

## Utveckling

```bash
npm install
```

```bash
npm run dev
```

Öppnas på `http://localhost:5173`.

```bash
npm run build
```

## Deployment

Ligger på Netlify, som bygger automatiskt vid push till `main`. Se
[`netlify.toml`](netlify.toml).

## Teknik

- React + Vite
- Firebase/Firestore för delad data. En doc per person
  (`gt_booking_people/{id}`, id = namnet i gemener) så att två som röstar
  samtidigt inte skriver över varandra; tider läggs till och tas bort med
  `arrayUnion`/`arrayRemove`, som är atomiska server-side
- localStorage används bara för inställningar per webbläsare: ditt eget namn och
  ditt vyval
