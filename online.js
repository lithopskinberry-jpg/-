// ===== online.js =====
// Firebase Realtime Database を使ったオンライン対戦管理

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
  myRole: null,
  myName: null,
  opponentName: null,
  opponentHeroId: null,
  opponentDeck: [],
  isFirstPlayer: false,
  isReady: false,
  listeners: [],
};

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

  if (!room)                    { setLobbyStatus('ルームが見つかりません', 'var(--red)'); return; }
  if (room.status !== 'waiting'){ setLobbyStatus('このルームはすでに対戦中です', 'var(--red)'); return; }
  if (room.guest)               { setLobbyStatus('ルームが満員です', 'var(--red)'); return; }

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

// ===== ゲストを待つ（ホスト側） =====
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

// ===== マッチング完了 → デッキ構築画面へ =====
function onMatched() {
  setLobbyStatus(`対戦相手: ${Online.opponentName}　デッキを構築してください`, 'var(--gold)');
  setTimeout(() => showScreen('deck'), 1200);
}

// ===== デッキ・シジル確定 → DBに書き込み、相手の準備を待つ =====
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

// ===== ゲーム状態構築 → マリガンへ =====
function startOnlineGame(room) {
  const opponentRole = Online.myRole === 'host' ? 'guest' : 'host';
  const myData = room[Online.myRole];
  const opponentData = room[opponentRole];

  Online.opponentHeroId = opponentData.heroId;
  Online.opponentDeck = opponentData.deck;
  Online.isFirstPlayer = (Online.myRole === 'host'); // ホストが先攻

  // シジルを解決
  const mySigil      = SIGIL_LIST.find(s => s.id === myData.heroId)      || SIGIL_LIST[0];
  const opponentSigil = SIGIL_LIST.find(s => s.id === opponentData.heroId) || SIGIL_LIST[0];
  selectedSigil = mySigil;

  // 相手デッキをカードオブジェクトに変換
  const opponentDeckCards = Online.opponentDeck
    .map(id => ALL_CARDS.find(c => c.id === id))
    .filter(Boolean)
    .map(c => ({...c, uid: Math.random()}));

  // ===== G を構築 =====
  const makePl = (sigil, deckCards) => ({
    hp: 25, maxHp: 25, mana: 0, maxMana: 0,
    deck: makeDeck(deckCards),
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
    player: makePl(mySigil, playerDeck),
    enemy:  makePl(opponentSigil, opponentDeckCards),
    selectedCard: null, phase: 'main', targetingMode: null,
    multiTargetStore: null, gameOver: false, aiThinking: false,
    discardMode: false, log: [],
  };

  // 初期ドロー（3枚）
  for (let i = 0; i < 3; i++) drawCard(G.player);
  for (let i = 0; i < 3; i++) drawCard(G.enemy);

  // 相手アクション受信リスナーを開始
  listenOpponentActions();

  // マリガンへ
  showScreen('game');
  showMulliganModal();
}

// ===== マリガン完了（core.jsのendMulligan末尾から呼ぶ） =====
async function onlineMulliganDone() {
  if (!Online.roomId) return;

  await db.ref(`rooms/${Online.roomId}/${Online.myRole}/mulliganDone`).set(true);

  // UIを「待機中」にする
  const statusEl = document.getElementById('ctrl-status');
  if (statusEl) statusEl.textContent = '相手のマリガン待ち...';
  document.getElementById('btn-end-turn').disabled = true;

  // 両者の mulliganDone を監視
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

// ===== 両者マリガン完了 → ゲーム本開始 =====
function onBothMulliganDone() {
  // 投了ボタンを表示（オンライン対戦中のみ）
  document.getElementById('btn-surrender').style.display = 'block';
  addLog('🌐 オンライン対戦開始！', 'system');
  addLog(`あなた: ${Online.myName}　相手: ${Online.opponentName}`, 'system');
  addLog(Online.isFirstPlayer ? 'あなたが先攻です' : '相手が先攻です', 'system');
  startTurn();
}

// ===== 自分の操作を送信 =====
async function sendAction(actionObj) {
  if (!Online.roomId) return;
  await db.ref(`rooms/${Online.roomId}/actions`).push({
    role: Online.myRole,
    ...actionObj,
    timestamp: firebase.database.ServerValue.TIMESTAMP,
  });
}

// ===== 相手の操作を受信 =====
function listenOpponentActions() {
  const opponentRole = Online.myRole === 'host' ? 'guest' : 'host';
  const ref = db.ref(`rooms/${Online.roomId}/actions`);
  const startedAt = Date.now();

  const listener = ref.on('child_added', (snap) => {
    const action = snap.val();
    if (action.role !== opponentRole) return;
    if (action.timestamp && action.timestamp < startedAt) return;
    applyOpponentAction(action);
  });
  Online.listeners.push({ ref, listener, event: 'child_added' });
}

// ===== 受信アクションをゲームに反映 =====
function applyOpponentAction(action) {
  if (G.gameOver) return;
  switch (action.type) {
    case 'end-turn':   applyRemoteEndTurn();        break;
    case 'play-card':  applyRemotePlayCard(action);  break;
    case 'attack':     applyRemoteAttack(action);    break;
    case 'use-sigil':  applyRemoteSigil(action);     break;
    case 'game-over':  onOpponentSurrender();         break;
    default: console.warn('未知のアクション:', action.type);
  }
}

// ===== リモート：ターン終了 =====
function applyRemoteEndTurn() {
  if (G.gameOver) return;
  triggerEndOfTurn(G.enemy);
  triggerOppEndOfTurn(G.player);
  cleanDeadUnits();
  checkHp(G.player); checkHp(G.enemy);
  if (G.gameOver) return;

  G.selectedCard = null;
  G.phase = 'main';
  G.isPlayerTurn = true;
  G.turn++;
  renderAll();
  startTurn();
}

// ===== リモート：カードプレイ =====
function applyRemotePlayCard(action) {
  const handIdx = G.enemy.hand.findIndex(c => c.id === action.cardId);
  if (handIdx === -1) {
    addLog(`[同期エラー] 相手の手札に ${action.cardId} が見つかりません`, 'damage');
    return;
  }

  let target = resolveRemoteTarget(action);
  executePlayCard(G.enemy, handIdx, target);
  renderAll();
}

// ===== リモート：攻撃 =====
function applyRemoteAttack(action) {
  const attacker = G.enemy.field.find(c => c.uid === action.attackerUid);
  if (!attacker) { addLog('[同期エラー] 攻撃者が見つかりません', 'damage'); return; }

  let target = null;
  if (action.targetType === 'face') {
    target = { type: 'face' };
  } else if (action.targetType === 'unit') {
    const card = G.player.field.find(c => c.uid === action.targetUid);
    if (card) target = { type: 'unit', card };
  }
  if (!target) return;

  animAttack(attacker, false).then(() => {
    executeAttack(G.enemy, attacker, G.player, target);
    const dmg = target.type === 'unit'
      ? [animDamage(target.card), animDamage(attacker)]
      : [animFaceDamage(true)];
    return Promise.all(dmg);
  }).then(() => {
    cleanDeadUnits();
    checkHp(G.player); checkHp(G.enemy);
    if (!G.gameOver) renderAll();
  });
}

// ===== リモート：シジル使用 =====
function applyRemoteSigil(action) {
  const target = resolveRemoteTarget(action);
  applyRemoteSigilEffect(G.enemy, target, action.sigilId);
  renderAll();
}

function applyRemoteSigilEffect(pl, target, sigilId) {
  const opp = G.player;
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

// ===== ターゲット情報を uid から実オブジェクトに復元 =====
function resolveRemoteTarget(action) {
  if (!action.targetType) return null;

  const findByUid = (uid) =>
    G.player.field.find(c => c.uid === uid) ||
    G.enemy.field.find(c => c.uid === uid);

  switch (action.targetType) {
    case 'face':
      return { type: 'face' };
    case 'ally-face':
      return { type: 'ally', isAlly: true };
    case 'unit': {
      const card = findByUid(action.targetUid);
      if (!card) return null;
      const isAlly = G.enemy.field.includes(card);
      return { type: 'unit', card, isAlly };
    }
    case 'shrine': {
      const card = findByUid(action.targetUid);
      return card ? { type: 'shrine', card } : null;
    }
    case 'multi': {
      const targets = (action.targetUids || [])
        .map(uid => { const card = findByUid(uid); return card ? { type: 'unit', card } : null; })
        .filter(Boolean);
      return { type: 'multi', targets };
    }
    default: return null;
  }
}

// ===== 相手が投了 =====
function onOpponentSurrender() {
  addLog('相手が投了しました', 'system');
  endGame('player');
}

// ===== 自分が投了 =====
async function surrender() {
  if (!Online.roomId) return;
  await sendAction({ type: 'game-over' });
  endGame('enemy');
}

// ===== 後片付け =====
function cleanupOnline() {
  Online.listeners.forEach(({ ref, listener, event }) => ref.off(event, listener));
  Online.listeners = [];
  if (Online.myRole === 'host' && Online.roomId) db.ref(`rooms/${Online.roomId}`).remove();
  // 投了ボタンを非表示に戻す
  const btn = document.getElementById('btn-surrender');
  if (btn) btn.style.display = 'none';
  Object.assign(Online, {
    roomId: null, myRole: null, myName: null, opponentName: null,
    opponentHeroId: null, opponentDeck: [], isFirstPlayer: false, isReady: false,
  });
}
