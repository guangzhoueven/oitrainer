/* coach.js - 教练成长系统
 *
 * 教练随带队积累经验升级，每升 1 级获得 1 技能点，可自由分配到三条技能线：
 *   训练线：提高训练效率、降低训练压力、加快每周压力恢复
 *   经营线：争取赞助、精打细算、维护优化（都是省钱/赚钱）
 *   比赛线：奖励机制、扩大影响、赛后总结（比赛结算更肥）
 *
 * 设计取向：全部是「加法」，不改变原有难度曲线，只给玩家更多正向选择与 build 差异。
 * 数据挂在 game.coach 上（{level, exp, points, skills}），随存档一起序列化；
 * 旧存档没有该字段时由 ensure() 补齐，因此完全向后兼容。
 *
 * 所有对外函数都做防御式封装：取不到 game 或抛异常时返回安全默认值（倍率 1 / 加成 0），
 * 绝不会影响游戏本体。
 */
const CoachManager = (function() {
  'use strict';

  const STYLE_ID = 'coach-style';

  /* ---------- 技能定义 ----------
   * effect(lvl) 返回人类可读的效果说明；hook 倍率由下方 getXxx 系列函数给出
   */
  const SKILLS = [
    // 训练线
    { id: 'train_eff', line: 'train', name: '高效训练', max: 3, per: 0.06,
      desc: '训练知识增益 +6%/级' },
    { id: 'train_calm', line: 'train', name: '从容训练', max: 3, per: 0.08,
      desc: '训练产生的压力 -8%/级' },
    { id: 'train_rest', line: 'train', name: '张弛有度', max: 3, per: 3,
      desc: '每周压力恢复额外 +3/级' },
    // 经营线
    { id: 'mgmt_sponsor', line: 'mgmt', name: '争取赞助', max: 3, per: 800,
      desc: '每周固定经费 +¥800/级' },
    { id: 'mgmt_build', line: 'mgmt', name: '精打细算', max: 3, per: 0.08,
      desc: '设施升级费用 -8%/级' },
    { id: 'mgmt_upkeep', line: 'mgmt', name: '维护优化', max: 3, per: 0.12,
      desc: '每周维护费 -12%/级' },
    // 比赛线
    { id: 'contest_fund', line: 'contest', name: '奖励机制', max: 3, per: 0.15,
      desc: '比赛结算经费 +15%/级' },
    { id: 'contest_repu', line: 'contest', name: '扩大影响', max: 3, per: 2,
      desc: '比赛结算声誉 +2/级' },
    { id: 'contest_recap', line: 'contest', name: '赛后总结', max: 3, per: 1,
      desc: '比赛后全队最弱知识点 +1/级' }
  ];

  const LINES = [
    { id: 'train', name: '训练' },
    { id: 'mgmt', name: '经营' },
    { id: 'contest', name: '比赛' }
  ];

  const EXP_SOURCES = '经验来源：每周 +10、模拟赛 +5、比赛晋级 +6/人、奖牌（金 40 / 银 25 / 铜 15）、IOI 参赛 +50';

  /* ---------- 状态存取（全部防御式） ---------- */
  function ensure(game) {
    if (!game || typeof game !== 'object') return null;
    if (!game.coach || typeof game.coach !== 'object') game.coach = {};
    const c = game.coach;
    if (typeof c.level !== 'number' || !(c.level >= 1)) c.level = 1;
    if (typeof c.exp !== 'number' || !(c.exp >= 0)) c.exp = 0;
    if (typeof c.points !== 'number' || !(c.points >= 0)) c.points = 0;
    if (!c.skills || typeof c.skills !== 'object') c.skills = {};
    // 清洗非法技能等级
    for (const def of SKILLS) {
      const v = Number(c.skills[def.id]);
      c.skills[def.id] = (v > 0) ? Math.min(Math.floor(v), def.max) : 0;
    }
    return c;
  }
  function expToNext(level) { return level * 50; }

  function skillLevel(game, id) {
    const c = ensure(game);
    if (!c) return 0;
    const v = Number(c.skills[id]);
    return v > 0 ? v : 0;
  }
  function defOf(id) { return SKILLS.find(d => d.id === id) || null; }

  /* ---------- 效果倍率（供游戏本体调用） ---------- */
  function gainMul(game) { return 1 + 0.06 * skillLevel(game, 'train_eff'); }
  function pressureMul(game) { return Math.max(0.2, 1 - 0.08 * skillLevel(game, 'train_calm')); }
  function recoveryBonus(game) { return 3 * skillLevel(game, 'train_rest'); }
  function weeklyFund(game) { return 800 * skillLevel(game, 'mgmt_sponsor'); }
  function buildCostMul(game) { return Math.max(0.5, 1 - 0.08 * skillLevel(game, 'mgmt_build')); }
  function upkeepMul(game) { return Math.max(0.4, 1 - 0.12 * skillLevel(game, 'mgmt_upkeep')); }
  function contestFundMul(game) { return 1 + 0.15 * skillLevel(game, 'contest_fund'); }
  function contestRepuBonus(game) { return 2 * skillLevel(game, 'contest_repu'); }
  function contestKnowledgeBonus(game) { return 1 * skillLevel(game, 'contest_recap'); }

  /* ---------- 经验与升级 ---------- */
  function notify(text) {
    try {
      if (window.toastManager && typeof window.toastManager.show === 'function') {
        window.toastManager.show(text, 'success');
      } else if (window.pushEvent) {
        window.pushEvent({ name: '教练升级', description: text, week: window.game ? window.game.week : 0 });
      }
    } catch (e) { /* ignore */ }
  }

  function addExp(game, n, reason) {
    const c = ensure(game);
    if (!c) return;
    n = Math.floor(Number(n) || 0);
    if (n <= 0) return;
    c.exp += n;
    let leveled = 0;
    while (c.exp >= expToNext(c.level)) {
      c.exp -= expToNext(c.level);
      c.level += 1;
      c.points += 1;
      leveled += 1;
    }
    if (leveled > 0) {
      const text = '教练升到 Lv.' + c.level + '，获得 ' + leveled + ' 技能点' + (reason ? '（' + reason + '）' : '');
      try { if (typeof log === 'function') log('[教练] ' + text); } catch (e) {}
      notify(text);
      refreshButton();
      try { if (window.AchievementManager) window.AchievementManager.check(game); } catch (e) {}
    }
  }

  /** 比赛结算经验：按晋级人数与奖牌等级发放，IOI 另有参赛奖励 */
  function awardContestExp(game, results, compName) {
    const c = ensure(game);
    if (!c || !Array.isArray(results)) return;
    let exp = 0;
    let medalGold = 0, medalSilver = 0, medalBronze = 0, passedCount = 0;
    for (const r of results) {
      if (!r || r.notParticipated) continue;
      if (r.medal === 'gold') { exp += 40; medalGold++; }
      else if (r.medal === 'silver') { exp += 25; medalSilver++; }
      else if (r.medal === 'bronze') { exp += 15; medalBronze++; }
      else if (r.passed) { exp += 6; passedCount++; }
    }
    if (compName === 'IOI' && exp > 0) exp += 50;
    if (exp > 0) {
      const detail = (medalGold || medalSilver || medalBronze)
        ? ('奖牌 金' + medalGold + '/银' + medalSilver + '/铜' + medalBronze + (passedCount ? '，晋级 ' + passedCount : ''))
        : ('晋级 ' + passedCount + ' 人');
      addExp(game, exp, compName + '：' + detail + '，+' + exp + ' 经验');
    }
  }

  /** 赛后总结：给每名在训学生最弱的知识点补上加成 */
  const KNOW_KEYS = ['knowledge_ds', 'knowledge_graph', 'knowledge_string', 'knowledge_math', 'knowledge_dp'];
  function weakestKnowledgeKey(s) {
    let key = KNOW_KEYS[0], min = Infinity;
    for (const k of KNOW_KEYS) {
      const v = Number(s[k]) || 0;
      if (v < min) { min = v; key = k; }
    }
    return key;
  }
  function applyContestWrapup(game) {
    try {
      const bonus = contestKnowledgeBonus(game);
      if (bonus <= 0 || !game || !Array.isArray(game.students)) return;
      const names = [];
      for (const s of game.students) {
        if (!s || s.active === false) continue;
        const key = weakestKnowledgeKey(s);
        s[key] = (Number(s[key]) || 0) + bonus;
        names.push(s.name);
      }
      if (names.length > 0 && typeof log === 'function') {
        log('[教练] 赛后总结：' + names.join('、') + ' 最弱知识点 +' + bonus);
      }
    } catch (e) { console.error('applyContestWrapup error', e); }
  }

  /* ---------- 技能分配 ---------- */
  function allocate(game, id) {
    const c = ensure(game);
    const def = defOf(id);
    if (!c || !def) return { ok: false, msg: '技能不存在' };
    if (c.points < 1) return { ok: false, msg: '技能点不足，升级后可获得技能点' };
    if (c.skills[id] >= def.max) return { ok: false, msg: '该技能已满级' };
    c.points -= 1;
    c.skills[id] = (c.skills[id] || 0) + 1;
    refreshButton();
    try { if (window.AchievementManager) window.AchievementManager.check(window.game); } catch (e) {}
    return { ok: true, msg: def.name + ' 升到 Lv.' + c.skills[id] };
  }

  function resetSkills(game) {
    const c = ensure(game);
    if (!c) return { ok: false, msg: '无教练数据' };
    let spent = 0;
    for (const def of SKILLS) spent += (c.skills[def.id] || 0);
    if (spent === 0) return { ok: false, msg: '当前没有已投入的技能点' };
    for (const def of SKILLS) c.skills[def.id] = 0;
    c.points += spent;
    refreshButton();
    return { ok: true, msg: '已返还 ' + spent + ' 技能点' };
  }

  /* ---------- 汇总（供面板显示） ---------- */
  function summary(game) {
    const c = ensure(game);
    if (!c) return null;
    return {
      level: c.level,
      exp: c.exp,
      expNext: expToNext(c.level),
      points: c.points,
      totalSpent: SKILLS.reduce((a, d) => a + (c.skills[d.id] || 0), 0)
    };
  }

  /* ---------- 面板 UI ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = `
      .coach-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10500;display:flex;align-items:center;justify-content:center;animation:coachFade .2s ease;}
      @keyframes coachFade{from{opacity:0;}to{opacity:1;}}
      .coach-panel{background:#141a24;color:#e8eaf0;border:1px solid #2b3648;border-radius:14px;width:min(720px,92vw);
        max-height:84vh;display:flex;flex-direction:column;box-shadow:0 12px 48px rgba(0,0,0,.5);}
      .coach-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #2b3648;}
      .coach-head h3{margin:0;font-size:17px;}
      .coach-close{background:none;border:1px solid #2b3648;color:#e8eaf0;border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:14px;}
      .coach-close:hover{background:#2b3648;}
      .coach-body{padding:16px 20px;overflow:auto;}
      .coach-stat{background:#1b2330;border:1px solid #2b3648;border-radius:10px;padding:12px 14px;font-size:14px;line-height:1.8;}
      .coach-bar{height:8px;background:#0f1420;border:1px solid #2b3648;border-radius:6px;overflow:hidden;margin:6px 0;}
      .coach-bar > i{display:block;height:100%;background:#4caf50;}
      .coach-muted{font-size:12px;color:#8a97ab;}
      .coach-line-title{margin:16px 0 8px;font-size:14px;font-weight:700;color:#ffca28;border-left:3px solid #ffca28;padding-left:8px;}
      .coach-skills{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;}
      .coach-skill{background:#1b2330;border:1px solid #2b3648;border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px;}
      .coach-skill.maxed{border-color:#4caf50;}
      .cs-head{display:flex;align-items:center;justify-content:space-between;gap:8px;}
      .cs-name{font-weight:700;font-size:14px;}
      .cs-lvl{font-size:12px;color:#8a97ab;}
      .cs-desc{font-size:12px;color:#b9c3d1;line-height:1.5;}
      .cs-now{font-size:12px;color:#8bc34a;}
      .coach-btn{background:#1976d2;color:#fff;border:none;border-radius:8px;padding:7px 12px;font-size:13px;cursor:pointer;align-self:flex-start;}
      .coach-btn:hover{background:#1565c0;}
      .coach-btn[disabled]{background:#37474f;cursor:not-allowed;opacity:.6;}
      .coach-btn.ghost{background:#263238;border:1px solid #2b3648;color:#e8eaf0;}
      .coach-btn.ghost:hover{background:#2f3d4f;}
      .coach-msg{margin-top:12px;font-size:13px;min-height:18px;}
      .coach-msg.err{color:#ef5350;}
      .coach-msg.ok{color:#8bc34a;}
    `;
    document.head.appendChild(st);
  }

  /** 某技能当前档位的数值说明 */
  function effectText(def, lvl) {
    const v = def.per * lvl;
    switch (def.id) {
      case 'train_eff': return '当前：知识增益 +' + Math.round(v * 100) + '%';
      case 'train_calm': return '当前：训练压力 -' + Math.round(v * 100) + '%';
      case 'train_rest': return '当前：每周压力恢复 +' + v;
      case 'mgmt_sponsor': return '当前：每周 +¥' + v;
      case 'mgmt_build': return '当前：升级费 -' + Math.round(v * 100) + '%';
      case 'mgmt_upkeep': return '当前：维护费 -' + Math.round(v * 100) + '%';
      case 'contest_fund': return '当前：比赛经费 +' + Math.round(v * 100) + '%';
      case 'contest_repu': return '当前：比赛声誉 +' + v;
      case 'contest_recap': return '当前：赛后最弱知识点 +' + v;
      default: return '';
    }
  }

  function closePanel() {
    const ov = document.getElementById('coach-overlay');
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
  }

  function openPanel() {
    try {
      ensureStyle();
      closePanel();
      const game = window.game;
      const c = ensure(game);
      if (!c) return null;
      const s = summary(game);
      const pct = Math.max(0, Math.min(100, Math.round(s.exp / s.expNext * 100)));

      let skillsHtml = '';
      for (const line of LINES) {
        skillsHtml += '<div class="coach-line-title">' + esc(line.name) + '线</div><div class="coach-skills">';
        for (const def of SKILLS.filter(d => d.line === line.id)) {
          const lvl = c.skills[def.id] || 0;
          const maxed = lvl >= def.max;
          skillsHtml +=
            '<div class="coach-skill' + (maxed ? ' maxed' : '') + '">' +
              '<div class="cs-head"><span class="cs-name">' + esc(def.name) + '</span>' +
              '<span class="cs-lvl">Lv.' + lvl + ' / ' + def.max + '</span></div>' +
              '<div class="cs-desc">' + esc(def.desc) + '</div>' +
              '<div class="cs-now">' + esc(effectText(def, lvl)) + '</div>' +
              (maxed
                ? '<span class="coach-muted">已满级</span>'
                : '<button class="coach-btn" data-skill="' + esc(def.id) + '"' + (c.points < 1 ? ' disabled' : '') + '>升级（剩 ' + c.points + ' 点）</button>') +
            '</div>';
        }
        skillsHtml += '</div>';
      }

      const ov = document.createElement('div');
      ov.id = 'coach-overlay';
      ov.className = 'coach-overlay';
      ov.innerHTML =
        '<div class="coach-panel" role="dialog" aria-label="教练">' +
          '<div class="coach-head"><h3>教练 · Lv.' + s.level + '</h3>' +
          '<button class="coach-close" aria-label="关闭">✕</button></div>' +
          '<div class="coach-body">' +
            '<div class="coach-stat">' +
              '经验 <b>' + s.exp + '</b> / <b>' + s.expNext + '</b> · 可用技能点 <b>' + s.points + '</b> · 已投入 <b>' + s.totalSpent + '</b>' +
              '<div class="coach-bar"><i style="width:' + pct + '%"></i></div>' +
              '<div class="coach-muted">' + esc(EXP_SOURCES) + '</div>' +
            '</div>' +
            skillsHtml +
            '<div style="margin-top:14px;display:flex;gap:10px;align-items:center;">' +
              '<button class="coach-btn ghost" id="coach-reset">重置技能点（全额返还）</button>' +
              '<span id="coach-msg" class="coach-msg"></span>' +
            '</div>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ov);

      const msgEl = ov.querySelector('#coach-msg');
      const say = function(text, isErr) {
        msgEl.textContent = text;
        msgEl.className = 'coach-msg ' + (isErr ? 'err' : 'ok');
      };

      ov.querySelector('.coach-close').onclick = closePanel;
      ov.addEventListener('click', function(e) { if (e.target === ov) closePanel(); });

      const addBtns = ov.querySelectorAll('.coach-skill .coach-btn[data-skill]');
      for (const b of addBtns) {
        b.onclick = function() {
          const r = allocate(window.game, b.dataset.skill);
          say(r.msg, !r.ok);
          saveGameIfPossible();
          openPanel(); // 重绘以刷新等级/按钮状态
        };
      }
      ov.querySelector('#coach-reset').onclick = function() {
        const r = resetSkills(window.game);
        say(r.msg, !r.ok);
        if (r.ok) { saveGameIfPossible(); openPanel(); }
      };
      return ov;
    } catch (e) { console.error('教练面板打开失败', e); return null; }
  }

  function saveGameIfPossible() {
    try { if (typeof saveGame === 'function') saveGame(); }
    catch (e) { console.error('saveGame failed after coach change', e); }
  }

  /** 刷新侧栏「教练」按钮上的等级显示（不存在该按钮时静默跳过） */
  function refreshButton() {
    try {
      const btn = document.getElementById('btn-coach');
      if (!btn) return;
      const s = summary(window.game);
      if (s) btn.textContent = '教练 Lv.' + s.level + (s.points > 0 ? '（' + s.points + ' 点）' : '');
    } catch (e) { /* ignore */ }
  }

  return {
    SKILLS: SKILLS,
    LINES: LINES,
    ensure: ensure,
    skillLevel: skillLevel,
    addExp: addExp,
    awardContestExp: awardContestExp,
    applyContestWrapup: applyContestWrapup,
    allocate: allocate,
    resetSkills: resetSkills,
    summary: summary,
    // 效果倍率（供游戏本体调用）
    gainMul: gainMul,
    pressureMul: pressureMul,
    recoveryBonus: recoveryBonus,
    weeklyFund: weeklyFund,
    buildCostMul: buildCostMul,
    upkeepMul: upkeepMul,
    contestFundMul: contestFundMul,
    contestRepuBonus: contestRepuBonus,
    contestKnowledgeBonus: contestKnowledgeBonus,
    openPanel: openPanel,
    closePanel: closePanel,
    refreshButton: refreshButton
  };
})();

if (typeof window !== 'undefined') {
  window.CoachManager = CoachManager;
}
