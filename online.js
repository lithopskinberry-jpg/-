// ===== online.js =====
// Authoritative Host Model
//
// 【Host】ゲーム状態の唯一の真実
//   - 全シミュレーションをHostのみが実行
//   - 自分の操作 → G適用 → Firebase gameState書き込み
//   - Guestの操作 → actions受信 → G適用 → Firebase gameState書き込み
//
// 【Guest】操作の送信と表示のみ
//   - 操作を actions に push するだけ
//   - Firebase gameState を監視 → G に適用 → renderAll()
//   - ローカルシミュレーション一切なし
//
// Firebase構造:
//   rooms/{roomId}/
//     host/guest  : デッキ・準備状態
//     actions/    : Guestの操作キュー（Hostが処理・削除）
//     gameState   : HostがシリアライズしたG（Guestが読む）

const firebaseConfig = {
  apiKey: "AIzaSyAgq6dOapRkf9-NGL0V5Ib7X212I1P1VVE",
  authDomain: "bouzumekuri-online.firebaseapp.com",
  databaseURL: "https://bouzumekuri-online-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "bouzumekuri-online",
  storageBucket: "bouzumekuri-online.firebasestorage.app",
  messagingSenderId: "703927927532",
  appId: "1:703927927532:web:af9c273d1064e9b5b4dbc9"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const Online = {
  roomId: null,
  myRole: null,        // 'host' | 'guest'
  myName: null,
  opponentName: null,
  isFirstPlayer: false,
  listeners: [],
  processingAction: false,
};

// ===== UID生成 =====
let _uidCounter = 0;
function genUid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `uid-${Date.now()}-${++_uidCounter}-${Math.floor(Math.random() * 1e9)}`;
}

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function setLobbyStatus(msg, color = 'var(--text)') {
  const el = document.getElementById('lobby-status');
  if (el) { el.textContent = msg; el.style.color = color; }
}

// ===== ルーム作成 =====
async function createRoom() {
  const name = document.getElementById('lobby-name-input')?.value.trim();
  if (!name) { setLobbyStatus('名前を入力してください', 'var(--red)'); return; }

  const roomId = generateRoomId();
  Online.roomId = roomId;
  Online.myRole = 'host';
  Online.myName = name;

  const roomRef = db.ref(`rooms/${roomId}`);
  await roomRef.set({
    host: { name, ready: false, mulliganDone: false },
    guest: null,
    status: 'waiting',
    createdAt: firebase.database.ServerValue.TIMESTAMP,
  });
  roomRef.onDisconnect().remove();

  setLobbyStatus(`ルームID: ${roomId}　相手を待っています...`, 'var(--accent)');
  document.getElementById('lobby-room-id-display').textContent = roomId;
  document.getElementById('lobby-room-id-wrap').style.display = 'block';
  document.getElementById('btn-create-room').disabled = true;
  document.getElementById('btn-join-room').disabled = true;

  waitForGuest(roomId);
}

// ===== ルーム参加 =====
async function joinRoom() {
  const name = document.getElementById('lobby-name-input')?.value.trim();
  const roomId = document.getElementById('lobby-room-id-input')?.value.trim().toUpperCase();

  if (!name) { setLobbyStatus('名前を入力してください', 'var(--red)'); return; }
  if (!roomId) { setLobbyStatus('ルームIDを入力してください', 'var(--red)'); return; }

  const snapshot = await db.ref(`rooms/${roomId}`).once('value');
  const room = snapshot.val();

  if (!room)                     { setLobbyStatus('ルームが見つかりません', 'var(--red)'); return; }
  if (room.status !== 'waiting') { setLobbyStatus('このルームはすでに対戦中です', 'var(--red)'); return; }
  if (room.guest)                { setLobbyStatus('ルームが満員です', 'var(--red)'); return; }

  Online.roomId = roomId;
  Online.myRole = 'guest';
  Online.myName = name;
  Online.opponentName = room.host.name;

  await db.ref(`rooms/${roomId}`).update({
    guest: { name, ready: false, mulliganDone: false },
    status: 'matched',
  });
  db.ref(`rooms/${roomId}/guest`).onDisconnect().remove();
  db.ref(`rooms/${roomId}/status`).onDisconnect().set('waiting');

  setLobbyStatus(`${room.host.name} のルームに参加しました！`, 'var(--green)');
  document.getElementById('btn-create-room').disabled = true;
  document.getElementById('btn-join-room').disabled = true;

  onMatched();
}

// ===== ゲストを待つ（ホスト側）=====
function waitForGuest(roomId) {
  const ref = db.ref(`rooms/${roomId}/status`);
  const listener = ref.on('value', (snap) => {
    if (snap.val() === 'matched') {
      ref.off('value', listener);
      db.ref(`rooms/${roomId}/guest/name`).once('value').then(s => {
        Online.opponentName = s.val();
        onMatched();
      });
    }
  });
}

// ===== マッチング完了 =====
function onMatched() {
  setLobbyStatus(`対戦相手: ${Online.opponentName}　デッキを構築してください`, 'var(--gold)');
  setTimeout(() => showScreen('deck'), 1200);
}

// ===== デッキ・シジル確定 =====
async function onlineReadyToStart(heroId) {
  if (!Online.roomId) return;
  await db.ref(`rooms/${Online.roomId}/${Online.myRole}`).update({
    ready: true,
    heroId: heroId,
    deck: playerDeck.map(c => c.id),
  });
  waitForBothReady();
}

// ===== 両者の ready 待ち =====
function waitForBothReady() {
  setLobbyStatus('相手のデッキ準備を待っています...', 'var(--accent)');
  showScreen('lobby');

  const ref = db.ref(`rooms/${Online.roomId}`);
  const listener = ref.on('value', (snap) => {
    const room = snap.val();
    if (!room) return;
    if (room.host?.ready && room.guest?.ready) {
      ref.off('value', listener);
      startOnlineGame(room);
    }
  });
}

// ===== ゲーム開始 =====
function startOnlineGame(room) {
  const opponentRole  = Online.myRole === 'host' ? 'guest' : 'host';
  const myData        = room[Online.myRole];
  const opponentData  = room[opponentRole];

  Online.isFirstPlayer = (Online.myRole === 'host');

  const mySigil       = SIGIL_LIST.find(s => s.id === myData.heroId)      || SIGIL_LIST[0];
  const opponentSigil = SIGIL_LIST.find(s => s.id === opponentData.heroId) || SIGIL_LIST[0];
  selectedSigil = mySigil;

  const buildDeck = (idList) =>
    idList
      .map(id => ALL_CARDS.find(c => c.id === id))
      .filter(Boolean)
      .map(c => ({...c, uid: genUid()}));

  const myDeckCards  = buildDeck(myData.deck);
  const oppDeckCards = buildDeck(opponentData.deck);

  const makePl = (sigil, deckCards) => ({
    hp: 25, maxHp: 25, mana: 0, maxMana: 0,
    deck: [...deckCards].sort(() => Math.random() - 0.5),
    hand: [], field: [],
    sigil: {...sigil},
    sigilUseCount: 0, sigilMaxUse: 1, sigilDiscount: 0, deckOutCount: 0,
    sotListeners: [], eotListeners: [], oppEotListeners: [], oppSotListeners: [],
    oppSummonListeners: [], spellListeners: [], oppSpellListeners: [],
    healListeners: [], damagedListeners: [], unitDamagedListeners: [],
    attackListeners: [], hpZeroListeners: [],
  });

  G = {
    turn: 1,
    isPlayerTurn: Online.isFirstPlayer,
    playerFirst: Online.isFirstPlayer,
    onlineMode: true,
    aiDifficulty: null, aiMemory: null, aiSkipCards: new Set(),
    player: makePl(mySigil, myDeckCards),
    enemy:  makePl(opponentSigil, oppDeckCards),
    selectedCard: null, phase: 'main', targetingMode: null,
    multiTargetStore: null, gameOver: false, aiThinking: false,
    discardMode: false, log: [],
    mulliganRemain: 3, mulliganSelected: new Set(),
  };

  for (let i = 0; i < 3; i++) drawCard(G.player);
  for (let i = 0; i < 3; i++) drawCard(G.enemy);

  if (Online.myRole === 'host') {
    listenGuestActions();
  } else {
    listenGameState();
  }

  showScreen('game');
  showMulliganModal();
}

// ===== マリガン完了 =====
async function onlineMulliganDone() {
  if (!Online.roomId) return;

  await db.ref(`rooms/${Online.roomId}/${Online.myRole}/mulliganDone`).set(true);

  const statusEl = document.getElementById('ctrl-status');
  if (statusEl) statusEl.textContent = '相手のマリガン待ち...';
  document.getElementById('btn-end-turn').disabled = true;

  const ref = db.ref(`rooms/${Online.roomId}`);
  const listener = ref.on('value', (snap) => {
    const room = snap.val();
    if (!room) return;
    if (room.host?.mulliganDone && room.guest?.mulliganDone) {
      ref.off('value', listener);
      onBothMulliganDone();
    }
  });
}

// ===== 両者マリガン完了 =====
function onBothMulliganDone() {
  document.getElementById('btn-surrender').style.display = 'block';
  addLog('🌐 オンライン対戦開始！', 'system');
  addLog(`あなた: ${Online.myName}　相手: ${Online.opponentName}`, 'system');
  addLog(Online.isFirstPlayer ? 'あなたが先攻です' : '相手が先攻です', 'system');

  if (Online.myRole === 'host') {
    hostPushState();
    startTurn();
  }
  // GuestはgameState更新を待つ
}

// ========================================================
// ===== HOST SIDE =========================================
// ========================================================

function hostPushState() {
  if (Online.myRole !== 'host' || !Online.roomId) return;
  db.ref(`rooms/${Online.roomId}/gameState`).set(serializeG());
}

function serializeG() {
  const serCard = (c) => ({
    id: c.id, uid: c.uid, name: c.name,
    type: c.type, cost: c.cost,
    atk: c.atk,  hp: c.hp,
    keyword: c.keyword || '', trigger: c.trigger || '', effect: c.effect || '',
    currentAtk: c.currentAtk, currentHp: c.currentHp,
    sleeping: c.sleeping, hasAttacked: c.hasAttacked,
    shieldBroken: c.shieldBroken || false,
    aiRole: c.aiRole || '',
  });

  const serPl = (pl) => ({
    hp: pl.hp, maxHp: pl.maxHp,
    mana: pl.mana, maxMana: pl.maxMana,
    deckOutCount: pl.deckOutCount || 0,
    sigilUseCount: pl.sigilUseCount,
    sigilMaxUse: pl.sigilMaxUse,
    sigilDiscount: pl.sigilDiscount || 0,
    sigil: pl.sigil,
    deck:  pl.deck.map(serCard),
    hand:  pl.hand.map(serCard),
    field: pl.field.map(serCard),
  });

  return {
    turn: G.turn,
    isPlayerTurn: G.isPlayerTurn, // true = Hostのターン
    playerFirst: G.playerFirst,
    phase: G.phase,
    gameOver: G.gameOver,
    log: G.log.slice(-80),
    hostPlayer: serPl(G.player),
    hostEnemy:  serPl(G.enemy),
  };
}

// GuestのアクションをHostのGに適用
function listenGuestActions() {
  const ref = db.ref(`rooms/${Online.roomId}/actions`);
  const listener = ref.on('child_added', (snap) => {
    if (Online.processingAction) return;
    const action = snap.val();
    if (!action || action.role !== 'guest') return;

    Online.processingAction = true;
    applyGuestAction(action);
    snap.ref.remove();
    Online.processingAction = false;
  });
  Online.listeners.push({ ref, listener, event: 'child_added' });
}

function applyGuestAction(action) {
  if (G.gameOver) return;

  switch (action.type) {
    case 'end-turn':  hostApplyEndTurn();            break;
    case 'play-card': hostApplyPlayCard(action);      break;
    case 'attack':    hostApplyAttack(action);        break;
    case 'use-sigil': hostApplySigil(action);         break;
    case 'game-over': onOpponentSurrender();           break;
    default: console.warn('未知のGuestアクション:', action.type);
  }

  hostPushState();
  if (!G.gameOver) renderAll();
}

function hostApplyEndTurn() {
  triggerEndOfTurn(G.enemy);
  triggerOppEndOfTurn(G.player);
  cleanDeadUnits();
  checkHp(G.player); checkHp(G.enemy);
  if (G.gameOver) { hostPushState(); return; }

  G.selectedCard = null;
  G.phase = 'main';
  G.isPlayerTurn = true;
  G.turn++;
  // startTurnはapplyGuestAction呼び出し後にhostPushState→renderAllが走る
  // ただしstartTurnのドロー・マナ処理はここで実行
  const pl = G.player; // Hostのターンへ
  pl.maxMana = Math.min(10, pl.maxMana + 1);
  pl.mana = pl.maxMana;
  pl.sigilUseCount = 0;
  const isFirstTurn = G.playerFirst && G.turn === 1;
  if (!isFirstTurn) drawCard(pl);
  pl.field.forEach(c => { c.hasAttacked = false; });
  triggerStartOfTurn(pl);
  triggerOppStartOfTurn(G.enemy);
  addLog('--- あなたのターン ' + G.turn + ' ---', 'important');
  document.getElementById('btn-end-turn').disabled = false;
}

// Guest視点のindexをHost視点に変換してカードプレイ
// action: { handIdx, targetType?, targetSide?, targetIdx?, targetIdxs? }
function hostApplyPlayCard(action) {
  const handIdx = action.handIdx;
  if (handIdx == null || !G.enemy.hand[handIdx]) {
    addLog(`[Host] Guestカードプレイ失敗: handIdx=${handIdx}`, 'damage');
    return;
  }
  const target = hostResolveTarget(action);
  executePlayCard(G.enemy, handIdx, target);
}

// action: { attackerIdx, targetType, targetIdx? }
function hostApplyAttack(action) {
  const attacker = G.enemy.field[action.attackerIdx];
  if (!attacker) {
    addLog(`[Host] Guest攻撃解決失敗: attackerIdx=${action.attackerIdx}`, 'damage');
    return;
  }

  let target = null;
  if (action.targetType === 'face') {
    target = { type: 'face' };
  } else if (action.targetType === 'unit') {
    const card = G.player.field[action.targetIdx];
    if (card) target = { type: 'unit', card };
  }
  if (!target) return;

  executeAttack(G.enemy, attacker, G.player, target);
  cleanDeadUnits();
  checkHp(G.player); checkHp(G.enemy);
}

function hostApplySigil(action) {
  const target = hostResolveTarget(action);
  applyRemoteSigilEffect(G.enemy, target, action.sigilId);
}

// GuestはHostと逆視点なのでplayer↔enemyを反転して解決
function hostResolveTarget(action) {
  if (!action.targetType) return null;

  // Host視点: Guestの「自分フィールド」= G.enemy、「相手フィールド」= G.player
  const guestSelf = G.enemy.field;
  const guestOpp  = G.player.field;

  switch (action.targetType) {
    case 'face':      return { type: 'face' };
    case 'ally-face': return { type: 'ally', isAlly: true };
    case 'unit': {
      const side = action.targetSide === 'player' ? guestSelf : guestOpp;
      const card = side[action.targetIdx];
      if (!card) return null;
      return { type: 'unit', card, isAlly: guestSelf.includes(card) };
    }
    case 'shrine': {
      const side = action.targetSide === 'player' ? guestSelf : guestOpp;
      const card = side[action.targetIdx];
      return card ? { type: 'shrine', card } : null;
    }
    case 'multi': {
      const targets = (action.targetIdxs || []).map(t => {
        const side = t.side === 'player' ? guestSelf : guestOpp;
        const card = side[t.idx];
        return card ? { type: 'unit', card } : null;
      }).filter(Boolean);
      return { type: 'multi', targets };
    }
    default: return null;
  }
}

// ========================================================
// ===== GUEST SIDE ========================================
// ========================================================

function listenGameState() {
  const ref = db.ref(`rooms/${Online.roomId}/gameState`);
  const listener = ref.on('value', (snap) => {
    const state = snap.val();
    if (!state) return;
    applyGameState(state);
  });
  Online.listeners.push({ ref, listener, event: 'value' });
}

// GuestのGをHostのgameStateで更新
// Guest視点: 自分 = hostEnemy、相手 = hostPlayer
function applyGameState(state) {
  if (!G || !G.onlineMode) return;

  const restoreCard = (data) => ({
    id: data.id, uid: data.uid, name: data.name,
    type: data.type, cost: data.cost,
    atk: data.atk, hp: data.hp,
    keyword: data.keyword || '', trigger: data.trigger || '', effect: data.effect || '',
    currentAtk: data.currentAtk, currentHp: data.currentHp,
    sleeping: data.sleeping, hasAttacked: data.hasAttacked,
    shieldBroken: data.shieldBroken || false,
    aiRole: data.aiRole || '',
    tempBuffs: [],
  });

  const applyPl = (pl, data) => {
    pl.hp            = data.hp;
    pl.maxHp         = data.maxHp;
    pl.mana          = data.mana;
    pl.maxMana       = data.maxMana;
    pl.deckOutCount  = data.deckOutCount || 0;
    pl.sigilUseCount = data.sigilUseCount;
    pl.sigilMaxUse   = data.sigilMaxUse;
    pl.sigilDiscount = data.sigilDiscount || 0;
    pl.sigil         = data.sigil;
    pl.deck  = data.deck.map(restoreCard);
    pl.hand  = data.hand.map(restoreCard);
    pl.field = data.field.map(restoreCard);
  };

  // Guest視点では自分=hostEnemy、相手=hostPlayer
  applyPl(G.player, state.hostEnemy);
  applyPl(G.enemy,  state.hostPlayer);

  const prevIsMyTurn = G.isPlayerTurn;

  G.turn         = state.turn;
  G.isPlayerTurn = !state.isPlayerTurn; // Hostのターンフラグを反転
  G.playerFirst  = !state.playerFirst;
  G.phase        = state.phase;
  G.gameOver     = state.gameOver;

  // ログ同期
  if (state.log) {
    G.log = state.log;
    syncLogDisplay();
  }

  if (G.gameOver) {
    // hostPlayerのhpが0 = Guestの勝ち / hostEnemyのhpが0 = Guestの負け
    const guestWon = state.hostPlayer.hp <= 0;
    showGameEnd(guestWon);
    return;
  }

  const myTurnNow = G.isPlayerTurn;
  document.getElementById('btn-end-turn').disabled = !myTurnNow;

  // 自分のターンが来たらログに表示
  if (myTurnNow && !prevIsMyTurn) {
    addLog('--- あなたのターン ' + G.turn + ' ---', 'important');
  } else if (!myTurnNow && prevIsMyTurn) {
    addLog('--- 相手のターン ' + G.turn + ' ---', 'important');
  }

  renderAll();
}

function syncLogDisplay() {
  const logEl    = document.getElementById('game-log');
  const drawerEl = document.getElementById('log-drawer-body');
  if (!logEl && !drawerEl) return;
  if (logEl)    logEl.innerHTML    = '';
  if (drawerEl) drawerEl.innerHTML = '';
  (G.log || []).forEach(entry => {
    const div = document.createElement('div');
    div.className = 'log-entry' + (entry.cls ? ` log-${entry.cls}` : '');
    div.textContent = entry.text;
    if (logEl)    logEl.appendChild(div.cloneNode(true));
    if (drawerEl) drawerEl.appendChild(div);
  });
  if (logEl)    logEl.scrollTop    = logEl.scrollHeight;
  if (drawerEl) drawerEl.scrollTop = drawerEl.scrollHeight;
}

// ========================================================
// ===== sendAction（core.jsから呼ばれる共通インターフェース）
// ========================================================
// core.jsのexecutePlayCard・playerAttackTarget・executeSigilから呼ばれる
// Hostは不要（自分のG適用後にhostPushStateを呼ぶだけ）
// Guestはactionsにpush

async function sendAction(actionObj) {
  if (!Online.roomId) return;

  if (Online.myRole === 'host') {
    // Host自身の操作はcore.js側でG適用済み → pushするだけ
    hostPushState();
  } else {
    // Guest: Firebaseに送信
    await db.ref(`rooms/${Online.roomId}/actions`).push({
      role: 'guest',
      ...actionObj,
    });
  }
}

// ===== ターン終了（ui.jsまたはdcg.htmlのbtn-end-turnから呼ばれる）=====
function playerEndTurnOnline() {
  if (!G.isPlayerTurn || G.gameOver) return;

  triggerEndOfTurn(G.player);
  triggerOppEndOfTurn(G.enemy);
  cleanDeadUnits();
  checkHp(G.player); checkHp(G.enemy);
  if (G.gameOver) {
    if (Online.myRole === 'host') hostPushState();
    return;
  }

  G.selectedCard = null;
  G.phase = 'main';
  G.isPlayerTurn = false;
  G.turn++;

  if (Online.myRole === 'host') {
    // Hostターン終了: Guestのターン開始状態をpush → 待機
    addLog('--- 相手のターン ' + G.turn + ' ---', 'important');
    document.getElementById('btn-end-turn').disabled = true;
    hostPushState();
    renderAll();
  } else {
    // Guest: end-turnをHostに送信
    db.ref(`rooms/${Online.roomId}/actions`).push({ role: 'guest', type: 'end-turn' });
    document.getElementById('btn-end-turn').disabled = true;
    renderAll();
  }
}

// ========================================================
// ===== 共通 ==============================================
// ========================================================

function applyRemoteSigilEffect(pl, target, sigilId) {
  const opp = pl === G.player ? G.enemy : G.player;
  const cost = Math.max(0, 2 - (pl.sigilDiscount || 0));
  pl.mana -= cost;
  pl.sigilUseCount++;

  switch (sigilId) {
    case 'burn':
      if (target?.type === 'unit' && target.card) dealDamageToUnit(target.card, 1);
      else dealDamage(opp, 1);
      addLog('相手シジル：焦熱', 'damage'); break;
    case 'mid':
      spawnToken(pl, {id:'tok_mid', name:'フェアリー', type:'ユニット', cost:0, atk:1, hp:1, keyword:'', trigger:'', effect:''});
      addLog('相手シジル：召喚', 'important'); break;
    case 'draw':
      drawCard(pl);
      addLog('相手シジル：叡智', 'important'); break;
    case 'heal':
      if (target?.card && target.isAlly) {
        target.card.currentHp = Math.min(target.card.hp, target.card.currentHp + 2);
      } else {
        applyHeal(pl, 2, null);
      }
      addLog('相手シジル：治癒', 'heal'); break;
    case 'buff':
      if (target?.card) target.card.currentAtk++;
      addLog('相手シジル：鼓舞', 'heal'); break;
    case 'debuff':
      if (target?.card) applyDebuffToUnit(target.card, -1, 0);
      addLog('相手シジル：衰弱', 'damage'); break;
  }

  cleanDeadUnits();
  checkHp(G.player); checkHp(G.enemy);
}

// ゲーム終了表示（playerWon: true=自分の勝ち）
function showGameEnd(playerWon) {
  G.gameOver = true;
  cleanupOnline();
  const overlay = document.getElementById('game-overlay');
  const title   = document.getElementById('overlay-title');
  if (!overlay || !title) return;
  title.textContent = playerWon ? 'VICTORY' : 'DEFEAT';
  title.className   = playerWon ? 'win' : 'lose';
  overlay.classList.add('active');
  addLog(playerWon ? '勝利！' : '敗北...', 'important');
}

function onOpponentSurrender() {
  addLog('相手が投了しました', 'system');
  showGameEnd(true);
}

async function surrender() {
  if (!Online.roomId) return;
  if (Online.myRole === 'host') {
    G.gameOver = true;
    hostPushState();
    showGameEnd(false);
  } else {
    await db.ref(`rooms/${Online.roomId}/actions`).push({ role: 'guest', type: 'game-over' });
    showGameEnd(false);
  }
}

function cleanupOnline() {
  Online.listeners.forEach(({ ref, listener, event }) => ref.off(event, listener));
  Online.listeners = [];
  if (Online.myRole === 'host' && Online.roomId) {
    db.ref(`rooms/${Online.roomId}`).remove();
  }
  const btn = document.getElementById('btn-surrender');
  if (btn) btn.style.display = 'none';
  Object.assign(Online, {
    roomId: null, myRole: null, myName: null, opponentName: null,
    isFirstPlayer: false, isReady: false, processingAction: false,
  });
}
