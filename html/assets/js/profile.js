/**
 * Fitness AI - 个人资料逻辑 (重构修复版)
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. 强制登录自检
    AuthGuard.checkLogin();
    
    // 2. 加载数据
    loadUserInfo();
    loadPRRecords();

    // 3. 身体指标提交监听
    const metricsForm = document.getElementById('metrics-form');
    if (metricsForm) {
        metricsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                user_id: localStorage.getItem('userId'),
                height_cm: document.getElementById('input-height').value,
                weight_kg: document.getElementById('input-weight').value,
                body_fat: document.getElementById('input-fat').value
            };

            try {
                const res = await FitnessAPI.request('/user/body-metrics', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                if (res.status === 'success') {
                    alert("身体指标已成功同步！");
                    location.reload(); 
                }
            } catch (e) { 
                alert("更新失败，请确保后端 5001 端口已启动且数据库字段正确");
                console.error(e);
            }
        });
    }
});

/**
 * 加载基础信息与身体概览
 */
async function loadUserInfo() {
    const uid = localStorage.getItem('userId');
    try {
        // 直接从 profile 接口获取账号信息和最新指标
        const res = await FitnessAPI.getUserProfile(uid);
        if (res.status === 'success') {
            const user = res.data;
            const m = res.latest_metrics; // 假设后端已按建议修改带回此对象

            // 渲染基础信息
            document.getElementById('user-name').innerText = user.username || '健身先锋';
            document.getElementById('user-email').innerText = user.email || '--';
            document.getElementById('user-initial').innerText = (user.username || 'U').charAt(0).toUpperCase();
            document.getElementById('join-date').innerText = `注册于: ${new Date(user.created_at).toLocaleDateString()}`;

            // 渲染身体指标
            if (m) {
                const weight = parseFloat(m.weight_kg) || 0;
                const fat = parseFloat(m.body_fat) || 0;
                const height = parseFloat(m.height_cm) || 0;

                document.getElementById('current-weight').innerText = weight || '--';
                document.getElementById('current-fat').innerText = fat || '--';

                // BMI 计算：体重 / (身高/100)^2
                if (weight > 0 && height > 0) {
                    const bmi = (weight / ((height / 100) ** 2)).toFixed(1);
                    document.getElementById('current-bmi').innerText = bmi;
                    let status = bmi < 18.5 ? '偏瘦' : (bmi < 24 ? '正常' : '偏重');
                    document.getElementById('bmi-status').innerText = `(${status})`;
                    
                    // 回填表单中的身高，方便用户下次更新
                    document.getElementById('input-height').value = height;
                }
            }
        }
    } catch (e) { 
        console.error("加载个人资料失败:", e); 
    }
}

/**
 * 加载 PR 荣誉墙
 */
async function loadPRRecords() {
    const uid = localStorage.getItem('userId');
    const wall = document.getElementById('pr-wall');
    if (!wall) return;

    try {
        // 获取所有动作及其个人最高记录
        const res = await FitnessAPI.request(`/exercises?user_id=${uid}`);
        if (res.status === 'success' && res.data) {
            // 过滤并排序力量巅峰记录
            const topPrs = res.data
                .filter(ex => ex.personal_best > 0 && ex.personal_best < 1000) // 过滤异常天文数字
                .sort((a, b) => b.personal_best - a.personal_best)
                .slice(0, 6); 
            
            if (topPrs.length === 0) {
                wall.innerHTML = '<div style="color:var(--text-muted)">尚未解锁任何力量记录，快去开启训练吧！</div>';
                return;
            }

            wall.innerHTML = topPrs.map(ex => `
                <div class="pr-card">
                    <div class="exercise-name">${ex.name_zh}</div>
                    <div class="pr-value">${parseFloat(ex.personal_best).toFixed(1)} <small>kg</small></div>
                </div>
            `).join('');
        }
    } catch (e) { 
        console.error("加载 PR 记录失败:", e); 
    }
}