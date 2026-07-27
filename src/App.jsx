import { useState, useEffect, useRef } from 'react'
import './App.css'

// id måste vara oförändrat — det är nyckeln i localStorage sedan tidigare versioner
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

function App() {
  const [nameDraft, setNameDraft] = useState('')
  const [responses, setResponses] = useState({})
  const [people, setPeople] = useState([])
  const [submittedName, setSubmittedName] = useState('')
  const [deadline, setDeadline] = useState(null)
  const [announcement, setAnnouncement] = useState('')
  const [nameError, setNameError] = useState('')

  const DATES = useRef(generateDates()).current
  const nameInputRef = useRef(null)
  // Håller alltid färskaste svaren, även före omrendering — annars kan två
  // markeringar i samma render-batch skriva över varandra.
  const responsesRef = useRef({})

  const [deadlineDate, setDeadlineDate] = useState(() => toDateInputValue(new Date()))
  const [deadlineHour, setDeadlineHour] = useState('18')

  useEffect(() => {
    const saved = localStorage.getItem('rehearsal_responses')
    const savedDeadline = localStorage.getItem('rehearsal_deadline')
    const savedPeople = localStorage.getItem('rehearsal_people')
    if (saved) {
      const parsed = JSON.parse(saved)
      responsesRef.current = parsed
      setResponses(parsed)
    }
    if (savedDeadline) setDeadline(JSON.parse(savedDeadline))
    if (savedPeople) {
      setPeople(JSON.parse(savedPeople))
    } else if (saved) {
      // migrera: härled deltagare ur gamla svar
      const derived = [...new Set(Object.keys(JSON.parse(saved)).map((k) => k.split('|')[0]))]
      setPeople(derived)
      localStorage.setItem('rehearsal_people', JSON.stringify(derived))
    }
  }, [])

  const persistResponses = (next) => {
    responsesRef.current = next
    setResponses(next)
    localStorage.setItem('rehearsal_responses', JSON.stringify(next))
  }

  const persistPeople = (next) => {
    setPeople(next)
    localStorage.setItem('rehearsal_people', JSON.stringify(next))
  }

  const handleNameSubmit = () => {
    const trimmed = nameDraft.trim()
    if (!trimmed) {
      setNameError('Skriv ditt namn för att fortsätta.')
      nameInputRef.current?.focus()
      return
    }
    setNameError('')
    setSubmittedName(trimmed)
    setNameDraft('')
    if (!people.includes(trimmed)) persistPeople([...people, trimmed])
  }

  const saveDeadline = () => {
    const dl = new Date(`${deadlineDate}T00:00:00`)
    dl.setHours(Number(deadlineHour), 0, 0, 0)
    const value = { time: dl.toISOString(), setBy: submittedName }
    setDeadline(value)
    localStorage.setItem('rehearsal_deadline', JSON.stringify(value))
    setAnnouncement(`Deadline satt till ${dl.toLocaleString('sv-SE')}.`)
  }

  const resetDeadline = () => {
    if (!window.confirm('Ta bort deadline? Röstningen öppnas då igen och någon kan sätta en ny.')) return
    setDeadline(null)
    localStorage.removeItem('rehearsal_deadline')
    setDeadlineDate(toDateInputValue(new Date()))
    setDeadlineHour('18')
    setAnnouncement('Deadline borttagen. Röstningen är öppen igen.')
  }

  const removePerson = (person) => {
    if (!window.confirm(`Ta bort ${person} och alla deras markerade tider?`)) return
    const next = Object.fromEntries(
      Object.entries(responsesRef.current).filter(([key]) => key.split('|')[0] !== person)
    )
    persistResponses(next)
    persistPeople(people.filter((p) => p !== person))
    if (person === submittedName) setSubmittedName('')
    setAnnouncement(`${person} är borttagen.`)
  }

  const clearPersonAnswers = (person) => {
    if (!window.confirm(`Nollställ alla tider för ${person}? Personen finns kvar i listan.`)) return
    const next = Object.fromEntries(
      Object.entries(responsesRef.current).filter(([key]) => key.split('|')[0] !== person)
    )
    persistResponses(next)
    setAnnouncement(`Alla tider nollställda för ${person}.`)
  }

  const clearEverything = () => {
    if (!window.confirm('Rensa allt: alla deltagare, alla tider och deadline. Går inte att ångra. Fortsätt?')) return
    persistResponses({})
    persistPeople([])
    setDeadline(null)
    localStorage.removeItem('rehearsal_deadline')
    setSubmittedName('')
    setAnnouncement('Allt är rensat.')
  }

  const toggleTime = (dateEntry, slot) => {
    const key = `${submittedName}|${dateEntry.label}|${slot.id}`
    const next = { ...responsesRef.current }
    const wasSelected = Boolean(next[key])
    if (wasSelected) delete next[key]
    else next[key] = true
    persistResponses(next)

    const count = countAvailable(dateEntry.label, slot.id, next)
    setAnnouncement(
      wasSelected
        ? `Avmarkerat: ${dateEntry.spoken}, ${slot.label} ${slot.range}. Nu kan ${count} av ${people.length}.`
        : `Markerat: ${dateEntry.spoken}, ${slot.label} ${slot.range}. Nu kan ${count} av ${people.length}.`
    )
  }

  const countAvailable = (dateLabel, slotId, source = responses) =>
    Object.keys(source).filter((k) => {
      const [, d, t] = k.split('|')
      return d === dateLabel && t === slotId
    }).length

  const whoCan = (dateLabel, slotId) =>
    Object.keys(responses)
      .filter((k) => {
        const [, d, t] = k.split('|')
        return d === dateLabel && t === slotId
      })
      .map((k) => k.split('|')[0])

  const slotsForPerson = (person) =>
    Object.keys(responses)
      .filter((k) => k.split('|')[0] === person)
      .map((k) => {
        const [, dateLabel, slotId] = k.split('|')
        const slot = TIME_SLOTS.find((s) => s.id === slotId)
        return `${dateLabel}, ${slot ? `${slot.label} ${slot.range}` : slotId}`
      })

  const getTopThreeTimes = () => {
    const tally = new Map()
    Object.keys(responses).forEach((key) => {
      const [, dateLabel, slotId] = key.split('|')
      const slot = TIME_SLOTS.find((s) => s.id === slotId)
      const label = `${dateLabel}, ${slot ? `${slot.label} ${slot.range}` : slotId}`
      tally.set(label, (tally.get(label) || 0) + 1)
    })
    return [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  }

  if (!submittedName) {
    return (
      <main className="app">
        <div className="intro">
          <h1>Greedy Thiefs repetitionstid</h1>
          <p>Hitta en gemensam tid för nästa rep.</p>
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
            <button type="button" className="change-user" onClick={() => setSubmittedName('')}>
              Byt namn
            </button>
          </div>
        </div>

        {/* Skärmläsare får varje ändring uppläst utan att sidan hoppar */}
        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>

        {!deadline && (
          <section className="deadline-setup" aria-labelledby="deadline-rubrik">
            <h2 id="deadline-rubrik">Sätt deadline för röstning</h2>
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
            att välja.
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
                          const selected = Boolean(responses[`${submittedName}|${d.label}|${slot.id}`])
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
                          const label = [
                            `${d.spoken}, ${slot.label} ${slot.range}.`,
                            selected ? 'Du kan.' : 'Du har inte markerat.',
                            available.length > 0
                              ? `${available.length} av ${people.length} kan: ${available.join(', ')}.`
                              : 'Ingen har markerat än.',
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
          <h2 id="deltagare-rubrik">Deltagare ({people.length})</h2>
          {people.length === 0 && <p>Ingen har anmält sig än.</p>}
          <ul className="participants-grid">
            {people.map((person) => {
              const slots = slotsForPerson(person)
              return (
                <li key={person} className="participant-card">
                  <h3 className="participant-name">
                    {person}
                    {person === submittedName && <span className="you-badge"> (du)</span>}
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
                    <p className="participant-times participant-none">
                      Har inte markerat någon tid
                    </p>
                  )}
                  <div className="participant-actions">
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => clearPersonAnswers(person)}
                      disabled={slots.length === 0}
                    >
                      Nollställ tider<span className="sr-only"> för {person}</span>
                    </button>
                    <button type="button" className="link-button danger" onClick={() => removePerson(person)}>
                      Ta bort<span className="sr-only"> {person}</span>
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
              {topTimes.map(([slotLabel, count]) => (
                <li key={slotLabel} className="top-time">
                  {slotLabel} — {count} av {people.length} kan
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="admin" aria-labelledby="admin-rubrik">
          <h2 id="admin-rubrik">Hantera</h2>
          <p>Åtgärderna nedan går inte att ångra.</p>
          <div className="admin-actions">
            <button type="button" className="danger-button" onClick={resetDeadline} disabled={!deadline}>
              Ta bort deadline
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={clearEverything}
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
