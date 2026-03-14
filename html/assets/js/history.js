/**
 * Fitness AI - 训练历史页逻辑控制 (序号对齐版)
 */

document.addEventListener('DOMContentLoaded', async () => {
    AuthGuard.checkLogin();
    try {
        const [profileRes, historyRes] = await Promise.all([
            FitnessAPI.getUserProfile(),
            FitnessAPI.request(`/logs/history-detailed?user_id=${FitnessAPI.CURRENT_USER_ID}`)
        ]);

        renderHistoryHeader(profileRes.data);
        renderHistoryList(historyRes.history); // 这里后端返回的数组中应包含 user_session_no

    } catch (error) {
        console.error("初始化历史页面失败:", error);
        const container = document.getElementById('history-container');
        if (container) {
            container.innerHTML = '<div class="empty-state" style="color:var(--danger)">❌ 数据加载失败，请检查后端。</div>';
        }
    }
});

function renderHistoryHeader(user) {
    const userDisplay = document.getElementById('history-user-display');
    if (userDisplay && user) {
        userDisplay.innerText = `当前用户: ${user.username} `;
    }
}

/**
 * 渲染历史列表：修改标题为“训练场次 #数字”
 */
function renderHistoryList(history) {
    const container = document.getElementById('history-container');
    
    if (!history || history.length === 0) {
        container.innerHTML = '<div class="empty-state">还没有训练记录，快去开启今日训练吧！</div>';
        return;
    }

    container.innerHTML = history.map(session => `
        <div class="history-card">
            <div class="history-header">
                <div class="session-info">
                    <h3 style="color: var(--primary);">训练场次 #${session.user_session_no || session.session_id}</h3>
                    <small>📅 ${new Date(session.start_time).toLocaleString()}</small>
                </div>
                <button class="btn btn-secondary btn-sm" onclick="saveAsTemplate(${session.session_id})">
                    ⭐ 存为计划模板
                </button>
            </div>
            <div class="exercise-tag-container">
                ${session.exercises && session.exercises.length > 0 
                    ? session.exercises.map(ex => `<span class="exercise-tag">${ex.name_zh} (${ex.sets_count}组)</span>`).join('')
                    : '<span style="color:var(--text-muted)">未记录数据</span>'}
            </div>
        </div>
    `).join('');
}

window.saveAsTemplate = async function(sessionId) {
    const planName = prompt("请为模板起名：");
    if (!planName) return;
    try {
        const res = await FitnessAPI.request('/plans/save-template', {
            method: 'POST',
            body: JSON.stringify({
                session_id: sessionId,
                user_id: FitnessAPI.CURRENT_USER_ID,
                plan_name: planName
            })
        });
        if (res.status === 'success') alert("保存成功");
    } catch (error) { alert("保存失败"); }
};