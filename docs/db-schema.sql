-- =====================================================================
-- 医学生处方推演训练平台 · SQLite DDL
-- 版本: 2026.11
-- 说明: MVP 阶段实际用 JSON 文件持久化；本 DDL 为后续升级到 SQLite/
--       后端服务时的目标表结构。字段命名与 data/*.json 保持一一对应。
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- 1. 疾病表
-- ---------------------------------------------------------------------
CREATE TABLE diseases (
    disease_code         TEXT PRIMARY KEY,           -- 业务主键, e.g. HTN-I10
    name                 TEXT NOT NULL,              -- 病名
    icd10                TEXT NOT NULL,              -- ICD-10 编码
    iv_suitability       TEXT NOT NULL CHECK (iv_suitability IN
                         ('usually_no_iv','conditional_iv','iv_preferred')),
    negative_list_hit    INTEGER NOT NULL DEFAULT 0, -- 是否命中门诊限输负面清单 0/1
    difficulty           TEXT CHECK (difficulty IN ('初级','中级','高级')),
    symptom_pool_json   TEXT NOT NULL,              -- JSON: 主诉/现病史/生命体征/容量状态
    differential_json   TEXT NOT NULL,              -- JSON array: 鉴别诊断
    first_line_oral_json TEXT NOT NULL,              -- JSON array: 一线口服推荐药名
    second_line_iv_json  TEXT NOT NULL,              -- JSON array: 二线静脉推荐药名
    contraindications    TEXT,                       -- 合并症禁忌, 分号分隔
    special_pop_note     TEXT
);

-- ---------------------------------------------------------------------
-- 2. 药品主表
-- ---------------------------------------------------------------------
CREATE TABLE drugs (
    drug_id              INTEGER PRIMARY KEY AUTOINCREMENT,
    generic_name         TEXT NOT NULL,              -- 通用名
    brand_name           TEXT,                       -- 商品名
    dosage_form          TEXT NOT NULL CHECK (dosage_form IN
                         ('oral','topical','im','sc','iv_drip','iv_push','solvent')),
    spec                 TEXT NOT NULL,              -- 规格 e.g. 0.25g×24粒
    unit                 TEXT NOT NULL,              -- 最小单位: 片/粒/支/袋/瓶
    medical_insurance_class TEXT CHECK (medical_insurance_class IN ('甲','乙','自费')),
    essential_medicine   INTEGER NOT NULL DEFAULT 0, -- 国家基药 2026
    jtc_batch            TEXT,                       -- 国家集采批次 1..8, NULL=未集采
    otc_class            TEXT,                       -- 甲类OTC/乙类OTC/处方药
    abx_level            TEXT NOT NULL DEFAULT 'none' CHECK (abx_level IN
                         ('none','non_restricted','restricted','special')),
    pharmacology_class   TEXT NOT NULL,              -- 药理大类, 用于重复用药/序贯判定
    dose_range_json      TEXT,                       -- {single_min, single_max, daily_max, default_freq, default_duration_days}
    liver_renal_note     TEXT,
    is_iv_capable        INTEGER NOT NULL DEFAULT 0,
    allowed_solvents_json TEXT,                      -- array<溶媒全名>, 空=不可静脉
    drip_speed_max_mlh   REAL,                       -- 说明书最大滴速
    skin_test_required   INTEGER NOT NULL DEFAULT 0, -- 青霉素/部分头孢 = 1
    special_warnings_json TEXT,                      -- array<警示短句>
    is_solvent           INTEGER NOT NULL DEFAULT 0,
    is_tcm_injection     INTEGER NOT NULL DEFAULT 0, -- 中药注射剂
    volume_ml            REAL                        -- 溶媒体积, 非溶媒为 NULL
);
CREATE INDEX idx_drugs_generic ON drugs(generic_name);
CREATE INDEX idx_drugs_abx ON drugs(abx_level);
CREATE INDEX idx_drugs_form ON drugs(dosage_form);

-- ---------------------------------------------------------------------
-- 3. 药品 × 六类目录 多标签关联表
--    catalog_code:
--      MI2025 / JTC_1..JTC_8 / EML2026 / OTC_A / OTC_B / TCM_DECO / ABX_STRAT
-- ---------------------------------------------------------------------
CREATE TABLE drug_category_links (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    drug_id      INTEGER NOT NULL REFERENCES drugs(drug_id) ON DELETE CASCADE,
    catalog_code TEXT NOT NULL,
    catalog_sub  TEXT,                     -- 如 MI2025 下的 甲/乙, ABX_STRAT 下的 restricted
    UNIQUE(drug_id, catalog_code, catalog_sub)
);
CREATE INDEX idx_dcl_drug ON drug_category_links(drug_id);
CREATE INDEX idx_dcl_cat  ON drug_category_links(catalog_code);

-- ---------------------------------------------------------------------
-- 4. 配伍规则表 (两层)
-- ---------------------------------------------------------------------
CREATE TABLE iv_compat_rules (
    rule_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    layer         TEXT NOT NULL CHECK (layer IN ('solvent_drug','drug_drug','tcm_special')),
    item_a        TEXT NOT NULL,           -- 溶媒名 或 药A名
    item_b        TEXT,                    -- drug_drug 时为药B名; solvent_drug 时为药名
    compatibility TEXT NOT NULL CHECK (compatibility IN
                  ('incompatible','caution','compatible')),
    note          TEXT
);
CREATE INDEX idx_compat_a ON iv_compat_rules(item_a);
CREATE INDEX idx_compat_b ON iv_compat_rules(item_b);

-- ---------------------------------------------------------------------
-- 5. 处方主表
-- ---------------------------------------------------------------------
CREATE TABLE prescriptions (
    rx_id           TEXT PRIMARY KEY,           -- 处方编号, 输液以 IV- 开头
    visit_id        TEXT NOT NULL,              -- 一次就诊合并点评用
    rx_type         TEXT NOT NULL CHECK (rx_type IN
                    ('outpatient_normal','outpatient_iv')),
    patient_json    TEXT NOT NULL,              -- 姓名/性别/实足年龄/体重/身份证掩码/门诊号
    dept_code       TEXT NOT NULL,              -- 科别代码
    diagnosis       TEXT NOT NULL,              -- 临床诊断
    diagnosis_code  TEXT,                       -- ICD-10
    rx_date         TEXT NOT NULL,              -- YYYY-MM-DD
    insurance_type  TEXT,                       -- 费别: 医保/自费/公疗
    prescriber      TEXT NOT NULL,
    prescriber_title TEXT,                     -- 初级/主治/副主任/主任
    reviewer        TEXT,                       -- 审核药师
    dispenser       TEXT,                       -- 调配药师 (输液必填)
    checker         TEXT,                       -- 核对药师 (输液必填)
    total_amount    REAL DEFAULT 0,
    insurance_paid  REAL DEFAULT 0,
    self_paid       REAL DEFAULT 0,
    status          TEXT DEFAULT 'draft' CHECK (status IN
                    ('draft','submitted','reviewed','approved'))
);
CREATE INDEX idx_rx_visit ON prescriptions(visit_id);
CREATE INDEX idx_rx_date  ON prescriptions(rx_date);

-- ---------------------------------------------------------------------
-- 6. 处方明细表
-- ---------------------------------------------------------------------
CREATE TABLE rx_items (
    item_id            INTEGER PRIMARY KEY AUTOINCREMENT,
    rx_id              TEXT NOT NULL REFERENCES prescriptions(rx_id) ON DELETE CASCADE,
    line_no            INTEGER NOT NULL,            -- 行号, 溶媒=第一行
    drug_id            INTEGER NOT NULL REFERENCES drugs(drug_id),
    drug_name_snapshot TEXT NOT NULL,               -- 通用名快照
    spec_snapshot      TEXT NOT NULL,
    quantity           REAL NOT NULL,               -- 数量(袋/支/片)
    single_dose        TEXT,                        -- 单次剂量 带单位
    route              TEXT NOT NULL CHECK (route IN
                       ('oral','sublingual','topical','im','sc','iv_drip','iv_push')),
    frequency          TEXT,                        -- qd/bid/tid/q6h...
    duration_days      REAL,
    -- 输液专项字段 (非输液可空)
    iv_reason          TEXT CHECK (iv_reason IN
                       ('heavy_infection_fast_blood_conc',
                        'vomiting_diarrhea_dehydration',
                        'no_oral_alternative',
                        'sequential_therapy',
                        'other_with_note')),
    iv_reason_note     TEXT,                        -- other_with_note 时的补充说明
    solvent_name       TEXT,
    solvent_spec       TEXT,
    solvent_volume_ml  REAL,
    final_concentration TEXT,                      -- e.g. 0.9%
    drip_speed_mlh     REAL,
    total_volume_ml   REAL,
    infusion_hours     REAL,
    skin_test_required INTEGER DEFAULT 0,
    skin_test_result   TEXT CHECK (skin_test_result IN
                       ('positive','negative','not_required'))
);
CREATE INDEX idx_items_rx ON rx_items(rx_id);

-- ---------------------------------------------------------------------
-- 7. 点评结果表
-- ---------------------------------------------------------------------
CREATE TABLE review_results (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    rx_id        TEXT NOT NULL REFERENCES prescriptions(rx_id) ON DELETE CASCADE,
    dimension    TEXT NOT NULL,                 -- 11 维度之一
    rule_id      TEXT,                          -- e.g. IV-01
    verdict      TEXT NOT NULL CHECK (verdict IN ('pass','warn','error')),
    basis_text   TEXT,                          -- 政策/说明书原文短引
    suggestion   TEXT,                          -- 修改建议
    score_delta  REAL,
    created_at    TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_review_rx ON review_results(rx_id);

-- ---------------------------------------------------------------------
-- 8. 规则定义表
-- ---------------------------------------------------------------------
CREATE TABLE rules (
    rule_id      TEXT PRIMARY KEY,               -- e.g. IV-01
    enabled      INTEGER NOT NULL DEFAULT 1,
    group_name   TEXT NOT NULL,                  -- FORMAT/INDICATION/DOSAGE/IV_REASON/...
    title        TEXT NOT NULL,
    trigger_json TEXT,
    logic_text   TEXT,                           -- 自然语言描述
    severity     TEXT CHECK (severity IN ('pass','warn','error')),
    basis_text   TEXT,
    weight_hint  TEXT
);

-- ---------------------------------------------------------------------
-- 9. 用户能力画像
-- ---------------------------------------------------------------------
CREATE TABLE user_profile (
    user_id       TEXT PRIMARY KEY,
    dims_json     TEXT NOT NULL,                  -- 8 维能力分 {format, match, dose, route, compat, special, ess_drug, abx}
    history_json  TEXT NOT NULL,                  -- 最近 N 次处方得分数组
    updated_at    TEXT DEFAULT (datetime('now','localtime'))
);
