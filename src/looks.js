// Rider shirts match the order in props.js SHIRTS. shirtRand (index + 0.5) / 8
// lands in that shirt. A look with no skin or hair color still draws those
// from SKIN_DRAW and HAIR_DRAW with the same shirtRand, which is what town
// people and the original rider use. Blue is 0.2: shirt index 1, tan skin,
// brown hair. A saved skin, hair color, or complexion replaces that draw.
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

// None is the default, so a saved look from before hats stays bare-headed.
export const HATS = [
  { id: "none", label: "None" },
  { id: "pirate", label: "Pirate" },
];

// Same order props.js uses for an unstyled person. Do not sort these.
export const SKIN_DRAW = [0xf0c2a0, 0xd9a47a, 0xc6865a, 0x8d5a3c, 0xf3d3b8];
export const HAIR_DRAW = [0x2a211c, 0x5a3a28, 0xc4a15a, 0x1a1a1a, 0x6a6a6a, 0x8b3a2a];
// Old age with no chosen hair color. Also a swatch, so a rider can keep it.
export const OLD_HAIR = 0xcfc8bc;

export const SKIN_COLORS = [
  { skin: 0xf3d3b8, label: "fair" },
  { skin: 0xf0c2a0, label: "light" },
  { skin: 0xd9a47a, label: "tan" },
  { skin: 0xc6865a, label: "brown" },
  { skin: 0x8d5a3c, label: "deep" },
];

export const HAIR_COLORS = [
  { hairColor: 0x1a1a1a, label: "black" },
  { hairColor: 0x2a211c, label: "dark" },
  { hairColor: 0x5a3a28, label: "brown" },
  { hairColor: 0x8b3a2a, label: "auburn" },
  { hairColor: 0xc4a15a, label: "blonde" },
  { hairColor: 0x6a6a6a, label: "ash" },
  { hairColor: OLD_HAIR, label: "gray" },
];

export const COMPLEXIONS = [
  { id: "even", label: "Even" },
  { id: "rosy", label: "Rosy" },
  { id: "warm", label: "Warm" },
  { id: "cool", label: "Cool" },
  { id: "olive", label: "Olive" },
  { id: "freckled", label: "Freckled" },
];

// Face-only mix on top of the skin swatch. Even leaves the face the skin color.
const COMPLEXION_TINT = {
  rosy: [0xe07080, 0.34],
  warm: [0xd4874a, 0.32],
  cool: [0xa898c0, 0.36],
  olive: [0x7f8a42, 0.4],
  freckled: [0xd4874a, 0.16],
};

export function mixHex(base, tint, amount) {
  const channel = (shift) => {
    const from = (Number(base) >> shift) & 255;
    const to = (Number(tint) >> shift) & 255;
    return Math.round(from + (to - from) * amount) & 255;
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

export function faceHex(skin, complexion) {
  const tint = COMPLEXION_TINT[complexion];
  if (!tint) return Number(skin);
  return mixHex(skin, tint[0], tint[1]);
}

export function freckleHex(skin) {
  return mixHex(skin, 0x4a2814, 0.62);
}

export const CAN_SHAPES = [
  { id: "round", label: "Round" },
  { id: "square", label: "Square" },
  { id: "drum", label: "Drum" },
  { id: "taper", label: "Taper" },
  { id: "oval", label: "Oval" },
  { id: "flare", label: "Flare" },
  { id: "barrel", label: "Barrel" },
];

export const LOOK_STORE = "gcr.look.v1";
export const NAME_STORE = "gcr.name.v1";

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

function knownHex(list, key, value) {
  const hex = Number(value);
  return list.some((row) => row[key] === hex) ? hex : null;
}

function drawn(list, shirtRand) {
  const index = Math.floor(Number(shirtRand) * list.length);
  if (index < 0 || index >= list.length) return list[0];
  return list[index];
}

// The Pirate button wears the hat and the barrel together. Clicking it
// again puts back the hat and the can from before that click. A pirate
// with nothing remembered returns to a bare head and a round can.
export function togglePirate(look, previous) {
  const on = look?.hat === "pirate" && look?.canShape === "barrel";
  if (!on) {
    return {
      look: { ...look, hat: "pirate", canShape: "barrel" },
      previous: {
        hat: look?.hat || "none",
        canShape: look?.canShape || "round",
      },
    };
  }
  let hat = previous?.hat || "none";
  let canShape = previous?.canShape || "round";
  if (hat === "pirate" && canShape === "barrel") {
    hat = "none";
    canShape = "round";
  }
  return {
    look: { ...look, hat, canShape },
    previous: null,
  };
}

export function defaultLook() {
  return acceptedLook({
    shirtRand: RIDER_LOOKS[1].shirtRand,
    can: CAN_COLORS[0].can,
  });
}

export function acceptedLook(raw) {
  const shirtRand = Number(raw?.shirtRand);
  const can = Number(raw?.can);
  const shirt = RIDER_LOOKS.find((row) => Math.abs(row.shirtRand - shirtRand) < 1e-6);
  const color = CAN_COLORS.find((row) => row.can === can);
  if (!shirt || !color) return null;
  const logoColor = LOGO_COLORS.find((row) => row.logoColor === Number(raw?.logoColor))?.logoColor
    ?? LOGO_COLORS[0].logoColor;
  const age = choice(AGES, raw?.age, "adult");
  const skin = knownHex(SKIN_COLORS, "skin", raw?.skin) ?? drawn(SKIN_DRAW, shirt.shirtRand);
  const hairColor = knownHex(HAIR_COLORS, "hairColor", raw?.hairColor)
    ?? (age === "old" ? OLD_HAIR : drawn(HAIR_DRAW, shirt.shirtRand));
  return {
    body: choice(BODIES, raw?.body, "man"),
    age,
    top: choice(TOPS, raw?.top, "tee"),
    bottom: choice(BOTTOMS, raw?.bottom, "pants"),
    hair: choice(HAIR_STYLES, raw?.hair, "short"),
    hat: choice(HATS, raw?.hat, "none"),
    skin,
    hairColor,
    complexion: choice(COMPLEXIONS, raw?.complexion, "even"),
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
    look.hat,
    look.skin,
    look.hairColor,
    look.complexion,
    look.shirtRand,
    look.canShape,
    look.canSize,
    look.canMaterial,
    look.can,
    look.logo,
    look.logoColor,
  ].join(":");
}

export function rememberLook(storage, look) {
  try {
    storage.setItem(LOOK_STORE, JSON.stringify(acceptedLook(look) || defaultLook()));
  } catch {
    // A private window can refuse storage. The look still applies this visit.
  }
}

export function recallLook(storage) {
  try {
    return acceptedLook(JSON.parse(storage.getItem(LOOK_STORE) || "null")) || defaultLook();
  } catch {
    return defaultLook();
  }
}

export function rememberName(storage, name) {
  try {
    storage.setItem(NAME_STORE, cleanName(name));
  } catch {
    // Same as the look: the typed name still works without storage.
  }
}

export function recallName(storage) {
  try {
    return cleanName(storage.getItem(NAME_STORE));
  } catch {
    return "";
  }
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
