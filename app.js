"use strict";

const COMPLETION_CUT_IN_MS = 4000;
const COMPLETION_REVEAL_DELAY_MS = 720;
const MATCH_INTRO_MS = 2100;
const MATCH_INTRO_PRELUDE_SOUND_MS = 120;
const MATCH_INTRO_CHARGE_SOUND_MS = 1100;
const MISPLAY_CUT_IN_MS = 950;
const END_CURTAIN_DURATION_MS = 1550;
const END_STAMP_SOUND_MS = 650;
const CPU_THINK_DELAY_MS = Object.freeze({ normal: 1250, hard: 1000 });
const CPU_CARD_TRAVEL_MS = 820;
const CPU_DRAW_TRAVEL_MS = 600;
const CPU_AFTER_DRAW_DELAY_MS = Object.freeze({ normal: 700, hard: 560 });
const CPU_TURN_SETTLE_MS = 760;
const SCORE_RANK_POINTS = [0, 8000, 4400, 2400, 1000];
const SCORE_SPEED_MAX = 5200;
const SCORE_SPEED_DECAY_SECONDS = 85;
const SCORE_HARD_BONUS = 1400;
const SCORE_EXTRA_CPU_BONUS = 400;
const SCORE_MISTAKE_PENALTY = 500;
const SCORE_SHIHAN_MINIMUM = 14500;
const FIELD_FLUSH_MESSAGE = "全員が出せなかったため、場が流れました";
const SCORE_TITLES = [
  { minimum: SCORE_SHIHAN_MINIMUM, name: "文型師範", key: "shihan" },
  { minimum: 10000, name: "文型師匠", key: "shisho" },
  { minimum: 6000, name: "文型弟子", key: "deshi" },
  { minimum: Number.NEGATIVE_INFINITY, name: "文型見習い", key: "minarai" },
];

const BGM_TRACKS = {
  setup: { src: "assets/audio/bgm-setup.mp3", volume: 0.3 },
  battle: { src: "assets/audio/bgm-battle.mp3", volume: 0.25 },
};

const SOUND_EFFECTS = {
  click: { src: "assets/audio/se-click.mp3", volume: 0.42 },
  introPrelude: { src: "assets/audio/se-intro-prelude.mp3", volume: 0.6 },
  introCharge: { src: "assets/audio/se-intro-charge.mp3", volume: 0.58 },
  misplay: { src: "assets/audio/se-misplay.mp3", volume: 0.78 },
  completion: { src: "assets/audio/se-completion.mp3", volume: 0.62 },
  end: { src: "assets/audio/se-end.mp3", volume: 0.62 },
  "rank-shihan": { src: "assets/audio/se-rank-shihan.mp3", volume: 0.65 },
  "rank-shisho": { src: "assets/audio/se-rank-shisho.mp3", volume: 0.58 },
  "rank-deshi": { src: "assets/audio/se-rank-deshi.mp3", volume: 0.58 },
  "rank-minarai": { src: "assets/audio/se-rank-minarai.mp3", volume: 0.58 },
};

const PATTERNS = {
  SV: { slots: ["S", "V"], o1Role: null, xRole: null, description: "主語＋動詞", schoolForm: "第1文型" },
  SVC: {
    slots: ["S", "V", "O1"],
    o1Role: "C",
    xRole: null,
    description: "主語＋動詞＋補語",
    schoolForm: "第2文型",
  },
  SVO: {
    slots: ["S", "V", "O1"],
    o1Role: "O1",
    xRole: null,
    description: "主語＋動詞＋目的語",
    schoolForm: "第3文型",
  },
  SVOO: {
    slots: ["S", "V", "O1", "X"],
    o1Role: "O1",
    xRole: "O2",
    description: "主語＋動詞＋間接目的語＋直接目的語",
    schoolForm: "第4文型",
  },
  SVOC: {
    slots: ["S", "V", "O1", "X"],
    o1Role: "O1",
    xRole: "C",
    description: "主語＋動詞＋目的語＋補語",
    schoolForm: "第5文型",
  },
};

const PATTERN_ORDER = ["SV", "SVC", "SVO", "SVOO", "SVOC"];

function completedPatternLabel(pattern) {
  return `${pattern}・${PATTERNS[pattern].schoolForm}`;
}

const BASE_SLOT_META = {
  S: { code: "S", name: "主語" },
  V: { code: "V", name: "動詞" },
  O1: { code: "O/C", name: "目的語・補語" },
  X: { code: "O₂/C", name: "目的語2・補語" },
};

const TYPE_META = {
  noun: { short: "N", name: "名詞" },
  verb: { short: "V", name: "動詞" },
  adjective: { short: "Adj", name: "形容詞" },
};

const state = {
  selectedCpuCount: 2,
  cpuDifficulty: "normal",
  players: [],
  deck: [],
  discard: [],
  field: emptyField(),
  currentPlayerIndex: 0,
  selectedCardId: null,
  draggedCardId: null,
  suppressClickUntil: 0,
  history: [],
  rankings: [],
  sentenceNotes: [],
  gameStarted: false,
  gameOver: false,
  busy: false,
  hasDrawn: false,
  drawnCardId: null,
  consecutivePasses: 0,
  humanDecisionMs: 0,
  humanTurnStartedAt: null,
  humanPenalties: 0,
  pendingCompletion: null,
  completionRevealTimer: null,
  completionTimer: null,
  matchIntroTimer: null,
  endSequenceTimer: null,
  endSoundTimer: null,
  cpuTimer: null,
};

const elements = {
  setupScreen: document.querySelector("#setupScreen"),
  gameScreen: document.querySelector("#gameScreen"),
  themeButton: document.querySelector("#themeButton"),
  themeIcon: document.querySelector("#themeIcon"),
  themeLabel: document.querySelector("#themeLabel"),
  soundButton: document.querySelector("#soundButton"),
  soundIcon: document.querySelector("#soundIcon"),
  soundLabel: document.querySelector("#soundLabel"),
  bgmAudio: document.querySelector("#bgmAudio"),
  startButton: document.querySelector("#startButton"),
  restartButton: document.querySelector("#restartButton"),
  rulesButton: document.querySelector("#rulesButton"),
  rulesModal: document.querySelector("#rulesModal"),
  closeRulesButton: document.querySelector("#closeRulesButton"),
  cpuCountButtons: [...document.querySelectorAll("[data-cpu-count]")],
  cpuDifficultyButtons: [...document.querySelectorAll("[data-cpu-difficulty]")],
  turnLine: document.querySelector(".turn-line"),
  turnName: document.querySelector("#turnName"),
  turnInstruction: document.querySelector("#turnInstruction"),
  opponents: document.querySelector("#opponents"),
  sentencePreview: document.querySelector("#sentencePreview"),
  sentenceBoard: document.querySelector("#sentenceBoard"),
  tableArea: document.querySelector(".table-area"),
  completionBurst: document.querySelector("#completionBurst"),
  misplayBurst: document.querySelector("#misplayBurst"),
  playerArea: document.querySelector(".player-area"),
  hand: document.querySelector("#hand"),
  handCount: document.querySelector("#handCount"),
  drawButton: document.querySelector("#drawButton"),
  toastRegion: document.querySelector("#toastRegion"),
  matchIntro: document.querySelector("#matchIntro"),
  endCurtain: document.querySelector("#endCurtain"),
  completionModal: document.querySelector("#completionModal"),
  completionPatterns: document.querySelector("#completionPatterns"),
  completionEnglish: document.querySelector("#completionEnglish"),
  completionTranslations: document.querySelector("#completionTranslations"),
  completionNote: document.querySelector("#completionNote"),
  continueButton: document.querySelector("#continueButton"),
  resultModal: document.querySelector("#resultModal"),
  resultScorePanel: document.querySelector(".result-score"),
  resultRank: document.querySelector("#resultRank"),
  resultScore: document.querySelector("#resultScore"),
  resultScoreMeta: document.querySelector("#resultScoreMeta"),
  resultScoreBreakdown: document.querySelector("#resultScoreBreakdown"),
  rankingList: document.querySelector("#rankingList"),
  resultSentenceCount: document.querySelector("#resultSentenceCount"),
  resultSentenceList: document.querySelector("#resultSentenceList"),
  playAgainButton: document.querySelector("#playAgainButton"),
  resultSetupButton: document.querySelector("#resultSetupButton"),
};

function createAudioOutput() {
  if (window.location.protocol === "file:") return { context: null, bgmGain: null };
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return { context: null, bgmGain: null };
  try {
    const context = new AudioContextClass();
    const bgmGain = context.createGain();
    context.createMediaElementSource(elements.bgmAudio).connect(bgmGain);
    bgmGain.connect(context.destination);
    bgmGain.gain.value = 0;
    return { context, bgmGain };
  } catch (error) {
    console.warn("音声出力を初期化できませんでした", error);
    return { context: null, bgmGain: null };
  }
}

const audioOutput = createAudioOutput();
const sound = {
  enabled: false,
  phase: "setup",
  bgmName: null,
  introTimers: [],
  context: audioOutput.context,
  bgmGain: audioOutput.bgmGain,
  effectBuffers: new Map(),
  activeEffects: new Set(),
  effectGeneration: 0,
  fallbackEffects: new Map(
    Object.entries(SOUND_EFFECTS).map(([name, config]) => {
      const audio = new Audio(config.src);
      audio.preload = "none";
      audio.muted = true;
      audio.volume = config.volume;
      return [name, audio];
    }),
  ),
};

if (sound.context && window.location.protocol !== "file:") {
  for (const [name, config] of Object.entries(SOUND_EFFECTS)) {
    sound.effectBuffers.set(
      name,
      fetch(config.src)
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.arrayBuffer();
        })
        .then((data) => sound.context.decodeAudioData(data))
        .catch((error) => {
          if (error.name !== "AbortError") console.warn(`効果音を読み込めませんでした: ${name}`, error);
          return null;
        }),
    );
  }
}

function updateSoundButton() {
  const enabled = sound.enabled;
  const actionLabel = enabled ? "音をオフにする" : "音をオンにする";
  elements.soundButton.setAttribute("aria-pressed", String(enabled));
  elements.soundButton.setAttribute("aria-label", actionLabel);
  elements.soundButton.title = actionLabel;
  elements.soundIcon.src = enabled ? "assets/icons/volume-2.svg" : "assets/icons/volume-x.svg";
  elements.soundLabel.textContent = enabled ? "音ON" : "音OFF";
}

function playBgm(name, { silent = false, restart = false } = {}) {
  if (!sound.enabled) return;
  const track = BGM_TRACKS[name];
  const bgm = elements.bgmAudio;
  if (sound.bgmName !== name) {
    bgm.pause();
    bgm.src = track.src;
    sound.bgmName = name;
    restart = true;
  }
  if (restart) bgm.currentTime = 0;
  if (sound.bgmGain) {
    bgm.volume = 1;
    bgm.muted = false;
    sound.bgmGain.gain.value = silent ? 0 : track.volume;
  } else {
    bgm.volume = silent ? 0 : track.volume;
    bgm.muted = silent;
  }
  void bgm.play().catch((error) => {
    if (error.name !== "AbortError") console.warn("BGMを再生できませんでした", error);
  });
}

function playFallbackEffect(name) {
  const audio = sound.fallbackEffects.get(name);
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
  void audio.play().catch((error) => {
    if (error.name !== "AbortError") console.warn(`効果音を再生できませんでした: ${name}`, error);
  });
}

function playEffect(name) {
  if (!sound.enabled) return;
  const bufferPromise = sound.effectBuffers.get(name);
  if (!bufferPromise) return playFallbackEffect(name);
  const generation = sound.effectGeneration;
  void bufferPromise.then((buffer) => {
    if (!sound.enabled || generation !== sound.effectGeneration) return;
    if (!buffer) return playFallbackEffect(name);
    const source = sound.context.createBufferSource();
    const gain = sound.context.createGain();
    source.buffer = buffer;
    gain.gain.value = SOUND_EFFECTS[name].volume;
    source.connect(gain).connect(sound.context.destination);
    source.addEventListener("ended", () => sound.activeEffects.delete(source), { once: true });
    sound.activeEffects.add(source);
    source.start();
  }).catch((error) => console.warn(`効果音を再生できませんでした: ${name}`, error));
}

function stopEffects() {
  sound.effectGeneration += 1;
  for (const source of sound.activeEffects) {
    try {
      source.stop();
    } catch {
      // 再生終了済みの音はそのままにする。
    }
  }
  sound.activeEffects.clear();
  for (const audio of sound.fallbackEffects.values()) {
    audio.pause();
    audio.currentTime = 0;
  }
}

function setSoundEnabled(enabled) {
  sound.enabled = enabled;
  elements.bgmAudio.muted = !enabled;
  for (const audio of sound.fallbackEffects.values()) audio.muted = !enabled;
  updateSoundButton();
  if (!enabled) {
    elements.bgmAudio.pause();
    if (sound.bgmGain) sound.bgmGain.gain.value = 0;
    stopEffects();
  } else {
    if (sound.context) {
      void sound.context.resume().catch((error) => console.warn("音声出力を開始できませんでした", error));
    }
    if (sound.phase === "setup") playBgm("setup");
    else if (sound.phase === "intro") playBgm("battle", { silent: true });
    else if (sound.phase === "battle") playBgm("battle");
  }
}

function clearIntroSoundTimers() {
  for (const timer of sound.introTimers) clearTimeout(timer);
  sound.introTimers = [];
}

function emptyField() {
  return { S: null, V: null, O1: null, X: null };
}

function noun(definition) {
  return {
    type: "noun",
    person: 3,
    number: "singular",
    isPronoun: false,
    copies: 1,
    ...definition,
  };
}

function verb(lemma, thirdPerson, gloss, patterns, complementTypes = {}, focusPattern = patterns[0]) {
  return {
    type: "verb",
    label: lemma,
    lemma,
    thirdPerson,
    gloss,
    patterns,
    complementTypes,
    focusPattern,
  };
}

function adjective(label, gloss, jpPredicate, jpAdverbial, jpBeforeMama = jpPredicate) {
  return {
    type: "adjective",
    label,
    gloss,
    jpPredicate,
    jpAdverbial,
    jpBeforeMama,
  };
}

function buildDeck() {
  let serial = 0;
  const nounDefinitions = [
    noun({ label: "the station", gloss: "その駅", entity: "station", reflexive: "itself", copies: 2 }),
    noun({ label: "the camera", gloss: "そのカメラ", entity: "camera", reflexive: "itself", copies: 2 }),
    noun({ label: "the train", gloss: "その列車", entity: "train", reflexive: "itself", copies: 2 }),
    noun({ label: "the book", gloss: "その本", entity: "book", reflexive: "itself", copies: 2 }),
    noun({ label: "the room", gloss: "その部屋", entity: "room", reflexive: "itself", copies: 2 }),
    noun({ label: "the door", gloss: "そのドア", entity: "door", reflexive: "itself", copies: 2 }),
    noun({ label: "the computer", gloss: "そのコンピューター", entity: "computer", reflexive: "itself" }),
    noun({ label: "the ticket", gloss: "その切符", entity: "ticket", reflexive: "itself" }),
    noun({ label: "the photograph", gloss: "その写真", entity: "photograph", reflexive: "itself", copies: 2 }),
    noun({ label: "the cake", gloss: "そのケーキ", entity: "cake", reflexive: "itself", copies: 2 }),
    noun({ label: "the dog", gloss: "その犬", entity: "dog", reflexive: "itself", copies: 2 }),
    noun({ label: "the cat", gloss: "その猫", entity: "cat", reflexive: "itself", copies: 2 }),
    noun({ label: "Tom", gloss: "トム", entity: "tom", reflexive: "himself", copies: 2 }),
    noun({ label: "Ken", gloss: "ケン", entity: "ken", reflexive: "himself", copies: 2 }),
    noun({ label: "my brother", gloss: "私の兄・弟", entity: "brother", reflexive: "himself", copies: 2 }),
    noun({ label: "Emily", gloss: "エミリー", entity: "emily", reflexive: "herself", copies: 2 }),
    noun({ label: "Anna", gloss: "アンナ", entity: "anna", reflexive: "herself", copies: 2 }),
    noun({ label: "my sister", gloss: "私の姉・妹", entity: "sister", reflexive: "herself", copies: 2 }),
    noun({
      label: "the students",
      gloss: "その生徒たち",
      entity: "students",
      number: "plural",
      reflexive: "themselves",
      copies: 2,
    }),
    noun({
      label: "the photographers",
      gloss: "その写真家たち",
      entity: "photographers",
      number: "plural",
      reflexive: "themselves",
      copies: 2,
    }),
    noun({
      label: "I",
      gloss: "私",
      entity: "speaker",
      person: 1,
      isPronoun: true,
      forms: { subject: "I", object: "me", reflexive: "myself" },
      copies: 2,
    }),
    noun({
      label: "you",
      gloss: "あなた",
      entity: "listener",
      person: 2,
      isPronoun: true,
      forms: { subject: "you", object: "you", reflexive: "yourself" },
    }),
    noun({
      label: "we",
      gloss: "私たち",
      entity: "speaker-group",
      person: 1,
      number: "plural",
      isPronoun: true,
      forms: { subject: "we", object: "us", reflexive: "ourselves" },
    }),
    noun({
      label: "they",
      gloss: "彼ら・彼女ら",
      entity: "other-group",
      number: "plural",
      isPronoun: true,
      forms: { subject: "they", object: "them", reflexive: "themselves" },
    }),
    noun({ label: "a leader", gloss: "指導者", entity: "leader-role", reflexive: "themself" }),
    noun({ label: "a doctor", gloss: "医師", entity: "doctor-role", reflexive: "themself" }),
    noun({ label: "a photographer", gloss: "写真家", entity: "photographer-role", reflexive: "themself" }),
    noun({ label: "a friend", gloss: "友人", entity: "friend-role", reflexive: "themself" }),
    noun({ label: "the teacher", gloss: "その先生", entity: "teacher", reflexive: "themself" }),
    noun({ label: "the classroom", gloss: "その教室", entity: "classroom", reflexive: "itself" }),
    noun({ label: "the window", gloss: "その窓", entity: "window", reflexive: "itself" }),
  ];

  const adjectiveDefinitions = [
    adjective("happy", "幸せな", "幸せだ", "幸せに", "幸せな"),
    adjective("quiet", "静かな", "静かだ", "静かに", "静かな"),
    adjective("busy", "忙しい", "忙しい", "忙しく", "忙しい"),
    adjective("ready", "準備ができた", "準備ができている", "準備ができるように", "準備ができた"),
    adjective("open", "開いている", "開いている", "開いた状態に", "開いた"),
    adjective("clean", "清潔な", "清潔だ", "清潔に", "清潔な"),
    adjective("famous", "有名な", "有名だ", "有名に", "有名な"),
    adjective("kind", "親切な", "親切だ", "親切に", "親切な"),
    adjective("tired", "疲れた", "疲れている", "疲れた状態に", "疲れた"),
    adjective("safe", "安全な", "安全だ", "安全に", "安全な"),
    adjective("empty", "空の", "空だ", "空に", "空の"),
    adjective("beautiful", "美しい", "美しい", "美しく", "美しい"),
    adjective("important", "重要な", "重要だ", "重要に", "重要な"),
    adjective("useful", "役に立つ", "役に立つ", "役に立つように", "役に立つ"),
    adjective("difficult", "難しい", "難しい", "難しく", "難しい"),
    adjective("popular", "人気のある", "人気がある", "人気が出るように", "人気のある"),
    adjective("warm", "暖かい", "暖かい", "暖かく", "暖かい"),
    adjective("cold", "冷たい・寒い", "冷たい", "冷たく", "冷たい"),
    adjective("young", "若い", "若い", "若く", "若い"),
    adjective("strong", "強い", "強い", "強く", "強い"),
  ];

  const verbDefinitions = [
    // 各文型を主役にしたカードを5〜6枚ずつ収録。複数文型を取る動詞は併記する。
    verb("run", "runs", "走る／Oを経営する／Cになる", ["SV", "SVC", "SVO"], {
      SVC: ["adjective"],
    }),
    verb("sleep", "sleeps", "眠る", ["SV"]),
    verb("arrive", "arrives", "到着する", ["SV"]),
    verb("laugh", "laughs", "笑う", ["SV"]),
    verb("swim", "swims", "泳ぐ", ["SV"]),

    verb("be", "is", "〜である・いる", ["SVC"], { SVC: ["adjective", "noun"] }),
    verb("become", "becomes", "〜になる", ["SVC"], { SVC: ["adjective", "noun"] }),
    verb("look", "looks", "〜に見える", ["SVC"], { SVC: ["adjective"] }),
    verb("feel", "feels", "〜に感じられる", ["SVC"], { SVC: ["adjective"] }),
    verb("turn", "turns", "〜になる", ["SVC"], { SVC: ["adjective"] }),
    verb("get", "gets", "〜になる", ["SVC"], { SVC: ["adjective"] }),

    verb("love", "loves", "〜を愛する", ["SVO"]),
    verb("like", "likes", "〜を好む", ["SVO"]),
    verb("use", "uses", "〜を使う", ["SVO"]),
    verb("open", "opens", "〜を開ける", ["SVO"]),
    verb("visit", "visits", "〜を訪れる", ["SVO"]),
    verb("watch", "watches", "〜を見る", ["SVO"]),

    verb("give", "gives", "OにO₂を与える", ["SVO", "SVOO"], {}, "SVOO"),
    verb("show", "shows", "OにO₂を見せる", ["SVO", "SVOO"], {}, "SVOO"),
    verb("teach", "teaches", "OにO₂を教える", ["SVO", "SVOO"], {}, "SVOO"),
    verb("tell", "tells", "OにO₂を伝える", ["SVO", "SVOO"], {}, "SVOO"),
    verb("buy", "buys", "OにO₂を買う", ["SVO", "SVOO"], {}, "SVOO"),

    verb("keep", "keeps", "保つ／OをCのままにする", ["SVO", "SVOC"], { SVOC: ["adjective", "noun"] }, "SVOC"),
    verb("make", "makes", "作る／OにO₂を作る／OをCにする", ["SVO", "SVOO", "SVOC"], { SVOC: ["adjective", "noun"] }, "SVOC"),
    verb("call", "calls", "呼ぶ／OをCと呼ぶ", ["SVO", "SVOC"], { SVOC: ["noun"] }, "SVOC"),
    verb("name", "names", "名づける／OをCと名づける", ["SVO", "SVOC"], { SVOC: ["noun"] }, "SVOC"),
    verb("find", "finds", "見つける／OがCだと分かる", ["SVO", "SVOC"], { SVOC: ["adjective", "noun"] }, "SVOC"),
  ];

  const cards = [];
  for (const definition of [...nounDefinitions, ...adjectiveDefinitions, ...verbDefinitions]) {
    const copies = definition.copies ?? 1;
    for (let copy = 0; copy < copies; copy += 1) {
      cards.push({ ...definition, id: `card-${serial++}` });
    }
  }
  return shuffle(cards);
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function sortHand(hand) {
  const typeOrder = { noun: 0, adjective: 1, verb: 2 };
  hand.sort((left, right) => {
    const typeDifference = typeOrder[left.type] - typeOrder[right.type];
    return typeDifference || left.label.localeCompare(right.label, "en");
  });
}

function applyTheme(theme, persist = false) {
  const resolved = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = resolved;
  elements.themeIcon.src = resolved === "dark" ? "assets/icons/sun.svg" : "assets/icons/moon.svg";
  elements.themeLabel.textContent = resolved === "dark" ? "ライト" : "ダーク";
  elements.themeButton.setAttribute("aria-pressed", String(resolved === "dark"));
  elements.themeButton.setAttribute(
    "aria-label",
    resolved === "dark" ? "ライトモードに切り替える" : "ダークモードに切り替える",
  );
  if (persist) {
    try {
      window.localStorage.setItem("bunkei-game-theme", resolved);
    } catch {
      // 保存できない環境でも、その場の切り替えは続ける。
    }
  }
}

function savedTheme() {
  try {
    return window.localStorage.getItem("bunkei-game-theme") ?? "light";
  } catch {
    return "light";
  }
}

function startGame() {
  clearTimeout(state.cpuTimer);
  clearTimeout(state.completionRevealTimer);
  clearTimeout(state.completionTimer);
  hideMatchIntro();
  clearTimeout(state.endSequenceTimer);
  clearTimeout(state.endSoundTimer);
  state.endSequenceTimer = null;
  state.endSoundTimer = null;
  stopEffects();
  elements.endCurtain.classList.add("is-hidden");
  elements.endCurtain.classList.remove("is-active");
  elements.endCurtain.setAttribute("aria-hidden", "true");
  closeModal(elements.resultModal);
  closeModal(elements.completionModal);

  state.deck = buildDeck();
  state.discard = [];
  state.field = emptyField();
  state.selectedCardId = null;
  state.draggedCardId = null;
  state.history = [];
  state.rankings = [];
  state.sentenceNotes = [];
  state.gameStarted = true;
  state.gameOver = false;
  state.busy = true;
  state.hasDrawn = false;
  state.drawnCardId = null;
  state.consecutivePasses = 0;
  state.humanDecisionMs = 0;
  state.humanTurnStartedAt = null;
  state.humanPenalties = 0;
  state.pendingCompletion = null;
  elements.tableArea.classList.remove("is-complete-flash");
  elements.tableArea.classList.remove("is-misplay-flash");
  elements.misplayBurst.setAttribute("aria-hidden", "true");
  document.body.classList.add("is-game-active");

  const cpuNames = ["CPU アオ", "CPU アカ", "CPU ミドリ", "CPU ムラサキ"];
  state.players = [
    { id: "human", name: "あなた", isHuman: true, hand: [], rank: null },
    ...cpuNames.slice(0, state.selectedCpuCount).map((name, index) => ({
      id: `cpu-${index}`,
      name,
      isHuman: false,
      hand: [],
      rank: null,
    })),
  ];

  for (let round = 0; round < 7; round += 1) {
    for (const player of state.players) {
      const card = drawCardFromStock();
      if (card) player.hand.push(card);
    }
  }
  state.players.forEach((player) => sortHand(player.hand));
  state.currentPlayerIndex = Math.floor(Math.random() * state.players.length);

  elements.setupScreen.classList.add("is-hidden");
  elements.gameScreen.classList.remove("is-hidden");
  elements.restartButton.classList.remove("is-hidden");
  render();
  showMatchIntro();
}

function returnToSetup() {
  clearTimeout(state.cpuTimer);
  clearTimeout(state.completionRevealTimer);
  clearTimeout(state.completionTimer);
  hideMatchIntro();
  clearTimeout(state.endSequenceTimer);
  clearTimeout(state.endSoundTimer);
  state.endSequenceTimer = null;
  state.endSoundTimer = null;
  stopEffects();
  state.gameStarted = false;
  state.gameOver = false;
  state.busy = false;
  state.consecutivePasses = 0;
  state.pendingCompletion = null;
  state.selectedCardId = null;
  state.drawnCardId = null;
  state.humanTurnStartedAt = null;
  elements.tableArea.classList.remove("is-complete-flash");
  elements.tableArea.classList.remove("is-misplay-flash");
  elements.misplayBurst.setAttribute("aria-hidden", "true");
  elements.endCurtain.classList.add("is-hidden");
  elements.endCurtain.classList.remove("is-active");
  elements.endCurtain.setAttribute("aria-hidden", "true");
  closeModal(elements.rulesModal);
  closeModal(elements.completionModal);
  closeModal(elements.resultModal);
  elements.gameScreen.classList.add("is-hidden");
  elements.setupScreen.classList.remove("is-hidden");
  elements.restartButton.classList.add("is-hidden");
  elements.toastRegion.replaceChildren();
  document.body.classList.remove("is-game-active");
  sound.phase = "setup";
  if (sound.enabled) playBgm("setup", { restart: true });
}

function hideMatchIntro() {
  clearTimeout(state.matchIntroTimer);
  clearIntroSoundTimers();
  state.matchIntroTimer = null;
  elements.matchIntro.classList.remove("is-active");
  elements.matchIntro.classList.add("is-hidden");
  elements.matchIntro.setAttribute("aria-hidden", "true");
}

function showMatchIntro() {
  elements.matchIntro.classList.remove("is-hidden");
  elements.matchIntro.setAttribute("aria-hidden", "false");
  void elements.matchIntro.offsetWidth;
  elements.matchIntro.classList.add("is-active");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  sound.phase = "intro";
  if (sound.enabled) playBgm("battle", { silent: true, restart: true });
  sound.introTimers.push(window.setTimeout(() => {
    if (sound.phase === "intro") playEffect("introPrelude");
  }, reducedMotion ? 0 : MATCH_INTRO_PRELUDE_SOUND_MS));
  sound.introTimers.push(window.setTimeout(() => {
    if (sound.phase === "intro") playEffect("introCharge");
  }, reducedMotion ? 45 : MATCH_INTRO_CHARGE_SOUND_MS));
  const duration = reducedMotion ? 120 : MATCH_INTRO_MS;
  state.matchIntroTimer = window.setTimeout(() => {
    hideMatchIntro();
    if (!state.gameStarted || state.gameOver) return;
    sound.phase = "battle";
    if (sound.enabled) playBgm("battle", { restart: true });
    state.busy = false;
    startHumanTurnClock();
    render();
    scheduleCpuTurn();
  }, duration);
}

function currentPlayer() {
  return state.players[state.currentPlayerIndex];
}

function activePlayers() {
  return state.players.filter((player) => player.rank === null);
}

function allActivePlayersPassed(passCount, activeCount) {
  return activeCount > 0 && passCount >= activeCount;
}

function startHumanTurnClock() {
  const player = currentPlayer();
  if (
    state.humanTurnStartedAt === null &&
    player?.isHuman &&
    player.rank === null &&
    !state.busy &&
    !state.gameOver &&
    !state.pendingCompletion
  ) {
    state.humanTurnStartedAt = performance.now();
  }
}

function stopHumanTurnClock() {
  if (state.humanTurnStartedAt === null) return;
  state.humanDecisionMs += Math.max(0, performance.now() - state.humanTurnStartedAt);
  state.humanTurnStartedAt = null;
}

function calculateScore({ rank, playerCount, difficulty, decisionMs, penalties }) {
  const safeRank = Math.min(Math.max(Number(rank) || playerCount, 1), SCORE_RANK_POINTS.length - 1);
  const rankPoints = SCORE_RANK_POINTS[safeRank];
  const seconds = Math.max(0, decisionMs) / 1000;
  const speedPoints = Math.round((SCORE_SPEED_MAX * Math.exp(-seconds / SCORE_SPEED_DECAY_SECONDS)) / 10) * 10;
  const difficultyPoints = difficulty === "hard" ? SCORE_HARD_BONUS : 0;
  const opponentPoints = Math.max(0, playerCount - 2) * SCORE_EXTRA_CPU_BONUS;
  const penaltyPoints = Math.max(0, penalties) * SCORE_MISTAKE_PENALTY;
  const total = Math.max(
    0,
    Math.round((rankPoints + speedPoints + difficultyPoints + opponentPoints - penaltyPoints) / 10) * 10,
  );
  return { total, rankPoints, speedPoints, difficultyPoints, opponentPoints, penaltyPoints };
}

function scoreTitleFor(score) {
  return SCORE_TITLES.find((title) => score >= title.minimum) ?? SCORE_TITLES[SCORE_TITLES.length - 1];
}

function formatDecisionTime(milliseconds) {
  const tenths = Math.round(Math.max(0, milliseconds) / 100);
  const minutes = Math.floor(tenths / 600);
  const seconds = ((tenths % 600) / 10).toFixed(1);
  return minutes ? `${minutes}分${seconds}秒` : `${seconds}秒`;
}

function drawCardFromStock() {
  if (state.deck.length === 0 && state.discard.length > 0) {
    state.deck = shuffle(state.discard);
    state.discard = [];
  }
  return state.deck.pop() ?? null;
}

function complementType(card) {
  return card?.type === "adjective" ? "adjective" : "noun";
}

function isComplementAllowed(verbCard, pattern, card) {
  if (!card) return true;
  const accepted = verbCard.complementTypes?.[pattern] ?? [];
  return accepted.includes(complementType(card));
}

function getCandidatePatterns(field = state.field) {
  const occupiedSlots = Object.keys(field).filter((slot) => field[slot]);
  const verbCard = field.V?.card ?? null;

  return PATTERN_ORDER.filter((pattern) => {
    const definition = PATTERNS[pattern];
    if (!occupiedSlots.every((slot) => definition.slots.includes(slot))) return false;
    if (verbCard && !verbCard.patterns.includes(pattern)) return false;

    for (const slot of ["O1", "X"]) {
      const card = field[slot]?.card;
      if (!card) continue;
      const role = slot === "O1" ? definition.o1Role : definition.xRole;
      if (card.type === "adjective" && role !== "C") return false;
      if (role === "C" && verbCard && !isComplementAllowed(verbCard, pattern, card)) return false;
    }
    return true;
  });
}

function getCompletedPatterns(field = state.field) {
  return getCandidatePatterns(field).filter((pattern) =>
    PATTERNS[pattern].slots.every((slot) => field[slot]),
  );
}

function slotRole(slot, pattern = null, field = state.field) {
  if (slot === "S" || slot === "V") return slot;
  const roleForPattern = (candidate) =>
    slot === "O1" ? PATTERNS[candidate].o1Role : PATTERNS[candidate].xRole;
  if (pattern) return roleForPattern(pattern);
  const candidates = getCandidatePatterns(field);
  const roles = [...new Set(candidates.map(roleForPattern).filter(Boolean))];
  if (roles.length === 1) return roles[0];
  return slot === "O1" ? "O1/C" : "X";
}

function dynamicSlotMeta(slot) {
  return BASE_SLOT_META[slot];
}

function nounCanOccupy(card, slot, field) {
  if (!["S", "O1", "X"].includes(slot)) return false;
  const matchingSlots = Object.entries(field)
    .filter(([, placement]) => placement?.card.type === "noun" && placement.card.entity === card.entity)
    .map(([placedSlot]) => placedSlot);

  if (matchingSlots.length === 0) return true;
  if (matchingSlots.length > 1) return false;
  const otherSlot = matchingSlots[0];
  return slot === "S" ? ["O1", "X"].includes(otherSlot) : otherSlot === "S";
}

function possibleSlotsForCard(card) {
  if (card.type === "verb") return ["V"];
  if (card.type === "adjective") return ["O1", "X"];
  return ["S", "O1", "X"];
}

function getLegalActionsForCard(card, field = state.field) {
  const actions = [];
  for (const slot of possibleSlotsForCard(card)) {
    if (field[slot]) continue;
    if (card.type === "noun" && !nounCanOccupy(card, slot, field)) continue;
    const hypothetical = { ...field, [slot]: { card, ownerId: "preview" } };
    if (getCandidatePatterns(hypothetical).length) actions.push({ cardId: card.id, slot });
  }
  return actions;
}

function getLegalActionsForPlayer(player) {
  return player.hand.flatMap((card) => getLegalActionsForCard(card));
}

function getPlacementCard(slot, field = state.field) {
  return field[slot]?.card ?? null;
}

function subjectMatches(card, field = state.field) {
  const subject = getPlacementCard("S", field);
  return Boolean(subject && subject.type === "noun" && subject.entity === card.entity);
}

function nounSurface(card, slot, field = state.field, pattern = null) {
  const role = slotRole(slot, pattern, field);
  const isObject = role === "O1" || role === "O2";
  if (isObject && subjectMatches(card, field)) return card.forms?.reflexive ?? card.reflexive;
  if (card.isPronoun) return role === "S" ? card.forms.subject : card.forms.object;
  return card.label;
}

function verbSurface(card, field = state.field) {
  const subject = getPlacementCard("S", field);
  if (!subject) return card.lemma;
  if (card.lemma === "be") {
    if (subject.person === 1 && subject.number === "singular") return "am";
    if (subject.person === 2 || subject.number === "plural") return "are";
    return "is";
  }
  return subject.person === 3 && subject.number === "singular" ? card.thirdPerson : card.lemma;
}

function surfaceForSlot(slot, field = state.field, pattern = null) {
  const card = getPlacementCard(slot, field);
  if (!card) return "";
  if (card.type === "verb") return verbSurface(card, field);
  if (card.type === "noun") return nounSurface(card, slot, field, pattern);
  return card.label;
}

function getSurfaceMap(field = state.field) {
  return Object.fromEntries(Object.keys(field).map((slot) => [slot, surfaceForSlot(slot, field)]));
}

function previewPattern(field = state.field) {
  const completed = getCompletedPatterns(field);
  if (completed.length) return completed[0];
  return getCandidatePatterns(field)[0] ?? "SVOC";
}

function sentenceText(field = state.field, pattern = previewPattern(field), includeBlanks = false) {
  const words = PATTERNS[pattern].slots.map((slot) => {
    const surface = surfaceForSlot(slot, field, pattern);
    return surface || (includeBlanks ? "_____" : "");
  });
  const text = words.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1) + (includeBlanks ? "" : ".");
}

function japaneseNoun(slot, pattern, field = state.field) {
  const card = getPlacementCard(slot, field);
  if (!card) return "［未完成］";
  const role = slotRole(slot, pattern, field);
  if ((role === "O1" || role === "O2") && subjectMatches(card, field)) return "自分自身";
  return card.gloss;
}

function japaneseComplement(card, mode) {
  if (card.type === "noun") {
    if (mode === "predicate") return `${card.gloss}である`;
    if (mode === "adverbial") return `${card.gloss}に`;
    if (mode === "mama") return `${card.gloss}の`;
    if (mode === "quote") return `${card.gloss}だ`;
    return card.gloss;
  }
  if (mode === "predicate") return card.jpPredicate;
  if (mode === "adverbial") return card.jpAdverbial;
  if (mode === "mama") return card.jpBeforeMama;
  if (mode === "quote") return card.jpPredicate;
  return card.gloss;
}

function japaneseTranslation(pattern, field = state.field) {
  const verbCard = getPlacementCard("V", field);
  const s = japaneseNoun("S", pattern, field);
  const o = japaneseNoun("O1", pattern, field);
  const x = japaneseNoun("X", pattern, field);
  const oCard = getPlacementCard("O1", field);
  const xCard = getPlacementCard("X", field);
  const lemma = verbCard?.lemma ?? "";

  const sv = {
    run: "走る",
    sleep: "眠る",
    arrive: "到着する",
    laugh: "笑う",
    cry: "泣く",
    swim: "泳ぐ",
  };
  const svo = {
    run: "経営する",
    love: "愛する",
    like: "好む",
    use: "使う",
    open: "開ける",
    visit: "訪れる",
    watch: "見る",
    carry: "運ぶ",
    help: "助ける",
    photograph: "撮影する",
    keep: "保つ",
    make: "作る",
    call: "呼ぶ",
    find: "見つける",
    give: "与える",
    show: "見せる",
    teach: "教える",
    tell: "伝える",
    send: "送る",
    buy: "買う",
    name: "名づける",
    leave: "残す",
  };
  const svoo = {
    give: "与える",
    show: "見せる",
    teach: "教える",
    tell: "伝える",
    send: "送る",
    buy: "買ってあげる",
    make: "作ってあげる",
  };

  if (pattern === "SV") return `${s}は${sv[lemma] ?? verbCard.gloss}。`;
  if (pattern === "SVO") return `${s}は${o}を${svo[lemma] ?? verbCard.gloss.replace("〜を", "")}。`;
  if (pattern === "SVOO") return `${s}は${o}に${x}を${svoo[lemma] ?? verbCard.gloss}。`;

  if (pattern === "SVC") {
    if (lemma === "be") return `${s}は${japaneseComplement(oCard, "predicate")}。`;
    if (["become", "turn", "get", "run"].includes(lemma)) {
      return `${s}は${japaneseComplement(oCard, "adverbial")}なる。`;
    }
    if (lemma === "look") return `${s}は${japaneseComplement(oCard, "adverbial")}見える。`;
    if (lemma === "feel") return `${s}は${japaneseComplement(oCard, "adverbial")}感じられる。`;
    return `${s}は${japaneseComplement(oCard, "predicate")}。`;
  }

  if (pattern === "SVOC") {
    if (lemma === "keep") return `${s}は${o}を${japaneseComplement(xCard, "mama")}ままにする。`;
    if (lemma === "make" || lemma === "get") {
      return `${s}は${o}を${japaneseComplement(xCard, "adverbial")}する。`;
    }
    if (lemma === "call") return `${s}は${o}を${x}と呼ぶ。`;
    if (lemma === "name") return `${s}は${o}を${x}と名づける。`;
    if (lemma === "find") return `${s}は${o}が${japaneseComplement(xCard, "quote")}と分かる。`;
    if (lemma === "leave") return `${s}は${o}を${japaneseComplement(xCard, "mama")}ままにしておく。`;
    return `${s}は${o}を${x}にする。`;
  }
  return `${s}は${verbCard.gloss}。`;
}

function explainSurfaceChange(slot, from, to, card, field = state.field) {
  if (slot === "V") {
    const subject = getPlacementCard("S", field);
    if (!subject) return null;
    return `${from} → ${to}：主語「${nounSurface(subject, "S", field)}」に合わせて現在形が変化`;
  }
  const role = slotRole(slot, null, field);
  if ((role === "O1" || role === "O2") && subjectMatches(card, field)) {
    return `${from} → ${to}：主語と同じ存在なので再帰代名詞に変化`;
  }
  if ((role === "O1" || role === "O2") && card.isPronoun && from !== to) {
    return `${from} → ${to}：目的語なので目的格に変化`;
  }
  return null;
}

function collectSurfaceChanges(before, placedSlot, placedCard) {
  const after = getSurfaceMap();
  const notes = [];
  for (const slot of Object.keys(state.field)) {
    const placement = state.field[slot];
    if (!placement) continue;
    if (before[slot] && before[slot] !== after[slot]) {
      const note = explainSurfaceChange(slot, before[slot], after[slot], placement.card);
      if (note) notes.push(note);
    }
  }
  const canonical = placedCard.type === "verb" ? placedCard.lemma : placedCard.label;
  if (!before[placedSlot] && canonical !== after[placedSlot]) {
    const note = explainSurfaceChange(placedSlot, canonical, after[placedSlot], placedCard);
    if (note && !notes.includes(note)) notes.push(note);
  }
  return notes;
}

function executeAction(playerIndex, action) {
  const player = state.players[playerIndex];
  const legalAction = getLegalActionsForPlayer(player).find(
    (candidate) => candidate.cardId === action.cardId && candidate.slot === action.slot,
  );
  if (!legalAction) return;

  if (player.isHuman) stopHumanTurnClock();
  clearTimeout(state.cpuTimer);
  const before = getSurfaceMap();
  const cardIndex = player.hand.findIndex((card) => card.id === action.cardId);
  const [card] = player.hand.splice(cardIndex, 1);
  state.field[action.slot] = { card, ownerId: player.id };
  state.selectedCardId = null;
  state.draggedCardId = null;
  state.hasDrawn = false;
  state.drawnCardId = null;
  state.consecutivePasses = 0;
  state.busy = true;

  const notes = collectSurfaceChanges(before, action.slot, card);
  state.sentenceNotes.push(...notes.filter((note) => !state.sentenceNotes.includes(note)));

  const completedPatterns = getCompletedPatterns();
  if (player.hand.length === 0) registerFinish(player);

  if (completedPatterns.length) {
    const entry = {
      sentence: sentenceText(state.field, completedPatterns[0]),
      analyses: completedPatterns.map((pattern) => ({
        pattern,
        translation: japaneseTranslation(pattern),
      })),
      completedBy: player.name,
      notes: [...state.sentenceNotes],
    };
    state.history.push(entry);
    state.pendingCompletion = entry;
    render();
    beginCompletionSequence(entry);
    return;
  }

  render();
  window.setTimeout(() => {
    if (state.gameOver) return finishGame();
    state.busy = false;
    advanceTurn();
  }, player.isHuman ? 470 : CPU_TURN_SETTLE_MS);
}

function beginCompletionSequence(entry) {
  clearTimeout(state.completionRevealTimer);
  elements.tableArea.classList.remove("is-complete-flash");
  void elements.tableArea.offsetWidth;
  elements.tableArea.classList.add("is-complete-flash");
  playEffect("completion");
  state.completionRevealTimer = window.setTimeout(() => {
    elements.tableArea.classList.remove("is-complete-flash");
    if (state.pendingCompletion === entry && state.gameStarted) showCompletion(entry);
  }, COMPLETION_REVEAL_DELAY_MS);
}

function showCompletion(entry) {
  clearTimeout(state.completionRevealTimer);
  clearTimeout(state.completionTimer);
  elements.completionPatterns.innerHTML = entry.analyses
    .map(
      (analysis) =>
        `<span class="completion-pattern-chip">${escapeHtml(completedPatternLabel(analysis.pattern))}</span>`,
    )
    .join("");
  elements.completionEnglish.textContent = entry.sentence;
  elements.completionTranslations.innerHTML = entry.analyses
    .map(
      (analysis) => `
        <div class="completion-translation">
          <strong>訳</strong>
          <span>${escapeHtml(analysis.translation)}</span>
        </div>
      `,
    )
    .join("");
  elements.completionNote.textContent = entry.notes.length
    ? entry.notes.join("／")
    : `${entry.completedBy}が完成させました。`;
  openModal(elements.completionModal);
  state.completionTimer = window.setTimeout(continueAfterCompletion, COMPLETION_CUT_IN_MS);
}

function continueAfterCompletion() {
  if (!state.pendingCompletion) return;
  clearTimeout(state.completionRevealTimer);
  clearTimeout(state.completionTimer);
  elements.tableArea.classList.remove("is-complete-flash");
  closeModal(elements.completionModal);
  state.pendingCompletion = null;
  discardField();
  if (state.gameOver) return finishGame();
  state.busy = false;
  advanceTurn();
}

function registerFinish(player) {
  if (player.rank !== null) return;
  player.rank = state.rankings.length + 1;
  state.rankings.push(player.id);
  const remaining = activePlayers();
  if (remaining.length === 1) {
    remaining[0].rank = state.players.length;
    state.rankings.push(remaining[0].id);
    state.gameOver = true;
  }
}

function discardField() {
  for (const placement of Object.values(state.field)) {
    if (placement) state.discard.push(placement.card);
  }
  state.field = emptyField();
  state.sentenceNotes = [];
  state.consecutivePasses = 0;
}

function nextActiveIndex(fromIndex) {
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const index = (fromIndex + offset) % state.players.length;
    if (state.players[index].rank === null) return index;
  }
  return fromIndex;
}

function advanceTurn() {
  if (state.gameOver) return finishGame();
  state.currentPlayerIndex = nextActiveIndex(state.currentPlayerIndex);
  state.selectedCardId = null;
  state.hasDrawn = false;
  state.drawnCardId = null;
  state.busy = false;
  startHumanTurnClock();
  render();
  scheduleCpuTurn();
}

async function handleHumanDraw() {
  const player = currentPlayer();
  if (!player?.isHuman || state.busy || state.hasDrawn || state.gameOver) return;
  stopHumanTurnClock();
  state.busy = true;
  state.hasDrawn = true;
  state.selectedCardId = null;
  state.drawnCardId = null;
  render();

  const card = drawCardFromStock();
  if (card) {
    await animateHumanDraw(460);
    player.hand.push(card);
    state.drawnCardId = card.id;
    sortHand(player.hand);
    showDrawToast(card);
    render();
  }

  if (card && getLegalActionsForCard(card).length) {
    state.busy = false;
    startHumanTurnClock();
    render();
    return;
  }

  window.setTimeout(finishPass, 520);
}

async function applyMisplayPenalty() {
  const player = currentPlayer();
  if (!player?.isHuman || state.busy || state.gameOver) return;
  stopHumanTurnClock();
  state.busy = true;
  state.selectedCardId = null;
  state.draggedCardId = null;
  state.humanPenalties += 1;
  render();

  elements.misplayBurst.setAttribute("aria-hidden", "false");
  elements.tableArea.classList.remove("is-misplay-flash");
  void elements.tableArea.offsetWidth;
  elements.tableArea.classList.add("is-misplay-flash");
  playEffect("misplay");
  const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 80 : MISPLAY_CUT_IN_MS;
  await new Promise((resolve) => window.setTimeout(resolve, duration));
  elements.tableArea.classList.remove("is-misplay-flash");
  elements.misplayBurst.setAttribute("aria-hidden", "true");
  if (!state.gameStarted || state.gameOver || currentPlayer() !== player || !state.busy) return;

  const card = drawCardFromStock();
  if (card) {
    await animateHumanDraw(460);
    player.hand.push(card);
    sortHand(player.hand);
    showDrawToast(card);
    render();
  }

  window.setTimeout(finishPass, 520);
}

function finishPass() {
  if (currentPlayer()?.isHuman) stopHumanTurnClock();
  state.consecutivePasses += 1;
  const neededPasses = activePlayers().length;
  const shouldFlush = allActivePlayersPassed(state.consecutivePasses, neededPasses);

  if (shouldFlush) {
    discardField();
    showToast(FIELD_FLUSH_MESSAGE, "is-flow", 3000);
  }
  state.drawnCardId = null;
  state.busy = false;
  advanceTurn();
}

function scheduleCpuTurn() {
  clearTimeout(state.cpuTimer);
  if (!state.gameStarted || state.gameOver || state.busy) return;
  const player = currentPlayer();
  if (!player || player.isHuman || player.rank !== null) return;
  state.cpuTimer = window.setTimeout(runCpuTurn, CPU_THINK_DELAY_MS[state.cpuDifficulty]);
}

function actionWouldComplete(action, player) {
  const card = player.hand.find((candidate) => candidate.id === action.cardId);
  if (!card) return false;
  return getCompletedPatterns({ ...state.field, [action.slot]: { card, ownerId: player.id } }).length > 0;
}

function scoreCpuAction(action, player) {
  const card = player.hand.find((candidate) => candidate.id === action.cardId);
  const nextField = { ...state.field, [action.slot]: { card, ownerId: player.id } };
  const remainingCards = player.hand.filter((candidate) => candidate.id !== action.cardId);
  const futureActions = remainingCards.reduce(
    (total, candidate) => total + getLegalActionsForCard(candidate, nextField).length,
    0,
  );
  const candidateCount = getCandidatePatterns(nextField).length;
  let score = Math.random();
  if (player.hand.length === 1) score += 5000;
  if (actionWouldComplete(action, player)) score += 1000;
  score += Object.values(nextField).filter(Boolean).length * 24;
  score += futureActions * 7;
  score += candidateCount ? 18 / candidateCount : 0;
  if (card.type === "verb") score += 10;
  if (action.slot === "X") score += 8;
  return score;
}

function chooseCpuAction(actions, player) {
  if (state.cpuDifficulty === "normal") {
    return actions[Math.floor(Math.random() * actions.length)];
  }
  return actions.reduce(
    (best, action) => {
      const score = scoreCpuAction(action, player);
      return score > best.score ? { action, score } : best;
    },
    { action: actions[0], score: Number.NEGATIVE_INFINITY },
  ).action;
}

async function runCpuTurn() {
  const player = currentPlayer();
  if (!player || player.isHuman || state.gameOver) return;
  state.busy = true;
  render();

  let actions = getLegalActionsForPlayer(player);
  if (actions.length) {
    const action = chooseCpuAction(actions, player);
    await animateCpuPlay(player, action.slot);
    executeAction(state.currentPlayerIndex, action);
    return;
  }

  const drawnCard = drawCardFromStock();
  if (drawnCard) {
    render();
    await animateCpuDraw(player, CPU_DRAW_TRAVEL_MS);
    player.hand.push(drawnCard);
    sortHand(player.hand);
    render();
  }

  if (!drawnCard || getLegalActionsForCard(drawnCard).length === 0) {
    return window.setTimeout(finishPass, CPU_AFTER_DRAW_DELAY_MS[state.cpuDifficulty]);
  }

  actions = getLegalActionsForCard(drawnCard);
  if (actions.length) {
    const action = chooseCpuAction(actions, player);
    window.setTimeout(async () => {
      await animateCpuPlay(player, action.slot);
      executeAction(state.currentPlayerIndex, action);
    }, CPU_AFTER_DRAW_DELAY_MS[state.cpuDifficulty]);
    return;
  }
}

function animateFlyingBack(source, target, options = {}) {
  if (!source || !target || !source.animate) return Promise.resolve();
  const sourceRect = source.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const clone = document.createElement("span");
  clone.className = "flying-card";
  clone.style.left = `${sourceRect.left}px`;
  clone.style.top = `${sourceRect.top}px`;
  document.body.appendChild(clone);

  const dx = targetRect.left + targetRect.width / 2 - (sourceRect.left + sourceRect.width / 2);
  const dy = targetRect.top + targetRect.height / 2 - (sourceRect.top + sourceRect.height / 2);
  const startRotation = options.rotate === false ? 0 : -8;
  const middleRotation = options.rotate === false ? 0 : 7;
  const endRotation = options.rotate === false ? 0 : options.rotation ?? 0;
  const animation = clone.animate(
    [
      { transform: `translate(0, 0) rotate(${startRotation}deg) scale(1)`, opacity: 0.95 },
      {
        transform: `translate(${dx * 0.48}px, ${dy * 0.35 - 42}px) rotate(${middleRotation}deg) scale(1.08)`,
        opacity: 1,
        offset: 0.55,
      },
      { transform: `translate(${dx}px, ${dy}px) rotate(${endRotation}deg) scale(0.92)`, opacity: 1 },
    ],
    { duration: options.duration ?? 560, easing: "cubic-bezier(.22,.78,.27,1)" },
  );
  return animation.finished.catch(() => undefined).finally(() => clone.remove());
}

function animateCpuPlay(player, slot) {
  const source = document.querySelector(`[data-player-id="${player.id}"] .cpu-card-back`);
  const target = document.querySelector(`[data-slot="${slot}"]`);
  return animateFlyingBack(source, target, { rotate: false, duration: CPU_CARD_TRAVEL_MS });
}

function animateCpuDraw(player, duration = 500) {
  const target = document.querySelector(`[data-player-id="${player.id}"] .cpu-hand-visual`);
  return animateDrawFromRight(target, duration);
}

function animateHumanDraw(duration = 500) {
  const target = document.querySelector(".player-area .hand");
  return animateDrawFromRight(target, duration);
}

function animateDrawFromRight(target, duration = 500) {
  if (!target || !target.animate) return Promise.resolve();
  const targetRect = target.getBoundingClientRect();
  const clone = document.createElement("span");
  clone.className = "flying-card";
  clone.style.left = `${window.innerWidth + 34}px`;
  clone.style.top = `${window.innerHeight / 2 - 21}px`;
  document.body.appendChild(clone);

  const dx = targetRect.left + targetRect.width / 2 - (window.innerWidth + 48);
  const dy = targetRect.top + targetRect.height / 2 - window.innerHeight / 2;
  const animation = clone.animate(
    [
      { transform: "translate(0, 0) scale(0.9)", opacity: 0 },
      { transform: `translate(${dx * 0.35}px, ${dy * 0.18}px) scale(1)`, opacity: 1, offset: 0.28 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.94)`, opacity: 1 },
    ],
    { duration, easing: "cubic-bezier(.22,.78,.27,1)" },
  );
  return animation.finished.catch(() => undefined).finally(() => clone.remove());
}

function finishGame() {
  if (state.endSequenceTimer || !elements.resultModal.classList.contains("is-hidden")) return;
  clearTimeout(state.cpuTimer);
  stopHumanTurnClock();
  state.busy = false;
  state.gameOver = true;
  render();
  const rankKey = renderResult();
  sound.phase = "ending";
  elements.bgmAudio.pause();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  state.endSoundTimer = window.setTimeout(() => {
    state.endSoundTimer = null;
    if (sound.phase === "ending") playEffect("end");
  }, reducedMotion ? 0 : END_STAMP_SOUND_MS);
  elements.endCurtain.classList.remove("is-hidden");
  elements.endCurtain.setAttribute("aria-hidden", "false");
  void elements.endCurtain.offsetWidth;
  elements.endCurtain.classList.add("is-active");
  state.endSequenceTimer = window.setTimeout(() => {
    elements.endCurtain.classList.remove("is-active");
    elements.endCurtain.classList.add("is-hidden");
    elements.endCurtain.setAttribute("aria-hidden", "true");
    state.endSequenceTimer = null;
    sound.phase = "result";
    openModal(elements.resultModal);
    playEffect(`rank-${rankKey}`);
  }, END_CURTAIN_DURATION_MS);
}

function render() {
  if (!state.gameStarted) return;
  renderStatus();
  renderOpponents();
  renderSentencePreview();
  renderBoard();
  renderHand();
}

function renderStatus() {
  const player = currentPlayer();
  const isHumanTurn = Boolean(player?.isHuman && player.rank === null && !state.gameOver);
  const isCpuTurn = Boolean(player && !player.isHuman && player.rank === null && !state.gameOver);
  elements.turnName.textContent = player?.name ?? "—";
  elements.turnInstruction.textContent = isHumanTurn
    ? "の手番です。カードを一枚、場に置いてください。"
    : "の手番です。相手の一手をお待ちください。";
  elements.turnLine.classList.toggle("is-human-turn", isHumanTurn);
  elements.turnLine.classList.toggle("is-cpu-turn", isCpuTurn);
  elements.playerArea.classList.toggle("is-current", isHumanTurn);
}

function cpuHandHtml(count) {
  const shown = Math.min(count, 12);
  const backs = Array.from({ length: shown }, (_, index) =>
    `<span class="cpu-card-back" style="--card-index:${index};--card-middle:${(shown - 1) / 2}"></span>`,
  ).join("");
  return `<div class="cpu-hand-visual ${count > 7 ? "is-overflowing" : ""}" aria-label="裏向きの手札${count}枚">${backs}${count > shown ? `<span class="cpu-extra-count">+${count - shown}</span>` : ""}</div>`;
}

function renderOpponents() {
  const difficultyLabel = state.cpuDifficulty === "hard" ? "ハード" : "ノーマル";
  elements.opponents.innerHTML = state.players
    .filter((player) => !player.isHuman)
    .map((player, index) => {
      const isCurrent = currentPlayer()?.id === player.id && !state.gameOver;
      const stateText = player.rank
        ? `${player.rank}位で上がり`
        : `手札 ${player.hand.length}枚・${difficultyLabel}`;
      return `
        <article class="opponent ${isCurrent ? "is-current" : ""} ${player.rank ? "is-finished" : ""}" data-player-id="${player.id}">
          <div class="opponent-avatar" aria-hidden="true">相手${state.players.length > 2 ? index + 1 : ""}</div>
          <div class="opponent-copy"><strong>${escapeHtml(player.name)}</strong><span>${stateText}</span></div>
          ${cpuHandHtml(player.hand.length)}
        </article>
      `;
    })
    .join("");
}

function renderSentencePreview() {
  if (!Object.values(state.field).some(Boolean)) {
    elements.sentencePreview.innerHTML = '<span class="preview-placeholder">カードを置くと、ここに英文が現れます。</span>';
    return;
  }
  const pattern = previewPattern();
  const pieces = PATTERNS[pattern].slots.map((slot) => {
    const surface = surfaceForSlot(slot, state.field, pattern);
    return surface
      ? `<span class="preview-word">${escapeHtml(surface)}</span>`
      : `<span class="preview-blank" aria-label="${dynamicSlotMeta(slot).name}は未完成">____</span>`;
  });
  const firstWordIndex = pieces.findIndex((piece) => piece.includes("preview-word"));
  if (firstWordIndex >= 0) {
    const slot = PATTERNS[pattern].slots[firstWordIndex];
    const word = surfaceForSlot(slot, state.field, pattern);
    pieces[firstWordIndex] = `<span class="preview-word">${escapeHtml(word.charAt(0).toUpperCase() + word.slice(1))}</span>`;
  }
  elements.sentencePreview.innerHTML = pieces.join("");
}

function renderBoard() {
  const human = state.players[0];
  const selectedCard = human?.hand.find((card) => card.id === state.selectedCardId) ?? null;
  const canAttempt = Boolean(
    selectedCard && currentPlayer()?.isHuman && !state.busy && !state.gameOver && human.rank === null,
  );
  elements.sentenceBoard.innerHTML = Object.keys(BASE_SLOT_META)
    .map((slot) => {
      const placement = state.field[slot];
      const meta = dynamicSlotMeta(slot);
      return `
        <button type="button" class="sentence-slot" data-slot="${slot}" aria-disabled="${!canAttempt}" aria-label="${meta.name}${canAttempt ? "にカードを置く" : ""}">
          <span class="slot-heading"><span class="slot-code">${meta.code}</span><span class="slot-name">${meta.name}</span></span>
          ${placement ? fieldCardHtml(slot, placement.card) : `<span class="slot-watermark">${meta.code}</span>`}
        </button>
      `;
    })
    .join("");

  elements.sentenceBoard.querySelectorAll("[data-slot]").forEach((slotButton) => {
    const slot = slotButton.dataset.slot;
    slotButton.addEventListener("click", () => handleSlotClick(slot));
    slotButton.addEventListener("dragover", (event) => handleDragOver(event, slotButton));
    slotButton.addEventListener("dragleave", () => slotButton.classList.remove("is-drag-over"));
    slotButton.addEventListener("drop", (event) => handleDrop(event, slot));
  });
}

function fieldCardHtml(slot, card) {
  return `
    <span class="field-card ${card.type}">
      <span class="card-type">${cardTypeHeading(card)}</span>
      <span class="card-word">${escapeHtml(surfaceForSlot(slot))}</span>
      <span class="card-gloss">${escapeHtml(card.gloss)}</span>
      ${cardFooterHtml(card)}
    </span>
  `;
}

function cardTypeHeading(card) {
  return card.type === "verb" ? `${TYPE_META[card.type].short} · ${TYPE_META[card.type].name}` : TYPE_META[card.type].name;
}

function cardFooterHtml(card) {
  if (card.type === "noun") return '<span class="card-role-copy">S・O・Cになる</span>';
  if (card.type === "adjective") return '<span class="card-role-copy">Cになる</span>';
  return `
    <span class="card-pattern-block">
      <span class="card-pattern-label">取れる文型</span>
      <span class="card-patterns">${card.patterns.map((label) => `<span>${label}</span>`).join("")}</span>
    </span>
  `;
}

function renderHand() {
  const player = state.players[0];
  const isHumanTurn = currentPlayer()?.isHuman && !state.busy && !state.gameOver && player.rank === null;

  elements.handCount.textContent = String(player.hand.length);
  elements.drawButton.disabled =
    !isHumanTurn || state.hasDrawn || state.deck.length + state.discard.length === 0;
  elements.drawButton.setAttribute("aria-label", "山札から1枚引く");

  if (player.hand.length === 0) {
    elements.hand.innerHTML = `<div class="hand-empty">${player.rank ? `${player.rank}位で上がりました！` : "手札がありません"}</div>`;
    return;
  }

  elements.hand.innerHTML = player.hand
    .map((card) => {
      const selected = state.selectedCardId === card.id;
      return `
        <button type="button" class="hand-card ${card.type} ${selected ? "is-selected" : ""}"
          data-card-id="${card.id}" ${isHumanTurn ? "" : "disabled"} draggable="${isHumanTurn}"
          aria-pressed="${selected}" aria-label="${escapeHtml(card.label)}、${TYPE_META[card.type].name}">
          <span class="card-type">${cardTypeHeading(card)}</span>
          <span class="card-word">${escapeHtml(card.label)}</span>
          <span class="card-gloss">${escapeHtml(card.gloss)}</span>
          ${cardFooterHtml(card)}
        </button>
      `;
    })
    .join("");

  elements.hand.querySelectorAll("[data-card-id]").forEach((button) => {
    const cardId = button.dataset.cardId;
    const card = player.hand.find((candidate) => candidate.id === cardId);
    button.addEventListener("click", () => handleCardClick(cardId));
    button.addEventListener("dragstart", (event) => handleDragStart(event, button, card));
    button.addEventListener("dragend", () => clearDragState(button));
    installTouchDrag(button, card);
  });
}

function handleCardClick(cardId) {
  if (Date.now() < state.suppressClickUntil) return;
  if (!currentPlayer()?.isHuman || state.busy || state.gameOver) return;
  const card = state.players[0].hand.find((candidate) => candidate.id === cardId);
  if (!card) return;
  state.selectedCardId = state.selectedCardId === cardId ? null : cardId;
  render();
}

function attemptHumanPlacement(cardId, slot) {
  if (!currentPlayer()?.isHuman || state.busy || state.gameOver) return;
  const card = state.players[0].hand.find((candidate) => candidate.id === cardId);
  if (!card) return;
  const mustUseDrawnCard = state.hasDrawn && state.drawnCardId && card.id !== state.drawnCardId;
  const action = mustUseDrawnCard
    ? null
    : getLegalActionsForCard(card).find((candidate) => candidate.slot === slot);
  if (action) {
    executeAction(0, action);
    return;
  }
  void applyMisplayPenalty();
}

function handleSlotClick(slot) {
  const cardId = state.selectedCardId;
  if (!cardId || !currentPlayer()?.isHuman || state.busy) return;
  attemptHumanPlacement(cardId, slot);
}

function handleDragStart(event, button, card) {
  if (!card || !currentPlayer()?.isHuman || state.busy || state.gameOver) {
    event.preventDefault();
    return;
  }
  state.draggedCardId = card.id;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", card.id);
  button.classList.add("is-dragging");
}

function clearDragState(button = null) {
  state.draggedCardId = null;
  button?.classList.remove("is-dragging");
  document.querySelectorAll(".sentence-slot").forEach((slot) => slot.classList.remove("is-drag-over"));
}

function handleDragOver(event, element) {
  const card = state.players[0]?.hand.find((candidate) => candidate.id === state.draggedCardId);
  if (!card || !currentPlayer()?.isHuman || state.busy || state.gameOver) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  element.classList.add("is-drag-over");
}

function handleDrop(event, slot) {
  event.preventDefault();
  const cardId = state.draggedCardId || event.dataTransfer.getData("text/plain");
  clearDragState(document.querySelector(`[data-card-id="${cardId}"]`));
  attemptHumanPlacement(cardId, slot);
}

function installTouchDrag(button, card) {
  if (!card || button.getAttribute("draggable") !== "true") return;
  let startX = 0;
  let startY = 0;
  let dragging = false;
  let ghost = null;
  let targetSlot = null;

  const cleanup = () => {
    ghost?.remove();
    ghost = null;
    button.classList.remove("is-dragging");
    document.querySelectorAll(".sentence-slot").forEach((slot) => slot.classList.remove("is-drag-over"));
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", cancel);
  };

  const move = (event) => {
    if (event.pointerType === "mouse") return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!dragging) {
      if (Math.abs(dx) > Math.abs(dy)) return;
      if (dy > -13) return;
      dragging = true;
      state.draggedCardId = card.id;
      state.suppressClickUntil = Date.now() + 600;
      button.classList.add("is-dragging");
      ghost = button.cloneNode(true);
      ghost.classList.add("touch-drag-ghost");
      ghost.removeAttribute("data-card-id");
      document.body.appendChild(ghost);
    }
    event.preventDefault();
    ghost.style.left = `${event.clientX}px`;
    ghost.style.top = `${event.clientY}px`;
    const underPointer = document.elementFromPoint(event.clientX, event.clientY);
    const candidate = underPointer?.closest?.(".sentence-slot");
    if (targetSlot !== candidate) targetSlot?.classList.remove("is-drag-over");
    targetSlot = candidate;
    targetSlot?.classList.add("is-drag-over");
  };

  const end = (event) => {
    if (event.pointerType === "mouse") return cleanup();
    const slot = targetSlot?.dataset.slot;
    cleanup();
    state.draggedCardId = null;
    if (slot) attemptHumanPlacement(card.id, slot);
  };

  const cancel = () => {
    cleanup();
    state.draggedCardId = null;
  };

  button.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") return;
    startX = event.clientX;
    startY = event.clientY;
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
  });
}

function renderResult() {
  const human = state.players[0];
  const score = calculateScore({
    rank: human.rank,
    playerCount: state.players.length,
    difficulty: state.cpuDifficulty,
    decisionMs: state.humanDecisionMs,
    penalties: state.humanPenalties,
  });
  const scoreTitle = scoreTitleFor(score.total);
  const difficultyLabel = state.cpuDifficulty === "hard" ? "ハード" : "ノーマル";
  elements.resultScorePanel.dataset.rank = scoreTitle.key;
  elements.resultRank.textContent = scoreTitle.name;
  elements.resultScore.textContent = score.total.toLocaleString("ja-JP");
  elements.resultScoreMeta.textContent = `${human.rank}位・${difficultyLabel}・CPU ${state.players.length - 1}人・手番合計 ${formatDecisionTime(state.humanDecisionMs)}`;
  const parts = [
    `順位 ${score.rankPoints.toLocaleString("ja-JP")}`,
    `速さ ${score.speedPoints.toLocaleString("ja-JP")}`,
    `難易度 ${score.difficultyPoints.toLocaleString("ja-JP")}`,
    `人数 ${score.opponentPoints.toLocaleString("ja-JP")}`,
  ];
  if (score.penaltyPoints) parts.push(`おてつき −${score.penaltyPoints.toLocaleString("ja-JP")}`);
  elements.resultScoreBreakdown.textContent = parts.join(" ／ ");

  elements.rankingList.innerHTML = state.rankings
    .map((playerId, index) => {
      const player = state.players.find((candidate) => candidate.id === playerId);
      return `<li class="ranking-item"><span><strong class="ranking-number">${index + 1}</strong>　${escapeHtml(player.name)}</span></li>`;
    })
    .join("");

  elements.resultSentenceCount.textContent = `${state.history.length}文`;
  elements.resultSentenceList.innerHTML = state.history.length
    ? state.history
        .map((entry) => {
          const translations = entry.analyses
            .map((analysis) => `${completedPatternLabel(analysis.pattern)}：${analysis.translation}`)
            .join("／");
          return `<li class="result-sentence-item"><strong>${escapeHtml(entry.sentence)}</strong><span>${escapeHtml(translations)}</span></li>`;
        })
        .join("")
    : '<li class="result-sentence-item"><span>今回は完成した英文がありませんでした。</span></li>';
  return scoreTitle.key;
}

function showDrawToast(card) {
  showToast(`引いたカード：${TYPE_META[card.type].name}「${card.label}」`, "is-info", 2600);
}

function showToast(message, modifier, duration) {
  elements.toastRegion.replaceChildren();
  const toast = document.createElement("div");
  toast.className = `toast ${modifier}`;
  toast.textContent = message;
  elements.toastRegion.appendChild(toast);
  window.setTimeout(() => toast.remove(), duration);
}

function openModal(modal) {
  modal.classList.remove("is-hidden");
  window.setTimeout(() => modal.querySelector("button")?.focus(), 0);
}

function closeModal(modal) {
  modal.classList.add("is-hidden");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function runSelfChecks() {
  const cards = buildDeck();
  const findAll = (label) => cards.filter((card) => card.label === label);
  const findOne = (label) => cards.find((card) => card.label === label);
  const [stationSubject, stationObject] = findAll("the station");
  const loveCard = findOne("love");
  const runCard = findOne("run");
  const studentsCard = findOne("the students");
  const [iSubject, iObject] = findAll("I");
  const tomCard = findOne("Tom");
  const quietCard = findOne("quiet");
  const becomeCard = findOne("become");
  const makeCard = findOne("make");
  const doctorCard = findOne("a doctor");

  const reflexiveField = {
    ...emptyField(),
    S: { card: stationSubject },
    V: { card: loveCard },
    O1: { card: stationObject },
  };
  const pluralField = { ...emptyField(), S: { card: studentsCard }, V: { card: loveCard } };
  const objectiveField = { ...emptyField(), S: { card: tomCard }, O1: { card: iObject } };
  const iReflexiveField = {
    ...emptyField(),
    S: { card: iSubject },
    V: { card: loveCard },
    O1: { card: iObject },
  };
  const svcField = {
    ...emptyField(),
    S: { card: tomCard },
    V: { card: becomeCard },
    O1: { card: quietCard },
  };
  const runSvcField = {
    ...emptyField(),
    S: { card: tomCard },
    V: { card: runCard },
    O1: { card: quietCard },
  };
  const runSvoField = {
    ...emptyField(),
    S: { card: tomCard },
    V: { card: runCard },
    O1: { card: stationObject },
  };
  const ambiguousField = {
    S: { card: tomCard },
    V: { card: makeCard },
    O1: { card: stationObject },
    X: { card: doctorCard },
  };
  const adjectiveField = { ...ambiguousField, X: { card: quietCard } };
  const focusCounts = cards
    .filter((card) => card.type === "verb")
    .reduce((counts, card) => ({ ...counts, [card.focusPattern]: (counts[card.focusPattern] ?? 0) + 1 }), {});
  const typeCounts = cards.reduce(
    (counts, card) => ({ ...counts, [card.type]: (counts[card.type] ?? 0) + 1 }),
    {},
  );
  const normalStrongScore = calculateScore({
    rank: 1,
    playerCount: 3,
    difficulty: "normal",
    decisionMs: 40000,
    penalties: 0,
  }).total;
  const hardModerateScore = calculateScore({
    rank: 1,
    playerCount: 3,
    difficulty: "hard",
    decisionMs: 90000,
    penalties: 0,
  }).total;
  const secondPlaceScore = calculateScore({
    rank: 2,
    playerCount: 3,
    difficulty: "normal",
    decisionMs: 40000,
    penalties: 0,
  }).total;
  const normalMaximumScore = calculateScore({
    rank: 1,
    playerCount: 4,
    difficulty: "normal",
    decisionMs: 0,
    penalties: 0,
  }).total;

  const checks = [
    [nounSurface(stationObject, "O1", reflexiveField, "SVO") === "itself", "再帰代名詞への変化"],
    [verbSurface(loveCard, reflexiveField) === "loves", "三人称単数現在"],
    [verbSurface(loveCard, pluralField) === "love", "複数主語の現在形"],
    [nounSurface(iObject, "O1", objectiveField, "SVO") === "me", "目的格への変化"],
    [iSubject.id !== iObject.id && nounSurface(iObject, "O1", iReflexiveField, "SVO") === "myself", "Iの再帰代名詞"],
    [sentenceText(reflexiveField, "SVO") === "The station loves itself.", "英文の空白"],
    [JSON.stringify(getCompletedPatterns(svcField)) === JSON.stringify(["SVC"]), "O/CのSVC判定"],
    [sentenceText(svcField, "SVC") === "Tom becomes quiet.", "O/CでのSVC完成"],
    [JSON.stringify(runCard.patterns) === JSON.stringify(["SV", "SVC", "SVO"]), "runの三文型"],
    [
      japaneseTranslation("SVC", runSvcField) === "トムは静かになる。" &&
        japaneseTranslation("SVO", runSvoField) === "トムはその駅を経営する。",
      "runの文型別和訳",
    ],
    [getCompletedPatterns(ambiguousField).length === 2, "O2/Cの二重解釈"],
    [JSON.stringify(getCandidatePatterns(adjectiveField)) === JSON.stringify(["SVOC"]), "形容詞によるSVOC確定"],
    [Math.max(...PATTERN_ORDER.map((pattern) => focusCounts[pattern])) - Math.min(...PATTERN_ORDER.map((pattern) => focusCounts[pattern])) <= 1, "5文型の動詞枚数バランス"],
    [typeCounts.noun === 50 && typeCounts.adjective === 20 && typeCounts.verb === 27, "品詞別カード配分"],
    [buildDeck().length === 97, "デッキ枚数"],
    [!allActivePlayersPassed(2, 3) && allActivePlayersPassed(3, 3), "全員パス時の場流し"],
    [COMPLETION_CUT_IN_MS === 4000, "完成カットイン4秒"],
    [COMPLETION_REVEAL_DELAY_MS <= 800 && Boolean(elements.completionBurst), "軽量な完成前演出"],
    [MATCH_INTRO_MS >= 1800 && Boolean(elements.matchIntro), "試合開始カットイン"],
    [MISPLAY_CUT_IN_MS >= 800 && Boolean(elements.misplayBurst), "場内のおてつきカットイン"],
    [
      FIELD_FLUSH_MESSAGE === "全員が出せなかったため、場が流れました" &&
        finishPass.toString().includes("showToast(FIELD_FLUSH_MESSAGE"),
      "場流し通知",
    ],
    [
      CPU_THINK_DELAY_MS.normal >= 1200 &&
        CPU_THINK_DELAY_MS.hard < CPU_THINK_DELAY_MS.normal &&
        CPU_AFTER_DRAW_DELAY_MS.hard < CPU_AFTER_DRAW_DELAY_MS.normal &&
        CPU_CARD_TRAVEL_MS >= 800,
      "難易度別のCPU表示テンポ",
    ],
    [!handleHumanDraw.toString().includes("state.selectedCardId = card.id"), "ドロー後の自動選択なし"],
    [
      PATTERN_ORDER.every((pattern, index) => completedPatternLabel(pattern) === `${pattern}・第${index + 1}文型`),
      "完成時の第何文型表示",
    ],
    [elements.cpuCountButtons.length === 3, "CPU人数の上限3人"],
    [!document.querySelector("#hintButton") && !document.querySelector("#stockPile"), "アシストと山札表示の撤廃"],
    [Boolean(elements.themeIcon && elements.themeLabel && elements.turnInstruction), "再設計UIの主要要素"],
    [!document.querySelector("#patternCandidates"), "文型候補表示の撤廃"],
    [
      Object.entries(BASE_SLOT_META).every(([slot, meta]) => {
        const renderedMeta = dynamicSlotMeta(slot);
        return renderedMeta.code === meta.code && renderedMeta.name === meta.name;
      }),
      "スロット表記の固定",
    ],
    [Math.abs(normalStrongScore - hardModerateScore) <= 150, "難易度と速さのスコア均衡"],
    [normalStrongScore - secondPlaceScore >= 3000, "順位による大きなスコア差"],
    [Boolean(elements.resultScore && elements.resultScoreMeta && elements.resultScoreBreakdown), "スコア表示"],
    [Boolean(elements.resultSetupButton), "リザルトからスタート画面へ戻るボタン"],
    [animateCpuPlay.toString().includes("rotate: false"), "CPUカード配置の無回転化"],
    [
      animateCpuDraw.toString().includes("animateDrawFromRight") &&
        animateHumanDraw.toString().includes("animateDrawFromRight"),
      "画面右側からのドロー演出",
    ],
    [
      scoreTitleFor(SCORE_SHIHAN_MINIMUM).name === "文型師範" &&
        scoreTitleFor(SCORE_SHIHAN_MINIMUM - 10).name === "文型師匠" &&
        scoreTitleFor(10000).name === "文型師匠" &&
        scoreTitleFor(6000).name === "文型弟子" &&
        scoreTitleFor(5990).name === "文型見習い",
      "スコア称号の境界",
    ],
    [normalMaximumScore < SCORE_SHIHAN_MINIMUM, "ノーマルでは師範に届かない難度"],
    [END_CURTAIN_DURATION_MS >= 1400 && Boolean(elements.endCurtain), "ふすま終了演出"],
    [!document.querySelector(".result-burst"), "リザルト装飾文字の撤廃"],
  ];
  const failed = checks.filter(([passed]) => !passed).map(([, label]) => label);
  if (failed.length) console.error(`文型道場自己診断エラー: ${failed.join("、")}`);
  else console.info(`文型道場自己診断: ${checks.length}項目すべて正常`);
}

elements.cpuCountButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.selectedCpuCount = Number(button.dataset.cpuCount);
    elements.cpuCountButtons.forEach((candidate) => {
      const selected = candidate === button;
      candidate.classList.toggle("is-selected", selected);
      candidate.setAttribute("aria-checked", String(selected));
    });
  });
});

elements.cpuDifficultyButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.cpuDifficulty = button.dataset.cpuDifficulty;
    elements.cpuDifficultyButtons.forEach((candidate) => {
      const selected = candidate === button;
      candidate.classList.toggle("is-selected", selected);
      candidate.setAttribute("aria-checked", String(selected));
    });
  });
});

elements.startButton.addEventListener("click", startGame);
elements.soundButton.addEventListener("click", () => setSoundEnabled(!sound.enabled));
elements.themeButton.addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true);
});
elements.playAgainButton.addEventListener("click", startGame);
elements.resultSetupButton.addEventListener("click", returnToSetup);
elements.restartButton.addEventListener("click", () => {
  if (state.gameOver || window.confirm("現在の対戦を終了して、スタート画面へ戻りますか？")) {
    returnToSetup();
  }
});
elements.drawButton.addEventListener("click", handleHumanDraw);
elements.rulesButton.addEventListener("click", () => openModal(elements.rulesModal));
elements.closeRulesButton.addEventListener("click", () => closeModal(elements.rulesModal));
elements.continueButton.addEventListener("click", continueAfterCompletion);
elements.rulesModal.addEventListener("click", (event) => {
  if (event.target === elements.rulesModal) closeModal(elements.rulesModal);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal(elements.rulesModal);
});

document.addEventListener("click", (event) => {
  const button = event.target instanceof Element ? event.target.closest("button") : null;
  if (button && !button.disabled) playEffect("click");
});

applyTheme(savedTheme());
updateSoundButton();
runSelfChecks();
