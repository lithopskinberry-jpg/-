// ===== core.js =====
// ゲーム状態管理・デッキビルド・ゲーム進行・カードプレイ・戦闘・シジル

// ===== STATE =====
let selectedSigil = null;
let playerDeck = [];
let filterType = 'all';

let G = {}; // game state

// ===== HERO SELECT =====
function initHeroSelect() {
  const grid = document.getElementById('hero-grid');
  grid.innerHTML = '';
  SIGIL_LIST.forEach(h => {
    const el = document.createElement('div');
    el.className = 'hero-card';
    el.innerHTML = `<div class="hero-icon">${h.icon}</div><div class="hero-name">${h.name}</div><div class="hero-desc">${h.desc}</div>`;
    el.onclick = () => {
      document.querySelectorAll('.hero-card').forEach(x => x.classList.remove('selected'));
      el.classList.add('selected');
      selectedSigil = h;
      document.getElementById('btn-to-deck').disabled = false;
    };
    grid.appendChild(el);
  });
  document.getElementById('btn-to-deck').onclick = () => showScreen('deck');
}

// ===== DECK BUILD =====
function initDeckBuild() {
  playerDeck = [];
  renderFilterBar();
  renderCardPool();
  renderDeckList();
  updateDeckCount();
  renderSigilTabs();

  refreshSavedDeckSelect();
  document.getElementById('btn-auto-deck').onclick = autoDeck;
  document.getElementById('btn-start-game').onclick = startGame;
}

function renderSigilTabs() {
  const container = document.getElementById('sigil-tabs');
  if (!container) return;
  container.style.cssText = 'display:flex;gap:0.4rem;flex-wrap:wrap;';
  container.innerHTML = '';
  SIGIL_LIST.forEach(h => {
    const tab = document.createElement('button');
    tab.className = 'sigil-tab' + (selectedSigil && selectedSigil.id === h.id ? ' selected' : '');
    tab.textContent = `${h.icon} ${h.name}`;
    tab.title = h.desc;
    tab.onclick = () => {
      selectedSigil = h;
      document.querySelectorAll('.sigil-tab').forEach(t => t.classList.remove('selected'));
      tab.classList.add('selected');
      // ヒーロー選択画面の選択状態も同期
      document.querySelectorAll('.hero-card').forEach((el, i) => {
        el.classList.toggle('selected', SIGIL_LIST[i]?.id === h.id);
      });
    };
    container.appendChild(tab);
  });
}

function renderFilterBar() {
  const bar = document.getElementById('filter-bar');
  const types = ['all', 'ユニット', 'スペル', '陣地'];
  bar.innerHTML = '';
  types.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn' + (filterType === t ? ' active' : '');
    btn.textContent = t === 'all' ? '全て' : t;
    btn.onclick = () => { filterType = t; renderFilterBar(); renderCardPool(); };
    bar.appendChild(btn);
  });
}

// ===== DECK LIMIT HELPERS =====
const LEGEND_KEYWORD = '至高';
const LEGEND_MAX = 3;

function isLegend(card) {
  return card.keyword && card.keyword.includes(LEGEND_KEYWORD);
}

function legendCountInDeck() {
  return playerDeck.filter(c => isLegend(c)).length;
}

function canAddCard(card) {
  const countSame = playerDeck.filter(c => c.id === card.id).length;
  if (playerDeck.length >= 30) return false;
  if (isLegend(card)) {
    if (countSame >= 1) return false;
    if (legendCountInDeck() >= LEGEND_MAX) return false;
  } else {
    if (countSame >= 2) return false;
  }
  return true;
}

function renderCardPool() {
  const pool = document.getElementById('card-pool');
  pool.innerHTML = '';
  const cards = (filterType === 'all' ? ALL_CARDS : ALL_CARDS.filter(c => c.type === filterType))
    .slice().sort((a, b) => a.cost - b.cost);
  const legendTotal = legendCountInDeck();
  cards.forEach(card => {
    const count = playerDeck.filter(c => c.id === card.id).length;
    const legend = isLegend(card);
    const addable = canAddCard(card);
    const el = document.createElement('div');
    el.className = 'pool-card'
      + (count > 0 ? ' in-deck' : '')
      + (!addable ? ' maxed' : '')
      + (legend ? ' legend-card' : '');

    const badge = document.createElement('div');
    badge.className = 'pc-badge';
    badge.style.display = count > 0 ? 'flex' : 'none';
    badge.textContent = count;

    el.innerHTML = `
      <div class="pc-cost">${card.cost}</div>
      <div class="pc-name">${card.name}</div>
      <div class="pc-type">${card.type}</div>
      ${card.keyword ? `<div class="pc-keyword">${card.keyword}</div>` : ''}
      ${card.type === 'ユニット' ? `<div class="pc-stats">${card.atk}/${card.hp}</div>` : ''}
    `;
    el.insertBefore(badge, el.firstChild);

    el.onclick = () => {
      if (window.matchMedia('(pointer: coarse)').matches) {
        // タッチ：詳細表示（すでに同じカードの詳細表示中ならデッキに追加、別カードなら表示切替）
        const panel = document.getElementById('deck-card-detail-panel');
        // data-card-idで現在表示中のカードIDを追跡
        const currentId = panel.dataset.cardId;
        if (!panel.classList.contains('hidden') && currentId === card.id) {
          if (!canAddCard(card)) return;
          playerDeck.push({...card, uid: Math.random()});
          renderCardPool();
          renderDeckList();
          updateDeckCount();
        } else {
          showDeckCardDetail(card);
          panel.dataset.cardId = card.id;
        }
        return;
      }
      // PC：クリックでデッキ追加（従来通り）
      if (!canAddCard(card)) return;
      playerDeck.push({...card, uid: Math.random()});
      renderCardPool();
      renderDeckList();
      updateDeckCount();
    };

    // PC：ホバーで詳細表示
    if (!window.matchMedia('(pointer: coarse)').matches) {
      el.addEventListener('mouseenter', () => showDeckCardDetail(card));
      el.addEventListener('mouseleave', () => showDeckCardDetail(null));
    }

    addTooltip(el, card);
    pool.appendChild(el);
  });
}

function renderDeckList() {
  const list = document.getElementById('deck-list');
  list.innerHTML = '';
  const grouped = {};
  playerDeck.forEach(c => {
    if (!grouped[c.id]) grouped[c.id] = {card: c, count: 0};
    grouped[c.id].count++;
  });

  Object.values(grouped).sort((a,b) => a.card.cost - b.card.cost).forEach(({card, count}) => {
    const el = document.createElement('div');
    el.className = 'deck-entry';
    el.innerHTML = `<div class="de-cost">${card.cost}</div><div class="de-name">${card.name}</div><div class="de-count">×${count}</div>`;
    el.onclick = () => {
      const idx = playerDeck.findIndex(c => c.id === card.id);
      if (idx >= 0) playerDeck.splice(idx, 1);
      renderCardPool();
      renderDeckList();
      updateDeckCount();
    };
    list.appendChild(el);
  });
}

function updateDeckCount() {
  const n = playerDeck.length;
  const leg = legendCountInDeck();
  document.getElementById('dc-count').textContent = n;
  const legEl = document.getElementById('dc-legend');
  if (legEl) legEl.textContent = leg;
  document.getElementById('btn-start-game').disabled = n !== 30;
}

function autoDeck() {
  playerDeck = [];
  const shuffled = [...ALL_CARDS].sort(() => Math.random() - 0.5);
  for (const card of shuffled) {
    if (playerDeck.length >= 30) break;
    if (canAddCard(card)) {
      playerDeck.push({...card, uid: Math.random()});
      // 通常カードは2枚まで試みる
      if (!isLegend(card) && canAddCard(card)) {
        playerDeck.push({...card, uid: Math.random()});
      }
    }
  }
  while (playerDeck.length > 30) playerDeck.pop();
  renderCardPool();
  renderDeckList();
  updateDeckCount();
}

// ===== GAME =====
function makeDeck(cards) {
  return [...cards].map(c => ({...c, uid: Math.random()})).sort(() => Math.random() - 0.5);
}

function buildAIDeck() {
  const deck = [];
  // canAddCardはplayerDeckを参照するため、ここではインライン判定
  const canAdd = (c) => {
    if (deck.length >= 30) return false;
    const same = deck.filter(x => x.id === c.id).length;
    const isLeg = c.keyword && c.keyword.includes(LEGEND_KEYWORD);
    if (isLeg) {
      if (same >= 1) return false;
      if (deck.filter(x => x.keyword && x.keyword.includes(LEGEND_KEYWORD)).length >= LEGEND_MAX) return false;
    } else {
      if (same >= 2) return false;
    }
    return true;
  };
  const pool = [...ALL_CARDS].sort(() => Math.random() - 0.5);
  for (const c of pool) {
    if (deck.length >= 30) break;
    if (canAdd(c)) {
      deck.push({...c, uid: Math.random()});
      // 通常カードは2枚まで
      if (!(c.keyword && c.keyword.includes(LEGEND_KEYWORD)) && canAdd(c)) {
        deck.push({...c, uid: Math.random()});
      }
    }
  }
  return deck.slice(0, 30);
}

function createBoardCard(card) {
  return {
    ...card,
    uid: Math.random(),
    currentHp: card.hp,
    currentAtk: card.atk,
    sleeping: true, // summoning sickness
    hasAttacked: false,
    tempBuffs: [],
    shieldBroken: false, // for 障壁
  };
}

function startGame() {
  if (!selectedSigil) { alert('シジルを選択してください'); return; }
  const isFirst = Math.random() < 0.5;
  const aiSigil = SIGIL_LIST[Math.floor(Math.random() * SIGIL_LIST.length)];
  const diffRadio = document.querySelector('input[name="ai-difficulty"]:checked');
  const aiDifficulty = diffRadio ? diffRadio.value : 'easy';

  G = {
    turn: 1,
    isPlayerTurn: isFirst,
    playerFirst: isFirst,
    aiDifficulty,
    // Normal AI memory: tracks previous turn state
    aiMemory: {
      prevPlayerField: [],   // enemy field last turn (card ids)
      prevPlayerHp: 25,
      comboTarget: null,     // unit to focus buffs on
    },

    player: {
      hp: 25, maxHp: 25,
      mana: 0, maxMana: 0,
      deck: makeDeck(playerDeck),
      hand: [],
      field: [],
      sigil: {...selectedSigil},
      sigilUseCount: 0,
      sigilMaxUse: 1,
      sigilDiscount: 0,
      deckOutCount: 0,
      sotListeners: [],  // ターン開始時トリガー [{uid, fn}]
      eotListeners: [],  // ターン終了時トリガー [{uid, fn}]
      oppEotListeners: [], // 相手ターン終了時トリガー [{uid, fn}]
      oppSotListeners: [], // 相手ターン開始時トリガー [{uid, fn}]
      oppSummonListeners: [], // 相手召喚時トリガー [{uid, fn}]
      spellListeners: [],     // 自スペル・陣地使用時トリガー [{uid, fn}]
      oppSpellListeners: [],  // 相手スペル・陣地使用時トリガー [{uid, fn}]
      healListeners: [],      // 回復時トリガー [{uid, fn}]
      damagedListeners: [],   // 被ダメ時トリガー（プレイヤー） [{uid, fn}]
      unitDamagedListeners: [], // ユニット被ダメ時トリガー [{uid, fn:(unit)=>}]
      attackListeners: [],    // 攻撃時トリガー [{uid, fn:(attacker)=>}]
      hpZeroListeners: [],    // HP0時トリガー [{uid, fn}] ※fnがtrueを返すと敗北を回避
    },
    enemy: {
      hp: 25, maxHp: 25,
      mana: 0, maxMana: 0,
      deck: buildAIDeck(),
      hand: [],
      field: [],
      sigil: {...aiSigil},
      sigilUseCount: 0,
      sigilMaxUse: 1,
      deckOutCount: 0,
      sotListeners: [],
      eotListeners: [],
      oppEotListeners: [],
      oppSotListeners: [],
      oppSummonListeners: [],
      spellListeners: [],
      oppSpellListeners: [],
      healListeners: [],
      damagedListeners: [],
      unitDamagedListeners: [],
      attackListeners: [],
      hpZeroListeners: [],
    },

    selectedCard: null,   // {source:'hand'|'field', idx}
    phase: 'main',        // main | targeting | hero-targeting | multi-targeting
    targetingMode: null,  // {type, card, source, idx}
    multiTargetStore: null, // {card, handIdx, needed, selected:[]} 複数ターゲット選択用
    gameOver: false,
    aiThinking: false,
    discardMode: false,
    log: [],
  };

  // Initial draw
  for (let i = 0; i < 3; i++) drawCard(G.player);
  for (let i = 0; i < 3; i++) drawCard(G.enemy);

  // マリガンフェーズへ
  G.mulliganRemain = 3;
  G.mulliganSelected = new Set(); // 選択中のhandインデックス
  showMulliganModal();
}

// ===== MULLIGAN =====
function showMulliganModal() {
  const modal = document.getElementById('modal-mulligan');
  modal.style.display = 'flex';
  renderMulliganHand();
}

function renderMulliganHand() {
  const container = document.getElementById('mulligan-hand');
  container.innerHTML = '';
  document.getElementById('mulligan-remain').textContent = `残り引き直し：${G.mulliganRemain}回`;
  document.getElementById('btn-mulligan-swap').disabled = G.mulliganSelected.size === 0 || G.mulliganRemain === 0;
  document.getElementById('btn-mulligan-swap').style.opacity = (G.mulliganSelected.size === 0 || G.mulliganRemain === 0) ? '0.45' : '1';

  G.player.hand.forEach((card, i) => {
    const el = document.createElement('div');
    el.className = 'mulligan-card' + (G.mulliganSelected.has(i) ? ' mulligan-selected' : '');
    const stat = card.type === 'ユニット' ? `${card.atk}/${card.hp}` : '';
    const icon = { 'ユニット':'⚔️', 'スペル':'✨', '陣地':'🏰' }[card.type] || '🃏';
    el.innerHTML = `
      <div class="mc-art">
        <span class="mc-art-icon">${icon}</span>
        <img src="card/${card.id}.jpg" alt="${card.name}" onerror="this.style.display='none';this.previousElementSibling.style.display='flex'" onload="this.previousElementSibling.style.display='none'">
        <div class="mc-cost-badge">${card.cost}</div>
      </div>
      <div class="mc-info">
        <div class="mc-name">${card.name}</div>
        <div class="mc-type">${card.type}</div>
        ${stat ? `<div class="mc-stat">${stat}</div>` : ''}
      </div>
    `;
    el.onclick = () => toggleMulliganSelect(i);
    container.appendChild(el);
  });
}

function showMulliganDetail(card) {
  const panel = document.getElementById('mulligan-detail');
  if (!card) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';

  const icon = { 'ユニット':'⚔️', 'スペル':'✨', '陣地':'🏰' }[card.type] || '🃏';
  const img = document.getElementById('mulligan-detail-img');
  const iconEl = document.getElementById('mulligan-detail-icon');
  img.src = `card/${card.id}.jpg`;
  img.style.display = 'none';
  iconEl.style.display = 'flex';
  iconEl.textContent = icon;
  img.onload  = () => { img.style.display = 'block'; iconEl.style.display = 'none'; };
  img.onerror = () => { img.style.display = 'none'; iconEl.style.display = 'flex'; };

  document.getElementById('mulligan-detail-cost').textContent = card.cost;
  document.getElementById('mulligan-detail-name').textContent = card.name;
  document.getElementById('mulligan-detail-type').textContent = card.type;
  document.getElementById('mulligan-detail-kw').textContent = card.keyword || '';
  document.getElementById('mulligan-detail-stats').textContent =
    card.type === 'ユニット' ? `ATK ${card.atk}  /  HP ${card.hp}` : '';
  const parts = [];
  if (card.trigger) parts.push(`◆${card.trigger}`);
  if (card.effect)  parts.push(card.effect);
  document.getElementById('mulligan-detail-effect').textContent = parts.join('　');
}

function toggleMulliganSelect(idx) {
  // 同じカードを再タップ→選択解除して詳細を閉じる
  if (G.mulliganSelected.has(idx) && G._mulliganDetailIdx === idx) {
    G.mulliganSelected.delete(idx);
    G._mulliganDetailIdx = null;
    showMulliganDetail(null);
  } else {
    // 別カードor未選択→選択してその詳細を表示
    G.mulliganSelected.add(idx);
    G._mulliganDetailIdx = idx;
    showMulliganDetail(G.player.hand[idx]);
  }
  renderMulliganHand();
}

function doMulligan() {
  if (G.mulliganSelected.size === 0 || G.mulliganRemain === 0) return;

  // ① 先にドロー（戻す前なので、選択カードは絶対に引かれない）
  const indices = Array.from(G.mulliganSelected).sort((a, b) => b - a); // 後ろから削除
  for (let i = 0; i < indices.length; i++) drawCard(G.player);

  // ② 選択カードを手札から抜いてデッキに戻してシャッフル
  const returned = [];
  indices.forEach(i => {
    returned.push(G.player.hand.splice(i, 1)[0]);
  });
  returned.forEach(c => G.player.deck.push(c));
  for (let i = G.player.deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [G.player.deck[i], G.player.deck[j]] = [G.player.deck[j], G.player.deck[i]];
  }

  G.mulliganRemain -= returned.length;
  G.mulliganSelected.clear();
  G._mulliganDetailIdx = null;
  showMulliganDetail(null);

  if (G.mulliganRemain <= 0) {
    endMulligan();
  } else {
    renderMulliganHand();
  }
}

function endMulligan() {
  showMulliganDetail(null);
  G._mulliganDetailIdx = null;
  document.getElementById('modal-mulligan').style.display = 'none';
  showScreen('game');
  startTurn();
}

function drawCard(pl) {
  if (pl.deck.length === 0) {
    // デッキ切れ：累積ダメージ
    pl.deckOutCount = (pl.deckOutCount || 0) + 1;
    const dmg = pl.deckOutCount;
    pl.hp -= dmg;
    addLog(`デッキ切れ：${dmg}点ダメージ（累計${pl.deckOutCount}回）`, 'damage');
    checkHp(pl);
    return false;
  }
  if (pl.hand.length >= 7) {
    // 手札上限：バーン（捨てる）
    const burned = pl.deck.shift();
    addLog(`手札上限：「${burned.name}」がバーンされた`, 'damage');
    return false;
  }
  const card = pl.deck.shift();
  pl.hand.push(card);
  return true;
}

function startTurn() {
  const pl = G.isPlayerTurn ? G.player : G.enemy;

  // Mana increase
  pl.maxMana = Math.min(10, pl.maxMana + 1);
  pl.mana = pl.maxMana;
  pl.sigilUseCount = 0;
  document.getElementById('card-confirm-bar').classList.remove('active');

  // Draw（先攻1ターン目はドローなし）
  const isFirstPlayerFirstTurn = G.isPlayerTurn && G.playerFirst && G.turn === 1;
  const isFirstEnemyFirstTurn = !G.isPlayerTurn && !G.playerFirst && G.turn === 1;
  if (!isFirstPlayerFirstTurn && !isFirstEnemyFirstTurn) drawCard(pl);

  // hasAttackedフラグのみリセット（sleepingはターン終了時に解除）
  pl.field.forEach(c => { c.hasAttacked = false; });

  // Trigger start-of-turn effects
  triggerStartOfTurn(pl);
  // 相手ターン開始時トリガーを相手側（oppSotListeners）で発火
  const oppForSOT = G.isPlayerTurn ? G.enemy : G.player;
  triggerOppStartOfTurn(oppForSOT);

  if (G.isPlayerTurn) {
    addLog('--- あなたのターン ' + G.turn + ' ---', 'important');
    document.getElementById('btn-end-turn').disabled = false;
    renderAll();
  } else {
    addLog('--- AIのターン ' + G.turn + ' ---', 'important');
    document.getElementById('btn-end-turn').disabled = true;
    renderAll();
    setTimeout(aiTurn, 800);
  }
}


// ===== AURA HELPERS =====
// Returns aura bonus {atk, hp, penetrate} from shrines for a player's units
function getAuraBonus(pl) {
  let atk = 0, hp = 0, penetrate = false;
  const holyBellCount = pl.field.filter(c => c.id === 'c12').length;
  atk += holyBellCount; hp += holyBellCount;  // ホーリーベル：枚数分+1/+1オーラ（重複あり）
  if (pl.field.some(c => c.id === 'c60')) { atk += 3; penetrate = true; } // 騒乱スタンピード（常時オーラ）
  return {atk, hp, penetrate};
}

// ユニットが貫通を持つか（自身のキーワード or 騒乱スタンピードオーラ）
// 魔力溢れる遺跡(c79)オーラ：両者どちらかの場にあればtrue（重複なし）
function isManaAuraActive() {
  return G.player.field.some(c => c.id === 'c79') || G.enemy.field.some(c => c.id === 'c79');
}

// 手札カードの実効コストを返す（魔力の源泉オーラ適用）
function effectiveCost(card) {
  if (isManaAuraActive()) return Math.ceil(card.cost / 2);
  return card.cost;
}

function hasPenetrate(card, pl) {
  return card.keyword.includes('貫通') || getAuraBonus(pl).penetrate;
}

// Display value including aura (don't modify actual stat)
function displayAtk(card, pl) {
  if (card.type !== 'ユニット') return card.currentAtk;
  const bonus = getAuraBonus(pl);
  return card.currentAtk + bonus.atk;
}

function displayHp(card, pl) {
  if (card.type !== 'ユニット') return card.currentHp;
  const bonus = getAuraBonus(pl);
  return card.currentHp + bonus.hp;
}

// ===== PLAY CARD =====
function playerPlayCard(handIdx) {
  if (!G.isPlayerTurn || G.gameOver) return;
  const card = G.player.hand[handIdx];
  if (!card) return;

  // 同じカードを再タップ→キャンセル
  if (G.selectedCard && G.selectedCard.source === 'hand' && G.selectedCard.idx === handIdx) {
    cancelCardSelection();
    return;
  }

  // 別のカードをタップ→選択し直す
  G.selectedCard = {source: 'hand', idx: handIdx};
  G.phase = 'main';
  showCardDetail(card, G.player);
  renderAll();
  // 確認バーを表示
  showCardConfirm(handIdx);
}

function showCardConfirm(handIdx) {
  const card = G.player.hand[handIdx];
  const bar = document.getElementById('card-confirm-bar');
  const label = document.getElementById('confirm-card-label');
  const playBtn = document.getElementById('confirm-play-btn');
  const cancelBtn = document.getElementById('confirm-cancel-btn');

  label.textContent = `「${card.name}」(${effectiveCost(card)}マナ)`;
  const fieldFull = (card.type === 'ユニット' || card.type === '陣地') && G.player.field.length >= 5;
  // c61(万陣破)：どちらの場にも陣地がなければ使用不可
  const noFieldTarget = card.id === 'c61' &&
    !G.player.field.some(c => c.type === '陣地') &&
    !G.enemy.field.some(c => c.type === '陣地');
  const canPlay = effectiveCost(card) <= G.player.mana && !fieldFull && !noFieldTarget;
  playBtn.disabled = !canPlay;
  playBtn.textContent = !canPlay && fieldFull ? 'フィールド満員'
    : !canPlay && noFieldTarget ? '対象なし'
    : canPlay ? '召喚・使用' : 'マナ不足';

  playBtn.onclick = () => {
    if (effectiveCost(card) > G.player.mana) return;
    if ((card.type === 'ユニット' || card.type === '陣地') && G.player.field.length >= 5) return;
    bar.classList.remove('active');
    if (needsTarget(card)) {
      // c82(ウィリー・ウィンキー)：複数ターゲット選択モード
      if (card.id === 'c82') {
        const enemyUnits = G.enemy.field.filter(c => c.type === 'ユニット');
        if (enemyUnits.length === 1) {
          // 敵ユニットが1体だけなら即実行
          executePlayCard(G.player, handIdx, null);
        } else {
          G.phase = 'multi-targeting';
          G.multiTargetStore = {card, handIdx, needed: 2, selected: []};
          updateTargetPrompt(card);
          document.getElementById('target-prompt-text').textContent = '敵ユニットを最大2体選択（ウィリー・ウィンキー）';
          document.getElementById('btn-confirm-multi').style.display = 'inline-block';
          document.getElementById('btn-confirm-multi').onclick = () => confirmMultiTarget();
          renderAll();
        }
      } else {
        G.phase = 'targeting';
        G.targetingMode = {card, handIdx};
        updateTargetPrompt(card);
        renderAll();
      }
    } else {
      executePlayCard(G.player, handIdx, null);
    }
  };

  cancelBtn.onclick = () => cancelCardSelection();
  bar.classList.add('active');
}

function cancelCardSelection() {
  G.selectedCard = null;
  G.phase = 'main';
  G.multiTargetStore = null;
  document.getElementById('btn-confirm-multi').style.display = 'none';
  document.getElementById('card-confirm-bar').classList.remove('active');
  document.getElementById('target-prompt').classList.remove('active');
  showCardDetail(null);
  renderAll();
}

// 複数ターゲット選択の「決定」処理（ウィリー・ウィンキー c82）
function confirmMultiTarget() {
  if (!G.multiTargetStore) return;
  const {card, handIdx, selected} = G.multiTargetStore;
  // 選択済みターゲットをまとめてapplyBattlecryへ渡す
  G.multiTargetStore = null;
  G.phase = 'main';
  document.getElementById('btn-confirm-multi').style.display = 'none';
  document.getElementById('target-prompt').classList.remove('active');
  executePlayCard(G.player, handIdx, {type:'multi', targets: selected});
}

function showAttackCancelBar(unitName) {
  const bar = document.getElementById('card-confirm-bar');
  const label = document.getElementById('confirm-card-label');
  const playBtn = document.getElementById('confirm-play-btn');
  const cancelBtn = document.getElementById('confirm-cancel-btn');

  label.textContent = `「${unitName}」で攻撃`;
  playBtn.style.display = 'none';
  cancelBtn.textContent = '攻撃キャンセル';
  cancelBtn.onclick = () => {
    G.selectedCard = null;
    G.phase = 'main';
    bar.classList.remove('active');
    playBtn.style.display = '';
    cancelBtn.textContent = 'キャンセル';
    showCardDetail(null);
    setStatus('カードを選択してください');
    renderAll();
  };
  bar.classList.add('active');
}

// Cards that need full target selection (including heal targets)
const HEAL_SPELL_IDS = ['c4','c22','c40']; // 3点回復, 5点回復, 8点回復

function needsTarget(card) {
  if (card.type === 'ユニット') {
    if (card.trigger === '登場時' && card.effect.includes('相手')) {
      if (card.id === 'c59') return false; // イフリート：全体ダメージのためターゲット不要
      return true;
    }
    if (card.trigger === '登場時' && card.effect.includes('敵ユニット一体')) {
      // 相手ユニットがいない場合は対象選択不要（効果はスキップ）
      return G.enemy.field.some(c => c.type === 'ユニット');
    }
    if (card.id === 'c82') {
      // ウィリー・ウィンキー：敵ユニット2体まで複数選択
      return G.enemy.field.some(c => c.type === 'ユニット');
    }
    return false;
  }
  if (card.type === '陣地') return false;
  if (card.type === 'スペル') {
    const needTarget = ['ユニット一体', '対象', '相手または', 'プレイヤー一人', '敵ユニット一体', 'ユニット一体または陣地'];
    if (card.id === 'c31') return G.enemy.field.some(c => c.type === 'ユニット'); // 敵ユニット一体のみ
    if (card.id === 'c71') return G.enemy.field.some(c => c.type === 'ユニット'); // ダモクレスの剣：敵ユニット必須
    if (card.id === 'c73') return G.enemy.field.some(c => c.type === 'ユニット'); // リリス：敵ユニット必須
    if (card.id === 'c80') return G.enemy.field.some(c => c.type === 'ユニット'); // アヌビスの天秤：敵ユニット必須
    if (card.id === 'c99') return G.enemy.field.some(c => c.type === 'ユニット'); // 結束を破壊する話術：敵ユニット必須
    if (card.id === 'c61') { // 万陣破：自分・相手どちらかに陣地があれば対象選択
      return G.player.field.some(c => c.type === '陣地') || G.enemy.field.some(c => c.type === '陣地');
    }
    if (card.id === 'c78') { // 生命の冒涜：自分・相手どちらかにユニットがいれば対象選択
      return G.player.field.some(c => c.type === 'ユニット') || G.enemy.field.some(c => c.type === 'ユニット');
    }
    // c72蒼波はターゲット不要（自動で左から処理）
    if (card.id === 'c69') return true; // 単体バフは自ユニット対象
    return needTarget.some(t => card.effect.includes(t)) || HEAL_SPELL_IDS.includes(card.id);
  }
  return false;
}

function updateTargetPrompt(card) {
  const p = document.getElementById('target-prompt');
  document.getElementById('target-prompt-text').textContent = `対象を選択 (${card.name})`;
  p.classList.add('active');
}

function executePlayCard(pl, handIdx, target) {
  const card = pl.hand[handIdx];
  pl.mana -= effectiveCost(card);
  pl.hand.splice(handIdx, 1);

  const isPlayer = pl === G.player;
  const oppPl = isPlayer ? G.enemy : G.player;

  if (card.type === 'ユニット') {
    if (pl.field.length >= 5) {
      pl.mana += effectiveCost(card);
      pl.hand.splice(handIdx, 0, card);
      addLog(`フィールドが満員のため「${card.name}」を召喚できません`, 'damage');
      renderAll();
      return;
    }
    const bc = createBoardCard(card);
    // 速攻: can attack immediately (no sleeping)
    if (bc.keyword.includes('速攻')) bc.sleeping = false;
    pl.field.push(bc);
    addLog(`${isPlayer?'あなた':'AI'}が「${card.name}」を召喚`, 'important');
    onCardEnterField(pl, bc);

    // Trigger 登場時
    if (card.trigger === '登場時') {
      applyBattlecry(pl, bc, card, target, isPlayer);
    }

    // 相手召喚時リスナーを発火（oppSummonListeners）
    [...oppPl.oppSummonListeners].forEach(l => l.fn(bc));
    cleanDeadUnits();

  } else if (card.type === '陣地') {
    // Counter check
    if (oppPl.field.some(c => c.id === 'c24') && card.cost <= 4) {
      const cIdx = oppPl.field.findIndex(c => c.id === 'c24');
      oppPl.field.splice(cIdx, 1);
      addLog(`カウンター発動！「${card.name}」を無効化`, 'important');
      // card already removed from hand (line above), mana already spent - no refund (counterspell consumes the card)
      G.phase = 'main';
      G.selectedCard = null;
      G.targetingMode = null;
      document.getElementById('target-prompt').classList.remove('active');
      cleanDeadUnits();
      renderAll();
      return;
    }

    const bc = {...card, uid: Math.random()};
    pl.field.push(bc);
    addLog(`${isPlayer?'あなた':'AI'}が「${card.name}」を設置`, 'important');
    applyShrineEffect(pl, bc, card, isPlayer);
    onCardEnterField(pl, bc); // ターン開始/終了時トリガーを登録

    // 相手スペル・陣地使用時リスナーを発火
    [...oppPl.oppSpellListeners].forEach(l => l.fn(pl));
  } else if (card.type === 'スペル') {
    // Counter check
    if (oppPl.field.some(c => c.id === 'c24') && card.cost <= 4) {
      const cIdx = oppPl.field.findIndex(c => c.id === 'c24');
      oppPl.field.splice(cIdx, 1);
      addLog(`カウンター発動！「${card.name}」を無効化`, 'important');
      G.phase = 'main';
      G.selectedCard = null;
      G.targetingMode = null;
      document.getElementById('target-prompt').classList.remove('active');
      cleanDeadUnits();
      renderAll();
      return;
    }

    addLog(`${isPlayer?'あなた':'AI'}が「${card.name}」を使用`, 'important');
    animSpellCutin(card);
    applySpell(pl, card, target, isPlayer);

    // 自スペル使用時リスナーを発火（ホムンクルス等）
    [...pl.spellListeners].forEach(l => l.fn());

    // 相手スペル・陣地使用時リスナーを発火（オートマタ等）
    [...oppPl.oppSpellListeners].forEach(l => l.fn(pl));
  }

  G.targetingMode = null;
  document.getElementById('target-prompt').classList.remove('active');

  // c62でdiscardモードに入った場合はphaseを維持する
  if (G.phase !== 'discard') {
    G.phase = 'main';
    G.selectedCard = null;
  }

  cleanDeadUnits();
  checkHp(pl === G.player ? G.enemy : G.player);
  checkHp(pl);
  if (!G.gameOver) renderAll();
}

function applyShrineEffect(pl, bc, card, isPlayer) {
  switch(card.id) {
    // c12 (ホーリーベル +1/+1) is a continuous aura - handled in getAuraBonus
    // c53: 永続展開陣地（相手ターン終了時のみ発動、登場時効果なし）
    case 'c60': // 騒乱スタンピード：オーラで常時+3/貫通付与（登場時の直接書き込みは行わない）
      addLog('騒乱スタンピード設置：自軍全体に貫通＋ATK+3（常時オーラ）', 'important');
      break;
    case 'c79': // 魔力溢れる遺跡：手札コスト半減オーラ
      addLog('魔力の源泉設置：互いの手札コストが半分になった', 'important');
      renderHand();
      break;
  }
}

function applyBattlecry(pl, bc, card, target, isPlayer) {
  const opp = isPlayer ? G.enemy : G.player;
  switch(card.id) {
    case 'c7': spawnToken(pl, {...makeToken('1/1'), id:'tok_c7', name:'ハーピー'}); break;
    case 'c28': { const targets28 = [...opp.field]; targets28.forEach(u => dealDamageToUnit(u, 2)); addLog('全体2点ダメージ', 'damage'); break; }
    case 'c38':
      if (target && target.type === 'face') { dealDamage(opp, 3); }
      else if (target && target.card) { dealDamageToUnit(target.card, 3); }
      else { dealDamage(opp, 3); }
      break;
    case 'c45': // 全体バフ
      pl.field.filter(c => c.type === 'ユニット' && c !== bc).forEach(u => { u.currentAtk++; u.currentHp++; });
      addLog('自軍全体+1/+1', 'heal');
      break;
    case 'c51': { // 大量展開
      const beforeCount = pl.field.length;
      const spaces = Math.max(0, 5 - beforeCount);
      const toSpawn = Math.min(4, spaces);
      const burned = 4 - toSpawn;
      for (let i = 0; i < toSpawn; i++) spawnToken(pl, {...makeToken('1/2'), id:'tok_c51', name:'蛇の子'});
      if (burned > 0) addLog(`大量展開：フィールド上限のため${burned}体がバーン`, 'damage');
      break;
    }
    case 'c54': // ヒルド
      pl.field.filter(c => c.type === 'ユニット' && c !== bc).forEach(u => { u.currentAtk+=2; u.currentHp+=2; });
      addLog('自軍全体+2/+2', 'heal');
      break;
    case 'c55': // スキュラ（回復なし）
      { const targets55 = [...opp.field]; targets55.forEach(u => dealDamageToUnit(u, 2)); }
      addLog('敵全体2点ダメ', 'damage');
      break;
    case 'c59': // イフリート全体3点
      dealDamage(opp, 3);
      { const targets59 = [...opp.field]; targets59.forEach(u => dealDamageToUnit(u, 3)); }
      addLog('相手と敵全体に3点ダメ', 'damage');
      break;
    case 'c68': // 登場時1点ダメ
      if (target && target.card) { dealDamageToUnit(target.card, 1); addLog(`「${target.card.name}」1点ダメ`, 'damage'); }
      break;
    case 'c73': // リリス：完全無効化
      if (target && target.card) {
        if (checkShield(target.card)) break;
        target.card.keyword = '';
        target.card.trigger = '';
        target.card.effect = '【無効化済み】';
        target.card.aiRole = '';
        addLog(`「${target.card.name}」を完全無効化`, 'damage');
      }
      break;
    case 'c82': { // ウィリー・ウィンキー：敵ユニット2体まで睡眠にする
      const c82targets = [];
      if (target && target.type === 'multi') {
        // 複数選択モード（2体選択）
        c82targets.push(...target.targets);
      } else if (target && target.card) {
        // 敵が1体だけの場合（即時実行パス）
        c82targets.push(target);
      }
      if (c82targets.length === 0) {
        // フォールバック：敵ユニット全体から最大2体
        const enemies = G.enemy.field.filter(c => c.type === 'ユニット');
        enemies.slice(0, 2).forEach(u => c82targets.push({card: u}));
      }
      c82targets.forEach(t => {
        if (t.card && !checkShield(t.card)) {
          t.card.sleeping = true;
          t.card.hasAttacked = true;
          addLog(`「${t.card.name}」が睡眠状態になった`, 'damage');
        }
      });
      break;
    }
    case 'c77': { // シームルグ：自分の場に他にユニットが2体以上いるとき睡眠にならない
      const allies77 = pl.field.filter(c => c.type === 'ユニット' && c !== bc);
      if (allies77.length >= 2) {
        bc.sleeping = false;
        addLog(`「${bc.name}」は睡眠にならなかった`, 'important');
      }
      break;
    }
    case 'c88': // エリザベート：相手に5点ダメージ＋自分5点回復
      dealDamage(opp, 5);
      applyHeal(pl, 5, null);
      addLog('エリザベート登場時：相手に5点ダメージ＆自分5点回復', 'important');
      break;
    case 'c89': // マンドラゴラ：敵ユニット一体を睡眠にする
      if (target && target.card) {
        if (!checkShield(target.card)) {
          target.card.sleeping = true;
          target.card.hasAttacked = true;
          addLog(`マンドラゴラ登場時：「${target.card.name}」が睡眠状態になった`, 'damage');
        }
      }
      break;
    case 'c91': // ワイトキング：デッキ残り10枚未満で+5/+5
      if (pl.deck.length < 10) {
        bc.currentAtk += 5;
        bc.currentHp += 5;
        bc.hp += 5;
        addLog(`ワイトキング登場時：デッキ残り${pl.deck.length}枚 → +5/+5獲得`, 'important');
      }
      break;
    case 'c96': { // レーテ：相手の手札を最大2枚ランダム破棄
      const discardCount = Math.min(2, opp.hand.length);
      for (let i = 0; i < discardCount; i++) {
        const idx = Math.floor(Math.random() * opp.hand.length);
        const discarded = opp.hand.splice(idx, 1)[0];
        addLog(`レーテ登場時：「${isPlayer ? 'AI' : 'あなた'}」の手札「${discarded.name}」を破棄`, 'damage');
      }
      if (discardCount === 0) addLog('レーテ登場時：相手の手札がなかった', 'damage');
      break;
    }
    case 'c97': // サキュバス：ユニット一体のキーワード能力を無効化
      if (target && target.card) {
        if (checkShield(target.card)) break;
        target.card.keyword = '';
        addLog(`サキュバス登場時：「${target.card.name}」のキーワードを無効化`, 'damage');
      }
      break;
    case 'c98': { // ロトパゴイ：相手の手札をランダムに1枚破棄
      if (opp.hand.length > 0) {
        const idx98 = Math.floor(Math.random() * opp.hand.length);
        const discarded98 = opp.hand.splice(idx98, 1)[0];
        addLog(`ロトパゴイ登場時：「${isPlayer ? 'AI' : 'あなた'}」の手札「${discarded98.name}」を破棄`, 'damage');
      } else {
        addLog('ロトパゴイ登場時：相手の手札がなかった', null);
      }
      break;
    }
    case 'c100': { // 天魔の魔女：登場時シジル変更＋場にいる限りコスト-2
      if (isPlayer) {
        // シジルコスト割引を付与（場を離れたら解除はonCardLeaveFieldで行う）
        G.player.sigilDiscount = (G.player.sigilDiscount || 0) + 2;
        addLog('天魔の魔女：シジルコストが2下がった', 'important');
        // シジル変更モーダルを表示
        showSigilChangeModal();
      } else {
        // AI：最もATKが高いシジルを選択（burn固定で十分）
        G.enemy.sigil = {...SIGIL_LIST[0]};
        addLog('天魔の魔女：AIがシジルを変更した', 'important');
      }
      break;
    }
  } // end switch
} // end applyBattlecry

function applySpell(pl, card, target, isPlayer) {
  const opp = isPlayer ? G.enemy : G.player;
  const targetPl = (target && target.type === 'ally') ? pl : opp;

  switch(card.id) {
    case 'c4': // 3点回復
      if (target && target.type === 'face') applyHeal(target.owner === 'enemy' ? G.enemy : G.player, 3, null);
      else if (target && target.card) { target.card.currentHp = Math.min(target.card.hp, target.card.currentHp + 3); addLog(`「${target.card.name}」3点回復`, 'heal'); }
      else applyHeal(pl, 3, null);
      break;
    case 'c5': // -2/0デバフ
      if (target && target.card) { applyDebuffToUnit(target.card, -2, 0); }
      addLog('-2/0デバフ', 'damage');
      break;
    case 'c10': // 2点ダメ
      if (target && target.card) { dealDamageToUnit(target.card, 2); }
      else if (target && target.type === 'face') { dealDamage(opp, 2); }
      else { dealDamage(opp, 2); }
      break;
    case 'c11': // 全体1点
      opp.field.filter(c => c.type === 'ユニット').forEach(u => { dealDamageToUnit(u, 1); });
      addLog('敵全体1点ダメ', 'damage');
      break;
    case 'c19': // 全体バフ（永続）
      pl.field.filter(c => c.type === 'ユニット').forEach(u => {
        u.currentAtk++; u.currentHp++;
        u.hp++;
        animBuff(u);
      });
      addLog('自軍全体+1/+1（永続）', 'heal');
      break;
    case 'c20': // 2ドロー
      drawCard(pl); drawCard(pl);
      addLog('2枚ドロー', 'important');
      break;
    case 'c21': // 全体デバフ
      opp.field.forEach(u => { applyDebuffToUnit(u, -1, -1); });
      addLog('敵全体-1/-1', 'damage');
      break;
    case 'c22': // 5点回復
      if (target && target.type === 'face') applyHeal(target.owner === 'enemy' ? G.enemy : G.player, 5, null);
      else if (target && target.card) { target.card.currentHp = Math.min(target.card.hp, target.card.currentHp + 5); addLog(`「${target.card.name}」5点回復`, 'heal'); }
      else applyHeal(pl, 5, null);
      break;
    case 'c31': // 4点ダメスペル（敵ユニット一体のみ）
      if (target && target.card) { dealDamageToUnit(target.card, 4); addLog(`「${target.card.name}」4点ダメ`, 'damage'); }
      break;
    case 'c32': // 全体3回復
      applyHeal(pl, 3, null);
      pl.field.filter(c => c.type === 'ユニット').forEach(u => u.currentHp = Math.min(u.hp, u.currentHp + 3));
      addLog('自分と自軍3点回復', 'heal');
      break;
    case 'c38': // 3/4 3点ダメ (spell part handled via unit battlecry above)
      break;
    case 'c39': // 全体3点
      { const targets39 = [...opp.field]; targets39.forEach(u => dealDamageToUnit(u, 3)); }
      addLog('敵全体3点ダメ', 'damage');
      break;
    case 'c40': // 8点回復
      if (target && target.type === 'face') applyHeal(target.owner === 'enemy' ? G.enemy : G.player, 8, null);
      else if (target && target.card) { target.card.currentHp = Math.min(target.card.hp, target.card.currentHp + 8); addLog(`「${target.card.name}」8点回復`, 'heal'); }
      else applyHeal(pl, 8, null);
      break;
    case 'c41': // 2ドロー+回復
      drawCard(pl); drawCard(pl);
      applyHeal(pl, 5, null);
      addLog('2ドロー＋5点回復', 'heal');
      break;
    case 'c46': // 展開スペル
      spawnToken(pl, {id:'tok_c46_1',name:'フェンリル',type:'ユニット',cost:0,atk:3,hp:3,keyword:'先制',trigger:'',effect:''});
      spawnToken(pl, {id:'tok_c46_2',name:'ヨルムンガンド',type:'ユニット',cost:0,atk:2,hp:2,keyword:'ドレイン',trigger:'',effect:''});
      spawnToken(pl, {id:'tok_c46_3',name:'ヘル',type:'ユニット',cost:0,atk:1,hp:1,keyword:'必殺',trigger:'',effect:''});
      addLog('フェンリル・ヨルムンガンド・ヘル召喚', 'important');
      break;
    case 'c47': // 単体除去
      if (target && target.card) {
        if (checkShield(target.card)) break; // 障壁で無効化
        // どちらのフィールドにあるか実際に検索して判定
        const inPlayer = G.player.field.includes(target.card);
        const inEnemy  = G.enemy.field.includes(target.card);
        const ownerPl47 = inPlayer ? G.player : inEnemy ? G.enemy : null;
        if (ownerPl47) {
          const idx = ownerPl47.field.indexOf(target.card);
          if (idx >= 0) {
            onCardLeaveField(ownerPl47, target.card.uid);
            triggerDeathrattle(target.card, ownerPl47);
            ownerPl47.field.splice(idx, 1);
            addLog(`「${target.card.name}」を除去`, 'damage');
            renderHand(); // 魔力の源泉が除去された場合コスト表示を更新
          }
        }
      }
      break;
    case 'c52': // 全破壊（障壁持ちは無効化）
      {
        const allPlayerUnits = G.player.field.filter(c => c.type === 'ユニット');
        const allEnemyUnits  = G.enemy.field.filter(c => c.type === 'ユニット');
        const destroyedP = allPlayerUnits.filter(u => !checkShield(u));
        const destroyedE = allEnemyUnits.filter(u => !checkShield(u));
        destroyedP.forEach(u => { onCardLeaveField(G.player, u.uid); triggerDeathrattle(u, G.player); });
        destroyedE.forEach(u => { onCardLeaveField(G.enemy, u.uid); triggerDeathrattle(u, G.enemy); });
        G.player.field = G.player.field.filter(c => c.type !== 'ユニット' || !destroyedP.includes(c));
        G.enemy.field  = G.enemy.field.filter(c => c.type !== 'ユニット' || !destroyedE.includes(c));
        addLog('全ユニット破壊！', 'damage');
      }
      break;
    case 'c86': // ハルマゲドン：全ユニット＋全陣地を破壊
      {
        const allPUnits = G.player.field.filter(c => c.type === 'ユニット');
        const allEUnits = G.enemy.field.filter(c => c.type === 'ユニット');
        const deadP = allPUnits.filter(u => !checkShield(u));
        const deadE = allEUnits.filter(u => !checkShield(u));
        deadP.forEach(u => { onCardLeaveField(G.player, u.uid); triggerDeathrattle(u, G.player); });
        deadE.forEach(u => { onCardLeaveField(G.enemy, u.uid); triggerDeathrattle(u, G.enemy); });
        // 陣地も全破壊
        const pShrines = G.player.field.filter(c => c.type === '陣地');
        const eShrines = G.enemy.field.filter(c => c.type === '陣地');
        pShrines.forEach(s => onCardLeaveField(G.player, s.uid));
        eShrines.forEach(s => onCardLeaveField(G.enemy, s.uid));
        G.player.field = G.player.field.filter(c => c.type !== 'ユニット' && c.type !== '陣地');
        G.enemy.field  = G.enemy.field.filter(c => c.type !== 'ユニット' && c.type !== '陣地');
        renderHand(); // 魔力の源泉などが消えた場合コスト更新
        addLog('ハルマゲドン：全ユニット・全陣地を破壊！', 'damage');
      }
      break;
    case 'c57': // 全体5点
      { const targets57 = [...opp.field]; targets57.forEach(u => dealDamageToUnit(u, 5)); }
      addLog('敵全体5点ダメ', 'damage');
      break;
    case 'c61': // 陣地破壊（自分・相手どちらも対象）
      if (target && target.card) {
        // どちらのフィールドにあるか検索
        const isInPlayer = G.player.field.includes(target.card);
        const isInEnemy  = G.enemy.field.includes(target.card);
        const tPl = isInPlayer ? G.player : G.enemy;
        const idx = tPl.field.indexOf(target.card);
        if (idx >= 0 && target.card.type === '陣地') {
          onCardLeaveField(tPl, target.card.uid);
          tPl.field.splice(idx, 1);
          addLog(`「${target.card.name}」を破壊`, 'damage');
          renderHand(); // 魔力の源泉が破壊された場合コスト表示を更新
        }
      }
      break;
    case 'c62': // ジャーンの書：2ドローして1枚捨てる
      drawCard(pl); drawCard(pl);
      addLog('2枚ドロー', 'important');
      // 捨てるカードをAIは自動選択、プレイヤーは選択UIを出す
      if (pl === G.player) {
        G.discardMode = true;
        G.phase = 'discard';
        addLog('捨てるカードを選んでください', null);
      } else {
        // AI: 最低コストのカードを捨てる
        if (pl.hand.length > 0) {
          const discardIdx = pl.hand.reduce((mi, c, i) => c.cost < pl.hand[mi].cost ? i : mi, 0);
          addLog(`AI：「${pl.hand[discardIdx].name}」を捨てた`, 'damage');
          pl.hand.splice(discardIdx, 1);
        }
      }
      break;
    case 'c69': // 単体バフ +2/+2
      if (target && target.card) {
        target.card.currentAtk += 2; target.card.currentHp += 2; target.card.hp += 2;
        animBuff(target.card);
        addLog(`「${target.card.name}」+2/+2バフ`, 'heal');
      }
      break;
    case 'c71': // ダモクレスの剣：対象のATKと同値のダメージ
      if (target && target.card) {
        const atkBonus = getAuraBonus(opp).atk;
        const mirrorDmg = target.card.currentAtk + atkBonus;
        if (mirrorDmg > 0) {
          dealDamageToUnit(target.card, mirrorDmg);
          addLog(`「${target.card.name}」にダモクレスの剣：${mirrorDmg}点ダメージ`, 'damage');
        } else {
          addLog('ダモクレスの剣：ATK0のため効果なし', null);
        }
      }
      break;
    case 'c72': { // 蒼波：1点×3回、倒すたびに次へ
      let remaining = 3;
      addLog('蒼波発動', 'damage');
      while (remaining > 0) {
        const hpBonus = getAuraBonus(opp).hp;
        const targets72 = opp.field.filter(c => c.type === 'ユニット');
        if (targets72.length === 0) break;
        const t72 = targets72.reduce((a, b) => a.currentHp <= b.currentHp ? a : b);
        if (t72.keyword && t72.keyword.includes('障壁') && !t72.shieldBroken) {
          checkShield(t72);
          remaining--;
          addLog(`「${t72.name}」の障壁が蒼波を1回吸収`, 'damage');
        } else {
          t72.currentHp -= 1;
          remaining--;
          addLog(`「${t72.name}」に1点 (残${remaining}回)`, 'damage');
          if (t72.currentHp + hpBonus <= 0) {
            onCardLeaveField(opp, t72.uid);
            triggerDeathrattle(t72, opp);
            opp.field = opp.field.filter(c => c !== t72);
            addLog(`「${t72.name}」を撃破、次へ`, 'damage');
          }
        }
      }
      break;
    }
    case 'c75': // シジルの刻印：シジル使用回数を3回に拡張
      pl.sigilMaxUse = 3;
      addLog('シジルの刻印：シジルを1ターンに3回まで使用可能になった', 'important');
      break;
    case 'c76': { // 星を落とす魔法：相手プレイヤーに8点直接ダメージ
      dealDamage(opp, 8);
      addLog('星を落とす魔法：相手プレイヤーに8点ダメージ', 'damage');
      break;
    }
    case 'c78': { // 生命の冒涜：ユニット破壊→破壊先の場にキメラトークン召喚
      if (target && target.card) {
        const targetUnit = target.card;
        const targetOwner = G.player.field.includes(targetUnit) ? G.player : G.enemy;
        if (checkShield(targetUnit)) break;
        const x = Math.ceil(targetUnit.cost / 2);
        addLog(`「${targetUnit.name}」を破壊`, 'damage');
        onCardLeaveField(targetOwner, targetUnit.uid);
        triggerDeathrattle(targetUnit, targetOwner);
        targetOwner.field = targetOwner.field.filter(c => c !== targetUnit);
        if (targetOwner.field.length < 5) {
          const chimera = {
            id: 'tok_c78', uid: Math.random(), name: 'キメラ',
            type: 'ユニット', cost: x, atk: x, hp: x,
            currentAtk: x, currentHp: x, keyword: '', trigger: '', effect: '', aiRole: ''
          };
          targetOwner.field.push(chimera);
          addLog(`${targetOwner === G.player ? 'あなた' : 'AI'}の場に${x}/${x}キメラ召喚`, 'important');
        }
        renderAll();
      }
      break;
    }
    case 'c80': { // アヌビスの天秤：敵ユニット一体に1点→その後破壊
      if (target && target.card) {
        const t80 = target.card;
        // 1点ダメージ（障壁を剥がす）
        if (t80.keyword && t80.keyword.includes('障壁') && !t80.shieldBroken) {
          checkShield(t80);
          addLog(`「${t80.name}」の障壁がアヌビスの天秤を吸収`, 'damage');
        } else {
          t80.currentHp -= 1;
          addLog(`「${t80.name}」に1点ダメージ`, 'damage');
        }
        // 障壁の有無に関わらず破壊
        const owner80 = G.enemy.field.includes(t80) ? G.enemy : G.player;
        onCardLeaveField(owner80, t80.uid);
        triggerDeathrattle(t80, owner80);
        owner80.field = owner80.field.filter(c => c !== t80);
        addLog(`「${t80.name}」を破壊`, 'damage');
        renderAll();
      }
      break;
    }
    case 'c81': { // メイルシュトローム：2点×4回、倒すたびに次へ
      let remaining81 = 4;
      addLog('メイルシュトローム発動', 'damage');
      while (remaining81 > 0) {
        const hpBonus81 = getAuraBonus(opp).hp;
        const targets81 = opp.field.filter(c => c.type === 'ユニット');
        if (targets81.length === 0) break;
        const t81 = targets81.reduce((a, b) => a.currentHp <= b.currentHp ? a : b);
        if (t81.keyword && t81.keyword.includes('障壁') && !t81.shieldBroken) {
          checkShield(t81);
          remaining81--;
          addLog(`「${t81.name}」の障壁がメイルシュトロームを1回吸収`, 'damage');
        } else {
          t81.currentHp -= 2;
          remaining81--;
          addLog(`「${t81.name}」に2点 (残${remaining81}回)`, 'damage');
          if (t81.currentHp + hpBonus81 <= 0) {
            onCardLeaveField(opp, t81.uid);
            triggerDeathrattle(t81, opp);
            opp.field = opp.field.filter(c => c !== t81);
            addLog(`「${t81.name}」を撃破、次へ`, 'damage');
          }
        }
      }
      break;
    }
    case 'c90': { // 鏡写し：対象ユニットのATKとHPを入れ替える（現在値ベース）
      if (target && target.card) {
        const t90 = target.card;
        const tmpAtk = t90.currentAtk;
        const tmpHp  = t90.currentHp;
        t90.currentAtk = tmpHp;
        t90.currentHp  = tmpAtk;
        addLog(`「${t90.name}」のATKとHPが入れ替わった (${tmpAtk}/${tmpHp} → ${t90.currentAtk}/${t90.currentHp})`, 'damage');
        cleanDeadUnits();
        renderAll();
      }
      break;
    }
    case 'c99': { // 結束を破壊する話術：相手ユニット一体を自分の場に移し睡眠付与
      // targetがnullの場合（AI使用時）：最もATKの高い敵ユニットを選択
      let stealTarget = (target && target.card) ? target.card : null;
      if (!stealTarget) {
        const candidates = opp.field.filter(c => c.type === 'ユニット');
        if (candidates.length > 0) {
          stealTarget = candidates.reduce((a, b) => (a.currentAtk >= b.currentAtk ? a : b));
        }
      }
      if (stealTarget) {
        // 障壁チェック（障壁があれば無効化して終了）
        if (checkShield(stealTarget)) break;
        // 自分の場が満員なら効果なし
        if (pl.field.length >= 5) {
          addLog('結束を破壊する話術：自分の場が満員のため移動できなかった', 'damage');
          break;
        }
        // 相手フィールドから除去
        const stealIdx = opp.field.indexOf(stealTarget);
        if (stealIdx < 0) break;
        onCardLeaveField(opp, stealTarget.uid);
        opp.field.splice(stealIdx, 1);
        // 睡眠付与・攻撃済みフラグをセット
        stealTarget.sleeping = true;
        stealTarget.hasAttacked = true;
        stealTarget.uid = Math.random(); // UIDを更新
        // 自分の場に追加＆リスナー再登録
        pl.field.push(stealTarget);
        onCardEnterField(pl, stealTarget);
        addLog(`「${stealTarget.name}」を奪取！自分の場に移した（睡眠）`, 'important');
        renderAll();
      }
      break;
    }
      if (card.id === 'c87') { // オドの還元：最大マナ+1のみ（上限10・現在マナは変えない）
        if (pl.maxMana < 10) {
          pl.maxMana++;
          addLog(`${isPlayer ? 'あなた' : 'AI'}：オドの還元：最大マナが${pl.maxMana}になった`, 'heal');
        } else {
          addLog('オドの還元：最大マナはすでに10です', null);
        }
        break;
      }
      if (card.effect.includes('ユニット一体')) {
        if (target && target.card) { dealDamageToUnit(target.card, parseInt(card.effect.match(/(\d+)点/)?.[1]||0)); }
      }
  }
}

function spawnToken(pl, tpl) {
  if (pl.field.length >= 5) return;
  const bc = createBoardCard({...tpl, uid: Math.random()});
  if (tpl.keyword && tpl.keyword.includes('速攻')) bc.sleeping = false;
  bc._owner = pl;
  pl.field.push(bc);
  onCardEnterField(pl, bc);
}

function makeToken(stat) {
  const [a,h] = stat.split('/').map(Number);
  return {id:'tok_'+stat, name:stat+'トークン', type:'ユニット', cost:0, atk:a, hp:h, keyword:'', trigger:'', effect:''};
}

function applyHeal(pl, amount, source) {
  pl.hp = Math.min(pl.maxHp, pl.hp + amount);
  addLog(`${pl === G.player ? 'あなた' : 'AI'}: ${amount}点回復 (HP: ${pl.hp})`, 'heal');
  // 回復時リスナー発火
  [...pl.healListeners].forEach(l => l.fn());
}

function dealDamage(pl, amount) {
  pl.hp -= amount;
  addLog(`${pl === G.player ? 'あなた' : 'AI'}に${amount}点ダメージ`, 'damage');
  checkHp(pl);

  // 被ダメ時リスナー発火
  if (amount > 0 && !G.gameOver) {
    [...pl.damagedListeners].forEach(l => l.fn());
    cleanDeadUnits();
  }
}

// 障壁チェック：敵からの効果を受ける前に呼ぶ。trueなら無効化（呼び元はreturnする）
// 相手ユニットへのデバフを障壁チェック付きで適用する汎用関数
// dAtk/dHp には負の値を渡す（例: ATK-1なら dAtk=-1, dHp=0）
// オーラ込みの実効値に対してデバフを計算し、結果が0未満にならないよう制限する
function applyDebuffToUnit(unit, dAtk, dHp) {
  if (checkShield(unit)) return false;
  const ownerPl = G.player.field.includes(unit) ? G.player : G.enemy;
  const aura = getAuraBonus(ownerPl);
  if (dAtk !== 0) {
    // 実効ATK = currentAtk + aura.atk、これにデバフ適用後0未満はゼロ
    const effectiveAtk = unit.currentAtk + aura.atk;
    const newEffective = Math.max(0, effectiveAtk + dAtk);
    unit.currentAtk = newEffective - aura.atk; // currentAtkはマイナスになりうる
  }
  if (dHp !== 0) {
    const effectiveHp = unit.currentHp + aura.hp;
    const newEffective = Math.max(0, effectiveHp + dHp);
    unit.currentHp = newEffective - aura.hp;
  }
  animDebuff(unit); // デバフフラッシュ
  return true;
}

function checkShield(unit) {
  if (unit.keyword && unit.keyword.includes('障壁') && !unit.shieldBroken) {
    unit.shieldBroken = true;
    unit.keyword = unit.keyword.replace(/・?障壁・?/, '').replace(/^・|・$/, '');
    addLog(`「${unit.name}」の障壁が破壊された`, 'damage');
    return true;
  }
  return false;
}

function dealDamageToUnit(unit, amount) {
  if (checkShield(unit)) return;
  const ownerPl = G.player.field.includes(unit) ? G.player : G.enemy;
  const hpBonus = getAuraBonus(ownerPl).hp;
  unit.currentHp -= amount;
  const displayRemain = Math.max(0, unit.currentHp + hpBonus);
  addLog(`「${unit.name}」に${amount}点ダメージ (残HP: ${displayRemain})`, 'damage');
  animDamage(unit); // ダメージフラッシュ

  // ユニット被ダメ時リスナー発火（そのユニットのオーナー側のリスナーを呼ぶ）
  [...ownerPl.unitDamagedListeners].forEach(l => l.fn(unit));
}

function triggerDeathrattle(unit, pl) {
  const opp = pl === G.player ? G.enemy : G.player;
  if (!unit.trigger) return;
  if (unit.trigger.includes('死亡時')) {
    switch(unit.id) {
      case 'c3': drawCard(pl); addLog('死亡時ドロー', 'important'); break;
      case 'c9': spawnToken(pl, {...makeToken('1/1'), id:'tok_c9', name:'ミニスライム'}); addLog('ミニスライム召喚', 'important'); break;
      case 'c16': pl.hand.push({...makeToken('1/2'), id:'tok_c16', name:'レヴナントの欠片', uid: Math.random()}); addLog('レヴナントの欠片を入手', 'important'); break;
      case 'c43': spawnToken(pl, {...makeToken('4/4'), id:'tok_c43', name:'再誕の不死鳥'}); addLog('再誕の不死鳥召喚', 'important'); break;
    }
  }
}

function cleanDeadUnits() {
  [G.player, G.enemy].forEach(pl => {
    const hpBonus = getAuraBonus(pl).hp;
    const dead = pl.field.filter(c => c.type === 'ユニット' && c.currentHp + hpBonus <= 0);
    // まずフィールドから除去してリスナー解除（スロットを空ける）
    dead.forEach(u => onCardLeaveField(pl, u.uid));
    pl.field = pl.field.filter(c => c.type !== 'ユニット' || c.currentHp + hpBonus > 0);
    // その後に死亡時効果発動（フィールドに空きができた後なのでトークン召喚可能）
    dead.forEach(u => triggerDeathrattle(u, pl));
    // Keep shrines
  });
}

function checkHp(pl) {
  if (pl.hp <= 0 && !G.gameOver) {
    // HP0時リスナー発火（不死鳥の揺籃など）。trueが返れば敗北を回避
    const saved = pl.hpZeroListeners.length > 0 && pl.hpZeroListeners[0].fn();
    if (saved) return;
    G.gameOver = true;
    const playerWon = pl === G.enemy;
    const overlay = document.getElementById('game-overlay');
    const title = document.getElementById('overlay-title');
    title.textContent = playerWon ? 'VICTORY' : 'DEFEAT';
    title.className = playerWon ? 'win' : 'lose';
    overlay.classList.add('active');
    addLog(playerWon ? '勝利！' : '敗北...', 'important');
  }
}

// ===== ANIMATION HELPERS =====

// UIDからフィールド上のDOM要素を取得
function getCardEl(uid) {
  return document.querySelector(`[data-uid="${uid}"]`);
}

// クラスを一時的に付与してアニメーション発火
function animateCard(uid, cls, duration) {
  const el = getCardEl(uid);
  if (!el) return Promise.resolve();
  return new Promise(resolve => {
    el.classList.remove(cls);
    void el.offsetWidth; // reflow
    el.classList.add(cls);
    setTimeout(() => { el.classList.remove(cls); resolve(); }, duration);
  });
}

// 攻撃アニメーション（攻撃者が前進→戻る）
function animAttack(attacker, isPlayerAttacker) {
  const cls = isPlayerAttacker ? 'anim-attack-player' : 'anim-attack-enemy';
  return animateCard(attacker.uid, cls, 350);
}

// ダメージアニメーション
function animDamage(unit) {
  return animateCard(unit.uid, 'anim-damage', 400);
}

// バフアニメーション
function animBuff(unit) {
  return animateCard(unit.uid, 'anim-buff', 450);
}

// デバフアニメーション
function animDebuff(unit) {
  return animateCard(unit.uid, 'anim-debuff', 450);
}

// プレイヤーの顔面ダメージ（ポートレートを揺らす）
function animFaceDamage(isPlayer) {
  const el = document.getElementById(isPlayer ? 'player-portrait' : 'enemy-portrait');
  if (!el) return Promise.resolve();
  return new Promise(resolve => {
    el.classList.remove('anim-damage');
    void el.offsetWidth;
    el.classList.add('anim-damage');
    setTimeout(() => { el.classList.remove('anim-damage'); resolve(); }, 400);
  });
}

// スペルカットイン
function animSpellCutin(card) {
  return new Promise(resolve => {
    const el = document.getElementById('spell-cutin');
    document.getElementById('spell-cutin-name').textContent = card.name;
    document.getElementById('spell-cutin-effect').textContent = card.effect || '';

    // 画像があれば表示、なければアイコンにフォールバック
    const img = document.getElementById('spell-cutin-img');
    const icon = document.getElementById('spell-cutin-icon');
    img.src = `card/${card.id}.jpg`;
    img.style.display = 'none';
    icon.style.display = 'flex';
    icon.textContent = TYPE_ICON[card.type] || '✨';
    img.onload = () => { img.style.display = 'block'; icon.style.display = 'none'; };
    img.onerror = () => { img.style.display = 'none'; icon.style.display = 'flex'; };

    el.classList.remove('active');
    void el.offsetWidth;
    el.classList.add('active');
    setTimeout(() => { el.classList.remove('active'); resolve(); }, 700);
  });
}

// ===== ANIMATED ATTACK =====
function playerSelectFieldUnit(fieldIdx) {
  if (!G.isPlayerTurn || G.gameOver) return;
  document.getElementById('card-confirm-bar').classList.remove('active');
  const unit = G.player.field[fieldIdx];
  if (!unit) return;

  // 陣地カードはカード詳細表示のみ（攻撃選択には入らない）
  if (unit.type === '陣地') {
    // 同じカードを再タップで詳細を閉じる
    const panel = document.getElementById('card-detail-panel');
    const currentName = document.getElementById('cdt-name').textContent;
    if (!panel.classList.contains('hidden') && currentName === unit.name) {
      showCardDetail(null);
    } else {
      showCardDetail(unit, G.player);
    }
    renderAll();
    return;
  }

  // Cancel if clicking same unit again (in either main or attack-select phase)
  if (G.selectedCard && G.selectedCard.source === 'field' && G.selectedCard.idx === fieldIdx) {
    G.selectedCard = null;
    G.phase = 'main';
    const bar = document.getElementById('card-confirm-bar');
    bar.classList.remove('active');
    document.getElementById('confirm-play-btn').style.display = '';
    document.getElementById('confirm-cancel-btn').textContent = 'キャンセル';
    showCardDetail(null);
    setStatus('カードを選択してください');
    renderAll();
    return;
  }

  if (unit.sleeping || unit.hasAttacked) {
    // 攻撃不可でもタップでカード詳細は確認できるようにする（再タップで閉じる）
    const panel = document.getElementById('card-detail-panel');
    const currentName = document.getElementById('cdt-name').textContent;
    if (!panel.classList.contains('hidden') && currentName === unit.name) {
      showCardDetail(null);
    } else {
      showCardDetail(unit, G.player);
    }
    renderAll();
    return;
  }

  G.selectedCard = {source: 'field', idx: fieldIdx};
  G.phase = 'attack-select';
  showCardDetail(unit, G.player);
  showAttackCancelBar(unit.name);
  renderAll();
  setStatus(`「${unit.name}」の攻撃対象を選択`);
}

function playerAttackTarget(target) {
  if (!G.selectedCard || G.selectedCard.source !== 'field') return;
  const attacker = G.player.field[G.selectedCard.idx];
  if (!attacker) return;

  const opp = G.enemy;
  const attackerIsHidden = attacker.keyword?.includes('隠密');
  const hasGuard = opp.field.some(c => c.type === 'ユニット' && c.keyword && c.keyword.includes('守護'));

  if (!attackerIsHidden && hasGuard && target.type !== 'unit') {
    addLog('守護ユニットを先に倒してください', null); return;
  }
  if (!attackerIsHidden && hasGuard && target.type === 'unit' && !target.card.keyword.includes('守護')) {
    addLog('守護ユニットを先に倒してください', null); return;
  }

  G.selectedCard = null;
  G.phase = 'main';

  const defCard = target.type === 'unit' ? target.card : null;
  const attackerUid = attacker.uid;

  // 攻撃アニメーション
  animAttack(attacker, true).then(() => {
    executeAttack(G.player, attacker, opp, target);
    // ダメージアニメーション（対象＋反撃）
    const dmgPromises = [];
    if (defCard) {
      dmgPromises.push(animDamage(defCard));
      dmgPromises.push(animDamage(attacker));
    } else {
      dmgPromises.push(animFaceDamage(false));
    }
    return Promise.all(dmgPromises);
  }).then(() => {
    cleanDeadUnits();
    checkHp(G.player);
    checkHp(G.enemy);
    if (!G.gameOver) renderAll();
  });
}

function executeAttack(atkPl, attacker, defPl, target) {
  if (attacker.trigger === '攻撃時') {
    // 攻撃時リスナー発火
    [...atkPl.attackListeners].forEach(l => l.fn(attacker));
  }

  // オーラボーナス（c12 ホーリーベル +1/+1）を実ダメージに反映
  const atkBonus = getAuraBonus(atkPl);
  const atkVal = attacker.currentAtk + atkBonus.atk;

  if (target.type === 'face') {
    dealDamage(defPl, atkVal);
    addLog(`「${attacker.name}」がリーダーに${atkVal}点攻撃`, 'damage');
    if (attacker.keyword.includes('ドレイン')) applyHeal(atkPl, atkVal, attacker);

  } else if (target.type === 'unit') {
    const defender = target.card;
    const defBonus = getAuraBonus(defPl);
    const defVal = defender.currentAtk + defBonus.atk;

    // 先制のみ先攻扱い（速攻は召喚酔いなしのみ）
    const atkFirst = attacker.keyword.includes('先制');
    const defFirst = defender.keyword.includes('先制');

    if (atkFirst && !defFirst) {
      // Attacker hits first
      dealDamageToUnit(defender, atkVal);
      // Draining
      if (attacker.keyword.includes('ドレイン')) applyHeal(atkPl, atkVal, attacker);
      if (defender.currentHp + defBonus.hp > 0) {
        dealDamageToUnit(attacker, defVal);
        if (defender.keyword.includes('ドレイン')) applyHeal(defPl, defVal, defender);
      }
    } else if (!atkFirst && defFirst) {
      dealDamageToUnit(attacker, defVal);
      if (defender.keyword.includes('ドレイン')) applyHeal(defPl, defVal, defender);
      if (attacker.currentHp + atkBonus.hp > 0) {
        dealDamageToUnit(defender, atkVal);
        if (attacker.keyword.includes('ドレイン')) applyHeal(atkPl, atkVal, attacker);
      }
    } else {
      // Simultaneous
      dealDamageToUnit(defender, atkVal);
      dealDamageToUnit(attacker, defVal);
      if (attacker.keyword.includes('ドレイン')) applyHeal(atkPl, atkVal, attacker);
      if (defender.keyword.includes('ドレイン')) applyHeal(defPl, defVal, defender);
    }

    // 必殺: always kills
    if (attacker.keyword.includes('必殺') && defender.currentHp + defBonus.hp > 0) { defender.currentHp = -999; }
    if (defender.keyword.includes('必殺') && attacker.currentHp + atkBonus.hp > 0) { attacker.currentHp = -999; }

    // 貫通: excess damage hits face（自身キーワード or 騒乱スタンピードオーラ）
    if (hasPenetrate(attacker, atkPl) && defender.currentHp < 0) {
      dealDamage(defPl, Math.abs(defender.currentHp));
      addLog('貫通ダメージ！', 'damage');
    }

    addLog(`「${attacker.name}」が「${defender.name}」を攻撃`, null);
  }

  attacker.hasAttacked = true;
  attacker.sleeping = false;
  G.selectedCard = null;
  G.phase = 'main';
  const bar = document.getElementById('card-confirm-bar');
  bar.classList.remove('active');
  document.getElementById('confirm-play-btn').style.display = '';
  document.getElementById('confirm-cancel-btn').textContent = 'キャンセル';
  showCardDetail(null);
}

// ===== SIGIL CHANGE MODAL (天魔の魔女) =====
function showSigilChangeModal() {
  let modal = document.getElementById('modal-sigil-change');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-sigil-change';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:9999;';
    modal.innerHTML = `
      <div style="background:#1a1a2e;border:2px solid #a855f7;border-radius:12px;padding:1.5rem;max-width:420px;width:92%;text-align:center;">
        <div style="font-size:1.1rem;color:#e2b4ff;margin-bottom:1rem;font-weight:bold;">🧙‍♀️ 天魔の魔女<br><span style="font-size:0.85rem;color:#ccc;">シジルの種類を選んでください</span></div>
        <div id="sigil-change-list" style="display:flex;flex-wrap:wrap;gap:0.6rem;justify-content:center;margin-bottom:1rem;"></div>
      </div>`;
    document.body.appendChild(modal);
  }
  const list = document.getElementById('sigil-change-list');
  list.innerHTML = '';
  SIGIL_LIST.forEach(s => {
    const btn = document.createElement('button');
    const isSelected = G.player.sigil.id === s.id;
    btn.style.cssText = `background:${isSelected ? '#6d28d9' : '#2d2d4e'};border:2px solid ${isSelected ? '#a855f7' : '#555'};border-radius:8px;padding:0.6rem 0.8rem;color:#fff;cursor:pointer;min-width:100px;font-size:0.85rem;`;
    btn.innerHTML = `<div style="font-size:1.3rem">${s.icon}</div><div style="font-weight:bold">${s.name}</div><div style="font-size:0.75rem;color:#aaa;margin-top:2px">${s.desc}</div>`;
    btn.onclick = () => {
      G.player.sigil = {...s};
      addLog(`天魔の魔女：シジルを「${s.name}」に変更`, 'important');
      modal.style.display = 'none';
      renderAll();
    };
    list.appendChild(btn);
  });
  modal.style.display = 'flex';
}

// ===== HERO POWER =====
function getSigilCost() {
  return Math.max(0, 2 - (G.player.sigilDiscount || 0));
}

function useSigil() {
  if (!G.isPlayerTurn || G.gameOver) return;
  if (G.player.sigilUseCount >= G.player.sigilMaxUse) return;
  const cost = getSigilCost();
  if (G.player.mana < cost) return;

  const hp = G.player.sigil;
  const needsTarget = ['burn', 'heal', 'buff', 'debuff'].includes(hp.id);

  if (needsTarget) {
    G.phase = 'hero-targeting';
    G.selectedCard = null;
    document.getElementById('target-prompt-text').textContent = `シジル対象を選択 (${hp.name})`;
    document.getElementById('target-prompt').classList.add('active');
    renderAll();
    return;
  }

  executeSigil(null);
}

function executeSigil(target) {
  const hp = G.player.sigil;
  G.player.mana -= getSigilCost();
  G.player.sigilUseCount++;

  switch(hp.id) {
    case 'burn':
      if (target && target.type === 'face') { dealDamage(G.enemy, 1); }
      else if (target && target.card) { dealDamageToUnit(target.card, 1); }
      else dealDamage(G.enemy, 1);
      addLog('シジル発動：焦熱', 'damage');
      break;
    case 'mid':
      spawnToken(G.player, {id:'tok_mid', name:'フェアリー', type:'ユニット', cost:0, atk:1, hp:1, keyword:'', trigger:'', effect:''});
      addLog('シジル発動：召喚', 'important');
      break;
    case 'draw':
      drawCard(G.player);
      addLog('シジル発動：叡智', 'important');
      break;
    case 'heal':
      if (target && target.type === 'ally') applyHeal(G.player, 2, null);
      else if (target && target.card && target.isAlly) target.card.currentHp = Math.min(target.card.hp, target.card.currentHp + 2);
      else applyHeal(G.player, 2, null);
      addLog('シジル発動：治癒', 'heal');
      break;
    case 'buff':
      if (target && target.card) { target.card.currentAtk++; }
      addLog('シジル発動：鼓舞', 'heal');
      break;
    case 'debuff':
      if (target && target.card) {
        applyDebuffToUnit(target.card, -1, 0);
      }
      addLog('シジル発動：衰弱', 'damage');
      break;
  }

  G.phase = 'main';
  document.getElementById('target-prompt').classList.remove('active');
  cleanDeadUnits();
  checkHp(G.enemy);
  if (!G.gameOver) renderAll();
}

