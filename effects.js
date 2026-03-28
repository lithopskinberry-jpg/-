// ===== effects.js =====
// カード効果トリガーリスナー登録・解除

// ===== TRIGGER LISTENER SYSTEM =====
// カードがフィールドに入ったとき、そのカードのトリガーをリスナーに登録する
function onCardEnterField(pl, bc) {
  const opp = pl === G.player ? G.enemy : G.player;
  const uid = bc.uid;
  const id  = bc.id;

  // --- ターン開始時 (SOT) ---
  if (id === 'c48') { // スーサイドロー
    pl.sotListeners.push({ uid, fn: () => {
      if (!pl.field.some(c => c.uid === uid)) return;
      pl.hp -= 1;
      drawCard(pl);
      addLog(`${pl === G.player ? 'あなた' : 'AI'}はスーサイドロー：1点ダメージ＆1ドロー`, 'damage');
      checkHp(pl);
    }});
  }
  if (id === 'c93') { // ミルメコレオ：自・相手ターン開始時にATKとHPを入れ替え
    // 自ターン開始時
    pl.sotListeners.push({ uid, fn: () => {
      const self = pl.field.find(c => c.uid === uid);
      if (!self || self.effect === '【無効化済み】') return;
      const tmpAtk = self.currentAtk;
      self.currentAtk = self.currentHp;
      self.currentHp = tmpAtk;
      // 基準HPも同期（最大HPとして扱う）
      self.hp = self.currentHp;
      addLog(`${pl === G.player ? '' : 'AI：'}ミルメコレオ：ATK/HPを入れ替え（${self.currentAtk}/${self.currentHp}）`, 'important');
      if (self.currentHp <= 0) {
        onCardLeaveField(pl, uid);
        pl.field = pl.field.filter(c => c.uid !== uid);
        addLog(`ミルメコレオはHP0で死亡`, 'damage');
        triggerDeathrattle(self, pl);
      }
      renderAll();
    }});
    // 相手ターン開始時
    pl.oppSotListeners.push({ uid, fn: () => {
      const self = pl.field.find(c => c.uid === uid);
      if (!self || self.effect === '【無効化済み】') return;
      const tmpAtk = self.currentAtk;
      self.currentAtk = self.currentHp;
      self.currentHp = tmpAtk;
      self.hp = self.currentHp;
      addLog(`${pl === G.player ? '' : 'AI：'}ミルメコレオ：ATK/HPを入れ替え（${self.currentAtk}/${self.currentHp}）`, 'important');
      if (self.currentHp <= 0) {
        onCardLeaveField(pl, uid);
        pl.field = pl.field.filter(c => c.uid !== uid);
        addLog(`ミルメコレオはHP0で死亡`, 'damage');
        triggerDeathrattle(self, pl);
      }
      renderAll();
    }});
  }
  if (id === 'c94') { // ペリュトン：相手ターン開始時に影トークン（1/1 守護）×2召喚
    pl.oppSotListeners.push({ uid, fn: () => {
      if (!pl.field.some(c => c.uid === uid)) return;
      const shadowToken = { id:'tok_c94', name:'影', type:'ユニット', cost:0, atk:1, hp:1, keyword:'守護', trigger:'', effect:'' };
      let spawned = 0;
      for (let i = 0; i < 2; i++) {
        if (pl.field.length >= 5) break;
        spawnToken(pl, shadowToken);
        spawned++;
      }
      if (spawned > 0) addLog(`${pl === G.player ? '' : 'AI：'}ペリュトン：影トークン×${spawned}体召喚`, 'important');
      renderAll();
    }});
  }

  if (id === 'c85') { // 魔女の工房：手札の最高コストカードを2下げる
    pl.sotListeners.push({ uid, fn: () => {
      if (!pl.field.some(c => c.uid === uid)) return;
      if (pl.hand.length === 0) return;
      const maxCost = Math.max(...pl.hand.map(c => c.cost));
      const target = pl.hand.find(c => c.cost === maxCost);
      if (target) {
        target.cost = Math.max(0, target.cost - 2);
        addLog(`${pl === G.player ? 'あなた' : 'AI'}：魔女の工房：「${target.name}」のコストが2下がった`, 'heal');
        if (pl === G.player) renderHand();
      }
    }});
  }

  // --- 自分のターン終了時 (EOT) ---
  if (id === 'c23') { // フェアリーベル
    pl.eotListeners.push({ uid, fn: () => {
      if (!pl.field.some(c => c.uid === uid)) return;
      const units = pl.field.filter(u => u.type === 'ユニット');
      if (units.length > 0) {
        const t = units[Math.floor(Math.random() * units.length)];
        t.currentAtk++; t.currentHp++; t.hp++;
        animBuff(t);
        addLog(`フェアリーベル：「${t.name}」+1/+1`, 'heal');
      }
    }});
  }
  if (id === 'c37') { // 回復エンジン
    pl.eotListeners.push({ uid, fn: () => {
      const card = pl.field.find(c => c.uid === uid);
      if (!card || card.effect === '【無効化済み】') return;
      card.currentHp = Math.min(card.hp, card.currentHp + 2);
      addLog(`回復エンジン発動：自身のHPを2回復`, 'heal');
    }});
  }
  if (id === 'c67') { // 育成
    pl.eotListeners.push({ uid, fn: () => {
      const card = pl.field.find(c => c.uid === uid);
      if (!card || card.effect === '【無効化済み】') return;
      const others = pl.field.filter(u => u.type === 'ユニット' && u !== card);
      if (others.length > 0) {
        const t = others[Math.floor(Math.random() * others.length)];
        t.currentAtk++; t.currentHp++; t.hp++;
        addLog(`育成：「${t.name}」+1/+1`, 'heal');
      }
    }});
  }
  if (id === 'c83') { // マンドラゴラ農園（自ターン終了時：相手ユニット1体に睡眠）
    pl.eotListeners.push({ uid, fn: () => {
      if (!pl.field.some(c => c.uid === uid)) return;
      const targets = opp.field.filter(c => c.type === 'ユニット' && !c.sleeping);
      if (targets.length > 0) {
        const t = targets[Math.floor(Math.random() * targets.length)];
        if (!checkShield(t)) {
          t.sleeping = true;
          t.hasAttacked = true;
          addLog(`マンドラゴラ農園：「${t.name}」を睡眠にした`, 'damage');
        }
      }
    }});
  }

  // --- 相手ターン終了時 (OppEOT) ---
  if (id === 'c53') { // 鷲獅子の黄金洞
    pl.oppEotListeners.push({ uid, fn: () => {
      if (!pl.field.some(c => c.uid === uid)) return;
      spawnToken(pl, {...ALL_CARDS.find(c=>c.id==='c26'), cost:0, uid:Math.random()});
      addLog(`${pl === G.player ? '' : 'AI：'}鷲獅子の黄金洞：グリフォン召喚`, 'important');
    }});
  }
  if (id === 'c70') { // 茨の檻
    pl.oppEotListeners.push({ uid, fn: () => {
      if (!pl.field.some(c => c.uid === uid)) return;
      dealDamage(opp, 1);
      addLog(`${pl === G.player ? '茨の檻：相手に1点ダメ' : '茨の檻（AI）：1点ダメージを受けた'}`, 'damage');
    }});
  }

  // --- 相手召喚時 (OppSummon) ---
  if (id === 'c92') { // アラクネ：相手召喚時に2点
    pl.oppSummonListeners.push({ uid, fn: (summonedCard) => {
      const self = pl.field.find(c => c.uid === uid);
      if (!self || self.effect === '【無効化済み】') return;
      dealDamageToUnit(summonedCard, 2);
      addLog(`アラクネ発動：「${summonedCard.name}」に2点ダメージ`, 'damage');
    }});
  }

  // --- 自スペル・陣地使用時 (Spell) ---
  if (id === 'c29') { // ホムンクルス：自スペル使用時に+1/+1
    pl.spellListeners.push({ uid, fn: () => {
      const self = pl.field.find(c => c.uid === uid);
      if (!self || self.effect === '【無効化済み】') return;
      self.currentAtk++; self.currentHp++;
      addLog('スペルシナジー：+1/+1', 'heal');
    }});
  }

  if (id === 'c95') { // マーリン：自スペル使用時に1ドロー
    pl.spellListeners.push({ uid, fn: () => {
      const self = pl.field.find(c => c.uid === uid);
      if (!self || self.effect === '【無効化済み】') return;
      if (pl.deck.length > 0) {
        pl.hand.push(pl.deck.pop());
        addLog('マーリン発動：1ドロー', 'heal');
      }
    }});
  }

  // --- 相手スペル・陣地使用時 (OppSpell) ---
  if (id === 'c84') { // オートマタ：相手スペル・陣地使用時に相手2点
    pl.oppSpellListeners.push({ uid, fn: (casterPl) => {
      const self = pl.field.find(c => c.uid === uid);
      if (!self || self.effect === '【無効化済み】') return;
      dealDamage(casterPl, 2);
      addLog(`オートマタ発動：${casterPl === G.player ? 'あなた' : 'AI'}に2点ダメージ`, 'damage');
    }});
  }

  // --- 回復時 (Heal) ---
  if (id === 'c30') { // ユニコーン：自分のプレイヤーが回復するたびに+1/+1
    pl.healListeners.push({ uid, fn: () => {
      const self = pl.field.find(c => c.uid === uid);
      if (!self || self.effect === '【無効化済み】') return;
      self.currentAtk++;
      self.currentHp++;
      addLog(`ユニコーン発動：+1/+1`, 'heal');
    }});
  }

  // --- 被ダメ時・ユニット被ダメ時 (Damaged) ---
  if (id === 'c74') { // メガイラ：自分プレイヤーまたは自身がダメージを受けたとき、相手の最低HPユニットに1点
    // プレイヤー被ダメ
    pl.damagedListeners.push({ uid, fn: () => {
      if (G.gameOver) return;
      const self = pl.field.find(c => c.uid === uid);
      if (!self || self.effect === '【無効化済み】') return;
      const oppPl = pl === G.player ? G.enemy : G.player;
      const enemies = oppPl.field.filter(c => c.type === 'ユニット' && c.currentHp > 0);
      if (enemies.length === 0) return;
      const lowestHp = enemies.reduce((a, b) => (a.currentHp <= b.currentHp ? a : b));
      if (checkShield(lowestHp)) { addLog('メガイラ：障壁に弾かれた', 'damage'); return; }
      lowestHp.currentHp -= 1;
      addLog(`メガイラ発動：「${lowestHp.name}」に1点`, 'damage');
      cleanDeadUnits();
    }});
    // ユニット（自身）被ダメ
    pl.unitDamagedListeners.push({ uid, fn: (damagedUnit) => {
      if (G.gameOver) return;
      if (damagedUnit.uid !== uid) return; // 自分自身が対象のときのみ
      const self = pl.field.find(c => c.uid === uid);
      if (!self || self.effect === '【無効化済み】') return;
      const oppPl = pl === G.player ? G.enemy : G.player;
      const enemies = oppPl.field.filter(c => c.type === 'ユニット' && c.currentHp + getAuraBonus(oppPl).hp > 0);
      if (enemies.length === 0) return;
      const lowestHp = enemies.reduce((a, b) =>
        (a.currentHp + getAuraBonus(oppPl).hp <= b.currentHp + getAuraBonus(oppPl).hp ? a : b));
      if (checkShield(lowestHp)) { addLog('メガイラ：障壁に弾かれた', 'damage'); return; }
      lowestHp.currentHp -= 1;
      addLog(`メガイラ発動：「${lowestHp.name}」に1点`, 'damage');
    }});
  }

  // --- HP0時 (HpZero) ---
  if (id === 'c42') { // 不死鳥の揺籃：HP0になる瞬間にHPを5にして自壊
    pl.hpZeroListeners.push({ uid, fn: () => {
      const idx = pl.field.findIndex(c => c.uid === uid);
      if (idx < 0) return false;
      pl.hp = 5;
      pl.field.splice(idx, 1);
      onCardLeaveField(pl, uid);
      addLog(`不死鳥の揺籃発動：HPが5に回復！`, 'heal');
      return true; // 敗北回避を呼び元に通知
    }});
  }

  // --- 攻撃時 (Attack) ---
  if (id === 'c44') { // タラスク：攻撃するたびに自身の攻撃力+2
    pl.attackListeners.push({ uid, fn: (attacker) => {
      if (attacker.uid !== uid) return;
      const self = pl.field.find(c => c.uid === uid);
      if (!self || self.effect === '【無効化済み】') return;
      self.currentAtk += 2;
      addLog(`「${self.name}」攻撃時+2/0`, 'important');
    }});
  }
  if (id === 'c66') { // ケットシー：攻撃するたびに1ドロー
    pl.attackListeners.push({ uid, fn: (attacker) => {
      if (attacker.uid !== uid) return;
      const self = pl.field.find(c => c.uid === uid);
      if (!self || self.effect === '【無効化済み】') return;
      drawCard(pl);
      addLog('ケットシー：攻撃時1ドロー', 'important');
    }});
  }
}

// ===== NULLIFY =====
// リリス等でユニットを無効化するときに呼ぶ共通処理。
// ・effect/keyword/trigger/aiRoleをクリアしてフラグを立てる
// ・「場にある限り有効」な状態変数（sigilDiscountなど）をここで解除する
// 今後このような即時加算型の永続効果を追加した場合は、このswitch内に解除処理を書く。
function applyNullify(unit) {
  const ownerPl = G.player.field.includes(unit) ? G.player : G.enemy;
  // 「場にある限り有効」な状態変数の解除
  switch (unit.id) {
    case 'c100': // 天魔の魔女：シジルコスト割引を解除
      ownerPl.sigilDiscount = Math.max(0, (ownerPl.sigilDiscount || 0) - 2);
      addLog('天魔の魔女の効果が無効化：シジルコストが元に戻った', 'damage');
      break;
    // 将来のカード追加時はここに case を追加する
  }
  // 無効化フラグを立てる（リスナー系はfn内のチェックで自動停止する）
  unit.keyword = '';
  unit.trigger = '';
  unit.effect  = '【無効化済み】';
  unit.aiRole  = '';
}

// カードがフィールドから離れたとき、そのuidのリスナーをすべて解除する
function onCardLeaveField(pl, uid) {
  // 天魔の魔女(c100)が場を離れる場合、シジルコスト割引を解除
  if (pl === G.player) {
    const leaving = pl.field.find(c => c.uid === uid);
    if (leaving && leaving.id === 'c100') {
      G.player.sigilDiscount = Math.max(0, (G.player.sigilDiscount || 0) - 2);
      addLog('天魔の魔女が場を離れた：シジルコストが元に戻った', 'damage');
    }
  }
  pl.sotListeners           = pl.sotListeners.filter(l => l.uid !== uid);
  pl.eotListeners           = pl.eotListeners.filter(l => l.uid !== uid);
  pl.oppEotListeners        = pl.oppEotListeners.filter(l => l.uid !== uid);
  pl.oppSotListeners        = pl.oppSotListeners.filter(l => l.uid !== uid);
  pl.oppSummonListeners     = pl.oppSummonListeners.filter(l => l.uid !== uid);
  pl.spellListeners         = pl.spellListeners.filter(l => l.uid !== uid);
  pl.oppSpellListeners      = pl.oppSpellListeners.filter(l => l.uid !== uid);
  pl.healListeners          = pl.healListeners.filter(l => l.uid !== uid);
  pl.damagedListeners       = pl.damagedListeners.filter(l => l.uid !== uid);
  pl.unitDamagedListeners   = pl.unitDamagedListeners.filter(l => l.uid !== uid);
  pl.attackListeners        = pl.attackListeners.filter(l => l.uid !== uid);
  pl.hpZeroListeners        = pl.hpZeroListeners.filter(l => l.uid !== uid);
}

function triggerStartOfTurn(pl) {
  // リスナー方式に統一
  [...pl.sotListeners].forEach(l => l.fn());
}

function triggerOppStartOfTurn(pl) {
  [...pl.oppSotListeners].forEach(l => l.fn());
}

function triggerEndOfTurn(pl) {
  // ターン終了時に睡眠を解除
  pl.field.forEach(c => { c.sleeping = false; });
  // リスナー方式に統一（登録順に処理）
  [...pl.eotListeners].forEach(l => l.fn());
}

// 相手ターン終了時トリガーをまとめて発火する（自分のターンが終わった＝相手にとってoppEOT）
function triggerOppEndOfTurn(pl) {
  [...pl.oppEotListeners].forEach(l => l.fn());
}

function endTurn() {
  if (G.gameOver) return;
  if (G.phase === 'discard') { addLog('捨てるカードを選んでください', null); return; }
  triggerEndOfTurn(G.player);
  // プレイヤーターン終了時 = AIにとっての「相手ターン終了時」
  triggerOppEndOfTurn(G.enemy);
  cleanDeadUnits();
  checkHp(G.player);
  checkHp(G.enemy);
  if (G.gameOver) return;

  G.selectedCard = null;
  G.phase = 'main';
  G.isPlayerTurn = !G.isPlayerTurn;
  renderAll();
  startTurn();
}

function aiEndTurn() {
  if (G.gameOver) return;
  triggerEndOfTurn(G.enemy);
  // AIターン終了時 = プレイヤーにとっての「相手ターン終了時」
  triggerOppEndOfTurn(G.player);

  cleanDeadUnits();
  checkHp(G.player);
  checkHp(G.enemy);
  if (G.gameOver) return;

  G.selectedCard = null;
  G.phase = 'main';
  G.isPlayerTurn = true;
  G.turn++;
  renderAll();
  startTurn();
}

