const canvas = document.querySelector("#game");
const context = canvas.getContext("2d");

const hud = {
  banked: document.querySelector("#hud-banked"),
  best: document.querySelector("#hud-best"),
  wallet: document.querySelector("#hud-wallet"),
  timer: document.querySelector("#hud-timer"),
  carrying: document.querySelector("#hud-carrying"),
  message: document.querySelector("#hud-message"),
  prompt: document.querySelector("#hud-prompt")
};

const fullscreenHud = {
  banked: document.querySelector("#fullscreen-banked"),
  best: document.querySelector("#fullscreen-best"),
  wallet: document.querySelector("#fullscreen-wallet"),
  timer: document.querySelector("#fullscreen-timer"),
  carrying: document.querySelector("#fullscreen-carrying")
};

const TILE_SIZE = 32;
const COLUMNS = 30;
const ROWS = 20;

const WALL = 1;
const FLOOR = 0;

const WALK_SPEED = 150;
const SPRINT_SPEED = 230;
const PICKUP_TIME = 0.5;
const SPRINT_NOISE_INTERVAL = 0.7;
const WALK_STEP_INTERVAL = 0.42;
const SPRINT_STEP_INTERVAL = 0.28;
const CREATURE_HEARING_RANGE = 250;
const CREATURE_SIGHT_RANGE = 150;
const CREATURE_SPEED = 65;
const CREATURE_CATCH_RANGE = 27;
const SEARCH_TIME = 2.5;
const HIDE_RANGE = 42;

const RUN_TIME_SECONDS = 75;
const MINIMUM_BOUNTY = 80;
const BEST_SCORE_KEY = "dontWakeItBestScore";
const WALLET_KEY = "dontWakeItCampaignWallet";
const OWNED_PARTS_KEY = "dontWakeItOwnedWeaponParts";

// The final part of each weapon is saved for a later level.
const weaponBlueprints = [
  {
    id: "hush-dart",
    name: "Hush Dart",
    role: "A quiet shot that briefly lulls the creature to sleep.",
    parts: [
      {
        id: "hush-spring",
        name: "Spring mechanism",
        cost: 100,
        available: true
      },
      {
        id: "hush-barrel",
        name: "Felt-wrapped barrel",
        cost: 150,
        available: true
      },
      {
        id: "hush-core",
        name: "Sleep-dart core",
        cost: 200,
        available: false
      }
    ]
  },
  {
    id: "echo-decoy",
    name: "Echo Decoy",
    role: "A thrown lure that draws the creature toward a false sound.",
    parts: [
      {
        id: "echo-shell",
        name: "Hollow bell shell",
        cost: 100,
        available: true
      },
      {
        id: "echo-motor",
        name: "Wind-up motor",
        cost: 150,
        available: true
      },
      {
        id: "echo-crystal",
        name: "Mimic crystal",
        cost: 200,
        available: false
      }
    ]
  }
];

const keysDown = new Set();
let joystickDirection = { x: 0, y: 0 };
let joystickActive = false;

const level = Array.from(
  { length: ROWS },
  () => Array(COLUMNS).fill(WALL)
);

function carveRoom(left, top, width, height) {
  for (let y = top; y < top + height; y++) {
    for (let x = left; x < left + width; x++) {
      level[y][x] = FLOOR;
    }
  }
}

function carveHorizontalCorridor(startX, endX, y) {
  for (let x = startX; x <= endX; x++) {
    level[y][x] = FLOOR;
  }
}

function carveVerticalCorridor(x, startY, endY) {
  for (let y = startY; y <= endY; y++) {
    level[y][x] = FLOOR;
  }
}

carveRoom(2, 2, 7, 5);     // Study
carveRoom(10, 2, 8, 5);    // Gallery
carveRoom(19, 2, 9, 5);    // Pantry
carveRoom(2, 9, 7, 5);     // Entry / Exit
carveRoom(20, 9, 8, 5);    // Kitchen
carveRoom(9, 15, 9, 4);    // Workshop
carveRoom(11, 9, 7, 5);    // Creature's Den

carveVerticalCorridor(5, 7, 8);       // Study to Entry
carveVerticalCorridor(9, 4, 5);       // Study to Gallery
carveVerticalCorridor(18, 4, 5);      // Gallery to Pantry
carveVerticalCorridor(23, 7, 8);      // Pantry to Kitchen
carveVerticalCorridor(14, 7, 8);      // Gallery to Den
carveHorizontalCorridor(18, 19, 11);  // Den to Kitchen
carveHorizontalCorridor(5, 12, 14);   // Entry to south hallway
carveHorizontalCorridor(17, 24, 14);  // Workshop to Kitchen

function tileCenter(column, row) {
  return {
    x: column * TILE_SIZE + TILE_SIZE / 2,
    y: row * TILE_SIZE + TILE_SIZE / 2
  };
}

const playerStart = tileCenter(5, 11);

const player = {
  x: playerStart.x,
  y: playerStart.y,
  radius: 12,
  hidden: false
};

const creatureHome = tileCenter(14, 11);

const creature = {
  x: creatureHome.x,
  y: creatureHome.y,
  state: "sleeping",
  path: [],
  searchTimer: 0,
  noiseTarget: null,
  targetTileKey: null,
  alertReason: "sound"
};

// These crates are hiding spots and block movement and sight.
const hidingSpots = [
  { ...tileCenter(12, 12), column: 12, row: 12 },
  { ...tileCenter(17, 10), column: 17, row: 10 }
];

const exit = tileCenter(3, 11);

// Each item's noiseRange determines whether the creature hears the pickup.
const lootItems = [
  {
    ...tileCenter(5, 4),
    name: "Coin pouch",
    value: 10,
    color: "#f2c977",
    noiseRange: 90,
    noiseLabel: "quiet"
  },
  {
    ...tileCenter(14, 4),
    name: "Silver frame",
    value: 25,
    color: "#d9e4e8",
    noiseRange: 140,
    noiseLabel: "noticeable"
  },
  {
    ...tileCenter(24, 4),
    name: "Porcelain",
    value: 35,
    color: "#9ed1d4",
    noiseRange: 210,
    noiseLabel: "loud"
  },
  {
    ...tileCenter(24, 11),
    name: "Cutlery",
    value: 20,
    color: "#f2c977",
    noiseRange: 180,
    noiseLabel: "loud"
  },
  {
    ...tileCenter(16, 12),
    name: "Crown jewel",
    value: 80,
    color: "#f28c9a",
    noiseRange: 250,
    noiseLabel: "very loud"
  },
  {
    ...tileCenter(13, 17),
    name: "Tool case",
    value: 50,
    color: "#e3a66f",
    noiseRange: 220,
    noiseLabel: "loud"
  }
].map((item) => ({ ...item, collected: false }));

// These paths are relative to index.html.
const soundFiles = {
  // Walking is retriggered at the step cadence below; looping the whole sample
  // made the footfalls sound uneven on mobile Safari.
  walking: createSound("audio/footsteps-wood.wav"),
  sprinting: createSound("audio/sprint-footsteps.wav", true),
  coin: createSound("audio/coin-collect.wav"),
  diamond: createSound("audio/diamond-collect.wav"),
  silver: createSound("audio/silver-collect.ogg"),
  creatureSnore: createSound("audio/monster-snoar.mp3", true),
  creatureSniffing: createSound("audio/monster-sniffing.mp3", true),
  creatureRoar: createSound("audio/monster-roar.mp3"),
  creatureBite: createSound("audio/monster-bite.mp3"),
  playerDeathcry: createSound("audio/player-deathcry.mp3")
};

let caughtElapsed = 0;
let deathCryPlayed = false;
let deathCryDelay = 0.9;
let audioUnlocked = false;
let audioUnlockPromise = null;
const unlockedSounds = new WeakSet();
let footstepsWanted = false;
let footstepsSprinting = false;
let footstepUnlockQueued = false;

function createSound(path, shouldLoop = false) {
  const sound = new Audio(path);
  sound.preload = "auto";
  sound.loop = shouldLoop;
  return sound;
}

let carriedItem = null;
let bankedValue = 0;
let bestScore = loadBestScore();
let campaignWallet = loadCampaignWallet();
let ownedWeaponParts = loadOwnedWeaponParts();

let remainingTime = RUN_TIME_SECONDS;
let runStarted = false;

let pickupProgress = 0;
let nearbyLoot = null;
let nearbyHidingSpot = null;
let gameState = "menu";
let interactPressed = false;
let hidePressed = false;
let sprintNoiseTimer = 0;
let footstepTimer = 0;
let noiseEffect = null;
let statusMessage = "Welcome back. Ready for another raid?";

function loadBestScore() {
  try {
    return Number(localStorage.getItem(BEST_SCORE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBestScore(score) {
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(score));
  } catch {
    // The game still works if browser storage is unavailable.
  }
}

function loadCampaignWallet() {
  try {
    return Number(localStorage.getItem(WALLET_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveCampaignWallet() {
  try {
    localStorage.setItem(WALLET_KEY, String(campaignWallet));
  } catch {
    // The run remains playable if browser storage is unavailable.
  }
}

function loadOwnedWeaponParts() {
  try {
    const savedParts = JSON.parse(
      localStorage.getItem(OWNED_PARTS_KEY) || "[]"
    );

    return Array.isArray(savedParts) ? savedParts : [];
  } catch {
    return [];
  }
}

function saveOwnedWeaponParts() {
  try {
    localStorage.setItem(
      OWNED_PARTS_KEY,
      JSON.stringify(ownedWeaponParts)
    );
  } catch {
    // The workshop remains usable for this page session.
  }
}

function openWorkshop() {
  gameState = "workshop";
  keysDown.clear();
  stopFootsteps();
  stopCreatureLoops();
}

function buyWorkshopPart(partId) {
  const availableParts = weaponBlueprints.flatMap((weapon) =>
    weapon.parts.filter((part) => part.available)
  );

  const part = availableParts.find(
    (availablePart) => availablePart.id === partId
  );

  if (!part) {
    return;
  }

  if (ownedWeaponParts.includes(part.id)) {
    statusMessage = `You already own the ${part.name}.`;
    return;
  }

  if (campaignWallet < part.cost) {
    statusMessage =
      `You need $${part.cost - campaignWallet} more for the ${part.name}.`;
    return;
  }

  campaignWallet -= part.cost;
  ownedWeaponParts.push(part.id);
  saveCampaignWallet();
  saveOwnedWeaponParts();
  statusMessage = `${part.name} added to your collection.`;
}

function pauseGame() {
  if (gameState !== "playing") return;
  gameState = "paused";
  statusMessage = "Raid paused.";
  keysDown.clear();
  stopFootsteps();
  stopCreatureLoops();
}

function resumeGame() {
  if (gameState !== "paused") return;
  gameState = "playing";
  statusMessage = "Back in the house. Watch your noise.";
  resumeCreatureLoopForCurrentState();
}

function returnToMainMenu() {
  gameState = "menu";
  keysDown.clear();
  stopFootsteps();
  stopCreatureLoops();
  statusMessage = "Choose your next move.";
}

function drawMenuButton(label, x, y, width, height, highlighted = false) {
  context.fillStyle = highlighted ? "#775e3b" : "#273442";
  context.fillRect(x, y, width, height);
  context.strokeStyle = highlighted ? "#f2c977" : "#8b9ba8";
  context.lineWidth = 2;
  context.strokeRect(x, y, width, height);
  context.fillStyle = "#f1eee7";
  context.textAlign = "center";
  context.font = "bold 18px sans-serif";
  context.fillText(label, x + width / 2, y + height / 2 + 6);
  context.textAlign = "left";
}

function drawStartMenu() {
  context.fillStyle = "rgba(17, 23, 34, 0.88)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.textAlign = "center";
  context.fillStyle = "#f1eee7";
  context.font = "bold 52px sans-serif";
  context.fillText("DON'T WAKE IT", canvas.width / 2, 170);
  context.font = "20px sans-serif";
  context.fillStyle = "#c6d0d6";
  context.fillText("Take what you can. Get out before it wakes.", canvas.width / 2, 212);
  context.font = "bold 16px sans-serif";
  context.fillStyle = "#f2c977";
  context.fillText(`BEST RAID  $${bestScore}     ·     WORKSHOP BOUNTY  $${campaignWallet}`, canvas.width / 2, 265);

  drawMenuButton("START RAID", 340, 315, 280, 58, true);
  drawMenuButton("VISIT WORKSHOP", 340, 390, 280, 52);

  context.font = "14px sans-serif";
  context.fillStyle = "#c6d0d6";
  context.fillText("Move: WASD / arrows     Sprint: Shift     Take / bank: E     Hide: H", canvas.width / 2, 492);
  context.fillText("Pause during a raid with P, Esc, or the pause icon.", canvas.width / 2, 520);
  context.textAlign = "left";
}

function drawPauseIcon() {
  const x = canvas.width - 54;
  const y = 14;
  context.fillStyle = "#111722dd";
  context.fillRect(x, y, 40, 38);
  context.strokeStyle = "#aeb8bf";
  context.lineWidth = 2;
  context.strokeRect(x, y, 40, 38);
  context.fillStyle = "#f1eee7";
  context.fillRect(x + 13, y + 10, 5, 18);
  context.fillRect(x + 22, y + 10, 5, 18);
}

function drawPauseMenu() {
  context.fillStyle = "rgba(17, 23, 34, 0.84)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.textAlign = "center";
  context.fillStyle = "#f1eee7";
  context.font = "bold 42px sans-serif";
  context.fillText("PAUSED", canvas.width / 2, 225);
  context.font = "16px sans-serif";
  context.fillStyle = "#c6d0d6";
  context.fillText("Your timer and the creature are stopped.", canvas.width / 2, 260);

  drawMenuButton("RESUME", 340, 290, 280, 54, true);
  drawMenuButton("RESTART RAID", 340, 360, 280, 54);
  drawMenuButton("MAIN MENU", 340, 430, 280, 54);

  context.font = "14px sans-serif";
  context.fillStyle = "#c6d0d6";
  context.fillText("P or Esc: resume     R: restart     M: main menu", canvas.width / 2, 520);
  context.textAlign = "left";
}
function playSound(sound, volume = 1) {
  if (!sound) {
    return Promise.resolve(false);
  }

  // Wait for the silent iOS/Safari unlock attempt to finish before starting
  // audible playback. Otherwise its cleanup can pause a sound just started by
  // the same tap (most often the creature's snore on the Start button).
  if (audioUnlockPromise) {
    return audioUnlockPromise.then(() => playSoundNow(sound, volume));
  }

  return playSoundNow(sound, volume);
}

function playSoundNow(sound, volume = 1) {
  try {
    sound.volume = volume;
    safelyRewindSound(sound);
    const playback = sound.play();
    return playback && typeof playback.then === "function"
      ? playback.then(() => true).catch(() => false)
      : Promise.resolve(true);
  } catch {
    return Promise.resolve(false);
  }
}

function safelyRewindSound(sound) {
  if (!sound || sound.readyState < 1) return;
  try {
    sound.currentTime = 0;
  } catch {
    // A seek is optional; never let it block playback on iOS Safari.
  }
}

function safelyStopSound(sound) {
  if (!sound) return;
  try {
    sound.pause();
  } catch {}
  safelyRewindSound(sound);
}

// Mobile Safari requires media playback to originate from a user gesture.
// Prime each element silently, then let real playback begin only after all
// priming cleanup is complete. Failed elements are retried on later gestures.
function unlockGameAudio() {
  if (audioUnlocked) return Promise.resolve(true);
  if (audioUnlockPromise) return audioUnlockPromise;

  const soundsToUnlock = Object.values(soundFiles).filter(
    (sound) => !unlockedSounds.has(sound)
  );

  if (soundsToUnlock.length === 0) {
    audioUnlocked = true;
    return Promise.resolve(true);
  }

  const attempts = soundsToUnlock.map((sound) => {
    const previousVolume = sound.volume;
    const previousMuted = sound.muted;
    sound.muted = true;
    sound.volume = 0;

    try {
      const playback = sound.play();
      if (playback && typeof playback.then === "function") {
        return playback.then(() => {
          sound.pause();
          try {
            sound.currentTime = 0;
          } catch {}
          sound.muted = previousMuted;
          sound.volume = previousVolume;
          unlockedSounds.add(sound);
          return true;
        }).catch(() => {
          sound.pause();
          try {
            sound.currentTime = 0;
          } catch {}
          sound.muted = previousMuted;
          sound.volume = previousVolume;
          return false;
        });
      } else {
        sound.pause();
        try {
          sound.currentTime = 0;
        } catch {}
        sound.muted = previousMuted;
        sound.volume = previousVolume;
        unlockedSounds.add(sound);
        return Promise.resolve(true);
      }
    } catch {
      sound.muted = previousMuted;
      sound.volume = previousVolume;
      return Promise.resolve(false);
    }
  });

  audioUnlockPromise = Promise.all(attempts).then((results) => {
    audioUnlocked = results.every(Boolean) ||
      Object.values(soundFiles).every((sound) => unlockedSounds.has(sound));
    audioUnlockPromise = null;
    return audioUnlocked;
  });

  return audioUnlockPromise;
}

function startCreatureLoop(sound, volume) {
  if (!sound) return;
  sound.loop = true;
  sound.volume = volume;
  sound.loopWanted = true;

  const start = () => {
    if (!sound.loopWanted || !sound.paused) return;
    playSoundNow(sound, volume);
  };

  if (audioUnlockPromise) {
    audioUnlockPromise.then(start);
    return;
  }

  if (!sound.paused) return;
  start();
}

function stopCreatureLoops() {
  for (const sound of [soundFiles.creatureSnore, soundFiles.creatureSniffing]) {
    sound.loopWanted = false;
    safelyStopSound(sound);
  }
}

function playCreatureAlert() {
  stopCreatureLoops();
  playSound(soundFiles.creatureRoar, 0.8);
}

function playCreatureSearchCue() {
  stopCreatureLoops();
  startCreatureLoop(soundFiles.creatureSniffing, 0.65);
}

function resumeCreatureLoopForCurrentState() {
  if (creature.state === "sleeping") {
    startCreatureLoop(soundFiles.creatureSnore, 0.35);
  } else if (creature.state === "searching") {
    startCreatureLoop(soundFiles.creatureSniffing, 0.65);
  }
}

function drawCaughtBlood() {
  const redFade = Math.min(0.58, caughtElapsed * 0.5);
  context.fillStyle = `rgba(115, 0, 10, ${redFade})`;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const splatAlpha = Math.min(0.9, 0.35 + caughtElapsed * 0.3);
  const splashes = [
    [0.47, 0.48, 42], [0.53, 0.46, 28], [0.44, 0.54, 22],
    [0.58, 0.52, 20], [0.51, 0.56, 16], [0.39, 0.43, 13],
    [0.63, 0.42, 12], [0.36, 0.59, 10], [0.67, 0.58, 9]
  ];

  context.fillStyle = `rgba(90, 0, 7, ${splatAlpha})`;
  for (const [xRatio, yRatio, radius] of splashes) {
    const x = canvas.width * xRatio;
    const y = canvas.height * yRatio;
    context.beginPath();
    context.ellipse(x, y, radius, radius * 0.72, -0.25, 0, Math.PI * 2);
    context.fill();

    for (let drop = 0; drop < 5; drop++) {
      const angle = drop * 1.256 + xRatio * 8;
      const distance = radius * (1.25 + (drop % 3) * 0.35);
      context.beginPath();
      context.arc(
        x + Math.cos(angle) * distance,
        y + Math.sin(angle) * distance,
        Math.max(2, radius * (0.08 + (drop % 2) * 0.025)),
        0,
        Math.PI * 2
      );
      context.fill();
    }
  }
}

function playTreasureSound(item) {
  if (item.name === "Coin pouch") {
    playSound(soundFiles.coin, 0.65);
  } else if (item.name === "Crown jewel") {
    playSound(soundFiles.diamond, 0.8);
  } else {
    playSound(soundFiles.silver, 0.7);
  }
}

function playFootsteps(isSprinting) {
  footstepsWanted = true;
  footstepsSprinting = isSprinting;

  if (audioUnlockPromise) {
    if (!footstepUnlockQueued) {
      footstepUnlockQueued = true;
      audioUnlockPromise.then(() => {
        footstepUnlockQueued = false;
        if (footstepsWanted && gameState === "playing") {
          playFootsteps(footstepsSprinting);
        }
      });
    }
    return;
  }

  const chosenSound = isSprinting
    ? soundFiles.sprinting
    : soundFiles.walking;
  const otherSound = isSprinting
    ? soundFiles.walking
    : soundFiles.sprinting;

  safelyStopSound(otherSound);

  if (isSprinting) {
    chosenSound.playbackRate = 1.2;
    if (chosenSound.paused) playSound(chosenSound, 0.7);
  } else {
    chosenSound.playbackRate = 1;
    if (chosenSound.paused) playSound(chosenSound, 0.35);
  }
}

function stopFootsteps() {
  footstepsWanted = false;
  footstepUnlockQueued = false;
  for (const sound of [soundFiles.walking, soundFiles.sprinting]) {
    safelyStopSound(sound);
  }
}

function resetRun() {
  stopCreatureLoops();
  caughtElapsed = 0;
  deathCryPlayed = false;

  player.x = playerStart.x;
  player.y = playerStart.y;
  player.hidden = false;

  creature.x = creatureHome.x;
  creature.y = creatureHome.y;
  creature.state = "sleeping";
  creature.path = [];
  creature.searchTimer = 0;
  creature.noiseTarget = null;
  creature.targetTileKey = null;
  creature.alertReason = "sound";
  startCreatureLoop(soundFiles.creatureSnore, 0.35);

  carriedItem = null;
  bankedValue = 0;
  remainingTime = RUN_TIME_SECONDS;
  runStarted = false;

  pickupProgress = 0;
  nearbyLoot = null;
  nearbyHidingSpot = null;
  gameState = "playing";
  interactPressed = false;
  hidePressed = false;
  sprintNoiseTimer = 0;
  footstepTimer = 0;
  noiseEffect = null;
  statusMessage = "Move or interact to start the 75-second run.";

  for (const item of lootItems) {
    item.collected = false;
  }

  stopFootsteps();
}

function isFurnitureAtTile(tileX, tileY) {
  return hidingSpots.some(
    (spot) => spot.column === tileX && spot.row === tileY
  );
}

function isWallAtTile(tileX, tileY) {
  if (
    tileX < 0 ||
    tileY < 0 ||
    tileX >= COLUMNS ||
    tileY >= ROWS
  ) {
    return true;
  }

  return level[tileY][tileX] === WALL ||
    isFurnitureAtTile(tileX, tileY);
}

function canOccupy(x, y) {
  const leftTile = Math.floor((x - player.radius) / TILE_SIZE);
  const rightTile = Math.floor((x + player.radius) / TILE_SIZE);
  const topTile = Math.floor((y - player.radius) / TILE_SIZE);
  const bottomTile = Math.floor((y + player.radius) / TILE_SIZE);

  for (let tileY = topTile; tileY <= bottomTile; tileY++) {
    for (let tileX = leftTile; tileX <= rightTile; tileX++) {
      if (isWallAtTile(tileX, tileY)) {
        return false;
      }
    }
  }

  return true;
}

function getMovementDirection() {
  if (joystickActive) return joystickDirection;

  const movingRight =
    keysDown.has("d") || keysDown.has("arrowright");
  const movingLeft =
    keysDown.has("a") || keysDown.has("arrowleft");
  const movingDown =
    keysDown.has("s") || keysDown.has("arrowdown");
  const movingUp =
    keysDown.has("w") || keysDown.has("arrowup");

  let x = Number(movingRight) - Number(movingLeft);
  let y = Number(movingDown) - Number(movingUp);

  const length = Math.hypot(x, y);

  if (length > 0) {
    x /= length;
    y /= length;
  }

  return { x, y };
}

function findNearbyLoot() {
  let nearestItem = null;
  let nearestDistance = Infinity;

  for (const item of lootItems) {
    if (item.collected) {
      continue;
    }

    const distance = Math.hypot(
      player.x - item.x,
      player.y - item.y
    );

    if (distance < 36 && distance < nearestDistance) {
      nearestItem = item;
      nearestDistance = distance;
    }
  }

  return nearestItem;
}

function findNearbyHidingSpot() {
  let nearestSpot = null;
  let nearestDistance = Infinity;

  for (const spot of hidingSpots) {
    const distance = Math.hypot(
      player.x - spot.x,
      player.y - spot.y
    );

    if (distance < HIDE_RANGE && distance < nearestDistance) {
      nearestSpot = spot;
      nearestDistance = distance;
    }
  }

  return nearestSpot;
}

function findPath(startX, startY, targetX, targetY) {
  const startColumn = Math.floor(startX / TILE_SIZE);
  const startRow = Math.floor(startY / TILE_SIZE);
  const targetColumn = Math.floor(targetX / TILE_SIZE);
  const targetRow = Math.floor(targetY / TILE_SIZE);

  if (isWallAtTile(targetColumn, targetRow)) {
    return [];
  }

  const startKey = `${startColumn},${startRow}`;
  const targetKey = `${targetColumn},${targetRow}`;
  const queue = [{ column: startColumn, row: startRow }];
  const previous = new Map();
  previous.set(startKey, null);

  const directions = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 }
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    const currentKey = `${current.column},${current.row}`;

    if (currentKey === targetKey) {
      break;
    }

    for (const direction of directions) {
      const nextColumn = current.column + direction.x;
      const nextRow = current.row + direction.y;
      const nextKey = `${nextColumn},${nextRow}`;

      if (
        isWallAtTile(nextColumn, nextRow) ||
        previous.has(nextKey)
      ) {
        continue;
      }

      previous.set(nextKey, currentKey);
      queue.push({ column: nextColumn, row: nextRow });
    }
  }

  if (!previous.has(targetKey)) {
    return [];
  }

  const reversedPath = [];
  let currentKey = targetKey;

  while (currentKey !== startKey) {
    const [column, row] = currentKey.split(",").map(Number);
    reversedPath.push(tileCenter(column, row));
    currentKey = previous.get(currentKey);
  }

  return reversedPath.reverse();
}

function setCreatureInvestigating(target, reason) {
  const targetColumn = Math.floor(target.x / TILE_SIZE);
  const targetRow = Math.floor(target.y / TILE_SIZE);
  const targetTileKey = `${targetColumn},${targetRow}`;

  if (
    creature.state === "investigating" &&
    creature.targetTileKey === targetTileKey
  ) {
    return;
  }

  const wasAlreadyInvestigating = creature.state === "investigating";

  creature.noiseTarget = tileCenter(targetColumn, targetRow);
  creature.targetTileKey = targetTileKey;
  creature.path = findPath(
    creature.x,
    creature.y,
    creature.noiseTarget.x,
    creature.noiseTarget.y
  );
  creature.state = "investigating";
  if (!wasAlreadyInvestigating) {
    playCreatureAlert();
  }
  creature.searchTimer = 0;
  creature.alertReason = reason;
}

function makeNoiseAtPlayer(noiseRange, reason) {
  noiseEffect = {
    x: player.x,
    y: player.y,
    age: 0,
    duration: 0.65,
    radius: noiseRange
  };

  const distanceToCreature = Math.hypot(
    player.x - creature.x,
    player.y - creature.y
  );

  const wasHeard = distanceToCreature <= noiseRange;

  if (wasHeard) {
    setCreatureInvestigating(player, reason);
  }

  return wasHeard;
}

function hasLineOfSight(x1, y1, x2, y2) {
  const distance = Math.hypot(x2 - x1, y2 - y1);
  const sampleCount = Math.ceil(distance / 8);

  for (let sample = 1; sample < sampleCount; sample++) {
    const progress = sample / sampleCount;
    const x = x1 + (x2 - x1) * progress;
    const y = y1 + (y2 - y1) * progress;
    const column = Math.floor(x / TILE_SIZE);
    const row = Math.floor(y / TILE_SIZE);

    if (isWallAtTile(column, row)) {
      return false;
    }
  }

  return true;
}

function creatureCanSeePlayer() {
  if (player.hidden) {
    return false;
  }

  const distance = Math.hypot(
    player.x - creature.x,
    player.y - creature.y
  );

  return distance <= CREATURE_SIGHT_RANGE &&
    hasLineOfSight(creature.x, creature.y, player.x, player.y);
}

function moveCreatureAlongPath(deltaSeconds) {
  if (creature.path.length === 0) {
    return true;
  }

  const waypoint = creature.path[0];
  const dx = waypoint.x - creature.x;
  const dy = waypoint.y - creature.y;
  const distance = Math.hypot(dx, dy);
  const step = CREATURE_SPEED * deltaSeconds;

  if (distance <= step) {
    creature.x = waypoint.x;
    creature.y = waypoint.y;
    creature.path.shift();
  } else {
    creature.x += (dx / distance) * step;
    creature.y += (dy / distance) * step;
  }

  return creature.path.length === 0;
}

function failRun(reason, state = "failed") {
  carriedItem = null;
  gameState = state;
  statusMessage = reason;
  stopFootsteps();
  stopCreatureLoops();

  if (state === "caught") {
    caughtElapsed = 0;
    deathCryPlayed = false;
    const biteDuration = soundFiles.creatureBite.duration;
    deathCryDelay = Number.isFinite(biteDuration) && biteDuration > 0
      ? biteDuration
      : 0.9;
    const biteSound = soundFiles.creatureBite;
    const crySound = soundFiles.playerDeathcry;
    const playCry = () => {
      if (gameState === "caught" && !deathCryPlayed) {
        deathCryPlayed = true;
        playSound(crySound, 0.9);
      }
    };

    biteSound.onended = playCry;
    const bitePlayback = playSound(biteSound, 0.9);
    bitePlayback.then((started) => {
      if (!started) {
        // If the browser still rejects the bite, don't suppress the death cue.
        window.setTimeout(playCry, 350);
      }
    });
  }
}

function updateCreature(deltaSeconds) {
  if (creature.state === "investigating") {
    const reachedTarget = moveCreatureAlongPath(deltaSeconds);

    if (reachedTarget) {
      creature.state = "searching";
      playCreatureSearchCue();
      creature.searchTimer = SEARCH_TIME;
    }
  } else if (creature.state === "searching") {
    creature.searchTimer -= deltaSeconds;

    if (creature.searchTimer <= 0) {
      creature.path = findPath(
        creature.x,
        creature.y,
        creatureHome.x,
        creatureHome.y
      );
      creature.state = "returning";
      stopCreatureLoops();
    }
  } else if (creature.state === "returning") {
    const reachedHome = moveCreatureAlongPath(deltaSeconds);

    if (reachedHome) {
      creature.x = creatureHome.x;
      creature.y = creatureHome.y;
      creature.noiseTarget = null;
      creature.targetTileKey = null;
      creature.state = "sleeping";
      startCreatureLoop(soundFiles.creatureSnore, 0.35);
    }
  }

  const distanceToPlayer = Math.hypot(
    player.x - creature.x,
    player.y - creature.y
  );

  if (
    !player.hidden &&
    distanceToPlayer <= CREATURE_CATCH_RANGE
  ) {
    failRun(
      "The creature caught you. Your carried treasure is lost.",
      "caught"
    );
  }
}

function handleExitInteraction() {
  if (carriedItem) {
    bankedValue += carriedItem.value;

    // Deposited treasure is safe for the campaign and survives future raids.
    campaignWallet += carriedItem.value;
    saveCampaignWallet();

    statusMessage =
      `${carriedItem.name} banked! Safe total: $${bankedValue}. ` +
      (bankedValue >= MINIMUM_BOUNTY
        ? "Press E again to escape or keep earning."
        : `You need $${MINIMUM_BOUNTY - bankedValue} more to meet the bounty.`);

    carriedItem = null;
    pickupProgress = 0;
    return;
  }

  if (bankedValue < MINIMUM_BOUNTY) {
    const amountNeeded = MINIMUM_BOUNTY - bankedValue;
    statusMessage =
      `You need $${amountNeeded} more banked before you can escape.`;
    return;
  }

  gameState = "escaped";

  if (bankedValue > bestScore) {
    bestScore = bankedValue;
    saveBestScore(bestScore);
  }

  stopFootsteps();
  stopCreatureLoops();
  statusMessage = `You escaped with $${bankedValue} secured.`;
}

function formatTime(seconds) {
  const wholeSeconds = Math.ceil(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function update(deltaSeconds) {
  if (gameState === "caught") {
    caughtElapsed += deltaSeconds;
    if (!deathCryPlayed && caughtElapsed >= Math.max(1.8, deathCryDelay + 0.3)) {
      playSound(soundFiles.playerDeathcry, 0.9);
      deathCryPlayed = true;
    }
    interactPressed = false;
    hidePressed = false;
    return;
  }

  if (gameState !== "playing") {
    interactPressed = false;
    hidePressed = false;
    return;
  }

  sprintNoiseTimer = Math.max(0, sprintNoiseTimer - deltaSeconds);
  footstepTimer = Math.max(0, footstepTimer - deltaSeconds);

  if (noiseEffect) {
    noiseEffect.age += deltaSeconds;

    if (noiseEffect.age >= noiseEffect.duration) {
      noiseEffect = null;
    }
  }

  const direction = getMovementDirection();
  const isMoving = direction.x !== 0 || direction.y !== 0;

  if (
    !runStarted &&
    (isMoving ||
      keysDown.has("e") ||
      interactPressed ||
      hidePressed)
  ) {
    runStarted = true;
  }

  if (player.hidden && isMoving) {
    player.hidden = false;
    statusMessage = "You left your hiding place.";
  }

  if (hidePressed) {
    if (player.hidden) {
      player.hidden = false;
      statusMessage = "You left your hiding place.";
    } else if (!isMoving) {
      nearbyHidingSpot = findNearbyHidingSpot();

      if (nearbyHidingSpot) {
        player.hidden = true;
        statusMessage = "Hidden. Stay still, or press H to leave cover.";
      } else {
        statusMessage = "Move close to a marked crate to hide.";
      }
    } else {
      statusMessage = "Stop moving before you try to hide.";
    }

    hidePressed = false;
  }

  const isSprinting = keysDown.has("shift") && isMoving;
  const movementSpeed = isSprinting ? SPRINT_SPEED : WALK_SPEED;

  if (!player.hidden) {
    const stepX = direction.x * movementSpeed * deltaSeconds;
    const stepY = direction.y * movementSpeed * deltaSeconds;

    if (canOccupy(player.x + stepX, player.y)) {
      player.x += stepX;
    }

    if (canOccupy(player.x, player.y + stepY)) {
      player.y += stepY;
    }
  }

  if (isMoving && !player.hidden && footstepTimer <= 0) {
    playFootsteps(isSprinting);
    footstepTimer = isSprinting
      ? SPRINT_STEP_INTERVAL
      : WALK_STEP_INTERVAL;
  } else if (!isMoving || player.hidden) {
    stopFootsteps();
  }

  if (isSprinting && sprintNoiseTimer <= 0) {
    makeNoiseAtPlayer(CREATURE_HEARING_RANGE, "sound");
    sprintNoiseTimer = SPRINT_NOISE_INTERVAL;
  }

  nearbyLoot = findNearbyLoot();
  nearbyHidingSpot = findNearbyHidingSpot();

  const isHoldingInteract = keysDown.has("e");

  if (nearbyLoot && carriedItem) {
    pickupProgress = 0;
    statusMessage =
      `Hands full: return to the exit to bank your ${carriedItem.name}.`;
  } else if (
    nearbyLoot &&
    isHoldingInteract &&
    !isMoving &&
    !player.hidden
  ) {
    pickupProgress += deltaSeconds;
    statusMessage = `Taking ${nearbyLoot.name}...`;

    if (pickupProgress >= PICKUP_TIME) {
      const pickedUpItem = nearbyLoot;

      playTreasureSound(pickedUpItem);
      pickedUpItem.collected = true;
      carriedItem = pickedUpItem;
      pickupProgress = 0;
      nearbyLoot = null;

      const wasHeard = makeNoiseAtPlayer(
        pickedUpItem.noiseRange,
        "treasure"
      );

      if (wasHeard) {
        statusMessage =
          `${pickedUpItem.name} made a ${pickedUpItem.noiseLabel} sound! ` +
          "The creature is investigating.";
      } else {
        statusMessage =
          `${pickedUpItem.name} taken. Its sound didn't reach the creature.`;
      }
    }
  } else {
    pickupProgress = 0;

    if (player.hidden) {
      statusMessage = "Hidden. Stay still, or press H to leave cover.";
    } else if (carriedItem) {
      statusMessage =
        `Carrying ${carriedItem.name} ($${carriedItem.value}). ` +
        "Return to the exit to bank it.";
    } else if (nearbyLoot) {
      statusMessage =
        `Hold E: ${nearbyLoot.name} ($${nearbyLoot.value}, ` +
        `${nearbyLoot.noiseLabel}).`;
    } else if (nearbyHidingSpot) {
      statusMessage = "Press H to hide behind this crate.";
    } else if (creature.state === "investigating") {
      statusMessage = "The creature is investigating a sound or a sighting.";
    } else if (creature.state === "searching") {
      statusMessage = "The creature is searching. Stay hidden or get away.";
    } else if (creature.state === "returning") {
      statusMessage = "The creature is returning to its den.";
    } else if (!runStarted) {
      statusMessage = "Move or interact to start the 75-second run.";
    } else {
      statusMessage = "Find treasure, then return to the exit.";
    }
  }

  if (!player.hidden && creatureCanSeePlayer()) {
    setCreatureInvestigating(player, "sight");
    statusMessage = "It saw you! Hide or get away.";
  }

  const distanceToExit = Math.hypot(
    player.x - exit.x,
    player.y - exit.y
  );

  if (interactPressed && distanceToExit < 32 && !player.hidden) {
    handleExitInteraction();
  }

  if (gameState === "playing") {
    updateCreature(deltaSeconds);
  }

  if (gameState === "playing" && runStarted) {
    remainingTime = Math.max(0, remainingTime - deltaSeconds);

    if (remainingTime <= 0) {
      failRun("Time's up! Your carried treasure is lost.");
    }
  }

  interactPressed = false;
}

function drawFloor(x, y) {
  const isAlternateTile = (x + y) % 2 === 0;

  context.fillStyle = isAlternateTile ? "#3d4a4c" : "#394648";
  context.fillRect(
    x * TILE_SIZE,
    y * TILE_SIZE,
    TILE_SIZE,
    TILE_SIZE
  );

  context.strokeStyle = "#465353";
  context.strokeRect(
    x * TILE_SIZE + 0.5,
    y * TILE_SIZE + 0.5,
    TILE_SIZE,
    TILE_SIZE
  );
}

function drawWall(x, y) {
  context.fillStyle = "#182029";
  context.fillRect(
    x * TILE_SIZE,
    y * TILE_SIZE,
    TILE_SIZE,
    TILE_SIZE
  );

  context.fillStyle = "#303b43";
  context.fillRect(
    x * TILE_SIZE + 3,
    y * TILE_SIZE + 3,
    TILE_SIZE - 6,
    TILE_SIZE - 6
  );
}

function drawExit() {
  context.fillStyle = "#c99d72";
  context.fillRect(exit.x - 13, exit.y - 16, 26, 32);

  context.fillStyle = "#513f36";
  context.fillRect(exit.x - 8, exit.y - 11, 16, 27);

  context.fillStyle = "#f1d59b";
  context.beginPath();
  context.arc(exit.x + 4, exit.y + 1, 2, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#f1eee7";
  context.font = "12px sans-serif";
  context.fillText("EXIT", exit.x - 14, exit.y + 31);
}

function drawHidingSpots() {
  for (const spot of hidingSpots) {
    context.fillStyle = "#242a2d";
    context.fillRect(spot.x - 15, spot.y - 11, 32, 28);

    context.fillStyle = "#75583e";
    context.fillRect(spot.x - 16, spot.y - 14, 32, 28);

    context.fillStyle = "#9a7650";
    context.fillRect(spot.x - 13, spot.y - 12, 26, 9);

    context.strokeStyle = "#493b31";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(spot.x, spot.y - 12);
    context.lineTo(spot.x, spot.y + 12);
    context.moveTo(spot.x - 15, spot.y);
    context.lineTo(spot.x + 15, spot.y);
    context.stroke();

    context.fillStyle = "#f1eee7";
    context.font = "10px sans-serif";
    context.fillText("HIDE", spot.x - 13, spot.y + 25);
  }
}

function drawLoot() {
  for (const item of lootItems) {
    if (item.collected) {
      continue;
    }

    context.fillStyle = item.color;
    context.beginPath();
    context.moveTo(item.x, item.y - 10);
    context.lineTo(item.x + 9, item.y);
    context.lineTo(item.x, item.y + 10);
    context.lineTo(item.x - 9, item.y);
    context.closePath();
    context.fill();

    context.fillStyle = "#f1eee7";
    context.font = "11px sans-serif";
    context.fillText(`$${item.value}`, item.x - 13, item.y + 25);
  }
}

function drawNoiseEffect() {
  if (!noiseEffect) {
    return;
  }

  const progress = noiseEffect.age / noiseEffect.duration;
  const radius = 8 + progress * noiseEffect.radius;

  context.strokeStyle = `rgba(242, 201, 119, ${1 - progress})`;
  context.lineWidth = 3;
  context.beginPath();
  context.arc(
    noiseEffect.x,
    noiseEffect.y,
    radius,
    0,
    Math.PI * 2
  );
  context.stroke();
}

function drawCreature() {
  context.fillStyle = "#263034";
  context.beginPath();
  context.ellipse(
    creature.x,
    creature.y + 5,
    25,
    17,
    0,
    0,
    Math.PI * 2
  );
  context.fill();

  context.fillStyle =
    creature.state === "sleeping" ? "#786d83" : "#a77965";
  context.beginPath();
  context.ellipse(
    creature.x,
    creature.y,
    22,
    15,
    -0.2,
    0,
    Math.PI * 2
  );
  context.fill();

  context.fillStyle =
    creature.state === "sleeping" ? "#95869c" : "#c09178";
  context.beginPath();
  context.arc(
    creature.x + 12,
    creature.y - 7,
    11,
    0,
    Math.PI * 2
  );
  context.fill();

  context.strokeStyle = "#302b37";
  context.lineWidth = 2;
  context.beginPath();

  if (creature.state === "sleeping") {
    context.moveTo(creature.x + 15, creature.y - 9);
    context.lineTo(creature.x + 19, creature.y - 8);
  } else {
    context.arc(
      creature.x + 17,
      creature.y - 8,
      2,
      0,
      Math.PI * 2
    );
  }

  context.stroke();

  let label = "SLEEPING";

  if (creature.state === "investigating") {
    label = creature.alertReason === "sight"
      ? "SAW YOU"
      : "INVESTIGATING";
  } else if (creature.state === "searching") {
    label = "SEARCHING";
  } else if (creature.state === "returning") {
    label = "RETURNING";
  }

  if (creature.state === "sleeping") {
    context.fillStyle = "#d9e4e8";
    context.font = "bold 14px sans-serif";
    context.fillText("Z", creature.x + 18, creature.y - 23);
    context.font = "bold 11px sans-serif";
    context.fillText("z", creature.x + 28, creature.y - 33);
  }

  context.fillStyle = "#c6d0d6";
  context.font = "11px sans-serif";
  context.fillText(label, creature.x - 37, creature.y + 34);

  if (
    creature.noiseTarget &&
    (creature.state === "investigating" ||
      creature.state === "searching")
  ) {
    context.strokeStyle = "rgba(242, 201, 119, 0.45)";
    context.setLineDash([4, 4]);
    context.beginPath();
    context.moveTo(creature.x, creature.y);
    context.lineTo(creature.noiseTarget.x, creature.noiseTarget.y);
    context.stroke();
    context.setLineDash([]);
  }
}

function drawPlayer() {
  context.fillStyle = player.hidden ? "#8aa08c" : "#dfb17d";
  context.beginPath();
  context.arc(
    player.x,
    player.y,
    player.radius,
    0,
    Math.PI * 2
  );
  context.fill();

  if (carriedItem) {
    context.fillStyle = carriedItem.color;
    context.beginPath();
    context.arc(
      player.x + 10,
      player.y - 10,
      5,
      0,
      Math.PI * 2
    );
    context.fill();
  }

  if (player.hidden) {
    context.fillStyle = "#c6d0d6";
    context.font = "11px sans-serif";
    context.fillText("HIDDEN", player.x - 22, player.y - 19);
  }
}

function drawHud() {
  const bankedText = `$${bankedValue} / $${MINIMUM_BOUNTY}`;
  const timerText = runStarted ? formatTime(remainingTime) : "1:15";
  const carryingText = carriedItem
    ? `${carriedItem.name} ($${carriedItem.value})`
    : "Nothing";

  hud.banked.textContent = bankedText;
  hud.best.textContent = `$${bestScore}`;
  hud.wallet.textContent = `$${campaignWallet}`;
  hud.timer.textContent = timerText;
  hud.carrying.textContent = carryingText;
  fullscreenHud.banked.textContent = bankedText;
  fullscreenHud.best.textContent = `$${bestScore}`;
  fullscreenHud.wallet.textContent = `$${campaignWallet}`;
  fullscreenHud.timer.textContent = timerText;
  fullscreenHud.carrying.textContent = carryingText;
  hud.message.textContent = statusMessage;
  hud.prompt.textContent = nearbyHidingSpot && !player.hidden
    ? "You are near cover. Press H or tap HIDE."
    : player.hidden
      ? "Hidden. Stay still, or leave cover."
      : "";

  // Show the pickup progress bar beside the treasure being taken.
  if (nearbyLoot && !carriedItem && pickupProgress > 0) {
    const barWidth = 44;
    const fillWidth = barWidth * Math.min(
      pickupProgress / PICKUP_TIME,
      1
    );

    context.fillStyle = "#111722";
    context.fillRect(
      nearbyLoot.x - barWidth / 2,
      nearbyLoot.y + 30,
      barWidth,
      6
    );

    context.fillStyle = "#f2c977";
    context.fillRect(
      nearbyLoot.x - barWidth / 2,
      nearbyLoot.y + 30,
      fillWidth,
      6
    );
  }
}

function drawEndScreen(title, detail, extra) {
  context.fillStyle = "#111722cc";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.textAlign = "center";
  context.fillStyle = "#f1eee7";
  context.font = "bold 36px sans-serif";
  context.fillText(title, canvas.width / 2, canvas.height / 2 - 52);
  context.font = "20px sans-serif";
  context.fillText(detail, canvas.width / 2, canvas.height / 2 - 10);
  context.font = "17px sans-serif";
  context.fillText(extra, canvas.width / 2, canvas.height / 2 + 24);
  drawMenuButton("VISIT WORKSHOP", 340, canvas.height / 2 + 48, 280, 50, true);
  context.font = "13px sans-serif";
  context.fillStyle = "#c6d0d6";
  context.fillText("Or press R", canvas.width / 2, canvas.height / 2 + 120);
  context.textAlign = "left";
}

function drawWorkshop() {
  context.fillStyle = "#151d27";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.textAlign = "center";
  context.fillStyle = "#f1eee7";
  context.font = "bold 34px sans-serif";
  context.fillText("RAID WORKSHOP", canvas.width / 2, 54);

  context.font = "bold 20px sans-serif";
  context.fillStyle = "#f2c977";
  context.fillText(`BOUNTY: $${campaignWallet}`, canvas.width / 2, 88);

  context.font = "14px sans-serif";
  context.fillStyle = "#c6d0d6";
  context.fillText(
    "Tap or click an available part to buy it. Final parts are found later.",
    canvas.width / 2,
    116
  );

  weaponBlueprints.forEach((weapon, weaponIndex) => {
    const rowY = weaponIndex === 0 ? 145 : 355;
    const assembledCount = weapon.parts.filter((part) =>
      ownedWeaponParts.includes(part.id)
    ).length;

    context.textAlign = "left";
    context.fillStyle = "#f1eee7";
    context.font = "bold 20px sans-serif";
    context.fillText(
      `${weapon.name}  ${assembledCount}/3 parts`,
      36,
      rowY + 20
    );

    context.font = "13px sans-serif";
    context.fillStyle = "#c6d0d6";
    context.fillText(weapon.role, 36, rowY + 41);

    weapon.parts.forEach((part, partIndex) => {
      const cardX = 36 + partIndex * 300;
      const cardY = rowY + 53;
      const owned = ownedWeaponParts.includes(part.id);

      context.fillStyle = owned
        ? "#263b35"
        : part.available
          ? "#202b36"
          : "#20242b";
      context.fillRect(cardX, cardY, 282, 88);

      context.strokeStyle = owned
        ? "#6fa58b"
        : part.available
          ? "#8b9ba8"
          : "#41464d";
      context.lineWidth = 2;
      context.strokeRect(cardX, cardY, 282, 88);

      context.fillStyle = owned
        ? "#9ed1ad"
        : part.available
          ? "#f1eee7"
          : "#969da3";
      context.font = "bold 15px sans-serif";
      context.fillText(part.name, cardX + 12, cardY + 25);

      context.font = "13px sans-serif";

      if (owned) {
        context.fillStyle = "#9ed1ad";
        context.fillText("OWNED", cardX + 12, cardY + 55);
      } else if (part.available) {
        context.fillStyle = "#f2c977";
        context.fillText(
          `Tap / click to buy · $${part.cost}`,
          cardX + 12,
          cardY + 55
        );
      } else {
        context.fillStyle = "#b1b7bd";
        context.fillText(
          "FOUND IN THE NEXT AREA",
          cardX + 12,
          cardY + 55
        );
      }
    });
  });

  context.textAlign = "center";
  context.fillStyle = "#aeb8bf";
  context.font = "12px sans-serif";
  context.fillText(statusMessage, canvas.width / 2, 540);

  drawMenuButton("START NEXT RAID", 340, 565, 280, 52, true);

  context.textAlign = "left";
}

function buyWorkshopPartAtPointer(event) {
  if (gameState !== "workshop") {
    return;
  }

  const bounds = canvas.getBoundingClientRect();
  const canvasX =
    (event.clientX - bounds.left) * (canvas.width / bounds.width);
  const canvasY =
    (event.clientY - bounds.top) * (canvas.height / bounds.height);

  for (
    let weaponIndex = 0;
    weaponIndex < weaponBlueprints.length;
    weaponIndex++
  ) {
    const weapon = weaponBlueprints[weaponIndex];
    const rowY = weaponIndex === 0 ? 145 : 355;

    for (let partIndex = 0; partIndex < weapon.parts.length; partIndex++) {
      const part = weapon.parts[partIndex];
      const cardX = 36 + partIndex * 300;
      const cardY = rowY + 53;

      const insideCard =
        canvasX >= cardX &&
        canvasX <= cardX + 282 &&
        canvasY >= cardY &&
        canvasY <= cardY + 88;

      if (insideCard && part.available) {
        buyWorkshopPart(part.id);
        return;
      }

      if (insideCard && !part.available) {
        statusMessage = "That part is found in the next area.";
        return;
      }
    }
  }
}

function handleCanvasPointer(event) {
  const bounds = canvas.getBoundingClientRect();
  const x = (event.clientX - bounds.left) * (canvas.width / bounds.width);
  const y = (event.clientY - bounds.top) * (canvas.height / bounds.height);

  if (gameState === "menu") {
    if (x >= 340 && x <= 620 && y >= 315 && y <= 373) {
      resetRun();
    } else if (x >= 340 && x <= 620 && y >= 390 && y <= 442) {
      openWorkshop();
    }
    return;
  }

  if (gameState === "paused") {
    if (x >= 340 && x <= 620 && y >= 290 && y <= 344) {
      resumeGame();
    } else if (x >= 340 && x <= 620 && y >= 360 && y <= 414) {
      resetRun();
    } else if (x >= 340 && x <= 620 && y >= 430 && y <= 484) {
      returnToMainMenu();
    }
    return;
  }

  if (gameState === "playing") {
    if (x >= canvas.width - 60 && y >= 8 && y <= 60) {
      pauseGame();
    }
    return;
  }

  if (gameState === "escaped" || gameState === "caught" || gameState === "failed") {
    const buttonTop = canvas.height / 2 + 48;
    if (x >= 340 && x <= 620 && y >= buttonTop && y <= buttonTop + 50) {
      openWorkshop();
    }
    return;
  }

  if (gameState === "workshop") {
    if (x >= 340 && x <= 620 && y >= 565 && y <= 617) {
      resetRun();
      return;
    }
    buyWorkshopPartAtPointer(event);
  }
}
function drawGame() {
  gameStage?.classList.toggle("in-raid", gameState === "playing");
  drawHud();

  if (gameState === "menu") {
    drawStartMenu();
    return;
  }
  if (gameState === "paused") {
    drawPauseMenu();
    return;
  }
  if (gameState === "workshop") {
    drawWorkshop();
    return;
  }

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLUMNS; x++) {
      if (level[y][x] === WALL) {
        drawWall(x, y);
      } else {
        drawFloor(x, y);
      }
    }
  }

  drawExit();
  drawHidingSpots();
  drawLoot();
  drawNoiseEffect();
  drawCreature();
  drawPlayer();
  if (gameState === "playing") drawPauseIcon();

  if (gameState === "escaped") {
    drawEndScreen(
      "Bounty secured!",
      `You escaped with $${bankedValue}.`,
      `Personal best: $${bestScore}`
    );
  } else if (gameState === "caught") {
    drawCaughtBlood();
    if (caughtElapsed >= Math.max(4.5, deathCryDelay + 2)) {
      drawEndScreen(
        "It found you!",
        `Banked: $${bankedValue}. Carried treasure was lost.`,
        `Successful-run best: $${bestScore}`
      );
    }
  } else if (gameState === "failed") {
    const detail = bankedValue >= MINIMUM_BOUNTY
      ? `You banked $${bankedValue}, but didn't escape in time.`
      : `You banked $${bankedValue}; the bounty was $${MINIMUM_BOUNTY}.`;

    drawEndScreen(
      "Time's up!",
      detail,
      `Successful-run best: $${bestScore}`
    );
  }
}

function gameLoop(currentTime) {
  const previousTime = gameLoop.previousTime ?? currentTime;
  const deltaSeconds = Math.min(
    (currentTime - previousTime) / 1000,
    0.05
  );

  gameLoop.previousTime = currentTime;

  update(deltaSeconds);
  drawGame();

  requestAnimationFrame(gameLoop);
}

window.addEventListener("keydown", (event) => {
  unlockGameAudio();
  const key = event.key.toLowerCase();

  if (key.startsWith("arrow")) {
    event.preventDefault();
  }

  if (gameState === "menu") {
    if (["enter", " "].includes(key) && !event.repeat) resetRun();
    else if (key === "b" && !event.repeat) openWorkshop();
    return;
  }

  if (gameState === "paused") {
    if (key === "p" || key === "escape") resumeGame();
    else if (key === "r" && !event.repeat) resetRun();
    else if (key === "m" && !event.repeat) returnToMainMenu();
    return;
  }

  if (gameState === "playing" && (key === "p" || key === "escape")) {
    pauseGame();
    return;
  }

  if (gameState === "workshop") {
    if (key === "r" && !event.repeat) resetRun();
    return;
  }

  if (
    key === "r" && !event.repeat &&
    (gameState === "escaped" || gameState === "caught" || gameState === "failed")
  ) {
    openWorkshop();
    return;
  }

  if (key === "e" && !event.repeat) interactPressed = true;
  if (key === "h" && !event.repeat) hidePressed = true;
  keysDown.add(key);
});

window.addEventListener("keyup", (event) => {
  keysDown.delete(event.key.toLowerCase());
});

canvas.addEventListener("pointerdown", handleCanvasPointer);
// Capture phase is intentional: unlock audio before a tapped canvas/menu
// control starts a sound during the same interaction. Keep listening so a
// rejected iOS unlock can be retried on the next tap.
window.addEventListener("pointerdown", unlockGameAudio, { capture: true });

const gameStage = document.querySelector("#game-stage");
const touchControlSurface = document.querySelector(".touch-controls");
const fullscreenButton = document.querySelector("#fullscreen-button");
const controlsSettingsButton = document.querySelector("#controls-settings-button");
const controlsEditor = document.querySelector("#controls-editor");
const editControlsCheckbox = document.querySelector("#edit-controls");
const controlSizeSlider = document.querySelector("#control-size");
const controlOpacitySlider = document.querySelector("#control-opacity");
const controlSizeValue = document.querySelector("#control-size-value");
const controlOpacityValue = document.querySelector("#control-opacity-value");
const closeControlsButton = document.querySelector("#close-controls-editor");
const CONTROL_LAYOUT_KEY = "dontWakeItTouchLayout";
const CONTROL_LAYOUT_DEFAULTS = {
  size: 1,
  opacity: 0.55,
  move: { x: 2, y: 68 },
  actions: { x: 55, y: 68 }
};
let controlLayout = loadControlLayout();
let controlLayoutEditMode = false;

function loadControlLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(CONTROL_LAYOUT_KEY) || "null");
    return {
      ...CONTROL_LAYOUT_DEFAULTS,
      ...(saved || {}),
      move: { ...CONTROL_LAYOUT_DEFAULTS.move, ...(saved?.move || {}) },
      actions: { ...CONTROL_LAYOUT_DEFAULTS.actions, ...(saved?.actions || {}) }
    };
  } catch {
    return {
      ...CONTROL_LAYOUT_DEFAULTS,
      move: { ...CONTROL_LAYOUT_DEFAULTS.move },
      actions: { ...CONTROL_LAYOUT_DEFAULTS.actions }
    };
  }
}

function saveControlLayout() {
  try {
    localStorage.setItem(CONTROL_LAYOUT_KEY, JSON.stringify(controlLayout));
  } catch {
    // Customization still works until the page is closed.
  }
}

function applyControlLayout() {
  if (!gameStage) return;
  touchControlSurface?.style.setProperty("--touch-scale", controlLayout.size);
  touchControlSurface?.style.setProperty("--touch-opacity", controlLayout.opacity);

  document.querySelectorAll("[data-control-group]").forEach((group) => {
    const savedPosition = controlLayout[group.dataset.controlGroup];
    if (!savedPosition) return;
    group.style.left = `${savedPosition.x}%`;
    group.style.top = `${savedPosition.y}%`;
    group.style.right = "auto";
    group.style.bottom = "auto";
  });

  if (controlSizeSlider) {
    controlSizeSlider.value = String(controlLayout.size);
    controlSizeValue.textContent = `${Math.round(controlLayout.size * 100)}%`;
  }
  if (controlOpacitySlider) {
    controlOpacitySlider.value = String(controlLayout.opacity);
    controlOpacityValue.textContent = `${Math.round(controlLayout.opacity * 100)}%`;
  }
}

function setControlEditMode(enabled) {
  controlLayoutEditMode = enabled;
  gameStage?.classList.toggle("editing-controls", enabled);
  if (controlsEditor) {
    controlsEditor.querySelector(".edit-hint").textContent = enabled
      ? "Drag either control cluster to move it. Turn this off before playing."
      : "Turn on placement mode, then drag either control cluster.";
  }
}

function configureDraggableControlGroups() {
  document.querySelectorAll("[data-control-group]").forEach((group) => {
    let dragStart = null;

    group.addEventListener("pointerdown", (event) => {
      if (!controlLayoutEditMode) return;
      event.preventDefault();
      event.stopPropagation();
      group.setPointerCapture(event.pointerId);
      const stageBounds = touchControlSurface.getBoundingClientRect();
      const groupBounds = group.getBoundingClientRect();
      dragStart = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        left: groupBounds.left - stageBounds.left,
        top: groupBounds.top - stageBounds.top,
        stageBounds
      };
    });

    group.addEventListener("pointermove", (event) => {
      if (!controlLayoutEditMode || !dragStart) return;
      event.preventDefault();
      const { stageBounds } = dragStart;
      const groupWidth = group.getBoundingClientRect().width;
      const groupHeight = group.getBoundingClientRect().height;
      const maxLeft = Math.max(0, stageBounds.width - groupWidth);
      const maxTop = Math.max(0, stageBounds.height - groupHeight);
      const nextLeft = Math.min(maxLeft, Math.max(0,
        dragStart.left + event.clientX - dragStart.pointerX
      ));
      const nextTop = Math.min(maxTop, Math.max(0,
        dragStart.top + event.clientY - dragStart.pointerY
      ));
      const groupName = group.dataset.controlGroup;
      controlLayout[groupName] = {
        x: stageBounds.width ? nextLeft / stageBounds.width * 100 : 0,
        y: stageBounds.height ? nextTop / stageBounds.height * 100 : 0
      };
      applyControlLayout();
    });

    const finishDragging = () => {
      if (!dragStart) return;
      dragStart = null;
      saveControlLayout();
    };
    group.addEventListener("pointerup", finishDragging);
    group.addEventListener("pointercancel", finishDragging);
    group.addEventListener("lostpointercapture", finishDragging);
  });
}

function updateFullscreenButton() {
  if (!fullscreenButton) return;
  const fullscreen = document.fullscreenElement === gameStage ||
    gameStage?.classList.contains("pseudo-fullscreen");
  fullscreenButton.textContent = fullscreen ? "⤢ Exit" : "⛶ Fullscreen";
  fullscreenButton.setAttribute("aria-pressed", String(fullscreen));
}

async function toggleFullscreen() {
  if (!gameStage) return;

  if (document.fullscreenElement === gameStage) {
    await document.exitFullscreen().catch(() => {});
  } else if (gameStage.classList.contains("pseudo-fullscreen")) {
    gameStage.classList.remove("pseudo-fullscreen");
  } else if (gameStage.requestFullscreen) {
    try {
      await gameStage.requestFullscreen();
    } catch {
      gameStage.classList.add("pseudo-fullscreen");
    }
  } else {
    gameStage.classList.add("pseudo-fullscreen");
  }
  updateFullscreenButton();
}

fullscreenButton?.addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", updateFullscreenButton);

controlsSettingsButton?.addEventListener("click", () => {
  controlsEditor.hidden = !controlsEditor.hidden;
  if (controlsEditor.hidden) setControlEditMode(false);
});
closeControlsButton?.addEventListener("click", () => {
  controlsEditor.hidden = true;
  if (editControlsCheckbox) editControlsCheckbox.checked = false;
  setControlEditMode(false);
});
editControlsCheckbox?.addEventListener("change", () => {
  setControlEditMode(editControlsCheckbox.checked);
});
controlSizeSlider?.addEventListener("input", () => {
  controlLayout.size = Number(controlSizeSlider.value);
  applyControlLayout();
  saveControlLayout();
});
controlOpacitySlider?.addEventListener("input", () => {
  controlLayout.opacity = Number(controlOpacitySlider.value);
  applyControlLayout();
  saveControlLayout();
});

const joystickBase = document.querySelector("#joystick-base");
const joystickKnob = document.querySelector("#joystick-knob");

function moveJoystick(event) {
  if (!joystickBase || !joystickKnob) return;

  const bounds = joystickBase.getBoundingClientRect();
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const maxTravel = bounds.width * 0.28;
  let dx = event.clientX - centerX;
  let dy = event.clientY - centerY;
  const distance = Math.hypot(dx, dy);

  if (distance > maxTravel) {
    dx = dx / distance * maxTravel;
    dy = dy / distance * maxTravel;
  }

  const travel = Math.min(1, Math.hypot(dx, dy) / maxTravel);
  const deadZone = 0.08;
  const strength = travel <= deadZone
    ? 0
    : (travel - deadZone) / (1 - deadZone);

  joystickDirection = travel === 0
    ? { x: 0, y: 0 }
    : {
        x: dx / Math.hypot(dx, dy) * strength,
        y: dy / Math.hypot(dx, dy) * strength
      };

  joystickKnob.style.left = `calc(50% + ${dx}px)`;
  joystickKnob.style.top = `calc(50% + ${dy}px)`;
}

function resetJoystick() {
  joystickActive = false;
  joystickDirection = { x: 0, y: 0 };
  if (joystickKnob) {
    joystickKnob.style.left = "50%";
    joystickKnob.style.top = "50%";
  }
}

joystickBase?.addEventListener("pointerdown", (event) => {
  if (controlLayoutEditMode) return;
  event.preventDefault();
  event.stopPropagation();
  joystickBase.setPointerCapture(event.pointerId);
  joystickActive = true;
  moveJoystick(event);
});

joystickBase?.addEventListener("pointermove", (event) => {
  if (!joystickActive || controlLayoutEditMode) return;
  event.preventDefault();
  moveJoystick(event);
});

joystickBase?.addEventListener("pointerup", resetJoystick);
joystickBase?.addEventListener("pointercancel", resetJoystick);
joystickBase?.addEventListener("lostpointercapture", resetJoystick);

document.querySelectorAll("[data-game-key]").forEach((button) => {
  const key = button.dataset.gameKey;

  button.addEventListener("pointerdown", (event) => {
    if (controlLayoutEditMode) return;
    event.preventDefault();
    event.stopPropagation();
    button.setPointerCapture(event.pointerId);
    keysDown.add(key);

    if (key === "e") interactPressed = true;
    if (key === "h") hidePressed = true;
  });

  function releaseButton(event) {
    event.preventDefault();
    keysDown.delete(key);
  }

  button.addEventListener("pointerup", releaseButton);
  button.addEventListener("pointercancel", releaseButton);
  button.addEventListener("lostpointercapture", releaseButton);
});

applyControlLayout();
configureDraggableControlGroups();

window.addEventListener("blur", () => {
  keysDown.clear();
  resetJoystick();
  stopFootsteps();
});

drawGame();
requestAnimationFrame(gameLoop);
