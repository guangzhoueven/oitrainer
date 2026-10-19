/* tutorial.js - 新手引导系统 */

// 引导步骤定义
const TUTORIAL_STEPS = [
  {
    id: 'welcome',
    target: null,
    title: '欢迎来到 OI 教练模拟器！',
    content: '在这个游戏中，你将扮演一名信息学竞赛教练，带领学生们从零开始，冲击 NOI 金牌！让我们先熟悉一下界面。',
    position: 'center',
    buttons: [
      { text: '开始教程', action: 'next', primary: true },
      { text: '跳过教程', action: 'skip', primary: false }
    ]
  },
  {
    id: 'header-info',
    target: '#header-week',
    title: '顶部信息栏',
    content: '这里显示当前周数、省份、经费、声誉等关键信息。<br><strong>经费</strong>用于升级设施和参加集训，<strong>声誉</strong>影响外部支持。',
    position: 'bottom',
    highlight: true
  },
  {
    id: 'students',
    target: '#student-list',
    title: '学生列表',
    content: '这是你的学生。每个学生有<strong>思维</strong>、<strong>编程</strong>、<strong>心理</strong>三项基础能力，以及五大知识点。<br>压力过高会影响表现甚至导致退队！',
    position: 'right',
    highlight: true
  },
  {
    id: 'talents',
    target: '.student-talents',
    title: '学生天赋',
    content: '<strong>天赋</strong>是学生的特殊能力，可以提供各种加成效果。<br>• <strong>获得</strong>：训练、集训后有概率获得<br>• <strong>丧失</strong>：压力过高或特殊事件可能失去<br>• <strong>效果</strong>：如提升训练效率、降低压力、减免费用等<br>鼠标悬停在天赋标签上可查看详细说明。',
    position: 'right',
    highlight: true
  },
  {
    id: 'comfort',
    target: '.flex-between',
    title: '舒适度系统',
    content: '<strong>舒适度</strong>影响学生的压力恢复速度。升级宿舍、空调、食堂可以提升舒适度。',
    position: 'bottom',
    highlight: true
  },
  {
    id: 'facilities',
    // 目标改为整个设施状态模块，使遮罩高亮覆盖完整区域
    target: '#facilities-panel',
    title: '设施状态',
    content: '这里显示当前的设施等级。升级<strong>计算机</strong>和<strong>资料库</strong>可以提升训练效率。<br>升级<strong>空调、宿舍、食堂</strong>可以改善舒适度，降低压力。<br>点击本区域右上角的<strong>「升级设施」</strong>按钮可随时升级；上级拨款、比赛拨款等事件也会提供升级入口。',
    position: 'right',
    highlight: true
  },
  {
    id: 'actions',
    target: '.action-cards',
    title: '本周行动',
    content: '每周选择一个行动：<br>• <strong>训练</strong>：提升能力和知识<br>• <strong>娱乐</strong>：缓解压力<br>• <strong>模拟赛</strong>：检验成果<br>• <strong>集训</strong>：快速提升',
    position: 'left',
    highlight: true
  },
  {
    id: 'log',
    target: '#log',
    title: '日志系统',
    content: '所有重要事件都会记录在这里。遇到困惑时，查看日志可以了解发生了什么。',
    position: 'top',
    highlight: true
  },
  {
    id: 'competition',
    target: '#next-comp',
    title: '比赛日程',
    content: '关注下场比赛的时间！比赛前建议安排模拟赛或集训来提升实力。<br>比赛成绩决定能否晋级下一场。',
    position: 'top',
    highlight: true
  },
  {
    id: 'tips',
    target: null,
    title: '游戏提示',
    content: '💡 <strong>新手建议</strong>：<br>1. 平衡训练和娱乐，避免压力过高<br>2. 及时升级设施，提升训练效率<br>3. 比赛前安排模拟赛检验<br>4. 关注学生的知识薄弱项<br><br>准备好了吗？开始你的教练生涯吧！',
    position: 'center',
    buttons: [
      { text: '开始游戏', action: 'finish', primary: true }
    ]
  }
];

// Toast 通知系统
class ToastManager {
  constructor() {
    this.container = null;
    this.init();
  }

  init() {
    // NOTE: To avoid conflicts with the in-game event cards, we don't create a
    // visual toast container by default. The ToastManager API remains available
    // so callers can still call window.toastManager.show(...). By default we
    // forward notifications into the event card system (pushEvent) which is the
    // single source of truth for event display.
    this.container = null;
  }

  show(message, type = 'info', duration = 3000) {
    // Default behavior: forward to event cards so messages are visible in the
    // right-side event panel and avoid duplicated floating UIs that conflict
    // with the game's layout. If pushEvent is unavailable, fallback to console.
    try {
      if (typeof window.pushEvent === 'function') {
        // Normalize a short title from type
        const title = (type === 'success') ? '通知' : (type === 'warning') ? '警告' : (type === 'error') ? '错误' : '提示';
        window.pushEvent({ name: title, description: String(message), week: (window.game && window.game.week) ? window.game.week : 0 });
        return;
      }
    } catch (e) { /* ignore */ }
    // final fallback
    console.log(`[toast:${type}] ${message}`);
  }
}

// 引导系统
class TutorialSystem {
  constructor() {
    this.currentStep = 0;
    this.overlay = null;
    this.tooltip = null;
    this.isActive = false;
  }

  start() {
    // 检查是否已完成过教程
    if (localStorage.getItem('tutorial_completed') === 'true') {
      return;
    }
    
    // 确保之前的引导已完全清理
    this.cleanup();
    
    this.isActive = true;
    this.currentStep = 0;
    this.createOverlay();
    this.showStep(0);
  }

  createOverlay() {
    // 确保清理之前的元素
    this.cleanup();
    
    // 创建半透明遮罩
    this.overlay = document.createElement('div');
    this.overlay.id = 'tutorial-overlay';
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      z-index: 9998;
      transition: opacity 0.3s ease;
      pointer-events: none;
    `;
    document.body.appendChild(this.overlay);

    // 创建提示框容器
    this.tooltip = document.createElement('div');
    this.tooltip.id = 'tutorial-tooltip';
    this.tooltip.style.cssText = `
      position: fixed;
      z-index: 10002;
      background: white;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      max-width: 400px;
      animation: fadeInScale 0.3s ease;
      pointer-events: auto;
    `;
    document.body.appendChild(this.tooltip);
  }

  showStep(index) {
    if (index >= TUTORIAL_STEPS.length) {
      this.finish();
      return;
    }

    const step = TUTORIAL_STEPS[index];
    this.currentStep = index;

    // 移除之前的高亮（完整清理所有内联样式）
    document.querySelectorAll('.tutorial-highlight').forEach(el => {
      el.classList.remove('tutorial-highlight');
      // 恢复原始样式
      el.style.position = '';
      el.style.zIndex = '';
    });

    // 高亮目标元素
    if (step.target && step.highlight) {
      const targetEl = document.querySelector(step.target);
      if (targetEl) {
        // 保存原始样式以便恢复（只在第一次保存）
        if (!targetEl.dataset.originalPosition) {
          targetEl.dataset.originalPosition = targetEl.style.position || '';
        }
        if (!targetEl.dataset.originalZIndex) {
          targetEl.dataset.originalZIndex = targetEl.style.zIndex || '';
        }
        
        targetEl.classList.add('tutorial-highlight');
        // 只在必要时修改position（避免影响布局）
        const computedPosition = window.getComputedStyle(targetEl).position;
        if (computedPosition === 'static') {
          targetEl.style.position = 'relative';
        }
        // 设置高于遮罩的 z-index
        targetEl.style.zIndex = '10000';
        
        // 创建挖空效果：使用大范围的 box-shadow
        this.updateOverlayMask(targetEl);
      }
    } else {
      // 没有高亮元素时，清除挖空效果
      this.clearOverlayMask();
    }

    // 定位提示框
    this.positionTooltip(step);

    // 渲染提示框内容
    this.renderTooltip(step);
  }

  updateOverlayMask(targetEl) {
    if (!this.overlay) return;
    
    const rect = targetEl.getBoundingClientRect();
    const padding = 8; // 高亮区域的内边距
    
    // 使用巨大的 box-shadow 创建挖空效果
    // 原理：在目标周围创建四个大阴影块，覆盖整个屏幕，中间留空
    this.overlay.style.boxShadow = `
      0 0 0 ${rect.top}px rgba(0, 0, 0, 0.7),
      0 0 0 9999px rgba(0, 0, 0, 0.7)
    `;
    
    // 更简单的方法：使用 clip-path 的反向裁剪
    // 但由于兼容性，我们使用多层叠加方式
    this.overlay.style.background = 'transparent';
    
    // 创建四个遮罩块来实现挖空效果
    this.overlay.innerHTML = `
      <div style="position: absolute; top: 0; left: 0; right: 0; height: ${rect.top - padding}px; background: rgba(0, 0, 0, 0.7);"></div>
      <div style="position: absolute; top: ${rect.top - padding}px; left: 0; width: ${rect.left - padding}px; height: ${rect.height + padding * 2}px; background: rgba(0, 0, 0, 0.7);"></div>
      <div style="position: absolute; top: ${rect.top - padding}px; left: ${rect.right + padding}px; right: 0; height: ${rect.height + padding * 2}px; background: rgba(0, 0, 0, 0.7);"></div>
      <div style="position: absolute; top: ${rect.bottom + padding}px; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.7);"></div>
    `;
  }

  clearOverlayMask() {
    if (!this.overlay) return;
    this.overlay.style.background = 'rgba(0, 0, 0, 0.7)';
    this.overlay.style.boxShadow = '';
    this.overlay.innerHTML = '';
  }

  positionTooltip(step) {
    if (step.position === 'center') {
      this.tooltip.style.top = '50%';
      this.tooltip.style.left = '50%';
      this.tooltip.style.transform = 'translate(-50%, -50%)';
      return;
    }

    if (!step.target) return;

    const targetEl = document.querySelector(step.target);
    if (!targetEl) {
      // 目标不存在，居中显示
      this.tooltip.style.top = '50%';
      this.tooltip.style.left = '50%';
      this.tooltip.style.transform = 'translate(-50%, -50%)';
      return;
    }

    const rect = targetEl.getBoundingClientRect();
    const tooltipRect = this.tooltip.getBoundingClientRect();

    switch (step.position) {
      case 'top':
        this.tooltip.style.left = `${rect.left + rect.width / 2}px`;
        this.tooltip.style.top = `${rect.top - 20}px`;
        this.tooltip.style.transform = 'translate(-50%, -100%)';
        break;
      case 'bottom':
        this.tooltip.style.left = `${rect.left + rect.width / 2}px`;
        this.tooltip.style.top = `${rect.bottom + 20}px`;
        this.tooltip.style.transform = 'translate(-50%, 0)';
        break;
      case 'left':
        this.tooltip.style.left = `${rect.left - 20}px`;
        this.tooltip.style.top = `${rect.top + rect.height / 2}px`;
        this.tooltip.style.transform = 'translate(-100%, -50%)';
        break;
      case 'right':
        this.tooltip.style.left = `${rect.right + 20}px`;
        this.tooltip.style.top = `${rect.top + rect.height / 2}px`;
        this.tooltip.style.transform = 'translate(0, -50%)';
        break;
    }
  }

  renderTooltip(step) {
    const defaultButtons = [
      { text: '下一步', action: 'next', primary: true }
    ];
    const buttons = step.buttons || defaultButtons;

    const buttonHtml = buttons.map(btn => {
      const btnClass = btn.primary ? 'btn' : 'btn btn-ghost';
      return `<button class="${btnClass}" data-action="${btn.action}">${btn.text}</button>`;
    }).join('');

    this.tooltip.innerHTML = `
      <div style="margin-bottom: 16px;">
        <h3 style="margin: 0 0 8px 0; font-size: 18px; color: #1f2937;">${step.title}</h3>
        <div style="color: #4b5563; font-size: 14px; line-height: 1.6;">${step.content}</div>
      </div>
      <div style="display: flex; gap: 8px; justify-content: flex-end; align-items: center;">
        <span style="color: #9ca3af; font-size: 12px; margin-right: auto;">${this.currentStep + 1} / ${TUTORIAL_STEPS.length}</span>
        ${buttonHtml}
      </div>
    `;

    // 绑定按钮事件
    this.tooltip.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        this.handleAction(action);
      });
    });
  }

  handleAction(action) {
    switch (action) {
      case 'next':
        this.showStep(this.currentStep + 1);
        break;
      case 'prev':
        if (this.currentStep > 0) {
          this.showStep(this.currentStep - 1);
        }
        break;
      case 'skip':
      case 'finish':
        this.finish();
        break;
    }
  }

  finish() {
    this.isActive = false;
    localStorage.setItem('tutorial_completed', 'true');
    
    // 使用cleanup方法完全清理
    this.cleanup();
  }

  cleanup() {
    // 完整移除所有高亮元素的样式和类
    document.querySelectorAll('.tutorial-highlight').forEach(el => {
      el.classList.remove('tutorial-highlight');
      
      // 恢复原始样式
      if (el.dataset.originalPosition !== undefined) {
        el.style.position = el.dataset.originalPosition;
        delete el.dataset.originalPosition;
      } else {
        el.style.position = '';
      }
      
      if (el.dataset.originalZIndex !== undefined) {
        el.style.zIndex = el.dataset.originalZIndex;
        delete el.dataset.originalZIndex;
      } else {
        el.style.zIndex = '';
      }
    });

    // 移除遮罩
    if (this.overlay) {
      this.overlay.style.opacity = '0';
      setTimeout(() => {
        if (this.overlay && this.overlay.parentNode) {
          this.overlay.parentNode.removeChild(this.overlay);
        }
        this.overlay = null;
      }, 300);
    }

    // 移除提示框
    if (this.tooltip) {
      this.tooltip.style.animation = 'fadeOutScale 0.3s ease';
      setTimeout(() => {
        if (this.tooltip && this.tooltip.parentNode) {
          this.tooltip.parentNode.removeChild(this.tooltip);
        }
        this.tooltip = null;
      }, 300);
    }
    
    // 清理可能残留的tutorial元素
    const tutorialOverlay = document.getElementById('tutorial-overlay');
    if (tutorialOverlay && tutorialOverlay.parentNode) {
      tutorialOverlay.parentNode.removeChild(tutorialOverlay);
    }
    
    const tutorialTooltip = document.getElementById('tutorial-tooltip');
    if (tutorialTooltip && tutorialTooltip.parentNode) {
      tutorialTooltip.parentNode.removeChild(tutorialTooltip);
    }
  }

  reset() {
    localStorage.removeItem('tutorial_completed');
  }
}

// 添加必要的 CSS 动画
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeInScale {
    from {
      opacity: 0;
      transform: scale(0.9) translate(-50%, -50%);
    }
    to {
      opacity: 1;
      transform: scale(1) translate(-50%, -50%);
    }
  }

  @keyframes fadeOutScale {
    from {
      opacity: 1;
      transform: scale(1);
    }
    to {
      opacity: 0;
      transform: scale(0.9);
    }
  }

  @keyframes slideInRight {
    from {
      opacity: 0;
      transform: translateX(100px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes slideOutRight {
    from {
      opacity: 1;
      transform: translateX(0);
    }
    to {
      opacity: 0;
      transform: translateX(100px);
    }
  }

  /* 移除蓝色边框，仅保留遮罩/挖空高亮效果
     遮罩的挖空由 updateOverlayMask() 处理；
     这里保持最小样式以避免在目标元素上额外绘制蓝色外框或背景 */
  .tutorial-highlight {
    border-radius: 8px !important;
    transition: all 0.3s ease !important;
    background: transparent !important;
    box-shadow: none !important;
    outline: none !important;
    /* 不设置position和z-index，由JS动态控制 */
  }

  #tutorial-tooltip button {
    transition: all 0.2s ease;
  }

  #tutorial-tooltip button:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }
`;
document.head.appendChild(style);

// 导出全局实例
window.TutorialSystem = TutorialSystem;
window.ToastManager = ToastManager;
window.tutorialManager = new TutorialSystem();
window.toastManager = new ToastManager();
