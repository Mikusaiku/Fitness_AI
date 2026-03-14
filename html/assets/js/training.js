/**
 * Fitness AI - 训练执行逻辑控制 (全量交互增强版)
 * 集成：用户隔离、场次序号、AI推荐流程反馈、模板套用、搜索联动、点击外部关闭
 */

// 1. 基础变量与用户隔离存储
const currentUserId = localStorage.getItem('userId');
const sessionKey = `activeSessionId_${currentUserId}`;
const sessionNoKey = `activeSessionNo_${currentUserId}`; 

let currentSessionId = localStorage.getItem(sessionKey); 
let currentSessionNo = localStorage.getItem(sessionNoKey); 

// --- A. 全局导出函数 ---

window.fetchMuscleExercises = async function(muscle) {
    // 权限检查
    if (typeof AuthGuard !== 'undefined' && AuthGuard.checkLogin) AuthGuard.checkLogin();
    try {
        const res = await FitnessAPI.getExercises(muscle);
        if (res.status === 'success') renderSearchResults(res.data);
    } catch (e) { console.error("获取动作失败", e); }
};

/**
 * 修复：增加 type 的空值保护，防止 toLowerCase 报错
 */
window.addExerciseCard = function(id, name, type) {
    const dropdown = document.getElementById('search-dropdown');
    const searchInput = document.getElementById('exercise-search');
    if (dropdown) dropdown.style.display = 'none';
    if (searchInput) searchInput.value = '';

    const container = document.getElementById('exercise-list');
    
    // 安全检查：如果 type 缺失，默认为力量训练 (Strength)
    const safeType = (type || 'Strength').toString().toLowerCase();
    const isCardio = (safeType === 'cardio');
    
    const card = document.createElement('div');
    card.className = 'card exercise-card';
    card.dataset.exerciseId = id;
    card.dataset.type = safeType;
    
    const tableHeader = isCardio 
        ? `<th style="width:15%">组次</th><th style="width:25%">距离(KM)</th><th style="width:25%">时长(MIN)</th><th style="width:20%">平均时速</th><th style="width:15%">操作</th>`
        : `<th style="width:15%">组次</th><th style="width:25%">重量(KG)</th><th style="width:25%">次数</th><th style="width:20%">1RM</th><th style="width:15%">操作</th>`;
    
    card.innerHTML = `
        <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
            <h3 style="margin:0;">${isCardio ? '🏃' : '🏋️'} ${name}</h3>
            <button class="btn btn-ghost btn-sm" onclick="this.closest('.exercise-card').remove()">移除动作</button>
        </div>
        <table class="set-table">
            <thead><tr>${tableHeader}</tr></thead>
            <tbody class="sets-body"></tbody>
        </table>
        <button class="btn btn-secondary btn-sm" style="width:100%" onclick="window.addSetRow(this, ${id})">+ 添加记录</button>
    `;
    container.prepend(card);
    window.addSetRow(card.querySelector('.btn-secondary'), id); 
};

window.addSetRow = async function(btn, exerciseId) {
    const card = btn.closest('.exercise-card');
    const typeAttr = card.dataset.type || 'strength';
    const isCardio = (typeAttr.toLowerCase() === 'cardio');
    const tbody = card.querySelector('.sets-body');
    const tr = document.createElement('tr');
    tr.className = 'set-row'; 
    tr.innerHTML = isCardio 
        ? `<td>${tbody.children.length + 1}</td><td><input type="number" step="0.1" class="input-dist"></td><td><input type="number" class="input-dur"></td><td class="result-speed">-</td><td><button class="btn btn-ghost btn-sm" onclick="this.closest('tr').remove()">🗑️</button></td>`
        : `<td>${tbody.children.length + 1}</td><td><input type="number" step="0.5" class="input-weight"></td><td><input type="number" class="input-reps"></td><td class="result-1rm">-</td><td><button class="btn btn-ghost btn-sm" onclick="this.closest('tr').remove()">🗑️</button></td>`;
    
    tr.querySelectorAll('input').forEach(input => {
        input.addEventListener('blur', () => saveSetData(tr, exerciseId, isCardio));
    });
    tbody.appendChild(tr);
    return tr;
};

// --- B. 页面核心逻辑 ---

document.addEventListener('DOMContentLoaded', async () => {
    const btnSession = document.getElementById('btn-session');
    const btnCancel = document.getElementById('btn-cancel-session');
    const btnAiPlan = document.getElementById('btn-ai-plan');
    const btnApplyPlan = document.getElementById('btn-apply-plan');
    const planSelector = document.getElementById('select-my-plan');
    const searchInput = document.getElementById('exercise-search');
    const searchDropdown = document.getElementById('search-dropdown');

    // 状态初始化
    if (currentSessionId && currentUserId) {
        updateUItoRecording(currentSessionNo); 
        await restoreActiveSession(); 
    }

    // 开启/结束训练
    btnSession.addEventListener('click', async () => {
        if (!currentSessionId) {
            try {
                const res = await FitnessAPI.request('/sessions/start', {
                    method: 'POST',
                    body: JSON.stringify({ user_id: currentUserId })
                });
                currentSessionId = res.session_id;
                currentSessionNo = res.user_session_no; 
                localStorage.setItem(sessionKey, currentSessionId);
                localStorage.setItem(sessionNoKey, currentSessionNo); 
                updateUItoRecording(currentSessionNo);
                loadMyPlansList(); 
            } catch (e) { alert("开启失败，请检查服务器"); }
        } else {
            if (confirm("确定要结束本次训练并保存记录吗？")) {
                localStorage.removeItem(sessionKey);
                localStorage.removeItem(sessionNoKey);
                location.href = 'dashboard.html';
            }
        }
    });

    // 取消训练逻辑
    if (btnCancel) {
        btnCancel.addEventListener('click', async () => {
            if (!currentSessionId) return;
            if (confirm("🚨 警告：确定要取消本次训练吗？\n数据将被永久删除。")) {
                try {
                    await FitnessAPI.request('/sessions/cancel', {
                        method: 'POST',
                        body: JSON.stringify({ session_id: currentSessionId })
                    });
                    localStorage.removeItem(sessionKey);
                    localStorage.removeItem(sessionNoKey);
                    location.href = 'dashboard.html';
                } catch (e) { alert("取消失败"); }
            }
        });
    }

    // 模板套用逻辑
    if (btnApplyPlan) {
        btnApplyPlan.addEventListener('click', async () => {
            const planId = planSelector.value;
            if (!planId) return alert("请先选择一个模板");
            btnApplyPlan.disabled = true;
            try {
                const res = await FitnessAPI.request(`/plans/details/${planId}`);
                if (res.status === 'success' && res.items) {
                    document.getElementById('exercise-list').innerHTML = ''; 
                    for (const item of res.items) {
                        window.addExerciseCard(item.exercise_id, item.name_zh, item.type);
                        const card = document.querySelector(`.exercise-card[data-exercise-id="${item.exercise_id}"]`);
                        for (let i = 0; i < (item.target_sets || 1); i++) {
                            let row = (i === 0) ? card.querySelector('.set-row') : await window.addSetRow(card.querySelector('.btn-secondary'), item.exercise_id);
                            if (item.type.toLowerCase() === 'strength') {
                                row.querySelector('.input-weight').value = item.target_weight || 0;
                                row.querySelector('.input-reps').value = item.target_reps || 0;
                            } else {
                                row.querySelector('.input-dist').value = item.target_distance || 0;
                                row.querySelector('.input-dur').value = (item.target_duration / 60).toFixed(0) || 0;
                            }
                            await saveSetData(row, item.exercise_id, (item.type.toLowerCase() === 'cardio'));
                        }
                    }
                }
            } catch (e) { alert("加载失败"); }
            finally { btnApplyPlan.disabled = false; }
        });
    }

    /**
     * 增强逻辑：AI 推荐的全流程反馈
     */
    if (btnAiPlan) {
        btnAiPlan.onclick = async () => {
            const originalText = btnAiPlan.innerText;
            btnAiPlan.disabled = true;
            btnAiPlan.innerText = "⏳ AI 正在分析数据...";

            try {
                const res = await FitnessAPI.request(`/ai/recommend-plan?user_id=${currentUserId}`);
                if (res.status === 'success' && res.plan) {
                    btnAiPlan.innerText = "🔄 正在装载计划...";
                    await renderAiPlan(res.plan); 
                    btnAiPlan.innerText = "✅ 计划装载完成";
                    setTimeout(() => { btnAiPlan.innerText = originalText; }, 2000);
                }
            } catch (e) { 
                alert("AI 接口异常"); 
                btnAiPlan.innerText = originalText;
            } finally { 
                btnAiPlan.disabled = false; 
            }
        };
    }

    // 搜索联动与点击关闭
    if (searchInput) {
        searchInput.addEventListener('input', async (e) => {
            const keyword = e.target.value.trim();
            if (keyword.length < 1) { searchDropdown.style.display = 'none'; return; }
            try {
                const res = await FitnessAPI.getExercises();
                const matches = res.data.filter(ex => ex.name_zh.includes(keyword)).slice(0, 8);
                renderSearchResults(matches);
            } catch (e) { console.error(e); }
        });
    }

    document.addEventListener('click', (e) => {
        const wrapper = document.querySelector('.search-box-wrapper');
        if (wrapper && !wrapper.contains(e.target)) {
            if (searchDropdown) searchDropdown.style.display = 'none';
        }
    });
});

/**
 * UI 渲染：更新标题为“训练场次 #数字”
 */
function updateUItoRecording(sessionNo) {
    const statusEl = document.getElementById('session-status');
    if (statusEl) {
        statusEl.innerText = `训练场次 #${sessionNo || '...'}`;
        statusEl.style.color = 'var(--primary)';
    }
    document.getElementById('category-panel').style.display = 'block';
    const btnCancel = document.getElementById('btn-cancel-session');
    const btnSession = document.getElementById('btn-session');
    if (btnCancel) btnCancel.style.display = 'block'; 
    btnSession.innerText = "结束训练";
    btnSession.classList.replace('btn-primary', 'btn-danger');
}

async function saveSetData(row, exerciseId, isCardio) {
    if (!currentSessionId) return;
    let payload = { session_id: currentSessionId, exercise_id: exerciseId };
    if (isCardio) {
        const dist = row.querySelector('.input-dist').value;
        const dur = row.querySelector('.input-dur').value;
        if (!dist || !dur) return;
        const speed = (parseFloat(dist) / (parseFloat(dur) / 60)).toFixed(1);
        row.querySelector('.result-speed').innerText = `${speed} km/h`;
        payload.distance_km = parseFloat(dist);
        payload.duration_seconds = parseInt(dur) * 60;
    } else {
        const weight = row.querySelector('.input-weight').value;
        const reps = row.querySelector('.input-reps').value;
        if (weight === "" || reps === "") return;
        payload.weight_kg = parseFloat(weight);
        payload.reps = parseInt(reps);
    }
    try {
        const res = await FitnessAPI.addLog(payload);
        if (!isCardio && res.calculated_1rm) {
            row.querySelector('.result-1rm').innerText = `${res.calculated_1rm} kg`;
        }
    } catch (err) { console.error("同步失败", err); }
}

/**
 * 修复版：AI 计划渲染，增加字段容错处理
 */
async function renderAiPlan(plan) {
    const list = document.getElementById('exercise-list');
    list.innerHTML = ''; 
    
    for (const item of plan) {
        const exerciseId = item.exercise_id || 1;
        const exerciseName = item.name || 'AI 推荐动作';
        const exerciseType = item.type || 'Strength'; 

        window.addExerciseCard(exerciseId, exerciseName, exerciseType);
        
        const card = document.querySelector(`.exercise-card[data-exercise-id="${exerciseId}"]`);
        if (card) {
            const row = card.querySelector('.set-row');
            const isCardio = (exerciseType.toLowerCase() === 'cardio');
            
            if (!isCardio) {
                row.querySelector('.input-weight').value = item.weight || 0;
                row.querySelector('.input-reps').value = item.reps || 0;
            } else {
                row.querySelector('.input-dist').value = item.distance || 0;
                row.querySelector('.input-dur').value = item.duration ? (item.duration / 60).toFixed(0) : 0;
            }
            await saveSetData(row, exerciseId, isCardio);
        }
    }
}

async function restoreActiveSession() {
    try {
        const res = await FitnessAPI.request(`/sessions/active-details?session_id=${currentSessionId}`);
        if (res.status === 'success' && res.exercises) {
            document.getElementById('exercise-list').innerHTML = ''; 
            if (res.user_session_no) {
                currentSessionNo = res.user_session_no;
                localStorage.setItem(sessionNoKey, currentSessionNo);
                updateUItoRecording(currentSessionNo);
            }
            for (const ex of res.exercises) {
                window.addExerciseCard(ex.exercise_id, ex.name_zh, ex.type);
                const card = document.querySelector(`.exercise-card[data-exercise-id="${ex.exercise_id}"]`);
                const tbody = card.querySelector('.sets-body');
                tbody.innerHTML = ''; 
                for (const setData of ex.sets) {
                    const row = await window.addSetRow(card.querySelector('.btn-secondary'), ex.exercise_id);
                    if (ex.type.toLowerCase() === 'strength') {
                        row.querySelector('.input-weight').value = setData.weight_kg;
                        row.querySelector('.input-reps').value = setData.reps;
                        if (setData.calculated_1rm) row.querySelector('.result-1rm').innerText = `${setData.calculated_1rm} kg`;
                    } else {
                        row.querySelector('.input-dist').value = setData.distance_km;
                        row.querySelector('.input-dur').value = (setData.duration_seconds / 60).toFixed(0);
                        const speed = (setData.distance_km / (setData.duration_seconds / 3600)).toFixed(1);
                        row.querySelector('.result-speed').innerText = `${speed} km/h`;
                    }
                }
            }
        }
        loadMyPlansList();
    } catch (e) { localStorage.removeItem(sessionKey); localStorage.removeItem(sessionNoKey); }
}

async function loadMyPlansList() {
    try {
        const res = await FitnessAPI.request(`/plans/my?user_id=${currentUserId}`);
        const ps = document.getElementById('select-my-plan');
        if (res.status === 'success' && ps) {
            ps.innerHTML = '<option value="">-- 选择已保存模板 --</option>' + 
                res.plans.map(p => `<option value="${p.plan_id}">${p.name}</option>`).join('');
        }
    } catch (e) { console.error(e); }
}

function renderSearchResults(results) {
    const dropdown = document.getElementById('search-dropdown');
    if (!dropdown) return;
    dropdown.innerHTML = results.length === 0 ? '<div class="search-item">未找到匹配动作</div>' : 
        results.map(ex => `<div class="search-item" onclick="window.addExerciseCard(${ex.exercise_id}, '${ex.name_zh}', '${ex.type}')">
            <span>${ex.name_zh}</span> <small>(${ex.type === 'Cardio' ? '🏃有氧' : '🏋️力量'})</small>
        </div>`).join('');
    dropdown.style.display = 'block';
}