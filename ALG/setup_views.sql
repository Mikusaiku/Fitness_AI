CREATE OR REPLACE VIEW view_muscle_load_stats AS
SELECT 
    ws.user_id,
    ws.session_id,
    ws.start_time AS workout_date,
    m.category AS major_muscle_group, -- 归纳到 7 大肌群
    -- 计算加权总吨位：(重量 * 次数) * 权重
    SUM(es.weight_kg * es.reps * (CASE WHEN l.is_primary = 1 THEN 1.0 ELSE 0.3 END)) AS weighted_volume,
    -- 计算加权总组数：1组 * 权重
    SUM(CASE WHEN l.is_primary = 1 THEN 1.0 ELSE 0.3 END) AS weighted_sets
FROM Workout_Sessions ws
JOIN Session_Exercises se ON ws.session_id = se.session_id
JOIN Exercise_Sets es ON se.session_exercise_id = es.session_exercise_id
JOIN Exercise_Muscle_Link l ON se.exercise_id = l.exercise_id
JOIN Muscle_Groups m ON l.muscle_id = m.muscle_id
WHERE es.is_completed = 1
GROUP BY ws.user_id, ws.session_id, m.category;

CREATE OR REPLACE VIEW view_muscle_load_stats AS
SELECT 
    ws.user_id,
    ws.session_id,
    ws.start_time AS workout_date,
    m.category AS major_muscle_group, -- 归纳到 7 大肌群
    -- 计算加权总吨位：(重量 * 次数) * 权重
    SUM(es.weight_kg * es.reps * (CASE WHEN l.is_primary = 1 THEN 1.0 ELSE 0.3 END)) AS weighted_volume,
    -- 计算加权总组数：1组 * 权重
    SUM(CASE WHEN l.is_primary = 1 THEN 1.0 ELSE 0.3 END) AS weighted_sets
FROM Workout_Sessions ws
JOIN Session_Exercises se ON ws.session_id = se.session_id
JOIN Exercise_Sets es ON se.session_exercise_id = es.session_exercise_id
JOIN Exercise_Muscle_Link l ON se.exercise_id = l.exercise_id
JOIN Muscle_Groups m ON l.muscle_id = m.muscle_id
WHERE es.is_completed = 1
GROUP BY ws.user_id, ws.session_id, m.category;