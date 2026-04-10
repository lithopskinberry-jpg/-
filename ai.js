// ===== ai.js =====
// AI思考ロジック（Easy / Normal）

// ===== AI =====
function aiTurn() {
  if (G.gameOver) return;
  document.getElementById('ai-thinking').style.display = 'block';
  // Normal: update memory before acting
  if (G.aiDifficulty === 'normal') {
    G.aiMemory.prevPlayerField = G.player.field.map(c => c.id);
    G.aiMemory.prevPlayerHp = G.player.hp;
  }
  setTimeout(() => { aiAct(); }, 600);
}

function aiAct() {
  if (G.gameOver) { document.getElementById('ai-thinking').style.display = 'none'; return; }
  if (G.aiDifficulty === 'normal') { aiActNormal(); return; }
  const ai = G.enemy;
  const player = G.player;

  // Prioritize lethal
  const playerHp = player.hp;
  const totalDamage = ai.field.filter(c => c.type === 'ユニット' && !c.sleeping && !c.hasAttacked)
    .reduce((s, u) => s + u.currentAtk, 0);

  // Play cards greedily (lowest cost first, highest value)
  let played = false;
  const fieldFull = ai.field.length >= 5;
  const playable = ai.hand
    .map((c, i) => ({c, i}))
    .filter(({c}) => effectiveCost(c) <= ai.mana && !(fieldFull && (c.type === 'ユニット' || c.type === '陣地')))
    .sort((a, b) => effectiveCost(b.c) - effectiveCost(a.c));

  if (playable.length > 0) {
    // Easy AI：相手フィールドにアラクネがいるとき、HP2以下のユニットは召喚しない
    const playerHasArakne = player.field.some(c => c.id === 'c92' && c.effect !== '【無効化済み】');

    // 実際に使えるカード（スペルはターゲットが存在するもの・今ターンスキップ済みを除く）を先頭から探す
    const skipSet = G.aiSkipCards || new Set();
    const pick = playable.find(({c: nc, i: ni}) => {
      if (skipSet.has(ni)) return false;
      if (nc.type !== 'スペル') return true;
      return getAISpellTarget(nc, ai, player) !== null;
    });

    // アラクネ対応フィルタ（Easy：HP3以上のユニットは通常通り出す、HP2以下はスキップ）
    const pickFiltered = playable.find(({c: nc, i: ni}) => {
      if (skipSet.has(ni)) return false;
      if (playerHasArakne && nc.type === 'ユニット' && nc.hp <= 2) return false;
      if (nc.type !== 'スペル') return true;
      return getAISpellTarget(nc, ai, player) !== null;
    });

    const finalPick = playerHasArakne ? pickFiltered : pick;

    if (finalPick) {
      const {c, i} = finalPick;
      let target = null;
      if (c.type === 'スペル') {
        target = getAISpellTarget(c, ai, player);
        if (target === null) {
          // 対象なし：このカードはパス（手札に残す）して再度プレイ選定へ
          G.aiSkipCards = G.aiSkipCards || new Set();
          G.aiSkipCards.add(i);
          if (!G.gameOver) setTimeout(aiAct, 200);
          return;
        }
      } else if (c.id === 'c82') { // ウィリー・ウィンキー：プレイヤーユニット2体を睡眠
        const targets82 = player.field.filter(u => u.type === 'ユニット').sort((a,b) => b.currentAtk - a.currentAtk);
        if (targets82.length >= 2) {
          target = { type:'multi', targets: [{card: targets82[0]}, {card: targets82[1]}] };
        } else if (targets82.length === 1) {
          target = { type:'unit', card: targets82[0] };
        }
      } else if (c.type === 'ユニット' && c.trigger === '登場時' && c.effect.includes('相手')) {
        target = {type: 'face'};
      } else if (c.type === 'ユニット' && c.trigger === '登場時' && c.effect.includes('敵ユニット一体')) {
        const weakest = player.field.filter(u => u.type === 'ユニット').sort((a,b) => a.currentHp - b.currentHp)[0];
        target = weakest ? {type: 'unit', card: weakest} : {type: 'face'};
      }
      executePlayCard(ai, i, target);
      if (!G.gameOver) setTimeout(aiAct, 400);
      return;
    }
    // 使えるカードが全て条件未達スペルの場合はフォールスルーしてシジル・攻撃フェーズへ
  }

  // シジル発動（AI）
  if (ai.sigilUseCount < ai.sigilMaxUse && ai.mana >= 2) {
    const hp = ai.sigil;
    let target = null;
    switch(hp.id) {
      case 'burn': 
        const weakUnit = player.field.filter(c => c.type === 'ユニット').sort((a,b) => a.currentHp - b.currentHp)[0];
        target = weakUnit ? {type:'unit', card: weakUnit} : {type:'face'};
        break;
      case 'heal': target = {type:'ally'}; break;
      case 'buff':
        const strongest = ai.field.filter(c => c.type === 'ユニット').sort((a,b) => b.currentAtk - a.currentAtk)[0];
        if (strongest) target = {type:'unit', card: strongest, isAlly: true};
        break;
      case 'debuff':
        const strongEnemy = player.field.filter(c => c.type === 'ユニット').sort((a,b) => b.currentAtk - a.currentAtk)[0];
        if (strongEnemy) target = {type:'unit', card: strongEnemy};
        break;
    }
    ai.mana -= 2;
    ai.sigilUseCount++;
    switch(hp.id) {
      case 'burn':
        if (target && target.type === 'unit') dealDamageToUnit(target.card, 1);
        else dealDamage(player, 1);
        addLog('AIシジル発動：焦熱', 'damage');
        break;
      case 'mid': spawnToken(ai, {id:'tok_mid', name:'フェアリー', type:'ユニット', cost:0, atk:1, hp:1, keyword:'', trigger:'', effect:''}); addLog('AIシジル発動：召喚','important'); break;
      case 'draw': drawCard(ai); addLog('AIシジル発動：叡智','important'); break;
      case 'heal': addLog('AIシジル発動：治癒', 'heal'); applyHeal(ai, 2, null); break;
      case 'buff': if (target && target.card) { target.card.currentAtk++; } addLog('AIシジル発動：鼓舞','heal'); break;
      case 'debuff': if (target && target.card) { applyDebuffToUnit(target.card, -1, 0); } addLog('AIシジル発動：衰弱','damage'); break;
    }
    cleanDeadUnits();
    checkHp(player);
    if (G.gameOver) { document.getElementById('ai-thinking').style.display = 'none'; renderAll(); return; }
    setTimeout(aiAct, 400);
    return;
  }

  // Attack with units
  const attackers = ai.field.filter(c => c.type === 'ユニット' && !c.sleeping && !c.hasAttacked);
  if (attackers.length > 0) {
    const attacker = attackers[0];
    const guardUnits = player.field.filter(c => c.type === 'ユニット' && c.keyword && c.keyword.includes('守護'));
    let target;

    if (guardUnits.length > 0) {
      target = {type:'unit', card: guardUnits[0]};
    } else if (player.field.filter(c => c.type === 'ユニット').length > 0) {
      const weakEnemy = player.field.filter(c => c.type === 'ユニット').sort((a,b) => a.currentHp - b.currentHp)[0];
      if (weakEnemy && weakEnemy.currentHp <= attacker.currentAtk && weakEnemy.currentAtk >= 3) {
        target = {type:'unit', card: weakEnemy};
      } else {
        target = {type:'face'};
      }
    } else {
      target = {type:'face'};
    }

    const defCard = target.type === 'unit' ? target.card : null;
    animAttack(attacker, false).then(() => {
      executeAttack(ai, attacker, player, target);
      const dmgPromises = [];
      if (defCard) { dmgPromises.push(animDamage(defCard)); dmgPromises.push(animDamage(attacker)); }
      else dmgPromises.push(animFaceDamage(true));
      return Promise.all(dmgPromises);
    }).then(() => {
      cleanDeadUnits();
      checkHp(player);
      checkHp(ai);
      if (G.gameOver) { document.getElementById('ai-thinking').style.display = 'none'; renderAll(); return; }
      setTimeout(aiAct, 300);
    });
    return;
  }

  // End turn
  document.getElementById('ai-thinking').style.display = 'none';
  renderAll();
  setTimeout(() => {
    if (!G.gameOver) aiEndTurn();
  }, 500);
}

function getAISpellTarget(card, ai, player) {
  switch(card.id) {
    case 'c4': case 'c22': case 'c40': return {type:'ally'};
    case 'c5': case 'c10': case 'c31': case 'c71': case 'c73': {
      const t = player.field.filter(c => c.type === 'ユニット').sort((a,b) => b.currentAtk - a.currentAtk)[0];
      return t ? {type:'unit', card:t} : (card.id === 'c5' ? null : {type:'face'});
    }
    case 'c47': {
      const t = player.field.filter(c => c.type === 'ユニット' || c.type === '陣地').sort((a,b) => (b.currentAtk||0) - (a.currentAtk||0))[0];
      return t ? {type:'unit', card:t} : null;
    }
    case 'c80': { // アヌビスの天秤：最高ATKの敵ユニットを狙う（障壁持ちを優先）
      const shielded80 = player.field.filter(c => c.type === 'ユニット' && c.keyword?.includes('障壁') && !c.shieldBroken);
      if (shielded80.length) return {type:'unit', card: shielded80.sort((a,b) => b.currentAtk - a.currentAtk)[0]};
      const t80 = player.field.filter(c => c.type === 'ユニット').sort((a,b) => b.currentAtk - a.currentAtk)[0];
      return t80 ? {type:'unit', card:t80} : null;
    }
    case 'c61': { // 陣地破壊
      const t = player.field.filter(c => c.type === '陣地')[0];
      return t ? {type:'unit', card:t} : null;
    }
    case 'c76': { // 星を落とす魔法：盤面ATK合計+8≧相手HPなら撃つ、それ以外はnullで不使用
      const fieldAtk = ai.field.filter(c => c.type === 'ユニット').reduce((s, u) => s + u.currentAtk, 0);
      return (fieldAtk + 8 >= player.hp) ? {type:'face'} : null;
    }
    case 'c78': { // 生命の冒涜：最高ATKの敵ユニットを優先、なければ自分の最低コストユニット
      const strongEnemy = player.field.filter(c => c.type === 'ユニット').sort((a,b) => b.currentAtk - a.currentAtk)[0];
      if (strongEnemy) return {type:'unit', card: strongEnemy};
      const weakAlly = ai.field.filter(c => c.type === 'ユニット').sort((a,b) => a.cost - b.cost)[0];
      return weakAlly ? {type:'unit', card: weakAlly} : null;
    }
    case 'c86': { // ハルマゲドン：相手の盤面が自分より強い時だけ使う
      const myPow   = ai.field.filter(c => c.type === 'ユニット').reduce((s,u) => s + u.currentAtk + u.currentHp, 0);
      const oppPow  = player.field.filter(c => c.type === 'ユニット').reduce((s,u) => s + u.currentAtk + u.currentHp, 0);
      return oppPow > myPow ? {type:'face'} : null;
    }
    case 'c90': { // 鏡写し：HPが最も高い（ATKより高い）敵ユニットを狙う
      const t90 = player.field.filter(c => c.type === 'ユニット' && c.currentHp > c.currentAtk)
        .sort((a, b) => (b.currentHp - b.currentAtk) - (a.currentHp - a.currentAtk))[0];
      return t90 ? {type:'unit', card:t90} : null;
    }
    case 'c69': { // 風精の追い風：自ユニットにバフ。いなければパス
      const strongest = ai.field.filter(c => c.type === 'ユニット').sort((a,b) => b.currentAtk - a.currentAtk)[0];
      return strongest ? { type:'unit', card: strongest, isAlly: true } : null;
    }
    // c62: ジャーンの書はターゲット不要（AI処理はapplySpell内で完結）
    default: return {type:'face'};
  }
}

// ===== NORMAL AI =====

// カードのシナジー価値を評価する（aiRoleベース・ID非依存）
function aiCardValue(card, ai, player) {
  let val = card.cost; // ベースはコスト
  const role = card.aiRole || '';
  const isSpell = card.type === 'スペル';

  // === aiRoleベースのシナジー判断 ===

  // 場にhealSynergyユニットがいるなら healSpell を最優先
  const hasHealSynergy = ai.field.some(c => c.aiRole === 'healSynergy');
  if (hasHealSynergy && role === 'healSpell') val += 4;

  // 場にspellSynergyユニットがいるならスペル全般を優先
  const hasSpellSynergy = ai.field.some(c => c.aiRole === 'spellSynergy');
  if (hasSpellSynergy && isSpell) val += 3;

  // healSynergyユニット自体：手札にhealSpellがあれば出す価値が高い
  if (role === 'healSynergy' && ai.hand.some(c => c.aiRole === 'healSpell')) val += 3;

  // spellSynergyユニット自体：手札にスペルが2枚以上あれば出す価値が高い
  if (role === 'spellSynergy' && ai.hand.filter(c => c.type === 'スペル').length >= 2) val += 2;

  // fieldBuff：場のユニット数に応じて価値が上下
  if (role === 'fieldBuff') {
    const unitCount = ai.field.filter(c => c.type === 'ユニット').length;
    val += unitCount * 2;
    if (unitCount === 0) val -= 10; // 場が空なら事実上封印
  }

  // finisher：相手HPが15以下なら価値上昇
  if (role === 'finisher' && player.hp <= 15) val += 3;

  // emergencyHeal：自分HPが低いほど価値上昇
  if (role === 'emergencyHeal') {
    if (ai.hp <= 5) val += 8;
    else if (ai.hp <= 10) val += 4;
  }

  // boardClear：相手フィールドのユニット数が多いほど価値上昇
  if (role === 'boardClear') {
    const enemyCount = player.field.filter(c => c.type === 'ユニット').length;
    val += enemyCount * 2;
    if (enemyCount === 0) val -= 8;
  }

  // ハルマゲドン(c86)：相手の盤面が強いほど価値上昇、自分の盤面が多いほど下げる
  if (card.id === 'c86') {
    const myUnits   = ai.field.filter(c => c.type === 'ユニット').length;
    const myShrines = ai.field.filter(c => c.type === '陣地').length;
    val -= (myUnits + myShrines) * 2; // 自分の盤面破壊コスト
  }

  // 魔女の工房(c85)：手札に高コストカードがあるほど価値上昇
  if (card.id === 'c85') {
    const maxHandCost = ai.hand.length > 0 ? Math.max(...ai.hand.map(c => c.cost)) : 0;
    if (maxHandCost >= 7) val += 4;
    else if (maxHandCost >= 5) val += 2;
    else val -= 4; // 軽いカードしかなければ価値低
  }

  // === 盤面状況による汎用補正 ===

  // 前ターンに相手が強ユニットを新たに出した→除去系を優先
  const newThreats = player.field.filter(c =>
    c.type === 'ユニット' &&
    !G.aiMemory.prevPlayerField.includes(c.id) &&
    c.currentAtk >= 4
  );
  if (newThreats.length > 0) {
    if (role === 'boardClear') val += 3;
    if (card.effect?.includes('破壊') || card.effect?.includes('点ダメ')) val += 2;
  }

  // 相手HPが10以下→フィニッシャー・速攻・ダメスペル優先
  if (player.hp <= 10) {
    if (role === 'finisher') val += 4;
    if (card.keyword?.includes('速攻')) val += 3;
    if (isSpell && card.effect?.includes('点ダメ')) val += 2;
  }

  // 自分HPが10以下→回復優先
  if (ai.hp <= 10) {
    if (role === 'healSpell') val += 3;
    if (role === 'emergencyHeal') val += 4;
  }

  // 守護が場にいないとき→守護ユニットを優先
  const hasGuard = ai.field.some(c => c.type === 'ユニット' && c.keyword?.includes('守護'));
  if (!hasGuard && card.keyword?.includes('守護')) val += 2;

  // 速攻：相手守護がいないときフェイス詰め補正
  if (card.keyword?.includes('速攻') && !player.field.some(c => c.keyword?.includes('守護'))) val += 1;

  // trap（アラクネ）：相手の手札にユニットが多いほど価値上昇
  if (role === 'trap') {
    const enemyUnitCardsInHand = player.hand ? player.hand.filter(c => c.type === 'ユニット').length : 3; // 相手手札は非公開なので推定3
    val += enemyUnitCardsInHand;
    // 相手フィールドにユニットが多い＝これ以上出してくる可能性大
    val += player.field.filter(c => c.type === 'ユニット').length;
  }

  return val;
}

// Normal AI のカード選択：価値順にプレイ
function aiNormalPickCard(ai, player) {
  const fieldFull = ai.field.length >= 5;
  const playerHasArakne = player.field.some(c => c.id === 'c92' && c.effect !== '【無効化済み】');

  // Normal AI アラクネ対応：除去札を最優先で探す
  if (playerHasArakne) {
    const removalCards = ai.hand
      .map((c, i) => ({c, i}))
      .filter(({c}) => effectiveCost(c) <= ai.mana)
      .filter(({c}) => {
        // アラクネを直接除去できるカード（単体除去スペル・ユニット）
        if (c.id === 'c47' || c.id === 'c80' || c.id === 'c78') return true;
        if (c.type === 'スペル' && (c.effect.includes('破壊') || c.effect.includes('全体'))) return true;
        return false;
      });
    if (removalCards.length > 0) {
      // 除去カードが見つかればそれを最優先
      const pick = removalCards[0];
      const target = getAINormalSpellTarget(pick.c, ai, player) || { type:'unit', card: player.field.find(c => c.id === 'c92') };
      return { ...pick, val: 999, _arakneTarget: target };
    }
    // 除去札なし：HP3以上のユニットのみ出す（HP2以下はスキップ）
    const playable = ai.hand
      .map((c, i) => ({c, i, val: aiCardValue(c, ai, player)}))
      .filter(({c}) => effectiveCost(c) <= ai.mana && !(fieldFull && (c.type === 'ユニット' || c.type === '陣地')))
      .filter(({c}) => !(c.type === 'ユニット' && c.hp <= 2))
      .sort((a, b) => b.val - a.val);
    return playable[0] || null;
  }

  const skipSetN = G.aiSkipCards || new Set();
  const playable = ai.hand
    .map((c, i) => ({c, i, val: aiCardValue(c, ai, player)}))
    .filter(({c, i}) => !skipSetN.has(i) && effectiveCost(c) <= ai.mana && !(fieldFull && (c.type === 'ユニット' || c.type === '陣地')))
    .sort((a, b) => b.val - a.val);
  return playable[0] || null;
}

// Normal AI の攻撃判断：トレードvsフェイスをより賢く
function aiNormalAttack(attacker, ai, player) {
  const guardUnits = player.field.filter(c => c.type === 'ユニット' && c.keyword?.includes('守護'));
  if (guardUnits.length > 0) {
    // 守護は必ず倒す。倒せるものを優先
    const killable = guardUnits.filter(g => g.currentHp <= attacker.currentAtk);
    return { type:'unit', card: killable[0] || guardUnits[0] };
  }

  const enemies = player.field.filter(c => c.type === 'ユニット');

  // 相手HPがatr以下→顔面
  if (player.hp <= attacker.currentAtk) return { type:'face' };

  // 回復バフユニット(c30)は育てるためになるべく生存優先→強い相手ユニットに踏まれる前に除去
  const threatToMe = enemies.filter(e =>
    e.currentAtk >= attacker.currentHp && e.currentAtk >= 3
  ).sort((a,b) => b.currentAtk - a.currentAtk);

  if (threatToMe.length > 0) {
    // こちらが先制持ちなら倒せる相手のみトレード
    const atkFirst = attacker.keyword?.includes('先制');
    const target = threatToMe[0];
    if (atkFirst && target.currentHp <= attacker.currentAtk) return { type:'unit', card: target };
    if (!atkFirst && target.currentHp <= attacker.currentAtk && attacker.currentHp > target.currentAtk) {
      return { type:'unit', card: target };
    }
  }

  // 一方的に倒せる相手がいればトレード
  const oneshot = enemies.filter(e =>
    e.currentHp <= attacker.currentAtk && e.currentAtk < attacker.currentHp
  ).sort((a,b) => b.currentAtk - a.currentAtk);
  if (oneshot.length > 0) return { type:'unit', card: oneshot[0] };

  return { type:'face' };
}

function aiActNormal() {
  if (G.gameOver) { document.getElementById('ai-thinking').style.display = 'none'; return; }
  const ai = G.enemy;
  const player = G.player;

  // --- カードプレイ ---
  const pick = aiNormalPickCard(ai, player);
  if (pick) {
    const { c, i } = pick;
    // アラクネ除去優先フラグがあればそのターゲットをそのまま使う
    let target = pick._arakneTarget || null;
    if (!target) {
      if (c.type === 'スペル') {
        target = getAINormalSpellTarget(c, ai, player);
        if (target === null) {
          // 対象なし：このカードはパス（手札に残す）して再度プレイ選定へ
          G.aiSkipCards = G.aiSkipCards || new Set();
          G.aiSkipCards.add(i);
          if (!G.gameOver) setTimeout(aiActNormal, 200);
          return;
        }
      } else if (c.id === 'c82') { // ウィリー・ウィンキー：ATK高い順にプレイヤーユニット2体を睡眠
        const targets82 = player.field.filter(u => u.type === 'ユニット').sort((a,b) => b.currentAtk - a.currentAtk);
        if (targets82.length >= 2) {
          target = { type:'multi', targets: [{card: targets82[0]}, {card: targets82[1]}] };
        } else if (targets82.length === 1) {
          target = { type:'unit', card: targets82[0] };
        }
      } else if (c.type === 'ユニット' && c.trigger === '登場時' && c.effect.includes('相手')) {
        target = { type:'face' };
      } else if (c.type === 'ユニット' && c.trigger === '登場時' && c.effect.includes('敵ユニット一体')) {
        const t = player.field.filter(c => c.type === 'ユニット').sort((a,b) => b.currentAtk - a.currentAtk)[0];
        target = t ? { type:'unit', card:t } : { type:'face' };
      }
    }
    executePlayCard(ai, i, target);
    if (!G.gameOver) setTimeout(aiActNormal, 400);
    return;
  }

  // --- シジル ---
  if (ai.sigilUseCount < ai.sigilMaxUse && ai.mana >= 2) {
    const hp = ai.sigil;
    let target = null;
    const hasHealBuff = ai.field.some(c => c.aiRole === 'healSynergy');
    switch(hp.id) {
      case 'burn': {
        // 相手HP10以下ならフェイス、さもなくば最も脅威なユニット
        const t = player.field.filter(c => c.type === 'ユニット').sort((a,b) => b.currentAtk - a.currentAtk)[0];
        target = (player.hp <= 10 || !t) ? { type:'face' } : { type:'unit', card:t };
        break;
      }
      case 'heal':
        // healSynergyユニットがいれば優先してそちらに
        if (hasHealBuff) {
          const hbu = ai.field.find(c => c.aiRole === 'healSynergy');
          target = { type:'unit', card: hbu, isAlly: true };
        } else {
          target = { type:'ally' };
        }
        break;
      case 'buff': {
        // healSynergyユニットか最ATKにバフ
        const hbu = ai.field.find(c => c.aiRole === 'healSynergy');
        const strongest = ai.field.filter(c => c.type === 'ユニット').sort((a,b) => b.currentAtk - a.currentAtk)[0];
        const tgt = hbu || strongest;
        if (tgt) target = { type:'unit', card: tgt, isAlly: true };
        break;
      }
      case 'debuff': {
        const t = player.field.filter(c => c.type === 'ユニット').sort((a,b) => b.currentAtk - a.currentAtk)[0];
        if (t) target = { type:'unit', card: t };
        break;
      }
    }
    ai.mana -= 2;
    ai.sigilUseCount++;
    switch(hp.id) {
      case 'burn':
        if (target && target.type === 'unit') dealDamageToUnit(target.card, 1);
        else dealDamage(player, 1);
        addLog('AIシジル発動：焦熱', 'damage'); break;
      case 'mid': spawnToken(ai, {id:'tok_mid', name:'フェアリー', type:'ユニット', cost:0, atk:1, hp:1, keyword:'', trigger:'', effect:''}); addLog('AIシジル発動：召喚','important'); break;
      case 'draw': drawCard(ai); addLog('AIシジル発動：叡智','important'); break;
      case 'heal':
        addLog('AIシジル発動：治癒','heal');
        if (target && target.card) target.card.currentHp = Math.min(target.card.hp, target.card.currentHp + 2);
        else applyHeal(ai, 2, null);
        break;
      case 'buff': if (target?.card) { target.card.currentAtk++; } addLog('AIシジル発動：鼓舞','heal'); break;
      case 'debuff': if (target?.card) { applyDebuffToUnit(target.card, -1, 0); } addLog('AIシジル発動：衰弱','damage'); break;
    }
    cleanDeadUnits();
    checkHp(player);
    if (G.gameOver) { document.getElementById('ai-thinking').style.display = 'none'; renderAll(); return; }
    setTimeout(aiActNormal, 400);
    return;
  }

  // --- ユニット攻撃 ---
  const attackers = ai.field.filter(c =>
    c.type === 'ユニット' && !c.sleeping && !c.hasAttacked
  );
  if (attackers.length > 0) {
    const attacker = attackers[0];
    const target = aiNormalAttack(attacker, ai, player);
    const defCard = target.type === 'unit' ? target.card : null;
    animAttack(attacker, false).then(() => {
      executeAttack(ai, attacker, player, target);
      const dmgPromises = [];
      if (defCard) { dmgPromises.push(animDamage(defCard)); dmgPromises.push(animDamage(attacker)); }
      else dmgPromises.push(animFaceDamage(true));
      return Promise.all(dmgPromises);
    }).then(() => {
      cleanDeadUnits();
      checkHp(player);
      checkHp(ai);
      if (G.gameOver) { document.getElementById('ai-thinking').style.display = 'none'; renderAll(); return; }
      setTimeout(aiActNormal, 300);
    });
    return;
  }

  // --- ターン終了 ---
  document.getElementById('ai-thinking').style.display = 'none';
  renderAll();
  setTimeout(() => { if (!G.gameOver) aiEndTurn(); }, 500);
}

function getAINormalSpellTarget(card, ai, player) {
  switch (card.id) {

    // ===== 回復スペル =====
    case 'c4': case 'c22': case 'c40': {
      const hbu = ai.field.find(c => c.aiRole === 'healSynergy');
      if (hbu) return { type:'unit', card: hbu, isAlly: true };
      return { type:'ally' };
    }
    case 'c32': case 'c41':
      return { type:'ally' };

    // ===== 単体デバフ =====
    case 'c5': { // 土精の足枷：最高ATK敵ユニット、いなければ不使用
      const t = player.field.filter(c => c.type === 'ユニット').sort((a,b) => b.currentAtk - a.currentAtk)[0];
      return t ? { type:'unit', card:t } : null;
    }

    // ===== 単体ダメージ =====
    case 'c10': { // 火精の火遊び：2点 → HPが2以下を優先（ジャスキル）、なければ最高ATK
      const killable = player.field.filter(c => c.type === 'ユニット' && c.currentHp <= 2).sort((a,b) => b.currentAtk - a.currentAtk)[0];
      if (killable) return { type:'unit', card: killable };
      const t = player.field.filter(c => c.type === 'ユニット').sort((a,b) => b.currentAtk - a.currentAtk)[0];
      return t ? { type:'unit', card:t } : null;
    }
    case 'c31': { // トールハンマー：4点 → HPが4以下を優先（ジャスキル）、なければ最高ATK
      const killable = player.field.filter(c => c.type === 'ユニット' && c.currentHp <= 4).sort((a,b) => b.currentAtk - a.currentAtk)[0];
      if (killable) return { type:'unit', card: killable };
      const t = player.field.filter(c => c.type === 'ユニット').sort((a,b) => b.currentAtk - a.currentAtk)[0];
      return t ? { type:'unit', card:t } : null;
    }
    case 'c71': { // ダモクレスの剣：ATKが高い敵ほど効率が高い
      const t = player.field.filter(c => c.type === 'ユニット').sort((a,b) => b.currentAtk - a.currentAtk)[0];
      return t ? { type:'unit', card:t } : null;
    }
    case 'c80': { // アヌビスの天秤：障壁持ちを優先、なければ最高ATK
      const shielded = player.field.filter(c => c.type === 'ユニット' && c.keyword?.includes('障壁') && !c.shieldBroken);
      if (shielded.length) return { type:'unit', card: shielded.sort((a,b) => b.currentAtk - a.currentAtk)[0] };
      const t = player.field.filter(c => c.type === 'ユニット').sort((a,b) => b.currentAtk - a.currentAtk)[0];
      return t ? { type:'unit', card:t } : null;
    }

    // ===== 単体バフ =====
    case 'c69': { // 風精の追い風：healSynergyか最高ATKユニットにバフ
      const hbu = ai.field.find(c => c.aiRole === 'healSynergy');
      const strongest = ai.field.filter(c => c.type === 'ユニット').sort((a,b) => b.currentAtk - a.currentAtk)[0];
      const tgt = hbu || strongest;
      return tgt ? { type:'unit', card: tgt, isAlly: true } : null;
    }

    // ===== 単体除去 =====
    case 'c47': { // 破壊の言霊：最高ATKのユニット/陣地を破壊
      const t = player.field.filter(c => c.type === 'ユニット' || c.type === '陣地')
        .sort((a,b) => (b.currentAtk||0) - (a.currentAtk||0))[0];
      return t ? { type:'unit', card:t } : null;
    }
    case 'c73': { // リリス：守護・障壁・高ATK優先
      const t = player.field.filter(c => c.type === 'ユニット')
        .sort((a,b) => {
          const aScore = (a.keyword?.includes('守護')?3:0) + (a.keyword?.includes('障壁')?2:0) + (a.currentAtk||0);
          const bScore = (b.keyword?.includes('守護')?3:0) + (b.keyword?.includes('障壁')?2:0) + (b.currentAtk||0);
          return bScore - aScore;
        })[0];
      return t ? { type:'unit', card:t } : null;
    }
    case 'c97': { // サキュバス：キーワード持ちの敵ユニット優先、なければATK高い敵ユニット
      const withKw = player.field.filter(c => c.type === 'ユニット' && c.keyword);
      const t = (withKw.length > 0 ? withKw : player.field.filter(c => c.type === 'ユニット'))
        .sort((a,b) => b.currentAtk - a.currentAtk)[0];
      return t ? { type:'unit', card:t } : null;
    }
    case 'c78': { // 生命の冒涜：最高ATK敵、なければ自分の最低コストユニット
      const strongEnemy = player.field.filter(c => c.type === 'ユニット').sort((a,b) => b.currentAtk - a.currentAtk)[0];
      if (strongEnemy) return { type:'unit', card: strongEnemy };
      const weakAlly = ai.field.filter(c => c.type === 'ユニット').sort((a,b) => a.cost - b.cost)[0];
      return weakAlly ? { type:'unit', card: weakAlly } : null;
    }

    // ===== 陣地破壊 =====
    case 'c61': { // 万陣破：相手の陣地を狙う
      const t = player.field.filter(c => c.type === '陣地')[0];
      return t ? { type:'unit', card:t } : null;
    }

    // ===== 鏡写し =====
    case 'c90': { // HPがATKより高い敵を弱体化
      const t = player.field.filter(c => c.type === 'ユニット' && c.currentHp > c.currentAtk)
        .sort((a,b) => (b.currentHp - b.currentAtk) - (a.currentHp - a.currentAtk))[0];
      return t ? { type:'unit', card:t } : null;
    }

    // ===== フィニッシャー =====
    case 'c76': { // 星を落とす魔法：盤面ATK合計+8で削りきれる時のみ
      const fieldAtk = ai.field.filter(c => c.type === 'ユニット').reduce((s,u) => s + u.currentAtk, 0);
      return (fieldAtk + 8 >= player.hp) ? { type:'face' } : null;
    }

    // ===== 全体除去 =====
    case 'c52': case 'c86': { // ラグナロク・ハルマゲドン：相手盤面が自分より強い時のみ
      const myPow  = ai.field.filter(c => c.type === 'ユニット').reduce((s,u) => s + u.currentAtk + u.currentHp, 0);
      const oppPow = player.field.filter(c => c.type === 'ユニット').reduce((s,u) => s + u.currentAtk + u.currentHp, 0);
      return oppPow > myPow ? { type:'face' } : null;
    }

    // ===== 全体ダメージ・全体デバフ：敵ユニットがいる時のみ =====
    case 'c11': case 'c39': case 'c57': case 'c81': case 'c21': case 'c72':
      return player.field.some(c => c.type === 'ユニット') ? { type:'face' } : null;

    // ===== ターゲット不要系（ドロー・マナ・全体バフ・トークンなど） =====
    default:
      return { type:'face' };
  }
}

