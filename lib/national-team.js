/* national-team.js - 国家集训队相关逻辑
   包含国家集训队选择、CTT/CTS比赛、IOI选拔等功能
*/

(function(global){
  'use strict';

  /**
   * 显示国家集训队选择弹窗
   * @param {Array} noiResults - NOI比赛结果
   * @param {number} noiMaxScore - NOI最高分
   * @param {number} passLine - 晋级线
   */
  function showNationalTeamChoice(noiResults, noiMaxScore, passLine) {
    const game = global.game;
    if(!game) return;

    console.log('[showNationalTeamChoice] 被调用，参数:', { noiResults, noiMaxScore, passLine });

    // 找出所有金牌选手
    // 优先使用传入的 passLine（来自比赛时计算的晋级线），以保证阈值一致
    const NOI_GOLD_THRESHOLD = (typeof global.NOI_GOLD_THRESHOLD !== 'undefined') ? global.NOI_GOLD_THRESHOLD : 1.0;
    const goldMedalThreshold = (typeof passLine === 'number' && !isNaN(passLine)) ? passLine : (noiMaxScore * NOI_GOLD_THRESHOLD);
    
    console.log('[showNationalTeamChoice] 金牌阈值:', goldMedalThreshold);
    console.log('[showNationalTeamChoice] noiResults 内容:', noiResults);
    
    // 筛选金牌学生：eligible 字段可能不存在，默认视为有资格
    const goldStudents = noiResults.filter(r => {
      const isEligible = (r.eligible !== false); // 只要 eligible 不是 false 就认为有资格
      const hasGoldScore = (r.total >= goldMedalThreshold);
      console.log(`[showNationalTeamChoice] 学生 ${r.name}: eligible=${isEligible}, total=${r.total}, threshold=${goldMedalThreshold}, hasGold=${hasGoldScore}`);
      return isEligible && hasGoldScore;
    });
    
    console.log('[showNationalTeamChoice] 筛选出的金牌学生:', goldStudents);
    
    if(goldStudents.length === 0) {
      console.log('[showNationalTeamChoice] 没有金牌选手，直接结束');
      // 没有金牌选手，直接结束
      if(typeof global.triggerGameEnding === 'function'){
        global.triggerGameEnding('赛季结束');
      }
      return;
    }
    
    let html = `<h3>🏅 国家集训队邀请</h3>`;
    html += `<div style="margin:12px 0;">`;
    html += `<div style="background:#fff9c4;padding:12px;border-radius:5px;margin-bottom:12px;border:2px solid #fbc02d;">`;
    html += `<div style="font-size:16px;font-weight:bold;margin-bottom:8px;color:#f57f17;">🎉 恭喜！</div>`;
    html += `<div style="margin-bottom:8px;">以下学生在NOI中获得金牌，获得国家集训队资格：</div>`;
    for(let s of goldStudents){
      html += `<div style="margin:4px 0;">• ${s.name}（${s.total} 分）</div>`;
    }
    html += `</div>`;
    
    html += `<div style="background:#e3f2fd;padding:12px;border-radius:5px;margin-bottom:12px;">`;
    html += `<div style="font-size:14px;font-weight:bold;margin-bottom:8px;">📋 国家集训队说明</div>`;
    html += `<div style="font-size:13px;line-height:1.6;">`;
    html += `<p>• 进入国家集训队后，将进行CTT、CTS比赛</p>`;
    html += `<p>• 没有金牌的学生将自动退队（不减少声誉）</p>`;
    html += `<p>• 根据CTT+CTS总分排名，入选国家队，参加IOI</p>`;
    html += `</div>`;
    html += `</div>`;
    
    html += `</div>`;
    
    html += `<div class="modal-actions" style="margin-top:8px;">`;
    html += `<button class="btn btn-ghost" id="national-team-decline">否，直接结算</button>`;
    html += `<button class="btn" id="national-team-accept">是，进入国家集训队</button>`;
    html += `</div>`;
    
    console.log('[showNationalTeamChoice] 准备显示弹窗');
    
    if(typeof global.showModal === 'function'){
      global.showModal(html);
      console.log('[showNationalTeamChoice] 弹窗已显示');
    } else {
      console.error('[showNationalTeamChoice] showModal 函数不可用');
    }
    
    // 使用 setTimeout 确保 DOM 元素已经被渲染
    setTimeout(() => {
      // 拒绝：直接结算
      const declineBtn = document.getElementById('national-team-decline');
      if(declineBtn){
        console.log('[showNationalTeamChoice] 绑定拒绝按钮事件');
        declineBtn.onclick = ()=>{
          console.log('[showNationalTeamChoice] 用户选择拒绝');
          if(typeof global.closeModal === 'function') global.closeModal();
          game.nationalTeamChoicePending = false;
          if(typeof global.triggerGameEnding === 'function'){
            global.triggerGameEnding('赛季结束');
          }
        };
      } else {
        console.error('[showNationalTeamChoice] 未找到拒绝按钮');
      }
      
      // 接受：进入国家集训队
      const acceptBtn = document.getElementById('national-team-accept');
      if(acceptBtn){
        console.log('[showNationalTeamChoice] 绑定接受按钮事件');
        acceptBtn.onclick = ()=>{
          console.log('[showNationalTeamChoice] 用户选择接受');
          if(typeof global.closeModal === 'function') global.closeModal();
          game.nationalTeamChoicePending = false;
          enterNationalTeam(goldStudents);
        };
      } else {
        console.error('[showNationalTeamChoice] 未找到接受按钮');
      }
    }, 100);
  }

  /**
   * 进入国家集训队
   * @param {Array} goldStudents - 金牌学生列表
   */
  function enterNationalTeam(goldStudents) {
    const game = global.game;
    if(!game) return;

    // 标记进入国家集训队模式
    game.inNationalTeam = true;
    game.nationalTeamResults = {
      goldStudents: goldStudents.map(s => s.name),
      cttScores: [],  // 改为数组，用于存储CTT成绩记录
      ctsScores: [],  // 改为数组，用于存储CTS成绩记录
      totalScores: {},
      ioiQualified: []
    };
    
    // 让没有金牌的学生自动退队（不减声誉）
    const goldNames = new Set(goldStudents.map(s => s.name));
    for(let student of game.students) {
      if(student.active !== false && !goldNames.has(student.name)) {
        student.active = false;
        if(typeof global.log === 'function'){
          global.log(`${student.name} 未获得金牌，退出国家集训队`);
        }
      }
    }
    
    if(typeof global.log === 'function'){
      global.log(`进入国家集训队！金牌选手：${Array.from(goldNames).join('、')}`);
    }
    
    if(typeof global.pushEvent === 'function'){
      global.pushEvent({
        name: '进入国家集训队',
        description: `恭喜${goldStudents.length}名学生进入国家集训队！`,
        week: game.week
      });
    }
    
    // 动态添加国家集训队比赛到 competitions 数组
    const currentWeek = game.week;
    const nationalTeamComps = [
      {week: currentWeek + 2, name:"CTT-day1-2", difficulty:500, maxScore:600, numProblems:6, nationalTeam:true},
      {week: currentWeek + 3, name:"CTT-day3-4", difficulty:500, maxScore:600, numProblems:6, nationalTeam:true},
      {week: currentWeek + 4, name:"CTS", difficulty:520, maxScore:800, numProblems:8, nationalTeam:true}
      // IOI 会在 CTS 结束后根据晋级情况动态添加
    ];
    
    // 添加到全局 competitions 数组
    if(typeof global.competitions !== 'undefined' && Array.isArray(global.competitions)) {
      for(let comp of nationalTeamComps) {
        global.competitions.push(comp);
      }
      console.log('[国家集训队] 已添加比赛到 competitions 数组:', nationalTeamComps);
    }
    
    // 刷新UI
    if(typeof global.renderAll === 'function'){
      global.renderAll();
    }
  }

  /**
   * 计算国家集训队晋级（CTT+CTS）
   */
  function calculateNationalTeamQualification() {
    const game = global.game;
    if(!game || !game.nationalTeamResults) return;

    // 从 nationalTeamResults 中提取成绩
    const cttScores = game.nationalTeamResults.cttScores || [];
    const ctsScores = game.nationalTeamResults.ctsScores || [];
    
    // 计算每个学生的总分（CTT + CTS）
    let totalScores = [];
    let studentScoreMap = {};
    
    // 累计CTT成绩（两天）
    for(let record of cttScores){
      if(!studentScoreMap[record.studentName]){
        studentScoreMap[record.studentName] = { ctt: 0, cts: 0 };
      }
      studentScoreMap[record.studentName].ctt += record.score;
    }
    
    // 累计CTS成绩
    for(let record of ctsScores){
      if(!studentScoreMap[record.studentName]){
        studentScoreMap[record.studentName] = { ctt: 0, cts: 0 };
      }
      studentScoreMap[record.studentName].cts = record.score;
    }
    
    // 构建总分数组
    for(let name in studentScoreMap){
      const scores = studentScoreMap[name];
      totalScores.push({
        name,
        cttScore: scores.ctt,
        ctsScore: scores.cts,
        total: scores.ctt + scores.cts
      });
    }
    
    // 按总分排序
    totalScores.sort((a,b) => b.total - a.total);
    
    // 计算晋级线（总分的50%）
    const maxPossible = 600 + 600 + 800; // CTT-day1-2 + CTT-day3-4 + CTS
    const passLine = maxPossible * 0.5;
    
    // 晋级：前2名且总分超过晋级线
    let qualified = [];
    for(let i = 0; i < Math.min(2, totalScores.length); i++){
      if(totalScores[i].total >= passLine){
        qualified.push(totalScores[i]);
      }
    }
    
    // 如果晋级人数超过2人，提高晋级线
    if(qualified.length > 2){
      qualified = qualified.slice(0, 2);
    }
    
    if(!game.nationalTeamResults.totalScores) game.nationalTeamResults.totalScores = {};
    for(let s of totalScores){
      game.nationalTeamResults.totalScores[s.name] = s.total;
    }
    
    game.nationalTeamResults.ioiQualified = qualified.map(q => q.name);
    
    // 显示晋级结果
    let html = `<h3>🏆 国家队选拔结果</h3>`;
    html += `<div style="margin:12px 0;">`;
    html += `<div style="background:#f0f8ff;padding:12px;border-radius:5px;margin-bottom:12px;">`;
    html += `<div style="font-size:16px;font-weight:bold;margin-bottom:8px;">📊 总成绩（CTT + CTS）</div>`;
    html += `<table><thead><tr><th>排名</th><th>姓名</th><th>CTT</th><th>CTS</th><th>总分</th><th>结果</th></tr></thead><tbody>`;
    
    for(let i = 0; i < totalScores.length; i++){
      let s = totalScores[i];
      const isQualified = game.nationalTeamResults.ioiQualified.includes(s.name);
      const resultText = isQualified ? '✅ 晋级IOI' : '❌ 未晋级';
      const rowStyle = isQualified ? 'background:#e8f5e9' : '';
      html += `<tr style="${rowStyle}"><td>${i+1}</td><td>${s.name}</td><td>${s.cttScore}</td><td>${s.ctsScore}</td><td><strong>${s.total}</strong></td><td>${resultText}</td></tr>`;
    }
    
    html += `</tbody></table>`;
    html += `<div style="margin-top:8px;font-size:13px;color:#666;">晋级线：${passLine.toFixed(0)} 分（总分50%），最多2人晋级</div>`;
    html += `</div>`;
    
    if(qualified.length > 0){
      html += `<div style="background:#fff9c4;padding:12px;border-radius:5px;margin-bottom:12px;border:2px solid #fbc02d;">`;
      html += `<div style="font-size:16px;font-weight:bold;margin-bottom:8px;color:#f57f17;">🎉 恭喜晋级IOI！</div>`;
      html += `<div>晋级选手：${qualified.map(q => q.name).join('、')}</div>`;
      html += `<div style="margin-top:8px;font-size:13px;">1周后将参加IOI比赛</div>`;
      html += `</div>`;
    } else {
      html += `<div style="background:#ffebee;padding:12px;border-radius:5px;margin-bottom:12px;">`;
      html += `<div style="font-size:16px;font-weight:bold;margin-bottom:8px;color:#c62828;">❌ 无人晋级</div>`;
      html += `<div>没有选手达到晋级标准，国家集训队之旅到此结束</div>`;
      html += `</div>`;
    }
    
    html += `</div>`;
    html += `<div class="modal-actions"><button class="btn" id="nt-qual-confirm">确认</button></div>`;
    
    if(typeof global.showModal === 'function'){
      global.showModal(html);
    }
    
    // 使用 setTimeout 确保 DOM 元素已渲染
    setTimeout(() => {
      const confirmBtn = document.getElementById('nt-qual-confirm');
      if(confirmBtn){
        console.log('[CTS晋级] 成功绑定确认按钮');
        confirmBtn.onclick = ()=>{
          console.log('[CTS晋级] 用户点击确认按钮');
          if(typeof global.closeModal === 'function') global.closeModal();
          
          if(qualified.length > 0){
            // 有人晋级，动态添加IOI比赛到competitions数组
            const currentWeek = game.week;
            const ioiComp = {
              week: currentWeek + 1,
              name: "IOI",
              difficulty: 550,
              maxScore: 600,
              numProblems: 6,
              nationalTeam: true,
              subtasksPerProblem: 15
            };
            
            // 检查是否已添加IOI比赛
            const hasIOI = global.competitions && global.competitions.some(c => c.name === 'IOI' && c.nationalTeam);
            if(!hasIOI && global.competitions){
              global.competitions.push(ioiComp);
              console.log('【国家集训队】动态添加IOI比赛到competitions:', ioiComp);
            }
            
            if(typeof global.log === 'function'){
              global.log(`IOI比赛将在第 ${ioiComp.week} 周进行`);
            }
            
            if(typeof global.pushEvent === 'function'){
              global.pushEvent({
                name: 'IOI晋级',
                description: `${qualified.length}名选手晋级IOI`,
                week: game.week
              });
            }
            
            if(typeof global.renderAll === 'function'){
              global.renderAll();
            }
          } else {
            // 无人晋级，游戏结束
            console.log('[CTS晋级] 无人晋级IOI，重置国家集训队标志并触发结局');
            game.inNationalTeam = false;
            game.nationalTeamChoicePending = false;
            if(typeof global.triggerGameEnding === 'function'){
              global.triggerGameEnding('赛季结束');
            }
          }
        };
      } else {
        console.error('[CTS晋级] 未找到确认按钮，可能导致无法继续！');
      }
    }, 100);
  }

  /**
   * 计算IOI结果
   */
  function calculateIOIResults() {
    const game = global.game;
    if(!game || !game.careerCompetitions) return;

    // 从 careerCompetitions 中提取IOI成绩
    const ioiRecord = game.careerCompetitions.find(c => c.name === 'IOI');
    if(!ioiRecord){
      console.error('[IOI结算错误] 未找到IOI比赛记录，可能是比赛数据丢失或流程异常');
      // 【关键修复3】即使出错也要重置标志并触发结局，避免游戏卡死
      game.inNationalTeam = false;
      game.nationalTeamChoicePending = false;
      if(typeof global.triggerGameEnding === 'function'){
        console.log('[IOI结算错误] 触发赛季结束结局（异常退出）');
        global.triggerGameEnding('赛季结束');
      }
      return;
    }
    
    // IOI 奖牌分配：不再使用固定的基础分数线（IOI_GOLD_THRESHOLD 等），
    // 仅按当前参赛人数的排名百分比分配奖牌（默认 10%/30%/50%）。
    const maxScore = 600; // IOI满分（仅用于检测满分情形）

    // 使用 contest-integration 保存的全部参赛选手成绩（包含国际选手）优先
    const allResults = (game.lastIOIAllResults && Array.isArray(game.lastIOIAllResults) && game.lastIOIAllResults.length > 0)
      ? game.lastIOIAllResults.slice()
      : (ioiRecord.entries || []).map(e => ({ name: e.name, score: Number(e.score) || 0, rank: e.rank || 0, isInternational: false }));

    // 按分数降序排序
    allResults.sort((a,b) => b.score - a.score);

    const n = allResults.length;
    // 人数较少时 floor 会导致某一级奖牌人数为 0（例如 9 人时无人拿金牌），至少保留 1 人
    const goldMaxIndex = Math.max(n > 0 ? 1 : 0, Math.floor(n * 0.10));   // 顶部 X% 为金牌（按当前人数计算）
    const silverMaxIndex = Math.max(n > 0 ? 1 : 0, Math.floor(n * 0.30)); // 接下来 Y% 为银牌
    const bronzeMaxIndex = Math.max(n > 0 ? 1 : 0, Math.floor(n * 0.50)); // 接下来 Z% 为铜牌

    // 计算奖牌分数线（确保同分选手获得相同奖牌，向上顺延）
    // 策略：找到严格低于边界位置分数的第一个分数作为下一级别的门槛
    let goldThreshold = -Infinity;
    let silverThreshold = -Infinity;
    let bronzeThreshold = -Infinity;
    
    // 金牌线：找到第 goldMaxIndex+1 名开始的第一个不同分数（严格小于金牌区的分数）
    if(goldMaxIndex > 0 && goldMaxIndex < allResults.length){
      const goldBoundaryScore = allResults[goldMaxIndex - 1].score;
      goldThreshold = goldBoundaryScore;
      // 找到第一个严格小于 goldBoundaryScore 的分数作为银牌线的起点
      for(let i = goldMaxIndex; i < allResults.length; i++){
        if(allResults[i].score < goldBoundaryScore){
          silverThreshold = allResults[i].score;
          break;
        }
      }
    }
    
    // 银牌线：从 silverEndIndex 位置开始找第一个不同分数
    const silverEndIndex = goldMaxIndex + silverMaxIndex;
    if(silverThreshold === -Infinity){
      // 如果还没设置银牌线（所有人都是金牌分），设置一个合理默认值
      if(silverEndIndex > 0 && silverEndIndex < allResults.length){
        silverThreshold = allResults[silverEndIndex - 1].score;
      }
    }
    // 找到第一个严格小于银牌区的分数作为铜牌线
    if(silverEndIndex > 0 && silverEndIndex < allResults.length){
      const silverBoundaryScore = allResults[silverEndIndex - 1].score;
      for(let i = silverEndIndex; i < allResults.length; i++){
        if(allResults[i].score < silverBoundaryScore){
          bronzeThreshold = allResults[i].score;
          break;
        }
      }
    }
    
    // 铜牌线：如果前面没有设置，从 bronzeEndIndex 位置开始找
    const bronzeEndIndex = silverEndIndex + bronzeMaxIndex;
    if(bronzeThreshold === -Infinity && bronzeEndIndex > 0 && bronzeEndIndex < allResults.length){
      bronzeThreshold = allResults[bronzeEndIndex - 1].score;
    }

    // 按分数线分配奖牌（使用严格大于来避免边界重叠）
    const medals = { gold: [], silver: [], bronze: [], none: [] };
    for(let r of allResults){
      if(r.score >= goldThreshold){
        medals.gold.push(r);
      } else if(r.score >= silverThreshold && silverThreshold > -Infinity){
        medals.silver.push(r);
      } else if(r.score >= bronzeThreshold && bronzeThreshold > -Infinity){
        medals.bronze.push(r);
      } else {
        medals.none.push(r);
      }
    }

    // 检测是否有满分（用于特定结局显示）
    let hasFullScore = false;
    let chineseHasFullScore = false; // 专门记录中国队是否满分
    for(const g of [].concat(medals.gold, medals.silver, medals.bronze)){
      if(g.score >= maxScore){
        hasFullScore = true;
        if(!g.isInternational) chineseHasFullScore = true;
      }
    }

    // 重新构建 results 列表（用于显示），保持按分数降序
    const results = [].concat(medals.gold, medals.silver, medals.bronze, medals.none);
    
    // 保存IOI结果到游戏状态
    game.ioiResults = {
      medals,
      hasFullScore,
      chineseHasFullScore, // 保存中国队是否满分的信息
      maxScore
    };
    
    // 显示IOI结果
    let html = `<h3>🌍 IOI 比赛结果</h3>`;
    html += `<div style="margin:12px 0;">`;
    
    // 成绩表
    html += `<div style="background:#f0f8ff;padding:12px;border-radius:5px;margin-bottom:12px;">`;
    html += `<table><thead><tr><th>排名</th><th>姓名</th><th>总分</th><th>奖牌</th></tr></thead><tbody>`;
    
    // 使用密集排名（dense ranking）：同分选手显示相同排名
    let currentRank = 1;
    let prevScore = null;
    for(let i = 0; i < results.length; i++){
      let r = results[i];
      
      // 如果分数变化，更新排名
      if(prevScore !== null && r.score < prevScore){
        currentRank = i + 1;
      }
      prevScore = r.score;
      
      let medal = '';
      let rowStyle = '';
      // 判断所在分组
      if(medals.gold.includes(r)){
        medal = '🥇 金牌'; rowStyle = 'background:#fff9c4';
      } else if(medals.silver.includes(r)){
        medal = '🥈 银牌'; rowStyle = 'background:#f5f5f5';
      } else if(medals.bronze.includes(r)){
        medal = '🥉 铜牌'; rowStyle = 'background:#ffebcc';
      }
      html += `<tr style="${rowStyle}"><td>${currentRank}</td><td>${r.name}</td><td><strong>${r.score}</strong></td><td>${medal}</td></tr>`;
    }
    
    html += `</tbody></table>`;
    html += `<div style="margin-top:8px;font-size:13px;color:#666;">`;
    html += `奖牌分配规则：金牌线前 ${Math.round(100*0.10)}%，银牌线前 ${Math.round(100*0.30)}%，铜牌线前 ${Math.round(100*0.50)}%`;
    html += `</div>`;
    html += `</div>`;
    
    // 结局提示 - 只有中国队选手满分才显示AKIOI
    const chineseGoldCount = medals.gold.filter(r => !r.isInternational).length;
    const chineseMedalCount = medals.gold.filter(r => !r.isInternational).length + 
                              medals.silver.filter(r => !r.isInternational).length + 
                              medals.bronze.filter(r => !r.isInternational).length;
    
    if(chineseHasFullScore){
      html += `<div style="background:linear-gradient(135deg, #ffd700 0%, #ffed4e 100%);padding:12px;border-radius:5px;margin-bottom:12px;border:3px solid #ffd700;">`;
      html += `<div style="font-size:18px;font-weight:bold;margin-bottom:8px;color:#b8860b;">👑 AKIOI！满分！</div>`;
      html += `<div>恭喜！中国队选手在IOI上取得满分，这是最高荣誉！</div>`;
      html += `</div>`;
    } else if(chineseGoldCount > 0){
      html += `<div style="background:#fff9c4;padding:12px;border-radius:5px;margin-bottom:12px;border:2px solid #fbc02d;">`;
      html += `<div style="font-size:16px;font-weight:bold;margin-bottom:8px;color:#f57f17;">🥇 获得IOI金牌！</div>`;
      html += `<div>恭喜！中国队选手获得${chineseGoldCount}枚金牌，达成顶尖结局！</div>`;
      html += `</div>`;
    } else if(chineseMedalCount > 0){
      html += `<div style="background:#e3f2fd;padding:12px;border-radius:5px;margin-bottom:12px;">`;
      html += `<div style="font-size:16px;font-weight:bold;margin-bottom:8px;color:#1976d2;">🏅 获得IOI奖牌！</div>`;
      html += `<div>恭喜！中国队选手获得${chineseMedalCount}枚奖牌，达成顶尖结局！</div>`;
      html += `</div>`;
    } else {
      html += `<div style="background:#ffebee;padding:12px;border-radius:5px;margin-bottom:12px;">`;
      html += `<div style="font-size:16px;font-weight:bold;margin-bottom:8px;color:#c62828;">未获得奖牌</div>`;
      html += `<div>虽然中国队未获得奖牌，但选手参加IOI本身就是了不起的成就！</div>`;
      html += `</div>`;
    }
    
    html += `</div>`;
    html += `<div class="modal-actions"><button class="btn" id="ioi-finish">查看结局</button></div>`;
    
    if(typeof global.showModal === 'function'){
      global.showModal(html);
    }
    
    setTimeout(() => {
      const finishBtn = document.getElementById('ioi-finish');
      if(finishBtn){
        console.log('[IOI结束] 成功绑定查看结局按钮');
        finishBtn.onclick = ()=>{
          console.log('[IOI结束] 用户点击查看结局按钮');
          if(typeof global.closeModal === 'function') global.closeModal();
          
          const game = global.game;
          if(game){
            game.inNationalTeam = false;
            game.nationalTeamChoicePending = false;
            console.log('[IOI结束] 已重置国家集训队标志: inNationalTeam=false, nationalTeamChoicePending=false');
          }
          
          // 触发特殊结局 - 只有中国队满分才是AKIOI
          if(chineseHasFullScore){
            console.log('[IOI结束] 触发AKIOI结局');
            if(typeof global.triggerGameEnding === 'function'){
              global.triggerGameEnding('AKIOI');
            }
          } else if(chineseMedalCount > 0){
            console.log('[IOI结束] 触发顶尖结局');
            if(typeof global.triggerGameEnding === 'function'){
              global.triggerGameEnding('顶尖结局');
            }
          } else {
            console.log('[IOI结束] 触发赛季结束结局');
            if(typeof global.triggerGameEnding === 'function'){
              global.triggerGameEnding('赛季结束');
            }
          }
        };
      } else {
        console.error('[IOI结束] 未找到查看结局按钮，可能导致无法结算！');
      }
    }, 100);
  }

  /* ========== 导出到全局 ========== */
  if(typeof global !== 'undefined'){
    global.showNationalTeamChoice = showNationalTeamChoice;
    global.enterNationalTeam = enterNationalTeam;
    global.calculateNationalTeamQualification = calculateNationalTeamQualification;
    global.calculateIOIResults = calculateIOIResults;
  }

})(window);
