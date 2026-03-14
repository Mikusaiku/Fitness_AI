# Fitness AI：基于 DeepSeek-V3 的智能健身管理系统

![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)
![Flask](https://img.shields.io/badge/Flask-2.0+-green.svg)
![DeepSeek](https://img.shields.io/badge/AI-DeepSeek--V3-purple.svg)

## 📌 项目简介
本项目旨在通过全栈技术手段实现科学的健身数据管理，并结合 **DeepSeek-V3** 大语言模型提供智能化的训练建议。

---

## 🚀 核心功能

### 1. 智能化数据建模
* **1RM 力量进阶预测**：基于 **Brzycki 公式**，通过用户训练表现实时推算各动作的最大力量：
  $$1RM = Weight \times (1 + \frac{Reps}{30})$$
* **五维肌肉负荷画像**：利用加权算法（主导动作 1.0 / 协同动作 0.3）将训练数据转化为 ECharts 动态雷达图。

### 2. 深度 AI 交互
* **DeepSeek 智能教练**：系统调用 DeepSeek-V3 接口，根据用户近期的训练负荷及短板，自动生成下一周期的补强计划。
* **无感化录入**：前端通过异步监听实现数据即时入库，降低训练时的记录成本。

---

## 🛠 技术栈
* **后端 (Backend)**：Python / Flask
* **前端 (Frontend)**：Vanilla JS / ECharts / CSS3 (响应式设计)
* **数据库 (Database)**：MySQL
* **AI 引擎**：DeepSeek-V3 API

---

## 📂 快速开始

1. **配置环境**
   ```bash
   pip install -r requirements.txt
