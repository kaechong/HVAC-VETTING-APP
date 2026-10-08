# HVAC & MEP Vetting — 審計 SOP 與稽核清單 (Audit_SOP.md)

> [SOP-VERSION: v1.0 | 2026-08-15]
> 本檔定義 Vetting 產出之獨立品質審計（第三方角色）執行細則。審計員 = Hermes 隔離 sub-agent / 主控複核。

---

## 一、審計目標

對 Vetting 五階段流程之產出（Findings 清單 + 報告檔案）進行獨立品質檢驗，
確保：**合規性（條號 Grounding）、完整性（DoD 四欄）、防幻覺（無捏造）、格式正確（報告樣式）**。

## 二、雙層審計結構

| 層 | 名稱 | 內容 | 判定 |
|----|------|------|------|
| Layer 1 | 合規門禁 (Compliance Gate) | 條號對齊母本、防幻覺掃描、DoD 四欄、JSON 完整性、報告樣式規格 | PASS / FAIL（任何 FAIL 即退回 CC） |
| Layer 2 | 工程合理性 (Engineering Review) | 系統選型合理性、負荷/風量數量級、設備配置邏輯（1用1備）、消防邏輯 | PASS / WARNING / FAIL |

## 三、Layer 1 合規稽核清單

### 3.1 防幻覺 (Anti-Hallucination) — 最高優先
- [ ] 每個 Finding 嘅 `code_citation` 都能喺 Master_DB 母本中找到對應條號
- [ ] 掃描輸出文本：無「第39/2022號行政法規 第XXX條」式杜撰條號
- [ ] 掃描禁止字詞：`N/A`、`Landlord`、`PAD`、`200x200`、`預留容量`（除非有 TFOG 文件支持）
- [ ] 門檻數值與母本一致（8 ACH、80%、8.0 m/s、4.5 m/s、133 N、50 Pa、0.75 m/s…）

### 3.2 DoD 四欄完整性
- [ ] 每項 Finding 有：精確位置（圖號/空間/坐標）
- [ ] 每項 Finding 有：客觀缺失事實描述
- [ ] 每項 Finding 有：法規條號（對齊母本）
- [ ] 每項 Finding 有：嚴重等級（Critical/Major/Minor）+ 建議整改措施

### 3.3 嚴重等級判定覆核
- [ ] 🔴 Critical：僅限法定消防安全/疏散規定、MFSD 缺失、排煙 <8 ACH、補風 <80%、加壓 <50 Pa、開門力 >133 N、無備用風機、廚房誤設防火閥
- [ ] 🟡 Major：風管超速、圖紙風量 vs 設備表不符、冷量/電壓功率矛盾、停車場 <6 ACH
- [ ] 🟢 Minor：圖例不清、命名跳號、筆誤、排版
- [ ] 冇將 Minor 升呢為 Major / 冇將 Critical 降呢

### 3.4 報告檔案格式（唯一 Excel，100% 對齊用戶指定母本）
- [ ] 每項目只出一份 `Vetting_Report_Master.xlsx`（唔出 Markdown/Word）
- [ ] Row 1-3：項目名稱 / 複核日期 / 複核版本，各合併 A:D，Arial 14 bold，置中
- [ ] Row 5 表頭 4 欄：編號 / 複核文件名稱 / 問題內容 / 違反法規
- [ ] 數據行 thin border、置中；欄寬 B=22.75、C=46.88、D=55.38
- [ ] 無 fill 底色

## 四、Layer 2 工程合理性稽核清單

- [ ] 排煙風量與分區容積匹配（數量級正確）
- [ ] 風機配置 1 用 1 備（消防風機）
- [ ] 補風路徑可行（開口/風機）且比例 ≥ 80%
- [ ] 樓梯加壓壓差在合理範圍（澳門 ≥50 Pa；IBC 25~87 Pa）
- [ ] 開門力計算包含門重量、閉門器、壓差面積（非憑空）
- [ ] 商業廚房 Type I 罩 + UL 300 滅火 + 風速 500~2500 fpm
- [ ] 停車場通風：Max(Area×0.0037×3600, Vol×6) CMH 計算正確

## 五、審計輸出格式

```json
{
  "audit_result": "PASS | WARNING | FAIL",
  "layer1": {"pass": true/false, "items": [{"check": "...", "status": "PASS/FAIL", "detail": "..."}]},
  "layer2": {"pass": true/false, "items": [{"check": "...", "status": "PASS/WARNING/FAIL", "detail": "..."}]},
  "objections": [{"severity": "🔴/🟡/🟢", "item": "...", "action": "..."}]
}
```

## 六、審計判定規則
- Layer 1 任何 FAIL → 整體 FAIL → 退回 CC（計入斷路器 N_max=3）
- Layer 2 WARNING → 整體 WARNING → 記錄 objection，可交付但附註
- Layer 1 + Layer 2 全 PASS → 整體 PASS → 報告定稿交付
- 3 次退回仍未解決 → 「⚪ 待工程師人工複核」

## 七、審計者與被審計者分離
- 審計由 Hermes 主控以隔離 sub-agent（delegate_task）執行，CC 唔自我審查
- 審計者無預設立場，只按本清單逐項檢驗
