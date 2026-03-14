import pymysql
from db_config import DB_config
def get_dynamic_coach_advice(user_id, days=30):
    connection = pymysql.connect(**DB_config)
    result_payload = {"status": "success", "data": None, "advice": "", "message": ""}

    try:
        with connection.cursor(pymysql.cursors.DictCursor) as cursor:
            # 1. 升级版 SQL：按训练日期分组，统计当天的最高 1RM、总组数和最高 RPE
            sql = """
                SELECT 
                    v.exercise_name_zh, 
                    MAX(v.estimated_1rm) as max_1rm, 
                    COUNT(es.set_id) as total_sets, 
                    MAX(es.rpe) as max_rpe,
                    v.workout_date
                FROM view_strength_progress v
                JOIN session_exercises se ON v.exercise_id = se.exercise_id
                JOIN exercise_sets es ON se.session_exercise_id = es.session_exercise_id
                WHERE v.user_id = %s AND es.is_completed = 1
                GROUP BY v.workout_date, v.exercise_id
                ORDER BY v.workout_date DESC
                LIMIT 2
            """
            cursor.execute(sql, (user_id,))
            data = cursor.fetchall()

            if len(data) < 2:
                result_payload["status"] = "info"
                result_payload["message"] = "需要至少两次不同日期的记录来对比进步节奏。"
                return result_payload

            current = data[0]
            previous = data[1]
            
            # 计算客观增长率
            growth_rate = (float(current['max_1rm']) - float(previous['max_1rm'])) / float(previous['max_1rm'])
            current_sets = int(current['total_sets'])
            prev_sets = int(previous['total_sets'])
            rpe = int(current['max_rpe'])
            ex_name = current['exercise_name_zh']

            # 2. 增强型决策逻辑矩阵
            # 优先级 1：爆发式进步 (重量涨得快且轻松)
            if growth_rate > 0.05 and rpe <= 7:
                advice = f"🔥 检测到爆发式进步！你的 1RM 提升了 {growth_rate:.1%}。建议下周大幅增加 5kg。"
            
            # 优先级 2：容量式进步 (新增逻辑：重量没涨但组数明显增加)
            elif -0.01 <= growth_rate <= 0.02 and current_sets > prev_sets:
                advice = f"📊 训练容量进步！虽然 1RM 持平，但你完成了更多组数（{prev_sets}→{current_sets}组）。建议下周尝试增加 1.25-2.5kg。"
            
            # 优先级 3：稳健进步 (重量有涨，体感正常)
            elif growth_rate > 0 and rpe <= 9:
                advice = "📈 进步稳扎稳打。建议下周小幅增加 2.5kg，维持当前节奏。"
            
            # 优先级 4：疲劳预警 (重量掉得猛且累)
            elif growth_rate < -0.05 and rpe >= 9:
                advice = "⚠️ 警告：检测到过度训练信号。建议下周执行‘减载周’，将重量降低 20% 进行恢复。"
            
            # 优先级 5：平台期 (重量没涨且累)
            elif growth_rate <= 0 and rpe >= 9:
                advice = "🧱 处于力量平台期。建议保持当前重量，尝试在下场训练中增加每组的重复次数。"
            
            else:
                advice = "节奏正常。建议保持当前强度，专注于动作质量和神经控制的提升。"

            # 封装返回对象
            result_payload["data"] = {
                "exercise": ex_name,
                "growth_rate": round(growth_rate, 3),
                "sets_growth": f"{prev_sets} -> {current_sets}",
                "current_rpe": rpe,
                "latest_1rm": round(float(current['max_1rm']), 2)
            }
            result_payload["advice"] = advice

    finally:
        connection.close()
    return result_payload
