// Every fish that can be caught: 16 species in four rarities, with the drop rates that decide
// which one comes up. Pure data and a few helpers, no DOM, so the Node checks can import it.
//
// Fields of a species:
//   id           stable key (the logbook is saved under it, so never rename one)
//   name         shown in the logbook and on the catch card
//   rarity       'common' | 'uncommon' | 'rare' | 'legendary'  (a key of RARITIES)
//   weight       [min, max] in kilograms
//   description  one or two lines of flavour
//   imgUrl       the picture as inline <svg> markup (not a URL, despite the name: it is put into the
//                page with innerHTML). All are 120 x 60, face right, are built from flat polygons
//                like the game's low-poly look, and use no id= / url(#) so the same picture can be on
//                the page several times. No scripts or external references.
//
// Note: config.js has a FISH too, the schools that swim under the water. This file is about the
// ones you can catch.

// Order = display order of the logbook. `rate` is the chance that a catch is of this rarity
// (the four add up to 1); `difficulty` scales the fight (see fishing/fishingMinigame.js);
// `colour` tints the cards in the interface.
export const RARITIES = {
  common: { label: 'Common', rate: 0.6, difficulty: 0.85, colour: '#cfc9bb' },
  uncommon: { label: 'Uncommon', rate: 0.27, difficulty: 1, colour: '#6fd16f' },
  rare: { label: 'Rare', rate: 0.1, difficulty: 1.25, colour: '#b79bff' },
  legendary: { label: 'Legendary', rate: 0.03, difficulty: 1.6, colour: '#f0b34a' },
}

const SVG = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"'

export const FISH_SPECIES = [
  // --- Common ---------------------------------------------------------------------------------
  {
    id: 'dusk-herring',
    name: 'Dusk Herring',
    rarity: 'common',
    weight: [0.2, 0.8],
    description: 'Shoals of them turn the sea to tin at sundown. Good eating, and the gulls know it.',
    imgUrl: `<svg ${SVG}>
  <polygon points="24,30 5,15 10,30 5,45" fill="#4a647c"/>
  <polygon points="58,18 68,8 76,19" fill="#4a647c"/>
  <polygon points="62,42 69,51 76,41" fill="#4a647c"/>
  <polygon points="113,30 90,20 58,17 30,24 20,30" fill="#6d8fae"/>
  <polygon points="113,30 90,40 58,43 30,36 20,30" fill="#cdd9e3"/>
  <polygon points="90,20 58,17 66,30 94,30" fill="#86a6c2"/>
  <path d="M89 24 Q85 30 89 37" fill="none" stroke="#4a647c" stroke-width="1.6"/>
  <circle cx="102" cy="27" r="3.4" fill="#fff"/>
  <circle cx="103" cy="27" r="1.7" fill="#0b0f14"/>
</svg>`,
  },
  {
    id: 'mudgrubber',
    name: 'Mudgrubber',
    rarity: 'common',
    weight: [0.6, 2.8],
    description: 'Spends its whole life with its whiskers in the silt. Tastes exactly like it.',
    imgUrl: `<svg ${SVG}>
  <polygon points="22,30 5,17 10,30 5,43" fill="#4a3320"/>
  <polygon points="50,14 62,4 80,12" fill="#4a3320"/>
  <polygon points="110,33 100,19 72,11 42,15 22,30" fill="#6e4f33"/>
  <polygon points="110,33 100,46 72,51 42,47 22,30" fill="#b08a5a"/>
  <polygon points="72,11 42,15 55,30 82,30" fill="#86623f"/>
  <polygon points="55,20 61,26 52,27" fill="#4a3320"/>
  <polygon points="70,22 77,27 68,30" fill="#4a3320"/>
  <path d="M106 38 Q114 47 105 55 M100 41 Q104 51 95 57" fill="none" stroke="#4a3320" stroke-width="2.2" stroke-linecap="round"/>
  <path d="M110 33 L103 35" stroke="#3a2616" stroke-width="1.6" stroke-linecap="round"/>
  <circle cx="95" cy="26" r="3.4" fill="#fff"/>
  <circle cx="96" cy="26" r="1.7" fill="#0b0f14"/>
</svg>`,
  },
  {
    id: 'rustback-flounder',
    name: 'Rustback Flounder',
    rarity: 'common',
    weight: [0.8, 3.2],
    description: 'Lies flat for so long that the rust has started to take. Both eyes watch you anyway.',
    imgUrl: `<svg ${SVG}>
  <polygon points="12,30 2,23 2,37" fill="#7d3f22"/>
  <polygon points="110,30 90,9 50,4 18,15 10,30" fill="#a8532c"/>
  <polygon points="110,30 90,51 50,56 18,45 10,30" fill="#c9743f"/>
  <polygon points="90,9 50,4 56,30 96,30" fill="#bd6a38"/>
  <path d="M10 30 L18 15 L50 4 L90 9 L110 30 L90 51 L50 56 L18 45 Z" fill="none" stroke="#7d3f22" stroke-width="2.6" stroke-dasharray="5 3" stroke-linejoin="round"/>
  <polygon points="40,16 48,20 40,25" fill="#7d3f22"/>
  <polygon points="58,38 66,36 63,44" fill="#7d3f22"/>
  <polygon points="30,32 38,30 36,38" fill="#7d3f22"/>
  <circle cx="94" cy="22" r="3.8" fill="#fff"/>
  <circle cx="95" cy="22" r="1.9" fill="#0b0f14"/>
  <circle cx="99" cy="29" r="3.8" fill="#fff"/>
  <circle cx="100" cy="29" r="1.9" fill="#0b0f14"/>
  <path d="M110 30 Q105 36 100 36" fill="none" stroke="#5a2a14" stroke-width="1.6" stroke-linecap="round"/>
</svg>`,
  },
  {
    id: 'lantern-sprat',
    name: 'Lantern Sprat',
    rarity: 'common',
    weight: [0.05, 0.25],
    description: 'Carries its own tiny lamp. Fishermen swear the shoals follow your boat for the light, not the other way round.',
    imgUrl: `<svg ${SVG}>
  <polygon points="40,30 20,17 26,30 20,43" fill="#1f6f7c"/>
  <polygon points="64,20 72,11 82,22" fill="#1f6f7c"/>
  <polygon points="102,30 86,21 60,19 42,25 38,30" fill="#2f95a3"/>
  <polygon points="102,30 86,39 60,41 42,35 38,30" fill="#9adadf"/>
  <polygon points="86,21 60,19 66,30 90,30" fill="#46aebb"/>
  <circle cx="66" cy="37" r="11" fill="#ffe58a" opacity="0.28"/>
  <circle cx="66" cy="37" r="4.6" fill="#ffe58a"/>
  <circle cx="66" cy="37" r="2" fill="#fff8d6"/>
  <circle cx="52" cy="37" r="1.6" fill="#ffe58a"/>
  <circle cx="78" cy="37" r="1.6" fill="#ffe58a"/>
  <circle cx="92" cy="27" r="3.6" fill="#fff"/>
  <circle cx="93" cy="27" r="1.8" fill="#0b0f14"/>
</svg>`,
  },
  {
    id: 'brine-mackerel',
    name: 'Brine Mackerel',
    rarity: 'common',
    weight: [0.6, 2.2],
    description: 'Pickled by the sea before you even catch it. Wears stripes like a convict wears a shirt.',
    imgUrl: `<svg ${SVG}>
  <polygon points="26,30 3,10 12,30 3,50" fill="#1f4f4b"/>
  <polygon points="115,30 92,21 60,17 34,25 24,30" fill="#2f7a73"/>
  <polygon points="115,30 92,39 60,43 34,35 24,30" fill="#d4e6da"/>
  <polygon points="92,21 60,17 68,30 98,30" fill="#3f9088"/>
  <polygon points="68,18 77,6 87,20" fill="#1f4f4b"/>
  <polygon points="34,24.5 36,19 39,23.5 41,18 44,22 44,26" fill="#1f4f4b"/>
  <polygon points="34,35.5 36,41 39,36.5 41,42 44,38 44,34" fill="#1f4f4b"/>
  <path d="M46 21 l7 8 M56 18 l8 9 M67 18 l8 9 M78 20 l7 8" fill="none" stroke="#143a36" stroke-width="2.4" stroke-linecap="round"/>
  <circle cx="103" cy="27" r="3.4" fill="#fff"/>
  <circle cx="104" cy="27" r="1.7" fill="#0b0f14"/>
</svg>`,
  },
  {
    id: 'thornback-perch',
    name: 'Thornback Perch',
    rarity: 'common',
    weight: [0.4, 1.6],
    description: 'Every spine is a grudge. Handle with gloves, or with regret.',
    imgUrl: `<svg ${SVG}>
  <polygon points="26,30 7,18 12,30 7,42" fill="#7e8a2c"/>
  <polygon points="42,16 46,4 52,13 58,1 64,11 72,3 77,11 86,7 90,17" fill="#7e8a2c"/>
  <polygon points="108,32 98,17 70,10 44,16 26,30" fill="#b4b445"/>
  <polygon points="108,32 98,47 70,54 44,48 26,30" fill="#e6dc8a"/>
  <path d="M51 18 L53 48 M65 13 L66 52 M79 14 L80 50" fill="none" stroke="#5d6420" stroke-width="3" opacity="0.7"/>
  <polygon points="84,36 70,40 82,47" fill="#7e8a2c"/>
  <polygon points="66,52 62,58 74,54" fill="#7e8a2c"/>
  <circle cx="96" cy="27" r="4.6" fill="#ffb347"/>
  <circle cx="97" cy="27" r="2.2" fill="#0b0f14"/>
</svg>`,
  },

  // --- Uncommon -------------------------------------------------------------------------------
  {
    id: 'ember-eel',
    name: 'Ember Eel',
    rarity: 'uncommon',
    weight: [1.2, 4.5],
    description: 'Warm to the touch, even in the dead of winter. Folk say it swallowed a lighthouse once and never put the fire out.',
    imgUrl: `<svg ${SVG}>
  <path d="M8 44 C26 12 46 56 66 32 S96 14 106 26" fill="none" stroke="#8f2b1c" stroke-width="13" stroke-linecap="round"/>
  <path d="M8 44 C26 12 46 56 66 32 S96 14 106 26" fill="none" stroke="#e0652c" stroke-width="9" stroke-linecap="round"/>
  <path d="M8 46 C26 14 46 58 66 34 S96 16 106 28" fill="none" stroke="#f6a04a" stroke-width="3" stroke-linecap="round" opacity="0.8"/>
  <path d="M8 38 C26 6 46 50 66 26 S96 8 106 20" fill="none" stroke="#b8381f" stroke-width="2.4" stroke-dasharray="3 3"/>
  <circle cx="16" cy="34" r="1.8" fill="#ffd36b"/>
  <circle cx="27" cy="32" r="1.8" fill="#ffd36b"/>
  <circle cx="39" cy="36" r="1.8" fill="#ffd36b"/>
  <circle cx="51" cy="39" r="1.8" fill="#ffd36b"/>
  <circle cx="79" cy="19" r="1.8" fill="#ffd36b"/>
  <circle cx="92" cy="16" r="1.8" fill="#ffd36b"/>
  <ellipse cx="109" cy="29" rx="9" ry="6.5" transform="rotate(50 109 29)" fill="#8f2b1c"/>
  <circle cx="108" cy="24" r="3" fill="#ffe58a"/>
  <circle cx="108.6" cy="24.4" r="1.4" fill="#0b0f14"/>
</svg>`,
  },
  {
    id: 'lamplit-angler',
    name: 'Lamplit Angler',
    rarity: 'uncommon',
    weight: [2, 9],
    description: 'Dangles a little light and waits. More than one sailor has followed it home, and it was not their home.',
    imgUrl: `<svg ${SVG}>
  <polygon points="26,32 6,20 11,32 6,44" fill="#2a2a52"/>
  <polygon points="104,36 100,18 78,9 50,8 28,20 22,32 28,44 50,52 78,52 100,48" fill="#3a3a74"/>
  <polygon points="28,44 50,52 78,52 100,48 104,36 60,38" fill="#4d4d94"/>
  <polygon points="104,36 76,34 74,42 100,48" fill="#14102a"/>
  <polygon points="102,36 98,43 94,36.5 90,44 86,37 82,45 78,38 76,35" fill="#f1ece0"/>
  <polygon points="52,50 58,58 68,51" fill="#2a2a52"/>
  <path d="M82 11 Q84 6 97 9" fill="none" stroke="#2a2a52" stroke-width="2" stroke-linecap="round"/>
  <circle cx="98" cy="9" r="8" fill="#ffe58a" opacity="0.28"/>
  <circle cx="98" cy="9" r="4" fill="#ffe58a"/>
  <circle cx="98" cy="9" r="1.8" fill="#fff8d6"/>
  <circle cx="88" cy="23" r="5.5" fill="#ffe58a"/>
  <circle cx="89" cy="23" r="2.6" fill="#0b0f14"/>
</svg>`,
  },
  {
    id: 'sourpuss-puffer',
    name: 'Sourpuss Puffer',
    rarity: 'uncommon',
    weight: [0.8, 3.4],
    description: 'Puffs up when insulted. Is insulted constantly.',
    imgUrl: `<svg ${SVG}>
  <polygon points="38,30 24,21 27,30 24,39" fill="#a8821b"/>
  <g fill="#a8821b">
    <polygon points="73.9,38.4 80.4,45.1 71.7,41.6"/>
    <polygon points="69.5,43.8 72.9,52.5 66.2,46"/>
    <polygon points="63.4,47.2 63.2,56.5 59.5,47.9"/>
    <polygon points="56.4,47.9 52.6,56.5 52.5,47.1"/>
    <polygon points="49.6,45.9 42.9,52.4 46.4,43.7"/>
    <polygon points="44.2,41.5 35.5,44.9 42,38.2"/>
    <polygon points="40.8,35.4 31.5,35.2 40.1,31.5"/>
    <polygon points="40.1,28.4 31.5,24.6 40.9,24.5"/>
    <polygon points="42.1,21.6 35.6,14.9 44.3,18.4"/>
    <polygon points="46.5,16.2 43.1,7.5 49.8,14"/>
    <polygon points="52.6,12.8 52.8,3.5 56.5,12.1"/>
    <polygon points="59.6,12.1 63.4,3.5 63.5,12.9"/>
    <polygon points="66.4,14.1 73.1,7.6 69.6,16.3"/>
    <polygon points="71.8,18.5 80.5,15.1 74,21.8"/>
  </g>
  <polygon points="78,32.6 72.1,40.8 65.7,48.7 55.7,47.6 45.7,46 41.6,36.8 38,27.4 43.9,19.2 50.3,11.3 60.3,12.4 70.3,14 74.4,23.2" fill="#e8c240"/>
  <polygon points="78,32.6 72.1,40.8 65.7,48.7 55.7,47.6 45.7,46 41.6,36.8 50,34 66,34" fill="#f6e7a0"/>
  <polygon points="56,34 46,40 58,43" fill="#c9a22b"/>
  <circle cx="68" cy="25" r="6.2" fill="#fff"/>
  <circle cx="70" cy="26" r="3" fill="#0b0f14"/>
  <path d="M60 17 L75 22" stroke="#5a4510" stroke-width="2.6" stroke-linecap="round"/>
  <ellipse cx="77" cy="34" rx="2.4" ry="2.9" fill="#5a4510"/>
</svg>`,
  },
  {
    id: 'mossback-gar',
    name: 'Mossback Gar',
    rarity: 'uncommon',
    weight: [3, 11],
    description: 'Green as the harbour wall and twice as old. Its smile is not a friendly one.',
    imgUrl: `<svg ${SVG}>
  <polygon points="16,30 2,19 5,30 2,41" fill="#2b4a28"/>
  <polygon points="30,24 22,12 42,21" fill="#2b4a28"/>
  <polygon points="34,36 28,47 46,39" fill="#2b4a28"/>
  <polygon points="118,31 84,24 74,19 50,19 24,25 14,30" fill="#3f6b3a"/>
  <polygon points="118,31 116,33 84,38 74,41 50,41 24,35 14,30" fill="#b9c58a"/>
  <polygon points="74,19 50,19 56,31 84,30" fill="#4f7e49"/>
  <polygon points="60,24 66,30 60,36 54,30" fill="#58895a" opacity="0.7"/>
  <polygon points="44,26 49,30 44,34 39,30" fill="#58895a" opacity="0.7"/>
  <polygon points="76,26 81,30 76,34 71,30" fill="#58895a" opacity="0.7"/>
  <polygon points="113,33 110,38 107,34 104,38.5 101,35 98,39 95,36 92,39.5 89,37.5 86,38" fill="#f1ece0"/>
  <circle cx="86" cy="27" r="3.4" fill="#ffd36b"/>
  <circle cx="86.6" cy="27" r="1.7" fill="#0b0f14"/>
</svg>`,
  },
  {
    id: 'glasswing-skate',
    name: 'Glasswing Skate',
    rarity: 'uncommon',
    weight: [2.5, 12],
    description: 'So clear that you can see the seabed through its wings, and sometimes things that are not seabed.',
    imgUrl: `<svg ${SVG}>
  <polygon points="28,27 2,30 28,33" fill="#6aa7c4"/>
  <polygon points="104,30 74,6 44,10 24,30 44,50 74,54" fill="#a8d4e6"/>
  <polygon points="104,30 74,6 60,30" fill="#c6e6f2"/>
  <polygon points="104,30 74,54 60,30" fill="#8fc2d9"/>
  <polygon points="74,6 44,10 60,30" fill="#b6dcec"/>
  <polygon points="74,54 44,50 60,30" fill="#9ccce0"/>
  <polygon points="24,30 44,10 60,30 44,50" fill="#82b8d0"/>
  <path d="M60 30 L100 30 M60 30 L50 14 M60 30 L50 46 M60 30 L34 30" fill="none" stroke="#5c9db8" stroke-width="1.2" opacity="0.7"/>
  <polygon points="80,14 98,26 84,22" fill="#ffffff" opacity="0.4"/>
  <circle cx="93" cy="24" r="2.6" fill="#0b0f14"/>
  <circle cx="93" cy="36" r="2.6" fill="#0b0f14"/>
  <path d="M100 28 Q104 30 100 32" fill="none" stroke="#3f7a96" stroke-width="1.4" stroke-linecap="round"/>
</svg>`,
  },

  // --- Rare -----------------------------------------------------------------------------------
  {
    id: 'bonewhistle',
    name: 'Bonewhistle',
    rarity: 'rare',
    weight: [4, 16],
    description: 'All ribs and no fish. The wind whistles through it, and it hums back a tune you almost know.',
    imgUrl: `<svg ${SVG}>
  <path d="M80 30 L14 30" fill="none" stroke="#e8e2d0" stroke-width="3.4" stroke-linecap="round"/>
  <g fill="none" stroke="#e8e2d0" stroke-width="2.6" stroke-linecap="round">
    <path d="M72 30 Q72 15 63 9 M63 30 Q63 15 54 10 M54 30 Q54 17 46 12 M45 30 Q45 19 38 15 M36 30 Q36 21 30 18 M27 30 Q27 23 22 21"/>
    <path d="M72 30 Q72 45 63 51 M63 30 Q63 45 54 50 M54 30 Q54 43 46 48 M45 30 Q45 41 38 45 M36 30 Q36 39 30 42 M27 30 Q27 37 22 39"/>
    <path d="M14 30 L2 17 M14 30 L2 43 M14 30 L4 30"/>
  </g>
  <polygon points="114,31 106,19 90,15 79,24 78,36 90,45 106,42" fill="#e8e2d0"/>
  <polygon points="114,31 106,42 90,45 98,31" fill="#c9c2ac"/>
  <circle cx="97" cy="27" r="10" fill="#7fe9e0" opacity="0.22"/>
  <circle cx="97" cy="27" r="6" fill="#0b0f14"/>
  <circle cx="97" cy="27" r="2.6" fill="#7fe9e0"/>
  <path d="M114 32 L88 33.5" fill="none" stroke="#0b0f14" stroke-width="1.6"/>
  <path d="M111 33 L108 37 L105 33.4 L102 37.5 L99 33.8 L96 37.5 L93 34 L90 37" fill="none" stroke="#0b0f14" stroke-width="1.5" stroke-linejoin="round"/>
</svg>`,
  },
  {
    id: 'brasscrown-sturgeon',
    name: 'Brasscrown Sturgeon',
    rarity: 'rare',
    weight: [20, 65],
    description: 'Armoured like a knight and crowned like a king. Nobody remembers which kingdom.',
    imgUrl: `<svg ${SVG}>
  <polygon points="16,29 2,8 10,28 4,44" fill="#7b5d1f"/>
  <polygon points="113,35 98,22 62,16 32,22 14,29" fill="#a98530"/>
  <polygon points="113,35 98,44 62,45 32,39 14,29" fill="#e2cb86"/>
  <polygon points="98,22 62,16 66,32 106,35" fill="#c9a24a"/>
  <polygon points="34,21 38,12 42,20 46,10 50,19 54,9 58,18 62,8 66,17 70,9 74,18 78,11 82,20" fill="#f2d676" stroke="#7b5d1f" stroke-width="1.2" stroke-linejoin="round"/>
  <path d="M30 31 L96 34" fill="none" stroke="#7b5d1f" stroke-width="2" stroke-dasharray="1 5" stroke-linecap="round"/>
  <polygon points="66,44 70,54 80,45" fill="#7b5d1f"/>
  <path d="M110 38 Q112 46 106 51 M105 40 Q106 48 100 53" fill="none" stroke="#7b5d1f" stroke-width="1.8" stroke-linecap="round"/>
  <circle cx="98" cy="29" r="3.2" fill="#fff"/>
  <circle cx="99" cy="29" r="1.6" fill="#0b0f14"/>
</svg>`,
  },
  {
    id: 'argus-grouper',
    name: 'Argus Grouper',
    rarity: 'rare',
    weight: [8, 34],
    description: 'Seven eyes, and every one of them is looking at you. Not one of them blinks.',
    imgUrl: `<svg ${SVG}>
  <polygon points="24,30 6,16 11,30 6,44" fill="#4a2441"/>
  <polygon points="40,14 46,5 52,13 58,3 64,11 72,2 78,10 88,6 92,15" fill="#4a2441"/>
  <polygon points="108,34 100,16 74,8 42,12 22,30" fill="#6b3a5e"/>
  <polygon points="108,34 100,48 74,54 40,50 22,30" fill="#b27aa0"/>
  <polygon points="74,8 42,12 56,30 84,30" fill="#7e4a70"/>
  <polygon points="70,54 76,59 84,52" fill="#4a2441"/>
  <path d="M108 36 Q96 46 84 41" fill="none" stroke="#2a1226" stroke-width="3" stroke-linecap="round"/>
  <g fill="#ffe58a">
    <circle cx="92" cy="25" r="6"/>
    <circle cx="78" cy="19" r="3.6"/>
    <circle cx="66" cy="27" r="3.2"/>
    <circle cx="56" cy="16" r="2.9"/>
    <circle cx="51" cy="31" r="3.6"/>
    <circle cx="70" cy="41" r="3.3"/>
    <circle cx="87" cy="36" r="2.6"/>
  </g>
  <g fill="#0b0f14">
    <ellipse cx="92" cy="25" rx="1.6" ry="4.4"/>
    <ellipse cx="78" cy="19" rx="1.2" ry="2.6"/>
    <ellipse cx="66" cy="27" rx="1.1" ry="2.3"/>
    <ellipse cx="56" cy="16" rx="1" ry="2.1"/>
    <ellipse cx="51" cy="31" rx="1.2" ry="2.6"/>
    <ellipse cx="70" cy="41" rx="1.1" ry="2.4"/>
    <ellipse cx="87" cy="36" rx="0.9" ry="1.9"/>
  </g>
</svg>`,
  },

  // --- Legendary ------------------------------------------------------------------------------
  {
    id: 'old-moonfin',
    name: 'Old Moonfin',
    rarity: 'legendary',
    weight: [90, 240],
    description: 'A drifting disc of silver that surfaces on still nights. Sailors take their hats off when it passes.',
    imgUrl: `<svg ${SVG}>
  <polygon points="46,8 30,18 11,7 25,1" fill="#8997ab"/>
  <polygon points="46,52 30,42 11,53 25,59" fill="#8997ab"/>
  <polygon points="23,24 12,26 15,30 12,34 23,36" fill="#7887a0"/>
  <polygon points="98,30 90,14 70,6 46,8 30,18 22,30 30,42 46,52 70,54 90,46" fill="#b9c6d8"/>
  <polygon points="98,30 90,46 70,54 46,52 30,42 22,30 60,30" fill="#e9eff7"/>
  <polygon points="90,14 70,6 46,8 60,30" fill="#d4dded"/>
  <path d="M64 14 A17 17 0 1 0 64 46 A12 15 0 1 1 64 14 Z" fill="#ffe39a"/>
  <polygon points="98,30 103,27 103,33" fill="#8997ab"/>
  <circle cx="89" cy="26" r="3.2" fill="#fff"/>
  <circle cx="90" cy="26" r="1.6" fill="#0b0f14"/>
  <path d="M110 12 l1.6 -4 1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6z" fill="#fff4c9"/>
  <path d="M8 46 l1.2 -3 1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2z" fill="#fff4c9"/>
</svg>`,
  },
  {
    id: 'wake-eater',
    name: 'The Wake-Eater',
    rarity: 'legendary',
    weight: [150, 420],
    description: 'It follows boats and swallows their wakes. No one has ever seen it leave one.',
    imgUrl: `<svg ${SVG}>
  <g fill="none" stroke="#7fd6e6" stroke-width="1.6" stroke-linecap="round" opacity="0.55">
    <path d="M5 16 Q12 24 5 32"/>
    <path d="M1 12 Q10 24 1 36"/>
    <path d="M10 42 Q17 48 10 54"/>
  </g>
  <path d="M14 38 C30 56 42 14 62 32 S84 40 88 30" fill="none" stroke="#1b1530" stroke-width="16" stroke-linecap="round"/>
  <path d="M14 36 C30 54 42 12 62 30 S84 38 88 28" fill="none" stroke="#2e2552" stroke-width="7" stroke-linecap="round"/>
  <polygon points="28,44 30,34 38,42" fill="#3a2a5c"/>
  <polygon points="44,18 50,8 54,20" fill="#3a2a5c"/>
  <polygon points="56,26 62,14 68,26" fill="#3a2a5c"/>
  <polygon points="72,36 78,48 84,38" fill="#3a2a5c"/>
  <polygon points="82,31 80,17 98,9 117,25 112,28 96,26 90,31" fill="#1b1530"/>
  <polygon points="82,31 90,33 112,34 100,47 84,44" fill="#2e2552"/>
  <polygon points="90,31 96,26 112,28 112,34 90,33" fill="#7a1c2a"/>
  <polygon points="100,27 102,33 104,27.4 106,34 108,28 110,34 112,28.5" fill="#f1ece0"/>
  <polygon points="96,33 99,28 102,33.4 105,29 108,34" fill="#f1ece0"/>
  <circle cx="94" cy="17" r="8" fill="#ff4a3a" opacity="0.3"/>
  <circle cx="94" cy="17" r="3.8" fill="#ff4a3a"/>
  <circle cx="94" cy="17" r="1.5" fill="#ffd0c8"/>
</svg>`,
  },
]

export const FISH_BY_ID = new Map(FISH_SPECIES.map((fish) => [fish.id, fish]))
export const fishInRarity = (rarity) => FISH_SPECIES.filter((fish) => fish.rarity === rarity)

// A rarity at random, weighted by the drop rates. `random` is any () => [0, 1) (Math.random, or a
// seeded one in the checks).
export function rollRarity(random = Math.random) {
  let roll = random()
  let last = 'common'
  for (const [name, { rate }] of Object.entries(RARITIES)) {
    if (roll < rate) return name
    roll -= rate
    last = name
  }
  return last // only reached through rounding
}

// A species at random: first the rarity by its drop rate, then any fish of that rarity.
export function rollFish(random = Math.random) {
  const pool = fishInRarity(rollRarity(random))
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]
}

// The weight of one catch in kg, always inside the species' range. Squared-ish towards the light
// end: the monsters are in the range, but rarely at its top.
export function rollWeight(fish, random = Math.random) {
  const [min, max] = fish.weight
  return Math.round((min + (max - min) * random() ** 1.6) * 100) / 100
}

// "250 g" below a kilo, "2.4 kg" above.
export function formatWeight(kg) {
  const grams = Math.round(kg * 1000)
  return grams < 1000 ? `${grams} g` : `${kg.toFixed(1)} kg`
}
