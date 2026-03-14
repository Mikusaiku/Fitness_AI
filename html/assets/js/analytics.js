/**
 * Fitness AI - 数据分析页逻辑 (力量 + 身体趋势版)
 */

document.addEventListener('DOMContentLoaded', async () => {
    AuthGuard.checkLogin();

    // 初始化两个图表
    const strengthChart = echarts.init(document.getElementById('strength-chart'), 'dark');
    const bodyChart = echarts.init(document.getElementById('body-trends-chart'), 'dark');

    // --- 1. 力量分析初始化 ---
    try {
        const response = await FitnessAPI.getPerformedExercises();
        const performedExercises = response.data;
        const selector = document.getElementById('exercise-select');

        if (performedExercises.length > 0) {
            selector.innerHTML = performedExercises.map(ex => 
                `<option value="${ex.exercise_id}">${ex.name_zh}</option>`
            ).join('');
            loadStrengthTrend(strengthChart, performedExercises[0].exercise_id);
        } else {
            selector.innerHTML = '<option value="">暂无训练记录</option>';
        }

        selector.addEventListener('change', (e) => loadStrengthTrend(strengthChart, e.target.value));
    } catch (err) { console.error("力量列表加载失败", err); }

    // --- 2. 身体趋势初始化 ---
    loadBodyTrends(bodyChart);
    document.getElementById('body-metric-type').addEventListener('change', () => loadBodyTrends(bodyChart));

    window.addEventListener('resize', () => {
        strengthChart.resize();
        bodyChart.resize();
    });
});

/**
 * 身体指标渲染：实现双轴和动态切换
 */
async function loadBodyTrends(chartInstance) {
    chartInstance.showLoading({ textColor: '#c1ff00', maskColor: 'rgba(10, 12, 16, 0.8)' });
    const viewType = document.getElementById('body-metric-type').value;

    try {
        const res = await FitnessAPI.getBodyTrends();
        const dates = res.trends.map(t => t.date);
        const weights = res.trends.map(t => t.weight);
        const fats = res.trends.map(t => t.body_fat);

        const option = {
            backgroundColor: 'transparent',
            tooltip: { trigger: 'axis' },
            legend: { data: ['体重 (kg)', '体脂 (%)'], bottom: 10 },
            xAxis: { type: 'category', data: dates },
            // 双 Y 轴设计：左轴体重，右轴体脂
            yAxis: [
                { type: 'value', name: '体重', position: 'left', axisLabel: { formatter: '{value} kg' }, splitLine: { show: false } },
                { type: 'value', name: '体脂', position: 'right', axisLabel: { formatter: '{value} %' }, splitLine: { show: false } }
            ],
            series: []
        };

        if (viewType === 'both' || viewType === 'weight') {
            option.series.push({
                name: '体重 (kg)', type: 'line', smooth: true, yAxisIndex: 0, data: weights,
                itemStyle: { color: '#c1ff00' }, areaStyle: { opacity: 0.1 }
            });
        }
        if (viewType === 'both' || viewType === 'fat') {
            option.series.push({
                name: '体脂 (%)', type: 'line', smooth: true, yAxisIndex: 1, data: fats,
                itemStyle: { color: '#ff4d4d' }, areaStyle: { opacity: 0.1 }
            });
        }

        chartInstance.hideLoading();
        chartInstance.setOption(option, true);
    } catch (e) { 
        chartInstance.hideLoading();
        console.error("加载身体趋势失败", e);
    }
}

/**
 * 原有的力量趋势加载函数
 */
async function loadStrengthTrend(chartInstance, exerciseId) {
    if (!exerciseId) return;
    chartInstance.showLoading({ textColor: '#c1ff00', maskColor: 'rgba(10, 12, 16, 0.8)' });
    try {
        const response = await FitnessAPI.getStrengthTrend(exerciseId);
        const { dates, values } = response.trend;
        chartInstance.hideLoading();
        chartInstance.setOption({
            backgroundColor: 'transparent',
            tooltip: { trigger: 'axis' },
            xAxis: { type: 'category', data: dates },
            yAxis: { type: 'value', name: '1RM (kg)' },
            series: [{ data: values, type: 'line', smooth: true, itemStyle: { color: '#c1ff00' } }]
        });
    } catch (err) { chartInstance.hideLoading(); }
}