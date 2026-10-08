# HVAC & MEP Vetting — 工作流 SOP (Workflow_SOP.md)

> [SOP-VERSION: v1.1 | 2026-08-15]
> 五階段標準作業程序之操作細則。架構總覽見 `ARCHITECTURE.md`。

---

## 階段 1：專案範疇釐清與任務拆解 (Ingestion & Planning)

### 1.1 接收輸入（用戶裁定 2026-08-15）
- 專案圖紙以 **PDF 為主**：用戶放入 Drive `04_輸入專案圖紙_Input_Drawings/` 並提供 LINK 俾 Hermes
- 設備規格表 (Equipment Schedule)、技術規範書 (Specification)、設計說明書 (Design Statement)、計算書 (Calculation Sheet)
- Hermes 收到 LINK 後下載至本地 `04_輸入專案圖紙_Input_Drawings/<專案名>/`

### 1.2 法規體系判定（用戶裁定 R10）
- **由用戶提供具體指示**：用戶會喺派工時指明用澳門本地 / IBC-NFPA / 雙規範
- **雙規範 → 以兩種規範各單獨 CHECK**：同一檢查項分別以澳門條款同 IBC/NFPA 條款各自判定，各自出 Finding（code_citation 標明所屬體系）
- 澳門同 IBC 門檻唔同（50 Pa vs 25~87 Pa、0.75 vs 1.02 m/s），**唔可以混用**

### 1.3 審查範圍（用戶裁定 R11）
- **只做用戶 spreadsheet 第一頁（澳門 24 項）對應範圍**：通風空調 6 / 機械排煙 8 / 自然排煙 3 / 樓梯加壓 5 / 安全崗 1 / 廚房 1
- IBC 專案：**冇獨立 IBC spreadsheet**，參考澳門 24 項嘅檢查內容，適用於 IBC 者對照 IBC 條款（clause_index_ibc.json）

### 1.4 產出
- `task.md`：專案名稱、圖號清單、法規體系、檢核點清單、交付期限
- 檢核點清單：由 `database/checklist_macau_vetting.json`（澳門 24 項）+ `master_db_*_full.json` 提取對應 rule_id

---

## 階段 2：圖紙預處理 (Preprocessing Dispatch)

調用 Claude Code 執行：
1. **DWG 圖層解析**（ezdxf）：提取 `M-DUCT`（風管）、`A-WALL-FIRE`（防火牆）、`M-DAMPER`（防火閥）線段與交點坐標 (X, Y)
2. **PDF 向量切片**（PyMuPDF）：提取圖面文字標註 + 高解析度分區切圖 (Tiling)
3. **設備代號標準化**：AHU-01 = UTA-1 = 風櫃1（統一命名表）

### 圖層／代號約定
| 圖層名 | 意義 |
|--------|------|
| M-DUCT | 風管 |
| A-WALL-FIRE | 防火牆 |
| M-DAMPER | 防火閥 |
| M-FSD / M-SD | 排煙閥 / 防火排煙閥 |

---

## 階段 3：四路專項審查 (Subagent Tasks)

Hermes 派發 4 個專項任務給 CC（可並行）：

### Subagent A — 文字規範審查
- 審查 Design Statement 與 Specification
- 檢查項：室內溫濕度設計工況、換氣次數、新風率、設備材料（A1 級不燃）、消防控制邏輯（連鎖/急停/分區）
- 對應 rule：MO-HVAC-002（緊急手動制動）、MO-HVAC-003（機房防火隔離）、MO-EQUIP-002（A1 不燃）等

### Subagent B — 物理流速與負荷計算（程式化硬性計算）
| 檢查項 | 公式 | 門檻 | 違規等級 |
|--------|------|------|---------|
| 主風管流速 | v = Q/(W×H) | ≤ 8.0 m/s | Major |
| 支風管流速 | v = Q/(W×H) | ≤ 4.5 m/s | Major |
| 地庫排煙量 | Q ≥ Vol×8 | ≥ 8 ACH（>300 m² 分區） | Critical |
| 機械補風量 | Q_makeup ≥ Q_smoke×80% | ≥ 80% | Critical |
| 樓梯加壓超壓 | — | ≥ 50 Pa（IBC 25~87 Pa） | Critical |
| 開門力 | F | ≤ 133 N | Critical |
| 過門風速 | v | ≥ 0.75 m/s（IBC ≥ 1.02 m/s） | Major |
| 停車場排風量 | Max(Area×0.0037×3600, Vol×6) | ≥ 6 ACH | Major |

### Subagent C — CAD 幾何與視覺審核
- 風管穿透防火牆交點 500mm 內必須有電動防火排煙閥 (MFSD)
- 室內排煙口與補風口水平間距 ≥ 5 m（走道間距 ≤ 7 m）
- 商業廚房排油煙風管**嚴禁**誤設防火閥
- 廚房排油煙風管厚度/坡度/防火包裹（IMC-KT-001）、風速 500~2500 fpm（IMC-KT-002）

### Subagent D — 跨文件紅隊交叉抓漏
- 執行「圖紙 vs 規範 vs 設備表 vs 計算書」四源交叉比對
- 抓取：風量、冷量、型號、電壓功率、風機編號矛盾

### CC 輸出
所有發現彙整為標準 JSON 陣列（schema 見 CLAUDE.md「Findings 輸出契約」），回傳 Hermes。

---

## 階段 4：DoD 門禁驗收與反思閉環 (Master Critique Loop)

### DoD 四必填欄位（缺一即退回）
1. **精確位置**：圖號 + 空間名稱 或 坐標 (X, Y)
2. **缺失事實描述**：客觀清楚，無含糊
3. **引用法規條號**：100% 對齊 Master_DB（防幻覺 Grounding）
4. **嚴重等級 + 建議整改措施**：🔴 Critical / 🟡 Major / 🟢 Minor

### 斷路器機制
- 缺漏或條號未 Grounding → Hermes 重新組織 Prompt 退回 CC 修正
- 重試上限 N_max = 3
- 3 次後仍未解決 → 標記「⚪ 待工程師人工複核」(Pending Manual Engineering Review)

---

## 階段 5：報告生成與交付 (Report Generation & Delivery)

1. Hermes 驗收全部 Findings 後，封裝 `approved_findings_payload` + 排版要求
2. 派發「報告生成任務」給 CC（模板見 ARCHITECTURE.md §五.2）
3. CC 執行 Python 腳本（`vetting_report.py`）產出 **唯一一份 Excel 報告**：
   - `Vetting_Report_Master.xlsx`（格式 100% 對齊用戶指定母本：項目名稱/複核日期/複核版本 3 行合併標題 + 編號/複核文件名稱/問題內容/違反法規 4 欄表格；見 `Vetting_Report_Spec.md`）
   - ⚠️ 每個項目只出一份 Excel，**唔出 Markdown / Word 摘要**
4. CC 回傳檔案路徑
5. Hermes 驗證檔案完整性（DoD + 樣式抽查）→ 同步至 Google Drive `05_輸出審查報告_Output_Reports/` → 交付使用者

### Excel 樣式規格（不可妥協，100% 對齊用戶指定母本）
| 項目 | 規格 |
|------|------|
| Row 1-3 標題 | 項目名稱 / 複核日期 / 複核版本，各合併 A:D，Arial 14 bold，置中 |
| Row 5 表頭 | 編號 / 複核文件名稱 / 問題內容 / 違反法規，Arial，四邊 thin border，置中 |
| 數據行 | Arial，四邊 thin border，置中 |
| 欄寬 | B=22.75、C=46.88、D=55.38 |
| 底色 | 無 fill |

---

## 角色開工前就位檢查（缺一即 Blocking）
- [ ] 法規母本已掛載：`/opt/data/vetting_workspace/database/master_db_macau_full.json` + `master_db_ibc_nfpa_full.json`（code_citation 非空）
- [ ] Python 環境：`/opt/data/vetting_venv`（ezdxf/pymupdf/pandas/openpyxl）
- [ ] Claude Code：`claude -p` 可用
- [ ] 專案圖紙／設備表／規範書已提供
- [ ] Drive 專屬空間可讀（`1ex6JbrbdDWyhHHX6tbKnd3S5izeGPeLO`）

## 版本記錄
| 版本 | 日期 | 變更 |
|------|------|------|
| v1.1 | 2026-08-15 | 母本改為 Drive Master_DB 提取鏡像；報告生成規格補齊 |
| v1.0 | 2026-08-15 | 初版（對應架構 v2.0） |
