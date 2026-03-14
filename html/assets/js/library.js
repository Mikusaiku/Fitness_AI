/**
 * Fitness AI - 动作百科逻辑控制 (UI 优化版)
 */

let allExercises = []; // 缓存数据

document.addEventListener('DOMContentLoaded', () => {
    AuthGuard.checkLogin();
    loadLibrary();

    // 1. 实时搜索过滤
    document.getElementById('lib-search').addEventListener('input', (e) => {
        const keyword = e.target.value.toLowerCase().trim();
        const filtered = allExercises.filter(ex => 
            ex.name_zh.toLowerCase().includes(keyword) || 
            (ex.equipment && ex.equipment.toLowerCase().includes(keyword))
        );
        renderCards(filtered);
    });

    // 2. 分类按钮点击切换
    document.querySelectorAll('.pill').forEach(pill => {
        pill.addEventListener('click', function() {
            document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
            this.classList.add('active');
            loadLibrary(this.dataset.muscle);
        });
    });
});

/**
 * 加载库数据
 */
async function loadLibrary(muscle = '') {
    const grid = document.getElementById('exercise-grid');
    try {
        // 调用升级后的接口（包含 PR 数据）
        const res = await FitnessAPI.request(`/exercises?user_id=${FitnessAPI.CURRENT_USER_ID}${muscle ? '&muscle=' + muscle : ''}`);
        if (res.status === 'success') {
            allExercises = res.data;
            renderCards(allExercises);
        }
    } catch (e) {
        grid.innerHTML = '<div style="color:var(--danger); padding:2rem;">❌ 加载失败，请检查后端服务</div>';
    }
}

/**
 * 渲染卡片 (集成 PR 徽章)
 */
function renderCards(data) {
    const grid = document.getElementById('exercise-grid');
    if (data.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:3rem; color:var(--text-muted);">未找到相关动作</div>';
        return;
    }

    grid.innerHTML = data.map(ex => {
        // 处理最高 1RM
        const pr = ex.personal_best ? `🏆 PR: ${parseFloat(ex.personal_best).toFixed(1)}kg` : '🆕 尚未尝试';

        return `
            <div class="lib-card" onclick="openDetail('${ex.name_zh}', '${ex.type}', '${ex.equipment}')">
                <div class="pr-badge">${pr}</div>
                <div class="exercise-name">${ex.name_zh}</div>
                <div class="exercise-meta">
                    <span class="tag">${ex.type === 'Strength' ? '力量' : '有氧'}</span>
                    <span class="tag">${ex.equipment || '徒手'}</span>
                </div>
                <div style="margin-top:10px; color:var(--primary); font-size:0.8rem;">
                    ${ex.muscle_categories || ''}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * AI 指南与详情展示
 */
async function openDetail(name, type, equipment) {
    const drawer = document.getElementById('detail-drawer');
    const overlay = document.getElementById('drawer-overlay');
    
    document.getElementById('drawer-title').innerText = name;
    document.getElementById('drawer-meta').innerText = `${type === 'Strength' ? '🏋️ 力量训练' : '🏃 有氧运动'} | 器材：${equipment || '无'}`;
    document.getElementById('ai-guide-text').innerText = '';
    document.getElementById('ai-loading').style.display = 'block';

    drawer.classList.add('open');
    overlay.style.display = 'block';

    try {
        // 调用 api.js 里的 AI 接口
        const res = await FitnessAPI.getExerciseGuide(name);
        document.getElementById('ai-loading').style.display = 'none';
        if (res.status === 'success') {
            document.getElementById('ai-guide-text').innerText = res.guide;
        }
    } catch (e) {
        document.getElementById('ai-loading').innerText = "AI 响应超时，请稍后重试。";
    }
}

window.closeDrawer = () => {
    document.getElementById('detail-drawer').classList.remove('open');
    document.getElementById('drawer-overlay').style.display = 'none';
};

document.getElementById('drawer-overlay').addEventListener('click', closeDrawer);