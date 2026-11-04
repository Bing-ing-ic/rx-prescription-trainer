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
    secondaryDiagnosis: '',  // 次要诊断/合并症
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
    ['view-home','view-rx','view-report','view-radar','view-mistakes','view-stats','view-drugs'].forEach(v => $(v).classList.add('hidden'));
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
      b.onclick = async () => {
        const t = b.getAttribute('data-goto');
        if (t === 'home') show('view-home');
        else if (t === 'drugs') { await renderDrugLib(); show('view-drugs'); }
        else if (t === 'radar') { renderRadar(); show('view-radar'); }
        else if (t === 'mistakes') { renderMistakes(); show('view-mistakes'); }
        else if (t === 'stats') { renderStats(); show('view-stats'); }
      };
    });
    $('btn-new-case').onclick = newCase;
    $('btn-diag-check').onclick = checkDiagnosis;
    $('diag-input').oninput = onDiagInput;
    $('diag-input').onkeydown = onDiagKey;
    $('secondary-diag-input').oninput = onSecondaryDiagInput;
    $('secondary-diag-input').onkeydown = onSecondaryDiagKey;
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

  // 从疾病生命体征区间（如 "38.5-39.2"、"95-110"、"110-120/70"）抽取本次病例的真实值
  function vitalsFromRange(v) {
    if (!v) return { hr: 75, temp: '36.8', bp: '120/80', spo2: '98' };
    const pickNum = (s, dft) => {
      const m = String(s == null ? '' : s).match(/[\d.]+(?:\s*[-~]\s*[\d.]+)?/);
      if (!m) return dft;
      const parts = m[0].split(/[-~]/).map(Number);
      if (parts.length === 2 && parts[1] > parts[0]) {
        return Math.round((parts[0] + Math.random() * (parts[1] - parts[0])) * 10) / 10;
      }
      return parts[0] || dft;
    };
    const hr = Math.round(pickNum(v.hr, 75));
    const temp = pickNum(v.temp, 36.8).toFixed(1);
    let bpStr = String(v.bp || '120/80');
    const slash = bpStr.split('/');
    const sbp = Math.round(pickNum(slash[0], 120));
    const dbp = Math.round(pickNum(slash[1], 80));
    return { hr, temp, bp: sbp + '/' + dbp, spo2: v.spo2 || '98' };
  }

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

    // 生成合成患者：年龄/性别/费别根据疾病匹配
    const elderlyDiseases = ['HTN-I10','CHD-I25','TIA-G45','COPD-J44','DM-E11','HYPOTHY-E03','POSTAPP-Z48','POSTHERNIA-Z48','HLP-E78','OP-M81','ISCHEMIC-I63','HF-I50','AF-I48','BPH-N40'];
    const childOkDiseases = ['URI-J00','AB-BRONCH-J20','CAP-J18','AGE-A09','GASTRITIS-K29','FD-K30','MP-J15','CBRONCH-J20'];
    const code = S.disease.code;
    const isPedDisease = code.endsWith('-PED') || (S.disease.name||'').indexOf('小儿')===0;
    let age;
    if (isPedDisease) {
      // 明确儿科病例（如小儿感冒/小儿腹泻）：3-11 岁
      age = Math.floor(Math.random()*9+3);
    } else if (elderlyDiseases.includes(code)) {
      // 老年慢性病：60-80 岁
      age = Math.floor(Math.random()*21+60);
    } else if (childOkDiseases.includes(code) && Math.random() < 0.3) {
      // 儿童常见病散发病例：4-12 岁
      age = Math.floor(Math.random()*9+4);
    } else {
      // 普通成人：18-65 岁
      age = Math.floor(Math.random()*48+18);
    }
    const gender = Math.random()<0.5 ? '男' : '女';
    let weight;
    if (age < 14) weight = Math.round((5 + age*2.5) * 10)/10;
    else weight = Math.round((50 + Math.random()*25) * 10)/10;
    // 费别与人群匹配：儿童多为居民医保，老年慢病多为职工医保
    let feeType;
    if (age < 14) feeType = Math.random()<0.8 ? '城乡居民医保' : '自费';
    else if (elderlyDiseases.includes(code)) feeType = Math.random()<0.7 ? '城镇职工医保' : '城乡居民医保';
    else feeType = ['城镇职工医保','城乡居民医保','自费'][Math.floor(Math.random()*3)];
    const name = SURNAMES[Math.floor(Math.random()*SURNAMES.length)] + GIVEN[Math.floor(Math.random()*GIVEN.length)];
    const vitals = vitalsFromRange(S.disease.symptom_pool.vitals);
    S.patient = {
      name, gender, age, weight, feeType, vitals,
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

  // 次要诊断输入实时提示
  function onSecondaryDiagInput() {
    const input = $('secondary-diag-input');
    const box = $('secondary-diag-suggest');
    const val = input.value.trim();
    if (!val || !S.diseases) { box.classList.add('hidden'); box.innerHTML=''; S.secDiagMatches=[]; return; }
    // 取最后一个逗号后的内容作为关键词
    const parts = val.split(/[,，]/);
    const lastKw = parts[parts.length-1].trim();
    if (!lastKw) { box.classList.add('hidden'); box.innerHTML=''; S.secDiagMatches=[]; return; }
    const matched = S.diseases.filter(d => matchDisease(d.name, lastKw) || (d.icd10||'').toLowerCase().indexOf(lastKw.toLowerCase()) >= 0);
    S.secDiagMatches = matched;
    S.secDiagSel = matched.length ? 0 : -1;
    if (!matched.length) { box.classList.add('hidden'); box.innerHTML=''; return; }
    box.classList.remove('hidden');
    box.innerHTML = '匹配到：' +
      matched.slice(0,6).map((d,i) => `<span class="sug-item${i===0?' kb-highlight':''}" data-name="${d.name}">${d.name}</span>`).join(' ');
    box.querySelectorAll('.sug-item').forEach(el => {
      el.onclick = () => {
        selectSecondaryDiag(el.getAttribute('data-name'), parts);
      };
    });
  }

  function selectSecondaryDiag(name, parts) {
    const input = $('secondary-diag-input');
    const box = $('secondary-diag-suggest');
    const before = parts.slice(0, -1).join('，');
    input.value = before ? before + '，' + name : name;
    box.classList.add('hidden');
    S.secDiagMatches = [];
    input.focus();
  }

  function onSecondaryDiagKey(e) {
    const matched = S.secDiagMatches || [];
    if (!matched.length) return;
    const box = $('secondary-diag-suggest');
    const parts = $('secondary-diag-input').value.split(/[,，]/);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      S.secDiagSel = ((S.secDiagSel||0) + (e.key==='ArrowDown'?1:-1) + matched.length) % matched.length;
      box.querySelectorAll('.sug-item').forEach((el, i) => {
        el.classList.toggle('kb-highlight', i === S.secDiagSel);
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const i = S.secDiagSel || 0;
      const d = matched[i];
      if (d) selectSecondaryDiag(d.name, parts);
    } else if (e.key === 'Escape') {
      box.classList.add('hidden');
      S.secDiagMatches = [];
    }
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
      $('secondary-diag-row').classList.remove('hidden');
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
    // 分级提示：第1次只说错误；第2次给首拼提示；第3次直接填入正确诊断
    const correctPy = DISEASE_PINYIN[dx.name] ||
      Object.entries(DISEASE_PINYIN).find(([k]) => dx.name.indexOf(k) >= 0)?.[1] || '';
    let reveal = '';
    if (S.diagWrongCount >= 3) {
      reveal = `<div style="margin-top:8px;padding:8px;background:#fef2f2;border-radius:6px;color:#c0392b;font-size:13px">🔑 已自动填入正确诊断：<b>${dx.name}</b>（ICD-10: ${dx.icd10}）</div>`;
      // 自动填入正确诊断
      $('diag-input').value = dx.name;
      // 自动触发确认
      setTimeout(() => checkDiagnosis(), 500);
    } else if (S.diagWrongCount >= 2 && correctPy) {
      reveal = `<div style="margin-top:6px;color:#b7791f;font-size:13px">🔤 首拼提示：<b>${correctPy}</b></div>`;
    }
    fb.innerHTML = `<span class="diag-err">❌ 「${v}」诊断不正确，请重新判断。（已错 ${S.diagWrongCount} 次）</span>` +
      (hint && S.diagWrongCount >= 2 ? `<div style="margin-top:6px;color:#b7791f;font-size:13px">💡 ${hint}</div>` : '') +
      reveal;
    // 第三次错误后不再清空输入框（因为已经自动填入）
    if (S.diagWrongCount < 3) {
      $('diag-input').value = '';
    }
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
  // 频次转每日次数：qd=1, bid=2, tid=3, qid=4, qn=1, st=1, qod=0.5
  function freqToPerDay(freq) {
    if (!freq) return 1;
    const f = String(freq).toLowerCase().trim();
    if (f === 'qd' || f === 'qm' || f === 'qn' || f === 'hs') return 1;
    if (f === 'bid') return 2;
    if (f === 'tid') return 3;
    if (f === 'qid') return 4;
    if (f === 'qod') return 0.5; // 隔日一次
    if (f === 'st' || f === 'prn') return 1;
    if (f === 'q8h') return 3; // 每8小时一次
    if (f === 'q12h') return 2; // 每12小时一次
    if (f === 'q6h') return 4;
    return 1; // 默认每天1次
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
      tr.querySelector('.n-qty').onchange = e => {
        const qty = parseInt(e.target.value)||1;
        it.quantity = qty;
        // 改数量时，反推疗程天数（根据频次）
        const freqPerDay = freqToPerDay(it.frequency);
        const singleDoseNum = parseFloat(it.single_dose) || 1;
        const specInfo = parseSpec(it.drug.spec);
        const perSpec = specInfo.amount || 1; // 每盒/每板有多少片
        if (freqPerDay > 0 && perSpec > 0) {
          // qty是总片数？还是总盒数？这里假设qty是总片数
          const totalDays = Math.round(qty / (singleDoseNum * freqPerDay) * 10) / 10;
          it.duration_days = Math.max(1, totalDays);
          tr.querySelector('.n-days').value = it.duration_days;
        }
        updateAmount();
      };
      tr.querySelector('.n-freq').onchange = e => { it.frequency = e.target.value; updateAmount(); };
      tr.querySelector('.n-days').onchange = e => {
        const days = parseInt(e.target.value)||1;
        it.duration_days = days;
        // 改疗程时，自动算总数量（片数）
        const freqPerDay = freqToPerDay(it.frequency);
        const singleDoseNum = parseFloat(it.single_dose) || 1;
        if (freqPerDay > 0 && singleDoseNum > 0) {
          const totalQty = Math.round(days * freqPerDay * singleDoseNum);
          it.quantity = totalQty;
          tr.querySelector('.n-qty').value = totalQty;
        }
        updateAmount();
      };
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

    // 保存次要诊断
    S.secondaryDiagnosis = $('secondary-diag-input')?.value?.trim() || '';

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
    saveHistory(review, ctx);
    saveMistakes(review, hits, ctx);
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
    // 评分器各维度权重合计为105，前端按百分制封顶展示（根因见报告，属评分器侧）
    const disp = Math.max(0, Math.min(100, Math.round(review.total)));
    $('r-score').textContent = disp;
    // 圆环动画
    const arc = $('score-arc');
    if (arc) {
      const C = 326.7;
      arc.style.strokeDashoffset = C * (1 - disp/100);
      arc.style.stroke = disp >= 80 ? '#16a34a' : disp >= 60 ? '#f59e0b' : '#dc2626';
    }
    // 评级
    const grade = $('r-grade');
    if (grade) grade.textContent = disp >= 90 ? '优秀 · 可独立接诊' : disp >= 75 ? '良好 · 基本掌握' : disp >= 60 ? '及格 · 需加强' : '不合格 · 重新学习';
    $('r-meta').textContent =
      `诊断：${ctx.disease.name}（${ctx.disease.icd10}）${S.secondaryDiagnosis ? ' · 次要诊断：' + S.secondaryDiagnosis : ''} · 患者：${ctx.patient.name} ${ctx.patient.gender} ${ctx.patient.age}岁`;

    // 生命体征：与患者病情/处方结果动态关联，按医学标准变色
    const score = review.total;
    const pv = ctx.patient.vitals || null;
    // 生命体征颜色判断工具函数
    function setVitalColor(el, level) {
      el.classList.remove('vital-normal','vital-warn','vital-danger','vital-low');
      el.classList.add('vital-' + level);
    }
    // 根据处方评分动态推算病情严重度（AI参考值）
    function adjustVitals(base, s) {
      // 扣分越严重，病情越重：体温升高、心率加快、血压波动
      let severity = 0;
      if (s < 40) severity = 3;      // 重度
      else if (s < 60) severity = 2; // 中度
      else if (s < 80) severity = 1; // 轻度
      const temp = (parseFloat(base.temp) || 36.8) + severity * 0.5;
      const hr = Math.round((parseFloat(base.hr) || 75) + severity * 8);
      const bpParts = String(base.bp || '120/80').split('/');
      const sys = Math.round((parseFloat(bpParts[0]) || 120) - severity * 3);
      const dia = Math.round((parseFloat(bpParts[1]) || 80) - severity * 2);
      return {
        temp: temp.toFixed(1),
        hr: hr,
        bp: sys + '/' + dia,
        severity: severity
      };
    }
    if (pv && pv.hr) {
      const vitals = adjustVitals(pv, score);
      // 心率
      $('vital-hr').textContent = vitals.hr + ' bpm';
      if (vitals.hr >= 60 && vitals.hr <= 100) setVitalColor($('vital-hr'), 'normal');
      else if (vitals.hr < 60) setVitalColor($('vital-hr'), 'low');
      else if (vitals.hr <= 120) setVitalColor($('vital-hr'), 'warn');
      else setVitalColor($('vital-hr'), 'danger');
      // 体温
      $('vital-temp').textContent = vitals.temp + ' ℃';
      if (vitals.temp >= 36.0 && vitals.temp <= 37.2) setVitalColor($('vital-temp'), 'normal');
      else if (vitals.temp < 36.0) setVitalColor($('vital-temp'), 'low');
      else if (vitals.temp <= 38.5) setVitalColor($('vital-temp'), 'warn');
      else setVitalColor($('vital-temp'), 'danger');
      // 血压
      $('vital-bp').textContent = vitals.bp + ' mmHg';
      const bpParts = vitals.bp.split('/');
      const sys = parseFloat(bpParts[0]);
      const dia = parseFloat(bpParts[1]);
      if (sys >= 90 && sys <= 140 && dia >= 60 && dia <= 90) setVitalColor($('vital-bp'), 'normal');
      else if (sys < 90 || dia < 60) setVitalColor($('vital-bp'), 'low');
      else if (sys > 160 || dia > 100) setVitalColor($('vital-bp'), 'danger');
      else setVitalColor($('vital-bp'), 'warn');
      // 显示参考标注
      const refEl = $('vital-ref');
      if (refEl) {
        if (vitals.severity > 0) {
          refEl.textContent = '* AI推算值，仅供医学参考';
          refEl.style.display = 'block';
        } else {
          refEl.style.display = 'none';
        }
      }
    } else {
      $('vital-hr').textContent = '--';
      $('vital-temp').textContent = '--';
      $('vital-bp').textContent = '--';
      $('vital-hr').className = '';
      $('vital-temp').className = '';
      $('vital-bp').className = '';
    }
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

    // 次要诊断提示：如果用户填写了次要诊断，提醒是否考虑合并症用药
    if (S.secondaryDiagnosis) {
      const tipDiv = document.createElement('div');
      tipDiv.className = 'diag-warn';
      tipDiv.style.margin = '12px 0';
      tipDiv.style.padding = '10px 14px';
      tipDiv.style.borderRadius = '8px';
      tipDiv.style.background = '#fffbeb';
      tipDiv.style.border = '1px solid #fde68a';
      tipDiv.innerHTML = `
        <div style="font-weight:600;margin-bottom:4px;">📋 次要诊断用药完整性检查</div>
        <div style="font-size:13px;color:#92400e;line-height:1.6;">
          你填写了次要诊断：<b>${S.secondaryDiagnosis}</b><br>
          请确认处方中是否包含了合并症的常规用药（如高血压需降压药、糖尿病需降糖药），避免遗漏重要合并症治疗。
        </div>
      `;
      hl.before(tipDiv);
    }

    // 命中列表
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

    // 与参考处方差异（真实集合比对：缺首选 / 已命中 / 额外用药）
    const dx = ctx.disease;
    const chosen = [...(ctx.normal_rx?.items||[]), ...(ctx.iv_rx?.items||[])].map(i=>i.drug.generic_name);
    const ref = ctx.iv_rx ? (dx.second_line_iv||[]) : (dx.first_line_oral||[]);
    const matched = ref.filter(n => chosen.includes(n));
    const missing = ref.filter(n => !chosen.includes(n));
    const extra = chosen.filter(n => !ref.includes(n));
    const refLabel = ctx.iv_rx ? '二线静脉方案' : '一线口服方案';
    let diffHtml = `<div class="diff-ref-row">📚 参考<b>${refLabel}</b>：<b>${ref.join('、') || '无（对症支持即可）'}</b></div>`;
    if (ref.length) {
      diffHtml += '<div class="diff-compare">';
      diffHtml += matched.length
        ? `<div class="diff-ok">✅ 已按指南用药：${matched.join('、')}</div>`
        : '';
      diffHtml += missing.length
        ? `<div class="diff-miss">❌ 缺少首选/指南用药：${missing.join('、')}</div>`
        : `<div class="diff-ok">✅ 指南首选药物已全部覆盖</div>`;
      diffHtml += extra.length
        ? `<div class="diff-extra">⚠️ 额外用药（非本病例首选）：${extra.join('、')}${ctx.iv_rx ? '　（若口服可控制，建议改为口服序贯）' : ''}</div>`
        : '';
      diffHtml += '</div>';
    }
    diffHtml += `<div class="muted" style="margin-top:8px">💡 教学要点：${dx.special_population_note || (dx.contraindications||[]).join('；') || '无特殊。'}</div>`;
    $('diff-box').innerHTML = diffHtml;

    // 知识点卡片：按本次命中规则映射医学知识点
    const KNOWLEDGE_TIPS = {
      'POP-01': { t: '喹诺酮类为何18岁以下禁用', b: '左氧氟沙星、环丙沙星等喹诺酮类可损伤幼年动物负重关节软骨，可能影响儿童骨骼发育，故18岁以下禁用；儿童细菌感染宜选青霉素/头孢类β-内酰胺类。' },
      'POP-02': { t: '老年人输液需个体化', b: '老年人常伴心肾功能减退，大量快速静滴可诱发心衰/肺水肿；滴速宜慢，输液量宜控制，用药后注意尿量与体重变化。' },
      'ABX-01': { t: '特殊使用级抗菌药不得门诊使用', b: '万古霉素、碳青霉烯类等特殊使用级抗菌药须经抗菌药物管理工作组会诊、高级职称医师开具，仅限住院使用；门诊开具备属违规。' },
      'ABX-02': { t: '抗菌药物分级管理', b: '抗菌药分非限制级/限制级/特殊级：非限制级可常规开具，限制级须中级以上职称，特殊级须高级职称会诊；目的是延缓耐药。' },
      'IV-01': { t: '门诊输液指征', b: '原则：能口服不肌注，能肌注不静滴。仅在患者禁食、呕吐严重、药物无口服剂型、病情危重等情形下选择静脉给药。' },
      'IV-02': { t: '口服序贯治疗', b: '感染控制后应及时由静脉转为口服序贯治疗（switch therapy），缩短住院时间、降低导管相关感染与费用。' },
      'IV-05': { t: '门诊输液负面清单', b: '病毒性上感、轻症胃肠炎、皮肤病等原则上不输液；无指征输液既增加过敏风险，也属医保重点核查违规行为。' },
      'IV-06': { t: '溶媒选择与配伍', b: 'β-内酰胺类多用0.9%氯化钠；部分药物不宜用葡萄糖（如泮托拉唑需NS）；应按说明书选择溶媒与浓度，避免浑浊沉淀。' },
      'IV-07': { t: '中药注射剂单独输注', b: '中药注射剂成分复杂，过敏反应发生率高，严禁与其他药物同瓶混合；须单独输注、用前皮试（按说明书）、慢滴并备好抢救措施。' },
      'INT-01': { t: '喹诺酮与金属离子螯合', b: '喹诺酮类可与钙、铝、镁等抗酸剂/钙片螯合而吸收减少，两者需间隔2小时以上服用。' },
      'DUP-01': { t: '避免同类药物重复', b: '同一处方不得重复开具药理作用相同的药物（如两种β-内酰胺类联用，除特殊协同方案外），否则剂量叠加、不良反应增加。' },
      'IND-01': { t: '诊断-用药相符原则', b: '处方药品须与临床诊断相符；无对应诊断开药（如无高血压诊断开氨氯地平）将被医保拒付，并属处方不适宜。' },
      'DOSE-01': { t: '按说明书与体重计算剂量', b: '单次剂量须在说明书范围内；儿童须按 mg/kg 体重换算，不可照搬成人剂量；老年人及肝肾功能不全者需酌减。' },
      'DUR-01': { t: '处方用量限制', b: '普通门诊处方一般≤7日量，急诊≤3日量；高血压、糖尿病等慢性病可延长至2周；超量需注明理由。' },
      'FMT-01': { t: '每张处方≤5种药品', b: '《处方管理办法》规定每张处方不得超过5种药品；超限应评估必要性，避免大包围用药。' },
      'YN-01': { t: '诊断须与患者性别相符', b: '如前列腺增生、盆腔炎等诊断须与患者性别一致；开具前核对性别，属处方前记合规基本要求。' },
      'SPEC-01': { t: '特殊人群剂量换算', b: '儿童按体重(mg/kg)或体表面积算剂量；老年人按肌酐清除率调整经肾排泄药物；妊娠哺乳用药需选择妊娠分级适宜者。' },
      'SPEC-02': { t: '用药前核对禁忌症', b: '开具前须核对过敏史、禁忌症（如青霉素过敏忌头孢、饮酒后忌头孢、哮喘患者慎用β阻滞剂）。' },
      'IV-04': { t: '输液速度个体化', b: '成人常规滴速40-60滴/分；年老、心肺功能差者放慢；含钾溶液滴速≤20mmol/h，严禁静脉推注。' }
    };
    const tipSet = [];
    const seenTip = new Set();
    hits.filter(h => h.severity !== 'pass').forEach(h => {
      const tip = KNOWLEDGE_TIPS[h.rule_id];
      if (tip && !seenTip.has(tip.t)) { seenTip.add(tip.t); tipSet.push(tip); }
    });
    if (tipSet.length === 0) {
      tipSet.push({ t: '本次处方规范', b: '未命中错误/警告规则。继续保持：诊断-用药相符、剂量疗程适宜、特殊人群与配伍均已核对。' });
    }
    $('tips-box').innerHTML = tipSet.map(t =>
      `<div class="knowledge-card"><div class="knowledge-title">📖 ${t.t}</div><div class="knowledge-body">${t.b}</div></div>`
    ).join('');
  }

  // ---------- 历史 & 雷达 ----------
  function saveHistory(review, ctx) {
    const arr = JSON.parse(localStorage.getItem('rx-profile-history')||'[]');
    const radar = window.Reviewer.mapReviewToRadar(review);
    arr.unshift({
      t: Date.now(), total: review.total, radar,
      disease: ctx && ctx.disease ? ctx.disease.name : '',
      disease_code: ctx && ctx.disease ? ctx.disease.code : ''
    });
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
  function saveMistakes(review, hits, ctx) {
    hits = Array.isArray(hits) ? hits.filter(Boolean) : [];
    const errors = hits.filter(h => h.severity === 'error');
    const warns = hits.filter(h => h.severity === 'warn');
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

    // 疾病类型分布：基于全部训练历史（历次病例），错题作兜底
    const distBox = $('disease-dist');
    const distSource = history.filter(h => h.disease && h.disease.length);
    if (distSource.length > 0) {
      const dist = {};
      distSource.forEach(h => {
        dist[h.disease] = (dist[h.disease] || 0) + 1;
      });
      const sorted = Object.entries(dist).sort((a,b) => b[1]-a[1]).slice(0, 10);
      const maxC = Math.max(...sorted.map(s=>s[1]));
      distBox.innerHTML = sorted.map(([name, count]) => `
        <div class="dist-row">
          <span class="dist-name">${name}</span>
          <div class="dist-bar-wrap"><div class="dist-bar" style="width:${count/maxC*100}%"></div></div>
          <span class="dist-count">${count}次</span>
        </div>
      `).join('');
    } else if (mistakes.length > 0) {
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
      distBox.innerHTML = '<p class="muted">暂无数据</p>';
    }
  }

  // ============ 药品库模块 ============
  let DRUG_LIB_DATA = [];
  let DRUG_LIB_FILTER = { kw: '', cat: '' };

  async function loadDrugLib() {
    if (DRUG_LIB_DATA.length > 0) return DRUG_LIB_DATA;
    try {
      const resp = await fetch('data/drugs.json');
      const json = await resp.json();
      DRUG_LIB_DATA = json.drugs || json || [];
    } catch(e) {
      DRUG_LIB_DATA = [];
    }
    return DRUG_LIB_DATA;
  }

  function getDrugCategories() {
    const cats = new Set();
    DRUG_LIB_DATA.forEach(d => {
      if (d.pharmacology_class) cats.add(d.pharmacology_class);
    });
    return Array.from(cats).sort();
  }

  function matchDrugLib(item, kw) {
    if (!kw) return true;
    const k = kw.toLowerCase().trim();
    return item.generic_name.toLowerCase().includes(k) ||
           (item.pinyin || '').toLowerCase().includes(k) ||
           (item.brand_name || '').toLowerCase().includes(k);
  }

  async function renderDrugLib() {
    await loadDrugLib();
    $('drug-total-count').textContent = DRUG_LIB_DATA.length;

    // 渲染分类下拉
    const catSel = $('drug-lib-cat');
    const cats = getDrugCategories();
    catSel.innerHTML = '<option value="">全部分类</option>' +
      cats.map(c => `<option value="${c}">${c}</option>`).join('');

    // 绑定搜索事件
    $('drug-lib-search').oninput = e => {
      DRUG_LIB_FILTER.kw = e.target.value;
      renderDrugLibList();
    };
    catSel.onchange = e => {
      DRUG_LIB_FILTER.cat = e.target.value;
      renderDrugLibList();
    };

    renderDrugLibList();
  }

  function renderDrugLibList() {
    const list = $('drug-lib-list');
    const { kw, cat } = DRUG_LIB_FILTER;
    let items = DRUG_LIB_DATA.filter(d => {
      if (cat && d.pharmacology_class !== cat) return false;
      return matchDrugLib(d, kw);
    });

    if (items.length === 0) {
      list.innerHTML = '<p class="muted" style="grid-column:1/-1;text-align:center;padding:40px;">未找到匹配的药品</p>';
      return;
    }

    list.innerHTML = items.map((d, i) => `
      <div class="drug-card" style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px;cursor:pointer;transition:box-shadow .2s;" onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,.08)'" onmouseout="this.style.boxShadow='none'" onclick="showDrugDetail(${DRUG_LIB_DATA.indexOf(d)})">
        <div style="font-weight:600;font-size:15px;color:#1e293b;margin-bottom:4px;">${d.generic_name}</div>
        <div style="font-size:12px;color:#64748b;margin-bottom:8px;">${d.spec || ''} · ${d.pharmacology_class || ''}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${d.medical_insurance_class ? `<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:#eff6ff;color:#1d4ed8;">医保${d.medical_insurance_class}</span>` : ''}
          ${d.essential_medicine ? `<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:#f0fdf4;color:#15803d;">基药</span>` : ''}
          ${d.otc_class === '非处方药' ? `<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:#fef3c7;color:#92400e;">OTC</span>` : ''}
        </div>
      </div>
    `).join('');
  }

  function showDrugDetail(idx) {
    const d = DRUG_LIB_DATA[idx];
    if (!d) return;
    $('drug-detail-name').textContent = d.generic_name;
    $('drug-detail-body').innerHTML = `
      <div style="margin:12px 0;line-height:1.8;font-size:14px;color:#334155;">
        <p><b>商品名：</b>${d.brand_name || '-'}</p>
        <p><b>规格：</b>${d.spec || '-'}</p>
        <p><b>药理分类：</b>${d.pharmacology_class || '-'}</p>
        <p><b>医保分类：</b>医保${d.medical_insurance_class || '-'}</p>
        <p><b>处方类别：</b>${d.otc_class || '-'}</p>
        <p><b>抗菌分级：</b>${d.abx_level === 'none' ? '非抗菌药' : d.abx_level}</p>
        <p><b>用法用量：</b>每日${d.dose_range_json?.default_freq || '-'}，疗程${d.dose_range_json?.default_duration_days || '-'}天</p>
        <p><b>价格：</b>¥${d.price_yuan || '-'} / ${d.unit || ''}</p>
        <p><b>生产厂家：</b>${d.manufacturer || '-'}</p>
        <p><b>注意事项：</b>${(d.special_warnings_json || []).join('、') || '-'}</p>
      </div>
    `;
    $('modal-drug-detail').classList.remove('hidden');
  }
  window.showDrugDetail = showDrugDetail;

  boot();
})();
