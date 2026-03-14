/**
 * Fitness AI - 状态总览页逻辑控制 (Dashboard)
 * 功能：加载用户信息、渲染五维雷达图、显示 AI 训练建议
 */

document.addEventListener('DOMContentLoaded', async () => {

    AuthGuard.checkLogin();
    // 1. 初始化 ECharts 实例 (对应 HTML 中的 radar-container)
    const radarDom = document.getElementById('radar-chart');
    const myChart = echarts.init(radarDom);

    // 2. 页面加载：并发获取数据
    try {
        const [profile, report, aiAdvice] = await Promise.all([
            FitnessAPI.getUserProfile(),
            FitnessAPI.getStatusSummary(),
            FitnessAPI.getAIRecommendations()
        ]);

        // 渲染页面组件
        renderProfile(profile.data);
        renderRadarChart(myChart, report.radar_chart);
        renderAIRecommendations(aiAdvice);

    } catch (error) {
        console.error("加载状态总览失败:", error);
    }
});

/**
 * 修改后的 dashboard.js 相关部分
 */
function renderProfile(user) {
    const userDisplay = document.getElementById('current-user-name');
    if (userDisplay) {
        // 现在后端会返回 user_id，这里就能正确显示了
        userDisplay.innerText = `${user.username} `; 
    }
}


/**
 * 配置并渲染雷达图
 */
function renderRadarChart(chartInstance, chartData) {
    const option = {
        title: { text: '肌肉平衡度 (Muscle Balance)', textStyle: { color: '#ffffff', fontSize: 14 } },
        tooltip: { trigger: 'item' },
        radar: {
            indicator: chartData.indicators.map(item => ({
                name: item.name,
                max: 100 // 设定满分为 100
            })),
            shape: 'circle',
            splitNumber: 5,
            axisName: { color: '#8e9297' }, // 对应 base.css 的 --text-muted
            splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.05)' } },
            splitArea: { show: false },
            axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.05)' } }
        },
        series: [{
            name: '当前体能状态',
            type: 'radar',
            data: [{
                value: chartData.data,
                name: '能力分值'
            }],
            symbol: 'none',
            itemStyle: { color: '#c1ff00' }, // 对应 base.css 的 --primary (酸性绿)
            areaStyle: {
                color: new echarts.graphic.RadialGradient(0.5, 0.5, 1, [
                    { offset: 0, color: 'rgba(193, 255, 0, 0.1)' },
                    { offset: 1, color: 'rgba(193, 255, 0, 0.4)' }
                ])
            },
            lineStyle: { width: 2, shadowBlur: 10, shadowColor: 'rgba(193, 255, 0, 0.5)' }
        }]
    };
    chartInstance.setOption(option);
}

/**
 * 渲染 AI 建议卡片并更新短板文字
 */
function renderAIRecommendations(advice) {
    // 1. 获取 HTML 中的显示元素
    const container = document.getElementById('ai-recommend-list');
    const muscleTag = document.getElementById('weak-muscle-name');        // 大字标题
    const muscleInline = document.getElementById('weak-muscle-name-inline'); // 文案中的小字

    // 2. 更新短板文字
    if (advice && advice.weakness) {
        if (muscleTag) muscleTag.innerText = advice.weakness;
        if (muscleInline) muscleInline.innerText = advice.weakness;
    }

    // 3. 动态生成推荐动作卡片 (集成 DeepSeek 方案)
    if (advice.recommendations && advice.recommendations.length > 0) {
        container.innerHTML = advice.recommendations.map(item => `
            <div class="recommend-card">
                <div class="card-info">
                    <h4>${item.name_zh}</h4>
                    <p>针对 ${advice.weakness} 肌群的补强训练</p>
                </div>
                <button class="btn btn-primary btn-sm" onclick="showGuide('${item.name_zh}')">查看详情</button>
            </div>
        `).join('');
    } else {
        container.innerHTML = '<p style="color: var(--text-muted);">暂无推荐动作</p>';
    }
}

/**
 * 配合方案 2 的 DeepSeek 弹窗逻辑
 */
async function showGuide(name) {
    // 编码动作名称以防特殊字符导致 URL 出错
    const encodedName = encodeURIComponent(name);
    // 跳转到独立指南页
    window.location.href = `guide.html?name=${encodedName}`;
}