import { useState, useEffect } from 'react'
import './App.css'

const TIME_SLOTS = ['Eftermiddag (12-17)', 'Kväll (17-21)']

function generateDates() {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const daysUntilMonday = dayOfWeek === 1 ? 0 : (dayOfWeek === 0 ? 1 : 8 - dayOfWeek)
  const monday = new Date(today)
  monday.setDate(today.getDate() + daysUntilMonday)

  const dates = []
  const dayNames = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör']
  const monthNames = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

  for (let i = 0; i < 21; i++) {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    const dayName = dayNames[date.getDay()]
    const day = date.getDate()
    const month = monthNames[date.getMonth()]
    dates.push({ label: `${dayName} ${day} ${month}`, date })
  }
  return dates
}

function canBook(dateObj, timeSlot) {
  const now = new Date()
  const [start] = timeSlot.match(/\d+/g)
  const startHour = parseInt(start)

  const bookDate = new Date(dateObj)
  bookDate.setHours(startHour, 0, 0, 0)

  return bookDate > now
}

function App() {
  const [name, setName] = useState('')
  const [responses, setResponses] = useState({})
  const [submittedName, setSubmittedName] = useState('')
  const [deadline, setDeadline] = useState(null)
  const [deadlineTime, setDeadlineTime] = useState('')

  const DATES = generateDates()

  useEffect(() => {
    const saved = localStorage.getItem('rehearsal_responses')
    const savedDeadline = localStorage.getItem('rehearsal_deadline')
    if (saved) {
      setResponses(JSON.parse(saved))
    }
    if (savedDeadline) {
      setDeadline(JSON.parse(savedDeadline))
    }
  }, [])

  const handleNameSubmit = () => {
    if (name.trim()) {
      setSubmittedName(name.trim())
      setName('')
      if (!deadline) {
        setDeadlineTime('')
      }
    }
  }

  const setDeadlineHandler = (date, hours) => {
    const deadlineDate = new Date(date)
    deadlineDate.setHours(hours, 0, 0, 0)
    const dl = { time: deadlineDate.toISOString(), setBy: submittedName }
    setDeadline(dl)
    localStorage.setItem('rehearsal_deadline', JSON.stringify(dl))
  }

  const getMinDeadlineDate = () => {
    const min = new Date()
    min.setHours(23, 59, 59, 999)
    return min.toISOString().split('T')[0]
  }

  const getMaxDeadlineDate = () => {
    const max = new Date(DATES[DATES.length - 1].date)
    max.setHours(23, 59, 59, 999)
    return max.toISOString().split('T')[0]
  }

  const toggleTime = (dateObj, time) => {
    const dateLabel = DATES.find(d => d.date.getTime() === dateObj.getTime())?.label
    const key = `${submittedName}|${dateLabel}|${time}`
    const newResponses = { ...responses }
    if (newResponses[key]) {
      delete newResponses[key]
    } else {
      newResponses[key] = true
    }
    setResponses(newResponses)
    localStorage.setItem('rehearsal_responses', JSON.stringify(newResponses))
  }

  const getAvailability = (dateLabel, time) => {
    return Object.keys(responses).filter(k => k.endsWith(`${dateLabel}|${time}`)).length
  }

  const getParticipants = () => {
    const participants = new Map()
    Object.keys(responses).forEach(key => {
      const [name, dateLabel, time] = key.split('|')
      if (!participants.has(name)) {
        participants.set(name, [])
      }
      participants.get(name).push(`${dateLabel} ${time}`)
    })
    return participants
  }

  const getTopThreeTimes = () => {
    const availability = new Map()
    Object.keys(responses).forEach(key => {
      const [, dateLabel, time] = key.split('|')
      const slotKey = `${dateLabel} ${time}`
      availability.set(slotKey, (availability.get(slotKey) || 0) + 1)
    })
    return Array.from(availability.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
  }

  if (!submittedName) {
    return (
      <div className="app">
        <div className="intro">
          <h1>🎸 Greedy Thiefs Repetionstid</h1>
          <p>Hitta en gemensam tid för nästa repetition!</p>
          <div className="name-input">
            <input
              type="text"
              placeholder="Ditt namn"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleNameSubmit()}
            />
            <button onClick={handleNameSubmit}>Börja</button>
          </div>
        </div>
      </div>
    )
  }

  const participants = getParticipants()
  const topTimes = getTopThreeTimes()
  const deadlinePassed = deadline && new Date(deadline.time) < new Date()

  return (
    <div className="app">
      <div className="header">
        <h1>🎸 Greedy Thiefs Repetionstid</h1>
        <div className="participant-info">
          <p className="current-user">Du: <strong>{submittedName}</strong></p>
          <button className="change-user" onClick={() => setSubmittedName('')}>
            Byt namn
          </button>
        </div>
      </div>

      {!deadline && (
        <div className="deadline-setup">
          <h2>Sätt deadline för röstning</h2>
          <p>Första personen sätter när röstningen stänger</p>
          <div className="deadline-form">
            <input
              type="date"
              id="deadline-date"
              min={getMinDeadlineDate()}
              max={getMaxDeadlineDate()}
              defaultValue={new Date().toISOString().split('T')[0]}
              className="deadline-input"
            />
            <select id="deadline-time" className="deadline-input" defaultValue="18">
              <option value="18">18:00</option>
              <option value="20">20:00</option>
              <option value="22">22:00</option>
              <option value="23">23:00</option>
            </select>
            <button
              onClick={() => {
                const date = document.getElementById('deadline-date').value
                const time = document.getElementById('deadline-time').value
                setDeadlineHandler(date, parseInt(time))
              }}
              className="deadline-submit"
            >
              Sätt deadline
            </button>
          </div>
        </div>
      )}

      {deadline && (
        <div className={`deadline-info ${deadlinePassed ? 'passed' : ''}`}>
          <p>Deadline: {new Date(deadline.time).toLocaleString('sv-SE')} (satt av {deadline.setBy})</p>
          {deadlinePassed && <p className="deadline-alert">⏰ Röstningen är stängd!</p>}
        </div>
      )}

      <div className="poll">
        {[0, 1, 2].map(weekIndex => {
          const weekDates = DATES.slice(weekIndex * 7, (weekIndex + 1) * 7)
          const weekStart = weekDates[0]?.label || ''
          const weekEnd = weekDates[weekDates.length - 1]?.label || ''

          return (
            <div key={weekIndex} className="week-section">
              <h3 className="week-title">Vecka {weekIndex + 1}: {weekStart} — {weekEnd}</h3>
              <table className="availability-table">
                <thead>
                  <tr>
                    <th>Tid</th>
                    {weekDates.map(d => (
                      <th key={d.label}>{d.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TIME_SLOTS.map(time => (
                    <tr key={time}>
                      <td className="time-label">{time}</td>
                      {weekDates.map(d => {
                        const isSelected = responses[`${submittedName}|${d.label}|${time}`]
                        const availability = getAvailability(d.label, time)
                        const canBookThisSlot = canBook(d.date, time)
                        const isDisabled = !canBookThisSlot || deadlinePassed

                        return (
                          <td
                            key={`${d.label}-${time}`}
                            onClick={() => !isDisabled && toggleTime(d.date, time)}
                            className={`time-cell ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                            style={{
                              backgroundColor: isDisabled
                                ? '#e5e7eb'
                                : isSelected
                                ? '#10b981'
                                : availability > 0
                                ? `rgba(34, 197, 94, ${Math.min(availability / (participants.size || 1), 1) * 0.5})`
                                : 'transparent',
                              cursor: isDisabled ? 'not-allowed' : 'pointer',
                              opacity: isDisabled ? 0.6 : 1,
                            }}
                          >
                            <div className="cell-content">
                              {isSelected && <span className="checkmark">✓</span>}
                              {availability > 0 && <span className="count">{availability}</span>}
                              {isDisabled && !canBookThisSlot && <span className="locked">🔒</span>}
                            </div>
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
      </div>

      <div className="summary">
        <h2>Deltagare ({participants.size})</h2>
        <div className="participants-grid">
          {Array.from(participants.entries()).map(([name, times]) => (
            <div key={name} className="participant-card">
              <p className="participant-name">{name}</p>
              <p className="participant-times">{times.length} gånger markerad</p>
              <ul className="participant-slots">
                {times.slice(0, 3).map((slot, i) => (
                  <li key={i}>{slot}</li>
                ))}
                {times.length > 3 && <li>... +{times.length - 3}</li>}
              </ul>
            </div>
          ))}
        </div>

        {topTimes.length > 0 && (
          <div className="best-times">
            <h2>🏆 Top 3 tider</h2>
            <ul>
              {topTimes.map(([slot, count], i) => (
                <li key={i} className="top-time">
                  <strong>#{i + 1}</strong> {slot} — {count} personer
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
