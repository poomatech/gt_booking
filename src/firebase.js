// Firebase-anslutning mot SAMMA projekt som mobil-/budget-/RSS-apparna:
// "byggatexteer". Till skillnad från de apparna kräver den HÄR appen INGEN
// inloggning — hela poängen är att bandet ska kunna klicka på en länk och kryssa
// i tider. Därför ligger allt i egna collections med prefix `gt_`, som är de enda
// som är öppna i Firestore-reglerna (se firestore.rules i repot). Övriga
// collections är fortsatt låsta till poomap@gmail.com.
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  collection,
  onSnapshot,
  setDoc,
  deleteDoc,
  getDocs,
  writeBatch,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";

// Samma nycklar som qnotes_budget/src/firebase.js (project: byggatexteer).
// Webb-API-nyckeln är publik by design; skyddet ligger i säkerhetsreglerna.
const firebaseConfig = {
  apiKey: "AIzaSyBjuHVbk-3bRC8NmwtsTPsKBmi0a-1qu0M",
  authDomain: "byggatexteer.firebaseapp.com",
  projectId: "byggatexteer",
  storageBucket: "byggatexteer.firebasestorage.app",
  messagingSenderId: "564868803946",
  appId: "1:564868803946:web:9db946962467f509d38913",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// ── Datamodell ───────────────────────────────────────────────────────
// gt_booking_people/{personId}  ->  { id, name, slots: ["Fre 31 jul|Kväll (17-21)", ...] }
// gt_booking_state/state        ->  { deadline: { time, setBy } | null }
//
// EN DOC PER PERSON, inte ett gemensamt dokument. Två som röstar samtidigt från
// olika telefoner skriver då aldrig över varandra. Själva tiderna läggs till och
// tas bort med arrayUnion/arrayRemove, som är atomiska server-side — så även två
// snabba klick i samma sekund från olika håll hamnar båda rätt.
const PEOPLE = collection(db, "gt_booking_people");
const STATE = doc(db, "gt_booking_state", "state");

// Namnet blir dokument-id, så att man återfår sina kryss om man skriver samma
// namn igen (även från en annan webbläsare). Gemener => "Anna" och "anna" är
// samma person. Firestore-id:n får inte innehålla "/" och inte vara "." / "..".
export function personId(name) {
  const slug = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "namnlos";
}

export function subscribePeople(onData, onError) {
  return onSnapshot(
    PEOPLE,
    (snap) => onData(snap.docs.map((d) => d.data())),
    onError
  );
}

export function subscribeState(onData, onError) {
  return onSnapshot(
    STATE,
    (snap) => onData(snap.exists() ? snap.data() : {}),
    onError
  );
}

// Registrera deltagaren utan att röra tiderna — den som skriver sitt namn syns i
// listan direkt, även innan hen kryssat i något. `arrayUnion()` HELT UTAN
// argument är avsiktligt: union med tomma mängden skapar fältet som [] om det
// saknas, men lämnar en befintlig lista orörd. Skriver man `slots: []` här
// raderas i stället allas tidigare kryss varje gång de öppnar sidan.
export function joinPerson(name) {
  const id = personId(name);
  return setDoc(
    doc(PEOPLE, id),
    { id, name: String(name).trim(), slots: arrayUnion(), updatedAt: Date.now() },
    { merge: true }
  );
}

export function addSlot(name, slotKey) {
  const id = personId(name);
  return setDoc(
    doc(PEOPLE, id),
    { id, name: String(name).trim(), slots: arrayUnion(slotKey), updatedAt: Date.now() },
    { merge: true }
  );
}

export function removeSlot(name, slotKey) {
  const id = personId(name);
  return setDoc(
    doc(PEOPLE, id),
    { slots: arrayRemove(slotKey), updatedAt: Date.now() },
    { merge: true }
  );
}

// Nollställ en persons tider men behåll personen i listan.
export function clearPersonSlots(name) {
  const id = personId(name);
  return setDoc(doc(PEOPLE, id), { slots: [], updatedAt: Date.now() }, { merge: true });
}

export function deletePerson(name) {
  return deleteDoc(doc(PEOPLE, personId(name)));
}

export function writeDeadline(value) {
  return setDoc(STATE, { deadline: value }, { merge: true });
}

export async function clearAll() {
  const snap = await getDocs(PEOPLE);
  for (let i = 0; i < snap.docs.length; i += 450) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await writeDeadline(null);
}
