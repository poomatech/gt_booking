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

function isInPast(dateObj, slot) {
  const start = new Date(dateObj)
  start.setHours(slot.startHour, 0, 0, 0)
  return start <= new Date()
}

function toDateInputValue(date) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const slotKey = (dateLabel, slotId) => `${dateLabel}|${slotId}`

// Sorterar tider KRONOLOGISKT. En rak .sort() på nycklarna ger alfabetisk
// ordning ("Lör 15 aug" före "Lör 8 aug", "Mån" före "Ons"), vilket är obegripligt
// att lyssna sig igenom. Ordningen hämtas i stället från kalenderns egen följd.
function sortSlotKeys(keys, dates) {
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

  const DATES = useRef(generateDates()).current
  const nameInputRef = useRef(null)
  const hasLoadedOnce = useRef(false)

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
        setAnnouncement(
          list.length === 0
            ? 'Inläst. Ingen har anmält sig än.'
            : `Inläst. ${list.length} deltagare.`
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
    document.getElementById(focusRequest)?.focus()
    setFocusRequest(null)
  }, [focusRequest, people, deadline, submittedName])

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

  const getTopThreeTimes = () => {
    const tally = new Map()
    people.forEach((p) => {
      ;(p.slots || []).forEach((key) => tally.set(key, (tally.get(key) || 0) + 1))
    })
    // Flest röster först. Vid lika många vinner det tidigaste datumet — annars
    // avgörs ordningen av godtycklig insättningsordning i Map:en.
    const chronological = sortSlotKeys([...tally.keys()], DATES)
    return chronological
      .map((key) => [key, tally.get(key)])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
  }

  if (!submittedName) {
    return (
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
    )
  }

  const topTimes = getTopThreeTimes()
  const deadlinePassed = deadline && new Date(deadline.time) < new Date()

  return (
    <>
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
          <h2 id="kalender-rubrik">Välj de tider du kan</h2>
          <p className="poll-help">
            Markera varje tid du kan. Du kan ändra dig fram till deadline. Tider som redan passerat går inte
            att välja. Allas svar sparas gemensamt och syns direkt hos de andra.
          </p>

          {[0, 1, 2].map((weekIndex) => {
            const weekDates = DATES.slice(weekIndex * 7, (weekIndex + 1) * 7)
            const weekLabel = `Vecka ${weekIndex + 1}: ${weekDates[0].label} till ${weekDates[6].label}`

            return (
              <div key={weekIndex} className="week-section">
                <table className="availability-table">
                  <caption className="week-title">{weekLabel}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Tid</th>
                      {weekDates.map((d) => (
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
                        {weekDates.map((d) => {
                          const selected = mySlots.includes(slotKey(d.label, slot.id))
                          const available = whoCan(d.label, slot.id)
                          const past = isInPast(d.date, slot)
                          const disabled = past || deadlinePassed
                          const shade =
                            people.length > 0 ? Math.min(available.length / people.length, 1) : 0

                          const reason = past
                            ? 'Tiden har passerat.'
                            : deadlinePassed
                              ? 'Röstningen är stängd.'
                              : ''
                          // Ditt EGET svar står inte i texten — aria-pressed säger
                          // redan "nedtryckt/ej nedtryckt". Att upprepa det här
                          // gör att skärmläsaren säger samma sak två gånger, i
                          // varje av de 42 cellerna.
                          const label = [
                            `${d.spoken}, ${slot.label} ${slot.range}.`,
                            available.length > 0
                              ? `${available.length} av ${people.length} kan: ${available.join(', ')}.`
                              : 'Ingen kan än.',
                            reason,
                          ]
                            .filter(Boolean)
                            .join(' ')

                          return (
                            <td key={`${d.label}-${slot.id}`} className="time-cell-wrap">
                              <button
                                type="button"
                                className={`time-cell ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
                                aria-pressed={selected}
                                aria-label={label}
                                disabled={disabled}
                                onClick={() => toggleTime(d, slot)}
                                style={
                                  !selected && !disabled && shade > 0
                                    ? { backgroundColor: `rgba(22, 101, 52, ${0.08 + shade * 0.22})` }
                                    : undefined
                                }
                              >
                                <span aria-hidden="true" className="cell-content">
                                  {selected && <span className="checkmark">✓</span>}
                                  {past && !selected && <span className="locked">–</span>}
                                  {available.length > 0 && <span className="count">{available.length}</span>}
                                </span>
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
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

        {topTimes.length > 0 && (
          <section className="best-times" aria-labelledby="topp-rubrik">
            <h2 id="topp-rubrik">Tre populäraste tiderna</h2>
            <ol>
              {topTimes.map(([key, count]) => (
                <li key={key} className="top-time">
                  {readableSlot(key)} — {count} av {people.length} kan
                </li>
              ))}
            </ol>
          </section>
        )}

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
      </main>
    </>
  )
}

export default App
