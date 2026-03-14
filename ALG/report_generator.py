import sys
import os

# 1. 解决跨目录导入 db_config 的问题
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

import mysql.connector
import json
from db_config import DB_config

def get_latest_body_weight(user_id):
    """从 body_metrics 表获取最新体重"""
    try:
        conn = mysql.connector.connect(**DB_config)
        cursor = conn.cursor(dictionary=True)
        query = "SELECT weight FROM body_metrics WHERE user_id = %s ORDER BY log_date DESC LIMIT 1"
        cursor.execute(query, (user_id,))
        result = cursor.fetchone()
        cursor.close()
        conn.close()
        return float(result['weight']) if result else 75.0
    except:
        return 75.0

def generate_web_report(user_id, timeframe='week'):
    """
    精进版报告生成器：对齐 view_muscle_load_stats 视图结构
    """
    current_weight = get_latest_body_weight(user_id)
    
    # 定义雷达图的五个标准维度（必须与 muscle_groups 的 category 一致）
    categories = ["胸部", "背部", "腿部", "肩部", "手臂"]
    # 初始化数据，确保即便某个部位没练，雷达图也能显示 0 而不是空
    radar_map = {cat: 0.0 for cat in categories}
    
    try:
        conn = mysql.connector.connect(**DB_config)
        cursor = conn.cursor(dictionary=True)
        
        # 2. 修正后的查询：使用 major_muscle_group 和 weighted_sets
        # 我们使用 weighted_sets（加权组数）作为衡量肌群训练均衡度的核心指标
        query = """
            SELECT major_muscle_group, SUM(weighted_sets) as total_sets
            FROM view_muscle_load_stats 
            WHERE user_id = %s 
            GROUP BY major_muscle_group
        """
        cursor.execute(query, (user_id,))
        rows = cursor.fetchall()
        
        # 3. 将视图数据填充到雷达图容器
        for row in rows:
            group_name = row['major_muscle_group']
            if group_name in radar_map:
                # 使用加权组数作为分值，这里可以根据需要进行标准化处理
                radar_map[group_name] = float(row['total_sets'])

        cursor.close()
        conn.close()

        # 4. 适配前端 ECharts 数据格式
        # 设定一个基准目标（例如每周每个部位 15 组为 100 分）来计算比例
        target_sets = 15.0 
        radar_values = []
        for cat in categories:
            score = (radar_map[cat] / target_sets) * 100
            radar_values.append(min(round(score, 1), 100))

        radar_indicators = [{"name": cat, "max": 100} for cat in categories]

        # 5. 基于数据的 AI 简单分析逻辑
        weak_cat = categories[radar_values.index(min(radar_values))]
        
        return {
            "status": "success",
            "summary": {
                "weight_used": current_weight,
                "analysis": f"本周你的【{weak_cat}】训练量相对薄弱。"
            },
            "radar_chart": {
                "indicators": radar_indicators,
                "data": radar_values
            }
        }

    except Exception as e:
        return {"status": "error", "message": f"SQL错误: {str(e)}"}

if __name__ == "__main__":
    print(json.dumps(generate_web_report(1), indent=4, ensure_ascii=False))