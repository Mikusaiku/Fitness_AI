import sys
import os
import requests
import json
import re
import mysql.connector
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from db_config import DB_config
from ALG.report_generator import generate_web_report
from dotenv import load_dotenv

app = Flask(__name__)
CORS(app) # 解决前端跨域问题


# --------------------------------------------------------
# 1. 基础配置与路由汇总 (System Base)
# --------------------------------------------------------

#  加载 .env 文件中的变量
load_dotenv()

app = Flask(__name__)

# 从环境变量中读取配置，不再硬编码
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
if not DEEPSEEK_API_KEY:
    print("错误: 未在环境变量中找到 DEEPSEEK_API_KEY，请检查 .env 文件。")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"), # 第二个参数是默认值
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD"),
    "database": os.getenv("DB_NAME")
}



# --------------------------------------------------------
# 2. 用户管理模块 (User Management)
# --------------------------------------------------------

@app.route('/api/v1/auth/register', methods=['POST'])
def register():
    """用户注册"""
    data = request.json
    try:
        with mysql.connector.connect(**DB_config) as conn:
            with conn.cursor() as cursor:
                sql = "INSERT INTO users (username, email, password_hash) VALUES (%s, %s, %s)"
                cursor.execute(sql, (data.get('username'), data.get('email'), data.get('password')))
                conn.commit()
        return jsonify({"status": "success", "message": "用户创建成功"}), 201
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# 修改 app.py 中的 get_profile 路由
@app.route('/api/v1/user/profile', methods=['GET'])
def get_profile():
    user_id = request.args.get('user_id', type=int)
    try:
        with mysql.connector.connect(**DB_config) as conn:
            with conn.cursor(dictionary=True) as cursor:
                # 1. 获取账号基础信息
                cursor.execute("SELECT username, email, created_at FROM users WHERE user_id = %s", (user_id,))
                user_info = cursor.fetchone()
                if not user_info:
                    return jsonify({"status": "error", "message": "用户不存在"}), 404

                # 2. 获取最新身体指标：注意字段名 body_fat 和 weight_kg
                sql_metrics = """
                    SELECT weight_kg, body_fat, height_cm 
                    FROM body_metrics 
                    WHERE user_id = %s 
                    ORDER BY date DESC, metric_id DESC 
                    LIMIT 1
                """
                cursor.execute(sql_metrics, (user_id,))
                metrics = cursor.fetchone()

                return jsonify({
                    "status": "success",
                    "data": user_info,
                    "latest_metrics": metrics # 这里的数据将包含 weight_kg, body_fat, height_cm
                }), 200
    except Exception as e:
        print(f"❌ 数据库查询错误: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

# 同时修改保存接口，确保能存入身高
@app.route('/api/v1/user/body-metrics', methods=['POST'])
def update_body_metrics():
    data = request.json
    try:
        with mysql.connector.connect(**DB_config) as conn:
            with conn.cursor() as cursor:
                # 插入包含身高的完整记录
                sql = """
                    INSERT INTO body_metrics (user_id, date, height_cm, weight_kg, body_fat) 
                    VALUES (%s, CURDATE(), %s, %s, %s)
                """
                cursor.execute(sql, (
                    data.get('user_id'), 
                    data.get('height_cm'), 
                    data.get('weight_kg'), 
                    data.get('body_fat')
                ))
                conn.commit()
        return jsonify({"status": "success", "message": "指标同步成功"}), 201
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# ---  完善登录验证接口 ---
@app.route('/api/v1/auth/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password') # 建议后续使用 werkzeug.security 进行哈希校验

    try:
        with mysql.connector.connect(**DB_config) as conn:
            with conn.cursor(dictionary=True) as cursor:
                # 根据邮箱查询用户
                sql = "SELECT user_id, username, password_hash FROM users WHERE email = %s"
                cursor.execute(sql, (email,))
                user = cursor.fetchone()

                if user and user['password_hash'] == password: # 简单比对
                    return jsonify({
                        "status": "success",
                        "message": "登录成功",
                        "user_id": user['user_id'],
                        "username": user['username']
                    }), 200
                else:
                    return jsonify({"status": "error", "message": "邮箱或密码错误"}), 401
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500



# --------------------------------------------------------
# 3. 动作库与历史记录 (Exercise & History)
# --------------------------------------------------------

@app.route('/api/v1/exercises', methods=['GET'])
def get_exercises():
    muscle = request.args.get('muscle')
    user_id = request.args.get('user_id')  # 获取当前用户ID以查询个人PR
    
    try:
        with mysql.connector.connect(**DB_config) as conn:
            with conn.cursor(dictionary=True) as cursor:
                # 核心查询：将动作库与力量进展视图左连接
                query = """
                    SELECT e.exercise_id, e.name_zh, e.equipment, e.type,
                           MAX(v.estimated_1rm) as personal_best,
                           GROUP_CONCAT(DISTINCT m.category SEPARATOR ', ') AS muscle_categories
                    FROM exercise_library e
                    LEFT JOIN exercise_muscle_link l ON e.exercise_id = l.exercise_id
                    LEFT JOIN muscle_groups m ON l.muscle_id = m.muscle_id
                    LEFT JOIN view_strength_progress v ON e.exercise_id = v.exercise_id AND v.user_id = %s
                """
                params = [user_id]
                
                if muscle:
                    sql = query + " WHERE m.name = %s OR m.category = %s GROUP BY e.exercise_id"
                    params.extend([muscle, muscle])
                else:
                    sql = query + " GROUP BY e.exercise_id"
                
                cursor.execute(sql, params)
                return jsonify({"status": "success", "data": cursor.fetchall()}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/v1/logs/history', methods=['GET'])
def get_history():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({"status": "error", "message": "Missing user_id"}), 400
        
    try:
        with mysql.connector.connect(**DB_config) as conn:
            with conn.cursor(dictionary=True) as cursor:
                sql = """
                    SELECT ws.session_id, ws.start_time, ws.status, COUNT(se.session_exercise_id) as exercise_count
                    FROM workout_sessions ws
                    LEFT JOIN session_exercises se ON ws.session_id = se.session_id
                    WHERE ws.user_id = %s GROUP BY ws.session_id ORDER BY ws.start_time DESC
                """
                cursor.execute(sql, (user_id,))
                return jsonify({"status": "success", "history": cursor.fetchall()}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/v1/user/performed-exercises', methods=['GET'])
def get_performed_exercises():
    """获取用户有过训练记录的动作列表"""
    user_id = request.args.get('user_id', default=1, type=int)
    try:
        with mysql.connector.connect(**DB_config) as conn:
            with conn.cursor(dictionary=True) as cursor:
                sql = """
                    SELECT DISTINCT e.exercise_id, e.name_zh 
                    FROM exercise_library e
                    JOIN session_exercises se ON e.exercise_id = se.exercise_id
                    JOIN workout_sessions ws ON se.session_id = ws.session_id
                    WHERE ws.user_id = %s
                """
                cursor.execute(sql, (user_id,))
                return jsonify({"status": "success", "data": cursor.fetchall()}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    
# --- 新增：获取我的计划列表 ---
@app.route('/api/v1/plans/my', methods=['GET'])
def get_my_plans():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({"status": "error", "message": "Missing user_id"}), 400
    try:
        with mysql.connector.connect(**DB_config) as conn:
            with conn.cursor(dictionary=True) as cursor:
                # 从 plans 表查询该用户的所有模板
                sql = "SELECT plan_id, name FROM plans WHERE user_id = %s"
                cursor.execute(sql, (user_id,))
                return jsonify({"status": "success", "plans": cursor.fetchall()}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# --- 1. 获取包含动作明细的详细训练历史 ---
@app.route('/api/v1/logs/history-detailed', methods=['GET'])
def get_detailed_history():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({"status": "error", "message": "Missing user_id"}), 400
    try:
        with mysql.connector.connect(**DB_config) as conn:
            with conn.cursor(dictionary=True) as cursor:
                # 1. 核心修改：在 SELECT 语句中加入 user_session_no
                sql_sessions = """
                    SELECT session_id, user_session_no, start_time, status 
                    FROM workout_sessions 
                    WHERE user_id = %s 
                    ORDER BY start_time DESC
                """
                cursor.execute(sql_sessions, (user_id,))
                sessions = cursor.fetchall()
                
                for sess in sessions:
                    # 2. 保持原有功能不变：抓取动作及组数统计
                    sql_details = """
                        SELECT e.name_zh, COUNT(es.set_id) as sets_count 
                        FROM session_exercises se
                        JOIN exercise_library e ON se.exercise_id = e.exercise_id
                        LEFT JOIN exercise_sets es ON se.session_exercise_id = es.session_exercise_id
                        WHERE se.session_id = %s GROUP BY e.exercise_id
                    """
                    cursor.execute(sql_details, (sess['session_id'],))
                    sess['exercises'] = cursor.fetchall()
                
                # 返回包含专属序号的数据集
                return jsonify({"status": "success", "history": sessions}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# --- 2. 将历史场次保存为计划模板 (包含具体数值) ---
@app.route('/api/v1/plans/save-template', methods=['POST'])
def save_as_template():
    data = request.json
    s_id, user_id, plan_name = data.get('session_id'), data.get('user_id'), data.get('plan_name')
    try:
        with mysql.connector.connect(**DB_config) as conn:
            with conn.cursor() as cursor:
                cursor.execute("INSERT INTO plans (user_id, name) VALUES (%s, %s)", (user_id, plan_name))
                new_plan_id = cursor.lastrowid
                # 核心逻辑：保存时抓取历史最大重量和平均次数作为模板
                sql_items = """
                    INSERT INTO plan_items (plan_id, exercise_id, target_sets, target_weight, target_reps, target_distance, target_duration)
                    SELECT %s, exercise_id, COUNT(*), MAX(weight_kg), AVG(reps), MAX(distance_km), MAX(duration_seconds)
                    FROM exercise_sets es
                    JOIN session_exercises se ON es.session_exercise_id = se.session_exercise_id
                    WHERE se.session_id = %s GROUP BY se.exercise_id
                """
                cursor.execute(sql_items, (new_plan_id, s_id))
                conn.commit()
        return jsonify({"status": "success", "message": "模板保存成功"}), 201
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# --- 3. 修改原有的获取计划详情接口以支持返回具体数值 ---
# 请找到并更新你 app.py 中现有的 get_plan_details 函数
@app.route('/api/v1/plans/details/<int:plan_id>', methods=['GET'])
def get_plan_details(plan_id):
    try:
        with mysql.connector.connect(**DB_config) as conn:
            with conn.cursor(dictionary=True) as cursor:
                # 增加对数值字段的查询
                sql = """
                    SELECT pi.*, e.name_zh, e.type
                    FROM plan_items pi
                    JOIN exercise_library e ON pi.exercise_id = e.exercise_id
                    WHERE pi.plan_id = %s
                """
                cursor.execute(sql, (plan_id,))
                return jsonify({"status": "success", "items": cursor.fetchall()}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    
# --------------------------------------------------------
# 4. 训练执行核心 (Workout Ingestion)
# --------------------------------------------------------

@app.route('/api/v1/sessions/start', methods=['POST'])
def start_session():
    data = request.json
    user_id = data.get('user_id')
    
    if not user_id:
        return jsonify({"status": "error", "message": "Missing user_id"}), 400

    try:
        with mysql.connector.connect(**DB_config) as conn:
            with conn.cursor() as cursor:
                # --- 新增逻辑：计算该用户的专属序号 ---
                # 获取该用户已有的最大序号，如果没有记录则返回 0
                sql_get_no = "SELECT COALESCE(MAX(user_session_no), 0) FROM workout_sessions WHERE user_id = %s"
                cursor.execute(sql_get_no, (user_id,))
                next_no = cursor.fetchone()[0] + 1
                
                # --- 修改插入语句：存入 user_session_no ---
                sql_insert = """
                    INSERT INTO workout_sessions (user_id, user_session_no, start_time, status) 
                    VALUES (%s, %s, NOW(), 'In_Progress')
                """
                cursor.execute(sql_insert, (user_id, next_no))
                
                conn.commit()
                
                return jsonify({
                    "status": "success", 
                    "session_id": cursor.lastrowid,
                    "user_session_no": next_no  # 返回给前端显示
                }), 201
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/v1/logs/add', methods=['POST'])
def add_log():
    """原子级数据录入：已增强对有氧运动字段的支持"""
    data = request.json
    s_id, e_id = data.get('session_id'), data.get('exercise_id')
    
    # 提取所有可能的运动数据字段
    weight = data.get('weight_kg')
    reps = data.get('reps')
    dist = data.get('distance_km')
    dur = data.get('duration_seconds')
    speed = data.get('speed_kph')

    try:
        with mysql.connector.connect(**DB_config) as conn:
            with conn.cursor(dictionary=True) as cursor:
                # 维护 session_exercises 关联记录
                cursor.execute("SELECT session_exercise_id FROM session_exercises WHERE session_id = %s AND exercise_id = %s", (s_id, e_id))
                se = cursor.fetchone()
                se_id = se['session_exercise_id'] if se else (cursor.execute("INSERT INTO session_exercises (session_id, exercise_id) VALUES (%s, %s)", (s_id, e_id)) or cursor.lastrowid)
                
                # 插入 exercise_sets 记录（包含有氧字段）
                sql = """
                    INSERT INTO exercise_sets 
                    (session_exercise_id, weight_kg, reps, distance_km, duration_seconds, speed_kph, is_completed, set_number) 
                    VALUES (%s, %s, %s, %s, %s, %s, 1, 1)
                """
                cursor.execute(sql, (se_id, weight, reps, dist, dur, speed))
                conn.commit()
        
        resp = {"status": "success"}
        if weight and reps:
            resp["calculated_1rm"] = round(float(weight) * (1 + int(reps)/30.0), 2)
        return jsonify(resp), 201
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# --- 增加：获取活跃场次详情用于 UI 恢复 ---
@app.route('/api/v1/sessions/active-details', methods=['GET'])
def get_active_session_details():
    s_id = request.args.get('session_id')
    try:
        with mysql.connector.connect(**DB_config) as conn:
            with conn.cursor(dictionary=True) as cursor:
                # 1. 获取该场次下的所有动作
                sql_ex = """
                    SELECT se.session_exercise_id, se.exercise_id, e.name_zh, e.type 
                    FROM session_exercises se
                    JOIN exercise_library e ON se.exercise_id = e.exercise_id
                    WHERE se.session_id = %s
                """
                cursor.execute(sql_ex, (s_id,))
                exercises = cursor.fetchall()

                for ex in exercises:
                    # 2. 获取每个动作对应的所有组数
                    sql_sets = "SELECT * FROM exercise_sets WHERE session_exercise_id = %s"
                    cursor.execute(sql_sets, (ex['session_exercise_id'],))
                    ex['sets'] = cursor.fetchall()

                return jsonify({"status": "success", "exercises": exercises}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# --- 新增：取消/删除当前训练场次 ---
@app.route('/api/v1/sessions/cancel', methods=['POST'])
def cancel_workout_session():
    data = request.json
    session_id = data.get('session_id')
    
    if not session_id:
        return jsonify({"status": "error", "message": "Missing session_id"}), 400
        
    try:
        with mysql.connector.connect(**DB_config) as conn:
            with conn.cursor() as cursor:
                # 删除该场次及其关联的所有动作和组数（假设数据库设有级联删除，否则需手动删除关联表）
                # 1. 先删除组数记录
                cursor.execute("""
                    DELETE es FROM exercise_sets es 
                    JOIN session_exercises se ON es.session_exercise_id = se.session_exercise_id 
                    WHERE se.session_id = %s
                """, (session_id,))
                
                # 2. 删除场次动作关联
                cursor.execute("DELETE FROM session_exercises WHERE session_id = %s", (session_id,))
                
                # 3. 删除场次主表记录
                cursor.execute("DELETE FROM workout_sessions WHERE session_id = %s", (session_id,))
                
                conn.commit()
        return jsonify({"status": "success", "message": "训练已取消并清理"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# --------------------------------------------------------
# 5. AI 智能分析与排课 (AI Intelligence)
# --------------------------------------------------------

@app.route('/api/v1/fitness/report', methods=['GET'])
def get_report():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({"status": "error", "message": "Missing user_id"}), 400
    try:
        return jsonify(generate_web_report(user_id)), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/v1/recommend', methods=['GET'])
def recommend():
    """基于短板肌群的 AI 动作推荐"""
    user_id = request.args.get('user_id', default=1, type=int)
    try:
        report = generate_web_report(user_id)
        scores = report['radar_chart']['data']
        indicators = [i['name'] for i in report['radar_chart']['indicators']]
        weak_muscle = indicators[scores.index(min(scores))] 
        with mysql.connector.connect(**DB_config) as conn:
            with conn.cursor(dictionary=True) as cursor:
                sql = "SELECT e.name_zh FROM exercise_library e JOIN exercise_muscle_link l ON e.exercise_id = l.exercise_id JOIN muscle_groups m ON l.muscle_id = m.muscle_id WHERE m.category = %s AND l.is_primary = 1 ORDER BY RAND() LIMIT 3"
                cursor.execute(sql, (weak_muscle,))
                return jsonify({"status": "success", "weakness": weak_muscle, "recommendations": cursor.fetchall()}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/v1/predict/trend', methods=['GET'])
def get_trend():
    """力量增长趋势"""
    u_id, e_id = request.args.get('user_id', 1), request.args.get('exercise_id', 44)
    try:
        with mysql.connector.connect(**DB_config) as conn:
            with conn.cursor(dictionary=True) as cursor:
                sql = "SELECT workout_date, estimated_1rm FROM view_strength_progress WHERE user_id = %s AND exercise_id = %s ORDER BY workout_date ASC"
                cursor.execute(sql, (u_id, e_id))
                rows = cursor.fetchall()
                return jsonify({"status": "success", "trend": {"dates": [r['workout_date'].strftime('%m-%d') for r in rows], "values": [round(float(r['estimated_1rm']), 2) for r in rows]}}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# --- 在 app.py 的 @app.route('/api/v1/predict/trend') 之后添加 ---
@app.route('/api/v1/analytics/body-trends', methods=['GET'])
def get_body_trends():
    """获取用户体重与体脂的历史趋势数据"""
    user_id = request.args.get('user_id', type=int)
    try:
        with mysql.connector.connect(**DB_config) as conn:
            with conn.cursor(dictionary=True) as cursor:
                # 按时间升序获取所有身体指标记录
                sql = """
                    SELECT date, weight_kg, body_fat 
                    FROM body_metrics 
                    WHERE user_id = %s 
                    ORDER BY date ASC
                """
                cursor.execute(sql, (user_id,))
                rows = cursor.fetchall()
                
                # 格式化日期为前端易读的字符串
                trends = []
                for r in rows:
                    trends.append({
                        "date": r['date'].strftime('%Y-%m-%d'),
                        "weight": float(r['weight_kg']) if r['weight_kg'] else 0,
                        "body_fat": float(r['body_fat']) if r['body_fat'] else 0
                    })
                
                return jsonify({"status": "success", "trends": trends}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/v1/exercises/guide', methods=['GET'])
def get_ai_guide():
    """调用 DeepSeek 生成动作指南"""
    exercise_name = request.args.get('name')
    if not exercise_name:
        return jsonify({"status": "error", "message": "缺少动作名称"}), 400
    prompt = f"针对动作‘{exercise_name}’，提供简洁执行步骤（3条）和安全注意事项。100字以内。"
    try:
        response = requests.post(
            f"{DEEPSEEK_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": "deepseek-chat",
                "messages": [{"role": "user", "content": prompt}],
                "stream": False
            },
            timeout=10
        )
        ai_content = response.json()['choices'][0]['message']['content']
        return jsonify({"status": "success", "guide": ai_content}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": "AI 暂时开小开差了"}), 500

@app.route('/api/v1/ai/recommend-plan', methods=['GET'])
def ai_recommend_plan():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({"status": "error", "message": "Missing user_id"}), 400
    try:
        # 1. 安全获取用户现状报告
        report_data = generate_web_report(user_id)
    
        # 核心修复：处理 report_data 为列表的情况，防止 "list indices" 错误
        if isinstance(report_data, list):
            report = report_data[0] if len(report_data) > 0 else {}
        else:
            report = report_data
        
        # 使用 .get 安全获取雷达图数据
        muscle_status = report.get('radar_chart', {}) 

        # 2. 构建 Prompt (注意双大括号 {{ }} 转义)
        prompt = f"""
        用户当前肌肉状态（雷达图分值）：{muscle_status}。
        请推荐一套包含 4-6 个动作的计划。必须包含 1 个有氧（Cardio）。
        要求：
        1. 仅返回纯 JSON 数组，禁止任何 Markdown 标签。
        2. 格式严格如下：
        [[
          {{ "name": "动作名", "type": "Strength", "sets": 3, "weight": 60, "reps": 10 }},
          {{ "name": "慢跑", "type": "Cardio", "distance": 3.0, "duration": 1200 }}
        ]]
        """

        # 3. 请求 AI
        response = requests.post(
            f"{DEEPSEEK_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": "deepseek-chat",
                "messages": [{"role": "system", "content": "你是一个只输出 JSON 数组的健身教练。"},
                             {"role": "user", "content": prompt}]
            },
            timeout=20
        )
        
        # 4. 清洗并解析 JSON
        content = response.json()['choices'][0]['message']['content']
        clean_json = re.sub(r'```json\s*|```', '', content).strip()
        ai_plan = json.loads(clean_json)
        
        # 5. 匹配数据库 ID
        with mysql.connector.connect(**DB_config) as conn:
            with conn.cursor(dictionary=True) as cursor:
                for item in ai_plan:
                    # 增加防御性检查：确保 item 是字典
                    if not isinstance(item, dict): continue
                    
                    cursor.execute(
                        "SELECT exercise_id FROM exercise_library WHERE name_zh = %s OR name_zh LIKE %s LIMIT 1", 
                        (item.get('name'), f"%{item.get('name')}%")
                    )
                    res = cursor.fetchone()
                    item['exercise_id'] = res['exercise_id'] if res else 1

        return jsonify({"status": "success", "plan": ai_plan}), 200

    except Exception as e:
        # 打印具体报错到后台终端，方便排查
        print(f"❌ AI排课内部错误: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500



# --------------------------------------------------------
# 6. 系统入口 (Server Entry)
# --------------------------------------------------------

# app.py 结尾部分修改

# --- 6. 系统入口 (全量托管版) ---

# --- 6. 系统入口 (路径精准匹配版) ---

if __name__ == '__main__':
    from flask import send_from_directory
    
    # 1. 核心修复：指向 html 文件夹
    # 访问 http://127.0.0.1:5001 时，去 "html" 文件夹里找 "login.html"
    @app.route('/')
    def index():
        return send_from_directory('html', 'login.html')

    # 2. 核心修复：处理 html 文件夹下的所有资源 (如 assets/js/api.js)
    # 当网页请求 assets/js/api.js 时，Flask 会去 "html/assets/js/api.js" 寻找
    @app.route('/<path:path>')
    def serve_static(path):
        return send_from_directory('html', path)

    print("="*60)
    print("🚀 Fitness AI 全栈引擎已就绪")
    print("🏠 访问地址: http://127.0.0.1:5001")
    print("📂 网页目录: 后端\\html")
    print("="*60)
    
    # 确保端口为 5001，host 为 0.0.0.0 以支持内网穿透
    app.run(host='0.0.0.0', port=5001, debug=True, use_reloader=True)