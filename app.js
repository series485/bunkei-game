"use strict";

const PATTERNS = {
  SV: { slots: ["S", "V"], o1Role: null, xRole: null, description: "主語＋動詞" },
  SVC: { slots: ["S", "V", "O1"], o1Role: "C", xRole: null, description: "主語＋動詞＋補語" },
  SVO: { slots: ["S", "V", "O1"], o1Role: "O1", xRole: null, description: "主語＋動詞＋目的語" },
  SVOO: {
    slots: ["S", "V", "O1", "X"],
    o1Role: "O1",
    xRole: "O2",
    description: "主語＋動詞＋間接目的語＋直接目的語",
  },
  SVOC: {
    slots: ["S", "V", "O1", "X"],
    o1Role: "O1",
    xRole: "C",
    description: "主語＋動詞＋目的語＋補語",
  },
};

const PATTERN_ORDER = ["SV", "SVC", "SVO", "SVOO", "SVOC"];

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
  consecutivePasses: 0,
  pendingCompletion: null,
  completionTimer: null,
  cpuTimer: null,
};

const elements = {
  setupScreen: document.querySelector("#setupScreen"),
  gameScreen: document.querySelector("#gameScreen"),
  themeButton: document.querySelector("#themeButton"),
  startButton: document.querySelector("#startButton"),
  restartButton: document.querySelector("#restartButton"),
  rulesButton: document.querySelector("#rulesButton"),
  rulesModal: document.querySelector("#rulesModal"),
  closeRulesButton: document.querySelector("#closeRulesButton"),
  cpuCountButtons: [...document.querySelectorAll("[data-cpu-count]")],
  cpuDifficultyButtons: [...document.querySelectorAll("[data-cpu-difficulty]")],
  turnName: document.querySelector("#turnName"),
  statusMessage: document.querySelector("#statusMessage"),
  stockPile: document.querySelector("#stockPile"),
  deckCount: document.querySelector("#deckCount"),
  opponents: document.querySelector("#opponents"),
  patternCandidates: document.querySelector("#patternCandidates"),
  sentencePreview: document.querySelector("#sentencePreview"),
  sentenceBoard: document.querySelector("#sentenceBoard"),
  playerArea: document.querySelector(".player-area"),
  hand: document.querySelector("#hand"),
  handCount: document.querySelector("#handCount"),
  drawButton: document.querySelector("#drawButton"),
  hintButton: document.querySelector("#hintButton"),
  toastRegion: document.querySelector("#toastRegion"),
  completionModal: document.querySelector("#completionModal"),
  completionPatterns: document.querySelector("#completionPatterns"),
  completionEnglish: document.querySelector("#completionEnglish"),
  completionTranslations: document.querySelector("#completionTranslations"),
  completionNote: document.querySelector("#completionNote"),
  continueButton: document.querySelector("#continueButton"),
  resultModal: document.querySelector("#resultModal"),
  rankingList: document.querySelector("#rankingList"),
  resultSentenceCount: document.querySelector("#resultSentenceCount"),
  resultSentenceList: document.querySelector("#resultSentenceList"),
  playAgainButton: document.querySelector("#playAgainButton"),
};

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
    noun({ label: "the computer", gloss: "そのコンピューター", entity: "computer", reflexive: "itself", copies: 2 }),
    noun({ label: "the ticket", gloss: "その切符", entity: "ticket", reflexive: "itself", copies: 2 }),
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
  ];

  const verbDefinitions = [
    // 各文型を主役にしたカードを6枚ずつ収録。複数文型を取る動詞は併記する。
    verb("run", "runs", "走る", ["SV"]),
    verb("sleep", "sleeps", "眠る", ["SV"]),
    verb("arrive", "arrives", "到着する", ["SV"]),
    verb("laugh", "laughs", "笑う", ["SV"]),
    verb("cry", "cries", "泣く", ["SV"]),
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
    verb("send", "sends", "OにO₂を送る", ["SVO", "SVOO"], {}, "SVOO"),
    verb("buy", "buys", "OにO₂を買う", ["SVO", "SVOO"], {}, "SVOO"),

    verb("keep", "keeps", "保つ／OをCのままにする", ["SVO", "SVOC"], { SVOC: ["adjective", "noun"] }, "SVOC"),
    verb("make", "makes", "作る／OにO₂を作る／OをCにする", ["SVO", "SVOO", "SVOC"], { SVOC: ["adjective", "noun"] }, "SVOC"),
    verb("call", "calls", "呼ぶ／OをCと呼ぶ", ["SVO", "SVOC"], { SVOC: ["noun"] }, "SVOC"),
    verb("name", "names", "名づける／OをCと名づける", ["SVO", "SVOC"], { SVOC: ["noun"] }, "SVOC"),
    verb("find", "finds", "見つける／OがCだと分かる", ["SVO", "SVOC"], { SVOC: ["adjective", "noun"] }, "SVOC"),
    verb("leave", "leaves", "残す／OをCのままにする", ["SVO", "SVOC"], { SVOC: ["adjective", "noun"] }, "SVOC"),
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
  elements.themeButton.textContent = resolved === "dark" ? "ライト" : "ダーク";
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
  clearTimeout(state.completionTimer);
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
  state.busy = false;
  state.hasDrawn = false;
  state.consecutivePasses = 0;
  state.pendingCompletion = null;

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
  showToast(`${currentPlayer().name}からスタートです！`, "info");
  scheduleCpuTurn();
}

function returnToSetup() {
  clearTimeout(state.cpuTimer);
  clearTimeout(state.completionTimer);
  state.gameStarted = false;
  state.gameOver = false;
  state.busy = false;
  state.consecutivePasses = 0;
  state.pendingCompletion = null;
  state.selectedCardId = null;
  closeModal(elements.rulesModal);
  closeModal(elements.completionModal);
  closeModal(elements.resultModal);
  elements.gameScreen.classList.add("is-hidden");
  elements.setupScreen.classList.remove("is-hidden");
  elements.restartButton.classList.add("is-hidden");
  elements.toastRegion.replaceChildren();
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

function drawCardFromStock() {
  if (state.deck.length === 0 && state.discard.length > 0) {
    state.deck = shuffle(state.discard);
    state.discard = [];
    showToast("使い終わったカードを切り直しました。", "info");
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
  if (slot === "S" || slot === "V") return BASE_SLOT_META[slot];
  const role = slotRole(slot);
  if (role === "O1") return { code: "O", name: "目的語" };
  if (role === "O2") return { code: "O₂", name: "目的語2" };
  if (role === "C") return { code: "C", name: "補語" };
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
    if (["become", "turn", "get"].includes(lemma)) {
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

  clearTimeout(state.cpuTimer);
  const before = getSurfaceMap();
  const cardIndex = player.hand.findIndex((card) => card.id === action.cardId);
  const [card] = player.hand.splice(cardIndex, 1);
  state.field[action.slot] = { card, ownerId: player.id };
  state.selectedCardId = null;
  state.draggedCardId = null;
  state.hasDrawn = false;
  state.consecutivePasses = 0;
  state.busy = true;

  const notes = collectSurfaceChanges(before, action.slot, card);
  state.sentenceNotes.push(...notes.filter((note) => !state.sentenceNotes.includes(note)));
  notes.slice(0, 2).forEach((note, index) => window.setTimeout(() => showToast(note), index * 240));

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
    showCompletion(entry);
    return;
  }

  render();
  window.setTimeout(() => {
    if (state.gameOver) return finishGame();
    state.busy = false;
    advanceTurn();
  }, 470);
}

function showCompletion(entry) {
  clearTimeout(state.completionTimer);
  elements.completionPatterns.innerHTML = entry.analyses
    .map((analysis) => `<span class="pattern-chip is-locked">${analysis.pattern}</span>`)
    .join("");
  elements.completionEnglish.textContent = entry.sentence;
  elements.completionTranslations.innerHTML = entry.analyses
    .map(
      (analysis) => `
        <div class="completion-translation">
          <strong>${analysis.pattern}</strong>
          <span>${escapeHtml(analysis.translation)}</span>
        </div>
      `,
    )
    .join("");
  elements.completionNote.textContent = entry.notes.length
    ? entry.notes.join("／")
    : `${entry.completedBy}が完成させました。`;
  openModal(elements.completionModal);
  state.completionTimer = window.setTimeout(continueAfterCompletion, 2800);
}

function continueAfterCompletion() {
  if (!state.pendingCompletion) return;
  clearTimeout(state.completionTimer);
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
  showToast(`${player.name}が${player.rank}位で上がりました！`, "info");
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
  state.busy = false;
  render();
  scheduleCpuTurn();
}

async function handleHumanDraw() {
  const player = currentPlayer();
  if (!player?.isHuman || state.busy || state.hasDrawn || state.gameOver) return;
  if (getLegalActionsForPlayer(player).length) {
    showToast("出せるカードがあります。先にカードを置いてください。", "info");
    return;
  }
  state.busy = true;
  state.hasDrawn = true;
  render();

  const card = drawCardFromStock();
  if (card) {
    render();
    await animateHumanDraw(310);
    player.hand.push(card);
    sortHand(player.hand);
    render();
  }

  if (card && getLegalActionsForCard(card).length) {
    state.busy = false;
    state.selectedCardId = card.id;
    showToast(`「${card.label}」を引きました。出せます！`, "info");
    render();
    return;
  }

  showToast(card ? `「${card.label}」は出せないため、パスします。` : "山札が空のため、パスします。", "info");
  window.setTimeout(finishPass, 600);
}

function finishPass() {
  const passerName = currentPlayer()?.name ?? "プレイヤー";
  state.consecutivePasses += 1;
  const neededPasses = activePlayers().length;
  const shouldFlush = allActivePlayersPassed(state.consecutivePasses, neededPasses);

  if (shouldFlush) {
    discardField();
    showToast("全員が出せなかったため、場を流しました！", "info");
  } else {
    showToast(`${passerName}がパスしました（${state.consecutivePasses}/${neededPasses}人）。`, "info");
  }
  state.busy = false;
  advanceTurn();
}

function scheduleCpuTurn() {
  clearTimeout(state.cpuTimer);
  if (!state.gameStarted || state.gameOver || state.busy) return;
  const player = currentPlayer();
  if (!player || player.isHuman || player.rank !== null) return;
  state.cpuTimer = window.setTimeout(runCpuTurn, 760);
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
    await animateCpuDraw(player, 300);
    player.hand.push(drawnCard);
    sortHand(player.hand);
    render();
  }

  if (!drawnCard || getLegalActionsForCard(drawnCard).length === 0) {
    return window.setTimeout(finishPass, 500);
  }

  showToast(`${player.name}が1枚引き、出せるカードを見つけました。`, "info");
  actions = getLegalActionsForCard(drawnCard);
  if (actions.length) {
    const action = chooseCpuAction(actions, player);
    window.setTimeout(async () => {
      await animateCpuPlay(player, action.slot);
      executeAction(state.currentPlayerIndex, action);
    }, 360);
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
  const animation = clone.animate(
    [
      { transform: "translate(0, 0) rotate(-8deg) scale(1)", opacity: 0.95 },
      { transform: `translate(${dx * 0.48}px, ${dy * 0.35 - 42}px) rotate(7deg) scale(1.12)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${options.rotation ?? 0}deg) scale(0.92)`, opacity: 1 },
    ],
    { duration: options.duration ?? 560, easing: "cubic-bezier(.22,.78,.27,1)" },
  );
  return animation.finished.catch(() => undefined).finally(() => clone.remove());
}

function animateCpuPlay(player, slot) {
  const source = document.querySelector(`[data-player-id="${player.id}"] .cpu-card-back`);
  const target = document.querySelector(`[data-slot="${slot}"]`);
  return animateFlyingBack(source, target, { rotation: 180, duration: 580 });
}

function animateCpuDraw(player, duration = 500) {
  const source = document.querySelector(".stock-pile .stock-card-back-1");
  const target = document.querySelector(`[data-player-id="${player.id}"] .cpu-hand-visual`);
  return animateFlyingBack(source, target, { rotation: -5, duration });
}

function animateHumanDraw(duration = 500) {
  const source = document.querySelector(".stock-pile .stock-card-back-1");
  const target = document.querySelector(".player-area .hand");
  return animateFlyingBack(source, target, { rotation: 5, duration });
}

function finishGame() {
  clearTimeout(state.cpuTimer);
  state.busy = false;
  state.gameOver = true;
  render();
  renderResult();
  openModal(elements.resultModal);
}

function render() {
  if (!state.gameStarted) return;
  renderStatus();
  renderOpponents();
  renderPatterns();
  renderSentencePreview();
  renderBoard();
  renderHand();
}

function renderStatus() {
  const player = currentPlayer();
  elements.turnName.textContent = player?.name ?? "—";
  elements.deckCount.textContent = String(state.deck.length);
  elements.playerArea.classList.toggle(
    "is-current",
    Boolean(player?.isHuman && player.rank === null && !state.gameOver),
  );
  elements.stockPile.classList.toggle("is-empty", state.deck.length + state.discard.length === 0);
  elements.stockPile.setAttribute("aria-label", `山札 ${state.deck.length}枚`);
  if (state.gameOver) {
    elements.statusMessage.textContent = "対戦終了です。今回の英文をリザルトで確認できます。";
  } else if (state.pendingCompletion) {
    elements.statusMessage.textContent = "英文完成！　訳を確認してください。";
  } else if (state.busy && !player?.isHuman) {
    elements.statusMessage.textContent = `${player.name}が考えています…`;
  } else if (player?.isHuman) {
    elements.statusMessage.textContent = getLegalActionsForPlayer(player).length
      ? "カードを置いてください。"
      : "出せません。「山札からとる」を押してください。";
  } else if (state.players[0].rank !== null) {
    elements.statusMessage.textContent = `あなたは${state.players[0].rank}位で上がり。CPUの対戦を続けています。`;
  } else {
    elements.statusMessage.textContent = `${player?.name ?? "CPU"}の番です。`;
  }
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
          <div class="opponent-avatar" aria-hidden="true">${index + 1}</div>
          <div class="opponent-copy"><strong>${escapeHtml(player.name)}</strong><span>${stateText}</span></div>
          ${cpuHandHtml(player.hand.length)}
        </article>
      `;
    })
    .join("");
}

function renderPatterns() {
  const candidates = getCandidatePatterns();
  elements.patternCandidates.innerHTML = candidates
    .map((pattern) => `<span class="pattern-chip">${pattern}</span>`)
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
  const candidates = getCandidatePatterns();
  const human = state.players[0];
  const selectedCard = human?.hand.find((card) => card.id === state.selectedCardId) ?? null;
  const selectedActions = selectedCard ? getLegalActionsForCard(selectedCard) : [];
  elements.sentenceBoard.classList.toggle("is-complete", Boolean(state.pendingCompletion));

  elements.sentenceBoard.innerHTML = Object.keys(BASE_SLOT_META)
    .map((slot) => {
      const placement = state.field[slot];
      const meta = dynamicSlotMeta(slot);
      const active = placement || candidates.some((pattern) => PATTERNS[pattern].slots.includes(slot));
      const legal = selectedActions.some((action) => action.slot === slot);
      const className = ["sentence-slot", active ? "" : "is-inactive", legal ? "is-legal" : ""]
        .filter(Boolean)
        .join(" ");
      return `
        <button type="button" class="${className}" data-slot="${slot}" aria-disabled="${!legal}" aria-label="${meta.name}${legal ? "にカードを置く" : ""}">
          <span class="slot-heading"><span class="slot-code">${meta.code}</span><span class="slot-name">${meta.name}</span></span>
          ${placement ? fieldCardHtml(slot, placement.card) : `<span class="slot-watermark">${meta.code}</span>`}
        </button>
      `;
    })
    .join("");

  elements.sentenceBoard.querySelectorAll("[data-slot]").forEach((slotButton) => {
    const slot = slotButton.dataset.slot;
    slotButton.addEventListener("click", () => handleSlotClick(slot));
    slotButton.addEventListener("dragover", (event) => handleDragOver(event, slotButton, slot));
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
  const allActions = isHumanTurn ? getLegalActionsForPlayer(player) : [];
  const playableIds = new Set(allActions.map((action) => action.cardId));

  elements.handCount.textContent = String(player.hand.length);
  elements.drawButton.disabled =
    !isHumanTurn || state.hasDrawn || allActions.length > 0 || state.deck.length + state.discard.length === 0;
  elements.drawButton.setAttribute(
    "aria-label",
    elements.drawButton.disabled ? `山札 ${state.deck.length}枚` : `山札 ${state.deck.length}枚、1枚引く`,
  );
  elements.hintButton.disabled = !isHumanTurn;

  if (player.hand.length === 0) {
    elements.hand.innerHTML = `<div class="hand-empty">${player.rank ? `${player.rank}位で上がりました！` : "手札がありません"}</div>`;
    return;
  }

  elements.hand.innerHTML = player.hand
    .map((card) => {
      const playable = playableIds.has(card.id);
      const selected = state.selectedCardId === card.id;
      return `
        <button type="button" class="hand-card ${card.type} ${selected ? "is-selected" : ""} ${isHumanTurn && !playable ? "is-unplayable" : ""}"
          data-card-id="${card.id}" ${isHumanTurn ? "" : "disabled"} draggable="${isHumanTurn && playable}"
          aria-pressed="${selected}" aria-label="${escapeHtml(card.label)}、${TYPE_META[card.type].name}${playable ? "、今出せます" : ""}">
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
  if (!getLegalActionsForCard(card).length) {
    showToast(`「${card.label}」は今の場には置けません。`, "info");
    return;
  }
  state.selectedCardId = state.selectedCardId === cardId ? null : cardId;
  render();
}

function handleSlotClick(slot) {
  const cardId = state.selectedCardId;
  if (!cardId || !currentPlayer()?.isHuman || state.busy) return;
  const card = state.players[0].hand.find((candidate) => candidate.id === cardId);
  const action = card && getLegalActionsForCard(card).find((candidate) => candidate.slot === slot);
  if (action) executeAction(0, action);
}

function handleDragStart(event, button, card) {
  if (!card || !getLegalActionsForCard(card).length || state.busy) {
    event.preventDefault();
    return;
  }
  state.draggedCardId = card.id;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", card.id);
  button.classList.add("is-dragging");
  markDragTargets(card);
}

function clearDragState(button = null) {
  state.draggedCardId = null;
  button?.classList.remove("is-dragging");
  document.querySelectorAll(".sentence-slot").forEach((slot) =>
    slot.classList.remove("is-drag-over", "is-legal"),
  );
}

function markDragTargets(card) {
  const slots = new Set(getLegalActionsForCard(card).map((action) => action.slot));
  document.querySelectorAll(".sentence-slot").forEach((element) => {
    element.classList.toggle("is-legal", slots.has(element.dataset.slot));
  });
}

function handleDragOver(event, element, slot) {
  const card = state.players[0]?.hand.find((candidate) => candidate.id === state.draggedCardId);
  if (!card || !getLegalActionsForCard(card).some((action) => action.slot === slot)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  element.classList.add("is-drag-over");
}

function handleDrop(event, slot) {
  event.preventDefault();
  const cardId = state.draggedCardId || event.dataTransfer.getData("text/plain");
  const card = state.players[0]?.hand.find((candidate) => candidate.id === cardId);
  const action = card && getLegalActionsForCard(card).find((candidate) => candidate.slot === slot);
  clearDragState(document.querySelector(`[data-card-id="${cardId}"]`));
  if (action) executeAction(0, action);
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
    document.querySelectorAll(".sentence-slot").forEach((slot) =>
      slot.classList.remove("is-drag-over", "is-legal"),
    );
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
      markDragTargets(card);
    }
    event.preventDefault();
    ghost.style.left = `${event.clientX}px`;
    ghost.style.top = `${event.clientY}px`;
    const underPointer = document.elementFromPoint(event.clientX, event.clientY);
    const candidate = underPointer?.closest?.(".sentence-slot");
    const legal = candidate && getLegalActionsForCard(card).some((action) => action.slot === candidate.dataset.slot);
    if (targetSlot !== candidate) targetSlot?.classList.remove("is-drag-over");
    targetSlot = legal ? candidate : null;
    targetSlot?.classList.add("is-drag-over");
  };

  const end = (event) => {
    if (event.pointerType === "mouse") return cleanup();
    const slot = targetSlot?.dataset.slot;
    const action = slot && getLegalActionsForCard(card).find((candidate) => candidate.slot === slot);
    cleanup();
    state.draggedCardId = null;
    if (action) executeAction(0, action);
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

function showHint() {
  if (!currentPlayer()?.isHuman || state.busy || state.gameOver) return;
  const actions = getLegalActionsForPlayer(state.players[0]);
  if (!actions.length) {
    showToast("今は合法手がありません。山札から1枚引きましょう。", "info");
    return;
  }
  const preferred = actions.find((action) => actionWouldComplete(action, state.players[0])) ?? actions[0];
  const card = state.players[0].hand.find((candidate) => candidate.id === preferred.cardId);
  state.selectedCardId = card.id;
  render();
  showToast(`「${card.label}」を${dynamicSlotMeta(preferred.slot).code}へ置けます。`, "info");
}

function renderResult() {
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
            .map((analysis) => `${analysis.pattern}：${analysis.translation}`)
            .join("／");
          return `<li class="result-sentence-item"><strong>${escapeHtml(entry.sentence)}</strong><span>${escapeHtml(translations)}</span></li>`;
        })
        .join("")
    : '<li class="result-sentence-item"><span>今回は完成した英文がありませんでした。</span></li>';
}

function showToast(message, tone = "default") {
  const toast = document.createElement("div");
  toast.className = `toast ${tone === "info" ? "is-info" : ""}`;
  toast.textContent = message;
  elements.toastRegion.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3200);
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
  const studentsCard = findOne("the students");
  const iCard = findOne("I");
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
  const objectiveField = { ...emptyField(), S: { card: tomCard }, O1: { card: iCard } };
  const svcField = {
    ...emptyField(),
    S: { card: tomCard },
    V: { card: becomeCard },
    O1: { card: quietCard },
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

  const checks = [
    [nounSurface(stationObject, "O1", reflexiveField, "SVO") === "itself", "再帰代名詞への変化"],
    [verbSurface(loveCard, reflexiveField) === "loves", "三人称単数現在"],
    [verbSurface(loveCard, pluralField) === "love", "複数主語の現在形"],
    [nounSurface(iCard, "O1", objectiveField, "SVO") === "me", "目的格への変化"],
    [sentenceText(reflexiveField, "SVO") === "The station loves itself.", "英文の空白"],
    [JSON.stringify(getCompletedPatterns(svcField)) === JSON.stringify(["SVC"]), "O/CのSVC判定"],
    [sentenceText(svcField, "SVC") === "Tom becomes quiet.", "O/CでのSVC完成"],
    [getCompletedPatterns(ambiguousField).length === 2, "O2/Cの二重解釈"],
    [JSON.stringify(getCandidatePatterns(adjectiveField)) === JSON.stringify(["SVOC"]), "形容詞によるSVOC確定"],
    [PATTERN_ORDER.every((pattern) => focusCounts[pattern] === 6), "5文型の動詞枚数バランス"],
    [buildDeck().length === 96, "デッキ枚数"],
    [!allActivePlayersPassed(2, 3) && allActivePlayersPassed(3, 3), "全員パス時の場流し"],
  ];
  const failed = checks.filter(([passed]) => !passed).map(([, label]) => label);
  if (failed.length) console.error(`文型ゲーム自己診断エラー: ${failed.join("、")}`);
  else console.info(`文型ゲーム自己診断: ${checks.length}項目すべて正常`);
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
elements.themeButton.addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true);
});
elements.playAgainButton.addEventListener("click", startGame);
elements.restartButton.addEventListener("click", () => {
  if (state.gameOver || window.confirm("現在の対戦を終了して、スタート画面へ戻りますか？")) {
    returnToSetup();
  }
});
elements.drawButton.addEventListener("click", handleHumanDraw);
elements.hintButton.addEventListener("click", showHint);
elements.rulesButton.addEventListener("click", () => openModal(elements.rulesModal));
elements.closeRulesButton.addEventListener("click", () => closeModal(elements.rulesModal));
elements.continueButton.addEventListener("click", continueAfterCompletion);
elements.rulesModal.addEventListener("click", (event) => {
  if (event.target === elements.rulesModal) closeModal(elements.rulesModal);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal(elements.rulesModal);
});

applyTheme(savedTheme());
runSelfChecks();
