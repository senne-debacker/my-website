import type { ImageMetadata } from "astro";
import thrive from "../assets/thrive-hero.png";
import lumen from "../assets/lumen-hero.png";
import type01 from "../assets/type01-hero.png";
import tiltionary from "../assets/tiltionary-hero.jpg";
import wake from "../assets/wake-hero.jpg";

export interface Project {
  /** Used in the URL: /work/{id} */
  id: string;
  /** For projects that live on a page outside Astro (like /wake/): links go there instead of /work/{id}. */
  href?: string;
  title: string;
  tagline: string;
  type: string;
  role: string;
  context: string;
  tags: string[];
  image: ImageMetadata;
  /** Per-project accent colour used on hover states and the detail page. */
  accent: string;
  /** Where the portrait card on the home page crops this landscape image (CSS object-position). */
  cardPosition?: string;
  /** Darkens the card (0 to 1) when the image is so light that the hero title becomes unreadable. */
  cardDim?: number;
  /** Figma prototype to embed. Projects without one can show a demo video instead. */
  figma?: string;
  /** Demo video (a path in /public) for projects that cannot run in the browser. */
  video?: { src: string; caption: string };
  /** Source code, shown as a link next to the demo. */
  repo?: string;
  body: string[];
}

/** What the home page shows on top of the project itself. */
export interface Featured {
  project: Project;
  /** Extra rows shown under Type / Role / Context. */
  notes: { label: string; value: string }[];
  cta: string;
}

export const projects: Project[] = [
  {
    id: "1",
    title: "Thrive",
    tagline: "A campaign website for a sports beer, powered by pedals.",
    type: "Campaign website",
    role: "Concept, UX/UI design",
    context: "Devine, Howest",
    tags: ["Campaign", "UX/UI", "Prototype"],
    image: thrive,
    accent: "#3fc6cf",
    cardPosition: "17% 50%",
    figma:
      "https://embed.figma.com/proto/M9lBQCMS2c1mXZyvizic27/FINAL?page-id=201%3A17943&node-id=201-17990&viewport=159%2C225%2C0.09&scaling=scale-down&content-scaling=fixed&embed-host=share",
    body: [
      "For this project, we had to create a complete campaign for a sports beer brand, and design a website for that campaign. The design had to stay consistent with the brand's identity and core values.",
      "After research and brainstorming, I came up with a campaign involving cycling and electricity. When you cycle, you can measure your energy output in Watts, and these Watts can (in theory) be used to brew Thrive beer. I calculated it would take the average person about 39km of cycling to produce enough energy for one can of Thrive beer.",
      "So in this campaign, we call people to take part in a cycling challenge to raise awareness about sustainable energy and promote the Thrive brand. They can track their progress, but the most important thing is the collective impact.",
      "I translated this into a modern design, using light/electric blue, symbolizing electricity, and dark red, symbolizing CO2 emissions.",
    ],
  },
  {
    id: "2",
    title: "Lumen",
    tagline: "A campaign and app that lets young visitors light up Antwerp.",
    type: "Campaign website & app",
    role: "UX/UI, concept, development",
    context: "Group project, 4 people",
    tags: ["Campaign", "Mobile app", "Development"],
    image: lumen,
    accent: "#ff6a2b",
    cardPosition: "50% 50%",
    figma:
      "https://embed.figma.com/proto/nBZfMWoxyOufoEYdwfx8gE/K-Town-x-Roffa?node-id=4102-23866&page-id=930%3A507&starting-point-node-id=4102%3A23866&embed-host=share",
    body: [
      "This group project was about creating a complete campaign for the city of Antwerp. The tourism board of Antwerp wanted to promote the city to the younger generation.",
      "We came up with a campaign called Lumen. The concept was that Antwerp is not an A-list city, and we embraced that idea. We wanted to show that Antwerp has everything that other A-list cities have, but that Antwerp is in the shadows of those cities.",
      "We created a mobile app where you can track your trip in Antwerp. You see the city on a map, but in the shadow. As you walk, you 'light up' the city. You can see pins of other players (images/sounds) without context, no description or review. This way we trigger the user's curiosity to explore and get lost in the city.",
      "Our group counted four members. My contribution was mainly UX/UI and development focused: I worked on the concept and the content for the website, and I wrote the code for the campaign website.",
    ],
  },
  {
    id: "3",
    title: "TYPE01",
    tagline: "A Swiss-style conference website for a typography magazine.",
    type: "Conference website",
    role: "UX/UI design, responsive",
    context: "Devine, Howest",
    tags: ["Typography", "Grid systems", "Responsive"],
    image: type01,
    accent: "#ff2e1f",
    cardPosition: "0% 50%",
    cardDim: 0.38,
    figma:
      "https://embed.figma.com/proto/sC5G85UaOqpK8FpCHFwaIG/TYPE01?node-id=320-26155&viewport=223%2C100%2C0.12&scaling=min-zoom&content-scaling=fixed&starting-point-node-id=320%3A26155&show-proto-sidebar=1&page-id=296%3A4613&embed-host=share",
    body: [
      "TYPE01 is a typography magazine, and every year they organize a conference about typography. For this project, I had to create a modern website for the conference that is consistent with the magazine's identity and core values. The website also had to be responsive for both desktop and mobile.",
      "I got inspiration from Swiss Style design and grid systems, using elementary objects and colors. The result is a modern looking website with a retro feeling, which appeals to all audiences.",
    ],
  },
  {
    id: "4",
    title: "Tiltionary",
    tagline: "A multiplayer drawing game where you draw by tilting your phone.",
    type: "Mobile app",
    role: "Concept, UX/UI, development",
    context: "React Native, Howest",
    tags: ["React Native", "Realtime", "Multiplayer"],
    image: tiltionary,
    accent: "#4285f4",
    cardPosition: "50% 50%",
    cardDim: 0.55,
    repo: "https://github.com/senne-debacker/Tiltionary",
    video: {
      src: "/videos/tiltionary-demo.mp4",
      caption: "Demo: an Android phone and an iPhone playing a round together.",
    },
    body: [
      "Tiltionary is a multiplayer drawing and guessing game for your phone, where you draw by tilting it. You drop a ball on the canvas and roll it around to draw the word you were given, while the other players guess in the chat. The faster you guess, the more points you score.",
      "The app is built with Expo and React Native, with Expo Router for navigation, Zustand for state and the Firebase Realtime Database to keep every phone in sync. One hook listens to the room and writes everything into a store, so screens never talk to Firebase directly. The host's phone moves the game from phase to phase, and the drawing streams to all players live.",
      "Besides the game there is a sandbox to practise the controls, and you can save or share your drawing as a photo or as an animated GIF that replays how you drew it. The look follows a styleboard based on Google's developer event branding: four brand colours, flat shapes with thin outlines, and light and dark mode on every screen.",
      "Because it uses the accelerometer and other native features, Tiltionary only runs on a phone, so there is no playable version on this website. The video shows a full game on two devices.",
    ],
  },
  {
    id: "wake",
    href: "/wake/",
    title: "Wake",
    tagline: "A tiny ocean planet you can sail around, in the browser.",
    type: "Interactive 3D experience",
    role: "Creative development",
    context: "Expert Creative Development, Howest",
    tags: ["WebGPU", "Three.js", "TSL shaders"],
    image: wake,
    accent: "#e8a36a",
    cardPosition: "45% 50%",
    cardDim: 0.6,
    body: [
      "Wake is a small game-like toy: a low-poly water planet with a fishing boat you steer yourself. The sea is drawn on the GPU with a Shadertoy noise shader ported to TSL, and the boat floats on exactly the same waves. It has a day and night cycle, storms with rain and lightning, a lighthouse, islands and a foam wake that follows your path.",
      "Best in a recent Chrome or Edge, since it needs WebGPU.",
    ],
  },
];

export const featured: Featured = {
  project: projects.find((p) => p.id === "wake")!,
  notes: [{ label: "Mobile", value: "Touch controls, work in progress" }],
  cta: "Sail it",
};

/** Link to a project: its own page when it has one, otherwise the case study. */
export const projectHref = (p: Project, baseUrl: string) => `${baseUrl}${p.href ?? `/work/${p.id}`}`;

export const pad = (n: number) => String(n).padStart(2, "0");
