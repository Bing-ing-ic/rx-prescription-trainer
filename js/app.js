/* =====================================================================
 * app.js  主交互逻辑
 * ===================================================================== */
(function () {
  'use strict';

  // ---------- 全局状态 ----------
  const S = {
    diseases: [],
    drugs: [],
    rules: [],
    compat: null,
    disease: null,
    patient: null,
    diagnosisInput: '',
    diagnosisOk: false,
    rxType: null,          // 'normal' | 'iv'
    normalItems: [],       // [{drug, quantity, single_dose, frequency, duration_days, route}]
    ivGroups: [],          // 多组输液：[{solvent, drugs:[], fields:{...}}]
    ivFields: { iv_reason:'', iv_reason_note:'' },  // 全局指征（整个处方级别）
    restrictedConfirmed: false,
    lastReview: null,
    lastVisitCtx: null
  };

  // ---------- DOM ----------
  const $ = id => document.getElementById(id);
  function show(view) {
    ['view-home','view-rx','view-report','view-radar','view-mistakes','view-stats'].forEach(v => $(v).classList.add('hidden'));
    $(view).classList.remove('hidden');
    window.scrollTo(0,0);
  }

  // 药品通用名 → 拼音首字母（用于首拼模糊搜索）
  const DRUG_PINYIN = {
    '苯磺酸氨氯地平片': 'bhsalcdp',
    '硝苯地平控释片': 'xbdpksdp',
    '盐酸二甲双胍缓释片': 'yesejghsp',
    '阿莫西林胶囊': 'amxljn',
    '布洛芬缓释胶囊': 'blfhjsn',
    '奥美拉唑肠溶胶囊': 'amczcrjn',
    '头孢呋辛酯片': 'tbfxzp',
    '左氧氟沙星片': 'zyfsxp',
    '谷维素片': 'gwp',
    '复合维生素B片': 'fhwssbp',
    '蒙脱石散': 'mtss',
    '口服补液盐III': 'kfbyys',
    '阿司匹林肠溶片': 'asplcrp',
    '阿托伐他汀钙片': 'atftdgp',
    '左甲状腺素钠片': 'dzjzsnp',
    '甲巯咪唑片': 'jqmzp',
    '多潘立酮片': 'dpldtp',
    '双歧杆菌三联活菌胶囊': 'sqgjslhxjn',
    '莫匹罗星软膏': 'mplxrg',
    '碘伏消毒液': 'dfxdy',
    '维生素B12注射液': 'wssb12zsy',
    '维生素B6注射液': 'wssb6zsy',
    '注射用头孢呋辛钠': 'zsytbfxn',
    '注射用泮托拉唑钠': 'zsypntlsn',
    '盐酸左氧氟沙星注射液': 'yszzyfsxzsy',
    '地塞米松磷酸钠注射液': 'dsmslnszsy',
    '维生素C注射液': 'wssczsy',
    '氯化钾注射液': 'lhszsy',
    '清开灵注射液': 'qklzsy',
    '注射用盐酸万古霉素': 'zsyyswgm',
    '0.9%氯化钠注射液': 'lhnzsy',
    '5%葡萄糖注射液': 'pttzsy',
    '葡萄糖氯化钠注射液': 'pttlhnzsy',
    '复方氯化钠注射液': 'fflhnzsy'
  };

  // 药品模糊匹配：支持中文通用名 + 拼音首字母（不区分大小写）
  function matchDrug(d, kw) {
    kw = (kw || '').toLowerCase().trim();
    if (!kw) return true;
    if (d.generic_name.toLowerCase().indexOf(kw) >= 0) return true;
    const py = DRUG_PINYIN[d.generic_name] || d.pinyin || '';
    if (py.indexOf(kw) >= 0) return true;
    return false;
  }

  // ---------- 启动：加载数据 ----------
  async function loadJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(url + ' ' + r.status);
    return r.json();
  }
  async function boot() {
    try {
      const [d, dr, r, c] = await Promise.all([
        loadJSON('data/diseases.json'),
        loadJSON('data/drugs.json'),
        loadJSON('data/rules.json'),
        loadJSON('data/compat.json')
      ]);
      S.diseases = d.diseases;
      S.drugs = dr.drugs;
      S.rules = r.rules;
      S.compat = c;
      bindNav();
      renderRadar();
    } catch (e) {
      alert('数据加载失败：' + e.message + '\n请用 python -m http.server 或双击 index.html 后通过 http:// 打开。');
    }
  }

  function bindNav() {
    document.querySelectorAll('[data-goto]').forEach(b => {
      b.onclick = () => {
        const t = b.getAttribute('data-goto');
        if (t === 'home') show('view-home');
        else if (t === 'radar') { renderRadar(); show('view-radar'); }
        else if (t === 'mistakes') { renderMistakes(); show('view-mistakes'); }
        else if (t === 'stats') { renderStats(); show('view-stats'); }
      };
    });
    $('btn-new-case').onclick = newCase;
    $('btn-diag-check').onclick = checkDiagnosis;
    $('diag-input').oninput = onDiagInput;
    $('diag-input').onkeydown = onDiagKey;
    document.querySelectorAll('.btn-type').forEach(b => {
      b.addEventListener('click', () => openRx(b.getAttribute('data-type')));
    });
    $('btn-back-home').onclick = () => show('view-home');
    $('btn-print').onclick = () => window.print();
    $('btn-submit').onclick = submitRx;
    $('btn-report-home').onclick = () => show('view-home');
    $('btn-radar-home').onclick = () => show('view-home');
    $('btn-mistakes-home').onclick = () => show('view-home');
    $('btn-stats-home').onclick = () => show('view-home');
    $('btn-retry').onclick = () => { show('view-home'); newCase(); };
    $('btn-clear-history').onclick = () => {
      if (confirm('清空历史得分？')) { localStorage.removeItem('rx-profile-history'); renderRadar(); }
    };
    $('btn-clear-mistakes').onclick = () => {
      if (confirm('清空错题本？')) { localStorage.removeItem('rx-mistakes'); renderMistakes(); }
    };
    // 深色模式切换
    $('btn-dark-toggle').onclick = () => {
      document.body.classList.toggle('dark-mode');
      const isDark = document.body.classList.contains('dark-mode');
      localStorage.setItem('rx-dark-mode', isDark ? '1' : '0');
      $('btn-dark-toggle').textContent = isDark ? '☀️' : '🌙';
    };
    // 恢复深色模式
    if (localStorage.getItem('rx-dark-mode') === '1') {
      document.body.classList.add('dark-mode');
      $('btn-dark-toggle').textContent = '☀️';
    }

    $('drug-search').oninput = renderDrugList;
    $('iv-drug-search').oninput = renderIvDrugList;
    // 键盘方向键+回车选择药品
    bindKbNav('drug-search', 'drug-list', () => S.kbOralItems, () => S.kbOralSel,
      i => S.kbOralSel = i, i => addNormalItem(S.kbOralItems[i]));
    bindKbNav('iv-drug-search', 'iv-drug-list', () => S.kbIvItems, () => S.kbIvSel,
      i => S.kbIvSel = i, i => {
        if (S.kbIvDisabled[i]) return;
        addIvDrug(S.kbIvItems[i]);
      });

  }

  // 键盘导航：上下键高亮，回车确认
  function bindKbNav(inputId, listId, getItems, getSel, setSel, onEnter) {
    const input = $(inputId), list = $(listId);
    input.onkeydown = (e) => {
      const items = getItems();
      if (!items || !items.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        let i = getSel();
        i = (i + (e.key==='ArrowDown'?1:-1) + items.length) % items.length;
        setSel(i);
        list.querySelectorAll('.drug-item').forEach((el, idx) => {
          el.classList.toggle('kb-highlight', idx === i);
        });
        // 滚动到可见
        const hi = list.querySelector('.kb-highlight');
        if (hi) hi.scrollIntoView({block:'nearest'});
      } else if (e.key === 'Enter') {
        e.preventDefault();
        let i = getSel();
        if (i < 0) i = 0;
        setSel(i);
        onEnter(i);
      }
    };
  }

  // ---------- 多组输液模型 ----------
  // 每组 = { solvent: drugObj|null, drugs: [drugObj...], fields: {conc,speed,totalvol,hours,skinReq,skinResult} }
  function newIvGroup() {
    const g = { solvent: null, drugs: [], fields: emptyGroupFields() };
    S.ivGroups.push(g);
    renderIvGroups();
    return g;
  }
  function activeGroup() {
    return S.ivGroups[S.ivGroups.length - 1];
  }
  function emptyGroupFields() {
    return { conc:'', speed:'', totalvol:'', hours:'', skinReq:'0', skinResult:'not_required' };
  }

  // ---------- 病例抽取 ----------
  const SURNAMES = ['张','李','王','赵','刘','陈','杨','黄'];
  const GIVEN = ['伟','芳','娜','敏','静','磊','洋','艳','勇','军'];
  function randPick(arr) { return arr[Math.floor(Math.random()*arr.length)]; }

  function newCase() {
    // 难度筛选
    const diffFilter = document.querySelector('input[name="diff-filter"]:checked');
    const diff = diffFilter ? diffFilter.value : 'all';
    let pool = S.diseases;
    if (diff !== 'all') {
      pool = S.diseases.filter(d => d.difficulty === diff);
    }
    if (pool.length === 0) pool = S.diseases; // 兜底
    S.disease = randPick(pool);
    S.diagnosisInput = '';
    S.diagnosisOk = false;
    S.rxType = null;
    S.normalItems = [];
    S.ivGroups = [];
    S.ivFields = { iv_reason:'', iv_reason_note:'' };
    S.restrictedConfirmed = false;
    S.overLimitWarned = false;
    S.ivOverLimitWarned = false;

    // 生成合成患者：年龄/性别/费别完全随机，但根据疾病匹配合理年龄
    const elderlyDiseases = ['HTN-I10','CHD-I25','TIA-G45','COPD-J44','DM-E11','HYPOTHY-E03','POSTAPP-Z48','POSTHERNIA-Z48'];
    const childOkDiseases = ['URI-J00','AB-BRONCH-J20','CAP-J18','AGE-A09','GASTRITIS-K29','FD-K30'];
    const code = S.disease.code;
    let age;
    if (elderlyDiseases.includes(code)) {
      // 老年病：45-85岁
      age = Math.floor(Math.random()*41+45);
    } else if (childOkDiseases.includes(code) && Math.random() < 0.2) {
      // 儿童常见病：2-13岁
      age = Math.floor(Math.random()*12+2);
    } else {
      // 普通成人：18-65岁
      age = Math.floor(Math.random()*48+18);
    }
    const gender = Math.random()<0.5 ? '男' : '女';
    let weight;
    if (age < 14) weight = Math.round((5 + age*2.5) * 10)/10;
    else weight = Math.round((50 + Math.random()*25) * 10)/10;
    const feeTypes = ['城镇职工医保','城乡居民医保','自费'];
    const feeType = feeTypes[Math.floor(Math.random()*feeTypes.length)];
    const name = SURNAMES[Math.floor(Math.random()*SURNAMES.length)] + GIVEN[Math.floor(Math.random()*GIVEN.length)];
    S.patient = {
      name, gender, age, weight, feeType,
      id: '5301**********0011',
      mz: 'MZ' + new Date().toISOString().slice(0,10).replace(/-/g,'') + String(Math.floor(Math.random()*9000+1000)),
      renal_insufficiency: age > 65 && Math.random() < 0.2,
      heart_renal_insufficiency: false
    };
    $('f-fee').textContent = feeType;

    // 渲染病例卡片
    $('case-diff').textContent = S.disease.difficulty;
    $('case-meta').innerHTML =
      `${S.patient.name}，${S.patient.gender}，实足 ${S.patient.age} 岁，体重 ${S.patient.weight} kg，门诊号 ${S.patient.mz}`;
    const sp = S.disease.symptom_pool;
    $('case-body').innerHTML =
      `<div>📌 <b>主诉：</b>${randPick(sp.chief_complaint)}</div>` +
      `<div>📝 <b>现病史：</b>${randPick(sp.history)}</div>` +
      `<div>🩺 <b>生命体征：</b>T ${sp.vitals.temp}℃，P ${sp.vitals.hr} 次/分，BP ${sp.vitals.bp}，SpO₂ ${sp.vitals.spo2}</div>` +
      `<div>🔍 <b>查体：</b>${randPick(sp.exam)}</div>`;
    const vs = sp.volume_status;
    $('case-volume').innerHTML =
      `<b>容量状态：</b>皮肤弹性=${vs.skin_turgor}；黏膜=${vs.mucosa}；尿量=${vs.urine}；吐泻=${vs.diarrhea_vomit_freq}；进食=${vs.oral_intake}`;
    $('case-card').classList.remove('hidden');
    $('diag-input').value = '';
    $('diag-feedback').innerHTML = '';
    $('diag-suggest').classList.add('hidden');
    $('diag-suggest').innerHTML = '';
    S.diagWrongCount = 0;
    $('rx-type-row').classList.add('hidden');
    show('view-home');
  }

  // ---------- 诊断校验 ----------
  // 疾病拼音首拼字典（用于诊断输入框模糊匹配）
  const DISEASE_PINYIN = {
    '高血压': 'gxy',
    '冠状动脉粥样硬化性心脏病': 'gzdmyzxhxbz',
    '稳定型心绞痛': 'wdxxjt',
    '短暂性脑缺血': 'dzxnqxy',
    '上呼吸道感染': 'shxgr',
    '普通感冒': 'ptgm',
    '急性支气管炎': 'jxzqgy',
    '慢性阻塞性肺疾病': 'mxzxsfj',
    '慢阻肺': 'mzf',
    '社区获得性肺炎': 'shdhxfy',
    '医院获得性肺炎': 'yydhxfy',
    '2型糖尿病': 'extnbtb',
    '2 型糖尿病': 'extnbtb',
    '甲状腺功能亢进': 'jzxgnkj',
    '甲亢': 'jk',
    '甲状腺功能减退': 'jzxgntj',
    '甲减': 'jj',
    '急性胃炎': 'jxwy',
    '急性胃肠炎': 'jxwby',
    '功能性消化不良': 'gnxhbl',
    '腹泻': 'fx',
    '阑尾炎切除术后': 'lwyqcssh',
    '阑尾切除术后': 'lwqcssh',
    '腹股沟疝修补术后': 'fggssxsh',
    '腹股沟疝': 'fggs',
    '急性阑尾炎': 'jx lwy',
    '阑尾炎': 'lwy',
    '细菌性痢疾': 'xljlj',
    '痢疾': 'lj',
    '支气管哮喘': 'zqxc',
    '哮喘': 'xc',
    '偏头痛': 'ptt',
    '缺铁性贫血': 'qtxpx',
    '贫血': 'px',
    '急性膀胱炎': 'jxpgy',
    '膀胱炎': 'pgy',
    '胃黏膜病变': 'wnmbb',
    '胃出血': 'wcx',
    '荨麻疹': 'qmz',
    '糖尿病伴酮症': 'tnbtbz',
    '酮症': 'tz',
    '踝关节扭伤': 'ghjns',
    '扭伤': 'ns',
    '急性胰腺炎': 'jxyxxy',
    '胰腺炎': 'yxxy',
  };
  function matchDisease(name, kw) {
    if (!kw || !name) return false;
    const k = kw.toLowerCase();
    // 1. 中文子串全局匹配（任意位置）
    if (name.indexOf(kw) >= 0 || kw.indexOf(name) >= 0) return true;
    // 2. 首拼全局匹配：k 是病名首拼的任意连续子串
    const pys = [];
    if (DISEASE_PINYIN[name]) pys.push(DISEASE_PINYIN[name]);
    for (const [dn, dpy] of Object.entries(DISEASE_PINYIN)) {
      if (name.indexOf(dn) >= 0 && !pys.includes(dpy)) pys.push(dpy);
    }
    for (const py of pys) {
      if (py.indexOf(k) >= 0) return true;
    }
    return false;
  }

  // 诊断输入实时提示：匹配到的病名列表（键盘上下键选择，回车确认）
  function onDiagInput() {
    const kw = $('diag-input').value.trim();
    const box = $('diag-suggest');
    if (!kw || !S.diseases) { box.classList.add('hidden'); box.innerHTML=''; S.diagMatches=[]; return; }
    const matched = S.diseases.filter(d => matchDisease(d.name, kw) || (d.icd10||'').toLowerCase().indexOf(kw.toLowerCase()) >= 0);
    S.diagMatches = matched;
    S.diagSel = matched.length ? 0 : -1;
    if (!matched.length) { box.classList.add('hidden'); box.innerHTML=''; return; }
    box.classList.remove('hidden');
    box.innerHTML = '你输入的「'+kw+'」匹配到：' +
      matched.slice(0,8).map((d,i) => `<span class="sug-item${i===0?' kb-highlight':''}" data-name="${d.name}" data-i="${i}">${d.name}</span>`).join(' ');
    box.querySelectorAll('.sug-item').forEach(el => {
      el.onclick = () => {
        $('diag-input').value = el.getAttribute('data-name');
        box.classList.add('hidden');
        checkDiagnosis();
      };
    });
  }

  function onDiagKey(e) {
    const matched = S.diagMatches || [];
    if (!matched.length) return;
    const box = $('diag-suggest');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      S.diagSel = ((S.diagSel||0) + (e.key==='ArrowDown'?1:-1) + matched.length) % matched.length;
      box.querySelectorAll('.sug-item').forEach((el, i) => {
        el.classList.toggle('kb-highlight', i === S.diagSel);
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const i = S.diagSel || 0;
      const d = matched[i];
      if (d) {
        $('diag-input').value = d.name;
        box.classList.add('hidden');
        checkDiagnosis();
      }
    } else if (e.key === 'Escape') {
      box.classList.add('hidden');
    }
  }

  function checkDiagnosis() {
    const v = $('diag-input').value.trim();
    S.diagnosisInput = v;
    const fb = $('diag-feedback');
    if (!v) { fb.innerHTML = '<span class="diag-err">请输入诊断。</span>'; return; }

    const dx = S.disease;
    // 命中主病名（支持中文名/ICD-10/拼音首拼）
    if (matchDisease(dx.name, v) || dx.icd10 === v) {
      S.diagnosisOk = true;
      fb.innerHTML = `<span class="diag-ok">✅ 正确诊断：${dx.name}（ICD-10: ${dx.icd10}）</span>`;
      $('rx-type-row').classList.remove('hidden');
      return;
    }
    // 命中鉴别
    const diff = (dx.differential||[]).find(d => matchDisease(d, v));
    if (diff) {
      fb.innerHTML = `<span class="diag-warn">⚠️ 「${diff}」是重要鉴别诊断，需进一步检查排除，但不是本病例主诊断。</span>`;
      return;
    }
    // 错误：追加方向提示
    S.diagWrongCount = (S.diagWrongCount || 0) + 1;
    const HINT = {
      '高血压': '提示：本病例为慢性病程，重点关注血压升高相关靶器官。',
      '冠状动脉粥样硬化性心脏病': '提示：活动后胸闷胸痛，休息或含服硝酸甘油缓解——考虑冠状动脉缺血性心脏病。',
      '稳定型心绞痛': '提示：活动后胸闷、加重，休息缓解——考虑心血管缺血性疾病。',
      '短暂性脑缺血': '提示：一过性神经功能缺损，24h 内完全恢复——考虑脑血管短暂缺血。',
      '上呼吸道感染': '提示：本病例无发热、无咽痛、无咳嗽——不是呼吸道感染。',
      '普通感冒': '提示：本病例无发热、无咽痛、无咳嗽——不是感冒。',
      '急性支气管炎': '提示：本病例无咳嗽咳痰——不是支气管炎。',
      '慢性阻塞性肺疾病': '提示：慢性咳嗽咳痰+活动后气促——考虑慢性气道疾病。',
      '社区获得性肺炎': '提示：发热+咳嗽咳痰+肺部啰音——考虑肺部感染。',
      '2型糖尿病': '提示：多饮多尿多食体重下降——考虑内分泌代谢疾病。',
      '2 型糖尿病': '提示：多饮多尿多食体重下降——考虑内分泌代谢疾病。',
      '甲状腺功能亢进': '提示：高代谢综合征（心慌怕热多汗消瘦）——考虑甲状腺功能亢进。',
      '甲状腺功能减退': '提示：低代谢综合征（乏力怕冷水肿）——考虑甲状腺功能减退。',
      '急性胃炎': '提示：上腹不适+进食相关——考虑胃黏膜急性炎症。',
      '功能性消化不良': '提示：餐后饱胀+无器质性病变——考虑功能性胃肠病。',
      '急性胃肠炎': '提示：呕吐腹泻+脱水——考虑急性胃肠道感染。',
      '阑尾炎切除术后': '提示：有手术史，术后恢复——考虑术后状态。',
      '腹股沟疝修补术后': '提示：有手术史，术后恢复——考虑术后状态。'
    };
    let hint = '';
    for (const [k, h] of Object.entries(HINT)) {
      if (dx.name.indexOf(k) >= 0) { hint = h; break; }
    }
    // 分级提示：第1次方向提示；第2次给首拼；第3次直接给答案
    const correctPy = DISEASE_PINYIN[dx.name] ||
      Object.entries(DISEASE_PINYIN).find(([k]) => dx.name.indexOf(k) >= 0)?.[1] || '';
    let reveal = '';
    if (S.diagWrongCount >= 3) {
      reveal = `<div style="margin-top:6px;color:#c0392b;font-size:13px">🔑 正确诊断：<b>${dx.name}</b>（ICD-10: ${dx.icd10}）</div>`;
    } else if (S.diagWrongCount >= 2 && correctPy) {
      reveal = `<div style="margin-top:6px;color:#b7791f;font-size:13px">🔤 首拼提示：<b>${correctPy}</b></div>`;
    }
    fb.innerHTML = `<span class="diag-err">❌ 「${v}」与症状/体征不符，请重新判断。（已错 ${S.diagWrongCount} 次）</span>` +
      (hint ? `<div style="margin-top:6px;color:#b7791f;font-size:13px">💡 ${hint}</div>` : '') +
      reveal;
    // 清空输入框并聚焦，方便重新输入
    $('diag-input').value = '';
    $('diag-input').focus();
  }

  // ---------- 打开处方笺 ----------
  function openRx(type) {
    try {
    if (!S.disease || !S.patient) { alert('病例数据未就绪，请先点"开始新病例"'); return; }
    S.rxType = type;
    // 前记
    $('p-name').textContent = S.patient.name;
    $('p-gender').textContent = S.patient.gender;
    $('p-age').textContent = S.patient.age;
    $('p-weight').textContent = S.patient.weight;
    $('p-id').textContent = S.patient.id;
    $('p-mz').textContent = S.patient.mz;
    $('p-dx').textContent = S.disease.name;
    $('p-date').textContent = new Date().toISOString().slice(0,10);

    // 处方笺样式（按国标：儿科淡绿 <14岁 > 急诊淡黄（输液） > 普通白色）
    const paper = $('rx-paper');
    paper.classList.remove('emergency','pediatric','narcotic');

    // 解析患者年龄（岁）：支持数字 / "3岁" / "8月" / "15天"
    const ageRaw = S.patient.age;
    let ageYears = 99;
    if (typeof ageRaw === 'number') {
      ageYears = ageRaw;
    } else {
      const ageStr = String(ageRaw || '');
      const mDay = ageStr.match(/(\d+)\s*天/);
      const mMon = ageStr.match(/(\d+)\s*月/);
      const mYr  = ageStr.match(/(\d+)\s*岁/);
      if (mDay) ageYears = parseInt(mDay[1]) / 365;
      else if (mMon) ageYears = parseInt(mMon[1]) / 12;
      else if (mYr) ageYears = parseInt(mYr[1]);
    }
    const isPediatric = ageYears < 14;

    if (type === 'iv') {
      if (isPediatric) {
        paper.classList.add('pediatric');
        $('rx-corner').textContent = '儿科处方';
      } else {
        $('rx-corner').textContent = '';
      }
      $('rx-title').textContent = isPediatric ? '儿 科 门 诊 输 液 处 方 笺' : '门 诊 输 液 处 方 笺';
      $('rx-no').textContent = (isPediatric?'IV-ET-':'IV-JCK-') + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + String(Math.floor(Math.random()*900000+100000));
      $('rx-body-normal').classList.add('hidden');
      $('rx-body-iv').classList.remove('hidden');
      document.querySelectorAll('.iv-only').forEach(e=>e.classList.remove('hidden'));
      S.ivGroups = [];
      newIvGroup();
    } else {
      if (isPediatric) {
        paper.classList.add('pediatric');
        $('rx-corner').textContent = '儿科';
        $('rx-title').textContent = '儿 科 门 诊 处 方 笺';
      } else {
        $('rx-corner').textContent = '普通';
        $('rx-title').textContent = '门 诊 处 方 笺';
      }
      $('rx-no').textContent = (isPediatric?'ET-':'MZ-') + 'JCK-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + String(Math.floor(Math.random()*900000+100000));
      $('rx-body-normal').classList.remove('hidden');
      $('rx-body-iv').classList.add('hidden');
      document.querySelectorAll('.iv-only').forEach(e=>e.classList.add('hidden'));
    }
    renderDrugList(); renderIvDrugList(); renderNormalItems(); renderIvGroups();
    show('view-rx');
    } catch(e) {
      document.body.insertAdjacentHTML('afterbegin',
        '<div style="position:fixed;top:0;left:0;right:0;background:red;color:white;padding:12px;z-index:99999;font-size:14px;font-family:monospace;">' +
        '❌ openRx错误: ' + e.message + '<br><br>' + (e.stack||'').slice(0,500) + '</div>');
    }
  }

  // ---------- 药品列表渲染（非输液通道） ----------
  function renderDrugList() {
    const kw = $('drug-search').value.trim();
    const list = $('drug-list');
    const pool = S.drugs.filter(d => ['oral','topical','im','sc'].includes(d.dosage_form));
    const items = pool.filter(d => matchDrug(d, kw));
    S.kbOralItems = items;
    S.kbOralSel = items.length ? 0 : -1;
    list.innerHTML = '';
    items.forEach((d, i) => {
      const div = document.createElement('div');
      div.className = 'drug-item' + (i === S.kbOralSel ? ' kb-highlight' : '');
      div.dataset.kbIndex = i;
      div.innerHTML = `
        <div>
          <b>${d.generic_name}</b> <span class="meta">${d.spec} · ¥${Number(d.price_yuan||0).toFixed(1)}/${d.unit||'支'}</span>
          <div class="mfr" style="font-size:11px;color:#94a3b8">🏭 ${d.manufacturer||'国产'}</div>
          ${abxChip(d.abx_level)}
          ${controlledChip(d)}
          ${miChip(d)}
        </div>
        <button class="btn btn-sm">+ 添加</button>`;
      div.querySelector('button').onclick = () => addNormalItem(d);
      list.appendChild(div);
    });
    updateCount();
  }
  function abxChip(lv) {
    if (!lv || lv==='none') return '';
    const map = {non_restricted:'non-restr', restricted:'restricted', special:'special'};
    return `<span class="chip chip-abx-${lv}">${map[lv]||lv}</span>`;
  }
  // 医保/基药/集采标记
  function miChip(d) {
    let html = '';
    const mi = d.medical_insurance_class;
    if (mi === '甲') html += '<span class="chip" style="background:#27ae60;color:#fff">甲</span>';
    else if (mi === '乙') html += '<span class="chip" style="background:#2980b9;color:#fff">乙</span>';
    else if (mi === '丙' || mi === '自费') html += '<span class="chip" style="background:#95a5a6;color:#fff">丙</span>';
    if (d.essential_medicine) html += '<span class="chip" style="background:#8e44ad;color:#fff">基</span>';
    if (d.jtc_batch) html += '<span class="chip" style="background:#e67e22;color:#fff">集</span>';
    return html;
  }
  // 麻精药品红色标记（按处方管理办法：麻/精一淡红，精二白）
  function controlledChip(d) {
    const c = d.controlled_substance;
    if (!c) return '';
    if (c === 'narcotic') return '<span class="chip chip-narcotic">麻醉</span>';
    if (c === 'psychotropic_1') return '<span class="chip chip-narcotic">精一</span>';
    if (c === 'psychotropic_2') return '<span class="chip chip-psycho2">精二</span>';
    return '';
  }
  function mzChip(c) {
    if (c==='甲') return '<span class="chip chip-mz-a">医保甲</span>';
    if (c==='乙') return '<span class="chip chip-mz-b">医保乙</span>';
    return '<span class="chip chip-mz-self">自费</span>';
  }

  function addNormalItem(drug) {
    // 超过5种：仅在第6个时提示一次，之后不阻断，只标记
    if (S.normalItems.length >= 5 && !S.overLimitWarned) {
      S.overLimitWarned = true;
      alert(`⚠️ 超限提醒：每张处方一般不超过5种药品（当前已 ${S.normalItems.length} 种）。\n\n《处方管理办法》规定每张处方≤5种，后续可继续添加，系统将自动标记超限。`);
    }
    // special 级门诊拦截
    if (drug.abx_level === 'special') {
      $('modal-block-text').textContent =
        `「${drug.generic_name}」为特殊使用级抗菌药（special）。\n\n依据：《抗菌药物临床应用分级管理目录（2024版）》——特殊使用级抗菌药不得在门诊使用，抢救生命垂危患者除外。需住院治疗并经高级职称会诊审批。`;
      $('modal-block').classList.remove('hidden');
      return;
    }
    // restricted 级弹确认
    if (drug.abx_level === 'restricted' && !S.restrictedConfirmed) {
      $('modal-restricted-text').textContent =
        `「${drug.generic_name}」为限制使用级抗菌药（restricted）。\n依据：《抗菌药物临床应用分级管理》——限制使用级应由中级以上职称医师开具。\n\n模拟：是否由中级以上职称确认？`;
      $('modal-restricted').classList.remove('hidden');
      // 挂一次性回调
      $('btn-restricted-ok').onclick = () => {
        S.restrictedConfirmed = true;
        $('modal-restricted').classList.add('hidden');
        pushNormal(drug);
      };
      $('btn-restricted-cancel').onclick = () => {
        $('modal-restricted').classList.add('hidden');
      };
      return;
    }
    pushNormal(drug);
  }
  function pushNormal(drug) {
    S.normalItems.push({
      drug,
      quantity: defaultQty(drug),
      single_dose: defaultSingleDose(drug),
      frequency: (drug.dose_range_json||{}).default_freq || 'bid',
      duration_days: (drug.dose_range_json||{}).default_duration_days || 7,
      route: drug.dosage_form
    });
    renderNormalItems(); renderDrugList();
    const s = $('drug-search'); if (s) { s.value=''; s.focus(); }
    // 事中提醒：加药后实时弹出
    midProcessAlert(drug);
  }

  // 医保/安全事中提醒
  function midProcessAlert(drug) {
    const msgs = [];
    const age = S.patient.age || 30;
    // 1. 儿童喹诺酮禁忌
    if (age < 18 && /左氧|环丙|莫西|诺氟|氧氟/.test(drug.generic_name||'')) {
      msgs.push({level:'error', text:`👶 儿童用药禁忌：${drug.generic_name} 为喹诺酮类，18岁以下禁用（可致软骨损害）。`});
    }
    // 2. 儿童四环素禁忌
    if (age < 8 && /四环素|多西环素/.test(drug.generic_name||'')) {
      msgs.push({level:'error', text:`👶 儿童用药禁忌：${drug.generic_name} 为四环素类，8岁以下禁用。`});
    }
    // 3. 中药注射剂提醒
    if (drug.is_tcm_injection) {
      msgs.push({level:'warn', text:`💉 中药注射剂：须单独输注，严禁与其他药物混合配伍；滴速宜慢。`});
    }
    // 4. 氯化钾提醒
    if (/氯化钾/.test(drug.generic_name||'')) {
      msgs.push({level:'warn', text:`🧪 氯化钾：静滴浓度≤0.3%，速度≤20mmol/h，严禁静脉推注，见尿补钾。`});
    }
    // 5. 医保限适应症：降压药 vs 无高血压诊断
    const dxName = S.disease.name || '';
    if (/氨氯地平|硝苯地平|美托洛尔|缬沙坦|厄贝沙坦|卡托普利|依那普利|氯沙坦/.test(drug.generic_name||'') && !/高血压|冠心病|心绞痛|TIA|短暂性脑缺血/.test(dxName)) {
      msgs.push({level:'warn', text:`💰 医保提醒：${drug.generic_name} 为降压药，诊断「${dxName}」不在医保支付范围内，医保基金不予支付。`});
    }
    // 6. 医保限适应症：降糖药 vs 无糖尿病诊断
    if (/二甲双胍|格列美脲|格列齐特|胰岛素|阿卡波糖|西格列汀/.test(drug.generic_name||'') && !/糖尿病/.test(dxName)) {
      msgs.push({level:'warn', text:`💰 医保提醒：${drug.generic_name} 为降糖药，诊断「${dxName}」不在医保支付范围内，医保基金不予支付。`});
    }
    // 弹提醒
    if (msgs.length > 0) {
      const txt = msgs.map(m => m.text).join('\n\n');
      if (msgs.some(m => m.level==='error')) {
        alert('🚨 事中安全拦截：\n\n' + txt);
      } else {
        alert('⚠️ 医保/用药提醒：\n\n' + txt);
      }
    }
  }

  function defaultQty(d) {
    // 口服药：按疗程×频次自动算最小单位数量（片/粒）
    if (d.dosage_form==='oral') {
      const r = d.dose_range_json || {};
      const days = r.default_duration_days || 7;
      const freqMap = {'qd':1,'bid':2,'tid':3,'qid':4,'qn':1};
      const perDay = freqMap[r.default_freq] || 1;
      return Math.max(1, days * perDay);  // 总片数
    }
    return 1;  // 注射剂/外用药默认1
  }
  function defaultSingleDose(d) {
    const r = d.dose_range_json||{};
    if (r.single_min_mg!=null) return ((r.single_min_mg+r.single_max_mg)/2)+'mg';
    if (r.single_min_g!=null) return ((r.single_min_g+r.single_max_g)/2)+'g';
    if (r.single_min_ml!=null) return ((r.single_min_ml+r.single_max_ml)/2)+'ml';
    // 没有说明书剂量时，用规格里的剂量
    const s = parseSpec(d.spec);
    if (s.amount && s.unit) return s.amount + s.unit;
    return '';
  }

  // 解析 "1.5g/支" / "0.5g/100ml" / "100ml/袋" → {amount, unit, packUnit}
  function parseSpec(spec) {
    if (!spec) return {amount: 0, unit: '', packUnit: '支'};
    const m = String(spec).match(/([\d.]+)\s*(g|mg|μg|ml|IU|U)\s*\/\s*(\S+)/);
    if (!m) return {amount: 0, unit: '', packUnit: '支'};
    return {amount: parseFloat(m[1]), unit: m[2], packUnit: m[3]};
  }
  // 解析单次剂量 "1.125g" / "500mg" → {amount, unit}
  function parseDose(doseStr) {
    if (!doseStr) return {amount: 0, unit: ''};
    const m = String(doseStr).match(/([\d.]+)\s*(g|mg|μg|ml|IU|U)/);
    if (!m) return {amount: 0, unit: ''};
    return {amount: parseFloat(m[1]), unit: m[2]};
  }
  // 单位换算到 spec 的单位
  function convertUnit(amount, from, to) {
    if (from === to) return amount;
    if (from === 'g' && to === 'mg') return amount * 1000;
    if (from === 'mg' && to === 'g') return amount / 1000;
    if (from === 'mg' && to === 'μg') return amount * 1000;
    if (from === 'μg' && to === 'mg') return amount / 1000;
    return amount;
  }
  // 根据药品规格和单次剂量算数量（支/袋）
  function calcQty(drug, singleDose) {
    const spec = parseSpec(drug.spec);
    const dose = parseDose(singleDose);
    if (!spec.amount || !dose.amount) return '-';
    const doseInSpecUnit = convertUnit(dose.amount, dose.unit, spec.unit);
    let qty = doseInSpecUnit / spec.amount;
    // 数量按整支计算：不足1支按1支，超过1支向上取整
    qty = Math.max(1, Math.ceil(qty));
    return qty + ' ' + spec.packUnit;
  }

  // 根据已选溶媒 + 已加静脉药，自动填充某一组的专项字段说明书标准值
  function autoFillGroup(g) {
    if (!g || !g.solvent) return;
    const V = g.solvent.volume_ml || 100;
    const lastDrug = g.drugs[g.drugs.length - 1];

    g.fields.totalvol = String(V);
    if (!lastDrug) return;

    const r = lastDrug.dose_range_json || {};
    let doseMg = 0;
    if (r.single_min_mg != null) doseMg = (r.single_min_mg + r.single_max_mg) / 2;
    else if (r.single_min_g != null) doseMg = (r.single_min_g + r.single_max_g) / 2 * 1000;

    const speed = lastDrug.drip_speed_max_mlh || 60;
    const hours = Math.round(V / speed * 100) / 100;

    g.fields.speed = String(speed);
    g.fields.hours = String(hours);

    // 自动用主药默认频次覆盖整组
    if (r.default_freq) {
      g.fields.freq = r.default_freq;
      g.drugs.forEach(it => it.frequency = r.default_freq);
    }
  }

  // 生成某组的警示文本
  function groupWarnMsg(g) {
    if (!g || !g.drugs || g.drugs.length === 0) return null;
    for (const d of g.drugs) {
      if (d.is_tcm_injection && g.drugs.length > 1) {
        return { danger: true, msg: '🚫 中药注射剂严禁与其他药物同瓶混合配伍。请删除本组其他药，或为中药注射剂单独新增一组。' };
      }
    }
    const tcm = g.drugs.find(d => d.is_tcm_injection);
    if (tcm) return { danger: false, msg: '⚠️ 中药注射剂须单独输注，禁止与其他药物混合配伍；滴速宜慢，并在有抢救条件的医疗机构使用。' };
    const kcl = g.drugs.find(d => d.generic_name && d.generic_name.indexOf('氯化钾') >= 0);
    if (kcl) return { danger: false, msg: '⚠️ KCl 静脉滴注浓度 ≤0.3%（1000ml 液体中 ≤3g），滴速 ≤20 mmol/h，严禁静脉推注。' };
    const quinolone = g.drugs.find(d => d.pharmacology_class === '喹诺酮类');
    if (quinolone) return { danger: false, msg: '💡 喹诺酮类滴注时间不少于 60 分钟，请确认输注时间已满足。' };
    return null;
  }

  // 渲染所有输液组
  function renderIvGroups() {
    const box = $('iv-groups');
    // 清理空组（没溶霉没药物）
    S.ivGroups = S.ivGroups.filter(g => g.solvent || g.drugs.length > 0);
    box.innerHTML = '';
    const tbl = document.createElement('table');
    tbl.className = 'rx-table';
    tbl.innerHTML = `<thead><tr><th>#</th><th>类型</th><th>通用名</th><th>规格</th><th>单次剂量</th><th>途径</th><th>频次</th><th>数量</th><th>滴速(ml/h)</th><th></th></tr></thead>`;
    const tbody = document.createElement('tbody');
    tbl.appendChild(tbody);

    let seq = 0;  // 全局连续序号
    let groupNo = 0;  // 实际有溶霉的组号（跳过空组）
    S.ivGroups.forEach((g, gi) => {
      if (!g.solvent) return;  // 跳过空组
      groupNo++;
      const groupFreq = (g.drugs[0] && g.drugs[0].frequency) || 'qd';
      if (g.solvent) {
        seq++;
        const tr0 = document.createElement('tr');
        tr0.style.background = '#eff6ff';
        tr0.innerHTML = `<td>${seq}</td><td>🧪溶媒·第${groupNo}组</td><td>${g.solvent.generic_name}</td>
          <td>${g.solvent.spec}</td>
          <td><input class="g-dose" type="text" value="${g.solvent.volume_ml}ml" style="width:90px"></td>
          <td>静滴</td>
          <td><input class="g-freq" type="text" value="${groupFreq}" style="width:60px"></td>
          <td class="g-qty">${calcQty(g.solvent, g.solvent.volume_ml+'ml')}</td>
          <td><input class="g-speed-cell" type="number" value="${g.fields.speed||60}" style="width:70px" min="10" max="200"></td>
          <td><button class="btn btn-danger btn-xs" data-act="del-solvent" title="删除溶媒=删除本组">删</button></td>`;
        tr0.querySelector('.g-dose').onchange = e => {
          let v = e.target.value.trim();
          if (/^[\d.]+$/.test(v)) v = v + 'ml';
          e.target.value = v;
          const m = v.match(/([\d.]+)/);
          if (m) {
            g.solvent.volume_ml = parseFloat(m[1]);
            g.fields.totalvol = String(g.solvent.volume_ml);
            tr0.querySelector('.g-qty').textContent = calcQty(g.solvent, v);
          }
        };
        tr0.querySelector('.g-speed-cell').oninput = e => { g.fields.speed = e.target.value; };
        tr0.querySelector('.g-freq').onchange = e => {
          g.drugs.forEach(it => it.frequency = e.target.value);
        };
        // 删溶媒 = 删整组
        tr0.querySelector('[data-act="del-solvent"]').onclick = () => {
          S.ivGroups.splice(S.ivGroups.indexOf(g), 1);
          renderIvGroups(); renderIvDrugList();
        };
        tbody.appendChild(tr0);
      }
      g.drugs.forEach((it) => {
        seq++;
        const tr = document.createElement('tr');
        const qty = calcQty(it.drug, it.single_dose);
        tr.innerHTML = `<td>${seq}</td><td>💉药物·第${groupNo}组</td>
          <td>${it.drug.generic_name}${it.drug.is_tcm_injection?' <span class="chip chip-abx-special">中药注射剂</span>':''}</td>
          <td>${it.drug.spec}</td>
          <td><input class="g-dose" type="text" value="${it.single_dose}" style="width:90px"></td>
          <td>静滴</td>
          <td style="color:#999">↧</td>
          <td class="g-qty">${qty}</td>
          <td style="color:#999">↧</td>
          <td><button class="btn btn-danger btn-xs" data-act="del-drug">删</button></td>`;
        tr.querySelector('.g-dose').onchange = e => {
          let v = e.target.value.trim();
          if (/^[\d.]+$/.test(v)) {
            const s = parseSpec(it.drug.spec);
            if (s.unit) v = v + s.unit;
            e.target.value = v;
          }
          it.single_dose = v;
          tr.querySelector('.g-qty').textContent = calcQty(it.drug, v);
        };
        tr.querySelector('[data-act="del-drug"]').onclick = () => {
          g.drugs.splice(g.drugs.indexOf(it), 1);
          autoFillGroup(g);
          renderIvGroups(); renderIvDrugList();
        };
        tbody.appendChild(tr);
      });
    });

    box.appendChild(tbl);

    // 警示条
    S.ivGroups.forEach(g => {
      const warn = groupWarnMsg(g);
      if (warn) {
        const w = document.createElement('div');
        w.className = 'iv-warn' + (warn.danger ? ' danger' : '');
        w.textContent = warn.msg;
        box.appendChild(w);
      }
    });
    updateCount();
    updatePreReminder();
  }

  function renderNormalItems() {
    const tb = $('normal-items');
    tb.innerHTML = '';
    S.normalItems.forEach((it, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${i+1}</td><td>${it.drug.generic_name}</td><td>${it.drug.spec}</td>
        <td><input class="n-qty" type="number" value="${it.quantity}" style="width:60px;min-width:50px"></td>
        <td><input class="n-dose" type="text" value="${it.single_dose}" style="width:90px"></td>
        <td>${routeZh(it.route)}</td>
        <td><input class="n-freq" type="text" value="${it.frequency}" style="width:60px"></td>
        <td><input class="n-days" type="number" value="${it.duration_days}" style="width:60px">天</td>
        <td><button class="btn btn-danger btn-xs" data-i="${i}">删</button></td>`;
      // 单次剂量：只输数字自动补单位
      tr.querySelector('.n-dose').onchange = e => {
        let v = e.target.value.trim();
        if (/^[\d.]+$/.test(v)) {
          const s = parseSpec(it.drug.spec);
          if (s.unit) v = v + s.unit;
          e.target.value = v;
        }
        it.single_dose = v;
      };
      tr.querySelector('.n-qty').onchange = e => { it.quantity = parseInt(e.target.value)||1; updateAmount(); };
      tr.querySelector('.n-freq').onchange = e => { it.frequency = e.target.value; updateAmount(); };
      tr.querySelector('.n-days').onchange = e => { it.duration_days = parseInt(e.target.value)||1; updateAmount(); };
      tr.querySelector('button').onclick = () => { S.normalItems.splice(i,1); renderNormalItems(); renderDrugList(); };
      tb.appendChild(tr);
    });
    updateCount();
    updatePreReminder();
  }
  function routeZh(r) { return {oral:'口服',topical:'外用',im:'肌注',sc:'皮下',iv_drip:'静滴'}[r]||r; }

  function updateCount() {
    const n = S.normalItems.length;
    const el = $('drug-count');
    el.textContent = `已用 ${n} 种` + (n>5 ? '（超5种）' : '');
    el.classList.toggle('full', n>5);
    // 输液：所有组的溶媒 + 药总数
    const ivn = S.ivGroups.reduce((sum, g) => sum + (g.solvent?1:0) + g.drugs.length, 0);
    const ivEl = $('iv-drug-count');
    if (ivEl) {
      ivEl.textContent = `已用 ${ivn} 种（${S.ivGroups.length} 组）` + (ivn>5 ? '（超5种）' : '');
      ivEl.classList.toggle('full', ivn>5);
    }
    updateAmount();
  }

  // 计算金额合计、医保支付、个人自付
  function updateAmount() {
    let total = 0;
    // 口服药：单价 × 数量（片/粒/支）
    S.normalItems.forEach(it => {
      const price = Number(it.drug.price_yuan) || 0;
      const qty = Number(it.quantity) || 1;
      total += price * qty;
    });
    // 静脉药：单价 × 每次用量 × 每日次数 × 天数
    S.ivGroups.forEach(g => {
      if (g.solvent) {
        total += Number(g.solvent.price_yuan) || 0;  // 溶媒每袋一次
      }
      g.drugs.forEach(it => {
        const price = Number(it.drug.price_yuan) || 0;
        const days = Number(it.duration_days) || 1;
        const freqPerDay = ({'qd':1,'bid':2,'tid':3,'qid':4,'q8h':3,'q12h':2,'qn':1,'st':1,'prn':1})[it.frequency] || 1;
        const qty = parseQty(it);
        total += price * qty * freqPerDay * days;
      });
    });
    total = Math.round(total * 100) / 100;
    // 医保：甲类 100% 报销，乙类 80%，丙类 0%（简化）
    // 自费患者不享受医保统筹
    const isSelfPay = S.patient && S.patient.feeType === '自费';
    let miPay = 0;
    if (!isSelfPay) {
    S.normalItems.forEach(it => {
      const price = Number(it.drug.price_yuan) || 0;
      const qty = Number(it.quantity) || 1;
      const sub = price * qty;
      if (it.drug.medical_insurance_class === '甲') miPay += sub;
      else if (it.drug.medical_insurance_class === '乙') miPay += sub * 0.8;
    });
    S.ivGroups.forEach(g => {
      if (g.solvent) {
        const sub = Number(g.solvent.price_yuan) || 0;
        if (g.solvent.medical_insurance_class === '甲') miPay += sub;
        else if (g.solvent.medical_insurance_class === '乙') miPay += sub * 0.8;
      }
      g.drugs.forEach(it => {
        const price = Number(it.drug.price_yuan) || 0;
        const days = Number(it.duration_days) || 1;
        const freqPerDay = ({'qd':1,'bid':2,'tid':3,'qid':4,'q8h':3,'q12h':2,'qn':1,'st':1,'prn':1})[it.frequency] || 1;
        const qty = parseQty(it);
        const sub = price * qty * freqPerDay * days;
        if (it.drug.medical_insurance_class === '甲') miPay += sub;
        else if (it.drug.medical_insurance_class === '乙') miPay += sub * 0.8;
      });
    });
    }
    miPay = Math.round(miPay * 100) / 100;
    const selfPay = Math.max(0, Math.round((total - miPay) * 100) / 100);
    $('f-amount').textContent = total.toFixed(2);
    $('f-ins').textContent = miPay.toFixed(2);
    $('f-self').textContent = selfPay.toFixed(2);
  }

  // 云南医保事前提醒
  function updatePreReminder() {
    // 根据当前通道选提醒容器
    const ivVisible = !$('rx-body-iv').classList.contains('hidden');
    const box = ivVisible ? $('pre-reminder') : $('pre-reminder-normal');
    if (!box) return;
    const msgs = [];
    const age = S.patient.age || 30;
    const isPeds = age < 14;

    // 收集所有药
    const allDrugs = [];
    S.normalItems.forEach(it => allDrugs.push(it.drug));
    S.ivGroups.forEach(g => {
      if (g.solvent) allDrugs.push(g.solvent);
      g.drugs.forEach(it => allDrugs.push(it.drug));
    });

    // 1. 特殊使用级抗菌药
    const special = allDrugs.filter(d => d.abx_level === 'special');
    if (special.length > 0) {
      msgs.push({type:'danger', icon:'🚫', text:`<b>越级抗菌药物提醒：</b>您开具了 ${special.map(d=>d.generic_name).join('、')}（特殊使用级）。根据《抗菌药物临床应用管理办法》，需经抗菌药物管理工作组指定专业技术人员会诊同意，由具有处方权的高级职称医师开具。`});
    }
    // 2. 限制使用级
    const restricted = allDrugs.filter(d => d.abx_level === 'restricted');
    if (restricted.length > 0) {
      msgs.push({type:'warn', icon:'⚠️', text:`<b>限制级抗菌药物：</b>${restricted.map(d=>d.generic_name).join('、')} 为限制使用级，需主治医师及以上职称开具，请确认处方权限。`});
    }
    // 3. 中药注射剂
    const tcm = allDrugs.filter(d => d.is_tcm_injection);
    if (tcm.length > 0) {
      msgs.push({type:'warn', icon:'💉', text:`<b>中药注射剂安全提醒：</b>${tcm.map(d=>d.generic_name).join('、')} 须单独输注，严禁与其他药物混合配伍；滴速宜慢，用药期间加强监护。`});
    }
    // 4. 儿童禁忌
    if (isPeds) {
      const quinolone = allDrugs.find(d => d.pharmacology_class === '喹诺酮类' || /左氧|环丙|莫西/.test(d.generic_name));
      if (quinolone) msgs.push({type:'danger', icon:'👶', text:`<b>儿童用药禁忌：</b>${quinolone.generic_name} 为喹诺酮类抗菌药，18岁以下未成年人禁用（可致软骨损害）。`});
      const tet = allDrugs.find(d => /四环素|多西环素/.test(d.generic_name));
      if (tet) msgs.push({type:'danger', icon:'👶', text:`<b>儿童用药禁忌：</b>${tet.generic_name} 为四环素类，8岁以下儿童禁用（可致牙齿黄染/牙釉质发育不良）。`});
    }
    // 5. 丙类（全自费）
    const selfPay = allDrugs.filter(d => d.medical_insurance_class === '丙');
    if (selfPay.length > 0) {
      msgs.push({type:'info', icon:'💰', text:`<b>全自费药品：</b>${selfPay.map(d=>d.generic_name).join('、')} 为医保丙类，全部费用由个人承担。`});
    }
    // 6. 门诊天数提醒
    msgs.push({type:'info', icon:'📅', text:`<b>处方天数提醒：</b>普通门诊一般不得超过 7 日用量；急诊不得超过 3 日；高血压、糖尿病等慢性病最长不超过 14 日。`});
    // 7. 配伍提醒
    const hasKCl = allDrugs.find(d => /氯化钾/.test(d.generic_name));
    if (hasKCl) {
      msgs.push({type:'warn', icon:'🧪', text:`<b>氯化钾使用提醒：</b>静脉滴注浓度 ≤0.3%，速度 ≤20 mmol/h，严禁静脉推注，见尿补钾。`});
    }

    box.innerHTML = msgs.map(m => `<div class="pre-reminder-item ${m.type}"><span class="pr-icon">${m.icon}</span><span>${m.text}</span></div>`).join('');
  }
  // 从 it.single_dose 算数量支数（复用 calcQty 的数字部分）
  function parseQty(it) {
    const spec = parseSpec(it.drug.spec);
    const dose = parseDose(it.single_dose);
    if (!spec.amount || !dose.amount) return 1;
    const doseInSpec = convertUnit(dose.amount, dose.unit, spec.unit);
    return Math.max(1, Math.ceil(doseInSpec / spec.amount));
  }

  // ---------- 输液通道 ----------

  function renderIvDrugList() {
    const kw = $('iv-drug-search').value.trim();
    const list = $('iv-drug-list');
    list.innerHTML = '';
    const g = activeGroup();
    const hasSolvent = !!(g && g.solvent);
    const pool = S.drugs.filter(d => d.dosage_form==='iv_drip' || d.dosage_form==='solvent');
    const items = pool.filter(d => matchDrug(d, kw));
    S.kbIvItems = items;
    S.kbIvDisabled = items.map(d => {
      const isSolvent = d.dosage_form === 'solvent';
      // 溶媒永远可点（点了自动开新组）；静脉药必须先有溶媒
      return (!isSolvent && !hasSolvent);
    });
    S.kbIvSel = items.length ? (S.kbIvDisabled[0] ? -1 : 0) : -1;
    items.forEach((d, i) => {
      const isSolvent = d.dosage_form === 'solvent';
      const disabled = S.kbIvDisabled[i];
      const div = document.createElement('div');
      div.className = 'drug-item' + (disabled?' disabled':'') + (i === S.kbIvSel ? ' kb-highlight' : '');
      div.dataset.kbIndex = i;
      div.innerHTML = `<div><b>${d.generic_name}</b> <span class="meta">${d.spec} · ¥${Number(d.price_yuan||0).toFixed(1)}/${d.unit||'支'}</span>
        <div class="mfr" style="font-size:11px;color:#94a3b8">🏭 ${d.manufacturer||'国产'}</div>
        ${isSolvent ? '<span class="chip" style="background:#7f8c8d;color:#fff">溶媒</span>' : ''}
        ${abxChip(d.abx_level)}
        ${controlledChip(d)}
        ${d.is_tcm_injection?'<span class="chip chip-abx-special">中药注射剂</span>':''}
        ${miChip(d)}
        </div>
        <button class="btn" ${disabled?'disabled':''}>+ 添加</button>`;
      div.querySelector('button').onclick = () => {
        if (disabled) return alert('请先在药品列表里选一个溶媒（NS/GS等）！');
        addIvDrug(d);
      };
      list.appendChild(div);
    });
    updateCount();
  }

  function addIvDrug(drug) {
    // 加溶媒：如果当前组已有溶媒，自动开新组；如果还没组，先建一个
    if (drug.dosage_form === 'solvent') {
      let g = activeGroup();
      if (!g || g.solvent) {
        g = { solvent: null, drugs: [], fields: emptyGroupFields() };
        S.ivGroups.push(g);
      }
      g.solvent = drug;
      g.fields = emptyGroupFields();
      autoFillGroup(g);
      renderIvGroups(); renderIvDrugList();
      const s = $('iv-drug-search'); if (s) { s.value=''; s.focus(); }
      return;
    }
    // 静脉药
    let g = activeGroup();
    if (!g || !g.solvent) {
      return alert('请先在药品列表里选一个溶媒（NS/GS等）！');
    }
    const totalItems = S.ivGroups.reduce((n, gr) => n + (gr.solvent?1:0) + gr.drugs.length, 0);
    if (totalItems >= 5 && !S.ivOverLimitWarned) {
      S.ivOverLimitWarned = true;
      alert(`⚠️ 超限提醒：每张处方一般不超过5种药品（含溶媒，当前已 ${totalItems} 种）。\n\n后续可继续添加，系统将自动标记超限。`);
    }
    if (drug.abx_level === 'special') {
      $('modal-block-text').textContent =
        `「${drug.generic_name}」为特殊使用级抗菌药（special）。\n\n依据：《抗菌药物临床应用分级管理目录（2024版）》——特殊使用级抗菌药不得在门诊使用。本处方应删除。`;
      $('modal-block').classList.remove('hidden');
      return;
    }
    if (drug.abx_level === 'restricted' && !S.restrictedConfirmed) {
      $('modal-restricted-text').textContent =
        `「${drug.generic_name}」为限制使用级抗菌药（restricted）。\n模拟：是否由中级以上职称确认？`;
      $('modal-restricted').classList.remove('hidden');
      $('btn-restricted-ok').onclick = () => {
        S.restrictedConfirmed = true;
        $('modal-restricted').classList.add('hidden');
        pushIvDrug(drug);
      };
      $('btn-restricted-cancel').onclick = () => $('modal-restricted').classList.add('hidden');
      return;
    }
    pushIvDrug(drug);
  }
  function pushIvDrug(drug) {
    const g = activeGroup();
    g.drugs.push({
      drug,
      single_dose: defaultSingleDose(drug),
      frequency: (drug.dose_range_json||{}).default_freq || 'qd',
      duration_days: (drug.dose_range_json||{}).default_duration_days || 1
    });
    autoFillGroup(g);
    renderIvGroups(); renderIvDrugList();
    const s = $('iv-drug-search'); if (s) { s.value=''; s.focus(); }
    // 事中提醒
    midProcessAlert(drug);
  }

  // ---------- 提交 ----------
  function submitRx() {
    try {
    // 硬阻断：每组必须有溶媒+药（学生选了输液通道即视为有指征，不再强制填 iv_reason）
    if (S.rxType === 'iv') {
      const groupsOk = S.ivGroups.every(g => g.solvent && g.drugs.length > 0);
      if (!groupsOk) return alert('每组都必须选择溶媒并至少加入一个药！');
    }

    // 构造 visit_ctx
    const visitId = 'V-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + String(Math.floor(Math.random()*900000+100000));

    // 多组输液：扁平化为 items（兼容旧规则引擎），同时保留 groups 详情
    let ivCtx = null;
    if (S.rxType === 'iv') {
      const flatItems = [];
      const groupDetails = S.ivGroups.map((g, gi) => {
        flatItems.push({ drug: g.solvent, quantity: 1, single_dose: g.solvent.volume_ml+'ml', frequency: 'st', duration_days: 1, route: 'iv_drip', group: gi+1 });
        g.drugs.forEach(it => flatItems.push({ drug: it.drug, single_dose: it.single_dose, frequency: it.frequency, duration_days: it.duration_days, route: 'iv_drip', group: gi+1 }));
        return {
          group_no: gi+1,
          solvent_name: g.solvent.generic_name + ' ' + g.solvent.spec,
          solvent_volume_ml: g.solvent.volume_ml,
          drugs: g.drugs.map(it => it.drug.generic_name),
          final_concentration: g.fields.conc,
          drip_speed_mlh: g.fields.speed,
          total_volume_ml: g.fields.totalvol,
          infusion_hours: g.fields.hours,
          skin_test_required: false,
          skin_test_result: 'not_required'
        };
      });
      const first = groupDetails[0];
      ivCtx = {
        rx_id: $('rx-no').textContent,
        items: flatItems,
        groups: groupDetails,
        group_count: groupDetails.length,
        iv_reason: 'student_selected_iv',
        iv_reason_note: '学生主动选择输液通道',
        solvent_name: first ? first.solvent_name : '',
        solvent_spec: first ? first.solvent_name.split(' ').pop() : '',
        final_concentration: first ? first.final_concentration : '',
        drip_speed_mlh: first ? first.drip_speed_mlh : '',
        total_volume_ml: first ? first.total_volume_ml : '',
        infusion_hours: first ? first.infusion_hours : '',
        skin_test_required: first ? first.skin_test_required : false,
        skin_test_result: first ? first.skin_test_result : 'not_required',
        duration_days: flatItems.length ? (S.ivGroups[S.ivGroups.length-1].drugs[0]||{}).duration_days : 1
      };
    }

    const normalCtx = S.rxType === 'normal' ? {
      rx_id: $('rx-no').textContent,
      items: S.normalItems,
      duration_days: S.normalItems.length ? S.normalItems[0].duration_days : 7
    } : (S.rxType === 'iv' ? { rx_id: 'NORMAL-PLACEHOLDER', items: [], duration_days: 0 } : null);

    const ctx = {
      disease: S.disease,
      patient: S.patient,
      normal_rx: normalCtx,
      iv_rx: ivCtx,
      rulesMeta: S.rules,
      compatData: S.compat,
      restricted_confirmed: S.restrictedConfirmed
    };
    S.lastVisitCtx = ctx;
    const hits = window.RxRuleEngine.run(ctx);
    const review = window.Reviewer.score(hits);
    S.lastReview = review;
    renderReport(review, hits, ctx);

    // 写历史
    saveHistory(review);
    saveMistakes(review, ctx);
    show('view-report');
    } catch(e) {
      console.error(e);
      alert('❌ 处方提交出错：\n' + e.message + '\n\n' + e.stack);
    }
  }

  function renderReport(review, hits, ctx) {
    ctx = ctx || {};
    ctx.disease = ctx.disease || { name: '未知', icd10: '' };
    ctx.patient = ctx.patient || { name: '未知', gender: '', age: 0 };
    review = review || { total: 0, dims: {} };
    hits = Array.isArray(hits) ? hits.filter(Boolean) : [];
    $('r-score').textContent = review.total;
    // 圆环动画
    const arc = $('score-arc');
    if (arc) {
      const C = 326.7;
      arc.style.strokeDashoffset = C * (1 - review.total/100);
      arc.style.stroke = review.total >= 80 ? '#16a34a' : review.total >= 60 ? '#f59e0b' : '#dc2626';
    }
    // 评级
    const grade = $('r-grade');
    if (grade) grade.textContent = review.total >= 90 ? '优秀 · 可独立接诊' : review.total >= 75 ? '良好 · 基本掌握' : review.total >= 60 ? '及格 · 需加强' : '不合格 · 重新学习';
    $('r-meta').textContent =
      `诊断：${ctx.disease.name}（${ctx.disease.icd10}） · 患者：${ctx.patient.name} ${ctx.patient.gender} ${ctx.patient.age}岁`;

    // 卡通患者生命体征（根据评分动态变化）
    const errCount = hits.filter(h=>h.severity==='error').length;
    const warnCount = hits.filter(h=>h.severity==='warn').length;
    const score = review.total;
    // 心率：基础75，错误越多越快
    const hr = Math.round(75 + errCount * 4 + warnCount * 1.5);
    // 体温：基础36.8，错误越多越高
    const temp = (36.8 + errCount * 0.15 + warnCount * 0.05).toFixed(1);
    // 血压：基础110/70，错误越多越高
    const sbp = Math.round(110 + errCount * 3 + warnCount);
    const dbp = Math.round(70 + errCount * 1.5);
    $('vital-hr').textContent = hr + ' bpm';
    $('vital-temp').textContent = temp + ' ℃';
    $('vital-bp').textContent = sbp + '/' + dbp + ' mmHg';
    // 表情：切换护士图片
    const nurseImg = $('nurse-face');
    if (nurseImg) {
      if (score >= 75) {
        nurseImg.src = 'img/nurse-happy.png';
      } else {
        nurseImg.src = 'img/nurse-sad.png';
      }
    }

    // 维度卡片
    const grid = $('dim-grid');
    grid.innerHTML = '';
    Object.values(review.dims).forEach(d => {
      const div = document.createElement('div');
      div.className = 'dim-card ' + d.verdict;
      div.innerHTML = `<div class="dim-name">${d.name}（${d.weight}%）</div>
        <div class="dim-score">${d.score.toFixed(1)} / ${d.weight}</div>
        <div class="muted">命中 ${d.hits.length} 条</div>`;
      grid.appendChild(div);
    });

    // 命中统计
    const errN = hits.filter(h=>h.severity==='error').length;
    const warnN = hits.filter(h=>h.severity==='warn').length;
    const passN = hits.filter(h=>h.severity==='pass').length;
    const cE = $('cnt-err'); if (cE) cE.textContent = errN;
    const cW = $('cnt-warn'); if (cW) cW.textContent = warnN;
    const cP = $('cnt-pass'); if (cP) cP.textContent = passN;

    // 命中列表
    const hl = $('hit-list');
    hl.innerHTML = '';
    hits.filter(h=>h.severity!=='pass').forEach(h => {
      const div = document.createElement('div');
      div.className = 'hit-item ' + h.severity;
      div.innerHTML = `<span class="rule-id">[${h.rule_id}]</span><b>${h.title}</b>
        <div>${h.message}</div>
        <div class="basis">📖 依据：${h.basis}</div>
        ${h.suggestion?`<div class="sug">💡 建议：${h.suggestion}</div>`:''}`;
      hl.appendChild(div);
    });
    if (errN===0 && warnN===0) {
      hl.innerHTML = '<div style="text-align:center;padding:20px;color:#16a34a">✅ 未发现错误和警告，处方规范！</div>';
    }

    // 与参考处方差异
    const dx = ctx.disease;
    const chosen = [...(ctx.normal_rx?.items||[]), ...(ctx.iv_rx?.items||[])].map(i=>i.drug.generic_name);
    const ref = ctx.iv_rx ? (dx.second_line_iv||[]) : (dx.first_line_oral||[]);
    $('diff-box').innerHTML =
      `<div>📚 参考方案（${ctx.iv_rx?'二线静脉':'一线口服'}）：<b>${ref.join('、') || '无（对症支持）'}</b></div>
       <div>你开了：<b>${chosen.join('、') || '（空）'}</b></div>
       <div class="muted" style="margin-top:6px">💡 教学要点：${dx.special_population_note || (dx.contraindications||[]).join('；') || '无特殊。'}</div>`;

    // 知识点卡片
    const tips = new Set();
    hits.filter(h=>h.rule_id && h.rule_id.startsWith('IV-')).forEach(h=>tips.add(h.title));
    if (hits.some(h=>h.rule_id==='ABX-01'||h.rule_id==='ABX-02')) tips.add('抗菌药物分级：non_restricted / restricted / special');
    $('tips-box').innerHTML = tips.size
      ? [...tips].map(t=>`<div>• ${t}</div>`).join('')
      : '<div>本次处方无特别知识点，请再接再厉。</div>';
  }

  // ---------- 历史 & 雷达 ----------
  function saveHistory(review) {
    const arr = JSON.parse(localStorage.getItem('rx-profile-history')||'[]');
    const radar = window.Reviewer.mapReviewToRadar(review);
    arr.unshift({ t: Date.now(), total: review.total, radar });
    localStorage.setItem('rx-profile-history', JSON.stringify(arr.slice(0,20)));
  }

  function renderRadar() {
    const arr = JSON.parse(localStorage.getItem('rx-profile-history')||'[]');
    // 历史列表
    const hl = $('history-list');
    hl.innerHTML = arr.length ? arr.map(h=>
      `<div class="history-item">${new Date(h.t).toLocaleString()} · 总分 <b>${h.total}</b></div>`
    ).join('') : '<div class="muted">暂无历史。完成至少一次处方后将在此显示。</div>';

    // 平均八维
    const avg = {format:0,match:0,dose:0,route:0,compat:0,special:0,ess:0,abx:0};
    if (arr.length) arr.forEach(h=>{ Object.keys(avg).forEach(k=>avg[k]+= (h.radar?.[k]||0)); });
    if (arr.length) Object.keys(avg).forEach(k=>avg[k]/=arr.length);
    else Object.keys(avg).forEach(k=>avg[k]=50);

    drawRadar(avg);
    // legend
    const legend = $('radar-legend');
    legend.innerHTML = window.Reviewer.RADAR_DIMS.map(d=>{
      const v = Math.round(avg[d.key]);
      return `<div>${d.name} <span class="bar" style="width:${v}px">${v}</span></div>`;
    }).join('');
  }

  function drawRadar(avg) {
    const cv = $('radar-canvas');
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height, cx = W/2, cy = H/2, R = 180;
    ctx.clearRect(0,0,W,H);
    const dims = window.Reviewer.RADAR_DIMS;
    const n = dims.length;
    const angle = i => -Math.PI/2 + i*2*Math.PI/n;

    // 网格
    for (let g=1; g<=4; g++) {
      ctx.beginPath();
      for (let i=0;i<=n;i++) {
        const a = angle(i%n);
        const r = R*g/4;
        const x = cx + r*Math.cos(a), y = cy + r*Math.sin(a);
        i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
      }
      ctx.strokeStyle = '#d8e0ea'; ctx.stroke();
    }
    // 轴线
    for (let i=0;i<n;i++) {
      const a = angle(i);
      ctx.beginPath(); ctx.moveTo(cx,cy);
      ctx.lineTo(cx+R*Math.cos(a), cy+R*Math.sin(a));
      ctx.strokeStyle = '#c8d2e0'; ctx.stroke();
      // label
      const lx = cx + (R+24)*Math.cos(a), ly = cy + (R+24)*Math.sin(a);
      ctx.fillStyle = '#334'; ctx.font = '12px sans-serif'; ctx.textAlign='center';
      ctx.fillText(dims[i].name, lx, ly);
    }
    // 数据多边形
    ctx.beginPath();
    dims.forEach((d,i)=>{
      const a = angle(i);
      const v = Math.max(0, Math.min(100, avg[d.key]))/100;
      const x = cx + R*v*Math.cos(a), y = cy + R*v*Math.sin(a);
      i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(26,111,181,.25)'; ctx.fill();
    ctx.strokeStyle = '#1a6fb5'; ctx.lineWidth = 2; ctx.stroke();
    // 顶点
    dims.forEach((d,i)=>{
      const a = angle(i);
      const v = Math.max(0, Math.min(100, avg[d.key]))/100;
      ctx.beginPath();
      ctx.arc(cx+R*v*Math.cos(a), cy+R*v*Math.sin(a), 4, 0, Math.PI*2);
      ctx.fillStyle = '#1a6fb5'; ctx.fill();
    });
  }

  // 暴露到全局供 inline onclick 调用
  window.__openRx = openRx;
  window.__newCase = newCase;
  window.__checkDiag = checkDiagnosis;

  // ====================== 新增功能：错题本 ======================
  function saveMistakes(review, ctx) {
    if (!review || !review.hits) return;
    const errors = review.hits.filter(h => h.severity === 'error');
    const warns = review.hits.filter(h => h.severity === 'warn');
    if (errors.length === 0 && warns.length === 0) return;

    const arr = JSON.parse(localStorage.getItem('rx-mistakes')||'[]');
    const entry = {
      t: Date.now(),
      disease: ctx.disease ? ctx.disease.name : '未知',
      disease_code: ctx.disease ? ctx.disease.code : '',
      score: review.total,
      errors: errors.map(e => ({rule_id: e.rule_id, title: e.title, message: e.message, suggestion: e.suggestion, basis: e.basis})),
      warns: warns.map(w => ({rule_id: w.rule_id, title: w.title, message: w.message, suggestion: w.suggestion}))
    };
    arr.unshift(entry);
    localStorage.setItem('rx-mistakes', JSON.stringify(arr.slice(0, 100))); // 最多存100条
  }

  function renderMistakes() {
    const arr = JSON.parse(localStorage.getItem('rx-mistakes')||'[]');
    const box = $('mistakes-list');
    if (arr.length === 0) {
      box.innerHTML = '<p class="muted center">暂无错题，继续保持！🎉</p>';
      return;
    }
    box.innerHTML = arr.map((m, i) => `
      <div class="mistake-card">
        <div class="mistake-head">
          <span class="tag tag-diff">${m.disease}</span>
          <span class="muted">${new Date(m.t).toLocaleString()}</span>
          <span class="score-badge ${m.score >= 80 ? 'good' : m.score >= 60 ? 'mid' : 'bad'}">${m.score}分</span>
        </div>
        ${m.errors.length ? `<div class="mistake-errors">
          <h4>❌ 错误（${m.errors.length}）</h4>
          ${m.errors.map(e => `<div class="mistake-item error">
            <b>[${e.rule_id}]</b> ${e.title}<br>
            <span class="muted">${e.message}</span><br>
            <span class="sug">💡 ${e.suggestion || '掌握相关知识点'}</span>
          </div>`).join('')}
        </div>` : ''}
        ${m.warns.length ? `<div class="mistake-warns">
          <h4>⚠️ 警告（${m.warns.length}）</h4>
          ${m.warns.map(w => `<div class="mistake-item warn">
            <b>[${w.rule_id}]</b> ${w.title}<br>
            <span class="muted">${w.message}</span>
          </div>`).join('')}
        </div>` : ''}
      </div>
    `).join('');
  }

  // ====================== 新增功能：学习统计 ======================
  function renderStats() {
    const history = JSON.parse(localStorage.getItem('rx-profile-history')||'[]');
    const mistakes = JSON.parse(localStorage.getItem('rx-mistakes')||'[]');

    // 基础统计
    const total = history.length;
    $('stat-total').textContent = total;
    if (total > 0) {
      const scores = history.map(h => h.total);
      const avg = Math.round(scores.reduce((a,b)=>a+b,0) / total);
      const best = Math.max(...scores);
      const passCount = scores.filter(s => s >= 60).length;
      $('stat-avg').textContent = avg;
      $('stat-best').textContent = best;
      $('stat-pass-rate').textContent = Math.round(passCount/total*100) + '%';
    } else {
      $('stat-avg').textContent = '--';
      $('stat-best').textContent = '--';
      $('stat-pass-rate').textContent = '--';
    }

    // 得分趋势（最近10次）
    const trendBox = $('score-trend');
    if (total > 0) {
      const recent = history.slice(0, 10).reverse();
      const maxScore = 100;
      const barH = 120;
      trendBox.innerHTML = `<div class="trend-chart">
        ${recent.map((h, i) => `
          <div class="trend-bar-wrap">
            <div class="trend-bar" style="height:${(h.total/maxScore*barH)}px" title="${h.total}分"></div>
            <div class="trend-label">${h.total}</div>
          </div>
        `).join('')}
      </div>`;
    } else {
      trendBox.innerHTML = '<p class="muted">暂无数据</p>';
    }

    // 疾病类型分布
    const distBox = $('disease-dist');
    if (mistakes.length > 0) {
      const dist = {};
      mistakes.forEach(m => {
        dist[m.disease] = (dist[m.disease] || 0) + 1;
      });
      const sorted = Object.entries(dist).sort((a,b) => b[1]-a[1]).slice(0, 10);
      distBox.innerHTML = sorted.map(([name, count]) => `
        <div class="dist-row">
          <span class="dist-name">${name}</span>
          <div class="dist-bar-wrap"><div class="dist-bar" style="width:${count/Math.max(...sorted.map(s=>s[1]))*100}%"></div></div>
          <span class="dist-count">${count}次</span>
        </div>
      `).join('');
    } else {
      distBox.innerHTML = '<p class="muted">暂无错题数据</p>';
    }
  }

  boot();
})();
