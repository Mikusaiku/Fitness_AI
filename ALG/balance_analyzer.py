import pymysql
from db_config import DB_config

# 时间跨度配置字典
TIME_FRAMES = {
    'week': {'name': '一周', 'days': 7},
    'month': {'name': '一月', 'days': 30},
    'quarter': {'name': '三月', 'days': 90},
    'half_year': {'name': '半年', 'days': 180},
    'year': {'name': '一年', 'days': 365}
}

def get_smart_recommendation(cursor, user_id, muscle_group_zh):
    """
    智能探索建议：优先推荐 873 个动作库中用户从未尝试过的动作
    """
    sql = """
        SELECT e.name_zh, COUNT(se.session_exercise_id) as usage_count
        FROM exercise_library e
        JOIN exercise_muscle_link l ON e.exercise_id = l.exercise_id
        JOIN muscle_groups m ON l.muscle_id = m.muscle_id
        LEFT JOIN session_exercises se ON e.exercise_id = se.exercise_id
        WHERE m.category = %s AND e.name_zh IS NOT NULL
        GROUP BY e.exercise_id
        ORDER BY usage_count ASC, RAND() 
        LIMIT 1
    """
    cursor.execute(sql, (muscle_group_zh,))
    result = cursor.fetchone()
    return result['name_zh'] if result else "针对性补强动作"

def get_muscle_balance_service(user_id, frame_key='week'):
    """
    封装后的平衡性分析服务
    :param user_id: 用户ID
    :param frame_key: 时间跨度键值 (week/month/quarter/half_year/year)
    :return: 包含平衡性报告和建议的结构化字典
    """
    frame = TIME_FRAMES.get(frame_key, TIME_FRAMES['week'])
    days = frame['days']
    # 动态阈值计算：基于每周 3 组有效刺激的基准进行缩放
    threshold = round((days / 7) * 3.0, 1)

    connection = pymysql.connect(**DB_config)
    response = {
        "status": "success",
        "meta": {"frame_name": frame['name'], "days": days, "threshold": threshold},
        "balance_data": [],
        "recommendations": []
    }

    try:
        with connection.cursor(pymysql.cursors.DictCursor) as cursor:
            # 1. 查询指定时间维度内的肌群负荷提炼数据
            sql_load = """
                SELECT major_muscle_group, SUM(weighted_sets) as total_sets
                FROM view_muscle_load_stats
                WHERE user_id = %s AND workout_date >= DATE_SUB(CURDATE(), INTERVAL %s DAY)
                GROUP BY major_muscle_group
            """
            cursor.execute(sql_load, (user_id, days))
            db_results = cursor.fetchall()

            # 数据对齐：确保 7 大肌群分类都有数据展示
            all_groups = ['胸部', '背部', '腿部', '肩部', '手臂', '核心', '全身']
            trained_stats = {row['major_muscle_group']: float(row['total_sets']) for row in db_results}

            for group in all_groups:
                actual_sets = trained_stats.get(group, 0.0)
                is_standard = actual_sets >= threshold
                
                # 填充平衡性报告数据
                group_info = {
                    "muscle_group": group,
                    "actual_sets": round(actual_sets, 1),
                    "is_standard": is_standard,
                    "status_text": "✅ 达标" if is_standard else "⚠️ 训练量不足"
                }
                response["balance_data"].append(group_info)

                # 2. 如果不达标，生成智能建议 (处方)
                if not is_standard:
                    rec_action = get_smart_recommendation(cursor, user_id, group)
                    response["recommendations"].append({
                        "target_muscle": group,
                        "suggested_action": rec_action,
                        "reason": f"在过去{frame['name']}内训练量低于预设阈值 {threshold} 组"
                    })

    except Exception as e:
        response["status"] = "error"
        response["message"] = str(e)
    finally:
        connection.close()

    return response

if __name__ == "__main__":
    # 后端模拟：前端请求查询“三月” (quarter) 的平衡性分析
    final_report = get_muscle_balance_service(1, frame_key='quarter')
    print(final_report)