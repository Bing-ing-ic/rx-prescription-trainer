# 解剖模块审计清单（2026-11-12，供专家团执行依据）

项目根：`D:\医学生处方推演训练平台\`；纯静态，无构建链。前端 `js/anat-app.js`。

## 一、现状盘点（脚本 scripts/audit_anatomy.py 复跑）

- 系统 16 个，结构 165 个；系统图 16 张全部存在于 `img/`。
- 字段：结构条目含 id,name,subsystem,latin,location,relations,function,clinical,exam_points[],artery,nerve。
- 测验 155 题（`data/anatomy-quiz.json`，顶层 version/note/questions）；病例 21（`data/anatomy-cases.json`，顶层 version/note/cases）。
- 热区/图片映射在 `data/anatomy-hotspots.json`：`images`(系统图)、`hotspots`(系统→结构→{x,y} 百分比，可为 null)、`detail_images`(结构id→详图路径)。
- 前端回退：系统图缺省回退 `img/anatomy-body-diagram.jpg`；详图无映射则不渲染（不报错）；热区 null/无坐标则跳过。

## 二、已确认落地、无需重复新增（字段已齐全）

- 心传导系：sa_node / av_node / av_bundle / purkinje_fibers（circulatory）
- 上肢三神经：median_nerve / ulnar_nerve / musculocutaneous_nerve（regional_limbs）
- 脊柱韧带：anterior/posterior_longitudinal_ligament、ligamentum_flavum、interspinous/supraspinous_ligament（locomotor）
- 乳腺：cooper_ligament / breast_lymphatic_drainage（regional_thorax）
- 历史事实错误已修：膀胱三角 nerve、迷走神经 function 重复字（勿回退）。

## 三、待补缺口（本次任务）

### A. 数据/内容缺口（数据专家处理）
1. **字段缺失 8 处**（artery/nerve 空）：
   - reproductive/breast_cross_ref（乳腺）：artery、nerve
   - circulatory/compression_points（主要动脉压迫点）：artery、nerve
   - immune/lymphatic_vessels（淋巴管）：artery
   - immune/right_lymphatic_duct（右淋巴导管）：artery、nerve
   - immune/bone_marrow（骨髓）：nerve
2. **可能需新增高频结构**（对照人卫《系统解剖学》第9版判断，字段须完整）：
   - 腹膜后隙（regional_abdomen 或 digestive 间隙层面）
   - 膈神经（nervous 或 regional_limbs，C3-C5，经前斜角肌前面，支配膈）
   - 颈总动脉/颈动脉窦（circulatory 或 regional_headneck）
   - 面神经五大分支（颞/颧/颊/下颌缘/颈支）可并入现有 facial_nerve 或单列
3. **35 条 legacy 题 system 归属失效**（旧值 visceral/vascular，题干医学内容有效，须按题干重映射到现有 16 系统之一，勿删题）：
   - 有效系统 id：locomotor,digestive,respiratory,urinary,reproductive,circulatory,nervous,endocrine,immune,muscular,integumentary,sensory,regional_headneck,regional_thorax,regional_abdomen,regional_limbs
   - visceral q021-040 逐条判；vascular q041-055 归 circulatory（个别上肢/静脉题可归 regional_limbs）。
4. **测验分布失衡**（0 题系统）：immune、muscular、integumentary、sensory、regional_abdomen；regional_thorax=1、regional_limbs=1、urinary=4、reproductive=4、respiratory=5、digestive=7。向 0 题与薄弱系统补题，题型 identify/match/qa 混排，难度初/中/高梯度；答案与解释须符合人卫9版。
5. **病例 0 例系统**：reproductive、immune、muscular、integumentary、sensory；补到每系统≥1 例，沿用现有病例字段：id,title,system,difficulty,scenario,question,key_structures[],answer,exam_point。
6. **热区坐标补齐**（在 hotspots 段，不动 detail_images）：
   - 无热区结构：locomotor 五条韧带；reproductive/breast_cross_ref；circulatory/sa_node,av_node,av_bundle,purkinje_fibers；nervous/cranial_nerves_summary；regional_thorax/cooper_ligament,breast_lymphatic_drainage；regional_limbs/median_nerve,ulnar_nerve,musculocutaneous_nerve。
   - 已有 3 个 null（circulatory/compression_points, hepatic_portal, thoracic_duct）：若系统图上无对应位置可保留 null（合理降级）；能定位则补坐标。
   - 坐标为相对系统图的百分比 x,y（0-100），须与该系统图方位一致；无法在系统图标注的结构保留 null，不要硬编错位坐标。

### B. 图片缺口（图片专家处理）
1. **62 个结构无详图**（detail_images 缺映射），按系统分布：
   - immune 4、muscular 12、integumentary 6、sensory 8、regional_headneck 6、regional_thorax 9、regional_abdomen 10、regional_limbs 7。
   - 完整无图 id 清单以 `scripts/audit_anatomy.py` 复跑输出为准（"structures w/o detail image"）。
2. **孤儿图复用**（磁盘有、未被 detail_images 引用，先确认对应结构再挂接）：
   - img/atlas/anat-detail-brain-base.jpg → 脑神经/脑干相关结构
   - img/atlas/anat-detail-intervertebral-disc.jpg → 椎间盘/脊柱相关
   - img/anat-eye.jpg → 眼球/感觉器
   - img/anat-skeleton-hero.png 已被 index.html 引用（banner），勿动；img/anat-skeleton-hero.jpg 为同图备份。
3. 优先联网搜**简体中文标注、人卫教材风格**解剖示意图；下载到 `img/atlas/`，命名 `anat-detail-<结构id>.jpg`；找不到合适的再 AI 生图。单图尽量 <300KB，过大压缩。
4. 系统图 16 张已存在；如某张模糊/错配可替换，命名沿用 `img/anat-<systemid>.jpg`。
5. 图片专家**不要改** systems/quiz/cases/hotspots.json；把新增/挂接的 `结构id → 图片路径` 映射写到独立文件 `data/anatomy-image-map-supplement.json`（顶层 `{"detail_images": {...}}`），由编排者合并进 hotspots.json。
6. 交付前校验：映射路径文件真实存在；无悬空引用；磁盘无新增孤儿图。

## 四、校验口径
- 所有 JSON 必须合法（UTF-8、可被 JSON.parse/ConvertFrom-Json 解析）。
- 医学口径：人卫《系统解剖学》第9版、《局部解剖学》第9版；动脉供应、神经支配须准确。
- 保持现有功能与既有正确内容不受影响；不删有效题目/病例。
