// The icons a person can put in front of a planner item or a folder: Lucide
// icons by their kebab-case name (lucide.dev), grouped for the picker. Only
// names – the server checks a chosen icon against them (lib/daybar/store.ts)
// and the browser loads the drawings when one shows
// (components/daybar/icon-set.tsx, item-icon.tsx).
export const ICON_GROUPS = [
  {
    id: "basics",
    names: ["star", "heart", "flag", "bookmark", "pin", "bell", "lightbulb", "target", "trophy", "award", "crown", "gem", "zap", "flame", "circle-check", "circle-alert", "clock", "alarm-clock", "timer", "hourglass", "calendar", "repeat"],
  },
  {
    id: "work",
    names: ["briefcase", "laptop", "monitor", "mail", "phone", "message-circle", "users", "user", "presentation", "chart-line", "chart-pie", "file-text", "folder", "clipboard-list", "list-todo", "building-2", "printer", "pen-line", "handshake", "rocket"],
  },
  {
    id: "home",
    names: ["house", "bed", "sofa", "lamp", "bath", "washing-machine", "wrench", "hammer", "paintbrush", "plug", "key", "trash-2", "shirt", "scissors", "package", "sprout", "flower-2", "trees"],
  },
  {
    id: "health",
    names: ["heart-pulse", "activity", "dumbbell", "bike", "footprints", "pill", "stethoscope", "syringe", "brain", "smile", "moon", "sun", "droplet", "apple"],
  },
  {
    id: "food",
    names: ["utensils", "coffee", "cup-soda", "wine", "beer", "pizza", "cake", "cookie", "carrot", "salad", "chef-hat", "shopping-cart", "shopping-bag", "store", "receipt"],
  },
  {
    id: "travel",
    names: ["plane", "car", "bus", "train-front", "ship", "map", "map-pin", "globe", "mountain", "tent", "luggage", "compass", "fuel"],
  },
  {
    id: "money",
    names: ["wallet", "credit-card", "banknote", "piggy-bank", "coins", "landmark", "percent", "chart-column"],
  },
  {
    id: "learning",
    names: ["book", "book-open", "graduation-cap", "notebook-pen", "music", "headphones", "guitar", "camera", "film", "tv", "gamepad-2", "palette", "puzzle", "code", "languages", "pen-tool"],
  },
  {
    id: "people",
    names: ["baby", "dog", "cat", "paw-print", "gift", "party-popper", "heart-handshake", "phone-call", "video", "person-standing"],
  },
  {
    id: "nature",
    names: ["cloud", "cloud-rain", "snowflake", "umbrella", "leaf", "tree-pine", "waves", "sunrise", "sunset", "mountain-snow"],
  },
] as const;

export type IconGroupId = (typeof ICON_GROUPS)[number]["id"];
export type IconName = (typeof ICON_GROUPS)[number]["names"][number];
export const ICON_NAMES: readonly IconName[] = ICON_GROUPS.flatMap((g) => g.names);
const KNOWN = new Set<string>(ICON_NAMES);
export const isIconName = (value: unknown): value is IconName => typeof value === "string" && KNOWN.has(value);
// "shopping-cart" → "ShoppingCart", the name lucide-react exports.
export const iconExport = (name: string) => name.replace(/(^|-)([a-z0-9])/g, (_, __, c: string) => c.toUpperCase());

// Icons to suggest for an item: from the words of its title (English and
// German), then the person's recent picks, then the kind's usual ones.
const WORDS: [string[], IconName][] = [
  [["call", "phone", "ring", "anruf", "anrufen", "telefon"], "phone"],
  [["mail", "email", "reply", "antwort", "antworten", "schreiben"], "mail"],
  [["meet", "meeting", "standup", "stand", "sync", "team", "besprechung", "treffen"], "users"],
  [["dentist", "doctor", "arzt", "zahnarzt", "physio", "therapy", "therapie", "clinic", "praxis"], "stethoscope"],
  [["pill", "medicine", "medikament", "tablette"], "pill"],
  [["gym", "workout", "training", "sport", "fitness"], "dumbbell"],
  [["run", "running", "jog", "walk", "laufen", "joggen", "spaziergang", "steps"], "footprints"],
  [["bike", "cycling", "fahrrad", "radfahren"], "bike"],
  [["lunch", "dinner", "breakfast", "brunch", "essen", "mittagessen", "abendessen", "frühstück", "restaurant"], "utensils"],
  [["coffee", "kaffee", "café", "cafe"], "coffee"],
  [["cook", "cooking", "kochen", "recipe", "rezept", "bake", "backen"], "chef-hat"],
  [["shop", "shopping", "buy", "groceries", "grocery", "kaufen", "einkaufen", "einkauf", "supermarkt"], "shopping-cart"],
  [["pay", "rent", "bill", "invoice", "miete", "rechnung", "zahlen", "bezahlen", "tax", "taxes", "steuer", "steuern"], "wallet"],
  [["bank", "budget", "money", "geld", "sparen", "savings"], "piggy-bank"],
  [["flight", "fly", "plane", "airport", "flug", "flughafen"], "plane"],
  [["trip", "travel", "vacation", "holiday", "urlaub", "reise", "pack", "packen", "koffer"], "luggage"],
  [["train", "bahn", "zug"], "train-front"],
  [["car", "auto", "drive", "fahren", "tanken", "fuel"], "car"],
  [["read", "book", "buch", "lesen", "study", "lernen", "exam", "prüfung"], "book-open"],
  [["course", "kurs", "class", "lecture", "vorlesung", "school", "schule", "uni", "university"], "graduation-cap"],
  [["write", "blog", "draft", "entwurf", "notes", "notiz"], "pen-line"],
  [["code", "deploy", "bug", "release", "merge", "review"], "code"],
  [["clean", "cleaning", "putzen", "laundry", "wäsche", "wash", "waschen"], "washing-machine"],
  [["fix", "repair", "reparieren", "reparatur"], "wrench"],
  [["plant", "plants", "garden", "garten", "water", "gießen", "pflanzen"], "sprout"],
  [["dog", "hund", "gassi"], "dog"],
  [["cat", "katze"], "cat"],
  [["birthday", "geburtstag", "party", "feier"], "cake"],
  [["gift", "geschenk", "present"], "gift"],
  [["music", "musik", "guitar", "gitarre", "piano", "klavier", "practice", "üben"], "music"],
  [["photo", "photos", "foto", "fotos", "camera", "kamera"], "camera"],
  [["movie", "film", "kino", "cinema"], "film"],
  [["sleep", "schlafen", "bed", "bett", "nap"], "moon"],
  [["drink", "hydrate", "trinken", "wasser"], "droplet"],
  [["idea", "ideas", "idee", "ideen", "brainstorm"], "lightbulb"],
  [["goal", "goals", "ziel", "ziele", "focus", "fokus"], "target"],
  [["presentation", "präsentation", "slides", "vortrag", "pitch"], "presentation"],
  [["parcel", "package", "paket", "delivery", "lieferung", "post"], "package"],
  [["home", "house", "haus", "wohnung", "move", "umzug"], "house"],
];
const BY_KIND: Record<"task" | "event" | "habit" | "note", IconName[]> = {
  task: ["circle-check", "star", "flag", "briefcase", "house", "shopping-cart"],
  event: ["calendar", "users", "utensils", "plane", "phone", "map-pin"],
  habit: ["dumbbell", "book-open", "droplet", "moon", "footprints", "heart-pulse"],
  note: ["lightbulb", "file-text", "pen-line", "bookmark", "pin", "star"],
};
export function suggestIcons(title: string, kind: keyof typeof BY_KIND, recent: readonly string[] = [], count = 6): IconName[] {
  const words = title.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const out: IconName[] = [];
  const add = (name: string) => isIconName(name) && !out.includes(name) && out.push(name);
  for (const [keys, icon] of WORDS) if (words.some((w) => keys.includes(w) || (w.length > 4 && keys.some((k) => k.length > 4 && w.startsWith(k))))) add(icon);
  for (const name of recent) add(name);
  for (const name of BY_KIND[kind]) add(name);
  return out.slice(0, count);
}
