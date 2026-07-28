import { useState, useEffect, useRef } from 'react'
import './App.css'
import {
  personId,
  subscribePeople,
  subscribeState,
  joinPerson,
  addSlot,
  removeSlot,
  clearPersonSlots,
  deletePerson,
  writeDeadline,
  clearAll,
} from './firebase'

// id måste vara oförändrat — det ingår i nyckeln som sparas i Firestore
const TIME_SLOTS = [
  { id: 'Eftermiddag (12-17)', label: 'Eftermiddag', range: '12–17', startHour: 12 },
  { id: 'Kväll (17-21)', label: 'Kväll', range: '17–21', startHour: 17 },
]

const DAY_NAMES = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör']
const DAY_NAMES_LONG = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag']
const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
const MONTH_NAMES_LONG = [
  'januari', 'februari', 'mars', 'april', 'maj', 'juni',
  'juli', 'augusti', 'september', 'oktober', 'november', 'december',
]

function generateDates() {
  const today = new Date()
  const dayOfWeek = today.getDay()
  // måndag i innevarande vecka (söndag räknas till veckan som just gått)
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const monday = new Date(today)
  monday.setDate(today.getDate() - daysSinceMonday)
  monday.setHours(0, 0, 0, 0)

  const dates = []
  for (let i = 0; i < 21; i++) {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    dates.push({
      label: `${DAY_NAMES[date.getDay()]} ${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`,
      spoken: `${DAY_NAMES_LONG[date.getDay()]} ${date.getDate()} ${MONTH_NAMES_LONG[date.getMonth()]}`,
      date,
    })
  }
  return dates
}

// Varför en tid inte går att välja. Tom sträng = den går bra.
//
// Tider FÖRE deadline är blockerade: det är meningslöst att rösta fram en
// reptid som redan varit när röstningen stänger. Är ingen deadline satt gäller
// bara att tiden inte får ha passerat.
function blockReason(dateObj, slot, deadlineAt) {
  const start = new Date(dateObj)
  start.setHours(slot.startHour, 0, 0, 0)
  if (start <= new Date()) return 'passerat'
  if (deadlineAt && start <= deadlineAt) return 'fore-deadline'
  return ''
}

function toDateInputValue(date) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Kalendern är densamma under hela sidbesöket, så den räknas ut en gång här
// i stället för per komponent — då kan även hjälpfunktionerna nedan använda den.
const DATES = generateDates()

// Sidfoten ligger utanför <main> så att den blir en egen landmark, och visas
// på både namnskärmen och kalendern. Den engelska raden är märkt lang="en" —
// annars läser den svenska talsyntesen den med svenskt uttal, vilket blir
// obegripligt.
function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>© {new Date().getFullYear()} Mattias Ericson</p>
      <p lang="en">This is a Marvelous Website by qProd.</p>
    </footer>
  )
}

const slotKey = (dateLabel, slotId) => `${dateLabel}|${slotId}`

// Upplästa datum ("fredag 31 juli") i stället för de förkortade som visas
// ("Fre 31 jul"), för det som ska läsas upp av talsyntes.
function spokenSlot(key) {
  const [dateLabel, slotId] = key.split('|')
  const day = DATES.find((d) => d.label === dateLabel)
  const slot = TIME_SLOTS.find((s) => s.id === slotId)
  return `${day ? day.spoken : dateLabel}, ${slot ? `${slot.label} ${slot.range}` : slotId}`
}

// Minst så här många måste kunna SAMMA tid för att den ska räknas som populär.
// Med bara en person som kan en tid finns ingen överlappning att prata om —
// då är "populäraste tiderna" bara en avskrift av den personens egen lista.
const MIN_OVERLAP = 2

// Avgör om topplistan bär någon information än, och vilka tider som i så fall
// kvalificerar sig. Används både för det som visas och för det som läses upp,
// så de två aldrig kan säga olika saker.
function popularTimes(peopleList, limit = 5) {
  const voters = peopleList.filter((p) => (p.slots || []).length > 0).length
  const qualifying = topTimesFrom(peopleList, Infinity).filter(([, c]) => c >= MIN_OVERLAP)
  return {
    // Två villkor, inte ett: det räcker inte att två personer har svarat om de
    // inte överlappar någonstans. Då finns fortfarande inget att välja mellan.
    ready: voters >= 2 && qualifying.length > 0,
    voters,
    qualifying,
    shown: qualifying.slice(0, limit),
  }
}

// De N mest valda tiderna. Flest röster först; vid lika många vinner det
// tidigaste datumet, annars avgörs ordningen av godtycklig insättningsordning.
function topTimesFrom(peopleList, n) {
  const tally = new Map()
  peopleList.forEach((p) => {
    ;(p.slots || []).forEach((key) => tally.set(key, (tally.get(key) || 0) + 1))
  })
  return sortSlotKeys([...tally.keys()])
    .map((key) => [key, tally.get(key)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
}

// Sorterar tider KRONOLOGISKT. En rak .sort() på nycklarna ger alfabetisk
// ordning ("Lör 15 aug" före "Lör 8 aug", "Mån" före "Ons"), vilket är obegripligt
// att lyssna sig igenom. Ordningen hämtas i stället från kalenderns egen följd.
function sortSlotKeys(keys, dates = DATES) {
  const dateOrder = new Map(dates.map((d, i) => [d.label, i]))
  const rank = (key) => {
    const [dateLabel, slotId] = key.split('|')
    const day = dateOrder.has(dateLabel) ? dateOrder.get(dateLabel) : Number.MAX_SAFE_INTEGER
    const slot = TIME_SLOTS.findIndex((s) => s.id === slotId)
    return day * 10 + (slot === -1 ? 9 : slot)
  }
  return [...keys].sort((a, b) => rank(a) - rank(b))
}

function readableSlot(key) {
  const [dateLabel, slotId] = key.split('|')
  const slot = TIME_SLOTS.find((s) => s.id === slotId)
  return `${dateLabel}, ${slot ? `${slot.label} ${slot.range}` : slotId}`
}

function App() {
  const [nameDraft, setNameDraft] = useState('')
  const [submittedName, setSubmittedName] = useState(
    () => localStorage.getItem('gt_my_name') || ''
  )
  const [people, setPeople] = useState([])
  const [deadline, setDeadline] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dbError, setDbError] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const [nameError, setNameError] = useState('')
  const [focusRequest, setFocusRequest] = useState(null)
  // Vyval är en inställning per webbläsare, inte delad data — hör hemma i
  // localStorage, till skillnad från svaren som ligger i Firestore.
  const [view, setView] = useState(() => {
    const saved = localStorage.getItem('gt_view')
    if (saved === 'lista' || saved === 'rutnat') return saved
    // Inget eget val gjort ännu: gissa utifrån skärmbredd. Ett rutnät med sju
    // kolumner kräver sidledsscroll på mobil, listan gör inte det. Brytpunkten
    // är samma 768px som CSS:en använder.
    //
    // Gissningen görs EN gång, vid första renderingen. Att lyssna på resize och
    // byta vy i farten skulle bygga om hela kalendern mitt i att någon fyller i
    // den — och för den som använder skärmläsare skulle sidans struktur ändras
    // tyst under fötterna. Eget val vinner alltid och sparas.
    return window.matchMedia('(max-width: 768px)').matches ? 'lista' : 'rutnat'
  })

  const nameInputRef = useRef(null)
  const hasLoadedOnce = useRef(false)
  // Vem som kan en tid, visad vid pekare ELLER tangentbordsfokus. Rutan ligger
  // position:fixed i dokumentroten — tabellen har overflow för sidledsscroll och
  // skulle klippa en absolutpositionerad ruta.
  const [tip, setTip] = useState(null)
  const tipAnchor = useRef(null)

  const [deadlineDate, setDeadlineDate] = useState(() => toDateInputValue(new Date()))
  const [deadlineHour, setDeadlineHour] = useState('18')

  // Realtidslyssnare: alla som har sidan öppen ser varandras kryss direkt.
  useEffect(() => {
    const onError = (err) => {
      setLoading(false)
      setDbError(
        err?.code === 'permission-denied'
          ? 'Databasen nekar åtkomst. Firestore-reglerna för gt_booking_* behöver läggas in (se firestore.rules i repot).'
          : `Kunde inte nå databasen: ${err?.message || err}`
      )
    }
    const unsubPeople = subscribePeople((list) => {
      setPeople([...list].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'sv')))
      setLoading(false)
      setDbError('')
      // Bara FÖRSTA inläsningen annonseras. Senare ändringar från andra
      // deltagare skrivs tyst in — annars avbryts uppläsningen mitt i varje
      // gång någon annan kryssar i en tid.
      if (!hasLoadedOnce.current) {
        hasLoadedOnce.current = true
        const p = popularTimes(list, 5)
        setAnnouncement(
          list.length === 0
            ? 'Inläst. Ingen har anmält sig än.'
            : p.ready
              ? `Inläst. ${list.length} deltagare. Populäraste tiden: ${spokenSlot(p.shown[0][0])}, ${p.shown[0][1]} av ${list.length} kan. Hela listan står först på sidan.`
              : `Inläst. ${list.length} deltagare. Ingen tid har ${MIN_OVERLAP} som kan än.`
        )
      }
    }, onError)
    const unsubState = subscribeState((s) => setDeadline(s?.deadline || null), onError)
    return () => {
      unsubPeople()
      unsubState()
    }
  }, [])

  // När en åtgärd tar bort elementet som hade fokus (t.ex. "Ta bort Anna")
  // hamnar fokus annars på <body>, och den som använder skärmläsare tappar sin
  // plats i dokumentet helt. Vi flyttar fokus till närmaste rubrik som finns
  // kvar, efter att omrenderingen har hunnit ske.
  useEffect(() => {
    if (!focusRequest) return
    // Flera kandidater: det önskade målet kan ha försvunnit i samma ändring
    // (t.ex. hela topplistan när sista överlappande tiden avmarkeras). Ta
    // första som faktiskt finns kvar.
    const candidates = Array.isArray(focusRequest) ? focusRequest : [focusRequest]
    for (const id of candidates) {
      const el = document.getElementById(id)
      if (el) {
        el.focus()
        break
      }
    }
    setFocusRequest(null)
  }, [focusRequest, people, deadline, submittedName])

  // Escape stänger rutan (WCAG 2.1.1: innehåll som visas vid hover eller fokus
  // ska gå att avfärda utan att flytta pekaren).
  //
  // Vid scroll FLYTTAS rutan i stället för att stängas. Att stänga vore fel:
  // .focus() scrollar elementet i sikte, vilket utlöser scroll — rutan skulle
  // då stängas i samma ögonblick den öppnades, varje gång man tabbar till en
  // cell utanför synfältet.
  const tipOpen = Boolean(tip)
  useEffect(() => {
    if (!tipOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        tipAnchor.current = null
        setTip(null)
      }
    }
    const onScroll = () => {
      const el = tipAnchor.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setTip((t) => (t ? { ...t, x: r.left + r.width / 2, y: r.bottom + 8 } : t))
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [tipOpen])

  const me = people.find((p) => p.id === personId(submittedName))
  const mySlots = me?.slots || []

  const handleNameSubmit = async () => {
    const trimmed = nameDraft.trim()
    if (!trimmed) {
      setNameError('Skriv ditt namn för att fortsätta.')
      nameInputRef.current?.focus()
      return
    }
    setNameError('')
    setSubmittedName(trimmed)
    localStorage.setItem('gt_my_name', trimmed)
    setNameDraft('')
    try {
      await joinPerson(trimmed)
    } catch (err) {
      setDbError(`Kunde inte spara namnet: ${err.message}`)
    }
  }

  const changeView = (v) => {
    setView(v)
    localStorage.setItem('gt_view', v)
    setAnnouncement(
      v === 'lista'
        ? 'Listvy. Varje dag har en egen rubrik, med två knappar under.'
        : 'Rutnätsvy. En tabell per vecka, med dagarna som kolumner.'
    )
  }

  const changeName = () => {
    setSubmittedName('')
    localStorage.removeItem('gt_my_name')
    setFocusRequest('namn')
  }

  const run = async (fn, message) => {
    try {
      await fn()
      if (message) setAnnouncement(message)
    } catch (err) {
      setDbError(`Åtgärden misslyckades: ${err.message}`)
    }
  }

  const saveDeadline = () => {
    const dl = new Date(`${deadlineDate}T00:00:00`)
    dl.setHours(Number(deadlineHour), 0, 0, 0)
    return run(
      () => writeDeadline({ time: dl.toISOString(), setBy: submittedName }),
      `Deadline satt till ${dl.toLocaleString('sv-SE')}.`
    )
  }

  const resetDeadline = () => {
    if (!window.confirm('Ta bort deadline? Röstningen öppnas då igen och någon kan sätta en ny.')) return
    setDeadlineDate(toDateInputValue(new Date()))
    setDeadlineHour('18')
    // Deadline-rutan byts mot formuläret — fokus dit, inte till <body>.
    setFocusRequest('deadline-rubrik')
    return run(() => writeDeadline(null), 'Deadline borttagen. Röstningen är öppen igen.')
  }

  const handleRemovePerson = (person) => {
    if (!window.confirm(`Ta bort ${person.name} och alla deras markerade tider?`)) return
    if (person.id === personId(submittedName)) {
      changeName()
    } else {
      setFocusRequest('deltagare-rubrik')
    }
    return run(() => deletePerson(person.name), `${person.name} är borttagen.`)
  }

  const handleClearPerson = (person) => {
    if (!window.confirm(`Nollställ alla tider för ${person.name}? Personen finns kvar i listan.`)) return
    // Knappen man står på blir inaktiverad av åtgärden; flytta till kortets rubrik.
    setFocusRequest(`deltagare-${person.id}`)
    return run(() => clearPersonSlots(person.name), `Alla tider nollställda för ${person.name}.`)
  }

  const handleClearEverything = () => {
    if (!window.confirm('Rensa allt: alla deltagare, alla tider och deadline. Går inte att ångra. Fortsätt?')) return
    changeName()
    return run(() => clearAll(), 'Allt är rensat.')
  }

  const toggleTime = (dateEntry, slot) => {
    const key = slotKey(dateEntry.label, slot.id)
    const wasSelected = mySlots.includes(key)
    // Räkna optimistiskt: snapshotet från servern hinner inte fram före uppläsningen.
    const count = whoCan(dateEntry.label, slot.id).length + (wasSelected ? -1 : 1)
    setAnnouncement(
      `${wasSelected ? 'Avmarkerat' : 'Markerat'}: ${dateEntry.spoken}, ${slot.label} ${slot.range}. Nu kan ${count} av ${people.length}.`
    )
    return run(() =>
      wasSelected ? removeSlot(submittedName, key) : addSlot(submittedName, key)
    )
  }

  const whoCan = (dateLabel, slotId) =>
    people.filter((p) => (p.slots || []).includes(slotKey(dateLabel, slotId))).map((p) => p.name)

  // Handlers för "vem kan"-rutan. Sätts bara på celler där någon faktiskt kan —
  // en tom ruta vore bara brus. onFocus/onBlur gör att den även nås med Tab.
  const tipHandlers = (heading, names) => {
    if (names.length === 0) return {}
    const show = (e) => {
      tipAnchor.current = e.currentTarget
      const r = e.currentTarget.getBoundingClientRect()
      setTip({ heading, names: names.join(', '), x: r.left + r.width / 2, y: r.bottom + 8 })
    }
    const hide = () => {
      tipAnchor.current = null
      setTip(null)
    }
    return { onMouseEnter: show, onFocus: show, onMouseLeave: hide, onBlur: hide }
  }

  const popular = popularTimes(people, 5)

  // Markera direkt ur topplistan. Faller tiden under tröskeln av att man
  // avmarkerar den försvinner raden — då flyttas fokus till rubriken i stället
  // för att falla till <body>.
  const toggleFromTop = (key) => {
    const [dateLabel, slotId] = key.split('|')
    const dateEntry = DATES.find((d) => d.label === dateLabel)
    const slot = TIME_SLOTS.find((s) => s.id === slotId)
    if (!dateEntry || !slot) return
    const wasSelected = mySlots.includes(key)
    if (wasSelected && whoCan(dateLabel, slotId).length - 1 < MIN_OVERLAP) {
      // Raden försvinner. Var sista kvalificerade tiden försvinner hela rutan
      // — och med den rubriken — så kalenderrubriken är reservmål.
      setFocusRequest(['topp-rubrik', 'kalender-rubrik'])
    }
    toggleTime(dateEntry, slot)
  }

  if (!submittedName) {
    return (
      <>
        <main className="app">
          <div className="intro">
            <h1>Greedy Thiefs repetitionstid</h1>
            <p>Hitta en gemensam tid för nästa rep.</p>
            {dbError && (
              <p className="db-error" role="alert">
                {dbError}
              </p>
            )}
            <div className="name-input">
              <label htmlFor="namn">Ditt namn</label>
              <input
                id="namn"
                ref={nameInputRef}
                type="text"
                value={nameDraft}
                autoComplete="name"
                aria-describedby={nameError ? 'namn-fel' : undefined}
                aria-invalid={nameError ? 'true' : undefined}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleNameSubmit()
                }}
              />
              {nameError && (
                <p className="field-error" id="namn-fel" role="alert">
                  {nameError}
                </p>
              )}
              <button type="button" onClick={handleNameSubmit}>
                Börja
              </button>
            </div>
          </div>
        </main>
        <SiteFooter />
      </>
    )
  }

  const deadlineAt = deadline ? new Date(deadline.time) : null
  const deadlinePassed = deadlineAt && deadlineAt < new Date()

  const WEEKS = [0, 1, 2].map((i) => {
    const dates = DATES.slice(i * 7, (i + 1) * 7)
    return {
      index: i,
      id: `vecka-${i + 1}`,
      label: `Vecka ${i + 1}: ${dates[0].label} till ${dates[6].label}`,
      dates,
    }
  })

  // Allt en cell behöver veta, delat mellan rutnäts- och listvyn så att de två
  // aldrig kan hamna i otakt med varandra.
  const cellState = (d, slot) => {
    const selected = mySlots.includes(slotKey(d.label, slot.id))
    const available = whoCan(d.label, slot.id)
    const blocked = blockReason(d.date, slot, deadlineAt)
    const disabled = Boolean(blocked) || deadlinePassed
    const reason = blocked === 'passerat'
      ? 'Tiden har passerat.'
      : blocked === 'fore-deadline'
        ? 'Tiden ligger före deadline.'
        : deadlinePassed
          ? 'Röstningen är stängd.'
          : ''
    // Ditt EGET svar står inte i texten — aria-pressed säger redan
    // "nedtryckt/ej nedtryckt". Att upprepa det skulle säga samma sak två
    // gånger, i var och en av de 42 cellerna.
    const label = [
      `${d.spoken}, ${slot.label} ${slot.range}.`,
      available.length > 0
        ? `${available.length} av ${people.length} kan: ${available.join(', ')}.`
        : 'Ingen kan än.',
      reason,
    ]
      .filter(Boolean)
      .join(' ')
    const shade = people.length > 0 ? Math.min(available.length / people.length, 1) : 0
    return { selected, available, blocked, disabled, label, shade }
  }

  return (
    <>
      {/* Bara när rutan faktiskt finns — en skip-länk till ett mål som inte
          existerar tar användaren ingenstans. */}
      {!loading && popular.ready && (
        <a className="skip-link" href="#topp-rubrik">
          Hoppa till populäraste tiderna
        </a>
      )}
      <a className="skip-link" href="#kalender">
        Hoppa till kalendern
      </a>

      <main className="app" id="topp">
        <div className="header">
          <h1>Greedy Thiefs repetitionstid</h1>
          <div className="participant-info">
            <p className="current-user">
              Du: <strong>{submittedName}</strong>
            </p>
            <button type="button" className="change-user" onClick={changeName}>
              Byt namn
            </button>
          </div>
        </div>

        {/* Skärmläsare får varje ändring uppläst utan att sidan hoppar */}
        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>

        {dbError && (
          <p className="db-error" role="alert">
            {dbError}
          </p>
        )}

        {loading && <p className="loading">Hämtar allas svar…</p>}

        {/* Svaret på frågan ligger FÖRST, inte längst ned. Den som läser sidan
            linjärt med skärmläsare möter det direkt, i stället för att först
            behöva ta sig igenom kalenderns 42 knappar. */}
        {/* Rutan finns inte alls förrän den bär information. Svaret på frågan
            ligger då FÖRST på sidan, inte längst ned — den som läser linjärt
            med skärmläsare möter det direkt i stället för att först ta sig
            igenom kalenderns 42 knappar. */}
        {!loading && popular.ready && (
          <section className="best-times" aria-labelledby="topp-rubrik">
            <h2 id="topp-rubrik" tabIndex={-1}>
              Populäraste tiderna
            </h2>
            <p className="best-times-help">
              Tider som minst {MIN_OVERLAP} kan. Tryck på en för att markera att du också kan.
            </p>
            <ol className="top-list">
              {popular.shown.map(([key, count]) => {
                const selected = mySlots.includes(key)
                const [dateLabel, slotId] = key.split('|')
                const d = DATES.find((x) => x.label === dateLabel)
                const s = TIME_SLOTS.find((x) => x.id === slotId)
                const blocked = d && s ? blockReason(d.date, s, deadlineAt) : 'passerat'
                const reason = blocked === 'passerat'
                  ? ' Tiden har passerat.'
                  : blocked === 'fore-deadline'
                    ? ' Tiden ligger före deadline.'
                    : ''
                return (
                  <li key={key} className="top-time">
                    <button
                      type="button"
                      className={`top-button ${selected ? 'selected' : ''}`}
                      aria-pressed={selected}
                      aria-label={`${spokenSlot(key)}. ${count} av ${people.length} kan.${reason}`}
                      disabled={Boolean(blocked) || deadlinePassed}
                      onClick={() => toggleFromTop(key)}
                      {...tipHandlers(readableSlot(key), whoCan(dateLabel, slotId))}
                    >
                      <span aria-hidden="true" className="slot-name">
                        {selected && <span className="checkmark">✓ </span>}
                        {readableSlot(key)}
                      </span>
                      <span aria-hidden="true" className="slot-status">
                        {count} av {people.length} kan
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
            {popular.qualifying.length > popular.shown.length && (
              <p className="best-times-note">
                Visar {popular.shown.length} av {popular.qualifying.length} tider som minst{' '}
                {MIN_OVERLAP} kan.
              </p>
            )}
          </section>
        )}

        {!deadline && !loading && (
          <section className="deadline-setup" aria-labelledby="deadline-rubrik">
            <h2 id="deadline-rubrik" tabIndex={-1}>
              Sätt deadline för röstning
            </h2>
            <p id="deadline-hjalp">När deadline passerats går det inte längre att ändra sina tider.</p>
            <div className="deadline-form">
              <div className="field">
                <label htmlFor="deadline-datum">Datum</label>
                <input
                  id="deadline-datum"
                  type="date"
                  className="deadline-input"
                  min={toDateInputValue(new Date())}
                  max={toDateInputValue(DATES[DATES.length - 1].date)}
                  value={deadlineDate}
                  aria-describedby="deadline-hjalp"
                  onChange={(e) => setDeadlineDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="deadline-tid">Klockslag</label>
                <select
                  id="deadline-tid"
                  className="deadline-input"
                  value={deadlineHour}
                  onChange={(e) => setDeadlineHour(e.target.value)}
                >
                  <option value="12">12:00</option>
                  <option value="18">18:00</option>
                  <option value="20">20:00</option>
                  <option value="22">22:00</option>
                  <option value="23">23:00</option>
                </select>
              </div>
              <button type="button" onClick={saveDeadline} className="deadline-submit">
                Sätt deadline
              </button>
            </div>
          </section>
        )}

        {deadline && (
          <section className={`deadline-info ${deadlinePassed ? 'passed' : ''}`} aria-labelledby="deadline-status">
            <h2 id="deadline-status" className="sr-only">
              Deadline
            </h2>
            <p>
              Deadline: {new Date(deadline.time).toLocaleString('sv-SE')} (satt av {deadline.setBy})
            </p>
            {deadlinePassed && <p className="deadline-alert">Röstningen är stängd.</p>}
            <button type="button" className="link-button" onClick={resetDeadline}>
              Ta bort deadline
            </button>
          </section>
        )}

        <section id="kalender" aria-labelledby="kalender-rubrik" className="poll">
          <h2 id="kalender-rubrik" tabIndex={-1}>
            Välj de tider du kan
          </h2>
          <p className="poll-help">Markera de tider du kan. Du kan ändra fram till deadline.</p>

          <fieldset className="view-toggle">
            <legend>Visa kalendern som</legend>
            <label>
              <input
                type="radio"
                name="vy"
                value="rutnat"
                checked={view === 'rutnat'}
                onChange={() => changeView('rutnat')}
              />
              Rutnät
            </label>
            <label>
              <input
                type="radio"
                name="vy"
                value="lista"
                checked={view === 'lista'}
                onChange={() => changeView('lista')}
              />
              Lista, en dag i taget
            </label>
          </fieldset>

          {/* Egen landmark, så att skärmläsaren kan hoppa hit direkt (D i NVDA)
              i stället för att passera 14 celler för att nå nästa vecka. */}
          <nav className="week-nav" aria-label="Hoppa till vecka">
            <ul>
              {WEEKS.map((w) => (
                <li key={w.id}>
                  <a href={`#${w.id}`}>{w.label}</a>
                </li>
              ))}
            </ul>
          </nav>

          {WEEKS.map((w) => (
            <div key={w.id} className="week-section">
              {/* Rubrik i BÅDA vyerna, inte <caption>: en rubrik går att hoppa
                  till med H, och dyker upp i skärmläsarens rubriklista. */}
              <h3 className="week-title" id={w.id} tabIndex={-1}>
                {w.label}
              </h3>

              {view === 'rutnat' ? (
                <table className="availability-table" aria-labelledby={w.id}>
                  <thead>
                    <tr>
                      <th scope="col">Tid</th>
                      {w.dates.map((d) => (
                        <th scope="col" key={d.label}>
                          {d.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {TIME_SLOTS.map((slot) => (
                      <tr key={slot.id}>
                        <th scope="row" className="time-label">
                          {slot.label}
                          <span className="time-range"> {slot.range}</span>
                        </th>
                        {w.dates.map((d) => {
                          const c = cellState(d, slot)
                          return (
                            <td key={`${d.label}-${slot.id}`} className="time-cell-wrap">
                              <button
                                type="button"
                                className={`time-cell ${c.selected ? 'selected' : ''} ${c.disabled ? 'disabled' : ''}`}
                                aria-pressed={c.selected}
                                aria-label={c.label}
                                disabled={c.disabled}
                                onClick={() => toggleTime(d, slot)}
                                {...tipHandlers(`${d.label}, ${slot.label} ${slot.range}`, c.available)}
                                style={
                                  !c.selected && !c.disabled && c.shade > 0
                                    ? { backgroundColor: `rgba(22, 101, 52, ${0.08 + c.shade * 0.22})` }
                                    : undefined
                                }
                              >
                                <span aria-hidden="true" className="cell-content">
                                  {c.selected && <span className="checkmark">✓</span>}
                                  {c.blocked && !c.selected && <span className="locked">–</span>}
                                  {c.available.length > 0 && (
                                    <span className="count">{c.available.length}</span>
                                  )}
                                </span>
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <ul className="day-list">
                  {w.dates.map((d) => (
                    <li key={d.label} className="day-item">
                      <h4 className="day-heading">{d.label}</h4>
                      <ul className="day-slots">
                        {TIME_SLOTS.map((slot) => {
                          const c = cellState(d, slot)
                          return (
                            <li key={slot.id}>
                              <button
                                type="button"
                                className={`slot-button ${c.selected ? 'selected' : ''}`}
                                aria-pressed={c.selected}
                                aria-label={c.label}
                                disabled={c.disabled}
                                onClick={() => toggleTime(d, slot)}
                                {...tipHandlers(`${d.label}, ${slot.label} ${slot.range}`, c.available)}
                              >
                                <span aria-hidden="true" className="slot-name">
                                  {c.selected && <span className="checkmark">✓ </span>}
                                  {slot.label} {slot.range}
                                </span>
                                <span aria-hidden="true" className="slot-status">
                                  {c.blocked === 'passerat'
                                    ? 'passerat'
                                    : c.blocked === 'fore-deadline'
                                      ? 'före deadline'
                                      : c.available.length > 0
                                        ? `${c.available.length} av ${people.length} kan`
                                        : 'ingen än'}
                                </span>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>

        <section className="summary" aria-labelledby="deltagare-rubrik">
          <h2 id="deltagare-rubrik" tabIndex={-1}>
            Deltagare ({people.length})
          </h2>
          {people.length === 0 && !loading && <p>Ingen har anmält sig än.</p>}
          <ul className="participants-grid">
            {people.map((person) => {
              const slots = sortSlotKeys(person.slots || [], DATES).map(readableSlot)
              return (
                <li key={person.id} className="participant-card">
                  <h3 className="participant-name" id={`deltagare-${person.id}`} tabIndex={-1}>
                    {person.name}
                    {person.id === personId(submittedName) && <span className="you-badge"> (du)</span>}
                  </h3>
                  {slots.length > 0 ? (
                    <>
                      <p className="participant-times">Kan {slots.length} tider</p>
                      <ul className="participant-slots">
                        {slots.map((slotLabel) => (
                          <li key={slotLabel}>{slotLabel}</li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="participant-times participant-none">Har inte markerat någon tid</p>
                  )}
                  <div className="participant-actions">
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => handleClearPerson(person)}
                      disabled={slots.length === 0}
                    >
                      Nollställ tider<span className="sr-only"> för {person.name}</span>
                    </button>
                    <button
                      type="button"
                      className="link-button danger"
                      onClick={() => handleRemovePerson(person)}
                    >
                      Ta bort<span className="sr-only"> {person.name}</span>
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="admin" aria-labelledby="admin-rubrik">
          <h2 id="admin-rubrik">Hantera</h2>
          <p>Åtgärderna nedan gäller alla och går inte att ångra.</p>
          <div className="admin-actions">
            <button type="button" className="danger-button" onClick={resetDeadline} disabled={!deadline}>
              Ta bort deadline
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={handleClearEverything}
              disabled={people.length === 0 && !deadline}
            >
              Rensa allt
            </button>
          </div>
        </section>

        <p className="disclaimer">
          Tider innan deadline går inte att välja. Allas svar sparas gemensamt och syns direkt hos de
          andra.
        </p>
      </main>

      {/* aria-hidden: knappens aria-label innehåller redan namnen, så utan detta
          skulle skärmläsaren läsa upp dem två gånger. Rutan är alltså en rent
          visuell komplettering för seende — informationspariteten fanns redan. */}
      {tip && (
        <div className="who-tip" aria-hidden="true" style={{ left: tip.x, top: tip.y }}>
          <span className="who-tip-heading">{tip.heading}</span>
          <span className="who-tip-names">{tip.names}</span>
        </div>
      )}

      <SiteFooter />
    </>
  )
}

export default App
