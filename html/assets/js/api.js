/**
 * Fitness AI - 动态接口适配器 (已修复穿透适配与 AuthGuard 遗漏问题)
 */

/**
 * Fitness AI - 动态接口适配器 (修复版)
 */
const API_CONFIG = {
    /**
     * 核心修复：本地访问必须包含 /api/v1 后缀，否则会报 404 导致 CORS 预检失败
     */
    BASE_URL: (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')
        ? 'http://127.0.0.1:5001/api/v1'  // 这里一定要加 /api/v1
        : `${window.location.origin}/api/v1`,

    get CURRENT_USER_ID() {
        const savedId = localStorage.getItem('userId');
        return savedId ? parseInt(savedId) : 1;
    }
};

/**
 * 全局身份守卫
 */
window.AuthGuard = {
    /**
     * 身份自检：对齐 profile.js/training.js 的调用名
     */
    checkLogin: function() {
        const userId = localStorage.getItem('userId');
        // 如果没有找到 ID，且当前不在登录/索引页，则强制跳转
        if (!userId && !window.location.pathname.includes('login.html')) {
            alert("请先登录以访问您的训练数据");
            window.location.href = 'login.html'; 
        }
    },

    /**
     * 退出登录：修复 profile.html 报错 logout is not a function
     */
    logout: function() {
        if (confirm("确定要退出登录并清除所有本地缓存吗？")) {
            // 彻底清理包含 sessionKey 在内的所有用户隔离数据
            localStorage.clear();
            window.location.href = 'login.html';
        }
    }
};

const API = {
    get CURRENT_USER_ID() {
        return API_CONFIG.CURRENT_USER_ID;
    },

    // 基础请求封装
    async request(endpoint, options = {}) {
        const url = `${API_CONFIG.BASE_URL}${endpoint}`;
        const headers = { 'Content-Type': 'application/json', ...options.headers };
        try {
            const response = await fetch(url, { ...options, headers });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || '网络请求失败');
            }
            return await response.json();
        } catch (error) {
            console.error(`[API Error] ${endpoint}:`, error);
            throw error;
        }
    },

    // --- 1. 用户与个人资料 ---
    async getUserProfile(userId = API_CONFIG.CURRENT_USER_ID) {
        return await this.request(`/user/profile?user_id=${userId}`);
    },

    setLoginUser(userId, username = '健身先锋') {
        localStorage.setItem('userId', userId);
        localStorage.setItem('username', username);
        console.log(`已成功切换到用户: ${username} (ID: ${userId})`);
    },

    // --- 2. 状态分析与 AI 功能 ---
    async getStatusSummary(userId = API_CONFIG.CURRENT_USER_ID) {
        return await this.request(`/fitness/report?user_id=${userId}`);
    },

    async getAIRecommendations(userId = API_CONFIG.CURRENT_USER_ID) {
        return await this.request(`/recommend?user_id=${userId}`);
    },

    async getAIPlan(userId = API_CONFIG.CURRENT_USER_ID) {
        return await this.request(`/ai/recommend-plan?user_id=${userId}`);
    },
    
    async getBodyTrends(userId = API_CONFIG.CURRENT_USER_ID) {
        return await this.request(`/analytics/body-trends?user_id=${userId}`);
    },
 
    async getExerciseGuide(name) {
        return await this.request(`/exercises/guide?name=${encodeURIComponent(name)}`);
    },
    // --- 3. 训练执行模块 ---
    async startSession(userId = API_CONFIG.CURRENT_USER_ID) {
        return await this.request('/sessions/start', {
            method: 'POST',
            body: JSON.stringify({ user_id: userId })
        });
    },

    async addLog(data) {
        return await this.request('/logs/add', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    // --- 4. 动作库与数据分析 ---
    async getExercises(muscle = '') {
        const path = muscle ? `/exercises?muscle=${encodeURIComponent(muscle)}` : '/exercises';
        return await this.request(path);
    },

    async getStrengthTrend(exerciseId, userId = API_CONFIG.CURRENT_USER_ID) {
        return await this.request(`/predict/trend?user_id=${userId}&exercise_id=${exerciseId}`);
    },

    async getMyPlans(userId = API_CONFIG.CURRENT_USER_ID) {
        return await this.request(`/plans/my?user_id=${userId}`);
    },

    async getPerformedExercises(userId = API_CONFIG.CURRENT_USER_ID) {
        return await this.request(`/user/performed-exercises?user_id=${userId}`);
    },
};

// 导出全局对象
window.FitnessAPI = API;