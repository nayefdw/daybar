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
