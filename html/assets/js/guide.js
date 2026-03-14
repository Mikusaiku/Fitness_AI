/**
 * Fitness AI - 动作指南页逻辑
 */
document.addEventListener('DOMContentLoaded', async () => {
    // 1. 从 URL 获取参数 (例如 ?name=杠铃卧推)
    const urlParams = new URLSearchParams(window.location.search);
    const exerciseName = urlParams.get('name');

    if (!exerciseName) {
        window.location.href = 'dashboard.html';
        return;
    }

    // 2. 更新标题显示
    document.getElementById('exercise-title').innerText = exerciseName;

    try {
        // 3. 调用 API 获取 DeepSeek 生成的内容
        const result = await FitnessAPI.getExerciseGuide(exerciseName);
        
        // 4. 渲染内容并移除加载动画
        document.getElementById('guide-body').innerText = result.guide;
    } catch (error) {
        document.getElementById('guide-body').innerHTML = `
            <div style="color: var(--danger);">
                ❌ 获取指南失败。请检查 DeepSeek API 配置或后端运行状态。
            </div>
        `;
    }
});