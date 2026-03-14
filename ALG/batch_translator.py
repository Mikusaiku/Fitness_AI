import pymysql
import time
from deep_translator import GoogleTranslator
from db_config import DB_config

def translate_exercises():
    # 1. 连接数据库
    conn = pymysql.connect(**DB_config)
    cursor = conn.cursor(pymysql.cursors.DictCursor)
    
    try:
        # 2. 查询所有还没有中文翻译的动作
        cursor.execute("SELECT exercise_id, name FROM exercise_library WHERE name_zh IS NULL")
        rows = cursor.fetchall()
        
        if not rows:
            print("所有动作已翻译完成！")
            return

        print(f"检测到 {len(rows)} 个动作待翻译...")
        translator = GoogleTranslator(source='en', target='zh-CN')

        # 3. 循环翻译并更新
        for index, row in enumerate(rows):
            eng_name = row['name']
            ex_id = row['exercise_id']
            
            try:
                # 执行翻译
                zh_name = translator.translate(eng_name)
                
                # 针对健身术语的微调逻辑（可选）
                # 例如：Google可能会把 "Curl" 翻译成 "卷曲"，健身语境下通常叫 "弯举"
                zh_name = zh_name.replace("卷曲", "弯举").replace("新闻", "推举") # Press有时会被误翻为新闻
                
                # 更新数据库
                cursor.execute(
                    "UPDATE exercise_library SET name_zh = %s WHERE exercise_id = %s",
                    (zh_name, ex_id)
                )
                
                # 实时显示进度
                print(f"[{index+1}/{len(rows)}] 翻译成功: {eng_name} -> {zh_name}")
                
                # 每 10 条提交一次，防止脚本崩溃导致白忙一场
                if index % 10 == 0:
                    conn.commit()
                
                # 适当暂停，防止被 Google 暂时封锁 IP
                time.sleep(0.5) 

            except Exception as e:
                print(f"翻译 '{eng_name}' 时出错: {e}")
                continue

        conn.commit()
        print("\n🎉 翻译任务全部完成！")

    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    translate_exercises()