/* achievements.js - 成就系统
 * 主菜单「成就」页 + 游戏内解锁提示。
 * 成就进度全局保存在 localStorage（跨存档、跨周目），键：oi_coach_achievements。
 * 成就条件只依赖 window.game 中真实存在的状态字段，任何检查失败都绝不会影响游戏本体。
 */
const AchievementManager = (function() {
  'use strict';

  const STORAGE_KEY = 'oi_coach_achievements';
  const STYLE_ID = 'achievement-style';

  /* 五项正赛（与 constants.js 的 COMPETITION_ORDER 保持一致，此处自带一份避免依赖加载顺序） */
  const MAJOR_CONTESTS = ['CSP-S1', 'CSP-S2', 'NOIP', '省选', 'NOI'];
  /* 可升级设施（computer_room 自带且固定 1 级，不计入） */
  const UPGRADEABLE_FACS = ['computer', 'network', 'fan', 'ac', 'library'];

  /* ---------- 状态小工具（全部做防御式取值） ---------- */
  function activeStudents(g) {
    return (g && Array.isArray(g.students) ? g.students : []).filter(s => s && s.active !== false);
  }
  function careerList(g) {
    return (g && Array.isArray(g.careerCompetitions)) ? g.careerCompetitions : [];
  }
  function collectMedals(g) {
    const out = { gold: 0, silver: 0, bronze: 0, total: 0 };
    for(const c of careerList(g)){
      for(const e of (Array.isArray(c.entries) ? c.entries : [])){
        if(!e) continue;
        if(e.medal === 'gold'){ out.gold++; out.total++; }
        else if(e.medal === 'silver'){ out.silver++; out.total++; }
        else if(e.medal === 'bronze'){ out.bronze++; out.total++; }
      }
    }
    return out;
  }
  function hasRecordIn(g, name) {
    return careerList(g).some(c => c && c.name === name);
  }
  function hasMedalIn(g, name, medal) {
    return careerList(g).some(c => c && c.name === name &&
      (Array.isArray(c.entries) ? c.entries : []).some(e => e && e.medal === medal));
  }
  function avgKnowledge(g) {
    const list = activeStudents(g);
    if(list.length === 0) return 0;
    let sum = 0;
    for(const s of list){
      const ks = [s.knowledge_ds, s.knowledge_graph, s.knowledge_string, s.knowledge_math, s.knowledge_dp]
        .map(v => Number(v) || 0);
      sum += ks.reduce((a, b) => a + b, 0) / ks.length;
    }
    return sum / list.length;
  }
  function facLevel(g, id) {
    try{ return Number(g.facilities.getLevel(id)) || 0; }catch(e){ return 0; }
  }
  function facMaxLevel(g, id) {
    try{
      const v = Number(g.facilities.getMaxLevel(id));
      if(v > 0) return v;
    }catch(e){ /* ignore */ }
    try{ return window.FACILITY_DEFS && window.FACILITY_DEFS[id] ? window.FACILITY_DEFS[id].maxLevel : 0; }
    catch(e){ return 0; }
  }

  /* ---------- 成就定义 ---------- */
  const DEFS = [
    { id: 'new_start', name: '崭新的开始', desc: '完成第 1 个训练周',
      check: g => (g.week || 0) >= 2 },
    { id: 'first_medal', name: '初登领奖台', desc: '任意正式比赛获得首枚奖牌',
      check: g => collectMedals(g).total >= 1 },
    { id: 'first_gold', name: '一鸣惊人', desc: '获得第一枚金牌',
      check: g => collectMedals(g).gold >= 1 },
    { id: 'noi_champion', name: 'NOI 巅峰', desc: '在 NOI 摘得金牌',
      check: g => hasMedalIn(g, 'NOI', 'gold') },
    { id: 'ioi_debut', name: '走向世界', desc: '带领学生站上 IOI 赛场',
      check: g => hasRecordIn(g, 'IOI') },
    { id: 'grand_slam', name: '大满贯', desc: '生涯中参加过全部 5 项正赛（CSP-S1/S2、NOIP、省选、NOI）',
      check: g => {
        const names = new Set(careerList(g).map(c => c && c.name));
        return MAJOR_CONTESTS.every(n => names.has(n));
      } },
    { id: 'rep_max', name: '明星教练', desc: '声誉达到 100',
      check: g => (g.reputation || 0) >= 100 },
    { id: 'treasury', name: '经费无忧', desc: '经费达到 ¥200,000',
      check: g => (g.budget || 0) >= 200000 },
    { id: 'fac_one_max', name: '单项巅峰', desc: '任意一项设施升到满级',
      check: g => UPGRADEABLE_FACS.some(id => facLevel(g, id) > 0 && facLevel(g, id) >= facMaxLevel(g, id)) },
    { id: 'fac_all_max', name: '顶级学院', desc: '全部 5 项设施升到满级',
      check: g => UPGRADEABLE_FACS.every(id => facMaxLevel(g, id) > 0 && facLevel(g, id) >= facMaxLevel(g, id)) },
    { id: 'calm_team', name: '心如止水', desc: '第 8 周及以后，全队压力都不超过 30',
      check: g => {
        const list = activeStudents(g);
        return (g.week || 0) >= 8 && list.length > 0 && list.every(s => (s.pressure || 0) <= 30);
      } },
    { id: 'scholar', name: '学富五车', desc: '全队平均知识达到 80',
      check: g => activeStudents(g).length > 0 && avgKnowledge(g) >= 80 },
    { id: 'big_team', name: '人才济济', desc: '在训学生达到 8 人',
      check: g => activeStudents(g).length >= 8 },
    { id: 'big_spender', name: '大手笔', desc: '累计花费达到 ¥200,000',
      check: g => (g.totalExpenses || 0) >= 200000 },
    { id: 'season_end', name: '完整赛季', desc: '完成一个赛季并进入结算',
      check: g => g.seasonEndTriggered === true },
    { id: 'coach_lv5', name: '教学相长', desc: '教练等级达到 5 级',
      check: g => !!(g.coach && (g.coach.level || 0) >= 5) },
    { id: 'coach_specialist', name: '独当一面', desc: '任一教练技能升到满级',
      check: g => {
        const sk = (g.coach && g.coach.skills) ? g.coach.skills : {};
        return (window.CoachManager && Array.isArray(window.CoachManager.SKILLS))
          ? window.CoachManager.SKILLS.some(d => (Number(sk[d.id]) || 0) >= d.max)
          : false;
      } },
    { id: 'coach_hybrid', name: '三线并进', desc: '训练、经营、比赛三条技能线都至少投入 1 点',
      check: g => {
        const sk = (g.coach && g.coach.skills) ? g.coach.skills : {};
        if (!(window.CoachManager && Array.isArray(window.CoachManager.SKILLS))) return false;
        const lines = {};
        for (const d of window.CoachManager.SKILLS) {
          if ((Number(sk[d.id]) || 0) > 0) lines[d.line] = true;
        }
        return !!lines.train && !!lines.mgmt && !!lines.contest;
      } }
  ];

  /* ---------- 存取 ---------- */
  let cache = null;

  function load() {
    if (cache) return cache;
    let raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (raw) {
      try {
        const o = JSON.parse(raw);
        if (o && typeof o === 'object' && o.unlocked && typeof o.unlocked === 'object') {
          cache = o;
          return cache;
        }
      } catch (e) {}
    }
    cache = { unlocked: {} };
    return cache;
  }
  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cache)); } catch (e) {}
  }
  function isUnlocked(id) { return !!load().unlocked[id]; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function formatTime(iso) {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      const p = n => String(n).padStart(2, '0');
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    } catch (e) { return ''; }
  }

  /* ---------- 解锁提示（toast） ---------- */
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = `
      #achievement-toast-root{position:fixed;top:70px;right:16px;z-index:12000;display:flex;flex-direction:column;gap:10px;pointer-events:none;}
      .achievement-toast{display:flex;gap:12px;align-items:center;background:linear-gradient(135deg,#263238,#37474f);color:#fff;
        border:1px solid #ffca28;border-radius:10px;padding:10px 16px;max-width:320px;box-shadow:0 6px 24px rgba(0,0,0,.35);
        animation:achvIn .35s ease;transition:opacity .35s ease,transform .35s ease;}
      .achievement-toast.out{opacity:0;transform:translateX(30px);}
      .achievement-toast .at-body{display:flex;flex-direction:column;line-height:1.35;}
      .achievement-toast .at-body strong{font-size:12px;color:#ffca28;letter-spacing:2px;}
      .achievement-toast .at-body em{font-style:normal;font-size:15px;font-weight:700;}
      .achievement-toast .at-body i{font-style:normal;font-size:12px;opacity:.75;}
      @keyframes achvIn{from{opacity:0;transform:translateX(40px);}to{opacity:1;transform:translateX(0);}}
      .achievement-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10500;display:flex;align-items:center;justify-content:center;animation:achvFade .2s ease;}
      @keyframes achvFade{from{opacity:0;}to{opacity:1;}}
      .achievement-panel{background:#141a24;color:#e8eaf0;border:1px solid #2b3648;border-radius:14px;width:min(760px,92vw);
        max-height:84vh;display:flex;flex-direction:column;box-shadow:0 12px 48px rgba(0,0,0,.5);}
      .achievement-panel .ap-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #2b3648;}
      .achievement-panel .ap-head h3{margin:0;font-size:18px;}
      .achievement-panel .ap-progress{font-size:13px;color:#ffca28;margin-left:8px;font-weight:600;}
      .achievement-panel .ap-close{background:none;border:1px solid #2b3648;color:#e8eaf0;border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:14px;}
      .achievement-panel .ap-close:hover{background:#2b3648;}
      .achievement-panel .ap-grid{padding:16px 20px;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px;}
      .achievement-card{background:#1b2330;border:1px solid #2b3648;border-radius:10px;padding:12px;opacity:.55;}
      .achievement-card.unlocked{opacity:1;border-color:#ffca28;background:#20293a;}
      .achievement-card .ac-name{font-weight:700;font-size:14px;}
      .achievement-card .ac-desc{font-size:12px;opacity:.75;margin-top:4px;line-height:1.5;}
      .achievement-card .ac-time{font-size:11px;margin-top:8px;color:#8bc34a;}
      .achievement-card:not(.unlocked) .ac-time{color:#78909c;}
    `;
    document.head.appendChild(st);
  }

  function toast(def) {
    try {
      ensureStyle();
      if (!document.body) return;
      let root = document.getElementById('achievement-toast-root');
      if (!root) {
        root = document.createElement('div');
        root.id = 'achievement-toast-root';
        document.body.appendChild(root);
      }
      const el = document.createElement('div');
      el.className = 'achievement-toast';
      el.dataset.achievement = def.id;
      el.innerHTML = '<span class="at-body"><strong>成就解锁</strong><em>' + esc(def.name) + '</em><i>' + esc(def.desc) + '</i></span>';
      root.appendChild(el);
      setTimeout(function() {
        try {
          el.classList.add('out');
          setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 400);
        } catch (e) {}
      }, 4500);
    } catch (e) { console.error('成就提示渲染失败', e); }
  }

  function unlock(id) {
    const def = DEFS.find(d => d.id === id);
    if (!def) return false;
    const data = load();
    if (data.unlocked[id]) return false;
    data.unlocked[id] = new Date().toISOString();
    persist();
    console.log('[成就] 解锁：' + def.name);
    toast(def);
    try { window.dispatchEvent(new CustomEvent('achievement-unlocked', { detail: { id: id, name: def.name } })); }
    catch (e) { /* ignore */ }
    return true;
  }

  /** 检查全部未解锁成就；返回本次新解锁的 id 列表。任何异常都被吞掉，绝不影响游戏。 */
  function check(g) {
    const newly = [];
    try {
      if (!g) return newly;
      for (const def of DEFS) {
        if (isUnlocked(def.id)) continue;
        try {
          if (def.check(g)) { if (unlock(def.id)) newly.push(def.id); }
        } catch (e) { console.error('成就条件检查失败', def.id, e); }
      }
    } catch (e) { console.error('成就检查失败', e); }
    return newly;
  }

  function getSummary() {
    const data = load();
    const unlockedCount = DEFS.filter(d => data.unlocked[d.id]).length;
    return { unlockedCount: unlockedCount, total: DEFS.length };
  }

  function renderList() {
    const data = load();
    return DEFS.map(function(def) {
      const at = data.unlocked[def.id];
      return '<div class="achievement-card' + (at ? ' unlocked' : '') + '" data-id="' + esc(def.id) + '">' +
        '<div class="ac-name">' + esc(def.name) + '</div>' +
        '<div class="ac-desc">' + esc(def.desc) + '</div>' +
        '<div class="ac-time">' + (at ? esc(formatTime(at)) + ' 解锁' : '未解锁') + '</div>' +
        '</div>';
    }).join('');
  }

  /* ---------- 面板 ---------- */
  function closePanel() {
    const ov = document.getElementById('achievement-overlay');
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    document.removeEventListener('keydown', escClose);
  }
  function escClose(e) { if (e && e.key === 'Escape') closePanel(); }

  function openPanel() {
    try {
      ensureStyle();
      closePanel();
      const s = getSummary();
      const ov = document.createElement('div');
      ov.id = 'achievement-overlay';
      ov.className = 'achievement-overlay';
      ov.innerHTML =
        '<div class="achievement-panel" role="dialog" aria-label="成就">' +
          '<div class="ap-head"><h3>成就<span class="ap-progress">已解锁 ' + s.unlockedCount + ' / ' + s.total + '</span></h3>' +
          '<button class="ap-close" aria-label="关闭">✕</button></div>' +
          '<div class="ap-grid">' + renderList() + '</div>' +
        '</div>';
      document.body.appendChild(ov);
      ov.querySelector('.ap-close').onclick = closePanel;
      ov.addEventListener('click', function(e) { if (e.target === ov) closePanel(); });
      document.addEventListener('keydown', escClose);
      return true;
    } catch (e) { console.error('成就面板打开失败', e); return false; }
  }

  /** 清空全部成就进度（供「清除数据」使用） */
  function reset() {
    cache = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    cache = { unlocked: {} };
  }

  return {
    DEFS: DEFS,
    check: check,
    unlock: unlock,
    isUnlocked: isUnlocked,
    getSummary: getSummary,
    renderList: renderList,
    openPanel: openPanel,
    closePanel: closePanel,
    reset: reset
  };
})();

if (typeof window !== 'undefined') {
  window.AchievementManager = AchievementManager;
}
