import { useState, useEffect } from 'react'
import './App.css'

const DATES = [
  'Fre 31 jul',
  'Lör 1 aug',
  'Sön 2 aug',
  'Fre 7 aug',
  'Lör 8 aug',
  'Sön 9 aug',
  'Fre 14 aug',
  'Lör 15 aug',
  'Sön 16 aug',
]

const TIME_SLOTS = ['Eftermiddag (12-17)', 'Kväll (17-21)']

function App() {
  const [name, setName] = useState('')
  const [responses, setResponses] = useState({})
  const [submittedName, setSubmittedName] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem('rehearsal_responses')
    if (saved) {
      setResponses(JSON.parse(saved))
    }
  }, [])

  const handleNameSubmit = () => {
    if (name.trim()) {
      setSubmittedName(name.trim())
      setName('')
    }
  }

  const toggleTime = (date, time) => {
    const key = `${submittedName}|${date}|${time}`
    const newResponses = { ...responses }
    if (newResponses[key]) {
      delete newResponses[key]
    } else {
      newResponses[key] = true
    }
    setResponses(newResponses)
    localStorage.setItem('rehearsal_responses', JSON.stringify(newResponses))
  }

  const getAvailability = (date, time) => {
    return Object.keys(responses).filter(k => k.endsWith(`${date}|${time}`)).length
  }

  const getParticipants = () => {
    const participants = new Set()
    Object.keys(responses).forEach(key => {
      const [name] = key.split('|')
      participants.add(name)
    })
    return Array.from(participants)
  }

  const getMaxAvailability = () => {
    let max = 0
    DATES.forEach(date => {
      TIME_SLOTS.forEach(time => {
        max = Math.max(max, getAvailability(date, time))
      })
    })
    return max
  }

  const maxAvail = getMaxAvailability()

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

      <div className="poll">
        <table className="availability-table">
          <thead>
            <tr>
              <th>Tid</th>
              {DATES.map(date => (
                <th key={date}>{date}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TIME_SLOTS.map(time => (
              <tr key={time}>
                <td className="time-label">{time}</td>
                {DATES.map(date => {
                  const isSelected = responses[`${submittedName}|${date}|${time}`]
                  const availability = getAvailability(date, time)
                  const intensity = maxAvail > 0 ? availability / maxAvail : 0
                  return (
                    <td
                      key={`${date}-${time}`}
                      onClick={() => toggleTime(date, time)}
                      className={`time-cell ${isSelected ? 'selected' : ''}`}
                      style={{
                        backgroundColor: isSelected
                          ? '#10b981'
                          : intensity > 0
                          ? `rgba(34, 197, 94, ${intensity * 0.5})`
                          : 'transparent',
                      }}
                    >
                      <div className="cell-content">
                        {isSelected && <span className="checkmark">✓</span>}
                        {availability > 0 && (
                          <span className="count">{availability}</span>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="summary">
        <h2>Deltagare ({getParticipants().length})</h2>
        <div className="participants-list">
          {getParticipants().map(p => (
            <span key={p} className="participant-tag">
              {p}
            </span>
          ))}
        </div>

        {maxAvail > 0 && (
          <div className="best-times">
            <h2>Bästa tider</h2>
            <ul>
              {DATES.map(date => {
                const bestTimes = TIME_SLOTS.filter(
                  time => getAvailability(date, time) === maxAvail
                )
                if (bestTimes.length > 0) {
                  return (
                    <li key={date}>
                      <strong>{date}:</strong> {bestTimes.join(', ')} ({maxAvail} personer)
                    </li>
                  )
                }
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
