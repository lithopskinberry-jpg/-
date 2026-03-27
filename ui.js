// ===== ui.js =====
// ターゲット処理・描画・詳細パネル・ツールチップ・ログ・ユーティリティ・イベント初期化

// ===== TARGET CLICKING =====
function onClickTarget(target) {
  if (G.phase === 'multi-targeting') {
    // 複数ターゲット選択モード（c82 ウィリー・ウィンキー）
    if (!G.multiTargetStore || target.type !== 'unit') return;
    const store = G.multiTargetStore;
    const alreadyIdx = store.selected.findIndex(t => t.card === target.card);
    if (alreadyIdx >= 0) {
      // 選択解除
      store.selected.splice(alreadyIdx, 1);
    } else if (store.selected.length < store.needed) {
      store.selected.push(target);
    }
    // 選択数に応じてプロンプト更新
    const remaining = store.needed - store.selected.length;
    document.getElementById('target-prompt-text').textContent =
      remaining > 0
        ? `敵ユニットを最大${store.needed}体選択中（あと${remaining}体可）`
        : `${store.selected.length}体選択済み（決定を押してください）`;
    renderAll();
  } else if (G.phase === 'targeting') {
    if (G.targetingMode) {
      executePlayCard(G.player, G.targetingMode.handIdx, target);
    }
  } else if (G.phase === 'hero-targeting') {
    executeSigil(target);
  } else if (G.phase === 'attack-select') {
    playerAttackTarget(target);
  }
}

// ===== RENDER =====
function renderAll() {
  if (!G.player) return;

  // HUD
  document.getElementById('hud-turn').textContent = `ターン ${G.turn}`;
  document.getElementById('hud-phase').textContent = G.isPlayerTurn ? 'あなたのターン' : 'AIのターン';

  // Player info
  const pHpEl = document.getElementById('player-hp');
  pHpEl.textContent = G.player.hp;
  pHpEl.className = 'info-hp' + (G.player.hp <= 8 ? ' low' : '');

  const eHpEl = document.getElementById('enemy-hp');
  eHpEl.textContent = G.enemy.hp;
  eHpEl.className = 'info-hp' + (G.enemy.hp <= 8 ? ' low' : '');

  document.getElementById('enemy-mana-text').textContent = `マナ ${G.enemy.mana}/${G.enemy.maxMana}`;

  // AIシジルバッジ
  const ehp = G.enemy.sigil;
  const badge = document.getElementById('enemy-sigil-badge');
  if (badge && ehp) badge.textContent = `${ehp.icon} ${ehp.name}：${ehp.desc}`;

  // Mana gems
  const gemsEl = document.getElementById('player-mana-gems');
  gemsEl.innerHTML = '';
  for (let i = 0; i < G.player.maxMana; i++) {
    const gem = document.createElement('div');
    gem.className = 'mana-gem' + (i < G.player.mana ? '' : ' empty');
    gemsEl.appendChild(gem);
  }
  document.getElementById('player-mana-text').textContent = `${G.player.mana}/${G.player.maxMana}`;

  // Deck counts
  document.getElementById('player-deck-count').textContent = G.player.deck.length;
  document.getElementById('enemy-deck-count').textContent = G.enemy.deck.length;

  // Fields
  renderField('player-field', G.player.field, true);
  renderField('enemy-field', G.enemy.field, false);

  // Hands
  renderHand();

  // Enemy hand (backs)
  const eh = document.getElementById('enemy-hand');
  eh.innerHTML = '';
  for (let i = 0; i < G.enemy.hand.length; i++) {
    const back = document.createElement('div');
    back.className = 'enemy-card-back';
    back.textContent = '🂠';
    eh.appendChild(back);
  }

  // Controls
  const hpBtn = document.getElementById('btn-sigil');
  const sigilRemain = G.player.sigilMaxUse - G.player.sigilUseCount;
  const sigilCountTxt = G.player.sigilMaxUse > 1 ? ` [残${sigilRemain}/${G.player.sigilMaxUse}]` : '';
  hpBtn.textContent = `${selectedSigil.icon} シジル：${selectedSigil.name} (2マナ)${sigilCountTxt}`;
  hpBtn.className = 'ctrl-sigil' + (G.player.sigilUseCount >= G.player.sigilMaxUse || G.player.mana < 2 ? ' used' : '');
  // discard中はターン終了不可
  const endBtn = document.getElementById('btn-end-turn');
  if (endBtn) endBtn.disabled = !G.isPlayerTurn || G.phase === 'discard' || G.gameOver;

  // Portrait targetable
  const pPortrait = document.getElementById('player-portrait');
  const ePortrait = document.getElementById('enemy-portrait');
  pPortrait.classList.remove('targetable');
  ePortrait.classList.remove('targetable');

  if (G.isPlayerTurn && (G.phase === 'attack-select' || G.phase === 'hero-targeting' || G.phase === 'targeting')) {
    const hasGuard = G.enemy.field.some(c => c.type === 'ユニット' && c.keyword && c.keyword.includes('守護'));
    const attackerIsHidden = G.selectedCard?.source === 'field' && G.player.field[G.selectedCard?.idx]?.keyword?.includes('隠密');
    const isHealSpell = G.targetingMode?.card && HEAL_SPELL_IDS.includes(G.targetingMode.card.id);

    if (G.phase === 'attack-select') {
      if (!hasGuard || attackerIsHidden) ePortrait.classList.add('targetable');
    } else if (G.phase === 'hero-targeting') {
      ePortrait.classList.add('targetable');
      if (selectedSigil.id === 'heal') pPortrait.classList.add('targetable');
    } else if (G.phase === 'targeting' && isHealSpell) {
      // Both portraits targetable for heal spells
      pPortrait.classList.add('targetable');
      ePortrait.classList.add('targetable');
    } else if (G.phase === 'targeting') {
      const eff = G.targetingMode?.card?.effect || '';
      if (eff.includes('相手') || eff.includes('プレイヤー一人')) ePortrait.classList.add('targetable');
    }
  }

  ePortrait.onclick = () => {
    if (G.phase === 'attack-select') onClickTarget({type:'face'});
    else if (G.phase === 'hero-targeting') onClickTarget({type:'face'});
    else if (G.phase === 'targeting') onClickTarget({type:'face', owner: 'enemy'});
  };

  pPortrait.onclick = () => {
    if (G.phase === 'hero-targeting' && selectedSigil.id === 'heal') onClickTarget({type:'ally'});
    else if (G.phase === 'targeting') onClickTarget({type:'face', owner: 'player'});
  };
}

function renderField(elId, field, isPlayer) {
  const el = document.getElementById(elId);
  el.innerHTML = '';

  const inAttackSelect = G.isPlayerTurn && G.phase === 'attack-select';
  const inTargeting = G.isPlayerTurn && (G.phase === 'targeting' || G.phase === 'hero-targeting');
  const inMultiTargeting = G.isPlayerTurn && G.phase === 'multi-targeting';

  field.forEach((card, idx) => {
    const cardEl = document.createElement('div');
    cardEl.className = 'game-card' + (card.type === '陣地' ? ' shrine' : '');
    if (card.uid) cardEl.dataset.uid = card.uid;

    const canAtk = isPlayer && G.isPlayerTurn && card.type === 'ユニット' && !card.sleeping && !card.hasAttacked;
    if (canAtk && G.phase === 'main') cardEl.classList.add('can-attack');
    if (isPlayer && G.selectedCard?.source === 'field' && G.selectedCard?.idx === idx) cardEl.classList.add('selected');
    if (card.sleeping && card.type === 'ユニット') cardEl.classList.add('exhausted');
    // 守護・障壁の視覚表示
    if (card.type === 'ユニット' && card.keyword?.includes('守護')) cardEl.classList.add('has-guard');
    if (card.type === 'ユニット' && card.keyword?.includes('障壁') && !card.shieldBroken) cardEl.classList.add('has-barrier');

    // 複数ターゲット選択モード（c82 ウィリー・ウィンキー）
    if (!isPlayer && inMultiTargeting && card.type === 'ユニット') {
      cardEl.classList.add('targetable');
      // 選択済みならselectedクラスを付与
      if (G.multiTargetStore?.selected.some(t => t.card === card)) {
        cardEl.classList.add('selected');
      }
      cardEl.onclick = () => onClickTarget({type:'unit', card, isAlly: false});
    }

    // Enemy units as targets（隠密は守護無視で任意攻撃可・アンタッチャブルではない）
    if (!isPlayer && inAttackSelect) {
      const hasGuard = field.some(c => c.type === 'ユニット' && c.keyword?.includes('守護'));
      const attackerIsHidden = G.selectedCard && G.player.field[G.selectedCard.idx]?.keyword?.includes('隠密');
      if (card.type === 'ユニット' && (!hasGuard || card.keyword?.includes('守護') || attackerIsHidden)) {
        cardEl.classList.add('targetable');
        cardEl.onclick = () => onClickTarget({type:'unit', card});
      }
    }

    // Spell/HP targeting
    if (inTargeting) {
      const mode = G.targetingMode?.card || (G.phase === 'hero-targeting' ? {effect: selectedSigil.desc} : null);
      if (mode) {
        const eff = mode.effect || '';
        const isHealSpell = G.targetingMode?.card && HEAL_SPELL_IDS.includes(G.targetingMode.card.id);

        // Heal spells: own and enemy units both targetable
        if (isHealSpell) {
          if (card.type === 'ユニット') {
            cardEl.classList.add('targetable');
            cardEl.onclick = () => onClickTarget({type:'unit', card, isAlly: isPlayer});
          }
        } else {
          if (!isPlayer && card.type === 'ユニット') {
            if (eff.includes('敵ユニット一体') || eff.includes('ユニット一体') || eff.includes('ユニット一体または') || G.phase === 'hero-targeting') {
              cardEl.classList.add('targetable');
              cardEl.onclick = () => onClickTarget({type:'unit', card, isAlly: false});
            }
          }
          if (isPlayer && card.type === 'ユニット') {
            if (eff.includes('自ユニット一体') || G.phase === 'hero-targeting' || G.targetingMode?.card?.id === 'c69') {
              cardEl.classList.add('targetable');
              cardEl.onclick = () => onClickTarget({type:'unit', card, isAlly: true});
            }
          }
        }
        // 単体除去(c47)
        if (G.targetingMode?.card?.id === 'c47') {
          if (!isPlayer && (card.type === 'ユニット' || card.type === '陣地')) {
            cardEl.classList.add('targetable');
            cardEl.onclick = () => onClickTarget({type:'unit', card});
          }
        }
        // アヌビスの天秤(c80)：敵ユニットのみ対象
        if (G.targetingMode?.card?.id === 'c80') {
          if (!isPlayer && card.type === 'ユニット') {
            cardEl.classList.add('targetable');
            cardEl.onclick = () => onClickTarget({type:'unit', card});
          }
        }
        // 陣地破壊(c61): 自分・相手どちらの陣地も対象にできる
        if (G.targetingMode?.card?.id === 'c61') {
          if (card.type === '陣地') {
            cardEl.classList.add('targetable');
            cardEl.onclick = () => onClickTarget({type:'unit', card});
          }
        }
        // 生命の冒涜(c78): 自分・相手どちらのユニットも対象
        if (G.targetingMode?.card?.id === 'c78') {
          if (card.type === 'ユニット') {
            cardEl.classList.add('targetable');
            cardEl.onclick = () => onClickTarget({type:'unit', card});
          }
        }
      }
    }

    // Click to select/attack (player) / show detail (enemy)
    if (isPlayer && G.phase === 'main') {
      // ユニットは攻撃選択へ、陣地は詳細表示のみ
      cardEl.onclick = () => playerSelectFieldUnit(idx);
    }
    // 敵カード：攻撃・ターゲット選択中でなければタップで詳細表示
    if (!isPlayer) {
      if (!cardEl.classList.contains('targetable')) {
        cardEl.onclick = () => showCardDetail(card, G.enemy);
      }
    }

    // Build content
    const pl = isPlayer ? G.player : G.enemy;

    if (card.type === 'ユニット') {
      const dAtk = isPlayer ? displayAtk(card, G.player) : displayAtk(card, G.enemy);
      const dHp  = isPlayer ? displayHp(card, G.player)  : displayHp(card, G.enemy);
      cardEl.innerHTML = `
        <div class="gc-cost ${effectiveCost(card) > (G.isPlayerTurn ? G.player.mana : G.enemy.mana) ? 'cant-pay' : ''}">${effectiveCost(card)}</div>
        <div class="gc-art"><img src="card/${card.id}.jpg" alt="${card.name}" onerror="this.parentElement.style.background='var(--bg3)'"></div>
        <div class="gc-stats"><span class="atk">${dAtk}</span><span class="hp-stat ${card.currentHp < card.hp ? 'hurt' : ''}">${dHp}</span></div>
      `;
    } else {
      // スペル・陣地：画像＋コストのみ（スタッツなし）
      const typeIcon = card.type === '陣地' ? '🏰' : '✨';
      cardEl.innerHTML = `
        <div class="gc-cost">${card.cost}</div>
        <div class="gc-art"><img src="card/${card.id}.jpg" alt="${card.name}" onerror="this.parentElement.innerHTML='<div style=\\'display:flex;align-items:center;justify-content:center;height:100%;font-size:1.4rem;\\'>${typeIcon}</div>'"></div>
      `;
    }

    addTooltip(cardEl, card);
    el.appendChild(cardEl);
  });
}

function renderHand() {
  const handEl = document.getElementById('player-hand');
  handEl.innerHTML = '';

  G.player.hand.forEach((card, idx) => {
    const cardEl = document.createElement('div');
    cardEl.className = 'game-card in-hand';
    const fieldFull = (card.type === 'ユニット' || card.type === '陣地') && G.player.field.length >= 5;
    const canPlay = effectiveCost(card) <= G.player.mana && G.isPlayerTurn && !fieldFull;
    if (canPlay) cardEl.classList.add('playable');
    if (G.selectedCard?.source === 'hand' && G.selectedCard?.idx === idx) cardEl.classList.add('selected');

    if (card.type === 'ユニット') {
      cardEl.innerHTML = `
        <div class="gc-cost ${!canPlay ? 'cant-pay' : ''}">${effectiveCost(card)}</div>
        <div class="gc-art"><img src="card/${card.id}.jpg" alt="${card.name}" onerror="this.parentElement.style.background='var(--bg3)'"></div>
        <div class="gc-stats"><span class="atk">${card.atk}</span><span class="hp-stat">${card.hp}</span></div>
      `;
    } else {
      const typeIcon = card.type === '陣地' ? '🏰' : '✨';
      cardEl.innerHTML = `
        <div class="gc-cost ${!canPlay ? 'cant-pay' : ''}">${effectiveCost(card)}</div>
        <div class="gc-art"><img src="card/${card.id}.jpg" alt="${card.name}" onerror="this.parentElement.innerHTML='<div style=\\'display:flex;align-items:center;justify-content:center;height:100%;font-size:1.4rem;\\'>${typeIcon}</div>'"></div>
      `;
    }

    if (G.phase === 'discard') {
      cardEl.classList.add('targetable');
      cardEl.onclick = () => {
        addLog(`「${card.name}」を捨てた`, 'damage');
        G.player.hand.splice(idx, 1);
        G.phase = 'main';
        G.discardMode = false;
        renderAll();
      };
    } else if (G.isPlayerTurn) {
      cardEl.onclick = () => playerPlayCard(idx);
    }

    addTooltip(cardEl, card);
    handEl.appendChild(cardEl);
  });
}

// ===== デッキ構築 カード詳細モーダル =====
let _deckModalCard = null;  // モーダルで現在表示中のカード

// カード一覧タップ → モーダルを開く（左から呼ばれる）
function showDeckCardDetail(card) {
  if (!card) return;
  _deckModalCard = card;

  // 画像
  const img = document.getElementById('ddm-img');
  const fallback = document.getElementById('ddm-icon-fallback');
  img.style.display = 'block';
  img.src = `card/${card.id}.jpg`;
  img.alt = card.name;
  fallback.style.display = 'none';
  img.onerror = () => {
    img.style.display = 'none';
    fallback.style.display = 'flex';
    fallback.textContent = TYPE_ICON[card.type] || '🃏';
  };

  // アート背景
  const art = document.getElementById('ddm-art');
  if (card.type === '陣地') art.style.background = 'linear-gradient(135deg,#1a1535,#251545)';
  else if (card.type === 'スペル') art.style.background = 'linear-gradient(135deg,#0d1a35,#1a2a5a)';
  else art.style.background = 'var(--bg3)';

  // テキスト
  document.getElementById('ddm-cost').textContent = card.cost;
  document.getElementById('ddm-name').textContent = card.name;
  document.getElementById('ddm-type').textContent = card.type;
  document.getElementById('ddm-kw').textContent = card.keyword || '';
  document.getElementById('ddm-stats').textContent =
    card.type === 'ユニット' ? `ATK ${card.atk}  /  HP ${card.hp}` : '';
  const parts = [];
  if (card.trigger) parts.push(`◆${card.trigger}`);
  if (card.effect) parts.push(card.effect);
  document.getElementById('ddm-effect').textContent = parts.join('
');

  // ボタン表示更新（追加可否・デッキ枚数）
  _updateDeckModalButtons();

  // モーダルを開く
  const modal = document.getElementById('deck-detail-modal');
  modal.style.display = 'flex';
}

// デッキリストタップ → モーダルを開く（右から呼ばれる、削除ボタンも表示）
function showDeckCardDetailFromList(card) {
  showDeckCardDetail(card);
  // 削除ボタンを必ず表示
  document.getElementById('ddm-remove-btn').style.display = 'flex';
}

function closeDeckDetailModal() {
  document.getElementById('deck-detail-modal').style.display = 'none';
  _deckModalCard = null;
}

// ボタンの有効/無効・メッセージを更新
function _updateDeckModalButtons() {
  if (!_deckModalCard) return;
  const card = _deckModalCard;
  const addBtn = document.getElementById('ddm-add-btn');
  const msg = document.getElementById('ddm-msg');
  const inDeck = playerDeck.filter(c => c.id === card.id).length;

  if (!canAddCard(card)) {
    addBtn.disabled = true;
    addBtn.style.opacity = '0.4';
    addBtn.style.cursor = 'not-allowed';
    msg.textContent = inDeck >= 2 ? `すでに${inDeck}枚入っています` : '追加上限に達しています';
  } else {
    addBtn.disabled = false;
    addBtn.style.opacity = '1';
    addBtn.style.cursor = 'pointer';
    msg.textContent = inDeck > 0 ? `現在${inDeck}枚入っています` : '';
  }
}

// モーダル内「＋ デッキに追加」
function deckModalAddCard() {
  if (!_deckModalCard || !canAddCard(_deckModalCard)) return;
  playerDeck.push({..._deckModalCard, uid: Math.random()});
  renderCardPool();
  renderDeckList();
  updateDeckCount();
  _updateDeckModalButtons();
}

// モーダル内「－ 取り外す」
function deckModalRemoveCard() {
  if (!_deckModalCard) return;
  const idx = playerDeck.findLastIndex(c => c.id === _deckModalCard.id);
  if (idx === -1) return;
  playerDeck.splice(idx, 1);
  renderCardPool();
  renderDeckList();
  updateDeckCount();
  _updateDeckModalButtons();
  // デッキから全部消えたら削除ボタンを隠す
  const inDeck = playerDeck.filter(c => c.id === _deckModalCard.id).length;
  if (inDeck === 0) document.getElementById('ddm-remove-btn').style.display = 'none';
}

// ===== CARD DETAIL PANEL =====
const TYPE_ICON = { 'ユニット':'⚔️', 'スペル':'✨', '陣地':'🏰' };
function showCardDetail(card, pl) {
  const panel = document.getElementById('card-detail-panel');
  if (!card) { panel.classList.add('hidden'); return; }
  panel.classList.remove('hidden');

  document.getElementById('cda-cost').textContent = card.cost;
  document.getElementById('cda-icon').textContent = TYPE_ICON[card.type] || '🃏';

  // typeに応じた背景色（artはimg専用エリア）
  const art = document.getElementById('cda-art');
  if (card.type === '陣地') art.style.background = 'linear-gradient(135deg,#1a1535,#251545)';
  else if (card.type === 'スペル') art.style.background = 'linear-gradient(135deg,#0d1a35,#1a2a5a)';
  else art.style.background = 'var(--bg3)';

  // 既存imgがあれば再利用、なければ作成
  let detailImg = art.querySelector('img.detail-img');
  if (!detailImg) {
    detailImg = document.createElement('img');
    detailImg.className = 'detail-img';
    detailImg.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:4px;position:absolute;top:0;left:0;';
    art.appendChild(detailImg);
  }
  detailImg.src = `card/${card.id}.jpg`;
  detailImg.alt = card.name;
  detailImg.style.display = 'block';
  detailImg.onerror = () => { detailImg.style.display = 'none'; };

  document.getElementById('cdt-name').textContent = card.name;
  document.getElementById('cdt-type').textContent = card.type;
  document.getElementById('cdt-kw').textContent = card.keyword || '';

  if (card.type === 'ユニット') {
    const isOnField = (card.currentAtk !== undefined);
    let dAtk, dHp;
    if (isOnField && pl) {
      dAtk = displayAtk(card, pl);
      dHp  = displayHp(card, pl);
    } else {
      dAtk = card.atk;
      dHp  = card.hp;
    }
    document.getElementById('cdt-stats').textContent = `ATK ${dAtk}  /  HP ${dHp}`;
  } else {
    document.getElementById('cdt-stats').textContent = '';
  }

  const parts = [];
  if (card.trigger) parts.push(`◆${card.trigger}`);
  if (card.effect) parts.push(card.effect);
  document.getElementById('cdt-effect').textContent = parts.join('　');
}

// ===== TOOLTIP =====
let _ttCard = null;
function addTooltip(el, card) {
  // タッチデバイスではツールチップ不要（詳細パネルで代替）
  if (window.matchMedia('(pointer: coarse)').matches) return;

  const parts = [];
  if (card.keyword) parts.push(`[${card.keyword}]`);
  if (card.trigger) parts.push(`◆${card.trigger}`);
  if (card.effect) parts.push(card.effect);
  if (parts.length === 0) return;

  const tt = document.getElementById('tooltip');

  // PC: hover
  el.addEventListener('mouseenter', (e) => {
    _ttCard = card;
    tt.innerHTML = `<div class="tt-name">${card.name}</div><div class="tt-effect">${parts.join('<br>')}</div>`;
    tt.classList.add('active');
    moveTT(e);
  });
  el.addEventListener('mousemove', moveTT);
  el.addEventListener('mouseleave', () => { tt.classList.remove('active'); _ttCard = null; });
}

function moveTT(e) {
  const tt = document.getElementById('tooltip');
  let x = e.clientX + 12, y = e.clientY + 12;
  if (x + 210 > window.innerWidth) x = e.clientX - 220;
  if (y + 150 > window.innerHeight) y = e.clientY - 160;
  tt.style.left = x + 'px';
  tt.style.top = y + 'px';
}

// 画面タップでツールチップを消す
document.addEventListener('touchstart', (e) => {
  const tt = document.getElementById('tooltip');
  if (tt && tt.classList.contains('active')) {
    tt.classList.remove('active');
    _ttCard = null;
  }
}, {passive: true});

// ===== LOG =====
let logCount = 0;
const MINI_LOG_MAX = 3;

function addLog(msg, cls) {
  // 非表示の本体（データ保持）
  const log = document.getElementById('game-log');
  const entry = document.createElement('div');
  entry.className = 'log-entry' + (cls ? ` ${cls}` : '');
  entry.textContent = msg;
  log.appendChild(entry);

  // ドロワーにも追記（最新が上になるようprepend）
  const drawer = document.getElementById('log-drawer-body');
  if (drawer) {
    const de = document.createElement('div');
    de.className = 'log-entry' + (cls ? ` ${cls}` : '');
    de.textContent = msg;
    drawer.prepend(de);
  }

  // ミニログ更新（直近3行を常時表示）
  const mini = document.getElementById('mini-log');
  if (mini) {
    const me = document.createElement('div');
    me.className = 'mini-log-entry' + (cls ? ` ${cls}` : '');
    me.textContent = msg;
    mini.appendChild(me);
    while (mini.children.length > MINI_LOG_MAX) mini.removeChild(mini.firstChild);
  }

  // バッジ更新（ドロワーが閉じている時のみカウント）
  const drawerEl = document.getElementById('log-drawer');
  if (!drawerEl || !drawerEl.classList.contains('active')) {
    logCount++;
    const badge = document.getElementById('log-badge');
    if (badge) badge.textContent = logCount > 99 ? '99+' : logCount;
  }
}

function toggleLogDrawer() {
  const drawer = document.getElementById('log-drawer');
  drawer.classList.toggle('active');
  // ドロワーを開いたらバッジをリセット
  if (drawer.classList.contains('active')) {
    logCount = 0;
    const badge = document.getElementById('log-badge');
    if (badge) badge.textContent = '0';
  }
}

function setStatus(msg) {
  document.getElementById('ctrl-status').textContent = msg;
}

// ===== UTILS =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');

  if (id === 'deck') initDeckBuild();
  if (id === 'hero') initHeroSelect();
  if (id === 'stats') { refreshSimDeckSelects(); updateSimDeckUI(); }
}

// ===== INIT EVENTS =====
document.getElementById('btn-end-turn').onclick = () => {
  if (G.isPlayerTurn && !G.gameOver) endTurn();
};

document.getElementById('btn-cancel-target').onclick = () => {
  G.phase = 'main';
  G.selectedCard = null;
  G.targetingMode = null;
  G.multiTargetStore = null;
  document.getElementById('btn-confirm-multi').style.display = 'none';
  document.getElementById('target-prompt').classList.remove('active');
  document.getElementById('card-confirm-bar').classList.remove('active');
  renderAll();
};

document.getElementById('btn-sigil').onclick = useSigil;

document.getElementById('btn-restart').onclick = () => {
  document.getElementById('game-overlay').classList.remove('active');
  showScreen('hero');
};

// ===== DECK STORAGE (storage layer - swap this function for app migration) =====
const STORAGE_KEY = 'dcg_saved_decks';

function storageSaveDecks(decks) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(decks)); return true; }
  catch(e) { console.error('保存失敗:', e); return false; }
}

function storageLoadDecks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch(e) { return {}; }
}

function saveCurrentDeck() {
  const name = document.getElementById('deck-name-input').value.trim();
  if (!name) { alert('デッキ名を入力してください'); return; }
  if (playerDeck.length !== 30) { alert('30枚のデッキが必要です'); return; }
  const decks = storageLoadDecks();
  decks[name] = playerDeck.map(c => c.id);
  if (storageSaveDecks(decks)) {
    refreshSavedDeckSelect();
    document.getElementById('deck-name-input').value = '';
    alert(`「${name}」を保存しました`);
  }
}

function loadSelectedDeck() {
  const sel = document.getElementById('saved-deck-select').value;
  if (!sel) return;
  const decks = storageLoadDecks();
  const ids = decks[sel];
  if (!ids) return;
  playerDeck = [];
  ids.forEach(id => {
    const card = ALL_CARDS.find(c => c.id === id);
    if (card) playerDeck.push({...card, uid: Math.random()});
  });
  renderCardPool();
  renderDeckList();
  updateDeckCount();
}

function deleteSelectedDeck() {
  const sel = document.getElementById('saved-deck-select').value;
  if (!sel) return;
  if (!confirm(`「${sel}」を削除しますか？`)) return;
  const decks = storageLoadDecks();
  delete decks[sel];
  storageSaveDecks(decks);
  refreshSavedDeckSelect();
}

function refreshSavedDeckSelect() {
  const sel = document.getElementById('saved-deck-select');
  const decks = storageLoadDecks();
  sel.innerHTML = '<option value="">── 保存済みデッキ ──</option>';
  Object.keys(decks).forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  });
}


// ===== DECK EXPORT / IMPORT =====

function exportDecks() {
  const decks = storageLoadDecks();
  if (Object.keys(decks).length === 0) {
    alert('保存済みデッキがありません');
    return;
  }
  const json = JSON.stringify(decks, null, 2);
  document.getElementById('export-textarea').value = json;
  document.getElementById('modal-export').style.display = 'flex';
}

function importDecks() {
  document.getElementById('import-textarea').value = '';
  document.getElementById('import-error').textContent = '';
  document.getElementById('modal-import').style.display = 'flex';
}

function doImport() {
  const raw = document.getElementById('import-textarea').value.trim();
  const errEl = document.getElementById('import-error');
  if (!raw) { errEl.textContent = 'テキストを貼り付けてください'; return; }
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch(e) { errEl.textContent = '形式エラー：正しいエクスポートデータを貼り付けてください'; return; }
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    errEl.textContent = 'データ形式が不正です'; return;
  }
  // 既存デッキとマージ（同名は上書き）
  const existing = storageLoadDecks();
  const merged = { ...existing, ...parsed };
  storageSaveDecks(merged);
  refreshSavedDeckSelect();
  document.getElementById('modal-import').style.display = 'none';
  const count = Object.keys(parsed).length;
  alert(`${count}件のデッキをインポートしました`);
}

function copyExportText() {
  const ta = document.getElementById('export-textarea');
  ta.select();
  document.execCommand('copy');
  const btn = document.getElementById('btn-copy-export');
  btn.textContent = 'コピー済み ✓';
  setTimeout(() => btn.textContent = 'コピー', 2000);
}

// ===== INIT EVENTS (deck save) =====
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-save-deck')?.addEventListener('click', saveCurrentDeck);
  document.getElementById('btn-load-deck')?.addEventListener('click', loadSelectedDeck);
  document.getElementById('btn-delete-deck')?.addEventListener('click', deleteSelectedDeck);
  document.getElementById('btn-export-decks')?.addEventListener('click', exportDecks);
  document.getElementById('btn-import-decks')?.addEventListener('click', importDecks);
  initHeroSelect();
});
