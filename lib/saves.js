/* saves.js - 存档管理 + 游戏记录（分享链接历史）
 *
 * 单存档设计：整个游戏只有一份进行中的存档（localStorage / sessionStorage 的 oi_coach_save，
 * 由 saveGame 自动维护）。本模块在其之上提供：
 *   1. 存档管理面板：查看当前存档概要、导出、导入、继续游戏（游戏内提供导出/导入）
 *   2. 加密导出：存档写进 .oi 文件时用密钥流加密并附 HMAC-SHA256 校验标签，
 *      文件内容是密文，导入时会校验完整性，被手工改过的内容一律拒绝
 *   3. 游戏记录：每次结算生成分享链接时，把该局的链接与成绩摘要保存下来，
 *      主菜单「游戏记录」可查看列表并点击跳转
 *   4. 清除数据：一键清空存档、成就、游戏记录（调用方负责弹确认框）
 *
 * 本文件不依赖任何第三方库，可被 index.html / game.html / end.html 独立加载。
 */
const SaveManager = (function() {
  'use strict';

  const SAVE_KEY = 'oi_coach_save';
  const HISTORY_KEY = 'oi_coach_run_history';
  const ACH_KEY = 'oi_coach_achievements';
  const LS_OTHER_KEYS = ['oi_coach_ending_reason', 'oi_coach_ending', 'oi_coach_careerCompetitions'];
  const SS_OTHER_KEYS = ['oi_coach_ending_reason', 'oi_coach_ending'];
  const MAX_RUNS = 50;
  const MAGIC = 'OIFS1';
  const STYLE_ID = 'save-manager-style';
  /* 口令只用于「防手工篡改」：浏览器端拿得到口令，无法对懂行的人保密，但足以让文件变成密文并拒绝被修改的存档 */
  const PASSPHRASE = 'oitrainer-save-v1::ko2n8Qx!';

  /* =========================================================
   * SHA-256 / HMAC-SHA256（纯 JS 实现，供加密与完整性校验）
   * ======================================================= */
  const SHA_K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

  function sha256Bytes(bytes) {
    const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const l = bytes.length;
    const total = (((l + 8) >> 6) + 1) << 6;
    const buf = new Uint8Array(total);
    buf.set(bytes);
    buf[l] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(total - 8, Math.floor(l * 8 / 4294967296));
    dv.setUint32(total - 4, (l * 8) >>> 0);
    const w = new Uint32Array(64);
    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const a15 = w[i - 15], a2 = w[i - 2];
        const s0 = rotr(a15, 7) ^ rotr(a15, 18) ^ (a15 >>> 3);
        const s1 = rotr(a2, 17) ^ rotr(a2, 19) ^ (a2 >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + SHA_K[i] + w[i]) >>> 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    const out = new Uint8Array(32);
    const odv = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) odv.setUint32(i * 4, H[i]);
    return out;
  }

  function hmacSha256(keyBytes, msgBytes) {
    let key = keyBytes;
    if (key.length > 64) key = sha256Bytes(key);
    const ipad = new Uint8Array(64 + msgBytes.length);
    const opad = new Uint8Array(64 + 32);
    for (let i = 0; i < 64; i++) {
      const kb = i < key.length ? key[i] : 0;
      ipad[i] = kb ^ 0x36;
      opad[i] = kb ^ 0x5c;
    }
    ipad.set(msgBytes, 64);
    const inner = sha256Bytes(ipad);
    opad.set(inner, 64);
    return sha256Bytes(opad);
  }

  /* =========================================================
   * 字节 / 编码工具
   * ======================================================= */
  function utf8Bytes(str) {
    const bin = unescape(encodeURIComponent(str));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function bytesToUtf8(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    try { return decodeURIComponent(escape(bin)); }
    catch (e) { throw new Error('存档文件已损坏，无法解析内容'); }
  }
  function b64urlEncode(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlDecode(str) {
    let s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4 !== 0) s += '=';
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function hexEncode(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
    return s;
  }
  function hexDecode(str) {
    if (!/^[0-9a-fA-F]+$/.test(str) || str.length % 2 !== 0) throw new Error('bad hex');
    const out = new Uint8Array(str.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(str.substr(i * 2, 2), 16);
    return out;
  }
  function concatBytes() {
    let len = 0;
    for (const a of arguments) len += a.length;
    const out = new Uint8Array(len);
    let pos = 0;
    for (const a of arguments) { out.set(a, pos); pos += a.length; }
    return out;
  }
  function randomBytes(n) {
    const out = new Uint8Array(n);
    try {
      if (window.crypto && window.crypto.getRandomValues) { window.crypto.getRandomValues(out); return out; }
    } catch (e) {}
    for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
    return out;
  }
  function constantTimeEqual(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  }

  /* 口令 + 盐 + 用途标签 → 32 字节子密钥（轻量迭代，增加整文件伪造成本） */
  function deriveKey(saltBytes, label) {
    const base = concatBytes(utf8Bytes(PASSPHRASE), saltBytes, utf8Bytes(label));
    let out = sha256Bytes(base);
    for (let i = 0; i < 40; i++) {
      out = sha256Bytes(concatBytes(out, base));
    }
    return out;
  }
  /* SHA-256 计数器模式密钥流：对称，加密解密同一个函数 */
  function keystreamXor(key, salt, data) {
    const out = new Uint8Array(data.length);
    let pos = 0, counter = 0;
    while (pos < data.length) {
      const ctr = new Uint8Array(4);
      ctr[0] = (counter >>> 24) & 0xff; ctr[1] = (counter >>> 16) & 0xff;
      ctr[2] = (counter >>> 8) & 0xff; ctr[3] = counter & 0xff;
      const block = sha256Bytes(concatBytes(key, salt, ctr));
      for (let i = 0; i < block.length && pos < data.length; i++, pos++) out[pos] = data[pos] ^ block[i];
      counter++;
    }
    return out;
  }

  function encryptText(plain) {
    const salt = randomBytes(16);
    const payload = concatBytes(salt, keystreamXor(deriveKey(salt, 'enc'), salt, utf8Bytes(plain)));
    const tag = hmacSha256(deriveKey(salt, 'mac'), payload);
    return MAGIC + ':' + b64urlEncode(payload) + ':' + hexEncode(tag);
  }

  function decryptText(fileText) {
    const text = String(fileText == null ? '' : fileText).trim();
    const parts = text.split(':');
    if (parts.length !== 3 || parts[0] !== MAGIC) throw new Error('这不是有效的存档文件（文件格式不正确）');
    let payload, tag;
    try { payload = b64urlDecode(parts[1]); tag = hexDecode(parts[2]); }
    catch (e) { throw new Error('存档文件已损坏，无法读取'); }
    if (payload.length <= 16) throw new Error('存档文件已损坏，无法读取');
    const salt = payload.slice(0, 16);
    const cipher = payload.slice(16);
    const expect = hmacSha256(deriveKey(salt, 'mac'), payload);
    if (!constantTimeEqual(expect, tag)) throw new Error('存档文件校验失败：内容已被修改或文件损坏');
    return bytesToUtf8(keystreamXor(deriveKey(salt, 'enc'), salt, cipher));
  }

  /* =========================================================
   * 存档读取 / 概要 / 导出 / 导入
   * ======================================================= */
  function getSaveRaw() {
    let raw = null;
    try { raw = sessionStorage.getItem(SAVE_KEY); } catch (e) {}
    if (!raw) { try { raw = localStorage.getItem(SAVE_KEY); } catch (e) {} }
    return raw || null;
  }
  function hasSave() { return !!getSaveRaw(); }

  function getSaveInfo() {
    const raw = getSaveRaw();
    if (!raw) return null;
    try {
      const o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return null;
      const students = Array.isArray(o.students) ? o.students : [];
      return {
        week: Number(o.week) || 0,
        students: students.filter(s => s && s.active !== false).length,
        budget: Number(o.budget) || 0,
        reputation: Number(o.reputation) || 0,
        difficulty: Number(o.difficulty) || 2,
        province: o.province_name || ''
      };
    } catch (e) { return null; }
  }
  function diffText(d) { return d === 1 ? '简单' : d === 3 ? '困难' : '普通'; }

  function exportSave() {
    const raw = getSaveRaw();
    if (!raw) throw new Error('当前没有可导出的存档');
    const info = getSaveInfo() || {};
    const text = encryptText(raw);
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    const stamp = '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
    const filename = 'OI教练存档_第' + (info.week || 0) + '周_' + stamp + '.oi';
    // 触发浏览器下载（失败不影响返回值，调用方可自行复制 text）
    try {
      const blob = new Blob([text], { type: 'application/octet-stream' });
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function() {
        try { if (a.parentNode) a.parentNode.removeChild(a); URL.revokeObjectURL(url); } catch (e) {}
      }, 0);
    } catch (e) { console.warn('存档文件下载触发失败', e); }
    return { filename: filename, text: text };
  }

  function importSaveText(text) {
    const plain = decryptText(text);
    let obj;
    try { obj = JSON.parse(plain); }
    catch (e) { throw new Error('存档内容无法解析，文件可能已损坏'); }
    if (!obj || typeof obj !== 'object' || typeof obj.week !== 'number' || !Array.isArray(obj.students)) {
      throw new Error('这不是本游戏的有效存档');
    }
    try {
      localStorage.setItem(SAVE_KEY, plain);
      sessionStorage.setItem(SAVE_KEY, plain);
    } catch (e) { throw new Error('写入存档失败：' + (e && e.message)); }
    return getSaveInfo();
  }

  function importSaveFile(file) {
    return new Promise(function(resolve, reject) {
      if (!file) { reject(new Error('未选择文件')); return; }
      const onText = function(t) {
        try { resolve(importSaveText(t)); }
        catch (e) { reject(e); }
      };
      if (typeof file.text === 'function') { file.text().then(onText).catch(e => reject(e)); return; }
      const reader = new FileReader();
      reader.onload = function() { onText(String(reader.result || '')); };
      reader.onerror = function() { reject(new Error('读取文件失败')); };
      reader.readAsText(file);
    });
  }

  /* =========================================================
   * 游戏记录（每次结算的分享链接）
   * ======================================================= */
  function listRuns() {
    let raw = null;
    try { raw = localStorage.getItem(HISTORY_KEY); } catch (e) {}
    if (raw) {
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr;
      } catch (e) {}
    }
    return [];
  }
  function persistRuns(arr) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(0, MAX_RUNS))); }
    catch (e) { console.error('保存游戏记录失败', e); }
  }
  /** 结算页生成分享链接时调用：把本局链接与成绩摘要存入游戏记录 */
  function recordRun(url, shareData) {
    if (!url) return null;
    const gs = (shareData && shareData.gameState) || {};
    let gold = 0, silver = 0, bronze = 0;
    const career = Array.isArray(gs.careerCompetitions) ? gs.careerCompetitions : [];
    for (const c of career) {
      for (const e of (c && Array.isArray(c.entries) ? c.entries : [])) {
        if (!e) continue;
        if (e.medal === 'gold') gold++;
        else if (e.medal === 'silver') silver++;
        else if (e.medal === 'bronze') bronze++;
      }
    }
    const rec = {
      t: Date.now(),
      url: url,
      week: Number(gs.week) || 0,
      reason: gs.endingReason || '赛季结束',
      difficulty: Number(gs.difficulty) || 2,
      gold: gold, silver: silver, bronze: bronze
    };
    const arr = listRuns();
    if (arr.length && arr[0].url === url) return arr[0]; // 同一局重复点分享不重复记录
    arr.unshift(rec);
    persistRuns(arr);
    console.log('[游戏记录] 已保存本局分享链接，共 ' + arr.length + ' 条');
    return rec;
  }
  function removeRun(index) {
    const arr = listRuns();
    if (index < 0 || index >= arr.length) return false;
    arr.splice(index, 1);
    persistRuns(arr);
    return true;
  }

  /* =========================================================
   * 清除数据
   * ======================================================= */
  function clearAll() {
    let removed = 0;
    const kill = function(storage, keys) {
      for (const k of keys) {
        try { if (storage.getItem(k) !== null) { storage.removeItem(k); removed++; } } catch (e) {}
      }
    };
    kill(localStorage, [SAVE_KEY, ACH_KEY, HISTORY_KEY].concat(LS_OTHER_KEYS));
    kill(sessionStorage, [SAVE_KEY].concat(SS_OTHER_KEYS));
    // 成就模块内部有缓存，清掉存储后要让它重新读
    try { if (window.AchievementManager && typeof window.AchievementManager.reset === 'function') window.AchievementManager.reset(); }
    catch (e) {}
    return { removed: removed };
  }

  /* =========================================================
   * UI：自包含浮层（index.html 与 game.html 都能用，不依赖 showModal）
   * ======================================================= */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function formatTime(t) {
    try {
      const d = new Date(t);
      if (isNaN(d.getTime())) return '';
      const p = n => String(n).padStart(2, '0');
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    } catch (e) { return ''; }
  }
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = `
      .sm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10500;display:flex;align-items:center;justify-content:center;animation:smFade .2s ease;}
      @keyframes smFade{from{opacity:0;}to{opacity:1;}}
      .sm-panel{background:#141a24;color:#e8eaf0;border:1px solid #2b3648;border-radius:14px;width:min(640px,92vw);
        max-height:82vh;display:flex;flex-direction:column;box-shadow:0 12px 48px rgba(0,0,0,.5);}
      .sm-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #2b3648;}
      .sm-head h3{margin:0;font-size:17px;}
      .sm-close{background:none;border:1px solid #2b3648;color:#e8eaf0;border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:14px;}
      .sm-close:hover{background:#2b3648;}
      .sm-body{padding:16px 20px;overflow:auto;}
      .sm-info{background:#1b2330;border:1px solid #2b3648;border-radius:10px;padding:12px 14px;font-size:14px;line-height:1.7;}
      .sm-muted{font-size:12px;color:#8a97ab;}
      .sm-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px;}
      .sm-btn{display:inline-block;background:#1976d2;color:#fff;border:none;border-radius:8px;padding:9px 16px;font-size:14px;cursor:pointer;text-decoration:none;}
      .sm-btn:hover{background:#1565c0;}
      .sm-btn[disabled]{background:#37474f;cursor:not-allowed;opacity:.6;}
      .sm-btn.ghost{background:#263238;border:1px solid #2b3648;}
      .sm-btn.ghost:hover{background:#2f3d4f;}
      .sm-msg{margin-top:12px;font-size:13px;min-height:18px;}
      .sm-msg.err{color:#ef5350;}
      .sm-msg.ok{color:#8bc34a;}
      .sm-runs{display:flex;flex-direction:column;gap:8px;margin-top:10px;}
      .sm-run{display:flex;align-items:center;gap:10px;background:#1b2330;border:1px solid #2b3648;border-radius:10px;padding:10px 12px;}
      .sm-run-main{color:#e8eaf0;text-decoration:none;flex:1;font-size:14px;line-height:1.5;}
      .sm-run-main:hover{color:#64b5f6;}
      .sm-run .sm-del{background:none;border:1px solid #2b3648;color:#8a97ab;border-radius:6px;width:26px;height:26px;cursor:pointer;flex:none;}
      .sm-run .sm-del:hover{color:#ef5350;border-color:#ef5350;}
    `;
    document.head.appendChild(st);
  }
  function openOverlay(id, html) {
    closeOverlay();
    const ov = document.createElement('div');
    ov.className = 'sm-overlay';
    ov.id = id;
    ov.innerHTML = '<div class="sm-panel">' + html + '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function(e) { if (e.target === ov) closeOverlay(); });
    const closeBtn = ov.querySelector('.sm-close');
    if (closeBtn) closeBtn.onclick = closeOverlay;
    return ov;
  }
  function closeOverlay() {
    const all = document.querySelectorAll('.sm-overlay');
    for (const el of all) { if (el.parentNode) el.parentNode.removeChild(el); }
  }

  function inGame() {
    return !!(window.game && document.getElementById && document.getElementById('action-train'));
  }

  function openSavePanel() {
    try {
      ensureStyle();
      const info = getSaveInfo();
      const has = !!info;
      const game = inGame();
      const html =
        '<div class="sm-head"><h3>存档管理</h3><button class="sm-close" aria-label="关闭">✕</button></div>' +
        '<div class="sm-body">' +
          (has
            ? '<div class="sm-info">当前存档：第 <b>' + info.week + '</b> 周 · 在训 <b>' + info.students + '</b> 人 · 经费 ¥<b>' + info.budget + '</b> · 声誉 <b>' + info.reputation + '</b>' +
              '<div class="sm-muted">难度 ' + diffText(info.difficulty) + (info.province ? ' · ' + esc(info.province) : '') + '</div></div>'
            : '<div class="sm-info sm-muted">当前没有存档。' + (game ? '游戏进行中会自动保存。' : '开始一局游戏后即可在这里导出。') + '</div>') +
          '<div class="sm-actions">' +
            '<button class="sm-btn" id="sm-export"' + (has ? '' : ' disabled') + '>导出存档文件</button>' +
            '<label class="sm-btn ghost" for="sm-file">导入存档文件</label>' +
            '<input type="file" id="sm-file" accept=".oi,.txt,.json,application/json,text/plain" style="display:none">' +
            (!game && has ? '<a class="sm-btn" href="game.html">继续游戏</a>' : '') +
          '</div>' +
          '<div class="sm-muted" style="margin-top:10px">导出的 .oi 文件为加密存档，可备份或迁移到其他设备；导入时会校验完整性，被修改过的内容会被拒绝。</div>' +
          '<div id="sm-msg" class="sm-msg"></div>' +
        '</div>';
      const ov = openOverlay('sm-save-overlay', html);
      const msg = function(text, isErr) {
        const el = ov.querySelector('#sm-msg');
        if (!el) return;
        el.textContent = text;
        el.className = 'sm-msg ' + (isErr ? 'err' : 'ok');
      };
      const exportBtn = ov.querySelector('#sm-export');
      if (exportBtn) exportBtn.onclick = function() {
        try {
          const r = exportSave();
          msg('已导出：' + r.filename);
        } catch (e) { msg(e.message, true); }
      };
      const fileInput = ov.querySelector('#sm-file');
      if (fileInput) fileInput.onchange = function() {
        const f = fileInput.files && fileInput.files[0];
        if (!f) return;
        importSaveFile(f).then(function(loaded) {
          msg('导入成功：第 ' + (loaded ? loaded.week : '?') + ' 周的存档已写入');
          if (game) {
            try {
              if (confirm('导入成功。是否重新载入游戏以应用该存档？')) window.location.reload();
            } catch (e) {}
          } else {
            setTimeout(openSavePanel, 600);
          }
        }).catch(function(e) { msg(e && e.message ? e.message : '导入失败', true); });
      };
      return ov;
    } catch (e) { console.error('存档面板打开失败', e); return null; }
  }

  function openRunsPanel() {
    try {
      ensureStyle();
      const runs = listRuns();
      const rows = runs.length
        ? runs.map(function(r, i) {
            return '<div class="sm-run" data-i="' + i + '">' +
              '<a class="sm-run-main" href="' + esc(r.url) + '">第 <b>' + (r.week || '?') + '</b> 周 · ' + esc(r.reason || '赛季结束') +
              ' · 金牌 ' + (r.gold || 0) + ' · 银牌 ' + (r.silver || 0) + ' · 铜牌 ' + (r.bronze || 0) + '</a>' +
              '<span class="sm-muted">' + esc(formatTime(r.t)) + '</span>' +
              '<button class="sm-del" data-del="' + i + '" title="删除这条记录">✕</button>' +
              '</div>';
          }).join('')
        : '<div class="sm-muted">还没有记录。在结算页点击「分享结果」后，本局的分享链接会自动保存到这里，点击即可回看该局成绩。</div>';
      const html =
        '<div class="sm-head"><h3>游戏记录</h3><button class="sm-close" aria-label="关闭">✕</button></div>' +
        '<div class="sm-body">' +
          '<div class="sm-muted">共 ' + runs.length + ' 条（最多保留 ' + MAX_RUNS + ' 条），点击记录可跳转到该局的分享页。</div>' +
          '<div class="sm-runs">' + rows + '</div>' +
        '</div>';
      const ov = openOverlay('sm-runs-overlay', html);
      const dels = ov.querySelectorAll('.sm-del');
      for (const b of dels) {
        b.onclick = function(e) {
          e.preventDefault();
          e.stopPropagation();
          const idx = parseInt(b.dataset.del, 10);
          try {
            if (confirm('删除这条游戏记录？')) { removeRun(idx); openRunsPanel(); }
          } catch (err) {}
        };
      }
      return ov;
    } catch (e) { console.error('游戏记录面板打开失败', e); return null; }
  }

  return {
    hasSave: hasSave,
    getSaveRaw: getSaveRaw,
    getSaveInfo: getSaveInfo,
    exportSave: exportSave,
    importSaveText: importSaveText,
    importSaveFile: importSaveFile,
    encryptText: encryptText,
    decryptText: decryptText,
    listRuns: listRuns,
    recordRun: recordRun,
    removeRun: removeRun,
    clearAll: clearAll,
    openSavePanel: openSavePanel,
    openRunsPanel: openRunsPanel,
    closeOverlay: closeOverlay
  };
})();

if (typeof window !== 'undefined') {
  window.SaveManager = SaveManager;
}
