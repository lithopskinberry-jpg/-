// ===== online.js =====
// Firebase Realtime Database を使ったオンライン対戦管理

// ========================================
// ★ここにFirebaseの設定を貼り付けてください★
// ========================================
const firebaseConfig = {
    apiKey: "AIzaSyAgq6dOapRkf9-NGL0V5Ib7X212I1P1VVE",
    authDomain: "bouzumekuri-online.firebaseapp.com",
    databaseURL: "https://bouzumekuri-online-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "bouzumekuri-online",
    storageBucket: "bouzumekuri-online.firebasestorage.app",
    messagingSenderId: "703927927532",
    appId: "1:703927927532:web:af9c273d1064e9b5b4dbc9"
  };

// ========================================

// Firebase初期化
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ===== オンライン対戦の状態 =====
const Online = {
  roomId: null,       // 現在のルームID
  myRole: null,       // 'host' or 'guest'
  myName: null,       // プレイヤー名
  opponentName: null, // 相手の名前
  isReady: false,     // 自分の準備完了フラグ
  listeners: [],      // 後でオフにするリスナーをまとめて管理
};

// ===== ユーティリティ =====

// ランダムな6文字のルームIDを生成
function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// ロビー画面のステータスメッセージを更新
function setLobbyStatus(msg, color = 'var(--text)') {
  const el = document.getElementById('lobby-status');
  if (el) { el.textContent = msg; el.style.color = color; }
}

// ===== ルーム作成 =====
async function createRoom() {
  const nameInput = document.getElementById('lobby-name-input');
  const name = nameInput ? nameInput.value.trim() : '';
  if (!name) { setLobbyStatus('名前を入力してください', 'var(--red)'); return; }

  const roomId = generateRoomId();
  Online.roomId = roomId;
  Online.myRole = 'host';
  Online.myName = name;

  const roomRef = db.ref(`rooms/${roomId}`);
  await roomRef.set({
    host: { name, ready: false },
    guest: null,
    status: 'waiting',  // waiting → matched → playing → finished
    createdAt: firebase.database.ServerValue.TIMESTAMP,
  });

  // 切断時に自動でルームを削除
  roomRef.onDisconnect().remove();

  setLobbyStatus(`ルームID: ${roomId}　相手を待っています...`, 'var(--accent)');
  document.getElementById('lobby-room-id-display').textContent = roomId;
  document.getElementById('lobby-room-id-wrap').style.display = 'block';
  document.getElementById('btn-create-room').disabled = true;
  document.getElementById('btn-join-room').disabled = true;

  // ゲストが入室するのを待つ
  waitForGuest(roomId);
}

// ===== ルーム参加 =====
async function joinRoom() {
  const nameInput = document.getElementById('lobby-name-input');
  const roomInput = document.getElementById('lobby-room-id-input');
  const name = nameInput ? nameInput.value.trim() : '';
  const roomId = roomInput ? roomInput.value.trim().toUpperCase() : '';

  if (!name) { setLobbyStatus('名前を入力してください', 'var(--red)'); return; }
  if (!roomId) { setLobbyStatus('ルームIDを入力してください', 'var(--red)'); return; }

  const roomRef = db.ref(`rooms/${roomId}`);
  const snapshot = await roomRef.once('value');
  const room = snapshot.val();

  if (!room) { setLobbyStatus('ルームが見つかりません', 'var(--red)'); return; }
  if (room.status !== 'waiting') { setLobbyStatus('このルームはすでに対戦中です', 'var(--red)'); return; }
  if (room.guest) { setLobbyStatus('ルームが満員です', 'var(--red)'); return; }

  Online.roomId = roomId;
  Online.myRole = 'guest';
  Online.myName = name;
  Online.opponentName = room.host.name;

  await roomRef.update({
    guest: { name, ready: false },
    status: 'matched',
  });

  // 切断時にゲストをリセット
  db.ref(`rooms/${roomId}/guest`).onDisconnect().remove();
  db.ref(`rooms/${roomId}/status`).onDisconnect().set('waiting');

  setLobbyStatus(`${room.host.name} のルームに参加しました！`, 'var(--green)');
  document.getElementById('btn-create-room').disabled = true;
  document.getElementById('btn-join-room').disabled = true;

  // マッチング完了 → デッキ選択へ
  onMatched();
}

// ===== ゲストを待つ（ホスト側） =====
function waitForGuest(roomId) {
  const ref = db.ref(`rooms/${roomId}/status`);
  const listener = ref.on('value', (snap) => {
    if (snap.val() === 'matched') {
      db.ref(`rooms/${roomId}/guest/name`).once('value').then(s => {
        Online.opponentName = s.val();
        ref.off('value', listener);
        onMatched();
      });
    }
  });
}

// ===== マッチング完了 → デッキ選択画面へ =====
function onMatched() {
  setLobbyStatus(
    `対戦相手: ${Online.opponentName}　デッキを選んでください`,
    'var(--gold)'
  );
  // デッキ選択UIを表示
  document.getElementById('lobby-deck-select-wrap').style.display = 'block';
  refreshOnlineDeckSelect();
}

// ===== オンライン用デッキ選択セレクトボックスを更新 =====
function refreshOnlineDeckSelect() {
  const sel = document.getElementById('online-deck-select');
  if (!sel) return;
  const decks = storageLoadDecks();
  sel.innerHTML = '<option value="">── デッキを選択 ──</option>';
  Object.keys(decks).forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  });
}

// ===== デッキ確定 → ヒーロー選択へ =====
function confirmOnlineDeck() {
  const sel = document.getElementById('online-deck-select');
  const deckName = sel ? sel.value : '';
  if (!deckName) { setLobbyStatus('デッキを選んでください', 'var(--red)'); return; }

  const decks = storageLoadDecks();
  const ids = decks[deckName];
  if (!ids) return;

  // playerDeckにセット（既存のcore.jsと共有）
  playerDeck = [];
  ids.forEach(id => {
    const card = ALL_CARDS.find(c => c.id === id);
    if (card) playerDeck.push({...card, uid: Math.random()});
  });

  // ヒーロー選択画面へ（既存の流れを使う）
  // ヒーロー選択後に online_startGame() を呼ぶ
  Online.selectedDeckName = deckName;
  showScreen('hero');
  // ヒーロー選択画面に「オンライン対戦開始」ボタンを表示するフラグ
  Online.waitingHeroSelect = true;
}

// ===== ヒーロー選択完了 → ゲーム開始シグナルをDBに送る =====
async function onlineReadyToStart(heroId) {
  if (!Online.roomId) return;

  const role = Online.myRole; // 'host' or 'guest'
  await db.ref(`rooms/${Online.roomId}/${role}`).update({
    ready: true,
    heroId: heroId,
    deck: playerDeck.map(c => c.id),
  });

  setLobbyStatus('相手の準備を待っています...', 'var(--accent)');

  // 両者がreadyになったらゲーム開始
  waitForBothReady();
}

// ===== 両者のready待ち =====
function waitForBothReady() {
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

// ===== オンライン対戦ゲーム開始 =====
function startOnlineGame(room) {
  // 相手の情報を取得
  const opponentRole = Online.myRole === 'host' ? 'guest' : 'host';
  const opponentData = room[opponentRole];

  Online.opponentHeroId = opponentData.heroId;
  Online.opponentDeck = opponentData.deck;

  // ホストが先攻
  Online.isFirstPlayer = (Online.myRole === 'host');

  // ゲーム画面へ
  showScreen('game');

  // 既存のinitGame()を拡張したオンライン版を呼ぶ
  initOnlineGame();

  // 相手の操作を受信するリスナーを開始
  listenOpponentActions();
}

// ===== オンライン対戦用ゲーム初期化 =====
function initOnlineGame() {
  // 既存のinitGame()相当の処理をオンライン用に呼ぶ
  // selectedHero・playerDeckはすでにセット済み
  // enemyのheroId・deckはOnlineオブジェクトから取得
  const opponentHero = HEROES.find(h => h.id === Online.opponentHeroId) || HEROES[0];

  // 既存のinitGame()を呼び出しつつ、敵をAIではなく人間プレイヤーに設定
  initGame({ onlineMode: true, opponentHero, opponentDeck: Online.opponentDeck, isFirstPlayer: Online.isFirstPlayer });

  addLog('🌐 オンライン対戦開始！', 'system');
  addLog(`あなた: ${Online.myName}　相手: ${Online.opponentName}`, 'system');
  addLog(Online.isFirstPlayer ? 'あなたが先攻です' : '相手が先攻です', 'system');
}

// ===== 自分の操作をDBに送信 =====
async function sendAction(actionObj) {
  if (!Online.roomId) return;
  const ref = db.ref(`rooms/${Online.roomId}/actions`);
  await ref.push({
    role: Online.myRole,
    ...actionObj,
    timestamp: firebase.database.ServerValue.TIMESTAMP,
  });
}

// ===== 相手の操作を受信 =====
function listenOpponentActions() {
  const opponentRole = Online.myRole === 'host' ? 'guest' : 'host';
  const ref = db.ref(`rooms/${Online.roomId}/actions`);
  const listener = ref.on('child_added', (snap) => {
    const action = snap.val();
    if (action.role !== opponentRole) return; // 自分のアクションは無視
    applyOpponentAction(action);
  });
  Online.listeners.push({ ref, listener, event: 'child_added' });
}

// ===== 受信したアクションをゲームに反映 =====
function applyOpponentAction(action) {
  switch (action.type) {
    case 'end-turn':
      // 相手がターン終了 → 自分のターン開始
      startPlayerTurn();
      break;
    case 'play-card':
      // 相手がカードをプレイ
      applyRemotePlayCard(action);
      break;
    case 'attack':
      // 相手がアタック
      applyRemoteAttack(action);
      break;
    case 'use-sigil':
      // 相手がシジル使用
      applyRemoteSigil(action);
      break;
    case 'game-over':
      // 相手が敗北宣言
      onOpponentSurrender();
      break;
    default:
      console.warn('未知のアクション:', action.type);
  }
  renderAll();
}

// ===== リモートアクション適用（カードプレイ） =====
function applyRemotePlayCard(action) {
  // action.cardId, action.targetなどを使って敵側のゲーム状態を更新
  // ※ core.jsのplayCardRemote()と連携（次フェーズで実装）
  addLog(`相手が ${action.cardName} をプレイ`, 'enemy');
}

// ===== リモートアクション適用（攻撃） =====
function applyRemoteAttack(action) {
  // action.attackerUid, action.targetUid などを使う
  addLog(`相手がアタック`, 'enemy');
}

// ===== リモートアクション適用（シジル） =====
function applyRemoteSigil(action) {
  addLog(`相手がシジルを使用`, 'enemy');
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

// ===== ゲーム終了・後片付け =====
function cleanupOnline() {
  // 全リスナーを解除
  Online.listeners.forEach(({ ref, listener, event }) => {
    ref.off(event, listener);
  });
  Online.listeners = [];

  // ルームを削除（ホストのみ）
  if (Online.myRole === 'host' && Online.roomId) {
    db.ref(`rooms/${Online.roomId}`).remove();
  }

  // 状態リセット
  Online.roomId = null;
  Online.myRole = null;
  Online.myName = null;
  Online.opponentName = null;
  Online.isReady = false;
}
