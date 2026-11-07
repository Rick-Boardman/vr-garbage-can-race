// Rider shirts match the order in props.js SHIRTS. shirtRand (index + 0.5) / 8
// lands in that shirt, and the same draw picks skin, pants, and hair.
// Blue is 0.2, the draw createRider uses when no look is passed. That is
// still shirt index 1, and it keeps the same skin, pants, and hair.
export const RIDER_LOOKS = [
  { shirtRand: 0.5 / 8, color: 0xe25b2a, label: "red" },
  { shirtRand: 0.2, color: 0x3d7edb, label: "blue" },
  { shirtRand: 2.5 / 8, color: 0xf2d15c, label: "yellow" },
  { shirtRand: 3.5 / 8, color: 0x2f9d6a, label: "green" },
  { shirtRand: 4.5 / 8, color: 0xd4527a, label: "pink" },
  { shirtRand: 5.5 / 8, color: 0x6b4c9a, label: "purple" },
  { shirtRand: 6.5 / 8, color: 0xefefef, label: "white" },
  { shirtRand: 7.5 / 8, color: 0x222831, label: "black" },
];

// The first can is the green band the local rider wears before a choice.
export const CAN_COLORS = [
  { can: 0x2f7d4a, label: "green" },
  { can: 0xc23b3b, label: "red" },
  { can: 0x2f6fbf, label: "blue" },
  { can: 0xe0a100, label: "yellow" },
  { can: 0x7a4ea3, label: "purple" },
  { can: 0xefefef, label: "white" },
  { can: 0x222831, label: "black" },
];

export const BODIES = [
  { id: "man", label: "Man" },
  { id: "woman", label: "Woman" },
];

export const AGES = [
  { id: "young", label: "Young" },
  { id: "adult", label: "Adult" },
  { id: "old", label: "Old" },
];

export const TOPS = [
  { id: "tee", label: "T-shirt" },
  { id: "blouse", label: "Blouse" },
];

export const BOTTOMS = [
  { id: "pants", label: "Pants" },
  { id: "skirt", label: "Skirt" },
];

export const HAIR_STYLES = [
  { id: "short", label: "Short" },
  { id: "long", label: "Long" },
  { id: "bun", label: "Bun" },
  { id: "bald", label: "Bald" },
];

export const CAN_SHAPES = [
  { id: "round", label: "Round" },
  { id: "square", label: "Square" },
];

export const CAN_SIZES = [
  { id: "small", label: "Small" },
  { id: "regular", label: "Regular" },
  { id: "big", label: "Big" },
];

export const CAN_MATERIALS = [
  { id: "metal", label: "Metal" },
  { id: "rubber", label: "Rubber" },
];

export const LOGOS = [
  { id: "none", label: "None" },
  { id: "star", label: "Star" },
  { id: "ring", label: "Ring" },
  { id: "diamond", label: "Diamond" },
  { id: "bolt", label: "Bolt" },
];

export const LOGO_COLORS = [
  { logoColor: 0xf2c879, label: "gold" },
  { logoColor: 0xffffff, label: "white" },
  { logoColor: 0x111111, label: "black" },
  { logoColor: 0xc23b3b, label: "red" },
];

function choice(list, id, fallback) {
  return list.some((row) => row.id === id) ? id : fallback;
}

export function defaultLook() {
  return {
    body: "man",
    age: "adult",
    top: "tee",
    bottom: "pants",
    hair: "short",
    shirtRand: RIDER_LOOKS[1].shirtRand,
    canShape: "round",
    canSize: "regular",
    canMaterial: "metal",
    can: CAN_COLORS[0].can,
    logo: "none",
    logoColor: LOGO_COLORS[0].logoColor,
  };
}

export function acceptedLook(raw) {
  const shirtRand = Number(raw?.shirtRand);
  const can = Number(raw?.can);
  const shirt = RIDER_LOOKS.find((row) => Math.abs(row.shirtRand - shirtRand) < 1e-6);
  const color = CAN_COLORS.find((row) => row.can === can);
  if (!shirt || !color) return null;
  const logoColor = LOGO_COLORS.find((row) => row.logoColor === Number(raw?.logoColor))?.logoColor
    ?? LOGO_COLORS[0].logoColor;
  return {
    body: choice(BODIES, raw?.body, "man"),
    age: choice(AGES, raw?.age, "adult"),
    top: choice(TOPS, raw?.top, "tee"),
    bottom: choice(BOTTOMS, raw?.bottom, "pants"),
    hair: choice(HAIR_STYLES, raw?.hair, "short"),
    shirtRand: shirt.shirtRand,
    canShape: choice(CAN_SHAPES, raw?.canShape, "round"),
    canSize: choice(CAN_SIZES, raw?.canSize, "regular"),
    canMaterial: choice(CAN_MATERIALS, raw?.canMaterial, "metal"),
    can: color.can,
    logo: choice(LOGOS, raw?.logo, "none"),
    logoColor,
  };
}

export function lookKey(raw) {
  const look = acceptedLook(raw) || defaultLook();
  return [
    look.body,
    look.age,
    look.top,
    look.bottom,
    look.hair,
    look.shirtRand,
    look.canShape,
    look.canSize,
    look.canMaterial,
    look.can,
    look.logo,
    look.logoColor,
  ].join(":");
}

export function cleanName(name) {
  return String(name || "").replace(/\s+/g, " ").trim().slice(0, 24);
}

export function nameKey(name) {
  return cleanName(name).toLowerCase();
}

// people are { actor, displayName } from this lobby. me is left out of the check.
// An empty name is not a name. Two spellings that differ only by case are one name.
export function nameBlock(name, people, me, { join = false } = {}) {
  const text = cleanName(name);
  if (!text) return join ? "Pick a name before you join." : "Pick a name before you talk.";
  const key = text.toLowerCase();
  const taken = (people || []).some((person) => {
    if (!person || (me && person.actor === me)) return false;
    return nameKey(person.displayName) === key;
  });
  if (taken) return "That name is already in use.";
  return "";
}
