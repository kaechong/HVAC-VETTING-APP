# HVAC & MEP Vetting 雙平台主從架構設計指引 (v2.0)
# (Hermes Agent Master Orchestrator + Claude Code Execution & Report Generation)

> [SOP-VERSION: v2.0 | 2026-08-15]
> 本檔為 Vetting 助手之架構總覽（唯一正本，與 Drive 同步）。來源：用戶 2026-08-15 提供之指引原文。

---

## 一、 系統架構總覽 (Architecture Overview)

本系統為專門針對暖通空調 (HVAC)、機械排煙 (Smoke Control)、樓梯加壓 (Pressurization)、商業廚房排油煙及機電管井之工程圖紙與文件 Vetting（審查）所構建的 Level 3 AI 主從多代理人架構。

系統採用「Hermes Agent（主控指揮官）+ Claude Code（本機執行與報告生成終端）」的雙平台組合，並由 Hermes Agent 單向控制 Claude Code (CC)：

```
[專案圖紙 CAD / PDF / Specs]
       │
       ▼
┌────────────────────────────────────────────────────────┐
│               HERMES AGENT (主控審查總指揮)             │
│ • 專案解析、任務拆解 (task.md)                         │
│ • 法規主資料庫管理與檢索 (Rules DB / RAG)              │
│ • 單向派發指令給 Claude Code (CC)                      │
│ • 審查數據 DoD 品質門禁檢驗與反思閉環 (N_max = 3)       │
│ • 裁決最終結果，向 CC 派發「報告生成任務」並驗收交付   │
└──────────────────────────┬─────────────────────────────┘
                           │ (單向調度 / CLI Subprocess / XML Payload)
                           ▼
┌────────────────────────────────────────────────────────┐
│         CLAUDE CODE (CC - 本地執行、運算與報告生成)      │
│ • 執行 Python 腳本 (ezdxf 解析 DWG、PyMuPDF 解析 PDF)   │
│ • 執行物理流速 v=Q/A、排煙 8 ACH、加壓壓差硬性數值計算 │
│ • 執行「圖紙 vs 規範 vs 設備表」三角交叉抓漏           │
│ • 執行報告編譯與輸出 (openpyxl 產出唯一 Excel 報告) │
│ • 將產出之標準化報告檔案交付給 Hermes Agent 驗收       │
└────────────────────────────────────────────────────────┘
```

---

## 二、 雙平台職責邊界與分工矩陣 (Responsibility Matrix)

| 核心維度 | Hermes Agent (Master Orchestrator) | Claude Code (CC - Worker & Report Generator) |
| :--- | :--- | :--- |
| **角色定位** | **專案經理 / 審查總指揮 / 最終品質門禁官** | **資深計算工程師 / 本機執行手 / 報告排版編譯員** |
| **主要權限與職責** | 1. 專案範疇釐清與任務排程 (`task.md`)<br>2. 雲端 Google Drive / Sheets / Docs 讀寫與同步<br>3. 法規主資料庫管理、條款比對與檢索<br>4. 審查 Finding 之 DoD 門禁檢驗與重試控制<br>5. 審查核可後，派發報告格式與樣板指令給 CC<br>6. 驗收 CC 產出之實體報告並向使用者交付 | 1. 本地檔案系統讀寫與工具執行<br>2. Python 環境執行 (`ezdxf`, `pymupdf`, `pandas`)<br>3. 密集幾何坐標計算與物理公式運算<br>4. 圖紙向量切片與特徵提取<br>5. 依約定格式回傳結構化 Finding 數據<br>6. **使用 Python (`openpyxl`) 編譯產出唯一一份 Excel 報告（格式 100% 對齊用戶母本）** |
| **與使用者互動** | 是（對外唯一溝通與交付窗口） | 否（僅接收 Hermes 指令並回傳結果與檔案） |
| **決策權限** | 具備審查項目判定、最終驗收與報告定稿裁決權 | 無法規裁決權，專注於代碼執行、數值計算與文件渲染輸出 |

---

## 三、 法規知識庫與門禁資料庫串接 (Grounding Knowledge Base)

Hermes Agent 在調度 CC 前，必須確認以下資料庫已掛載並作為唯一法規審查基準：

### 1. 澳門本地法規庫 (Macau Regulations DB)
- 主資料庫：`[Master_DB]_澳門法規_HVAC與消防審查主資料庫.xlsx`（Drive `法規資料庫/澳門本地法規/02_主資料庫_Master_Database/`，file_id `1hPrii9e-z-xuh4VIdPDnmbRjjdFnFZeu`）
- 本地提取：`/opt/data/vetting_workspace/database/master_db_macau_full.json`（**code_citation 已完整**）
- 條款原文 RAG 庫：`[法規條款庫]_澳門本地法規_HVAC與消防審查條款索引.gdoc`（Drive `04_Hermes_Agent導出檔_Export/`，file_id `1prMaajHl1GSK17gM4CJD9Ojif55kVAYvIluYc5PdVJw`）
- 核心依據：《第39/2022號行政法規》（防火安全技術規章）、《第38/2022號行政法規》（都市建築法律制度施行細則）、《室內停車場通風系統運作指引》、《第4/80/M號法令》。

### 2. 國際規章庫 (IBC & NFPA DB)
- 主資料庫：`[Master_DB]_IBC_NFPA_HVAC與排煙審查主資料庫.xlsx`（Drive `法規資料庫/IBC/02_主資料庫_Master_Database/`，file_id `1HcPi4UEQIn28_6iPAFq87v7IdpcYzR9o`）
- 本地提取：`/opt/data/vetting_workspace/database/master_db_ibc_nfpa_full.json`（**code_citation 已完整**）
- 條款原文 RAG 庫：`[法規條款庫]_IBC_NFPA_HVAC與消防審查條款索引.gdoc`（Drive `04_Hermes_Agent導出檔_Export/`，file_id `1ee8k02DPS4V2crxkpLhC0SwjSYZJlKvRgZlYqOaQ3_c`）
- 核心依據：IBC 2021（Section 909, 403, 716, 717）、NFPA 92（2018 排煙與加壓）、NFPA 96（商業廚房）、IMC 2021（機械規章）。

---

## 四、 五階段標準作業程序 (5-Phase Workflow SOP)

```
[專案圖紙 CAD / PDF / Specs] ──> [Hermes Agent]
                                      │
                                      ├─ 階段 1：專案解析、生成 task.md & 提取法規規則
                                      ├─ 階段 2：調用 CC 執行圖紙與文字預處理
                                      ├─ 階段 3：派發「四路專項任務」給 CC 進行審查
                                      ▼
                             [Claude Code (CC)]
                                      │
                                      ├─ 執行 Python (CAD幾何/PDF切片/物理計算/紅隊比對)
                                      ├─ 產出結構化 Findings (JSON) 回傳給 Hermes
                                      ▼
                               [Hermes Agent]
                                      │
                                      ├─ 階段 4：DoD 門禁驗收 (位置 + 事實 + 條號 + 等級)
                                      ├─ [未達標] ──> 自動退回 CC 重審 (上限 3 次)
                                      │
                                      └─ 階段 5：[達標後] 派發「報告輸出任務」給 CC
                                             │
                                             ▼
                                    [Claude Code (CC)]
                                             │
                                             ├─ 執行 Python 腳本產出唯一 Excel 報告
                                             ▼
                                    [Hermes Agent] ──> 驗收檔案並交付使用者
```

### 階段 1：專案範疇釐清與任務拆解 (Ingestion & Planning)
1. Hermes Agent 接收到專案圖紙（CAD DWG/DXF 或向量 PDF）、設備規格表、技術規範書。
2. Hermes 判定適用法規體系（澳門本地法規 / IBC / NFPA），並在本地建立 `task.md`。
3. Hermes 讀取 `master_db_macau_full.json` 或 `master_db_ibc_nfpa_full.json`，提取相關檢核點清單。

### 階段 2：調用 CC 進行圖紙預處理 (Preprocessing Dispatch)
Hermes 呼叫 Claude Code 執行本地 Python 腳本：
1. DWG 圖層解析：執行 `ezdxf` 腳本，提取 `M-DUCT`（風管）、`A-WALL-FIRE`（防火牆）、`M-DAMPER`（防火閥）圖層線段與交點坐標 (X, Y)。
2. PDF 向量切片：執行 `PyMuPDF` 提取圖面文字標註，並進行高解析度分區切圖 (Tiling)。
3. 設備代號標準化：統一圖紙、規格書與設備表中的命名（如 `AHU-01` = `UTA-1` = `風櫃1`）。

### 階段 3：調用 CC 執行四路專項審查 (Subagent Tasks)
Hermes 依序或並行派發 4 個專項審查任務給 Claude Code：
1. Subagent A（文字規範審查）：審查 Design Statement 與 Specification 之室內溫濕度、換氣次數、新風率、設備材料（A1 級不燃）及消防控制邏輯。
2. Subagent B（物理流速與負荷計算）：程式化硬性計算 —— 主風管流速 v = Q/A ≤ 8.0 m/s、支風管 ≤ 4.5 m/s；地庫排煙量 Q ≥ Volume × 8 ACH、補風量 ≥ 80%；樓梯加壓超壓 ≥ 50 Pa（IBC 為 25~87 Pa）、開門力 ≤ 133 N、過門風速 ≥ 0.75 m/s (IBC 為 ≥ 1.02 m/s)；停車場排風量取 Max(Area×0.0037×3600, Vol×6) CMH。
3. Subagent C（CAD 幾何與視覺審核）：檢核風管穿透防火牆交點 500mm 內是否有電動防火排煙閥 (MFSD)；檢核室內排煙口與補風口水平間距 ≥ 5 m（走道間距 ≤ 7 m）；檢核商業廚房排油煙風管是否誤設防火閥（嚴禁設閥）。
4. Subagent D（跨文件紅隊交叉抓漏）：執行「圖紙 vs 規範 vs 設備表 vs 計算書」三角數據矛盾對比，抓出風量、冷量、型號、電壓衝突。
5. CC 將所有發現彙整為標準 JSON 格式回傳給 Hermes。

### 階段 4：Hermes 品質門禁驗收與反思閉環 (Master Critique Loop)
Hermes Agent 接收 CC 回傳之 Finding 清單，強制執行 DoD (Definition of Done) 檢驗：
- 必填欄位 1：精確位置（圖號、空間名稱或坐標 X, Y）
- 必填欄位 2：缺失事實描述（客觀清楚）
- 必填欄位 3：引用法規條號（必須 100% 精確對齊主資料庫，禁止幻覺）
- 必填欄位 4：嚴重等級（🔴 Critical / 🟡 Major / 🟢 Minor）及建議整改措施

斷路器機制 (Circuit Breaker)：
- 若 CC 回傳之項目有缺漏或條號未 Grounding，Hermes 自動重新組織 Prompt 退回 CC 修正。
- 重試上限 N_max = 3 次。若 3 次後仍未解決，標記為「⚪ 待工程師人工複核」。

### 階段 5：Hermes 調度 CC 生成實體報告與交付 (CC Report Generation & Delivery)
1. 當 Hermes 驗收通過所有 Findings 後，封裝「最終核定之 Findings 數據 + 排版要求」派發給 Claude Code。
2. Claude Code 執行 Python 報告生成腳本：
   - 產出 **唯一一份 Excel 報告** (`Vetting_Report_Master.xlsx`)：**格式 100% 對齊用戶指定母本**（Google Sheets 第二頁）——`項目名稱`/`複核日期`/`複核版本` 三行合併標題（Arial 14 bold 置中）+ `編號/複核文件名稱/問題內容/違反法規` 四欄表格（thin border、欄寬 B=22.75/C=46.88/D=55.38、無底色）。
   - ⚠️ 每個項目只出一份 Excel，唔出 Markdown / Word。
3. Claude Code 回傳生成的檔案路徑。
4. Hermes Agent 驗證檔案完整性後，將檔案同步至 Google Drive 並向使用者正式交付。

---

## 五、 Hermes 派發給 Claude Code 的標準通訊協議 (Payload Templates)

### 1. 審查任務派發模版 (Vetting Subagent Dispatch)
```bash
claude -p "
<vetting_instruction>
  <task_type>SUBAGENT_B_CALCULATION_AND_PHYSICS</task_type>
  <project_scope>
    - Drawing Set: M-101 ~ M-108 (Ground Floor to 3F HVAC Plan)
    - Schedule: Equipment Schedule v1.2
    - Calculation Sheet: Cooling_Load_Vent_Calc.xlsx
  </project_scope>
  <active_rules_database>
    $(cat /opt/data/vetting_workspace/database/master_db_macau_full.json)
  </active_rules_database>
  <mandatory_checks>
    1. Check all duct velocities using v = Q / (W * H). Flag if main duct > 8.0 m/s or branch duct > 4.5 m/s.
    2. Check smoke exhaust volume against 8 ACH for all basement compartments (>300 m2).
    3. Check make-up air ratio (must be >= 80% of smoke exhaust volume).
    4. Check stair pressurization door opening force (F <= 133 N) and air velocity (v >= 0.75 m/s).
  </mandatory_checks>
  <output_format_contract>
    You MUST return output as a strict JSON array of objects with the following schema:
    [
      {
        \"rule_id\": \"MO-SE-005\",
        \"system_category\": \"排煙系統\",
        \"location\": \"圖號 M-102 地庫防火分區 A\",
        \"discrepancy_description\": \"地庫分區容積 1200 m3，設計排煙量標註為 6500 CMH，低於法定 8 ACH (9600 CMH) 要求。\",
        \"code_citation\": \"第39/2022號行政法規 第175條\",
        \"severity\": \"Critical\",
        \"suggested_action\": \"修改排煙風機選型風量至 >= 9600 CMH，並同步調整補風量至 >= 7680 CMH。\"
      }
    ]
  </output_format_contract>
</vetting_instruction>
"
```

### 2. 報告輸出任務派發模版 (CC Report Generation Dispatch)
```bash
claude -p "
<report_generation_instruction>
  <task_type>COMPILE_AND_GENERATE_VETTING_REPORT</task_type>
  <project_info>
    - Project Name: <專案名稱>
    - Standards: 澳門第39/2022號行政法規 / 第38/2022號行政法規
    - Drawing Set: <圖號範圍>
    - Date: <日期>
  </project_info>
  <approved_findings_payload>
    [
      {
        \"finding_id\": \"F-001\",
        \"system_category\": \"通風空調設施\",
        \"location\": \"圖號 M-104 (X:1450, Y:820)\",
        \"description\": \"1500x500 主風管穿過 2 小時防火分區牆，未標示電動防火排煙閥 (MFSD)。\",
        \"code_citation\": \"第39/2022號行政法規 第320條\",
        \"severity\": \"Critical\",
        \"action\": \"於穿牆處補設 2hr 額定 MFSD，並連鎖火警信號。\"
      }
    ]
  </approved_findings_payload>
  <output_requirements>
    1. Write and execute a Python script using 'openpyxl' to generate 'output/Vetting_Report_Master.xlsx' — THE ONLY deliverable file (one Excel per project, NO Markdown/Word).
    2. The Excel workbook MUST follow the master format (Google Sheets sheet '工作表1') exactly:
       - Row 1-3: '項目名稱' / '複核日期' / '複核版本', each merged A:D, Arial 14 bold, centered.
       - Row 5 header: '編號' '複核文件名稱' '問題內容' '違反法規'.
       - Data rows: sequential numbers 1.0, 2.0...; 複核文件名稱 = finding location; 問題內容 = discrepancy_description; 違反法規 = code_citation.
    3. Styling Rules (100% identical to master):
       - All cells: Arial, thin solid border, centered.
       - Column widths: B=22.75, C=46.88, D=55.38.
       - No fill colors.
    4. Return the absolute path of the generated file upon completion.
  </output_requirements>
</report_generation_instruction>
"
```

---

## 六、 嚴重等級判定標準 (Severity Level Criteria)

### 1. 🔴 Critical（嚴重違規）
- 違反法定消防安全與人身疏散規定
- 防火分區穿透未設 MFSD
- 地庫排煙量 < 8 ACH、補風量 < 80%
- 加壓超壓 < 50 Pa、開門力 > 133 N
- 未設備用風機（非 1用1備配置）
- 商業廚房排油煙風管內誤裝防火閥

### 2. 🟡 Major（重大矛盾 / 超標）
- 風管流速超標（主管 > 8.0 m/s、支管 > 4.5 m/s）
- 圖紙風量與設備表不符
- 冷量與電壓功率矛盾
- 停車場換氣量不足 6 ACH

### 3. 🟢 Minor（輕微瑕疵）
- 圖例標註不清晰
- 設備命名跳號
- 說明書文字筆誤
- 未影響系統安全之圖面排版問題

---

## 七、 防幻覺與安全防護機制 (Safety Guardrails)

1. **無物業文件不幻想原則**：若專案未提供大樓物業管理方 (Landlord) 的正式《租戶裝修指南 (TFOG)》，Hermes 與 CC 一律不建立大樓接口比對區塊，不捏造 200x200 PAD、30.0 kW 或 N/A 數據。
2. **唯一母本原則**：所有引用的法規條文與門檻數值，必須 100% 來自已編制的 `Master_DB` 檔案（Drive `法規資料庫/` 為正本，本地 `master_db_*_full.json` 為提取鏡像），嚴禁 LLM 自由發揮改寫法規。
3. **單向控制原則**：Claude Code 專注於本地運算、特徵提取與檔案輸出，所有跨文件決策、最終評級審定與對外交付均由 Hermes Agent 統一裁決。
