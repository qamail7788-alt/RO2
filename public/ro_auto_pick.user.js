// ==UserScript==
// @name         RO倖存者 自動選技與刷圖輔助
// @namespace    https://ro-survivors-local.helper/
// @version      2.46.0
// @description  RO倖存者全職業(23職)純本地選卡 / 湊招放逐 / 13神器順位與保護 / Lv20技能神祇自動點擊選擇 / 混合橋接真實按鍵 / 即時與累積(B鍵)選技 / 結算自動回村再進副本迴圈
// @author       RO倖存者 自動選技
// @match        https://ro-survivors.com/*
// @include      https://ro-survivors.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      127.0.0.1
// @connect      localhost
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  if (!window.location.hostname.includes('ro-survivors.com')) {
    return;
  }

  // [v2.45.21] 斐揚洞穴 MVP 月夜貓「躲到鐘下」4 階段智慧避難機制（一階躲鐘站樁、二階狂暴月夜貓集中輸出、二階解封回鐘大收圈）
  // [v2.45.20] 於 document-start 掛鉤 WebGL getContext，強制啟用 preserveDrawingBuffer: true
  // 讓打王地面紅圈偵測器能穩定讀取 #stage canvas.world3d 畫面而不黑屏，完全不干擾遊戲渲染邏輯
  (function __installWebGLPreserveHook() {
    try {
      const targetWin = typeof unsafeWindow !== 'undefined' && unsafeWindow ? unsafeWindow : window;
      const proto = targetWin?.HTMLCanvasElement?.prototype;
      if (!proto || typeof proto.getContext !== 'function' || proto.__roPreserveGLPatched) return;
      const origGetContext = proto.getContext;
      proto.getContext = function (type, attrs) {
        if (typeof type === 'string' && /^(webgl2?|experimental-webgl)$/i.test(type)) {
          const nextAttrs =
            attrs && typeof attrs === 'object'
              ? Object.assign({}, attrs, { preserveDrawingBuffer: true })
              : { preserveDrawingBuffer: true };
          return origGetContext.call(this, type, nextAttrs);
        }
        return origGetContext.call(this, type, attrs);
      };
      try {
        Object.defineProperty(proto, '__roPreserveGLPatched', {
          value: true,
          configurable: false,
          enumerable: false,
        });
      } catch (_) {
        proto.__roPreserveGLPatched = true;
      }
    } catch (_) {}
  })();

  let __roMainBooted = false;
  function __roStartMain() {
    if (__roMainBooted) return;
    if (!document.body) {
      setTimeout(__roStartMain, 50);
      return;
    }
    __roMainBooted = true;

  // 0. 小百科全遊戲資料定義（23 職業、199 技能、13 神器（寶箱第 5 格）、Lv 20 技能神祇（第 6 格）、9 大關卡/副本）
  //    遊戲原生鍵盤操作參考 (.opt-keys)：
  //    WASD / ↑↓←→: 移動 | Q / E 或 右鍵拖曳: 旋轉鏡頭 | 滑鼠滾輪: 縮放鏡頭
  //    Esc: 選項/暫停/返回 | B: 累積升級開卡 | C: 角色(主城) | X: 切換角色(主城) | M: 靜音 | Enter: 開始遊戲(選角)
  // 寶箱第 5 格：13 件神器（舊稱「屬性神祇 / XX之神」，遊戲 DOM 仍使用 data-item="deity" 與 assets/items/<key>.png）
  const ARTIFACTS_DATA = [
    { key: '2630', name: '貪婪神器', legacyName: '貪婪之神', effect: '+20~40% 金幣 · +4~12% 尋寶率' },
    { key: '1530', name: '戰爭神器', legacyName: '戰爭之神', effect: '+10~20% 傷害 · +3~5% 爆擊' },
    { key: '1413', name: '處刑神器', legacyName: '處刑之神', effect: '+3~5% 爆擊 · +10~20% 爆傷' },
    { key: '2629', name: '力量神器', legacyName: '力量之神', effect: '+3~5 STR · +3~5% 雙重詠唱' },
    { key: '6599', name: '思想神器', legacyName: '思想之神', effect: '+3~5 INT · +3~5 詠唱速度' },
    { key: '6600', name: '記憶神器', legacyName: '記憶之神', effect: '+3~5 DEX · +1~3% 貫穿機率' },
    { key: '2357', name: '堡壘神器', legacyName: '堡壘之神', effect: '+1 護甲 · +5~10% 最大HP' },
    { key: '2410', name: '疾風神器', legacyName: '疾風之神', effect: '+10~20% 速度 · +3~5% 迴避' },
    { key: '2353', name: '生命神器', legacyName: '生命之神', effect: '每5秒 +2~6 HP · +5~10% 最大HP' },
    { key: '7019', name: '智慧神器', legacyName: '智慧之神', effect: '+20~40% 經驗 · +4~12% 尋寶率' },
    { key: '7058', name: '束縛神器', legacyName: '束縛之神', effect: '+10~20% 範圍 · +3~5 冷卻縮減' },
    { key: '1262', name: '詭計神器', legacyName: '詭計之神', effect: '+3~5 AGI · +3~5% 迴避' },
    { key: '2678', name: '折磨神器', legacyName: '折磨之神', effect: '+15~30% 持續傷害 · +5~10% 傷害' },
  ];
  const ARTIFACTS_BY_KEY = Object.fromEntries(ARTIFACTS_DATA.map((a) => [a.key, a]));
  const ARTIFACTS_BY_NAME = Object.fromEntries(ARTIFACTS_DATA.map((a) => [a.name, a]));
  const ARTIFACT_LEGACY_TO_NEW = Object.fromEntries(ARTIFACTS_DATA.map((a) => [a.legacyName, a.name]));
  const COMMON_ARTIFACTS = ARTIFACTS_DATA.map((a) => a.name);
  const COMMON_DEITIES = COMMON_ARTIFACTS;
  // 技能列 / 第 6 格神祇圖示檔名與 data-skill 代號對應中文技能名稱（供 DOM 精準回推 Lv 20 技能神祇與第四招）
  const SKILL_ICON_OR_SLUG_TO_NAME = {
    firebolt: '火箭術', mg_firebolt: '火箭術',
    coldbolt: '冰箭術', mg_coldbolt: '冰箭術',
    lightning: '雷擊術', lightningbolt: '雷擊術', mg_lightningbolt: '雷擊術',
    napalm: '聖靈召喚', napalmbeat: '聖靈召喚', mg_napalmbeat: '聖靈召喚',
    soulstrike: '心靈爆破', mg_soulstrike: '心靈爆破',
    firewall: '火焰之壁', mg_firewall: '火焰之壁',
    frostdiver: '冰凍術', mg_frostdiver: '冰凍術',
    sight: '火狩', mg_sight: '火狩',
    thunderstorm: '雷爆術', mg_thunderstorm: '雷爆術',
    meteor: '隕石術', wz_meteor: '隕石術',
    firepillar: '火柱攻擊', wz_firepillar: '火柱攻擊',
    frostnova: '霜凍之術', wz_frostnova: '霜凍之術',
    stormgust: '暴風雪', wz_stormgust: '暴風雪',
    jupitel: '雷鳴術', wz_jupitel: '雷鳴術',
    vermilion: '怒雷強擊', wz_vermilion: '怒雷強擊',
  };
  function canonicalArtifactName(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    if (ARTIFACTS_BY_NAME[s]) return s;
    if (ARTIFACT_LEGACY_TO_NEW[s]) return ARTIFACT_LEGACY_TO_NEW[s];
    if (ARTIFACTS_BY_KEY[s]) return ARTIFACTS_BY_KEY[s].name;
    const hit = ARTIFACTS_DATA.find((a) => s.includes(a.name) || s.includes(a.legacyName));
    return hit ? hit.name : '';
  }
  // 五種品質機率與倍率表（小百科固定數值）
  const RARITY_TIERS = [
    { score: 1, id: 'common', name: '普通', prob: 54.4, skillMult: 1, weaponMult: 1 },
    { score: 2, id: 'uncommon', name: '優良', prob: 24.7, skillMult: 1.25, weaponMult: 1.05 },
    { score: 3, id: 'rare', name: '稀有', prob: 12.9, skillMult: 1.5, weaponMult: 1.1 },
    { score: 4, id: 'epic', name: '史詩', prob: 6.5, skillMult: 2, weaponMult: 1.15 },
    { score: 5, id: 'legendary', name: '傳說', prob: 1.5, skillMult: 3, weaponMult: 1.2 },
  ];
  const RARITY_TIER_BY_SCORE = Object.fromEntries(RARITY_TIERS.map((r) => [r.score, r]));
  // 局內 4 大非神祇道具分類與 38 項完整圖鑑字典（以圖片檔名 Key 唯一辨識，並紀錄單次強化 minVal~maxVal 固定範圍）
  // 注意：局內重複拿取同項道具（+0 → +1 → +2 ...）時，卡片上顯示的數值為「該欄位累計總量」，而非單次增量
  const RUN_ITEM_CATEGORIES = ['藥水', '秘藥', '祝福', '料理'];
  const RUN_ITEMS_DATA = [
    // 藥水 (12)
    { key: 'p_regen', category: '藥水', name: '回復藥水', displayName: '回復藥水', effect: '每5秒 +1~5 HP', minVal: 1, maxVal: 5, unit: 'HP/5s' },
    { key: 'p_cd', category: '藥水', name: '冷卻藥水', displayName: '冷卻藥水', effect: '+6~15 冷卻縮減', minVal: 6, maxVal: 15, unit: '冷卻縮減' },
    { key: 'p_hp', category: '藥水', name: '生命藥水', displayName: '生命藥水', effect: '+10~20% 最大HP', minVal: 10, maxVal: 20, unit: '%' },
    { key: 'p_armor', category: '藥水', name: '護甲藥水', displayName: '護甲藥水', effect: '+1~5 護甲', minVal: 1, maxVal: 5, unit: '護甲' },
    { key: 'p_area', category: '藥水', name: '範圍藥水', displayName: '範圍藥水 (通用)', effect: '+18~40% 範圍', minVal: 18, maxVal: 40, unit: '%' },
    { key: 'p_pickup', category: '藥水', name: '採集藥水', displayName: '採集藥水', effect: '+1~5 公尺拾取', minVal: 1, maxVal: 5, unit: '公尺' },
    { key: 'p_greed', category: '藥水', name: '貪婪藥水', displayName: '貪婪藥水', effect: '+10~20% 金幣', minVal: 10, maxVal: 20, unit: '%' },
    { key: 'p_discovery', category: '藥水', name: '尋寶藥水', displayName: '尋寶藥水', effect: '+10~20% 尋寶率', minVal: 10, maxVal: 20, unit: '%' },
    { key: 'p_speed', category: '藥水', name: '速度藥水', displayName: '速度藥水', effect: '+10~20% 移速', minVal: 10, maxVal: 20, unit: '%' },
    { key: 'p_cast', category: '藥水', name: '詠唱藥水', displayName: '詠唱藥水', effect: '+6~15 詠唱速度', minVal: 6, maxVal: 15, unit: '詠唱速度' },
    { key: 'p_reach', category: '藥水', name: '範圍藥水', displayName: '範圍藥水 (近戰)', effect: '+10~20% 近戰範圍', minVal: 10, maxVal: 20, unit: '%', meleeOnly: true },
    { key: 'p_dmg', category: '藥水', name: '傷害藥水', displayName: '傷害藥水', effect: '+18~40% 傷害', minVal: 18, maxVal: 40, unit: '%' },
    // 秘藥 (10)
    { key: 'e_crit', category: '秘藥', name: '爆擊秘藥', displayName: '爆擊秘藥', effect: '+1~5% 爆擊', minVal: 1, maxVal: 5, unit: '%' },
    { key: 'e_dmg', category: '秘藥', name: '傷害秘藥', displayName: '傷害秘藥', effect: '+10~20% 傷害', minVal: 10, maxVal: 20, unit: '%' },
    { key: 'e_hp', category: '秘藥', name: '生命秘藥', displayName: '生命秘藥', effect: '+15~30 最大HP', minVal: 15, maxVal: 30, unit: 'HP' },
    { key: 'e_critdmg', category: '秘藥', name: '爆擊傷害秘藥', displayName: '爆擊傷害秘藥', effect: '+18~40% 爆傷', minVal: 18, maxVal: 40, unit: '%' },
    { key: 'e_surprise', category: '秘藥', name: '驚奇秘藥', displayName: '驚奇秘藥 (尋寶率)', effect: '+10~20% 尋寶率', minVal: 10, maxVal: 20, unit: '%' },
    { key: 'e_dot', category: '秘藥', name: '持續傷害秘藥', displayName: '持續傷害秘藥', effect: '+10~20% 毒/燃/流血', minVal: 10, maxVal: 20, unit: '%', dotOnly: true },
    { key: 'e_dodge', category: '秘藥', name: '迴避秘藥', displayName: '迴避秘藥', effect: '+1~5% 迴避', minVal: 1, maxVal: 5, unit: '%' },
    { key: 'e_cast', category: '秘藥', name: '詠唱秘藥', displayName: '詠唱秘藥', effect: '+6~15 詠唱速度', minVal: 6, maxVal: 15, unit: '詠唱速度' },
    { key: 'e_area', category: '秘藥', name: '範圍秘藥', displayName: '範圍秘藥', effect: '+10~20% 範圍', minVal: 10, maxVal: 20, unit: '%' },
    { key: 'e_armor', category: '秘藥', name: '護甲秘藥', displayName: '護甲秘藥', effect: '-1~5% 受傷', minVal: 1, maxVal: 5, unit: '%' },
    // 祝福 (10)
    { key: 'b_dmg', category: '祝福', name: '傷害祝福', displayName: '傷害祝福', effect: '+18~40% 傷害', minVal: 18, maxVal: 40, unit: '%' },
    { key: 'b_regen', category: '祝福', name: '回復祝福', displayName: '回復祝福', effect: '每5秒 +1~5% HP', minVal: 1, maxVal: 5, unit: '%/5s' },
    { key: 'b_cd', category: '祝福', name: '冷卻祝福', displayName: '冷卻祝福', effect: '+4~10 冷卻縮減', minVal: 4, maxVal: 10, unit: '冷卻縮減' },
    { key: 'b_lifesteal', category: '祝福', name: '吸血祝福', displayName: '吸血祝福', effect: '+0.1~0.5% 吸血', minVal: 0.1, maxVal: 0.5, unit: '%' },
    { key: 'b_double', category: '祝福', name: '雙重詠唱祝福', displayName: '雙重詠唱祝福', effect: '+1~5% 雙重詠唱', minVal: 1, maxVal: 5, unit: '%' },
    { key: 'b_plenty', category: '祝福', name: '豐饒祝福', displayName: '豐饒祝福', effect: '+10~20% 金幣/尋寶', minVal: 10, maxVal: 20, unit: '%', dualStat: true },
    { key: 'b_cast', category: '祝福', name: '詠唱祝福', displayName: '詠唱祝福', effect: '+4~10 詠唱速度', minVal: 4, maxVal: 10, unit: '詠唱速度' },
    { key: 'b_area', category: '祝福', name: '範圍祝福', displayName: '範圍祝福 (通用)', effect: '+10~20% 範圍', minVal: 10, maxVal: 20, unit: '%' },
    { key: 'b_reach', category: '祝福', name: '範圍祝福', displayName: '範圍祝福 (近戰)', effect: '+10~20% 近戰範圍', minVal: 10, maxVal: 20, unit: '%', meleeOnly: true },
    { key: 'b_wisdom', category: '祝福', name: '智慧祝福', displayName: '智慧祝福', effect: '+10~20% 經驗值', minVal: 10, maxVal: 20, unit: '%' },
    // 料理 (6)
    { key: '12202', category: '料理', name: 'STR 料理', displayName: 'STR 料理', effect: '+1~5 STR', minVal: 1, maxVal: 5, unit: 'STR' },
    { key: '12203', category: '料理', name: 'AGI 料理', displayName: 'AGI 料理', effect: '+1~5 AGI (降冷卻)', minVal: 1, maxVal: 5, unit: 'AGI' },
    { key: '12207', category: '料理', name: 'VIT 料理', displayName: 'VIT 料理', effect: '+1~5 VIT', minVal: 1, maxVal: 5, unit: 'VIT' },
    { key: '12204', category: '料理', name: 'INT 料理', displayName: 'INT 料理', effect: '+1~5 INT', minVal: 1, maxVal: 5, unit: 'INT' },
    { key: '12205', category: '料理', name: 'DEX 料理', displayName: 'DEX 料理', effect: '+1~5 DEX', minVal: 1, maxVal: 5, unit: 'DEX' },
    { key: '12206', category: '料理', name: 'LUK 料理', displayName: 'LUK 料理', effect: '+1~5 LUK', minVal: 1, maxVal: 5, unit: 'LUK' },
  ];
  const RUN_ITEMS_BY_KEY = Object.fromEntries(RUN_ITEMS_DATA.map((it) => [it.key, it]));
  const RUN_ITEMS_BY_CAT = Object.fromEntries(
    RUN_ITEM_CATEGORIES.map((cat) => [cat, RUN_ITEMS_DATA.filter((it) => it.category === cat)])
  );
  const DISCOVERY_ITEM_KEYS = new Set(['p_discovery', 'e_surprise', 'b_plenty']);
  // 品質對應單抽正規化區間視窗（由低至高涵蓋 5 品質單次強化之合理落點）
  const RARITY_ROLL_WINDOWS = {
    1: [0.0, 0.2],
    2: [0.15, 0.45],
    3: [0.35, 0.7],
    4: [0.55, 0.9],
    5: [0.8, 1.0],
  };
  function roundStatByPrecision(val, precision = 1) {
    const num = Number(val);
    if (!Number.isFinite(num)) return 0;
    return precision < 1 ? Math.round(num * 10) / 10 : Math.round(num);
  }
  function floorStatByPrecision(val, precision = 1) {
    const num = Number(val);
    if (!Number.isFinite(num)) return 0;
    return precision < 1 ? Math.floor(num * 10 + 1e-9) / 10 : Math.floor(num + 1e-9);
  }
  function ceilStatByPrecision(val, precision = 1) {
    const num = Number(val);
    if (!Number.isFinite(num)) return 0;
    return precision < 1 ? Math.ceil(num * 10 - 1e-9) / 10 : Math.ceil(num - 1e-9);
  }
  // 統一解析卡片強化階數：+0 / 無階數標記 → 0（代表累計抽 1 次）；+N (N>=1) → N（累計抽 N+1 次）；Lv.K / 等級K (K>=2) → K-1
  function parseRunItemUpgradeLevel(title) {
    try {
      const s = String(title || '').trim();
      if (!s) return 0;
      const plusMatch = s.match(/\+\s*(\d+)/);
      if (plusMatch) {
        const n = Number(plusMatch[1]);
        return Number.isFinite(n) && n >= 0 ? n : 0;
      }
      const lvMatch = s.match(/(?:lv\.?|等級)\s*(\d+)/i);
      if (lvMatch) {
        const lv = Number(lvMatch[1]);
        return Number.isFinite(lv) && lv >= 1 ? Math.max(0, lv - 1) : 0;
      }
    } catch (_) {}
    return 0;
  }
  // 38 項局內道具累計數值級距結構（純內部邏輯，不暴露設定介面）
  // 遊戲累計規則：強化階數 +L 代表總共抽取 draws = L + 1 次；
  // 硬理論包絡區間 = [(L + 1) * minRoll, (L + 1) * maxRoll]；
  // 品質收斂區間   = [L * minRoll + tierMin(R), L * maxRoll + tierMax(R)]
  const RUN_ITEM_TIER_SCHEMA = Object.fromEntries(
    RUN_ITEMS_DATA.map((it) => {
      const minRoll = Number(it.minVal);
      const maxRoll = Number(it.maxVal);
      const precision = minRoll < 1 ? 0.1 : 1;
      const span = maxRoll - minRoll;
      const raritySteps = RARITY_TIERS.map((r) => {
        const [wMin, wMax] = RARITY_ROLL_WINDOWS[r.score] || [0, 1];
        const sMin = r.score === 1 ? minRoll : Math.max(minRoll, floorStatByPrecision(minRoll + span * wMin, precision));
        const sMax = r.score === 5 ? maxRoll : Math.min(maxRoll, ceilStatByPrecision(minRoll + span * wMax, precision));
        return { score: r.score, name: r.name, min: sMin, max: Math.max(sMin, sMax) };
      });
      const stepByScore = Object.fromEntries(raritySteps.map((s) => [s.score, s]));
      const entry = {
        key: it.key,
        category: it.category,
        name: it.name,
        displayName: it.displayName,
        unit: it.unit || '',
        minRoll,
        maxRoll,
        precision,
        sign: it.key === 'e_armor' ? -1 : 1,
        dualStat: Boolean(it.dualStat),
        meleeOnly: Boolean(it.meleeOnly),
        dotOnly: Boolean(it.dotOnly),
        raritySteps,
        getBoundsForLevel(level, rarityScore = null) {
          const safeLv = Math.max(0, Math.floor(Number(level) || 0));
          const draws = safeLv + 1;
          const hardMin = roundStatByPrecision(draws * minRoll, precision);
          const hardMax = roundStatByPrecision(draws * maxRoll, precision);
          const step = rarityScore ? stepByScore[Math.max(1, Math.min(5, Math.floor(Number(rarityScore) || 1)))] : null;
          const strictMin = step
            ? Math.max(hardMin, roundStatByPrecision(safeLv * minRoll + step.min, precision))
            : hardMin;
          const strictMax = step
            ? Math.min(hardMax, roundStatByPrecision(safeLv * maxRoll + step.max, precision))
            : hardMax;
          return {
            level: safeLv,
            draws,
            hardMin,
            hardMax,
            strictMin,
            strictMax: Math.max(strictMin, strictMax),
            rollStep: step || { score: 0, name: '未知', min: minRoll, max: maxRoll },
          };
        },
      };
      return [it.key, entry];
    })
  );
  function estimateItemRollUpperBound(item, rarityScore) {
    const schema = item?.key ? RUN_ITEM_TIER_SCHEMA[item.key] : null;
    if (schema) {
      const clamped = Math.max(1, Math.min(5, Number(rarityScore) || 1));
      const ratio = (clamped - 1) / 4;
      const raw = schema.minRoll + (schema.maxRoll - schema.minRoll) * ratio;
      return ceilStatByPrecision(raw, schema.precision);
    }
    if (!item || typeof item.minVal !== 'number' || typeof item.maxVal !== 'number') return 0;
    const clamped = Math.max(1, Math.min(5, Number(rarityScore) || 1));
    const ratio = (clamped - 1) / 4;
    const raw = item.minVal + (item.maxVal - item.minVal) * ratio;
    return item.minVal < 1 ? Math.round(raw * 10) / 10 : Math.ceil(raw);
  }
  function auditRunItemTierSchema() {
    const errors = [];
    try {
      const keys = Object.keys(RUN_ITEM_TIER_SCHEMA);
      if (keys.length !== RUN_ITEMS_DATA.length) {
        errors.push(`項目數不符: ${keys.length}/${RUN_ITEMS_DATA.length}`);
      }
      for (const key of keys) {
        const sc = RUN_ITEM_TIER_SCHEMA[key];
        if (!sc || !(sc.minRoll > 0) || !(sc.maxRoll >= sc.minRoll)) {
          errors.push(`${key}: minRoll/maxRoll 異常`);
          continue;
        }
        if (!Array.isArray(sc.raritySteps) || sc.raritySteps.length !== 5) {
          errors.push(`${key}: raritySteps 筆數不為 5`);
          continue;
        }
        let prevMin = 0;
        let prevMax = 0;
        for (const st of sc.raritySteps) {
          if (st.min < sc.minRoll || st.max > sc.maxRoll || st.min > st.max) {
            errors.push(`${key} 品質 ${st.score}: 範圍 [${st.min},${st.max}] 越界`);
          }
          if (st.min < prevMin || st.max < prevMax) {
            errors.push(`${key} 品質 ${st.score}: 級距未單調遞增`);
          }
          prevMin = st.min;
          prevMax = st.max;
        }
        const b0 = sc.getBoundsForLevel(0, 1);
        const b5 = sc.getBoundsForLevel(5, 5);
        if (!(b0.hardMin > 0 && b0.hardMin <= b0.hardMax && b5.hardMin > b0.hardMin && b5.hardMax > b0.hardMax)) {
          errors.push(`${key}: 累計級距邊界計算異常`);
        }
      }
    } catch (err) {
      errors.push(String(err?.message || err));
    }
    return {
      ok: errors.length === 0,
      itemCount: Object.keys(RUN_ITEM_TIER_SCHEMA).length,
      errors,
    };
  }
  // 武器基本攻擊（天生普攻技能池，湊招放逐時用於跨職業識別）
  const INNATE_ATTACK_NAMES = [
    '屬性附加', '屬性附加（近戰）', '攻擊：屬性附加', '攻擊：法杖', '攻擊：弓',
    '攻擊：槍', '攻擊：風魔手裡劍', '攻擊：劍', '攻擊：雙手劍', '攻擊：斧',
    '攻擊：雙手斧', '攻擊：長矛', '攻擊：雙手長矛', '攻擊：短劍', '攻擊：鈍器',
    '攻擊：拳頭', '攻擊：拳刃', '攻擊：拳套', '攻擊：書', '攻擊：樂器', '攻擊：鞭子',
  ];

  const STAGES_DATA = [
    { id: 'prontera', name: '普隆德拉原野', place: '普隆德拉南方', levels: '1–8', tier: 1, gsMin: 0, jobLvMin: null, jobCap: 12, miniBossTimes: [150, 300, 450, 600], bossTime: 720, bossFightWindowSec: 120, runLength: 840, mvp: '波利王', note: '新手起點' },
    { id: 'sewer', name: '普隆德拉地下水道', place: '普隆德拉街道地底', levels: '9–12', tier: 1, gsMin: 20, jobLvMin: null, jobCap: 20, miniBossTimes: [180], bossTime: 480, bossFightWindowSec: 120, runLength: 600, mvp: '黃金蟲', note: '8分出王速刷圖' },
    { id: 'sunken', name: '失事輪', place: '艾爾貝塔海岸', levels: '13–15', tier: 1, gsMin: 40, jobLvMin: null, jobCap: 25, miniBossTimes: [180, 360], bossTime: 600, bossFightWindowSec: 120, runLength: 720, mvp: '德瑞克', note: 'T1 終點圖' },
    { id: 'byalan', name: '柏伊亞嵐島', place: '依斯魯得島海盜地洞', levels: '16–20', tier: 2, gsMin: 110, jobLvMin: null, jobCap: 31, miniBossTimes: [180, 360, 540], bossTime: 720, bossFightWindowSec: 120, runLength: 840, mvp: '克拉肯', note: 'T2 入門' },
    { id: 'payon', name: '斐揚森林', place: '斐揚近郊', levels: '21–25', tier: 2, gsMin: 135, jobLvMin: null, jobCap: 38, miniBossTimes: [180, 360, 600], bossTime: 840, bossFightWindowSec: 120, runLength: 960, mvp: '虎王', note: 'T2 中階練職' },
    { id: 'payon_cave', name: '斐揚洞穴', place: '斐揚山脈地底', levels: '26–30', tier: 2, gsMin: 165, jobLvMin: null, jobCap: 49, miniBossTimes: [180, 360, 600], bossTime: 840, bossFightWindowSec: 120, runLength: 960, mvp: '月夜貓', note: '二轉前刷 Job50 聖地' },
    { id: 'louyang', name: '燈籠節', place: '洛陽（季節活動）', levels: '26–30', tier: 2, gsMin: 0, jobLvMin: null, jobCap: 49, miniBossTimes: [150, 300, 450, 600, 720], bossTime: 840, bossFightWindowSec: 120, runLength: 960, mvp: '白素貞 / 黑蛇王', note: '全角色免門檻・扭蛋碎片（無裝備掉落）', noEquipDrops: true },
  ];
  // 一轉與擴充一轉基礎技能池
  const BASE_JOB_SKILLS = {
    '劍士': ['狂擊', '怒爆', '劍舞', '盾牌衝擊', '挑釁', '降低士氣的吶喊', '霸體', '快速恢復'],
    '魔法師': ['火箭術', '冰箭術', '雷擊術', '聖靈召喚', '心靈爆破', '火焰之壁', '冰凍術', '火狩', '雷爆術'],
    '弓箭手': ['二連矢', '箭雨', '箭矢暴雨', '衝鋒箭', '撤退', '奧術射擊', '火焰箭', '心神凝聚'],
    '服事': ['治癒術', '神聖之光', '光獵', '緩速術', '天使之光', '天使之淚', '天使之賜福', '神聖重擊'],
    '盜賊': ['施毒', '噴砂', '隱匿', '投擲石頭', '毒藥瓶', '影步', '飛刀扇', '撒菱'],
    '商人': ['金錢攻擊', '手推車攻擊', '金幣雨', '手推車衝撞', '露天商店', '大聲吶喊', '負重量上升'],
    '跆拳少年': ['迴旋踢', '砸踢', '轉身踢', '還擊踢', '跑步'],
    '忍者': ['投擲飛鏢', '投擲飛刀', '投擲風魔飛鏢', '火炎花', '雷擊碎'],
    '神槍手': ['三連攻擊', '五連擊', '火力全開', '亡命之徒', '四面埋伏', '百步穿楊'],
  };

  const JOB_PRESETS = {
    '劍士': { base: null, scaling: 'melee', coreSkills: ['狂擊', '怒爆', '劍舞'], allSkills: BASE_JOB_SKILLS['劍士'] },
    '魔法師': { base: null, scaling: 'magic', coreSkills: ['火箭術', '冰箭術', '雷擊術'], allSkills: BASE_JOB_SKILLS['魔法師'] },
    '弓箭手': { base: null, scaling: 'ranged', coreSkills: ['二連矢', '箭雨', '箭矢暴雨'], allSkills: BASE_JOB_SKILLS['弓箭手'] },
    '服事': { base: null, scaling: 'magic', coreSkills: ['治癒術', '神聖之光', '神聖重擊'], allSkills: BASE_JOB_SKILLS['服事'] },
    '盜賊': { base: null, scaling: 'melee', coreSkills: ['施毒', '毒藥瓶', '飛刀扇'], allSkills: BASE_JOB_SKILLS['盜賊'] },
    '商人': { base: null, scaling: 'melee', coreSkills: ['金錢攻擊', '手推車攻擊', '金幣雨'], allSkills: BASE_JOB_SKILLS['商人'] },
    '跆拳少年': { base: null, scaling: 'melee', coreSkills: ['迴旋踢', '砸踢', '轉身踢'], allSkills: BASE_JOB_SKILLS['跆拳少年'] },
    '忍者': { base: null, scaling: 'ranged', coreSkills: ['投擲飛鏢', '投擲飛刀', '投擲風魔飛鏢'], allSkills: BASE_JOB_SKILLS['忍者'] },
    '神槍手': { base: null, scaling: 'ranged', coreSkills: ['三連攻擊', '五連擊', '亡命之徒'], allSkills: BASE_JOB_SKILLS['神槍手'] },
    '騎士': { base: '劍士', scaling: 'melee', coreSkills: ['狂擊', '怒爆', '劍舞'], allSkills: [...BASE_JOB_SKILLS['劍士'], '騎乘攻擊', '衝鋒攻擊', '連刺攻擊', '投擲長矛攻擊', '反擊', '怪物互擊'] },
    '十字軍': { base: '劍士', scaling: 'melee', coreSkills: ['狂擊', '聖十字攻擊', '聖錘 十字星'], allSkills: [...BASE_JOB_SKILLS['劍士'], '長矛加速術', '盾擊', '聖十字攻擊', '聖錘 十字星', '迴旋盾擊', '自動防禦'] },
    '巫師': {
      base: '魔法師', scaling: 'magic', coreSkills: ['火箭術', '冰箭術', '雷擊術'],
      allSkills: [...BASE_JOB_SKILLS['魔法師'], '隕石術', '火柱攻擊', '霜凍之術', '暴風雪', '雷鳴術', '怒雷強擊'],
      fourthOrder: ['聖靈召喚', '心靈爆破', '火焰之壁', '冰凍術', '火狩', '雷爆術', '隕石術', '火柱攻擊', '霜凍之術', '暴風雪', '雷鳴術', '怒雷強擊'],
      artifactOrder: ['智慧神器', '思想神器', '記憶神器', '束縛神器', '戰爭神器', '處刑神器', '力量神器', '堡壘神器', '疾風神器', '生命神器', '詭計神器', '折磨神器', '貪婪神器'],
      skillDeityOrder: ['雷擊術', '火箭術', '冰箭術', '聖靈召喚', '心靈爆破', '火焰之壁', '冰凍術', '火狩', '雷爆術', '隕石術', '火柱攻擊', '霜凍之術', '暴風雪', '雷鳴術', '怒雷強擊'],
    },
    '賢者': { base: '魔法師', scaling: 'magic', coreSkills: ['火箭術', '冰箭術', '雷擊術'], allSkills: [...BASE_JOB_SKILLS['魔法師'], '火元素領域', '水元素領域', '地震術', '崩裂術', '自動念咒', '隨機技能'] },
    '獵人': { base: '弓箭手', scaling: 'ranged', coreSkills: ['二連矢', '箭雨', '箭矢暴雨'], allSkills: [...BASE_JOB_SKILLS['弓箭手'], '閃電衝擊', '獵鷹尋敵', '爆散陷阱', '睡魔陷阱', '動物猛擊', '幻影箭'] },
    '吟遊詩人': { base: '弓箭手', scaling: 'ranged', alias: ['舞孃'], coreSkills: ['二連矢', '奧義箭亂舞', '箭矢暴雨'], allSkills: [...BASE_JOB_SKILLS['弓箭手'], '奧義箭亂舞', '不諧和音', '搖籃曲', '洛奇的悲鳴', '戰鼓震天', '不死神齊格弗里德'] },
    '祭司': { base: '服事', scaling: 'magic', coreSkills: ['神聖之光', '十字驅魔攻擊', '光耀之堂'], allSkills: [...BASE_JOB_SKILLS['服事'], '光耀之堂', '暗之障壁', '聖母之祈福', '十字驅魔攻擊', '神威祈福', '聖母之頌歌'] },
    '武僧': { base: '服事', scaling: 'melee', coreSkills: ['神聖之光', '彈指神通', '連環全身掌'], allSkills: [...BASE_JOB_SKILLS['服事'], '蓄氣', '彈指神通', '連環全身掌', '猛龍誇強', '爆氣', '阿修羅霸凰拳'] },
    '刺客': { base: '盜賊', scaling: 'melee', coreSkills: ['施毒', '音速投擲', '無影之牙'], allSkills: [...BASE_JOB_SKILLS['盜賊'], '音速投擲', '無影之牙', '塗毒', '病毒散撥', '偽裝', '毒刃'] },
    '流氓': { base: '盜賊', scaling: 'melee', coreSkills: ['施毒', '背刺', '潛擊'], allSkills: [...BASE_JOB_SKILLS['盜賊'], '背刺', '潛擊', '卸除武器', '脅持', '偷錢', '塗鴉'] },
    '鐵匠': { base: '商人', scaling: 'melee', coreSkills: ['金錢攻擊', '旋風斧', '回力斧'], allSkills: [...BASE_JOB_SKILLS['商人'], '旋風斧', '回力斧', '無視體型攻擊', '衝擊震地', '貪婪', '尋找礦石'] },
    '鍊金術師': { base: '商人', scaling: 'melee', coreSkills: ['強酸攻擊', '火煙瓶投擲', '生命體召喚'], allSkills: [...BASE_JOB_SKILLS['商人'], '強酸攻擊', '火煙瓶投擲', '生命體召喚', '生物調撥', '藥水投擲', '化學保護'] },
    '拳聖': { base: '跆拳少年', scaling: 'melee', coreSkills: ['迴旋踢', '滿月踢', '流星墜落'], allSkills: [...BASE_JOB_SKILLS['跆拳少年'], '太陽的溫暖', '太陽爆發', '滿月踢', '新月踢', '流星墜落', '太陽和月亮和星星的融合'] },
    '悟靈士': { base: '跆拳少年', scaling: 'magic', coreSkills: ['艾斯麻', '艾斯提', '艾斯敦'], allSkills: [...BASE_JOB_SKILLS['跆拳少年'], '艾斯麻', '艾斯提', '艾斯敦', '凱易哲', '凱阿希', '凱誣僕'] },
  };

  const JOB_NAMES_BY_LEN = Object.keys(JOB_PRESETS).sort((a, b) => b.length - a.length);
  // 職業是否確實辨識到（辨識失敗時預設巫師，此時不可自動放逐，避免誤放逐真正的核心技能）
  function isJobConfident() {
    const ov = getExtra().jobOverride;
    if (ov && ov !== 'auto' && JOB_PRESETS[ov]) return true;
    const txt = (
      document.querySelector('#hud-name small')?.textContent ||
      document.querySelector('#slot-info .n')?.textContent ||
      document.querySelector('#hud-name')?.textContent ||
      ''
    ).trim();
    if (!txt) return false;
    return JOB_NAMES_BY_LEN.some((job) => txt.includes(job) || (JOB_PRESETS[job].alias || []).some((a) => txt.includes(a)));
  }

  function detectDomJobName() {
    const rawJob = (
      document.querySelector('#hud-name small')?.textContent ||
      document.querySelector('#slot-info .n')?.textContent ||
      ''
    ).trim();
    const fallback = !rawJob ? (document.querySelector('#hud-name')?.textContent || '').trim() : '';
    const txt = rawJob || fallback;
    for (const job of JOB_NAMES_BY_LEN) {
      if (txt.includes(job)) return job;
      const aliases = JOB_PRESETS[job].alias || [];
      if (aliases.some((a) => txt.includes(a))) return job;
    }
    return '巫師';
  }

  function getActiveJobName() {
    const ov = getExtra().jobOverride;
    if (ov && ov !== 'auto' && JOB_PRESETS[ov]) return ov;
    return detectDomJobName();
  }

  function getJobSpec(jobName = getActiveJobName()) {
    const spec = JOB_PRESETS[jobName] || JOB_PRESETS['巫師'];
    const allSkills = spec.allSkills || [];
    const coreSkills = spec.coreSkills || allSkills.slice(0, 3);
    const defaultFourth = spec.fourthOrder || allSkills.filter((s) => !coreSkills.includes(s));
    const defaultArtifacts = spec.artifactOrder || (spec.scaling === 'magic'
      ? ['智慧神器', '思想神器', '記憶神器', '束縛神器', '戰爭神器', '處刑神器', '力量神器', '堡壘神器', '疾風神器', '生命神器', '詭計神器', '折磨神器', '貪婪神器']
      : ['戰爭神器', '處刑神器', '智慧神器', '記憶神器', '力量神器', '束縛神器', '堡壘神器', '疾風神器', '生命神器', '思想神器', '詭計神器', '折磨神器', '貪婪神器']);
    const defaultSkillDeity = spec.skillDeityOrder || [...coreSkills, ...defaultFourth];
    return {
      name: jobName,
      ...spec,
      allSkills,
      coreSkills,
      defaultFourth,
      defaultDeity: defaultArtifacts,
      defaultArtifacts,
      defaultSkillDeity,
    };
  }

  function getCoreSkills() { return getJobSpec().coreSkills; }
  function getAllJobSkills() { return getJobSpec().allSkills; }
  function getAllArtifacts() { return [...COMMON_ARTIFACTS]; }
  function getAllJobDeities() { return [...COMMON_ARTIFACTS]; }

  function getJobFourthOrder() {
    const ex = getExtra();
    const job = getActiveJobName();
    const saved = ex.fourthOrderByJob?.[job];
    if (Array.isArray(saved) && saved.length) return saved;
    if (job === '巫師' && Array.isArray(ex.fourthOrder) && ex.fourthOrder.length) return ex.fourthOrder;
    return getJobSpec(job).defaultFourth;
  }

  function setJobFourthOrder(next) {
    const ex = getExtra();
    const job = getActiveJobName();
    const byJob = { ...(ex.fourthOrderByJob || {}), [job]: next };
    const patch = { fourthOrderByJob: byJob };
    if (job === '巫師') patch.fourthOrder = next;
    saveExtra(patch);
  }

  function getJobAcceptedFourthSkills(job = getActiveJobName()) {
    const ex = getExtra();
    const saved = ex.fourthAcceptedByJob?.[job];
    if (Array.isArray(saved)) return saved;
    return getJobFourthOrder().slice(0, Math.max(0, Number(ex.acceptTopN) || 0));
  }

  function setJobAcceptedFourthSkills(next, job = getActiveJobName()) {
    const ex = getExtra();
    const byJob = { ...(ex.fourthAcceptedByJob || {}), [job]: next };
    saveExtra({ fourthAcceptedByJob: byJob });
  }

  function toggleJobFourthSkillAccepted(skillName, job = getActiveJobName()) {
    const cur = getJobAcceptedFourthSkills(job);
    const next = cur.includes(skillName) ? cur.filter((s) => s !== skillName) : [...cur, skillName];
    setJobAcceptedFourthSkills(next, job);
    return next.includes(skillName);
  }

  function getDefaultBanishOrderForJob(job = getActiveJobName()) {
    const allSk = getJobSpec(job).allSkills || [];
    if (allSk.includes('冰箭術')) {
      return ['__FOURTH__', '__INNATE__', '冰箭術'];
    }
    return ['__FOURTH__', '__INNATE__'];
  }

  function getJobBanishOrder(job = getActiveJobName()) {
    const ex = getExtra();
    const saved = ex.banishOrderByJob?.[job];
    if (Array.isArray(saved)) return saved.filter((x) => typeof x === 'string' && x.trim());
    return getDefaultBanishOrderForJob(job);
  }

  function setJobBanishOrder(next, job = getActiveJobName()) {
    const ex = getExtra();
    const clean = Array.isArray(next) ? next.filter((x) => typeof x === 'string' && x.trim()) : [];
    const byJob = { ...(ex.banishOrderByJob || {}), [job]: clean };
    saveExtra({ banishOrderByJob: byJob });
  }

  function banishKeyLabel(key) {
    if (key === '__FOURTH__') return '第四個選擇技能';
    if (key === '__INNATE__') return '屬性附加 (天生普攻)';
    return String(key || '');
  }

  function sanitizeArtifactOrderList(list, fallback) {
    const out = [];
    if (Array.isArray(list)) {
      list.forEach((raw) => {
        const canon = canonicalArtifactName(raw);
        if (canon && !out.includes(canon)) out.push(canon);
      });
    }
    const base = Array.isArray(fallback) && fallback.length ? fallback : COMMON_ARTIFACTS;
    base.forEach((name) => {
      if (ARTIFACTS_BY_NAME[name] && !out.includes(name)) out.push(name);
    });
    COMMON_ARTIFACTS.forEach((name) => {
      if (!out.includes(name)) out.push(name);
    });
    return out;
  }

  // 寶箱第 5 格：13 件神器順位與鎖定（沿用舊儲存鍵並自動將「XX之神」遷移為「XX神器」）
  function getJobDeityOrder(job = getActiveJobName()) {
    const ex = getExtra();
    const spec = getJobSpec(job);
    const saved = ex.deityOrderByJob?.[job];
    if (Array.isArray(saved) && saved.length) {
      const migrated = saved.map(canonicalArtifactName).filter(Boolean);
      if (migrated.length) return sanitizeArtifactOrderList(migrated, spec.defaultArtifacts);
    }
    if (job === '巫師' && Array.isArray(ex.deityOrder) && ex.deityOrder.length) {
      const migrated = ex.deityOrder.map(canonicalArtifactName).filter(Boolean);
      if (migrated.length) return sanitizeArtifactOrderList(migrated, spec.defaultArtifacts);
    }
    return sanitizeArtifactOrderList(spec.defaultArtifacts, COMMON_ARTIFACTS);
  }

  function setJobDeityOrder(next, job = getActiveJobName()) {
    const ex = getExtra();
    const clean = Array.isArray(next)
      ? Array.from(new Set(next.map(canonicalArtifactName).filter(Boolean)))
      : [];
    const byJob = { ...(ex.deityOrderByJob || {}), [job]: clean };
    const patch = { deityOrderByJob: byJob };
    if (job === '巫師') patch.deityOrder = clean;
    saveExtra(patch);
  }

  function getJobLockedDeity(job = getActiveJobName()) {
    const ex = getExtra();
    const raw = String(ex.lockedDeityByJob?.[job] || '').trim();
    return canonicalArtifactName(raw);
  }

  function setJobLockedDeity(artifactName, job = getActiveJobName()) {
    const ex = getExtra();
    const clean = canonicalArtifactName(artifactName);
    const byJob = { ...(ex.lockedDeityByJob || {}), [job]: clean };
    saveExtra({ lockedDeityByJob: byJob });
  }

  // 技能分頁：Lv 20 第 6 格「技能神祇」優先順位與鎖定（四選一僅會從已裝備的 4 個技能出現）
  function getJobSkillDeityOrder(job = getActiveJobName()) {
    const ex = getExtra();
    const spec = getJobSpec(job);
    const allSkills = spec.allSkills || [];
    const saved = ex.skillDeityOrderByJob?.[job];
    if (Array.isArray(saved) && saved.length) {
      const valid = saved.filter((s) => allSkills.includes(s));
      if (valid.length) return [...valid, ...allSkills.filter((s) => !valid.includes(s))];
    }
    // 若無新版設定，嘗試從舊版混合 deityOrder 中自動遷移技能排序
    const legacyList = ex.deityOrderByJob?.[job] || (job === '巫師' ? ex.deityOrder : null);
    if (Array.isArray(legacyList) && legacyList.length) {
      const migratedSkills = legacyList.filter((s) => allSkills.includes(s));
      if (migratedSkills.length) return [...migratedSkills, ...allSkills.filter((s) => !migratedSkills.includes(s))];
    }
    return [...spec.defaultSkillDeity, ...allSkills.filter((s) => !spec.defaultSkillDeity.includes(s))];
  }

  function setJobSkillDeityOrder(next, job = getActiveJobName()) {
    const ex = getExtra();
    const allSkills = getJobSpec(job).allSkills || [];
    const clean = Array.isArray(next) ? Array.from(new Set(next.filter((s) => allSkills.includes(s)))) : [];
    const byJob = { ...(ex.skillDeityOrderByJob || {}), [job]: clean };
    saveExtra({ skillDeityOrderByJob: byJob });
  }

  function getJobLockedSkillDeity(job = getActiveJobName()) {
    const ex = getExtra();
    const allSkills = getJobSpec(job).allSkills || [];
    const saved = String(ex.lockedSkillDeityByJob?.[job] || '').trim();
    if (saved && allSkills.includes(saved)) return saved;
    const legacyLocked = String(ex.lockedDeityByJob?.[job] || '').trim();
    if (legacyLocked && allSkills.includes(legacyLocked)) return legacyLocked;
    return '';
  }

  function setJobLockedSkillDeity(skillName, job = getActiveJobName()) {
    const ex = getExtra();
    const allSkills = getJobSpec(job).allSkills || [];
    const clean = skillName && allSkills.includes(skillName) ? skillName : '';
    const byJob = { ...(ex.lockedSkillDeityByJob || {}), [job]: clean };
    saveExtra({ lockedSkillDeityByJob: byJob });
  }

  function getDefaultItemOrderForJob(cat, job = getActiveJobName()) {
    const scaling = getJobSpec(job).scaling || 'magic';
    const presets = {
      '藥水': {
        magic: ['p_pickup', 'p_cd', 'p_area', 'p_cast', 'p_dmg', 'p_discovery', 'p_greed', 'p_speed', 'p_hp', 'p_regen', 'p_armor', 'p_reach'],
        ranged: ['p_pickup', 'p_cd', 'p_area', 'p_dmg', 'p_discovery', 'p_speed', 'p_greed', 'p_hp', 'p_regen', 'p_armor', 'p_cast', 'p_reach'],
        melee: ['p_pickup', 'p_cd', 'p_reach', 'p_area', 'p_dmg', 'p_discovery', 'p_hp', 'p_armor', 'p_regen', 'p_speed', 'p_greed', 'p_cast'],
      },
      '秘藥': {
        magic: ['e_surprise', 'e_cast', 'e_dmg', 'e_area', 'e_crit', 'e_critdmg', 'e_dodge', 'e_armor', 'e_hp', 'e_dot'],
        ranged: ['e_surprise', 'e_dmg', 'e_crit', 'e_critdmg', 'e_area', 'e_dodge', 'e_armor', 'e_hp', 'e_cast', 'e_dot'],
        melee: ['e_surprise', 'e_dmg', 'e_crit', 'e_critdmg', 'e_area', 'e_armor', 'e_dodge', 'e_hp', 'e_dot', 'e_cast'],
      },
      '祝福': {
        magic: ['b_cd', 'b_area', 'b_dmg', 'b_wisdom', 'b_plenty', 'b_double', 'b_cast', 'b_regen', 'b_lifesteal', 'b_reach'],
        ranged: ['b_cd', 'b_area', 'b_dmg', 'b_wisdom', 'b_plenty', 'b_regen', 'b_lifesteal', 'b_double', 'b_cast', 'b_reach'],
        melee: ['b_cd', 'b_reach', 'b_area', 'b_dmg', 'b_wisdom', 'b_plenty', 'b_lifesteal', 'b_regen', 'b_double', 'b_cast'],
      },
      '料理': {
        magic: ['12203', '12204', '12205', '12207', '12206', '12202'],
        ranged: ['12203', '12205', '12206', '12207', '12202', '12204'],
        melee: ['12203', '12202', '12207', '12205', '12206', '12204'],
      },
    };
    const allKeys = (RUN_ITEMS_BY_CAT[cat] || []).map((it) => it.key);
    const base = presets[cat]?.[scaling] || allKeys;
    return [...base.filter((k) => allKeys.includes(k)), ...allKeys.filter((k) => !base.includes(k))];
  }

  function getJobItemOrder(cat, job = getActiveJobName()) {
    const ex = getExtra();
    const allKeys = (RUN_ITEMS_BY_CAT[cat] || []).map((it) => it.key);
    const saved = ex.itemOrderByJob?.[job]?.[cat];
    if (Array.isArray(saved) && saved.length) {
      return [...saved.filter((k) => allKeys.includes(k)), ...allKeys.filter((k) => !saved.includes(k))];
    }
    return getDefaultItemOrderForJob(cat, job);
  }

  function setJobItemOrder(cat, nextKeys, job = getActiveJobName()) {
    const ex = getExtra();
    const byJob = { ...(ex.itemOrderByJob || {}) };
    byJob[job] = { ...(byJob[job] || {}), [cat]: nextKeys };
    saveExtra({ itemOrderByJob: byJob });
  }

  function getJobLockedItem(cat, job = getActiveJobName()) {
    const ex = getExtra();
    const key = String(ex.lockedItemByJob?.[job]?.[cat] || '').trim();
    return RUN_ITEMS_BY_KEY[key]?.category === cat ? key : '';
  }

  function setJobLockedItem(cat, key, job = getActiveJobName()) {
    const ex = getExtra();
    const clean = key && RUN_ITEMS_BY_KEY[key]?.category === cat ? key : '';
    const byJob = { ...(ex.lockedItemByJob || {}) };
    byJob[job] = { ...(byJob[job] || {}), [cat]: clean };
    saveExtra({ lockedItemByJob: byJob });
  }

  const PRESET_AFFIXES = [
    { keyword: '目標', label: '目標 (+2 / +4 目標)' }, { keyword: '傷害', label: '傷害 (+20% / +25% / +40%)' },
    { keyword: '冷卻縮減', label: '冷卻縮減 (+6 / +7.5 / +9)' }, { keyword: '詠唱速度', label: '詠唱速度' },
    { keyword: '範圍', label: '範圍 (+% 技能範圍)' }, { keyword: '爆擊', label: '爆擊率 / 暴擊傷害' },
    { keyword: '攻擊速度', label: '攻擊速度' }, { keyword: '穿透', label: '穿透' },
    { keyword: '彈射', label: '彈射 / 連鎖' }, { keyword: 'INT', label: 'INT 智力' },
    { keyword: 'STR', label: 'STR 力量' }, { keyword: 'DEX', label: 'DEX 靈巧' },
  ];

  const DEFAULT_CONFIG = {
    selectionActionMode: 'hybrid_bridge', minDelayMs: 300, maxDelayMs: 600, cooldownAfterClickMs: 800,
    domSelectors: { containerSelector: '', cardSelector: '', titleSelector: '', descSelector: '', replayBtnSelector: '', expeditionBtnSelector: '', startStageBtnSelector: '' },
    autoMoveConfig: {
      mode: 'stationary', style: 'human_natural', keyScheme: 'wasd', radiusPx: 220, moveSpeedPxPerSec: 200,
      stepDurationMs: 950, stepDurationMinMs: 650, stepDurationMaxMs: 1350,
      pauseBetweenStepsMs: 260, pauseBetweenStepsMinMs: 150, pauseBetweenStepsMaxMs: 420,
      autoCenterOnStageStart: true, autoZoomMinimapOnStart: true, minimapZoomClicks: 2,
      autoZoomCameraOnStart: true, cameraZoomOutSteps: 8,
      autoLootChests: false, returnToCenterAfterLoot: true,
      lootPriorities: { magnet: true, equip: true, chest: false, supply: false },
      lootOrder: ['magnet', 'equip', 'chest', 'supply'],
      smartMagnetEnabled: true, magnetFirstMin: 2.5, magnetIntervalMin: 3.0, magnetEndRemainingMin: 3.0,
      bossRedDodgeEnabled: true,
      moonlightBellDodgeEnabled: true,
      swarmBreakoutEnabled: true,
      obstacleMemoryEnabled: true,
    },
    defaultProfileId: 'ro-mage-fixed-build',
    profiles: [{
      id: 'ro-mage-fixed-build', name: '巫師 · 三元素箭派', strictOrderMode: true,
      priorityKeywords: [
        { keyword: '目標', weight: 100, note: '第一優先（+2/+4 目標或複合目標+傷害）' },
        { keyword: '傷害', weight: 85, note: '第二順位（+20%/+25% 傷害）' },
        { keyword: '冷卻縮減', weight: 70, note: '第三順位（+6/+7.5 冷卻縮減）' },
        { keyword: '詠唱速度', weight: 60, note: '施法加速' },
        { keyword: 'INT', weight: 55, note: '智力主屬性' },
      ],
      chestPriorityKeywords: [
        { keyword: '拾取範圍', weight: 100, note: '順位 1：+公尺拾取範圍' },
        { keyword: '傷害', weight: 90, note: '順位 2：+傷害 %' },
        { keyword: '詠唱速度', weight: 80, note: '順位 3：+詠唱速度' },
        { keyword: 'INT', weight: 70, note: '順位 4：+INT 智力' },
        { keyword: 'DEX', weight: 60, note: '順位 5：+DEX 靈巧' },
        { keyword: '冷卻縮減', weight: 50, note: '順位 6：+冷卻縮減' },
      ],
      chestConfig: { enabled: true, preferredItems: ['採集藥水', '思想神器', '詠唱秘藥', '傷害祝福', '範圍祝福'], fallbackMode: 'priority' },
      bannedKeywords: [],
      synergyRules: [{ ifOwned: '技能欄位已滿 4/4', boostTarget: '目標', reason: '技能確定後全力堆疊目標與傷害' }],
      autoBuildConfig: { enabled: true, coreSkills: ['火箭術', '冰箭術', '雷擊術'], fourthFillerSkills: ['聖靈召喚', '心靈爆破'], alwaysBanishSkills: ['屬性附加'] },
    }],
  };

  const DEFAULT_EXTRA = {
    jobOverride: 'auto', autoBuildEnabled: true, fourthOrder: JOB_PRESETS['巫師'].fourthOrder,
    fourthOrderByJob: {}, fourthAcceptedByJob: {}, banishOrderByJob: {},
    useNativeAutoAfterBanish: true, useNativeAutoChest: false, acceptTopN: 3, rerollForSkill: true, preferLegendaryCore: true,
    autoPickSkillDeity: true, skillDeityOrderByJob: {}, lockedSkillDeityByJob: {},
    deityOrder: JOB_PRESETS['巫師'].artifactOrder, deityOrderByJob: {}, lockedDeityByJob: {},
    rerollForDeity: true, deityTopN: 3,
    prioritizePickupPotion: true, chestRerollAllEarly: true, chestSingleRerollItem: true, aggressivePotionReroll: true,
    focusConfig: { enabled: true, focusDeity: true, focusPotion: true },
    itemOrderByJob: {}, lockedItemByJob: {},
    itemTopNByCat: { '藥水': 1, '秘藥': 1, '祝福': 1, '料理': 1 },
    rerollItemByCat: { '藥水': true, '秘藥': true, '祝福': true, '料理': true },
    timerEnabled: false, timerMin: 10, timerSec: 0, pauseOnHidden: true, autoPauseGameOnStop: true,
    upgradeMode: 'accumulate_auto', bankThreshold: 1, autoOpenBank: true,
    farmMode: 'lobby_target', farmStageId: 'payon_cave', farmDualEnabled: false, farmStage2Id: 'louyang', farmStage2Ids: ['louyang'], farmDualChancePct: 35,
    farmMaxRuns: 0, farmSettleDelaySec: 3,
    farmRestEnabled: false, farmRestMinRuns: 4, farmRestMaxRuns: 6, farmRestMinMin: 25, farmRestMaxMin: 55,
    farmVillageDwellEnabled: true, farmVillageDwellMinSec: 10, farmVillageDwellMaxSec: 60,
    farmAutoPlayLobby: true, farmLobbyChoice: 'solo', farmLowHpWarnPct: 30, autoHpDodge: true,
    bridgeUrl: 'http://127.0.0.1:17325', bridgeRequireFocus: true, bridgeAllowClick: true,
    capPickupEnabled: true, capPickupMax: 40, capDiscoveryEnabled: true, capDiscoveryMax: 300,
    capDeityEnabled: true, capDeityMax: 10,
    autoSampleCStats: true,
    basePickupRange: null, baseDiscoveryPct: null, stageCenterMap: {}, stageObstacleMap: {},
  };
  const savedOverrides = GM_getValue('skillpick_overrides', {});
  if (savedOverrides && savedOverrides.selectionActionMode && !['hybrid_bridge', 'advisor_only'].includes(savedOverrides.selectionActionMode)) {
    savedOverrides.selectionActionMode = 'hybrid_bridge';
  }
  const CONFIG = {
    ...DEFAULT_CONFIG,
    ...savedOverrides,
    domSelectors: {
      ...DEFAULT_CONFIG.domSelectors,
      ...(savedOverrides.domSelectors || {}),
    },
    autoMoveConfig: (() => {
      const savedMove = savedOverrides.autoMoveConfig || {};
      const defaultOrder = ['magnet', 'equip', 'chest', 'supply'];
      const savedOrder = Array.isArray(savedMove.lootOrder)
        ? savedMove.lootOrder.filter((k) => defaultOrder.includes(k))
        : [];
      const mergedOrder = [...savedOrder, ...defaultOrder.filter((k) => !savedOrder.includes(k))];
      const merged = {
        ...DEFAULT_CONFIG.autoMoveConfig,
        ...savedMove,
        lootPriorities: {
          ...DEFAULT_CONFIG.autoMoveConfig.lootPriorities,
          ...(savedMove.lootPriorities || {}),
        },
        lootOrder: mergedOrder,
      };
      // 自動將舊版高頻固定 260ms / 0ms 設定升級為防偵測擬人自然隨機範圍
      if (
        !savedMove.style ||
        (savedMove.style === 'smooth_continuous' && Number(savedMove.stepDurationMs) === 260 && Number(savedMove.pauseBetweenStepsMs) === 0)
      ) {
        merged.style = 'human_natural';
        merged.stepDurationMs = 950;
        merged.stepDurationMinMs = 650;
        merged.stepDurationMaxMs = 1350;
        merged.pauseBetweenStepsMs = 260;
        merged.pauseBetweenStepsMinMs = 150;
        merged.pauseBetweenStepsMaxMs = 420;
      } else {
        // 舊版單一固定數值相容升級為隨機範圍
        if (savedMove.stepDurationMinMs === undefined || savedMove.stepDurationMaxMs === undefined) {
          const baseS = Math.max(200, Number(savedMove.stepDurationMs) || 950);
          merged.stepDurationMinMs = Math.max(200, Math.round(baseS * 0.7));
          merged.stepDurationMaxMs = Math.min(4000, Math.max(merged.stepDurationMinMs + 100, Math.round(baseS * 1.4)));
        }
        if (savedMove.pauseBetweenStepsMinMs === undefined || savedMove.pauseBetweenStepsMaxMs === undefined) {
          const baseP = Math.max(0, Number(savedMove.pauseBetweenStepsMs) ?? 260);
          merged.pauseBetweenStepsMinMs = Math.max(0, Math.round(baseP * 0.6));
          merged.pauseBetweenStepsMaxMs = Math.min(3000, Math.max(merged.pauseBetweenStepsMinMs, Math.round(baseP * 1.6)));
        }
      }
      return merged;
    })(),
  };

  function getMoveTimingRanges(cfg = CONFIG.autoMoveConfig) {
    const style = cfg?.style || 'human_natural';
    const defaults =
      style === 'smooth_continuous'
        ? { sMin: 480, sMax: 980, pMin: 80, pMax: 220 }
        : style === 'burst_pause'
        ? { sMin: 360, sMax: 720, pMin: 160, pMax: 360 }
        : { sMin: 650, sMax: 1350, pMin: 150, pMax: 420 };
    const legacyStep = Number(cfg?.stepDurationMs);
    const legacyPause = Number(cfg?.pauseBetweenStepsMs);
    const hasSMin = cfg?.stepDurationMinMs !== undefined && cfg?.stepDurationMinMs !== null && Number.isFinite(Number(cfg.stepDurationMinMs));
    const hasSMax = cfg?.stepDurationMaxMs !== undefined && cfg?.stepDurationMaxMs !== null && Number.isFinite(Number(cfg.stepDurationMaxMs));
    const hasPMin = cfg?.pauseBetweenStepsMinMs !== undefined && cfg?.pauseBetweenStepsMinMs !== null && Number.isFinite(Number(cfg.pauseBetweenStepsMinMs));
    const hasPMax = cfg?.pauseBetweenStepsMaxMs !== undefined && cfg?.pauseBetweenStepsMaxMs !== null && Number.isFinite(Number(cfg.pauseBetweenStepsMaxMs));
    const rawSMin = hasSMin
      ? Number(cfg.stepDurationMinMs)
      : Number.isFinite(legacyStep) && legacyStep > 0
      ? Math.round(legacyStep * 0.7)
      : defaults.sMin;
    const rawSMax = hasSMax
      ? Number(cfg.stepDurationMaxMs)
      : Number.isFinite(legacyStep) && legacyStep > 0
      ? Math.round(legacyStep * 1.4)
      : defaults.sMax;
    const rawPMin = hasPMin
      ? Number(cfg.pauseBetweenStepsMinMs)
      : Number.isFinite(legacyPause) && legacyPause >= 0
      ? Math.round(legacyPause * 0.6)
      : defaults.pMin;
    const rawPMax = hasPMax
      ? Number(cfg.pauseBetweenStepsMaxMs)
      : Number.isFinite(legacyPause) && legacyPause >= 0
      ? Math.round(legacyPause * 1.6)
      : defaults.pMax;
    const stepMin = Math.max(200, Math.min(3000, Math.round(Math.min(rawSMin, rawSMax))));
    const stepMax = Math.max(stepMin, Math.min(4000, Math.round(Math.max(rawSMin, rawSMax))));
    const pauseMin = Math.max(0, Math.min(2000, Math.round(Math.min(rawPMin, rawPMax))));
    const pauseMax = Math.max(pauseMin, Math.min(3000, Math.round(Math.max(rawPMin, rawPMax))));
    return { stepMin, stepMax, pauseMin, pauseMax };
  }

  function randomInRangeMs(minMs, maxMs) {
    const lo = Math.min(Number(minMs) || 0, Number(maxMs) || 0);
    const hi = Math.max(Number(minMs) || 0, Number(maxMs) || 0);
    if (hi <= lo) return Math.round(lo);
    const u = Math.random() * 0.6 + ((Math.random() + Math.random()) * 0.5) * 0.4;
    return Math.round(lo + u * (hi - lo));
  }
  const savedProfileId = GM_getValue('skillpick_active_profile_id', CONFIG.defaultProfileId);
  const initialProfile =
    (Array.isArray(CONFIG.profiles) && CONFIG.profiles.find((p) => p.id === savedProfileId)) ||
    CONFIG.profiles[0];
  CONFIG.strategy = savedOverrides.strategy || initialProfile;
  const state = {
    activeProfileId: CONFIG.strategy.id || CONFIG.defaultProfileId,
    autoEnabled: Boolean(GM_getValue('skillpick_auto_enabled', false)),
    autoBuildEnabled: GM_getValue('skillpick_extra', {})?.autoBuildEnabled !== false,
    farmEnabled: GM_getValue('skillpick_farm_enabled', false),
    farmManualAutoOff: false,
    farmManualMoveOff: false,
    farmRunsDone: 0,
    farmSessionRunsDone: 0,
    farmSessionTargetRuns: 0,
    farmRestUntil: 0,
    farmRestInfo: null,
    loginWaitLogAt: 0,
    loginErrorLogAt: 0,
    farmLockUntil: 0,
    farmReloadPending: false,
    farmDoneHalted: Boolean(GM_getValue('skillpick_farm_done_halt', null)),
    activeFarmStageId: null,
    farmStageStreakId: null,
    farmStageStreakCount: 0,
    lastSecondaryStageId: null,
    keyWatchdog: { key: '', progressSig: '', count: 0, firstAt: 0, lastAt: 0, escTried: false },
    setHudMinimized: null,
    villageDwellPending: false,
    villageDwellPlan: null,
    lastRerolledChestSig: '',
    lastRerolledChestAt: 0,
    summarySeenAt: 0,
    summaryActed: false,
    stageSelectedThisModal: null,
    npcWalking: false,
    npcWalkTimer: null,
    npcWalkAttempts: 0,
    npcWalkLastDist: null,
    npcWalkLogAt: 0,
    npcClickRetryPhase: 0,
    festivalDetourStep: 0,
    festivalRoutePlan: null,
    npcStuckSteps: 0,
    npcLastMoveMode: '',
    wrongNpcCount: 0,
    wrongNpcCloseUntil: 0,
    npcUnstickNeeded: false,
    autoEnteringLobbyUntil: 0,
    returningFromSummaryUntil: 0,
    farmHpWarnedAt: 0,
    lowHpEvading: false,
    lastExpNearFullAt: 0,
    lastExpText: '',
    pickingLockUntil: 0,
    bankCooldownUntil: 0,
    lastDomSignature: '',
    lastPickerDiagAt: 0,
    pendingPickTimer: null,
    banishCooldownUntil: 0,
    banishInFlight: false,
    banishInFlightUntil: 0,
    banishChainCount: 0,
    rerollCooldownUntil: 0,
    focusCooldownUntil: 0,
    swapConfirmCooldownUntil: 0,
    pendingSwapConfirm: null,
    ownedSkills: [],
    pickCount: 0,
    logs: [],
    statValidationRecords: [],
    statValidationStats: { total: 0, ok: 0, softDrift: 0, corrected: 0, invalid: 0 },
    statValidationLastSigAt: {},
    statWarnLastSigAt: {},
    schemaAuditResult: auditRunItemTierSchema(),
    currentOp: '就緒，等待開啟自動選擇',
    pickerActive: false,
    observerTimer: null,
    // 走位狀態（進關卡時預設在地圖中心點 (0, 0)）
    posX: 0,
    posY: 0,
    mapCenterCoord: null, // { x: 143, y: 99, stageName: '洛陽' }
    lastCoord: null,      // { x: 143, y: 99 }
    navTarget: null,      // { type: 'chest' | 'center', dist: number }
    lastMagnetPickupTime: 0,
    initialClockSec: undefined,
    clockDir: 'up',       // 'up' (00:00→關卡總長) 或 'down' (倒數計時)
    inBossCountdown: false,
    lastHpSamplePct: null,
    lastHpDropAt: 0,
    lastAmbientRedScanAt: 0,
    lastBossHoldReleaseLogAt: 0,
    swarmBreakout: {
      active: false,
      startedAt: 0,
      until: 0,
      headingAngle: 0,
      dirLabel: '',
      triggerText: '',
      startCoord: null,
      lastCheckCoord: null,
      lastCheckAt: 0,
      stuckDeflects: 0,
      escapedRing: false,
      curveSign: 1,
    },
    swarmPostGraceUntil: 0,
    swarmLastTriggerAt: 0,
    swarmLastAnnounceRaw: '',
    swarmScheduledFired: {},
    moveWaypoint: null,   // { x: number, y: number, legsLeft: number }
    moveKeyTimers: [],
    lastBridgeFocusSkipAt: 0,
    obstacleRuntime: {
      walkedByStage: {},
      lastHitAtByKey: {},
      stageMap: null,
      dirty: false,
      flushTimer: null,
      astarCache: null,
      lastAstarLogAt: 0,
      lastSteerLogAt: 0,
      lastNavMode: '',
    },
    lastMinimapPlayerPt: null,
    lastMinimapScanAt: 0,
    lastMinimapScanResult: null,
    minimapZoomDoneForRun: false,
    minimapZoomBusy: false,
    cameraZoomDoneForRun: false,
    cameraZoomBusy: false,
    lastLootLogAt: 0,
    lastBossKiteLogAt: 0,
    lastBossSeenAt: 0,
    lastBossRedScanAt: 0,
    lastBossRedScan: null,
    bossRedFootStreak: 0,
    bossRedBlankCount: 0,
    bossRedBlankWarned: false,
    bossRedDodgeState: null,
    lastBossRedLogAt: 0,
    bossRedCanvas: null,
    bossRedCtx: null,
    lastMoonlightBellScanAt: 0,
    lastMoonlightBellScan: null,
    moonlightState: {
      active: false,
      phase: 'idle', // 'idle' | 'seek_p1' | 'hold_p1' | 'fight_berserk' | 'seek_p2' | 'hold_p2' | 'reposition'
      phaseStartedAt: 0,
      phaseTimeoutAt: 0,
      phaseHardTimeoutAt: 0,
      bellCoord: null,
      holdAnchorCoord: null,
      holdEnteredAt: 0,
      holdOutsideFrames: 0,
      lastBellCanvasTarget: null,
      lastBellSeenAt: 0,
      lastBossCoord: null,
      stuckStreak: 0,
      lastStuckCoord: null,
      lastStuckMsAccum: 0,
      detourAngle: null,
      detourUntil: 0,
      consecutiveNoBellFrames: 0,
      consecutiveSafeEndFrames: 0,
      lastAnnounceText: '',
      lastPhaseLogAt: 0,
      repositionAngle: 0,
      repositionUntil: 0,
    },
    moveAngle: Math.random() * Math.PI * 2,
    moveTurnBias: Math.random() < 0.5 ? 1 : -1,
    heldKeys: new Set(),
    heldKeySince: {},
    moveStepTimer: null,
    humanOverrideUntil: 0,
    isBurstMoving: false,
    stuckRefCoord: null,
    stuckMoveMsAccum: 0,
    stuckCount: 0,
    detourUntil: 0,
    detourAngle: 0,
    lastStuckLogAt: 0,
    ignoredLootTargets: [],
    lastSkippedChestCost: null,
    fallbackCoordSearchAt: 0,
    // 本場進度
    run: {
      fourthSkill: null,
      fourthBanished: false,
      attrBanished: false,
      banishedKeys: [],
      focusedKeys: [],
      nativeSkillAutoClicked: false,
      deity: null,
      items: { '藥水': null, '秘藥': null, '祝福': null, '料理': null },
      pickupBonus: 0,
      discoveryBonus: 0,
      itemPickupByKey: {},
      itemDiscByKey: {},
      skillPickupBonus: 0,
      skillDiscBonus: 0,
      lastTrackedBonusSig: '',
      lastTrackedBonusAt: 0,
    },
    paused: false,
    pauseReason: '',
    pendingGamePauseOnVisible: false,
    timerTriggered: false,
    lastClockSec: null,
    clockEl: null,
    clockSearchAt: 0,
    audioCtx: null,
    alarmTimer: null,
    bridgeOnline: false,
    bridgeModeName: '',
    bridgeLastCheckAt: 0,
    bridgeError: '',
    bridgePending: false,
    bridgeExpectedKeyUntil: {},
    bridgeCalibOffset: { dx: 0, dy: 0 },
    bridgeWinRect: null,
    bridgeVpCalib: null,
    lastTrustedMouse: { clientX: -1, clientY: -1, at: 0 },
  };
  // 真實實體輸入：只允許「混合橋接（本機送真實按鍵 1-4）」或「純提示建議（不發送任何事件）」
  // 移除非實體按鍵與所有網頁 JS 合成事件
  const ALLOWED_ACTION_MODES = ['hybrid_bridge', 'advisor_only'];
  function normalizeActionMode(mode) {
    return ALLOWED_ACTION_MODES.includes(mode) ? mode : 'hybrid_bridge';
  }

  const ACTION_LABELS = {
    hybrid_bridge: '混合橋接 (本機送真實按鍵 1-4)',
    advisor_only: '純提示建議 (不發送任何事件)',
  };

  function getExtra() {
    const saved = GM_getValue('skillpick_extra', {}) || {};
    const merged = { ...DEFAULT_EXTRA, ...saved };
    if (!saved.upgradeMode && typeof saved.autoOpenBank === 'boolean') {
      merged.upgradeMode = saved.autoOpenBank ? 'accumulate_auto' : 'accumulate_manual';
    }
    if (merged.farmMode === 'repeat_current') {
      merged.farmMode = 'lobby_target';
    }
    const validStageIds = new Set(STAGES_DATA.map((s) => s.id));
    if (!validStageIds.has(merged.farmStageId)) {
      merged.farmStageId = 'payon_cave';
    }
    if (Array.isArray(saved.farmStage2Ids)) {
      merged.farmStage2Ids = Array.from(new Set(saved.farmStage2Ids.filter((id) => validStageIds.has(id))));
    } else if (typeof saved.farmStage2Id === 'string' && validStageIds.has(saved.farmStage2Id)) {
      merged.farmStage2Ids = [saved.farmStage2Id];
    } else {
      merged.farmStage2Ids = ['louyang'];
    }
    merged.farmStage2Id = merged.farmStage2Ids[0] || (merged.farmStageId === 'louyang' ? 'payon_cave' : 'louyang');
    return merged;
  }

  function saveExtra(patch) {
    GM_setValue('skillpick_extra', { ...getExtra(), ...patch });
  }

  const RUN_SESSION_KEY = 'ro_sp_active_run_v1';
  function saveRunSession() {
    try {
      sessionStorage.setItem(RUN_SESSION_KEY, JSON.stringify({
        fourthSkill: state.run.fourthSkill || null,
        fourthBanished: Boolean(state.run.fourthBanished),
        attrBanished: Boolean(state.run.attrBanished),
        banishedKeys: Array.isArray(state.run.banishedKeys) ? state.run.banishedKeys : [],
        focusedKeys: Array.isArray(state.run.focusedKeys) ? state.run.focusedKeys : [],
        nativeSkillAutoClicked: Boolean(state.run.nativeSkillAutoClicked),
        deity: state.run.deity || null,
        deityLevel: Number(state.run.deityLevel) || 0,
        skillDeity: state.run.skillDeity || null,
        skillDeityLevel: Number(state.run.skillDeityLevel) || 0,
        deityPending: Boolean(state.run.deityPending),
        items: state.run.items || { '藥水': null, '秘藥': null, '祝福': null, '料理': null },
        pickupBonus: Number(state.run.pickupBonus) || 0,
        discoveryBonus: Number(state.run.discoveryBonus) || 0,
        itemPickupByKey: state.run.itemPickupByKey && typeof state.run.itemPickupByKey === 'object' ? state.run.itemPickupByKey : {},
        itemDiscByKey: state.run.itemDiscByKey && typeof state.run.itemDiscByKey === 'object' ? state.run.itemDiscByKey : {},
        skillPickupBonus: Number(state.run.skillPickupBonus) || 0,
        skillDiscBonus: Number(state.run.skillDiscBonus) || 0,
        mapCenterCoord: state.mapCenterCoord || null,
      }));
    } catch (_) {}
  }

  function restoreRunSession() {
    const emptyItems = { '藥水': null, '秘藥': null, '祝福': null, '料理': null };
    try {
      const raw = sessionStorage.getItem(RUN_SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          const restoredKeys = Array.isArray(parsed.banishedKeys) ? parsed.banishedKeys.filter(Boolean) : [];
          if (parsed.fourthBanished && !restoredKeys.includes('__FOURTH__')) restoredKeys.push('__FOURTH__');
          if (parsed.attrBanished && !restoredKeys.includes('__INNATE__')) restoredKeys.push('__INNATE__');
          state.run = {
            fourthSkill: parsed.fourthSkill || null,
            fourthBanished: Boolean(parsed.fourthBanished) || restoredKeys.includes('__FOURTH__'),
            attrBanished: Boolean(parsed.attrBanished) || restoredKeys.includes('__INNATE__'),
            banishedKeys: restoredKeys,
            focusedKeys: Array.isArray(parsed.focusedKeys) ? parsed.focusedKeys.filter(Boolean) : [],
            nativeSkillAutoClicked: Boolean(parsed.nativeSkillAutoClicked),
            deity: canonicalArtifactName(parsed.deity) || null,
            deityLevel: Number(parsed.deityLevel) || 0,
            skillDeity: parsed.skillDeity || null,
            skillDeityLevel: Number(parsed.skillDeityLevel) || 0,
            deityPending: Boolean(parsed.deityPending),
            items: { ...emptyItems, ...(parsed.items && typeof parsed.items === 'object' ? parsed.items : {}) },
            pickupBonus: Number(parsed.pickupBonus) || 0,
            discoveryBonus: Number(parsed.discoveryBonus) || 0,
            itemPickupByKey: parsed.itemPickupByKey && typeof parsed.itemPickupByKey === 'object' ? parsed.itemPickupByKey : {},
            itemDiscByKey: parsed.itemDiscByKey && typeof parsed.itemDiscByKey === 'object' ? parsed.itemDiscByKey : {},
            skillPickupBonus: Number(parsed.skillPickupBonus) || 0,
            skillDiscBonus: Number(parsed.skillDiscBonus) || 0,
            lastTrackedBonusSig: '',
            lastTrackedBonusAt: 0,
          };
          if (parsed.mapCenterCoord && typeof parsed.mapCenterCoord.x === 'number' && typeof parsed.mapCenterCoord.y === 'number') {
            state.mapCenterCoord = parsed.mapCenterCoord;
          }
        }
      }
    } catch (_) {}
    if (!state.run.items) state.run.items = { ...emptyItems };
  }

  // === 擬人化：延遲抖動（jitter）與按鍵停留時間 ===
  const sleep = (ms) => new Promise((res) => setTimeout(res, Math.max(0, ms)));
  // 常態分布亂數（Box-Muller）
  function gaussRand() {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function clampNum(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }
  // 反應延遲：以 min~max 中點為中心的常態分布，偶爾（約 8%）加上較長的「分心」停頓
  function randomHumanDelay() {
    const min = Number(CONFIG.minDelayMs) || 300;
    const max = Math.max(min, Number(CONFIG.maxDelayMs) || 600);
    const mid = (min + max) / 2;
    const sigma = Math.max(20, (max - min) / 4);
    let v = mid + gaussRand() * sigma;
    if (Math.random() < 0.08) v += 300 + Math.random() * 900;
    return Math.round(clampNum(v, min, max * 2.5));
  }
  // 為固定冷卻時間加上 0~pct 的隨機延長，避免點擊間隔太規律
  function jitterCooldown(baseMs, pct = 0.25) {
    return Math.round(baseMs * (1 + Math.random() * pct));
  }
  // 按住時間：常態分布，限制在合理範圍
  function humanHoldMs(mean = 40, sd = 9, lo = 22, hi = 85) {
    return Math.round(clampNum(mean + gaussRand() * sd, lo, hi));
  }

  // === 1. Closed Shadow DOM 隔離樣式與控制面板 HUD ===
  let hudHost = null;
  let hudRoot = null;

  function $id(id) {
    return hudRoot ? hudRoot.getElementById(id) : null;
  }

  function $q(sel) {
    return hudRoot ? hudRoot.querySelector(sel) : null;
  }

  function $qa(sel) {
    return hudRoot ? Array.from(hudRoot.querySelectorAll(sel)) : [];
  }

  function isOwnHudNode(node) {
    if (!node || !hudHost) return false;
    if (node === hudHost) return true;
    try {
      if (hudHost.contains(node)) return true;
      if (hudRoot && hudRoot.contains(node)) return true;
    } catch (_) {}
    return false;
  }

  const HUD_SHADOW_CSS = `
    :host{all:initial;position:fixed;inset:0;width:0;height:0;overflow:visible;z-index:2147483647;pointer-events:none;}
    *{box-sizing:border-box;}
    #rh-panel{position:fixed;top:16px;left:16px;right:auto;z-index:2147483647;width:318px;max-width:calc(100vw - 20px);max-height:calc(100vh - 24px);display:flex;flex-direction:column;background:rgba(15, 23, 42, 0.95);color:#F1F5F9;border:1px solid rgba(148, 163, 184, 0.32);border-radius:10px;font-family:system-ui, -apple-system, sans-serif;font-size:12px;line-height:1.4;box-shadow:0 12px 32px rgba(0, 0, 0, 0.5);backdrop-filter:blur(8px);overflow:hidden;transition:opacity 0.12s ease;pointer-events:auto;}
    #rh-panel.rh-minimized{top:0px;left:0px;width:76px;height:auto;max-height:none;display:block;border-radius:0 0 10px 0;background:linear-gradient(180deg, rgba(30, 41, 59, 0.96), rgba(15, 23, 42, 0.96));border:1px solid rgba(245, 158, 11, 0.55);box-shadow:0 6px 18px rgba(0, 0, 0, 0.55);}
    #rh-panel.rh-minimized.rh-mini-running{border-color:rgba(34, 197, 94, 0.8);box-shadow:0 6px 18px rgba(22, 163, 74, 0.32);}
    #rh-panel.rh-minimized.rh-mini-paused{border-color:rgba(248, 113, 113, 0.9);box-shadow:0 6px 18px rgba(239, 68, 68, 0.35);}
    #rh-panel.rh-minimized #rh-header, #rh-panel.rh-minimized #rh-body{display:none;}
    #rh-mini-dock{display:none;flex-direction:column;align-items:stretch;gap:3px;padding:3px;width:100%;box-sizing:border-box;}
    #rh-panel.rh-minimized #rh-mini-dock{display:flex;}
    .rh-mini-grid{display:flex;flex-direction:row;align-items:stretch;justify-content:center;gap:3px;width:100%;}
    .rh-mini-col{display:flex;flex-direction:column;align-items:center;gap:3px;}
    .rh-mini-col-toggles{padding-left:4px;border-left:1px solid rgba(148, 163, 184, 0.18);}
    #rh-mini-magnet{display:flex;align-items:center;justify-content:center;gap:2px;width:100%;height:20px;padding:0 3px;margin-top:1px;border-radius:6px;border:1px solid rgba(148, 163, 184, 0.24);background:rgba(2, 6, 23, 0.78);color:#94A3B8;font-family:ui-monospace, SFMono-Regular, Menlo, monospace;font-size:10px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1;white-space:nowrap;overflow:hidden;user-select:none;cursor:move;transition:background 0.15s ease, border-color 0.15s ease, color 0.15s ease;}
    #rh-mini-magnet.rh-mag-ready{background:rgba(22, 163, 74, 0.24);border-color:rgba(74, 222, 128, 0.72);color:#86EFAC;}
    #rh-mini-magnet.rh-mag-wait{background:rgba(30, 58, 138, 0.34);border-color:rgba(96, 165, 250, 0.58);color:#93C5FD;}
    #rh-mini-magnet.rh-mag-cd{background:rgba(180, 83, 9, 0.26);border-color:rgba(251, 191, 36, 0.65);color:#FDE68A;}
    #rh-mini-magnet.rh-mag-rush{background:rgba(194, 65, 12, 0.34);border-color:rgba(251, 146, 60, 0.85);color:#FDBA74;}
    #rh-mini-magnet.rh-mag-track{background:rgba(14, 116, 144, 0.38);border-color:rgba(34, 211, 238, 0.85);color:#67E8F9;}
    #rh-mini-magnet.rh-mag-off{background:rgba(15, 23, 42, 0.65);border-color:rgba(148, 163, 184, 0.2);color:#64748B;}
    .rh-mini-icon-btn{display:flex;width:30px;height:29px;padding:0;margin:0;border:1px solid rgba(148, 163, 184, 0.22);border-radius:7px;background:rgba(15, 23, 42, 0.78);color:#94A3B8;align-items:center;justify-content:center;cursor:pointer;outline:none;user-select:none;position:relative;transition:background 0.14s ease, border-color 0.14s ease, color 0.14s ease;}
    #rh-mini-btn{border-color:rgba(245, 158, 11, 0.38);}
    .rh-mini-icon-btn:hover{background:rgba(51, 65, 85, 0.92);border-color:rgba(245, 158, 11, 0.65);color:#F8FAFC;}
    .rh-mini-icon-btn.rh-mini-toggle-on{background:rgba(22, 163, 74, 0.28);border-color:rgba(74, 222, 128, 0.78);color:#4ADE80;}
    .rh-mini-icon-btn.rh-mini-toggle-on:hover{background:rgba(22, 163, 74, 0.42);border-color:#86EFAC;color:#BBF7D0;}
    .rh-mini-icon-btn.rh-mini-toggle-standby{background:rgba(217, 119, 6, 0.2);border-color:rgba(251, 191, 36, 0.6);color:#FBBF24;}
    .rh-mini-icon-btn.rh-mini-toggle-busy{background:rgba(217, 119, 6, 0.32);border-color:#F59E0B;color:#FDE68A;}
    .rh-mini-icon-btn.rh-mini-toggle-on::after, .rh-mini-icon-btn.rh-mini-toggle-standby::after, .rh-mini-icon-btn.rh-mini-toggle-busy::after{content:'';position:absolute;top:2px;right:2px;width:4px;height:4px;border-radius:999px;background:currentColor;}
    #rh-mini-pause.rh-mini-paused{background:rgba(217, 119, 6, 0.28);border-color:#F59E0B;}
    #rh-mini-stopall.rh-mini-active{background:rgba(127, 29, 29, 0.6);border-color:rgba(248, 113, 113, 0.75);}
    #rh-mini-stopall:hover{background:rgba(153, 27, 27, 0.85);border-color:#FCA5A5;}
    #rh-panel button:focus, #rh-panel button:focus-visible, #rh-panel input:focus, #rh-panel select:focus{outline:none;box-shadow:none;}
    #rh-header{flex-shrink:0;display:flex;align-items:center;justify-content:space-between;padding:8px 11px;background:rgba(30, 41, 59, 0.94);border-bottom:1px solid rgba(148, 163, 184, 0.2);cursor:move;user-select:none;}
    #rh-header-actions{display:flex;align-items:center;gap:4px;}
    #rh-toggle-min, #rh-toggle-folds{background:transparent;border:1px solid rgba(148, 163, 184, 0.25);border-radius:5px;color:#CBD5E1;cursor:pointer;font-size:12px;line-height:1;padding:3px 7px;margin:0;transition:background 0.14s ease, color 0.14s ease, border-color 0.14s ease;}
    #rh-toggle-min:hover, #rh-toggle-folds:hover{background:rgba(51, 65, 85, 0.9);color:#F8FAFC;border-color:rgba(245, 158, 11, 0.55);}
    #rh-body{padding:8px 10px;display:flex;flex-direction:column;gap:6px;flex:1;min-height:0;}
    #rh-panels-scroll{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:6px;scrollbar-width:thin;scrollbar-color:rgba(148, 163, 184, 0.35) transparent;}
    #rh-panels-scroll::-webkit-scrollbar, #rh-log::-webkit-scrollbar{width:5px;}
    #rh-panels-scroll::-webkit-scrollbar-thumb, #rh-log::-webkit-scrollbar-thumb{background:rgba(148, 163, 184, 0.35);border-radius:4px;}
    #rh-tabs{flex-shrink:0;display:flex;flex-wrap:wrap;gap:4px;padding:3px;background:#020617;border:1px solid rgba(148, 163, 184, 0.18);border-radius:7px;}
    .rh-tab{flex:1 0 18%;padding:5px 6px;margin:0;border:none;border-radius:5px;background:transparent;color:#CBD5E1;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;box-shadow:none;}
    .rh-tab:hover{color:#FFFFFF;background:rgba(51, 65, 85, 0.5);}
    .rh-tab-active{background:#D97706;color:#0F172A;}
    .rh-tab-active:hover{background:#F59E0B;color:#0F172A;}
    .rh-tab-panel{display:none;flex-direction:column;gap:5px;}
    .rh-tab-panel.active{display:flex;}
    .rh-row{display:flex;gap:6px;align-items:center;}
    .rh-btn{flex:1;padding:6px 9px;margin:0;border-radius:6px;border:1px solid rgba(148, 163, 184, 0.28);background:#1E293B;color:#F8FAFC;font-size:12.5px;font-weight:600;cursor:pointer;transition:background 0.15s ease;white-space:nowrap;box-shadow:none;}
    .rh-btn:hover{background:#334155;}
    .rh-btn-sm{flex:0 0 auto;padding:5px 8px;font-size:11.5px;}
    .rh-btn-primary{background:#D97706;border-color:#F59E0B;color:#0F172A;}
    .rh-btn-primary:hover{background:#F59E0B;}
    .rh-btn-active{background:#16A34A;border-color:#22C55E;color:#FFFFFF;}
    .rh-btn-active:hover{background:#15803D;}
    .rh-select{flex:1;min-width:0;padding:5px 8px;border-radius:6px;border:1px solid rgba(148, 163, 184, 0.3);background:#020617;color:#F8FAFC;font-size:12px;font-weight:600;outline:none;cursor:pointer;}
    .rh-num{width:52px;padding:4px 6px;border-radius:6px;border:1px solid rgba(148, 163, 184, 0.3);background:#020617;color:#F8FAFC;font-size:12px;text-align:center;}
    .rh-check{width:14px;height:14px;margin:0;padding:0;accent-color:#F59E0B;cursor:pointer;flex-shrink:0;}
    .rh-range{width:100%;height:6px;margin:2px 0;padding:0;accent-color:#F59E0B;cursor:pointer;background:transparent;}
    .rh-hint{background:transparent;border:none;padding:0;margin:0;color:#CBD5E1;font-size:12px;font-weight:500;line-height:1.45;}
    .rh-box{background:rgba(2, 6, 23, 0.65);border:1px solid rgba(148, 163, 184, 0.18);border-radius:6px;padding:6px 8px;display:flex;flex-direction:column;gap:5px;}
    .rh-ord-row{display:flex;gap:4px;align-items:center;background:#0F172A;border:1px solid rgba(148, 163, 184, 0.22);border-radius:6px;padding:3px 5px;}
    .rh-modal{position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(15, 23, 42, 0.96);backdrop-filter:blur(4px);z-index:50;display:flex;flex-direction:column;padding:10px;overflow-y:auto;}
    .rh-modal-content{background:#0F172A;border:1px solid rgba(148, 163, 184, 0.35);border-radius:8px;width:100%;display:flex;flex-direction:column;gap:8px;padding:10px;box-sizing:border-box;}
    .rh-modal-header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(148, 163, 184, 0.18);padding-bottom:6px;}
    .rh-modal-body{display:flex;flex-direction:column;gap:7px;}
    details.rh-fold{background:rgba(2, 6, 23, 0.56);border:1px solid rgba(148, 163, 184, 0.2);border-radius:6px;overflow:hidden;flex-shrink:0;transition:border-color 0.15s ease;}
    details.rh-fold[open]{border-color:rgba(245, 158, 11, 0.34);}
    details.rh-fold > summary.rh-fold-sum{list-style:none;cursor:pointer;user-select:none;display:flex;align-items:center;gap:5px;padding:5px 8px;font-size:11.5px;font-weight:600;color:#E2E8F0;background:rgba(30, 41, 59, 0.6);transition:background 0.14s ease;}
    details.rh-fold > summary.rh-fold-sum::-webkit-details-marker{display:none;}
    details.rh-fold > summary.rh-fold-sum:hover{background:rgba(51, 65, 85, 0.78);}
    details.rh-fold > summary.rh-fold-sum::before{content:'▸';color:#F59E0B;font-size:11px;flex-shrink:0;transition:transform 0.14s ease;}
    details.rh-fold[open] > summary.rh-fold-sum::before{transform:rotate(90deg);}
    .rh-fold-title{color:#F8FAFC;white-space:nowrap;flex-shrink:0;}
    .rh-fold-meta{margin-left:auto;color:#93C5FD;font-size:10.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}
    .rh-fold-body{padding:6px 8px 7px;display:flex;flex-direction:column;gap:5px;border-top:1px solid rgba(148, 163, 184, 0.14);}
    #rh-status-bar{flex-shrink:0;background:rgba(2, 6, 23, 0.78);border:1px solid rgba(148, 163, 184, 0.22);border-radius:6px;padding:5px 8px;display:flex;flex-direction:column;gap:3px;}
    #rh-status-badges{display:flex;flex-wrap:wrap;gap:4px;align-items:center;}
    .rh-badge{display:inline-flex;align-items:center;padding:2px 6px;border-radius:4px;font-size:10.5px;font-weight:600;background:rgba(30, 41, 59, 0.95);color:#E2E8F0;border:1px solid rgba(148, 163, 184, 0.24);}
    .rh-badge-on{background:rgba(22, 163, 74, 0.22);color:#86EFAC;border-color:rgba(34, 197, 94, 0.5);}
    .rh-badge-busy{background:rgba(217, 119, 6, 0.24);color:#FCD34D;border-color:rgba(245, 158, 11, 0.55);}
    #rh-current-op{font-size:11px;color:#F1F5F9;background:transparent;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    #rh-log{max-height:98px;overflow-y:auto;background:#020617;padding:5px 8px;font-family:ui-monospace, monospace;font-size:10.5px;line-height:1.42;color:#CBD5E1;word-break:break-word;}
    #rh-log > div{background:transparent;color:#CBD5E1;}
    #rh-log > div.rh-log-latest{color:#FFFFFF;font-weight:500;}
    #rh-probe-banner{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:2147483647;border-radius:8px;padding:8px 14px;font-family:system-ui, -apple-system, sans-serif;font-size:12.5px;font-weight:700;box-shadow:0 10px 28px rgba(0, 0, 0, 0.55);background:rgba(15, 23, 42, 0.96);color:#FCD34D;border:1px solid rgba(245, 158, 11, 0.65);pointer-events:none;}
  `;

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function addLog(msg) {
    const time = new Date().toLocaleTimeString('zh-TW', { hour12: false });
    console.log(`[RO-AutoPick ${time}] ${msg}`);
    state.logs.unshift(`[${time}] ${msg}`);
    if (state.logs.length > 200) state.logs.pop();
    const logEl = $id('rh-log');
    if (logEl) {
      logEl.innerHTML = state.logs
        .slice(0, 50)
        .map((l, i) => `<div class="${i === 0 ? 'rh-log-latest' : ''}">${escapeHtml(l)}</div>`)
        .join('');
      logEl.scrollTop = 0;
    }
    updateStatusBar(msg);
  }

  // === 副本挑戰成功／失敗戰績統計（跨場持久化保存，供改版後調校數據分析） ===
  const CHALLENGE_STATS_KEY = 'skillpick_challenge_stats';

  function createEmptyChallengeStats() {
    return {
      total: 0,
      wins: 0,
      fails: 0,
      unknowns: 0,
      byStage: {},
      history: [],
    };
  }

  function classifyChallengeOutcomeText(text) {
    const t = String(text || '').trim();
    if (!t) return 'unknown';
    const winRe = /你存活下來了|存活下來|存活成功|勝利|通關|挑戰成功|討伐成功|擊敗頭目|擊敗首領|過關|完成挑戰|關卡完成|凱旋|\b(?:you\s*survived|survived|victory|cleared|stage\s*clear|boss\s*defeated|completed|you\s*win)\b/i;
    const failRe = /你死了|死了|失敗|陣亡|死亡|戰敗|倒下|被擊敗|遊戲結束|挑戰失敗|時間到|超時|全滅|落敗|\b(?:defeat|defeated|game\s*over|you\s*died|failed|fallen|time'?s?\s*up)\b/i;
    const hasWin = winRe.test(t);
    const hasFail = failRe.test(t);
    if (hasWin && !hasFail) return 'win';
    if (hasFail && !hasWin) return 'fail';
    return 'unknown';
  }

  function loadChallengeStats() {
    try {
      const raw = GM_getValue(CHALLENGE_STATS_KEY, null);
      if (!raw || typeof raw !== 'object') return createEmptyChallengeStats();
      const st = {
        total: Math.max(0, Number(raw.total) || 0),
        wins: Math.max(0, Number(raw.wins) || 0),
        fails: Math.max(0, Number(raw.fails) || 0),
        unknowns: Math.max(0, Number(raw.unknowns) || 0),
        byStage: raw.byStage && typeof raw.byStage === 'object' ? raw.byStage : {},
        history: Array.isArray(raw.history) ? raw.history.slice(0, 80) : [],
      };
      // 自動修復舊版未識別的「你存活下來了！」／「你死了」未明紀錄
      let migrated = false;
      for (const h of st.history) {
        if (!h || h.outcome !== 'unknown' || !h.rawTitle) continue;
        const nextOutcome = classifyChallengeOutcomeText(h.rawTitle);
        if (nextOutcome === 'unknown') continue;
        h.outcome = nextOutcome;
        migrated = true;
        if (st.unknowns > 0) st.unknowns -= 1;
        if (nextOutcome === 'win') st.wins += 1;
        else if (nextOutcome === 'fail') st.fails += 1;
        const b = h.stage && st.byStage[h.stage];
        if (b && typeof b === 'object') {
          if ((Number(b.unknowns) || 0) > 0) b.unknowns = Number(b.unknowns) - 1;
          if (nextOutcome === 'win') {
            b.wins = (Number(b.wins) || 0) + 1;
          } else if (nextOutcome === 'fail') {
            b.fails = (Number(b.fails) || 0) + 1;
            if (typeof h.durationSec === 'number' && h.durationSec > 0) {
              b.failDurSec = (Number(b.failDurSec) || 0) + h.durationSec;
              b.failDurCount = (Number(b.failDurCount) || 0) + 1;
            }
          }
        }
      }
      if (migrated) saveChallengeStats(st);
      return st;
    } catch (_) {
      return createEmptyChallengeStats();
    }
  }

  function saveChallengeStats(stats) {
    try {
      GM_setValue(CHALLENGE_STATS_KEY, stats);
    } catch (_) {}
  }

  function updateChallengeStatsHud() {
    const el = $id('rh-challenge-stats-text');
    if (!el) return;
    const st = loadChallengeStats();
    if (!st.total) {
      el.textContent = '戰績：尚無紀錄（結算後自動統計）';
      el.title = '每次進入副本結算畫面時自動統計成功／失敗次數與各副本勝率';
      return;
    }
    const decided = st.wins + st.fails;
    const rateTxt = decided > 0 ? `${((st.wins / decided) * 100).toFixed(1)}%` : '--';
    const unkTxt = st.unknowns > 0 ? ` ${st.unknowns}未明` : '';
    el.textContent = `戰績：${st.wins}勝 ${st.fails}敗${unkTxt}（勝率 ${rateTxt}｜共 ${st.total} 場）`;
    const stageLines = Object.entries(st.byStage || {})
      .sort((a, b) => (Number(b[1]?.total) || 0) - (Number(a[1]?.total) || 0))
      .map(([name, rec]) => {
        const w = Number(rec?.wins) || 0;
        const f = Number(rec?.fails) || 0;
        const t = Number(rec?.total) || 0;
        const d = w + f;
        const r = d > 0 ? `${((w / d) * 100).toFixed(1)}%` : '--';
        return `${name}：${w}勝 ${f}敗（${r}｜共${t}場）`;
      });
    el.title = stageLines.length ? `各副本挑戰統計：\n${stageLines.join('\n')}` : el.textContent;
  }

  function resetChallengeStats() {
    saveChallengeStats(createEmptyChallengeStats());
    updateChallengeStatsHud();
    addLog('[挑戰統計] 已歸零副本挑戰成功／失敗戰績紀錄');
  }

  function detectSummaryOutcome(summaryWin) {
    try {
      const goWrap = document.querySelector('#gameover') || summaryWin?.closest?.('#gameover');
      const clsStr = `${goWrap?.className || ''} ${summaryWin?.className || ''}`;
      const headNodes = Array.from(
        summaryWin?.querySelectorAll?.('h1, h2, h3, .go-title, .summary-title, .win-title, .title, .ro-title, header, strong') || []
      );
      const headTexts = headNodes
        .map((n) => (n.innerText || n.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      const fullText = (summaryWin?.innerText || summaryWin?.textContent || '').replace(/\s+/g, ' ').trim();
      const primaryTitle = headTexts[0] || fullText.split(/[\n|｜·]/)[0]?.trim() || '';
      const probeHead = headTexts.slice(0, 3).join(' ');
      const probeAll = `${probeHead} ${fullText.slice(0, 320)}`;

      let outcome = classifyChallengeOutcomeText(probeHead);
      if (outcome === 'unknown') {
        if (/\b(?:victory|win|clear|success|survived)\b/i.test(clsStr) && !/\b(?:defeat|fail|lose|dead|death)\b/i.test(clsStr)) {
          outcome = 'win';
        } else if (/\b(?:defeat|fail|lose|dead|death)\b/i.test(clsStr) && !/\b(?:victory|win|clear|success|survived)\b/i.test(clsStr)) {
          outcome = 'fail';
        }
      }
      if (outcome === 'unknown') {
        outcome = classifyChallengeOutcomeText(probeAll);
      }
      if (outcome === 'unknown' && state.lastCombatHpPct === 0) {
        outcome = 'fail';
      }

      // 嘗試從結算視窗讀取本場存活／通關時間 (MM:SS) 與擊殺數
      let durationSec = null;
      const timeMatch = fullText.match(/(?:時間|歷時|存活|通關時間|Time|Survived)?\s*[:：]?\s*(\d{1,2}):(\d{2})/i);
      if (timeMatch) {
        const parsedSec = Number(timeMatch[1]) * 60 + Number(timeMatch[2]);
        if (Number.isFinite(parsedSec) && parsedSec > 0 && parsedSec <= 7200) {
          durationSec = parsedSec;
        }
      }
      if (durationSec === null && typeof state.lastClockSec === 'number' && state.lastClockSec > 0) {
        const stg = resolveCurrentStageInfo();
        const hardEnd = stg?.runLength || 840;
        durationSec = state.clockDir === 'down' ? Math.max(0, hardEnd - state.lastClockSec) : state.lastClockSec;
      }

      let kills = null;
      const killMatch = fullText.match(/(?:擊殺|殺敵|消滅|Kills?)\s*[:：]?\s*([\d,]+)/i);
      if (killMatch) {
        const kNum = Number(String(killMatch[1]).replace(/,/g, ''));
        if (Number.isFinite(kNum) && kNum >= 0) kills = kNum;
      }

      return {
        outcome,
        rawTitle: primaryTitle.slice(0, 28),
        durationSec,
        kills,
      };
    } catch (_) {
      return { outcome: 'unknown', rawTitle: '', durationSec: null, kills: null };
    }
  }

  function recordDungeonChallengeResult(summaryWin) {
    try {
      if (!summaryWin || state.summaryStatsRecorded) return false;
      const now = Date.now();
      if (now - (state.lastChallengeRecordedAt || 0) < 15000) return false;
      state.summaryStatsRecorded = true;
      state.lastChallengeRecordedAt = now;

      const parsed = detectSummaryOutcome(summaryWin);
      const stg = resolveCurrentStageInfo();
      const coordStage = state.mapCenterCoord?.stageName || '';
      const farmTarget = typeof getCurrentFarmTargetStage === 'function' ? getCurrentFarmTargetStage() : null;
      const stageName = (stg?.name || coordStage || farmTarget?.name || '未知副本').replace(/\s*\([^)]*\)/g, '').trim() || '未知副本';
      const job = typeof getActiveJobName === 'function' ? getActiveJobName() : '';
      const deity = state.run?.deity || '';
      const deityLvlNum = Number(state.run?.deityLevel) || 0;
      const deityDisp = deity ? (deityLvlNum > 0 ? `${deity}+${deityLvlNum}` : deity) : '';
      const filledSlotsCnt = RUN_ITEM_CATEGORIES.filter((cat) => Boolean(state.run?.items?.[cat])).length;
      const cStatsSummary = state.run?.cStatsSummary || '';

      const stats = loadChallengeStats();
      stats.total += 1;
      if (parsed.outcome === 'win') stats.wins += 1;
      else if (parsed.outcome === 'fail') stats.fails += 1;
      else stats.unknowns += 1;

      if (!stats.byStage[stageName] || typeof stats.byStage[stageName] !== 'object') {
        stats.byStage[stageName] = { total: 0, wins: 0, fails: 0, unknowns: 0, totalDurSec: 0, durCount: 0, failDurSec: 0, failDurCount: 0 };
      }
      const b = stats.byStage[stageName];
      b.total = (Number(b.total) || 0) + 1;
      if (parsed.outcome === 'win') b.wins = (Number(b.wins) || 0) + 1;
      else if (parsed.outcome === 'fail') b.fails = (Number(b.fails) || 0) + 1;
      else b.unknowns = (Number(b.unknowns) || 0) + 1;
      if (typeof parsed.durationSec === 'number' && parsed.durationSec > 0) {
        b.totalDurSec = (Number(b.totalDurSec) || 0) + parsed.durationSec;
        b.durCount = (Number(b.durCount) || 0) + 1;
        if (parsed.outcome === 'fail') {
          b.failDurSec = (Number(b.failDurSec) || 0) + parsed.durationSec;
          b.failDurCount = (Number(b.failDurCount) || 0) + 1;
        }
      }

      const d = new Date(now);
      const pad2 = (n) => String(n).padStart(2, '0');
      const timeStr = `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
      stats.history.unshift({
        at: now,
        time: timeStr,
        outcome: parsed.outcome,
        stage: stageName,
        job,
        deity: deityDisp,
        slotsFilled: filledSlotsCnt,
        cStatsSummary,
        durationSec: parsed.durationSec,
        kills: parsed.kills,
        rawTitle: parsed.rawTitle,
      });
      if (stats.history.length > 80) stats.history.length = 80;
      saveChallengeStats(stats);
      updateChallengeStatsHud();

      const outcomeBadge =
        parsed.outcome === 'win' ? '✅ 挑戰成功' : parsed.outcome === 'fail' ? '❌ 挑戰失敗' : '❔ 挑戰結算(未明)';
      const durTxt = typeof parsed.durationSec === 'number' && parsed.durationSec > 0 ? `歷時 ${formatMmSs(parsed.durationSec)}` : '歷時 --';
      const deityTxt = deityDisp ? `｜神祇：${deityDisp}` : '';
      const slotTxt = `｜道具格：${filledSlotsCnt}/4`;
      const statTxt = cStatsSummary ? `｜素質：${cStatsSummary}` : '';
      const totalDecided = stats.wins + stats.fails;
      const totalRate = totalDecided > 0 ? `${((stats.wins / totalDecided) * 100).toFixed(1)}%` : '--';
      const stgDecided = (b.wins || 0) + (b.fails || 0);
      const stgRate = stgDecided > 0 ? `${(((b.wins || 0) / stgDecided) * 100).toFixed(1)}%` : '--';
      const titleNote = parsed.outcome === 'unknown' && parsed.rawTitle ? `｜標題：${parsed.rawTitle}` : '';
      addLog(
        `[挑戰結算] ${outcomeBadge}｜【${stageName}】${durTxt}${deityTxt}${slotTxt}${statTxt}｜總計 ${stats.wins}勝 ${stats.fails}敗（勝率 ${totalRate}｜本圖 ${b.wins || 0}勝 ${b.fails || 0}敗 ${stgRate}）${titleNote}`
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  function formatChallengeStatsExportSection() {
    try {
      const st = loadChallengeStats();
      const decided = st.wins + st.fails;
      const rateTxt = decided > 0 ? `${((st.wins / decided) * 100).toFixed(1)}%` : '--';
      const unkPart = st.unknowns > 0 ? `｜未明 ${st.unknowns}` : '';
      const lines = [
        '',
        `=== 副本挑戰戰績統計 (總計 ${st.total} 場｜成功 ${st.wins}｜失敗 ${st.fails}${unkPart}｜勝率 ${rateTxt}) ===`,
      ];
      const stageEntries = Object.entries(st.byStage || {}).sort((a, b) => (Number(b[1]?.total) || 0) - (Number(a[1]?.total) || 0));
      if (stageEntries.length > 0) {
        for (const [name, b] of stageEntries) {
          const w = Number(b?.wins) || 0;
          const f = Number(b?.fails) || 0;
          const u = Number(b?.unknowns) || 0;
          const t = Number(b?.total) || 0;
          const d = w + f;
          const r = d > 0 ? `${((w / d) * 100).toFixed(1)}%` : '--';
          const avgDur = b?.durCount > 0 ? `｜平均耗時 ${formatMmSs(Math.round(b.totalDurSec / b.durCount))}` : '';
          const avgFail = b?.failDurCount > 0 ? `｜平均陣亡時間 ${formatMmSs(Math.round(b.failDurSec / b.failDurCount))}` : '';
          const uStr = u > 0 ? ` / 未明 ${u}` : '';
          lines.push(`【${name}】${t} 場｜成功 ${w} / 失敗 ${f}${uStr}（勝率 ${r}${avgDur}${avgFail}）`);
        }
      } else {
        lines.push('（尚無副本挑戰統計紀錄）');
      }
      if (st.history.length > 0) {
        lines.push('--- 最近挑戰明細 (最多 30 場，依時間由舊到新) ---');
        const recent = st.history.slice(0, 30).reverse();
        for (const h of recent) {
          const tag = h.outcome === 'win' ? '✅成功' : h.outcome === 'fail' ? '❌失敗' : '❔未明';
          const dur = typeof h.durationSec === 'number' && h.durationSec > 0 ? formatMmSs(h.durationSec) : '--:--';
          const jobPart = h.job ? `｜${h.job}` : '';
          const deityPart = h.deity ? `｜神祇:${h.deity}` : '';
          const slotPart = typeof h.slotsFilled === 'number' ? `｜道具:${h.slotsFilled}/4` : '';
          const statPart = h.cStatsSummary ? `｜${h.cStatsSummary}` : '';
          const killPart = typeof h.kills === 'number' ? `｜擊殺:${h.kills}` : '';
          const titlePart = h.rawTitle ? ` (標題:${h.rawTitle})` : '';
          lines.push(`[${h.time}] ${tag} 【${h.stage}】${dur}${jobPart}${deityPart}${slotPart}${statPart}${killPart}${titlePart}`);
        }
      }
      return lines.join('\n');
    } catch (_) {
      return '';
    }
  }

  function formatStatValidationExportSection() {
    try {
      const audit = state.schemaAuditResult || auditRunItemTierSchema();
      const st = state.statValidationStats || { total: 0, ok: 0, softDrift: 0, corrected: 0, invalid: 0 };
      const records = Array.isArray(state.statValidationRecords) ? state.statValidationRecords : [];
      const lines = [
        '',
        `=== 道具數值層級校驗摘要 (級距表 ${audit.itemCount} 項：${audit.ok ? '正常' : '異常 ' + audit.errors.join('; ')}) ===`,
        `累計校驗：${st.total} 筆｜通過：${st.ok}｜品質微偏：${st.softDrift}｜已自動校正：${st.corrected}｜無效：${st.invalid}`,
      ];
      if (records.length > 0) {
        const recent = records.slice(0, 30).reverse();
        for (const r of recent) {
          const valDisp = r.corrected ? `${r.rawValue}→${r.clampedValue}` : `${r.rawValue}`;
          lines.push(
            `[${r.time}] [${r.source}] ${r.itemName} +${r.level}(${r.rarityName}) 讀值 ${valDisp}${r.unit ? ' ' + r.unit : ''}｜硬邊界[${r.hardMin}~${r.hardMax}] 品質區間[${r.strictMin}~${r.strictMax}]｜${r.status}${r.note ? ' (' + r.note + ')' : ''}`
          );
        }
      } else {
        lines.push('（本次執行尚無局內道具數值校驗紀錄）');
      }
      return lines.join('\n');
    } catch (_) {
      return '';
    }
  }

  function copyLogsToClipboard() {
    const entries = Array.isArray(state.logs) && state.logs.length ? [...state.logs].reverse() : ['（目前尚無日誌紀錄）'];
    const header = `=== RO倖存者 自動選技 v2.46.0 執行日誌 (${new Date().toLocaleString('zh-TW', { hour12: false })}，共 ${entries.length} 筆) ===`;
    const challengeSection = formatChallengeStatsExportSection();
    const validationSection = formatStatValidationExportSection();
    const payload = [header, ...entries, challengeSection, validationSection].filter((part) => part !== '').join('\n');
    try {
      if (typeof GM_setClipboard === 'function') {
        GM_setClipboard(payload, 'text');
        return { ok: true, count: entries.length };
      }
    } catch (_) {}
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(payload).catch(() => {});
        return { ok: true, count: entries.length };
      }
    } catch (_) {}
    try {
      const ta = document.createElement('textarea');
      ta.value = payload;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return { ok: Boolean(ok), count: entries.length };
    } catch (_) {
      return { ok: false, count: entries.length };
    }
  }

  function updateStatusBar(opText) {
    if (typeof opText === 'string' && opText.trim()) {
      state.currentOp = opText.trim();
    }
    const panelEl = $id('rh-panel');
    const isMinimized = Boolean(panelEl?.classList.contains('rh-minimized'));
    const badgesEl = !isMinimized ? $id('rh-status-badges') : null;
    const opEl = !isMinimized ? $id('rh-current-op') : null;
    if (badgesEl) {
      const autoCls = state.pickerActive
        ? 'rh-badge rh-badge-busy'
        : state.autoEnabled
        ? 'rh-badge rh-badge-on'
        : 'rh-badge';
      const autoLabel = state.pickerActive ? '探測中' : state.autoEnabled ? '自動選擇：開' : '自動選擇：關';
      const abCls = state.autoBuildEnabled ? 'rh-badge rh-badge-on' : 'rh-badge';
      const abLabel = state.autoBuildEnabled ? '放逐：開' : '放逐：關';
      const ex = getExtra();
      const farmCls = state.farmEnabled ? 'rh-badge rh-badge-on' : 'rh-badge';
      const maxRuns = Number(ex.farmMaxRuns) || 0;
      const farmLabel = state.farmEnabled
        ? `刷圖：${state.farmRunsDone}${maxRuns > 0 ? '/' + maxRuns : ''}場`
        : '刷圖：關';
      const moveMode = CONFIG.autoMoveConfig.mode;
      const lobbyStandby = moveMode === 'radius_wander' && !state.lowHpEvading && (isInVillageLobby() || !isInCombat());
      const moveCls = state.lowHpEvading
        ? 'rh-badge rh-badge-busy'
        : moveMode === 'radius_wander'
        ? lobbyStandby
          ? 'rh-badge'
          : Date.now() < state.humanOverrideUntil
          ? 'rh-badge rh-badge-busy'
          : 'rh-badge rh-badge-on'
        : 'rh-badge';
      const moveLabel = state.lowHpEvading
        ? '殘血閃避中'
        : lobbyStandby
        ? '走位：村莊待命'
        : moveMode === 'radius_wander'
        ? `走位：${CONFIG.autoMoveConfig.radiusPx}px`
        : '走位：定點';
      const modeBadgeCls =
        CONFIG.selectionActionMode === 'hybrid_bridge'
          ? state.bridgeOnline
            ? 'rh-badge rh-badge-on'
            : 'rh-badge rh-badge-busy'
          : 'rh-badge rh-badge-on';
      const modeBadgeLabel =
        CONFIG.selectionActionMode === 'hybrid_bridge'
          ? state.bridgeOnline
            ? `橋接：${state.bridgeModeName || '已連線'}`
            : '橋接：未連線'
          : '模式：純提示';
      badgesEl.innerHTML = `<span class="${autoCls}">${autoLabel}</span><span class="${modeBadgeCls}">${modeBadgeLabel}</span><span class="${abCls}">${abLabel}</span><span class="${farmCls}">${farmLabel}</span><span class="${moveCls}">${moveLabel}</span>`;
    }
    const anyRunning = Boolean(state.autoEnabled || state.farmEnabled || CONFIG.autoMoveConfig.mode === 'radius_wander');
    if (panelEl) {
      panelEl.classList.toggle('rh-mini-running', Boolean(!state.paused && anyRunning));
      panelEl.classList.toggle('rh-mini-paused', Boolean(state.paused));
    }
    const miniPauseBtn = $id('rh-mini-pause');
    const miniPauseGlyph = $id('rh-mini-pause-glyph');
    if (miniPauseBtn) {
      miniPauseBtn.classList.toggle('rh-mini-paused', Boolean(state.paused));
      miniPauseBtn.title = state.paused
        ? `已暫停（${state.pauseReason || '暫停中'}）— 點擊繼續`
        : '暫停輔助（凍結自動選擇／走位／刷圖並按 ESC 暫停遊戲）';
      if (miniPauseGlyph) {
        miniPauseGlyph.innerHTML = state.paused
          ? '<path d="M8 5.5L18.5 12L8 18.5V5.5Z" fill="#FBBF24"/>'
          : '<rect x="7" y="5.5" width="3.5" height="13" rx="1" fill="#FDE68A"/><rect x="13.5" y="5.5" width="3.5" height="13" rx="1" fill="#FDE68A"/>';
      }
    }
    const miniStopBtn = $id('rh-mini-stopall');
    if (miniStopBtn) {
      miniStopBtn.classList.toggle('rh-mini-active', anyRunning || state.paused);
    }
    const miniAutoBtn = $id('rh-mini-auto');
    if (miniAutoBtn) {
      miniAutoBtn.classList.toggle('rh-mini-toggle-on', Boolean(state.autoEnabled && !state.pickerActive));
      miniAutoBtn.classList.toggle('rh-mini-toggle-busy', Boolean(state.pickerActive));
      miniAutoBtn.title = state.pickerActive
        ? '自動選擇：探測中'
        : state.autoEnabled
        ? '自動選擇：已開啟（點擊關閉）'
        : '自動選擇：已關閉（點擊開啟）';
    }
    const miniFarmBtn = $id('rh-mini-farm');
    if (miniFarmBtn) {
      miniFarmBtn.classList.toggle('rh-mini-toggle-on', Boolean(state.farmEnabled));
      const maxRuns = Number(getExtra().farmMaxRuns) || 0;
      miniFarmBtn.title = state.farmEnabled
        ? `刷圖迴圈：運作中 ${state.farmRunsDone}${maxRuns > 0 ? '/' + maxRuns : ''}場（點擊關閉）`
        : '刷圖迴圈：已關閉（點擊開啟，將連動走位與自動選擇）';
    }
    const miniMoveBtn = $id('rh-mini-move');
    if (miniMoveBtn) {
      const moveMode = CONFIG.autoMoveConfig.mode;
      const lobbyStandby = moveMode === 'radius_wander' && !state.lowHpEvading && (isInVillageLobby() || !isInCombat());
      const moveOn = moveMode === 'radius_wander' && !lobbyStandby && !state.lowHpEvading;
      miniMoveBtn.classList.toggle('rh-mini-toggle-on', Boolean(moveOn));
      miniMoveBtn.classList.toggle('rh-mini-toggle-standby', Boolean(lobbyStandby));
      miniMoveBtn.classList.toggle('rh-mini-toggle-busy', Boolean(state.lowHpEvading));
      miniMoveBtn.title = state.lowHpEvading
        ? '走位：定點殘血閃避中'
        : lobbyStandby
        ? '走位：村莊待命（進本啟動，點擊切換為定點）'
        : moveMode === 'radius_wander'
        ? `走位：半徑繞行 ${CONFIG.autoMoveConfig.radiusPx}px（點擊切換為定點）`
        : '走位：定點不動（點擊切換為半徑繞行）';
    }
    const mainPauseBtn = $id('rh-btn-pause-toggle');
    if (mainPauseBtn) {
      mainPauseBtn.textContent = state.paused ? '▶ 繼續' : '⏸ 暫停';
      mainPauseBtn.className = state.paused ? 'rh-btn rh-btn-primary rh-btn-sm' : 'rh-btn rh-btn-sm';
      mainPauseBtn.title = state.paused ? `已暫停：${state.pauseReason || ''}（點擊繼續）` : '暫停所有自動動作';
    }
    if (opEl) {
      opEl.textContent = state.paused
        ? `已暫停：${state.pauseReason || '手動暫停'}`
        : `目前：${state.currentOp}（累計 ${state.pickCount} 次）`;
      opEl.title = state.paused ? (state.pauseReason || '已暫停') : state.currentOp;
    }
    updateMiniMagnetHud();
    updateRunInfo();
    updateFoldSummaries();
  }

  function updateFoldSummaries() {
    const panelEl = $id('rh-panel');
    if (!panelEl || panelEl.classList.contains('rh-minimized')) return;
    const ex = getExtra();
    const mainMeta = $id('rh-fold-meta-main');
    if (mainMeta) {
      const upMode =
        ex.upgradeMode === 'instant'
          ? '即時'
          : ex.upgradeMode === 'accumulate_manual'
          ? '手動B鍵'
          : `累積≥${Math.max(1, Number(ex.bankThreshold) || 1)}張`;
      const actShort =
        CONFIG.selectionActionMode === 'hybrid_bridge'
          ? state.bridgeOnline
            ? '橋接線上'
            : '橋接離線'
          : '純提示';
      mainMeta.textContent = `${upMode} ｜ ${actShort}`;
    }
    const farmMeta = $id('rh-fold-meta-farm');
    if (farmMeta) {
      const lobbyMap = { solo: '單人大廳', last: '上次大廳', off: '手動大廳' };
      const hpTxt = Number(ex.farmLowHpWarnPct) > 0 ? `殘血≤${ex.farmLowHpWarnPct}%` : '殘血關';
      farmMeta.textContent = `${lobbyMap[ex.farmLobbyChoice || 'solo'] || '單人大廳'} ｜ ${hpTxt}`;
    }
    const moveMeta = $id('rh-fold-meta-move');
    if (moveMeta) {
      const styleMap = { human_natural: '擬人自然', smooth_continuous: '順暢巡航', burst_pause: '分段走停' };
      const t = getMoveTimingRanges(CONFIG.autoMoveConfig);
      moveMeta.textContent = `${styleMap[CONFIG.autoMoveConfig.style] || '擬人自然'} ｜ ${t.stepMin}~${t.stepMax}ms / 停${t.pauseMin}~${t.pauseMax}ms`;
    }
    const magnetMeta = $id('rh-fold-meta-magnet');
    if (magnetMeta) {
      const mCfg = CONFIG.autoMoveConfig;
      const onOff = mCfg.smartMagnetEnabled !== false ? '智慧控管' : '全時撿取';
      const fMin = Number(mCfg.magnetFirstMin ?? 2.5);
      const iMin = Number(mCfg.magnetIntervalMin ?? 3.0);
      const eMin = Number(mCfg.magnetEndRemainingMin ?? 3.0);
      magnetMeta.textContent = `${onOff} ｜ 首${fMin}分 ｜ 間隔${iMin}分 ｜ 距王≤${eMin}分衝刺`;
    }
    const deityMeta = $id('rh-fold-meta-deity');
    if (deityMeta) {
      const pTag = ex.prioritizePickupPotion !== false ? '採集先' : '依順位';
      const rTag = ex.chestRerollAllEarly !== false ? '重抽開' : '重抽關';
      const fc = ex.focusConfig || {};
      const fParts = [];
      if (fc.enabled !== false && fc.focusDeity !== false) fParts.push('神器');
      if (fc.enabled !== false && fc.focusPotion !== false) fParts.push('藥');
      const fTag = fParts.length ? `專注${fParts.join('/')}` : '專注關';
      const capP = ex.capPickupEnabled !== false ? `拾≥${Number(ex.capPickupMax) ?? 40}` : '拾不限';
      const capD = ex.capDeityEnabled !== false ? ` · 神器≥+${Math.max(1, Number(ex.capDeityMax ?? 10) || 10)}` : '';
      const autoChestTag = ex.useNativeAutoChest ? ' · 自動箱開' : '';
      deityMeta.textContent = `${pTag} · ${rTag} · ${fTag} · ${capP}${capD}${autoChestTag}`;
    }
    const logMeta = $id('rh-fold-meta-log');
    if (logMeta) {
      logMeta.textContent = state.logs[0] || '純本地規則與 Closed Shadow DOM 已就緒。';
    }
    // 各分頁摺疊卡即時摘要（收合狀態也能一眼看到目前參數）
    const presetsMeta = $id('rh-fold-meta-presets');
    if (presetsMeta) {
      const selEl = $id('rh-preset-select');
      const curName = selEl?.selectedOptions?.[0]?.textContent?.trim();
      presetsMeta.textContent = curName && !curName.includes('尚未儲存') ? `${curName} · 同步碼` : '流派快捷 · 同步碼';
    }
    const farmStageMeta = $id('rh-fold-meta-farm-stage');
    if (farmStageMeta) {
      const mainStg = (typeof STAGES_DATA !== 'undefined' ? STAGES_DATA : []).find((s) => s.id === (ex.farmStageId || 'payon_cave'));
      const stgLabel = mainStg ? mainStg.name.replace(/\s*\([^)]*\)/g, '') : (ex.farmStageId || '斐揚洞穴');
      const dualTxt = ex.farmDualEnabled ? `雙刷${Number(ex.farmDualChancePct) || 35}%` : '單圖';
      farmStageMeta.textContent = `${stgLabel} ｜ ${dualTxt}`;
    }
    const farmPaceMeta = $id('rh-fold-meta-farm-pace');
    if (farmPaceMeta) {
      const maxRuns = Number(ex.farmMaxRuns) || 0;
      const runTxt = maxRuns > 0 ? `目標${maxRuns}場` : '無限場';
      const dwellTxt = ex.farmVillageDwellEnabled !== false ? `回村${ex.farmVillageDwellMinSec ?? 10}~${ex.farmVillageDwellMaxSec ?? 60}秒` : '不隨機停';
      farmPaceMeta.textContent = `${runTxt} ｜ ${dwellTxt}`;
    }
    const farmRestMeta = $id('rh-fold-meta-farm-rest');
    if (farmRestMeta) {
      farmRestMeta.textContent = ex.farmRestEnabled
        ? `開 · 每${ex.farmRestMinRuns || 4}~${ex.farmRestMaxRuns || 6}場休${ex.farmRestMinMin || 25}~${ex.farmRestMaxMin || 55}分`
        : '關閉';
    }
    const moveObsMeta = $id('rh-fold-meta-move-obs');
    if (moveObsMeta) {
      const obsOn = CONFIG.autoMoveConfig.obstacleMemoryEnabled !== false;
      const st = getObstacleMemoryStats();
      moveObsMeta.textContent = obsOn
        ? st.stageKey
          ? `開 · 本圖確認${st.confirmed}處`
          : `開 · 已學${st.totalStages}副本`
        : '關閉';
    }
    const moveBossMeta = $id('rh-fold-meta-move-boss');
    if (moveBossMeta) {
      const rTxt = CONFIG.autoMoveConfig.bossRedDodgeEnabled !== false ? '紅圈開' : '紅圈關';
      const mTxt = CONFIG.autoMoveConfig.moonlightBellDodgeEnabled !== false ? '躲鐘開' : '躲鐘關';
      moveBossMeta.textContent = `${rTxt} · ${mTxt}`;
    }
    const moveCamMeta = $id('rh-fold-meta-move-cam');
    if (moveCamMeta) {
      const zTxt = CONFIG.autoMoveConfig.autoZoomCameraOnStart !== false ? `拉遠${Number(CONFIG.autoMoveConfig.cameraZoomOutSteps) || 8}格` : '不拉遠';
      const lTxt = CONFIG.autoMoveConfig.autoLootChests ? '撿取開' : '撿取關';
      moveCamMeta.textContent = `${zTxt} · ${lTxt}`;
    }
    const lootBasicMeta = $id('rh-fold-meta-loot-basic');
    if (lootBasicMeta) {
      const rTxt = CONFIG.autoMoveConfig.returnToCenterAfterLoot !== false ? '回中心開' : '回中心關';
      const zTxt = CONFIG.autoMoveConfig.autoZoomMinimapOnStart !== false ? `放大${Number(CONFIG.autoMoveConfig.minimapZoomClicks) || 2}次` : '不放大';
      lootBasicMeta.textContent = `${rTxt} · ${zTxt}`;
    }
    const lootOrderMeta = $id('rh-fold-meta-loot-order');
    if (lootOrderMeta) {
      const prio = CONFIG.autoMoveConfig.lootPriorities || {};
      const activeNames = (Array.isArray(CONFIG.autoMoveConfig.lootOrder) ? CONFIG.autoMoveConfig.lootOrder : ['magnet', 'equip', 'chest', 'supply'])
        .filter((k) => prio[k])
        .map((k) => LOOT_CATEGORY_META[k]?.label || k);
      lootOrderMeta.textContent = activeNames.length ? activeNames.join(' ＞ ') : '尚未勾選';
    }
    const skillFourthMeta = $id('rh-fold-meta-skill-fourth');
    if (skillFourthMeta) {
      const accN = Math.max(0, Number(ex.acceptTopN) || 3);
      const natTxt = ex.useNativeAutoAfterBanish !== false ? '自動技能開' : '全程本地';
      skillFourthMeta.textContent = `前${accN}名接受 · ${natTxt}`;
    }
    const skillBanishMeta = $id('rh-fold-meta-skill-banish');
    if (skillBanishMeta) {
      const bCnt = $qa('#rh-banish-order-list > *').length;
      skillBanishMeta.textContent = bCnt > 0 ? `排程 ${bCnt} 招` : '未設定';
    }
    const skillDeityMeta = $id('rh-fold-meta-skill-deity');
    if (skillDeityMeta) {
      const autoOn = ex.autoPickSkillDeity !== false ? '自動點!開' : '手動選';
      const lockedSk = getJobLockedSkillDeity();
      const top1 = getJobSkillDeityOrder()[0] || '依順位';
      skillDeityMeta.textContent = `${autoOn} · ${lockedSk ? `鎖:${lockedSk}` : `首選:${top1}`}`;
    }
    const deityOrderMeta = $id('rh-fold-meta-deity-order');
    if (deityOrderMeta) {
      const topN = Math.max(1, Math.min(13, Number(ex.deityTopN) || 3));
      deityOrderMeta.textContent = `五格順位 · 神器前${topN}名`;
    }
    const configMeta = $id('rh-fold-meta-config');
    if (configMeta) {
      const kws = (CONFIG.strategy?.priorityKeywords || []).slice(0, 3).map((x) => x.keyword).filter(Boolean);
      configMeta.textContent = kws.length ? kws.join(' ＞ ') : '尚未設定';
    }
    const timerMeta = $id('rh-fold-meta-timer');
    if (timerMeta) {
      const tMin = Number(ex.timerMin) || 0;
      const tSec = Number(ex.timerSec) || 0;
      const escTxt = ex.autoPauseGameOnStop !== false ? 'ESC' : '不按ESC';
      timerMeta.textContent = `${tMin}分${tSec}秒 ｜ ${escTxt}`;
    }
    const toolsBridgeMeta = $id('rh-fold-meta-tools-bridge');
    if (toolsBridgeMeta) {
      const hasTok = Boolean((ex.bridgeToken || '').trim());
      toolsBridgeMeta.textContent = `${state.bridgeOnline ? '已連線' : '未連線'} ｜ ${hasTok ? '金鑰已設' : '未填金鑰'}`;
    }
    const toolsUiMeta = $id('rh-fold-meta-tools-ui');
    if (toolsUiMeta) {
      const opVal = $id('rh-opacity-val')?.textContent || '95%';
      toolsUiMeta.textContent = `透明度 ${opVal}`;
    }
  }

  // === 3. 半徑自動走位引擎 ===
  const KEY_MAPS = {
    wasd: {
      up: { key: 'w', code: 'KeyW', keyCode: 87 },
      down: { key: 's', code: 'KeyS', keyCode: 83 },
      left: { key: 'a', code: 'KeyA', keyCode: 65 },
      right: { key: 'd', code: 'KeyD', keyCode: 68 },
    },
    arrows: {
      up: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
      down: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
      left: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
      right: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
    },
  };

  function dispatchMoveKey(type, def) {
    if (!def) return;
    if (type === 'keydown') {
      state.heldKeySince[def.code] = Date.now();
    } else {
      delete state.heldKeySince[def.code];
    }
    if (CONFIG.selectionActionMode === 'hybrid_bridge') {
      if (type === 'keydown') {
        state.bridgeExpectedKeyUntil[def.code] = Date.now() + 650;
      }
      sendBridgeKey(def.key, 0, type === 'keydown' ? 'key_down' : 'key_up');
      return;
    }
    // 純提示建議模式不發送任何移動按鍵，無 JS 合成事件
  }

  function humanJitterMs(baseMs, minRatio = 0.68, maxRatio = 1.42) {
    // 雙亂數平均近似鐘形常態分佈，避免機械固定週期特徵
    const u = (Math.random() + Math.random()) * 0.5;
    return Math.max(15, Math.round(baseMs * (minRatio + u * (maxRatio - minRatio))));
  }

  function clearPendingMoveKeyTimers() {
    if (Array.isArray(state.moveKeyTimers) && state.moveKeyTimers.length) {
      state.moveKeyTimers.forEach((id) => clearTimeout(id));
      state.moveKeyTimers.length = 0;
    }
  }

  function stopNpcWalk() {
    if (state.npcWalkTimer) {
      clearTimeout(state.npcWalkTimer);
      state.npcWalkTimer = null;
    }
    clearPendingMoveKeyTimers();
    const wasNpcWalking = state.npcWalking;
    state.npcWalking = false;
    if (wasNpcWalking && state.heldKeys.size > 0) {
      releaseHeldKeysOnly();
    }
  }

  function releaseHeldKeysOnly() {
    clearPendingMoveKeyTimers();
    state.isBurstMoving = false;
    if (state.heldKeys.size === 0) {
      state.heldKeySince = {};
      return;
    }
    const scheme = KEY_MAPS[CONFIG.autoMoveConfig.keyScheme] || KEY_MAPS.wasd;
    const defs = Object.values(scheme);
    for (const code of state.heldKeys) {
      const def = defs.find((d) => d.code === code);
      if (def) dispatchMoveKey('keyup', def);
    }
    state.heldKeys.clear();
    state.heldKeySince = {};
  }

  function syncMoveKeys(targetDefs) {
    clearPendingMoveKeyTimers();
    const scheme = KEY_MAPS[CONFIG.autoMoveConfig.keyScheme] || KEY_MAPS.wasd;
    const allDefs = Object.values(scheme);
    const desiredCodes = new Set(targetDefs.map((d) => d.code));
    const toRelease = [];
    for (const code of Array.from(state.heldKeys)) {
      if (!desiredCodes.has(code)) {
        const def = allDefs.find((d) => d.code === code);
        if (def) toRelease.push(def);
      }
    }
    const toPress = targetDefs.filter((def) => !state.heldKeys.has(def.code));
    // 放開不需要的方向鍵（加入些微人類手指放開錯開延遲）
    toRelease.forEach((def, idx) => {
      const relDelay = idx === 0 ? 0 : 12 + Math.floor(Math.random() * 24);
      if (relDelay === 0) {
        dispatchMoveKey('keyup', def);
        state.heldKeys.delete(def.code);
      } else {
        const tid = setTimeout(() => {
          dispatchMoveKey('keyup', def);
          state.heldKeys.delete(def.code);
        }, relDelay);
        state.moveKeyTimers.push(tid);
      }
    });
    // 若有方向切換（先鬆鍵再按新鍵），模擬真人手指換鍵空隙 32~90ms；斜走兩鍵也錯開 18~52ms
    const switchGap = toRelease.length > 0 ? 32 + Math.floor(Math.random() * 58) : 0;
    toPress.forEach((def, idx) => {
      const pressDelay = switchGap + idx * (18 + Math.floor(Math.random() * 36));
      if (pressDelay === 0) {
        state.heldKeys.add(def.code);
        dispatchMoveKey('keydown', def);
      } else {
        const tid = setTimeout(() => {
          if (state.paused || !isInCombat()) return;
          if (!state.heldKeys.has(def.code)) {
            state.heldKeys.add(def.code);
            dispatchMoveKey('keydown', def);
          }
        }, pressDelay);
        state.moveKeyTimers.push(tid);
      }
    });
  }

  function releaseAllMoveKeys() {
    if (state.moveStepTimer) {
      clearTimeout(state.moveStepTimer);
      state.moveStepTimer = null;
    }
    stopNpcWalk();
    releaseHeldKeysOnly();
  }

  function ensureMoveLoopRunning() {
    if (state.paused || state.npcWalking) return;
    if (!isInCombat()) return;
    if (CONFIG.autoMoveConfig.mode !== 'radius_wander' && !state.lowHpEvading) return;
    if (state.moveStepTimer) return;
    scheduleNextMoveStep();
  }

  function readMinimapCoord() {
    const exactCoords = document.querySelector('#minimap-coords');
    const exactName = document.querySelector('#minimap-name');
    if (exactCoords && !isOwnHudNode(exactCoords) && isVisible(exactCoords, 4)) {
      const coordTxt = (exactCoords.textContent || '').trim();
      const m = coordTxt.match(/\(\s*(\d+)\s*,\s*(\d+)\s*\)/);
      if (m) {
        const stageName = exactName && isVisible(exactName, 2) ? (exactName.textContent || '').trim() : '';
        return {
          raw: stageName ? `${stageName} ${coordTxt}` : coordTxt,
          stageName,
          x: Number(m[1]),
          y: Number(m[2]),
          element: exactCoords,
        };
      }
    }
    const minimapBox = document.querySelector('#minimap');
    const now = Date.now();
    if (!minimapBox) {
      if (now - (state.fallbackCoordSearchAt || 0) < 3000) return null;
      state.fallbackCoordSearchAt = now;
    }
    const scope = minimapBox && !isOwnHudNode(minimapBox) ? minimapBox : document;
    const nodes = Array.from(scope.querySelectorAll('div, span, b, strong, p, small')).filter((el) => {
      if (isOwnHudNode(el) || el.children.length > 2 || !isVisible(el, 6)) return false;
      const r = el.getBoundingClientRect();
      return r.left > window.innerWidth * 0.55 && r.top < window.innerHeight * 0.4 && /\(\s*\d+\s*,\s*\d+\s*\)/.test(el.textContent || '');
    });
    if (!nodes.length) return null;
    const coordEl = nodes[0];
    const raw = (coordEl.textContent || '').trim();
    const m = raw.match(/^(?:([^()\r\n]+?)\s*)?\((\d+)\s*,\s*(\d+)\)/);
    if (!m) return null;
    return {
      raw,
      stageName: (m[1] || '').trim(),
      x: Number(m[2]),
      y: Number(m[3]),
      element: coordEl,
    };
  }

  function getStageCenterRecord(stageName) {
    if (!stageName) return null;
    const map = getExtra().stageCenterMap;
    if (!map || typeof map !== 'object') return null;
    const rec = map[stageName];
    if (rec && typeof rec.x === 'number' && typeof rec.y === 'number') return rec;
    return null;
  }

  function saveStageCenterRecord(stageName, x, y) {
    if (!stageName || typeof x !== 'number' || typeof y !== 'number') return;
    const prev = getExtra().stageCenterMap;
    const nextMap = { ...(prev && typeof prev === 'object' ? prev : {}) };
    nextMap[stageName] = { x, y, updatedAt: Date.now() };
    saveExtra({ stageCenterMap: nextMap });
  }

  // === 副本固定障礙自動記憶網格 ＋ 前瞻閃避 ＋ 微型 A* 折線尋路 ===
  const OBSTACLE_MAX_PER_STAGE = 260;
  const SAFE_CORRIDOR_MAX_PER_STAGE = 180;
  const OBSTACLE_CORE_RADIUS_TILES = 55;
  const OBSTACLE_HIT_DEDUP_MS = 1800;

  function getObstacleStageKey(curCoord = null) {
    const raw = (curCoord?.stageName || state.mapCenterCoord?.stageName || '').trim();
    if (raw) return raw;
    try {
      const nameEl = document.querySelector('#minimap-name');
      const txt = nameEl && isVisible(nameEl, 2) ? (nameEl.textContent || '').trim() : '';
      if (txt) return txt;
    } catch (_) {}
    return '';
  }

  function ensureStageObstacleMap() {
    const rt = state.obstacleRuntime;
    if (!rt.stageMap || typeof rt.stageMap !== 'object') {
      const stored = getExtra().stageObstacleMap;
      rt.stageMap = stored && typeof stored === 'object' ? JSON.parse(JSON.stringify(stored)) : {};
    }
    return rt.stageMap;
  }

  function flushStageObstacleMapNow() {
    const rt = state.obstacleRuntime;
    if (rt.flushTimer) {
      clearTimeout(rt.flushTimer);
      rt.flushTimer = null;
    }
    if (!rt.dirty || !rt.stageMap) return;
    rt.dirty = false;
    try {
      saveExtra({ stageObstacleMap: rt.stageMap });
    } catch (_) {}
  }

  function scheduleObstacleMapFlush(immediate = false) {
    const rt = state.obstacleRuntime;
    rt.dirty = true;
    if (immediate) {
      flushStageObstacleMapNow();
      return;
    }
    if (rt.flushTimer) return;
    rt.flushTimer = setTimeout(() => {
      rt.flushTimer = null;
      flushStageObstacleMapNow();
    }, 2400);
  }

  function getStageObstacleBucket(stageKey, createIfMissing = false) {
    if (!stageKey) return null;
    const map = ensureStageObstacleMap();
    let bucket = map[stageKey];
    if (!bucket || typeof bucket !== 'object') {
      if (!createIfMissing) return null;
      bucket = { b: {}, s: {}, u: Date.now() };
      map[stageKey] = bucket;
    }
    if (!bucket.b || typeof bucket.b !== 'object') bucket.b = {};
    if (!bucket.s || typeof bucket.s !== 'object') bucket.s = {};
    return bucket;
  }

  function getStageWalkedSet(stageKey, createIfMissing = false) {
    if (!stageKey) return null;
    const wMap = state.obstacleRuntime.walkedByStage;
    if (!wMap[stageKey]) {
      if (!createIfMissing) return null;
      wMap[stageKey] = new Set();
    }
    return wMap[stageKey];
  }

  function getObstacleMemoryStats(stageKey = '') {
    const key = stageKey || getObstacleStageKey();
    const map = ensureStageObstacleMap();
    const totalStages = Object.keys(map).filter((k) => {
      const b = map[k]?.b;
      return b && Object.keys(b).length > 0;
    }).length;
    if (!key || !map[key]) {
      return { stageKey: key, confirmed: 0, suspected: 0, safeCorridor: 0, totalStages };
    }
    const bucket = map[key];
    let confirmed = 0;
    let suspected = 0;
    const entries = Object.values(bucket.b || {});
    for (const rec of entries) {
      const h = Number(rec?.h) || 0;
      if (h >= 2) confirmed++;
      else if (h >= 1) suspected++;
    }
    const safeCorridor = Object.keys(bucket.s || {}).length;
    return { stageKey: key, confirmed, suspected, safeCorridor, totalStages };
  }

  function clearStageObstacleMemory(stageKey = '') {
    const key = stageKey || getObstacleStageKey();
    if (!key) return false;
    const map = ensureStageObstacleMap();
    const existed = Boolean(map[key]);
    delete map[key];
    if (state.obstacleRuntime.walkedByStage[key]) {
      state.obstacleRuntime.walkedByStage[key].clear();
    }
    state.obstacleRuntime.astarCache = null;
    scheduleObstacleMapFlush(true);
    return existed;
  }

  function clearAllObstacleMemory() {
    state.obstacleRuntime.stageMap = {};
    state.obstacleRuntime.walkedByStage = {};
    state.obstacleRuntime.lastHitAtByKey = {};
    state.obstacleRuntime.astarCache = null;
    scheduleObstacleMapFlush(true);
  }

  function angleToTileStep(angle) {
    const cx = Math.cos(angle);
    const sy = Math.sin(angle);
    let sx = cx > 0.36 ? 1 : cx < -0.36 ? -1 : 0;
    let syTile = sy > 0.36 ? -1 : sy < -0.36 ? 1 : 0;
    if (sx === 0 && syTile === 0) {
      if (Math.abs(cx) >= Math.abs(sy)) sx = cx >= 0 ? 1 : -1;
      else syTile = sy >= 0 ? -1 : 1;
    }
    return { sx, sy: syTile };
  }

  function tileVecToScreenAngle(dx, dy) {
    return Math.atan2(-dy, dx);
  }

  function relPosToTile(posX, posY) {
    if (!state.mapCenterCoord) return null;
    return {
      x: state.mapCenterCoord.x + Math.round(posX / 16),
      y: state.mapCenterCoord.y - Math.round(posY / 16),
    };
  }

  function getTileObstacleLevel(bucket, x, y) {
    if (!bucket || !bucket.b) return 0;
    const rec = bucket.b[`${x},${y}`];
    if (!rec) return 0;
    const h = Number(rec.h) || 0;
    if (h >= 2) return 2;
    if (h >= 1) return 1;
    return 0;
  }

  function isTileKnownWalked(stageKey, bucket, x, y) {
    const k = `${x},${y}`;
    const wSet = getStageWalkedSet(stageKey, false);
    if (wSet && wSet.has(k)) return true;
    return Boolean(bucket?.s && bucket.s[k]);
  }

  function isAdjacentToConfirmedObstacle(bucket, x, y) {
    if (!bucket || !bucket.b) return false;
    return (
      getTileObstacleLevel(bucket, x + 1, y) === 2 ||
      getTileObstacleLevel(bucket, x - 1, y) === 2 ||
      getTileObstacleLevel(bucket, x, y + 1) === 2 ||
      getTileObstacleLevel(bucket, x, y - 1) === 2
    );
  }

  function isNearConfirmedObstacle(bucket, x, y, radius = 2) {
    if (!bucket || !bucket.b) return false;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (dx === 0 && dy === 0) continue;
        if (Math.abs(dx) + Math.abs(dy) > radius + 1) continue;
        if (getTileObstacleLevel(bucket, x + dx, y + dy) === 2) return true;
      }
    }
    return false;
  }

  function pruneBucketEntries(obj, maxCount, preferHits = false) {
    const keys = Object.keys(obj);
    if (keys.length <= maxCount) return;
    keys.sort((a, b) => {
      const ra = obj[a];
      const rb = obj[b];
      if (preferHits) {
        const ha = Number(ra?.h) || 0;
        const hb = Number(rb?.h) || 0;
        if (ha !== hb) return hb - ha;
      }
      const ta = Number(typeof ra === 'object' ? ra?.t : ra) || 0;
      const tb = Number(typeof rb === 'object' ? rb?.t : rb) || 0;
      return tb - ta;
    });
    for (let i = maxCount; i < keys.length; i++) {
      delete obj[keys[i]];
    }
  }

  function isCleanStuckForObstacleRecord(now) {
    if (CONFIG.autoMoveConfig.obstacleMemoryEnabled === false) return false;
    if (document.hidden || state.paused || now < (state.humanOverrideUntil || 0)) return false;
    if (findDomCardElements().length >= 2) return false;
    if (!state.heldKeys || state.heldKeys.size === 0) return false;
    if (now - (state.lastBridgeFocusSkipAt || 0) <= 3500) return false;
    if (normalizeActionMode(CONFIG.selectionActionMode) === 'hybrid_bridge' && state.bridgeError) return false;
    return true;
  }

  function recordWalkedTile(curCoord) {
    if (!curCoord || CONFIG.autoMoveConfig.obstacleMemoryEnabled === false) return;
    if (!isInCombat()) return;
    const stageKey = getObstacleStageKey(curCoord);
    if (!stageKey) return;
    const x = Math.round(curCoord.x);
    const y = Math.round(curCoord.y);
    const tileKey = `${x},${y}`;
    const wSet = getStageWalkedSet(stageKey, true);
    const isNewWalked = !wSet.has(tileKey);
    if (isNewWalked) {
      wSet.add(tileKey);
      if (wSet.size > 2600) {
        const firstKey = wSet.values().next().value;
        if (firstKey !== undefined) wSet.delete(firstKey);
      }
    }
    const bucket = getStageObstacleBucket(stageKey, false);
    if (!bucket) return;
    // 正向自我修復：角色實際踩上該格即代表 100% 可通行，立刻清除誤標障礙
    if (bucket.b[tileKey]) {
      const prevHits = Number(bucket.b[tileKey]?.h) || 0;
      delete bucket.b[tileKey];
      bucket.u = Date.now();
      state.obstacleRuntime.astarCache = null;
      scheduleObstacleMapFlush(prevHits >= 2);
      if (prevHits >= 2) {
        addLog(`[障礙記憶] 角色已順利通過 (${x}, ${y})，自動清除【${stageKey}】該處舊障礙標記`);
      }
    }
    // 僅持久化緊鄰已知障礙的安全走廊格，讓重整後仍立即知道石頭哪側可通
    if (isNewWalked && isNearConfirmedObstacle(bucket, x, y, 2)) {
      if (
        !state.mapCenterCoord ||
        Math.hypot(x - state.mapCenterCoord.x, y - state.mapCenterCoord.y) <= OBSTACLE_CORE_RADIUS_TILES
      ) {
        bucket.s[tileKey] = Date.now();
        pruneBucketEntries(bucket.s, SAFE_CORRIDOR_MAX_PER_STAGE, false);
        scheduleObstacleMapFlush(false);
      }
    }
  }

  function recordObstacleHitFromStuck(curCoord, moveAngle, source = 'normal') {
    const now = Date.now();
    if (!curCoord || typeof moveAngle !== 'number' || !Number.isFinite(moveAngle)) return null;
    if (!isCleanStuckForObstacleRecord(now)) return null;
    const stageKey = getObstacleStageKey(curCoord);
    if (!stageKey) return null;
    const step = angleToTileStep(moveAngle);
    const ox = Math.round(curCoord.x) + step.sx;
    const oy = Math.round(curCoord.y) + step.sy;
    // 只持久化副本核心活動範圍內的障礙，避免邊界雜訊無限擴張
    if (
      state.mapCenterCoord &&
      (!state.mapCenterCoord.stageName || state.mapCenterCoord.stageName === stageKey) &&
      Math.hypot(ox - state.mapCenterCoord.x, oy - state.mapCenterCoord.y) > OBSTACLE_CORE_RADIUS_TILES
    ) {
      return null;
    }
    const tileKey = `${ox},${oy}`;
    // 若角色本場早已真實踩過這格，先不視為固定牆（避免短暫卡怪或 lag 汙染）
    const wSet = getStageWalkedSet(stageKey, false);
    if (wSet && wSet.has(tileKey)) return null;
    const dedupKey = `${stageKey}|${tileKey}`;
    const lastAt = state.obstacleRuntime.lastHitAtByKey[dedupKey] || 0;
    if (now - lastAt < OBSTACLE_HIT_DEDUP_MS) return null;
    state.obstacleRuntime.lastHitAtByKey[dedupKey] = now;
    const bucket = getStageObstacleBucket(stageKey, true);
    const prev = bucket.b[tileKey];
    const nextHits = Math.min(20, (Number(prev?.h) || 0) + 1);
    bucket.b[tileKey] = { h: nextHits, t: now };
    if (bucket.s[tileKey]) delete bucket.s[tileKey];
    bucket.u = now;
    pruneBucketEntries(bucket.b, OBSTACLE_MAX_PER_STAGE, true);
    state.obstacleRuntime.astarCache = null;
    scheduleObstacleMapFlush(nextHits === 2);
    if (nextHits === 2) {
      const stats = getObstacleMemoryStats(stageKey);
      const srcTag = source === 'moonlight_bell' ? '躲鐘巨石' : '卡牆學習';
      addLog(`[障礙記憶] 【${stageKey}】${srcTag}確認固定障礙 (${ox}, ${oy})（已確認 ${stats.confirmed} 處，後續將自動 A* 提前繞行）`);
    }
    return { stageKey, x: ox, y: oy, hits: nextHits };
  }

  function hasClearTileLine(stageKey, bucket, x0, y0, x1, y1, treatSuspectedAsBlocked = false) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    if (steps === 0) return { clear: true, firstBlocked: null, suspectedHits: 0 };
    let prevX = x0;
    let prevY = y0;
    let suspectedHits = 0;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const cx = Math.round(x0 + dx * t);
      const cy = Math.round(y0 + dy * t);
      if (cx === prevX && cy === prevY) continue;
      const lvl = getTileObstacleLevel(bucket, cx, cy);
      if (lvl === 2 || (treatSuspectedAsBlocked && lvl === 1)) {
        return { clear: false, firstBlocked: { x: cx, y: cy, step: i }, suspectedHits };
      }
      if (lvl === 1) suspectedHits++;
      // 斜向防切角：若左右兩側正交格同時是確認障礙，禁止從縫隙硬切
      if (cx !== prevX && cy !== prevY) {
        const l1 = getTileObstacleLevel(bucket, cx, prevY);
        const l2 = getTileObstacleLevel(bucket, prevX, cy);
        if (l1 === 2 && l2 === 2) {
          return { clear: false, firstBlocked: { x: cx, y: cy, step: i }, suspectedHits };
        }
      }
      prevX = cx;
      prevY = cy;
    }
    return { clear: true, firstBlocked: null, suspectedHits };
  }

  function pickOpenFlankByObstacleMap(stageKey, curCoord, moveAngle) {
    if (!curCoord || CONFIG.autoMoveConfig.obstacleMemoryEnabled === false) return 0;
    const bucket = getStageObstacleBucket(stageKey, false);
    if (!bucket || Object.keys(bucket.b).length === 0) return 0;
    const baseX = Math.round(curCoord.x);
    const baseY = Math.round(curCoord.y);
    const scoreFlank = (sign) => {
      let score = 0;
      const offsets = [0.75, 1.3, 1.85];
      for (const off of offsets) {
        const ang = moveAngle + sign * off;
        const ux = Math.cos(ang);
        const uy = -Math.sin(ang);
        for (let d = 1; d <= 5; d++) {
          const tx = Math.round(baseX + ux * d);
          const ty = Math.round(baseY + uy * d);
          const lvl = getTileObstacleLevel(bucket, tx, ty);
          if (lvl === 2) {
            score -= (6 - d) * 4.5;
            break;
          } else if (lvl === 1) {
            score -= (6 - d) * 1.4;
          } else if (isTileKnownWalked(stageKey, bucket, tx, ty)) {
            score += 1.8;
          } else {
            score += 0.6;
          }
        }
      }
      return score;
    };
    const rightScore = scoreFlank(1);
    const leftScore = scoreFlank(-1);
    if (Math.abs(rightScore - leftScore) < 2.2) return 0;
    return rightScore > leftScore ? 1 : -1;
  }

  function findMicroAStarPath(stageKey, startX, startY, goalX, goalY, opts = {}) {
    if (CONFIG.autoMoveConfig.obstacleMemoryEnabled === false) return null;
    const bucket = getStageObstacleBucket(stageKey, false);
    if (!bucket) return null;
    const sx = Math.round(startX);
    const sy = Math.round(startY);
    let gx = Math.round(goalX);
    let gy = Math.round(goalY);
    const directDist = Math.hypot(gx - sx, gy - sy);
    if (directDist < 1.5 || directDist > 68) return null;

    // 先檢查快取（同副本、同起點與近似終點 380ms 內直接複用）
    const now = Date.now();
    const cached = state.obstacleRuntime.astarCache;
    if (
      cached &&
      now - cached.at <= 380 &&
      cached.stageKey === stageKey &&
      cached.sx === sx &&
      cached.sy === sy &&
      Math.abs(cached.gx - gx) <= 1 &&
      Math.abs(cached.gy - gy) <= 1
    ) {
      return cached.result;
    }

    // 確認是否真的有障礙物擋住直線（若直線完全無確認障礙且無強疑似叢集，無需跑 A*）
    const los = hasClearTileLine(stageKey, bucket, sx, sy, gx, gy, false);
    if (los.clear && los.suspectedHits < 2) {
      state.obstacleRuntime.astarCache = { at: now, stageKey, sx, sy, gx, gy, result: null };
      return null;
    }

    // 若終點格本身被標記為確認障礙（例如寶箱緊貼石頭），自動退至最近可通行鄰格
    if (getTileObstacleLevel(bucket, gx, gy) === 2) {
      let bestAlt = null;
      let bestAltD = 1e9;
      for (let r = 1; r <= 2 && !bestAlt; r++) {
        for (let dx = -r; dx <= r; dx++) {
          for (let dy = -r; dy <= r; dy++) {
            const nx = gx + dx;
            const ny = gy + dy;
            if (getTileObstacleLevel(bucket, nx, ny) === 2) continue;
            const d = Math.hypot(nx - sx, ny - sy);
            if (d < bestAltD) {
              bestAltD = d;
              bestAlt = { x: nx, y: ny };
            }
          }
        }
      }
      if (!bestAlt) return null;
      gx = bestAlt.x;
      gy = bestAlt.y;
    }

    // 限定微型搜尋視窗（保證單次 A* 耗時 < 0.5ms）
    const pad = opts.isEmergency ? 16 : 13;
    const minX = Math.max(sx - 44, Math.min(sx, gx) - pad);
    const maxX = Math.min(sx + 44, Math.max(sx, gx) + pad);
    const minY = Math.max(sy - 44, Math.min(sy, gy) - pad);
    const maxY = Math.min(sy + 44, Math.max(sy, gy) + pad);
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    if (width <= 0 || height <= 0 || width * height > 9000) return null;

    const toIdx = (x, y) => (y - minY) * width + (x - minX);
    const total = width * height;
    const gScore = new Float32Array(total);
    gScore.fill(1e9);
    const cameFrom = new Int32Array(total);
    cameFrom.fill(-1);
    const closed = new Uint8Array(total);

    // 輕量最小二元堆積（Min-Heap）
    const heapIdx = [];
    const heapF = [];
    const heapPush = (idx, f) => {
      let pos = heapIdx.length;
      heapIdx.push(idx);
      heapF.push(f);
      while (pos > 0) {
        const parent = (pos - 1) >> 1;
        if (heapF[parent] <= heapF[pos]) break;
        const ti = heapIdx[parent]; heapIdx[parent] = heapIdx[pos]; heapIdx[pos] = ti;
        const tf = heapF[parent]; heapF[parent] = heapF[pos]; heapF[pos] = tf;
        pos = parent;
      }
    };
    const heapPop = () => {
      const top = heapIdx[0];
      const lastI = heapIdx.pop();
      const lastF = heapF.pop();
      if (heapIdx.length > 0) {
        heapIdx[0] = lastI;
        heapF[0] = lastF;
        let pos = 0;
        const n = heapIdx.length;
        while (true) {
          let smallest = pos;
          const l = (pos << 1) + 1;
          const r = l + 1;
          if (l < n && heapF[l] < heapF[smallest]) smallest = l;
          if (r < n && heapF[r] < heapF[smallest]) smallest = r;
          if (smallest === pos) break;
          const ti = heapIdx[pos]; heapIdx[pos] = heapIdx[smallest]; heapIdx[smallest] = ti;
          const tf = heapF[pos]; heapF[pos] = heapF[smallest]; heapF[smallest] = tf;
          pos = smallest;
        }
      }
      return top;
    };

    const octileH = (x, y) => {
      const adx = Math.abs(gx - x);
      const ady = Math.abs(gy - y);
      return (adx + ady) + (1.41421356 - 2) * Math.min(adx, ady);
    };

    const startIdx = toIdx(sx, sy);
    const goalIdx = toIdx(gx, gy);
    gScore[startIdx] = 0;
    heapPush(startIdx, octileH(sx, sy));

    const dirs = [
      [1, 0, 1.0], [-1, 0, 1.0], [0, 1, 1.0], [0, -1, 1.0],
      [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142],
    ];
    let expanded = 0;
    const maxExpand = opts.isEmergency ? 1500 : 1100;
    let reached = false;
    let bestProgressIdx = startIdx;
    let bestProgressH = octileH(sx, sy);

    while (heapIdx.length > 0 && expanded < maxExpand) {
      const curIdx = heapPop();
      if (closed[curIdx]) continue;
      closed[curIdx] = 1;
      expanded++;
      if (curIdx === goalIdx) {
        reached = true;
        break;
      }
      const cy = minY + Math.floor(curIdx / width);
      const cx = minX + (curIdx % width);
      const curH = octileH(cx, cy);
      if (curH < bestProgressH) {
        bestProgressH = curH;
        bestProgressIdx = curIdx;
      }
      const curG = gScore[curIdx];
      for (let d = 0; d < 8; d++) {
        const dx = dirs[d][0];
        const dy = dirs[d][1];
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
        const nIdx = toIdx(nx, ny);
        if (closed[nIdx]) continue;
        const lvl = getTileObstacleLevel(bucket, nx, ny);
        if (lvl === 2) continue;
        // 嚴格禁止貼角斜切巨石：任一正交側為確認障礙時，禁止斜向穿過該角落
        if (dx !== 0 && dy !== 0) {
          if (getTileObstacleLevel(bucket, cx + dx, cy) === 2 || getTileObstacleLevel(bucket, cx, cy + dy) === 2) {
            continue;
          }
        }
        let stepCost = dirs[d][2];
        if (lvl === 1) stepCost += 1.65;
        else if (isAdjacentToConfirmedObstacle(bucket, nx, ny)) stepCost += 0.85;
        else if (isTileKnownWalked(stageKey, bucket, nx, ny)) stepCost -= 0.12;
        if (stepCost < 0.75) stepCost = 0.75;

        const tentativeG = curG + stepCost;
        if (tentativeG < gScore[nIdx]) {
          cameFrom[nIdx] = curIdx;
          gScore[nIdx] = tentativeG;
          heapPush(nIdx, tentativeG + octileH(nx, ny));
        }
      }
    }

    const endIdx = reached ? goalIdx : (bestProgressIdx !== startIdx ? bestProgressIdx : -1);
    if (endIdx < 0) {
      state.obstacleRuntime.astarCache = { at: now, stageKey, sx, sy, gx, gy, result: null };
      return null;
    }

    // 回溯完整路徑
    const path = [];
    let trace = endIdx;
    let safety = 0;
    while (trace !== -1 && safety < 250) {
      const py = minY + Math.floor(trace / width);
      const px = minX + (trace % width);
      path.push({ x: px, y: py });
      if (trace === startIdx) break;
      trace = cameFrom[trace];
      safety++;
    }
    path.reverse();
    if (path.length < 2) {
      state.obstacleRuntime.astarCache = { at: now, stageKey, sx, sy, gx, gy, result: null };
      return null;
    }

    // 視線拉直（String Pulling）：從路徑挑最遠（最多前看 7 格）且無阻擋的順滑轉折點，避免鋸齒抖動
    let chosenIdx = 1;
    const maxLook = Math.min(path.length - 1, 7);
    for (let i = maxLook; i >= 2; i--) {
      const pt = path[i];
      const check = hasClearTileLine(stageKey, bucket, sx, sy, pt.x, pt.y, true);
      if (check.clear) {
        chosenIdx = i;
        break;
      }
    }
    const wp = path[chosenIdx];
    const result = {
      ok: true,
      reached,
      waypoint: wp,
      angle: tileVecToScreenAngle(wp.x - sx, wp.y - sy),
      pathLen: path.length - 1,
      expanded,
    };
    state.obstacleRuntime.astarCache = { at: now, stageKey, sx, sy, gx, gy, result };
    return result;
  }

  function steerAngleAroundObstacles(stageKey, curCoord, desiredAngle, lookaheadTiles = 4) {
    if (!curCoord || CONFIG.autoMoveConfig.obstacleMemoryEnabled === false) {
      return { steered: false, angle: desiredAngle };
    }
    const bucket = getStageObstacleBucket(stageKey, false);
    if (!bucket || Object.keys(bucket.b).length === 0) {
      return { steered: false, angle: desiredAngle };
    }
    const bx = Math.round(curCoord.x);
    const by = Math.round(curCoord.y);
    const evalRay = (ang, maxDist) => {
      const ux = Math.cos(ang);
      const uy = -Math.sin(ang);
      let clearSteps = 0;
      let walkedBonus = 0;
      let hitHard = false;
      let softPenalty = 0;
      let prevX = bx;
      let prevY = by;
      for (let d = 1; d <= maxDist; d++) {
        const tx = Math.round(bx + ux * d);
        const ty = Math.round(by + uy * d);
        if (tx === prevX && ty === prevY) {
          clearSteps += 0.5;
          continue;
        }
        const lvl = getTileObstacleLevel(bucket, tx, ty);
        if (lvl === 2) {
          hitHard = true;
          break;
        }
        if (tx !== prevX && ty !== prevY) {
          if (getTileObstacleLevel(bucket, tx, prevY) === 2 && getTileObstacleLevel(bucket, prevX, ty) === 2) {
            hitHard = true;
            break;
          }
        }
        if (lvl === 1) softPenalty += (maxDist + 1 - d) * 0.65;
        else if (isAdjacentToConfirmedObstacle(bucket, tx, ty)) softPenalty += 0.35;
        if (isTileKnownWalked(stageKey, bucket, tx, ty)) walkedBonus += 0.45;
        clearSteps += 1;
        prevX = tx;
        prevY = ty;
      }
      return { hitHard, clearSteps, walkedBonus, softPenalty };
    };

    const baseRay = evalRay(desiredAngle, lookaheadTiles);
    if (!baseRay.hitHard && baseRay.softPenalty < 1.3) {
      return { steered: false, angle: desiredAngle };
    }

    const bias = state.moveTurnBias || 1;
    const candidateOffsets = [
      bias * 0.58, -bias * 0.58,
      bias * 1.05, -bias * 1.05,
      bias * 1.55, -bias * 1.55,
      bias * 2.1, -bias * 2.1,
    ];
    let bestAngle = desiredAngle;
    let bestScore = baseRay.clearSteps * 2.0 + baseRay.walkedBonus - baseRay.softPenalty - (baseRay.hitHard ? 4.5 : 0);
    for (const off of candidateOffsets) {
      const ang = desiredAngle + off;
      const r = evalRay(ang, lookaheadTiles + 1);
      const devPenalty = Math.abs(off) * 0.72;
      const sameBiasBonus = Math.sign(off) === Math.sign(bias) ? 0.25 : 0;
      const score = r.clearSteps * 2.0 + r.walkedBonus - r.softPenalty - (r.hitHard ? 4.5 : 0) - devPenalty + sameBiasBonus;
      if (score > bestScore + 0.35) {
        bestScore = score;
        bestAngle = ang;
      }
    }
    if (bestAngle === desiredAngle) {
      return { steered: false, angle: desiredAngle };
    }
    return { steered: true, angle: bestAngle, mode: 'lookahead' };
  }

  function resolveObstacleSmartAngle(stageKey, curCoord, desiredAngle, goalOpt = null) {
    if (!curCoord || CONFIG.autoMoveConfig.obstacleMemoryEnabled === false) {
      state.obstacleRuntime.lastNavMode = '';
      return { steered: false, angle: desiredAngle, mode: '' };
    }
    const key = stageKey || getObstacleStageKey(curCoord);
    if (!key) {
      state.obstacleRuntime.lastNavMode = '';
      return { steered: false, angle: desiredAngle, mode: '' };
    }
    const bucket = getStageObstacleBucket(key, false);
    if (!bucket || Object.keys(bucket.b).length === 0) {
      state.obstacleRuntime.lastNavMode = '';
      return { steered: false, angle: desiredAngle, mode: '' };
    }

    // Tier 3：若有明確目標座標且直線穿過已知障礙，優先啟用微型 A* 折線繞石
    if (goalOpt && typeof goalOpt.tx === 'number' && typeof goalOpt.ty === 'number') {
      const astar = findMicroAStarPath(key, curCoord.x, curCoord.y, goalOpt.tx, goalOpt.ty, {
        isEmergency: Boolean(goalOpt.isEmergency),
      });
      if (astar && astar.ok) {
        state.obstacleRuntime.lastNavMode = 'astar';
        const now = Date.now();
        if (now - (state.obstacleRuntime.lastAstarLogAt || 0) >= 4500) {
          state.obstacleRuntime.lastAstarLogAt = now;
          const lbl = goalOpt.label || '目標';
          addLog(
            `[A*繞石] 🧭 【${key}】前往${lbl}直線遇已知障礙，已規劃折線轉折點 (${astar.waypoint.x}, ${astar.waypoint.y}) 提前繞開`
          );
        }
        return { steered: true, angle: astar.angle, mode: 'astar', waypoint: astar.waypoint };
      }
    }

    // Tier 2：前瞻掃描前方 3~4 格，將撞上已知障礙前先往開闊安全側微偏閃過
    const lookTiles = goalOpt?.lookaheadTiles || 4;
    const steered = steerAngleAroundObstacles(key, curCoord, desiredAngle, lookTiles);
    if (steered.steered) {
      state.obstacleRuntime.lastNavMode = 'lookahead';
      return steered;
    }
    state.obstacleRuntime.lastNavMode = '';
    return { steered: false, angle: desiredAngle, mode: '' };
  }

  function syncStageCenterCoord({ allowRecord = false, clockSec = null, logChange = true } = {}) {
    const coord = readMinimapCoord();
    if (!coord) return false;
    const sec = clockSec !== null ? clockSec : readGameClockSec();
    const isFreshStart = sec === null || sec <= 12;
    const stageKey = coord.stageName || '';
    const recorded = stageKey ? getStageCenterRecord(stageKey) : null;
    if (isFreshStart && allowRecord) {
      if (stageKey) {
        if (!recorded) {
          saveStageCenterRecord(stageKey, coord.x, coord.y);
          if (logChange) addLog(`[關卡中心] 首次記錄【${stageKey}】起始中心座標 (${coord.x}, ${coord.y})`);
        } else if (recorded.x !== coord.x || recorded.y !== coord.y) {
          saveStageCenterRecord(stageKey, coord.x, coord.y);
          if (logChange) addLog(`[關卡中心] 【${stageKey}】起始座標更新 (${recorded.x}, ${recorded.y}) → (${coord.x}, ${coord.y})`);
        } else if (logChange) {
          addLog(`[關卡中心] 載入【${stageKey}】已記錄起始座標 (${coord.x}, ${coord.y})`);
        }
      } else if (logChange) {
        addLog(`[關卡中心] 進入關卡，校準原點 (${coord.x}, ${coord.y})`);
      }
      state.mapCenterCoord = { x: coord.x, y: coord.y, stageName: stageKey, source: stageKey ? 'recorded' : 'start' };
      state.lastCoord = { x: coord.x, y: coord.y };
      if (CONFIG.autoMoveConfig.autoCenterOnStageStart !== false) {
        state.posX = 0;
        state.posY = 0;
      }
      saveRunSession();
      return true;
    }
    // 中途暫停重啟 / 重新整理：若已有同地圖有效中心點或資料庫記錄，絕不以目前座標覆蓋
    const curValid =
      state.mapCenterCoord &&
      state.mapCenterCoord.source !== 'midrun_temp' &&
      (!stageKey || !state.mapCenterCoord.stageName || state.mapCenterCoord.stageName === stageKey);
    if (curValid) {
      if (state.posX === 0 && state.posY === 0) {
        state.posX = (coord.x - state.mapCenterCoord.x) * 16;
        state.posY = (state.mapCenterCoord.y - coord.y) * 16;
      }
      return true;
    }
    if (recorded) {
      state.mapCenterCoord = { x: recorded.x, y: recorded.y, stageName: stageKey, source: 'recorded' };
      state.lastCoord = { x: coord.x, y: coord.y };
      state.posX = (coord.x - recorded.x) * 16;
      state.posY = (recorded.y - coord.y) * 16;
      if (logChange) {
        addLog(`[關卡中心] 中途接續：套用【${stageKey}】已記錄起點 (${recorded.x}, ${recorded.y})，不以目前位置 (${coord.x}, ${coord.y}) 覆蓋`);
      }
      saveRunSession();
      return true;
    }
    state.mapCenterCoord = { x: coord.x, y: coord.y, stageName: stageKey, source: 'midrun_temp' };
    state.lastCoord = { x: coord.x, y: coord.y };
    if (logChange) {
      addLog(`[關卡中心] 尚無【${stageKey || '此地圖'}】起點記錄，暫參考目前位置 (${coord.x}, ${coord.y})（下次開局自動寫入真實起點）`);
    }
    saveRunSession();
    return true;
  }

  function getPlayerCenterPoint() {
    try {
      const stageCanvas =
        document.querySelector('#stage canvas.ro-cursor') ||
        document.querySelector('#stage canvas.world3d') ||
        document.querySelector('#stage canvas');
      if (stageCanvas && isVisible(stageCanvas, 200)) {
        const cr = stageCanvas.getBoundingClientRect();
        return { x: cr.left + cr.width * 0.5, y: cr.top + cr.height * 0.5 };
      }
      const canvas = Array.from(document.querySelectorAll('canvas')).find(
        (c) => !isOwnHudNode(c) && !c.closest('#minimap') && isVisible(c, 200)
      );
      if (canvas) {
        const cr = canvas.getBoundingClientRect();
        return { x: cr.left + cr.width * 0.5, y: cr.top + cr.height * 0.5 };
      }
    } catch (_) {}
    return { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 };
  }

  function clusterMinimapPoints(points, mergeDist = 5, splitSpan = 0, minSubCount = 4) {
    const clusters = [];
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      let matched = null;
      let bestDist = Infinity;
      for (let j = 0; j < clusters.length; j++) {
        const c = clusters[j];
        const d = Math.hypot(pt.x - c.cx, pt.y - c.cy);
        if (d <= mergeDist && d < bestDist) {
          bestDist = d;
          matched = c;
        }
      }
      if (matched) {
        matched.sumX += pt.x;
        matched.sumY += pt.y;
        matched.count += 1;
        matched.cx = matched.sumX / matched.count;
        matched.cy = matched.sumY / matched.count;
        if (pt.x < matched.minX) matched.minX = pt.x;
        if (pt.x > matched.maxX) matched.maxX = pt.x;
        if (pt.y < matched.minY) matched.minY = pt.y;
        if (pt.y > matched.maxY) matched.maxY = pt.y;
        matched.pts.push(pt);
      } else {
        clusters.push({
          sumX: pt.x,
          sumY: pt.y,
          count: 1,
          cx: pt.x,
          cy: pt.y,
          minX: pt.x,
          maxX: pt.x,
          minY: pt.y,
          maxY: pt.y,
          pts: [pt],
        });
      }
    }
    if (splitSpan > 0) {
      const finalClusters = [];
      clusters.forEach((c) => {
        const spanX = c.maxX - c.minX;
        const spanY = c.maxY - c.minY;
        if (c.count >= minSubCount * 2 && (spanX >= splitSpan || spanY >= splitSpan)) {
          const splitByX = spanX >= spanY;
          const mid = splitByX ? c.cx : c.cy;
          const leftPts = c.pts.filter((p) => (splitByX ? p.x < mid : p.y < mid));
          const rightPts = c.pts.filter((p) => (splitByX ? p.x >= mid : p.y >= mid));
          if (leftPts.length >= minSubCount && rightPts.length >= minSubCount) {
            const mk = (arr) => {
              let sx = 0;
              let sy = 0;
              arr.forEach((p) => { sx += p.x; sy += p.y; });
              return { sumX: sx, sumY: sy, count: arr.length, cx: sx / arr.length, cy: sy / arr.length };
            };
            const a = mk(leftPts);
            const b = mk(rightPts);
            if (Math.hypot(a.cx - b.cx, a.cy - b.cy) >= Math.max(3.5, mergeDist * 0.8)) {
              finalClusters.push(a, b);
              return;
            }
          }
        }
        finalClusters.push(c);
      });
      return finalClusters;
    }
    return clusters;
  }

  const LOOT_CATEGORY_META = {
    magnet: { label: '磁鐵', icon: '🧲', desc: '全場吸寶石與裝備（小地圖可偵測）' },
    equip: { label: '裝備', icon: '⚔️', desc: '綠／藍／紫／橘菱形裝備掉落（小地圖可偵測）' },
    chest: { label: '寶箱', icon: '💰', desc: '金色寶箱（金幣不足開箱時略過）' },
    supply: { label: '補品', icon: '🧪', desc: '補血／金幣（僅大地圖，無小地圖圖示）' },
  };

  function getLootOrder() {
    const base = ['magnet', 'equip', 'chest', 'supply'];
    const cur = Array.isArray(CONFIG.autoMoveConfig.lootOrder) ? CONFIG.autoMoveConfig.lootOrder : base;
    return [...cur.filter((k) => base.includes(k)), ...base.filter((k) => !cur.includes(k))];
  }

  function isLootCategoryEnabled(category) {
    const prio = CONFIG.autoMoveConfig.lootPriorities || {};
    return Boolean(prio[category]);
  }

  function classifyLootProbe(probe, defaultCategory = 'supply') {
    const s = String(probe || '').toLowerCase();
    if (/magnet|磁鐵/.test(s)) return 'magnet';
    if (/equip|gear|weapon|armor|shield|helm|card|裝備|武器|防具|卡片/.test(s)) return 'equip';
    if (/chest|box|treasure|寶箱|箱/.test(s)) return 'chest';
    if (/heal|hp|potion|meat|apple|coin|zeny|補|藥|水|肉|金幣/.test(s)) return 'supply';
    return defaultCategory;
  }

  function readZenyAndChestCost() {
    const zenyChip = document.querySelector('#zeny');
    const zenyTextEl = document.querySelector('#zeny-text');
    const chestCostEl = document.querySelector('#chest-cost');
    if (!zenyChip && !zenyTextEl && !chestCostEl) {
      return { zeny: null, chestCost: null, canAffordChest: true };
    }
    const parseAmount = (txt) => {
      if (!txt) return null;
      const m = String(txt).replace(/,/g, '').match(/(\d+)/);
      return m ? Number(m[1]) : null;
    };
    let zeny = zenyTextEl ? parseAmount(zenyTextEl.textContent) : null;
    if (zeny === null && zenyChip) {
      const clone = zenyChip.cloneNode(true);
      clone.querySelector('#chest-cost')?.remove();
      zeny = parseAmount(clone.textContent);
    }
    const chestCost = chestCostEl ? parseAmount(chestCostEl.textContent) : null;
    const canAffordChest = zeny !== null && chestCost !== null ? zeny >= chestCost : true;
    return { zeny, chestCost, canAffordChest };
  }

  function isCurrentMapNoEquipDrops() {
    try {
      const stg = resolveCurrentStageInfo();
      if (stg && (stg.noEquipDrops || stg.id === 'louyang')) return true;
      const stageName = String(
        state.mapCenterCoord?.stageName ||
        document.querySelector('#minimap-name')?.textContent ||
        readMinimapCoord()?.stageName ||
        ''
      ).trim();
      if (/洛陽|燈籠/.test(stageName)) return true;
    } catch (_) {}
    return false;
  }

  function estimateMinimapTilesPerPx(canvasSize) {
    try {
      const w = Math.max(60, Number(canvasSize?.w) || 110);
      const zoomOutBtn =
        document.querySelector('#minimap .mm-zoom button[data-zoom="out"]') ||
        document.querySelector('#minimap button[data-zoom="out"]');
      const zoomInBtn =
        document.querySelector('#minimap .mm-zoom button[data-zoom="in"]') ||
        document.querySelector('#minimap button[data-zoom="in"]');
      const outDisabled = Boolean(
        zoomOutBtn &&
        (zoomOutBtn.disabled || zoomOutBtn.getAttribute('aria-disabled') === 'true' || zoomOutBtn.classList.contains('disabled'))
      );
      const inDisabled = Boolean(
        zoomInBtn &&
        (zoomInBtn.disabled || zoomInBtn.getAttribute('aria-disabled') === 'true' || zoomInBtn.classList.contains('disabled'))
      );
      const baseTilesPerPx = outDisabled ? 1.45 : inDisabled ? 0.55 : 0.78;
      return baseTilesPerPx * (110 / w);
    } catch (_) {
      return 0.78;
    }
  }

  function scanMinimapCanvasMarkers(box, forceFresh = false) {
    const now = Date.now();
    if (!forceFresh && state.lastMinimapScanResult && now - (state.lastMinimapScanAt || 0) < 900) {
      return state.lastMinimapScanResult;
    }
    const empty = { player: null, chests: [], magnets: [], equips: [], supplies: [], bosses: [], canvasSize: null, access: 'none' };
    const exactMinimapCanvas = document.querySelector('#minimap canvas');
    const candidateCanvases = exactMinimapCanvas
      ? [exactMinimapCanvas]
      : box && box.querySelectorAll('canvas').length
      ? Array.from(box.querySelectorAll('canvas'))
      : Array.from(document.querySelectorAll('canvas')).filter((c) => {
          if (isOwnHudNode(c)) return false;
          const r = c.getBoundingClientRect();
          return r.left > window.innerWidth * 0.55 && r.top < window.innerHeight * 0.5 && r.width >= 60 && r.width <= 380;
        });
    const canvas = candidateCanvases.find((c) => c && c.width >= 60 && c.height >= 60 && isVisible(c, 50));
    if (!canvas) return empty;
    let ctx = null;
    try {
      ctx = canvas.getContext('2d', { willReadFrequently: true }) || canvas.getContext('2d');
    } catch (_) {}
    if (!ctx) {
      return { ...empty, canvasSize: { w: canvas.width, h: canvas.height }, access: 'no_2d_ctx' };
    }
    let imgData;
    try {
      imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch (err) {
      return { ...empty, canvasSize: { w: canvas.width, h: canvas.height }, access: `blocked:${err?.message || 'tainted'}` };
    }
    const w = canvas.width;
    const h = canvas.height;
    const data = imgData.data;
    const noEquipMap = isCurrentMapNoEquipDrops();
    const redPts = [];
    const goldPts = [];
    const whitePts = [];
    const navyPts = [];
    const silverBluePts = [];
    const equipGreenPts = [];
    const equipBluePts = [];
    const equipPurplePts = [];
    const equipOrangePts = [];
    // 110x110 小地圖使用全像素掃描 (step=1)，避免細小磁鐵或被箭頭半遮蔽的寶箱漏判
    const step = w > 260 ? 2 : 1;
    for (let y = 3; y < h - 3; y += step) {
      for (let x = 3; x < w - 3; x += step) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];
        if (a < 180) continue;
        // 燈籠節(洛陽)不掉裝備，橘色呼吸圓點必定為小王；放寬暗態橘色閾值避免閃爍漏判
        if (noEquipMap) {
          if (r >= 205 && g >= 85 && g <= 165 && b <= 75 && (r - g) >= 55 && (r - b) >= 130) {
            equipOrangePts.push({ x, y });
          } else if (r >= 165 && g <= 85 && b <= 96 && (r - g) >= 100) {
            redPts.push({ x, y });
          } else if (r >= 195 && g >= 145 && g <= 235 && b <= 80 && (r - b) >= 125 && (g - b) >= 80) {
            goldPts.push({ x, y });
          } else if (r >= 225 && g >= 225 && b >= 225) {
            whitePts.push({ x, y });
          } else if (r <= 85 && g <= 90 && b >= 68 && b <= 155 && (b - r) >= 16 && (b - g) >= 10) {
            navyPts.push({ x, y });
          } else if (b >= 175 && r >= 135 && r <= 225 && g >= 150 && (b - r) >= 10) {
            silverBluePts.push({ x, y });
          }
          continue;
        }
        // 一般副本：優先判讀高飽和綠／藍／紫／橘菱形裝備圖示，避免藍裝邊緣被深藍外框 (navyPts) 吃掉
        if (g >= 168 && r <= 95 && b >= 55 && b <= 135 && (g - r) >= 95 && (g - b) >= 75) {
          equipGreenPts.push({ x, y });
        } else if (
          (b >= 195 && r <= 85 && g >= 75 && g <= 185 && (b - r) >= 130 && (b - g) >= 70) ||
          (b >= 200 && g >= 160 && r <= 120 && (b - r) >= 95)
        ) {
          equipBluePts.push({ x, y });
        } else if (b >= 185 && r >= 105 && r <= 215 && g <= 105 && (b - g) >= 105 && (r - g) >= 45) {
          equipPurplePts.push({ x, y });
        } else if (r >= 225 && g >= 95 && g <= 155 && b <= 65 && (r - g) >= 65) {
          equipOrangePts.push({ x, y });
        } else if (r >= 165 && g <= 85 && b <= 96 && (r - g) >= 100) {
          redPts.push({ x, y });
        } else if (r >= 195 && g >= 145 && g <= 235 && b <= 80 && (r - b) >= 125 && (g - b) >= 80) {
          goldPts.push({ x, y });
        } else if (r >= 225 && g >= 225 && b >= 225) {
          whitePts.push({ x, y });
        } else if (r <= 85 && g <= 90 && b >= 68 && b <= 155 && (b - r) >= 16 && (b - g) >= 10) {
          navyPts.push({ x, y });
        } else if (b >= 175 && r >= 135 && r <= 225 && g >= 150 && (b - r) >= 10) {
          silverBluePts.push({ x, y });
        }
      }
    }
    // 依小地圖尺寸自適應聚類：紅色箭頭寬度約 11~13px，需放大 redSplitSpan 避免箭頭被拆成兩半誤判成磁鐵
    const mergeDist = Math.max(4.0, Math.min(5.5, w * 0.042));
    const splitSpan = Math.max(10, Math.min(14, Math.round(w * 0.095)));
    const redMergeDist = Math.max(5.8, Math.min(7.8, w * 0.055));
    const redSplitSpan = Math.max(16, Math.round(w * 0.14));
    const minRedCount = step === 1 ? 5 : 3;
    const minGoldCount = step === 1 ? 5 : 3;
    const minEquipCount = step === 1 ? 5 : 3;
    const minBossCount = step === 1 ? 6 : 3;
    const minNavyClusterCount = step === 1 ? 4 : 2;
    const redClusters = clusterMinimapPoints(redPts, redMergeDist, redSplitSpan, minRedCount).filter((c) => c.count >= minRedCount);
    const goldClusters = clusterMinimapPoints(goldPts, mergeDist, splitSpan, minGoldCount).filter((c) => c.count >= minGoldCount);
    const orangeClusters = clusterMinimapPoints(equipOrangePts, mergeDist, splitSpan, minEquipCount).filter((c) => c.count >= minEquipCount);
    const bossClusters = [];
    // 燈籠節(洛陽)不掉裝備，橘點一律歸類為小王（絕不當成裝備去貼臉撿取）
    const equipClusters = noEquipMap
      ? []
      : [
          ...clusterMinimapPoints(equipPurplePts, mergeDist, splitSpan, minEquipCount).filter((c) => c.count >= minEquipCount),
          ...orangeClusters,
          ...clusterMinimapPoints(equipBluePts, mergeDist, splitSpan, minEquipCount).filter((c) => c.count >= minEquipCount),
          ...clusterMinimapPoints(equipGreenPts, mergeDist, splitSpan, minEquipCount).filter((c) => c.count >= minEquipCount),
        ];
    const navyClusters = clusterMinimapPoints(navyPts, Math.max(5.5, w * 0.05), 0, minNavyClusterCount).filter((c) => c.count >= minNavyClusterCount);
    let playerCluster = null;
    const magnetClusters = [];
    const whiteRadius = Math.max(5.5, w * 0.055);
    const navyRadius = Math.max(7.5, w * 0.075);
    const minNavyForMagnet = step === 1 ? 4 : 2;
    const minNavyNextToArrow = step === 1 ? 6 : 3;
    const minNavyFallbackCount = step === 1 ? 6 : 3;
    const minRedForFallback = step === 1 ? 4 : 2;
    const arrowGuardDist = Math.max(9.0, w * 0.085);
    const dedupDist = Math.max(9.0, w * 0.085);
    if (redClusters.length > 0) {
      const prevPlayer = state.lastMinimapPlayerPt && (now - state.lastMinimapPlayerPt.at < 2000) ? state.lastMinimapPlayerPt : null;
      let bestScore = -1e9;
      redClusters.forEach((c) => {
        let whites = 0;
        let navys = 0;
        let silvers = 0;
        for (let k = 0; k < whitePts.length; k++) {
          if (Math.hypot(whitePts[k].x - c.cx, whitePts[k].y - c.cy) <= whiteRadius) whites += 1;
        }
        for (let k = 0; k < navyPts.length; k++) {
          if (Math.hypot(navyPts[k].x - c.cx, navyPts[k].y - c.cy) <= navyRadius) navys += 1;
        }
        for (let k = 0; k < silverBluePts.length; k++) {
          if (Math.hypot(silverBluePts[k].x - c.cx, silverBluePts[k].y - c.cy) <= navyRadius) silvers += 1;
        }
        c.whites = whites;
        c.navys = navys;
        c.silvers = silvers;
        const nearPrevBonus = prevPlayer && Math.hypot(c.cx - prevPlayer.cx, c.cy - prevPlayer.cy) <= 14 ? 10 : 0;
        const score = whites * 2.5 + c.count * 1.1 - navys * 4.0 - silvers * 2.0 + nearPrevBonus;
        if (score > bestScore) {
          bestScore = score;
          playerCluster = c;
        }
      });
      redClusters.forEach((c) => {
        if (c === playerCluster || c.count < minRedCount) return;
        const distToPlayer = playerCluster ? Math.hypot(c.cx - playerCluster.cx, c.cy - playerCluster.cy) : 999;
        // 磁鐵圖示具備深藍海軍外框 (navys)
        if ((c.navys || 0) >= minNavyForMagnet) {
          if (distToPlayer <= arrowGuardDist && (c.navys || 0) < minNavyNextToArrow) return;
          const duplicated = magnetClusters.some((m) => Math.hypot(m.cx - c.cx, m.cy - c.cy) < dedupDist);
          if (!duplicated) {
            magnetClusters.push(c);
          }
          return;
        }
        // 無深藍外框且無箭頭白心的實心紅色圓點 = 副本最終王／首領紅點（如洛陽 14:00 白素貞與各副本王）
        // 開局尚未到任何小王／首領出現時段且無王血條時，忽略孤立紅點避免進本第 1 秒誤追雜訊紅點
        if (c.count >= minBossCount && (c.whites || 0) <= 2 && distToPlayer >= 4.0) {
          const curClockForBoss = readGameClockSec();
          const stgForBoss = resolveCurrentStageInfo();
          const firstBossWindowSec =
            Array.isArray(stgForBoss?.miniBossTimes) && stgForBoss.miniBossTimes.length
              ? Math.min(90, Math.max(30, Number(stgForBoss.miniBossTimes[0]) - 20))
              : 75;
          const earlyNoBossWindow = Boolean(
            !hasVisibleBossHpBar() &&
            !state.inBossCountdown &&
            state.clockDir !== 'down' &&
            typeof curClockForBoss === 'number' &&
            curClockForBoss < firstBossWindowSec
          );
          if (!earlyNoBossWindow) {
            const dupBoss = bossClusters.some((b) => Math.hypot(b.cx - c.cx, b.cy - c.cy) < dedupDist);
            if (!dupBoss) {
              bossClusters.push({ ...c, bossKind: 'boss' });
            }
          }
        }
      });
    }
    if (noEquipMap && orangeClusters.length > 0) {
      orangeClusters.forEach((oc) => {
        if (oc.count < minEquipCount) return;
        const distToPlayer = playerCluster ? Math.hypot(oc.cx - playerCluster.cx, oc.cy - playerCluster.cy) : 999;
        if (distToPlayer < 2.5) return;
        const dupBoss = bossClusters.some((b) => Math.hypot(b.cx - oc.cx, b.cy - oc.cy) < dedupDist);
        if (!dupBoss) {
          bossClusters.push({ ...oc, bossKind: 'miniboss' });
        }
      });
    }
    // 補檢深藍 U 型外框聚類：避免磁鐵緊貼玩家箭頭時紅點被併入箭頭，同時以紅點交集確保不會誤認地形
    if (navyClusters.length > 0 && redPts.length > 0) {
      navyClusters.forEach((nc) => {
        if (nc.count < minNavyFallbackCount) return;
        const redsNear = [];
        for (let k = 0; k < redPts.length; k++) {
          if (Math.hypot(redPts[k].x - nc.cx, redPts[k].y - nc.cy) <= navyRadius) {
            redsNear.push(redPts[k]);
          }
        }
        if (redsNear.length < minRedForFallback) return;
        let rx = 0;
        let ry = 0;
        for (let k = 0; k < redsNear.length; k++) {
          rx += redsNear[k].x;
          ry += redsNear[k].y;
        }
        rx /= redsNear.length;
        ry /= redsNear.length;
        if (playerCluster && Math.hypot(rx - playerCluster.cx, ry - playerCluster.cy) <= Math.max(5.5, w * 0.05)) return;
        const duplicated = magnetClusters.some((m) => Math.hypot(m.cx - rx, m.cy - ry) < dedupDist);
        if (!duplicated) {
          magnetClusters.push({ cx: rx, cy: ry, count: redsNear.length });
        }
      });
    }
    const rect = canvas.getBoundingClientRect();
    const cssScaleX = rect.width > 0 ? rect.width / w : 1;
    const cssScaleY = rect.height > 0 ? rect.height / h : 1;
    const toScreenPt = (c) => ({
      cx: c.cx,
      cy: c.cy,
      count: c.count,
      bossKind: c.bossKind || undefined,
      screenX: rect.left + c.cx * cssScaleX,
      screenY: rect.top + c.cy * cssScaleY,
    });
    const playerPt = playerCluster ? toScreenPt(playerCluster) : null;
    if (playerPt) {
      state.lastMinimapPlayerPt = { ...playerPt, at: Date.now() };
    }
    const result = {
      player: playerPt || (state.lastMinimapPlayerPt && Date.now() - state.lastMinimapPlayerPt.at < 2000 ? state.lastMinimapPlayerPt : null),
      chests: goldClusters.map(toScreenPt),
      magnets: magnetClusters.map(toScreenPt),
      equips: equipClusters.map(toScreenPt),
      bosses: bossClusters.map(toScreenPt),
      // 補品僅直接顯示於大地圖，不會出現在小地圖，避免誤掃小地圖草地綠點
      supplies: [],
      canvasSize: { w, h },
      access: 'ok',
    };
    state.lastMinimapScanAt = now;
    state.lastMinimapScanResult = result;
    return result;
  }

  function findMinimapZoomInBtn() {
    const selectors = [
      '#minimap .mm-zoom button[data-zoom="in"]',
      '#minimap button[data-zoom="in"]',
      '#minimap button[aria-label*="放大"]',
    ];
    for (const sel of selectors) {
      const btn = document.querySelector(sel);
      if (btn && !isOwnHudNode(btn) && isVisible(btn, 4)) return btn;
    }
    return null;
  }

  function triggerMinimapZoomIn(steps = 2, reason = '放大小地圖') {
    const targetClicks = Math.max(1, Math.min(5, Number(steps) || 2));
    if (state.minimapZoomBusy) return false;
    const firstBtn = findMinimapZoomInBtn();
    if (!firstBtn) return false;
    const mode = CONFIG.selectionActionMode || 'hybrid_bridge';
    if (mode === 'advisor_only') {
      addLog('[小地圖] 純提示模式未自動點擊放大鈕，建議手動按小地圖「+」放大');
      return false;
    }
    state.minimapZoomBusy = true;
    let done = 0;
    const stepClick = () => {
      const btn = findMinimapZoomInBtn();
      if (!btn || !isInCombat() || state.paused || findDomCardElements().length > 0) {
        state.minimapZoomBusy = false;
        return;
      }
      const isDisabled = Boolean(btn.disabled) || btn.getAttribute('aria-disabled') === 'true' || btn.classList.contains('disabled');
      if (isDisabled || done >= targetClicks) {
        state.minimapZoomBusy = false;
        state.lastMinimapScanAt = 0;
        state.lastMinimapScanResult = null;
        if (done > 0) {
          addLog(`[小地圖] ${reason}完成（共放大 ${done} 次${isDisabled ? '，已達最大倍率' : ''}）`);
        }
        setTimeout(() => {
          try {
            scanMinimapCanvasMarkers(null, true);
            const lootRefreshBtn = $id('rh-btn-loot-scan');
            if (lootRefreshBtn && $id('rh-panel-loot')?.classList.contains('active')) {
              lootRefreshBtn.click();
            }
          } catch (_) {}
        }, 280);
        return;
      }
      const r = btn.getBoundingClientRect();
      const cx = r.left + r.width * 0.5;
      const cy = r.top + r.height * 0.5;
      performElementClick(btn, cx, cy, '放大小地圖(+)', { skipHoverCheck: true });
      done += 1;
      setTimeout(stepClick, humanJitterMs(380, 0.82, 1.25));
    };
    stepClick();
    return true;
  }

  function findGameStageCanvasPoint() {
    const canvas =
      document.querySelector('#stage canvas.ro-cursor') ||
      document.querySelector('#stage canvas.world3d') ||
      document.querySelector('#stage canvas') ||
      Array.from(document.querySelectorAll('canvas')).find((c) => {
        if (isOwnHudNode(c) || c.closest('#minimap')) return false;
        const r = c.getBoundingClientRect();
        return r.width >= 320 && r.height >= 200 && isVisible(c, 50);
      });
    if (canvas) {
      const r = canvas.getBoundingClientRect();
      if (r.width >= 120 && r.height >= 120) {
        return {
          canvas,
          cx: Math.round(Math.max(12, Math.min(window.innerWidth - 12, r.left + r.width * 0.5))),
          cy: Math.round(Math.max(12, Math.min(window.innerHeight - 12, r.top + r.height * 0.5))),
        };
      }
    }
    return {
      canvas: null,
      cx: Math.round(window.innerWidth * 0.5),
      cy: Math.round(window.innerHeight * 0.5),
    };
  }

  function triggerCameraZoomOut(steps = 8, reason = '進關卡自動拉遠視野') {
    const targetSteps = Math.max(1, Math.min(20, Number(steps) || 8));
    if (state.cameraZoomBusy) return false;
    const target = findGameStageCanvasPoint();
    if (!target) return false;
    const mode = CONFIG.selectionActionMode || 'hybrid_bridge';
    if (mode === 'advisor_only') {
      addLog('[視野拉遠] 純提示模式未自動滾動滾輪，建議手動向下滾動滑鼠滾輪拉遠視野');
      return false;
    }
    if (!state.bridgeOnline) {
      addLog('[視野拉遠] 本機混合橋接未連線，僅支援實體滾輪，已安全略過');
      return false;
    }
    state.cameraZoomBusy = true;
    const { cx, cy } = target;
    (async () => {
      try {
        if (state.paused || findDomCardElements().length > 0) {
          state.cameraZoomBusy = false;
          return;
        }
        const prevMouseAt = state.lastTrustedMouse?.at || 0;
        let coords = computeBridgeCoords(cx, cy);
        const mv1 = await sendBridgeAction({ type: 'move', ...coords, label: `${reason}(移至正中心)` });
        if (!mv1 || !mv1.ok) {
          state.cameraZoomBusy = false;
          return;
        }
        await sleep(65 + Math.random() * 45);
        if (state.paused || findDomCardElements().length > 0) {
          state.cameraZoomBusy = false;
          return;
        }
        let m = state.lastTrustedMouse;
        const freshMouse = Boolean(m && m.at > prevMouseAt && m.clientX >= 0);
        if (!freshMouse || Math.hypot(cx - m.clientX, cy - m.clientY) > 90) {
          const calOk = await calibrateBridgeViewport(true);
          if (calOk) {
            coords = computeBridgeCoords(cx, cy);
            await sendBridgeAction({ type: 'move', ...coords, label: `${reason}(校準正中心)` });
            await sleep(75);
          }
        }
        for (let retry = 0; retry < 2; retry++) {
          if (state.paused || findDomCardElements().length > 0) {
            state.cameraZoomBusy = false;
            return;
          }
          m = state.lastTrustedMouse;
          if (!m || Date.now() - m.at > 500 || m.clientX < 0) break;
          const errX = cx - m.clientX;
          const errY = cy - m.clientY;
          if (Math.hypot(errX, errY) <= 12) break;
          const cal = getValidViewportCalib();
          const sxScale = cal ? cal.scaleX : (Number(window.devicePixelRatio) || 1);
          const syScale = cal ? cal.scaleY : (Number(window.devicePixelRatio) || 1);
          coords = {
            ...coords,
            screenX: Math.round(coords.screenX + errX * sxScale),
            screenY: Math.round(coords.screenY + errY * syScale),
          };
          await sendBridgeAction({ type: 'move', ...coords, label: `${reason}(微調正中心${retry + 1})` });
          await sleep(65);
        }
        if (state.paused || findDomCardElements().length > 0) {
          state.cameraZoomBusy = false;
          return;
        }
        m = state.lastTrustedMouse;
        if (m && Date.now() - m.at < 700 && m.clientX >= 0) {
          const hit = document.elementFromPoint(m.clientX, m.clientY);
          if (hit && isOwnHudNode(hit)) {
            state.cameraZoomBusy = false;
            addLog('[視野拉遠] 畫面正中心被輔助面板遮擋，已安全略過以免誤捲面板');
            return;
          }
        }
        const res = await sendBridgeAction({
          type: 'wheel',
          ...coords,
          moveFirst: false,
          delta: -120,
          deltaY: 120,
          steps: targetSteps,
          intervalMs: 45,
          label: reason,
        });
        state.cameraZoomBusy = false;
        if (res && res.ok) {
          addLog(`[視野拉遠] ${reason}完成（已移至畫面正中心，實體滾輪向下 ${targetSteps} 格）`);
        } else if (res?.reason === 'unknown_action') {
          addLog('[視野拉遠] 本機橋接尚未支援實體滾輪，已安全略過（請重新下載更新 ro_bridge_win.ps1 並重啟）');
        }
      } catch (_) {
        state.cameraZoomBusy = false;
      }
    })();
    return true;
  }

  function findMinimapChestsAndLoot(opts = {}) {
    if (state.moonlightState?.active && state.moonlightState.phase !== 'idle') {
      return [];
    }
    const includeDisabled = Boolean(opts && opts.includeDisabled);
    const includeIgnored = Boolean(opts && opts.includeIgnored);
    const includeUnaffordable = Boolean(opts && opts.includeUnaffordable);
    const includeDomFallback = Boolean(opts && opts.includeDomFallback);
    const exactMinimap = document.querySelector('#minimap');
    const coord = opts?.cachedCoord !== undefined ? opts.cachedCoord : readMinimapCoord();
    let box = (exactMinimap && !isOwnHudNode(exactMinimap) && isVisible(exactMinimap, 40) ? exactMinimap : null) || coord?.element?.parentElement || null;
    if (!exactMinimap) {
      for (let i = 0; i < 4 && box && box.parentElement && box.parentElement !== document.body; i++) {
        const pr = box.parentElement.getBoundingClientRect();
        if (pr.width <= 420 && pr.height <= 460 && pr.left > window.innerWidth * 0.5) {
          box = box.parentElement;
        } else break;
      }
      if (!box) {
        box = Array.from(document.querySelectorAll('div, section, aside')).find((el) => {
          if (isOwnHudNode(el) || !isVisible(el, 40)) return false;
          const r = el.getBoundingClientRect();
          return r.left > window.innerWidth * 0.6 && r.top < window.innerHeight * 0.4 && r.width >= 80 && r.width <= 360 && r.height >= 80 && r.height <= 360;
        }) || null;
      }
    }
    const targets = [];
    const canvasScan = scanMinimapCanvasMarkers(box, Boolean(opts && opts.forceFresh));
    if (canvasScan.player) {
      const px = canvasScan.player.cx;
      const py = canvasScan.player.cy;
      // 每個小地圖像素約對應 12px 世界位移（保持與半徑像素量級一致）
      const WORLD_PX_PER_MINIMAP_PX = 12;
      const pushCanvasList = (arr, category, source) => {
        (arr || []).forEach((pt) => {
          const dx = (pt.cx - px) * WORLD_PX_PER_MINIMAP_PX;
          const dy = (pt.cy - py) * WORLD_PX_PER_MINIMAP_PX;
          targets.push({ category, source, dx, dy, dist: Math.hypot(dx, dy), cx: pt.cx, cy: pt.cy });
        });
      };
      pushCanvasList(canvasScan.magnets, 'magnet', 'minimap_canvas_magnet');
      pushCanvasList(canvasScan.equips, 'equip', 'minimap_canvas_equip');
      pushCanvasList(canvasScan.chests, 'chest', 'minimap_canvas_chest');
      pushCanvasList(canvasScan.supplies, 'supply', 'minimap_canvas_supply');
    }
    // 僅當小地圖 Canvas 無法讀取時，才退回掃描小地圖內 DOM 圖示；戰鬥走位期間不再全頁掃描 img/div/span 以維持流暢度
    if (box && canvasScan.access !== 'ok') {
      const boxR = box.getBoundingClientRect();
      const refX = canvasScan.player ? canvasScan.player.screenX : boxR.left + boxR.width * 0.5;
      const refY = canvasScan.player ? canvasScan.player.screenY : boxR.top + boxR.height * 0.5;
      const markers = Array.from(box.querySelectorAll('img, div, span')).filter((m) => {
        if (!isVisible(m, 4) || m === box || isOwnHudNode(m)) return false;
        const mr = m.getBoundingClientRect();
        if (mr.width > 48 || mr.height > 48) return false;
        const probe = [
          m.className,
          m.id,
          m.getAttribute('title'),
          m.getAttribute('alt'),
          m.getAttribute('src'),
        ].filter(Boolean).join(' ').toLowerCase();
        return /chest|box|treasure|drop|loot|equip|gear|weapon|armor|item|magnet|gold|heal|potion|寶箱|裝備|武器|防具|磁鐵|補|箱/.test(probe);
      });
      markers.forEach((m) => {
        const mr = m.getBoundingClientRect();
        const probe = [m.className, m.id, m.getAttribute('title'), m.getAttribute('alt'), m.getAttribute('src')].filter(Boolean).join(' ');
        const category = classifyLootProbe(probe, 'equip');
        const dx = (mr.left + mr.width * 0.5 - refX) * 12;
        const dy = (mr.top + mr.height * 0.5 - refY) * 12;
        targets.push({
          category,
          source: 'minimap_dom',
          element: m,
          dx,
          dy,
          dist: Math.hypot(dx, dy),
        });
      });
    }
    if (includeDomFallback) {
      const groundLoot = Array.from(document.querySelectorAll('img, div, span')).filter((el) => {
        if (isOwnHudNode(el) || el.closest('#lu-sockets') || el.closest('#runitems') || el.closest('#skillbar') || el.closest('.ro-window') || el.closest('#bank-btn') || !isVisible(el, 16)) return false;
        const r = el.getBoundingClientRect();
        if (r.width > 120 || r.height > 120) return false;
        if (r.left > window.innerWidth * 0.6 && r.top < window.innerHeight * 0.4) return false;
        const probe = [el.className, el.id, el.getAttribute('src'), el.getAttribute('title'), el.getAttribute('alt')]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return /(?:magnet|equip-drop|drop-equip|weapon-drop|armor-drop|chest|treasure|drop-box|loot-box|\bcard-chest\b)/i.test(probe);
      });
      const playerPos = getPlayerCenterPoint();
      groundLoot.forEach((c) => {
        const cr = c.getBoundingClientRect();
        const probe = [c.className, c.id, c.getAttribute('src'), c.getAttribute('title'), c.getAttribute('alt')].filter(Boolean).join(' ');
        const category = classifyLootProbe(probe, 'chest');
        const dx = cr.left + cr.width * 0.5 - playerPos.x;
        const dy = cr.top + cr.height * 0.5 - playerPos.y;
        targets.push({
          category,
          source: 'ground_dom',
          element: c,
          dx,
          dy,
          dist: Math.hypot(dx, dy),
        });
      });
    }
    const now = Date.now();
    if (Array.isArray(state.ignoredLootTargets) && state.ignoredLootTargets.length > 0) {
      state.ignoredLootTargets = state.ignoredLootTargets.filter((ig) => ig && ig.until > now);
    }
    const zenyStatus = includeUnaffordable ? { canAffordChest: true } : readZenyAndChestCost();
    const order = getLootOrder();
    const filtered = targets.filter((t) => {
      if (!includeDisabled && !isLootCategoryEnabled(t.category)) return false;
      if (!includeUnaffordable && t.category === 'chest' && !zenyStatus.canAffordChest) return false;
      if (!includeIgnored && typeof t.cx === 'number' && typeof t.cy === 'number' && state.ignoredLootTargets?.length) {
        const isBlacklisted = state.ignoredLootTargets.some(
          (ig) => ig.until > now && Math.hypot(t.cx - ig.cx, t.cy - ig.cy) <= 10
        );
        if (isBlacklisted) return false;
      }
      if (t.category === 'magnet' && CONFIG.autoMoveConfig.smartMagnetEnabled !== false) {
        const mag = getSmartMagnetStatus(now);
        if (!mag.allowed) return false;
      }
      return true;
    });
    filtered.sort((a, b) => {
      const ra = order.indexOf(a.category);
      const rb = order.indexOf(b.category);
      const oa = ra < 0 ? 99 : ra;
      const ob = rb < 0 ? 99 : rb;
      if (oa !== ob) return oa - ob;
      return a.dist - b.dist;
    });
    return filtered;
  }

  function formatMmSs(totalSec) {
    const s = Math.max(0, Math.ceil(Number(totalSec) || 0));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function resolveCurrentStageInfo() {
    try {
      const stageName = String(state.mapCenterCoord?.stageName || readMinimapCoord()?.stageName || '').trim();
      if (stageName) {
        const hit = STAGES_DATA.find(
          (s) =>
            s.name === stageName ||
            s.place.includes(stageName) ||
            stageName.includes(s.name) ||
            stageName.includes(s.place)
        );
        if (hit) return hit;
      }
      const ex = getExtra();
      const activeId = state.activeFarmStageId || ex.farmStageId;
      const sel = STAGES_DATA.find((s) => s.id === activeId) || STAGES_DATA.find((s) => s.id === ex.farmStageId);
      if (sel) return sel;
    } catch (_) {}
    return null;
  }

  function resolveCurrentStageRunLengthSec() {
    const stg = resolveCurrentStageInfo();
    return stg && typeof stg.runLength === 'number' ? stg.runLength : 840;
  }

  function getStageBossScheduleStatus(clockSec = readGameClockSec()) {
    const stg = resolveCurrentStageInfo();
    if (!stg || !stg.bossTime || clockSec === null || clockSec === undefined) return null;
    const bossTime = Number(stg.bossTime) || 0;
    const fightWin = Number(stg.bossFightWindowSec) || 120;
    const hardEnd = stg.runLength || (bossTime + fightWin);
    const minis = Array.isArray(stg.miniBossTimes) ? stg.miniBossTimes : [];
    const elapsed = state.clockDir === 'down' ? Math.max(0, hardEnd - clockSec) : Math.max(0, clockSec);
    if (elapsed >= bossTime) {
      const fightRemain = Math.max(0, hardEnd - elapsed);
      return {
        stage: stg,
        phase: 'boss_fight',
        elapsed,
        bossTime,
        hardEnd,
        fightRemain,
        liveText: `👑打王剩 ${formatMmSs(fightRemain)}`,
        clockText: `👑最後王戰中（打王剩 ${formatMmSs(fightRemain)}）`,
      };
    }
    const nextMini = minis.find((t) => t > elapsed);
    if (typeof nextMini === 'number') {
      const inSec = Math.max(1, Math.ceil(nextMini - elapsed));
      const bossInSec = Math.max(1, Math.ceil(bossTime - elapsed));
      return {
        stage: stg,
        phase: 'before_miniboss',
        elapsed,
        bossTime,
        hardEnd,
        nextAtSec: nextMini,
        inSec,
        bossInSec,
        liveText: `👑小王 ${formatMmSs(nextMini)}(剩${formatMmSs(inSec)})`,
        clockText: `下波小王 ${formatMmSs(nextMini)}(剩${formatMmSs(inSec)})｜最後王 ${formatMmSs(bossTime)}(+2分打王)`,
      };
    }
    const bossInSec = Math.max(1, Math.ceil(bossTime - elapsed));
    return {
      stage: stg,
      phase: 'before_boss',
      elapsed,
      bossTime,
      hardEnd,
      nextAtSec: bossTime,
      inSec: bossInSec,
      bossInSec,
      liveText: `👑最後王 ${formatMmSs(bossTime)}(剩${formatMmSs(bossInSec)})`,
      clockText: `下波最後王 ${formatMmSs(bossTime)}(剩${formatMmSs(bossInSec)}，+2分打王)`,
    };
  }

  function getSmartMagnetStatus(now = Date.now()) {
    const mCfg = CONFIG.autoMoveConfig || {};
    if (!mCfg.autoLootChests || !isLootCategoryEnabled('magnet')) {
      return {
        allowed: false,
        phase: 'off',
        shortText: '關閉',
        liveText: '🧲 停用',
        tooltip: '磁鐵自動撿取未啟用（請至「撿取」分頁勾選自動撿取與磁鐵）',
        cls: 'rh-mag-off',
        remainSec: 0,
      };
    }
    const inCombat = isInCombat();
    if (!inCombat) {
      return {
        allowed: false,
        phase: 'lobby',
        shortText: '待命',
        liveText: '🧲 待命',
        tooltip: '磁鐵計時待命中（進入關卡開始戰鬥後自動計時）',
        cls: 'rh-mag-off',
        remainSec: 0,
      };
    }
    if (state.navTarget?.type === 'chest' && state.navTarget.category === 'magnet') {
      return {
        allowed: true,
        phase: 'tracking',
        shortText: '撿取',
        liveText: '🧲 撿取中',
        tooltip: `正在前往撿取小地圖偵測到的磁鐵（距離約 ${Math.round(state.navTarget.dist || 0)}px）`,
        cls: 'rh-mag-track',
        remainSec: 0,
      };
    }
    if (mCfg.smartMagnetEnabled === false) {
      return {
        allowed: true,
        phase: 'free',
        shortText: '不限',
        liveText: '🧲 不限',
        tooltip: '智慧磁鐵時間控管已關閉：偵測到磁鐵即刻前往撿取',
        cls: 'rh-mag-ready',
        remainSec: 0,
      };
    }
    const clockSec = readGameClockSec();
    const stg = resolveCurrentStageInfo();
    const bossTimeSec = stg && typeof stg.bossTime === 'number' && stg.bossTime > 0 ? stg.bossTime : null;
    const runLenSec = resolveCurrentStageRunLengthSec();
    const rushAnchorSec = bossTimeSec || (runLenSec > 0 ? runLenSec : null);
    if (clockSec !== null && state.initialClockSec === undefined) {
      state.initialClockSec = clockSec;
    }
    let elapsedSec = 0;
    let remainingToBossSec = null;
    let remainingToHardEndSec = null;
    let inBossFight = false;
    if (clockSec !== null) {
      if (state.clockDir === 'down') {
        const initBase = Math.max(state.initialClockSec || 0, runLenSec || 840, clockSec);
        elapsedSec = Math.max(0, initBase - clockSec);
        remainingToHardEndSec = clockSec;
        remainingToBossSec = bossTimeSec ? Math.max(0, bossTimeSec - elapsedSec) : clockSec;
        inBossFight = Boolean(bossTimeSec && elapsedSec >= bossTimeSec);
      } else {
        elapsedSec = Math.max(0, clockSec);
        remainingToBossSec = rushAnchorSec ? Math.max(0, rushAnchorSec - clockSec) : null;
        remainingToHardEndSec = runLenSec > 0 ? Math.max(0, runLenSec - clockSec) : null;
        inBossFight = Boolean(bossTimeSec && clockSec >= bossTimeSec);
      }
    }
    const firstSec = Math.max(0, Number(mCfg.magnetFirstMin ?? 2.5) * 60);
    const intervalSec = Math.max(0, Number(mCfg.magnetIntervalMin ?? 3.0) * 60);
    const endRushSec = Math.max(0, Number(mCfg.magnetEndRemainingMin ?? 3.0) * 60);
    const isEndRush = inBossFight || (remainingToBossSec !== null && endRushSec > 0 && remainingToBossSec <= endRushSec);
    if (isEndRush) {
      if (inBossFight) {
        const fightLeft = remainingToHardEndSec ?? 0;
        return {
          allowed: true,
          phase: 'rush',
          shortText: '打王',
          liveText: `🧲 打王衝刺(${formatMmSs(fightLeft)})`,
          tooltip: `最後王已出現（打王 2 分鐘上限約剩 ${formatMmSs(fightLeft)}），智慧磁鐵已解除冷卻限制`,
          cls: 'rh-mag-rush',
          remainSec: fightLeft,
        };
      }
      return {
        allowed: true,
        phase: 'rush',
        shortText: '衝刺',
        liveText: `🧲 衝刺(${bossTimeSec ? '王' : ''}${formatMmSs(remainingToBossSec)})`,
        tooltip: bossTimeSec
          ? `智慧磁鐵尾盤衝刺：距最後王（${formatMmSs(bossTimeSec)}）約剩 ${formatMmSs(remainingToBossSec)}（≤ ${mCfg.magnetEndRemainingMin ?? 3} 分），已解除冷卻限制`
          : `智慧磁鐵尾盤衝刺：關卡約剩 ${formatMmSs(remainingToBossSec)}（≤ ${mCfg.magnetEndRemainingMin ?? 3} 分），已解除冷卻限制`,
        cls: 'rh-mag-rush',
        remainSec: remainingToBossSec,
      };
    }
    if (elapsedSec < firstSec) {
      const waitSec = Math.max(1, Math.ceil(firstSec - elapsedSec));
      return {
        allowed: false,
        phase: 'first_wait',
        shortText: formatMmSs(waitSec),
        liveText: `🧲 首等 ${formatMmSs(waitSec)}`,
        tooltip: `智慧磁鐵開局鎖定中：還需 ${formatMmSs(waitSec)} 開放撿取（已過 ${formatMmSs(elapsedSec)} / 設定前 ${mCfg.magnetFirstMin ?? 2.5} 分不撿）`,
        cls: 'rh-mag-wait',
        remainSec: waitSec,
      };
    }
    const sinceLastSec = state.lastMagnetPickupTime ? Math.max(0, (now - state.lastMagnetPickupTime) / 1000) : null;
    if (sinceLastSec !== null && sinceLastSec < intervalSec) {
      const cdSec = Math.max(1, Math.ceil(intervalSec - sinceLastSec));
      return {
        allowed: false,
        phase: 'cooldown',
        shortText: formatMmSs(cdSec),
        liveText: `🧲 冷卻 ${formatMmSs(cdSec)}`,
        tooltip: `智慧磁鐵冷卻中：距上次撿取 ${formatMmSs(sinceLastSec)}，還需 ${formatMmSs(cdSec)}（間隔 ${mCfg.magnetIntervalMin ?? 3} 分）`,
        cls: 'rh-mag-cd',
        remainSec: cdSec,
      };
    }
    return {
      allowed: true,
      phase: 'ready',
      shortText: '可撿',
      liveText: '🧲 可撿',
      tooltip: sinceLastSec !== null
        ? `智慧磁鐵已就緒（距上次撿取 ${formatMmSs(sinceLastSec)}）：看到磁鐵將優先撿取`
        : `智慧磁鐵已就緒（已過 ${formatMmSs(elapsedSec)}）：看到磁鐵將優先撿取`,
      cls: 'rh-mag-ready',
      remainSec: 0,
    };
  }

  function updateMiniMagnetHud() {
    const el = $id('rh-mini-magnet');
    if (!el) return;
    if (state.farmRestUntil && state.farmRestUntil > Date.now()) {
      const remSec = Math.max(0, Math.ceil((state.farmRestUntil - Date.now()) / 1000));
      const mm = Math.floor(remSec / 60);
      const ss = String(remSec % 60).padStart(2, '0');
      const wakeStr = new Date(state.farmRestUntil).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
      el.textContent = `😴${mm}:${ss}`;
      el.title = `階段休息登出中：剩餘 ${mm} 分 ${ss} 秒（預計 ${wakeStr} 自動登入續刷）`;
      el.className = 'rh-mag-wait';
      return;
    }
    const st = getSmartMagnetStatus();
    el.textContent = `🧲${st.shortText}`;
    el.title = st.tooltip;
    el.className = st.cls;
  }

  function updateMoveHud(force = false, cachedCoord = undefined) {
    const panelEl = $id('rh-panel');
    const isMinimized = Boolean(panelEl?.classList.contains('rh-minimized'));
    if (isMinimized && !force) {
      updateStatusBar();
      return;
    }
    const btn = $id('rh-btn-move');
    const info = $id('rh-move-info');
    const coordInfoEl = $id('rh-map-coord-info');
    const moveTabActive = Boolean($id('rh-panel-move')?.classList.contains('active'));
    const lobbyStandby =
      CONFIG.autoMoveConfig.mode === 'radius_wander' &&
      !state.lowHpEvading &&
      (isInVillageLobby() || !isInCombat());
    if (btn) {
      btn.textContent = state.lowHpEvading
        ? '走位：殘血閃避中'
        : CONFIG.autoMoveConfig.mode !== 'radius_wander'
        ? '走位：定點不動'
        : lobbyStandby
        ? '走位：村莊待命（進本啟動）'
        : '走位：半徑繞行';
      btn.className =
        state.lowHpEvading || (CONFIG.autoMoveConfig.mode === 'radius_wander' && !lobbyStandby)
          ? 'rh-btn rh-btn-active'
          : 'rh-btn';
    }
    if (info && (moveTabActive || force)) {
      const dist = Math.round(Math.hypot(state.posX, state.posY));
      const styleMap = { human_natural: '擬人', smooth_continuous: '順暢', burst_pause: '走停' };
      const styleLabel = styleMap[CONFIG.autoMoveConfig.style] || '擬人';
      if (state.moonlightState?.active && state.moonlightState.phase !== 'idle') {
        const ms = state.moonlightState;
        const phaseMap = {
          seek_p1: '🔔 月夜貓一階：全速前往金鐘避難',
          hold_p1: '🛡️ 月夜貓一階：金鐘底座站樁避難 (收圈中)',
          fight_berserk: '😾 狂暴月夜貓：限時20秒集中輸出',
          seek_p2: '✨ 月夜貓二階：鐘已開啟！衝回金鐘避難',
          hold_p2: '🛡️ 月夜貓二階：金鐘底座站樁避難 (大收圈)',
          reposition: '💥 收圈完畢：拉開距離避免月夜貓近身',
        };
        info.textContent = phaseMap[ms.phase] || '🔔 月夜貓避難接管中';
      } else if (state.swarmBreakout?.active && Date.now() < (state.swarmBreakout.until || 0)) {
        const remSec = Math.max(1, Math.ceil((state.swarmBreakout.until - Date.now()) / 1000));
        const stageLbl = state.swarmBreakout.escapedRing ? '外圍風箏拉開' : '單向直線突圍';
        info.textContent = `💨 包圍怪潮${stageLbl}（往${state.swarmBreakout.dirLabel || '前方'} · 剩 ${remSec}s）`;
      } else if (lobbyStandby) {
        info.textContent = `半徑 ${CONFIG.autoMoveConfig.radiusPx}px · 村莊/非戰鬥待命中 (${styleLabel})`;
      } else if (Date.now() < (state.detourUntil || 0)) {
        info.textContent = `半徑 ${CONFIG.autoMoveConfig.radiusPx}px · 卡牆繞行脫困中 (${styleLabel})`;
      } else if (state.navTarget?.type === 'boss_red_evade') {
        const pct = Math.round((state.navTarget.footRed || 0) * 100);
        info.textContent = `🔴 紅圈短步閃避中（腳下 ${pct}% → ${state.navTarget.dirLabel || '安全區'}）`;
      } else if (state.navTarget?.type === 'boss_red_hold') {
        const pct = Math.round(Math.max(state.navTarget.nearRed || 0, state.navTarget.fieldRed || 0) * 100);
        info.textContent = `🛡️ 安全區定住避紅（周圍紅區 ${pct}% · 維持輸出）`;
      } else if (state.navTarget?.type === 'boss_kite') {
        const bTag = state.navTarget.bossKind === 'miniboss' ? '小王' : '首領王';
        const actTag = state.navTarget.action === 'retreat' ? '拉開' : state.navTarget.action === 'approach' ? '微靠近' : '繞行風箏';
        info.textContent = `王距控距(${bTag}) 距約 ${state.navTarget.distTiles ?? '?'} 格 · ${actTag}至 ~15 格 (${styleLabel})`;
      } else if (state.navTarget?.type === 'chest') {
        const tgtLabel = state.navTarget.label || LOOT_CATEGORY_META[state.navTarget.category]?.label || '目標物品';
        info.textContent = `半徑 ${CONFIG.autoMoveConfig.radiusPx}px · 前往撿【${tgtLabel}】距約 ${Math.round(state.navTarget.dist || 0)}px (${styleLabel})`;
      } else if (state.navTarget?.type === 'center') {
        info.textContent = `半徑 ${CONFIG.autoMoveConfig.radiusPx}px · 撿完返回中心中 距中心約 ${dist}px (${styleLabel})`;
      } else {
        info.textContent = `半徑 ${CONFIG.autoMoveConfig.radiusPx}px · 距中心約 ${dist}px (${styleLabel})`;
      }
    }
    if (coordInfoEl && (moveTabActive || force)) {
      const coord = cachedCoord !== undefined ? cachedCoord : readMinimapCoord();
      if (coord && state.mapCenterCoord) {
        const dX = coord.x - state.mapCenterCoord.x;
        const dY = coord.y - state.mapCenterCoord.y;
        const tileDist = Math.round(Math.hypot(dX, dY));
        const signX = dX >= 0 ? `+${dX}` : `${dX}`;
        const signY = dY >= 0 ? `+${dY}` : `${dY}`;
        const srcTag = state.mapCenterCoord.source === 'manual' ? '手動' : state.mapCenterCoord.source === 'midrun_temp' ? '暫代' : '已記錄';
        coordInfoEl.textContent = `地圖中心 (${state.mapCenterCoord.x}, ${state.mapCenterCoord.y})[${srcTag}] ｜ 目前 (${coord.x}, ${coord.y}) · 偏移 (${signX}, ${signY}) · 距 ${tileDist} 格`;
      } else if (coord) {
        coordInfoEl.textContent = `目前座標【${coord.raw}】｜ 待對齊地圖中心`;
      } else {
        coordInfoEl.textContent = '地圖中心：開局自動記錄並校準原點 (0, 0)';
      }
    }
    updateStatusBar();
  }

  // === 3.5 打王 3D 地面紅圈偵測與雙模式閃避引擎（安全區定住煞車 ＋ 踩紅短步閃避 ＋ 風箏防踩紅偏轉） ===
  const BOSS_RED_DIRS = [
    { idx: 0, label: '右(D)', ux: 1, uy: 0, angle: 0 },
    { idx: 1, label: '右下(SD)', ux: 0.7071, uy: 0.7071, angle: Math.PI / 4 },
    { idx: 2, label: '下(S)', ux: 0, uy: 1, angle: Math.PI / 2 },
    { idx: 3, label: '左下(SA)', ux: -0.7071, uy: 0.7071, angle: (3 * Math.PI) / 4 },
    { idx: 4, label: '左(A)', ux: -1, uy: 0, angle: Math.PI },
    { idx: 5, label: '左上(WA)', ux: -0.7071, uy: -0.7071, angle: -(3 * Math.PI) / 4 },
    { idx: 6, label: '上(W)', ux: 0, uy: -1, angle: -Math.PI / 2 },
    { idx: 7, label: '右上(WD)', ux: 0.7071, uy: -0.7071, angle: -Math.PI / 4 },
  ];

  // 經全 6 隻王實測影片（日夜網格條、斜條、多紅圈、星芒、大圓環、一般普攻對照）校準之地面預警紅區色域
  function isBossTelegraphRedPixel(r, g, b) {
    return (
      r >= 126 &&
      r - g >= 50 &&
      r - b >= 56 &&
      g <= 128 &&
      b <= 118 &&
      r >= g * 1.55
    );
  }

  // 經斐揚洞穴 MVP 月夜貓實戰截圖（含紅圈環境光照射下的暖青銅金鐘）校準之暖金色鐘體色域
  // 紅光照射下金鐘偏暖橘金 (R略高於G，但 G 仍明顯高於 B 且 R/G <= 1.48)，與地面純紅區 (R/G >= 1.55、G≈B) 及暗藍洞穴地面明確區隔
  function isMoonlightGoldenBellPixel(r, g, b) {
    return (
      r >= 58 &&
      g >= 50 &&
      b <= 132 &&
      r - b >= 20 &&
      g - b >= 14 &&
      r - g >= -8 &&
      r - g <= 52 &&
      r <= g * 1.48
    );
  }

  function readGameAnnounceText() {
    try {
      const els = document.querySelectorAll('#announce, .announce, #notice, .toast, [id*="announce" i], [class*="announce" i], [class*="banner" i]');
      const parts = [];
      for (const el of els) {
        if (!el || isOwnHudNode(el)) continue;
        const st = window.getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) < 0.05) continue;
        const t = (el.textContent || '').trim();
        if (t) parts.push(t);
      }
      return parts.join(' ');
    } catch (_) {
      return '';
    }
  }

  function readBossBarInfo() {
    try {
      const bars = document.querySelectorAll('#boss-bar, #boss-hp, #boss-hud, .boss-bar, .boss-hp, .boss-hud, [id*="boss" i], [class*="boss" i]');
      let visible = false;
      let combined = '';
      for (const bar of bars) {
        if (!bar || isOwnHudNode(bar)) continue;
        const r = bar.getBoundingClientRect();
        if (r.width < 40 || r.height < 6 || r.top > window.innerHeight * 0.35) continue;
        const st = window.getComputedStyle(bar);
        if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) < 0.05) continue;
        visible = true;
        const t = (bar.textContent || '').trim();
        if (t) combined += ' ' + t;
      }
      const txt = combined.trim();
      return {
        visible,
        text: txt,
        hasMoonlight: /月夜貓/i.test(txt),
        hasBerserk: /狂暴月夜貓/i.test(txt),
      };
    } catch (_) {
      return { visible: false, text: '', hasMoonlight: false, hasBerserk: false };
    }
  }

  function isPayonCaveActive() {
    try {
      const curCoord = readMinimapCoord();
      if (curCoord && /斐揚洞穴|payon_cave/i.test(curCoord.stageName || curCoord.raw || '')) {
        return true;
      }
      if (/斐揚洞穴|payon_cave/i.test(state.mapCenterCoord?.stageName || '')) {
        return true;
      }
      const ex = getExtra();
      if (ex && ex.farmStageId === 'payon_cave') return true;
    } catch (_) {}
    return false;
  }

  function scanMoonlightBellZone(forceFresh = false) {
    const now = Date.now();
    if (!forceFresh && state.lastMoonlightBellScan && now - (state.lastMoonlightBellScanAt || 0) < 95) {
      return state.lastMoonlightBellScan;
    }
    const worldCanvas =
      document.querySelector('#stage canvas.world3d') ||
      Array.from(document.querySelectorAll('canvas')).find((c) => {
        if (isOwnHudNode(c) || c.closest('#minimap')) return false;
        const r = c.getBoundingClientRect();
        return r.width >= 320 && r.height >= 200;
      });
    if (!worldCanvas || !worldCanvas.width || !worldCanvas.height) {
      return { ok: false, found: false, blobSize: 0, isStandingInBell: false, reason: 'no_canvas' };
    }
    const W = 160;
    const H = 90;
    if (!state.bossRedCanvas) {
      state.bossRedCanvas = document.createElement('canvas');
      state.bossRedCanvas.width = W;
      state.bossRedCanvas.height = H;
      state.bossRedCtx = state.bossRedCanvas.getContext('2d', { willReadFrequently: true });
    }
    const ctx = state.bossRedCtx;
    if (!ctx) return { ok: false, found: false, blobSize: 0, isStandingInBell: false, reason: 'no_ctx' };
    let data = null;
    try {
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(worldCanvas, 0, 0, W, H);
      data = ctx.getImageData(0, 0, W, H).data;
    } catch (_) {
      return { ok: false, found: false, blobSize: 0, isStandingInBell: false, reason: 'tainted' };
    }

    const cx = Math.round(W * 0.5);   // 80
    const cy = Math.round(H * 0.525); // 48
    const grid = new Uint8Array(W * H);
    let redBgHits = 0;
    let roiTotal = 0;
    let nearBellRedHits = 0;
    let nearBellRedTotal = 0;

    for (let y = 14; y < 86; y++) {
      for (let x = 0; x < W; x++) {
        if (y < 24 && x >= 130) continue; // 避開右上小地圖
        if (y < 18 && x < 42) continue;   // 避開左上玩家頭像
        if (y >= 72 && x >= 60 && x <= 100) continue; // 避開底部中央道具與技能列（不遮擋左下／右下金鐘）
        roiTotal++;
        const i = (y * W + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (isMoonlightGoldenBellPixel(r, g, b)) {
          grid[y * W + x] = 1;
        }
        const isRedZone = r >= 55 && r - g >= 22 && r - b >= 22;
        if (isRedZone) {
          redBgHits++;
        }
        // 偵測緊貼金鐘外緣的縮圈紅光環（最後 1~3 秒縮圈已縮小、全螢幕 redBg 下降，但鐘周圍近區紅度最高）
        const adx = Math.abs(x - cx);
        const ady = Math.abs(y - cy);
        if (adx <= 26 && ady <= 18 && !(adx <= 4 && ady <= 3)) {
          nearBellRedTotal++;
          if (isRedZone || isBossTelegraphRedPixel(r, g, b)) {
            nearBellRedHits++;
          }
        }
      }
    }

    const msLive = state.moonlightState;
    const isHoldingBell = Boolean(msLive?.active && (msLive.phase === 'hold_p1' || msLive.phase === 'hold_p2'));
    const prevTarget = msLive?.lastBellCanvasTarget && (now - (msLive.lastBellSeenAt || 0) < 2800) ? msLive.lastBellCanvasTarget : null;

    // 連通區塊搜尋暖金色色塊（加入空間連續性加權，避免站樁於金鐘內時被畫面他處火球／雷擊等金色技能特效劫持）
    const vis = new Uint8Array(W * H);
    let best = { cnt: 0, score: -1, sx: 0, sy: 0, minY: 90, maxY: 0, minX: 160, maxX: 0 };
    let bestPixels = null;
    for (let y = 14; y < 86; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        if (!grid[idx] || vis[idx]) continue;
        const q = [idx];
        vis[idx] = 1;
        let cnt = 0, sx = 0, sy = 0, minY = 90, maxY = 0, minX = 160, maxX = 0;
        for (let qi = 0; qi < q.length; qi++) {
          const cur = q[qi];
          const curX = cur % W, curY = (cur / W) | 0;
          cnt++;
          sx += curX;
          sy += curY;
          if (curY < minY) minY = curY;
          if (curY > maxY) maxY = curY;
          if (curX < minX) minX = curX;
          if (curX > maxX) maxX = curX;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const nx = curX + dx, ny = curY + dy;
              if (nx < 0 || nx >= W || ny < 14 || ny >= 86) continue;
              const nIdx = ny * W + nx;
              if (grid[nIdx] && !vis[nIdx]) {
                vis[nIdx] = 1;
                q.push(nIdx);
              }
            }
          }
        }
        const bx = sx / Math.max(1, cnt);
        const by = sy / Math.max(1, cnt);
        let score = cnt;
        if (cnt >= 16) {
          if (isHoldingBell) {
            const dCenter = Math.hypot(bx - cx, by - cy);
            if (dCenter <= 16) score = cnt * 4.0;
            else if (dCenter > 22) score = cnt * 0.25;
          } else if (prevTarget) {
            const dPrev = Math.hypot(bx - prevTarget.x, by - prevTarget.y);
            if (dPrev <= 22) score = cnt * 1.65;
          }
        }
        if (score > best.score || (score === best.score && cnt > best.cnt)) {
          best = { cnt, score, sx, sy, minY, maxY, minX, maxX };
          bestPixels = q;
        }
      }
    }

    let footGoldHits = 0;
    let footTotal = 0;
    let coreGoldHits = 0;
    let coreTotal = 0;
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        if ((dx * dx) / 36 + (dy * dy) / 16 > 1) continue;
        footTotal++;
        const pIdx = ((cy + dy) * W + (cx + dx)) * 4;
        const isGold = isMoonlightGoldenBellPixel(data[pIdx], data[pIdx + 1], data[pIdx + 2]);
        if (isGold) footGoldHits++;
        if ((dx * dx) / 9 + (dy * dy) / 4 <= 1) {
          coreTotal++;
          if (isGold) coreGoldHits++;
        }
      }
    }
    const footGold = footTotal > 0 ? footGoldHits / footTotal : 0;
    const coreGold = coreTotal > 0 ? coreGoldHits / coreTotal : 0;
    const redBg = roiTotal > 0 ? redBgHits / roiTotal : 0;
    const nearBellRed = nearBellRedTotal > 0 ? nearBellRedHits / nearBellRedTotal : 0;

    const bellFound = best.cnt >= 22;
    if (bellFound && msLive) {
      msLive.lastBellSeenAt = now;
    }
    const bellCenter = bellFound ? { x: best.sx / best.cnt, y: best.sy / best.cnt } : null;
    const blobW = bellFound ? Math.max(1, best.maxX - best.minX) : 0;
    const blobH = bellFound ? Math.max(1, best.maxY - best.minY) : 0;
    const bellRadius = bellFound ? Math.max(3.2, Math.min(9.5, blobW * 0.36)) : 5.0;
    const centerStopDist = Math.max(2.2, Math.min(3.5, bellRadius * 0.42));

    // 站位目標點：改取金鐘下半部（地面金色圓盤區 y >= 50%）的實際質心，往鐘正中心更深入對齊
    let standTarget = null;
    if (bellFound) {
      const splitY = best.minY + blobH * 0.50;
      let discCnt = 0;
      let discSx = 0;
      let discSy = 0;
      if (bestPixels && bestPixels.length) {
        for (let pi = 0; pi < bestPixels.length; pi++) {
          const idx = bestPixels[pi];
          const py = (idx / W) | 0;
          if (py >= splitY) {
            discCnt++;
            discSx += idx % W;
            discSy += py;
          }
        }
      }
      const avgX = best.sx / best.cnt;
      const fallbackY = best.minY + blobH * 0.74;
      const standX = discCnt >= 8 ? (discSx / discCnt) * 0.72 + avgX * 0.28 : avgX;
      const rawStandY = discCnt >= 8 ? (discSy / discCnt) * 0.65 + fallbackY * 0.35 : fallbackY;
      const standY = Math.max(best.minY + blobH * 0.66, Math.min(best.minY + blobH * 0.80, rawStandY));
      standTarget = { x: standX, y: standY };
    }

    const distToStand = standTarget ? Math.hypot(standTarget.x - cx, standTarget.y - cy) : 999;
    // 嚴格要求走到鐘心內部（不再於外緣擦邊 16% 就提前煞車）
    const isStandingInBell = bellFound
      ? (distToStand <= centerStopDist && (coreGold >= 0.12 || footGold >= 0.16 || distToStand <= 2.3)) ||
        (coreGold >= 0.42 && footGold >= 0.32 && distToStand <= centerStopDist + 1.3)
      : false;
    const isInsideBellOuter = bellFound && (footGold >= 0.18 || distToStand <= bellRadius * 0.85);

    // 視覺側翼開闊度評估：遇到大岩石阻擋時，比較目標方向 +95° 與 -95° 兩側的暗色岩石／邊界牆像素密度，優先選擇開闊側繞行
    let preferredDetourSide = 1;
    if (standTarget && distToStand > 5) {
      const baseAng = Math.atan2(standTarget.y - cy, standTarget.x - cx);
      const evalFlankRockScore = (sideSign) => {
        let score = 0;
        const angOffsets = [1.15, 1.55, 1.95]; // 約 66°, 89°, 112°
        const dists = [6, 10, 14, 18, 22];
        for (let ai = 0; ai < angOffsets.length; ai++) {
          const ang = baseAng + sideSign * angOffsets[ai];
          const cosA = Math.cos(ang);
          const sinA = Math.sin(ang);
          for (let di = 0; di < dists.length; di++) {
            const sx = Math.round(cx + cosA * dists[di]);
            const sy = Math.round(cy + sinA * dists[di]);
            if (sx < 4 || sx >= W - 4 || sy < 14 || sy >= 82) {
              score += 2.2;
              continue;
            }
            const pIdx = (sy * W + sx) * 4;
            const pr = data[pIdx], pg = data[pIdx + 1], pb = data[pIdx + 2];
            // 洞穴岩石與邊界黑區：低亮度且非紅區／非金鐘
            const isDarkObstacle = pr < 72 && pg < 72 && pb < 72 && pr - pg < 16;
            if (isDarkObstacle) score += 1;
          }
        }
        return score;
      };
      const plusScore = evalFlankRockScore(1);
      const minusScore = evalFlankRockScore(-1);
      preferredDetourSide = plusScore <= minusScore ? 1 : -1;
    }

    const result = {
      ok: true,
      at: now,
      found: bellFound,
      blobSize: best.cnt,
      blobW,
      blobH,
      bellCenter,
      standTarget,
      bellRadius,
      centerStopDist,
      footGold,
      coreGold,
      redBg,
      nearBellRed,
      distToStand,
      isStandingInBell,
      isInsideBellOuter,
      preferredDetourSide,
    };
    state.lastMoonlightBellScanAt = now;
    state.lastMoonlightBellScan = result;
    return result;
  }

  function updateMoonlightBellState(now, curCoord) {
    if (CONFIG.autoMoveConfig.moonlightBellDodgeEnabled === false) return;
    const ms = state.moonlightState;
    if (!ms) return;

    if (!isPayonCaveActive() || Boolean(document.querySelector('.summary-window'))) {
      if (ms.active) {
        ms.active = false;
        ms.phase = 'idle';
        ms.holdAnchorCoord = null;
        ms.holdOutsideFrames = 0;
        ms.consecutiveNoBellFrames = 0;
        ms.consecutiveSafeEndFrames = 0;
      }
      return;
    }

    const bossInfo = readBossBarInfo();
    const announceTxt = readGameAnnounceText();

    if (bossInfo.hasMoonlight || /月夜貓|躲到鐘下|狂暴月夜貓|鐘開啟了|鐘被封印/i.test(announceTxt)) {
      ms.active = true;
    }

    if (!ms.active) return;

    const bellScan = scanMoonlightBellZone(false);
    const hasSealedAnnounce = /鐘被封印|狂暴月夜貓/.test(announceTxt) || bossInfo.hasBerserk;
    const hasBellOpenAnnounce = /鐘開啟了|快躲到下面/.test(announceTxt);
    const hasP1Announce = /躲到鐘下|快躲到鐘下/.test(announceTxt);

    // 最高優先級跨階段強制轉換：避免二階「鐘被封印」或「鐘開啟了」被殘留的一階狀態卡死
    if (hasSealedAnnounce && ms.phase !== 'fight_berserk') {
      ms.phase = 'fight_berserk';
      ms.phaseStartedAt = now;
      ms.phaseTimeoutAt = now + 24000;
      ms.phaseHardTimeoutAt = now + 28000;
      ms.holdAnchorCoord = null;
      ms.holdEnteredAt = 0;
      ms.holdOutsideFrames = 0;
      ms.consecutiveNoBellFrames = 0;
      ms.consecutiveSafeEndFrames = 0;
      ms.visualP1Frames = 0;
      ms.detourUntil = 0;
      ms.postDetourUntil = 0;
      ms.stuckStreak = 0;
      state.bankCooldownUntil = now + 24000;
      addLog('[月夜貓避難] ⚠️ 偵測到二階段「鐘被封印！」，狂暴月夜貓出現（限時20秒擊殺），轉為近身繞行集中輸出');
      return;
    }
    if (hasBellOpenAnnounce && ms.phase !== 'seek_p2' && ms.phase !== 'hold_p2') {
      ms.phase = 'seek_p2';
      ms.phaseStartedAt = now;
      ms.phaseTimeoutAt = now + 28000;
      ms.phaseHardTimeoutAt = now + 35000;
      ms.holdAnchorCoord = null;
      ms.holdEnteredAt = 0;
      ms.holdOutsideFrames = 0;
      ms.consecutiveNoBellFrames = 0;
      ms.consecutiveSafeEndFrames = 0;
      ms.visualP1Frames = 0;
      ms.detourUntil = 0;
      ms.postDetourUntil = 0;
      ms.stuckStreak = 0;
      ms.lastStuckCoord = null;
      ms.lastStuckMsAccum = 0;
      ms.nearBellEnteredAt = 0;
      state.bankCooldownUntil = now + 28000;
      if (state.navTarget?.type === 'chest') state.navTarget = null;
      addLog('[月夜貓避難] ✨ 狂暴月夜貓已擊殺！「鐘開啟了！」，立即全速衝回金鐘下避難');
      return;
    }

    // 階段轉換邏輯
    if (ms.phase === 'idle') {
      const visualP1Candidate =
        bossInfo.hasMoonlight &&
        !bossInfo.hasBerserk &&
        now - (ms.p1EndedAt || 0) >= 6000 &&
        bellScan.found &&
        bellScan.blobSize >= 42 &&
        (bellScan.blobW || 0) >= 7 &&
        (bellScan.blobH || 0) >= 7 &&
        bellScan.redBg >= 0.10;
      const instantLargeBell = visualP1Candidate && bellScan.blobSize >= 70 && bellScan.redBg >= 0.14;
      ms.visualP1Frames = visualP1Candidate ? (ms.visualP1Frames || 0) + 1 : 0;
      const triggerP1 = hasP1Announce || instantLargeBell || ms.visualP1Frames >= 2;
      if (triggerP1) {
        ms.phase = 'seek_p1';
        ms.phaseStartedAt = now;
        ms.phaseTimeoutAt = now + 18000;
        ms.phaseHardTimeoutAt = now + 24000;
        ms.holdAnchorCoord = null;
        ms.holdEnteredAt = 0;
        ms.holdOutsideFrames = 0;
        ms.consecutiveNoBellFrames = 0;
        ms.consecutiveSafeEndFrames = 0;
        ms.visualP1Frames = 0;
        ms.detourUntil = 0;
        ms.postDetourUntil = 0;
        ms.stuckStreak = 0;
        ms.lastStuckCoord = null;
        ms.lastStuckMsAccum = 0;
        ms.nearBellEnteredAt = 0;
        state.bankCooldownUntil = now + 18000;
        if (state.navTarget?.type === 'chest') state.navTarget = null;
        addLog('[月夜貓避難] 🔔 偵測到一階段「躲到鐘下！」，立即全速前往金鐘底座避難');
      }
    } else if (ms.phase === 'seek_p1') {
      if (bellScan.isStandingInBell) {
        ms.phase = 'hold_p1';
        ms.holdAnchorCoord = curCoord ? { x: curCoord.x, y: curCoord.y } : (ms.bellCoord ? { ...ms.bellCoord } : null);
        if (ms.holdAnchorCoord) ms.bellCoord = { ...ms.holdAnchorCoord };
        ms.holdEnteredAt = now;
        ms.holdOutsideFrames = 0;
        ms.consecutiveNoBellFrames = 0;
        ms.consecutiveSafeEndFrames = 0;
        ms.holdRecenterStuckMs = 0;
        ms.nearBellEnteredAt = 0;
        releaseHeldKeysOnly();
        addLog('[月夜貓避難] 🛡️ 已深入金鐘中心安全區並鎖定鐘心座標，原地定點站樁待機（待紅圈完全消失才離鐘）');
      } else if (now >= ms.phaseTimeoutAt) {
        ms.phase = 'idle';
        ms.p1EndedAt = now;
        addLog('[月夜貓避難] ⚠️ 一階段避難超時（18秒），自動恢復一般打王走位');
      }
    } else if (ms.phase === 'hold_p1') {
      const redStillVisible = (bellScan.redBg || 0) >= 0.05 || (bellScan.nearBellRed || 0) >= 0.05 || (bellScan.found && bellScan.blobSize >= 32 && bellScan.isInsideBellOuter);
      if (now >= ms.phaseTimeoutAt && (!redStillVisible || now >= (ms.phaseHardTimeoutAt || ms.phaseTimeoutAt))) {
        ms.phase = 'reposition';
        ms.p1EndedAt = now;
        ms.holdAnchorCoord = null;
        ms.repositionUntil = now + 750;
        ms.repositionAngle = Math.random() * Math.PI * 2;
        addLog('[月夜貓避難] 💥 一階收圈保底結束！紅圈已完全散去，安全向外拉開距離');
      }
    } else if (ms.phase === 'fight_berserk') {
      const triggerP2Open =
        hasBellOpenAnnounce ||
        (!bossInfo.hasBerserk && now - ms.phaseStartedAt >= 3000 && bellScan.found && bellScan.blobSize >= 55 && (bellScan.blobW || 0) >= 8);
      if (triggerP2Open) {
        ms.phase = 'seek_p2';
        ms.phaseStartedAt = now;
        ms.phaseTimeoutAt = now + 28000;
        ms.phaseHardTimeoutAt = now + 35000;
        ms.holdAnchorCoord = null;
        ms.holdEnteredAt = 0;
        ms.holdOutsideFrames = 0;
        ms.consecutiveNoBellFrames = 0;
        ms.consecutiveSafeEndFrames = 0;
        ms.detourUntil = 0;
        ms.postDetourUntil = 0;
        ms.stuckStreak = 0;
        ms.lastStuckCoord = null;
        ms.lastStuckMsAccum = 0;
        ms.nearBellEnteredAt = 0;
        state.bankCooldownUntil = now + 28000;
        addLog('[月夜貓避難] ✨ 狂暴月夜貓已擊殺！「鐘開啟了！」，立即全速衝回金鐘下避難');
      } else if (now >= ms.phaseTimeoutAt) {
        ms.phase = 'idle';
        addLog('[月夜貓避難] ⚠️ 狂暴月夜貓擊殺超時，自動恢復一般走位');
      }
    } else if (ms.phase === 'seek_p2') {
      if (bellScan.isStandingInBell) {
        ms.phase = 'hold_p2';
        ms.holdAnchorCoord = curCoord ? { x: curCoord.x, y: curCoord.y } : (ms.bellCoord ? { ...ms.bellCoord } : null);
        if (ms.holdAnchorCoord) ms.bellCoord = { ...ms.holdAnchorCoord };
        ms.holdEnteredAt = now;
        ms.holdOutsideFrames = 0;
        ms.consecutiveNoBellFrames = 0;
        ms.consecutiveSafeEndFrames = 0;
        ms.holdRecenterStuckMs = 0;
        ms.nearBellEnteredAt = 0;
        releaseHeldKeysOnly();
        addLog('[月夜貓避難] 🛡️ 已深入二階金鐘中心安全區並鎖定鐘心座標，原地站樁等待大收圈完全消失');
      } else if (now >= ms.phaseTimeoutAt) {
        ms.phase = 'idle';
        ms.p1EndedAt = now;
        addLog('[月夜貓避難] ⚠️ 二階段避難超時（28秒），自動恢復一般打王走位');
      }
    } else if (ms.phase === 'hold_p2') {
      const redStillVisible = (bellScan.redBg || 0) >= 0.05 || (bellScan.nearBellRed || 0) >= 0.05 || (bellScan.found && bellScan.blobSize >= 32 && bellScan.isInsideBellOuter);
      if (now >= ms.phaseTimeoutAt && (!redStillVisible || now >= (ms.phaseHardTimeoutAt || ms.phaseTimeoutAt))) {
        ms.phase = 'reposition';
        ms.p1EndedAt = now;
        ms.holdAnchorCoord = null;
        ms.repositionUntil = now + 750;
        ms.repositionAngle = Math.random() * Math.PI * 2;
        addLog('[月夜貓避難] 💥 二階大收圈保底結束！紅圈已完全散去，迅速拉開距離收尾擊殺月夜貓');
      }
    } else if (ms.phase === 'reposition') {
      if (now >= (ms.repositionUntil || 0)) {
        ms.phase = 'idle';
        ms.p1EndedAt = now;
        ms.holdAnchorCoord = null;
        releaseHeldKeysOnly();
        addLog('[月夜貓避難] ✅ 月夜貓特殊避難結束，恢復正常打王走位');
      }
    }
  }

  function stepMoonlightBellMove(now, curCoord) {
    const ms = state.moonlightState;
    if (!ms || !ms.active || ms.phase === 'idle') return false;
    if (curCoord) recordWalkedTile(curCoord);

    const cfg = CONFIG.autoMoveConfig;
    const scheme = KEY_MAPS[cfg.keyScheme] || KEY_MAPS.wasd;
    const bellScan = scanMoonlightBellZone(true);

    // 站樁避難狀態 (hold_p1 / hold_p2)：以鎖定鐘心座標 (holdAnchorCoord) ＋ 鐘周圍近區紅環 (nearBellRed) 為最高鐵律！
    // 嚴禁在紅圈縮緊染紅金鐘時誤判跑出鐘外，亦嚴禁於縮圈最後幾秒提前離鐘
    if (ms.phase === 'hold_p1' || ms.phase === 'hold_p2') {
      const isP1 = ms.phase === 'hold_p1';
      const phaseElapsed = now - (ms.phaseStartedAt || now);
      // 一階至少守護 10 秒、二階大收圈至少守護 19 秒後，才允許以視覺雙重確認提前離鐘
      const minHoldElapsed = isP1 ? 10000 : 19000;
      const redRingStillActive = (bellScan.redBg || 0) >= 0.05 || (bellScan.nearBellRed || 0) >= 0.05;
      const bellGone = !bellScan.found || bellScan.blobSize < 22;

      if (bellGone) {
        ms.consecutiveNoBellFrames = (ms.consecutiveNoBellFrames || 0) + 1;
      } else {
        ms.consecutiveNoBellFrames = 0;
      }
      // 必須同時滿足：1) 已過最短收圈秒數  2) 全畫面紅區 < 5% 且 鐘周近區紅環 < 5%  3) 金鐘消失，且連續 8 幀 (~1.0 秒) 確認才離鐘
      if (phaseElapsed >= minHoldElapsed && !redRingStillActive && bellGone) {
        ms.consecutiveSafeEndFrames = (ms.consecutiveSafeEndFrames || 0) + 1;
      } else {
        ms.consecutiveSafeEndFrames = 0;
      }

      if (ms.consecutiveSafeEndFrames >= 8) {
        releaseHeldKeysOnly();
        state.isBurstMoving = false;
        ms.p1EndedAt = now;
        ms.holdAnchorCoord = null;
        addLog(`[月夜貓避難] 💥 ${isP1 ? '一階' : '二階'}大紅圈收縮完畢！金鐘與周圍紅圈皆完全消失，安全拉開距離`);
        ms.phase = 'reposition';
        ms.repositionUntil = now + 750;
        ms.repositionAngle = ms.lastBellCanvasTarget
          ? Math.atan2(48 - ms.lastBellCanvasTarget.y, 80 - ms.lastBellCanvasTarget.x)
          : Math.random() * Math.PI * 2;
        updateMoveHud(false, curCoord);
        state.moveStepTimer = setTimeout(scheduleNextMoveStep, 120);
        return true;
      }

      const anchorDist = (curCoord && ms.holdAnchorCoord)
        ? Math.hypot(curCoord.x - ms.holdAnchorCoord.x, curCoord.y - ms.holdAnchorCoord.y)
        : null;
      const anchoredInsideBell = anchorDist !== null && anchorDist <= 2.4;

      // 若實際座標已確定在鎖定鐘心內 (≤2.4格)，嚴禁因紅圈染紅鐘體或場景他處暖黃色塊誤判而退回 seek 或觸發巨石繞行！
      if (anchoredInsideBell) {
        ms.holdOutsideFrames = 0;
        ms.detourUntil = 0;
        ms.postDetourUntil = 0;
        const recenterLimit = (bellScan.centerStopDist || 3.0) + 1.4;
        const maxTrustedShift = Math.max(7.0, (bellScan.bellRadius || 5.0) * 1.25);
        // 當紅圈已逼近金鐘周圍 (nearBellRed >= 8%) 時完全鎖死原地不動，避免因紅光染偏質心而誤踏出鐘外
        const safeToMicroRecenter = (bellScan.nearBellRed || 0) < 0.08;
        if (safeToMicroRecenter && bellScan.found && bellScan.standTarget && bellScan.distToStand > recenterLimit && bellScan.distToStand <= maxTrustedShift) {
          ms.lastBellCanvasTarget = bellScan.standTarget;
          const pullAngle = Math.atan2(bellScan.standTarget.y - 48, bellScan.standTarget.x - 80);
          const pullKeys = keysForMoveAngle(pullAngle, scheme);
          state.moveAngle = pullAngle;
          state.isBurstMoving = true;
          syncMoveKeys(pullKeys);
          updateMoveHud(false, curCoord);
          state.moveStepTimer = setTimeout(scheduleNextMoveStep, 80);
          return true;
        }
        ms.holdRecenterStuckMs = 0;
        releaseHeldKeysOnly();
        state.isBurstMoving = false;
        updateMoveHud(false, curCoord);
        state.moveStepTimer = setTimeout(scheduleNextMoveStep, 120);
        return true;
      }

      // 若角色真被擊退偏離鎖定鐘心 (>2.4格)，優先直線拉回鎖定鐘心座標（絕不向外大弧繞石）
      if (curCoord && ms.holdAnchorCoord && anchorDist !== null && anchorDist > 2.4 && anchorDist <= 7.0) {
        const backDx = (ms.holdAnchorCoord.x - curCoord.x) * 3.75;
        const backDy = (curCoord.y - ms.holdAnchorCoord.y) * 3.75;
        const backAngle = Math.atan2(backDy, backDx);
        const backKeys = keysForMoveAngle(backAngle, scheme);
        state.moveAngle = backAngle;
        state.isBurstMoving = true;
        syncMoveKeys(backKeys);
        updateMoveHud(false, curCoord);
        state.moveStepTimer = setTimeout(scheduleNextMoveStep, 85);
        return true;
      }

      // 唯有「真實座標已明確遠離鎖定鐘心 > 3.5 格」且連續 6 幀 (~720ms) 確認不在鐘內，才允許退回 seek 尋鐘（座標暫缺時一律穩站鐘內不動）
      const farOutsideLimit = Math.max(11.0, (bellScan.bellRadius || 5.0) * 1.85);
      const trulyOutsideFrame = Boolean(
        anchorDist !== null &&
        anchorDist > 3.5 &&
        bellScan.found &&
        bellScan.standTarget &&
        bellScan.distToStand > farOutsideLimit &&
        !bellScan.isInsideBellOuter
      );
      ms.holdOutsideFrames = trulyOutsideFrame ? (ms.holdOutsideFrames || 0) + 1 : 0;
      if (ms.holdOutsideFrames >= 6) {
        ms.phase = isP1 ? 'seek_p1' : 'seek_p2';
        ms.lastStuckCoord = curCoord ? { x: curCoord.x, y: curCoord.y } : null;
        ms.lastStuckMsAccum = 0;
        ms.holdRecenterStuckMs = 0;
        ms.holdOutsideFrames = 0;
        addLog('[月夜貓避難] 🔄 座標確認被擊退至金鐘外圍，切換回尋鐘模式返回鐘心');
        state.moveStepTimer = setTimeout(scheduleNextMoveStep, 60);
        return true;
      }

      // 預設：原地穩站鐘內不動
      ms.holdRecenterStuckMs = 0;
      releaseHeldKeysOnly();
      state.isBurstMoving = false;
      updateMoveHud(false, curCoord);
      state.moveStepTimer = setTimeout(scheduleNextMoveStep, 120);
      return true;
    }

    // 尋找金鐘奔跑狀態 (seek_p1 / seek_p2)
    if (ms.phase === 'seek_p1' || ms.phase === 'seek_p2') {
      const innerSafeBand = bellScan.isInsideBellOuter && bellScan.distToStand <= (bellScan.bellRadius || 5.0) * 0.78;
      if (innerSafeBand) {
        if (!ms.nearBellEnteredAt) ms.nearBellEnteredAt = now;
      } else {
        ms.nearBellEnteredAt = 0;
      }
      const deepEnoughFallback = innerSafeBand && ms.nearBellEnteredAt && now - ms.nearBellEnteredAt >= 1200;

      if (bellScan.isStandingInBell || deepEnoughFallback) {
        ms.phase = ms.phase === 'seek_p1' ? 'hold_p1' : 'hold_p2';
        ms.holdAnchorCoord = curCoord ? { x: curCoord.x, y: curCoord.y } : (ms.bellCoord ? { ...ms.bellCoord } : null);
        if (ms.holdAnchorCoord) ms.bellCoord = { ...ms.holdAnchorCoord };
        ms.holdEnteredAt = now;
        ms.holdOutsideFrames = 0;
        ms.consecutiveNoBellFrames = 0;
        ms.consecutiveSafeEndFrames = 0;
        ms.nearBellEnteredAt = 0;
        ms.holdRecenterStuckMs = 0;
        ms.detourUntil = 0;
        ms.postDetourUntil = 0;
        ms.stuckStreak = 0;
        releaseHeldKeysOnly();
        addLog('[月夜貓避難] 🛡️ 已深入金鐘中心安全區並鎖定鐘心座標，原地定點站樁待機（待紅圈完全消失才離鐘）');
        updateMoveHud(false, curCoord);
        state.moveStepTimer = setTimeout(scheduleNextMoveStep, 120);
        return true;
      }

      let targetAngle = 0;
      if (bellScan.standTarget) {
        ms.lastBellCanvasTarget = bellScan.standTarget;
        if (curCoord) {
          ms.bellCoord = {
            x: curCoord.x + Math.round((bellScan.standTarget.x - 80) / 3.75),
            y: curCoord.y - Math.round((bellScan.standTarget.y - 48) / 3.75),
          };
        }
        targetAngle = Math.atan2(bellScan.standTarget.y - 48, bellScan.standTarget.x - 80);
      } else if (ms.bellCoord && curCoord) {
        const dx = (ms.bellCoord.x - curCoord.x) * 3.75;
        const dy = (curCoord.y - ms.bellCoord.y) * 3.75;
        targetAngle = Math.atan2(dy, dx);
      } else if (ms.lastBossCoord && curCoord) {
        const dx = (ms.lastBossCoord.x - curCoord.x) * 3.75;
        const dy = (curCoord.y - ms.lastBossCoord.y) * 3.75;
        targetAngle = Math.atan2(dy, dx);
      } else {
        targetAngle = 0;
      }

      const stageKeyForBell = getObstacleStageKey(curCoord);
      const nearLockedAnchor = Boolean(
        curCoord && ms.holdAnchorCoord && Math.hypot(curCoord.x - ms.holdAnchorCoord.x, curCoord.y - ms.holdAnchorCoord.y) <= 3.5
      );

      // 已進入金鐘範圍內（或緊鄰已知鐘心）進行微調對心時，嚴格停用岩石繞行，避免把角色繞出金鐘外
      if (bellScan.isInsideBellOuter || nearLockedAnchor) {
        ms.detourUntil = 0;
        ms.postDetourUntil = 0;
        ms.lastStuckMsAccum = 0;
      } else if (curCoord) {
        // 洞穴巨大岩石卡點偵測：視覺挑選開闊側＋障礙記憶學習＋固定同側升級長距繞行
        if (!ms.lastStuckCoord) {
          ms.lastStuckCoord = { x: curCoord.x, y: curCoord.y };
          ms.lastStuckMsAccum = 0;
        } else {
          const dMoved = Math.hypot(curCoord.x - ms.lastStuckCoord.x, curCoord.y - ms.lastStuckCoord.y);
          if (dMoved >= 0.7) {
            ms.lastStuckCoord = { x: curCoord.x, y: curCoord.y };
            ms.lastStuckMsAccum = 0;
            // 僅在繞行完全結束且持續順利前進 ≥ 2.5 格後才清空連續卡石階數
            if (now >= (ms.postDetourUntil || 0) && ms.stuckStreak > 0) {
              ms.freeMoveTiles = (ms.freeMoveTiles || 0) + dMoved;
              if (ms.freeMoveTiles >= 2.5) {
                ms.stuckStreak = 0;
                ms.freeMoveTiles = 0;
              }
            }
          } else {
            ms.lastStuckMsAccum = (ms.lastStuckMsAccum || 0) + 155;
            if (ms.lastStuckMsAccum >= 310 && now >= (ms.detourUntil || 0)) {
              // 將此巨石卡點寫入副本障礙記憶網格，下次尋鐘直接提前 A* 繞開
              recordObstacleHitFromStuck(curCoord, typeof state.moveAngle === 'number' ? state.moveAngle : targetAngle, 'moonlight_bell');
              ms.stuckStreak = (ms.stuckStreak || 0) + 1;
              ms.freeMoveTiles = 0;
              if (ms.stuckStreak === 1 || !ms.detourSide) {
                const memFlank = pickOpenFlankByObstacleMap(stageKeyForBell, curCoord, targetAngle);
                ms.detourSide = memFlank || bellScan.preferredDetourSide || 1;
              } else if (ms.stuckStreak >= 3) {
                // 同側連繞 2 次仍遇牆，改往另一側大弧繞開
                ms.detourSide = -(ms.detourSide || 1);
                ms.stuckStreak = 1;
              }
              const side = ms.detourSide || 1;
              const isEscalated = ms.stuckStreak >= 2;
              const detourRad = isEscalated ? 2.16 : 1.78; // 124°（微退大繞） vs 102°（側繞巨石）
              const detourMs = isEscalated ? 1300 : 950;
              ms.detourAngle = targetAngle + side * detourRad;
              ms.detourUntil = now + detourMs;
              ms.postDetourAngle = targetAngle + side * 0.56; // 結束繞行後再帶 32° 切過石角 420ms
              ms.postDetourUntil = now + detourMs + 420;
              ms.lastStuckMsAccum = 0;
              const sideTxt = side > 0 ? '順時針開闊側' : '逆時針開闊側';
              addLog(`[月夜貓避難] 🪨 前往金鐘受巨石阻擋，朝${sideTxt}大弧繞行 ${(detourMs / 1000).toFixed(1)} 秒脫困`);
            }
          }
        }
      }

      let finalAngle = targetAngle;
      if (now < (ms.detourUntil || 0) && ms.detourAngle !== null) {
        finalAngle = ms.detourAngle;
      } else if (now < (ms.postDetourUntil || 0) && ms.postDetourAngle !== null) {
        finalAngle = ms.postDetourAngle;
      } else if (!bellScan.isInsideBellOuter && curCoord && ms.bellCoord) {
        // 還沒撞石前先查詢副本障礙記憶：若直線穿過已學過的巨石，立刻用微型 A* 提前繞行
        const smartBell = resolveObstacleSmartAngle(stageKeyForBell, curCoord, targetAngle, {
          tx: ms.bellCoord.x,
          ty: ms.bellCoord.y,
          label: '金鐘避難點',
          isEmergency: true,
          lookaheadTiles: 4,
        });
        if (smartBell.steered) {
          finalAngle = smartBell.angle;
        }
      }
      const keys = keysForMoveAngle(finalAngle, scheme);
      state.moveAngle = finalAngle;
      state.isBurstMoving = true;
      syncMoveKeys(keys);
      updateMoveHud(false, curCoord);
      // 接近金鐘時縮短步頻為 85ms 精細對心，避免大步衝過頭停在對側邊緣
      const nearBell = bellScan.found && bellScan.distToStand <= (bellScan.bellRadius || 5.0) + 3.5 && now >= (ms.detourUntil || 0);
      state.moveStepTimer = setTimeout(scheduleNextMoveStep, nearBell ? 85 : 150);
      return true;
    }

    // 二階段打狂暴月夜貓：小半徑近身輸出（約 6~8 格），不跑遠，同時掃描封印鐘座標
    if (ms.phase === 'fight_berserk') {
      if (bellScan.standTarget && curCoord) {
        ms.bellCoord = {
          x: curCoord.x + Math.round((bellScan.standTarget.x - 80) / 3.75),
          y: curCoord.y - Math.round((bellScan.standTarget.y - 48) / 3.75),
        };
      }
      const bossCtx = getActiveBossContext(now, false);
      let angle = 0;
      if (bossCtx.nearestBoss && typeof bossCtx.bossAngle === 'number') {
        const dTiles = bossCtx.nearestDistTiles ?? 12;
        if (dTiles < 5.5) {
          angle = bossCtx.bossAngle + Math.PI; // 太近稍微拉開
        } else if (dTiles > 9.0) {
          angle = bossCtx.bossAngle; // 太遠靠近狂暴貓輸出
        } else {
          angle = bossCtx.bossAngle + Math.PI * 0.5; // 切線繞行
        }
      } else {
        angle = Math.random() * Math.PI * 2;
      }
      const keys = keysForMoveAngle(angle, scheme);
      state.moveAngle = angle;
      state.isBurstMoving = true;
      syncMoveKeys(keys);
      updateMoveHud(false, curCoord);
      state.moveStepTimer = setTimeout(scheduleNextMoveStep, 200);
      return true;
    }

    // 收圈結束拉開身位 (reposition)
    if (ms.phase === 'reposition') {
      if (now < (ms.repositionUntil || 0)) {
        const keys = keysForMoveAngle(ms.repositionAngle, scheme);
        state.moveAngle = ms.repositionAngle;
        state.isBurstMoving = true;
        syncMoveKeys(keys);
        updateMoveHud(false, curCoord);
        state.moveStepTimer = setTimeout(scheduleNextMoveStep, 150);
        return true;
      }
      ms.phase = 'idle';
      releaseHeldKeysOnly();
      addLog('[月夜貓避難] ✅ 月夜貓特殊避難結束，恢復正常打王走位');
      updateMoveHud(false, curCoord);
      state.moveStepTimer = setTimeout(scheduleNextMoveStep, 120);
      return true;
    }

    return false;
  }

  function angleToCompassLabel(angle) {
    const labels = ['東', '東南', '南', '西南', '西', '西北', '北', '東北'];
    let deg = ((angle * 180) / Math.PI) % 360;
    if (deg < 0) deg += 360;
    return labels[Math.round(deg / 45) % 8] || '前方';
  }

  function pickBestSwarmBreakoutAngle(curCoord) {
    const activeStageKey = getObstacleStageKey(curCoord);
    const obsEnabled = CONFIG.autoMoveConfig.obstacleMemoryEnabled !== false;
    const obsBucket = obsEnabled && activeStageKey ? getStageObstacleBucket(activeStageKey, false) : null;
    const bossCtx = getActiveBossContext(Date.now(), false);
    const curMoveAngle = typeof state.moveAngle === 'number' ? state.moveAngle : 0;

    let toCenterAngle = null;
    let distFromCenter = 0;
    if (curCoord && state.mapCenterCoord) {
      const cdx = state.mapCenterCoord.x - curCoord.x;
      const cdy = curCoord.y - state.mapCenterCoord.y;
      distFromCenter = Math.hypot(cdx, cdy);
      if (distFromCenter > 2) {
        toCenterAngle = Math.atan2(cdy, cdx);
      }
    }

    let bestAngle = curMoveAngle;
    let bestScore = -1e9;
    const candidates = 16;
    for (let i = 0; i < candidates; i++) {
      const ang = (i * Math.PI * 2) / candidates;
      let score = 0;

      // 1. 障礙記憶開闊走廊評分（往該方向連續探測 6/12/18/24 格，避開巨石與死角牆面）
      if (curCoord && obsBucket) {
        const ux = Math.cos(ang);
        const uy = Math.sin(ang);
        const farTx = Math.round(curCoord.x + ux * 22);
        const farTy = Math.round(curCoord.y - uy * 22);
        const los = hasClearTileLine(activeStageKey, obsBucket, Math.round(curCoord.x), Math.round(curCoord.y), farTx, farTy, false);
        if (los.clear) {
          score += 55;
        } else {
          score -= 45;
        }
        const probes = [5, 10, 16, 22];
        for (const d of probes) {
          const px = Math.round(curCoord.x + ux * d);
          const py = Math.round(curCoord.y - uy * d);
          const lvl = getTileObstacleLevel(obsBucket, px, py);
          if (lvl >= 2) score -= 35;
          else if (lvl >= 1) score -= 18;
          else if (isAdjacentToConfirmedObstacle(obsBucket, px, py)) score -= 6;
        }
      }

      // 2. 地圖空間縱深：若已偏離中心超過 20 格，避免一路撞向地圖最外牆，改挑切線或偏內長走廊
      if (toCenterAngle !== null && distFromCenter >= 20) {
        const diffToCenter = angleDiffAbs(ang, toCenterAngle);
        if (diffToCenter > Math.PI * 0.72) {
          score -= 36; // 朝最外牆衝容易撞牆卡死
        } else if (diffToCenter >= Math.PI * 0.25 && diffToCenter <= Math.PI * 0.68) {
          score += 22; // 切線／長弦方向空間最開闊，最利於一口氣衝破包圍圈
        } else {
          score += 10;
        }
      }

      // 3. 避開近距離小王／首領王方向，不要迎頭撞進王懷裡
      if (bossCtx?.active && typeof bossCtx.bossAngle === 'number' && bossCtx.nearestDistTiles !== null && bossCtx.nearestDistTiles < 24) {
        const diffBoss = angleDiffAbs(ang, bossCtx.bossAngle);
        if (diffBoss < 0.75) {
          score -= 38;
        } else if (diffBoss > 1.4) {
          score += 10;
        }
      }

      // 4. 順向慣性加分：盡量順著當前移動方向直接衝刺，減少折返停頓時間
      const diffMove = angleDiffAbs(ang, curMoveAngle);
      if (diffMove < 0.7) score += 12;
      else if (diffMove > 2.4) score -= 8;

      if (score > bestScore) {
        bestScore = score;
        bestAngle = ang;
      }
    }
    return bestAngle;
  }

  function updateSwarmBreakoutState(now, curCoord) {
    const sb = state.swarmBreakout;
    if (!sb) return;
    const cfg = CONFIG.autoMoveConfig;
    if (cfg.swarmBreakoutEnabled === false || cfg.mode !== 'radius_wander' || !isInCombat() || isInVillageLobby()) {
      if (sb.active) {
        sb.active = false;
        if (state.navTarget?.type === 'swarm_breakout') state.navTarget = null;
      }
      return;
    }

    // 若月夜貓金鐘避難接管中，優先躲鐘，暫不覆寫避難狀態
    if (state.moonlightState?.active && state.moonlightState.phase !== 'idle') {
      if (sb.active) {
        sb.active = false;
        if (state.navTarget?.type === 'swarm_breakout') state.navTarget = null;
      }
      return;
    }

    // 1. 檢查突圍是否已屆滿 16 秒 → 平滑轉入 8 秒外圍風箏緩衝，避免立刻掉頭衝回身後怪群
    if (sb.active && now >= (sb.until || 0)) {
      const movedTotal =
        curCoord && sb.startCoord
          ? Math.round(Math.hypot(curCoord.x - sb.startCoord.x, curCoord.y - sb.startCoord.y))
          : null;
      sb.active = false;
      state.swarmPostGraceUntil = now + 8000;
      state.moveWaypoint = null;
      if (state.navTarget?.type === 'swarm_breakout' || state.navTarget?.type === 'center') {
        state.navTarget = null;
      }
      addLog(`[包圍突圍] ✅ 直線突圍完成${movedTotal !== null ? `（位移約 ${movedTotal} 格）` : ''}，進入 8 秒外圍切線緩衝後恢復巡邏`);
      updateMoveHud(false, curCoord);
      return;
    }

    // 2. 掃描遊戲系統提示文字（全關卡通用：偵測「包圍／一大群／湧來／圍攻／怪潮／四面八方」等系統橫幅）
    const announceTxt = readGameAnnounceText();
    let triggerReason = '';
    if (announceTxt) {
      const isMoonlightMsg = /月夜貓|躲到鐘下|鐘開啟了|鐘被封印|狂暴月夜貓/.test(announceTxt);
      const isSwarmMsg =
        !isMoonlightMsg &&
        (/包圍|一大群|大群|大量怪物|大批怪物|成群|怪潮|怪物潮|潮水|湧來|蜂擁|圍上來|圍攻|逼近|襲來|四面八方|重重包圍|收縮|浪潮|軍團|來襲/i.test(announceTxt) ||
          /surround|encircl|swarm|horde|closing\s*in|incoming\s*wave|ambush|from\s*all\s*sides|ring\s*of/i.test(announceTxt));
      if (isSwarmMsg) {
        triggerReason = `系統提示「${announceTxt.slice(0, 36)}」`;
      } else if (announceTxt !== state.swarmLastAnnounceRaw && announceTxt.length >= 4 && !isMoonlightMsg) {
        // 首次看到未歸類的系統公告時留下一筆輕量紀錄，方便未來精準擴充詞庫
        state.swarmLastAnnounceRaw = announceTxt;
        addLog(`[系統提示] 偵測到遊戲橫幅：「${announceTxt.slice(0, 48)}」`);
      }
    }

    // 3. 燈籠節 06:00 固定包圍怪潮保底觸發（防止橫幅瞬間閃過或開卡遮擋而漏抓）
    if (!triggerReason && !sb.active) {
      const secNow = readGameClockSec();
      const stageNameNow = String(state.mapCenterCoord?.stageName || resolveCurrentStageInfo()?.name || '');
      if (
        /洛陽|燈籠/.test(stageNameNow) &&
        state.clockDir !== 'down' &&
        typeof secNow === 'number' &&
        secNow >= 358 &&
        secNow <= 368 &&
        !state.swarmScheduledFired?.louyang_360
      ) {
        if (!state.swarmScheduledFired) state.swarmScheduledFired = {};
        state.swarmScheduledFired.louyang_360 = true;
        triggerReason = '燈籠節 06:00 固定包圍怪潮波次';
      }
    }

    if (triggerReason) {
      // 防止同一則橫幅連續 18 秒內重複重置方向
      if (!sb.active && now - (state.swarmLastTriggerAt || 0) >= 18000) {
        const heading = pickBestSwarmBreakoutAngle(curCoord);
        const dirLbl = angleToCompassLabel(heading);
        sb.active = true;
        sb.startedAt = now;
        sb.until = now + 16000;
        sb.headingAngle = heading;
        sb.dirLabel = dirLbl;
        sb.triggerText = triggerReason;
        sb.startCoord = curCoord ? { x: curCoord.x, y: curCoord.y } : null;
        sb.lastCheckCoord = curCoord ? { x: curCoord.x, y: curCoord.y } : null;
        sb.lastCheckAt = now;
        sb.stuckDeflects = 0;
        sb.escapedRing = false;
        sb.curveSign = Math.random() < 0.5 ? 1 : -1;
        state.swarmLastTriggerAt = now;
        state.detourUntil = 0;
        state.moveWaypoint = null;
        state.bossRedDodgeState = null;
        state.navTarget = { type: 'swarm_breakout', dirLabel: dirLbl };
        addLog(`[包圍突圍] 💨 偵測${triggerReason}！解除中心半徑束縛，鎖定往【${dirLbl}】單一方向直線突圍 16 秒`);
        updateMoveHud(false, curCoord);
      } else if (sb.active && now - (sb.startedAt || 0) > 10000 && now - (state.swarmLastTriggerAt || 0) >= 10000) {
        // 若突圍後段又連續出現新一波包圍提示，順延突圍時間 8 秒維持衝出
        sb.until = Math.max(sb.until, now + 8000);
        state.swarmLastTriggerAt = now;
      }
    }
  }

  function stepSwarmBreakoutMove(now, curCoord) {
    const sb = state.swarmBreakout;
    if (!sb?.active || now >= (sb.until || 0)) return false;

    const cfg = CONFIG.autoMoveConfig;
    const scheme = KEY_MAPS[cfg.keyScheme] || KEY_MAPS.wasd;
    const activeStageKey = getObstacleStageKey(curCoord);

    // 1. 檢查是否已經直線衝出包圍圈（位移 >= 22 格），衝出後改為微幅外圈弧線風箏避免撞死角或折返
    if (!sb.escapedRing && curCoord && sb.startCoord) {
      const movedFromStart = Math.hypot(curCoord.x - sb.startCoord.x, curCoord.y - sb.startCoord.y);
      if (movedFromStart >= 22) {
        sb.escapedRing = true;
        sb.headingAngle = sb.headingAngle + sb.curveSign * 0.38;
        sb.dirLabel = angleToCompassLabel(sb.headingAngle);
        addLog(`[包圍突圍] 🏃 已直線突破約 ${Math.round(movedFromStart)} 格衝出包圍圈，微轉往【${sb.dirLabel}】外圍拉開怪群`);
      }
    }

    // 2. 障礙前瞻與卡牆側滑（撞牆／巨石時只做 ±55° 切線滑出，絕對不 180° 掉頭鑽回包圍圈！）
    if (curCoord) {
      recordWalkedTile(curCoord);
      if (state.mapCenterCoord) {
        state.posX = (curCoord.x - state.mapCenterCoord.x) * 16;
        state.posY = (state.mapCenterCoord.y - curCoord.y) * 16;
        state.lastCoord = { x: curCoord.x, y: curCoord.y };
      }
      if (!sb.lastCheckCoord) {
        sb.lastCheckCoord = { x: curCoord.x, y: curCoord.y };
        sb.lastCheckAt = now;
      } else if (now - (sb.lastCheckAt || 0) >= 850) {
        const stepMoved = Math.hypot(curCoord.x - sb.lastCheckCoord.x, curCoord.y - sb.lastCheckCoord.y);
        sb.lastCheckCoord = { x: curCoord.x, y: curCoord.y };
        sb.lastCheckAt = now;
        if (stepMoved < 1 && now - (state.lastBridgeFocusSkipAt || 0) >= 2000) {
          recordObstacleHitFromStuck(curCoord, sb.headingAngle, 'swarm_breakout_stuck');
          sb.stuckDeflects = (sb.stuckDeflects || 0) + 1;
          const memFlank = pickOpenFlankByObstacleMap(activeStageKey, curCoord, sb.headingAngle);
          const deflectSign = memFlank || (sb.stuckDeflects % 2 === 1 ? sb.curveSign : -sb.curveSign);
          sb.headingAngle = sb.headingAngle + deflectSign * (sb.stuckDeflects >= 2 ? 1.05 : 0.85);
          sb.dirLabel = angleToCompassLabel(sb.headingAngle);
          addLog(`[包圍突圍] ↪️ 前方遇阻，順勢切線轉向【${sb.dirLabel}】持續衝出（絕不折返包圍圈）`);
        } else if (stepMoved >= 2) {
          sb.stuckDeflects = 0;
        }
      }
    }

    // 前瞻 3 格避開已知石頭邊緣（保持大致直線方向，只做輕度順滑避讓）
    let steerAngle = sb.headingAngle;
    if (curCoord) {
      const smartBreak = resolveObstacleSmartAngle(activeStageKey, curCoord, sb.headingAngle, { lookaheadTiles: 3 });
      if (smartBreak.steered && angleDiffAbs(smartBreak.angle, sb.headingAngle) <= 1.25) {
        steerAngle = smartBreak.angle;
      }
    }

    // 防長按卡鍵保護（按住超過 4.1 秒短暫換氣 65~95ms 再續衝）
    const maxHoldExceeded = Array.from(state.heldKeys).some(
      (code) => state.heldKeySince?.[code] && now - state.heldKeySince[code] >= 4100
    );
    if (maxHoldExceeded) {
      releaseHeldKeysOnly();
      state.moveStepTimer = setTimeout(scheduleNextMoveStep, randomInRangeMs(65, 95));
      return true;
    }

    const keys = keysForMoveAngle(steerAngle, scheme);
    state.moveAngle = steerAngle;
    state.navTarget = { type: 'swarm_breakout', dirLabel: sb.dirLabel };
    state.isBurstMoving = true;
    syncMoveKeys(keys);
    updateMoveHud(false, curCoord);
    state.moveStepTimer = setTimeout(scheduleNextMoveStep, 220);
    return true;
  }

  function hasVisibleBossHpBar() {
    try {
      const candidates = document.querySelectorAll(
        '#boss-bar, #boss-hp, #boss-hud, .boss-bar, .boss-hp, .boss-hud, [id*="boss-hp" i], [id*="boss-bar" i], [class*="boss-hp" i], [class*="boss-bar" i]'
      );
      for (const el of candidates) {
        if (!el || isOwnHudNode(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width >= 80 && r.height >= 6 && r.top >= 0 && r.top <= window.innerHeight * 0.28) {
          const st = window.getComputedStyle(el);
          if (st.display !== 'none' && st.visibility !== 'hidden' && parseFloat(st.opacity) > 0.05) {
            return true;
          }
        }
      }
    } catch (_) {}
    return false;
  }

  function getActiveBossContext(now = Date.now(), forceMinimapScan = false) {
    const scanForBoss =
      !forceMinimapScan && state.lastMinimapScanResult && now - (state.lastMinimapScanAt || 0) < 900
        ? state.lastMinimapScanResult
        : scanMinimapCanvasMarkers(null, forceMinimapScan);
    const bossList = Array.isArray(scanForBoss?.bosses) ? scanForBoss.bosses : [];
    let nearestBoss = null;
    let nearestDistTiles = null;
    let bossAngle = null;
    if (scanForBoss?.player && bossList.length > 0) {
      const px = scanForBoss.player.cx;
      const py = scanForBoss.player.cy;
      const tilesPerPx = estimateMinimapTilesPerPx(scanForBoss.canvasSize);
      let bestDist = 1e9;
      for (const b of bossList) {
        const bdx = b.cx - px;
        const bdy = b.cy - py;
        const dTiles = Math.hypot(bdx, bdy) * tilesPerPx;
        if (dTiles < bestDist) {
          bestDist = dTiles;
          nearestBoss = b;
          nearestDistTiles = dTiles;
          bossAngle = Math.atan2(bdy, bdx);
        }
      }
    }
    const barVisible = hasVisibleBossHpBar();
    if (nearestBoss || barVisible) {
      state.lastBossSeenAt = now;
    }
    const active = Boolean(nearestBoss || barVisible || (state.lastBossSeenAt > 0 && now - state.lastBossSeenAt < 4500));
    return { active, nearestBoss, nearestDistTiles, bossAngle, barVisible, scanForBoss };
  }

  function scanBossGroundRedZones(forceFresh = false) {
    const now = Date.now();
    if (!forceFresh && state.lastBossRedScan && now - (state.lastBossRedScanAt || 0) < 95) {
      return state.lastBossRedScan;
    }
    const worldCanvas =
      document.querySelector('#stage canvas.world3d') ||
      Array.from(document.querySelectorAll('canvas')).find((c) => {
        if (isOwnHudNode(c) || c.closest('#minimap')) return false;
        const r = c.getBoundingClientRect();
        return r.width >= 320 && r.height >= 200;
      });
    if (!worldCanvas || !worldCanvas.width || !worldCanvas.height) {
      return { ok: false, reason: 'no_canvas' };
    }
    const W = 160;
    const H = 90;
    if (!state.bossRedCanvas) {
      state.bossRedCanvas = document.createElement('canvas');
      state.bossRedCanvas.width = W;
      state.bossRedCanvas.height = H;
      state.bossRedCtx = state.bossRedCanvas.getContext('2d', { willReadFrequently: true });
    }
    const ctx = state.bossRedCtx;
    if (!ctx) return { ok: false, reason: 'no_ctx' };
    let data = null;
    try {
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(worldCanvas, 0, 0, W, H);
      data = ctx.getImageData(0, 0, W, H).data;
    } catch (_) {
      return { ok: false, reason: 'tainted' };
    }
    // 抽樣檢查 12 個畫面點，確認 WebGL 畫布並非全黑（若尚未透過 document-start 掛鉤或剛更新未重整）
    let nonBlank = false;
    for (let gy = 1; gy <= 3 && !nonBlank; gy++) {
      for (let gx = 1; gx <= 4; gx++) {
        const sx = Math.round((W * gx) / 5);
        const sy = Math.round((H * gy) / 4);
        const idx = (sy * W + sx) * 4;
        if (data[idx + 3] > 0 && (data[idx] > 4 || data[idx + 1] > 4 || data[idx + 2] > 4)) {
          nonBlank = true;
          break;
        }
      }
    }
    if (!nonBlank) {
      state.bossRedBlankCount = (state.bossRedBlankCount || 0) + 1;
      if (state.bossRedBlankCount >= 6 && !state.bossRedBlankWarned) {
        state.bossRedBlankWarned = true;
        addLog('[紅圈閃避] ⚠️ 偵測到 3D 畫布為黑屏，請按 F5 重新整理一次讓 WebGL 讀取掛鉤生效（目前自動維持小地圖控距風箏）');
      }
      const blankRes = { ok: false, reason: 'blank', at: now };
      state.lastBossRedScanAt = now;
      state.lastBossRedScan = blankRes;
      return blankRes;
    }
    state.bossRedBlankCount = 0;

    const pxRed = (x, y) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return false;
      const idx = (y * W + x) * 4;
      return isBossTelegraphRedPixel(data[idx], data[idx + 1], data[idx + 2]);
    };

    const cx = Math.round(W * 0.5);
    const cy = Math.round(H * 0.525);

    // 1. 角色腳下接地橢圓（扣除角色上半身立繪中心，專掃腳底地面紅區）
    let footHits = 0;
    let footTot = 0;
    for (let dy = -5; dy <= 5; dy++) {
      for (let dx = -7; dx <= 7; dx++) {
        if ((dx * dx) / 49 + (dy * dy) / 25 > 1) continue;
        if (Math.abs(dx) <= 2 && dy >= -5 && dy <= -1) continue;
        footTot++;
        if (pxRed(cx + dx, cy + dy)) footHits++;
      }
    }

    // 2. 腳旁近身環帶（偵測貼身紅條／紅圈，供安全區煞車與防踩紅用）
    let nearHits = 0;
    let nearTot = 0;
    for (let dy = -13; dy <= 13; dy += 2) {
      for (let dx = -18; dx <= 18; dx += 2) {
        const rIn = (dx * dx) / 64 + (dy * dy) / 36;
        const rOut = (dx * dx) / 324 + (dy * dy) / 169;
        if (rIn < 1 || rOut > 1) continue;
        nearTot++;
        if (pxRed(cx + dx, cy + dy)) nearHits++;
      }
    }

    // 3. 畫面中央戰場紅區覆蓋率（偵測全圖網格條、斜條、大範圍預警）
    let fieldHits = 0;
    let fieldTot = 0;
    const fyMin = Math.round(H * 0.16);
    const fyMax = Math.round(H * 0.82);
    const fxMin = Math.round(W * 0.14);
    const fxMax = Math.round(W * 0.86);
    for (let y = fyMin; y <= fyMax; y += 2) {
      for (let x = fxMin; x <= fxMax; x += 2) {
        fieldTot++;
        if (pxRed(x, y)) fieldHits++;
      }
    }

    // 4. 八方向走廊紅區密度評估（近點 0.25 + 落腳點 0.50 + 遠延伸 0.25）
    const samplePatch = (px, py) => {
      let hits = 0;
      let tot = 0;
      const rx = Math.round(px);
      const ry = Math.round(py);
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          tot++;
          if (pxRed(rx + dx, ry + dy)) hits++;
        }
      }
      return tot > 0 ? hits / tot : 0;
    };
    const dirScores = BOSS_RED_DIRS.map((d) => {
      const nearR = samplePatch(cx + d.ux * (W * 0.075), cy + d.uy * (H * 0.095));
      const midR = samplePatch(cx + d.ux * (W * 0.145), cy + d.uy * (H * 0.18));
      const farR = samplePatch(cx + d.ux * (W * 0.22), cy + d.uy * (H * 0.27));
      return {
        ...d,
        nearRed: nearR,
        midRed: midR,
        farRed: farR,
        score: nearR * 0.25 + midR * 0.5 + farR * 0.25,
      };
    });

    const result = {
      ok: true,
      at: now,
      footRed: footTot > 0 ? footHits / footTot : 0,
      nearRed: nearTot > 0 ? nearHits / nearTot : 0,
      fieldRed: fieldTot > 0 ? fieldHits / fieldTot : 0,
      dirScores,
    };
    state.lastBossRedScanAt = now;
    state.lastBossRedScan = result;
    return result;
  }

  function angleDiffAbs(a, b) {
    let d = Math.atan2(Math.sin(a - b), Math.cos(a - b));
    return Math.abs(d);
  }

  function pickBestRedEscapeDir(scan, bossCtx, curCoord) {
    if (!scan?.ok || !Array.isArray(scan.dirScores) || !scan.dirScores.length) return null;
    const prevAngle = state.bossRedDodgeState?.mode === 'evade' ? state.bossRedDodgeState.angle : null;
    const hasCloseBoss = bossCtx && typeof bossCtx.bossAngle === 'number' && bossCtx.nearestDistTiles !== null && bossCtx.nearestDistTiles < 16;
    let centerAngle = null;
    if (curCoord && state.mapCenterCoord) {
      const cDx = state.mapCenterCoord.x - curCoord.x;
      const cDy = curCoord.y - state.mapCenterCoord.y;
      if (Math.hypot(cDx, cDy) > 20) {
        centerAngle = Math.atan2(cDy, cDx);
      }
    }
    const obsEnabled = CONFIG.autoMoveConfig.obstacleMemoryEnabled !== false;
    const obsBucket = obsEnabled && curCoord ? getStageObstacleBucket(getObstacleStageKey(curCoord), false) : null;
    let best = null;
    let bestCost = 1e9;
    for (const d of scan.dirScores) {
      let cost = d.score;
      // 落腳點若明顯是紅區，加重懲罰
      if (d.midRed >= 0.14) cost += d.midRed * 0.35;
      // 長時間打王閃紅圈避障：前方 1~3 格有已確認固定障礙（巨石／牆角）時大幅加權避開，防止閃紅一頭撞石頭
      if (obsBucket && curCoord) {
        for (let step = 1; step <= 3; step++) {
          const tx = Math.round(curCoord.x + Math.cos(d.angle) * step);
          const ty = Math.round(curCoord.y - Math.sin(d.angle) * step);
          const lvl = getTileObstacleLevel(obsBucket, tx, ty);
          if (lvl === 2) {
            cost += step <= 2 ? 0.32 : 0.14;
            break;
          } else if (lvl === 1) {
            cost += step <= 2 ? 0.09 : 0.04;
          }
        }
      }
      // 避免迎面往貼身王的方向閃避
      if (hasCloseBoss) {
        const towardBoss = Math.cos(d.angle - bossCtx.bossAngle);
        if (towardBoss > 0.45) cost += 0.1 * towardBoss;
      }
      // 離地圖中心過遠時提高回中心側權重，避免長時間王戰越閃越退進地圖死角
      if (centerAngle !== null) {
        const towardCenter = Math.cos(d.angle - centerAngle);
        if (towardCenter > 0.3) cost -= 0.055 * towardCenter;
      }
      // 方向慣性微加權，避免在紅條邊緣左右抖動
      if (prevAngle !== null && angleDiffAbs(d.angle, prevAngle) < 0.45) {
        cost -= 0.04;
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = { ...d, cost };
      }
    }
    return best;
  }

  function filterMoveAngleForBossRed(desiredAngle, scan) {
    if (!scan?.ok || !Array.isArray(scan.dirScores) || !scan.dirScores.length) {
      return { angle: desiredAngle, steered: false, shouldHold: false };
    }
    // 找最貼近計畫方向的一條 8 方位走廊
    let plannedDir = scan.dirScores[0];
    let minDiff = 1e9;
    for (const d of scan.dirScores) {
      const diff = angleDiffAbs(desiredAngle, d.angle);
      if (diff < minDiff) {
        minDiff = diff;
        plannedDir = d;
      }
    }
    if (plannedDir.score < 0.14 && plannedDir.nearRed < 0.18 && plannedDir.midRed < 0.16) {
      return { angle: desiredAngle, steered: false, shouldHold: false };
    }
    // 計畫方向前方有紅區：優先從 ±95° 內挑選最貼近計畫方向的安全方向繞開
    const safeCandidates = scan.dirScores
      .filter((d) => d.score < 0.08 && d.midRed < 0.08 && angleDiffAbs(desiredAngle, d.angle) <= Math.PI * 0.56)
      .sort((a, b) => angleDiffAbs(desiredAngle, a.angle) - angleDiffAbs(desiredAngle, b.angle));
    if (safeCandidates.length > 0) {
      return { angle: safeCandidates[0].angle, steered: true, dirLabel: safeCandidates[0].label, shouldHold: false };
    }
    // 若順行夾角內全被紅條封住且腳下目前安全，改為原地定住煞車
    if (scan.footRed < 0.08) {
      return { angle: desiredAngle, steered: false, shouldHold: true };
    }
    return { angle: desiredAngle, steered: false, shouldHold: false };
  }

  function keysForMoveAngle(angle, scheme) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const keys = [];
    if (dx > 0.36) keys.push(scheme.right);
    else if (dx < -0.36) keys.push(scheme.left);
    if (dy > 0.36) keys.push(scheme.down);
    else if (dy < -0.36) keys.push(scheme.up);
    if (!keys.length) {
      keys.push(Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? scheme.right : scheme.left) : (dy >= 0 ? scheme.down : scheme.up));
    }
    return keys;
  }

  function runBossRedDodgeTick() {
    try {
      const cfg = CONFIG.autoMoveConfig;
      if (cfg.bossRedDodgeEnabled === false) return;
      if (cfg.mode !== 'radius_wander' && !state.lowHpEvading) return;
      if (state.paused || state.npcWalking || state.pickerActive) return;
      if (isInVillageLobby() || !isInCombat()) {
        state.bossRedDodgeState = null;
        state.bossRedFootStreak = 0;
        return;
      }
      const now = Date.now();
      if (now < (state.humanOverrideUntil || 0)) return;
      if (findDomCardElements().length >= 2) return;

      // 最高優先：先推進斐揚洞穴 MVP 月夜貓避難狀態機，避免大紅圈瞬間被一般紅圈閃避搶佔計時器（餓死 scheduleNextMoveStep）而把角色帶出紅圈外！
      if (cfg.moonlightBellDodgeEnabled !== false) {
        const msPre = state.moonlightState;
        const wasIdle = !msPre?.active || msPre.phase === 'idle';
        const curCoordForBell = readMinimapCoord();
        updateMoonlightBellState(now, curCoordForBell);
        if (state.moonlightState?.active && state.moonlightState.phase !== 'idle') {
          state.bossRedDodgeState = null;
          state.bossRedFootStreak = 0;
          if (wasIdle) {
            if (state.moveStepTimer) {
              clearTimeout(state.moveStepTimer);
              state.moveStepTimer = null;
            }
            stepMoonlightBellMove(now, curCoordForBell);
          }
          return;
        }
      }

      // 次高優先：同步偵測包圍圈怪潮系統提示／06:00 固定波次（110ms 級快響，避免錯過閃現橫幅）
      if (cfg.swarmBreakoutEnabled !== false) {
        const wasSwarmActive = Boolean(state.swarmBreakout?.active);
        const curCoordForSwarm = readMinimapCoord();
        updateSwarmBreakoutState(now, curCoordForSwarm);
        if (!wasSwarmActive && state.swarmBreakout?.active) {
          if (state.moveStepTimer) {
            clearTimeout(state.moveStepTimer);
            state.moveStepTimer = null;
          }
          stepSwarmBreakoutMove(now, curCoordForSwarm);
        }
      }

      const liveHpPct = typeof state.lastCombatHpPct === 'number' ? state.lastCombatHpPct : readHpPercent();
      const hpRecentlyDropped = Boolean(state.lastHpDropAt && now - state.lastHpDropAt < 2400);
      const swarmActiveNow = Boolean(state.swarmBreakout?.active && now < (state.swarmBreakout.until || 0));
      const takingDamageOrLowHp = Boolean(
        state.lowHpEvading ||
        swarmActiveNow ||
        hpRecentlyDropped ||
        (typeof liveHpPct === 'number' && liveHpPct < 75)
      );

      const bossCtx = getActiveBossContext(now, false);
      if (!bossCtx.active) {
        if (state.bossRedDodgeState?.mode === 'hold') {
          state.bossRedDodgeState = null;
          if (state.navTarget?.type === 'boss_red_hold') state.navTarget = null;
        }
        // 補漏保護：部分活動波次（例如燈籠節 06:00 前後）或無血條菁英可能直接放地面紅區；
        // 當處於高危窗口或剛扣血時低頻抽檢腳下強踩紅，只做短步閃避、絕不啟用原地定住煞車
        const curSecAmbient = readGameClockSec();
        const curStageAmbient = String(state.mapCenterCoord?.stageName || resolveCurrentStageInfo()?.name || '');
        const inLouyangSixMinDanger = Boolean(
          /洛陽|燈籠/.test(curStageAmbient) &&
          typeof curSecAmbient === 'number' &&
          state.clockDir !== 'down' &&
          curSecAmbient >= 345 &&
          curSecAmbient <= 430
        );
        const allowAmbientRedCheck = Boolean(
          now - (state.lastAmbientRedScanAt || 0) >= 380 &&
          (inLouyangSixMinDanger || (hpRecentlyDropped && typeof curSecAmbient === 'number' && curSecAmbient >= 120))
        );
        if (allowAmbientRedCheck) {
          state.lastAmbientRedScanAt = now;
          const ambScan = scanBossGroundRedZones(true);
          if (ambScan.ok) {
            if (ambScan.footRed >= 0.24) {
              state.bossRedFootStreak = (state.bossRedFootStreak || 0) + 1;
            } else {
              state.bossRedFootStreak = 0;
            }
            if (state.bossRedFootStreak >= 2) {
              state.lastBossRedActiveAt = now;
              state.detourUntil = 0;
              const curCoordAmb = readMinimapCoord();
              const bestDirAmb = pickBestRedEscapeDir(ambScan, bossCtx, curCoordAmb);
              if (bestDirAmb && (bestDirAmb.midRed + 0.06 < ambScan.footRed || bestDirAmb.midRed < 0.12)) {
                const scheme = KEY_MAPS[cfg.keyScheme] || KEY_MAPS.wasd;
                const dodgeMs = randomInRangeMs(260, 360);
                if (state.moveStepTimer) {
                  clearTimeout(state.moveStepTimer);
                  state.moveStepTimer = null;
                }
                state.bossRedDodgeState = {
                  mode: 'evade',
                  angle: bestDirAmb.angle,
                  dirLabel: bestDirAmb.label,
                  until: now + dodgeMs,
                  footRed: ambScan.footRed,
                  nearRed: ambScan.nearRed,
                  fieldRed: ambScan.fieldRed,
                  targetRed: bestDirAmb.midRed,
                  updatedAt: now,
                };
                state.moveAngle = bestDirAmb.angle;
                state.navTarget = {
                  type: 'boss_red_evade',
                  dirLabel: bestDirAmb.label,
                  footRed: ambScan.footRed,
                  targetRed: bestDirAmb.midRed,
                };
                state.isBurstMoving = true;
                syncMoveKeys(keysForMoveAngle(bestDirAmb.angle, scheme));
                state.moveStepTimer = setTimeout(scheduleNextMoveStep, dodgeMs);
                updateMoveHud(false, curCoordAmb);
                if (now - (state.lastBossRedLogAt || 0) > 2800) {
                  state.lastBossRedLogAt = now;
                  addLog(`[紅圈閃避] 🔴 高危波次偵測腳下踩紅 (${Math.round(ambScan.footRed * 100)}%)，短步往${bestDirAmb.label}閃避`);
                }
                return;
              }
            }
          }
        } else if (state.bossRedDodgeState && now >= (state.bossRedDodgeState.until || 0)) {
          state.bossRedDodgeState = null;
          state.bossRedFootStreak = 0;
          if (state.navTarget?.type === 'boss_red_evade' || state.navTarget?.type === 'boss_red_hold') {
            state.navTarget = null;
          }
        }
        return;
      }

      const scan = scanBossGroundRedZones(true);
      if (!scan.ok) return;

      const footRed = scan.footRed;
      const nearRed = scan.nearRed;
      const fieldRed = scan.fieldRed;
      const prevMode = state.bossRedDodgeState?.mode || null;
      const bossHugging = bossCtx.nearestDistTiles !== null && bossCtx.nearestDistTiles < 7.5;

      // 腳下紅區連續幀統計（強踩 >= 22% 單幀即閃，一般 >= 14% 連 2 幀閃避以過濾零星特效）
      if (footRed >= 0.14) {
        state.bossRedFootStreak = (state.bossRedFootStreak || 0) + 1;
      } else {
        state.bossRedFootStreak = 0;
      }

      const shouldEvade = footRed >= 0.22 || (footRed >= 0.14 && state.bossRedFootStreak >= 2);
      const redThreatAround = nearRed >= 0.085 || fieldRed >= 0.065;
      if (shouldEvade || redThreatAround) {
        state.lastBossRedActiveAt = now;
      }
      // 腳下踩紅屬於最高緊急事件：即使處於繞牆脫困期間也必須立即打斷繞牆先閃紅區
      if (!shouldEvade && now < (state.detourUntil || 0)) return;

      if (shouldEvade) {
        state.detourUntil = 0;
        const curCoord = readMinimapCoord();
        const bestDir = pickBestRedEscapeDir(scan, bossCtx, curCoord);
        if (bestDir && (bestDir.midRed + 0.05 < footRed || bestDir.midRed < 0.12)) {
          const scheme = KEY_MAPS[cfg.keyScheme] || KEY_MAPS.wasd;
          const dodgeMs = randomInRangeMs(260, 360);
          if (state.moveStepTimer) {
            clearTimeout(state.moveStepTimer);
            state.moveStepTimer = null;
          }
          state.bossRedDodgeState = {
            mode: 'evade',
            angle: bestDir.angle,
            dirLabel: bestDir.label,
            until: now + dodgeMs,
            footRed,
            nearRed,
            fieldRed,
            targetRed: bestDir.midRed,
            updatedAt: now,
          };
          state.moveAngle = bestDir.angle;
          state.navTarget = {
            type: 'boss_red_evade',
            dirLabel: bestDir.label,
            footRed,
            targetRed: bestDir.midRed,
          };
          state.isBurstMoving = true;
          syncMoveKeys(keysForMoveAngle(bestDir.angle, scheme));
          state.moveStepTimer = setTimeout(scheduleNextMoveStep, dodgeMs);
          updateMoveHud(false, curCoord);
          if (now - (state.lastBossRedLogAt || 0) > 2800) {
            state.lastBossRedLogAt = now;
            addLog(`[紅圈閃避] 🔴 腳下踩紅 (${Math.round(footRed * 100)}%)，短步往${bestDir.label}閃至安全空隙 (目標紅區 ${Math.round(bestDir.midRed * 100)}%)`);
          }
          return;
        }
      }

      // Case 3：剛從紅區閃出來且腳下已安全 (< 7%)，若周圍仍有紅條且目前無扣血／未殘血立即煞車定住，防止衝過頭踩進下一條紅線
      if (prevMode === 'evade' && footRed < 0.07 && redThreatAround && !bossHugging && !takingDamageOrLowHp) {
        if (state.moveStepTimer) {
          clearTimeout(state.moveStepTimer);
          state.moveStepTimer = null;
        }
        releaseHeldKeysOnly();
        state.bossRedDodgeState = {
          mode: 'hold',
          until: now + 360,
          footRed,
          nearRed,
          fieldRed,
          updatedAt: now,
        };
        state.navTarget = { type: 'boss_red_hold', footRed, nearRed, fieldRed };
        state.moveStepTimer = setTimeout(scheduleNextMoveStep, 260);
        updateMoveHud(false);
        return;
      }

      // Case 2：腳下目前安全 (< 8%) 但周圍／戰場出現明顯紅條或紅圈，且王未貼臉、未扣血、血量健康 → 定住煞車維持安全區輸出
      if (footRed < 0.08 && redThreatAround && !bossHugging && !takingDamageOrLowHp) {
        const needBrake = prevMode !== 'hold' || state.heldKeys.size > 0;
        state.bossRedDodgeState = {
          mode: 'hold',
          until: now + 360,
          footRed,
          nearRed,
          fieldRed,
          updatedAt: now,
        };
        state.navTarget = { type: 'boss_red_hold', footRed, nearRed, fieldRed };
        if (needBrake) {
          if (state.moveStepTimer) {
            clearTimeout(state.moveStepTimer);
            state.moveStepTimer = null;
          }
          releaseHeldKeysOnly();
          state.moveStepTimer = setTimeout(scheduleNextMoveStep, 260);
          updateMoveHud(false);
          if (now - (state.lastBossRedLogAt || 0) > 4500) {
            state.lastBossRedLogAt = now;
            addLog(`[紅圈閃避] 🛡️ 偵測周圍地面紅區 (${Math.round(Math.max(nearRed, fieldRed) * 100)}%)，目前站位安全先定住煞車維持輸出`);
          }
        }
        return;
      }

      // 紅區已消退、王已貼臉、或正在扣血／血量偏低 → 立即解除定住煞車並恢復機動走位（絕不原地罰站挨打）
      if (state.bossRedDodgeState && ((footRed < 0.06 && nearRed < 0.05 && fieldRed < 0.04) || (prevMode === 'hold' && (bossHugging || takingDamageOrLowHp)))) {
        const wasHold = prevMode === 'hold';
        const brokeByDamage = Boolean(wasHold && takingDamageOrLowHp && !bossHugging);
        state.bossRedDodgeState = null;
        if (state.navTarget?.type === 'boss_red_evade' || state.navTarget?.type === 'boss_red_hold') {
          state.navTarget = null;
        }
        if (wasHold) {
          if (brokeByDamage && now - (state.lastBossHoldReleaseLogAt || 0) > 4500) {
            state.lastBossHoldReleaseLogAt = now;
            addLog(`[紅圈閃避] ⚠️ 偵測受擊／血量偏低 (HP ${liveHpPct ?? '--'}%)，立即解除定住煞車恢復機動走位`);
          }
          if (state.moveStepTimer) {
            clearTimeout(state.moveStepTimer);
            state.moveStepTimer = null;
          }
          scheduleNextMoveStep();
        }
      }
    } catch (_) {}
  }

  function pickHumanWaypoint(radius, curCoord = null) {
    const curAngle = Math.atan2(state.posY, state.posX);
    if (Math.random() < 0.25) state.moveTurnBias = -state.moveTurnBias;
    const stageKey = getObstacleStageKey(curCoord);
    const bucket =
      CONFIG.autoMoveConfig.obstacleMemoryEnabled !== false && stageKey && state.mapCenterCoord
        ? getStageObstacleBucket(stageKey, false)
        : null;
    const hasKnownObstacles = Boolean(bucket && Object.keys(bucket.b || {}).length > 0);
    let fallbackWp = null;
    // Tier 1 巡邏選點過濾：連續抽最多 8 個候選點，優先避開已知障礙格、貼石角與直線被巨石擋住的死角
    const attempts = hasKnownObstacles ? 8 : 1;
    for (let i = 0; i < attempts; i++) {
      const turnSign = i >= 4 ? -state.moveTurnBias : state.moveTurnBias;
      const offset = turnSign * ((Math.PI * 0.3) + Math.random() * (Math.PI * 0.62));
      const nextAngle = curAngle + offset + (Math.random() - 0.5) * 0.45;
      const rDist = radius * (0.35 + Math.random() * 0.52);
      const wp = {
        x: Math.cos(nextAngle) * rDist,
        y: Math.sin(nextAngle) * rDist,
        legsLeft: 3 + Math.floor(Math.random() * 4),
      };
      if (!fallbackWp) fallbackWp = wp;
      if (!hasKnownObstacles) return wp;
      const tgtTile = relPosToTile(wp.x, wp.y);
      if (!tgtTile) return wp;
      if (getTileObstacleLevel(bucket, tgtTile.x, tgtTile.y) >= 1) continue;
      if (isAdjacentToConfirmedObstacle(bucket, tgtTile.x, tgtTile.y)) continue;
      if (curCoord) {
        const los = hasClearTileLine(stageKey, bucket, Math.round(curCoord.x), Math.round(curCoord.y), tgtTile.x, tgtTile.y, false);
        if (!los.clear) continue;
      }
      return wp;
    }
    return fallbackWp;
  }

  function scheduleNextMoveStep() {
    try {
    if (CONFIG.autoMoveConfig.mode !== 'radius_wander' && !state.lowHpEvading) {
      if (!state.npcWalking) releaseAllMoveKeys();
      return;
    }
    if (state.moveStepTimer) {
      clearTimeout(state.moveStepTimer);
      state.moveStepTimer = null;
    }
    if (state.npcWalking) {
      state.moveStepTimer = setTimeout(scheduleNextMoveStep, humanJitterMs(280, 0.8, 1.3));
      return;
    }
    // 村莊 (#lobby-place) 或非戰鬥畫面時，一律停止隨機走位（進副本看到 #timer 後自動恢復）
    if (isInVillageLobby() || !isInCombat()) {
      releaseHeldKeysOnly();
      state.moveWaypoint = null;
      state.isBurstMoving = false;
      state.stuckRefCoord = null;
      state.stuckMoveMsAccum = 0;
      state.stuckCount = 0;
      state.detourUntil = 0;
      state.bossRedDodgeState = null;
      state.bossRedFootStreak = 0;
      state.moveStepTimer = setTimeout(scheduleNextMoveStep, humanJitterMs(420, 0.85, 1.25));
      return;
    }
    const activeCards = findDomCardElements();
    if (state.paused || Date.now() < state.humanOverrideUntil || activeCards.length >= 2) {
      releaseHeldKeysOnly();
      state.stuckRefCoord = null;
      state.stuckMoveMsAccum = 0;
      state.detourUntil = 0;
      state.moveStepTimer = setTimeout(scheduleNextMoveStep, humanJitterMs(190, 0.8, 1.3));
      return;
    }
    const now = Date.now();
    const curCoord = readMinimapCoord();

    // 斐揚洞穴 MVP 月夜貓「躲到鐘下」4 階段專屬避難機制
    if (CONFIG.autoMoveConfig.moonlightBellDodgeEnabled !== false) {
      updateMoonlightBellState(now, curCoord);
      if (state.moonlightState?.active && state.moonlightState.phase !== 'idle') {
        const handled = stepMoonlightBellMove(now, curCoord);
        if (handled) return;
      }
    }

    // 包圍圈怪潮直線突圍機制（偵測系統提示或燈籠節 06:00 固定包圍圈時，解除中心半徑束縛與撿箱回心，單向直線衝出怪群）
    if (CONFIG.autoMoveConfig.swarmBreakoutEnabled !== false) {
      updateSwarmBreakoutState(now, curCoord);
      if (state.swarmBreakout?.active && now < (state.swarmBreakout.until || 0)) {
        const handledSwarm = stepSwarmBreakoutMove(now, curCoord);
        if (handledSwarm) return;
      }
    }

    // 1. 使用小地圖真實座標即時校正相對中心點位移，同時正向學習已知安全通路
    const activeStageKey = getObstacleStageKey(curCoord);
    if (curCoord) {
      recordWalkedTile(curCoord);
    }
    if (curCoord && state.mapCenterCoord) {
      state.posX = (curCoord.x - state.mapCenterCoord.x) * 16;
      state.posY = (state.mapCenterCoord.y - curCoord.y) * 16;
      state.lastCoord = { x: curCoord.x, y: curCoord.y };
    }
    // 2. 卡牆偵測與自動側向繞行脫困（累計純移動按鍵 ≥ 1.4 秒且座標位移 0 格時觸發；瀏覽器非前景略過輸入期間不累計避免誤判）
    const focusSkippedRecently = now - (state.lastBridgeFocusSkipAt || 0) < 2500;
    if (curCoord) {
      if (focusSkippedRecently) {
        state.stuckRefCoord = { x: curCoord.x, y: curCoord.y };
        state.stuckMoveMsAccum = 0;
      } else if (!state.stuckRefCoord) {
        state.stuckRefCoord = { x: curCoord.x, y: curCoord.y };
        state.stuckMoveMsAccum = 0;
      } else {
        const movedTiles = Math.hypot(curCoord.x - state.stuckRefCoord.x, curCoord.y - state.stuckRefCoord.y);
        if (movedTiles >= 1) {
          state.stuckRefCoord = { x: curCoord.x, y: curCoord.y };
          state.stuckMoveMsAccum = 0;
          if (now >= (state.detourUntil || 0)) state.stuckCount = 0;
        } else if (state.stuckMoveMsAccum >= 1400) {
          recordObstacleHitFromStuck(curCoord, state.moveAngle || 0, 'normal_stuck');
          state.stuckRefCoord = { x: curCoord.x, y: curCoord.y };
          state.stuckMoveMsAccum = 0;
          state.stuckCount = (state.stuckCount || 0) + 1;
          // 初次卡牆優先查障礙記憶網格挑選較開闊一側；連卡第 1、2 次維持同側擴大繞行，第 3 次起才翻轉另一側
          if (state.stuckCount === 1) {
            const memFlank = pickOpenFlankByObstacleMap(activeStageKey, curCoord, state.moveAngle || 0);
            if (memFlank) state.moveTurnBias = memFlank;
          } else if (state.stuckCount >= 3) {
            state.moveTurnBias = -(state.moveTurnBias || 1);
          }
          const sideSign = state.moveTurnBias || 1;
          const escAngle = state.stuckCount >= 2 ? 2.15 : 1.72; // 123° 退繞 vs 98° 側繞
          const escMs = state.stuckCount >= 2 ? 1750 : 1400;
          state.detourAngle = (state.moveAngle || 0) + sideSign * (escAngle + Math.random() * 0.25);
          state.detourUntil = now + escMs;
          let actionDesc = '側向繞開障礙';
          if (state.navTarget?.type === 'chest' && state.stuckCount >= 3) {
            if (typeof state.navTarget.cx === 'number' && typeof state.navTarget.cy === 'number') {
              if (!Array.isArray(state.ignoredLootTargets)) state.ignoredLootTargets = [];
              state.ignoredLootTargets.push({
                cx: state.navTarget.cx,
                cy: state.navTarget.cy,
                category: state.navTarget.category,
                until: now + 12000,
              });
            }
            actionDesc = `繞行仍受阻，暫時略過【${state.navTarget.label || '該目標'}】12秒`;
            state.navTarget = null;
            state.stuckCount = 0;
          } else if (state.navTarget?.type === 'center' && state.stuckCount >= 3) {
            actionDesc = '返回中心受阻，改回目前位置半徑巡邏';
            state.navTarget = null;
            state.moveWaypoint = null;
            state.stuckCount = 0;
          } else {
            state.moveWaypoint = null;
          }
          if (now - (state.lastStuckLogAt || 0) > 4000) {
            state.lastStuckLogAt = now;
            addLog(`[卡牆脫困] 座標 (${curCoord.x}, ${curCoord.y}) 原地受阻 1.4 秒，${actionDesc}`);
          }
        }
      }
    }
    const cfg = CONFIG.autoMoveConfig;
    const style = cfg.style || 'human_natural';
    const isHuman = style === 'human_natural';
    const isSmooth = style === 'smooth_continuous';
    const scheme = KEY_MAPS[cfg.keyScheme] || KEY_MAPS.wasd;
    const radius = state.lowHpEvading ? Math.max(120, Number(cfg.radiusPx) || 180) : Math.max(40, Number(cfg.radiusPx) || 180);
    const speed = Math.max(60, Number(cfg.moveSpeedPxPerSec) || 200);
    const timing = getMoveTimingRanges(cfg);
    let stepMs = state.lowHpEvading
      ? randomInRangeMs(300, 520)
      : randomInRangeMs(timing.stepMin, timing.stepMax);
    let pauseMs = 0;
    if (!state.lowHpEvading) {
      if (isHuman) {
        // 擬人自然節奏：約 32% 機率在每段結束後隨機停頓 [pauseMin ~ pauseMax] ms，其餘直接柔和換向不中斷
        pauseMs = timing.pauseMax > 0 && Math.random() < 0.32 ? randomInRangeMs(timing.pauseMin, timing.pauseMax) : 0;
      } else if (isSmooth) {
        pauseMs = timing.pauseMax > 0 && Math.random() < 0.2 ? randomInRangeMs(timing.pauseMin, timing.pauseMax) : 0;
      } else {
        pauseMs = timing.pauseMax > 0 ? randomInRangeMs(timing.pauseMin, timing.pauseMax) : 0;
      }
    }
    let inDetour = now < (state.detourUntil || 0);
    // 若打王紅圈偵測處於「安全區定住煞車」期間，維持原地不動不搶按移動鍵
    if (
      !inDetour &&
      cfg.bossRedDodgeEnabled !== false &&
      state.bossRedDodgeState?.mode === 'hold' &&
      now < (state.bossRedDodgeState.until || 0)
    ) {
      releaseHeldKeysOnly();
      updateMoveHud(false, curCoord);
      state.moveStepTimer = setTimeout(scheduleNextMoveStep, 180);
      return;
    }
    if (inDetour) {
      state.moveAngle = state.detourAngle + (Math.random() - 0.5) * 0.16;
      stepMs = randomInRangeMs(440, 700);
      pauseMs = 0;
    }
    // 打王／紅圈最高優先判定：場上有活躍王或近 5.5 秒有地面紅區時，絕不為了撿寶箱／裝備／補給忽略控距與紅圈閃避
    const bossCtxForLoot = getActiveBossContext(now, false);
    const bossRedRecentlyActive = Boolean(
      (state.bossRedDodgeState && now < (state.bossRedDodgeState.until || 0) + 1200) ||
      (now - (state.lastBossRedActiveAt || 0) < 5500)
    );
    const bossFightBlocksLoot = Boolean(bossCtxForLoot.active || bossRedRecentlyActive);
    if (bossFightBlocksLoot && state.navTarget?.type === 'chest') {
      const pausedLabel = state.navTarget.label || '目標物品';
      state.navTarget = null;
      if (now - (state.lastBossLootPauseLogAt || 0) > 6500) {
        state.lastBossLootPauseLogAt = now;
        addLog(`[打王優先] 偵測到王／地面紅區，暫停前往撿取【${pausedLabel}】，優先維持控距與紅圈閃避`);
      }
    }
    // 依「撿取」分頁勾選項目與順序優先撿取（打王與地面紅區期間嚴格暫停撿寶箱／裝備／補給；紅區或王距≤24格時連磁鐵亦暫緩）
    let trackingLoot = false;
    if (!inDetour && cfg.autoLootChests && !state.lowHpEvading) {
      const zenyStatus = readZenyAndChestCost();
      if (zenyStatus.canAffordChest) {
        state.lastSkippedChestCost = null;
      }
      let targets = findMinimapChestsAndLoot({ cachedCoord: curCoord });
      if (bossFightBlocksLoot && targets.length > 0) {
        const allowFarMagnetOnly = Boolean(
          !bossRedRecentlyActive &&
          bossCtxForLoot.nearestDistTiles !== null &&
          bossCtxForLoot.nearestDistTiles > 24
        );
        const filtered = allowFarMagnetOnly ? targets.filter((t) => t.category === 'magnet') : [];
        if (filtered.length < targets.length && now - (state.lastBossLootPauseLogAt || 0) > 8000) {
          state.lastBossLootPauseLogAt = now;
          const skippedLbl = LOOT_CATEGORY_META[targets[0]?.category]?.label || '寶箱';
          addLog(`[打王優先] 場上有王／紅區威脅，略過【${skippedLbl}】優先專注打王與閃紅區`);
        }
        targets = filtered;
      }
      // 若前一刻正在追磁鐵，但現在目標換成非磁鐵或距離驟增（代表剛把那顆磁鐵撿掉了），立即記錄冷卻並重篩
      if (state.navTarget?.type === 'chest' && state.navTarget.category === 'magnet' && targets.length > 0) {
        const firstTgt = targets[0];
        const switchedAway = firstTgt.category !== 'magnet';
        const jumpedToAnotherMagnet =
          firstTgt.category === 'magnet' &&
          typeof state.navTarget.dist === 'number' &&
          state.navTarget.dist <= 34 &&
          firstTgt.dist > state.navTarget.dist + 20;
        if (switchedAway || jumpedToAnotherMagnet) {
          state.lastMagnetPickupTime = now;
          addLog(`[智慧磁鐵] 已撿取磁鐵，已記錄冷卻計時（下次需隔 ${cfg.magnetIntervalMin || 3} 分鐘或等尾盤剩餘 ${cfg.magnetEndRemainingMin || 3} 分鐘衝刺）`);
          updateMiniMagnetHud();
          if (jumpedToAnotherMagnet && cfg.smartMagnetEnabled !== false && !getSmartMagnetStatus(now).allowed) {
            targets = targets.filter((t) => t.category !== 'magnet');
          }
        }
      }
      if (targets.length > 0) {
        const tgt = targets[0];
        const tgtLabel = LOOT_CATEGORY_META[tgt.category]?.label || '目標物品';
        trackingLoot = true;
        let lootAngle = Math.atan2(tgt.dy, tgt.dx) + (Math.random() - 0.5) * 0.08;
        if (curCoord) {
          const lootTilesPerPx = estimateMinimapTilesPerPx(state.lastMinimapScanResult?.canvasSize);
          const estTx = Math.round(curCoord.x + (tgt.dx || 0) * lootTilesPerPx);
          const estTy = Math.round(curCoord.y - (tgt.dy || 0) * lootTilesPerPx);
          const smartLoot = resolveObstacleSmartAngle(activeStageKey, curCoord, lootAngle, {
            tx: estTx,
            ty: estTy,
            label: `【${tgtLabel}】`,
            lookaheadTiles: 4,
          });
          if (smartLoot.steered) lootAngle = smartLoot.angle;
        }
        state.moveAngle = lootAngle;
        state.navTarget = { type: 'chest', category: tgt.category, label: tgtLabel, dist: tgt.dist, source: tgt.source, cx: tgt.cx, cy: tgt.cy };
        if (tgt.category === 'magnet') updateMiniMagnetHud();
        const lootMin = Math.max(320, Math.min(620, Math.round(timing.stepMin * 0.72)));
        const lootMax = Math.max(lootMin + 80, Math.min(920, Math.round(timing.stepMax * 0.72)));
        stepMs = randomInRangeMs(lootMin, lootMax);
        pauseMs = 0;
        if (now - (state.lastLootLogAt || 0) > 8000) {
          state.lastLootLogAt = now;
          addLog(`[小地圖尋路] 偵測到【${tgtLabel}】（距離約 ${Math.round(tgt.dist)}px），優先前往撿取`);
        }
      } else {
        if (
          isLootCategoryEnabled('chest') &&
          !zenyStatus.canAffordChest &&
          (state.lastMinimapScanResult?.chests?.length || 0) > 0 &&
          state.lastSkippedChestCost !== zenyStatus.chestCost
        ) {
          state.lastSkippedChestCost = zenyStatus.chestCost;
          addLog(`[小地圖尋路] 金幣不足開箱（目前 ${zenyStatus.zeny} z ＜ 寶箱 ${zenyStatus.chestCost} z），暫時略過寶箱`);
        }
        if (state.navTarget?.type === 'chest') {
          const prevCat = state.navTarget.category;
          const prevLabel = state.navTarget.label || '目標物品';
          if (prevCat === 'magnet') {
            state.lastMagnetPickupTime = Date.now();
            addLog(`[智慧磁鐵] 已撿取磁鐵，已記錄冷卻計時（下次需隔 ${cfg.magnetIntervalMin || 3} 分鐘或等尾盤剩餘 ${cfg.magnetEndRemainingMin || 3} 分鐘衝刺）`);
          }
          state.navTarget = null;
          if (prevCat === 'magnet') updateMiniMagnetHud();
          if (prevCat === 'chest' && !zenyStatus.canAffordChest) {
            if (cfg.returnToCenterAfterLoot) {
              state.navTarget = { type: 'center' };
            }
          } else if (cfg.returnToCenterAfterLoot) {
            state.navTarget = { type: 'center' };
            addLog(`[小地圖尋路] ${prevLabel}已撿取或離開視野，自動返回地圖中心`);
          }
        }
      }
    }
    // 首領／小王風箏控距（預設目標距離約 15 格：小於 12 格拉開、12~19 格切線繞行、19~42 格稍微靠近維持法師自動施法鎖定範圍）
    let kitingBoss = false;
    if (!inDetour && !state.lowHpEvading) {
      const scanForBoss =
        state.lastMinimapScanResult && now - (state.lastMinimapScanAt || 0) < 1100
          ? state.lastMinimapScanResult
          : scanMinimapCanvasMarkers(null, false);
      const bossList = Array.isArray(scanForBoss?.bosses) ? scanForBoss.bosses : [];
      if (scanForBoss?.player && bossList.length > 0) {
        const px = scanForBoss.player.cx;
        const py = scanForBoss.player.cy;
        const tilesPerPx = estimateMinimapTilesPerPx(scanForBoss.canvasSize);
        let nearestBoss = null;
        let nearestDistTiles = 1e9;
        let nearestDx = 0;
        let nearestDy = 0;
        for (const b of bossList) {
          const bdx = b.cx - px;
          const bdy = b.cy - py;
          const dTiles = Math.hypot(bdx, bdy) * tilesPerPx;
          if (dTiles < nearestDistTiles) {
            nearestDistTiles = dTiles;
            nearestBoss = b;
            nearestDx = bdx;
            nearestDy = bdy;
          }
        }
        if (nearestBoss && nearestDistTiles <= 42) {
          const bossAngle = Math.atan2(nearestDy, nearestDx);
          const awayAngle = Math.atan2(-nearestDy, -nearestDx);
          const bossLabel = nearestBoss.bossKind === 'miniboss' ? '小王(橘點)' : '首領王(紅點)';
          // 計算離地圖中心距離與回心角（長時間打王核心：維持在開闊中心附近繞圈，防止 1~3 分鐘拉打退進邊界死角）
          let centerAngle = null;
          let centerDist = 0;
          if (curCoord && state.mapCenterCoord) {
            const cDx = state.mapCenterCoord.x - curCoord.x;
            const cDy = curCoord.y - state.mapCenterCoord.y;
            centerDist = Math.hypot(cDx, cDy);
            if (centerDist > 12) centerAngle = Math.atan2(cDy, cDx);
          }
          let kiteAction = 'orbit';
          let kiteDesc = '切線繞行風箏';
          if (nearestDistTiles < 11.5) {
            // 距離過近：以背離王 + 切線微偏拉開至 ~14.5 格；離中心 > 18 格時動態選偏中心側拉開
            if (centerAngle !== null && centerDist > 18 && now - (state.lastBossTurnFlipAt || 0) > 2200) {
              const cwDot = Math.cos(awayAngle + 0.48 - centerAngle);
              const ccwDot = Math.cos(awayAngle - 0.48 - centerAngle);
              const wantBias = cwDot >= ccwDot ? 1 : -1;
              if (wantBias !== state.moveTurnBias && Math.abs(cwDot - ccwDot) > 0.22) {
                state.moveTurnBias = wantBias;
                state.lastBossTurnFlipAt = now;
              }
            }
            let steerAngle = awayAngle + state.moveTurnBias * 0.44;
            if (centerAngle !== null && centerDist > 20) {
              const pullW = Math.min(0.42, 0.22 + (centerDist - 20) * 0.012);
              const sx = Math.cos(steerAngle) * (1 - pullW) + Math.cos(centerAngle) * pullW;
              const sy = Math.sin(steerAngle) * (1 - pullW) + Math.sin(centerAngle) * pullW;
              steerAngle = Math.atan2(sy, sx);
            }
            state.moveAngle = steerAngle + (Math.random() - 0.5) * 0.14;
            stepMs = randomInRangeMs(320, 520);
            pauseMs = 0;
            kiteAction = 'retreat';
            kiteDesc = '拉開距離至 ~15 格';
          } else if (nearestDistTiles > 18.5) {
            // 距離稍遠：輕微靠近回 ~15 格內，確保普攻（無5%上限）與技能持續命中不斷檔
            state.moveAngle = bossAngle + state.moveTurnBias * 0.26 + (Math.random() - 0.5) * 0.12;
            stepMs = randomInRangeMs(300, 500);
            pauseMs = 0;
            kiteAction = 'approach';
            kiteDesc = '微靠近維持 ~15 格輸出射程';
          } else {
            // 最佳 11.5~18.5 格射程帶：長時間繞王切線移動；離中心 > 18 格時自動選擇更靠中心側的切線方向，將王拴在開闊區
            if (centerAngle !== null && centerDist > 18 && now - (state.lastBossTurnFlipAt || 0) > 2800) {
              const cwAng = bossAngle + Math.PI * 0.52;
              const ccwAng = bossAngle - Math.PI * 0.52;
              const cwDot = Math.cos(cwAng - centerAngle);
              const ccwDot = Math.cos(ccwAng - centerAngle);
              const wantBias = cwDot >= ccwDot ? 1 : -1;
              if (wantBias !== state.moveTurnBias && Math.abs(cwDot - ccwDot) > 0.28) {
                state.moveTurnBias = wantBias;
                state.lastBossTurnFlipAt = now;
              }
            }
            let orbitAngle = bossAngle + state.moveTurnBias * (Math.PI * 0.52);
            if (centerAngle !== null && centerDist > 24) {
              const leashW = Math.min(0.32, 0.14 + (centerDist - 24) * 0.01);
              const ox = Math.cos(orbitAngle) * (1 - leashW) + Math.cos(centerAngle) * leashW;
              const oy = Math.sin(orbitAngle) * (1 - leashW) + Math.sin(centerAngle) * leashW;
              orbitAngle = Math.atan2(oy, ox);
            }
            state.moveAngle = orbitAngle + (Math.random() - 0.5) * 0.16;
            stepMs = randomInRangeMs(360, 600);
            // 長時間王戰縮短發呆停頓，維持流暢拉打與持續輸出
            pauseMs = timing.pauseMax > 0 && Math.random() < 0.14 ? randomInRangeMs(50, 110) : 0;
            kiteAction = 'orbit';
            kiteDesc = centerDist > 22 ? '維持 ~15 格繞行（回中心拴繩）' : '維持 ~15 格繞行輸出';
          }
          kitingBoss = true;
          trackingLoot = false;
          if (curCoord) {
            const smartKite = resolveObstacleSmartAngle(activeStageKey, curCoord, state.moveAngle, { lookaheadTiles: 4 });
            if (smartKite.steered) {
              state.moveAngle = smartKite.angle;
              // 繞王撞到已知石頭時自動翻轉繞向，改從反方向繞王避免反覆磨石
              if (now - (state.lastBossTurnFlipAt || 0) > 1800) {
                state.moveTurnBias = state.moveTurnBias > 0 ? -1 : 1;
                state.lastBossTurnFlipAt = now;
              }
            }
          }
          state.navTarget = {
            type: 'boss_kite',
            action: kiteAction,
            bossKind: nearestBoss.bossKind || 'boss',
            distTiles: Math.round(nearestDistTiles * 10) / 10,
          };
          if (now - (state.lastBossKiteLogAt || 0) > 6500) {
            state.lastBossKiteLogAt = now;
            addLog(`[王距風箏] 偵測到【${bossLabel}】距約 ${nearestDistTiles.toFixed(1)} 格，${kiteDesc}`);
          }
        } else if (state.navTarget?.type === 'boss_kite') {
          state.navTarget = null;
        }
      } else if (state.navTarget?.type === 'boss_kite') {
        state.navTarget = null;
      }
    }
    if (!inDetour && !trackingLoot && !kitingBoss && state.navTarget?.type === 'center') {
      if (curCoord && state.mapCenterCoord) {
        const toCenterDx = state.mapCenterCoord.x - curCoord.x;
        const toCenterDy = curCoord.y - state.mapCenterCoord.y;
        const tileDist = Math.hypot(toCenterDx, toCenterDy);
        if (tileDist <= 3) {
          state.navTarget = null;
          state.moveWaypoint = null;
          state.posX = 0;
          state.posY = 0;
          addLog(`[小地圖尋路] 已返回地圖中心 (${state.mapCenterCoord.x}, ${state.mapCenterCoord.y})，恢復半徑巡邏`);
        } else {
          let centerAngle = Math.atan2(toCenterDy, toCenterDx) + (Math.random() - 0.5) * 0.14;
          const smartCenter = resolveObstacleSmartAngle(activeStageKey, curCoord, centerAngle, {
            tx: state.mapCenterCoord.x,
            ty: state.mapCenterCoord.y,
            label: '地圖中心',
            lookaheadTiles: 4,
          });
          if (smartCenter.steered) centerAngle = smartCenter.angle;
          state.moveAngle = centerAngle;
          const retMin = Math.max(380, Math.min(720, Math.round(timing.stepMin * 0.85)));
          const retMax = Math.max(retMin + 100, Math.min(1050, Math.round(timing.stepMax * 0.85)));
          stepMs = randomInRangeMs(retMin, retMax);
        }
      } else {
        const distToCenter = Math.hypot(state.posX, state.posY);
        if (distToCenter <= radius * 0.45) {
          state.navTarget = null;
          state.moveWaypoint = null;
          addLog('[小地圖尋路] 已順利返回地圖中心區域，恢復正常半徑巡邏');
        } else {
          state.moveAngle = Math.atan2(-state.posY, -state.posX) + (Math.random() - 0.5) * 0.15;
        }
      }
    } else if (!inDetour && !state.navTarget) {
      const dist = Math.hypot(state.posX, state.posY);
      if (isHuman || isSmooth) {
        // 使用擬人路徑點巡邏，並以小地圖座標修正拉回中心方向
        if (dist >= radius * 0.9) {
          const baseInward =
            curCoord && state.mapCenterCoord
              ? Math.atan2(curCoord.y - state.mapCenterCoord.y, state.mapCenterCoord.x - curCoord.x)
              : Math.atan2(-state.posY, -state.posX);
          // 剛衝出包圍圈的 8 秒緩衝內：改採 ±65° 切線繞弧回中心，避免 180° 掉頭直撞身後追趕中的怪群
          const inSwarmGrace = Boolean(state.swarmPostGraceUntil && now < state.swarmPostGraceUntil);
          const graceTurn = (state.swarmBreakout?.curveSign || 1) * 1.12;
          const inward = inSwarmGrace ? baseInward + graceTurn : baseInward + (Math.random() - 0.5) * 0.65;
          state.moveWaypoint = {
            x: Math.cos(inward) * radius * (inSwarmGrace ? 0.72 : 0.25 + Math.random() * 0.4),
            y: Math.sin(inward) * radius * (inSwarmGrace ? 0.72 : 0.25 + Math.random() * 0.4),
            legsLeft: 2 + Math.floor(Math.random() * 3),
          };
        } else if (
          !state.moveWaypoint ||
          state.moveWaypoint.legsLeft <= 0 ||
          Math.hypot(state.moveWaypoint.x - state.posX, state.moveWaypoint.y - state.posY) < 42
        ) {
          state.moveWaypoint = pickHumanWaypoint(radius, curCoord);
        }
        state.moveWaypoint.legsLeft -= 1;
        const targetAngle = Math.atan2(state.moveWaypoint.y - state.posY, state.moveWaypoint.x - state.posX);
        state.moveAngle = targetAngle + (Math.random() - 0.5) * 0.24;
      } else {
        const baseInward =
          curCoord && state.mapCenterCoord
            ? Math.atan2(curCoord.y - state.mapCenterCoord.y, state.mapCenterCoord.x - curCoord.x)
            : Math.atan2(-state.posY, -state.posX);
        const inSwarmGrace = Boolean(state.swarmPostGraceUntil && now < state.swarmPostGraceUntil);
        state.moveAngle =
          dist >= radius * 0.85
            ? (inSwarmGrace ? baseInward + (state.swarmBreakout?.curveSign || 1) * 1.12 : baseInward + (Math.random() - 0.5) * (Math.PI / 3))
            : Math.random() * Math.PI * 2;
      }
      // Tier 2／3 巡邏前瞻避障：還沒撞上已知障礙前，提早切往安全側或繞過巨石
      if (curCoord) {
        const wpTile = state.moveWaypoint ? relPosToTile(state.moveWaypoint.x, state.moveWaypoint.y) : null;
        const smartPatrol = resolveObstacleSmartAngle(
          activeStageKey,
          curCoord,
          state.moveAngle,
          wpTile ? { tx: wpTile.x, ty: wpTile.y, label: '巡邏路徑點', lookaheadTiles: 4 } : { lookaheadTiles: 4 }
        );
        if (smartPatrol.steered) {
          state.moveAngle = smartPatrol.angle;
        }
      }
    }
    // 打王期間主動過濾計畫走位方向：若預定方向正好踩進 3D 地面紅條／紅圈，優先偏轉至相鄰安全角或短暫定住
    if (
      !inDetour &&
      cfg.bossRedDodgeEnabled !== false &&
      state.bossRedDodgeState?.mode !== 'evade' &&
      state.lastBossRedScan?.ok &&
      now - (state.lastBossRedScanAt || 0) < 550 &&
      (kitingBoss || (state.lastBossSeenAt > 0 && now - state.lastBossSeenAt < 4500))
    ) {
      const guarded = filterMoveAngleForBossRed(state.moveAngle, state.lastBossRedScan);
      const liveHpForHold = typeof state.lastCombatHpPct === 'number' ? state.lastCombatHpPct : null;
      const unsafeToHold = Boolean(
        state.lowHpEvading ||
        state.swarmBreakout?.active ||
        (state.lastHpDropAt && now - state.lastHpDropAt < 2400) ||
        (typeof liveHpForHold === 'number' && liveHpForHold < 75)
      );
      if (guarded.shouldHold && !unsafeToHold) {
        releaseHeldKeysOnly();
        state.bossRedDodgeState = {
          mode: 'hold',
          until: now + 320,
          footRed: state.lastBossRedScan.footRed,
          nearRed: state.lastBossRedScan.nearRed,
          fieldRed: state.lastBossRedScan.fieldRed,
          updatedAt: now,
        };
        state.navTarget = {
          type: 'boss_red_hold',
          footRed: state.lastBossRedScan.footRed,
          nearRed: state.lastBossRedScan.nearRed,
          fieldRed: state.lastBossRedScan.fieldRed,
        };
        updateMoveHud(false, curCoord);
        state.moveStepTimer = setTimeout(scheduleNextMoveStep, 220);
        return;
      }
      if (guarded.steered) {
        state.moveAngle = guarded.angle;
        stepMs = Math.min(stepMs, randomInRangeMs(280, 440));
      }
    }
    const dx = Math.cos(state.moveAngle);
    const dy = Math.sin(state.moveAngle);
    const keys = [];
    if (dx > 0.36) keys.push(scheme.right);
    else if (dx < -0.36) keys.push(scheme.left);
    if (dy > 0.36) keys.push(scheme.down);
    else if (dy < -0.36) keys.push(scheme.up);
    if (!keys.length) keys.push(Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? scheme.right : scheme.left) : (dy >= 0 ? scheme.down : scheme.up));
    const vx = keys.includes(scheme.right) ? 1 : keys.includes(scheme.left) ? -1 : 0;
    const vy = keys.includes(scheme.down) ? 1 : keys.includes(scheme.up) ? -1 : 0;
    const norm = Math.hypot(vx, vy) || 1;
    const stepDist = (speed * stepMs) / 1000;
    // 防長按卡鍵保護：任一方向鍵連續按住超過 4.2 秒（遠低於橋接 10 秒超時），自動短暫鬆鍵換氣 65~130ms 再續走
    const maxHoldExceeded = Array.from(state.heldKeys).some(
      (code) => state.heldKeySince?.[code] && now - state.heldKeySince[code] >= 4200
    );
    if (maxHoldExceeded) {
      releaseHeldKeysOnly();
      state.moveStepTimer = setTimeout(scheduleNextMoveStep, randomInRangeMs(65, 130));
      return;
    }
    state.isBurstMoving = true;
    syncMoveKeys(keys);
    state.moveStepTimer = setTimeout(() => {
      state.posX += (vx / norm) * stepDist;
      state.posY += (vy / norm) * stepDist;
      if (!state.paused && isInCombat()) {
        state.stuckMoveMsAccum = (state.stuckMoveMsAccum || 0) + stepMs;
      }
      updateMoveHud(false, curCoord);
      if (pauseMs > 0) {
        releaseHeldKeysOnly();
        state.moveStepTimer = setTimeout(scheduleNextMoveStep, pauseMs);
      } else {
        scheduleNextMoveStep();
      }
    }, stepMs);
    } catch (err) {
      releaseHeldKeysOnly();
      addLog(`[走位保護] 偵測異常已自動放開按鍵並重試：${err?.message || err}`);
      state.moveStepTimer = setTimeout(scheduleNextMoveStep, 350);
    }
  }
  window.addEventListener('mousemove', (e) => {
    if (!e.isTrusted) return;
    state.lastTrustedMouse = { clientX: e.clientX, clientY: e.clientY, at: Date.now() };
  }, { passive: true, capture: true });
  window.addEventListener('pointerdown', (e) => {
    if (!e.isTrusted || document.hidden) return;
    state.lastTrustedFocusInteractAt = Date.now();
    try { window.focus(); } catch (_) {}
  }, { passive: true, capture: true });
  window.addEventListener('blur', () => {
    state.lastTrustedFocusInteractAt = 0;
    if (state.heldKeys.size > 0) releaseAllMoveKeys();
  });
  window.addEventListener('keydown', (e) => {
    if (!e.isTrusted) return;
    if (/^(KeyW|KeyA|KeyS|KeyD|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/.test(e.code)) {
      if (
        CONFIG.selectionActionMode === 'hybrid_bridge' &&
        (state.heldKeys.has(e.code) || Date.now() < (state.bridgeExpectedKeyUntil[e.code] || 0))
      ) {
        return;
      }
      state.humanOverrideUntil = Date.now() + 1500;
      if (state.isBurstMoving) releaseAllMoveKeys();
    }
  }, true);

  // === 4. DOM 卡片偵測與點擊執行器 ===
  const CARD_NOISE_RE = /^(普通|優良|稀有|史詩|傳說|神話|技能|新！|new!?|重抽|專注|放逐|\d+)$/i;

  function isVisible(el, minSize = 20) {
    if (!el || !document.body.contains(el)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < minSize || r.height < minSize) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0.1;
  }

  function isInVillageLobby() {
    const placeEl = document.querySelector('#lobby-place');
    if (placeEl && !isOwnHudNode(placeEl) && placeEl.offsetParent !== null && isVisible(placeEl, 2)) {
      return true;
    }
    const lobbyUi = document.querySelector('#lobby-ui:not(.hidden)');
    if (lobbyUi && !isOwnHudNode(lobbyUi) && isVisible(lobbyUi, 8)) return true;
    const timerEl = document.querySelector('#timer');
    if (timerEl && isVisible(timerEl, 6)) return false;
    return Array.from(document.querySelectorAll('.lobby-name.npc, #stages:not(.hidden) .stg-card, #stages:not(.hidden) #stg-go')).some(
      (el) => !isOwnHudNode(el) && isVisible(el, 8)
    );
  }

  function isInCombat() {
    if (isInVillageLobby()) return false;
    const timerEl = document.querySelector('#timer');
    return Boolean(timerEl && isVisible(timerEl, 6));
  }

  function isDomElementHiddenClone(el) {
    if (!el || !el.isConnected) return true;
    if (el.getAttribute('aria-hidden') === 'true' || el.closest('[aria-hidden="true"]')) return true;
    if (el.getAttribute('tabindex') === '-1') return true;
    try {
      const slot = el.closest('.pk-slot') || el;
      const st = window.getComputedStyle(slot);
      if (st.pointerEvents === 'none') return true;
      if (st.clipPath && /inset\(\s*50%/i.test(st.clipPath)) return true;
    } catch (_) {}
    return false;
  }

  function isCardSized(el) {
    if (!isVisible(el) || isOwnHudNode(el) || isDomElementHiddenClone(el)) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 95 && r.height >= 120 && r.width <= window.innerWidth * 0.65;
  }

  function collectCleanCardLines(cardEl) {
    const lines = [];
    let currentLine = '';
    const flush = () => {
      const cleaned = currentLine.replace(/\s+/g, ' ').trim();
      if (cleaned && !CARD_NOISE_RE.test(cleaned)) lines.push(cleaned);
      currentLine = '';
    };
    const BLOCK_TAGS = new Set(['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'BR']);
    function walk(node) {
      if (!node) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const parts = (node.nodeValue || '').split('\n');
        parts.forEach((p, i) => {
          currentLine += p;
          if (i < parts.length - 1) flush();
        });
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const tag = node.tagName;
      if (tag === 'SVG' || tag === 'SCRIPT' || tag === 'STYLE') return;
      if (node !== cardEl && (tag === 'BUTTON' || node.getAttribute('role') === 'button')) {
        const btnTxt = (node.textContent || '').replace(/\s+/g, '').trim();
        const isSmallAct =
          node.classList?.contains('pk-act') ||
          Boolean(node.closest('.pk-acts, .pk-actions')) ||
          /^(?:放逐|重抽|專注|banish|reroll|focus)\d*$/i.test(btnTxt);
        if (isSmallAct) return;
      }
      const st = window.getComputedStyle(node);
      if (st.display === 'none' || st.visibility === 'hidden') return;
      const isBlock = BLOCK_TAGS.has(tag) || st.display === 'block' || st.display === 'flex' || st.display === 'grid';
      if (isBlock) flush();
      for (const ch of node.childNodes) walk(ch);
      if (isBlock) flush();
    }
    walk(cardEl);
    flush();
    if (!lines.length) {
      String(cardEl.innerText || '')
        .split(/\r?\n/)
        .map((s) => s.replace(/\s+/g, ' ').trim())
        .filter((s) => s && !CARD_NOISE_RE.test(s) && !/^(?:放逐|重抽|專注|banish|reroll|focus)\s*\d*$/i.test(s))
        .forEach((s) => lines.push(s));
    }
    return lines;
  }

  function getPickerMaxChoices() {
    try {
      const picker = document.querySelector('#picker:not(.hidden)');
      const pkCards = picker?.querySelector('#pk-cards');
      const cssN = Number(pkCards?.style?.getPropertyValue('--n') || '');
      if (cssN >= 2 && cssN <= 4) return cssN;
      const pkTitle = (picker?.querySelector('#pk-title')?.textContent || '').trim();
      if (/選擇你的神[祇祉]/.test(pkTitle)) return 4;
      const hintText = (picker?.innerText || '').slice(-220);
      const m = hintText.match(/[（(]\s*1\s*[-–—~～]\s*(\d)\s*[）)]/);
      if (m) {
        const n = Number(m[1]);
        if (n >= 2 && n <= 4) return n;
      }
    } catch (_) {}
    return 3;
  }

  function normalizeCardElements(rawEls, maxChoices = getPickerMaxChoices()) {
    const sized = Array.from(rawEls || []).filter(isCardSized);
    if (!sized.length) return [];
    // 排除被其他候選卡片包住的巢狀子元素，避免重複計數導致出現第 4 張幽靈卡
    const topOnly = sized.filter((el) => !sized.some((other) => other !== el && other.contains(el)));
    const parsedNums = topOnly
      .map((el) => {
        const attr = el.getAttribute('data-i');
        return attr !== null && attr !== '' && !Number.isNaN(Number(attr)) ? Number(attr) : null;
      })
      .filter((n) => n !== null);
    const isOneBased = parsedNums.length > 0 && Math.min(...parsedNums) === 1 && Math.max(...parsedNums) <= maxChoices;
    topOnly.sort((a, b) => {
      const ai = a.getAttribute('data-i');
      const bi = b.getAttribute('data-i');
      const an = ai !== null && ai !== '' && !Number.isNaN(Number(ai)) ? Number(ai) : 999;
      const bn = bi !== null && bi !== '' && !Number.isNaN(Number(bi)) ? Number(bi) : 999;
      if (an !== bn) return an - bn;
      return a.getBoundingClientRect().left - b.getBoundingClientRect().left;
    });
    const dedup = [];
    const seenDataI = new Set();
    for (const el of topOnly) {
      const attr = el.getAttribute('data-i');
      if (attr !== null && attr !== '' && !Number.isNaN(Number(attr))) {
        const num = Number(attr);
        const normalizedIdx = isOneBased ? num - 1 : num;
        if (normalizedIdx < 0 || normalizedIdx >= maxChoices) continue;
        if (seenDataI.has(normalizedIdx)) continue;
        seenDataI.add(normalizedIdx);
      }
      dedup.push(el);
      if (dedup.length >= maxChoices) break;
    }
    return dedup;
  }

  function findDomCardElements() {
    const maxChoices = getPickerMaxChoices();
    const { containerSelector, cardSelector } = CONFIG.domSelectors;
    if (cardSelector) {
      if (containerSelector) {
        const scope = document.querySelector(containerSelector);
        if (scope) {
          const matched = normalizeCardElements(scope.querySelectorAll(cardSelector), maxChoices);
          if (matched.length >= 2) return matched;
        }
      }
      const globalMatched = normalizeCardElements(document.querySelectorAll(cardSelector), maxChoices);
      if (globalMatched.length >= 2) return globalMatched;
    }
    // 優先使用遊戲正式選擇器 #picker:not(.hidden) #pk-cards .pk-card[data-i]；#picker 隱藏時直接跳出，免除戰鬥中全頁備援掃描
    const pickerHidden = document.querySelector('#picker.hidden');
    if (pickerHidden) return [];
    const picker = document.querySelector('#picker:not(.hidden)');
    const pickerScope = picker ? (picker.querySelector('#pk-cards') || picker) : null;
    if (pickerScope && isVisible(pickerScope, 40)) {
      const strictCards = normalizeCardElements(pickerScope.querySelectorAll('.pk-card[data-i]'), maxChoices);
      if (strictCards.length >= 2) return strictCards;
      const exactCards = normalizeCardElements(pickerScope.querySelectorAll('.pk-card'), maxChoices);
      if (exactCards.length >= 2) return exactCards;
    }
    const pkStrict = normalizeCardElements(document.querySelectorAll('.pk-card[data-i]'), maxChoices);
    if (pkStrict.length >= 2) return pkStrict;
    const pkCards = normalizeCardElements(document.querySelectorAll('.pk-card'), maxChoices);
    if (pkCards.length >= 2) return pkCards;
    const autoSelectors = ['div.pk-slot', '.pk-slot', '[class*="pk-slot"]', '[class*="choice-card"]', '[class*="skill-card"]'];
    for (const sel of autoSelectors) {
      const matched = normalizeCardElements(document.querySelectorAll(sel), maxChoices);
      if (matched.length >= 2) return matched;
    }
    return [];
  }

  function extractDomCards() {
    const maxChoices = getPickerMaxChoices();
    const els = findDomCardElements();
    if (els.length < 2) return null;
    const { titleSelector, descSelector } = CONFIG.domSelectors;
    const parsedDataIndices = els
      .map((el) => {
        const a = el.getAttribute('data-i');
        return a !== null && a !== '' && !Number.isNaN(Number(a)) ? Number(a) : null;
      })
      .filter((n) => n !== null);
    const isOneBased = parsedDataIndices.length > 0 && Math.min(...parsedDataIndices) === 1 && Math.max(...parsedDataIndices) <= maxChoices;
    return els.map((el, index) => {
      const dataIndexAttr = el.getAttribute('data-i');
      const rawDataIndex = dataIndexAttr !== null && dataIndexAttr !== '' && !Number.isNaN(Number(dataIndexAttr)) ? Number(dataIndexAttr) : index;
      const normalizedDataIndex = isOneBased ? rawDataIndex - 1 : rawDataIndex;
      const dataIndex = rawDataIndex;
      let explicitKey = null;
      const keyBadgeEl = el.querySelector('.pk-key, .pk-num, [class*="hotkey"], [class*="keycap"]');
      if (keyBadgeEl && !keyBadgeEl.closest('.pk-act, .pk-acts, .pk-actions')) {
        const km = (keyBadgeEl.textContent || '').trim().match(/^([1-4])$/);
        if (km) {
          const kn = Number(km[1]);
          if (kn >= 1 && kn <= maxChoices) explicitKey = kn;
        }
      }
      const hotkey = explicitKey || Math.max(1, Math.min(maxChoices, (normalizedDataIndex >= 0 && normalizedDataIndex < maxChoices ? normalizedDataIndex : index) + 1));
      const badgeText = (el.querySelector('.pk-badge')?.textContent || '').trim();
      const subText = (el.querySelector('.pk-sub')?.textContent || '').replace(/\s+/g, ' ').trim();
      const hasNewRibbon = Boolean(el.querySelector('.pk-ribbon'));
      const lines = collectCleanCardLines(el);
      const titleCandidates = titleSelector
        ? Array.from(el.querySelectorAll(titleSelector))
        : Array.from(el.querySelectorAll('.pk-name b, .pk-name, h1, h2, h3, h4, .title, [class*="title"], [class*="name"], strong, b'));
      let rawTitle = '';
      for (const cand of titleCandidates) {
        if (cand.closest('.pk-act, .pk-acts, .pk-actions')) continue;
        const btnAnc = cand.closest('button,[role="button"]');
        if (btnAnc && btnAnc !== el && !btnAnc.contains(el)) {
          const btnTxt = (btnAnc.textContent || '').replace(/\s+/g, '').trim();
          if (btnAnc.classList?.contains('pk-act') || /^(?:放逐|重抽|專注|banish|reroll|focus)\d*$/i.test(btnTxt)) continue;
        }
        const cleaned = (cand.textContent || '')
          .replace(/^(?:新\s*[！!]|NEW\b)\s*/i, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (cleaned && !CARD_NOISE_RE.test(cleaned) && !/^\+?\d+(?:\.\d+)?%?$/.test(cleaned)) {
          rawTitle = cleaned;
          break;
        }
      }
      const fallbackLine =
        lines.find((l) => l !== badgeText && l !== subText && !/^(?:Lv\.?\s*\d+|\+?\d+)/i.test(l)) ||
        lines[0] ||
        '';
      const title = rawTitle || fallbackLine || `卡片 ${index + 1}`;
      const descEl = descSelector ? el.querySelector(descSelector) : el.querySelector('.pk-desc, p, .desc, [class*="desc"]');
      const rawDesc =
        descEl && !descEl.closest('.pk-act, .pk-acts, .pk-actions')
          ? (descEl.textContent || '').replace(/\s+/g, ' ').trim()
          : '';
      const pkLines = Array.from(el.querySelectorAll('.pk-lines li'))
        .map((li) => (li.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      const imgSrc = el.querySelector('img')?.getAttribute('src') || el.querySelector('img')?.src || '';
      const itemKey = imgSrc ? (imgSrc.split('/').pop()?.split('?')[0]?.replace(/\.png$/i, '') || '') : '';
      // 乾淨地合併所有效果詞條（同時保留 .pk-lines 與 .pk-desc，並過濾快捷鍵數字、Lv N、標題與底部按鈕文字）
      const cleanRest = lines.filter(
        (l) =>
          l !== title &&
          l !== badgeText &&
          l !== subText &&
          !/^Lv\.?\s*\d+$/i.test(l) &&
          !/^(?:放逐|重抽|專注|banish|reroll|focus)\s*\d*$/i.test(l)
      );
      const effectParts = [];
      const seenEffect = new Set();
      const pushEffect = (txt) => {
        const clean = String(txt || '').replace(/\s+/g, ' ').trim();
        if (!clean || clean === title || clean === badgeText || clean === subText) return;
        if (/^Lv\.?\s*\d+$/i.test(clean) || CARD_NOISE_RE.test(clean)) return;
        const norm = clean.replace(/\s+/g, '').toLowerCase();
        if (seenEffect.has(norm)) return;
        if (effectParts.some((p) => p.replace(/\s+/g, '').toLowerCase().includes(norm))) return;
        seenEffect.add(norm);
        effectParts.push(clean);
      };
      pkLines.forEach(pushEffect);
      if (rawDesc) pushEffect(rawDesc);
      cleanRest.forEach(pushEffect);
      const effectText = effectParts.join(' · ');
      const description = effectText || lines.filter((l) => l !== title).join(' · ') || lines.join(' · ');
      return { index, dataIndex, hotkey, badgeText, subText, hasNewRibbon, itemKey, title, description, effectText, element: el };
    });
  }

  function extractModalContext(cardEls, cards = []) {
    try {
      const pickerEl = document.querySelector('#picker:not(.hidden)');
      const pkTitle = pickerEl?.querySelector('#pk-title')?.textContent?.trim() || '';
      const pkSub = pickerEl?.querySelector('#pk-sub')?.textContent?.trim() || '';
      const luSocketsText = pickerEl?.querySelector('#lu-sockets')?.innerText?.trim() || '';
      let fullText = [pkTitle, pkSub, luSocketsText].filter(Boolean).join('\n');
      if (!fullText) {
        let curr = cardEls?.[0];
        for (let i = 0; i < 7 && curr && curr !== document.body; i++) {
          const txt = (curr.innerText || '').trim();
          if (/技能\s*\d+\s*\/\s*\d+|道具\s*\d+\s*\/\s*\d+|寶箱|升級|強化技能|選擇一件裝備|欄位已滿/.test(txt)) {
            fullText = txt;
            if (/技能\s*\d+\s*\/\s*\d+|道具\s*\d+\s*\/\s*\d+/.test(txt)) break;
          }
          curr = curr.parentElement;
        }
      }
      if (!fullText) {
        fullText = Array.from(document.body.children)
          .filter((el) => !isOwnHudNode(el))
          .map((el) => el.innerText || '')
          .join('\n')
          .slice(0, 1200);
      }
      const isSkillDeityPick =
        /選擇你的神[祇祉]|只有一個[：:]\s*每\s*10\s*級升一級/.test(pkTitle + '\n' + pkSub) ||
        (Array.isArray(cards) && cards.length >= 2 && cards.every((c) => /神[祇祉]|Deity/i.test([c.subText, c.badgeText].filter(Boolean).join(' ')) && !isArtifactCard(c)));
      const hasChestSub = Array.isArray(cards) && cards.some((c) => {
        const probe = [c.subText, c.badgeText, c.title].filter(Boolean).join(' ');
        return (
          /神器|祝福|藥水|料理|藥劑|秘藥|Artifact/i.test(probe) ||
          Boolean(c.itemKey && ARTIFACTS_BY_KEY[c.itemKey]) ||
          Boolean(canonicalArtifactName(c.title))
        );
      });
      const isChest = !isSkillDeityPick && (hasChestSub || /寶箱|選擇一件裝備|道具\s*\d+\s*\/\s*\d+/.test(fullText));
      const modalType = isSkillDeityPick ? '技能神祇' : isChest ? '寶箱道具' : '升級技能';
      const m = fullText.match(/技能\s*(\d+)\s*\/\s*(\d+)/);
      const used = m ? Number(m[1]) : null;
      const max = m ? Number(m[2]) : null;
      // 輔助讀取 #lu-sockets .skill-slot:not(.empty) 或 #skillbar .skill-slot 已裝備的欄位數量
      const luFilledSlots = pickerEl ? Array.from(pickerEl.querySelectorAll('#lu-sockets .skill-slot:not(.empty)')) : [];
      const luHasEmptySlot = pickerEl ? Boolean(pickerEl.querySelector('#lu-sockets .skill-slot.empty')) : false;
      const barSkillSlots = Array.from(document.querySelectorAll('#skillbar .skill-slot'));
      const totalSlots = Math.max(5, barSkillSlots.length || 5);
      const equippedSlots = barSkillSlots.filter((slot) => {
        if (slot.classList.contains('empty')) return false;
        const lvl = slot.querySelector('.lvl');
        return lvl && (lvl.textContent || '').trim() !== '';
      });
      // 若標題有明確顯示「技能 X/Y」或 #lu-sockets 有 .empty 空位，以該明確數字/空位為準，避免 3/4 誤判為已滿
      const isSkillSlotsFull =
        used !== null && max !== null
          ? used >= max
          : luHasEmptySlot
          ? false
          : /欄位已滿/.test(fullText) || luFilledSlots.length >= totalSlots || equippedSlots.length >= totalSlots;
      return { modalType, isSkillSlotsFull };
    } catch (_) {
      return { modalType: '升級技能', isSkillSlotsFull: false };
    }
  }
  // 橋接金鑰：與 ro_bridge_win.ps1 產生的 ro_bridge_token.txt 內容相同
  function getBridgeToken() {
    return String(getExtra().bridgeToken || '').trim();
  }
  function bridgeHeaders(base = {}) {
    const t = getBridgeToken();
    return t ? { ...base, 'X-RO-Token': t } : { ...base };
  }

  function getBridgeUrl() {
    const raw = String(getExtra().bridgeUrl || 'http://127.0.0.1:17325').trim();
    return raw.replace(/\/+$/, '') || 'http://127.0.0.1:17325';
  }

  function updateBridgeHud() {
    const statusEl = $id('rh-bridge-status');
    const modeSel = $id('rh-action-mode');
    if (modeSel && modeSel.value !== CONFIG.selectionActionMode) {
      modeSel.value = CONFIG.selectionActionMode;
    }
    if (!statusEl) return;
    if (state.bridgeOnline) {
      statusEl.style.color = '#86EFAC';
      statusEl.textContent = `橋接已連線：${state.bridgeModeName || '本機真實輸入'} (${getBridgeUrl()})`;
    } else {
      statusEl.style.color = CONFIG.selectionActionMode === 'hybrid_bridge' ? '#FCA5A5' : '#94A3B8';
      statusEl.textContent = state.bridgeError
        ? `橋接未連線：${state.bridgeError}`
        : `橋接尚未連線（請先在本機啟動橋接程式，預設 ${getBridgeUrl()}）`;
    }
  }

  function checkBridgeHealth(silent = false) {
    return new Promise((resolve) => {
      if (typeof GM_xmlhttpRequest !== 'function') {
        state.bridgeOnline = false;
        state.bridgeError = 'Tampermonkey 缺少 GM_xmlhttpRequest 權限';
        updateBridgeHud();
        updateStatusBar();
        resolve(false);
        return;
      }
      const url = getBridgeUrl() + '/ping';
      try {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          headers: bridgeHeaders(),
          timeout: 1200,
          onload: (res) => {
            try {
              const data = JSON.parse(res.responseText || '{}');
              if (res.status >= 200 && res.status < 300 && data && data.ok) {
                if (data.mode === 'chrome_cdp') {
                  state.bridgeOnline = false;
                  state.bridgeModeName = '';
                  state.bridgeError = '已嚴禁 Chrome CDP 模式，請改用 Windows 實體鍵鼠橋接';
                  updateBridgeHud();
                  updateStatusBar();
                  if (!silent) addLog('[混合橋接拒絕] 已嚴禁 Chrome CDP 模式，請關閉 CDP 並改啟動 ro_bridge_win.ps1');
                  resolve(false);
                  return;
                }
                state.bridgeOnline = true;
                state.bridgeModeName = data.mode || 'local_bridge';
                if (data.winRect) state.bridgeWinRect = data.winRect;
                state.bridgeError = '';
                state.bridgeLastCheckAt = Date.now();
                updateBridgeHud();
                updateStatusBar();
                if (!silent) addLog(`[混合橋接] 連線成功：${state.bridgeModeName} (${getBridgeUrl()})`);
                resolve(true);
                return;
              }
            } catch (_) {}
            state.bridgeOnline = false;
            state.bridgeError = res.status === 401
              ? (getBridgeToken() ? '金鑰錯誤（請重新貼上 ro_bridge_token.txt 的內容）' : '尚未設定橋接金鑰（請貼上 ro_bridge_token.txt 的內容）')
              : `HTTP ${res.status || 0}`;
            updateBridgeHud();
            updateStatusBar();
            if (!silent) addLog(`[混合橋接] 回應異常：${state.bridgeError}`);
            resolve(false);
          },
          onerror: () => {
            state.bridgeOnline = false;
            state.bridgeError = '無法連線本機服務';
            updateBridgeHud();
            updateStatusBar();
            if (!silent) addLog(`[混合橋接] 無法連線 ${getBridgeUrl()}，請確認本機橋接程式已啟動`);
            resolve(false);
          },
          ontimeout: () => {
            state.bridgeOnline = false;
            state.bridgeError = '連線逾時';
            updateBridgeHud();
            updateStatusBar();
            if (!silent) addLog('[混合橋接] 連線逾時');
            resolve(false);
          },
        });
      } catch (err) {
        state.bridgeOnline = false;
        state.bridgeError = err?.message || '呼叫失敗';
        updateBridgeHud();
        updateStatusBar();
        resolve(false);
      }
    });
  }

  function isPageEffectivelyFocused() {
    if (document.hidden) return false;
    const rawHasFocus = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
    if (rawHasFocus) return true;
    return Boolean(state.lastTrustedFocusInteractAt > 0 && Date.now() - state.lastTrustedFocusInteractAt < 60000);
  }

  function sendBridgeAction(payload) {
    return new Promise((resolve) => {
      if (typeof GM_xmlhttpRequest !== 'function') {
        state.bridgeOnline = false;
        state.bridgeError = '缺少 GM_xmlhttpRequest 權限';
        updateBridgeHud();
        updateStatusBar();
        resolve({ ok: false, reason: 'no_gm_xhr' });
        return;
      }
      const ex = getExtra();
      const body = JSON.stringify({
        ...payload,
        requireFocus: ex.bridgeRequireFocus !== false,
        pageTitle: document.title || '',
        pageVisible: !document.hidden,
        pageFocused: isPageEffectivelyFocused(),
      });
      state.bridgePending = true;
      try {
        GM_xmlhttpRequest({
          method: 'POST',
          url: getBridgeUrl() + '/action',
          headers: bridgeHeaders({ 'Content-Type': 'application/json' }),
          data: body,
          timeout: payload?.type === 'wheel'
            ? Math.max(2600, (Number(payload.steps) || 1) * (Number(payload.intervalMs) || 55) + 1500)
            : 1800,
          onload: (res) => {
            state.bridgePending = false;
            try {
              const data = JSON.parse(res.responseText || '{}');
              if (data && data.mode === 'chrome_cdp') {
                state.bridgeOnline = false;
                state.bridgeModeName = '';
                state.bridgeError = '已嚴禁 Chrome CDP 模式';
                updateBridgeHud();
                updateStatusBar();
                addLog('[混合橋接拒絕] 已嚴禁 Chrome CDP 模式，請改用 Windows 實體鍵鼠橋接 (ro_bridge_win.ps1)');
                resolve({ ok: false, reason: 'cdp_forbidden' });
                return;
              }
              if (res.status >= 200 && res.status < 300 && data && data.ok) {
                state.bridgeOnline = true;
                state.bridgeModeName = data.mode || state.bridgeModeName || 'local_bridge';
                if (data.winRect) state.bridgeWinRect = data.winRect;
                state.bridgeError = '';
                state.bridgeLastCheckAt = Date.now();
                state.lastFocusSkipLogAt = 0;
                updateBridgeHud();
                updateStatusBar();
                resolve(data);
                return;
              }
              const reason = data?.reason || `HTTP ${res.status || 0}`;
              if (reason === 'browser_not_focused') {
                resetStuckKeyWatchdog();
                const nowMs = Date.now();
                state.lastBridgeFocusSkipAt = nowMs;
                if (!state.lastFocusSkipLogAt || nowMs - state.lastFocusSkipLogAt >= 20000) {
                  state.lastFocusSkipLogAt = nowMs;
                  const diag = data?.fgProc
                    ? `（前景程式：${data.fgProc}，網頁焦點：${data.pageFocused ? '是' : '否'}，分頁可見：${data.pageVisible ? '是' : '否'}）`
                    : '';
                  addLog(`[混合橋接] 瀏覽器目前非前景視窗，已安全略過輸入${diag}（防卡死重整已暫停計數）`);
                }
              } else if (reason === 'unauthorized') {
                state.bridgeOnline = false;
                state.bridgeError = '橋接金鑰錯誤或未設定';
                updateBridgeHud();
                addLog('[混合橋接] 金鑰驗證失敗，請在面板「橋接金鑰」貼上 ro_bridge_token.txt 的內容');
              } else if (
                !(payload?.type === 'wheel' && reason === 'unknown_action') &&
                !(payload?.type === 'key' && String(payload?.key || '').toLowerCase() === 'c' && reason === 'unsupported_key')
              ) {
                addLog(`[混合橋接拒絕] ${reason}`);
              }
              resolve({ ok: false, reason });
            } catch (_) {
              resolve({ ok: false, reason: 'bad_json' });
            }
          },
          onerror: () => {
            state.bridgePending = false;
            state.bridgeOnline = false;
            state.bridgeError = '無法連線本機服務';
            updateBridgeHud();
            updateStatusBar();
            addLog(`[混合橋接未連線] 無法送出真實輸入 (${payload.type || 'action'})，為避免假事件被偵測已略過`);
            resolve({ ok: false, reason: 'offline' });
          },
          ontimeout: () => {
            state.bridgePending = false;
            state.bridgeOnline = false;
            state.bridgeError = '請求逾時';
            updateBridgeHud();
            updateStatusBar();
            addLog('[混合橋接逾時] 本機服務未回應，已安全略過');
            resolve({ ok: false, reason: 'timeout' });
          },
        });
      } catch (err) {
        state.bridgePending = false;
        resolve({ ok: false, reason: err?.message || 'error' });
      }
    });
  }

  function getValidViewportCalib() {
    const cal = state.bridgeVpCalib;
    if (!cal) return null;
    const sx = typeof window.screenX === 'number' ? window.screenX : (window.screenLeft || 0);
    const sy = typeof window.screenY === 'number' ? window.screenY : (window.screenTop || 0);
    if (
      Math.abs(cal.screenX - sx) > 2 ||
      Math.abs(cal.screenY - sy) > 2 ||
      Math.abs(cal.innerW - window.innerWidth) > 2 ||
      Math.abs(cal.innerH - window.innerHeight) > 2
    ) {
      return null;
    }
    return cal;
  }

  function computeBridgeCoords(clientX, clientY) {
    const cal = getValidViewportCalib();
    if (cal) {
      return {
        clientX: Math.round(clientX),
        clientY: Math.round(clientY),
        screenX: Math.round(cal.vpPhysX + clientX * cal.scaleX),
        screenY: Math.round(cal.vpPhysY + clientY * cal.scaleY),
        dpr: cal.scaleX,
      };
    }
    const dpr = Number(window.devicePixelRatio) || 1;
    const border = Math.max(0, (window.outerWidth - window.innerWidth) / 2);
    const sx = typeof window.screenX === 'number' ? window.screenX : (window.screenLeft || 0);
    const sy = typeof window.screenY === 'number' ? window.screenY : (window.screenTop || 0);
    const vpLeft = sx + border;
    const vpTop = sy + window.outerHeight - window.innerHeight - border;
    const off = state.bridgeCalibOffset || { dx: 0, dy: 0 };
    return {
      clientX: Math.round(clientX),
      clientY: Math.round(clientY),
      screenX: Math.round((vpLeft + clientX) * dpr + (off.dx || 0)),
      screenY: Math.round((vpTop + clientY) * dpr + (off.dy || 0)),
      dpr,
    };
  }

  async function calibrateBridgeViewport(quiet = false) {
    if (!state.bridgeWinRect) {
      await checkBridgeHealth(true);
    }
    const wr = state.bridgeWinRect;
    const dpr = Number(window.devicePixelRatio) || 1;
    const sxWin = typeof window.screenX === 'number' ? window.screenX : (window.screenLeft || 0);
    const syWin = typeof window.screenY === 'number' ? window.screenY : (window.screenTop || 0);
    const baseLeft = wr ? wr.left : Math.round(sxWin * dpr);
    const baseTop = wr ? wr.top : Math.round(syWin * dpr);
    const baseW = wr ? Math.max(300, wr.right - wr.left) : Math.round(window.outerWidth * dpr);
    const baseH = wr ? Math.max(240, wr.bottom - wr.top) : Math.round(window.outerHeight * dpr);
    const probes = [
      { x: Math.round(baseLeft + baseW * 0.46), y: Math.round(baseTop + Math.max(150, baseH * 0.52)) },
      { x: Math.round(baseLeft + baseW * 0.5), y: Math.round(baseTop + Math.max(120, baseH * 0.4)) },
      { x: Math.round(baseLeft + baseW * 0.35), y: Math.round(baseTop + Math.max(180, baseH * 0.62)) },
    ];
    let p1 = null;
    let m1 = null;
    for (const p of probes) {
      const beforeAt = state.lastTrustedMouse?.at || 0;
      const r1 = await sendBridgeAction({ type: 'move', screenX: p.x, screenY: p.y, label: '校準採樣1' });
      if (!r1 || !r1.ok) continue;
      await new Promise((res) => setTimeout(res, 95));
      const cur = state.lastTrustedMouse;
      if (cur && cur.at > beforeAt && cur.clientX >= 0) {
        p1 = p;
        m1 = { ...cur };
        break;
      }
    }
    if (!p1 || !m1) {
      if (!quiet) addLog('[點擊校準] 無法在瀏覽器內測得游標回應（請確認遊戲視窗在最前景，並更新 ro_bridge_win.ps1）');
      return false;
    }
    const stepX = m1.clientX > window.innerWidth * 0.7 ? -110 : 110;
    const stepY = m1.clientY > window.innerHeight * 0.7 ? -75 : 75;
    const p2 = { x: p1.x + stepX, y: p1.y + stepY };
    const beforeAt2 = state.lastTrustedMouse?.at || 0;
    const r2 = await sendBridgeAction({ type: 'move', screenX: p2.x, screenY: p2.y, label: '校準採樣2' });
    await new Promise((res) => setTimeout(res, 95));
    const m2 = state.lastTrustedMouse;
    if (!r2 || !r2.ok || !m2 || m2.at <= beforeAt2 || Math.abs(m2.clientX - m1.clientX) < 15 || Math.abs(m2.clientY - m1.clientY) < 15) {
      // 單點備援校準：用 dpr 推算 viewport 原點
      state.bridgeVpCalib = {
        vpPhysX: p1.x - m1.clientX * dpr,
        vpPhysY: p1.y - m1.clientY * dpr,
        scaleX: dpr,
        scaleY: dpr,
        screenX: sxWin,
        screenY: syWin,
        innerW: window.innerWidth,
        innerH: window.innerHeight,
        at: Date.now(),
      };
      if (!quiet) addLog(`[點擊校準] 已完成單點視窗校準 (縮放≈${dpr.toFixed(2)})`);
      return true;
    }
    const scaleX = Math.max(0.4, Math.min(4.0, (p2.x - p1.x) / (m2.clientX - m1.clientX)));
    const scaleY = Math.max(0.4, Math.min(4.0, (p2.y - p1.y) / (m2.clientY - m1.clientY)));
    state.bridgeVpCalib = {
      vpPhysX: p2.x - m2.clientX * scaleX,
      vpPhysY: p2.y - m2.clientY * scaleY,
      scaleX,
      scaleY,
      screenX: sxWin,
      screenY: syWin,
      innerW: window.innerWidth,
      innerH: window.innerHeight,
      at: Date.now(),
    };
    state.bridgeCalibOffset = { dx: 0, dy: 0 };
    if (!quiet) {
      addLog(`[點擊校準] 已精準校正視窗座標 (縮放 X=${scaleX.toFixed(2)}, Y=${scaleY.toFixed(2)})`);
    }
    return true;
  }

  function blurHudFocus() {
    try {
      hudRoot?.activeElement?.blur?.();
      const active = document.activeElement;
      if (active && isOwnHudNode(active)) active.blur?.();
    } catch (_) {}
  }

  function resetStuckKeyWatchdog() {
    state.keyWatchdog = { key: '', progressSig: '', count: 0, firstAt: 0, lastAt: 0, escTried: false };
  }

  function recordStuckKeyWatchdog(keyStr, type) {
    try {
      if (type !== 'key') return;
      if (!state.farmEnabled || state.paused || state.farmRestUntil || state.farmReloadPending) {
        resetStuckKeyWatchdog();
        return;
      }
      const ex = getExtra();
      const needForeground = ex.bridgeRequireFocus !== false;
      if (document.hidden || (needForeground && !isPageEffectivelyFocused())) {
        resetStuckKeyWatchdog();
        return;
      }
      const normKey = keyStr === ' ' || keyStr === 'Space' ? 'Space' : String(keyStr || '');
      if (!normKey || normKey === 'Escape') return;
      const now = Date.now();
      const coord = readMinimapCoord();
      const clockSec = readGameClockSec();
      const winCnt = document.querySelectorAll('.ro-window:not(.hidden)').length;
      const pickerOn = document.querySelector('#picker:not(.hidden)') ? 1 : 0;
      const progressSig = `${isInCombat() ? 'C' : 'L'}|${coord ? `${coord.x},${coord.y}` : '-'}|${clockSec ?? '-'}|${winCnt}|${pickerOn}`;
      const w = state.keyWatchdog || { key: '', progressSig: '', count: 0, firstAt: 0, lastAt: 0, escTried: false };
      if (w.key === normKey && w.progressSig === progressSig && now - (w.lastAt || 0) < 35000) {
        w.count += 1;
        w.lastAt = now;
      } else {
        w.key = normKey;
        w.progressSig = progressSig;
        w.count = 1;
        w.firstAt = now;
        w.lastAt = now;
        w.escTried = false;
      }
      state.keyWatchdog = w;
      const elapsed = now - (w.firstAt || now);
      if (!w.escTried && (w.count >= 12 || (w.count >= 8 && elapsed >= 45000))) {
        w.escTried = true;
        state.setHudMinimized?.(true);
        state.npcWalkAttempts = 0;
        state.npcClickRetryPhase = 0;
        state.lastDomSignature = '';
        addLog(`[防卡死偵測] 連續發送無效按鍵【${normKey}】達 ${w.count} 次且畫面無進展，先送出 ESC 並縮小面板嘗試脫困`);
        performEscapeKey();
        return;
      }
      if (w.count >= 22 && elapsed >= 120000) {
        const recentReloads = (GM_getValue('skillpick_watchdog_reloads', []) || []).filter((ts) => now - ts < 15 * 60 * 1000);
        if (recentReloads.length >= 3) {
          addLog(`[防卡死保護] 15 分鐘內已自動重整達 3 次仍無進展，為避免無限重整已改為暫停`);
          resetStuckKeyWatchdog();
          pauseScript('連續卡死重整達上限');
          return;
        }
        recentReloads.push(now);
        GM_setValue('skillpick_watchdog_reloads', recentReloads);
        GM_setValue('skillpick_farm_watchdog_resume', {
          ts: now,
          key: normKey,
          count: w.count,
          elapsedSec: Math.round(elapsed / 1000),
          runsDone: state.farmRunsDone,
          sessionRunsDone: state.farmSessionRunsDone,
          sessionTargetRuns: state.farmSessionTargetRuns,
          resumeAutoPick: state.autoEnabled,
          resumeMove: CONFIG.autoMoveConfig.mode === 'radius_wander',
        });
        state.farmReloadPending = true;
        releaseAllMoveKeys();
        stopNpcWalk();
        resetStuckKeyWatchdog();
        addLog(`[防卡死重整] 連續發送無效按鍵【${normKey}】達 ${w.count} 次（${Math.round(elapsed / 1000)} 秒）且畫面無變化，即將重新整理網頁並自動恢復刷圖！`);
        setTimeout(() => window.location.reload(), 1200);
      }
    } catch (_) {}
  }

  function sendBridgeKey(key, holdMs = 45, type = 'key') {
    blurHudFocus();
    const ex = getExtra();
    if (ex.bridgeRequireFocus !== false && !isPageEffectivelyFocused()) {
      // 交給 Windows 實體鍵鼠橋接二次確認視窗前景與標題
    }
    const keyStr = String(key);
    sendBridgeAction({ type, key: keyStr, holdMs: Math.max(0, Math.round(holdMs || 0)) }).then((res) => {
      if (res && res.ok) {
        recordStuckKeyWatchdog(keyStr, type);
        return;
      }
      if (res?.reason === 'browser_not_focused' || res?.reason === 'offline' || res?.reason === 'timeout') {
        resetStuckKeyWatchdog();
      }
      if (type === 'key') {
        state.lastDomSignature = '';
        state.pickingLockUntil = Date.now() + 900;
      }
    });
    return true;
  }

  function isHoverHitOnTarget(targetEl, cx, cy, opts = {}) {
    if (opts && opts.skipHoverCheck) return true;
    if (!targetEl || !targetEl.isConnected) return false;
    const hit = document.elementFromPoint(cx, cy);
    if (!hit || isOwnHudNode(hit)) return false;
    if (targetEl === hit || targetEl.contains(hit)) return true;
    // 若目標為卡片內的動作鈕 (.pk-act)，禁止命中父層卡片而誤觸選卡
    if (targetEl.classList?.contains('pk-act') || targetEl.closest('.pk-act')) return false;
    // 主城 NPC 名牌 (.lobby-name.npc) 通常設 pointer-events: none 疊在 #stage canvas 上方
    try {
      if (window.getComputedStyle(targetEl).pointerEvents === 'none') {
        return hit.tagName === 'CANVAS' || Boolean(hit.closest?.('#stage'));
      }
    } catch (_) {}
    return hit.contains(targetEl);
  }

  function scrollTargetIntoViewIfNeeded(targetEl) {
    if (!targetEl || !targetEl.isConnected) return;
    try {
      const r = targetEl.getBoundingClientRect();
      const scrollBox = targetEl.closest('#stg-list, #slots, .stg-detail, .ro-body, .chr-scroll');
      const boxR = scrollBox ? scrollBox.getBoundingClientRect() : null;
      const clipped =
        r.top < 2 ||
        r.bottom > window.innerHeight - 2 ||
        r.left < 2 ||
        r.right > window.innerWidth - 2 ||
        Boolean(boxR && (r.top < boxR.top + 2 || r.bottom > boxR.bottom - 2));
      if (clipped && typeof targetEl.scrollIntoView === 'function') {
        targetEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    } catch (_) {}
  }

  function sendBridgeClick(clientX, clientY, label = '', targetEl = null, opts = {}) {
    const ex = getExtra();
    if (ex.bridgeAllowClick === false) {
      addLog(`[混合橋接] 已停用滑鼠點擊橋接，請手動點【${label || '目標按鈕'}】`);
      try { opts?.onCancelled?.('disabled'); } catch (_) {}
      return false;
    }
    if (targetEl && !opts.exactCoords && !opts.skipScroll) {
      scrollTargetIntoViewIfNeeded(targetEl);
    }
    const useExact = Boolean(opts && opts.exactCoords && typeof clientX === 'number' && typeof clientY === 'number');
    const isSmallActionBtn = Boolean(targetEl && (targetEl.classList?.contains('pk-act') || targetEl.closest?.('.pk-act')));
    const computeAimPoint = (zeroJitter = false) => {
      const liveR = targetEl && targetEl.isConnected ? targetEl.getBoundingClientRect() : null;
      const rawCx = useExact ? clientX : (liveR && liveR.width > 0 ? liveR.left + liveR.width * 0.5 : clientX);
      const rawCy = useExact ? clientY : (liveR && liveR.height > 0 ? liveR.top + liveR.height * 0.5 : clientY);
      const baseCx = Math.max(4, Math.min(window.innerWidth - 4, rawCx));
      const baseCy = Math.max(4, Math.min(window.innerHeight - 4, rawCy));
      if (zeroJitter || isSmallActionBtn) {
        return { x: baseCx, y: baseCy, r: liveR };
      }
      const jitterSpanX = useExact ? 4 : Math.min(4, liveR ? liveR.width * 0.2 : 4);
      const jitterSpanY = useExact ? 4 : Math.min(4, liveR ? liveR.height * 0.2 : 4);
      return {
        x: Math.max(4, Math.min(window.innerWidth - 4, baseCx + (Math.random() - 0.5) * jitterSpanX)),
        y: Math.max(4, Math.min(window.innerHeight - 4, baseCy + (Math.random() - 0.5) * jitterSpanY)),
        r: liveR,
      };
    };
    let aim = computeAimPoint(false);
    let jx = aim.x;
    let jy = aim.y;
    const holdMs = humanHoldMs(40, 8, 22, 70);
    // Win32 SendInput 實體滑鼠模式：移動游標到即時座標 → 若卡片動畫位移或未對準自動重讀 live rect 再微調 → 確認命中才點下
    (async () => {
      const cancelWith = (reason) => {
        try { opts?.onCancelled?.(reason); } catch (_) {}
      };
      const prevMouseAt = state.lastTrustedMouse?.at || 0;
      let c1 = computeBridgeCoords(jx, jy);
      if (state.paused) return cancelWith('paused');
      const mv1 = await sendBridgeAction({ type: 'move', ...c1, label });
      if (!mv1 || !mv1.ok) return cancelWith(mv1?.reason || 'move_failed');
      await sleep(75 + Math.random() * 55);
      if (state.paused) return cancelWith('paused');
      // 移動後重讀即時按鈕中心，防止 .pk-pop 動畫位移或 hover 展開造成座標漂移
      if (!useExact && targetEl && targetEl.isConnected) {
        aim = computeAimPoint(true);
        jx = aim.x;
        jy = aim.y;
      }
      let m = state.lastTrustedMouse;
      let freshMouse = Boolean(m && m.at > prevMouseAt && m.clientX >= 0);
      const alreadyClose = Boolean(m && m.clientX >= 0 && Date.now() - m.at < 500 && Math.hypot(jx - m.clientX, jy - m.clientY) <= 5);
      if ((!freshMouse && !alreadyClose) || (freshMouse && Math.hypot(jx - m.clientX, jy - m.clientY) > 90)) {
        const calOk = await calibrateBridgeViewport(true);
        if (calOk) {
          if (!useExact && targetEl && targetEl.isConnected) {
            aim = computeAimPoint(true);
            jx = aim.x;
            jy = aim.y;
          }
          c1 = computeBridgeCoords(jx, jy);
          const beforeCalMv = state.lastTrustedMouse?.at || 0;
          await sendBridgeAction({ type: 'move', ...c1, label: `${label}(已校準)` });
          await new Promise((res) => setTimeout(res, 95));
          if (state.paused) return cancelWith('paused');
          m = state.lastTrustedMouse;
          freshMouse = Boolean(m && m.at > beforeCalMv && m.clientX >= 0);
        }
      }
      // 最多進行 3 次即時重讀微調，確保游標精準落在按鈕正中央並通過命中檢驗
      for (let retry = 0; retry < 3; retry++) {
        if (!useExact && targetEl && targetEl.isConnected) {
          aim = computeAimPoint(true);
          jx = aim.x;
          jy = aim.y;
        }
        m = state.lastTrustedMouse;
        if (!m || Date.now() - m.at > 600 || m.clientX < 0) break;
        const errX = jx - m.clientX;
        const errY = jy - m.clientY;
        const hoverOk = !targetEl || isHoverHitOnTarget(targetEl, m.clientX, m.clientY, opts);
        if (Math.hypot(errX, errY) <= 2.5 && hoverOk) break;
        const cal = getValidViewportCalib();
        const sxScale = cal ? cal.scaleX : (Number(window.devicePixelRatio) || 1);
        const syScale = cal ? cal.scaleY : (Number(window.devicePixelRatio) || 1);
        c1 = {
          ...c1,
          screenX: Math.round(c1.screenX + errX * sxScale),
          screenY: Math.round(c1.screenY + errY * syScale),
        };
        if (cal) {
          cal.vpPhysX += errX * sxScale * 0.5;
          cal.vpPhysY += errY * syScale * 0.5;
        } else {
          state.bridgeCalibOffset = {
            dx: Math.round(((state.bridgeCalibOffset?.dx || 0) + errX * sxScale) * 10) / 10,
            dy: Math.round(((state.bridgeCalibOffset?.dy || 0) + errY * syScale) * 10) / 10,
          };
        }
        await sendBridgeAction({ type: 'move', ...c1, label: `${label}(微調${retry + 1})` });
        await new Promise((res) => setTimeout(res, 80));
        if (state.paused) return cancelWith('paused');
      }
      let finalMouse = state.lastTrustedMouse;
      let hasRecentMouse = Boolean(finalMouse && Date.now() - finalMouse.at < 700 && finalMouse.clientX >= 0);
      let alreadyAtTarget = Boolean(finalMouse && finalMouse.clientX >= 0 && Math.hypot(jx - finalMouse.clientX, jy - finalMouse.clientY) <= 8);
      if (targetEl) {
        if (!targetEl.isConnected || (!opts.skipVisibilityCheck && !isVisible(targetEl, 2))) {
          addLog(`[混合橋接保護] 【${label || '目標按鈕'}】已隱藏或移除，已取消點擊`);
          return cancelWith('hidden');
        }
        // 若首次對準因動畫延遲仍未命中，重讀即時座標再補一次絕對重瞄
        if ((hasRecentMouse || alreadyAtTarget) && !isHoverHitOnTarget(targetEl, finalMouse.clientX, finalMouse.clientY, opts) && !useExact) {
          aim = computeAimPoint(true);
          jx = aim.x;
          jy = aim.y;
          c1 = computeBridgeCoords(jx, jy);
          await sendBridgeAction({ type: 'move', ...c1, label: `${label}(重瞄)` });
          await new Promise((res) => setTimeout(res, 95));
          if (state.paused) return cancelWith('paused');
          finalMouse = state.lastTrustedMouse;
          hasRecentMouse = Boolean(finalMouse && Date.now() - finalMouse.at < 700 && finalMouse.clientX >= 0);
          alreadyAtTarget = Boolean(finalMouse && finalMouse.clientX >= 0 && Math.hypot(jx - finalMouse.clientX, jy - finalMouse.clientY) <= 8);
        }
        if (!hasRecentMouse && !alreadyAtTarget) {
          addLog(`[混合橋接保護] 無法確認游標位置，已取消點擊【${label || '目標按鈕'}】（請點「🎯 校準點擊」並確認 ro_bridge_win.ps1 已更新）`);
          return cancelWith('no_mouse');
        }
        if (!isHoverHitOnTarget(targetEl, finalMouse.clientX, finalMouse.clientY, opts)) {
          addLog(`[混合橋接保護] 游標 (${Math.round(finalMouse.clientX)},${Math.round(finalMouse.clientY)}) 未對準【${label || '目標按鈕'}】，已取消以免誤選`);
          return cancelWith('hover_miss');
        }
      }
      const clickRes = await sendBridgeAction({ type: 'click_here', ...c1, holdMs, label });
      if (clickRes && clickRes.ok) {
        try { opts?.onClicked?.(); } catch (_) {}
      } else {
        cancelWith(clickRes?.reason || 'click_failed');
      }
    })();
    return true;
  }

  function performElementClick(el, clientX, clientY, label = '', opts = {}) {
    if (!el || !el.isConnected) return false;
    const mode = CONFIG.selectionActionMode || 'hybrid_bridge';
    if (mode === 'hybrid_bridge') {
      return sendBridgeClick(clientX, clientY, label, el, opts);
    }
    if (mode === 'advisor_only') {
      addLog(`[純提示] 建議手動點擊【${label || (el.textContent || '').trim().slice(0, 16) || '按鈕'}】`);
      return false;
    }
    return false;
  }

  function getCurrentCardsSnapshot() {
    return findDomCardElements()
      .map((el) => (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120))
      .join('||');
  }

  function executeSelectionAction(idx, cardElement, cardMeta = null) {
    const maxChoices = getPickerMaxChoices();
    const rawKey = Number(cardMeta?.hotkey) || (idx + 1);
    const safeKey = Math.max(1, Math.min(maxChoices, rawKey));
    const mode = CONFIG.selectionActionMode || 'hybrid_bridge';
    if (mode === 'hybrid_bridge') {
      blurHudFocus();
      const holdMs = humanHoldMs(60, 12, 38, 95);
      return sendBridgeKey(String(safeKey), holdMs, 'key');
    }
    if (mode === 'advisor_only') {
      const title = cardMeta?.title || `卡片 ${safeKey}`;
      updateStatusBar(`👉 建議按 [${safeKey}] 選【${title}】`);
      return false;
    }
    return false;
  }

  // === 5. 純本地規則選卡、放逐、重抽、神祇鎖定 ===
  function normalizeDeityName(raw) {
    const base = String(raw || '')
      .replace(/^(?:新\s*[！!]|NEW\b)\s*/i, '')
      .replace(/[（(【\[]?(?:技能|屬性)?神[祇祉][）)】\]]?/g, '')
      .replace(/(?:Deity|Artifact)/gi, '')
      .replace(/Lv\.?\s*\d+/gi, '')
      .replace(/\+\s*\d+.*$/g, '')
      .replace(/[·・:：]/g, '')
      .replace(/(?:替換|取代|目前|已裝備)/g, '')
      .replace(/\s+/g, '')
      .trim();
    return canonicalArtifactName(base) || base;
  }

  function cardNameOf(card) {
    if (card?.itemKey && ARTIFACTS_BY_KEY[card.itemKey]) return ARTIFACTS_BY_KEY[card.itemKey].name;
    return normalizeDeityName(card?.title || '');
  }

  function deityNamesMatch(a, b) {
    const na = normalizeDeityName(a);
    const nb = normalizeDeityName(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    return na.length >= 2 && nb.length >= 2 && (na.includes(nb) || nb.includes(na));
  }

  function cardIsNew(card) {
    if (card.hasNewRibbon || card.element?.querySelector('.pk-ribbon')) return true;
    const txt = String(card.element?.innerText || '');
    return /(?:新\s*[！!]|\bNEW\b)/i.test(txt) || Boolean(card.element?.querySelector('[class*="new"]'));
  }

  function isArtifactCard(card) {
    if (!card) return false;
    if (card.itemKey && ARTIFACTS_BY_KEY[card.itemKey]) return true;
    const sub = String(card.subText || '');
    const badge = String(card.badgeText || '');
    const title = String(card.title || '');
    const clean = cardNameOf(card);
    if (canonicalArtifactName(clean) || canonicalArtifactName(title)) return true;
    if (/神器|Artifact/i.test(sub) || /神器|Artifact/i.test(badge) || /神器|Artifact/i.test(title)) return true;
    return false;
  }

  function isDeityCard(card, modalType = '寶箱道具') {
    if (modalType === '寶箱道具') return isArtifactCard(card);
    const sub = String(card?.subText || '');
    const badge = String(card?.badgeText || '');
    const title = String(card?.title || '');
    if (/神[祇祉]|Deity/i.test(sub) || /神[祇祉]|Deity/i.test(badge) || /神[祇祉]|Deity/i.test(title)) return true;
    return isArtifactCard(card);
  }

  function findNamedDeityInText(text, excludeName = '') {
    const raw = String(text || '');
    const compact = normalizeDeityName(raw);
    if (!compact) return '';
    const allTargets = Array.from(new Set([...COMMON_ARTIFACTS, ...ARTIFACTS_DATA.map((a) => a.legacyName)])).sort(
      (a, b) => b.length - a.length
    );
    let bestHit = '';
    let bestPos = Infinity;
    let bestLen = 0;
    for (const d of allTargets) {
      const canon = canonicalArtifactName(d) || d;
      if (excludeName && deityNamesMatch(canon, excludeName)) continue;
      const nd = String(d || '').replace(/\s+/g, '');
      if (!nd || nd.length < 2) continue;
      const pos = compact.indexOf(nd);
      if (pos < 0) continue;
      if (pos < bestPos || (pos === bestPos && nd.length > bestLen)) {
        bestHit = canon;
        bestPos = pos;
        bestLen = nd.length;
      }
    }
    return bestHit;
  }

  function extractSwapPromptDeities(promptText, cardFrontTitle = '') {
    const raw = String(promptText || '').replace(/\s+/g, ' ').trim();
    const frontName = normalizeDeityName(cardFrontTitle || '');
    let oldDeity = '';
    let newDeity = '';
    const splitMatch = raw.match(/^([\s\S]*?)(?:換成|替換成|替換為|取代為|改為|→|->)([\s\S]*)$/);
    if (splitMatch) {
      oldDeity = findNamedDeityInText(splitMatch[1], frontName);
      newDeity = findNamedDeityInText(splitMatch[2], oldDeity) || frontName;
    } else {
      oldDeity = findNamedDeityInText(raw, frontName);
      newDeity = frontName || findNamedDeityInText(raw, oldDeity);
    }
    return { oldDeity, newDeity };
  }

  function detectActiveDeityFromDom(cards = []) {
    // 1) 遊戲 HUD 專屬第 5 格神器欄位（#lu-sockets / #runitems 的 [data-item="deity"] 圖片 ID 直接查表）
    const hudNodes = Array.from(document.querySelectorAll(
      '#lu-sockets .run-slot[data-item="deity"]:not(.empty), #runitems .run-slot[data-item="deity"]:not(.empty), #lu-sockets .run-slot[data-item="artifact"]:not(.empty), #runitems .run-slot[data-item="artifact"]:not(.empty)'
    )).filter((el) => !isOwnHudNode(el));
    for (const el of hudNodes) {
      const img = el.querySelector?.('img');
      const imgSrc = img?.getAttribute('src') || img?.src || '';
      const imgKey = imgSrc ? (imgSrc.split('/').pop()?.split('?')[0]?.replace(/\.png$/i, '') || '') : '';
      if (imgKey && ARTIFACTS_BY_KEY[imgKey]) {
        return { name: ARTIFACTS_BY_KEY[imgKey].name, source: '道具欄第5格圖示', explicit: true };
      }
      const probe = [
        el.getAttribute('data-deity'),
        el.getAttribute('title'),
        el.getAttribute('aria-label'),
        img?.getAttribute('alt'),
        img?.getAttribute('title'),
        el.textContent,
      ]
        .filter(Boolean)
        .join(' ');
      const hit = findNamedDeityInText(probe);
      if (hit) return { name: hit, source: 'HUD', explicit: true };
    }
    // 2) 卡片內建 .pk-swap（「取代 XXX 神器」）或 .pk-back（「將 XXX 換成 YYY 嗎？」）——必須排除該卡片本身的神器名
    for (const c of cards || []) {
      const selfName = cardNameOf(c) || normalizeDeityName(c?.title || '');
      const swapEl = c?.element?.querySelector?.('.pk-swap');
      if (swapEl && !isDomElementHiddenClone(swapEl)) {
        const swapText = String(swapEl.textContent || '');
        const beforeTarget = swapText.split(/(?:換成|替換成|替換為|取代為|→|->)/)[0] || swapText;
        const swapHit = findNamedDeityInText(beforeTarget, selfName);
        if (swapHit) return { name: swapHit, source: '取代標示', explicit: true };
      }
      const scope = getCardActionScope(c?.element);
      const backEl = scope?.querySelector?.('.pk-back');
      if (backEl) {
        const backText = (backEl.querySelector?.('b')?.textContent || backEl.textContent || '').trim();
        if (backText) {
          const { oldDeity } = extractSwapPromptDeities(backText, selfName);
          if (oldDeity && !deityNamesMatch(oldDeity, selfName)) {
            return { name: oldDeity, source: '交換確認文字', explicit: true };
          }
        }
      }
    }
    const modalRoot = cards[0]?.element?.parentElement?.parentElement || cards[0]?.element?.parentElement;
    if (modalRoot) {
      const mText = (modalRoot.innerText || '').slice(0, 600);
      const explicitRe = /(?:目前|已選(?:擇)?|已裝備|原有|當前)[^\n]{0,8}(?:神器|神[祇祉])[^\n:：]*[:：]?\s*([^\n|｜/／]+)|取代(?:目前)?[【\[]?([^\n】\]]+)[】\]]?/;
      const mm = mText.match(explicitRe);
      if (mm) {
        const rawSeg = (mm[1] || mm[2] || '').split(/(?:換成|替換成|替換為|取代為|→|->)/)[0] || '';
        const cand = findNamedDeityInText(rawSeg);
        const isSwapCardItself = (cards || []).some((c) => {
          const sEl = c?.element?.querySelector?.('.pk-swap');
          return Boolean(sEl && !isDomElementHiddenClone(sEl) && deityNamesMatch(cardNameOf(c), cand));
        });
        if (cand && !isSwapCardItself) return { name: cand, source: '彈窗標示', explicit: true };
      }
    }
    // 3) 若寶箱同時出現多張神器卡，且其中一張標記升級而另一張標記替換/新
    const dCards = cards.filter((c) => isArtifactCard(c));
    if (dCards.length >= 2) {
      const hasReplace = dCards.some((c) => /替換|取代/.test(c.element?.innerText || '') || Boolean(c.element?.querySelector?.('.pk-swap')));
      if (hasReplace) {
        const upgradeCard = dCards.find((c) => !/替換|取代/.test(c.element?.innerText || '') && !c.element?.querySelector?.('.pk-swap') && !cardIsNew(c));
        if (upgradeCard) {
          const hit = cardNameOf(upgradeCard) || findNamedDeityInText(upgradeCard.title);
          if (hit) return { name: hit, source: '升級卡推斷', explicit: false };
        }
      }
    }
    return null;
  }

  function syncActiveDeityFromDom(cards = []) {
    const detected = detectActiveDeityFromDom(cards);
    if (!detected || !detected.name) return;
    const detectedIsSwapCandidate = (cards || []).some((c) => {
      const sEl = c?.element?.querySelector?.('.pk-swap');
      return Boolean(sEl && !isDomElementHiddenClone(sEl) && deityNamesMatch(cardNameOf(c), detected.name));
    });
    if (detectedIsSwapCandidate) return;
    if (!state.run.deity || (detected.explicit && !deityNamesMatch(state.run.deity, detected.name))) {
      state.run.deity = detected.name;
      saveRunSession();
      updateRunInfo();
      addLog(`[偵測神器] 由 ${detected.source} 偵測到已裝神器【${detected.name}】`);
    }
  }

  function orderIndex(name, list) {
    const clean = normalizeDeityName(name);
    if (!clean) return 999;
    const i = list.findIndex((s) => deityNamesMatch(clean, s));
    return i < 0 ? 999 : i;
  }

  function isActionBtnReady(btn) {
    if (!btn || !isVisible(btn, 6) || isDomElementHiddenClone(btn)) return false;
    if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return false;
    const st = window.getComputedStyle(btn);
    if (st.pointerEvents === 'none' || parseFloat(st.opacity) < 0.35) return false;
    const small = btn.querySelector('small');
    if (small) {
      const m = (small.textContent || '').trim().match(/\d+/);
      if (m && Number(m[0]) <= 0) return false;
    }
    return true;
  }

  function getCardActionScope(cardEl) {
    if (!cardEl) return null;
    return cardEl.closest('.pk-slot, .pk-pop') || cardEl.parentElement || cardEl;
  }

  function findBanishButton(cardEl, dataIndex) {
    if (!cardEl) return null;
    const isBanishTextBtn = (btn) => {
      if (!isActionBtnReady(btn)) return false;
      const meta = [btn.innerText, btn.textContent, btn.getAttribute('title'), btn.getAttribute('aria-label')]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, '');
      if (!/放逐|banish/i.test(meta)) return false;
      if (/[\(（\[]0[\)）\]]/.test(meta) || /放逐0(?!\d)/.test(meta) || /^0放逐/.test(meta)) return false;
      return true;
    };
    // 遊戲新版 DOM：.pk-acts 是 .pk-card 的兄弟節點，共同位在 .pk-pop / .pk-slot 內
    const scope = getCardActionScope(cardEl);
    if (scope) {
      const scopedActs = Array.from(scope.querySelectorAll('.pk-acts .pk-act, .pk-act, button, [role="button"]'));
      const hit = scopedActs.find(isBanishTextBtn);
      if (hit) return hit;
    }
    if (typeof dataIndex === 'number' && !Number.isNaN(dataIndex)) {
      const scopeActs = Array.from(document.querySelectorAll(`#picker:not(.hidden) [data-act^="${dataIndex}:"]`)).filter(
        (b) => !isDomElementHiddenClone(b)
      );
      const byTextScoped = scopeActs.find(isBanishTextBtn);
      if (byTextScoped) return byTextScoped;
    }
    return null;
  }

  function readRemainingBanishCount(cards = []) {
    try {
      const picker = document.querySelector('#picker:not(.hidden)');
      const scope = picker || document;
      const allBtns = Array.from(scope.querySelectorAll('.pk-acts .pk-act, .pk-act, button[data-act]')).filter(
        (b) => !isOwnHudNode(b) && !isDomElementHiddenClone(b) && !b.closest('#pk-bar')
      );
      const banishBtns = allBtns.filter((btn) => {
        const meta = [btn.innerText, btn.textContent, btn.getAttribute('title'), btn.getAttribute('aria-label')]
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, '');
        return /放逐|banish/i.test(meta);
      });
      if (!banishBtns.length) return { known: false, remaining: 0, explicitZero: false, anyReady: false };
      let maxCount = null;
      let anyReady = false;
      for (const btn of banishBtns) {
        if (isActionBtnReady(btn)) anyReady = true;
        const small = btn.querySelector('small');
        const raw = (small ? small.textContent : btn.textContent || '').trim();
        const m = raw.match(/\d+/);
        if (m) {
          const n = Number(m[0]);
          if (maxCount === null || n > maxCount) maxCount = n;
        }
      }
      if (maxCount !== null) {
        return { known: true, remaining: maxCount, explicitZero: maxCount === 0, anyReady };
      }
      // 未讀到明確數字時，絕不猜測剩餘次數為 0，避免動畫中或不可放逐卡誤判次數耗盡而提前按自動
      return { known: false, remaining: anyReady ? 1 : 0, explicitZero: false, anyReady };
    } catch (_) {
      return { known: false, remaining: 0, explicitZero: false, anyReady: false };
    }
  }

  function findNativeAutoSkillButton() {
    const picker = document.querySelector('#picker:not(.hidden)');
    if (!picker) return null;
    // 嚴格確認不是寶箱畫面（改版後寶箱與技能的 bar:1 分別為「自動寶箱」與「自動技能」）
    const titleTxt = (picker.querySelector('#pk-title')?.textContent || '').trim();
    if (/寶箱|chest/i.test(titleTxt)) return null;
    const bar = picker.querySelector('#pk-bar');
    if (bar) {
      const isSkillAutoBtn = (b) => {
        if (!b || isOwnHudNode(b) || !isActionBtnReady(b)) return false;
        const txt = (b.innerText || b.textContent || '').replace(/\s+/g, '');
        const tip = (b.getAttribute('title') || b.getAttribute('aria-label') || '').replace(/\s+/g, '');
        if (/重抽|reroll|寶箱|chest/i.test(txt)) return false;
        if (/寶箱都隨機|auto\s*chest/i.test(tip)) return false;
        return /自動技能|autoskill/i.test(txt) || /^(?:自動|auto)$/i.test(txt);
      };
      const exact = bar.querySelector('button[data-act="bar:1"], [data-act="bar:1"]');
      if (exact && isSkillAutoBtn(exact)) return exact;
      const byText = Array.from(bar.querySelectorAll('button, [role="button"]')).find(isSkillAutoBtn);
      if (byText) return byText;
    }
    return null;
  }

  function findNativeAutoChestButton() {
    const picker = document.querySelector('#picker:not(.hidden)');
    if (!picker) return null;
    const titleTxt = (picker.querySelector('#pk-title')?.textContent || '').trim();
    if (!/寶箱|chest/i.test(titleTxt)) return null;
    const bar = picker.querySelector('#pk-bar');
    if (bar) {
      const isChestAutoBtn = (b) => {
        if (!b || isOwnHudNode(b) || !isActionBtnReady(b)) return false;
        const txt = (b.innerText || b.textContent || '').replace(/\s+/g, '');
        const tip = (b.getAttribute('title') || b.getAttribute('aria-label') || '').replace(/\s+/g, '');
        if (/重抽|reroll|技能|skill/i.test(txt)) return false;
        if (/技能卡都隨機|auto\s*skill/i.test(tip)) return false;
        return /自動寶箱|autochest/i.test(txt);
      };
      const exact = bar.querySelector('button[data-act="bar:1"], [data-act="bar:1"]');
      if (exact && isChestAutoBtn(exact)) return exact;
      const byText = Array.from(bar.querySelectorAll('button, [role="button"]')).find(isChestAutoBtn);
      if (byText) return byText;
    }
    return null;
  }

  function findFocusButton(cardEl, dataIndex) {
    if (!cardEl) return null;
    // 卡片左上角已有「★ 專注」標記 (.pk-mark) 代表本局已專注，直接略過
    const markEl = cardEl.querySelector?.('.pk-mark');
    if (markEl && /專注|focus/i.test(markEl.textContent || '')) return null;
    const isFocusBtn = (btn) => {
      if (!isActionBtnReady(btn)) return false;
      const cls = String(btn.className || '');
      if (
        btn.classList.contains('active') ||
        btn.classList.contains('on') ||
        btn.classList.contains('focused') ||
        btn.getAttribute('aria-pressed') === 'true' ||
        /\b(?:is-)?(?:focused|active)\b/i.test(cls)
      ) {
        return false;
      }
      const meta = [btn.innerText, btn.textContent, btn.getAttribute('title'), btn.getAttribute('aria-label')]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, '');
      if (/已經是優先|已專注|focused/i.test(meta)) return false;
      if (/專注|focus/i.test(meta)) {
        if (/[(（\[]0[)）\]]/.test(meta) || /專注0(?!\d)/.test(meta)) return false;
        return true;
      }
      return false;
    };
    const scope = getCardActionScope(cardEl);
    if (scope) {
      const hit = Array.from(scope.querySelectorAll('.pk-acts .pk-act, .pk-act, button, [role="button"]')).find(isFocusBtn);
      if (hit) return hit;
    }
    if (typeof dataIndex === 'number' && !Number.isNaN(dataIndex)) {
      const scoped = Array.from(document.querySelectorAll(`#picker:not(.hidden) [data-act^="${dataIndex}:"]`)).filter(
        (b) => !isDomElementHiddenClone(b)
      );
      const hit = scoped.find(isFocusBtn);
      if (hit) return hit;
    }
    return null;
  }

  function resolveCardRunItem(card) {
    if (!card) return null;
    if (card.itemKey && RUN_ITEMS_BY_KEY[card.itemKey]) {
      return RUN_ITEMS_BY_KEY[card.itemKey];
    }
    const cleanTitle = String(card.title || '').replace(/\s*\+\d+.*$/, '').replace(/\s+/g, '').toLowerCase();
    const sub = String(card.subText || '').trim();
    const desc = String(card.description || '') + ' ' + String(card.element?.innerText || '');
    if (cleanTitle.includes('範圍藥水')) {
      return /近戰/.test(desc) ? RUN_ITEMS_BY_KEY.p_reach : RUN_ITEMS_BY_KEY.p_area;
    }
    if (cleanTitle.includes('範圍祝福')) {
      return /近戰/.test(desc) ? RUN_ITEMS_BY_KEY.b_reach : RUN_ITEMS_BY_KEY.b_area;
    }
    if (cleanTitle.includes('尋寶秘藥')) {
      return RUN_ITEMS_BY_KEY.e_surprise;
    }
    const pool = RUN_ITEM_CATEGORIES.includes(sub) ? RUN_ITEMS_BY_CAT[sub] : RUN_ITEMS_DATA;
    return pool.find((it) => cleanTitle === it.name.replace(/\s+/g, '').toLowerCase()) ||
      pool.find((it) => cleanTitle.includes(it.name.replace(/\s+/g, '').toLowerCase())) ||
      null;
  }

  // 完整 6 格道具欄對照：前 4 格永久道具 + 第 5 格神器 (data-item="deity") + 第 6 格 Lv 20 技能神祇 (data-item="skill" / button[data-pick-deity])
  const DATA_ITEM_TO_CAT = {
    potion: '藥水',
    elixir: '秘藥',
    blessing: '祝福',
    dish: '料理',
    food: '料理',
    deity: '神器',
    artifact: '神器',
    skill: '神祇',
  };

  function resolveSkillNameByIconOrSlug(rawSlug) {
    const key = String(rawSlug || '').trim().toLowerCase().replace(/\.png$/i, '');
    if (!key) return '';
    if (SKILL_ICON_OR_SLUG_TO_NAME[key]) return SKILL_ICON_OR_SLUG_TO_NAME[key];
    const shortKey = key.replace(/^[a-z]{2,3}_/, '');
    if (SKILL_ICON_OR_SLUG_TO_NAME[shortKey]) return SKILL_ICON_OR_SLUG_TO_NAME[shortKey];
    return '';
  }

  function readEquippedRunSlots() {
    const slots = Array.from(document.querySelectorAll('#lu-sockets .run-slot, #runitems .run-slot'))
      .filter((el) => !isOwnHudNode(el) && !el.classList.contains('run-stats-btn') && el.id !== 'run-stats-btn');
    const out = {};
    slots.forEach((slot) => {
      const dataItem = (slot.getAttribute('data-item') || '').trim().toLowerCase();
      const hasPickDeity = slot.hasAttribute('data-pick-deity');
      const titleType = (slot.getAttribute('title') || '').trim();
      const isPending = Boolean(hasPickDeity || slot.classList.contains('pending'));
      const isEmpty = slot.classList.contains('empty');
      const imgSrc = slot.querySelector('img')?.getAttribute('src') || slot.querySelector('img')?.src || '';
      const key = imgSrc ? (imgSrc.split('/').pop()?.split('?')[0]?.replace(/\.png$/i, '') || '') : '';
      const item = key && RUN_ITEMS_BY_KEY[key] ? RUN_ITEMS_BY_KEY[key] : null;
      const artifact = key && ARTIFACTS_BY_KEY[key] ? ARTIFACTS_BY_KEY[key] : null;
      let type = DATA_ITEM_TO_CAT[dataItem] || '';
      if (!type) {
        if (hasPickDeity || /選擇你的神[祇祉]|^神[祇祉]$/.test(titleType)) type = '神祇';
        else if (/^神器$/.test(titleType) || artifact) type = '神器';
        else type = titleType || item?.category || '';
      }
      if (!type) return;
      const lvlRaw = (slot.querySelector('.lvl')?.textContent || '').trim();
      const lvlMatch = lvlRaw.match(/\+(\d+)/);
      const level = lvlMatch ? Number(lvlMatch[1]) : 0;
      const skillName = type === '神祇' && !isEmpty ? (resolveSkillNameByIconOrSlug(key) || titleType.replace(/神[祇祉]/g, '').trim() || key) : '';
      if (
        !out[type] ||
        (!isEmpty && out[type].isEmpty) ||
        (isPending && !out[type].pending && out[type].isEmpty) ||
        (!isEmpty && level > (out[type].level || 0))
      ) {
        out[type] = {
          type,
          isEmpty,
          pending: isPending,
          key: item ? item.key : key || null,
          item,
          artifact,
          skillName,
          level,
          element: slot,
        };
      }
    });
    if (out['神器'] && !out['神器'].isEmpty) {
      state.run.deityLevel = out['神器'].level || 0;
    }
    if (out['神祇']) {
      state.run.deityPending = Boolean(out['神祇'].pending && out['神祇'].isEmpty);
      if (!out['神祇'].isEmpty) {
        state.run.skillDeityLevel = out['神祇'].level || 0;
      }
    }
    return out;
  }

  function parseRunStatCellNum(rawText) {
    const txt = String(rawText || '').replace(/,/g, '').trim();
    if (!txt || txt === '—' || txt === '-') return null;
    const m = txt.match(/[+-]?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : null;
  }

  function formatCStatsShortSummary(cStats) {
    if (!cStats || typeof cStats !== 'object') return '';
    const parts = [];
    const pick = (k, label, suffix = '') => {
      const v = cStats[k]?.total;
      if (typeof v === 'number' && Number.isFinite(v)) {
        const disp = Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1);
        parts.push(`${label}:${disp}${suffix}`);
      }
    };
    pick('HP', 'HP');
    pick('傷害', '傷', '%');
    pick('冷卻縮減', '冷');
    pick('範圍', '範', '%');
    pick('雙重詠唱', '雙', '%');
    pick('爆擊', '爆', '%');
    pick('回復', '回');
    return parts.join(' ');
  }

  function diagnoseCStatsBottlenecks(cStats) {
    if (!cStats || typeof cStats !== 'object') return [];
    const notes = [];
    const dmg = cStats['傷害']?.total ?? 0;
    const cd = cStats['冷卻縮減']?.total ?? 0;
    const cdGain = cStats['冷卻縮減']?.gain ?? 0;
    const area = cStats['範圍']?.total ?? 0;
    const dbl = cStats['雙重詠唱']?.total ?? 0;
    const hp = cStats['HP']?.total ?? 0;
    const regen = cStats['回復']?.total ?? 0;
    const matk = cStats['MATK']?.total ?? 0;
    const meleeAtk = cStats['近戰 ATK']?.total ?? 0;
    const rangeAtk = cStats['遠程 ATK']?.total ?? 0;
    if (dmg >= 120 && (cdGain <= 6 || area < 15 || dbl < 10)) {
      const lacks = [];
      if (cdGain <= 6 && cd < 50) lacks.push('冷卻');
      if (area < 15) lacks.push('範圍');
      if (dbl < 10) lacks.push('雙詠');
      if (lacks.length) notes.push(`傷害已達${dmg.toFixed(0)}%邊際遞減，優先補${lacks.join('/')}`);
    }
    if (hp > 0 && hp < 850 && regen < 12) {
      notes.push(`生存偏脆(HP ${Math.round(hp)}/回${regen.toFixed(1)})，可補吸血/護甲/VIT`);
    }
    if (matk > Math.max(meleeAtk, rangeAtk) && state.run?.items?.['料理'] === '12203') {
      notes.push('法系裝AGI料理效益偏低，建議改INT/DEX/VIT料理');
    }
    return notes;
  }

  function readRunStatsModal(opts = {}) {
    try {
      const modal = document.querySelector('#run-stats');
      if (!modal || modal.classList.contains('hidden') || !isVisible(modal, 30)) return null;
      const rows = Array.from(modal.querySelectorAll('tbody tr'));
      if (!rows.length) return null;
      const statsMap = {};
      for (const tr of rows) {
        const label = (tr.querySelector('th')?.textContent || '').replace(/\s+/g, ' ').trim();
        if (!label) continue;
        const tds = tr.querySelectorAll('td');
        if (tds.length < 3) continue;
        statsMap[label] = {
          base: parseRunStatCellNum(tds[0]?.textContent),
          gain: parseRunStatCellNum(tds[1]?.textContent),
          total: parseRunStatCellNum(tds[2]?.textContent),
        };
      }
      if (!Object.keys(statsMap).length) return null;
      state.run.cStats = statsMap;
      state.run.cStatsAt = Date.now();
      const summary = formatCStatsShortSummary(statsMap);
      state.run.cStatsSummary = summary;
      const diag = diagnoseCStatsBottlenecks(statsMap);
      const sig = `${summary}|${diag.join(';')}`;
      const now = Date.now();
      if (opts.forceLog || sig !== state.lastCStatsLoggedSig || now - (state.lastCStatsLoggedAt || 0) > 20000) {
        state.lastCStatsLoggedSig = sig;
        state.lastCStatsLoggedAt = now;
        const tag = opts.logTag || '本局素質';
        const diagTxt = diag.length ? `｜診斷：${diag.join('；')}` : '';
        addLog(`[${tag}] ${summary}${diagTxt}`);
      }
      return statsMap;
    } catch (_) {
      return null;
    }
  }

  function computeChestItemStatNeedBonus(item, cStats) {
    if (!item || !cStats || typeof cStats !== 'object') return 0;
    const key = item.key || '';
    const dmg = cStats['傷害']?.total ?? 0;
    const cd = cStats['冷卻縮減']?.total ?? 0;
    const area = cStats['範圍']?.total ?? 0;
    const dbl = cStats['雙重詠唱']?.total ?? 0;
    const crit = cStats['爆擊']?.total ?? 0;
    const cast = cStats['詠唱速度']?.total ?? 0;
    const hp = cStats['HP']?.total ?? 0;
    const regen = cStats['回復']?.total ?? 0;
    let score = 0;
    if (dmg >= 120) {
      if (key === 'p_dmg' || key === 'e_dmg' || key === 'b_dmg') score -= 1;
      if ((key === 'b_cd' || key === 'p_cd') && cd < 55) score += 2;
      if ((key === 'b_area' || key === 'e_area' || key === 'p_area') && area < 30) score += 2;
      if (key === 'b_double' && dbl < 18) score += 2;
      if ((key === 'e_crit' || key === 'e_critdmg') && crit < 35) score += 1;
      if ((key === 'b_cast' || key === 'e_cast' || key === 'p_cast') && cast < 45) score += 1;
    }
    if (hp > 0 && hp < 850 && regen < 15) {
      if (key === 'b_lifesteal' || key === 'b_regen' || key === 'p_regen') score += 2;
      if (key === 'e_armor' || key === 'p_armor' || key === 'p_hp' || key === 'e_hp' || key === '12207') score += 1;
    }
    return score;
  }

  function closeRunStatsModalSafely() {
    try {
      const modal = document.querySelector('#run-stats');
      if (!modal || modal.classList.contains('hidden') || !isVisible(modal, 30)) return true;
      const triggerClose = () => {
        const m = document.querySelector('#run-stats');
        if (!m || m.classList.contains('hidden') || !isVisible(m, 30)) return;
        if (!state.bridgeNoCKey) {
          sendBridgeAction({ type: 'key', key: 'c', holdMs: humanHoldMs(55, 10, 35, 85) }).then((res) => {
            if (!res?.ok && res?.reason === 'unsupported_key') {
              state.bridgeNoCKey = true;
              const btn = m.querySelector('.rs-close') || document.querySelector('#run-stats-btn');
              if (btn && isVisible(btn, 10)) {
                const r = btn.getBoundingClientRect();
                performElementClick(btn, r.left + r.width * 0.5, r.top + r.height * 0.5, '關閉本局素質');
              }
            }
          });
        } else {
          const btn = m.querySelector('.rs-close') || document.querySelector('#run-stats-btn');
          if (btn && isVisible(btn, 10)) {
            const r = btn.getBoundingClientRect();
            performElementClick(btn, r.left + r.width * 0.5, r.top + r.height * 0.5, '關閉本局素質');
          }
        }
      };
      triggerClose();
      setTimeout(() => {
        try {
          const m2 = document.querySelector('#run-stats');
          if (m2 && !m2.classList.contains('hidden') && isVisible(m2, 30)) {
            const closeBtn = m2.querySelector('.rs-close') || document.querySelector('#run-stats-btn');
            if (closeBtn && isVisible(closeBtn, 10)) {
              const r = closeBtn.getBoundingClientRect();
              performElementClick(closeBtn, r.left + r.width * 0.5, r.top + r.height * 0.5, '補關本局素質');
            }
          }
        } catch (_) {}
      }, 420);
      return false;
    } catch (_) {
      return true;
    }
  }

  function trySafeCStatsSnapshot(hpPct) {
    try {
      // 1. 被動讀取：若玩家手動按 C 打開本局素質，立即判讀並輸出診斷
      const existingModal = document.querySelector('#run-stats');
      if (existingModal && !existingModal.classList.contains('hidden') && isVisible(existingModal, 30)) {
        if (!state.cStatsSnapshotBusy) {
          readRunStatsModal({ logTag: '本局素質' });
        }
        return;
      }
      const ex = getExtra();
      if (ex.autoSampleCStats === false) return;
      if (!state.autoEnabled || state.paused || state.cStatsSnapshotBusy) return;
      if ((CONFIG.selectionActionMode || 'hybrid_bridge') !== 'hybrid_bridge' || !state.bridgeOnline) return;
      if (!isInCombat()) return;
      const pickerOpen = document.querySelector('#picker:not(.hidden)');
      if (pickerOpen && isVisible(pickerOpen, 40)) return;
      if (state.bossRedDodgeState || Date.now() - (state.lastBossRedActiveAt || 0) < 5500) return;
      if (getActiveBossContext(Date.now(), false).active) return;
      if (state.moonlightState?.active && state.moonlightState.phase !== 'idle') return;
      if (state.swarmBreakout?.active || (state.swarmPostGraceUntil && Date.now() < state.swarmPostGraceUntil)) return;
      if (state.lowHpEvading) return;
      if (state.inBossCountdown || state.clockDir === 'down') return;
      if (typeof hpPct === 'number' && hpPct < 80) return;
      const now = Date.now();
      if (state.lastHpDropAt && now - state.lastHpDropAt < 3500) return;
      if (now < (state.actionInFlightUntil || 0) || now < (state.pickingLockUntil || 0)) return;
      const sec = readGameClockSec();
      if (typeof sec !== 'number' || sec < 24) return;
      const bossSchedForC = getStageBossScheduleStatus(sec);
      if (bossSchedForC && (bossSchedForC.phase === 'boss_fight' || (typeof bossSchedForC.inSec === 'number' && bossSchedForC.inSec <= 22))) return;

      let phase = '';
      if (!state.cStatsSampledEarly && sec >= 25 && sec <= 55) phase = 'early';
      else if (!state.cStatsSampledMid && sec >= 245 && sec <= 285) phase = 'mid';
      if (!phase) return;

      if (phase === 'early') state.cStatsSampledEarly = true;
      else state.cStatsSampledMid = true;
      state.cStatsSnapshotBusy = true;
      releaseHeldKeysOnly();
      const labelTag = phase === 'early' ? 'C面板快拍·開局' : 'C面板快拍·中盤';

      const finishReadAndClose = (waitMs = 240) => {
        setTimeout(() => {
          try {
            readRunStatsModal({ logTag: labelTag, forceLog: true });
          } finally {
            closeRunStatsModalSafely();
            setTimeout(() => {
              state.cStatsSnapshotBusy = false;
              setTimeout(ensureMoveLoopRunning, 180);
            }, 520);
          }
        }, waitMs);
      };

      const openViaButtonClick = () => {
        const statsBtn = document.querySelector('#run-stats-btn');
        if (!statsBtn || !isVisible(statsBtn, 10)) {
          state.cStatsSnapshotBusy = false;
          return;
        }
        const r = statsBtn.getBoundingClientRect();
        performElementClick(statsBtn, r.left + r.width * 0.5, r.top + r.height * 0.5, '開啟本局素質', {
          onClicked: () => finishReadAndClose(260),
          onCancelled: () => {
            state.cStatsSnapshotBusy = false;
          },
        });
      };

      if (state.bridgeNoCKey) {
        openViaButtonClick();
        return;
      }
      sendBridgeAction({ type: 'key', key: 'c', holdMs: humanHoldMs(55, 10, 35, 85) }).then((res) => {
        if (res?.ok) {
          finishReadAndClose(240);
        } else if (res?.reason === 'unsupported_key') {
          state.bridgeNoCKey = true;
          openViaButtonClick();
        } else {
          state.cStatsSnapshotBusy = false;
        }
      });
    } catch (_) {
      state.cStatsSnapshotBusy = false;
    }
  }

  function syncRunSlotsFromDom() {
    const slots = readEquippedRunSlots();
    if (!state.run.items) state.run.items = { '藥水': null, '秘藥': null, '祝福': null, '料理': null };
    let changed = false;
    RUN_ITEM_CATEGORIES.forEach((cat) => {
      const s = slots[cat];
      if (!s) return;
      if (s.isEmpty) {
        if (state.run.items[cat]) {
          state.run.items[cat] = null;
          changed = true;
        }
      } else if (s.item && state.run.items[cat] !== s.item.key) {
        state.run.items[cat] = s.item.key;
        changed = true;
      }
    });
    // 同步第 5 格神器 (data-item="deity")
    const artSlot = slots['神器'];
    if (artSlot) {
      if (artSlot.isEmpty) {
        if (state.run.deity) {
          state.run.deity = null;
          state.run.deityLevel = 0;
          changed = true;
        }
      } else if (artSlot.artifact && state.run.deity !== artSlot.artifact.name) {
        state.run.deity = artSlot.artifact.name;
        state.run.deityLevel = artSlot.level || 0;
        changed = true;
      }
    }
    // 同步第 6 格 Lv 20 技能神祇 (button[data-pick-deity] / data-item="skill")
    const skSlot = slots['神祇'];
    if (skSlot) {
      const nextPending = Boolean(skSlot.pending && skSlot.isEmpty);
      if (Boolean(state.run.deityPending) !== nextPending) {
        state.run.deityPending = nextPending;
        changed = true;
      }
      if (!skSlot.isEmpty) {
        if (skSlot.skillName && state.run.skillDeity !== skSlot.skillName) {
          state.run.skillDeity = skSlot.skillName;
          changed = true;
        }
        if ((state.run.skillDeityLevel || 0) !== (skSlot.level || 0)) {
          state.run.skillDeityLevel = skSlot.level || 0;
          changed = true;
        }
      }
    }
    if (changed) {
      saveRunSession();
      updateRunInfo();
    }
    return slots;
  }

  function findSingleCardRerollButton(cardEl, dataIndex) {
    if (!cardEl) return null;
    const isSingleRerollBtn = (btn) => {
      if (!isActionBtnReady(btn)) return false;
      if (btn.closest('#pk-bar') || btn.getAttribute('data-act') === 'bar:0') return false;
      const act = btn.getAttribute('data-act') || '';
      const meta = [btn.innerText, btn.textContent, btn.getAttribute('title'), btn.getAttribute('aria-label')]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, '');
      if (/放逐|專注|banish|focus/i.test(meta)) return false;
      if (/重抽|reroll/i.test(meta) || /:0$/.test(act)) {
        if (/[\(（\[]0[\)）\]]/.test(meta) || /重抽0(?!\d)/.test(meta)) return false;
        return true;
      }
      return false;
    };
    const scope = getCardActionScope(cardEl);
    if (scope) {
      const hit = Array.from(scope.querySelectorAll('.pk-acts .pk-act, .pk-act, button, [role="button"]')).find(isSingleRerollBtn);
      if (hit) return hit;
    }
    if (typeof dataIndex === 'number' && !Number.isNaN(dataIndex)) {
      const scoped = Array.from(document.querySelectorAll(`#picker:not(.hidden) [data-act^="${dataIndex}:"]`)).filter(
        (b) => !isDomElementHiddenClone(b)
      );
      const hit = scoped.find(isSingleRerollBtn);
      if (hit) return hit;
    }
    return null;
  }

  function findRerollAllButton() {
    // 優先使用遊戲正式選擇器 #picker:not(.hidden) #pk-bar [data-act="bar:0"]，嚴防誤抓「自動 (bar:1)」
    const isRerollAllCandidate = (btn, allowBar0 = false) => {
      if (!btn || isOwnHudNode(btn) || !isActionBtnReady(btn)) return false;
      if (btn.closest('.pk-card') || btn.closest('.pk-acts')) return false;
      const act = (btn.getAttribute('data-act') || '').trim();
      if (act === 'bar:1') return false;
      const meta = [btn.innerText, btn.textContent, btn.getAttribute('title'), btn.getAttribute('aria-label')]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, '');
      if (/(?:自動|auto|跳過|略過|放棄|取消|skip|cancel)/i.test(meta) && !/重抽|reroll/i.test(meta)) return false;
      if (!allowBar0 && !/全部重抽|重抽全部|全重抽|全部重骰|rerollall/i.test(meta)) return false;
      if (allowBar0 && act !== 'bar:0' && !/全部重抽|重抽全部|全重抽|全部重骰|重抽|reroll/i.test(meta)) return false;
      if (/[\(（\[]0[\)）\]]/.test(meta) || /0\s*\/\s*0/.test(meta) || /(?:重抽(?:全部)?|全重抽|reroll(?:all)?)0(?!\d)/i.test(meta)) {
        return false;
      }
      return true;
    };
    const barSelectors = [
      '#picker:not(.hidden) #pk-bar [data-act="bar:0"]',
      '[data-act="bar:0"]',
      '#picker:not(.hidden) #pk-bar .pk-act',
      '#picker:not(.hidden) #pk-bar button',
      '#pk-bar .pk-act',
      '#pk-bar button',
    ];
    for (const sel of barSelectors) {
      const nodes = Array.from(document.querySelectorAll(sel));
      const hit = nodes.find((b) => isRerollAllCandidate(b, true));
      if (hit) return hit;
    }
    const scope = document.querySelector('#picker:not(.hidden)') || document;
    const btns = Array.from(scope.querySelectorAll('button, [role="button"]'));
    return btns.find((b) => isRerollAllCandidate(b, false)) || null;
  }

  function findSkipModalButton(cards = []) {
    const scope =
      document.querySelector('#picker:not(.hidden)') ||
      cards[0]?.element?.closest('.modal, .window, .panel, [class*="modal"], [class*="dialog"]') ||
      document;
    return Array.from(scope.querySelectorAll('button, [role="button"]')).find(
      (b) => !isOwnHudNode(b) && isActionBtnReady(b) && /^(?:略過|跳過|放棄|關閉|取消|skip|close|cancel)$/i.test((b.textContent || '').replace(/\s+/g, '').trim())
    ) || null;
  }
  // 詞條同義詞與異體字對應表（避免遊戲寫「暴擊/冷卻/詠唱/攻速/額外目標」導致全數未命中而永遠退回選 1）
  const AFFIX_SYNONYMS = {
    '目標': ['額外目標', '目標數', '目標', '投射物', '發射體', '彈數', '數量', 'targets', 'projectiles'],
    '傷害': ['傷害', '攻擊力', '物攻', '魔攻', 'damage', 'atk', 'matk'],
    '冷卻縮減': ['冷卻縮減', '冷卻時間', '冷卻', '減cd', 'cd縮減', 'cooldown', 'cdr', 'cd'],
    '冷卻': ['冷卻縮減', '冷卻時間', '冷卻', '減cd', 'cd縮減', 'cooldown', 'cdr', 'cd'],
    '詠唱速度': ['詠唱速度', '詠唱時間', '詠唱', '施法速度', '施法時間', '施法', 'cast speed', 'cast time', 'cast'],
    '詠唱': ['詠唱速度', '詠唱時間', '詠唱', '施法速度', '施法時間', '施法', 'cast speed', 'cast time', 'cast'],
    '範圍': ['範圍', '半徑', '大小', '面積', 'aoe', 'area', 'radius'],
    '爆擊': ['爆擊傷害', '暴擊傷害', '爆擊率', '暴擊率', '爆擊', '暴擊', '爆傷', '暴傷', 'crit damage', 'crit rate', 'crit'],
    '暴擊': ['暴擊傷害', '爆擊傷害', '暴擊率', '爆擊率', '暴擊', '爆擊', '暴傷', '爆傷', 'crit damage', 'crit rate', 'crit'],
    '攻擊速度': ['攻擊速度', '攻速', 'aspd', 'attack speed'],
    '穿透': ['穿透', '貫穿', 'pierce', 'piercing'],
    '彈射': ['彈射', '連鎖', '反彈', 'chain', 'bounce', 'ricochet'],
    '拾取範圍': ['拾取範圍', '拾取距離', '採集範圍', '拾取', '採集', 'pickup'],
    '尋寶率': ['尋寶率', '尋寶', '掉寶率', '掉寶', 'discovery', 'magic find'],
    'INT': ['int', '智力'],
    'STR': ['str', '力量'],
    'DEX': ['dex', '靈巧'],
    'VIT': ['vit', '體質'],
    'AGI': ['agi', '敏捷'],
    'LUK': ['luk', '幸運'],
  };

  function getAffixAliases(keyword) {
    const raw = String(keyword || '').trim();
    if (!raw) return [];
    const upper = raw.toUpperCase();
    const mapped = AFFIX_SYNONYMS[raw] || AFFIX_SYNONYMS[upper] || null;
    const list = mapped ? [raw, ...mapped] : [raw];
    const seen = new Set();
    return list
      .map((s) => String(s || '').trim())
      .filter((s) => {
        const k = s.toLowerCase();
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => b.length - a.length);
  }

  function sanitizeTextForAffix(text, keyword) {
    let work = String(text || '');
    const kw = String(keyword || '').trim();
    // 單純尋找「傷害」時，排除「暴擊傷害/爆擊傷害/持續傷害」，避免暴傷卡搶走一般傷害詞條的排名
    if (kw === '傷害') {
      work = work.replace(/(?:暴擊|爆擊|持續|燃燒|中毒|流血|dot)\s*傷害/gi, ' ');
    }
    // 單純尋找技能「範圍」時，排除「拾取範圍/拾取距離」
    if (kw === '範圍') {
      work = work.replace(/(?:拾取|採集)\s*(?:範圍|距離)/gi, ' ');
    }
    return work;
  }

  function escapeRegexLiteral(str) {
    return String(str || '').replace(/[.*+?^$()|[\]\\]/g, '\\$&');
  }

  function buildAliasPattern(alias) {
    const esc = escapeRegexLiteral(alias);
    if (/^[a-z0-9\s]+$/i.test(alias)) {
      return '(?:^|[^a-z0-9])(' + esc + ')(?:[^a-z0-9]|$)';
    }
    return '(' + esc + ')';
  }

  function testKeywordInText(text, keyword) {
    const work = sanitizeTextForAffix(text, keyword);
    if (!work.trim()) return false;
    const aliases = getAffixAliases(keyword);
    for (const alias of aliases) {
      const re = new RegExp(buildAliasPattern(alias), 'i');
      if (re.test(work)) return true;
    }
    return false;
  }

  function parseArrowStatInText(text, precision = 1) {
    if (!text) return null;
    const m = String(text).match(/[+-]\s*(\d+(?:\.\d+)?)\s*%?\s*(?:→|->)\s*(\d+(?:\.\d+)?)\s*%?/);
    if (!m) return null;
    const delta = Math.abs(Number(m[1]) || 0);
    const afterTotal = Math.abs(Number(m[2]) || 0);
    if (!Number.isFinite(afterTotal) || afterTotal <= 0) return null;
    const currentTotal = Math.max(0, roundStatByPrecision(afterTotal - delta, precision));
    return { hasArrow: true, delta, afterTotal, currentTotal };
  }

  function extractKeywordNumericValue(text, keyword) {
    if (!text || !keyword) return 0;
    const work = sanitizeTextForAffix(text, keyword);
    if (!work.trim()) return 0;
    const aliases = getAffixAliases(keyword);
    const clauses = work
      .split(/[·•\n;；,，]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const targets = clauses.length ? clauses : [work];
    let best = 0;
    for (const clause of targets) {
      let clauseMatched = false;
      for (const alias of aliases) {
        const testRe = new RegExp(buildAliasPattern(alias), 'i');
        if (!testRe.test(clause)) continue;
        clauseMatched = true;
        // 優先支援新版「+增量 → 累計總量」格式（如「+15% → 45% 尋寶率」或「+4 → 14 公尺拾取範圍」），取箭頭後累計總量
        const arrowHit = parseArrowStatInText(clause, 0.1);
        if (arrowHit && arrowHit.afterTotal > best) {
          best = arrowHit.afterTotal;
        }
        const esc = escapeRegexLiteral(alias);
        const isAscii = /^[a-z0-9\s]+$/i.test(alias);
        const aliasTok = isAscii ? '(?:\\b' + esc + '\\b)' : esc;
        const regexes = [
          new RegExp('(?:→|->)\s*(\d+(?:\.\d+)?)\s*%?\s*(?:公尺|米|秒|個|次|名|層|m|s)?\s*' + aliasTok, 'gi'),
          new RegExp('[+-]?\\s*(\\d+(?:\\.\\d+)?)\\s*%?\\s*(?:公尺|米|秒|個|次|名|層|m|s)?\\s*' + aliasTok, 'gi'),
          new RegExp(aliasTok + '\\s*[:：]?\\s*[+-]?\\s*(\\d+(?:\\.\\d+)?)\\s*%?', 'gi'),
        ];
        for (const re of regexes) {
          let m;
          while ((m = re.exec(clause)) !== null) {
            const v = Math.abs(Number(m[1]) || 0);
            if (v > best) best = v;
          }
        }
      }
      // 同一詞條子句命中關鍵字（例如「+20% 火箭術傷害」）但中間夾了技能名時，取該子句內的加減數值
      if (clauseMatched && best === 0) {
        const fallbackRe = /(?:[+-]|→|->)\s*(\d+(?:\.\d+)?)\s*%?/g;
        let fm;
        while ((fm = fallbackRe.exec(clause)) !== null) {
          const v = Math.abs(Number(fm[1]) || 0);
          if (v > best) best = v;
        }
      }
    }
    return best;
  }

  function extractMaxNumericBonus(text) {
    if (!text) return 0;
    const re = /(?:[+-]|→|->)\s*(\d+(?:\.\d+)?)\s*%?/g;
    let best = 0;
    let m;
    while ((m = re.exec(String(text))) !== null) {
      const v = Math.abs(Number(m[1]) || 0);
      if (v > best) best = v;
    }
    return best;
  }

  function getCardRarityScore(cardEl, text) {
    const badgeText = (cardEl?.querySelector?.('.pk-badge')?.textContent || '').trim();
    const cls = String(cardEl?.className || '') + ' ' + String(cardEl?.querySelector?.('.pk-badge')?.className || '');
    const check = (str) => {
      if (!str) return 0;
      if (/傳說|神話|(?:^|[^a-z])(?:legendary|mythic)(?:[^a-z]|$)/i.test(str)) return 5;
      if (/史詩|(?:^|[^a-z])epic(?:[^a-z]|$)/i.test(str)) return 4;
      if (/稀有|(?:^|[^a-z])rare(?:[^a-z]|$)/i.test(str)) return 3;
      if (/優良|精良|(?:^|[^a-z])uncommon(?:[^a-z]|$)/i.test(str)) return 2;
      return 0;
    };
    const fromBadge = check(badgeText);
    if (fromBadge) return fromBadge;
    const fromCls = check(cls);
    if (fromCls) return fromCls;
    const fromText = check(String(text || '').slice(0, 140));
    return fromText || 1;
  }

  function getCardRarityLabel(score) {
    return RARITY_TIER_BY_SCORE[score]?.name || '普通';
  }

  function formatCardsSummary(cards) {
    return (cards || [])
      .map((c) => {
        const key = c.hotkey || (c.index + 1);
        const rar = getCardRarityLabel(getCardRarityScore(c.element, `${c.badgeText || ''} ${c.title || ''}`));
        const eff = (c.effectText || c.description || '').replace(/\s+/g, ' ').trim().slice(0, 36);
        return `#${key}${c.title}(${rar}${eff ? '/' + eff : ''})`;
      })
      .join(' | ');
  }

  function getEffectivePlayerStats() {
    const ex = getExtra();
    const inCombat = isInCombat() || Boolean(document.querySelector('#picker:not(.hidden)'));
    const hasBasePickup = ex.basePickupRange !== null && ex.basePickupRange !== undefined && ex.basePickupRange !== '';
    const hasBaseDisc = ex.baseDiscoveryPct !== null && ex.baseDiscoveryPct !== undefined && ex.baseDiscoveryPct !== '';
    const basePickup = hasBasePickup && !Number.isNaN(Number(ex.basePickupRange)) ? Number(ex.basePickupRange) : null;
    const baseDisc = hasBaseDisc && !Number.isNaN(Number(ex.baseDiscoveryPct)) ? Number(ex.baseDiscoveryPct) : null;
    const bonusPickup = inCombat ? (Number(state.run.pickupBonus) || 0) : 0;
    const bonusDisc = inCombat ? (Number(state.run.discoveryBonus) || 0) : 0;
    // 只在副本內計算尋寶率與範圍撿取（主城不開啟角色視窗也不進行主城計算）
    const pickupRange = inCombat ? (basePickup !== null ? basePickup : 0) + bonusPickup : null;
    const discoveryPct = inCombat ? (baseDisc !== null ? baseDisc : 0) + bonusDisc : null;
    const pickupCap = Math.max(0, Number(ex.capPickupMax ?? 40) || 40);
    const discCap = Math.max(0, Number(ex.capDiscoveryMax ?? 300) || 300);
    const pickupCapped = Boolean(inCombat && ex.capPickupEnabled !== false && pickupRange !== null && pickupRange >= pickupCap);
    const discoveryCapped = Boolean(inCombat && ex.capDiscoveryEnabled !== false && discoveryPct !== null && discoveryPct >= discCap);
    return {
      inCombat,
      pickupRange,
      discoveryPct,
      basePickup,
      baseDisc,
      bonusPickup,
      bonusDisc,
      pickupCap,
      discCap,
      pickupCapped,
      discoveryCapped,
    };
  }

  function pruneSameCategoryTrackedStat(mapObj, item) {
    if (!mapObj || !item?.category || !item?.key) return false;
    let removed = false;
    for (const k of Object.keys(mapObj)) {
      if (k !== item.key && RUN_ITEMS_BY_KEY[k]?.category === item.category) {
        delete mapObj[k];
        removed = true;
      }
    }
    return removed;
  }

  function recomputeRunStatTotals() {
    const itemPickupTotal = Object.values(state.run.itemPickupByKey || {}).reduce((acc, v) => acc + (Number(v) || 0), 0);
    const itemDiscTotal = Object.values(state.run.itemDiscByKey || {}).reduce((acc, v) => acc + (Number(v) || 0), 0);
    state.run.pickupBonus = (Number(state.run.skillPickupBonus) || 0) + itemPickupTotal;
    state.run.discoveryBonus = (Number(state.run.skillDiscBonus) || 0) + itemDiscTotal;
  }

  function isStatValidationDebugEnabled() {
    try {
      return Boolean(window.__RO_AUTOPICK_DEBUG__ || CONFIG?.debugStatValidation);
    } catch (_) {
      return false;
    }
  }

  function extractRunItemStatDetail(card, item) {
    if (!card || !item?.key) return { afterTotal: 0, currentTotal: null, delta: 0, hasArrow: false };
    const effectOnly = String(card.effectText || card.description || '').trim();
    const fullText = [card.title, effectOnly].filter(Boolean).join(' ');
    const precision = RUN_ITEM_TIER_SCHEMA[item.key]?.precision || 1;
    if (item.key === 'p_pickup') {
      // 支援新版「+4 → 14 公尺拾取範圍」：同時精準解析 delta=4、afterTotal=14、目前已有 currentTotal=10
      const arrowM = fullText.match(/\+\s*(\d+(?:\.\d+)?)\s*(?:→|->)\s*(\d+(?:\.\d+)?)\s*(?:公尺|米|m)?\s*(?:拾取|範圍)/i);
      if (arrowM) {
        const delta = Math.abs(Number(arrowM[1]) || 0);
        const afterTotal = Math.abs(Number(arrowM[2]) || 0);
        return {
          afterTotal,
          currentTotal: Math.max(0, roundStatByPrecision(afterTotal - delta, precision)),
          delta,
          hasArrow: true,
        };
      }
      const m = fullText.match(/(?:\+\s*(\d+(?:\.\d+)?)\s*(?:公尺|米|m)?\s*(?:拾取|範圍)|拾取(?:範圍|距離)?\s*[:：]?\s*\+?\s*(\d+(?:\.\d+)?))/i);
      const val = m ? Math.abs(Number(m[1] || m[2] || 0)) : 0;
      return { afterTotal: val, currentTotal: null, delta: val, hasArrow: false };
    }
    if (DISCOVERY_ITEM_KEYS.has(item.key)) {
      const clauses = (effectOnly || fullText).split(/[·•\n;；,，]+/).map((s) => s.trim()).filter(Boolean);
      const discClause = clauses.find((c) => /尋寶|掉寶|discovery/i.test(c)) || effectOnly || fullText;
      const arrowHit = parseArrowStatInText(discClause, precision);
      if (arrowHit) {
        return {
          afterTotal: arrowHit.afterTotal,
          currentTotal: arrowHit.currentTotal,
          delta: arrowHit.delta,
          hasArrow: true,
        };
      }
      const val =
        extractKeywordNumericValue(fullText, '尋寶率') ||
        extractKeywordNumericValue(fullText, '尋寶') ||
        extractKeywordNumericValue(fullText, '掉寶') ||
        0;
      return { afterTotal: val, currentTotal: null, delta: val, hasArrow: false };
    }
    const arrowHit = parseArrowStatInText(effectOnly || fullText, precision);
    if (arrowHit) {
      return {
        afterTotal: arrowHit.afterTotal,
        currentTotal: arrowHit.currentTotal,
        delta: arrowHit.delta,
        hasArrow: true,
      };
    }
    const val = extractMaxNumericBonus(effectOnly || fullText);
    return { afterTotal: val, currentTotal: null, delta: val, hasArrow: false };
  }

  function extractRunItemPrimaryValue(card, item) {
    return extractRunItemStatDetail(card, item).afterTotal;
  }

  // 核心層級驗證與自動校正函式：檢查局內道具顯示累計值是否符合該強化階數 (+L) 與品質之數學級距，超界時記錄警告並自動夾限校正
  function validateRunItemStatTier(params = {}) {
    try {
      const item = params.item || (params.itemKey ? RUN_ITEMS_BY_KEY[params.itemKey] : null);
      const schema = item?.key ? RUN_ITEM_TIER_SCHEMA[item.key] : null;
      const source = String(params.source || 'chest');
      const level = params.level !== undefined && params.level !== null
        ? Math.max(0, Math.floor(Number(params.level) || 0))
        : parseRunItemUpgradeLevel(params.title || '');
      const rarityScore = Math.max(1, Math.min(5, Math.floor(Number(params.rarityScore) || 1)));
      const rarityName = getCardRarityLabel(rarityScore);
      const rawNum = Math.abs(Number(params.rawValue));
      if (!schema) {
        return {
          valid: false,
          corrected: false,
          status: 'unknown_item',
          level,
          draws: level + 1,
          rawValue: Number.isFinite(rawNum) ? rawNum : 0,
          clampedValue: Number.isFinite(rawNum) ? rawNum : 0,
          bounds: null,
          reason: '未登錄於 38 項道具級距表',
        };
      }
      const bounds = schema.getBoundsForLevel(level, rarityScore);
      if (!Number.isFinite(rawNum) || rawNum <= 0) {
        return {
          valid: false,
          corrected: false,
          status: 'unparsed',
          level,
          draws: bounds.draws,
          rawValue: 0,
          clampedValue: 0,
          bounds,
          reason: '未解析到有效數值',
        };
      }
      const rawRounded = roundStatByPrecision(rawNum, schema.precision);
      const prevVal = Number(params.prevTrackedValue) || 0;
      let clampedValue = rawRounded;
      let status = 'ok';
      let corrected = false;
      let note = '';

      if (rawRounded < bounds.hardMin) {
        clampedValue = bounds.hardMin;
        status = 'below_min';
        corrected = true;
        note = `低於 +${level} 理論下限 ${bounds.hardMin}`;
      } else if (rawRounded > bounds.hardMax) {
        clampedValue = bounds.hardMax;
        status = 'above_max';
        corrected = true;
        note = `超過 +${level} 理論上限 ${bounds.hardMax}`;
      } else if (level >= 1 && prevVal > 0 && clampedValue < prevVal && prevVal <= bounds.hardMax) {
        clampedValue = roundStatByPrecision(Math.min(bounds.hardMax, Math.max(bounds.hardMin, prevVal)), schema.precision);
        status = 'non_monotonic';
        corrected = true;
        note = `低於前次累計值 ${prevVal}`;
      } else if (rawRounded < bounds.strictMin || rawRounded > bounds.strictMax) {
        status = 'soft_drift';
        note = `落於硬邊界內但偏離${rarityName}估算區間[${bounds.strictMin}~${bounds.strictMax}]`;
      }

      const now = Date.now();
      const recSig = `${source}|${schema.key}|${level}|${rarityScore}|${rawRounded}|${status}`;
      if (!state.statValidationLastSigAt || typeof state.statValidationLastSigAt !== 'object') state.statValidationLastSigAt = {};
      const lastRecAt = Number(state.statValidationLastSigAt[recSig]) || 0;
      if (now - lastRecAt >= 2500) {
        state.statValidationLastSigAt[recSig] = now;
        const time = new Date().toLocaleTimeString('zh-TW', { hour12: false });
        if (!Array.isArray(state.statValidationRecords)) state.statValidationRecords = [];
        if (!state.statValidationStats) state.statValidationStats = { total: 0, ok: 0, softDrift: 0, corrected: 0, invalid: 0 };
        state.statValidationStats.total += 1;
        if (status === 'ok') state.statValidationStats.ok += 1;
        else if (status === 'soft_drift') state.statValidationStats.softDrift += 1;
        else if (corrected) state.statValidationStats.corrected += 1;
        else state.statValidationStats.invalid += 1;
        state.statValidationRecords.unshift({
          time,
          source,
          key: schema.key,
          itemName: schema.displayName,
          unit: schema.unit,
          level,
          draws: bounds.draws,
          rarityScore,
          rarityName,
          rawValue: rawRounded,
          clampedValue,
          hardMin: bounds.hardMin,
          hardMax: bounds.hardMax,
          strictMin: bounds.strictMin,
          strictMax: bounds.strictMax,
          status,
          corrected,
          note,
        });
        if (state.statValidationRecords.length > 100) state.statValidationRecords.pop();
        if (isStatValidationDebugEnabled()) {
          console.debug(
            `[RO-AutoPick 層級校驗] [${source}] ${schema.displayName} +${level}(${rarityName}) 讀值=${rawRounded} 校正=${clampedValue} 硬邊界=[${bounds.hardMin}~${bounds.hardMax}] 品質估算=[${bounds.strictMin}~${bounds.strictMax}] 狀態=${status}${note ? ' (' + note + ')' : ''}`
          );
        }
      }

      if (corrected) {
        if (!state.statWarnLastSigAt || typeof state.statWarnLastSigAt !== 'object') state.statWarnLastSigAt = {};
        const warnSig = `${schema.key}|${level}|${rawRounded}|${clampedValue}`;
        const lastWarnAt = Number(state.statWarnLastSigAt[warnSig]) || 0;
        if (now - lastWarnAt >= 6000) {
          state.statWarnLastSigAt[warnSig] = now;
          addLog(
            `[數值校正] ${schema.displayName} +${level}(${rarityName}) 讀值 ${rawRounded} 超出理論區間 [${bounds.hardMin}~${bounds.hardMax}]，已自動校正為 ${clampedValue}`
          );
        }
      }

      return {
        valid: !corrected,
        corrected,
        status,
        level,
        draws: bounds.draws,
        rawValue: rawRounded,
        clampedValue,
        bounds,
        reason: note || '符合理論級距',
      };
    } catch (err) {
      const fallback = Math.abs(Number(params?.rawValue) || 0);
      return {
        valid: false,
        corrected: false,
        status: 'error',
        level: 0,
        draws: 1,
        rawValue: fallback,
        clampedValue: fallback,
        bounds: null,
        reason: String(err?.message || err),
      };
    }
  }

  // 被動自癒與背景校驗：
  // 1) 對畫面上任何已識別的 38 項局內道具執行層級驗證（僅記於除錯與匯出緩衝區，異常才出警告）
  // 2) 若為「已強化 (+1 以上)」之採集藥水或尋寶道具，以校驗校正後之累計值扣除本張品質上限增量，保守回補目前局內實得下界
  function syncObservedRunItemStat(card, item, rarityScore, upgradeLevel = null) {
    if (!card || !item?.key) return;
    if (!isInCombat() && !document.querySelector('#picker:not(.hidden)')) return;
    const level = upgradeLevel !== null && upgradeLevel !== undefined
      ? Math.max(0, Math.floor(Number(upgradeLevel) || 0))
      : parseRunItemUpgradeLevel(card.title || '');
    const statDetail = extractRunItemStatDetail(card, item);
    const rawPrimaryVal = statDetail.afterTotal;
    if (rawPrimaryVal <= 0) return;

    const prevTracked = item.key === 'p_pickup'
      ? Number(state.run.itemPickupByKey?.[item.key]) || 0
      : DISCOVERY_ITEM_KEYS.has(item.key)
      ? Number(state.run.itemDiscByKey?.[item.key]) || 0
      : 0;
    const check = validateRunItemStatTier({
      item,
      title: card.title,
      level,
      rawValue: rawPrimaryVal,
      rarityScore,
      prevTrackedValue: prevTracked,
      source: 'observe',
    });
    if (level < 1 && !statDetail.hasArrow) return;

    if (!state.run.itemPickupByKey || typeof state.run.itemPickupByKey !== 'object') state.run.itemPickupByKey = {};
    if (!state.run.itemDiscByKey || typeof state.run.itemDiscByKey !== 'object') state.run.itemDiscByKey = {};
    const safeShownVal = check.clampedValue > 0 ? check.clampedValue : rawPrimaryVal;
    const prevLevelBounds = RUN_ITEM_TIER_SCHEMA[item.key]?.getBoundsForLevel(Math.max(0, level - 1), null);
    let inferredCurrent = 0;
    if (statDetail.hasArrow && statDetail.currentTotal !== null && statDetail.currentTotal >= 0) {
      // 新版「+增量 → 累計總量」直接給出精準現有累計值（afterTotal - delta），免推估
      inferredCurrent = statDetail.currentTotal;
      if (prevLevelBounds) {
        inferredCurrent = Math.min(prevLevelBounds.hardMax, Math.max(0, inferredCurrent));
      }
    } else {
      const rollUpper = estimateItemRollUpperBound(item, rarityScore);
      inferredCurrent = Math.max(0, roundStatByPrecision(safeShownVal - rollUpper, RUN_ITEM_TIER_SCHEMA[item.key]?.precision || 1));
      if (prevLevelBounds) {
        inferredCurrent = Math.min(prevLevelBounds.hardMax, inferredCurrent);
      }
    }
    let changed = false;
    if (item.key === 'p_pickup') {
      const prev = Number(state.run.itemPickupByKey[item.key]) || 0;
      if (pruneSameCategoryTrackedStat(state.run.itemPickupByKey, item)) changed = true;
      if ((statDetail.hasArrow && inferredCurrent > 0 && inferredCurrent !== prev) || inferredCurrent > prev) {
        state.run.itemPickupByKey[item.key] = inferredCurrent;
        changed = true;
      }
    }
    if (DISCOVERY_ITEM_KEYS.has(item.key)) {
      const prev = Number(state.run.itemDiscByKey[item.key]) || 0;
      if (pruneSameCategoryTrackedStat(state.run.itemDiscByKey, item)) changed = true;
      if ((statDetail.hasArrow && inferredCurrent > 0 && inferredCurrent !== prev) || inferredCurrent > prev) {
        state.run.itemDiscByKey[item.key] = inferredCurrent;
        changed = true;
      }
    }
    if (changed) {
      recomputeRunStatTotals();
      saveRunSession();
      syncStatCapInputs();
      updateRunInfo();
    }
  }

  function trackPickedCardStatBonus(card, item = null) {
    if (!card) return;
    if (!isInCombat() && !document.querySelector('#picker:not(.hidden)')) return;
    const now = Date.now();
    const fullText = [card.title, card.effectText || card.description].filter(Boolean).join(' ');
    const cardSig = `${item?.key || ''}|${card.title || ''}|${card.effectText || card.description || ''}`;
    // 防止同張卡片於關閉動畫期間重複計數
    if (cardSig && cardSig === state.run.lastTrackedBonusSig && now - (state.run.lastTrackedBonusAt || 0) < 3500) {
      return;
    }
    if (!state.run.itemPickupByKey || typeof state.run.itemPickupByKey !== 'object') state.run.itemPickupByKey = {};
    if (!state.run.itemDiscByKey || typeof state.run.itemDiscByKey !== 'object') state.run.itemDiscByKey = {};
    const rarityScore = getCardRarityScore(card?.element, `${card?.badgeText || ''} ${card?.title || ''}`);
    const upgradeLevel = parseRunItemUpgradeLevel(card?.title || '');
    let changed = false;
    if (item && item.key) {
      // 同欄位只會裝備單一道具，若先前有殘留同分類舊 key 一併清理
      if (pruneSameCategoryTrackedStat(state.run.itemPickupByKey, item)) changed = true;
      if (pruneSameCategoryTrackedStat(state.run.itemDiscByKey, item)) changed = true;
      // 非拾取／尋寶類的已選局內道具亦執行一次層級校驗，供除錯與匯出日誌查核
      if (item.key !== 'p_pickup' && !DISCOVERY_ITEM_KEYS.has(item.key)) {
        const primaryVal = extractRunItemPrimaryValue(card, item);
        if (primaryVal > 0) {
          validateRunItemStatTier({
            item,
            title: card.title,
            level: upgradeLevel,
            rawValue: primaryVal,
            rarityScore,
            source: 'pick',
          });
        }
      }
    }
    const pickedDetail = item && item.key ? extractRunItemStatDetail(card, item) : null;
    if (item?.key === 'p_pickup' || /拾取(?:範圍|距離)|公尺拾取/.test(fullText)) {
      let val = 0;
      if (pickedDetail && item?.key === 'p_pickup' && pickedDetail.afterTotal > 0) {
        val = pickedDetail.afterTotal;
      } else {
        const arrowM = fullText.match(/\+\s*(\d+(?:\.\d+)?)\s*(?:→|->)\s*(\d+(?:\.\d+)?)\s*(?:公尺|米|m)?\s*(?:拾取|範圍)/i);
        if (arrowM) {
          val = Math.abs(Number(arrowM[2]) || 0);
        } else {
          const m = fullText.match(/(?:\+\s*(\d+(?:\.\d+)?)\s*(?:公尺|米|m)?\s*(?:拾取|範圍)|拾取(?:範圍|距離)?\s*[:：]?\s*\+?\s*(\d+(?:\.\d+)?))/i);
          val = m ? Math.abs(Number(m[1] || m[2] || 0)) : (item?.key === 'p_pickup' ? 3 : 0);
        }
      }
      if (val > 0) {
        if (item && item.key) {
          // 局內寶箱道具（如 +4 → 14 公尺拾取範圍）卡片箭頭後數值為「該欄位累計總量」，通過層級校驗後覆寫紀錄
          const prev = Number(state.run.itemPickupByKey[item.key]) || 0;
          const check = validateRunItemStatTier({
            item,
            title: card.title,
            level: upgradeLevel,
            rawValue: val,
            rarityScore,
            prevTrackedValue: prev,
            source: 'pick',
          });
          val = check.clampedValue > 0 ? check.clampedValue : val;
          if (val > prev || (pickedDetail?.hasArrow && val !== prev)) {
            state.run.itemPickupByKey[item.key] = val;
            changed = true;
          }
        } else {
          state.run.skillPickupBonus = (Number(state.run.skillPickupBonus) || 0) + val;
          changed = true;
        }
      }
    }
    if ((item && DISCOVERY_ITEM_KEYS.has(item.key)) || /尋寶(?:率)?|掉寶/.test(fullText)) {
      let val =
        (pickedDetail && item && DISCOVERY_ITEM_KEYS.has(item.key) && pickedDetail.afterTotal > 0 ? pickedDetail.afterTotal : 0) ||
        extractKeywordNumericValue(fullText, '尋寶率') ||
        extractKeywordNumericValue(fullText, '尋寶') ||
        extractKeywordNumericValue(fullText, '掉寶') ||
        (item && DISCOVERY_ITEM_KEYS.has(item.key) ? 15 : 0);
      if (val > 0) {
        if (item && item.key) {
          const prev = Number(state.run.itemDiscByKey[item.key]) || 0;
          const check = validateRunItemStatTier({
            item,
            title: card.title,
            level: upgradeLevel,
            rawValue: val,
            rarityScore,
            prevTrackedValue: prev,
            source: 'pick',
          });
          val = check.clampedValue > 0 ? check.clampedValue : val;
          if (val > prev || (pickedDetail?.hasArrow && val !== prev)) {
            state.run.itemDiscByKey[item.key] = val;
            changed = true;
          }
        } else {
          state.run.skillDiscBonus = (Number(state.run.skillDiscBonus) || 0) + val;
          changed = true;
        }
      }
    }
    if (changed) {
      recomputeRunStatTotals();
      state.run.lastTrackedBonusSig = cardSig;
      state.run.lastTrackedBonusAt = now;
      saveRunSession();
      syncStatCapInputs();
      updateRunInfo();
    }
  }

  function scoreCardsByKeywords(cards, keywordsList, preferredSkillOrder = []) {
    const stats = getEffectivePlayerStats();
    const effectiveKeywords = (keywordsList || []).filter((entry) => {
      const kw = String(entry?.keyword || '').trim();
      if (!kw) return false;
      if (stats.pickupCapped && /拾取|採集/.test(kw)) return false;
      if (stats.discoveryCapped && /尋寶|掉寶/.test(kw)) return false;
      return true;
    });
    const activeKwList = effectiveKeywords.length > 0 ? effectiveKeywords : (keywordsList || []);
    const scored = cards.map((card) => {
      // 只用乾淨的效果詞條文本進行詞條與數值判讀，絕不混入快捷鍵 1/2/3、Lv N 或底部按鈕數字
      const cleanEffect = String(card.effectText || card.description || '').trim();
      const titleText = String(card.title || '').trim();
      const searchText = cleanEffect || titleText;
      let bestRank = 999;
      let matchedCount = 0;
      let totalWeight = 0;
      let primaryVal = 0;
      const matchedLabels = [];
      for (let i = 0; i < activeKwList.length; i++) {
        const kw = String(activeKwList[i]?.keyword || '').trim();
        if (!kw) continue;
        const matchedInEffect = cleanEffect ? testKeywordInText(cleanEffect, kw) : false;
        const matchedInFallback = !matchedInEffect && !cleanEffect && titleText ? testKeywordInText(titleText, kw) : false;
        if (matchedInEffect || matchedInFallback) {
          const val = extractKeywordNumericValue(matchedInEffect ? cleanEffect : titleText, kw);
          if (bestRank === 999) {
            bestRank = i;
            primaryVal = val;
          }
          matchedCount += 1;
          totalWeight += Number(activeKwList[i]?.weight || Math.max(10, 100 - i * 10));
          matchedLabels.push(`#${i + 1}「${kw}」${val ? `(${val})` : ''}`);
        }
      }
      const rarity = getCardRarityScore(card.element, `${card.badgeText || ''} ${titleText}`);
      const itemBonus = extractMaxNumericBonus(searchText);
      const skillRank =
        Array.isArray(preferredSkillOrder) && preferredSkillOrder.length > 0
          ? orderIndex(cardNameOf(card), preferredSkillOrder)
          : 999;
      return { card, bestRank, matchedCount, primaryVal, rarity, totalWeight, itemBonus, skillRank, matchedLabels };
    });
    // 嚴格依設定順位評分：最高順位詞條 -> 同詞條數值 -> 卡片品質(傳說×3>史詩×2>稀有×1.5>優良×1.25>普通×1) -> 複合詞條數 -> 總權重 -> 核心技能順位 -> 最大加值
    scored.sort((a, b) => {
      if (a.bestRank !== b.bestRank) return a.bestRank - b.bestRank;
      if (a.primaryVal !== b.primaryVal) return b.primaryVal - a.primaryVal;
      if (a.rarity !== b.rarity) return b.rarity - a.rarity;
      if (a.matchedCount !== b.matchedCount) return b.matchedCount - a.matchedCount;
      if (a.totalWeight !== b.totalWeight) return b.totalWeight - a.totalWeight;
      if (a.skillRank !== b.skillRank) return a.skillRank - b.skillRank;
      if (a.itemBonus !== b.itemBonus) return b.itemBonus - a.itemBonus;
      return 0;
    });
    return scored[0];
  }

  function findVisibleSwapConfirmButton() {
    try {
      const picker = document.querySelector('#picker:not(.hidden)');
      if (!picker || !isVisible(picker, 40)) return null;
      const candidates = Array.from(
        picker.querySelectorAll('.pk-back button[data-yes], .pk-back .ro-btn.primary, .pk-back button')
      ).filter((btn) => {
        if (!btn || isDomElementHiddenClone(btn)) return false;
        if (btn.hasAttribute('data-no')) return false;
        const txt = (btn.innerText || btn.textContent || '').replace(/\s+/g, '');
        if (!btn.hasAttribute('data-yes') && !/是[，,]?交換|確認交換|確定/i.test(txt)) return false;
        return true;
      });
      for (const btn of candidates) {
        if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') continue;
        const back = btn.closest('.pk-back');
        if (!back || isDomElementHiddenClone(back)) continue;
        const backSt = window.getComputedStyle(back);
        const btnSt = window.getComputedStyle(btn);
        if (
          backSt.display === 'none' ||
          backSt.visibility === 'hidden' ||
          backSt.pointerEvents === 'none' ||
          parseFloat(backSt.opacity) < 0.4 ||
          btnSt.display === 'none' ||
          btnSt.visibility === 'hidden' ||
          btnSt.pointerEvents === 'none' ||
          parseFloat(btnSt.opacity) < 0.4
        ) {
          continue;
        }
        const r = btn.getBoundingClientRect();
        if (r.width < 18 || r.height < 14) continue;
        const cx = r.left + r.width * 0.5;
        const cy = r.top + r.height * 0.5;
        if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) continue;
        // 只有卡片真正翻至背面 (.pk-back) 時，中心點 elementFromPoint 才會命中「是，交換」鈕（未翻面時命中正面 .pk-card）
        const hit = document.elementFromPoint(cx, cy);
        if (hit && (hit === btn || btn.contains(hit))) {
          const promptText = (back.querySelector('b')?.textContent || back.innerText || '').replace(/\s+/g, ' ').trim();
          return { btn, back, promptText, cx, cy };
        }
      }
    } catch (_) {}
    return null;
  }

  function tryConfirmVisibleSwapCard(forceRun = false) {
    if (!forceRun && (!state.autoEnabled || state.paused)) return false;
    if (Date.now() < (state.swapConfirmCooldownUntil || 0)) return false;
    const swapHit = findVisibleSwapConfirmButton();
    if (!swapHit) return false;

    // 內建第 5 格神器順位保護：確認翻面交換前比對「原有神器 vs 目標神器」，絕不以低順位覆蓋高順位或手動鎖定神器
    const ex = getExtra();
    const deityOrder = getJobDeityOrder();
    const deityTopN = Math.max(1, Math.min(13, Number(ex.deityTopN) || 3));
    const manualLockedDeity = getJobLockedDeity();
    const slotScope = swapHit.back?.closest?.('.pk-slot, .pk-pop') || swapHit.back?.parentElement;
    const frontTitleEl = slotScope?.querySelector?.('.pk-card .pk-name, .pk-card .pk-title, .pk-card h3, .pk-card h4, .pk-card b');
    const frontTitle = frontTitleEl?.textContent || state.pendingSwapConfirm?.card?.title || '';
    const parsed = extractSwapPromptDeities(swapHit.promptText || '', frontTitle);
    const effectiveOldDeity = parsed.oldDeity || state.run.deity || '';
    const effectiveNewDeity = parsed.newDeity || normalizeDeityName(frontTitle) || '';

    if (parsed.oldDeity && (!state.run.deity || !deityNamesMatch(state.run.deity, parsed.oldDeity))) {
      state.run.deity = parsed.oldDeity;
      saveRunSession();
      updateRunInfo();
    }

    const oldIdx = effectiveOldDeity ? orderIndex(effectiveOldDeity, deityOrder) : 999;
    const newIdx = effectiveNewDeity ? orderIndex(effectiveNewDeity, deityOrder) : 999;
    const oldInTop = Boolean(effectiveOldDeity) && oldIdx < deityTopN;
    let swapForbiddenReason = '';
    if (effectiveNewDeity && !deityNamesMatch(effectiveOldDeity, effectiveNewDeity)) {
      if (manualLockedDeity) {
        if (!deityNamesMatch(effectiveNewDeity, manualLockedDeity)) {
          swapForbiddenReason = `僅允許交換為手動鎖定神器【${manualLockedDeity}】，拒絕換成【${effectiveNewDeity}】`;
        }
      } else if (oldInTop && newIdx >= oldIdx) {
        swapForbiddenReason = `現有神器【${effectiveOldDeity}】(#${oldIdx + 1}) 順位高於目標【${effectiveNewDeity}】(#${newIdx < 999 ? newIdx + 1 : '?'})，已攔截`;
      } else if (effectiveOldDeity && newIdx >= oldIdx) {
        swapForbiddenReason = `拒絕以較低／同順位【${effectiveNewDeity}】(#${newIdx < 999 ? newIdx + 1 : '?'}) 覆蓋【${effectiveOldDeity}】(#${oldIdx < 999 ? oldIdx + 1 : '?'})`;
      } else if (!effectiveOldDeity && newIdx > 0) {
        swapForbiddenReason = `未識別現有神器且目標【${effectiveNewDeity}】(#${newIdx + 1}) 非第 1 名，為防覆蓋高順位神器已攔截`;
      }
    }

    if (swapForbiddenReason) {
      state.pendingSwapConfirm = null;
      const delay = Math.min(420, Math.max(160, randomHumanDelay()));
      state.swapConfirmCooldownUntil = Date.now() + delay + 1800;
      state.pickingLockUntil = Date.now() + delay + 1800;
      addLog(`[神器交換攔截] ${swapForbiddenReason}`);
      const cancelBtn =
        swapHit.back?.querySelector?.('button[data-no]') ||
        Array.from(swapHit.back?.querySelectorAll?.('button') || []).find((b) => /否|取消|返回|不換|cancel|no/i.test((b.innerText || b.textContent || '').trim()));
      if (cancelBtn && !cancelBtn.disabled) {
        setTimeout(() => {
          if (state.paused || !document.body.contains(cancelBtn)) return;
          const cr = cancelBtn.getBoundingClientRect();
          performElementClick(cancelBtn, cr.left + cr.width * 0.5, cr.top + cr.height * 0.5, '取消神器交換');
          state.lastDomSignature = '';
          setTimeout(() => safeRun(runDetectionCycle, false), 520);
        }, delay);
      } else {
        pauseScript(`偵測到不允許的神器交換（${swapForbiddenReason}），找不到取消鈕已安全暫停`);
      }
      return true;
    }

    const delay = Math.min(480, Math.max(180, randomHumanDelay()));
    state.swapConfirmCooldownUntil = Date.now() + delay + 1600;
    state.pickingLockUntil = Date.now() + delay + 1600;
    const desc = swapHit.promptText ? `【${swapHit.promptText.slice(0, 36)}】` : '神器交換';
    addLog(`[神器交換確認] 偵測到翻面確認 ${desc}，點擊「是，交換」(延遲 ${delay}ms)`);
    setTimeout(() => {
      if (state.paused) return;
      const fresh = findVisibleSwapConfirmButton();
      if (!fresh || !document.body.contains(fresh.btn)) return;
      const acted = performElementClick(fresh.btn, fresh.cx, fresh.cy, '是，交換');
      if (acted) {
        const pending = state.pendingSwapConfirm;
        state.pendingSwapConfirm = null;
        if (pending && Date.now() <= pending.expiresAt) {
          state.pickCount += 1;
          trackPickedCardStatBonus(pending.card, resolveCardRunItem(pending.card));
          if (typeof pending.onDone === 'function') pending.onDone();
        } else if (fresh.promptText) {
          const { newDeity } = extractSwapPromptDeities(fresh.promptText, frontTitle);
          if (newDeity) state.run.deity = newDeity;
        }
        state.lastDomSignature = '';
        saveRunSession();
        updateRunInfo();
        updateStatusBar();
        setTimeout(() => {
          ensureMoveLoopRunning();
          safeRun(runDetectionCycle, false);
        }, 450);
      }
    }, delay);
    return true;
  }

  function clickPickCard(card, tag, reason, onDone) {
    if (state.pendingPickTimer) {
      clearTimeout(state.pendingPickTimer);
      state.pendingPickTimer = null;
    }
    const elapsedSinceShow = Date.now() - (state.lastCardSignatureAppearedAt || 0);
    const minCardSettleMs = Math.max(0, 650 - elapsedSinceShow);
    const delay = Math.max(randomHumanDelay(), minCardSettleMs);
    const displayKey = card.hotkey || (card.index + 1);
    const cardScope = getCardActionScope(card?.element);
    const expectsSwapConfirm = Boolean(
      card?.element?.querySelector?.('.pk-swap') ||
      cardScope?.querySelector?.('.pk-back button[data-yes]')
    );
    state.pickingLockUntil = Date.now() + jitterCooldown(Math.max(delay + 1200, CONFIG.cooldownAfterClickMs));
    state.actionInFlightUntil = Date.now() + delay + 480;
    addLog(`[${tag}] #${displayKey}【${card.title}】— ${reason} (延遲 ${delay}ms)`);
    state.pendingPickTimer = setTimeout(() => {
      state.pendingPickTimer = null;
      if (state.paused) return; // 延遲期間若已暫停就不再點擊
      state.actionInFlightUntil = Date.now() + 450;
      const acted = executeSelectionAction(card.index, card.element, card);
      if (acted === false) return;
      if (expectsSwapConfirm) {
        state.pendingSwapConfirm = {
          card,
          onDone,
          expiresAt: Date.now() + 8000,
        };
        setTimeout(() => {
          if (tryConfirmVisibleSwapCard(false)) return;
          // 若按下後未出現確認翻面且選卡窗已關閉，仍正常完成回呼
          const pickerOpen = Boolean(document.querySelector('#picker:not(.hidden)'));
          if (!pickerOpen && state.pendingSwapConfirm?.card === card) {
            const pending = state.pendingSwapConfirm;
            state.pendingSwapConfirm = null;
            state.pickCount += 1;
            trackPickedCardStatBonus(pending.card, resolveCardRunItem(pending.card));
            if (typeof pending.onDone === 'function') pending.onDone();
            saveRunSession();
            updateRunInfo();
            updateStatusBar();
            setTimeout(ensureMoveLoopRunning, 180);
          }
        }, 520);
        setTimeout(() => safeRun(tryConfirmVisibleSwapCard, false), 1050);
        return;
      }
      state.pickCount += 1;
      trackPickedCardStatBonus(card, resolveCardRunItem(card));
      if (typeof onDone === 'function') onDone();
      saveRunSession();
      updateRunInfo();
      updateStatusBar();
      setTimeout(ensureMoveLoopRunning, 180);
    }, delay);
  }

  function readBtnChargeCount(btn) {
    if (!btn) return null;
    const small = btn.querySelector('small');
    const txt = (small ? small.textContent : btn.textContent || '').trim();
    const m = txt.match(/\d+/);
    return m ? Number(m[0]) : null;
  }

  function triggerBanishCard(card, btn, reason, onDone, verifyCtx = null) {
    const maxChain = Math.max(5, Number(verifyCtx?.maxChain) || 6);
    if ((state.banishChainCount || 0) >= maxChain) {
      state.banishCooldownUntil = Date.now() + 4000;
      addLog(`[連續放逐保護] 單次選卡已連續放逐 ${state.banishChainCount} 次達安全上限，暫停連放以避免異常迴圈`);
      return;
    }
    const delay = randomHumanDelay();
    state.banishInFlight = true;
    state.banishInFlightUntil = Date.now() + delay + 4500;
    state.pickingLockUntil = Date.now() + Math.max(delay + 2400, 3200);
    addLog(`[自動放逐] #${card.index + 1}【${card.title}】— ${reason} (延遲 ${delay}ms)`);
    const releaseBanishLock = (clearSig = true) => {
      state.banishInFlight = false;
      state.banishInFlightUntil = 0;
      if (clearSig) {
        state.lastDomSignature = '';
        state.pickingLockUntil = 0;
      }
    };
    setTimeout(() => {
      if (state.paused) {
        releaseBanishLock(false);
        return;
      }
      // 點擊前再次即時驗證：確認該卡位仍是目標放逐技能，嚴防動畫刷新或位移誤放逐核心技能
      const liveCards = extractDomCards();
      if (!liveCards || liveCards.length < 2) {
        releaseBanishLock(true);
        return;
      }
      let verifiedCard =
        liveCards.find((c) => c.element === card.element) ||
        (card.dataIndex !== null && card.dataIndex !== undefined
          ? liveCards.find((c) => c.dataIndex === card.dataIndex)
          : null) ||
        liveCards[card.index] ||
        null;
      let verifiedName = verifiedCard ? cardNameOf(verifiedCard) : '';
      const isExpectedMatch = (name) => {
        if (!name) return false;
        if (verifyCtx && typeof verifyCtx.matchSkill === 'function') {
          return Boolean(verifyCtx.matchSkill(name));
        }
        return deityNamesMatch(name, cardNameOf(card));
      };
      if (!verifiedCard || !isExpectedMatch(verifiedName)) {
        // 若原卡位內容已變動，檢查其他卡位是否出現相同目標；若無則安全取消並重掃
        const relocated = liveCards.find((c) => isExpectedMatch(cardNameOf(c)));
        if (relocated) {
          verifiedCard = relocated;
          verifiedName = cardNameOf(relocated);
        } else {
          releaseBanishLock(true);
          addLog(`[放逐安全攔截] 點擊前複查發現目標已變更（預期${verifyCtx?.targetDisp || card.title}，現為【${verifiedName || '已消失'}】），已取消點擊並重新掃描`);
          setTimeout(() => safeRun(runDetectionCycle, true), 260);
          return;
        }
      }
      const liveBtn = findBanishButton(verifiedCard.element, verifiedCard.dataIndex);
      if (!liveBtn || !document.body.contains(liveBtn) || !isActionBtnReady(liveBtn)) {
        releaseBanishLock(true);
        state.banishCooldownUntil = Date.now() + 2500;
        addLog(`[放逐安全攔截] 【${verifiedName}】目前無可用放逐鈕，已取消點擊並重新掃描`);
        setTimeout(() => safeRun(runDetectionCycle, true), 260);
        return;
      }
      const beforeSnap = getCurrentCardsSnapshot();
      const beforeInfo = readRemainingBanishCount(liveCards);
      const beforeCount = beforeInfo.known ? beforeInfo.remaining : readBtnChargeCount(liveBtn);
      const r = liveBtn.getBoundingClientRect();
      const acted = performElementClick(
        liveBtn,
        r.left + r.width * 0.5,
        r.top + r.height * 0.5,
        `放逐 #${verifiedCard.index + 1} ${verifiedName}`
      );
      if (!acted) {
        releaseBanishLock(true);
        return;
      }
      // 分段輪詢確認放逐已真正生效（次數下降且目標技能從新卡消失），確認後立刻重掃以連續放逐第二／第三個目標
      const pollDelays = [550, 320, 360, 420];
      const verifyStep = (stepIdx) => {
        if (state.paused) {
          releaseBanishLock(false);
          return;
        }
        const freshCards = extractDomCards();
        const afterSnap = getCurrentCardsSnapshot();
        const afterInfo = readRemainingBanishCount(freshCards || []);
        const afterCount = afterInfo.known ? afterInfo.remaining : readBtnChargeCount(liveBtn);
        const countDecreased = beforeCount !== null && afterCount !== null && afterCount < beforeCount;
        const countUnchanged = beforeCount !== null && afterCount !== null && afterCount >= beforeCount;
        const targetStillPresent = Boolean(
          freshCards &&
          freshCards.length >= 2 &&
          freshCards.some((c) => isExpectedMatch(cardNameOf(c)))
        );
        const cardGone = !document.body.contains(verifiedCard.element) || !isVisible(verifiedCard.element);
        const snapChanged = afterSnap !== beforeSnap;
        const confirmed =
          (countDecreased && (!targetStillPresent || !freshCards || freshCards.length < 2)) ||
          (beforeCount === null && !targetStillPresent && (cardGone || snapChanged));
        if (confirmed) {
          state.banishChainCount = (state.banishChainCount || 0) + 1;
          if (typeof onDone === 'function') onDone();
          saveRunSession();
          updateRunInfo();
          updateStatusBar();
          releaseBanishLock(true);
          if (freshCards && freshCards.length >= 2) {
            const leftStr = afterCount !== null ? `剩餘放逐 ${afterCount} 次` : '放逐次數待讀';
            addLog(`[連續放逐] 已確認放逐【${verifiedName}】（本次第 ${state.banishChainCount} 連放｜${leftStr}），立即複查刷新後的新選項…`);
            setTimeout(() => safeRun(runDetectionCycle, true), humanJitterMs(280, 0.85, 1.25));
          }
          return;
        }
        if (stepIdx + 1 < pollDelays.length) {
          setTimeout(() => verifyStep(stepIdx + 1), pollDelays[stepIdx + 1]);
          return;
        }
        releaseBanishLock(true);
        state.banishCooldownUntil = Date.now() + 2500;
        const reasonNote = countUnchanged
          ? `（放逐次數未減少 ${beforeCount}→${afterCount}）`
          : targetStillPresent
          ? '（該技能仍留在選項中）'
          : '';
        addLog(`[自動放逐異常] #${verifiedCard.index + 1}【${verifiedName}】點擊後未確認生效${reasonNote}，未標記完成（稍後重試）`);
      };
      setTimeout(() => verifyStep(0), pollDelays[0]);
    }, delay);
  }

  function decideAndExecute(cards, modalCtx) {
    const readSig = `${modalCtx.modalType}:${cards.map((c) => `${c.title}|${c.description}`).join('||')}`;
    const isFreshRead = readSig !== state.lastLoggedReadSig || Date.now() - (state.lastLoggedReadAt || 0) > 1800;
    if (isFreshRead) {
      state.lastLoggedReadSig = readSig;
      state.lastLoggedReadAt = Date.now();
      addLog(`[判讀] ${modalCtx.modalType}：${formatCardsSummary(cards)}`);
    }
    if (modalCtx.modalType === '技能神祇') {
      // Lv 20 第 6 格技能神祇（四選一：固定對應身上 4 個技能，選定後每 10 級自動升級）
      const lockedSkillDeity = getJobLockedSkillDeity();
      const skillDeityOrder = getJobSkillDeityOrder();
      const resolveCardSkillName = (c) =>
        resolveSkillNameByIconOrSlug(c.itemKey || '') || cardNameOf(c) || normalizeDeityName(c.title) || c.title;
      let chosen = null;
      let chosenName = '';
      let reason = '';
      if (lockedSkillDeity) {
        chosen = cards.find((c) => deityNamesMatch(resolveCardSkillName(c), lockedSkillDeity)) || null;
        if (chosen) {
          chosenName = resolveCardSkillName(chosen);
          reason = `命中鎖定技能神祇【${chosenName}】（後續每 10 級自動升級）`;
        }
      }
      if (!chosen) {
        let bestRank = Infinity;
        for (const c of cards) {
          const nm = resolveCardSkillName(c);
          const rk = orderIndex(nm, skillDeityOrder);
          if (rk < bestRank) {
            bestRank = rk;
            chosen = c;
            chosenName = nm;
          }
        }
        if (chosen) {
          reason =
            bestRank < 999
              ? `依技能神祇順位 #${bestRank + 1} 選擇【${chosenName}】（後續每 10 級自動升級）`
              : `保底選擇技能神祇【${chosenName}】`;
        }
      }
      if (chosen) {
        clickPickCard(chosen, 'Lv20神祇', reason, () => {
          state.run.skillDeity = chosenName || resolveCardSkillName(chosen);
          state.run.skillDeityLevel = 0;
          state.run.deityPending = false;
        });
      }
      return;
    }
    if (modalCtx.modalType === '寶箱道具') {
      const domSlots = syncRunSlotsFromDom();
      syncActiveDeityFromDom(cards);
      const ex = getExtra();
      const stats = getEffectivePlayerStats();
      if (!state.run.items) state.run.items = { '藥水': null, '秘藥': null, '祝福': null, '料理': null };
      const resolvedItems = new Map();
      cards.forEach((c) => resolvedItems.set(c, resolveCardRunItem(c)));
      const deityCards = cards.filter((c) => !resolvedItems.get(c) && isArtifactCard(c));
      const isMeleeJob = getJobSpec().scaling === 'melee';
      const lockedPotion = getJobLockedItem('藥水');
      const potionSlotEmpty = domSlots['藥水'] ? domSlots['藥水'].isEmpty : !state.run.items?.['藥水'];
      const deityOrder = getJobDeityOrder();
      const deityTopN = Math.max(1, Math.min(13, Number(ex.deityTopN) || 3));
      const manualLockedDeity = getJobLockedDeity();
      const curDeity = state.run.deity || null;
      const curDeityIdx = curDeity ? orderIndex(curDeity, deityOrder) : 999;

      const inDeityList = (name, arr) => Boolean(name) && arr.some((x) => deityNamesMatch(name, x));
      const deityCardMatches = (c, target) =>
        deityNamesMatch(cardNameOf(c), target) || deityNamesMatch(c.title, target);
      const overallTopDeities = deityOrder.slice(0, deityTopN);
      const curInOverallTop = Boolean(curDeity) && inDeityList(curDeity, overallTopDeities);
      const canOverwriteCurDeity = (candName) => {
        if (!curDeity) return true;
        if (manualLockedDeity) return deityNamesMatch(candName, manualLockedDeity);
        const candIdx = orderIndex(candName, deityOrder);
        // 內建第 5 格神器高順位保護：僅允許更高順位（且屬前 N 名）的神器覆蓋較低順位神器
        if (candIdx >= curDeityIdx) return false;
        return inDeityList(candName, overallTopDeities);
      };

      // 步驟 0：自動專注 (Focus)（僅對鎖定／前 N 名神器或採集藥水 p_pickup；每目標本場限 1 次）
      const fc = ex.focusConfig || {};
      if (!Array.isArray(state.run.focusedKeys)) state.run.focusedKeys = [];
      if (fc.enabled !== false && Date.now() > (state.focusCooldownUntil || 0)) {
        const curPotionKey = state.run.items?.['藥水'] || null;
        for (const card of cards) {
          const focusBtn = findFocusButton(card.element, card.dataIndex);
          if (!focusBtn || !isActionBtnReady(focusBtn)) continue;
          const cName = cardNameOf(card);
          let shouldFocus = false;
          let focusReason = '';
          let focusKey = '';
          if (fc.focusDeity !== false && deityCards.includes(card)) {
            const normName = normalizeDeityName(cName);
            focusKey = normName ? `artifact:${normName}` : '';
            if (focusKey && !state.run.focusedKeys.includes(focusKey)) {
              const idx = orderIndex(cName, deityOrder);
              const focusDeityCap = Math.max(0, Number(ex.capDeityMax ?? 10) || 0);
              const focusDomDeityLvl = domSlots['神器'] && !domSlots['神器'].isEmpty ? Number(domSlots['神器'].level) || 0 : 0;
              const focusCardNextLvl = curDeity && deityNamesMatch(cName, curDeity) ? parseRunItemUpgradeLevel(card.title || '') : 0;
              const focusCurDeityLvl = focusDomDeityLvl > 0
                ? Math.max(focusDomDeityLvl, focusCardNextLvl > 0 ? focusCardNextLvl - 1 : 0)
                : Math.max(focusCardNextLvl > 0 ? focusCardNextLvl - 1 : 0, Number(state.run?.deityLevel) || 0);
              const curDeityCappedForFocus = Boolean(
                curDeity &&
                deityNamesMatch(cName, curDeity) &&
                ex.capDeityEnabled !== false &&
                focusDeityCap > 0 &&
                focusCurDeityLvl >= focusDeityCap
              );
              if (curDeityCappedForFocus) {
                // 神器已達設定上限 (+N)：不再浪費專注於已達標神器
              } else if (manualLockedDeity) {
                if (deityNamesMatch(cName, manualLockedDeity)) {
                  shouldFocus = true;
                  focusReason = `鎖定神器【${cName}】`;
                }
              } else if (curDeity) {
                if (deityNamesMatch(cName, curDeity)) {
                  if (curInOverallTop) {
                    shouldFocus = true;
                    focusReason = `前 ${deityTopN} 名目前神器【${cName}】(#${idx + 1})`;
                  }
                } else if (idx >= 0 && idx < deityTopN && idx < curDeityIdx) {
                  shouldFocus = true;
                  focusReason = `高順位神器【${cName}】(#${idx + 1})`;
                }
              } else if (idx >= 0 && idx < deityTopN) {
                shouldFocus = true;
                focusReason = `前 ${deityTopN} 名神器【${cName}】(#${idx + 1})`;
              }
            }
          } else if (fc.focusPotion !== false) {
            const itemObj = resolvedItems.get(card);
            // 僅限「採集藥水 (p_pickup)」，絕不對範圍藥水、傷害藥水等其他藥水按專注
            const isFocusTargetPotion = Boolean(itemObj && itemObj.key === 'p_pickup');
            if (isFocusTargetPotion) {
              focusKey = `item:${itemObj.key}`;
              const blockedByPickupCap = stats.pickupCapped && lockedPotion !== 'p_pickup';
              const blockedByLock = Boolean(lockedPotion && lockedPotion !== itemObj.key);
              const blockedByOtherEquipped = Boolean(!potionSlotEmpty && curPotionKey && curPotionKey !== itemObj.key);
              if (
                !state.run.focusedKeys.includes(focusKey) &&
                !blockedByPickupCap &&
                !blockedByLock &&
                !blockedByOtherEquipped
              ) {
                shouldFocus = true;
                focusReason = `目標藥水【${itemObj.displayName}】`;
              }
            }
          }
          if (shouldFocus && focusKey) {
            const delay = randomHumanDelay();
            state.pickingLockUntil = Date.now() + delay + 1800;
            state.actionInFlightUntil = Date.now() + delay + 900;
            state.focusCooldownUntil = Date.now() + delay + 1600;
            addLog(`[自動專注] 點擊專注鎖定 ${focusReason} (延遲 ${delay}ms)`);
            setTimeout(() => {
              if (state.paused) return;
              const liveFocusBtn = findFocusButton(card.element, card.dataIndex) || focusBtn;
              if (!liveFocusBtn || !document.body.contains(liveFocusBtn)) return;
              const r = liveFocusBtn.getBoundingClientRect();
              performElementClick(liveFocusBtn, r.left + r.width * 0.5, r.top + r.height * 0.5, '專注 ' + cName, {
                onClicked: () => {
                  if (!state.run.focusedKeys.includes(focusKey)) state.run.focusedKeys.push(focusKey);
                  state.focusRetryCount = 0;
                  saveRunSession();
                  setTimeout(() => {
                    state.actionInFlightUntil = 0;
                    state.lastDomSignature = '';
                    safeRun(runDetectionCycle, false);
                  }, 420);
                },
                onCancelled: () => {
                  state.focusRetryCount = (state.focusRetryCount || 0) + 1;
                  if (state.focusRetryCount >= 2) {
                    if (!state.run.focusedKeys.includes(focusKey)) state.run.focusedKeys.push(focusKey);
                    state.focusRetryCount = 0;
                  } else {
                    state.focusCooldownUntil = Date.now() + 260;
                  }
                  setTimeout(() => {
                    state.actionInFlightUntil = 0;
                    state.pickingLockUntil = 0;
                    state.lastDomSignature = '';
                    safeRun(runDetectionCycle, false);
                  }, 320);
                },
              });
            }, delay);
            return;
          }
        }
      }

      // 步驟 0.5：若使用者主動開啟「自動寶箱」（預設關閉），且四格永久道具全滿 ＋ 目標神器定型 ＋ 拾取／尋寶上限皆達標，交由遊戲內建「自動寶箱」接手
      if (ex.useNativeAutoChest === true && Date.now() > (state.rerollCooldownUntil || 0)) {
        const allFourFilled = RUN_ITEM_CATEGORIES.every((cat) => {
          const domS = domSlots[cat];
          if (domS) return !domS.isEmpty;
          return Boolean(state.run.items?.[cat]);
        });
        const pickupReady = ex.capPickupEnabled === false || stats.pickupCapped;
        const discReady = ex.capDiscoveryEnabled === false || stats.discoveryCapped;
        const deityReady = Boolean(curDeity && (manualLockedDeity ? deityNamesMatch(curDeity, manualLockedDeity) : curInOverallTop));
        if (allFourFilled && pickupReady && discReady && deityReady) {
          const nativeAutoChestBtn = findNativeAutoChestButton();
          if (nativeAutoChestBtn) {
            const delay = randomHumanDelay();
            state.pickingLockUntil = Date.now() + jitterCooldown(Math.max(delay + 1500, CONFIG.cooldownAfterClickMs));
            state.actionInFlightUntil = Date.now() + delay + 950;
            state.rerollCooldownUntil = Date.now() + delay + 2500;
            addLog(`[寶箱自動接手] 四格已滿、神器已定型且上限達標，點擊遊戲內建「自動寶箱」 (延遲 ${delay}ms)`);
            setTimeout(() => {
              if (state.paused || !document.body.contains(nativeAutoChestBtn)) return;
              const r = nativeAutoChestBtn.getBoundingClientRect();
              performElementClick(nativeAutoChestBtn, r.left + r.width * 0.5, r.top + r.height * 0.5, '遊戲內建自動寶箱', {
                onClicked: () => {
                  setTimeout(() => {
                    state.actionInFlightUntil = 0;
                    state.lastDomSignature = '';
                  }, 520);
                  setTimeout(ensureMoveLoopRunning, 220);
                },
                onCancelled: () => {
                  state.actionInFlightUntil = 0;
                  state.lastDomSignature = '';
                },
              });
            }, delay);
            return;
          }
        }
      }

      // 步驟 1：統一三卡全局評分（4 格永久道具 + 第 5 格 13 件神器，第 6 格 Lv 20 技能神祇已獨立不進寶箱）
      const CAT_TIE_WEIGHT = { '神器': 0, '藥水': 1, '祝福': 2, '秘藥': 3, '料理': 4, '': 5 };
      const TIER_BADGE = { 0: 'S', 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: '過渡', 6: '保底', 9: '禁選' };
      const preEmptyCount = RUN_ITEM_CATEGORIES.filter((cat) =>
        domSlots[cat] ? domSlots[cat].isEmpty && !state.run.items?.[cat] : !state.run.items?.[cat]
      ).length;
      const preEffectivePotionEmpty = Boolean(
        !state.run.items?.['藥水'] && (!domSlots['藥水'] || domSlots['藥水'].isEmpty)
      );
      const preNeedsPickupUpgrade = Boolean(
        !preEffectivePotionEmpty &&
        state.run.items?.['藥水'] === 'p_pickup' &&
        ex.prioritizePickupPotion !== false &&
        !stats.pickupCapped &&
        (!lockedPotion || lockedPotion === 'p_pickup')
      );
      const liveCStats = state.run?.cStats || null;

      const evaluateChestCard = (card) => {
        const rarity = getCardRarityScore(card?.element, `${card?.badgeText || ''} ${card?.title || ''}`);
        const bonus = extractMaxNumericBonus(card?.effectText || card?.description || '');
        const isDeity = deityCards.includes(card);
        if (isDeity) {
          const name = cardNameOf(card) || normalizeDeityName(card.title) || card.title;
          const rank = orderIndex(name, deityOrder);
          const normRank = rank < 0 ? 999 : rank;
          const cardScope = getCardActionScope(card?.element);
          const swapBadgeEl = card?.element?.querySelector?.('.pk-swap');
          const cardHasSwapBadge = Boolean(
            (swapBadgeEl && !isDomElementHiddenClone(swapBadgeEl)) ||
            (cardScope && cardScope.querySelector?.('.pk-back button[data-yes]'))
          );
          const isCur = Boolean(!cardHasSwapBadge && curDeity && deityCardMatches(card, curDeity));
          const isManualHit = Boolean(manualLockedDeity && deityCardMatches(card, manualLockedDeity));
          const isOverallTop = inDeityList(name, overallTopDeities);
          const canOverwrite = canOverwriteCurDeity(name);
          const domDeityLvl = domSlots['神器'] && !domSlots['神器'].isEmpty ? Number(domSlots['神器'].level) || 0 : 0;
          const cardDeityLvl = isCur ? parseRunItemUpgradeLevel(card.title || '') : 0;
          const inferredFromCard = cardDeityLvl > 0 ? Math.max(0, cardDeityLvl - 1) : 0;
          const curDeityLevel = domDeityLvl > 0
            ? Math.max(domDeityLvl, inferredFromCard)
            : Math.max(inferredFromCard, Number(state.run?.deityLevel) || 0);
          const deityCap = Math.max(0, Number(ex.capDeityMax ?? 10) || 0);
          const deityCapOn = ex.capDeityEnabled !== false && deityCap > 0;
          const isCappedDeity = Boolean(isCur && deityCapOn && curDeityLevel >= deityCap);
          const unknownSwapRisk = Boolean(
            cardHasSwapBadge &&
            !curDeity &&
            (manualLockedDeity ? !isManualHit : normRank > 0)
          );
          const isProtectedBlock = Boolean(
            unknownSwapRisk ||
            (curDeity && !isCur && !canOverwrite)
          );
          let tier = 4;
          let subPriority = 0;
          let deityCapDemoted = false;
          let pickTag = '神器';
          let reason = `非前 ${deityTopN} 神器【${name}】`;
          let onPick = () => { state.run.deity = name; state.run.deityLevel = 0; };

          if (isProtectedBlock) {
            tier = 9;
            subPriority = 0;
            reason = curDeity
              ? `內建順位保護：保留【${curDeity}】，不換成【${name}】`
              : `偵測到【${name}】將取代未知現有神器，已安全略過`;
          } else if (isManualHit && !isCur) {
            tier = 0;
            subPriority = 1;
            pickTag = curDeity || cardHasSwapBadge ? '神器升級' : '神器';
            reason = curDeity ? `換上鎖定神器【${name}】取代【${curDeity}】` : `命中鎖定神器【${name}】`;
          } else if (isCur) {
            if (isManualHit || curInOverallTop) {
              if (isCappedDeity) {
                tier = 3;
                subPriority = 2;
                deityCapDemoted = true;
                reason = `神器【${curDeity}】已達 +${curDeityLevel} (≥+${deityCap})，讓位給四格永久道具`;
              } else if (deityCapOn) {
                tier = 1;
                subPriority = 0;
                reason = isManualHit
                  ? `升級鎖定神器【${curDeity}】(+${curDeityLevel}→+${curDeityLevel + 1}，目標 +${deityCap})`
                  : `升級前 ${deityTopN} 名神器【${curDeity}】(+${curDeityLevel}→+${curDeityLevel + 1}，目標 +${deityCap})`;
              } else if (preEmptyCount > 0 && curDeityLevel >= 3) {
                tier = 2;
                subPriority = 2;
                reason = `神器【${curDeity}】已達 +${curDeityLevel} 且尚有 ${preEmptyCount} 空欄，讓位先補四格`;
              } else if (preEmptyCount > 0) {
                tier = 1;
                subPriority = 2;
                reason = `升級神器【${curDeity}】(+${curDeityLevel}→+${curDeityLevel + 1}，禮讓同場第 1 名空欄道具)`;
              } else if (preNeedsPickupUpgrade && curDeityLevel >= 3) {
                tier = 2;
                subPriority = 2;
                reason = `神器【${curDeity}】已達 +${curDeityLevel}，禮讓採集藥水達標 (${stats.pickupRange}/${stats.pickupCap})`;
              } else {
                tier = 1;
                subPriority = 0;
                reason = isManualHit
                  ? `升級鎖定神器【${curDeity}】(+${curDeityLevel})`
                  : `升級前 ${deityTopN} 名神器【${curDeity}】(+${curDeityLevel})`;
              }
            } else {
              tier = 4;
              subPriority = 0;
              reason = `過渡神器【${curDeity}】升級（順位低於四格目標與前 ${deityTopN} 神器）`;
            }
            onPick = () => { state.run.deityLevel = Math.max(curDeityLevel + 1, cardDeityLvl || 0); };
          } else if (!manualLockedDeity && isOverallTop && canOverwrite) {
            const isFirstRankDeity = normRank === 0;
            tier = isFirstRankDeity ? 0 : 1;
            subPriority = isFirstRankDeity ? 2 : 0;
            pickTag = curDeity ? '神器替換' : '神器';
            reason = curDeity
              ? `刷出更高順位${isFirstRankDeity ? '第 1 名' : `前 ${deityTopN} 名`}神器【${name}】，替換【${curDeity}】`
              : `命中${isFirstRankDeity ? '第 1 名' : `前 ${deityTopN} 名`}神器【${name}】`;
          } else {
            tier = 4;
            subPriority = 0;
            reason = `非前 ${deityTopN} 名神器【${name}】（過渡用，不搶四格道具）`;
          }
          return {
            card, kind: 'deity', cat: '神器', name, item: null, tier, subPriority, rank: normRank,
            rarity, bonus, statNeedScore: 0, slotEmpty: !curDeity, isForbidden: tier === 9, isProtectedDeityBlock: isProtectedBlock,
            cappedDemoted: deityCapDemoted, rerollable: ex.rerollForDeity !== false, pickTag, reason, onPick,
          };
        }

        const item = resolvedItems.get(card);
        if (!item) {
          return {
            card, kind: 'unknown', cat: '', name: card.title || '未知道具', item: null, tier: 6, subPriority: 0, rank: 999,
            rarity, bonus, slotEmpty: false, isForbidden: false, isProtectedDeityBlock: false,
            cappedDemoted: false, rerollable: true, pickTag: '本地寶箱', reason: '未知道具保底', onPick: () => {},
          };
        }
        const cat = item.category;
        const order = getJobItemOrder(cat);
        const rawRank = order.indexOf(item.key);
        const rank = rawRank < 0 ? 999 : rawRank;
        const topN = Math.max(1, Math.min(12, Number(ex.itemTopNByCat?.[cat]) || 1));
        const lockedKey = getJobLockedItem(cat);
        const curKey = state.run.items?.[cat] || null;
        const domSlot = domSlots[cat];
        // 四格非神祇欄位（藥水／祝福／秘藥／料理）一旦裝備即不可取代，後續只會開出已裝備道具之升級卡：
        // 1) 卡片含 +1 以上強化階數 / Lv.2+ / 等級2+（嚴格排除首次出現的 +0），或該欄位 DOM 非空且無「新！」標記 → 必為目前裝備中之道具，直接自癒同步並禁止當空欄重抽
        // 2) 反之若卡片明確有「新！」標記、無 +1 以上升級字樣、且 DOM 未顯示佔用 → 該欄位確實為空，清除可能殘留的舊紀錄
        const upgradeLevel = parseRunItemUpgradeLevel(card.title || '');
        const cardHasUpgradeLevel = upgradeLevel >= 1;
        const cardMarkedNew = cardIsNew(card);
        const inferredEmptyByNewBadge = Boolean(cardMarkedNew && !cardHasUpgradeLevel && (!domSlot || domSlot.isEmpty));
        const inferredEquippedThis = Boolean(
          cardHasUpgradeLevel ||
          (!cardMarkedNew && domSlot && !domSlot.isEmpty) ||
          (!cardMarkedNew && !domSlot && curKey && curKey === item.key)
        );
        syncObservedRunItemStat(card, item, rarity, upgradeLevel);
        if (inferredEquippedThis && state.run.items[cat] !== item.key) {
          state.run.items[cat] = item.key;
          saveRunSession();
        } else if (inferredEmptyByNewBadge && state.run.items[cat]) {
          state.run.items[cat] = null;
          saveRunSession();
        }
        const effectiveCurKey = inferredEmptyByNewBadge ? null : (state.run.items?.[cat] || curKey || (inferredEquippedThis ? item.key : null));
        const slotEmpty = inferredEquippedThis ? false : (inferredEmptyByNewBadge ? true : (domSlot ? domSlot.isEmpty : !effectiveCurKey));
        const isSameAsEquipped = Boolean(!slotEmpty && (inferredEquippedThis || (effectiveCurKey && effectiveCurKey === item.key)));
        const isSlotOccupiedByOther = Boolean(!slotEmpty && !isSameAsEquipped);
        const isCandLocked = Boolean(lockedKey && item.key === lockedKey);
        const isCandFirst = !lockedKey && rank === 0;
        const isCandTop = !lockedKey && rank >= 0 && rank < topN;
        const isForbiddenMelee = Boolean(item.meleeOnly && !isMeleeJob);
        const isCappedPickup = Boolean(stats.pickupCapped && item.key === 'p_pickup' && !isCandLocked);
        const isCappedDiscovery = Boolean(stats.discoveryCapped && DISCOVERY_ITEM_KEYS.has(item.key) && !isCandLocked);
        const cappedDemoted = isCappedPickup || isCappedDiscovery;
        const isPickupPriority = Boolean(
          item.key === 'p_pickup' &&
          ex.prioritizePickupPotion !== false &&
          !stats.pickupCapped &&
          (!lockedPotion || lockedPotion === 'p_pickup')
        );
        const isPollutingPickupSlot = Boolean(
          slotEmpty &&
          cat === '藥水' &&
          item.key !== 'p_pickup' &&
          !isCandLocked &&
          ex.prioritizePickupPotion !== false &&
          !stats.pickupCapped &&
          (!lockedPotion || lockedPotion === 'p_pickup')
        );

        let tier = 4;
        let subPriority = 1;
        let reason = `${cat} #${rank < 999 ? rank + 1 : '?'}【${item.displayName}】`;
        if (isSlotOccupiedByOther) {
          tier = 9;
          subPriority = 2;
          reason = `${cat}欄位已裝【${(effectiveCurKey && RUN_ITEMS_BY_KEY[effectiveCurKey]?.displayName) || effectiveCurKey || '他物'}】（不可覆蓋）`;
        } else if (isForbiddenMelee) {
          tier = 6;
          subPriority = 1;
          reason = `近戰專用【${item.displayName}】（非近戰略過）`;
        } else if (slotEmpty && isPickupPriority) {
          // S 級最高優先：空欄採集藥水 ≥ 鎖定神祇
          tier = 0;
          subPriority = 0;
          reason = '空欄命中【採集藥水】，最高優先立即選擇';
        } else if (slotEmpty && (isCandLocked || (isCandFirst && !cappedDemoted))) {
          // A 級必拿：空欄命中鎖定或第一名祝福／秘藥／料理／藥水（不可逆空欄優先鎖定好道具，絕不洗掉）
          tier = 1;
          subPriority = 1;
          reason = isCandLocked ? `空欄命中鎖定${cat}【${item.displayName}】` : `空欄命中第 1 名${cat}【${item.displayName}】`;
        } else if (isSameAsEquipped && isPickupPriority) {
          tier = 2;
          subPriority = 0;
          reason = '升級【採集藥水】（未達拾取上限）';
        } else if (slotEmpty && isCandTop && !cappedDemoted) {
          tier = 2;
          subPriority = 1;
          reason = `空欄命中前 ${topN} 名${cat}【${item.displayName}】`;
        } else if (isSameAsEquipped && isCandLocked && !cappedDemoted) {
          // 已裝之鎖定非藥水道具：列 C 級 sub 0（高於一般已裝與暫時性非前三神祇，但不阻擋空欄重抽找採集藥水，亦不搶空欄前 N 好卡）
          tier = 3;
          subPriority = 0;
          reason = `升級已裝備鎖定${cat}【${item.displayName}】`;
        } else if (isSameAsEquipped && !cappedDemoted) {
          tier = 3;
          subPriority = 1;
          reason = `升級已裝備${cat}【${item.displayName}】`;
        } else if (isSameAsEquipped && cappedDemoted) {
          tier = 3;
          subPriority = 3;
          reason = isCappedPickup
            ? `拾取已達 ${stats.pickupRange} (≥${stats.pickupCap})，降權升級【${item.displayName}】`
            : `尋寶已達 ${stats.discoveryPct}% (≥${stats.discCap}%)，降權升級【${item.displayName}】`;
        } else if (slotEmpty && cappedDemoted) {
          tier = 4;
          subPriority = 2;
          reason = isCappedPickup ? `拾取已達上限，略過空欄【${item.displayName}】` : `尋寶已達上限，略過空欄【${item.displayName}】`;
        } else if (isPollutingPickupSlot) {
          // 藥水欄尚空且想等採集藥水時，其他藥水列 D 級最後手段，避免永久卡死藥水欄
          tier = 4;
          subPriority = 3;
          reason = `藥水欄尚空且未見採集藥水，避開【${item.displayName}】避免永久卡死藥水欄`;
        } else {
          tier = 4;
          subPriority = 1;
          reason = lockedKey
            ? `${cat}空欄未見鎖定【${RUN_ITEMS_BY_KEY[lockedKey]?.displayName || lockedKey}】`
            : `${cat}空欄非前 ${topN} 名【${item.displayName}】`;
        }

        const statNeedScore = computeChestItemStatNeedBonus(item, liveCStats);
        return {
          card, kind: 'item', cat, name: item.displayName, item, tier, subPriority, rank,
          rarity, bonus, statNeedScore, slotEmpty, isForbidden: tier === 9, isProtectedDeityBlock: false,
          cappedDemoted, rerollable: ex.rerollItemByCat?.[cat] !== false,
          pickTag: `寶箱-${cat}`, reason,
          onPick: () => { if (!state.run.items[cat]) state.run.items[cat] = item.key; },
        };
      };

      const compareChestEvals = (a, b) => {
        if (a.tier !== b.tier) return a.tier - b.tier;
        if (a.subPriority !== b.subPriority) return a.subPriority - b.subPriority;
        const sameItemKey = Boolean(a.item?.key && b.item?.key && a.item.key === b.item.key);
        // Tier 3（既有裝備升級）：優先比品質（決定本次單抽實際增量），同品質再參考 C 面板素質缺口，最後比設定順位與類別權重
        if (a.tier === 3) {
          if ((b.rarity || 0) !== (a.rarity || 0)) return (b.rarity || 0) - (a.rarity || 0);
          if ((b.statNeedScore || 0) !== (a.statNeedScore || 0)) return (b.statNeedScore || 0) - (a.statNeedScore || 0);
          if (a.rank !== b.rank) return a.rank - b.rank;
          const cwA = CAT_TIE_WEIGHT[a.cat] ?? 5;
          const cwB = CAT_TIE_WEIGHT[b.cat] ?? 5;
          if (cwA !== cwB) return cwA - cwB;
          if (sameItemKey || (!a.item && !b.item)) {
            return (b.bonus || 0) - (a.bonus || 0);
          }
          return 0;
        }
        // 其他等級：同順位比品質，其次參考 C 面板素質缺口與類別；僅相同道具（同單位）才比對數值
        if (a.rank !== b.rank) return a.rank - b.rank;
        if ((b.rarity || 0) !== (a.rarity || 0)) return (b.rarity || 0) - (a.rarity || 0);
        if ((b.statNeedScore || 0) !== (a.statNeedScore || 0)) return (b.statNeedScore || 0) - (a.statNeedScore || 0);
        const cwA = CAT_TIE_WEIGHT[a.cat] ?? 5;
        const cwB = CAT_TIE_WEIGHT[b.cat] ?? 5;
        if (cwA !== cwB) return cwA - cwB;
        if (sameItemKey || (!a.item && !b.item)) {
          return (b.bonus || 0) - (a.bonus || 0);
        }
        return 0;
      };

      const evals = cards.map(evaluateChestCard).sort(compareChestEvals);
      const bestEval = evals[0];
      const emptyCount = RUN_ITEM_CATEGORIES.filter((cat) => (domSlots[cat] ? domSlots[cat].isEmpty && !state.run.items?.[cat] : !state.run.items?.[cat])).length;
      const effectivePotionSlotEmpty = Boolean(
        !state.run.items?.['藥水'] &&
        (!domSlots['藥水'] || domSlots['藥水'].isEmpty) &&
        !evals.some((e) => e.kind === 'item' && e.cat === '藥水' && !e.slotEmpty)
      );
      const evalSummary = evals
        .map((e) => `#${e.card.index + 1}${e.name}(${TIER_BADGE[e.tier] || e.tier}·${getCardRarityLabel(e.rarity)})`)
        .join(' ＞ ');
      if (isFreshRead) {
        addLog(`[三卡評估] ${evalSummary}`);
      }

      // 輔助：單卡重抽嚴格限制「僅限確定為空欄的不想要道具，或可替換之非目標神祇」，絕不對任何已裝備非神祇欄位重抽（已裝備四格重抽永遠只會出同道具）
      const findBestSingleChestReroll = (opts = {}) => {
        if (ex.chestSingleRerollItem === false) return null;
        const { potionOnly = false, allowDeity = false } = opts;
        // 順位 1：藥水欄尚空時的不想要藥水 → 單卡重抽直接於藥水池洗採集藥水
        if (effectivePotionSlotEmpty && ex.rerollItemByCat?.['藥水'] !== false) {
          for (const e of evals) {
            if (e.kind !== 'item' || e.cat !== '藥水' || !e.slotEmpty || state.run.items?.['藥水'] || e.tier < 4) continue;
            const btn = findSingleCardRerollButton(e.card.element, e.card.dataIndex);
            if (btn && isActionBtnReady(btn)) return { evalItem: e, btn, mode: 'potion' };
          }
        }
        if (potionOnly) return null;
        // 順位 2：可覆蓋之非目標／受保護阻擋神祇 → 唯有神祇欄位可替換，單卡重抽可洗出鎖定／總排前三神祇
        if (allowDeity && ex.rerollForDeity !== false) {
          for (const e of evals) {
            if (e.kind !== 'deity' || e.tier < 3 || e.cappedDemoted) continue;
            const btn = findSingleCardRerollButton(e.card.element, e.card.dataIndex);
            if (btn && isActionBtnReady(btn)) return { evalItem: e, btn, mode: 'deity' };
          }
        }
        // 順位 3：其他確定空欄的不想要祝福／秘藥／料理
        for (const e of evals) {
          if (e.kind !== 'item' || !e.slotEmpty || e.tier < 4 || !e.rerollable) continue;
          if (state.run.items?.[e.cat] || (domSlots[e.cat] && !domSlots[e.cat].isEmpty)) continue;
          const btn = findSingleCardRerollButton(e.card.element, e.card.dataIndex);
          if (btn && isActionBtnReady(btn)) return { evalItem: e, btn, mode: e.cat === '藥水' ? 'potion' : 'empty_item' };
        }
        return null;
      };
      const triggerChestRerollBtn = (btn, clickLabel, logMsg) => {
        const delay = randomHumanDelay();
        // 確保重抽點擊發送前不重複掃描、發送後給予動畫刷新緩衝，避免誤觸「重抽煞車」與洗日誌
        state.actionInFlightUntil = Date.now() + delay + 550;
        state.rerollCooldownUntil = Date.now() + delay + 1350;
        state.pickingLockUntil = Date.now() + delay + 1700;
        state.lastRerollBrakeLoggedAt = 0;
        addLog(`${logMsg} (延遲 ${delay}ms)`);
        setTimeout(() => {
          if (state.paused || !document.body.contains(btn)) {
            state.actionInFlightUntil = 0;
            return;
          }
          const r = btn.getBoundingClientRect();
          performElementClick(btn, r.left + r.width * 0.5, r.top + r.height * 0.5, clickLabel, {
            onClicked: () => {
              state.rerollClickedAt = Date.now();
              setTimeout(() => {
                state.actionInFlightUntil = 0;
                state.lastDomSignature = '';
              }, 340);
            },
            onCancelled: () => {
              state.actionInFlightUntil = 0;
              state.rerollCooldownUntil = Date.now() + 250;
              state.lastRerolledChestSig = '';
              state.lastDomSignature = '';
            },
          });
        }, delay);
      };

      // 步驟 2：全局重抽判定
      // - 最高保護（絕不洗掉）：採集藥水 (tier === 0)、手動鎖定神祇 (tier === 0)、總排前 N 神祇 (kind === 'deity' && tier <= 1)
      // - 開局積極刷藥水（藥水欄尚空且未達拾取上限）：只要場上沒有採集藥水或鎖定／總排前 N 神祇，即優先「全部重抽」找採集藥水，不被空欄料理／秘藥／祝福卡住
      // - 已裝採集藥水但未達拾取上限：當場上無 S/A/B 級好卡 (bestEval.tier >= 3) 且開啟積極刷藥水，也會「全部重抽」積極衝採集藥水升級
      // - 嚴禁針對「已裝備非神祇類別」單卡重抽（藥水／祝福／秘藥／料理一旦裝備即鎖死同道具）
      const chestItemsSig = evals.map((e) => `${e.cat}:${e.item?.key || e.name}`).sort().join('|');
      // 若重抽已確實刷新出不同卡片且已過動畫緩衝，提早結束等待冷卻；否則靜待冷卻結束（絕不在等待中誤報「重抽煞車」）
      const rerollAlreadyRefreshed = Boolean(
        state.lastRerolledChestSig &&
        chestItemsSig !== state.lastRerolledChestSig &&
        Date.now() - (state.rerollClickedAt || 0) >= 320
      );
      if (Date.now() <= state.rerollCooldownUntil && !rerollAlreadyRefreshed) {
        return;
      }
      const isDuplicateRerollResult = Boolean(
        state.lastRerolledChestSig &&
        state.lastRerolledChestSig === chestItemsSig &&
        Date.now() - (state.lastRerolledChestAt || 0) < 12000
      );
      if (isDuplicateRerollResult && state.lastRerollBrakeLoggedAt !== state.lastRerolledChestAt) {
        state.lastRerollBrakeLoggedAt = state.lastRerolledChestAt;
        addLog('[重抽煞車] 重抽後三卡道具組成與上次相同（欄位已鎖定為既有道具），停止重抽改為直接選擇');
      }
      if (!isDuplicateRerollResult && bestEval) {
        // 方案 A 大獎保護：掃描全部三張卡，只要任一張為「採集藥水」、「手動鎖定／總排前 N 名神祇」或「空欄第 1 名／鎖定之秘藥・祝福・料理」，一律先收下絕不用「全部重抽」洗掉
        const hasJackpotProtect = evals.some(
          (e) =>
            !e.isForbidden &&
            (e.tier === 0 || (e.kind === 'deity' && e.tier <= 1) || (e.kind === 'item' && e.slotEmpty && e.tier <= 1))
        );
        const wantPickupPotionEmpty = Boolean(
          effectivePotionSlotEmpty &&
          !stats.pickupCapped &&
          (!lockedPotion || lockedPotion === 'p_pickup') &&
          ex.rerollItemByCat?.['藥水'] !== false
        );
        const wantPickupPotionUpgrade = Boolean(
          !effectivePotionSlotEmpty &&
          state.run.items?.['藥水'] === 'p_pickup' &&
          !stats.pickupCapped &&
          (!lockedPotion || lockedPotion === 'p_pickup') &&
          ex.rerollItemByCat?.['藥水'] !== false &&
          ex.aggressivePotionReroll !== false
        );
        const hasUnwantedPotionCard = evals.some((e) => e.kind === 'item' && e.cat === '藥水' && e.slotEmpty && e.tier >= 4);
        const allCardsUnwanted = bestEval.tier >= 4;
        const noGoodCard = bestEval.tier >= 3;

        // 2a. 開局積極刷採集藥水（藥水欄尚空：保護採集藥水、前 N 名神祇與空欄第 1 名秘藥／祝福／料理；第 2~N 名或雜魚則全部重抽找採集藥水）
        const shouldAggressivePotionReroll = Boolean(
          wantPickupPotionEmpty &&
          ex.aggressivePotionReroll !== false &&
          !hasJackpotProtect
        );
        // 2a-2. 已裝採集藥水但拾取尚未達標：場上無 S/A/B 好卡且無大獎神祇／第 1 名空欄時積極全抽衝採集藥水升級
        const shouldUpgradePickupReroll = Boolean(wantPickupPotionUpgrade && noGoodCard && !hasJackpotProtect);
        // 2b. 藥水欄空且出現其他藥水（未見採集藥水），且場上無 S/A/B 好卡與大獎保護
        const shouldHuntPickupReroll = Boolean(wantPickupPotionEmpty && ex.prioritizePickupPotion !== false && hasUnwantedPotionCard && noGoodCard && !hasJackpotProtect);
        // 2c. 三張皆不及格 (tier >= 4) 或可改善第 5 格神器（13 件神器單一池，無跨類型取捨）
        const deityCanImprove = (() => {
          if (deityCards.length === 0 || ex.rerollForDeity === false) return false;
          if (manualLockedDeity) return !curDeity || !deityNamesMatch(curDeity, manualLockedDeity);
          if (!curDeity) return overallTopDeities.length > 0;
          if (curInOverallTop) return evals.every((e) => e.isProtectedDeityBlock);
          return overallTopDeities.some((d) => canOverwriteCurDeity(d));
        })();
        const deityRerollWorth = allCardsUnwanted && deityCanImprove;
        const itemRerollWorth = allCardsUnwanted && evals.some((e) => e.kind === 'item' && e.slotEmpty && e.tier >= 4 && e.rerollable);
        const shouldReroll = shouldAggressivePotionReroll || shouldUpgradePickupReroll || shouldHuntPickupReroll || deityRerollWorth || itemRerollWorth;

        if (shouldReroll) {
          const rerollAllBtn = ex.chestRerollAllEarly !== false || deityRerollWorth ? findRerollAllButton() : null;
          if (rerollAllBtn && isActionBtnReady(rerollAllBtn)) {
            state.lastRerolledChestSig = chestItemsSig;
            state.lastRerolledChestAt = Date.now();
            const reasonTag = shouldAggressivePotionReroll
              ? `[開局刷藥水] 藥水欄尚空且未見採集藥水／前 ${deityTopN} 名神器／空欄第 1 名道具，全部重抽尋找採集藥水`
              : shouldUpgradePickupReroll
              ? `[積極刷藥水] 拾取 ${stats.pickupRange}/${stats.pickupCap} 未達標且無好卡，全部重抽尋找採集藥水升級`
              : shouldHuntPickupReroll
              ? '[重抽找採集藥水] 藥水欄尚空未見採集藥水且無好卡，全部重抽'
              : deityRerollWorth
              ? `[重抽神器] 未見前 ${deityTopN} 名目標神器且無好卡，全部重抽`
              : `[寶箱全部重抽] 空欄未命中目標（尚有 ${emptyCount} 空欄），全部重抽`;
            triggerChestRerollBtn(rerollAllBtn, '寶箱全部重抽', reasonTag);
            return;
          }
          const singlePair = findBestSingleChestReroll({
            potionOnly: !noGoodCard,
            allowDeity: noGoodCard && deityCanImprove,
          });
          if (singlePair) {
            state.lastRerolledChestSig = chestItemsSig;
            state.lastRerolledChestAt = Date.now();
            const pName = singlePair.evalItem.name || singlePair.evalItem.cat || '道具';
            const singleReason =
              singlePair.mode === 'potion'
                ? `[單卡重抽藥水] 藥水欄尚空且無全部重抽，單卡重抽【${pName}】`
                : singlePair.mode === 'deity'
                ? `[單卡重抽神器] 無全部重抽且神器可替換，單卡重抽【${pName}】尋找目標神器`
                : `[單卡重抽空欄] 無全部重抽，單卡重抽空欄【${pName}】`;
            triggerChestRerollBtn(singlePair.btn, `單卡重抽 ${pName}`, singleReason);
            return;
          }
          addLog(`[重抽略過] 符合重抽條件但未找到可用「全部重抽」鈕或可重抽空欄／神器單卡（已裝備四格禁止單卡重抽）`);
        }
      }

      // 步驟 3：執行最高分選擇（或全為禁選時安全略過／暫停保護）
      state.lastRerolledChestSig = '';
      state.lastRerolledChestAt = 0;
      if (bestEval && bestEval.isForbidden) {
        const skipBtn = findSkipModalButton(cards);
        if (skipBtn && isActionBtnReady(skipBtn)) {
          const delay = randomHumanDelay();
          state.pickingLockUntil = Date.now() + delay + 1200;
          addLog(`[略過寶箱] 三卡皆不可選（${bestEval.reason}），點擊略過`);
          setTimeout(() => {
            if (state.paused || !document.body.contains(skipBtn)) return;
            const r = skipBtn.getBoundingClientRect();
            performElementClick(skipBtn, r.left + r.width * 0.5, r.top + r.height * 0.5, '略過寶箱');
            state.lastDomSignature = '';
          }, delay);
          return;
        }
        if (bestEval.isProtectedDeityBlock && curDeity) {
          pauseScript(`寶箱全為較低順位神器，為保留【${curDeity}】已暫停`);
          return;
        }
      }

      if (bestEval && !bestEval.isForbidden) {
        clickPickCard(bestEval.card, bestEval.pickTag, bestEval.reason, bestEval.onPick);
        return;
      }

      const winner = scoreCardsByKeywords(cards, CONFIG.strategy.chestPriorityKeywords || []);
      const winItem = resolvedItems.get(winner.card);
      clickPickCard(winner.card, '本地寶箱', winner.matchedLabels.join(' + ') || '預設保底', () => {
        if (winItem && !state.run.items[winItem.category]) state.run.items[winItem.category] = winItem.key;
      });
      return;
    }
    // 升級技能（動態支援當前職業 23 職與跨職業天生普攻）
    const ex = getExtra();
    const run = state.run;
    const coreSkills = getCoreSkills();
    const allJobSkills = getAllJobSkills();
    const fourthOrder = getJobFourthOrder();
    const meta = cards.map((card) => ({ card, name: cardNameOf(card), isNew: cardIsNew(card) }));
    const isValidSkillName = (n) => Boolean(n) && !/^卡片\d*$/.test(n);
    const isCore = (n) => isValidSkillName(n) && coreSkills.some((s) => deityNamesMatch(n, s));
    const isInnate = (n) =>
      isValidSkillName(n) &&
      INNATE_ATTACK_NAMES.some((k) => deityNamesMatch(n, k) || deityNamesMatch(n, k.replace(/^攻擊：/, '')));
    // 若畫面明確顯示技能欄尚有空位（例如 技能 3/4），代表尚未選定第四招；自動清除可能殘留自上一場的第四招／放逐紀錄，避免提前放逐
    if (!modalCtx.isSkillSlotsFull) {
      const hasStaleRunBanish = Boolean(
        run.fourthSkill ||
        run.fourthBanished ||
        run.attrBanished ||
        run.nativeSkillAutoClicked ||
        (Array.isArray(run.banishedKeys) && run.banishedKeys.length > 0)
      );
      if (hasStaleRunBanish) {
        run.fourthSkill = null;
        run.fourthBanished = false;
        run.attrBanished = false;
        run.banishedKeys = [];
        run.nativeSkillAutoClicked = false;
        saveRunSession();
        updateRunInfo();
        addLog('[防提前放逐] 偵測到技能欄位尚有空位（未選第四招），已清除殘留進度並暫緩放逐');
      }
    }
    // 僅在技能欄位已滿時，才嘗試從底部 #skillbar 同步已裝備的第四招名稱
    if (!run.fourthSkill && modalCtx.isSkillSlotsFull) {
      const barSlots = Array.from(document.querySelectorAll('#skillbar .skill-slot'));
      for (const slot of barSlots) {
        const lvl = slot.querySelector('.lvl');
        if (!lvl || (lvl.textContent || '').trim() === '') continue;
        const slugAttr = slot.getAttribute('data-skill') || '';
        const imgSrc = slot.querySelector('img')?.getAttribute('src') || '';
        const imgSlug = imgSrc ? (imgSrc.split('/').pop()?.split('?')[0]?.replace(/\.png$/i, '') || '') : '';
        const mappedSkill = resolveSkillNameByIconOrSlug(slugAttr) || resolveSkillNameByIconOrSlug(imgSlug);
        const probe = [
          mappedSkill,
          slot.getAttribute('title'),
          slot.getAttribute('aria-label'),
          slugAttr,
          slot.getAttribute('data-name'),
          slot.querySelector('img')?.getAttribute('alt'),
          slot.querySelector('.name, .skill-name')?.textContent,
        ]
          .filter(Boolean)
          .join(' ');
        const cleanProbe = normalizeDeityName(probe);
        if (!cleanProbe) continue;
        const matched = allJobSkills.find((s) => deityNamesMatch(cleanProbe, s));
        if (matched && !isCore(matched) && !isInnate(matched)) {
          run.fourthSkill = matched;
          saveRunSession();
          updateRunInfo();
          addLog(`[第四招] 由技能列偵測到已裝備第四招【${matched}】`);
          break;
        }
      }
    }
    if (!run.fourthSkill && modalCtx.isSkillSlotsFull) {
      // 只有「非新技能 (!x.isNew)」才可能是已經學在身上的第四招，避免誤猜未學習的新技能卡片
      const existingNonCore = meta.filter((x) => !x.isNew && isValidSkillName(x.name) && !isCore(x.name) && !isInnate(x.name));
      const guess =
        existingNonCore.find((x) => allJobSkills.some((s) => deityNamesMatch(x.name, s))) ||
        existingNonCore.find((x) => x.name.length >= 2);
      if (guess) {
        run.fourthSkill = guess.name;
        saveRunSession();
        updateRunInfo();
        addLog(`[第四招] 欄位已滿，推定第四招為【${guess.name}】`);
      }
    }
    // 強制條件：必須技能欄位已滿（已選出第四個技能）後，才允許執行任何技能放逐
    const banishAllowed =
      state.autoBuildEnabled &&
      modalCtx.isSkillSlotsFull &&
      Date.now() > state.banishCooldownUntil &&
      isJobConfident();
    if (state.autoBuildEnabled && modalCtx.isSkillSlotsFull && !isJobConfident() && Date.now() > state.banishCooldownUntil) {
      state.banishCooldownUntil = Date.now() + 15000;
      addLog('[放逐停用] 讀不到職業名稱，為避免誤放逐核心技能，已暫停自動放逐（請在設定指定職業）');
    }
    const banishQueue = getJobBanishOrder();
    if (!Array.isArray(run.banishedKeys)) run.banishedKeys = [];
    const isTargetBanished = (key) => {
      if (key === '__FOURTH__' && run.fourthBanished) return true;
      if (key === '__INNATE__' && run.attrBanished) return true;
      return run.banishedKeys.includes(key);
    };
    const markTargetBanished = (key) => {
      if (!run.banishedKeys.includes(key)) run.banishedKeys.push(key);
      if (key === '__FOURTH__') run.fourthBanished = true;
      if (key === '__INNATE__') run.attrBanished = true;
    };
    const unmarkTargetBanished = (key) => {
      run.banishedKeys = run.banishedKeys.filter((k) => k !== key);
      if (key === '__FOURTH__') run.fourthBanished = false;
      if (key === '__INNATE__') run.attrBanished = false;
    };
    const findCardForBanishKey = (key) => {
      if (key === '__FOURTH__') {
        return run.fourthSkill ? meta.find((x) => deityNamesMatch(x.name, run.fourthSkill)) : null;
      }
      if (key === '__INNATE__') {
        return meta.find((x) => isInnate(x.name)) || null;
      }
      return meta.find((x) => deityNamesMatch(x.name, key)) || null;
    };
    // 實時放逐校驗：若先前已標記放逐的目標仍出現在三張卡中（代表先前點擊未生效或狀態殘留），立刻撤銷完成標記並重新放逐
    let banishSelfHealed = false;
    for (const key of banishQueue) {
      if (!isTargetBanished(key)) continue;
      const liveHit = findCardForBanishKey(key);
      if (liveHit && (key === '__INNATE__' || !liveHit.isNew)) {
        unmarkTargetBanished(key);
        banishSelfHealed = true;
        addLog(`[放逐校驗] 畫面上仍出現【${banishKeyLabel(key)}】（${liveHit.name}），代表尚未完成放逐，已取消完成標記並重新排入放逐佇列`);
      }
    }
    if (banishSelfHealed) {
      saveRunSession();
      updateRunInfo();
    }
    const remainingBanishQueue = banishQueue.filter((k) => !isTargetBanished(k));
    const banishInfo = readRemainingBanishCount(cards);
    const banishChargesLeft = banishInfo.known ? banishInfo.remaining : null;
    // 僅在明確讀到按鈕數字為 0 且畫面上沒有任何可用放逐鈕時，才判定為放逐次數耗盡
    const banishExhausted = Boolean(banishInfo.known && banishInfo.explicitZero && !banishInfo.anyReady);
    const needFourthFirst = remainingBanishQueue.includes('__FOURTH__') && !run.fourthSkill;
    // 依設定的「放逐順序」並搭配實際剩餘放逐次數：
    // 若第四招尚未辨識出名稱，但剩餘次數大於 1 次（足以同時放逐第四招與後續如屬性附加），允許先放逐後順位目標以免白白錯過
    const affordCount = banishChargesLeft !== null ? Math.max(0, banishChargesLeft) : remainingBanishQueue.length;
    const affordableBanishTargets = banishExhausted
      ? []
      : needFourthFirst
      ? (affordCount > 1 ? remainingBanishQueue.filter((k) => k !== '__FOURTH__').slice(0, affordCount - 1) : [])
      : remainingBanishQueue.slice(0, affordCount);
    if (banishAllowed && affordableBanishTargets.length > 0) {
      for (let bi = 0; bi < affordableBanishTargets.length; bi++) {
        const targetKey = affordableBanishTargets[bi];
        const hit = findCardForBanishKey(targetKey);
        if (!hit) continue;
        const btn = findBanishButton(hit.card.element, hit.card.dataIndex);
        const targetDisp = targetKey === '__FOURTH__' ? `第四招【${run.fourthSkill}】` : `【${hit.name}】`;
        if (btn) {
          const leftLabel = banishChargesLeft !== null ? `（剩餘 ${banishChargesLeft} 次，順位 #${banishQueue.indexOf(targetKey) + 1}）` : '';
          const verifyCtx = {
            targetKey,
            expectedName: hit.name,
            targetDisp,
            maxChain: Math.max(5, banishQueue.length + 1),
            matchSkill: (name) => {
              if (!isValidSkillName(name)) return false;
              if (targetKey === '__FOURTH__') {
                return Boolean(run.fourthSkill && deityNamesMatch(name, run.fourthSkill) && !isCore(name) && !isInnate(name));
              }
              if (targetKey === '__INNATE__') {
                return isInnate(name);
              }
              return deityNamesMatch(name, targetKey);
            },
          };
          triggerBanishCard(
            hit.card,
            btn,
            `依序放逐${targetDisp}${leftLabel}`,
            () => {
              markTargetBanished(targetKey);
            },
            verifyCtx
          );
          return;
        } else {
          state.banishCooldownUntil = Date.now() + 5000;
          addLog(`[放逐略過] ${targetDisp}無可用放逐鈕（可能次數已用完）`);
        }
      }
    }
    // 按遊戲內建「自動」前的嚴格放逐完成檢查：
    // 1. 畫面上不可有任何仍在放逐清單內的技能且還附帶可點放逐鈕
    // 2. 放逐冷卻不可作用中、且必須已確認職業身分
    // 3. 放逐清單須全數完成（remainingBanishQueue.length === 0），或明確讀到放逐剩餘次數為 0（banishExhausted）
    const hasBanishableQueueCardOnScreen = banishQueue.some((k) => {
      const hit = findCardForBanishKey(k);
      return Boolean(hit && findBanishButton(hit.card.element, hit.card.dataIndex));
    });
    const banishPhaseComplete =
      !state.autoBuildEnabled ||
      (
        isJobConfident() &&
        Date.now() > state.banishCooldownUntil &&
        !hasBanishableQueueCardOnScreen &&
        (remainingBanishQueue.length === 0 || banishExhausted)
      );
    if (
      ex.useNativeAutoAfterBanish !== false &&
      modalCtx.isSkillSlotsFull &&
      Date.now() > state.rerollCooldownUntil
    ) {
      const nativeAutoBtn = findNativeAutoSkillButton();
      if (nativeAutoBtn) {
        if (!banishPhaseComplete) {
          const nowTs = Date.now();
          if (nowTs - (state.lastNativeAutoWaitLogAt || 0) > 6000) {
            state.lastNativeAutoWaitLogAt = nowTs;
            const pendingNames = remainingBanishQueue.map((k) => banishKeyLabel(k)).join('、') || '放逐狀態確認中';
            const chargeStr = banishChargesLeft !== null ? `剩餘放逐 ${banishChargesLeft} 次` : '放逐次數待確認';
            addLog(`[自動選技暫緩] 尚未全部放逐完畢（待放逐：${pendingNames}｜${chargeStr}），暫不點擊遊戲內建「自動」`);
          }
        } else {
          const delay = randomHumanDelay();
          state.pickingLockUntil = Date.now() + jitterCooldown(Math.max(delay + 1800, CONFIG.cooldownAfterClickMs));
          state.actionInFlightUntil = Date.now() + delay + 1000;
          state.rerollCooldownUntil = Date.now() + delay + 2500;
          const doneReason = remainingBanishQueue.length === 0
            ? '放逐清單已全部放逐完畢'
            : banishExhausted
            ? '放逐次數已明確用完 (0)'
            : '未啟用放逐';
          addLog(`[技能自動接手] ${doneReason}且技能欄已滿，點擊遊戲內建「自動技能」（寶箱維持原設定）(延遲 ${delay}ms)`);
          setTimeout(() => {
            if (state.paused || !document.body.contains(nativeAutoBtn)) {
              state.actionInFlightUntil = 0;
              return;
            }
            const r = nativeAutoBtn.getBoundingClientRect();
            performElementClick(nativeAutoBtn, r.left + r.width * 0.5, r.top + r.height * 0.5, '遊戲內建自動技能', {
              onClicked: () => {
                run.nativeSkillAutoClicked = true;
                saveRunSession();
                updateRunInfo();
                setTimeout(() => {
                  state.actionInFlightUntil = 0;
                  state.lastDomSignature = '';
                }, 550);
                setTimeout(ensureMoveLoopRunning, 220);
              },
              onCancelled: () => {
                state.actionInFlightUntil = 0;
                state.pickingLockUntil = 0;
                state.lastDomSignature = '';
              },
            });
          }, delay);
          return;
        }
      }
    }
    // 專注 (Focus) 僅用於寶箱「神祇」與「採集藥水」，一般技能升級一律不觸發專注
    const acceptedList = getJobAcceptedFourthSkills();
    const isAcceptedFourth = (n) => isValidSkillName(n) && acceptedList.some((s) => deityNamesMatch(n, s));
    const isSkippedFourth = (n) => isValidSkillName(n) && !isCore(n) && !isInnate(n) && !isAcceptedFourth(n);
    const isElementalTriad = (n) => ['火箭術', '冰箭術', '雷擊術'].some((s) => deityNamesMatch(n, s));
    const isCardLegendary = (card) => {
      const badge = String(card?.badgeText || '').trim();
      if (/傳說|神話/i.test(badge)) return true;
      return getCardRarityScore(card?.element, `${badge} ${card?.title || ''}`) >= 5;
    };
    if (ex.preferLegendaryCore !== false) {
      const legendaryCorePool = meta
        .filter((x) => (isCore(x.name) || isElementalTriad(x.name)) && isCardLegendary(x.card))
        .map((x) => x.card);
      if (legendaryCorePool.length > 0) {
        const winner = scoreCardsByKeywords(legendaryCorePool, CONFIG.strategy.priorityKeywords || [], coreSkills);
        const detail = winner.matchedLabels.length ? `（${winner.matchedLabels.join(' + ')}）` : '';
        clickPickCard(winner.card, '傳說核心', `核心技能（冰/火/雷）出現傳說卡，優先選擇${detail}`);
        return;
      }
    }
    if (!modalCtx.isSkillSlotsFull) {
      if (!run.fourthSkill) {
        const cands = meta
          .filter((x) => x.isNew && !isCore(x.name) && isAcceptedFourth(x.name))
          .sort((a, b) => orderIndex(a.name, fourthOrder) - orderIndex(b.name, fourthOrder));
        if (cands.length > 0) {
          clickPickCard(cands[0].card, '第四招', `選擇第四招【${cands[0].name}】`, () => { run.fourthSkill = cands[0].name; });
          return;
        }
      }
      const customCoreOrder = [...new Set([...fourthOrder.filter((s) => isCore(s)), ...coreSkills])];
      const coreNew = meta
        .filter((x) => x.isNew && isCore(x.name))
        .sort((a, b) => orderIndex(a.name, customCoreOrder) - orderIndex(b.name, customCoreOrder));
      if (coreNew.length > 0) {
        clickPickCard(coreNew[0].card, '核心技能', `學習核心技能【${coreNew[0].name}】`);
        return;
      }
      if (ex.rerollForSkill && Date.now() > state.rerollCooldownUntil) {
        // 全部重抽 ([data-act="bar:0"]) 僅保留給寶箱使用；技能升級只對非核心/不要的單卡使用單卡重抽
        const unwantedCands = meta.filter((x) => !isCore(x.name) && !(x.isNew && isAcceptedFourth(x.name)));
        const rerollPair = unwantedCands
          .map((x) => ({ x, btn: findSingleCardRerollButton(x.card.element, x.card.dataIndex) }))
          .find((p) => p.btn);
        if (rerollPair) {
          const delay = randomHumanDelay();
          state.pickingLockUntil = Date.now() + delay + 1400;
          state.rerollCooldownUntil = Date.now() + delay + 2000;
          addLog(`[單卡重抽] 欄位未滿且未見目標技能，重抽【${rerollPair.x.name}】（保留全部重抽給寶箱）(延遲 ${delay}ms)`);
          setTimeout(() => {
            if (state.paused) return;
            const r = rerollPair.btn.getBoundingClientRect();
            performElementClick(rerollPair.btn, r.left + r.width * 0.5, r.top + r.height * 0.5, `單卡重抽 ${rerollPair.x.name}`);
            state.lastDomSignature = '';
          }, delay);
          return;
        } else {
          state.rerollCooldownUntil = Date.now() + 5000;
        }
      }
    }
    const corePool = meta.filter((x) => isCore(x.name)).map((x) => x.card);
    const acceptedPool = meta.filter((x) => !isInnate(x.name) && isAcceptedFourth(x.name)).map((x) => x.card);
    const otherSafePool = meta
      .filter((x) => !isInnate(x.name) && !isSkippedFourth(x.name) && !(run.fourthSkill && deityNamesMatch(x.name, run.fourthSkill)))
      .map((x) => x.card);
    const fallbackNonInnate = meta.filter((x) => !isInnate(x.name)).map((x) => x.card);
    const pool = corePool.length
      ? corePool
      : acceptedPool.length
      ? acceptedPool
      : otherSafePool.length
      ? otherSafePool
      : fallbackNonInnate.length
      ? fallbackNonInnate
      : cards;
    const customCoreTie = fourthOrder.filter((s) => isCore(s));
    const skillTieOrder = [...new Set([...customCoreTie, ...coreSkills, ...fourthOrder])];
    const winner = scoreCardsByKeywords(pool, CONFIG.strategy.priorityKeywords || [], skillTieOrder);
    const winnerMeta = meta.find((x) => x.card === winner.card);
    const rarLabel = getCardRarityLabel(winner.rarity);
    const reason = winner.matchedLabels.length
      ? `命中 ${winner.matchedLabels.join(' + ')} · ${rarLabel}`
      : `依品質/數值保底（${rarLabel}${winner.itemBonus ? `/+${winner.itemBonus}` : ''}）`;
    clickPickCard(winner.card, '本地選技', reason, () => {
      if (
        !modalCtx.isSkillSlotsFull &&
        !run.fourthSkill &&
        winnerMeta &&
        isValidSkillName(winnerMeta.name) &&
        !isCore(winnerMeta.name) &&
        !isInnate(winnerMeta.name) &&
        (winnerMeta.isNew || allJobSkills.some((s) => deityNamesMatch(winnerMeta.name, s)))
      ) {
        run.fourthSkill = winnerMeta.name;
      }
    });
  }

  function readBankInfo() {
    const btn = document.querySelector('#bank-btn');
    const nEl = document.querySelector('#bank-n');
    const visible = Boolean(btn && isVisible(btn));
    const hasPending = Boolean(btn && btn.classList.contains('has') && isActionBtnReady(btn));
    const raw = (nEl?.textContent || btn?.textContent || '').trim();
    const m = raw.match(/\d+/);
    const count = m ? Number(m[0]) : hasPending ? 1 : 0;
    return { btn, visible, hasPending, count };
  }

  function readExpInfo() {
    const el = document.querySelector('#exp-text');
    if (!el || !isVisible(el)) return { text: '', pct: null };
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    let pct = null;
    const pctMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
    if (pctMatch) {
      pct = Math.round(Number(pctMatch[1]));
    } else {
      const fracMatch = text.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
      if (fracMatch && Number(fracMatch[2]) > 0) {
        pct = Math.round((Number(fracMatch[1]) / Number(fracMatch[2])) * 100);
      }
    }
    return { text, pct };
  }

  function performLetterHotkey(letter, code, keyCode) {
    const mode = CONFIG.selectionActionMode || 'hybrid_bridge';
    if (mode === 'hybrid_bridge') {
      const holdMs = humanHoldMs(60, 12, 38, 95);
      return sendBridgeKey(letter, holdMs, 'key');
    }
    if (mode === 'advisor_only') {
      addLog(`[純提示] 建議手動按鍵：${letter.toUpperCase()}`);
      return false;
    }
    return false;
  }

  function performSpaceInteract() {
    const mode = CONFIG.selectionActionMode || 'hybrid_bridge';
    if (mode === 'hybrid_bridge') {
      const holdMs = 45 + Math.floor(Math.random() * 40);
      return sendBridgeKey('Space', holdMs, 'key');
    }
    if (mode === 'advisor_only') {
      addLog('[純提示] 建議手動按空白鍵互動');
      return false;
    }
    return false;
  }

  async function performEscapeKey() {
    try {
      hudRoot?.activeElement?.blur?.();
      const active = document.activeElement;
      if (active && isOwnHudNode(active)) active.blur?.();
    } catch (_) {}
    const mode = CONFIG.selectionActionMode || 'hybrid_bridge';
    if (mode === 'hybrid_bridge' || state.bridgeOnline) {
      const holdMs = 42 + Math.floor(Math.random() * 38);
      const res = await sendBridgeAction({ type: 'key', key: 'Escape', holdMs });
      return { ok: Boolean(res && res.ok), usedBridge: true, reason: res?.reason || '' };
    }
    if (mode === 'advisor_only') {
      addLog('[純提示] 建議手動按 ESC 暫停/返回');
      return { ok: false, usedBridge: false, reason: 'advisor_only' };
    }
    return { ok: false, usedBridge: false, reason: 'no_bridge' };
  }

  function tryAutoOpenBankUpgrade() {
    if (state.moonlightState?.active && state.moonlightState.phase !== 'idle') return false;
    // 打王紅圈閃避／安全區煞車或近 3 秒有紅區時延後開卡，避免中途打斷閃避節奏
    if (
      (state.bossRedDodgeState && Date.now() < (state.bossRedDodgeState.until || 0) + 400) ||
      Date.now() - (state.lastBossRedActiveAt || 0) < 3000
    ) {
      return false;
    }
    const ex = getExtra();
    if (ex.upgradeMode !== 'accumulate_auto' || !state.autoEnabled || state.paused) return false;
    const now = Date.now();
    if (now < state.pickingLockUntil || now < state.bankCooldownUntil) return false;
    const bank = readBankInfo();
    if (!bank.hasPending || !bank.btn) return false;
    const threshold = Math.max(1, Number(ex.bankThreshold) || 1);
    if (bank.count < threshold) return false;
    const delay = randomHumanDelay();
    state.pickingLockUntil = now + delay + 500;
    state.bankCooldownUntil = now + delay + 2000;
    addLog(`[累積開卡] 待開 ${bank.count} 張（門檻 ${threshold}），觸發 B 鍵開啟 (延遲 ${delay}ms)`);
    setTimeout(() => {
      if (!state.autoEnabled || state.paused) return;
      const cur = readBankInfo();
      if (!cur.hasPending || !cur.btn) return;
      performLetterHotkey('b', 'KeyB', 66);
      state.lastDomSignature = '';
      setTimeout(() => {
        // 僅在尚未開始選卡／放逐／點擊動作時才釋放鎖定，避免覆蓋剛排程好的選卡鎖造成同一張卡重複觸發兩次
        if (!state.pendingPickTimer && !state.banishInFlight && Date.now() >= (state.actionInFlightUntil || 0) && !state.lastDomSignature) {
          state.pickingLockUntil = 0;
        }
        safeRun(runDetectionCycle, false);
      }, 280);
      setTimeout(() => safeRun(runDetectionCycle, false), 720);
    }, delay);
    return true;
  }

  function runDetectionCycle(forceRun = false) {
    // 若神祇交換卡片已翻面顯示「是，交換」(.pk-back button[data-yes])，最優先自動點擊確認
    if (tryConfirmVisibleSwapCard(forceRun)) {
      return;
    }
    const cards = extractDomCards();
    if (!cards || cards.length < 2) {
      if (state.lastDomSignature) state.lastDomSignature = '';
      if (state.banishChainCount) state.banishChainCount = 0;
      const visiblePicker = document.querySelector('#picker:not(.hidden)');
      if (visiblePicker && isVisible(visiblePicker, 40) && (forceRun || (state.autoEnabled && !state.paused))) {
        const now = Date.now();
        if (!state.pickerEmptySince) state.pickerEmptySince = now;
        // 過濾選卡退場動畫瞬間 (.pk-card=4 / clip-path 淡出)，持續空白超過 1.8 秒才記錄診斷
        if (forceRun || (now - state.pickerEmptySince >= 1800 && now - (state.lastPickerDiagAt || 0) > 6000)) {
          state.lastPickerDiagAt = now;
          const rawCnt = visiblePicker.querySelectorAll('.pk-card').length;
          addLog(`[選卡診斷] 選卡視窗已開啟但未偵測到有效卡片（.pk-card=${rawCnt}，自動重試中）`);
        }
        return;
      }
      state.pickerEmptySince = 0;
      state.lastPickerDiagAt = 0;
      ensureMoveLoopRunning();
      if (!forceRun) tryAutoOpenBankUpgrade();
      return;
    }
    state.pickerEmptySince = 0;
    const modalCtx = extractModalContext(cards.map((c) => c.element), cards);
    if (!forceRun && (!state.autoEnabled || state.paused)) {
      return;
    }
    if (state.banishInFlight && Date.now() < (state.banishInFlightUntil || 0)) {
      return;
    }
    if (state.actionInFlightUntil && Date.now() < state.actionInFlightUntil) {
      return;
    }
    if (!forceRun && state.pendingPickTimer) {
      return;
    }
    const sig = cards.map((c) => `${c.title}:${c.description}`).join('|');
    if (!forceRun && sig === state.lastDomSignature && Date.now() < state.pickingLockUntil) {
      return;
    }
    if (sig !== state.lastDomSignature) {
      state.lastCardSignatureAppearedAt = Date.now();
    }
    state.lastDomSignature = sig;
    // 只暫時放開目前按鍵，保留走位排程計時器，避免選完技能後走位中斷
    releaseHeldKeysOnly();
    decideAndExecute(cards, modalCtx);
  }

  // === 6. 遊戲計時器、提醒音與 MutationObserver ===
  function ensureAudio() {
    try {
      if (!state.audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) state.audioCtx = new AC();
      }
      if (state.audioCtx && state.audioCtx.state === 'suspended') state.audioCtx.resume();
    } catch (_) {}
  }
  window.addEventListener('click', ensureAudio, { passive: true });

  function playBeeps(count) {
    ensureAudio();
    const ctx = state.audioCtx;
    if (!ctx) return;
    try {
      const t0 = ctx.currentTime + 0.05;
      for (let i = 0; i < count; i++) {
        const t = t0 + i * 0.32;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = i % 2 ? 880 : 660;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.26);
      }
    } catch (_) {}
  }

  function findGamePauseOverlay() {
    const exactPause = document.querySelector('#pause:not(.hidden)');
    if (exactPause && !isOwnHudNode(exactPause) && isVisible(exactPause, 40)) return exactPause;
    const explicit = Array.from(
      document.querySelectorAll('#btn-resume, #btn-quit, #pause-modal, #pause-overlay, .pause-modal, .pause-overlay, [class*="pause-win"], [class*="pause-menu"]')
    ).find((el) => !isOwnHudNode(el) && isVisible(el, 12));
    if (explicit) return explicit;
    return Array.from(document.querySelectorAll('.modal, .overlay, .window, [role="dialog"]')).find((el) => {
      if (isOwnHudNode(el) || !isVisible(el, 80)) return false;
      const txt = (el.innerText || '').trim();
      return /(?:遊戲暫停|已暫停|PAUSED)/i.test(txt) && /(?:繼續|Resume|返回)/i.test(txt);
    }) || null;
  }

  function findGamePauseButton() {
    return Array.from(
      document.querySelectorAll('#btn-pause, .btn-pause, [data-act="pause"], button[title*="暫停"], button[aria-label*="pause" i]')
    ).find((el) => !isOwnHudNode(el) && isActionBtnReady(el)) || null;
  }

  async function tryPauseActualGame(retryCount = 0) {
    const ex = getExtra();
    if (ex.autoPauseGameOnStop === false) return;
    if (!state.paused || !isInCombat()) return;
    if (findDomCardElements().length >= 2) return;
    if (findGamePauseOverlay()) {
      state.pendingGamePauseOnVisible = false;
      return;
    }
    const needForeground = ex.bridgeRequireFocus !== false;
    if (document.hidden || (needForeground && !isPageEffectivelyFocused())) {
      state.pendingGamePauseOnVisible = true;
      return;
    }
    const pauseBtn = findGamePauseButton();
    if (pauseBtn) {
      const r = pauseBtn.getBoundingClientRect();
      performElementClick(pauseBtn, r.left + r.width * 0.5, r.top + r.height * 0.5, '遊戲暫停鈕');
      addLog('[遊戲暫停] 已自動點擊遊戲暫停鈕');
      state.pendingGamePauseOnVisible = false;
      return;
    }
    const escRes = await performEscapeKey();
    if (escRes?.usedBridge && !escRes.ok) {
      if (escRes.reason === 'browser_not_focused') {
        state.pendingGamePauseOnVisible = true;
        return;
      }
    }
    if (retryCount === 0) {
      addLog(`[遊戲暫停] 已發送${escRes?.usedBridge && escRes?.ok ? '實體按鍵 ESC' : ' ESC'} 暫停遊戲`);
    }
    state.pendingGamePauseOnVisible = false;
    setTimeout(() => {
      if (!state.paused || !isInCombat() || findDomCardElements().length >= 2) return;
      if (findGamePauseOverlay()) {
        if (escRes?.usedBridge && escRes?.ok) {
          addLog('[遊戲暫停] 已確認遊戲進入暫停選單 (#pause)');
        }
        return;
      }
      if (retryCount < 2) {
        tryPauseActualGame(retryCount + 1);
      }
    }, 360);
  }

  function pauseScript(reason) {
    if (state.paused) return;
    state.paused = true;
    state.pauseReason = reason;
    releaseAllMoveKeys();
    tryPauseActualGame(0);
    playBeeps(6);
    if (!state.alarmTimer) state.alarmTimer = setInterval(() => playBeeps(4), 6000);
    addLog(`[暫停] ${reason}`);
    updateStatusBar();
  }

  function resumeScript() {
    state.paused = false;
    state.pauseReason = '';
    state.pendingGamePauseOnVisible = false;
    state.lastDomSignature = '';
    if (state.alarmTimer) {
      clearInterval(state.alarmTimer);
      state.alarmTimer = null;
    }
    addLog('[繼續] 已恢復自動選擇（若遊戲仍在暫停選單，請點擊遊戲的繼續或按 ESC）');
    updateStatusBar();
    if (CONFIG.autoMoveConfig.mode === 'radius_wander') scheduleNextMoveStep();
  }

  function clearFarmDoneHalt() {
    if (state.farmDoneHalted) {
      state.farmDoneHalted = false;
      GM_setValue('skillpick_farm_done_halt', null);
    }
  }

  function rollFarmSessionTargetRuns() {
    const ex = getExtra();
    const lo = Math.max(1, Math.min(200, Number(ex.farmRestMinRuns) || 4));
    const hi = Math.max(lo, Math.min(200, Number(ex.farmRestMaxRuns) || Math.max(lo, 6)));
    return lo + Math.floor(Math.random() * (hi - lo + 1));
  }

  function clearFarmRestState() {
    state.farmRestUntil = 0;
    state.farmRestInfo = null;
    GM_setValue('skillpick_farm_rest_state', null);
  }

  function setAutoEnabledState(enabled, opts = {}) {
    state.autoEnabled = Boolean(enabled);
    GM_setValue('skillpick_auto_enabled', state.autoEnabled);
    if (state.autoEnabled) {
      state.farmManualAutoOff = false;
    }
    const autoBtn = $id('rh-btn-auto');
    if (autoBtn) {
      autoBtn.textContent = state.autoEnabled ? '自動選擇中（本地規則）' : '啟動自動選擇';
      autoBtn.className = state.autoEnabled ? 'rh-btn rh-btn-active' : 'rh-btn rh-btn-primary';
    }
    if (!opts.skipStatusUpdate) updateStatusBar();
  }

  function ensureFarmDependenciesActive(sourceLabel = '刷圖自檢') {
    if (!state.farmEnabled || state.paused || state.farmDoneHalted || state.farmReloadPending) return false;
    if (state.farmRestUntil && Date.now() < state.farmRestUntil) return false;
    const fixed = [];
    if (!state.autoEnabled && !state.farmManualAutoOff) {
      setAutoEnabledState(true, { skipStatusUpdate: true });
      state.lastDomSignature = '';
      state.pickingLockUntil = 0;
      fixed.push('自動選卡');
      safeRun(runDetectionCycle, false);
    }
    if (CONFIG.autoMoveConfig.mode !== 'radius_wander' && !state.farmManualMoveOff) {
      CONFIG.autoMoveConfig.mode = 'radius_wander';
      GM_setValue('skillpick_overrides', { ...GM_getValue('skillpick_overrides', {}), autoMoveConfig: CONFIG.autoMoveConfig });
      if (!state.mapCenterCoord) {
        state.posX = 0;
        state.posY = 0;
      }
      scheduleNextMoveStep();
      updateMoveHud();
      fixed.push('半徑走位');
    }
    if (fixed.length > 0) {
      updateStatusBar();
      addLog(`[${sourceLabel}] 偵測到刷圖迴圈運作中，已自動補開：${fixed.join('、')}`);
      return true;
    }
    return false;
  }

  function resumeFromFarmRest(manual = false) {
    const info = state.farmRestInfo || GM_getValue('skillpick_farm_rest_state', null);
    clearFarmRestState();
    clearFarmDoneHalt();
    resetStuckKeyWatchdog();
    state.farmReloadPending = false;
    state.farmSessionRunsDone = 0;
    state.farmSessionTargetRuns = rollFarmSessionTargetRuns();
    state.farmEnabled = true;
    state.farmManualAutoOff = false;
    state.farmManualMoveOff = false;
    GM_setValue('skillpick_farm_enabled', true);
    setAutoEnabledState(info?.resumeAutoPick !== false, { skipStatusUpdate: true });
    state.paused = false;
    state.farmLockUntil = 0;
    state.lastDomSignature = '';
    if (info?.resumeMove !== false && CONFIG.autoMoveConfig.mode !== 'radius_wander') {
      CONFIG.autoMoveConfig.mode = 'radius_wander';
      GM_setValue('skillpick_overrides', { ...GM_getValue('skillpick_overrides', {}), autoMoveConfig: CONFIG.autoMoveConfig });
      scheduleNextMoveStep();
    }
    state.setHudMinimized?.(true);
    updateFarmHud();
    updateMoveHud(true);
    updateMiniMagnetHud();
    updateStatusBar();
    addLog(
      manual
        ? `[階段休息] 已手動提前結束休息，開始自動登入續刷（本輪排定 ${state.farmSessionTargetRuns} 場）`
        : `[休息結束] 休息時間到，自動啟動登入流程並續刷（本輪排定 ${state.farmSessionTargetRuns} 場）`
    );
    safeRun(runFarmingLoopStep);
  }

  function checkFarmRestTick() {
    if (!state.farmRestUntil) return;
    if (Date.now() >= state.farmRestUntil) {
      resumeFromFarmRest(false);
    } else {
      updateFarmHud();
      updateMiniMagnetHud();
    }
  }

  function stopAllAutomation(reason = '手動全部停止') {
    clearFarmRestState();
    setAutoEnabledState(false, { skipStatusUpdate: true });
    state.farmEnabled = false;
    state.farmManualAutoOff = false;
    state.farmManualMoveOff = false;
    GM_setValue('skillpick_farm_enabled', false);
    state.paused = false;
    state.pauseReason = '';
    state.pendingGamePauseOnVisible = false;
    state.lastDomSignature = '';
    state.farmLockUntil = 0;
    state.npcWalkAttempts = 0;
    state.npcClickRetryPhase = 0;
    state.festivalDetourStep = 0;
    state.villageDwellPending = false;
    state.villageDwellPlan = null;
    state.lowHpEvading = false;
    if (state.alarmTimer) {
      clearInterval(state.alarmTimer);
      state.alarmTimer = null;
    }
    stopNpcWalk();
    if (CONFIG.autoMoveConfig.mode !== 'stationary') {
      CONFIG.autoMoveConfig.mode = 'stationary';
      GM_setValue('skillpick_overrides', { ...GM_getValue('skillpick_overrides', {}), autoMoveConfig: CONFIG.autoMoveConfig });
    }
    releaseAllMoveKeys();
    updateFarmHud();
    updateMoveHud();
    updateStatusBar();
    addLog(`[全部停止] ${reason}：已關閉自動選擇、刷圖迴圈與自動走位`);
  }

  function resetRun(reason) {
    const lockedArtifact = getJobLockedDeity();
    const lockedSkillDeity = getJobLockedSkillDeity();
    state.run = {
      fourthSkill: null,
      fourthBanished: false,
      attrBanished: false,
      banishedKeys: [],
      focusedKeys: [],
      nativeSkillAutoClicked: false,
      deity: null,
      deityLevel: 0,
      skillDeity: null,
      skillDeityLevel: 0,
      deityPending: false,
      cStats: null,
      cStatsAt: 0,
      cStatsSummary: '',
      items: { '藥水': null, '秘藥': null, '祝福': null, '料理': null },
      pickupBonus: 0,
      discoveryBonus: 0,
      itemPickupByKey: {},
      itemDiscByKey: {},
      skillPickupBonus: 0,
      skillDiscBonus: 0,
      lastTrackedBonusSig: '',
      lastTrackedBonusAt: 0,
    };
    state.lastSkillDeityClickAt = 0;
    state.cStatsSampledEarly = false;
    state.cStatsSampledMid = false;
    state.cStatsSnapshotBusy = false;
    state.lastCStatsLoggedSig = '';
    state.lastCStatsLoggedAt = 0;
    if (state.moonlightState) {
      state.moonlightState.active = false;
      state.moonlightState.phase = 'idle';
      state.moonlightState.holdAnchorCoord = null;
      state.moonlightState.holdEnteredAt = 0;
      state.moonlightState.holdOutsideFrames = 0;
      state.moonlightState.consecutiveNoBellFrames = 0;
      state.moonlightState.consecutiveSafeEndFrames = 0;
      state.moonlightState.detourUntil = 0;
      state.moonlightState.postDetourUntil = 0;
    }
    resetStuckKeyWatchdog();
    try { sessionStorage.removeItem(RUN_SESSION_KEY); } catch (_) {}
    state.lastDomSignature = '';
    state.lastClockSec = null;
    state.banishCooldownUntil = 0;
    state.banishInFlight = false;
    state.banishInFlightUntil = 0;
    state.banishChainCount = 0;
    state.rerollCooldownUntil = 0;
    state.focusCooldownUntil = 0;
    state.swapConfirmCooldownUntil = 0;
    state.pendingSwapConfirm = null;
    state.timerTriggered = false;
    // 遊戲進關卡時預設都在地圖中心點，重置走位原點與中心基準
    state.posX = 0;
    state.posY = 0;
    state.mapCenterCoord = null;
    state.lastCoord = null;
    state.navTarget = null;
    state.lastMagnetPickupTime = 0;
    state.initialClockSec = undefined;
    state.clockDir = 'up';
    state.inBossCountdown = false;
    state.lastHpSamplePct = null;
    state.lastHpDropAt = 0;
    state.lastAmbientRedScanAt = 0;
    state.lastBossHoldReleaseLogAt = 0;
    if (state.swarmBreakout) {
      state.swarmBreakout.active = false;
      state.swarmBreakout.startedAt = 0;
      state.swarmBreakout.until = 0;
      state.swarmBreakout.startCoord = null;
      state.swarmBreakout.lastCheckCoord = null;
      state.swarmBreakout.stuckDeflects = 0;
      state.swarmBreakout.escapedRing = false;
    }
    state.swarmPostGraceUntil = 0;
    state.swarmLastTriggerAt = 0;
    state.swarmLastAnnounceRaw = '';
    state.swarmScheduledFired = {};
    state.stuckRefCoord = null;
    state.stuckMoveMsAccum = 0;
    state.stuckCount = 0;
    state.detourUntil = 0;
    state.ignoredLootTargets = [];
    state.lastSkippedChestCost = null;
    state.minimapZoomDoneForRun = false;
    state.minimapZoomBusy = false;
    state.cameraZoomDoneForRun = false;
    state.cameraZoomBusy = false;
    syncStatCapInputs();
    updateRunInfo();
    updateMoveHud();
    const lockNotes = [];
    if (lockedArtifact) lockNotes.push(`鎖定神器:${lockedArtifact}`);
    if (lockedSkillDeity) lockNotes.push(`Lv20神祇:${lockedSkillDeity}`);
    addLog(`[新的一場] ${reason}：已重置進度與地圖中心原點(0,0)${lockNotes.length ? `（${lockNotes.join('｜')}）` : ''}`);
  }

  function readHpPercent() {
    const hpText = document.querySelector('#hp-text')?.textContent || '';
    const m = hpText.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
    if (m && Number(m[2]) > 0) {
      return Math.round((Number(m[1]) / Number(m[2])) * 100);
    }
    const fill = document.querySelector('#hp-fill');
    if (fill && fill.style && fill.style.width) {
      const pct = parseFloat(fill.style.width);
      if (!Number.isNaN(pct)) return Math.round(pct);
    }
    return null;
  }

  function readGameClockSec() {
    const exactTimer = document.querySelector('#timer');
    if (exactTimer && isVisible(exactTimer)) {
      const m = (exactTimer.textContent || '').trim().match(/^(\d{1,3}):(\d{2})$/);
      if (m) return Number(m[1]) * 60 + Number(m[2]);
    }
    let el = state.clockEl;
    if (!el || !document.body.contains(el)) {
      el = null;
      if (Date.now() - state.clockSearchAt > 3000) {
        state.clockSearchAt = Date.now();
        for (const c of document.querySelectorAll('div, span')) {
          if (c.children.length > 0 || isOwnHudNode(c)) continue;
          const t = (c.textContent || '').trim();
          if (!/^\d{1,3}:\d{2}$/.test(t)) continue;
          const r = c.getBoundingClientRect();
          if (r.width < 20 || r.top > window.innerHeight * 0.3) continue;
          const mid = r.left + r.width / 2;
          if (mid >= window.innerWidth * 0.3 && mid <= window.innerWidth * 0.7) {
            el = c;
            break;
          }
        }
        state.clockEl = el;
      }
    }
    if (!el) return null;
    const m = (el.textContent || '').trim().match(/^(\d{1,3}):(\d{2})$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }

  function getValidSecondaryStageIds(ex = getExtra()) {
    const primaryId = ex.farmStageId || 'payon_cave';
    const validSet = new Set(STAGES_DATA.map((s) => s.id));
    const rawList = Array.isArray(ex.farmStage2Ids)
      ? ex.farmStage2Ids
      : ex.farmStage2Id
      ? [ex.farmStage2Id]
      : [];
    return Array.from(new Set(rawList.filter((id) => validSet.has(id) && id !== primaryId)));
  }

  function pickNextFarmStageId(logChange = true) {
    const ex = getExtra();
    const primaryId = ex.farmStageId || 'payon_cave';
    const secondaryPool = getValidSecondaryStageIds(ex);
    const dualOn = Boolean(ex.farmDualEnabled && secondaryPool.length > 0);
    if (!dualOn) {
      state.activeFarmStageId = primaryId;
      state.farmStageStreakId = primaryId;
      state.farmStageStreakCount = 1;
      return primaryId;
    }
    const baseSecProb = Math.max(5, Math.min(95, Number(ex.farmDualChancePct) || 35)) / 100;
    let secProb = baseSecProb;
    // 柔順防連刷：若同張圖連刷 ≥ 3 場且機率在 20%~80% 間，自動提高切換到另一組地圖的機率
    if (baseSecProb >= 0.2 && baseSecProb <= 0.8 && (state.farmStageStreakCount || 0) >= 3) {
      if (state.farmStageStreakId === primaryId) secProb = Math.min(0.88, baseSecProb + 0.35);
      else secProb = Math.max(0.12, baseSecProb - 0.35);
    }
    let chosenId = primaryId;
    if (Math.random() < secProb) {
      const candidates =
        secondaryPool.length > 1 && state.lastSecondaryStageId
          ? secondaryPool.filter((id) => id !== state.lastSecondaryStageId)
          : secondaryPool;
      const pickPool = candidates.length > 0 ? candidates : secondaryPool;
      chosenId = pickPool[Math.floor(Math.random() * pickPool.length)];
      state.lastSecondaryStageId = chosenId;
    }
    if (state.farmStageStreakId === chosenId) {
      state.farmStageStreakCount = (state.farmStageStreakCount || 0) + 1;
    } else {
      state.farmStageStreakId = chosenId;
      state.farmStageStreakCount = 1;
    }
    state.activeFarmStageId = chosenId;
    if (logChange) {
      const pSt = STAGES_DATA.find((s) => s.id === primaryId);
      const secNames = secondaryPool.map((id) => STAGES_DATA.find((s) => s.id === id)?.name || id).join('/');
      const cSt = STAGES_DATA.find((s) => s.id === chosenId);
      const tag = chosenId === primaryId ? '主關卡' : '副關卡(隨機)';
      addLog(
        `[雙刷圖] 本輪隨機排定【${cSt?.name || chosenId}】（${tag}｜主:${pSt?.name || primaryId} / 副池:${secNames} ${Math.round(baseSecProb * 100)}%）`
      );
    }
    return chosenId;
  }

  function getCurrentFarmTargetStage() {
    const ex = getExtra();
    const id = state.activeFarmStageId || ex.farmStageId || 'payon_cave';
    return (
      STAGES_DATA.find((s) => s.id === id) ||
      STAGES_DATA.find((s) => s.id === ex.farmStageId) ||
      STAGES_DATA.find((s) => s.id === 'payon_cave') ||
      STAGES_DATA[0]
    );
  }

  function updateFarmHud() {
    const btn = $id('rh-btn-farm');
    if (btn) {
      btn.textContent = state.farmEnabled ? '刷圖迴圈：運作中' : '刷圖迴圈：關閉';
      btn.className = state.farmEnabled ? 'rh-btn rh-btn-active' : 'rh-btn rh-btn-primary';
    }
    const countEl = $id('rh-farm-count');
    if (countEl) {
      const max = Number(getExtra().farmMaxRuns) || 0;
      countEl.textContent = max > 0 ? `完成 ${state.farmRunsDone}/${max} 場` : `完成 ${state.farmRunsDone} 場`;
    }
    const stageInfo = $id('rh-farm-stage-info');
    if (stageInfo) {
      const ex = getExtra();
      const st = getCurrentFarmTargetStage();
      const dur = st.bossTime
        ? `${Math.round(st.bossTime / 60)}分出王(+2分)`
        : st.runLength
        ? `${st.runLength % 60 === 0 ? st.runLength / 60 : (st.runLength / 60).toFixed(1)}分`
        : '活動副本';
      const miniStr = Array.isArray(st.miniBossTimes) && st.miniBossTimes.length
        ? `｜小王 ${st.miniBossTimes.map((t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`).join('/')}`
        : '';
      const secPool = getValidSecondaryStageIds(ex);
      if (ex.farmDualEnabled && secPool.length > 0) {
        const pSt = STAGES_DATA.find((s) => s.id === ex.farmStageId);
        const secNames = secPool.map((id) => STAGES_DATA.find((s) => s.id === id)?.name || id).join('、');
        const secPct = Math.max(5, Math.min(95, Number(ex.farmDualChancePct) || 35));
        stageInfo.textContent = `雙圖排定：${st.name}（${dur}）｜主 ${pSt?.name || ''} ${100 - secPct}% / 副隨機(${secNames}) ${secPct}%`;
      } else {
        stageInfo.textContent = `${dur}${miniStr}｜MVP：${st.mvp}`;
      }
    }
    const restStatusEl = $id('rh-farm-rest-status');
    const restResumeBtn = $id('rh-farm-rest-resume');
    if (restStatusEl) {
      const ex = getExtra();
      if (state.farmRestUntil && state.farmRestUntil > Date.now()) {
        const remSec = Math.max(0, Math.ceil((state.farmRestUntil - Date.now()) / 1000));
        const mm = Math.floor(remSec / 60);
        const ss = String(remSec % 60).padStart(2, '0');
        const wakeStr = new Date(state.farmRestUntil).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
        restStatusEl.textContent = `😴 休息登出中：剩餘 ${mm}:${ss}（預計 ${wakeStr} 自動登入續刷）`;
        restStatusEl.style.color = '#93C5FD';
        restStatusEl.style.display = 'block';
        if (restResumeBtn) restResumeBtn.style.display = 'inline-flex';
      } else if (ex.farmRestEnabled) {
        if (!state.farmSessionTargetRuns) state.farmSessionTargetRuns = rollFarmSessionTargetRuns();
        const rLo = Math.max(1, Number(ex.farmRestMinMin) || 25);
        const rHi = Math.max(rLo, Number(ex.farmRestMaxMin) || 55);
        restStatusEl.textContent = `本輪 ${state.farmSessionRunsDone}/${state.farmSessionTargetRuns} 場（達標後 F5 登出休 ${rLo}~${rHi} 分）`;
        restStatusEl.style.color = '#86EFAC';
        restStatusEl.style.display = 'block';
        if (restResumeBtn) restResumeBtn.style.display = 'none';
      } else {
        restStatusEl.textContent = '';
        restStatusEl.style.display = 'none';
        if (restResumeBtn) restResumeBtn.style.display = 'none';
      }
    }
    updateStatusBar();
  }

  function safeFarmClick(el, tag, label, lockMs = 2600, coords = null) {
    if (!el || !el.isConnected) return false;
    const delay = randomHumanDelay();
    state.farmLockUntil = Date.now() + delay + lockMs;
    addLog(`[刷圖/${tag}] ${label} (延遲 ${delay}ms)`);
    setTimeout(() => {
      if ((!state.farmEnabled && !coords?.allowWithoutFarm) || state.paused) return;
      if (!el.isConnected || !isVisible(el, 2)) return;
      if (!coords?.exactCoords) scrollTargetIntoViewIfNeeded(el);
      const r = el.getBoundingClientRect();
      const cx = coords && typeof coords.x === 'number' ? coords.x : r.left + r.width * 0.5;
      const cy = coords && typeof coords.y === 'number' ? coords.y : r.top + r.height * 0.5;
      performElementClick(el, cx, cy, label || tag, {
        exactCoords: Boolean(coords?.exactCoords),
        skipHoverCheck: Boolean(coords?.skipHoverCheck),
        skipScroll: Boolean(coords?.skipScroll),
      });
    }, delay);
    return true;
  }

  function findClickableOutsideHud(matcher) {
    const els = Array.from(document.querySelectorAll('button, [role="button"], .btn, .slot, a')).filter(
      (el) => !isOwnHudNode(el) && isActionBtnReady(el)
    );
    return els.find((el) => {
      const txt = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      return matcher(txt, el);
    }) || null;
  }

  function getOwnCharacterName() {
    const raw = (
      document.querySelector('#hud-name span')?.textContent ||
      document.querySelector('#hud-name')?.childNodes?.[0]?.textContent ||
      document.querySelector('#hud-name')?.textContent ||
      document.querySelector('#slot-info .n')?.textContent ||
      ''
    ).trim();
    return raw.split(/\s+/)[0] || '';
  }

  function findLobbyPlayerPoint() {
    const selfSelectors = [
      '.lobby-name.self', '.lobby-name.me', '.lobby-name.player',
      '#player', '.lobby-player', '[data-player="self"]',
    ];
    for (const sel of selfSelectors) {
      const el = Array.from(document.querySelectorAll(sel)).find((e) => !isOwnHudNode(e) && isVisible(e, 6));
      if (el) {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width * 0.5, y: r.bottom + 20, source: 'dom_self' };
      }
    }
    const nonNpcNames = Array.from(document.querySelectorAll('.lobby-name:not(.npc)')).filter(
      (e) => !isOwnHudNode(e) && isVisible(e, 6)
    );
    if (nonNpcNames.length === 1) {
      const r = nonNpcNames[0].getBoundingClientRect();
      return { x: r.left + r.width * 0.5, y: r.bottom + 20, source: 'lobby_name_single' };
    }
    if (nonNpcNames.length > 1) {
      const myName = getOwnCharacterName();
      const match = myName && nonNpcNames.find((e) => (e.textContent || '').includes(myName));
      if (match) {
        const r = match.getBoundingClientRect();
        return { x: r.left + r.width * 0.5, y: r.bottom + 20, source: 'lobby_name_match' };
      }
    }
    const stageCanvas =
      document.querySelector('#stage canvas.ro-cursor') ||
      document.querySelector('#stage canvas.world3d') ||
      document.querySelector('#stage canvas');
    if (stageCanvas && isVisible(stageCanvas, 200)) {
      const cr = stageCanvas.getBoundingClientRect();
      return { x: cr.left + cr.width * 0.5, y: cr.top + cr.height * 0.5, source: 'stage_canvas_center' };
    }
    const canvas = Array.from(document.querySelectorAll('canvas')).find(
      (c) => !isOwnHudNode(c) && !c.closest('#minimap') && isVisible(c, 200)
    );
    if (canvas) {
      const cr = canvas.getBoundingClientRect();
      return { x: cr.left + cr.width * 0.5, y: cr.top + cr.height * 0.5, source: 'canvas_center' };
    }
    return { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5, source: 'viewport_center' };
  }

  function findLobbyNpcInfo(keyword) {
    const isSmallNameplate = (el) => {
      if (!el || isOwnHudNode(el) || el.closest('#lobby-prompt') || el.closest('#lobby-place')) return false;
      if (!isVisible(el, 6)) return false;
      const r = el.getBoundingClientRect();
      return r.width > 6 && r.height > 6 && r.width <= 260 && r.height <= 80;
    };
    const exactNpcLabels = Array.from(document.querySelectorAll('.lobby-name.npc')).filter(isSmallNameplate);
    let hit = exactNpcLabels.find((el) => (el.textContent || '').includes(keyword));
    if (!hit) {
      const lobbyLabels = Array.from(
        document.querySelectorAll('.lobby-name:not(.self):not(.me):not(.player), [class*="npc-name"]')
      ).filter(isSmallNameplate);
      hit = lobbyLabels.find((el) => (el.textContent || '').includes(keyword));
    }
    if (!hit) {
      const leafEls = Array.from(
        document.querySelectorAll('div, span, b, p, h3, h4, h5, button, [role="button"]')
      ).filter((el) => el.children.length === 0 && isSmallNameplate(el));
      hit = leafEls.find((el) => {
        const t = (el.textContent || '').trim();
        return t.length <= 20 && t.includes(keyword);
      });
    }
    if (!hit) return null;
    const r = hit.getBoundingClientRect();
    const clampX = (v) => Math.max(4, Math.min(window.innerWidth - 4, v));
    const clampY = (v) => Math.max(4, Math.min(window.innerHeight - 4, v));
    const npcX = clampX(r.left + r.width * 0.5);
    const npcLabelY = clampY(r.top + r.height * 0.5);
    const npcBodyY = clampY(r.bottom + 22);
    const st = window.getComputedStyle(hit);
    let clickTarget = hit;
    let clickX = npcX;
    let clickY = npcLabelY;
    if (st.pointerEvents === 'none') {
      const underBody = document.elementFromPoint(npcX, npcBodyY);
      const underLabel = document.elementFromPoint(npcX, npcLabelY);
      const under =
        (underBody && !isOwnHudNode(underBody) ? underBody : null) ||
        (underLabel && !isOwnHudNode(underLabel) ? underLabel : null);
      clickTarget = under || (hit.parentElement && !isOwnHudNode(hit.parentElement) ? hit.parentElement : hit);
      clickX = npcX;
      clickY = npcBodyY;
    }
    return {
      keyword,
      labelEl: hit,
      clickTarget,
      npcX,
      npcLabelY,
      npcBodyY,
      clickX,
      clickY,
    };
  }

  function walkBurstToward(dx, dy, stepMs) {
    if (state.npcWalking || state.paused || !state.farmEnabled) return false;
    const scheme = KEY_MAPS[CONFIG.autoMoveConfig.keyScheme] || KEY_MAPS.wasd;
    const keys = [];
    if (Math.abs(dx) > 22) keys.push(dx > 0 ? scheme.right : scheme.left);
    if (Math.abs(dy) > 22) keys.push(dy > 0 ? scheme.down : scheme.up);
    if (!keys.length) {
      if (Math.abs(dx) >= Math.abs(dy)) keys.push(dx >= 0 ? scheme.right : scheme.left);
      else keys.push(dy >= 0 ? scheme.down : scheme.up);
    }
    try {
      const hudActive = hudRoot?.activeElement;
      if (hudActive && !/INPUT|SELECT|TEXTAREA/i.test(hudActive.tagName || '')) {
        hudActive.blur?.();
      }
      const active = document.activeElement;
      if (active && isOwnHudNode(active)) active.blur?.();
    } catch (_) {}
    const jitteredStepMs = randomInRangeMs(Math.max(120, Math.round(stepMs * 0.76)), Math.round(stepMs * 1.28));
    state.npcWalking = true;
    state.npcLastMoveMode = 'keyboard';
    keys.forEach((def, idx) => {
      const d = idx === 0 ? 0 : 14 + Math.floor(Math.random() * 44);
      if (d === 0) {
        state.heldKeys.add(def.code);
        dispatchMoveKey('keydown', def);
      } else {
        const tid = setTimeout(() => {
          if (state.paused || !state.farmEnabled) return;
          state.heldKeys.add(def.code);
          dispatchMoveKey('keydown', def);
        }, d);
        state.moveKeyTimers.push(tid);
      }
    });
    state.npcWalkTimer = setTimeout(() => {
      clearPendingMoveKeyTimers();
      keys.forEach((def, idx) => {
        const rd = idx === 0 ? 0 : 8 + Math.floor(Math.random() * 30);
        if (rd === 0) {
          dispatchMoveKey('keyup', def);
          state.heldKeys.delete(def.code);
        } else {
          setTimeout(() => {
            dispatchMoveKey('keyup', def);
            state.heldKeys.delete(def.code);
          }, rd);
        }
      });
      state.npcWalking = false;
      state.npcWalkTimer = null;
      state.farmLockUntil = 0;
      if (state.farmEnabled && !state.paused) {
        const nextPause = Math.random() < 0.18 ? randomInRangeMs(260, 500) : randomInRangeMs(110, 290);
        setTimeout(() => safeRun(runFarmingLoopStep), nextPause);
      }
    }, jitteredStepMs);
    return true;
  }

  function walkMouseClickToward(playerPt, dx, dy, opts = {}) {
    if (state.npcWalking || state.paused || !state.farmEnabled) return false;
    if ((CONFIG.selectionActionMode || 'hybrid_bridge') !== 'hybrid_bridge') return false;
    if (getExtra().bridgeAllowClick === false) return false;
    const dist = Math.hypot(dx, dy);
    if (!Number.isFinite(dist) || dist < 20) return false;
    const ux = dx / dist;
    const uy = dy / dist;
    const targetStep =
      typeof opts.stepDist === 'number' && opts.stepDist > 0
        ? opts.stepDist
        : Math.min(dist * (0.68 + Math.random() * 0.24), randomInRangeMs(120, 255));
    const wobble = (Math.random() - 0.5) * 2 * (opts.wobblePx ?? 24);
    const rawX = playerPt.x + ux * targetStep - uy * wobble;
    const rawY = playerPt.y + uy * targetStep + ux * wobble;
    const minX = Math.max(120, Math.round(window.innerWidth * 0.16));
    const maxX = Math.round(window.innerWidth * 0.86);
    const minY = Math.round(window.innerHeight * 0.15);
    const maxY = Math.round(window.innerHeight * 0.82);
    const tx = Math.max(minX, Math.min(maxX, Math.round(rawX)));
    const ty = Math.max(minY, Math.min(maxY, Math.round(rawY)));
    const actualDist = Math.hypot(tx - playerPt.x, ty - playerPt.y);
    if (actualDist < 42) return false;
    // 安全防護：只點擊遊戲畫布本身，避免誤點到 HUD、小地圖、按鈕或視窗
    const hit = document.elementFromPoint(tx, ty);
    if (!hit || isOwnHudNode(hit) || String(hit.tagName || '').toUpperCase() !== 'CANVAS') {
      return false;
    }
    const acted = performElementClick(hit, tx, ty, opts.label || '村莊滑鼠走位', {
      exactCoords: true,
      skipHoverCheck: true,
      skipScroll: true,
    });
    if (!acted) return false;
    const waitMs =
      typeof opts.waitMs === 'number' && opts.waitMs > 0
        ? randomInRangeMs(Math.round(opts.waitMs * 0.82), Math.round(opts.waitMs * 1.24))
        : Math.round(Math.max(360, Math.min(920, actualDist * (2.5 + Math.random() * 1.1))));
    state.npcWalking = true;
    state.npcLastMoveMode = 'mouse';
    state.npcWalkTimer = setTimeout(() => {
      state.npcWalking = false;
      state.npcWalkTimer = null;
      state.farmLockUntil = 0;
      if (state.farmEnabled && !state.paused) {
        const nextPause = Math.random() < 0.2 ? randomInRangeMs(240, 480) : randomInRangeMs(110, 270);
        setTimeout(() => safeRun(runFarmingLoopStep), nextPause);
      }
    }, waitMs);
    return true;
  }

  function pickFestivalRoutePlan() {
    const roll = Math.random();
    const arcSign = Math.random() < 0.5 ? 1 : -1;
    if (roll < 0.26) {
      return {
        id: 'south_then_east',
        label: '南繞微偏',
        mouseChance: 0.35 + Math.random() * 0.2,
        arcSign,
        s1Dx: randomInRangeMs(-32, 32),
        s1Dy: 100,
        s1Ms: randomInRangeMs(360, 560),
        s2Dx: 100,
        s2Dy: randomInRangeMs(-20, 32),
        s2Ms: randomInRangeMs(420, 650),
      };
    }
    if (roll < 0.54) {
      return {
        id: 'diag_se_bypass',
        label: '斜切下緣',
        mouseChance: 0.4 + Math.random() * 0.22,
        arcSign,
        s1Dx: randomInRangeMs(34, 68),
        s1Dy: 100,
        s1Ms: randomInRangeMs(380, 580),
        s2Dx: 100,
        s2Dy: randomInRangeMs(-38, 12),
        s2Ms: randomInRangeMs(390, 610),
      };
    }
    if (roll < 0.78) {
      return {
        id: 'wide_south_arc',
        label: '寬幅南弧',
        mouseChance: 0.32 + Math.random() * 0.2,
        arcSign,
        s1Dx: randomInRangeMs(-52, -14),
        s1Dy: 100,
        s1Ms: randomInRangeMs(340, 520),
        s2Dx: 100,
        s2Dy: randomInRangeMs(14, 44),
        s2Ms: randomInRangeMs(470, 710),
      };
    }
    return {
      id: 'mouse_lead_mix',
      label: '滑鼠引導混搭',
      mouseChance: 0.65 + Math.random() * 0.2,
      arcSign,
      s1Dx: randomInRangeMs(18, 60),
      s1Dy: 100,
      s1Ms: randomInRangeMs(380, 560),
      s2Dx: 100,
      s2Dy: randomInRangeMs(-26, 26),
      s2Ms: randomInRangeMs(420, 620),
    };
  }

  function walkMixedTowardVector(playerPt, dx, dy, stepMs, opts = {}) {
    const dist = Math.hypot(dx, dy);
    let mouseProb = typeof opts.mouseChance === 'number' ? opts.mouseChance : 0.42;
    // 若連續使用同一種方式，適度提高切換機率，讓滑鼠與鍵盤更自然交錯
    if (state.npcLastMoveMode === 'mouse') mouseProb = Math.max(0.18, mouseProb - 0.16);
    else if (state.npcLastMoveMode === 'keyboard') mouseProb = Math.min(0.85, mouseProb + 0.12);
    const allowMouse = opts.allowMouse !== false && dist >= (opts.minMouseDist ?? 90);
    if (allowMouse && Math.random() < mouseProb) {
      const clicked = walkMouseClickToward(playerPt, dx, dy, {
        stepDist: opts.mouseStepDist,
        wobblePx: opts.wobblePx ?? 24,
        waitMs: opts.mouseWaitMs,
        label: opts.mouseLabel || '村莊滑鼠移動',
      });
      if (clicked) return 'mouse';
    }
    if (walkBurstToward(dx, dy, stepMs)) return 'keyboard';
    return '';
  }

  function readMaintenanceRemainingSec() {
    const candidates = [
      document.querySelector('#maint-banner:not(.hidden)'),
      document.querySelector('#sp-maint:not(.hidden)'),
      document.querySelector('#sp-maint'),
    ];
    const el = candidates.find((c) => c && !isOwnHudNode(c) && isVisible(c, 8));
    if (!el) return null;
    const spanTxt = (
      el.querySelector('.sp-maint-when')?.textContent ||
      el.querySelector('.sp-maint-left')?.textContent ||
      el.querySelector('.mb-left')?.textContent ||
      el.querySelector('.mb-text')?.textContent ||
      el.querySelector('span')?.textContent ||
      el.textContent ||
      ''
    ).replace(/\s+/g, ' ').trim();
    if (!spanTxt) return null;
    const hms = spanTxt.match(/(d{1,2}):(d{2}):(d{2})/);
    if (hms) return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]);
    const ms = spanTxt.match(/(d{1,3}):(d{2})/);
    if (ms) return Number(ms[1]) * 60 + Number(ms[2]);
    const mins = spanTxt.match(/(d{1,3})s*分/);
    if (mins) return Number(mins[1]) * 60;
    // 支援解析絕對時間點（如 上午04:15 進行維護 / 20:20後）與維護關鍵字
    if (/維護|更新|maint|maintenance/i.test(spanTxt)) {
      const timeMatch = spanTxt.match(/(d{1,2}):(d{2})/);
      if (timeMatch) {
        const targetHour = Number(timeMatch[1]);
        const targetMin = Number(timeMatch[2]);
        const isPm = /下午|PM/i.test(spanTxt);
        const adjustedHour = isPm && targetHour < 12 ? targetHour + 12 : targetHour;
        const now = new Date();
        const targetDate = new Date(now);
        targetDate.setHours(adjustedHour, targetMin, 0, 0);
        let diffSec = Math.floor((targetDate.getTime() - now.getTime()) / 1000);
        if (diffSec < 0) diffSec += 86400;
        return diffSec;
      }
      return 0; // 若有維護公告但無明確時間，視為即將維護，停止進本
    }
    return null;
  }

  function createVillageDwellPlan(minSec = 10, maxSec = 60) {
    const lo = Math.max(0, Math.min(300, Number(minSec) || 0));
    const hi = Math.max(lo, Math.min(300, Number(maxSec) || lo));
    const totalMs = randomInRangeMs(Math.round(lo * 1000), Math.round(hi * 1000));
    if (totalMs <= 0) return null;
    const keys = ['arrival', 'midWalk', 'preNpc', 'dialog', 'confirm'];
    // 每場隨機抽樣 2~5 個動作節點，讓停留節奏完全不固定
    const activeKeys = keys.filter(() => Math.random() < 0.72);
    if (activeKeys.length < 2) {
      const shuffled = [...keys].sort(() => Math.random() - 0.5);
      while (activeKeys.length < 2 && shuffled.length) {
        const k = shuffled.shift();
        if (!activeKeys.includes(k)) activeKeys.push(k);
      }
    }
    // 使用指數隨機權重 (Dirichlet(1)) 把總時間自然隨機切分到各節點
    const weights = {};
    let wSum = 0;
    for (const k of activeKeys) {
      const w = -Math.log(Math.max(0.02, Math.random())) + 0.15;
      weights[k] = w;
      wSum += w;
    }
    const budgets = { arrival: 0, midWalk: 0, preNpc: 0, dialog: 0, confirm: 0 };
    let allocated = 0;
    activeKeys.forEach((k, idx) => {
      if (idx === activeKeys.length - 1) {
        budgets[k] = Math.max(0, totalMs - allocated);
      } else {
        const part = Math.round((totalMs * weights[k]) / wSum);
        budgets[k] = part;
        allocated += part;
      }
    });
    const midWalkTriggerStep = budgets.midWalk >= 800 ? randomInRangeMs(1, 3) : 0;
    return {
      createdAt: Date.now(),
      totalMs,
      budgets,
      done: { arrival: false, midWalk: false, preNpc: false, dialog: false, confirm: false },
      midWalkTriggerStep,
      activeSlot: null,
      activeUntil: 0,
    };
  }

  function holdVillageDwellSlot(slotKey, label, carrySlots = []) {
    const plan = state.villageDwellPlan;
    if (!plan) return false;
    const now = Date.now();
    if (plan.activeSlot) {
      if (now < plan.activeUntil) {
        stopNpcWalk();
        return true;
      }
      plan.done[plan.activeSlot] = true;
      plan.activeSlot = null;
      plan.activeUntil = 0;
    }
    if (plan.done[slotKey]) return false;
    let waitMs = Number(plan.budgets[slotKey]) || 0;
    plan.budgets[slotKey] = 0;
    // 若先前未經過某些節點（例如直接出生在教官旁沒走半路），自動把未用完的時間順延合併，確保總停留落在目標區間
    for (const ck of carrySlots) {
      if (!plan.done[ck] && (Number(plan.budgets[ck]) || 0) > 0) {
        waitMs += Number(plan.budgets[ck]) || 0;
        plan.budgets[ck] = 0;
        plan.done[ck] = true;
      }
    }
    if (waitMs < 350) {
      plan.done[slotKey] = true;
      return false;
    }
    stopNpcWalk();
    plan.activeSlot = slotKey;
    plan.activeUntil = now + waitMs;
    addLog(`[村莊停留] ${label}（停 ${(waitMs / 1000).toFixed(1)} 秒）`);
    return true;
  }

  function runFarmingLoopStep() {
    if (state.farmReloadPending || state.farmDoneHalted || state.paused) return;
    // 階段休息登出倒數中：保持離線在登入畫面，絕不自動點擊登入
    if (state.farmRestUntil && Date.now() < state.farmRestUntil) return;
    if (state.farmEnabled) {
      ensureFarmDependenciesActive('刷圖自檢');
    }
    const exPre = getExtra();
    const anyAutoActive = Boolean(state.farmEnabled || state.autoEnabled || CONFIG.autoMoveConfig.mode === 'radius_wander');
    if (!anyAutoActive && !exPre.farmAutoPlayLobby) return;
    const canAutoLogin = Boolean(state.farmEnabled || anyAutoActive || exPre.farmAutoPlayLobby);
    // 0-acct. 登入前若跳出「現在需要帳號」提示視窗，點擊「建立我的帳號」進入帳號登入卡片
    if (canAutoLogin && Date.now() >= state.farmLockUntil) {
      const acctNpcWin = Array.from(document.querySelectorAll('.ro-window.npc-window')).find((w) => {
        if (!w || isOwnHudNode(w) || !isVisible(w, 20)) return false;
        const title = (w.querySelector('#npc-name, .ro-title')?.textContent || '').trim();
        const optTxt = (w.querySelector('#npc-options')?.textContent || '').trim();
        return /現在需要帳號|需要帳號|account\s*required/i.test(title) || /建立我的帳號/.test(optTxt);
      });
      if (acctNpcWin) {
        const createAcctBtn =
          Array.from(acctNpcWin.querySelectorAll('#npc-options button, button.ro-btn.primary, button[role="button"]')).find(
            (b) => !isOwnHudNode(b) && isActionBtnReady(b) && /建立我的帳號|create.*account/i.test((b.textContent || '').replace(/\s+/g, ''))
          ) || acctNpcWin.querySelector('#npc-options button.ro-btn.primary');
        if (createAcctBtn && isActionBtnReady(createAcctBtn)) {
          safeFarmClick(createAcctBtn, '登入', '偵測到「現在需要帳號」提示，自動點擊「建立我的帳號」', 1400, { skipScroll: true, allowWithoutFarm: true });
          return;
        }
      }
      // 0-sp-card. 帳號卡片 (.ro-window.sp-card)：切換至左側「進入」分頁並點擊「進入」提交登入
      const spCard = document.querySelector('.ro-window.sp-card');
      const spPlayBtnCheck = document.querySelector('#sp-play');
      const spPlayVisible = Boolean(spPlayBtnCheck && !isOwnHudNode(spPlayBtnCheck) && isVisible(spPlayBtnCheck, 12));
      if (spCard && !isOwnHudNode(spCard) && isVisible(spCard, 40) && !spPlayVisible) {
        const loginPane = spCard.querySelector('#sp-login, .sp-pane[data-sp-pane="login"]');
        const loginTabBtn = spCard.querySelector('.sp-tabs button[data-sp-tab="login"]');
        const loginPaneVisible = Boolean(loginPane && !loginPane.classList.contains('hidden') && isVisible(loginPane, 20));
        if (!loginPaneVisible && loginTabBtn && isActionBtnReady(loginTabBtn)) {
          safeFarmClick(loginTabBtn, '登入', '帳號視窗停在建立帳號，自動點擊左側「進入」分頁', 1300, { skipScroll: true, allowWithoutFarm: true });
          return;
        }
        if (loginPaneVisible && loginPane) {
          const errTxt = (loginPane.querySelector('.sp-error')?.textContent || '').trim();
          if (errTxt) {
            if (Date.now() - (state.loginErrorLogAt || 0) > 15000) {
              state.loginErrorLogAt = Date.now();
              addLog(`[登入暫停] 登入視窗出現錯誤訊息「${errTxt}」，請確認帳號密碼`);
            }
            return;
          }
          const isInputFilled = (inp) => {
            if (!inp) return false;
            if (String(inp.value || '').trim().length > 0) return true;
            try { return inp.matches(':-webkit-autofill') || inp.matches(':autofill'); } catch (_) { return false; }
          };
          const userEl = loginPane.querySelector('input[name="username"]');
          const passEl = loginPane.querySelector('input[name="password"]');
          const submitBtn = loginPane.querySelector('button.sp-submit[type="submit"], button[type="submit"]');
          if (isInputFilled(userEl) && isInputFilled(passEl) && submitBtn && isActionBtnReady(submitBtn)) {
            safeFarmClick(submitBtn, '登入', '帳號密碼已就緒，自動點擊下方「進入」登入帳號', 3200, { skipScroll: true, allowWithoutFarm: true });
            return;
          }
          if (Date.now() - (state.loginWaitLogAt || 0) > 15000) {
            state.loginWaitLogAt = Date.now();
            addLog('[登入等待] 已切至「進入」分頁，等待瀏覽器自動填入或手動輸入帳號密碼');
          }
          return;
        }
      }
    }
    // 0-pending-loot. 結算期間登出／重整後於選角畫面跳出「你的上一局」補領戰利品彈窗，必須先按「接受」才能點「開始遊戲」
    if (canAutoLogin) {
      const pendingLootWin = Array.from(document.querySelectorAll('#npc-dialog:not(.hidden) .ro-window.npc-window, .ro-window.npc-window')).find((w) => {
        if (!w || isOwnHudNode(w) || !isVisible(w, 20)) return false;
        const title = (w.querySelector('#npc-name, .ro-title')?.textContent || '').trim();
        const body = (w.querySelector('#npc-text, .ro-body')?.textContent || '').trim();
        if (/未完成的一局|離開了一局|繼續嗎/i.test(title + ' ' + body)) return false;
        return (
          Boolean(w.querySelector('.pending-loot')) ||
          /你的上一局|上一局|your\s*last\s*run|pending\s*loot|unclaimed/i.test(title) ||
          /這局結束時無法領取|已經放進你的帳號|could\s*not\s*be\s*claimed|added\s*to\s*your\s*account/i.test(body)
        );
      });
      if (pendingLootWin) {
        if (Date.now() >= state.farmLockUntil) {
          const acceptBtn =
            Array.from(pendingLootWin.querySelectorAll('#npc-options button, button.ro-btn, button[role="button"]')).find(
              (b) => !isOwnHudNode(b) && isActionBtnReady(b) && /接受|領取|確定|accept|claim|ok/i.test((b.textContent || '').replace(/\s+/g, '').trim())
            ) ||
            pendingLootWin.querySelector('#npc-options button.ro-btn.primary') ||
            pendingLootWin.querySelector('button.ro-btn.primary');
          if (acceptBtn && !isOwnHudNode(acceptBtn) && isActionBtnReady(acceptBtn)) {
            stopNpcWalk();
            const lootItems = Array.from(pendingLootWin.querySelectorAll('.pending-loot li'))
              .map((li) => (li.textContent || '').replace(/\s+/g, ' ').trim())
              .filter(Boolean);
            const lootPreview = lootItems.length
              ? `（共 ${lootItems.length} 項：${lootItems.slice(0, 3).join('、')}${lootItems.length > 3 ? '…' : ''}）`
              : '';
            safeFarmClick(
              acceptBtn,
              '補領',
              `偵測到「你的上一局」補領彈窗${lootPreview}，自動點擊「接受」`,
              1800,
              { skipScroll: true, allowWithoutFarm: true }
            );
          }
        }
        return;
      }
    }
    if (!anyAutoActive) return;
    // 0-afk-kick. 閒置 5 分鐘被踢出遊戲的「暫離」提示視窗 (.ro-window.npc-window)：必須先點「接受」才能點後方的「開始遊戲！」(#sp-play)
    const afkKickWin = Array.from(document.querySelectorAll('#npc-dialog:not(.hidden) .ro-window.npc-window, .ro-window.npc-window')).find((w) => {
      if (!w || isOwnHudNode(w) || !isVisible(w, 20)) return false;
      const title = (w.querySelector('#npc-name, .ro-title')?.textContent || '').trim();
      const body = (w.querySelector('#npc-text, .ro-body')?.textContent || '').trim();
      const fullTxt = title + ' ' + body;
      if (/未完成的一局|離開了一局|繼續嗎|現在需要帳號|需要帳號|選擇大廳|大廳選擇/i.test(fullTxt)) return false;
      return (
        /^(?:暫離|閒置|閒置登出|離開遊戲|連線中斷|斷線|已斷線|AFK|Idle|Away|Disconnected)$/i.test(title) ||
        /沒有動作|已離開遊戲|按[「"']?開始遊戲[」"']?即可回來|連線已中斷|與伺服器斷線|inactivity|idle\s*for|kicked\s*for\s*afk|away\s*for|disconnected\s*from/i.test(body)
      );
    });
    if (afkKickWin) {
      if (Date.now() >= state.farmLockUntil) {
        const acceptBtn =
          Array.from(afkKickWin.querySelectorAll('#npc-options button, button.ro-btn, button[role="button"]')).find(
            (b) => !isOwnHudNode(b) && isActionBtnReady(b) && /接受|確定|確認|好的|知道了|accept|ok|confirm/i.test((b.textContent || '').replace(/\s+/g, '').trim())
          ) ||
          afkKickWin.querySelector('#npc-options button.ro-btn.primary') ||
          afkKickWin.querySelector('button.ro-btn.primary');
        if (acceptBtn && !isOwnHudNode(acceptBtn) && isActionBtnReady(acceptBtn)) {
          stopNpcWalk();
          state.npcWalkAttempts = 0;
          state.npcClickRetryPhase = 0;
          state.festivalDetourStep = 0;
          state.villageDwellPending = false;
          state.villageDwellPlan = null;
          const modalTitle = (afkKickWin.querySelector('#npc-name, .ro-title')?.textContent || '暫離').trim();
          safeFarmClick(
            acceptBtn,
            '暫離',
            `偵測到「${modalTitle}」閒置登出彈窗，自動點擊「接受」（隨後將自動點擊「開始遊戲！」）`,
            1400,
            { skipScroll: true, allowWithoutFarm: true }
          );
        }
      }
      return;
    }
    // 0. 登入初始畫面 splash screen (#sp-play) 讀取完成後自動點擊「開始遊戲！」（若有系統彈窗遮擋則先等待關閉）
    const blockingSplashModal = Array.from(document.querySelectorAll('#npc-dialog:not(.hidden) .ro-window.npc-window, .ro-window.npc-window')).some(
      (w) => w && !isOwnHudNode(w) && isVisible(w, 20)
    );
    const spPlayBtn =
      document.querySelector('#sp-play') ||
      Array.from(document.querySelectorAll('.ro-window.sp-card button, #splash button, .sp-card button')).find(
        (b) => !isOwnHudNode(b) && isVisible(b, 12) && /^開始遊戲[！!]?$|^play!?$/i.test((b.textContent || '').replace(/\s+/g, '').trim())
      );
    if (!blockingSplashModal && spPlayBtn && !isOwnHudNode(spPlayBtn) && isVisible(spPlayBtn) && Date.now() >= state.farmLockUntil) {
      const isReady = spPlayBtn.classList.contains('ready') || !spPlayBtn.querySelector('.sp-fill') || (spPlayBtn.querySelector('.sp-fill')?.style?.transform?.includes('1') ?? true);
      if (isReady && !spPlayBtn.disabled) {
        safeFarmClick(spPlayBtn, '登入', '偵測到登入畫面，自動點擊「開始遊戲！」 (#sp-play)', 2500, { skipScroll: true, allowWithoutFarm: true });
        return;
      }
    }
    // 0b. 斷線重連後詢問是否繼續副本的彈窗 ("未完成的一局")
    const activeNpcWin = document.querySelector('.ro-window.npc-window') || document.querySelector('#npc-dialog .ro-window.npc-window');
    if (activeNpcWin && isVisible(activeNpcWin) && !isOwnHudNode(activeNpcWin)) {
      const npcTitle = (activeNpcWin.querySelector('#npc-name, .ro-title')?.textContent || '').trim();
      const npcBody = (activeNpcWin.querySelector('#npc-text, .ro-body')?.textContent || '').trim();
      const isUnfinishedRun = /未完成的一局|離開了一局|繼續嗎/i.test(npcTitle) || /離開了一局|繼續嗎/i.test(npcBody);
      if (isUnfinishedRun) {
        const continueBtn = Array.from(activeNpcWin.querySelectorAll('button, [role="button"]')).find(
          (b) => isActionBtnReady(b) && /繼續|continue/i.test((b.textContent || '').replace(/\s+/g, '').trim())
        ) || activeNpcWin.querySelector('button.ro-btn.primary');
        if (continueBtn && isActionBtnReady(continueBtn)) {
          stopNpcWalk();
          safeFarmClick(continueBtn, '斷線重連', '偵測到未完成的一局提示，自動點擊「繼續」', 3000, { skipScroll: true, allowWithoutFarm: true });
          return;
        }
      }
    }
    // 0c. 遊戲暫停視窗防護 (若在按開始運作後暫停視窗還在，自動點擊「繼續」#btn-resume 或按 ESC 關閉)
    const pauseWin = document.querySelector('.ro-window.small-window, #pause') || document.querySelector('#btn-resume')?.closest('.ro-window');
    if (pauseWin && isVisible(pauseWin) && !isOwnHudNode(pauseWin)) {
      const pauseTitle = (pauseWin.querySelector('.ro-title')?.textContent || '').trim();
      const isPauseModal = /暫停|PAUSED/i.test(pauseTitle) || Boolean(pauseWin.querySelector('#btn-resume'));
      if (isPauseModal) {
        const resumeBtn = pauseWin.querySelector('#btn-resume') || Array.from(pauseWin.querySelectorAll('button, [role="button"]')).find(
          (b) => isActionBtnReady(b) && /繼續|resume/i.test((b.textContent || '').replace(/\s+/g, '').trim())
        );
        if (resumeBtn && isActionBtnReady(resumeBtn)) {
          stopNpcWalk();
          safeFarmClick(resumeBtn, '遊戲暫停', '偵測到遊戲暫停視窗，自動點擊「繼續」 (#btn-resume)', 2500, { skipScroll: true, allowWithoutFarm: true });
          return;
        } else {
          performEscapeKey(); // 依模式走橋接真實按鍵
          addLog('[遊戲暫停] 偵測到暫停視窗，自動發送 ESC 關閉');
          return;
        }
      }
    }
    if (!state.farmEnabled || state.paused || state.pickerActive || state.npcWalking) return;
    if (Date.now() < state.farmLockUntil) return;
    if (findDomCardElements().length >= 2) return;
    const ex = getExtra();
    const ds = CONFIG.domSelectors || {};
    if (!state.activeFarmStageId) pickNextFarmStageId(false);
    const targetStage = getCurrentFarmTargetStage();
    // 1. 結算畫面 (#gameover:not(.hidden) .summary-window)
    const summaryWin = document.querySelector('#gameover:not(.hidden) .summary-window') || document.querySelector('.summary-window');
    if (summaryWin && !isOwnHudNode(summaryWin) && isVisible(summaryWin)) {
      stopNpcWalk();
      state.npcWalkAttempts = 0;
      state.npcClickRetryPhase = 0;
      state.festivalDetourStep = 0;
      if (!state.summarySeenAt) state.summarySeenAt = Date.now();
      // 進入結算畫面第一時間先記錄本場成功／失敗戰績（避免達標或階段休息觸發 F5 重整前漏記）
      recordDungeonChallengeResult(summaryWin);
      if (!state.summaryActed) {
        state.summaryActed = true;
        state.farmRunsDone += 1;
        state.farmSessionRunsDone += 1;
        if (ex.farmRestEnabled && !state.farmSessionTargetRuns) {
          state.farmSessionTargetRuns = rollFarmSessionTargetRuns();
        }
        updateFarmHud();
        const maxRuns = Number(ex.farmMaxRuns) || 0;
        if (maxRuns > 0 && state.farmRunsDone >= maxRuns) {
          const doneRuns = state.farmRunsDone;
          clearFarmRestState();
          state.farmReloadPending = true;
          state.farmDoneHalted = true;
          GM_setValue('skillpick_farm_done_halt', { runsDone: doneRuns, maxRuns, at: Date.now() });
          stopAllAutomation(`已完成目標刷圖 ${doneRuns} / ${maxRuns} 場，即將重新整理網頁`);
          try { playBeep(880, 180); } catch (_) {}
          addLog(`[目標達成] 已完成目標刷圖 ${doneRuns} / ${maxRuns} 場，將於 0.9 秒後執行 F5 重新整理並停止所有動作`);
          setTimeout(() => {
            try { window.location.reload(); } catch (_) { location.href = location.href; }
          }, 900);
          return;
        }
        if (ex.farmRestEnabled && state.farmSessionRunsDone >= state.farmSessionTargetRuns) {
          const rLo = Math.max(1, Math.min(480, Number(ex.farmRestMinMin) || 25));
          const rHi = Math.max(rLo, Math.min(480, Number(ex.farmRestMaxMin) || 55));
          const restMin = rLo + Math.floor(Math.random() * (rHi - rLo + 1));
          const jitterSec = 5 + Math.floor(Math.random() * 50);
          const restingUntil = Date.now() + restMin * 60000 + jitterSec * 1000;
          const wakeStr = new Date(restingUntil).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
          const restPayload = {
            restingUntil,
            restDurationMin: restMin,
            sessionRunsDone: state.farmSessionRunsDone,
            sessionTargetRuns: state.farmSessionTargetRuns,
            totalRunsBeforeRest: state.farmRunsDone,
            resumeFarm: true,
            resumeAutoPick: state.autoEnabled,
            resumeMove: CONFIG.autoMoveConfig.mode === 'radius_wander',
            startedAt: Date.now(),
          };
          state.farmReloadPending = true;
          state.farmRestUntil = restingUntil;
          state.farmRestInfo = restPayload;
          GM_setValue('skillpick_farm_rest_state', restPayload);
          releaseAllMoveKeys();
          try { playBeep(660, 150); } catch (_) {}
          addLog(`[階段休息] 本輪已完成 ${state.farmSessionRunsDone}/${state.farmSessionTargetRuns} 場，2 秒後 F5 重整登出並休息 ${restMin} 分 ${jitterSec} 秒（預計 ${wakeStr} 自動登入續刷）`);
          setTimeout(() => {
            try { window.location.reload(); } catch (_) { location.href = location.href; }
          }, 2000);
          return;
        }
        state.villageDwellPending = true;
        state.villageDwellPlan = null;
        pickNextFarmStageId(true);
        updateFarmHud();
      }
      const settleMs = Math.max(1, Number(ex.farmSettleDelaySec) || 3) * 1000;
      if (Date.now() - state.summarySeenAt < settleMs) return;
      let actBtn = ds.replayBtnSelector ? document.querySelector(ds.replayBtnSelector) : null;
      if (!isActionBtnReady(actBtn)) {
        const restartBtn = summaryWin.querySelector('#btn-restart') || document.querySelector('#gameover:not(.hidden) #btn-restart') || document.querySelector('#btn-restart');
        const btns = Array.from(summaryWin.querySelectorAll('button, [role="button"]')).filter(isActionBtnReady);
        actBtn =
          (isActionBtnReady(restartBtn) ? restartBtn : null) ||
          btns.find((b) => /返回|回城|廣場|離開|繼續|確定|重新|return|town|lobby|leave|restart|continue|ok/i.test(b.textContent || ''));
      }
      if (actBtn) {
        state.returningFromSummaryUntil = Date.now() + 30000;
        safeFarmClick(actBtn, '結算', (actBtn.textContent || '').trim() || '點擊結算返回 (#btn-restart)', 3200, { skipScroll: true });
      }
      return;
    } else {
      state.summarySeenAt = 0;
      state.summaryActed = false;
    }
    // 1b. 戰鬥中快速通道：若仍在戰鬥且無結算視窗、無大廳/NPC視窗且不在返城過渡期，直接略過村莊選關與維護檢查
    if (Date.now() >= state.returningFromSummaryUntil && isInCombat()) {
      const hasNpcWin = Boolean(document.querySelector('#npc-dialog:not(.hidden) .ro-window.npc-window'));
      if (!hasNpcWin) {
        stopNpcWalk();
        state.npcWalkAttempts = 0;
        state.npcClickRetryPhase = 0;
        state.festivalDetourStep = 0;
        state.stageSelectedThisModal = null;
        return;
      }
    }
    // 2. 斷線／結算返回或重整後經由選角畫面 (#btn-play / .select-window) 時自動進入村莊
    const inVillageOrLobby = isInVillageLobby();
    const allowCharSelect = state.farmEnabled || ex.farmAutoPlayLobby || Date.now() < state.returningFromSummaryUntil;
    if (allowCharSelect && !inVillageOrLobby) {
      const playBtn = document.querySelector('.ro-window.select-window #btn-play') || document.querySelector('#charselect:not(.hidden) #btn-play') || document.querySelector('#btn-play');
      const selectWin = document.querySelector('.ro-window.select-window') || document.querySelector('#charselect:not(.hidden)');
      if (playBtn && !isOwnHudNode(playBtn) && isVisible(playBtn)) {
        if (!playBtn.disabled) {
          stopNpcWalk();
          state.npcWalkAttempts = 0;
          state.autoEnteringLobbyUntil = Date.now() + 12000;
          safeFarmClick(playBtn, '選角', '偵測到選角畫面，自動點擊「開始遊戲」 (#btn-play)', 3500, { skipScroll: true });
          return;
        }
      }
      if (selectWin || playBtn) {
        const slots = Array.from(document.querySelectorAll('.ro-window.select-window #slots .slot:not(.empty), #charselect:not(.hidden) #slots .slot:not(.empty), #slots .slot:not(.empty)')).filter((s) => isVisible(s, 12));
        if (slots.length && !slots.some((s) => s.classList.contains('selected'))) {
          safeFarmClick(slots[0], '選角', '自動選取第一個有效角色卡槽 (#slots .slot)', 1200);
          return;
        }
      }
    }
    // 3-lobby. 副本結束／選角後彈出「選擇大廳」視窗 (#npc-dialog .ro-window.npc-window / .lb-pick)
    // 注意：設在 isInCombat 與 settle_only 檢查前，避免轉場瞬間計時器殘留誤判，並確保僅自動結算時也能完成回村
    const npcDialogOverlay = document.querySelector('#npc-dialog:not(.hidden)');
    const npcWin =
      (npcDialogOverlay && npcDialogOverlay.querySelector('.ro-window.npc-window')) ||
      document.querySelector('.ro-window.npc-window');
    if (npcWin && isVisible(npcWin) && !isOwnHudNode(npcWin)) {
      const npcTitle = (npcWin.querySelector('#npc-name, .ro-title')?.textContent || '').trim();
      const isChannelPicker = /選擇大廳|大廳選擇|Select Lobby/i.test(npcTitle) || Boolean(npcWin.querySelector('.lb-pick'));
      if (isChannelPicker) {
        const lobbyPref = ex.farmLobbyChoice || 'solo';
        if (lobbyPref !== 'off') {
          const soloBtn = Array.from(npcWin.querySelectorAll('#npc-options button, button.ro-btn, button[role="button"]')).find(
            (b) => isActionBtnReady(b) && /單人大廳|solo/i.test((b.textContent || '').replace(/\s+/g, '').trim())
          );
          const lastChannelBtn =
            npcWin.querySelector('.lb-pick button.ch-row.lb.me') ||
            npcWin.querySelector('.lb-pick button.ch-row.lb');
          const targetLobbyBtn =
            lobbyPref === 'last'
              ? (isActionBtnReady(lastChannelBtn) ? lastChannelBtn : soloBtn)
              : (soloBtn || (isActionBtnReady(lastChannelBtn) ? lastChannelBtn : null));
          if (targetLobbyBtn && isActionBtnReady(targetLobbyBtn)) {
            stopNpcWalk();
            state.autoEnteringLobbyUntil = 0;
            state.returningFromSummaryUntil = 0;
            const btnLabel = (targetLobbyBtn.querySelector('b')?.textContent || targetLobbyBtn.textContent || '大廳').replace(/\s+/g, ' ').trim();
            safeFarmClick(targetLobbyBtn, '進廳', `自動點擊【${btnLabel}】`, 2200, { skipScroll: true });
          }
        }
        return;
      }
    }
    // 3. 若正在戰鬥中 (#timer 可見且不在村莊)，停止執行村莊進本動作
    if (isInCombat()) {
      stopNpcWalk();
      state.npcWalkAttempts = 0;
      state.npcClickRetryPhase = 0;
      state.festivalDetourStep = 0;
      state.wrongNpcCount = 0;
      state.npcUnstickNeeded = false;
      state.stageSelectedThisModal = null;
      state.villageDwellPlan = null;
      return;
    }
    // 4. 村莊廣場自動選關進本（結算後自動出生在教官/遠征隊長旁；settle_only 則僅回村停止）
    if (ex.farmMode !== 'lobby_target') {
      stopNpcWalk();
      state.villageDwellPending = false;
      state.villageDwellPlan = null;
      return;
    }
    // 4-dwell. 刷圖結束一場回到村莊後，依設定隨機分配 10~60 秒停留至各動作節點（不影響行走路徑）
    if (inVillageOrLobby && state.villageDwellPending && !state.villageDwellPlan) {
      state.villageDwellPending = false;
      if (ex.farmVillageDwellEnabled !== false) {
        const minSec = Number(ex.farmVillageDwellMinSec ?? 10);
        const maxSec = Number(ex.farmVillageDwellMaxSec ?? 60);
        const plan = createVillageDwellPlan(minSec, maxSec);
        if (plan) {
          state.villageDwellPlan = plan;
          const b = plan.budgets;
          const fmt = (ms) => `${(ms / 1000).toFixed(1)}s`;
          addLog(
            `[村莊停留] 結束一場回村，本輪隨機停留 ${(plan.totalMs / 1000).toFixed(1)} 秒（剛回村 ${fmt(b.arrival)}｜途中 ${fmt(b.midWalk)}｜NPC前 ${fmt(b.preNpc)}｜選單 ${fmt(b.dialog)}｜出征前 ${fmt(b.confirm)}）`
          );
        }
      }
    }
    if (state.villageDwellPlan?.activeSlot) {
      if (Date.now() < state.villageDwellPlan.activeUntil) {
        stopNpcWalk();
        return;
      }
      state.villageDwellPlan.done[state.villageDwellPlan.activeSlot] = true;
      state.villageDwellPlan.activeSlot = null;
      state.villageDwellPlan.activeUntil = 0;
    }
    // 維護倒數防護 (#maint-banner / #sp-maint)：距離伺服器維護不足一場副本時間時停止進本
    const maintRemSec = readMaintenanceRemainingSec();
    const maintRequiredSec = targetStage.runLength > 0 ? targetStage.runLength + 60 : 300;
    if (maintRemSec !== null && maintRemSec <= maintRequiredSec) {
      stopNpcWalk();
      state.farmEnabled = false;
      GM_setValue('skillpick_farm_enabled', false);
      updateFarmHud();
      const mm = String(Math.floor(maintRemSec / 60)).padStart(2, '0');
      const ss = String(maintRemSec % 60).padStart(2, '0');
      pauseScript(`偵測到維護倒數 ${mm}:${ss}，不足一場【${targetStage.name}】，已停止進本`);
      return;
    }
    const wantTower = targetStage.id === 'endless_tower' || /塔|守護者/i.test(targetStage.name);
    const wantFestival = targetStage.id === 'louyang' || /燈籠|洛陽|節慶|活動/i.test(targetStage.name);
    const wantExpedition = !wantTower && !wantFestival;
    const closeWrongNpcModal = (modalRoot, reason) => {
      const now = Date.now();
      if (now < (state.wrongNpcCloseUntil || 0)) return true;
      state.wrongNpcCloseUntil = now + 950;
      stopNpcWalk();
      state.npcWalkAttempts = 0;
      state.npcClickRetryPhase = 0;
      state.festivalDetourStep = 0;
      state.stageSelectedThisModal = null;
      state.wrongNpcCount = (state.wrongNpcCount || 0) + 1;
      state.wrongNpcCloseStep = (state.wrongNpcCloseStep || 0) + 1;
      if (state.wrongNpcCount >= 3) {
        state.npcUnstickNeeded = true;
      }
      const root =
        (modalRoot && modalRoot.closest?.('#npc-dialog, #stages, #festival, #towerkeeper, .ro-window, .modal, .panel')) ||
        modalRoot ||
        document;
      const closeBtn =
        Array.from(
          root.querySelectorAll(
            '.ro-close, .close, .btn-close, #chr-close, #stg-close, #fe-close, #tk-close, #npc-close, [id$="-close"], [data-act="close"], button[aria-label*="關閉"], button[aria-label*="close" i]'
          )
        ).find((b) => !isOwnHudNode(b) && isActionBtnReady(b)) ||
        Array.from(root.querySelectorAll('button, [role="button"]')).find((b) => {
          if (isOwnHudNode(b) || !isActionBtnReady(b)) return false;
          const t = (b.textContent || '').replace(/\s+/g, '').trim();
          return /^(?:關閉|取消|返回|離開|×|✕|✖|close|cancel|back)$/i.test(t);
        });
      // 交替策略：優先點擊視窗關閉鈕（若未關閉或找不到按鈕則直接送出 ESC），確保任意誤開 NPC 視窗必可脫困
      const preferEscThisTry = state.wrongNpcCloseStep % 2 === 0;
      if (closeBtn && !preferEscThisTry) {
        safeFarmClick(closeBtn, '防誤開', `關閉誤開視窗（${reason}），準備重找正確 NPC`, 950, { skipScroll: true });
      } else {
        state.farmLockUntil = now + 950;
        addLog(`[防誤開] ${reason}，送出 ESC 關閉並重找正確 NPC`);
        performEscapeKey();
      }
      return true;
    };
    // 4-npc-win. 確認出征視窗 (#npc-dialog:not(.hidden) .ro-window.npc-window)
    // 註：確認出征視窗可能彈在 .fe-splash 上層，因此必須優先於 #festival-play 檢查；同時驗證是否誤點到其他 NPC
    if (npcWin && isVisible(npcWin) && !isOwnHudNode(npcWin)) {
      const npcTitle = (npcWin.querySelector('#npc-name, .ro-title')?.textContent || '').replace(/\s+/g, ' ').trim();
      const npcBodyTxt = (npcWin.innerText || '').replace(/\s+/g, ' ').trim();
      const hasBankOpts = Boolean(npcWin.querySelector('.diff-bank button[data-bank]'));
      const feOverlayOpen = isVisible(document.querySelector('#festival:not(.hidden), .fe-splash'), 40);
      const stagesOverlayOpen = isVisible(document.querySelector('#stages:not(.hidden)'), 40);
      const tkOverlayOpen = isVisible(document.querySelector('#towerkeeper:not(.hidden)'), 40);
      const isCaptainWin = /遠征隊長|教官|遠征/.test(npcTitle);
      const isFestivalWin = /節慶|主持人|洛陽|燈籠/.test(npcTitle);
      const isTowerWin = /塔之守護者|無盡之塔|守護者/.test(npcTitle);
      const isKnownOtherNpc = /事蹟|記錄者|成就|卡普拉|倉庫|商店|鐵匠|精煉|商人|轉職|公會|合成|郵件|公告|道具店|雜貨|強化|任務|排行|背包|裝備|造型|美容|寵物|圖鑑|銀行/.test(npcTitle);
      const hasDeployBtn = Array.from(npcWin.querySelectorAll('#npc-options button, button.ro-btn, button[role="button"]')).some((b) =>
        isActionBtnReady(b) && /(?:前往野外|出發|出征|開始遊戲|開始挑戰|挑戰)/i.test((b.textContent || '').replace(/\s+/g, ''))
      );
      let wrongNpcReason = '';
      if (isKnownOtherNpc) {
        wrongNpcReason = `誤點 NPC「${npcTitle}」`;
      } else if (wantFestival && (isCaptainWin || isTowerWin || stagesOverlayOpen || tkOverlayOpen)) {
        wrongNpcReason = `目標為節慶，誤開「${npcTitle || '非節慶視窗'}」`;
      } else if (wantTower && (isCaptainWin || isFestivalWin || stagesOverlayOpen || feOverlayOpen)) {
        wrongNpcReason = `目標為無盡之塔，誤開「${npcTitle || '非塔視窗'}」`;
      } else if (wantExpedition && (isFestivalWin || isTowerWin || feOverlayOpen || tkOverlayOpen)) {
        wrongNpcReason = `目標為【${targetStage.name}】，誤開「${npcTitle || '非遠征視窗'}」`;
      } else if (!hasBankOpts && !hasDeployBtn && !npcBodyTxt.includes(targetStage.name)) {
        wrongNpcReason = `「${npcTitle || 'NPC 對話'}」非出征視窗`;
      }
      if (wrongNpcReason) {
        closeWrongNpcModal(npcDialogOverlay || npcWin, wrongNpcReason);
        return;
      }
      const wantBankVal = ex.upgradeMode === 'instant' ? '0' : '1';
      const bankOptBtn = npcWin.querySelector(`.diff-bank button[data-bank="${wantBankVal}"]`);
      if (bankOptBtn && !bankOptBtn.classList.contains('active') && isActionBtnReady(bankOptBtn)) {
        safeFarmClick(bankOptBtn, '設定', `同步升級模式為【${wantBankVal === '0' ? '立即' : '累積'}】`, 450);
        return;
      }
      const goWildBtn = Array.from(npcWin.querySelectorAll('#npc-options button, button.ro-btn.primary, button[role="button"]')).find((b) => {
        if (!isActionBtnReady(b)) return false;
        const txt = (b.textContent || '').replace(/\s+/g, '').trim();
        if (!txt || /取消|關閉|返回|單人大廳|cancel|close/i.test(txt)) return false;
        return /^(?:前往野外|出發|進入|開始|開始遊戲|確定|確認|挑戰|go|start|enter)$/i.test(txt) || b.classList.contains('primary');
      });
      if (goWildBtn) {
        if (holdVillageDwellSlot('confirm', '確認出征視窗隨機停留，稍後出發', ['arrival', 'midWalk', 'preNpc', 'dialog'])) return;
        stopNpcWalk();
        state.npcWalkAttempts = 0;
        state.npcClickRetryPhase = 0;
        state.festivalDetourStep = 0;
        state.wrongNpcCount = 0;
        state.npcUnstickNeeded = false;
        state.stageSelectedThisModal = null;
        state.villageDwellPlan = null;
        const btnLabel = (goWildBtn.textContent || '').replace(/\s+/g, ' ').trim();
        safeFarmClick(goWildBtn, '進本', `點擊確認視窗【${btnLabel}】`, 3600);
        return;
      }
    }
    // 4-fe. 節慶活動視窗 (#festival:not(.hidden) #festival-play)：僅在目標為節慶時點擊；誤開時自動關閉重找正確 NPC
    const feWin = document.querySelector('#festival:not(.hidden)') || document.querySelector('.fe-splash');
    const fePlayBtn =
      document.querySelector('#festival:not(.hidden) #festival-play') ||
      document.querySelector('#festival-play, .fe-splash .fe-play.primary, .fe-splash .fe-play');
    if ((feWin && isVisible(feWin, 40)) || (isActionBtnReady(fePlayBtn) && !isOwnHudNode(fePlayBtn))) {
      if (!wantFestival) {
        closeWrongNpcModal(feWin || fePlayBtn?.closest('.fe-splash, #festival'), `目標為【${targetStage.name}】，誤開節慶視窗`);
        return;
      }
      if (isActionBtnReady(fePlayBtn) && !isOwnHudNode(fePlayBtn)) {
        if (holdVillageDwellSlot('dialog', '節慶對話視窗已開啟，隨機停留後點擊開始', ['arrival', 'midWalk', 'preNpc'])) return;
        stopNpcWalk();
        state.npcWalkAttempts = 0;
        state.npcClickRetryPhase = 0;
        state.festivalDetourStep = 0;
        state.wrongNpcCount = 0;
        state.npcUnstickNeeded = false;
        state.stageSelectedThisModal = null;
        safeFarmClick(fePlayBtn, '進本', `點擊節慶視窗【開始遊戲】(#festival-play)`, 1200);
        return;
      }
    }
    // 4-tk. 塔之守護者視窗 (#towerkeeper:not(.hidden))：目標非無盡之塔時自動關閉
    const tkWinGuard = document.querySelector('#towerkeeper:not(.hidden)');
    if (tkWinGuard && isVisible(tkWinGuard, 40) && !wantTower) {
      closeWrongNpcModal(tkWinGuard, `目標為【${targetStage.name}】，誤開塔之守護者視窗`);
      return;
    }
    // 4-any-other-win. 通用防誤開守衛：任何其他非白名單的 .ro-window（如事蹟記錄者 .chronicle-window、鐵匠、倉庫、商店、設定等）一律關閉（按鈕／ESC 交替），避免停在視窗內反覆按空白鍵
    const strayRoWin = Array.from(document.querySelectorAll('.ro-window')).find((w) => {
      if (!w || isOwnHudNode(w) || !isVisible(w, 40)) return false;
      if (
        w.classList.contains('select-window') ||
        w.classList.contains('summary-window') ||
        w.classList.contains('small-window') ||
        w.classList.contains('npc-window') ||
        w.classList.contains('sp-card')
      ) {
        return false;
      }
      if (
        w.closest('#charselect, #pause, #npc-dialog, #stages, #festival, #towerkeeper, #picker') ||
        w.querySelector('#btn-resume, #btn-play, #btn-restart, .stg-card, #stg-go, #festival-play')
      ) {
        return false;
      }
      return true;
    });
    if (strayRoWin) {
      const strayTitle = (strayRoWin.querySelector('.ro-title, h1, h2, h3')?.textContent || '').replace(/\s+/g, ' ').trim();
      closeWrongNpcModal(strayRoWin, `誤開非目標視窗「${strayTitle || '其他 NPC 介面'}」`);
      return;
    }
    // 4a. 優先檢查遊戲遠征視窗的關卡卡片 (#stages:not(.hidden) .stg-card) 與出發按鈕 (#stg-go)
    const stagesWinGuard = document.querySelector('#stages:not(.hidden)');
    const stgCards = Array.from(document.querySelectorAll('#stages:not(.hidden) .stg-card, .stg-card')).filter(
      (c) => !isOwnHudNode(c) && isVisible(c)
    );
    if (((stagesWinGuard && isVisible(stagesWinGuard, 40)) || stgCards.length > 0) && (wantFestival || wantTower)) {
      closeWrongNpcModal(
        stagesWinGuard || stgCards[0]?.closest('#stages, .ro-window, .modal, .panel'),
        `目標為【${targetStage.name}】，誤開遠征教官視窗`
      );
      return;
    }
    if (!stgCards.length) {
      state.stageSelectedThisModal = null;
    } else {
      stopNpcWalk();
      state.npcWalkAttempts = 0;
      state.npcClickRetryPhase = 0;
      state.wrongNpcCount = 0;
      state.npcUnstickNeeded = false;
    }
    const stgHit = stgCards.find((card) => {
      const info = (card.querySelector('.stg-card-info')?.innerText || card.innerText || '').trim();
      if (info.includes(targetStage.name)) return true;
      if (targetStage.id === 'louyang' && (info.includes('燈籠') || info.includes('洛陽') || info.includes('節慶'))) return true;
      if (targetStage.id === 'endless_tower' && (info.includes('無盡') || info.includes('塔'))) return true;
      return false;
    });
    const isStgMarkedActive = (el) =>
      el &&
      (el.classList.contains('selected') ||
        el.classList.contains('active') ||
        el.classList.contains('on') ||
        el.classList.contains('cur') ||
        el.classList.contains('current') ||
        el.getAttribute('aria-selected') === 'true' ||
        state.stageSelectedThisModal === targetStage.id);
    if (stgHit && !isStgMarkedActive(stgHit)) {
      if (holdVillageDwellSlot('dialog', '選關視窗已開啟，隨機停留後選擇關卡', ['arrival', 'midWalk', 'preNpc'])) return;
      state.stageSelectedThisModal = targetStage.id;
      safeFarmClick(stgHit, '選關', `選取關卡【${targetStage.name}】(.stg-card)`, 1400);
      return;
    }
    // 相容通用關卡卡片備援定位
    let fallbackStageHit = null;
    if (!stgCards.length) {
      const stageCandidates = Array.from(document.querySelectorAll('button, [role="button"], .stage, .stage-card, .map-card, li, div')).filter((el) => {
        const t = (el.textContent || '').trim();
        let match = t.includes(targetStage.name);
        if (!match && targetStage.id === 'louyang') {
          match = t.includes('燈籠') || t.includes('洛陽') || t.includes('節慶');
        } else if (!match && targetStage.id === 'endless_tower') {
          match = t.includes('無盡') || t.includes('塔之守護者');
        }
        if (!match) return false;
        if (isOwnHudNode(el) || el.closest('.fe-splash') || !isVisible(el)) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 60 || r.height < 24 || r.width > window.innerWidth * 0.7 || r.height > 260) return false;
        return t.length <= 120;
      });
      fallbackStageHit = stageCandidates[stageCandidates.length - 1];
      if (fallbackStageHit && !isStgMarkedActive(fallbackStageHit)) {
        stopNpcWalk();
        state.stageSelectedThisModal = targetStage.id;
        safeFarmClick(fallbackStageHit, '選關', `選取關卡【${targetStage.name}】`, 1600);
        return;
      }
    }
    // 4b. 若關卡已選或出發按鈕 (#stages:not(.hidden) #stg-go / #towerkeeper:not(.hidden)) 已出現，直接點擊出發（難度沿用遊戲上次的設定）
    let startBtn = ds.startStageBtnSelector ? document.querySelector(ds.startStageBtnSelector) : null;
    if (!isActionBtnReady(startBtn)) {
      const exactGo = document.querySelector('#stages:not(.hidden) #stg-go') || document.querySelector('#stg-go, .stg-go.primary');
      if (exactGo && !isOwnHudNode(exactGo) && isActionBtnReady(exactGo)) startBtn = exactGo;
    }
    if (!isActionBtnReady(startBtn) && wantTower) {
      const tkWin = document.querySelector('#towerkeeper:not(.hidden)');
      if (tkWin && isVisible(tkWin)) {
        const tkStart = Array.from(tkWin.querySelectorAll('#tk-detail button, button.ro-btn.primary')).find(
          (b) => !isOwnHudNode(b) && isActionBtnReady(b) && /^(?:開始|開始挑戰|挑戰|進入|出發|start|enter|go)$/i.test((b.textContent || '').replace(/\s+/g, '').trim())
        );
        if (tkStart) startBtn = tkStart;
      }
    }
    if (!isActionBtnReady(startBtn) && (stgHit || fallbackStageHit)) {
      const scope = (stgHit || fallbackStageHit).closest('.modal, .window, .panel, [class*="modal"], [class*="dialog"]') || document;
      startBtn = Array.from(scope.querySelectorAll('button, [role="button"]')).find(
        (b) => !isOwnHudNode(b) && isActionBtnReady(b) && /^(?:開始|開始遊戲|進入遊戲|出發|進入|挑戰|開始遠征|開始挑戰|出征|start|enter|launch|deploy|go)$/i.test((b.textContent || '').replace(/\s+/g, '').trim())
      );
    }
    if (isActionBtnReady(startBtn)) {
      if (holdVillageDwellSlot('dialog', '選關／出發視窗隨機停留，稍後點擊出發', ['arrival', 'midWalk', 'preNpc'])) return;
      stopNpcWalk();
      state.npcWalkAttempts = 0;
      state.npcClickRetryPhase = 0;
      state.wrongNpcCount = 0;
      state.npcUnstickNeeded = false;
      state.stageSelectedThisModal = null;
      safeFarmClick(startBtn, '進本', `啟動【${targetStage.name}】(${startBtn.id ? '#' + startBtn.id : '出發鈕'})`, 3600);
      return;
    }
    // 4-dwell-arrival. 尚未開啟任何對話視窗時，先執行「剛回到村莊原地停留」
    if (inVillageOrLobby && holdVillageDwellSlot('arrival', '剛回到村莊，先原地隨機停留')) {
      return;
    }
    // 4c. 優先檢查是否已出現遊戲原生互動提示按鈕 (#lobby-prompt)！
    // 走到 NPC 身旁時，遊戲會直接顯示：
    // <button id="lobby-prompt" class="">與主持人交談 <kbd>空格</kbd></button>
    const promptBtn = document.querySelector('#lobby-ui:not(.hidden) #lobby-prompt:not(.hidden)') ||
      document.querySelector('#lobby-prompt:not(.hidden)') ||
      Array.from(document.querySelectorAll('button, [role="button"]')).find((b) =>
        !isOwnHudNode(b) && isVisible(b) && (/交談|對話|互動/.test(b.textContent || '') || b.querySelector('kbd'))
      );
    if (promptBtn && isVisible(promptBtn)) {
      const promptTxt = (promptBtn.textContent || '').replace(/\s+/g, ' ').trim();
      const isCaptainPrompt = /隊長|教官|遠征/.test(promptTxt);
      const isFestivalPrompt = /主持人|節慶|活動|洛陽|燈籠/.test(promptTxt);
      const isTowerPrompt = /塔|守護者/.test(promptTxt);
      const isOtherNpcPrompt = /卡普拉|倉庫|商店|鐵匠|精煉|商人|轉職|公會|合成|郵件|公告/.test(promptTxt);
      // 若目前提示不屬於目標 NPC（或剛連續開錯 3 次需先拉開身位），略過點擊並專心走向正確 NPC
      if (isOtherNpcPrompt || state.npcUnstickNeeded) {
        if (Date.now() - state.npcWalkLogAt > 3500) {
          state.npcWalkLogAt = Date.now();
          addLog(`[尋路校正] 略過提示【${promptTxt}】，重新走近目標 NPC`);
        }
      } else if (wantFestival && isCaptainPrompt && !isFestivalPrompt) {
        if (Date.now() - state.npcWalkLogAt > 3500) {
          state.npcWalkLogAt = Date.now();
          addLog('[節慶尋路/避開隊長] 忽略遠征隊長提示，專注繞過花圃前往【節慶主持人】');
        }
      } else if (wantTower && isCaptainPrompt && !isTowerPrompt) {
        if (Date.now() - state.npcWalkLogAt > 3500) {
          state.npcWalkLogAt = Date.now();
          addLog('[爬塔尋路/避開隊長] 忽略遠征隊長提示，專注前往【塔之守護者】');
        }
      } else if (wantExpedition && (isFestivalPrompt || isTowerPrompt) && !isCaptainPrompt) {
        if (Date.now() - state.npcWalkLogAt > 3500) {
          state.npcWalkLogAt = Date.now();
          addLog(`[教官尋路/避開誤觸] 忽略【${promptTxt}】，改走回【遠征隊長/教官】`);
        }
      } else {
        if (holdVillageDwellSlot('preNpc', '已走到 NPC 前，先隨機停留一下再交談', ['arrival', 'midWalk'])) return;
        stopNpcWalk();
        state.npcWalkAttempts = 0;
        state.npcClickRetryPhase = 0;
        state.festivalDetourStep = 0;
        addLog(`[NPC互動] 偵測到互動提示【${promptTxt}】，送出空白鍵交談（並於未開啟時補點互動鈕）`);
        performSpaceInteract();
        // safeFarmClick 延遲執行前會重新檢查 isVisible(promptBtn)；若空白鍵已開啟視窗導致提示隱藏，就會自動取消點擊
        safeFarmClick(promptBtn, '交談', `點擊【${promptTxt}】`, 1800);
        return;
      }
    }
    if (!wantFestival && !wantTower) {
      const customExpBtn = ds.expeditionBtnSelector ? document.querySelector(ds.expeditionBtnSelector) : null;
      if (isActionBtnReady(customExpBtn)) {
        if (holdVillageDwellSlot('preNpc', '已抵達教官旁，先隨機停留一下再開啟選單', ['arrival', 'midWalk'])) return;
        stopNpcWalk();
        safeFarmClick(customExpBtn, '選單', `點擊自訂教官鈕 (${(customExpBtn.textContent || '').trim() || '教官'})`, 2000);
        return;
      }
    }
    const npcCandidates = wantTower
      ? ['塔之守護者', '守護者', '無盡之塔']
      : wantFestival
      ? ['節慶主持人', '主持人', '節慶', '活動', '洛陽', '燈籠']
      : ['遠征隊長', '遠征', '教官'];
    let npcInfo = null;
    for (const kw of npcCandidates) {
      npcInfo = findLobbyNpcInfo(kw);
      if (npcInfo) break;
    }
    if (npcInfo) {
      const playerPt = findLobbyPlayerPoint();
      const dx = npcInfo.npcX - playerPt.x;
      const dy = npcInfo.npcBodyY - playerPt.y;
      const dist = Math.hypot(dx, dy);
      const NPC_INTERACT_RADIUS_PX = 82;
      if (dist <= NPC_INTERACT_RADIUS_PX) {
        state.festivalDetourStep = 0;
        state.festivalRoutePlan = null;
        state.npcStuckSteps = 0;
      }
      // 走去 NPC 的半路上隨機小停一下（僅暫停推進，不改變 festivalDetourStep、npcWalkAttempts 與行走路徑）
      if (
        dist > NPC_INTERACT_RADIUS_PX &&
        state.villageDwellPlan &&
        state.villageDwellPlan.midWalkTriggerStep > 0 &&
        state.npcWalkAttempts >= state.villageDwellPlan.midWalkTriggerStep &&
        holdVillageDwellSlot('midWalk', '前往 NPC 途中隨機稍作停頓（不影響路徑）')
      ) {
        return;
      }
      // 針對「節慶主持人」花圃地形避障：每場隨機抽選不同繞行路線，並交錯混搭「滑鼠點擊地面」與「鍵盤移動」
      if (wantFestival && dist > NPC_INTERACT_RADIUS_PX && state.npcWalkAttempts < 28) {
        if (state.festivalDetourStep === 0) {
          if (dx > 80 && dy < 80) {
            state.npcWalkAttempts += 1;
            state.festivalRoutePlan = pickFestivalRoutePlan();
            state.festivalDetourStep = 1;
            const plan = state.festivalRoutePlan;
            const usedMode = walkMixedTowardVector(playerPt, plan.s1Dx, plan.s1Dy, plan.s1Ms, {
              mouseChance: plan.id === 'mouse_lead_mix' ? 0.78 : plan.mouseChance,
              mouseStepDist: randomInRangeMs(125, 195),
              wobblePx: 20,
              minMouseDist: 60,
              mouseLabel: `節慶繞行1(${plan.label})`,
            });
            if (usedMode) {
              addLog(`[節慶尋路/${plan.label}] 階段 1（${usedMode === 'mouse' ? '滑鼠' : '鍵盤'}）：脫離花圃凹角 (dx:${Math.round(dx)}, dy:${Math.round(dy)})`);
              return;
            }
          } else {
            state.festivalRoutePlan = state.festivalRoutePlan || pickFestivalRoutePlan();
            state.festivalDetourStep = 3;
          }
        } else if (state.festivalDetourStep === 1) {
          state.npcWalkAttempts += 1;
          state.festivalDetourStep = 2;
          const plan = state.festivalRoutePlan || pickFestivalRoutePlan();
          state.festivalRoutePlan = plan;
          const usedMode = walkMixedTowardVector(playerPt, plan.s2Dx, plan.s2Dy, plan.s2Ms, {
            mouseChance: plan.id === 'mouse_lead_mix' ? 0.72 : plan.mouseChance,
            mouseStepDist: randomInRangeMs(140, 230),
            wobblePx: 22,
            minMouseDist: 60,
            mouseLabel: `節慶繞行2(${plan.label})`,
          });
          if (usedMode) {
            addLog(`[節慶尋路/${plan.label}] 階段 2（${usedMode === 'mouse' ? '滑鼠' : '鍵盤'}）：繞過花圃下緣 (dx:${Math.round(dx)}, dy:${Math.round(dy)})`);
            return;
          }
        } else if (state.festivalDetourStep === 2) {
          state.npcWalkAttempts += 1;
          state.festivalDetourStep = 3;
          const plan = state.festivalRoutePlan || pickFestivalRoutePlan();
          const baseStepMs = Math.round(Math.max(200, Math.min(540, dist * (1.25 + Math.random() * 0.45))));
          // 距離較遠時帶輕微弧線偏擺，讓前進路線更自然
          const curveBias = dist > 150 ? plan.arcSign * (0.14 + Math.random() * 0.14) : 0;
          const cdx = dx - dy * curveBias;
          const cdy = dy + dx * curveBias;
          const usedMode = walkMixedTowardVector(playerPt, cdx, cdy, baseStepMs, {
            mouseChance: plan.mouseChance,
            wobblePx: 26,
            mouseLabel: `前往${npcInfo.keyword}`,
          });
          if (usedMode) {
            addLog(`[節慶尋路/${plan.label}] 階段 3（${usedMode === 'mouse' ? '滑鼠' : '鍵盤'}）：前往【${npcInfo.keyword}】(dx:${Math.round(dx)}, dy:${Math.round(dy)})`);
            return;
          }
        }
      }
      if (dist > NPC_INTERACT_RADIUS_PX && state.npcWalkAttempts < 28) {
        const prevDist = state.npcWalkLastDist;
        if (typeof prevDist === 'number' && prevDist - dist < 10) {
          state.npcStuckSteps = (state.npcStuckSteps || 0) + 1;
        } else {
          state.npcStuckSteps = 0;
        }
        state.npcWalkAttempts += 1;
        state.npcWalkLastDist = dist;
        // 防卡脫困：若連兩步幾乎沒縮短距離，自動切換操作方式（滑鼠↔鍵盤）並側移繞開障礙
        if (state.npcStuckSteps >= 2) {
          state.npcStuckSteps = 0;
          const sideSign = Math.random() < 0.5 ? 1 : -1;
          const ux = dx / Math.max(1, dist);
          const uy = dy / Math.max(1, dist);
          const sideDx = (ux * 0.35 - uy * sideSign * 0.95) * 140;
          const sideDy = (uy * 0.35 + ux * sideSign * 0.95) * 140;
          const preferMouse = state.npcLastMoveMode !== 'mouse';
          addLog(`[尋路脫困] 偵測位移停滯，自動切換${preferMouse ? '滑鼠' : '鍵盤'}側繞避障`);
          const escaped = preferMouse
            ? walkMouseClickToward(playerPt, sideDx, sideDy, { stepDist: randomInRangeMs(120, 185), wobblePx: 18, label: '村莊側繞脫困' }) ||
              walkBurstToward(sideDx, sideDy, randomInRangeMs(260, 420))
            : walkBurstToward(sideDx, sideDy, randomInRangeMs(260, 420));
          if (escaped) return;
        }
        const plan = state.festivalRoutePlan;
        const arcSign = plan ? plan.arcSign : Math.random() < 0.5 ? 1 : -1;
        const curveBias = dist > 155 ? arcSign * (Math.random() * 0.22 - 0.04) : 0;
        const moveDx = dx - dy * curveBias;
        const moveDy = dy + dx * curveBias;
        const stepMs = Math.round(Math.max(180, Math.min(480, dist * (1.2 + Math.random() * 0.5))));
        const mouseChance = plan ? plan.mouseChance : 0.42;
        const usedMode = walkMixedTowardVector(playerPt, moveDx, moveDy, stepMs, {
          mouseChance,
          wobblePx: dist > 160 ? 28 : 14,
          minMouseDist: 105,
          mouseLabel: `滑鼠走向${npcInfo.keyword}`,
        });
        if (usedMode) {
          if (Date.now() - state.npcWalkLogAt > 3500) {
            state.npcWalkLogAt = Date.now();
            addLog(`[刷圖/走近] ${usedMode === 'mouse' ? '滑鼠點擊' : '鍵盤移動'}走向【${npcInfo.keyword}】（距離約 ${Math.round(dist)}px）`);
          }
          return;
        }
      }
      if (state.npcUnstickNeeded) {
        state.npcUnstickNeeded = false;
        if (dist > 28) {
          addLog(`[防誤開/拉開身位] 朝【${npcInfo.keyword}】微幅移動重新對位`);
          if (walkBurstToward(dx, dy, 260)) return;
        }
      }
      // 若已走到附近但上次互動仍沒開選單，先微幅再貼近一點（若距離仍 > 44px）
      if (state.npcClickRetryPhase === 1 && dist > 44 && state.npcWalkAttempts < 25) {
        state.npcWalkAttempts += 1;
        state.npcClickRetryPhase = 2;
        if (walkBurstToward(dx, dy, 180)) return;
      }
      if (CONFIG.autoMoveConfig.mode !== 'radius_wander' && !state.lowHpEvading) {
        releaseAllMoveKeys();
      } else {
        stopNpcWalk();
      }
      // 抵達 NPC 身旁：優先觸發 #lobby-prompt 按鈕點擊與空白鍵 (Space)
      const curPrompt = document.querySelector('#lobby-ui:not(.hidden) #lobby-prompt:not(.hidden)') ||
        document.querySelector('#lobby-prompt:not(.hidden)') ||
        Array.from(document.querySelectorAll('button, [role="button"]')).find((b) =>
          !isOwnHudNode(b) && isVisible(b) && (/交談|對話|互動/.test(b.textContent || '') || b.querySelector('kbd'))
        );
      if (curPrompt && isVisible(curPrompt)) {
        const txt = (curPrompt.textContent || '').replace(/\s+/g, ' ').trim();
        addLog(`[NPC交談] 已抵達【${npcInfo.keyword}】身旁，送出空白鍵並點擊【${txt}】`);
        performSpaceInteract();
        safeFarmClick(curPrompt, '交談', `點擊【${txt}】`, 1800);
        return;
      }
      // 送出空白鍵 (Space) 觸發遊戲原生交談事件，並以實際畫布上的 NPC 身體座標點擊為備援
      addLog(`[NPC交談] 已抵達【${npcInfo.keyword}】身旁，送出空白鍵 (Space) 觸發交談`);
      performSpaceInteract();
      const npcClickEl = npcInfo.clickTarget || npcInfo.labelEl;
      if (npcClickEl && isVisible(npcClickEl, 2)) {
        safeFarmClick(npcClickEl, '選單', `點擊 NPC 座標 (${npcInfo.keyword})`, 1800, {
          x: npcInfo.clickX ?? npcInfo.npcX,
          y: npcInfo.clickY ?? npcInfo.npcBodyY,
          exactCoords: true,
          skipHoverCheck: true,
        });
      }
      return;
    }
    const uiFallbackBtn = findClickableOutsideHud((txt) => {
      const clean = txt.replace(/\s+/g, '');
      if (wantTower) return /^(?:無盡之塔|塔之守護者|守護者|EndlessTower)$/i.test(clean);
      if (wantFestival) return /^(?:燈籠節|節慶主持人|主持人|活動關卡|洛陽)$/i.test(clean);
      return /^(?:遠征|遠征隊長|教官|副本|出征|關卡|選擇關卡|Expedition|Dungeon|Stages?)$/i.test(clean);
    });
    if (uiFallbackBtn && isVisible(uiFallbackBtn)) {
      stopNpcWalk();
      safeFarmClick(uiFallbackBtn, '選單', `點擊村莊按鈕開啟選單 (${(uiFallbackBtn.textContent || '').trim() || '教官'})`, 2000);
    }
  }

  // Lv 20 第 6 格技能神祇（! 按鈕）：在戰鬥安全時自動點擊開啟「選擇你的神祇」四選一
  function tryAutoOpenSkillDeityPicker(hpPct) {
    try {
      const ex = getExtra();
      if (ex.autoPickSkillDeity === false) return false;
      if (!state.autoEnabled || state.paused) return false;
      if ((CONFIG.selectionActionMode || 'hybrid_bridge') !== 'hybrid_bridge' || !state.bridgeOnline) return false;
      if (!isInCombat()) return false;
      const pickerOpen = document.querySelector('#picker:not(.hidden)');
      if (pickerOpen && isVisible(pickerOpen, 40)) return false;
      const now = Date.now();
      if (now < (state.actionInFlightUntil || 0) || now < (state.pickingLockUntil || 0)) return false;
      if (now - (state.lastSkillDeityClickAt || 0) < 4200) return false;
      if (state.cStatsSnapshotBusy || state.lowHpEvading) return false;
      if (state.bossRedDodgeState || now - (state.lastBossRedActiveAt || 0) < 4000) return false;
      if (state.moonlightState?.active && state.moonlightState.phase !== 'idle') return false;
      if (state.swarmBreakout?.active) return false;
      if (typeof hpPct === 'number' && hpPct < 45) return false;

      const pickBtn = document.querySelector('#runitems button.run-slot.pending[data-pick-deity], #runitems button[data-pick-deity]');
      if (!pickBtn || !isVisible(pickBtn, 10) || pickBtn.disabled) return false;

      state.lastSkillDeityClickAt = now;
      state.actionInFlightUntil = now + 1100;
      state.pickingLockUntil = now + 900;
      releaseHeldKeysOnly();
      const r = pickBtn.getBoundingClientRect();
      addLog('[Lv20神祇] 偵測到第 6 格「!」可選擇神祇，自動點擊開啟四選一視窗');
      performElementClick(pickBtn, r.left + r.width * 0.5, r.top + r.height * 0.5, '點擊選擇你的神祇 (!)', {
        onClicked: () => {
          setTimeout(() => {
            state.actionInFlightUntil = 0;
            state.pickingLockUntil = 0;
            state.lastDomSignature = '';
            safeRun(runDetectionCycle, true);
          }, 420);
        },
        onCancelled: () => {
          state.actionInFlightUntil = 0;
          state.pickingLockUntil = 0;
        },
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  function checkInRunCombatMonitor() {
    const ex = getExtra();
    const inCombat = isInCombat();
    const hpPct = inCombat ? readHpPercent() : null;
    if (hpPct !== null) {
      if (typeof state.lastHpSamplePct === 'number' && hpPct <= state.lastHpSamplePct - 4) {
        state.lastHpDropAt = Date.now();
      }
      state.lastHpSamplePct = hpPct;
      state.lastCombatHpPct = hpPct;
    } else if (!inCombat) {
      state.lastHpSamplePct = null;
      state.lastHpDropAt = 0;
    }
    const expInfo = inCombat ? readExpInfo() : { text: '', pct: null };
    const bank = readBankInfo();
    if (inCombat) {
      syncRunSlotsFromDom();
      if (!tryAutoOpenSkillDeityPicker(hpPct)) {
        trySafeCStatsSnapshot(hpPct);
      }
    }
    const liveEl = !$id('rh-panel')?.classList.contains('rh-minimized') ? $id('rh-live-monitor') : null;
    if (liveEl) {
      if (inCombat) {
        const hpStr = hpPct !== null ? `HP ${hpPct}%` : 'HP --';
        const expStr = expInfo.text ? `EXP ${expInfo.text}` : 'EXP --';
        const modeStr = bank.visible ? `待開:${bank.count}` : '即時';
        const magStr = getSmartMagnetStatus().liveText;
        const bossSched = getStageBossScheduleStatus();
        const bossPart = bossSched ? ` ｜ ${bossSched.liveText}` : '';
        liveEl.textContent = `${hpStr} ｜ ${expStr} ｜ ${modeStr} ｜ ${magStr}${bossPart}`;
      } else {
        liveEl.textContent = isInVillageLobby()
          ? '局內監控：村莊待機中（已停止隨機走位，進本自動恢復）'
          : '局內監控：待機中（進入戰鬥後顯示 HP / EXP / 磁鐵狀態）';
      }
    }
    if (state.lastInCombatHud !== inCombat) {
      state.lastInCombatHud = inCombat;
      if (inCombat) {
        state.festivalDetourStep = 0;
        state.festivalRoutePlan = null;
        state.npcStuckSteps = 0;
        state.npcLastMoveMode = '';
        if (CONFIG.autoMoveConfig.autoCenterOnStageStart !== false) {
          const synced = syncStageCenterCoord({ allowRecord: true, logChange: true });
          if (!synced) {
            const secNow = readGameClockSec();
            if (secNow === null || secNow <= 12) {
              state.posX = 0;
              state.posY = 0;
              state.navTarget = null;
              addLog('[關卡中心] 進入關卡（起點即地圖中心點），已自動對齊走位原點 (0, 0)');
            }
          }
        }
        if (CONFIG.autoMoveConfig.autoZoomMinimapOnStart !== false && !state.minimapZoomDoneForRun) {
          state.minimapZoomDoneForRun = true;
          const clicks = Math.max(1, Math.min(5, Number(CONFIG.autoMoveConfig.minimapZoomClicks) || 2));
          setTimeout(() => {
            if (isInCombat() && !state.paused && findDomCardElements().length === 0) {
              triggerMinimapZoomIn(clicks, '進關卡自動放大');
            }
          }, 900);
        }
        if (CONFIG.autoMoveConfig.autoZoomCameraOnStart !== false && !state.cameraZoomDoneForRun) {
          state.cameraZoomDoneForRun = true;
          const steps = Math.max(1, Math.min(20, Number(CONFIG.autoMoveConfig.cameraZoomOutSteps) || 8));
          const initialDelay = CONFIG.autoMoveConfig.autoZoomMinimapOnStart !== false ? 1600 : 750;
          let tries = 0;
          const tryCamZoom = () => {
            if (!isInCombat() || state.paused) return;
            if (state.minimapZoomBusy || findDomCardElements().length > 0) {
              if (++tries <= 16) setTimeout(tryCamZoom, 320);
              return;
            }
            triggerCameraZoomOut(steps, '進副本自動拉遠視野');
          };
          setTimeout(tryCamZoom, initialDelay);
        }
      } else {
        state.minimapZoomDoneForRun = false;
        state.minimapZoomBusy = false;
        state.cameraZoomDoneForRun = false;
        state.cameraZoomBusy = false;
      }
      updateMoveHud();
    }
    if (!inCombat || state.paused) {
      if (!state.npcWalking) {
        releaseHeldKeysOnly();
        state.isBurstMoving = false;
      }
      if (state.lowHpEvading) {
        state.lowHpEvading = false;
        if (CONFIG.autoMoveConfig.mode !== 'radius_wander') releaseAllMoveKeys();
        updateMoveHud();
      }
      return;
    }
    ensureMoveLoopRunning();
    // 經驗條升級預判 (#exp-text)
    if (expInfo.pct !== null && expInfo.pct >= 88 && Date.now() - state.lastExpNearFullAt > 14000) {
      state.lastExpNearFullAt = Date.now();
      const modeHint = bank.visible ? '累積模式（可累積後按B）' : '即時模式（即將三選一）';
      addLog(`[升級預判] 經驗進度 ${expInfo.pct}%，準備選卡策略｜${modeHint}`);
    }
    if (expInfo.text && expInfo.text !== state.lastExpText) {
      state.lastExpText = expInfo.text;
    }
    // 殘血監控：已開啟「半徑繞行（自動走位）」時不再切換成殘血閃避，避免中斷撿磁鐵／寶箱；僅於「定點不動」模式才啟用緊急閃避
    const warnPct = Number(ex.farmLowHpWarnPct) || 0;
    const isAlreadyWandering = CONFIG.autoMoveConfig.mode === 'radius_wander';
    if (isAlreadyWandering && state.lowHpEvading) {
      state.lowHpEvading = false;
      updateMoveHud();
    }
    if (warnPct > 0 && hpPct !== null) {
      if (hpPct <= warnPct) {
        const shouldDodge = Boolean(ex.autoHpDodge && !isAlreadyWandering && !state.farmDoneHalted && (state.autoEnabled || state.farmEnabled));
        if (Date.now() - state.farmHpWarnedAt > 15000) {
          state.farmHpWarnedAt = Date.now();
          addLog(`[血量警示] HP ${hpPct}%（≤ ${warnPct}%）${shouldDodge ? '，啟動定點殘血閃避' : ''}`);
          playBeeps(2);
        }
        if (shouldDodge && !state.lowHpEvading) {
          state.lowHpEvading = true;
          scheduleNextMoveStep();
          updateMoveHud();
        }
      } else if (state.lowHpEvading && hpPct >= Math.min(95, warnPct + 10)) {
        state.lowHpEvading = false;
        addLog(`[殘血閃避] HP 已回升至 ${hpPct}%，恢復定點不動`);
        if (!isAlreadyWandering) releaseAllMoveKeys();
        updateMoveHud();
      }
    } else if (state.lowHpEvading) {
      state.lowHpEvading = false;
      if (!isAlreadyWandering) releaseAllMoveKeys();
      updateMoveHud();
    }
  }

  function gameClockTick() {
    checkInRunCombatMonitor();
    const summaryWin = document.querySelector('#gameover:not(.hidden) .summary-window') || document.querySelector('.summary-window');
    if (summaryWin && !isOwnHudNode(summaryWin) && isVisible(summaryWin)) {
      if (!state.summaryResetDone) {
        state.summaryResetDone = true;
        // 先於 resetRun() 紀錄本場挑戰結果，保留神祇／時間／副本名等完整局內資訊
        recordDungeonChallengeResult(summaryWin);
        resetRun('偵測到結算畫面 (.summary-window)');
      }
    } else {
      state.summaryResetDone = false;
      state.summaryStatsRecorded = false;
    }
    const sec = readGameClockSec();
    const info = $id('rh-clock-info');
    if (sec === null) {
      if (info) info.textContent = '遊戲時間：等待遊戲畫面…';
      updateMiniMagnetHud();
      return;
    }
    const prev = state.lastClockSec;
    if (prev !== null) {
      if (sec > prev && sec - prev <= 15) state.clockDir = 'up';
      else if (sec < prev && prev - sec <= 15) state.clockDir = 'down';
      if (state.clockDir === 'up' && sec < prev - 20) {
        const stgClock = resolveCurrentStageInfo();
        const expectedBossSec = Number(stgClock?.bossTime) || 480;
        const expectedFightWin = Number(stgClock?.bossFightWindowSec) || 120;
        const isBossCountdownTransition = Boolean(
          isInCombat() &&
          sec >= 30 &&
          sec <= expectedFightWin + 40 &&
          (hasVisibleBossHpBar() || prev >= Math.max(240, expectedBossSec - 45))
        );
        if (isBossCountdownTransition) {
          state.clockDir = 'down';
          state.inBossCountdown = true;
          addLog(`[最後王戰] 偵測計時器切換為王戰倒數 (${formatMmSs(prev)} → ${formatMmSs(sec)})，保留本局素質與神祇紀錄不重置`);
        } else {
          resetRun('偵測到遊戲時間重置');
        }
      } else if (state.clockDir === 'down' && sec > prev + 20) {
        const expectedFightWin = Number(resolveCurrentStageInfo()?.bossFightWindowSec) || 120;
        if (!state.inBossCountdown || !isInCombat() || sec > expectedFightWin + 60) {
          resetRun('偵測到遊戲時間重置');
        }
      }
    }
    if (state.initialClockSec === undefined) state.initialClockSec = sec;
    state.lastClockSec = sec;
    updateMiniMagnetHud();
    // 開局前數秒補捉地圖中心座標（若剛進場時 DOM 尚未渲染完畢，或切換到新樓層）
    if (isInCombat()) {
      const curCoord = readMinimapCoord();
      const needInit = !state.mapCenterCoord || state.mapCenterCoord.source === 'midrun_temp';
      const stageChanged = Boolean(curCoord?.stageName && state.mapCenterCoord?.stageName && curCoord.stageName !== state.mapCenterCoord.stageName);
      if ((sec <= 12 && (needInit || stageChanged)) || (sec > 12 && stageChanged)) {
        if (syncStageCenterCoord({ allowRecord: sec <= 12 || stageChanged, clockSec: sec, logChange: true })) {
          updateMoveHud();
        }
      }
    }
    const ex = getExtra();
    const target = (Number(ex.timerMin) || 0) * 60 + (Number(ex.timerSec) || 0);
    if (info) {
      const mm = String(Math.floor(sec / 60)).padStart(2, '0');
      const ss = String(sec % 60).padStart(2, '0');
      const tm = String(Math.floor(target / 60)).padStart(2, '0');
      const ts = String(target % 60).padStart(2, '0');
      const bossSched = getStageBossScheduleStatus(sec);
      const bossStr = bossSched ? `｜${bossSched.clockText}` : '';
      info.textContent = `遊戲時間 ${mm}:${ss}${bossStr}｜${ex.timerEnabled ? `目標 ${tm}:${ts}` : '計時未啟用'}`;
    }
    // 只在「跨越」目標時間時觸發；啟用計時時若已超過目標，不會立刻暫停
    if (ex.timerEnabled && target > 0 && !state.timerTriggered && prev !== null && prev < target && sec >= target) {
      state.timerTriggered = true;
      const mm = String(Math.floor(target / 60)).padStart(2, '0');
      const ss = String(target % 60).padStart(2, '0');
      pauseScript(`遊戲時間已達 ${mm}:${ss}`);
    }
  }

  function schedulePendingGamePauseOnFocus() {
    if (document.hidden || !state.paused || !state.pendingGamePauseOnVisible) return;
    setTimeout(() => {
      if (!document.hidden && state.paused && state.pendingGamePauseOnVisible) {
        tryPauseActualGame(0);
      }
    }, 140);
  }
  document.addEventListener('visibilitychange', () => {
    const ex = getExtra();
    if (document.hidden) {
      state.lastTrustedFocusInteractAt = 0;
    }
    if (document.hidden && ex.pauseOnHidden && (state.autoEnabled || state.farmEnabled || CONFIG.autoMoveConfig.mode === 'radius_wander')) {
      pauseScript('視窗被縮小或切換到背景');
    } else if (!document.hidden && state.paused && state.pendingGamePauseOnVisible) {
      schedulePendingGamePauseOnFocus();
    }
  });
  window.addEventListener('focus', () => {
    state.lastTrustedFocusInteractAt = Date.now();
    schedulePendingGamePauseOnFocus();
  });

  // === 7. 互動式 DOM 卡片 / 按鈕探測器 ===
  function findCardRootElement(el) {
    let curr = el;
    let best = null;
    for (let d = 0; d < 9 && curr && curr !== document.body && curr.parentElement; d++) {
      if (isCardSized(curr)) {
        if (!best) best = curr;
        const sibs = Array.from(curr.parentElement.children).filter((c) => c.tagName === curr.tagName && isCardSized(c));
        if (sibs.length >= 2 && sibs.length <= 4) return curr;
      }
      curr = curr.parentElement;
    }
    return best || el;
  }

  function buildSelector(el) {
    if (el.id) return '#' + el.id;
    const act = el.getAttribute('data-act');
    if (act) return `[data-act="${act}"]`;
    const tag = el.tagName.toLowerCase();
    const classes = Array.from(el.classList || []).filter((c) => c && !c.startsWith('rh-') && !/hover|active|selected|ring|border-/i.test(c));
    return classes.length ? `${tag}.${classes.slice(0, 2).join('.')}` : tag;
  }

  function startInteractiveProbe(mode = 'card', fieldKey = 'cardSelector', label = '卡片元件') {
    if (state.pickerActive) return;
    state.pickerActive = true;
    updateStatusBar(`探測${label}中`);
    const banner = document.createElement('div');
    banner.id = 'rh-probe-banner';
    banner.textContent = `🎯 探測【${label}】：滑鼠移到目標出現黃框後左鍵點擊（ESC 取消）`;
    (hudRoot || document.body).appendChild(banner);
    let last = null;
    let savedStyles = null;
    const clearHighlight = () => {
      if (last && savedStyles) {
        try {
          last.style.outline = savedStyles.outline;
          last.style.outlineOffset = savedStyles.outlineOffset;
          last.style.cursor = savedStyles.cursor;
        } catch (_) {}
      }
      last = null;
      savedStyles = null;
    };
    const cleanup = () => {
      state.pickerActive = false;
      clearHighlight();
      banner.remove();
      document.removeEventListener('mouseover', onHover, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
      updateStatusBar();
    };
    const resolveTarget = (raw) => {
      if (!raw || isOwnHudNode(raw)) return null;
      if (mode === 'button') {
        return raw.closest('button, [role="button"], .slot, a') || raw;
      }
      const cand = findCardRootElement(raw);
      return cand && isCardSized(cand) ? cand : null;
    };
    const onHover = (e) => {
      if (isOwnHudNode(e.target)) return;
      clearHighlight();
      const cand = resolveTarget(e.target);
      if (cand) {
        last = cand;
        savedStyles = {
          outline: cand.style.outline || '',
          outlineOffset: cand.style.outlineOffset || '',
          cursor: cand.style.cursor || '',
        };
        cand.style.outline = '3px solid #F59E0B';
        cand.style.outlineOffset = '2px';
        cand.style.cursor = 'crosshair';
      }
    };
    const onKey = (e) => { if (e.key === 'Escape') cleanup(); };
    const onClick = (e) => {
      if (isOwnHudNode(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      cleanup();
      const root = resolveTarget(e.target);
      if (!root) return addLog(`未點選到有效的${label}`);
      const sel = buildSelector(root);
      CONFIG.domSelectors[fieldKey] = sel;
      GM_setValue('skillpick_overrides', { ...GM_getValue('skillpick_overrides', {}), domSelectors: CONFIG.domSelectors });
      updateFarmHud();
      addLog(`已綁定【${label}】Selector：${sel}`);
    };
    document.addEventListener('mouseover', onHover, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
  }

  // === 8. 建立 HUD 面板 ===
  function syncStatCapInputs() {
    const ex = getExtra();
    const pOnEl = $id('rh-cap-pickup-on');
    const pMaxEl = $id('rh-cap-pickup-max');
    const dOnEl = $id('rh-cap-disc-on');
    const dMaxEl = $id('rh-cap-disc-max');
    const deityOnEl = $id('rh-cap-deity-on');
    const deityMaxEl = $id('rh-cap-deity-max');
    const basePEl = $id('rh-base-pickup');
    const baseDEl = $id('rh-base-disc');
    if (pOnEl) pOnEl.checked = ex.capPickupEnabled !== false;
    if (pMaxEl && hudRoot?.activeElement !== pMaxEl) pMaxEl.value = Math.max(0, Number(ex.capPickupMax ?? 40) || 40);
    if (dOnEl) dOnEl.checked = ex.capDiscoveryEnabled !== false;
    if (dMaxEl && hudRoot?.activeElement !== dMaxEl) dMaxEl.value = Math.max(0, Number(ex.capDiscoveryMax ?? 300) || 300);
    if (deityOnEl) deityOnEl.checked = ex.capDeityEnabled !== false;
    if (deityMaxEl && hudRoot?.activeElement !== deityMaxEl) deityMaxEl.value = Math.max(1, Number(ex.capDeityMax ?? 10) || 10);
    if (basePEl && hudRoot?.activeElement !== basePEl) {
      basePEl.value = ex.basePickupRange !== null && ex.basePickupRange !== undefined ? String(ex.basePickupRange) : '';
    }
    if (baseDEl && hudRoot?.activeElement !== baseDEl) {
      baseDEl.value = ex.baseDiscoveryPct !== null && ex.baseDiscoveryPct !== undefined ? String(ex.baseDiscoveryPct) : '';
    }
  }

  function updateRunInfo() {
    const r = state.run;
    const skillEl = $id('rh-run-info');
    if (skillEl) {
      const bQueue = getJobBanishOrder();
      const bKeys = Array.isArray(r.banishedKeys) ? r.banishedKeys : [];
      const bStatus = bQueue.length
        ? bQueue
            .map((k) => {
              const done =
                (k === '__FOURTH__' && r.fourthBanished) ||
                (k === '__INNATE__' && r.attrBanished) ||
                bKeys.includes(k);
              const shortLbl = k === '__FOURTH__' ? '第四招' : k === '__INNATE__' ? '屬性' : k;
              return `${shortLbl} ${done ? '✓' : '✗'}`;
            })
            .join('、')
        : '無';
      const autoTag = r.nativeSkillAutoClicked ? '｜內建自動 ✓' : '';
      const skDeityTxt = r.skillDeity
        ? `｜Lv20神祇：${r.skillDeity}+${Number(r.skillDeityLevel) || 0}`
        : r.deityPending
        ? '｜Lv20神祇：!待選'
        : '';
      skillEl.textContent = `第四招：${r.fourthSkill || '未選定'}｜放逐：${bStatus}${skDeityTxt}${autoTag}`;
    }
    const skDeityLockEl = $id('rh-skill-deity-lock');
    if (skDeityLockEl) {
      const lockedSk = getJobLockedSkillDeity();
      const liveSk = r.skillDeity
        ? `${r.skillDeity} (+${Number(r.skillDeityLevel) || 0})`
        : r.deityPending
        ? 'Lv20「!」待選'
        : 'Lv20 解鎖';
      skDeityLockEl.textContent = `目前神祇：${liveSk}｜指定：${lockedSk || '依順位'}`;
    }
    const deityEl = $id('rh-deity-lock');
    if (deityEl) {
      const artLvl = r.deity ? ` (+${Number(r.deityLevel) || 0})` : '';
      deityEl.textContent = `目前神器：${r.deity ? `${r.deity}${artLvl}` : '尚未裝備'}`;
    }
    const socketsEl = $id('rh-sockets-status');
    if (socketsEl) {
      const items = r.items || {};
      const parts = RUN_ITEM_CATEGORIES.map((c) => {
        const k = items[c];
        const label = k && RUN_ITEMS_BY_KEY[k] ? RUN_ITEMS_BY_KEY[k].displayName.replace(/\s*\(.*\)/, '') : '空';
        return `${c}:${label}`;
      });
      parts.push(`神器:${r.deity ? r.deity.replace(/神器$/, '') : '空'}`);
      parts.push(`神祇:${r.skillDeity ? `${r.skillDeity}+${Number(r.skillDeityLevel) || 0}` : r.deityPending ? '!待選' : '鎖'}`);
      socketsEl.textContent = parts.join(' ｜ ');
    }
    const itemLockEl = $id('rh-item-lock');
    if (itemLockEl && state.activeItemCat && state.activeItemCat !== '神器' && state.activeItemCat !== '神祇') {
      const cat = state.activeItemCat;
      const curK = r.items?.[cat];
      const lockedK = getJobLockedItem(cat);
      const curLabel = curK && RUN_ITEMS_BY_KEY[curK] ? RUN_ITEMS_BY_KEY[curK].displayName : '空（選定後不可覆蓋）';
      const lockedLabel = lockedK && RUN_ITEMS_BY_KEY[lockedK] ? RUN_ITEMS_BY_KEY[lockedK].displayName : '自動前 N 名';
      itemLockEl.textContent = `${cat}｜已裝：${curLabel}｜鎖定：${lockedLabel}`;
    }
    const capStatusEl = $id('rh-cap-live-status');
    if (capStatusEl) {
      const stats = getEffectivePlayerStats();
      if (!stats.inCombat) {
        const baseNote =
          stats.basePickup !== null || stats.baseDisc !== null
            ? `（基礎 拾取:${stats.basePickup ?? 0}｜尋寶:${stats.baseDisc ?? 0}%）`
            : '';
        capStatusEl.textContent = `副本內計算｜等待進本${baseNote}`;
        capStatusEl.style.color = '#94A3B8';
      } else {
        const ex = getExtra();
        const pStr = stats.pickupRange !== null ? String(Math.round(stats.pickupRange * 10) / 10) : '0';
        const dStr = stats.discoveryPct !== null ? `${Math.round(stats.discoveryPct * 10) / 10}%` : '0%';
        const pTag = stats.pickupCapped ? '(達標)' : '';
        const dTag = stats.discoveryCapped ? '(達標)' : '';
        const deityLvl = Math.max(0, Number(r.deityLevel) || 0);
        const deityCap = Math.max(1, Number(ex.capDeityMax ?? 10) || 10);
        const deityCapped = Boolean(ex.capDeityEnabled !== false && deityLvl >= deityCap);
        const deityPart = ex.capDeityEnabled !== false
          ? ` ｜ 神器:+${deityLvl}/+${deityCap}${deityCapped ? '(讓位四格)' : ''}`
          : '';
        capStatusEl.textContent = `拾取:${pStr}/${stats.pickupCap}${pTag} ｜ 尋寶:${dStr}/${stats.discCap}%${dTag}${deityPart}`;
        capStatusEl.style.color = (stats.pickupCapped || stats.discoveryCapped || deityCapped) ? '#FDE68A' : '#93C5FD';
      }
    }
  }

  function renderOrderList(container, getList, setList, allNames, opts = {}) {
    if (!container) return;
    container.innerHTML = '';
    const list = getList();
    list.forEach((name, idx) => {
      const row = document.createElement('div');
      row.className = 'rh-ord-row';
      const disp = typeof opts.labelFor === 'function' ? opts.labelFor(name, idx) : name;
      row.innerHTML = `<span style="font-family:monospace;font-size:11px;font-weight:700;color:#F59E0B;width:24px;">#${idx + 1}</span><span style="flex:1;font-size:11.5px;font-weight:600;color:#F8FAFC;">${escapeHtml(disp)}</span>`;
      if (opts.tagFor) {
        if (typeof opts.onTagClick === 'function') {
          const tb = document.createElement('button');
          tb.type = 'button';
          tb.className = 'rh-btn rh-btn-sm';
          const customBg = opts.tagBg ? opts.tagBg(name, idx) : 'rgba(30,41,59,0.9)';
          const customBd = opts.tagBorder ? opts.tagBorder(name, idx) : 'rgba(148,163,184,0.35)';
          const customCol = opts.tagColor ? opts.tagColor(name, idx) : '#CBD5E1';
          tb.style.cssText = `padding:2px 6px;font-size:10px;min-width:48px;background:${customBg};border:1px solid ${customBd};color:${customCol};`;
          tb.textContent = opts.tagFor(name, idx);
          tb.title = '點擊切換：✓ 接受 / 略過';
          tb.addEventListener('click', () => {
            opts.onTagClick(name, idx);
            renderOrderList(container, getList, setList, allNames, opts);
          });
          row.appendChild(tb);
        } else {
          const tg = document.createElement('span');
          tg.style.cssText = `font-size:10px;color:${opts.tagColor ? opts.tagColor(name, idx) : '#94A3B8'};`;
          tg.textContent = opts.tagFor(name, idx);
          row.appendChild(tg);
        }
      }
      const mkBtn = (txt, disabled, fn, color) => {
        const b = document.createElement('button');
        b.className = 'rh-btn rh-btn-sm';
        b.style.cssText = `padding:2px 6px;font-size:10px;${color ? `color:${color};` : ''}${disabled ? 'opacity:0.35;' : ''}`;
        b.textContent = txt;
        b.disabled = disabled;
        b.addEventListener('click', fn);
        return b;
      };
      const commit = (next) => { setList(next); renderOrderList(container, getList, setList, allNames, opts); };
      row.appendChild(mkBtn('▲', idx === 0, () => {
        const n = [...list]; [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]]; commit(n);
      }));
      row.appendChild(mkBtn('▼', idx === list.length - 1, () => {
        const n = [...list]; [n[idx + 1], n[idx]] = [n[idx], n[idx + 1]]; commit(n);
      }));
      row.appendChild(mkBtn('✕', false, () => commit(list.filter((_, i) => i !== idx)), '#EF4444'));
      container.appendChild(row);
    });
    const remaining = allNames.filter((n) => !list.includes(n));
    if (remaining.length) {
      const addRow = document.createElement('div');
      addRow.className = 'rh-row';
      const sel = document.createElement('select');
      sel.className = 'rh-select';
      remaining.forEach((n) => {
        const o = document.createElement('option');
        o.value = n;
        o.textContent = typeof opts.labelFor === 'function' ? opts.labelFor(n) : n;
        sel.appendChild(o);
      });
      const add = document.createElement('button');
      add.className = 'rh-btn rh-btn-sm';
      add.textContent = '+ 加入';
      add.addEventListener('click', () => { setList([...list, sel.value]); renderOrderList(container, getList, setList, allNames, opts); });
      addRow.appendChild(sel);
      addRow.appendChild(add);
      container.appendChild(addRow);
    }
  }

  function createHud() {
    if (hudHost && hudHost.isConnected) return;
    hudHost = document.createElement('div');
    hudRoot = hudHost.attachShadow({ mode: 'closed' });
    const styleEl = document.createElement('style');
    styleEl.textContent = HUD_SHADOW_CSS;
    hudRoot.appendChild(styleEl);
    const hud = document.createElement('div');
    hud.id = 'rh-panel';
    // 預設啟動與網頁重整後皆保持縮小並自動貼齊最左上角 (0, 0)，避免遮擋頭像與遊戲介面
    hud.classList.add('rh-minimized');
    hud.style.left = '0px';
    hud.style.top = '0px';
    hud.style.right = 'auto';
    const savedOpacity = Math.max(30, Math.min(100, Number(GM_getValue('skillpick_hud_opacity', 95)) || 95));
    hud.style.opacity = (savedOpacity / 100).toFixed(2);
    hud.innerHTML = `
      <div id="rh-mini-dock"><div class="rh-mini-grid"><div class="rh-mini-col"><button id="rh-mini-btn" class="rh-mini-icon-btn" type="button" title="點擊展開 RO倖存者 自動選技（可拖曳移動）" aria-label="展開 RO倖存者 自動選技"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="rh-r-grad" x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#FDE68A"/><stop offset="55%" stop-color="#F59E0B"/><stop offset="100%" stop-color="#D97706"/></linearGradient></defs><path d="M5.5 6.5C5.5 4.8 7 3.8 8.5 4.8L10.5 6.1C11.4 5.7 12.6 5.7 13.5 6.1L15.5 4.8C17 3.8 18.5 4.8 18.5 6.5V8.4C19.6 9.6 20 11.1 20 12.8C20 17.1 16.5 20.2 12 20.2C7.5 20.2 4 17.1 4 12.8C4 11.1 4.4 9.6 5.5 8.4V6.5Z" fill="#0F172A" stroke="url(#rh-r-grad)" stroke-width="1.6" stroke-linejoin="round"/><path d="M9.4 16.8V9.2H12.7C14.1 9.2 15 10.0 15 11.2C15 12.2 14.3 12.9 13.3 13.1L15.2 16.8H13.3L11.6 13.3H11.0V16.8H9.4ZM11.0 11.9H12.5C13.1 11.9 13.4 11.6 13.4 11.2C13.4 10.7 13.1 10.5 12.5 10.5H11.0V11.9Z" fill="url(#rh-r-grad)"/></svg></button><button id="rh-mini-pause" class="rh-mini-icon-btn" type="button" title="暫停輔助（凍結自動選擇／走位／刷圖並按 ESC 暫停遊戲）" aria-label="暫停或繼續輔助"><svg id="rh-mini-pause-glyph" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="7" y="5.5" width="3.5" height="13" rx="1" fill="#FDE68A"/><rect x="13.5" y="5.5" width="3.5" height="13" rx="1" fill="#FDE68A"/></svg></button><button id="rh-mini-stopall" class="rh-mini-icon-btn" type="button" title="全部停止（關閉自動選擇、刷圖迴圈與自動走位）" aria-label="全部停止"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="12" height="12" rx="2" fill="#F87171"/></svg></button></div><div class="rh-mini-col rh-mini-col-toggles"><button id="rh-mini-auto" class="rh-mini-icon-btn" type="button" title="自動選擇：點擊切換開啟／關閉" aria-label="切換自動選擇"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="5" width="12" height="15" rx="2.2" stroke="currentColor" stroke-width="1.9"/><path d="M7.5 13.2L9.6 15.3L13.5 10.7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M18.5 2.5L19.3 4.7L21.5 5.5L19.3 6.3L18.5 8.5L17.7 6.3L15.5 5.5L17.7 4.7L18.5 2.5Z" fill="currentColor"/></svg></button><button id="rh-mini-farm" class="rh-mini-icon-btn" type="button" title="刷圖迴圈：點擊切換開啟／關閉" aria-label="切換刷圖迴圈"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19.5 9.5A7.8 7.8 0 0 0 6.2 6.8L4.5 8.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M4.5 4.5V8.5H8.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 14.5A7.8 7.8 0 0 0 17.8 17.2L19.5 15.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M19.5 19.5V15.5H15.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 8.7L14.8 12L12 15.3L9.2 12L12 8.7Z" fill="currentColor"/></svg></button><button id="rh-mini-move" class="rh-mini-icon-btn" type="button" title="走位：點擊切換半徑繞行／定點不動" aria-label="切換自動走位"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3V21M3 12H21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M9.2 5.8L12 3L14.8 5.8M9.2 18.2L12 21L14.8 18.2M5.8 9.2L3 12L5.8 14.8M18.2 9.2L21 12L18.2 14.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/></svg></button></div></div><div id="rh-mini-magnet" class="rh-mag-off" title="磁鐵運作狀態（進本後顯示倒數與可撿狀態）">🧲待命</div></div>
      <div id="rh-header"><span style="font-weight:700;color:#F8FAFC;background:transparent;">RO倖存者 自動選技 <small style="color:#FBBF24;font-weight:600;font-size:10px;">v2.46.0</small></span><div id="rh-header-actions"><button id="rh-toggle-folds" type="button" title="一鍵展開／收合目前分頁的所有摺疊卡">⇕</button><button id="rh-toggle-min" type="button" title="縮小為小圖示">—</button></div></div>
      <div id="rh-body">
      <div id="rh-backup-modal" class="rh-modal" style="display:none;"><div class="rh-modal-content"><div class="rh-modal-header"><span id="rh-backup-modal-title" style="font-weight:700;font-size:12.5px;color:#F8FAFC;">設定檔同步與備份</span><button id="rh-backup-modal-close" type="button" class="rh-btn rh-btn-sm" style="padding:2px 7px;">✕</button></div><div class="rh-modal-body">
      <div id="rh-backup-modal-desc" class="rh-hint" style="font-size:11px;color:#94A3B8;line-height:1.45;"></div>
      <div id="rh-import-tools-row" class="rh-row" style="display:flex;gap:5px;flex-wrap:wrap;"><button id="rh-btn-paste-clip" type="button" class="rh-btn rh-btn-sm" style="color:#38BDF8;border-color:rgba(56,189,248,0.45);">📋 貼上同步碼</button><button id="rh-btn-pick-file" type="button" class="rh-btn rh-btn-sm" style="color:#FBBF24;border-color:rgba(251,191,36,0.45);">📂 選 .json 檔</button><input id="rh-preset-file-input" type="file" accept=".json,application/json,text/plain" style="display:none;" /><label class="rh-hint" style="display:inline-flex;align-items:center;gap:4px;font-size:10.5px;cursor:pointer;margin-left:auto;"><input id="rh-import-merge-mode" type="checkbox" class="rh-check" /><span>僅合併新增（保留原設定與地圖合併）</span></label></div><textarea id="rh-backup-textarea" class="rh-select" style="width:100%;height:115px;font-family:monospace;font-size:10.5px;resize:vertical;padding:6px;line-height:1.4;" placeholder="貼上 ROSYNC1:... 短同步碼，或舊版 JSON 備份內容..."></textarea><div class="rh-row" style="gap:5px;justify-content:flex-end;flex-wrap:wrap;"><button id="rh-backup-action-copy" type="button" class="rh-btn rh-btn-sm" style="color:#38BDF8;border-color:rgba(56,189,248,0.45);">📋 複製同步碼</button><button id="rh-backup-action-download" type="button" class="rh-btn rh-btn-sm" style="color:#86EFAC;border-color:rgba(134,239,172,0.45);">💾 下載 .json 備份</button><button id="rh-backup-action-confirm" type="button" class="rh-btn rh-btn-primary rh-btn-sm">✔ 確認還原</button></div></div></div></div>
      <div id="rh-tabs"><button class="rh-tab rh-tab-active" data-tab="main">主控</button><button class="rh-tab" data-tab="farm">刷圖</button><button class="rh-tab" data-tab="move">走位</button><button class="rh-tab" data-tab="loot">撿取</button><button class="rh-tab" data-tab="skill">技能</button><button class="rh-tab" data-tab="deity">道具</button><button class="rh-tab" data-tab="config">詞條</button><button class="rh-tab" data-tab="timer">計時</button><button class="rh-tab" data-tab="tools">工具</button></div>
      <div id="rh-panels-scroll">
      <div id="rh-panel-main" class="rh-tab-panel active"><div class="rh-row"><button id="rh-btn-auto" class="${state.autoEnabled ? 'rh-btn rh-btn-active' : 'rh-btn rh-btn-primary'}">${state.autoEnabled ? '自動選擇中（本地規則）' : '啟動自動選擇'}</button></div><div class="rh-row" style="gap:5px;"><button id="rh-btn-autobuild" class="${state.autoBuildEnabled ? 'rh-btn rh-btn-active' : 'rh-btn'}" style="padding:5px 8px;" title="開啟／關閉技能湊招與放逐">${state.autoBuildEnabled ? '放逐：開' : '放逐：關'}</button><button id="rh-btn-pause-toggle" class="rh-btn rh-btn-sm" style="padding:5px 7px;" title="暫停／繼續所有自動動作">⏸ 暫停</button><button id="rh-btn-stop-all" class="rh-btn rh-btn-sm" style="padding:5px 7px;color:#FCA5A5;border-color:rgba(248,113,113,0.45);" title="全部停止（關閉自動選擇、刷圖迴圈與自動走位）">⏹ 停全</button><button id="rh-btn-newrun" class="rh-btn rh-btn-sm" style="padding:5px 7px;" title="手動重置本場進度">🔄</button></div>
      <details class="rh-fold" data-fold="main_presets"><summary class="rh-fold-sum"><span class="rh-fold-title">設定檔・流派・跨機同步</span><span class="rh-fold-meta" id="rh-fold-meta-presets">流派快捷 · 同步碼</span></summary><div class="rh-fold-body" id="rh-user-preset-box"><div class="rh-row" style="gap:5px;"><span class="rh-hint" style="color:#F8FAFC;font-weight:700;white-space:nowrap;">設定檔</span><select id="rh-preset-select" class="rh-select" style="flex:1;min-width:90px;"></select><button id="rh-preset-apply" type="button" class="rh-btn rh-btn-primary rh-btn-sm" title="套用所選設定檔的全部參數（刷圖/走位/撿取/技能/道具/詞條/計時）">套用</button><button id="rh-preset-overwrite" type="button" class="rh-btn rh-btn-sm" title="用目前全部參數更新覆寫所選設定檔">覆寫</button></div><div class="rh-row" style="gap:5px;"><input id="rh-preset-name" class="rh-select" type="text" maxlength="24" placeholder="輸入名稱（例：刷寶、傷害）" style="flex:1;padding:3px 7px;font-size:11.5px;" /><button id="rh-preset-saveas" type="button" class="rh-btn rh-btn-sm" style="color:#86EFAC;border-color:rgba(134,239,172,0.45);" title="將目前全部參數另存為設定檔">+ 另存</button><button id="rh-preset-delete" type="button" class="rh-btn rh-btn-sm" style="color:#FCA5A5;border-color:rgba(248,113,113,0.45);" title="刪除所選設定檔（點擊兩次確認）">🗑 刪除</button></div><div class="rh-row" style="gap:4px;"><button id="rh-preset-stream-dmg" type="button" class="rh-btn rh-btn-sm" style="color:#FCA5A5;border-color:rgba(248,113,113,0.45);flex:1;" title="套用【輸出爆發流】：傷害、冷卻、爆擊優先，戰爭/處刑神器">🔥 輸出流</button><button id="rh-preset-stream-farm" type="button" class="rh-btn rh-btn-sm" style="color:#86EFAC;border-color:rgba(134,239,172,0.45);flex:1;" title="套用【極致刷寶流】：採集、尋寶、貪婪、智慧神器、自動撿寶">💰 刷寶流</button><button id="rh-preset-stream-skill" type="button" class="rh-btn rh-btn-sm" style="color:#93C5FD;border-color:rgba(147,197,253,0.45);flex:1;" title="套用【技能循環流】：冷卻縮減、詠唱速度、範圍、思想/記憶神器">⚡ 技能流</button></div><div class="rh-row" style="gap:4px;"><button id="rh-preset-export" type="button" class="rh-btn rh-btn-sm" style="color:#38BDF8;border-color:rgba(56,189,248,0.45);flex:1;" title="一鍵壓縮全設定檔＋各副本障礙記憶為極短 ROSYNC1 同步碼並直接複製到剪貼簿（不下載多餘檔案、不含本機橋接金鑰）">📋 複製同步碼</button><button id="rh-preset-import" type="button" class="rh-btn rh-btn-sm" style="color:#FBBF24;border-color:rgba(251,191,36,0.45);flex:1;" title="貼上 ROSYNC1 同步碼還原設定，或匯入／手動下載 .json 備份檔">📥 還原 / 備份</button></div><div class="rh-hint" id="rh-preset-info" style="font-size:10.5px;color:#93C5FD;">一鍵複製短同步碼可貼 LINE／Keep 跨機帶走（保留各機獨立橋接金鑰）</div></div></details>
      <details class="rh-fold" data-fold="main_mode"><summary class="rh-fold-sum"><span class="rh-fold-title">升等與輸入模式</span><span class="rh-fold-meta" id="rh-fold-meta-main">累積≥1張 ｜ 點擊+鍵</span></summary><div class="rh-fold-body"><div class="rh-row"><span class="rh-hint">升等選技</span><select id="rh-upgrade-mode" class="rh-select"><option value="accumulate_auto">累積模式：達門檻自動按 B/開卡</option><option value="accumulate_manual">累積模式：手動按 B 才連續選卡</option><option value="instant">即時模式：升等彈出即選</option></select></div><div class="rh-row" id="rh-bank-th-row"><span class="rh-hint">累積開卡門檻（#bank-n ≥）</span><input id="rh-bank-threshold" class="rh-num" type="number" min="1" max="99" style="margin-left:auto;" /><span class="rh-hint">張</span></div><div class="rh-row"><span class="rh-hint">輸入模式</span><select id="rh-action-mode" class="rh-select"><option value="hybrid_bridge">混合橋接（本機送真實按鍵 1-4）</option><option value="advisor_only">純提示建議（不發送任何事件）</option></select></div><div class="rh-row"><span class="rh-hint" id="rh-bridge-status" style="flex:1;font-size:10.5px;">橋接尚未檢查</span><button id="rh-btn-bridge-ping" type="button" class="rh-btn rh-btn-sm">🔌 測試連線</button><button id="rh-btn-bridge-calib" type="button" class="rh-btn rh-btn-sm" title="自動對齊瀏覽器視窗與滑鼠座標（修正放逐/重抽點擊偏差）">🎯 校準點擊</button></div></div></details></div>
      <div id="rh-panel-farm" class="rh-tab-panel">
      <div class="rh-box"><div class="rh-row"><button id="rh-btn-farm" class="rh-btn rh-btn-primary">刷圖迴圈：關閉</button><span class="rh-hint" id="rh-farm-count" style="color:#FBBF24;font-weight:700;font-family:monospace;">完成 0 場</span></div><div class="rh-hint" id="rh-farm-rest-status" style="display:none;font-size:11px;font-family:monospace;"></div></div>
      <details class="rh-fold" data-fold="farm_stage"><summary class="rh-fold-sum"><span class="rh-fold-title">模式與關卡排程</span><span class="rh-fold-meta" id="rh-fold-meta-farm-stage">斐揚洞穴 ｜ 單圖</span></summary><div class="rh-fold-body"><div class="rh-row"><span class="rh-hint">模式</span><select id="rh-farm-mode" class="rh-select"><option value="lobby_target">完整迴圈 (結算→自動回村→教官選關開本)</option><option value="settle_only">僅自動結算回村 (回村後停止)</option></select></div><div class="rh-row"><span class="rh-hint">主關卡</span><select id="rh-farm-stage" class="rh-select"></select></div><div style="display:flex;flex-direction:column;gap:4px;padding:4px 6px;border-radius:5px;background:rgba(2,6,23,0.42);border:1px solid rgba(148,163,184,0.18);"><div class="rh-row" style="gap:4px;"><label class="rh-hint" style="display:flex;gap:4px;align-items:center;cursor:pointer;white-space:nowrap;color:#FDE68A;" title="開啟後，每場結束依設定機率從下方勾選的副關卡中隨機抽選一張輪流刷"><input id="rh-farm-dual-on" class="rh-check" type="checkbox" /> 雙刷圖（勾選隨機副圖） </label><input id="rh-farm-dual-pct" class="rh-num" type="number" min="5" max="95" style="width:42px;margin-left:auto;" title="副關卡隨機出現機率 (%)" /><span class="rh-hint">%</span></div><div id="rh-farm-stage2-list" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px 6px;"></div></div><div class="rh-hint" id="rh-farm-stage-info"></div></div></details>
      <details class="rh-fold" data-fold="farm_pace"><summary class="rh-fold-sum"><span class="rh-fold-title">場數・延遲・回村停留</span><span class="rh-fold-meta" id="rh-fold-meta-farm-pace">無限場 ｜ 回村10~60秒</span></summary><div class="rh-fold-body"><div class="rh-row"><span class="rh-hint">目標場數</span><input id="rh-farm-max" class="rh-num" type="number" min="0" max="9999" title="0 代表無限迴圈；達標後自動 F5 重整並停止所有動作" /><span class="rh-hint" style="margin-left:auto;">結算延遲</span><input id="rh-farm-delay" class="rh-num" type="number" min="1" max="30" /><span class="rh-hint">秒</span></div><div class="rh-row" style="gap:4px;"><label class="rh-hint" style="display:flex;gap:4px;align-items:center;cursor:pointer;" title="刷圖結束一場回村後，將設定的隨機秒數分散到剛回村、走去NPC途中、NPC前與對話視窗停留（不改變行走路徑）"><input id="rh-farm-dwell-on" class="rh-check" type="checkbox" /> 回村隨機停 </label><input id="rh-farm-dwell-min" class="rh-num" type="number" min="0" max="300" style="width:44px;margin-left:auto;" /><span class="rh-hint">~</span><input id="rh-farm-dwell-max" class="rh-num" type="number" min="0" max="300" style="width:44px;" /><span class="rh-hint">秒</span></div></div></details>
      <details class="rh-fold" data-fold="farm_rest"><summary class="rh-fold-sum"><span class="rh-fold-title">階段休息（F5 登出）</span><span class="rh-fold-meta" id="rh-fold-meta-farm-rest">關閉</span></summary><div class="rh-fold-body"><div class="rh-row" style="gap:4px;white-space:nowrap;"><label class="rh-hint" style="display:flex;gap:4px;align-items:center;cursor:pointer;color:#93C5FD;" title="每刷完隨機 X~Y 場後自動 F5 重整登出，離線休息隨機分鐘後再自動登入繼續刷圖"><input id="rh-farm-rest-on" class="rh-check" type="checkbox" /> 階段休息(F5登出) </label><span class="rh-hint" style="margin-left:auto;">每</span><input id="rh-farm-rest-min-runs" class="rh-num" type="number" min="1" max="200" style="width:36px;padding:2px 3px;" /><span class="rh-hint">~</span><input id="rh-farm-rest-max-runs" class="rh-num" type="number" min="1" max="200" style="width:36px;padding:2px 3px;" /><span class="rh-hint">場</span></div><div class="rh-row" style="gap:4px;white-space:nowrap;"><span class="rh-hint">休息</span><input id="rh-farm-rest-min-min" class="rh-num" type="number" min="1" max="480" style="width:42px;padding:2px 3px;" /><span class="rh-hint">~</span><input id="rh-farm-rest-max-min" class="rh-num" type="number" min="1" max="480" style="width:42px;padding:2px 3px;" /><span class="rh-hint">分後自動登入</span><button id="rh-farm-rest-resume" type="button" class="rh-btn rh-btn-sm" style="display:none;margin-left:auto;padding:2px 7px;font-size:10.5px;background:rgba(22,163,74,0.24);border-color:rgba(74,222,128,0.55);color:#86EFAC;">立即續刷</button></div><div class="rh-row" style="gap:4px;margin-top:1px;"><button id="rh-rest-preset-casual" type="button" class="rh-btn rh-btn-sm" style="flex:1;padding:2px 4px;font-size:10.5px;color:#86EFAC;border-color:rgba(134,239,172,0.4);" title="套用日常休閒：每 3~5 場休 35~70 分，目標 15 場 (建議 12~18 場)">🌿 日常休閒</button><button id="rh-rest-preset-active" type="button" class="rh-btn rh-btn-sm" style="flex:1;padding:2px 4px;font-size:10.5px;color:#FCA5A5;border-color:rgba(248,113,113,0.4);" title="套用積極農怪：每 4~6 場休 25~55 分，目標 22 場 (建議 20~25 場)">🔥 積極農怪</button><button id="rh-rest-preset-short" type="button" class="rh-btn rh-btn-sm" style="flex:1;padding:2px 4px;font-size:10.5px;color:#93C5FD;border-color:rgba(147,197,253,0.4);" title="套用短時多段：每 2~4 場休 20~45 分，目標 18 場 (建議 15~20 場)">⏱ 短時多段</button></div></div></details>
      <details class="rh-fold" data-fold="farm_adv"><summary class="rh-fold-sum"><span class="rh-fold-title">大廳／殘血設定</span><span class="rh-fold-meta" id="rh-fold-meta-farm">單人大廳 ｜ 殘血≤30%</span></summary><div class="rh-fold-body"><div class="rh-row"><span class="rh-hint">選擇大廳</span><select id="rh-farm-lobby-choice" class="rh-select"><option value="solo">單人大廳（副本結束自動點，預設）</option><option value="last">上次大廳（.ch-row.lb.me）</option><option value="off">手動選擇（不自動點大廳）</option></select></div><div class="rh-row"><label class="rh-hint" style="display:flex;gap:4px;align-items:center;cursor:pointer;" title="僅在斷線或重整退回選角畫面時自動點 #btn-play"><input id="rh-farm-autoplay" class="rh-check" type="checkbox" /> 斷線自動進村 </label><label class="rh-hint" style="display:flex;gap:4px;align-items:center;margin-left:auto;cursor:pointer;" title="僅在「定點不動」模式時，低血量自動緊急繞圈閃避；已開啟半徑繞行時會自動略過，避免中斷小地圖撿取"><input id="rh-auto-hpdodge" class="rh-check" type="checkbox" /> 定點殘血閃避 ≤ </label><input id="rh-farm-hp" class="rh-num" type="number" min="0" max="90" title="0 代表關閉" style="width:44px;" /><span class="rh-hint">%</span></div></div></details></div>
      <div id="rh-panel-skill" class="rh-tab-panel">
      <div class="rh-box"><div class="rh-row"><span class="rh-hint">職業</span><select id="rh-job-select" class="rh-select"></select></div><div class="rh-ord-row"><span id="rh-core-banner" style="font-size:11px;color:#86EFAC;background:transparent;">🔒 固定核心：火箭術 / 冰箭術 / 雷擊術</span></div><div class="rh-hint" id="rh-run-info" style="font-size:11px;"></div></div>
      <details class="rh-fold" data-fold="skill_fourth"><summary class="rh-fold-sum"><span class="rh-fold-title">第四招順位與選技規則</span><span class="rh-fold-meta" id="rh-fold-meta-skill-fourth">前3名接受 · 自動技能開</span></summary><div class="rh-fold-body"><div id="rh-skill-order" style="display:flex;flex-direction:column;gap:4px;max-height:150px;overflow-y:auto;"></div><div class="rh-row"><span class="rh-hint">批次前</span><input id="rh-accept-n" class="rh-num" type="number" min="0" max="20" title="快速把前 N 名設為接受（也可直接點上方每招的 接受/略過 切換）" /><span class="rh-hint">名接受</span><label class="rh-hint" style="display:flex;gap:4px;align-items:center;margin-left:auto;cursor:pointer;"><input id="rh-reroll-skill" class="rh-check" type="checkbox" /> 缺招重抽 </label></div><label class="rh-hint" style="display:flex;gap:5px;align-items:center;cursor:pointer;"><input id="rh-prefer-legendary-core" class="rh-check" type="checkbox" /> 冰/火/雷（核心技能）出現傳說卡優先選擇 </label><label class="rh-hint" style="display:flex;gap:5px;align-items:center;cursor:pointer;color:#93C5FD;" title="放逐順序（第四招／天生普攻／自訂放逐）全部放逐完成或放逐次數用完，且技能欄位 4/4 已滿時，點擊遊戲內建「自動技能」（與自動寶箱完全分離）"><input id="rh-use-native-auto-skill" class="rh-check" type="checkbox" /> 放逐完且滿招後，點擊遊戲內建「自動技能」 </label></div></details>
      <details class="rh-fold" data-fold="skill_deity"><summary class="rh-fold-sum"><span class="rh-fold-title">✨ Lv 20 技能神祇（第 6 格 !）</span><span class="rh-fold-meta" id="rh-fold-meta-skill-deity">自動點!開 · 首選:雷擊術</span></summary><div class="rh-fold-body" style="gap:5px;"><label class="rh-hint" style="display:flex;gap:5px;align-items:center;cursor:pointer;color:#C4B5FD;" title="達 Lv 20 道具欄第 6 格出現「!」時，安全血量自動點擊開啟並依下方優先順序四選一（選定後每 10 級自動升級）"><input id="rh-skill-deity-auto" class="rh-check" type="checkbox" /> 達 Lv 20 自動點擊「!」並選神祇（後續每 10 級自動升級） </label><div class="rh-row"><span class="rh-hint">指定目標</span><select id="rh-skill-deity-target" class="rh-select"></select></div><div id="rh-skill-deity-order" style="display:flex;flex-direction:column;gap:4px;max-height:130px;overflow-y:auto;"></div><div class="rh-row"><div class="rh-hint" id="rh-skill-deity-lock" style="flex:1;font-size:10.5px;color:#C4B5FD;">目前神祇：Lv20 解鎖</div><button id="rh-skill-deity-unlock" type="button" class="rh-btn rh-btn-sm">解除指定</button></div></div></details>
      <details class="rh-fold" data-fold="skill_banish"><summary class="rh-fold-sum"><span class="rh-fold-title">🚫 技能放逐順序</span><span class="rh-fold-meta" id="rh-fold-meta-skill-banish">排程 3 招</span></summary><div class="rh-fold-body"><div class="rh-row" style="justify-content:space-between;"><span class="rh-hint" style="font-size:11px;color:#FCA5A5;">依剩餘次數順序放逐</span><button id="rh-banish-reset-btn" class="rh-btn rh-btn-sm" style="padding:2px 6px;font-size:10px;">重設預設</button></div><div id="rh-banish-order-list" style="display:flex;flex-direction:column;gap:3px;max-height:110px;overflow-y:auto;"></div><div class="rh-row" style="gap:4px;"><select id="rh-banish-add-sel" class="rh-select" style="padding:2px 4px;font-size:11px;"></select><button id="rh-banish-add-btn" class="rh-btn rh-btn-sm" style="padding:2px 8px;font-size:10px;flex-shrink:0;">＋加入</button></div></div></details></div>
      <div id="rh-panel-deity" class="rh-tab-panel">
      <div class="rh-box" style="padding:6px 8px;gap:4px;"><div class="rh-row" style="gap:5px;"><span class="rh-hint" id="rh-cap-live-status" style="flex:1;font-size:10.5px;color:#94A3B8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">副本內計算｜等待進本</span><button id="rh-apply-farm-preset" type="button" class="rh-btn rh-btn-sm" title="將智慧神器 / AGI料理 / 冷卻祝福 / 驚奇秘藥(尋寶率) / 採集藥水設為目前職業首選">⭐ 打寶冷卻流</button></div><div class="rh-hint" id="rh-sockets-status" style="font-size:10.5px;color:#FDE68A;"></div></div>
      <details class="rh-fold" data-fold="deity_rules"><summary class="rh-fold-sum"><span class="rh-fold-title">重抽・專注・上限・自動寶箱</span><span class="rh-fold-meta" id="rh-fold-meta-deity">採集先 · 重抽開 · 專注神器/藥 · 拾≥40 · 神器≥+10</span></summary><div class="rh-fold-body" style="gap:5px;"><label class="rh-hint" style="display:flex;gap:5px;align-items:center;cursor:pointer;color:#86EFAC;" title="藥水欄空時最高優先選採集藥水，並於開局積極重抽尋找採集藥水（非前 N 名神器讓位給採集藥水）"><input id="rh-chest-pickup-first" class="rh-check" type="checkbox" /> 採集藥水最優先（開局積極刷藥水） </label><label class="rh-hint" style="display:flex;gap:5px;align-items:center;cursor:pointer;" title="寶箱未命中目標時使用全部重抽；無全部重抽時僅對確定空欄使用單卡重抽，絕不重抽已裝備欄位"><input id="rh-chest-reroll-all" class="rh-check" type="checkbox" /> 寶箱未命中自動重抽（全抽／空欄單抽） </label><label class="rh-hint" style="display:flex;gap:5px;align-items:center;cursor:pointer;color:#67E8F9;" title="進本安全時自動快拍 C 面板（開局與中盤各 1 次，0.25 秒瞬開瞬關、打王與殘血時自動略過），用於記錄戰績素質與同品質裝備缺口微調"><input id="rh-auto-sample-cstats" class="rh-check" type="checkbox" /> 安全時自動快拍 C 面板 (本局素質) 輔助分析 </label><label class="rh-hint" style="display:flex;gap:5px;align-items:center;cursor:pointer;color:#FCD34D;" title="預設關閉（建議由輔助精算）。開啟後將於：四格永久道具全滿 ＋ 目標神器已定型 ＋ 拾取／尋寶上限達標時，自動點擊遊戲內建「自動寶箱」（⚠️ 遊戲內建自動為隨機選卡，後續可能隨機覆蓋已裝備神器）"><input id="rh-use-native-auto-chest" class="rh-check" type="checkbox" /> 四格滿＋神器定型＋達標後點擊遊戲「自動寶箱」（⚠️ 可能隨機蓋神器） </label><div class="rh-row" style="gap:8px;padding:4px 6px;border-radius:5px;background:rgba(2,6,23,0.52);border:1px solid rgba(56,189,248,0.24);"><span class="rh-hint" style="font-weight:700;color:#38BDF8;white-space:nowrap;">🎯 專注</span><label class="rh-hint" style="display:flex;gap:4px;align-items:center;cursor:pointer;white-space:nowrap;" title="僅專注手動鎖定或前 N 名神器（每目標限 1 次，絕不用於一般技能）"><input id="rh-focus-deity" class="rh-check" type="checkbox" /> <span>神器(前<span id="rh-deity-topn-lbl-focus">3</span>/鎖)</span> </label><label class="rh-hint" style="display:flex;gap:4px;align-items:center;cursor:pointer;white-space:nowrap;" title="僅限採集藥水（未達拾取上限且未裝他藥時專注）"><input id="rh-focus-potion" class="rh-check" type="checkbox" /> 採集藥水 </label></div><div style="display:flex;flex-direction:column;gap:4px;padding:4px 6px;border-radius:5px;background:rgba(2,6,23,0.48);border:1px solid rgba(148,163,184,0.16);"><div class="rh-row" style="gap:4px;white-space:nowrap;"><label class="rh-hint" style="display:flex;gap:4px;align-items:center;cursor:pointer;flex:1;white-space:nowrap;" title="拾取範圍達標後，不再優先選擇採集藥水"><input id="rh-cap-pickup-on" class="rh-check" type="checkbox" /> 拾取 ≥ <input id="rh-cap-pickup-max" class="rh-num" type="number" min="0" max="500" style="width:42px;padding:2px 4px;" /><span>停採集</span></label><label class="rh-hint" style="display:flex;gap:3px;align-items:center;cursor:pointer;white-space:nowrap;font-size:11px;"><span>起算</span><input id="rh-base-pickup" class="rh-num" type="number" min="0" max="500" step="0.5" placeholder="0" style="width:40px;padding:2px 4px;" title="選填：進本起算基礎拾取範圍（預設 0）" /></label></div><div class="rh-row" style="gap:4px;white-space:nowrap;"><label class="rh-hint" style="display:flex;gap:4px;align-items:center;cursor:pointer;flex:1;white-space:nowrap;" title="尋寶率達標後，不再優先選擇尋寶道具"><input id="rh-cap-disc-on" class="rh-check" type="checkbox" /> 尋寶 ≥ <input id="rh-cap-disc-max" class="rh-num" type="number" min="0" max="5000" style="width:46px;padding:2px 4px;" /><span>% 停尋寶</span></label><label class="rh-hint" style="display:flex;gap:3px;align-items:center;cursor:pointer;white-space:nowrap;font-size:11px;"><span>起算</span><input id="rh-base-disc" class="rh-num" type="number" min="0" max="5000" step="1" placeholder="0" style="width:40px;padding:2px 4px;" title="選填：進本起算基礎尋寶率%（預設 0）" /></label></div><div class="rh-row" style="gap:4px;white-space:nowrap;"><label class="rh-hint" style="display:flex;gap:4px;align-items:center;cursor:pointer;flex:1;white-space:nowrap;color:#FDE68A;" title="神器達 +N 前保持滿優先直衝，達到 +N 後降為 C 級全面讓位給四格道具（秘藥／祝福／料理／未達標採集藥水）；若同場僅剩已達標藥水或禁選神器仍會繼續升，不浪費寶箱"><input id="rh-cap-deity-on" class="rh-check" type="checkbox" /> 神器 ≥ + <input id="rh-cap-deity-max" class="rh-num" type="number" min="1" max="99" style="width:42px;padding:2px 4px;" /><span>停優先（達標全面讓位四格）</span></label></div></div></div></details>
      <details class="rh-fold" data-fold="deity_order"><summary class="rh-fold-sum"><span class="rh-fold-title">五格道具與神器順位</span><span class="rh-fold-meta" id="rh-fold-meta-deity-order">五格順位 · 神器前3名</span></summary><div class="rh-fold-body" style="gap:5px;"><div id="rh-item-cat-tabs" style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;"><button type="button" class="rh-btn rh-btn-sm rh-btn-primary" data-icat="藥水">藥水</button><button type="button" class="rh-btn rh-btn-sm" data-icat="秘藥">秘藥</button><button type="button" class="rh-btn rh-btn-sm" data-icat="祝福">祝福</button><button type="button" class="rh-btn rh-btn-sm" data-icat="料理">料理</button><button type="button" class="rh-btn rh-btn-sm" data-icat="神器">神器</button></div>
      <div id="rh-item-subpanel" style="display:flex;flex-direction:column;gap:5px;"><div class="rh-row"><span class="rh-hint">鎖定目標</span><select id="rh-item-target" class="rh-select"></select></div><div class="rh-row"><label class="rh-hint" style="display:flex;gap:5px;align-items:center;cursor:pointer;"><input id="rh-item-reroll" class="rh-check" type="checkbox" /> 未中前 </label><input id="rh-item-topn" class="rh-num" type="number" min="1" max="12" style="width:42px;" /><span class="rh-hint">名先重抽（全部／單卡重抽）</span></div>
      <div id="rh-item-order" style="display:flex;flex-direction:column;gap:4px;max-height:136px;overflow-y:auto;"></div><div class="rh-row"><div class="rh-hint" id="rh-item-lock" style="flex:1;"></div><button id="rh-item-unlock" class="rh-btn rh-btn-sm">解除鎖定</button></div></div>
      <div id="rh-deity-subpanel" style="display:none;flex-direction:column;gap:5px;"><div class="rh-row"><span class="rh-hint">鎖定目標</span><select id="rh-deity-target" class="rh-select"></select></div><div class="rh-row" style="gap:5px;"><span class="rh-hint" style="color:#FDE68A;font-weight:600;">目標神器門檻：前</span><input id="rh-deity-topn" class="rh-num" type="number" min="1" max="13" style="width:44px;" title="設定前幾名神器優先取得、升級與重抽（預設 3；內建高順位保護，低順位不會蓋掉高順位）" /><span class="rh-hint">名（預設 3）</span></div><label class="rh-hint" style="display:flex;gap:5px;align-items:center;cursor:pointer;" title="寶箱未出現目標前 N 名神器且場上無好卡時優先重抽"><input id="rh-deity-reroll" class="rh-check" type="checkbox" /> <span>未中前 <span id="rh-deity-topn-lbl-reroll">3</span> 名神器優先重抽</span> </label>
      <div id="rh-deity-order" style="display:flex;flex-direction:column;gap:4px;max-height:146px;overflow-y:auto;"></div><div class="rh-row"><div class="rh-hint" id="rh-deity-lock" style="flex:1;"></div><button id="rh-deity-unlock" class="rh-btn rh-btn-sm">解除鎖定</button></div></div></div></details></div>
      <div id="rh-panel-move" class="rh-tab-panel">
      <div class="rh-box"><div class="rh-row"><button id="rh-btn-move" class="rh-btn">走位：定點不動</button><button id="rh-btn-anchor" class="rh-btn rh-btn-sm" title="將角色目前所在位置設為中心原點 (0, 0)">設為中心</button></div><div class="rh-row"><span class="rh-hint" id="rh-move-info" style="flex:1;">半徑 180px</span><button id="rh-btn-r-down" class="rh-btn rh-btn-sm">-40</button><button id="rh-btn-r-up" class="rh-btn rh-btn-sm">+40</button></div><div class="rh-hint" id="rh-map-coord-info" style="font-size:11px;color:#93C5FD;">地圖中心：開局自動校準原點 (0, 0)</div></div>
      <details class="rh-fold" data-fold="move_obstacle"><summary class="rh-fold-sum"><span class="rh-fold-title">🧭 副本卡點記憶與 A* 繞石</span><span class="rh-fold-meta" id="rh-fold-meta-move-obs">開 · 等待進本</span></summary><div class="rh-fold-body"><label class="rh-hint" style="display:flex;gap:5px;align-items:center;cursor:pointer;color:#67E8F9;" title="自動按副本名稱記憶卡牆障礙座標（累計 2 次確認、踩過自動清除誤標），後續巡邏／撿寶／回中心／月夜貓躲鐘均自動啟用前瞻閃避與微型 A* 折線繞石"><input id="rh-move-obstacle-mem" class="rh-check" type="checkbox" /> 副本卡點自動記憶與 A* 提前繞石 </label><div class="rh-row" style="gap:4px;align-items:center;"><span class="rh-hint" id="rh-obstacle-mem-info" style="flex:1;font-size:10.5px;color:#67E8F9;">障礙記憶：等待進本讀取…</span><button id="rh-btn-clear-stage-obs" type="button" class="rh-btn rh-btn-sm" style="padding:2px 6px;font-size:10px;" title="清除目前副本的障礙座標記憶">清本圖</button><button id="rh-btn-clear-all-obs" type="button" class="rh-btn rh-btn-sm" style="padding:2px 6px;font-size:10px;" title="雙擊確認：清除所有副本的障礙記憶">清全部</button></div></div></details>
      <details class="rh-fold" data-fold="move_boss"><summary class="rh-fold-sum"><span class="rh-fold-title">🛡️ 打王紅圈閃避與躲鐘</span><span class="rh-fold-meta" id="rh-fold-meta-move-boss">紅圈開 · 躲鐘開</span></summary><div class="rh-fold-body"><label class="rh-hint" style="display:flex;gap:5px;align-items:center;cursor:pointer;color:#FCA5A5;" title="打王期間即時掃描 3D 地面紅色預警區：站安全空隙自動煞車定住不誤踩、腳下踩紅立刻短步閃離（需預設鏡頭角度，初次更新後請 F5 重整一次）"><input id="rh-move-boss-red-dodge" class="rh-check" type="checkbox" /> 打王地面紅圈自動閃避（安全區定住＋踩紅短步閃） </label><label class="rh-hint" style="display:flex;gap:5px;align-items:center;cursor:pointer;color:#FDE047;" title="斐揚洞穴 MVP 月夜貓專屬機制：一階『躲到鐘下』全速尋鐘站樁、二階『鐘被封印』限時20秒集中輸出、二階解封『鐘開啟了』立即回鐘站樁大收圈"><input id="rh-move-moonlight-dodge" class="rh-check" type="checkbox" /> 斐揚洞穴：月夜貓「躲到鐘下」4 階段智慧避難 </label></div></details>
      <details class="rh-fold" data-fold="move_camera"><summary class="rh-fold-sum"><span class="rh-fold-title">🔭 視野・對齊・撿取聯動</span><span class="rh-fold-meta" id="rh-fold-meta-move-cam">拉遠8格 · 撿取關</span></summary><div class="rh-fold-body"><label class="rh-hint" style="display:flex;gap:5px;align-items:center;cursor:pointer;color:#86EFAC;" title="進入關卡預設在地圖中心，開局自動將相對位移設為 (0,0) 並記錄地圖中心座標"><input id="rh-move-center-on-start" class="rh-check" type="checkbox" /> 進關卡自動對齊地圖中心點 (0, 0) </label><div class="rh-row" style="gap:4px;"><label class="rh-hint" style="display:flex;gap:5px;align-items:center;cursor:pointer;color:#38BDF8;" title="進入副本時自動以滑鼠滾輪向下捲動拉遠主畫面鏡頭，擴大顯示視野並提升紅圈／金鐘辨識範圍"><input id="rh-move-auto-zoom-cam" class="rh-check" type="checkbox" /> 進副本滾輪拉遠視野 </label><input id="rh-move-cam-zoom-steps" class="rh-num" type="number" min="1" max="20" style="width:40px;margin-left:auto;" title="進副本向下滾動滑鼠滾輪格數（建議 6~10 格）" /><span class="rh-hint">格</span><button id="rh-btn-cam-zoom-out" type="button" class="rh-btn rh-btn-sm" style="padding:2px 6px;font-size:10px;" title="立即向下滾動滑鼠滾輪拉遠畫面">🔭 拉遠</button></div><label class="rh-hint" style="display:flex;gap:5px;align-items:center;cursor:pointer;" title="依「撿取」分頁勾選項目與優先順序，在小地圖或畫面偵測到時優先前往撿取"><input id="rh-move-loot-chests" class="rh-check" type="checkbox" /> 依「撿取」分頁勾選項目優先前往撿取 </label><label class="rh-hint" style="display:flex;gap:5px;align-items:center;cursor:pointer;" title="撿完物品後，自動平滑走回地圖中心原點繼續巡邏"><input id="rh-move-return-center" class="rh-check" type="checkbox" /> 撿完後自動返回地圖中心繞行 </label></div></details>
      <details class="rh-fold" data-fold="move_tune"><summary class="rh-fold-sum"><span class="rh-fold-title">走位手感與步幅微調</span><span class="rh-fold-meta" id="rh-fold-meta-move">擬人自然 ｜ 650~1350ms / 停150~420ms</span></summary><div class="rh-fold-body"><div class="rh-row"><span class="rh-hint">模式</span><select id="rh-move-style" class="rh-select"><option value="human_natural">擬人自然（防偵測推薦）</option><option value="smooth_continuous">順暢巡航（含隨機微停）</option><option value="burst_pause">分段走停</option></select></div><div class="rh-row" style="gap:4px;"><span class="rh-hint">單步持續</span><input id="rh-move-step-min" class="rh-num" type="number" min="200" max="3000" style="width:54px;margin-left:auto;" title="單步隨機持續最短時間 (ms)" /><span class="rh-hint">~</span><input id="rh-move-step-max" class="rh-num" type="number" min="200" max="4000" style="width:54px;" title="單步隨機持續最長時間 (ms)" /><span class="rh-hint">ms</span></div><div class="rh-row" style="gap:4px;"><span class="rh-hint">偶發停頓</span><input id="rh-move-pause-min" class="rh-num" type="number" min="0" max="2000" style="width:54px;margin-left:auto;" title="偶發停頓最短時間 (ms)" /><span class="rh-hint">~</span><input id="rh-move-pause-max" class="rh-num" type="number" min="0" max="3000" style="width:54px;" title="偶發停頓最長時間 (ms)" /><span class="rh-hint">ms</span></div></div></details></div>
      <div id="rh-panel-loot" class="rh-tab-panel">
      <div class="rh-box" style="padding:6px 8px;gap:5px;"><label class="rh-hint" style="display:flex;gap:5px;align-items:center;cursor:pointer;color:#86EFAC;font-weight:600;"><input id="rh-loot-enabled" class="rh-check" type="checkbox" /> 啟用小地圖／畫面自動優先撿取（需開啟走位） </label><div class="rh-row" style="gap:5px;"><span class="rh-hint" id="rh-loot-scan-info" style="flex:1;font-size:10.5px;color:#93C5FD;">等待掃描小地圖標記…</span><button id="rh-btn-loot-zoom" type="button" class="rh-btn rh-btn-sm" title="手動點擊小地圖 + 放大一階並重掃">➕ 放大</button><button id="rh-btn-loot-scan" type="button" class="rh-btn rh-btn-sm">🔍 掃描</button></div></div>
      <details class="rh-fold" data-fold="loot_basic"><summary class="rh-fold-sum"><span class="rh-fold-title">回中心與小地圖放大</span><span class="rh-fold-meta" id="rh-fold-meta-loot-basic">回中心開 · 放大2次</span></summary><div class="rh-fold-body"><label class="rh-hint" style="display:flex;gap:5px;align-items:center;cursor:pointer;"><input id="rh-loot-return-center" class="rh-check" type="checkbox" /> 撿完後自動返回地圖中心繞行 </label><div class="rh-row" style="gap:5px;"><label class="rh-hint" style="display:flex;gap:5px;align-items:center;cursor:pointer;color:#93C5FD;" title="進入關卡時自動點擊小地圖 + 按鈕放大倍率，減少圖示重疊以提高辨識率"><input id="rh-loot-autozoom" class="rh-check" type="checkbox" /> 進關卡自動放大小地圖 </label><input id="rh-loot-zoom-clicks" class="rh-num" type="number" min="1" max="5" style="width:40px;margin-left:auto;" title="進關卡點擊 + 放大次數" /><span class="rh-hint">次</span></div></div></details>
      <details class="rh-fold" data-fold="magnet_smart"><summary class="rh-fold-sum"><span class="rh-fold-title">🧲 智慧磁鐵時間控管</span><span class="rh-fold-meta" id="rh-fold-meta-magnet">前2.5分不撿 ｜ 間隔3分 ｜ 距王≤3分衝刺</span></summary><div class="rh-fold-body" style="gap:4px;"><label class="rh-hint" style="display:flex;gap:5px;align-items:center;cursor:pointer;color:#86EFAC;" title="磁鐵稀有珍貴，智慧控管可設定遊戲前幾分鐘內不撿取磁鐵，累積足夠經驗寶石後再吸取"><input id="rh-magnet-smart-on" class="rh-check" type="checkbox" /> 啟用智慧磁鐵時間控管 </label><div class="rh-row" style="gap:4px;"><span class="rh-hint">前</span><input id="rh-magnet-first-min" class="rh-num" type="number" min="0" max="15" step="0.5" style="width:44px;" title="遊戲前幾分鐘內不撿取磁鐵" /><span class="rh-hint">分不撿 ｜ 間隔</span><input id="rh-magnet-interval-min" class="rh-num" type="number" min="0.5" max="10" step="0.5" style="width:44px;" /><span class="rh-hint">分</span></div><div class="rh-row" style="gap:4px;"><span class="rh-hint" title="依各關卡出最後王時間倒數，距最後王前 N 分鐘起解除冷卻限制，打王期間亦維持解除">尾盤衝刺（距最後王 ≤</span><input id="rh-magnet-end-min" class="rh-num" type="number" min="0" max="5" step="0.5" style="width:44px;" /><span class="rh-hint">分）解除限制</span></div></div></details>
      <details class="rh-fold" data-fold="loot_order"><summary class="rh-fold-sum"><span class="rh-fold-title">優先撿取物品與順位</span><span class="rh-fold-meta" id="rh-fold-meta-loot-order">磁鐵 ＞ 裝備</span></summary><div class="rh-fold-body"><div id="rh-loot-priority-list" style="display:flex;flex-direction:column;gap:3px;"></div></div></details></div>
      <div id="rh-panel-timer" class="rh-tab-panel">
      <div class="rh-box"><label class="rh-hint" style="display:flex;gap:6px;align-items:center;cursor:pointer;"><input id="rh-timer-enabled" class="rh-check" type="checkbox" /> 到達設定時間自動暫停並提醒 </label><div class="rh-hint" id="rh-clock-info" style="font-size:11px;color:#93C5FD;">遊戲時間：等待遊戲畫面…</div></div>
      <details class="rh-fold" data-fold="timer_opts"><summary class="rh-fold-sum"><span class="rh-fold-title">計時設定與暫停控制</span><span class="rh-fold-meta" id="rh-fold-meta-timer">10分0秒 ｜ ESC</span></summary><div class="rh-fold-body"><div class="rh-row"><input id="rh-timer-min" class="rh-num" type="number" min="0" max="999" /><span class="rh-hint">分</span><input id="rh-timer-sec" class="rh-num" type="number" min="0" max="59" /><span class="rh-hint">秒</span></div><label class="rh-hint" style="display:flex;gap:6px;align-items:center;cursor:pointer;"><input id="rh-pause-hidden" class="rh-check" type="checkbox" /> 切換背景時暫停提醒 </label><label class="rh-hint" style="display:flex;gap:6px;align-items:center;cursor:pointer;"><input id="rh-pause-game-esc" class="rh-check" type="checkbox" /> 計時／暫停時自動按實體 ESC 暫停遊戲 </label><div class="rh-row"><button id="rh-btn-test-sound" class="rh-btn rh-btn-sm">🔔 測試音</button><button id="rh-btn-resume" class="rh-btn rh-btn-primary rh-btn-sm">▶ 繼續</button></div></div></details></div>
      <div id="rh-panel-config" class="rh-tab-panel">
      <details class="rh-fold" data-fold="config_affix"><summary class="rh-fold-sum"><span class="rh-fold-title">技能詞條順位</span><span class="rh-fold-meta" id="rh-fold-meta-config">目標 ＞ 傷害 ＞ 冷卻縮減</span></summary><div class="rh-fold-body"><div style="display:flex;justify-content:space-between;align-items:center;"><span class="rh-hint" style="font-size:11px;">依上方順位匹配升級技能詞條</span><button id="rh-cfg-add-kw" class="rh-btn rh-btn-sm">+ 新增</button></div><div id="rh-cfg-kw-list" style="display:flex;flex-direction:column;gap:4px;max-height:170px;overflow-y:auto;"></div><button id="rh-cfg-save" class="rh-btn rh-btn-primary">儲存詞條順序</button></div></details></div>
      <div id="rh-panel-tools" class="rh-tab-panel">
      <details class="rh-fold" data-fold="tools_bridge"><summary class="rh-fold-sum"><span class="rh-fold-title">混合橋接連線與金鑰</span><span class="rh-fold-meta" id="rh-fold-meta-tools-bridge">未連線</span></summary><div class="rh-fold-body"><div class="rh-row"><span class="rh-hint" style="color:#F1F5F9;font-weight:600;">混合橋接網址</span><input id="rh-bridge-url" class="rh-select" type="text" style="font-family:monospace;font-size:11px;padding:3px 6px;" /></div><div class="rh-row"><span class="rh-hint" style="color:#F1F5F9;font-weight:600;">橋接金鑰</span><input id="rh-bridge-token" class="rh-select" type="password" autocomplete="off" placeholder="貼上 ro_bridge_token.txt 內容" style="font-family:monospace;font-size:11px;padding:3px 6px;" /></div><label class="rh-hint" style="display:flex;gap:5px;align-items:center;cursor:pointer;"><input id="rh-bridge-focus" class="rh-check" type="checkbox" /> 僅在瀏覽器為前景視窗時送出系統按鍵 </label><label class="rh-hint" style="display:flex;gap:5px;align-items:center;cursor:pointer;"><input id="rh-bridge-click" class="rh-check" type="checkbox" /> 允許橋接點擊按鈕（放逐 / 重抽 / 略過） </label></div></details>
      <details class="rh-fold" data-fold="tools_ui"><summary class="rh-fold-sum"><span class="rh-fold-title">面板透明度與進階診斷</span><span class="rh-fold-meta" id="rh-fold-meta-tools-ui">透明度 ${savedOpacity}%</span></summary><div class="rh-fold-body"><div class="rh-row" style="justify-content:space-between;"><span class="rh-hint" style="color:#F1F5F9;font-weight:600;">面板透明度</span><span class="rh-hint" id="rh-opacity-val" style="color:#FBBF24;font-weight:700;font-family:monospace;">${savedOpacity}%</span></div><input id="rh-opacity-slider" class="rh-range" type="range" min="30" max="100" step="5" value="${savedOpacity}" /><div class="rh-row"><button id="rh-btn-probe" class="rh-btn rh-btn-sm">🎯 探測卡片元件</button><button id="rh-btn-action" class="rh-btn rh-btn-sm">切換觸發方式</button></div></div></details></div></div>
      <div id="rh-status-bar">
      <div id="rh-status-badges"></div><div class="rh-hint" id="rh-live-monitor" style="font-size:10.5px;color:#CBD5E1;">局內監控：待機中</div>
      <div id="rh-current-op">目前：就緒</div></div>
      <details class="rh-fold" data-fold="logs"><summary class="rh-fold-sum"><span class="rh-fold-title">執行日誌</span><span class="rh-fold-meta" id="rh-fold-meta-log">純本地規則與 Closed Shadow DOM 已就緒。</span><button id="rh-btn-copy-log" type="button" class="rh-btn rh-btn-sm" style="padding:1px 6px;font-size:10px;margin-left:4px;color:#38BDF8;border-color:rgba(56,189,248,0.45);flex-shrink:0;" title="一鍵複製完整執行日誌與副本勝率統計摘要（最多 200 筆）">📋 複製</button></summary>
      <div id="rh-challenge-stats-bar" style="display:flex;align-items:center;gap:5px;padding:3px 7px;background:rgba(15,23,42,0.86);border-top:1px solid rgba(148,163,184,0.12);font-size:10.5px;"><span id="rh-challenge-stats-text" style="flex:1;color:#E2E8F0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">戰績：尚無紀錄（結算後自動統計）</span><button id="rh-btn-reset-challenge-stats" type="button" class="rh-btn rh-btn-sm" style="padding:1px 5px;font-size:9.5px;color:#94A3B8;flex-shrink:0;" title="歸零副本挑戰成功／失敗戰績統計">歸零</button></div>
      <div id="rh-log"><div class="rh-log-latest">純本地規則與 Closed Shadow DOM 已就緒。</div></div></details></div>
    `;
    hudRoot.appendChild(hud);
    (document.documentElement || document.body).appendChild(hudHost);
    // 拖曳與縮小/展開
    let dragging = false, draggedMoved = false, startX = 0, startY = 0, ox = 0, oy = 0;
    const beginDrag = (e) => {
      if (e.target.closest('#rh-toggle-min, #rh-toggle-folds')) return;
      dragging = true;
      draggedMoved = false;
      startX = e.clientX;
      startY = e.clientY;
      const r = hud.getBoundingClientRect();
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
    };
    $id('rh-header').addEventListener('mousedown', beginDrag);
    $id('rh-mini-dock').addEventListener('mousedown', beginDrag);
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > 4) draggedMoved = true;
      if (!draggedMoved) return;
      const maxLeft = Math.max(0, window.innerWidth - hud.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - hud.offsetHeight);
      hud.style.left = Math.max(0, Math.min(maxLeft, e.clientX - ox)) + 'px';
      hud.style.top = Math.max(0, Math.min(maxTop, e.clientY - oy)) + 'px';
      hud.style.right = 'auto';
    });
    window.addEventListener('mouseup', () => { dragging = false; });
    const setHudMinimized = (minimized) => {
      if (minimized) {
        if (!hud.classList.contains('rh-minimized')) {
          const r = hud.getBoundingClientRect();
          if (r.width > 120) {
            state.expandedHudPos = { left: Math.max(0, Math.round(r.left)), top: Math.max(0, Math.round(r.top)) };
          }
        }
        hud.classList.add('rh-minimized');
        // 縮小後自動貼齊畫面最左上角 (0, 0)
        hud.style.left = '0px';
        hud.style.top = '0px';
        hud.style.right = 'auto';
        updateStatusBar();
        updateMiniMagnetHud();
      } else {
        hud.classList.remove('rh-minimized');
        const targetL = state.expandedHudPos ? state.expandedHudPos.left : 16;
        const targetT = state.expandedHudPos ? state.expandedHudPos.top : 16;
        hud.style.left = Math.max(0, Math.min(targetL, window.innerWidth - 324)) + 'px';
        hud.style.top = Math.max(0, Math.min(targetT, window.innerHeight - 120)) + 'px';
        hud.style.right = 'auto';
        updateStatusBar();
        updateMoveHud(true);
      }
    };
    state.setHudMinimized = setHudMinimized;
    $id('rh-toggle-min').addEventListener('click', () => {
      setHudMinimized(true);
    });
    $id('rh-mini-btn').addEventListener('click', () => {
      if (draggedMoved) return;
      setHudMinimized(false);
    });
    $id('rh-mini-pause').addEventListener('click', () => {
      if (draggedMoved) return;
      ensureAudio();
      if (state.paused) resumeScript();
      else pauseScript('手動暫停');
    });
    $id('rh-mini-stopall').addEventListener('click', () => {
      if (draggedMoved) return;
      stopAllAutomation('小圖示一鍵停止');
    });
    $id('rh-mini-auto').addEventListener('click', () => {
      if (draggedMoved) return;
      $id('rh-btn-auto')?.click();
    });
    $id('rh-mini-farm').addEventListener('click', () => {
      if (draggedMoved) return;
      $id('rh-btn-farm')?.click();
    });
    $id('rh-mini-move').addEventListener('click', () => {
      if (draggedMoved) return;
      $id('rh-btn-move')?.click();
    });
    // 統一分頁切換
    const tabBtns = Array.from(hud.querySelectorAll('.rh-tab'));
    const panelIds = ['main', 'farm', 'move', 'loot', 'skill', 'deity', 'config', 'timer', 'tools'];
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-tab');
        tabBtns.forEach((b) => b.classList.toggle('rh-tab-active', b === btn));
        panelIds.forEach((id) => {
          const p = $id('rh-panel-' + id);
          if (p) p.classList.toggle('active', id === target);
        });
        if (target === 'config') renderConfigKeywordsList();
        if (target === 'skill' || target === 'deity') refreshJobPanels();
        if (target === 'farm') updateFarmHud();
        if (target === 'loot') renderLootPanel(true);
        updateRunInfo();
      });
    });
    // 詞條順序編輯（任何調整即時更新權重並寫入保存，避免未按儲存鈕時分數仍沿用舊權重）
    function syncPriorityKeywordsWeights(persist = true) {
      const list = CONFIG.strategy.priorityKeywords || [];
      list.forEach((k, i) => { k.weight = Math.max(10, 100 - i * 10); });
      if (persist) {
        GM_setValue('skillpick_overrides', { ...GM_getValue('skillpick_overrides', {}), strategy: CONFIG.strategy });
      }
    }
    function renderConfigKeywordsList() {
      const container = $id('rh-cfg-kw-list');
      if (!container) return;
      const kwList = CONFIG.strategy.priorityKeywords || [];
      container.innerHTML = '';
      kwList.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = 'rh-ord-row';
        row.innerHTML = `<span style="font-family:monospace;font-size:11px;font-weight:700;color:#F59E0B;width:24px;">#${idx + 1}</span>`;
        const sel = document.createElement('select');
        sel.className = 'rh-select';
        sel.style.cssText = 'padding:2px 4px;font-size:11px;';
        let matched = false;
        PRESET_AFFIXES.forEach((p) => {
          const o = document.createElement('option');
          o.value = p.keyword; o.textContent = p.label;
          if (p.keyword === item.keyword) { o.selected = true; matched = true; }
          sel.appendChild(o);
        });
        if (!matched && item.keyword) {
          const o = document.createElement('option');
          o.value = item.keyword; o.textContent = item.keyword; o.selected = true;
          sel.appendChild(o);
        }
        sel.addEventListener('change', () => {
          item.keyword = sel.value;
          syncPriorityKeywordsWeights(true);
        });
        row.appendChild(sel);
        const mk = (t, dis, fn, col) => {
          const b = document.createElement('button');
          b.className = 'rh-btn rh-btn-sm';
          b.style.cssText = `padding:2px 6px;font-size:10px;${col ? `color:${col};` : ''}${dis ? 'opacity:0.35;' : ''}`;
          b.textContent = t; b.disabled = dis; b.addEventListener('click', fn);
          return b;
        };
        row.appendChild(mk('▲', idx === 0, () => { [kwList[idx - 1], kwList[idx]] = [kwList[idx], kwList[idx - 1]]; syncPriorityKeywordsWeights(true); renderConfigKeywordsList(); }));
        row.appendChild(mk('▼', idx === kwList.length - 1, () => { [kwList[idx + 1], kwList[idx]] = [kwList[idx], kwList[idx + 1]]; syncPriorityKeywordsWeights(true); renderConfigKeywordsList(); }));
        row.appendChild(mk('✕', false, () => { kwList.splice(idx, 1); syncPriorityKeywordsWeights(true); renderConfigKeywordsList(); }, '#EF4444'));
        container.appendChild(row);
      });
    }
    $id('rh-cfg-add-kw').addEventListener('click', () => {
      const list = CONFIG.strategy.priorityKeywords || [];
      const next = PRESET_AFFIXES.find((p) => !list.some((k) => k.keyword === p.keyword))?.keyword || '新詞條';
      list.push({ keyword: next, weight: Math.max(10, 100 - list.length * 10) });
      CONFIG.strategy.priorityKeywords = list;
      syncPriorityKeywordsWeights(true);
      renderConfigKeywordsList();
    });
    $id('rh-cfg-save').addEventListener('click', () => {
      const list = CONFIG.strategy.priorityKeywords || [];
      syncPriorityKeywordsWeights(true);
      addLog(`已儲存詞條順位：${list.map((k, i) => `#${i + 1}${k.keyword}`).join(' > ')}`);
    });
    // 主控按鈕
    $id('rh-btn-auto').addEventListener('click', () => {
      ensureAudio();
      blurHudFocus();
      const nextAuto = !state.autoEnabled;
      setAutoEnabledState(nextAuto, { skipStatusUpdate: true });
      if (state.autoEnabled) {
        clearFarmDoneHalt();
        state.farmManualAutoOff = false;
      } else if (state.farmEnabled) {
        state.farmManualAutoOff = true;
      }
      state.lastDomSignature = '';
      state.pickingLockUntil = 0;
      addLog(
        state.autoEnabled
          ? '已啟動自動選擇'
          : state.farmEnabled
            ? '已暫停自動選擇（提醒：目前刷圖迴圈仍開啟中，手動關閉後不會自動補開）'
            : '已暫停自動選擇'
      );
      updateStatusBar();
      if (state.autoEnabled) safeRun(runDetectionCycle, false);
    });
    $id('rh-btn-autobuild')?.addEventListener('click', () => {
      state.autoBuildEnabled = !state.autoBuildEnabled;
      saveExtra({ autoBuildEnabled: state.autoBuildEnabled });
      const b = $id('rh-btn-autobuild');
      if (b) {
        b.textContent = state.autoBuildEnabled ? '放逐：開' : '放逐：關';
        b.className = state.autoBuildEnabled ? 'rh-btn rh-btn-active' : 'rh-btn';
      }
      updateStatusBar();
    });
    $id('rh-btn-pause-toggle')?.addEventListener('click', () => {
      ensureAudio();
      if (state.paused) resumeScript();
      else pauseScript('手動暫停');
    });
    $id('rh-btn-stop-all')?.addEventListener('click', () => stopAllAutomation('主控一鍵全部停止'));
    $id('rh-btn-newrun')?.addEventListener('click', () => resetRun('手動重置'));
    const copyLogBtn = $id('rh-btn-copy-log');
    if (copyLogBtn) {
      let copyResetTimer = null;
      copyLogBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const res = copyLogsToClipboard();
        if (copyResetTimer) clearTimeout(copyResetTimer);
        copyLogBtn.textContent = res.ok ? `✔ 已複製(${res.count})` : '複製失敗';
        copyLogBtn.style.color = res.ok ? '#86EFAC' : '#FCA5A5';
        copyLogBtn.style.borderColor = res.ok ? 'rgba(134,239,172,0.55)' : 'rgba(248,113,113,0.55)';
        copyResetTimer = setTimeout(() => {
          copyLogBtn.textContent = '📋 複製';
          copyLogBtn.style.color = '#38BDF8';
          copyLogBtn.style.borderColor = 'rgba(56,189,248,0.45)';
        }, 1600);
      });
    }
    updateChallengeStatsHud();
    $id('rh-btn-reset-challenge-stats')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      resetChallengeStats();
    });
    const exInit = getExtra();
    const upgradeModeSel = $id('rh-upgrade-mode');
    const bankThEl = $id('rh-bank-threshold');
    const bankThRow = $id('rh-bank-th-row');
    if (upgradeModeSel && bankThEl) {
      upgradeModeSel.value = exInit.upgradeMode || 'accumulate_auto';
      bankThEl.value = Math.max(1, Number(exInit.bankThreshold) || 1);
      const syncBankRow = () => {
        if (bankThRow) bankThRow.style.display = upgradeModeSel.value === 'accumulate_auto' ? 'flex' : 'none';
      };
      syncBankRow();
      upgradeModeSel.addEventListener('change', () => {
        saveExtra({ upgradeMode: upgradeModeSel.value, autoOpenBank: upgradeModeSel.value === 'accumulate_auto' });
        syncBankRow();
      });
      bankThEl.addEventListener('change', () => {
        const v = Math.max(1, Math.min(99, Number(bankThEl.value) || 1));
        bankThEl.value = v;
        saveExtra({ bankThreshold: v });
      });
    }
    const actionModeSel = $id('rh-action-mode');
    if (actionModeSel) {
      actionModeSel.value = normalizeActionMode(CONFIG.selectionActionMode);
      actionModeSel.addEventListener('change', () => {
        const next = normalizeActionMode(actionModeSel.value);
        actionModeSel.value = next;
        CONFIG.selectionActionMode = next;
        GM_setValue('skillpick_overrides', { ...GM_getValue('skillpick_overrides', {}), selectionActionMode: next });
        addLog(`輸入模式已切換為：${ACTION_LABELS[next] || next}`);
        updateBridgeHud();
        updateStatusBar();
        if (next === 'hybrid_bridge') checkBridgeHealth(false);
      });
    }
    const bridgePingBtn = $id('rh-btn-bridge-ping');
    if (bridgePingBtn) {
      bridgePingBtn.addEventListener('click', () => checkBridgeHealth(false));
    }
    const bridgeCalibBtn = $id('rh-btn-bridge-calib');
    if (bridgeCalibBtn) {
      bridgeCalibBtn.addEventListener('click', () => calibrateBridgeViewport(false));
    }
    // 刷圖與副本迴圈控制
    const farmStageSel = $id('rh-farm-stage');
    const farmStage2ListEl = $id('rh-farm-stage2-list');
    const farmDualOnEl = $id('rh-farm-dual-on');
    const farmDualPctEl = $id('rh-farm-dual-pct');
    STAGES_DATA.forEach((s) => {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = `${s.name} (${s.levels})`;
      farmStageSel.appendChild(o);
    });
    const renderFarmStage2Checkboxes = () => {
      if (!farmStage2ListEl) return;
      const curEx = getExtra();
      const primaryId = curEx.farmStageId || 'payon_cave';
      const selectedSet = new Set(Array.isArray(curEx.farmStage2Ids) ? curEx.farmStage2Ids : []);
      farmStage2ListEl.innerHTML = '';
      STAGES_DATA.forEach((s) => {
        const isPrimary = s.id === primaryId;
        const label = document.createElement('label');
        label.className = 'rh-hint';
        label.style.cssText = `display:flex;gap:4px;align-items:center;cursor:${isPrimary ? 'not-allowed' : 'pointer'};font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${isPrimary ? 'opacity:0.45;' : ''}`;
        label.title = isPrimary ? `${s.name} 目前為主關卡` : `勾選後納入副關卡隨機池：${s.name} (${s.levels})`;
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'rh-check';
        cb.disabled = isPrimary;
        cb.checked = !isPrimary && selectedSet.has(s.id);
        cb.addEventListener('change', () => {
          const latest = getExtra();
          const set = new Set(Array.isArray(latest.farmStage2Ids) ? latest.farmStage2Ids : []);
          if (cb.checked) set.add(s.id);
          else set.delete(s.id);
          const nextIds = Array.from(set);
          saveExtra({ farmStage2Ids: nextIds, farmStage2Id: nextIds[0] || '' });
          if (getExtra().farmDualEnabled) pickNextFarmStageId(true);
          updateFarmHud();
        });
        const span = document.createElement('span');
        span.textContent = isPrimary ? `${s.name}(主)` : s.name;
        span.style.cssText = 'overflow:hidden;text-overflow:ellipsis;';
        label.appendChild(cb);
        label.appendChild(span);
        farmStage2ListEl.appendChild(label);
      });
    };
    const farmModeSel = $id('rh-farm-mode');
    const farmLobbySel = $id('rh-farm-lobby-choice');
    const farmMaxEl = $id('rh-farm-max');
    const farmDelayEl = $id('rh-farm-delay');
    const farmAutoPlayEl = $id('rh-farm-autoplay');
    const autoHpDodgeEl = $id('rh-auto-hpdodge');
    const farmHpEl = $id('rh-farm-hp');
    farmModeSel.value = exInit.farmMode || 'lobby_target';
    if (farmLobbySel) farmLobbySel.value = exInit.farmLobbyChoice || 'solo';
    farmStageSel.value = exInit.farmStageId || 'payon_cave';
    renderFarmStage2Checkboxes();
    farmMaxEl.value = Number(exInit.farmMaxRuns) || 0;
    farmDelayEl.value = Number(exInit.farmSettleDelaySec) || 3;
    farmAutoPlayEl.checked = Boolean(exInit.farmAutoPlayLobby);
    if (autoHpDodgeEl) {
      autoHpDodgeEl.checked = exInit.autoHpDodge !== false;
      autoHpDodgeEl.addEventListener('change', () => saveExtra({ autoHpDodge: autoHpDodgeEl.checked }));
    }
    farmHpEl.value = Number(exInit.farmLowHpWarnPct) || 0;
    $id('rh-btn-farm').addEventListener('click', (e) => {
      ensureAudio();
      state.farmEnabled = !state.farmEnabled;
      GM_setValue('skillpick_farm_enabled', state.farmEnabled);
      state.farmLockUntil = 0;
      state.npcWalkAttempts = 0;
      state.npcClickRetryPhase = 0;
      state.festivalDetourStep = 0;
      resetStuckKeyWatchdog();
      if (!state.farmEnabled) {
        state.farmManualAutoOff = false;
        state.farmManualMoveOff = false;
        clearFarmRestState();
        stopNpcWalk();
        if (CONFIG.autoMoveConfig.mode !== 'radius_wander' && !state.lowHpEvading) releaseAllMoveKeys();
        addLog('已關閉自動刷圖迴圈');
      } else {
        state.farmManualAutoOff = false;
        state.farmManualMoveOff = false;
        clearFarmDoneHalt();
        clearFarmRestState();
        if (getExtra().farmRestEnabled && !state.farmSessionTargetRuns) {
          state.farmSessionTargetRuns = rollFarmSessionTargetRuns();
        }
        try { e.currentTarget?.blur?.(); } catch (_) {}
        // 啟動刷圖時自動連動開啟「走位」與「啟動自動選擇」
        if (CONFIG.autoMoveConfig.mode !== 'radius_wander') {
          CONFIG.autoMoveConfig.mode = 'radius_wander';
          GM_setValue('skillpick_overrides', { ...GM_getValue('skillpick_overrides', {}), autoMoveConfig: CONFIG.autoMoveConfig });
          if (!state.mapCenterCoord) {
            state.posX = 0;
            state.posY = 0;
          }
          scheduleNextMoveStep();
          updateMoveHud();
        }
        if (!state.autoEnabled) {
          setAutoEnabledState(true, { skipStatusUpdate: true });
          state.lastDomSignature = '';
          runDetectionCycle(false);
        }
        saveExtra({ upgradeMode: 'accumulate_auto' });
        syncAllHudControlsFromState();
        // 啟動刷圖迴圈後立即縮小面板，避免遮擋畫面按鍵與遊戲視野
        setHudMinimized(true);
        addLog('已開啟副本與自動刷圖迴圈（已自動啟動「走位」、「自動選擇」、「累積自動開卡」並縮小面板）');
      }
      updateFarmHud();
      if (state.farmEnabled) safeRun(runFarmingLoopStep);
    });
    farmModeSel.addEventListener('change', () => { saveExtra({ farmMode: farmModeSel.value }); updateFarmHud(); });
    if (farmLobbySel) farmLobbySel.addEventListener('change', () => { saveExtra({ farmLobbyChoice: farmLobbySel.value }); });
    farmStageSel.addEventListener('change', () => {
      saveExtra({ farmStageId: farmStageSel.value });
      state.activeFarmStageId = farmStageSel.value;
      renderFarmStage2Checkboxes();
      if (getExtra().farmDualEnabled) pickNextFarmStageId(false);
      updateFarmHud();
    });
    if (farmDualOnEl) {
      farmDualOnEl.checked = Boolean(exInit.farmDualEnabled);
      farmDualOnEl.addEventListener('change', () => {
        saveExtra({ farmDualEnabled: farmDualOnEl.checked });
        pickNextFarmStageId(farmDualOnEl.checked);
        updateFarmHud();
      });
    }
    if (farmDualPctEl) {
      farmDualPctEl.value = Math.max(5, Math.min(95, Number(exInit.farmDualChancePct) || 35));
      farmDualPctEl.addEventListener('change', () => {
        const v = Math.max(5, Math.min(95, Number(farmDualPctEl.value) || 35));
        farmDualPctEl.value = v;
        saveExtra({ farmDualChancePct: v });
        updateFarmHud();
      });
    }
    farmMaxEl.addEventListener('change', () => {
      const v = Math.max(0, Math.min(9999, Number(farmMaxEl.value) || 0));
      farmMaxEl.value = v;
      saveExtra({ farmMaxRuns: v });
      updateFarmHud();
    });
    farmDelayEl.addEventListener('change', () => {
      const v = Math.max(1, Math.min(30, Number(farmDelayEl.value) || 3));
      farmDelayEl.value = v;
      saveExtra({ farmSettleDelaySec: v });
    });
    const farmDwellOnEl = $id('rh-farm-dwell-on');
    const farmDwellMinEl = $id('rh-farm-dwell-min');
    const farmDwellMaxEl = $id('rh-farm-dwell-max');
    if (farmDwellOnEl) {
      farmDwellOnEl.checked = exInit.farmVillageDwellEnabled !== false;
      farmDwellOnEl.addEventListener('change', () => saveExtra({ farmVillageDwellEnabled: farmDwellOnEl.checked }));
    }
    if (farmDwellMinEl && farmDwellMaxEl) {
      farmDwellMinEl.value = Number(exInit.farmVillageDwellMinSec ?? 10);
      farmDwellMaxEl.value = Number(exInit.farmVillageDwellMaxSec ?? 60);
      const syncDwellRange = () => {
        const lo = Math.max(0, Math.min(300, Number(farmDwellMinEl.value) || 0));
        const hi = Math.max(lo, Math.min(300, Number(farmDwellMaxEl.value) || lo));
        farmDwellMinEl.value = lo;
        farmDwellMaxEl.value = hi;
        saveExtra({ farmVillageDwellMinSec: lo, farmVillageDwellMaxSec: hi });
      };
      farmDwellMinEl.addEventListener('change', syncDwellRange);
      farmDwellMaxEl.addEventListener('change', syncDwellRange);
    }
    const farmRestOnEl = $id('rh-farm-rest-on');
    const farmRestMinRunsEl = $id('rh-farm-rest-min-runs');
    const farmRestMaxRunsEl = $id('rh-farm-rest-max-runs');
    const farmRestMinMinEl = $id('rh-farm-rest-min-min');
    const farmRestMaxMinEl = $id('rh-farm-rest-max-min');
    const farmRestResumeBtn = $id('rh-farm-rest-resume');
    if (farmRestOnEl) {
      farmRestOnEl.checked = Boolean(exInit.farmRestEnabled);
      farmRestOnEl.addEventListener('change', () => {
        saveExtra({ farmRestEnabled: farmRestOnEl.checked });
        if (farmRestOnEl.checked) {
          state.farmSessionTargetRuns = rollFarmSessionTargetRuns();
        } else {
          clearFarmRestState();
        }
        updateFarmHud();
      });
    }
    if (farmRestMinRunsEl && farmRestMaxRunsEl) {
      farmRestMinRunsEl.value = Math.max(1, Number(exInit.farmRestMinRuns) || 4);
      farmRestMaxRunsEl.value = Math.max(Number(farmRestMinRunsEl.value), Number(exInit.farmRestMaxRuns) || 6);
      const syncRestRuns = () => {
        const lo = Math.max(1, Math.min(200, Number(farmRestMinRunsEl.value) || 4));
        const hi = Math.max(lo, Math.min(200, Number(farmRestMaxRunsEl.value) || lo));
        farmRestMinRunsEl.value = lo;
        farmRestMaxRunsEl.value = hi;
        saveExtra({ farmRestMinRuns: lo, farmRestMaxRuns: hi });
        state.farmSessionTargetRuns = rollFarmSessionTargetRuns();
        updateFarmHud();
      };
      farmRestMinRunsEl.addEventListener('change', syncRestRuns);
      farmRestMaxRunsEl.addEventListener('change', syncRestRuns);
    }
    if (farmRestMinMinEl && farmRestMaxMinEl) {
      farmRestMinMinEl.value = Math.max(1, Number(exInit.farmRestMinMin) || 25);
      farmRestMaxMinEl.value = Math.max(Number(farmRestMinMinEl.value), Number(exInit.farmRestMaxMin) || 55);
      const syncRestMins = () => {
        const lo = Math.max(1, Math.min(480, Number(farmRestMinMinEl.value) || 25));
        const hi = Math.max(lo, Math.min(480, Number(farmRestMaxMinEl.value) || lo));
        farmRestMinMinEl.value = lo;
        farmRestMaxMinEl.value = hi;
        saveExtra({ farmRestMinMin: lo, farmRestMaxMin: hi });
        updateFarmHud();
      };
      farmRestMinMinEl.addEventListener('change', syncRestMins);
      farmRestMaxMinEl.addEventListener('change', syncRestMins);
    }
    if (farmRestResumeBtn) {
      farmRestResumeBtn.addEventListener('click', () => resumeFromFarmRest(true));
    }
    const REST_SCHEDULE_PRESETS = {
      casual: { label: '🌿 日常休閒', minRuns: 3, maxRuns: 5, minMin: 35, maxMin: 70, maxTotal: 15 },
      active: { label: '🔥 積極農怪', minRuns: 4, maxRuns: 6, minMin: 25, maxMin: 55, maxTotal: 22 },
      short: { label: '⏱ 短時多段', minRuns: 2, maxRuns: 4, minMin: 20, maxMin: 45, maxTotal: 18 },
    };
    const applyRestSchedulePreset = (presetKey) => {
      const p = REST_SCHEDULE_PRESETS[presetKey];
      if (!p) return;
      saveExtra({
        farmRestEnabled: true,
        farmRestMinRuns: p.minRuns,
        farmRestMaxRuns: p.maxRuns,
        farmRestMinMin: p.minMin,
        farmRestMaxMin: p.maxMin,
        farmMaxRuns: p.maxTotal,
      });
      state.farmSessionTargetRuns = rollFarmSessionTargetRuns();
      if (farmRestOnEl) farmRestOnEl.checked = true;
      if (farmRestMinRunsEl) farmRestMinRunsEl.value = p.minRuns;
      if (farmRestMaxRunsEl) farmRestMaxRunsEl.value = p.maxRuns;
      if (farmRestMinMinEl) farmRestMinMinEl.value = p.minMin;
      if (farmRestMaxMinEl) farmRestMaxMinEl.value = p.maxMin;
      if (farmMaxEl) farmMaxEl.value = p.maxTotal;
      updateFarmHud();
      addLog(`[作息預設] 已套用【${p.label}】：每 ${p.minRuns}~${p.maxRuns} 場 F5 登出休 ${p.minMin}~${p.maxMin} 分，目標總場數 ${p.maxTotal} 場（本輪排定 ${state.farmSessionTargetRuns} 場）`);
    };
    $id('rh-rest-preset-casual')?.addEventListener('click', () => applyRestSchedulePreset('casual'));
    $id('rh-rest-preset-active')?.addEventListener('click', () => applyRestSchedulePreset('active'));
    $id('rh-rest-preset-short')?.addEventListener('click', () => applyRestSchedulePreset('short'));
    farmAutoPlayEl.addEventListener('change', () => saveExtra({ farmAutoPlayLobby: farmAutoPlayEl.checked }));
    farmHpEl.addEventListener('change', () => {
      const v = Math.max(0, Math.min(90, Number(farmHpEl.value) || 0));
      farmHpEl.value = v;
      saveExtra({ farmLowHpWarnPct: v });
    });
    // 全 23 職業選擇與技能/神祇順位同步
    const jobSel = $id('rh-job-select');
    const populateJobSelect = () => {
      const detected = detectDomJobName();
      const curOv = getExtra().jobOverride || 'auto';
      jobSel.innerHTML = '';
      const autoOpt = document.createElement('option');
      autoOpt.value = 'auto';
      autoOpt.textContent = `自動偵測 (目前：${detected})`;
      jobSel.appendChild(autoOpt);
      Object.keys(JOB_PRESETS).forEach((jName) => {
        const o = document.createElement('option');
        o.value = jName;
        const spec = JOB_PRESETS[jName];
        o.textContent = spec.base ? `${jName}（二轉・承自${spec.base}）` : `${jName}（一轉）`;
        jobSel.appendChild(o);
      });
      jobSel.value = curOv;
    };
    const refreshJobPanels = () => {
      populateJobSelect();
      const core = getCoreSkills();
      const allSk = getAllJobSkills();
      const coreBanner = $id('rh-core-banner');
      if (coreBanner) coreBanner.textContent = `🔒 固定核心 (${getActiveJobName()})：${core.join(' / ')}`;
      const acceptedList = getJobAcceptedFourthSkills();
      const acceptInput = $id('rh-accept-n');
      if (acceptInput) acceptInput.value = acceptedList.length;
      renderOrderList(
        $id('rh-skill-order'),
        getJobFourthOrder,
        setJobFourthOrder,
        allSk,
        {
          tagFor: (n) => (getJobAcceptedFourthSkills().includes(n) ? '✓ 接受' : '略過'),
          tagColor: (n) => (getJobAcceptedFourthSkills().includes(n) ? '#86EFAC' : '#CBD5E1'),
          tagBg: (n) => (getJobAcceptedFourthSkills().includes(n) ? 'rgba(20, 83, 45, 0.85)' : 'rgba(30, 41, 59, 0.9)'),
          tagBorder: (n) => (getJobAcceptedFourthSkills().includes(n) ? 'rgba(134, 239, 172, 0.5)' : 'rgba(148, 163, 184, 0.35)'),
          onTagClick: (n) => {
            const isNowAcc = toggleJobFourthSkillAccepted(n);
            const curInput = $id('rh-accept-n');
            if (curInput) curInput.value = getJobAcceptedFourthSkills().length;
            addLog(`第四招【${n}】已設為：${isNowAcc ? '✓ 接受' : '略過'}`);
          },
        }
      );
      // 渲染放逐順序清單（依剩餘放逐次數依序執行）
      const renderBanishOrderEditor = () => {
        const listEl = $id('rh-banish-order-list');
        const addSel = $id('rh-banish-add-sel');
        const job = getActiveJobName();
        const curList = getJobBanishOrder(job);
        if (listEl) {
          listEl.innerHTML = '';
          if (!curList.length) {
            listEl.innerHTML = '<div class="rh-hint" style="opacity:0.75;">尚未設定放逐目標（欄位滿後將直接觸發內建自動）</div>';
          }
          curList.forEach((key, idx) => {
            const row = document.createElement('div');
            row.className = 'rh-ord-row';
            const num = document.createElement('span');
            num.style.cssText = 'font-family:monospace;font-size:11px;font-weight:700;color:#FCA5A5;width:22px;';
            num.textContent = `#${idx + 1}`;
            const lbl = document.createElement('span');
            lbl.style.cssText = 'flex:1;font-size:11px;color:#F8FAFC;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            lbl.textContent = banishKeyLabel(key);
            const mkBtn = (t, dis, fn, col) => {
              const b = document.createElement('button');
              b.className = 'rh-btn rh-btn-sm';
              b.style.cssText = `padding:1px 6px;font-size:10px;${col ? `color:${col};` : ''}${dis ? 'opacity:0.35;' : ''}`;
              b.textContent = t;
              b.disabled = dis;
              b.addEventListener('click', fn);
              return b;
            };
            row.appendChild(num);
            row.appendChild(lbl);
            row.appendChild(mkBtn('▲', idx === 0, () => {
              const next = [...curList];
              [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
              setJobBanishOrder(next, job);
              renderBanishOrderEditor();
              updateRunInfo();
            }));
            row.appendChild(mkBtn('▼', idx === curList.length - 1, () => {
              const next = [...curList];
              [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
              setJobBanishOrder(next, job);
              renderBanishOrderEditor();
              updateRunInfo();
            }));
            row.appendChild(mkBtn('✕', false, () => {
              const next = curList.filter((_, i) => i !== idx);
              setJobBanishOrder(next, job);
              renderBanishOrderEditor();
              updateRunInfo();
            }, '#EF4444'));
            listEl.appendChild(row);
          });
        }
        if (addSel) {
          addSel.innerHTML = '';
          const candidates = [
            { value: '__FOURTH__', label: '第四個選擇技能' },
            { value: '__INNATE__', label: '屬性附加 (天生普攻)' },
            ...allSk.map((s) => ({ value: s, label: s })),
          ].filter((c) => !curList.includes(c.value));
          if (!candidates.length) {
            const o = document.createElement('option');
            o.value = '';
            o.textContent = '（無更多可加入項目）';
            addSel.appendChild(o);
          } else {
            candidates.forEach((c) => {
              const o = document.createElement('option');
              o.value = c.value;
              o.textContent = c.label;
              addSel.appendChild(o);
            });
          }
        }
      };
      renderBanishOrderEditor();
      // 技能分頁：Lv 20 技能神祇順位與目標下拉選單
      renderOrderList(
        $id('rh-skill-deity-order'),
        getJobSkillDeityOrder,
        setJobSkillDeityOrder,
        allSk,
        {
          tagFor: (n) => (getCoreSkills().includes(n) ? '核心' : '技能'),
          tagColor: (n) => (getCoreSkills().includes(n) ? '#86EFAC' : '#C4B5FD'),
        }
      );
      const skillDeityTargetSel = $id('rh-skill-deity-target');
      if (skillDeityTargetSel) {
        const curLockedSk = getJobLockedSkillDeity() || '';
        skillDeityTargetSel.innerHTML = '';
        const autoOpt = document.createElement('option');
        autoOpt.value = '';
        autoOpt.textContent = '自動（依下方技能順位四選一）';
        skillDeityTargetSel.appendChild(autoOpt);
        allSk.forEach((s) => {
          const o = document.createElement('option');
          o.value = s;
          o.textContent = s;
          skillDeityTargetSel.appendChild(o);
        });
        skillDeityTargetSel.value = curLockedSk;
      }
      // 道具分頁第 5 格：13 件神器順位與鎖定下拉選單
      renderOrderList(
        $id('rh-deity-order'),
        getJobDeityOrder,
        setJobDeityOrder,
        getAllArtifacts(),
        {
          tagFor: (n) => ARTIFACTS_BY_NAME[n]?.effect || '神器',
          tagColor: () => '#93C5FD',
        }
      );
      const deityTargetSel = $id('rh-deity-target');
      if (deityTargetSel) {
        const curLocked = getJobLockedDeity() || '';
        deityTargetSel.innerHTML = '';
        const autoOpt = document.createElement('option');
        autoOpt.value = '';
        autoOpt.textContent = '自動（依下方 13 神器順位前 N 名）';
        deityTargetSel.appendChild(autoOpt);
        ARTIFACTS_DATA.forEach((a) => {
          const o = document.createElement('option');
          o.value = a.name;
          o.textContent = `${a.name}（${a.effect}）`;
          deityTargetSel.appendChild(o);
        });
        deityTargetSel.value = curLocked;
      }
      // 同步 4 大道具分頁 + 第 5 格神器
      const activeCat = state.activeItemCat || '藥水';
      const itemSub = $id('rh-item-subpanel');
      const deitySub = $id('rh-deity-subpanel');
      const isArtifactTab = activeCat === '神器' || activeCat === '神祇';
      if (itemSub && deitySub) {
        itemSub.style.display = isArtifactTab ? 'none' : 'flex';
        deitySub.style.display = isArtifactTab ? 'flex' : 'none';
      }
      $qa('#rh-item-cat-tabs button[data-icat]').forEach((b) => {
        const isSel = b.getAttribute('data-icat') === (isArtifactTab ? '神器' : activeCat);
        b.className = isSel ? 'rh-btn rh-btn-sm rh-btn-primary' : 'rh-btn rh-btn-sm';
      });
      if (!isArtifactTab) {
        const catItems = RUN_ITEMS_BY_CAT[activeCat] || [];
        const allKeys = catItems.map((it) => it.key);
        const curEx = getExtra();
        const itemTargetSel = $id('rh-item-target');
        if (itemTargetSel) {
          const curLockedKey = getJobLockedItem(activeCat);
          itemTargetSel.innerHTML = '';
          const autoOpt = document.createElement('option');
          autoOpt.value = '';
          autoOpt.textContent = `自動（依下方 ${activeCat} 順位前 N 名）`;
          itemTargetSel.appendChild(autoOpt);
          catItems.forEach((it) => {
            const o = document.createElement('option');
            o.value = it.key;
            o.textContent = `${it.displayName}（${it.effect}）`;
            itemTargetSel.appendChild(o);
          });
          itemTargetSel.value = curLockedKey;
        }
        const itemRerollEl = $id('rh-item-reroll');
        const itemTopNEl = $id('rh-item-topn');
        if (itemRerollEl) itemRerollEl.checked = curEx.rerollItemByCat?.[activeCat] !== false;
        if (itemTopNEl) itemTopNEl.value = Math.max(1, Math.min(12, Number(curEx.itemTopNByCat?.[activeCat]) || 1));
        const itemOrderEl = $id('rh-item-order');
        if (itemOrderEl) {
          renderOrderList(
            itemOrderEl,
            () => getJobItemOrder(activeCat),
            (next) => setJobItemOrder(activeCat, next),
            allKeys,
            {
              labelFor: (k) => RUN_ITEMS_BY_KEY[k]?.displayName || k,
              tagFor: (k) => {
                const it = RUN_ITEMS_BY_KEY[k];
                if (!it) return '';
                if (it.meleeOnly) return '近戰限';
                if (it.dotOnly) return '需持續';
                return it.effect;
              },
              tagColor: (k) => {
                const it = RUN_ITEMS_BY_KEY[k];
                if (it?.meleeOnly) return '#FCA5A5';
                if (it?.dotOnly) return '#FDE68A';
                return '#93C5FD';
              },
            }
          );
        }
      }
      syncStatCapInputs();
      updateRunInfo();
    };
    state.activeItemCat = '藥水';
    $qa('#rh-item-cat-tabs button[data-icat]').forEach((b) => {
      b.addEventListener('click', () => {
        state.activeItemCat = b.getAttribute('data-icat') || '藥水';
        refreshJobPanels();
      });
    });
    const bindExtraCheck = (id, key, defTrue = true, onAfter = null) => {
      const el = $id(id);
      if (el) {
        el.checked = defTrue ? getExtra()[key] !== false : Boolean(getExtra()[key]);
        el.addEventListener('change', () => { saveExtra({ [key]: el.checked }); if (onAfter) onAfter(el.checked); });
      }
      return el;
    };
    const bindExtraNum = (id, key, min, max, defVal, onAfter = null) => {
      const el = $id(id);
      if (el) {
        el.value = Math.max(min, Math.min(max, Number(getExtra()[key]) || defVal));
        el.addEventListener('change', () => {
          const v = Math.max(min, Math.min(max, Number(el.value) || defVal));
          el.value = v;
          saveExtra({ [key]: v });
          if (onAfter) onAfter(v);
        });
      }
      return el;
    };
    const pickupFirstEl = $id('rh-chest-pickup-first');
    if (pickupFirstEl) {
      pickupFirstEl.checked = getExtra().prioritizePickupPotion !== false;
      pickupFirstEl.addEventListener('change', () => {
        saveExtra({ prioritizePickupPotion: pickupFirstEl.checked, aggressivePotionReroll: pickupFirstEl.checked });
        updateFoldSummaries();
      });
    }
    const chestRerollAllEl = $id('rh-chest-reroll-all');
    if (chestRerollAllEl) {
      chestRerollAllEl.checked = getExtra().chestRerollAllEarly !== false;
      chestRerollAllEl.addEventListener('change', () => {
        saveExtra({ chestRerollAllEarly: chestRerollAllEl.checked, chestSingleRerollItem: chestRerollAllEl.checked });
        updateFoldSummaries();
      });
    }
    const nativeAutoChestEl = bindExtraCheck('rh-use-native-auto-chest', 'useNativeAutoChest', false, (checked) => {
      updateFoldSummaries();
      addLog(
        checked
          ? '[寶箱設定] 已啟用：四格全滿、目標神祇定型且達上限後，交由遊戲內建「自動寶箱」（⚠️ 可能隨機覆蓋神祇）'
          : '[寶箱設定] 已停用「自動寶箱」：寶箱全程由本輔助規則精算選擇'
      );
    });
    const focusDeityEl = $id('rh-focus-deity');
    const focusPotionEl = $id('rh-focus-potion');
    const updateFocusConfig = () => {
      const fd = focusDeityEl ? focusDeityEl.checked : true;
      const fp = focusPotionEl ? focusPotionEl.checked : true;
      saveExtra({
        focusConfig: {
          enabled: fd || fp,
          focusDeity: fd,
          focusPotion: fp,
        },
      });
      updateFoldSummaries();
    };
    const fcInit = getExtra().focusConfig || {};
    [[focusDeityEl, fcInit.enabled !== false && fcInit.focusDeity !== false], [focusPotionEl, fcInit.enabled !== false && fcInit.focusPotion !== false]].forEach(([el, val]) => {
      if (el) { el.checked = val; el.addEventListener('change', updateFocusConfig); }
    });
    const applyPresetBtn = $id('rh-apply-farm-preset');
    if (applyPresetBtn) {
      applyPresetBtn.addEventListener('click', () => {
        const job = getActiveJobName();
        const curArtList = getJobDeityOrder().filter((d) => d !== '智慧神器');
        setJobDeityOrder(['智慧神器', ...curArtList]);
        const putFirst = (cat, key) => {
          const cur = getJobItemOrder(cat, job).filter((k) => k !== key);
          setJobItemOrder(cat, [key, ...cur], job);
        };
        putFirst('藥水', 'p_pickup');
        putFirst('秘藥', 'e_surprise');
        putFirst('祝福', 'b_cd');
        putFirst('料理', '12203');
        saveExtra({
          prioritizePickupPotion: true,
          aggressivePotionReroll: true,
          chestRerollAllEarly: true,
          chestSingleRerollItem: true,
          itemTopNByCat: { '藥水': 1, '秘藥': 1, '祝福': 1, '料理': 1 },
          rerollItemByCat: { '藥水': true, '秘藥': true, '祝福': true, '料理': true },
        });
        if (pickupFirstEl) pickupFirstEl.checked = true;
        if (chestRerollAllEl) chestRerollAllEl.checked = true;
        refreshJobPanels();
        addLog(`已套用【${job}】打寶冷卻推薦：智慧神器 / 採集藥水 / 驚奇秘藥(尋寶) / 冷卻祝福 / AGI料理`);
      });
    }
    bindExtraCheck('rh-auto-sample-cstats', 'autoSampleCStats', true);
    bindExtraCheck('rh-cap-pickup-on', 'capPickupEnabled', true, updateRunInfo);
    bindExtraNum('rh-cap-pickup-max', 'capPickupMax', 0, 500, 40, updateRunInfo);
    bindExtraCheck('rh-cap-disc-on', 'capDiscoveryEnabled', true, updateRunInfo);
    bindExtraNum('rh-cap-disc-max', 'capDiscoveryMax', 0, 5000, 300, updateRunInfo);
    bindExtraCheck('rh-cap-deity-on', 'capDeityEnabled', true, () => { updateRunInfo(); updateFoldSummaries(); });
    bindExtraNum('rh-cap-deity-max', 'capDeityMax', 1, 99, 10, () => { updateRunInfo(); updateFoldSummaries(); });
    [['rh-base-pickup', 'basePickupRange', 500], ['rh-base-disc', 'baseDiscoveryPct', 5000]].forEach(([id, key, max]) => {
      const el = $id(id);
      if (el) el.addEventListener('change', () => {
        const raw = el.value.trim();
        saveExtra({ [key]: raw === '' ? null : Math.max(0, Math.min(max, Number(raw) || 0)) });
        updateRunInfo();
      });
    });
    syncStatCapInputs();
    const itemTargetEl = $id('rh-item-target');
    if (itemTargetEl) {
      itemTargetEl.addEventListener('change', () => {
        const cat = state.activeItemCat;
        if (!cat || cat === '神器' || cat === '神祇') return;
        const val = itemTargetEl.value || '';
        setJobLockedItem(cat, val);
        updateRunInfo();
        const label = val && RUN_ITEMS_BY_KEY[val] ? RUN_ITEMS_BY_KEY[val].displayName : '';
        addLog(label ? `已鎖定 ${cat} 目標【${label}】` : `已切換 ${cat} 為自動順位`);
      });
    }
    const itemRerollEl = $id('rh-item-reroll');
    if (itemRerollEl) {
      itemRerollEl.addEventListener('change', () => {
        const cat = state.activeItemCat;
        if (!cat || cat === '神器' || cat === '神祇') return;
        const cur = { ...(getExtra().rerollItemByCat || {}) };
        cur[cat] = itemRerollEl.checked;
        saveExtra({ rerollItemByCat: cur });
      });
    }
    const itemTopNEl = $id('rh-item-topn');
    if (itemTopNEl) {
      itemTopNEl.addEventListener('change', () => {
        const cat = state.activeItemCat;
        if (!cat || cat === '神器' || cat === '神祇') return;
        const v = Math.max(1, Math.min(12, Number(itemTopNEl.value) || 1));
        itemTopNEl.value = v;
        const cur = { ...(getExtra().itemTopNByCat || {}) };
        cur[cat] = v;
        saveExtra({ itemTopNByCat: cur });
        addLog(`${cat} 空欄接受門檻已設為：前 ${v} 名（未命中先重抽）`);
      });
    }
    const itemUnlockEl = $id('rh-item-unlock');
    if (itemUnlockEl) {
      itemUnlockEl.addEventListener('click', () => {
        const cat = state.activeItemCat;
        if (!cat || cat === '神器' || cat === '神祇') return;
        setJobLockedItem(cat, '');
        if (state.run.items) state.run.items[cat] = null;
        if (itemTargetEl) itemTargetEl.value = '';
        saveRunSession();
        updateRunInfo();
        addLog(`已解除 ${cat} 目標鎖定與記錄`);
      });
    }
    jobSel.addEventListener('change', () => {
      saveExtra({ jobOverride: jobSel.value });
      refreshJobPanels();
      addLog(`職業配置已切換為：${getActiveJobName()}`);
    });
    refreshJobPanels();
    const acceptEl = $id('rh-accept-n');
    acceptEl.value = getJobAcceptedFourthSkills().length;
    acceptEl.addEventListener('change', () => {
      const order = getJobFourthOrder();
      const v = Math.max(0, Math.min(order.length || 20, Number(acceptEl.value) || 0));
      acceptEl.value = v;
      saveExtra({ acceptTopN: v });
      setJobAcceptedFourthSkills(order.slice(0, v));
      refreshJobPanels();
      addLog(`已批次設定前 ${v} 名技能為「✓ 接受」`);
    });
    const rerollEl = bindExtraCheck('rh-reroll-skill', 'rerollForSkill', false);
    const legCoreEl = bindExtraCheck('rh-prefer-legendary-core', 'preferLegendaryCore', true);
    const nativeAutoSkillEl = bindExtraCheck('rh-use-native-auto-skill', 'useNativeAutoAfterBanish', true, (checked) => {
      updateFoldSummaries();
      addLog(checked ? '[技能設定] 已啟用：放逐完且滿招後點擊遊戲內建「自動技能」（不影響寶箱與 Lv20 神祇）' : '[技能設定] 已停用「自動技能」：全程由本地詞條規則選技');
    });
    const skillDeityAutoEl = bindExtraCheck('rh-skill-deity-auto', 'autoPickSkillDeity', true, (checked) => {
      updateFoldSummaries();
      addLog(`[Lv20神祇] 達 Lv 20 自動點擊「!」並四選一：${checked ? '已開啟' : '已關閉（改手動）'}`);
    });
    const skillDeityTargetEl = $id('rh-skill-deity-target');
    skillDeityTargetEl?.addEventListener('change', () => {
      const val = skillDeityTargetEl.value || '';
      setJobLockedSkillDeity(val);
      updateRunInfo();
      updateFoldSummaries();
      addLog(val ? `[Lv20神祇] 已指定目標技能神祇【${val}】` : '[Lv20神祇] 已切回依技能順位自動四選一');
    });
    $id('rh-skill-deity-unlock')?.addEventListener('click', () => {
      setJobLockedSkillDeity('');
      if (skillDeityTargetEl) skillDeityTargetEl.value = '';
      updateRunInfo();
      updateFoldSummaries();
      addLog('[Lv20神祇] 已解除技能神祇指定');
    });
    $id('rh-banish-add-btn')?.addEventListener('click', () => {
      const val = $id('rh-banish-add-sel')?.value;
      if (!val) return;
      const job = getActiveJobName();
      const cur = getJobBanishOrder(job);
      if (!cur.includes(val)) {
        setJobBanishOrder([...cur, val], job);
        refreshJobPanels();
        updateRunInfo();
        addLog(`[放逐順序] 已加入 #${cur.length + 1}【${banishKeyLabel(val)}】`);
      }
    });
    $id('rh-banish-reset-btn')?.addEventListener('click', () => {
      const job = getActiveJobName();
      const def = getDefaultBanishOrderForJob(job);
      setJobBanishOrder(def, job);
      refreshJobPanels();
      updateRunInfo();
      addLog(`[放逐順序] 已重設為預設：${def.map(banishKeyLabel).join(' → ')}`);
    });
    const deityTargetEl = $id('rh-deity-target');
    deityTargetEl?.addEventListener('change', () => {
      const val = deityTargetEl.value || '';
      setJobLockedDeity(val);
      updateRunInfo();
      addLog(val ? `已指定並鎖定目標神器【${val}】（僅裝備此神器，不會被其他神器取代）` : '已切回依 13 神器順位自動選擇');
    });
    const syncDeityTopNLabels = (val) => {
      const n = Math.max(1, Math.min(13, Number(val ?? getExtra().deityTopN) || 3));
      ['rh-deity-topn-lbl-focus', 'rh-deity-topn-lbl-reroll'].forEach((id) => {
        const el = $id(id);
        if (el) el.textContent = String(n);
      });
    };
    const deityRerollEl = bindExtraCheck('rh-deity-reroll', 'rerollForDeity', true);
    const deityTopNEl = bindExtraNum('rh-deity-topn', 'deityTopN', 1, 13, 3, (v) => {
      syncDeityTopNLabels(v);
      updateFoldSummaries();
      addLog(`神器目標門檻已設為：前 ${v} 名`);
    });
    syncDeityTopNLabels(getExtra().deityTopN);
    $id('rh-deity-unlock').addEventListener('click', () => {
      state.run.deity = null;
      state.run.deityLevel = 0;
      setJobLockedDeity('');
      if (deityTargetEl) deityTargetEl.value = '';
      saveRunSession();
      updateRunInfo();
      addLog('已解除神器鎖定');
    });
    // 走位按鈕
    $id('rh-btn-move').addEventListener('click', (e) => {
      try { e.currentTarget?.blur?.(); } catch (_) {}
      const next = CONFIG.autoMoveConfig.mode === 'radius_wander' ? 'stationary' : 'radius_wander';
      CONFIG.autoMoveConfig.mode = next;
      GM_setValue('skillpick_overrides', { ...GM_getValue('skillpick_overrides', {}), autoMoveConfig: CONFIG.autoMoveConfig });
      if (next === 'radius_wander') {
        state.farmManualMoveOff = false;
        clearFarmDoneHalt();
        state.lowHpEvading = false;
        if (!state.mapCenterCoord) {
          syncStageCenterCoord({ allowRecord: true, logChange: true });
        }
        scheduleNextMoveStep();
      } else {
        if (state.farmEnabled) {
          state.farmManualMoveOff = true;
          addLog('已切換為定點不動（提醒：目前刷圖迴圈仍開啟中，手動關閉走位後不會自動補開）');
        }
        releaseAllMoveKeys();
      }
      updateMoveHud();
    });
    $id('rh-btn-anchor').addEventListener('click', (e) => {
      try { e.currentTarget?.blur?.(); } catch (_) {}
      state.posX = 0;
      state.posY = 0;
      state.navTarget = null;
      const coord = readMinimapCoord();
      if (coord) {
        state.mapCenterCoord = { x: coord.x, y: coord.y, stageName: coord.stageName, source: 'manual' };
        state.lastCoord = { x: coord.x, y: coord.y };
        saveRunSession();
        addLog(`已手動將【${coord.raw}】設為本場走位中心點 (0, 0)`);
      } else {
        addLog('已將目前位置設為走位中心點 (0, 0)');
      }
      updateMoveHud();
    });
    const adjR = (d) => {
      CONFIG.autoMoveConfig.radiusPx = Math.max(40, Math.min(600, (Number(CONFIG.autoMoveConfig.radiusPx) || 180) + d));
      GM_setValue('skillpick_overrides', { ...GM_getValue('skillpick_overrides', {}), autoMoveConfig: CONFIG.autoMoveConfig });
      updateMoveHud();
    };
    $id('rh-btn-r-down').addEventListener('click', () => adjR(-40));
    $id('rh-btn-r-up').addEventListener('click', () => adjR(40));
    const moveStyleSel = $id('rh-move-style');
    const moveStepMinEl = $id('rh-move-step-min');
    const moveStepMaxEl = $id('rh-move-step-max');
    const movePauseMinEl = $id('rh-move-pause-min');
    const movePauseMaxEl = $id('rh-move-pause-max');
    const centerOnStartEl = $id('rh-move-center-on-start');
    const autoZoomCamEl = $id('rh-move-auto-zoom-cam');
    const camZoomStepsEl = $id('rh-move-cam-zoom-steps');
    const camZoomOutBtn = $id('rh-btn-cam-zoom-out');
    const bossRedDodgeEl = $id('rh-move-boss-red-dodge');
    const moonlightDodgeEl = $id('rh-move-moonlight-dodge');
    const obstacleMemEl = $id('rh-move-obstacle-mem');
    const clearStageObsBtn = $id('rh-btn-clear-stage-obs');
    const clearAllObsBtn = $id('rh-btn-clear-all-obs');
    const lootChestsEl = $id('rh-move-loot-chests');
    const returnCenterEl = $id('rh-move-return-center');
    const lootPanelEnabledEl = $id('rh-loot-enabled');
    const lootPanelReturnEl = $id('rh-loot-return-center');
    const lootAutoZoomEl = $id('rh-loot-autozoom');
    const lootZoomClicksEl = $id('rh-loot-zoom-clicks');
    const lootZoomBtn = $id('rh-btn-loot-zoom');
    const lootPriorityListEl = $id('rh-loot-priority-list');
    const lootScanInfoEl = $id('rh-loot-scan-info');
    const lootScanBtn = $id('rh-btn-loot-scan');
    const magnetSmartOnEl = $id('rh-magnet-smart-on');
    const magnetFirstMinEl = $id('rh-magnet-first-min');
    const magnetIntervalMinEl = $id('rh-magnet-interval-min');
    const magnetEndMinEl = $id('rh-magnet-end-min');
    if (magnetSmartOnEl) {
      magnetSmartOnEl.addEventListener('change', () => {
        CONFIG.autoMoveConfig.smartMagnetEnabled = magnetSmartOnEl.checked;
        saveMoveCfg();
        addLog(`智慧磁鐵時間控管：${magnetSmartOnEl.checked ? '已開啟' : '已關閉'}`);
      });
    }
    if (magnetFirstMinEl) {
      ['keydown', 'keyup', 'keypress'].forEach((ev) => magnetFirstMinEl.addEventListener(ev, (e) => e.stopPropagation()));
      magnetFirstMinEl.addEventListener('change', () => {
        const v = Math.max(0, Math.min(15, Number(magnetFirstMinEl.value) || 1));
        magnetFirstMinEl.value = v;
        CONFIG.autoMoveConfig.magnetFirstMin = v;
        saveMoveCfg();
      });
    }
    if (magnetIntervalMinEl) {
      ['keydown', 'keyup', 'keypress'].forEach((ev) => magnetIntervalMinEl.addEventListener(ev, (e) => e.stopPropagation()));
      magnetIntervalMinEl.addEventListener('change', () => {
        const v = Math.max(0.5, Math.min(10, Number(magnetIntervalMinEl.value) || 3));
        magnetIntervalMinEl.value = v;
        CONFIG.autoMoveConfig.magnetIntervalMin = v;
        saveMoveCfg();
      });
    }
    if (magnetEndMinEl) {
      ['keydown', 'keyup', 'keypress'].forEach((ev) => magnetEndMinEl.addEventListener(ev, (e) => e.stopPropagation()));
      magnetEndMinEl.addEventListener('change', () => {
        const v = Math.max(0, Math.min(5, Number(magnetEndMinEl.value) || 3));
        magnetEndMinEl.value = v;
        CONFIG.autoMoveConfig.magnetEndRemainingMin = v;
        saveMoveCfg();
      });
    }
    const syncLootCheckboxes = () => {
      const enabled = Boolean(CONFIG.autoMoveConfig.autoLootChests);
      const retCenter = CONFIG.autoMoveConfig.returnToCenterAfterLoot !== false;
      const autoZoom = CONFIG.autoMoveConfig.autoZoomMinimapOnStart !== false;
      const zoomClicks = Math.max(1, Math.min(5, Number(CONFIG.autoMoveConfig.minimapZoomClicks) || 2));
      if (lootChestsEl) lootChestsEl.checked = enabled;
      if (lootPanelEnabledEl) lootPanelEnabledEl.checked = enabled;
      if (returnCenterEl) returnCenterEl.checked = retCenter;
      if (lootPanelReturnEl) lootPanelReturnEl.checked = retCenter;
      if (lootAutoZoomEl) lootAutoZoomEl.checked = autoZoom;
      if (lootZoomClicksEl) lootZoomClicksEl.value = zoomClicks;
      if (magnetSmartOnEl) magnetSmartOnEl.checked = CONFIG.autoMoveConfig.smartMagnetEnabled !== false;
      if (magnetFirstMinEl && hudRoot?.activeElement !== magnetFirstMinEl) {
        magnetFirstMinEl.value = Number(CONFIG.autoMoveConfig.magnetFirstMin ?? 1.0);
      }
      if (magnetIntervalMinEl && hudRoot?.activeElement !== magnetIntervalMinEl) {
        magnetIntervalMinEl.value = Number(CONFIG.autoMoveConfig.magnetIntervalMin ?? 3.0);
      }
      if (magnetEndMinEl && hudRoot?.activeElement !== magnetEndMinEl) {
        magnetEndMinEl.value = Number(CONFIG.autoMoveConfig.magnetEndRemainingMin ?? 3.0);
      }
    };
    const renderLootPanel = (forceScan = false) => {
      syncLootCheckboxes();
      if (lootPriorityListEl) {
        const order = getLootOrder();
        const prio = CONFIG.autoMoveConfig.lootPriorities || {};
        lootPriorityListEl.innerHTML = '';
        order.forEach((cat, idx) => {
          const meta = LOOT_CATEGORY_META[cat] || { label: cat, icon: '📦', desc: '' };
          const row = document.createElement('div');
          row.className = 'rh-ord-row';
          row.style.padding = '3px 6px';
          const chk = document.createElement('input');
          chk.type = 'checkbox';
          chk.className = 'rh-check';
          chk.checked = Boolean(prio[cat]);
          const lbl = document.createElement('label');
          lbl.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;cursor:pointer;';
          const titleSpan = document.createElement('span');
          titleSpan.style.cssText = `font-size:11.5px;font-weight:600;color:${chk.checked ? '#F8FAFC' : '#94A3B8'};`;
          titleSpan.textContent = `${meta.icon} ${meta.label}`;
          const descSpan = document.createElement('span');
          descSpan.style.cssText = 'font-size:10px;color:#94A3B8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
          descSpan.title = meta.desc;
          descSpan.textContent = meta.desc;
          lbl.appendChild(titleSpan);
          lbl.appendChild(descSpan);
          lbl.addEventListener('click', () => { chk.click(); });
          chk.addEventListener('change', () => {
            CONFIG.autoMoveConfig.lootPriorities = {
              ...(CONFIG.autoMoveConfig.lootPriorities || {}),
              [cat]: chk.checked,
            };
            titleSpan.style.color = chk.checked ? '#F8FAFC' : '#94A3B8';
            saveMoveCfg();
            addLog(`優先撿取【${meta.label}】：${chk.checked ? '已勾選' : '已取消勾選'}`);
          });
          const rankEl = document.createElement('span');
          rankEl.style.cssText = 'font-family:monospace;font-size:11px;font-weight:700;color:#F59E0B;width:22px;';
          rankEl.textContent = `#${idx + 1}`;
          const mkMoveBtn = (txt, disabled, dir) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'rh-btn rh-btn-sm';
            b.style.cssText = `padding:2px 6px;font-size:10px;${disabled ? 'opacity:0.35;' : ''}`;
            b.textContent = txt;
            b.disabled = disabled;
            b.addEventListener('click', () => {
              const next = [...order];
              [next[idx], next[idx + dir]] = [next[idx + dir], next[idx]];
              CONFIG.autoMoveConfig.lootOrder = next;
              saveMoveCfg();
              renderLootPanel(false);
            });
            return b;
          };
          row.appendChild(chk);
          row.appendChild(rankEl);
          row.appendChild(lbl);
          row.appendChild(mkMoveBtn('▲', idx === 0, -1));
          row.appendChild(mkMoveBtn('▼', idx === order.length - 1, 1));
          lootPriorityListEl.appendChild(row);
        });
      }
      if (lootScanInfoEl && (forceScan || $id('rh-panel-loot')?.classList.contains('active'))) {
        const scan = scanMinimapCanvasMarkers(null, forceScan);
        const allTargets = findMinimapChestsAndLoot({ includeDisabled: true, includeUnaffordable: true, forceFresh: false });
        const domCounts = { magnet: 0, equip: 0, chest: 0, supply: 0 };
        allTargets.forEach((t) => {
          if (t.source !== 'minimap_canvas_magnet' && t.source !== 'minimap_canvas_equip' && t.source !== 'minimap_canvas_chest' && t.source !== 'minimap_canvas_supply') {
            domCounts[t.category] = (domCounts[t.category] || 0) + 1;
          }
        });
        const mCnt = (scan.magnets?.length || 0) + domCounts.magnet;
        const eCnt = (scan.equips?.length || 0) + domCounts.equip;
        const cCnt = (scan.chests?.length || 0) + domCounts.chest;
        const zenyInfo = readZenyAndChestCost();
        const chestTag =
          zenyInfo.zeny !== null && zenyInfo.chestCost !== null
            ? `寶箱:${cCnt}(${zenyInfo.canAffordChest ? '夠金' : '缺金'} ${zenyInfo.zeny}/${zenyInfo.chestCost}z)`
            : `寶箱:${cCnt}`;
        const bCnt = scan.bosses?.length || 0;
        const pTag = scan.player ? '已定位箭頭' : '未見箭頭';
        lootScanInfoEl.textContent = `${pTag}｜磁鐵:${mCnt} 裝備:${eCnt} ${chestTag}${bCnt > 0 ? ` 王:${bCnt}` : ''}`;
      }
    };
    const saveMoveCfg = () => {
      GM_setValue('skillpick_overrides', { ...GM_getValue('skillpick_overrides', {}), autoMoveConfig: CONFIG.autoMoveConfig });
      updateMoveHud();
      if (CONFIG.autoMoveConfig.mode === 'radius_wander' || state.lowHpEvading) scheduleNextMoveStep();
    };
    if (centerOnStartEl) {
      centerOnStartEl.checked = CONFIG.autoMoveConfig.autoCenterOnStageStart !== false;
      centerOnStartEl.addEventListener('change', () => {
        CONFIG.autoMoveConfig.autoCenterOnStageStart = centerOnStartEl.checked;
        saveMoveCfg();
      });
    }
    if (autoZoomCamEl) {
      autoZoomCamEl.checked = CONFIG.autoMoveConfig.autoZoomCameraOnStart !== false;
      autoZoomCamEl.addEventListener('change', () => {
        CONFIG.autoMoveConfig.autoZoomCameraOnStart = autoZoomCamEl.checked;
        saveMoveCfg();
        addLog(`進副本自動滾輪拉遠視野：${autoZoomCamEl.checked ? '已開啟' : '已關閉'}`);
      });
    }
    if (camZoomStepsEl) {
      ['keydown', 'keyup', 'keypress'].forEach((ev) => camZoomStepsEl.addEventListener(ev, (e) => e.stopPropagation()));
      camZoomStepsEl.value = Math.max(1, Math.min(20, Number(CONFIG.autoMoveConfig.cameraZoomOutSteps) || 8));
      camZoomStepsEl.addEventListener('change', () => {
        const v = Math.max(1, Math.min(20, Number(camZoomStepsEl.value) || 8));
        camZoomStepsEl.value = v;
        CONFIG.autoMoveConfig.cameraZoomOutSteps = v;
        saveMoveCfg();
      });
    }
    if (camZoomOutBtn) {
      camZoomOutBtn.addEventListener('click', () => {
        const steps = Math.max(1, Math.min(20, Number(CONFIG.autoMoveConfig.cameraZoomOutSteps) || 8));
        if (!triggerCameraZoomOut(steps, '手動拉遠主畫面視野')) {
          addLog('[視野拉遠] 未找到遊戲主畫面畫布或正在執行中');
        }
      });
    }
    if (bossRedDodgeEl) {
      bossRedDodgeEl.checked = CONFIG.autoMoveConfig.bossRedDodgeEnabled !== false;
      bossRedDodgeEl.addEventListener('change', () => {
        CONFIG.autoMoveConfig.bossRedDodgeEnabled = bossRedDodgeEl.checked;
        if (!bossRedDodgeEl.checked) {
          state.bossRedDodgeState = null;
          state.bossRedFootStreak = 0;
          if (state.navTarget?.type === 'boss_red_evade' || state.navTarget?.type === 'boss_red_hold') {
            state.navTarget = null;
          }
        }
        saveMoveCfg();
        addLog(`打王地面紅圈自動閃避：${bossRedDodgeEl.checked ? '已開啟（安全區定住＋踩紅短步閃）' : '已關閉（僅維持小地圖控距風箏）'}`);
      });
    }
    if (moonlightDodgeEl) {
      moonlightDodgeEl.checked = CONFIG.autoMoveConfig.moonlightBellDodgeEnabled !== false;
      moonlightDodgeEl.addEventListener('change', () => {
        CONFIG.autoMoveConfig.moonlightBellDodgeEnabled = moonlightDodgeEl.checked;
        if (!moonlightDodgeEl.checked && state.moonlightState) {
          state.moonlightState.active = false;
          state.moonlightState.phase = 'idle';
        }
        saveMoveCfg();
        addLog(`斐揚洞穴月夜貓躲鐘機制：${moonlightDodgeEl.checked ? '已開啟（4 階段智慧避難）' : '已關閉'}`);
      });
    }
    if (obstacleMemEl) {
      obstacleMemEl.checked = CONFIG.autoMoveConfig.obstacleMemoryEnabled !== false;
      obstacleMemEl.addEventListener('change', () => {
        CONFIG.autoMoveConfig.obstacleMemoryEnabled = obstacleMemEl.checked;
        state.obstacleRuntime.astarCache = null;
        saveMoveCfg();
        updateMoveHud(true);
        addLog(`副本障礙記憶與 A* 繞石：${obstacleMemEl.checked ? '已開啟（自動學習並提前繞開固定障礙）' : '已關閉'}`);
      });
    }
    if (clearStageObsBtn) {
      clearStageObsBtn.addEventListener('click', () => {
        const sKey = getObstacleStageKey();
        if (!sKey) {
          addLog('[障礙記憶] 目前不在副本中，無法判定要清除的副本名稱');
          return;
        }
        const ok = clearStageObstacleMemory(sKey);
        updateMoveHud(true);
        addLog(ok ? `[障礙記憶] 已清除【${sKey}】的卡點障礙記憶，後續將重新自動學習` : `[障礙記憶] 【${sKey}】目前沒有已記錄的障礙點`);
      });
    }
    let pendingClearAllObsTimer = null;
    if (clearAllObsBtn) {
      clearAllObsBtn.addEventListener('click', () => {
        if (clearAllObsBtn.dataset.confirm !== '1') {
          clearAllObsBtn.dataset.confirm = '1';
          clearAllObsBtn.textContent = '確認清除?';
          if (pendingClearAllObsTimer) clearTimeout(pendingClearAllObsTimer);
          pendingClearAllObsTimer = setTimeout(() => {
            clearAllObsBtn.dataset.confirm = '0';
            clearAllObsBtn.textContent = '清全部';
          }, 3000);
          return;
        }
        if (pendingClearAllObsTimer) clearTimeout(pendingClearAllObsTimer);
        clearAllObsBtn.dataset.confirm = '0';
        clearAllObsBtn.textContent = '清全部';
        clearAllObstacleMemory();
        updateMoveHud(true);
        addLog('[障礙記憶] 已清除所有副本的卡點障礙記憶');
      });
    }
    const handleToggleAutoLoot = (checked) => {
      CONFIG.autoMoveConfig.autoLootChests = Boolean(checked);
      syncLootCheckboxes();
      saveMoveCfg();
      const enabledNames = getLootOrder()
        .filter((k) => isLootCategoryEnabled(k))
        .map((k) => LOOT_CATEGORY_META[k]?.label || k);
      addLog(
        CONFIG.autoMoveConfig.autoLootChests
          ? `已開啟優先撿取（目前勾選：${enabledNames.join(' ＞ ') || '無'}）`
          : '已關閉優先撿取'
      );
    };
    const handleToggleReturnCenter = (checked) => {
      CONFIG.autoMoveConfig.returnToCenterAfterLoot = Boolean(checked);
      syncLootCheckboxes();
      saveMoveCfg();
    };
    if (lootChestsEl) lootChestsEl.addEventListener('change', () => handleToggleAutoLoot(lootChestsEl.checked));
    if (lootPanelEnabledEl) lootPanelEnabledEl.addEventListener('change', () => handleToggleAutoLoot(lootPanelEnabledEl.checked));
    if (returnCenterEl) returnCenterEl.addEventListener('change', () => handleToggleReturnCenter(returnCenterEl.checked));
    if (lootPanelReturnEl) lootPanelReturnEl.addEventListener('change', () => handleToggleReturnCenter(lootPanelReturnEl.checked));
    if (lootAutoZoomEl) {
      lootAutoZoomEl.addEventListener('change', () => {
        CONFIG.autoMoveConfig.autoZoomMinimapOnStart = lootAutoZoomEl.checked;
        saveMoveCfg();
        addLog(`進關卡自動放大小地圖：${lootAutoZoomEl.checked ? '已開啟' : '已關閉'}`);
      });
    }
    if (lootZoomClicksEl) {
      lootZoomClicksEl.addEventListener('change', () => {
        const v = Math.max(1, Math.min(5, Number(lootZoomClicksEl.value) || 2));
        lootZoomClicksEl.value = v;
        CONFIG.autoMoveConfig.minimapZoomClicks = v;
        saveMoveCfg();
      });
    }
    if (lootZoomBtn) {
      lootZoomBtn.addEventListener('click', () => {
        if (!triggerMinimapZoomIn(1, '手動放大小地圖')) {
          addLog('[小地圖] 未找到可用的小地圖 + 放大按鈕（需在關卡戰鬥畫面中）');
        }
      });
    }
    if (lootScanBtn) lootScanBtn.addEventListener('click', () => renderLootPanel(true));
    renderLootPanel(false);
    const syncMoveRangeInputs = () => {
      const t = getMoveTimingRanges(CONFIG.autoMoveConfig);
      if (moveStepMinEl) moveStepMinEl.value = t.stepMin;
      if (moveStepMaxEl) moveStepMaxEl.value = t.stepMax;
      if (movePauseMinEl) movePauseMinEl.value = t.pauseMin;
      if (movePauseMaxEl) movePauseMaxEl.value = t.pauseMax;
    };
    if (moveStyleSel && moveStepMinEl && moveStepMaxEl && movePauseMinEl && movePauseMaxEl) {
      moveStyleSel.value = CONFIG.autoMoveConfig.style || 'human_natural';
      syncMoveRangeInputs();
      moveStyleSel.addEventListener('change', () => {
        CONFIG.autoMoveConfig.style = moveStyleSel.value;
        if (moveStyleSel.value === 'human_natural') {
          CONFIG.autoMoveConfig.stepDurationMinMs = 650;
          CONFIG.autoMoveConfig.stepDurationMaxMs = 1350;
          CONFIG.autoMoveConfig.pauseBetweenStepsMinMs = 150;
          CONFIG.autoMoveConfig.pauseBetweenStepsMaxMs = 420;
        } else if (moveStyleSel.value === 'smooth_continuous') {
          CONFIG.autoMoveConfig.stepDurationMinMs = 480;
          CONFIG.autoMoveConfig.stepDurationMaxMs = 980;
          CONFIG.autoMoveConfig.pauseBetweenStepsMinMs = 80;
          CONFIG.autoMoveConfig.pauseBetweenStepsMaxMs = 220;
        } else {
          CONFIG.autoMoveConfig.stepDurationMinMs = 360;
          CONFIG.autoMoveConfig.stepDurationMaxMs = 720;
          CONFIG.autoMoveConfig.pauseBetweenStepsMinMs = 160;
          CONFIG.autoMoveConfig.pauseBetweenStepsMaxMs = 360;
        }
        CONFIG.autoMoveConfig.stepDurationMs = Math.round((CONFIG.autoMoveConfig.stepDurationMinMs + CONFIG.autoMoveConfig.stepDurationMaxMs) / 2);
        CONFIG.autoMoveConfig.pauseBetweenStepsMs = Math.round((CONFIG.autoMoveConfig.pauseBetweenStepsMinMs + CONFIG.autoMoveConfig.pauseBetweenStepsMaxMs) / 2);
        syncMoveRangeInputs();
        saveMoveCfg();
      });
      const onStepRangeChange = (edited) => {
        let lo = Math.max(200, Math.min(3000, Math.round(Number(moveStepMinEl.value) || 650)));
        let hi = Math.max(200, Math.min(4000, Math.round(Number(moveStepMaxEl.value) || 1350)));
        if (edited === 'min' && lo > hi) hi = lo;
        if (edited === 'max' && hi < lo) lo = hi;
        CONFIG.autoMoveConfig.stepDurationMinMs = lo;
        CONFIG.autoMoveConfig.stepDurationMaxMs = hi;
        CONFIG.autoMoveConfig.stepDurationMs = Math.round((lo + hi) / 2);
        syncMoveRangeInputs();
        saveMoveCfg();
      };
      const onPauseRangeChange = (edited) => {
        let lo = Math.max(0, Math.min(2000, Math.round(Number(movePauseMinEl.value) || 0)));
        let hi = Math.max(0, Math.min(3000, Math.round(Number(movePauseMaxEl.value) || 0)));
        if (edited === 'min' && lo > hi) hi = lo;
        if (edited === 'max' && hi < lo) lo = hi;
        CONFIG.autoMoveConfig.pauseBetweenStepsMinMs = lo;
        CONFIG.autoMoveConfig.pauseBetweenStepsMaxMs = hi;
        CONFIG.autoMoveConfig.pauseBetweenStepsMs = Math.round((lo + hi) / 2);
        syncMoveRangeInputs();
        saveMoveCfg();
      };
      moveStepMinEl.addEventListener('change', () => onStepRangeChange('min'));
      moveStepMaxEl.addEventListener('change', () => onStepRangeChange('max'));
      movePauseMinEl.addEventListener('change', () => onPauseRangeChange('min'));
      movePauseMaxEl.addEventListener('change', () => onPauseRangeChange('max'));
    }
    // 計時按鈕
    const ex = getExtra();
    const enEl = $id('rh-timer-enabled');
    const minEl = $id('rh-timer-min');
    const secEl = $id('rh-timer-sec');
    const hidEl = $id('rh-pause-hidden');
    const escEl = $id('rh-pause-game-esc');
    enEl.checked = Boolean(ex.timerEnabled);
    minEl.value = ex.timerMin;
    secEl.value = ex.timerSec;
    hidEl.checked = Boolean(ex.pauseOnHidden);
    if (escEl) {
      escEl.checked = ex.autoPauseGameOnStop !== false;
      escEl.addEventListener('change', () => saveExtra({ autoPauseGameOnStop: escEl.checked }));
    }
    enEl.addEventListener('change', () => { ensureAudio(); saveExtra({ timerEnabled: enEl.checked }); state.timerTriggered = false; });
    const saveTime = () => {
      minEl.value = Math.max(0, Math.min(999, Number(minEl.value) || 0));
      secEl.value = Math.max(0, Math.min(59, Number(secEl.value) || 0));
      saveExtra({ timerMin: Number(minEl.value), timerSec: Number(secEl.value) });
      state.timerTriggered = false;
    };
    minEl.addEventListener('change', saveTime);
    secEl.addEventListener('change', saveTime);
    hidEl.addEventListener('change', () => saveExtra({ pauseOnHidden: hidEl.checked }));
    $id('rh-btn-test-sound').addEventListener('click', () => { ensureAudio(); playBeeps(4); });
    $id('rh-btn-resume').addEventListener('click', resumeScript);
    // 工具按鈕
    $id('rh-btn-probe').addEventListener('click', () => startInteractiveProbe('card', 'cardSelector', '卡片元件'));
    $id('rh-btn-action').addEventListener('click', () => {
      const order = ['hybrid_bridge', 'advisor_only'];
      const curIdx = order.indexOf(CONFIG.selectionActionMode);
      const next = order[(curIdx >= 0 ? curIdx + 1 : 0) % order.length];
      CONFIG.selectionActionMode = next;
      GM_setValue('skillpick_overrides', { ...GM_getValue('skillpick_overrides', {}), selectionActionMode: next });
      addLog(`觸發方式切換為：${ACTION_LABELS[next] || next}`);
      updateBridgeHud();
      updateStatusBar();
      if (next === 'hybrid_bridge') checkBridgeHealth(false);
    });
    const bridgeUrlInput = $id('rh-bridge-url');
    const bridgeTokenInput = $id('rh-bridge-token');
    if (bridgeTokenInput) {
      bridgeTokenInput.value = getBridgeToken();
      bridgeTokenInput.addEventListener('change', () => {
        const clean = (bridgeTokenInput.value || '').trim();
        bridgeTokenInput.value = clean;
        saveExtra({ bridgeToken: clean });
        addLog(clean ? '已更新橋接金鑰' : '已清除橋接金鑰');
        checkBridgeHealth(false);
      });
    }
    if (bridgeUrlInput) {
      bridgeUrlInput.value = getBridgeUrl();
      bridgeUrlInput.addEventListener('change', () => {
        const clean = (bridgeUrlInput.value || '').trim().replace(/\/+$/, '') || 'http://127.0.0.1:17325';
        bridgeUrlInput.value = clean;
        saveExtra({ bridgeUrl: clean });
        checkBridgeHealth(false);
      });
    }
    bindExtraCheck('rh-bridge-focus', 'bridgeRequireFocus', true);
    bindExtraCheck('rh-bridge-click', 'bridgeAllowClick', true);
    const opacitySlider = $id('rh-opacity-slider');
    const opacityVal = $id('rh-opacity-val');
    if (opacitySlider && opacityVal) {
      opacitySlider.addEventListener('input', () => {
        const val = Math.max(30, Math.min(100, Number(opacitySlider.value) || 95));
        hud.style.opacity = (val / 100).toFixed(2);
        opacityVal.textContent = val + '%';
        GM_setValue('skillpick_hud_opacity', val);
      });
    }
    // === 參數設定檔（使用者自訂儲存與一鍵套用：如「刷寶」「傷害」） ===
    const USER_PRESETS_KEY = 'skillpick_user_presets';
    const ACTIVE_USER_PRESET_KEY = 'skillpick_active_user_preset_id';
    const cloneJson = (v) => JSON.parse(JSON.stringify(v));
    const loadUserPresets = () => {
      const raw = GM_getValue(USER_PRESETS_KEY, []);
      return Array.isArray(raw) ? raw.filter((p) => p && p.id && p.name && p.snapshot) : [];
    };
    const saveUserPresets = (list) => GM_setValue(USER_PRESETS_KEY, list);
    const captureCurrentSnapshot = () => {
      const curEx = cloneJson(getExtra());
      delete curEx.stageCenterMap;
      delete curEx.stageObstacleMap;
      delete curEx.bridgeUrl;
      delete curEx.bridgeToken;
      delete curEx.bridgeRequireFocus;
      delete curEx.bridgeAllowClick;
      return {
        selectionActionMode: normalizeActionMode(CONFIG.selectionActionMode),
        autoMoveConfig: cloneJson(CONFIG.autoMoveConfig),
        strategy: cloneJson(CONFIG.strategy),
        extra: curEx,
      };
    };
    const syncAllHudControlsFromState = () => {
      const curEx = getExtra();
      state.autoBuildEnabled = curEx.autoBuildEnabled !== false;
      const abBtn = $id('rh-btn-autobuild');
      if (abBtn) {
        abBtn.textContent = state.autoBuildEnabled ? '放逐：開' : '放逐：關';
        abBtn.className = state.autoBuildEnabled ? 'rh-btn rh-btn-active' : 'rh-btn';
      }
      if (upgradeModeSel && bankThEl) {
        upgradeModeSel.value = curEx.upgradeMode || 'accumulate_auto';
        bankThEl.value = Math.max(1, Number(curEx.bankThreshold) || 1);
        if (bankThRow) bankThRow.style.display = upgradeModeSel.value === 'accumulate_auto' ? 'flex' : 'none';
      }
      if (actionModeSel) actionModeSel.value = normalizeActionMode(CONFIG.selectionActionMode);
      if (farmModeSel) farmModeSel.value = curEx.farmMode || 'lobby_target';
      if (farmLobbySel) farmLobbySel.value = curEx.farmLobbyChoice || 'solo';
      if (farmStageSel) farmStageSel.value = curEx.farmStageId || 'payon_cave';
      if (farmDualOnEl) farmDualOnEl.checked = Boolean(curEx.farmDualEnabled);
      renderFarmStage2Checkboxes();
      if (farmDualPctEl) farmDualPctEl.value = Math.max(5, Math.min(95, Number(curEx.farmDualChancePct) || 35));
      if (farmMaxEl) farmMaxEl.value = Number(curEx.farmMaxRuns) || 0;
      if (farmDelayEl) farmDelayEl.value = Number(curEx.farmSettleDelaySec) || 3;
      if (farmDwellOnEl) farmDwellOnEl.checked = curEx.farmVillageDwellEnabled !== false;
      if (farmDwellMinEl) farmDwellMinEl.value = Number(curEx.farmVillageDwellMinSec ?? 10);
      if (farmDwellMaxEl) farmDwellMaxEl.value = Number(curEx.farmVillageDwellMaxSec ?? 60);
      if (farmRestOnEl) farmRestOnEl.checked = Boolean(curEx.farmRestEnabled);
      if (farmRestMinRunsEl) farmRestMinRunsEl.value = Math.max(1, Number(curEx.farmRestMinRuns) || 4);
      if (farmRestMaxRunsEl) farmRestMaxRunsEl.value = Math.max(1, Number(curEx.farmRestMaxRuns) || 6);
      if (farmRestMinMinEl) farmRestMinMinEl.value = Math.max(1, Number(curEx.farmRestMinMin) || 25);
      if (farmRestMaxMinEl) farmRestMaxMinEl.value = Math.max(1, Number(curEx.farmRestMaxMin) || 55);
      if (farmAutoPlayEl) farmAutoPlayEl.checked = Boolean(curEx.farmAutoPlayLobby);
      if (autoHpDodgeEl) autoHpDodgeEl.checked = curEx.autoHpDodge !== false;
      if (farmHpEl) farmHpEl.value = Number(curEx.farmLowHpWarnPct) || 0;
      const fc = curEx.focusConfig || {};
      if (focusDeityEl) focusDeityEl.checked = fc.enabled !== false && fc.focusDeity !== false;
      if (focusPotionEl) focusPotionEl.checked = fc.enabled !== false && fc.focusPotion !== false;
      updateFarmHud();
      if (moveStyleSel) moveStyleSel.value = CONFIG.autoMoveConfig.style || 'human_natural';
      syncMoveRangeInputs();
      if (centerOnStartEl) centerOnStartEl.checked = CONFIG.autoMoveConfig.autoCenterOnStageStart !== false;
      if (bossRedDodgeEl) bossRedDodgeEl.checked = CONFIG.autoMoveConfig.bossRedDodgeEnabled !== false;
      if (moonlightDodgeEl) moonlightDodgeEl.checked = CONFIG.autoMoveConfig.moonlightBellDodgeEnabled !== false;
      if (obstacleMemEl) obstacleMemEl.checked = CONFIG.autoMoveConfig.obstacleMemoryEnabled !== false;
      renderLootPanel(false);
      if (rerollEl) rerollEl.checked = Boolean(curEx.rerollForSkill);
      if (legCoreEl) legCoreEl.checked = curEx.preferLegendaryCore !== false;
      if (nativeAutoSkillEl) nativeAutoSkillEl.checked = curEx.useNativeAutoAfterBanish !== false;
      if (nativeAutoChestEl) nativeAutoChestEl.checked = curEx.useNativeAutoChest === true;
      if (pickupFirstEl) pickupFirstEl.checked = curEx.prioritizePickupPotion !== false;
      if (chestRerollAllEl) chestRerollAllEl.checked = curEx.chestRerollAllEarly !== false;
      if (skillDeityAutoEl) skillDeityAutoEl.checked = curEx.autoPickSkillDeity !== false;
      if (deityRerollEl) deityRerollEl.checked = curEx.rerollForDeity !== false;
      const syncedDeityTopN = Math.max(1, Math.min(13, Number(curEx.deityTopN) || 3));
      if (deityTopNEl) deityTopNEl.value = syncedDeityTopN;
      syncDeityTopNLabels(syncedDeityTopN);
      refreshJobPanels();
      renderConfigKeywordsList();
      if (enEl) enEl.checked = Boolean(curEx.timerEnabled);
      if (minEl) minEl.value = Number(curEx.timerMin) || 0;
      if (secEl) secEl.value = Number(curEx.timerSec) || 0;
      if (hidEl) hidEl.checked = Boolean(curEx.pauseOnHidden);
      if (escEl) escEl.checked = curEx.autoPauseGameOnStop !== false;
      state.timerTriggered = false;
      if (CONFIG.autoMoveConfig.mode === 'radius_wander') {
        state.lowHpEvading = false;
        scheduleNextMoveStep();
      } else {
        releaseAllMoveKeys();
      }
      updateMoveHud(true);
      updateBridgeHud();
      updateStatusBar();
    };
    const presetSelEl = $id('rh-preset-select');
    const presetNameEl = $id('rh-preset-name');
    const presetApplyBtn = $id('rh-preset-apply');
    const presetOverwriteBtn = $id('rh-preset-overwrite');
    const presetSaveAsBtn = $id('rh-preset-saveas');
    const presetDelBtn = $id('rh-preset-delete');
    const presetInfoEl = $id('rh-preset-info');
    let pendingDeletePresetId = '';
    let pendingDeleteTimer = null;
    const resetDeleteConfirm = () => {
      pendingDeletePresetId = '';
      if (pendingDeleteTimer) {
        clearTimeout(pendingDeleteTimer);
        pendingDeleteTimer = null;
      }
      if (presetDelBtn) presetDelBtn.textContent = '🗑 刪除';
    };
    const formatPresetSummary = (p) => {
      if (!p || !p.snapshot) return '尚未建立設定檔；調整好各分頁參數後輸入名稱按「+ 另存」';
      const s = p.snapshot;
      const exSnap = s.extra || {};
      const stg = STAGES_DATA.find((x) => x.id === exSnap.farmStageId);
      const stgName = stg ? stg.name : (exSnap.farmStageId || '預設');
      const mv = s.autoMoveConfig || {};
      const moveDesc = mv.mode === 'radius_wander' ? `繞行 ${mv.radiusPx || 220}px` : '定點';
      const jobDesc = exSnap.jobOverride && exSnap.jobOverride !== 'auto' ? exSnap.jobOverride : '自動職業';
      const lootOn = mv.autoLootChests ? '開' : '關';
      return `${stgName} ｜ ${moveDesc} ｜ 撿取:${lootOn} ｜ ${jobDesc}`;
    };
    const renderPresetSelector = (selectId = null) => {
      if (!presetSelEl) return;
      const presets = loadUserPresets();
      const activeId = GM_getValue(ACTIVE_USER_PRESET_KEY, '');
      const targetId = selectId !== null ? selectId : (presetSelEl.value || activeId);
      presetSelEl.innerHTML = '';
      if (!presets.length) {
        const o = document.createElement('option');
        o.value = '';
        o.textContent = '（尚無已儲存設定檔）';
        presetSelEl.appendChild(o);
      } else {
        presets.forEach((p) => {
          const o = document.createElement('option');
          o.value = p.id;
          o.textContent = p.id === activeId ? `★ ${p.name}（目前套用）` : p.name;
          presetSelEl.appendChild(o);
        });
        if (presets.some((p) => p.id === targetId)) {
          presetSelEl.value = targetId;
        } else {
          presetSelEl.value = presets[0].id;
        }
      }
      const curSel = presets.find((p) => p.id === presetSelEl.value);
      const activeObj = presets.find((p) => p.id === activeId);
      if (presetInfoEl) {
        if (curSel) {
          const prefix = curSel.id === activeId ? '已套用' : '預覽';
          presetInfoEl.textContent = `[${prefix}] ${curSel.name}：${formatPresetSummary(curSel)}`;
        } else if (activeObj) {
          presetInfoEl.textContent = `目前：【${activeObj.name}】${formatPresetSummary(activeObj)}`;
        } else {
          presetInfoEl.textContent = '可自訂多組參數設定檔（含刷圖/走位/撿取/技能/道具/詞條/計時），一鍵切換套用';
        }
      }
    };
    if (presetNameEl) {
      ['keydown', 'keyup', 'keypress'].forEach((ev) => {
        presetNameEl.addEventListener(ev, (e) => e.stopPropagation());
      });
    }
    if (presetSelEl) {
      presetSelEl.addEventListener('change', () => {
        resetDeleteConfirm();
        renderPresetSelector(presetSelEl.value);
      });
    }
    if (presetSaveAsBtn) {
      presetSaveAsBtn.addEventListener('click', () => {
        resetDeleteConfirm();
        const rawName = (presetNameEl?.value || '').trim();
        if (!rawName) {
          addLog('[設定檔] 請先輸入設定檔名稱（例如：刷寶、傷害）');
          presetNameEl?.focus?.();
          return;
        }
        const presets = loadUserPresets();
        const snapshot = captureCurrentSnapshot();
        const existingIdx = presets.findIndex((p) => p.name === rawName);
        let savedId = '';
        if (existingIdx >= 0) {
          presets[existingIdx] = { ...presets[existingIdx], snapshot, updatedAt: Date.now() };
          savedId = presets[existingIdx].id;
          addLog(`[設定檔] 已更新現有設定檔【${rawName}】`);
        } else {
          savedId = `up_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          presets.push({ id: savedId, name: rawName, snapshot, updatedAt: Date.now() });
          addLog(`[設定檔] 已新增設定檔【${rawName}】`);
        }
        saveUserPresets(presets);
        GM_setValue(ACTIVE_USER_PRESET_KEY, savedId);
        if (presetNameEl) presetNameEl.value = '';
        renderPresetSelector(savedId);
      });
    }
    if (presetOverwriteBtn) {
      presetOverwriteBtn.addEventListener('click', () => {
        resetDeleteConfirm();
        const targetId = presetSelEl?.value;
        if (!targetId) {
          addLog('[設定檔] 目前沒有可覆寫的設定檔，請先輸入名稱按「+ 另存」');
          return;
        }
        const presets = loadUserPresets();
        const idx = presets.findIndex((p) => p.id === targetId);
        if (idx < 0) return;
        presets[idx] = { ...presets[idx], snapshot: captureCurrentSnapshot(), updatedAt: Date.now() };
        saveUserPresets(presets);
        GM_setValue(ACTIVE_USER_PRESET_KEY, targetId);
        renderPresetSelector(targetId);
        addLog(`[設定檔] 已將目前參數覆寫儲存到【${presets[idx].name}】`);
      });
    }
    if (presetApplyBtn) {
      presetApplyBtn.addEventListener('click', () => {
        resetDeleteConfirm();
        const targetId = presetSelEl?.value;
        if (!targetId) {
          addLog('[設定檔] 請先選擇要套用的設定檔');
          return;
        }
        const presets = loadUserPresets();
        const preset = presets.find((p) => p.id === targetId);
        if (!preset || !preset.snapshot) return;
        const snap = cloneJson(preset.snapshot);
        CONFIG.selectionActionMode = normalizeActionMode(snap.selectionActionMode || CONFIG.selectionActionMode);
        const defaultOrder = ['magnet', 'equip', 'chest', 'supply'];
        const snapMove = snap.autoMoveConfig || {};
        const snapOrder = Array.isArray(snapMove.lootOrder)
          ? snapMove.lootOrder.filter((k) => defaultOrder.includes(k))
          : [];
        CONFIG.autoMoveConfig = {
          ...DEFAULT_CONFIG.autoMoveConfig,
          ...snapMove,
          lootPriorities: {
            ...DEFAULT_CONFIG.autoMoveConfig.lootPriorities,
            ...(snapMove.lootPriorities || {}),
          },
          lootOrder: [...snapOrder, ...defaultOrder.filter((k) => !snapOrder.includes(k))],
        };
        if (snap.strategy) {
          CONFIG.strategy = {
            ...DEFAULT_CONFIG.profiles[0],
            ...snap.strategy,
          };
        }
        GM_setValue('skillpick_overrides', {
          ...GM_getValue('skillpick_overrides', {}),
          selectionActionMode: CONFIG.selectionActionMode,
          autoMoveConfig: CONFIG.autoMoveConfig,
          strategy: CONFIG.strategy,
        });
        const curLiveEx = getExtra();
        const mergedEx = {
          ...DEFAULT_EXTRA,
          ...(snap.extra || {}),
          stageCenterMap: curLiveEx.stageCenterMap || {},
          stageObstacleMap: curLiveEx.stageObstacleMap || {},
          bridgeUrl: curLiveEx.bridgeUrl || DEFAULT_EXTRA.bridgeUrl,
          bridgeToken: curLiveEx.bridgeToken || '',
          bridgeRequireFocus: curLiveEx.bridgeRequireFocus !== false,
          bridgeAllowClick: curLiveEx.bridgeAllowClick !== false,
        };
        GM_setValue('skillpick_extra', mergedEx);
        GM_setValue(ACTIVE_USER_PRESET_KEY, preset.id);
        syncAllHudControlsFromState();
        renderPresetSelector(preset.id);
        addLog(`[設定檔] 已套用【${preset.name}】的全部參數設定`);
      });
    }
    if (presetDelBtn) {
      presetDelBtn.addEventListener('click', () => {
        const targetId = presetSelEl?.value;
        if (!targetId) {
          addLog('[設定檔] 目前沒有可刪除的設定檔');
          return;
        }
        if (pendingDeletePresetId !== targetId) {
          pendingDeletePresetId = targetId;
          presetDelBtn.textContent = '確認刪除?';
          if (pendingDeleteTimer) clearTimeout(pendingDeleteTimer);
          pendingDeleteTimer = setTimeout(resetDeleteConfirm, 3000);
          return;
        }
        resetDeleteConfirm();
        const presets = loadUserPresets();
        const removed = presets.find((p) => p.id === targetId);
        const nextList = presets.filter((p) => p.id !== targetId);
        saveUserPresets(nextList);
        if (GM_getValue(ACTIVE_USER_PRESET_KEY, '') === targetId) {
          GM_setValue(ACTIVE_USER_PRESET_KEY, '');
        }
        renderPresetSelector('');
        addLog(`[設定檔] 已刪除【${removed?.name || targetId}】`);
      });
    }
    // === 跨電腦設定檔匯出與匯入功能 ===
    const exportBtn = $id('rh-preset-export');
    const importBtn = $id('rh-preset-import');
    const backupModal = $id('rh-backup-modal');
    const backupModalTitle = $id('rh-backup-modal-title');
    const backupModalDesc = $id('rh-backup-modal-desc');
    const backupModalClose = $id('rh-backup-modal-close');
    const backupTextarea = $id('rh-backup-textarea');
    const importToolsRow = $id('rh-import-tools-row');
    const pickFileBtn = $id('rh-btn-pick-file');
    const fileInput = $id('rh-preset-file-input');
    const mergeModeCheck = $id('rh-import-merge-mode');
    const actionCopyBtn = $id('rh-backup-action-copy');
    const actionDownloadBtn = $id('rh-backup-action-download');
    const actionConfirmBtn = $id('rh-backup-action-confirm');
    const downloadJsonFile = (filename, jsonText) => {
      try {
        const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return true;
      } catch (err) {
        return false;
      }
    };
    const copyTextToClipboard = async (text) => {
      try {
        if (typeof GM_setClipboard === 'function') {
          GM_setClipboard(text, 'text');
          return true;
        }
      } catch (_) {}
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch (_) {}
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        return true;
      } catch (_) {}
      return false;
    };
    const uint8ToBase64Url = (bytes) => {
      let bin = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };
    const base64UrlToUint8 = (b64) => {
      const clean = String(b64 || '').replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
      const pad = clean.length % 4 ? '='.repeat(4 - (clean.length % 4)) : '';
      const bin = atob(clean + pad);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    };
    const encodeSyncCode = async (payloadObj) => {
      const compactJson = JSON.stringify(payloadObj);
      const rawBytes = new TextEncoder().encode(compactJson);
      try {
        if (typeof CompressionStream === 'function') {
          const cs = new CompressionStream('gzip');
          const writer = cs.writable.getWriter();
          writer.write(rawBytes);
          writer.close();
          const buf = await new Response(cs.readable).arrayBuffer();
          return 'ROSYNC1:' + uint8ToBase64Url(new Uint8Array(buf));
        }
      } catch (_) {}
      return 'ROSYNC0:' + uint8ToBase64Url(rawBytes);
    };
    const decodeSyncCode = async (rawText) => {
      const trimmed = String(rawText || '').trim();
      if (!trimmed) throw new Error('未輸入任何同步碼或 JSON 設定資料');
      if (trimmed.startsWith('ROSYNC1:')) {
        if (typeof DecompressionStream !== 'function') {
          throw new Error('此瀏覽器版本不支援 Gzip 解壓，請改用 .json 備份檔匯入');
        }
        const bytes = base64UrlToUint8(trimmed.slice('ROSYNC1:'.length));
        const ds = new DecompressionStream('gzip');
        const writer = ds.writable.getWriter();
        writer.write(bytes);
        writer.close();
        const jsonStr = await new Response(ds.readable).text();
        return JSON.parse(jsonStr);
      }
      if (trimmed.startsWith('ROSYNC0:')) {
        const bytes = base64UrlToUint8(trimmed.slice('ROSYNC0:'.length));
        return JSON.parse(new TextDecoder().decode(bytes));
      }
      return JSON.parse(trimmed);
    };
    const buildFullExportData = (opts = {}) => {
      flushStageObstacleMapNow();
      const extraCopy = cloneJson(GM_getValue('skillpick_extra', {}) || {});
      if (opts.stripBridgeSecrets !== false) {
        delete extraCopy.bridgeToken;
        delete extraCopy.bridgeUrl;
      }
      return {
        generator: 'RO_SURVIVORS_AUTO_PICK',
        version: '2.46.0',
        exportedAt: new Date().toISOString(),
        data: {
          userPresets: loadUserPresets(),
          activePresetId: GM_getValue(ACTIVE_USER_PRESET_KEY, ''),
          overrides: GM_getValue('skillpick_overrides', {}),
          extra: extraCopy,
          hudOpacity: GM_getValue('skillpick_hud_opacity', 95),
        },
      };
    };
    const performImportData = async (rawText, isMerge = false) => {
      if (!rawText || !rawText.trim()) {
        throw new Error('未輸入任何同步碼或 JSON 設定資料');
      }
      let parsed = null;
      try {
        parsed = await decodeSyncCode(rawText);
      } catch (err) {
        throw new Error(err?.message?.includes('Gzip') ? err.message : '同步碼或 JSON 格式錯誤，請確認複製內容是否完整');
      }
      let importedPresets = [];
      let importedActiveId = '';
      let importedOverrides = null;
      let importedExtra = null;
      let importedOpacity = null;
      if (Array.isArray(parsed)) {
        importedPresets = parsed;
      } else if (parsed && parsed.data) {
        importedPresets = Array.isArray(parsed.data.userPresets) ? parsed.data.userPresets : [];
        importedActiveId = parsed.data.activePresetId || '';
        importedOverrides = parsed.data.overrides || null;
        importedExtra = parsed.data.extra || null;
        importedOpacity = parsed.data.hudOpacity ?? null;
      } else if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.userPresets)) importedPresets = parsed.userPresets;
        if (parsed.activePresetId) importedActiveId = parsed.activePresetId;
        if (parsed.overrides) importedOverrides = parsed.overrides;
        if (parsed.extra) importedExtra = parsed.extra;
        if (parsed.hudOpacity !== undefined) importedOpacity = parsed.hudOpacity;
      }
      const validPresets = importedPresets
        .filter((p) => p && typeof p.name === 'string' && p.snapshot)
        .map((p) => {
          const snap = cloneJson(p.snapshot);
          if (snap.selectionActionMode) {
            snap.selectionActionMode = normalizeActionMode(snap.selectionActionMode);
          }
          return {
            id: p.id || `up_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: String(p.name).trim(),
            snapshot: snap,
            updatedAt: Number(p.updatedAt) || Date.now(),
          };
        });
      let nextPresets = [];
      if (isMerge) {
        const curList = loadUserPresets();
        const map = new Map();
        curList.forEach((p) => map.set(p.name, p));
        validPresets.forEach((p) => map.set(p.name, p));
        nextPresets = Array.from(map.values());
      } else {
        nextPresets = validPresets;
      }
      saveUserPresets(nextPresets);
      if (importedOverrides && typeof importedOverrides === 'object' && !isMerge) {
        const curOv = GM_getValue('skillpick_overrides', {});
        const cleanMode = normalizeActionMode(importedOverrides.selectionActionMode || curOv.selectionActionMode);
        const nextOv = {
          ...curOv,
          ...importedOverrides,
          selectionActionMode: cleanMode,
        };
        GM_setValue('skillpick_overrides', nextOv);
        CONFIG.selectionActionMode = cleanMode;
        if (importedOverrides.strategy) CONFIG.strategy = cloneJson(importedOverrides.strategy);
        if (importedOverrides.autoMoveConfig) CONFIG.autoMoveConfig = cloneJson(importedOverrides.autoMoveConfig);
      }
      if (importedExtra && typeof importedExtra === 'object') {
        const curLiveEx = getExtra();
        if (!isMerge) {
          const nextEx = {
            ...DEFAULT_EXTRA,
            ...importedExtra,
            bridgeUrl: curLiveEx.bridgeUrl || importedExtra.bridgeUrl || DEFAULT_EXTRA.bridgeUrl,
            bridgeToken: curLiveEx.bridgeToken || importedExtra.bridgeToken || '',
            bridgeRequireFocus: curLiveEx.bridgeRequireFocus !== false,
            bridgeAllowClick: curLiveEx.bridgeAllowClick !== false,
          };
          GM_setValue('skillpick_extra', nextEx);
          state.obstacleRuntime.stageMap = null;
          state.obstacleRuntime.astarCache = null;
        } else if (importedExtra.stageObstacleMap && typeof importedExtra.stageObstacleMap === 'object') {
          // 合併匯入模式亦同步合併各副本障礙記憶，跨電腦移機無需重學
          const mergedObs = cloneJson(curLiveEx.stageObstacleMap || {});
          for (const [stKey, stVal] of Object.entries(importedExtra.stageObstacleMap)) {
            if (!stVal || typeof stVal !== 'object') continue;
            if (!mergedObs[stKey]) {
              mergedObs[stKey] = cloneJson(stVal);
            } else {
              mergedObs[stKey].b = { ...(mergedObs[stKey].b || {}), ...(stVal.b || {}) };
              mergedObs[stKey].s = { ...(mergedObs[stKey].s || {}), ...(stVal.s || {}) };
              mergedObs[stKey].u = Math.max(Number(mergedObs[stKey].u) || 0, Number(stVal.u) || 0);
            }
          }
          saveExtra({ stageObstacleMap: mergedObs });
          state.obstacleRuntime.stageMap = null;
          state.obstacleRuntime.astarCache = null;
        }
      }
      if (importedOpacity !== null && !isMerge) {
        const op = Math.max(30, Math.min(100, Number(importedOpacity) || 95));
        GM_setValue('skillpick_hud_opacity', op);
        const panel = $id('rh-panel');
        if (panel) panel.style.opacity = String(op / 100);
      }
      let activeIdToSet = importedActiveId;
      if (!nextPresets.some((p) => p.id === activeIdToSet)) {
        activeIdToSet = nextPresets.length ? nextPresets[0].id : '';
      }
      if (activeIdToSet) {
        GM_setValue(ACTIVE_USER_PRESET_KEY, activeIdToSet);
      }
      syncAllHudControlsFromState();
      renderPresetSelector(activeIdToSet);
      updateBridgeHud();
      updateStatusBar();
      return {
        importedCount: validPresets.length,
        totalPresets: nextPresets.length,
      };
    };
    if (backupTextarea) {
      ['keydown', 'keyup', 'keypress'].forEach((ev) => {
        backupTextarea.addEventListener(ev, (e) => e.stopPropagation());
      });
    }
    const pasteClipBtn = $id('rh-btn-paste-clip');
    if (exportBtn) {
      exportBtn.addEventListener('click', async () => {
        try {
          const fullData = buildFullExportData({ stripBridgeSecrets: true });
          const syncCode = await encodeSyncCode(fullData);
          const ok = await copyTextToClipboard(syncCode);
          const kbTxt = (syncCode.length / 1024).toFixed(1);
          const obsStages = Object.keys(fullData.data.extra?.stageObstacleMap || {}).length;
          if (ok) {
            const prev = exportBtn.textContent;
            exportBtn.textContent = `✔ 已複製 (${kbTxt}KB)`;
            setTimeout(() => { exportBtn.textContent = prev; }, 2200);
            addLog(`[跨機同步] 已一鍵複製壓縮同步碼（約 ${kbTxt}KB，含 ${fullData.data.userPresets.length} 組設定檔與 ${obsStages} 個副本障礙記憶；不含本機橋接金鑰）`);
            updateStatusBar(`✅ 同步碼已複製（${kbTxt}KB）`);
          } else if (backupModal && backupTextarea) {
            if (backupModalTitle) backupModalTitle.textContent = '📋 複製壓縮同步碼';
            if (backupModalDesc) backupModalDesc.textContent = '瀏覽器未自動允許寫入剪貼簿，請直接全選下方短同步碼複製：';
            backupTextarea.value = syncCode;
            backupTextarea.select();
            backupModal.style.display = 'flex';
          }
        } catch (err) {
          addLog(`[跨機同步失敗] ${err?.message || err}`);
        }
      });
    }
    if (importBtn && backupModal) {
      importBtn.addEventListener('click', () => {
        if (backupModalTitle) backupModalTitle.textContent = '📥 跨機還原 ／ 備份';
        if (backupModalDesc) {
          backupModalDesc.textContent = '貼上「ROSYNC1:...」短同步碼或載入 .json 檔後按「確認還原」（自動保留本機橋接金鑰）；也可按下方手動下載 .json 備份檔。';
        }
        if (importToolsRow) importToolsRow.style.display = 'flex';
        if (actionConfirmBtn) actionConfirmBtn.style.display = 'inline-block';
        if (actionCopyBtn) actionCopyBtn.style.display = 'inline-block';
        if (actionDownloadBtn) actionDownloadBtn.style.display = 'inline-block';
        if (backupTextarea) {
          backupTextarea.value = '';
          backupTextarea.placeholder = '在此貼上 ROSYNC1:... 短同步碼，或點上方「貼上同步碼」／「選 .json 檔」...';
        }
        backupModal.style.display = 'flex';
      });
    }
    if (pasteClipBtn && backupTextarea) {
      pasteClipBtn.addEventListener('click', async () => {
        try {
          if (navigator.clipboard && navigator.clipboard.readText) {
            const txt = await navigator.clipboard.readText();
            if (txt && txt.trim()) {
              backupTextarea.value = txt.trim();
              if (backupModalDesc) backupModalDesc.textContent = '已從剪貼簿貼入內容，請點右下方「✔ 確認還原」套用。';
              return;
            }
          }
        } catch (_) {}
        backupTextarea.focus();
        if (backupModalDesc) backupModalDesc.textContent = '請在下方輸入框按 Ctrl+V 貼上同步碼，再點「✔ 確認還原」。';
      });
    }
    if (backupModalClose && backupModal) {
      backupModalClose.addEventListener('click', () => {
        backupModal.style.display = 'none';
      });
    }
    if (pickFileBtn && fileInput) {
      pickFileBtn.addEventListener('click', () => fileInput.click());
    }
    if (fileInput && backupTextarea) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (rev) => {
          const content = rev.target?.result;
          if (typeof content === 'string') {
            backupTextarea.value = content;
            if (backupModalDesc) {
              backupModalDesc.textContent = `已載入檔案「${file.name}」，請點擊右下方「✔ 確認還原」執行還原。`;
            }
            addLog(`[設定檔] 已讀取檔案：${file.name}`);
          }
        };
        reader.readAsText(file);
      });
    }
    if (actionCopyBtn) {
      actionCopyBtn.addEventListener('click', async () => {
        const fullData = buildFullExportData({ stripBridgeSecrets: true });
        const syncCode = await encodeSyncCode(fullData);
        if (backupTextarea) backupTextarea.value = syncCode;
        const ok = await copyTextToClipboard(syncCode);
        if (ok) {
          const prev = actionCopyBtn.textContent;
          actionCopyBtn.textContent = '✔ 已複製';
          setTimeout(() => { actionCopyBtn.textContent = prev; }, 1800);
          addLog(`[跨機同步] 同步碼已複製到剪貼簿（${(syncCode.length / 1024).toFixed(1)}KB）`);
        }
      });
    }
    if (actionDownloadBtn) {
      actionDownloadBtn.addEventListener('click', () => {
        const fullData = buildFullExportData({ stripBridgeSecrets: true });
        const jsonStr = JSON.stringify(fullData, null, 2);
        const now = new Date();
        const ymd = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
        const hm = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
        const filename = `ro_survivors_config_${ymd}_${hm}.json`;
        downloadJsonFile(filename, jsonStr);
        addLog(`[設定檔] 已手動下載備份檔案：${filename}`);
      });
    }
    if (actionConfirmBtn && backupTextarea && backupModal) {
      actionConfirmBtn.addEventListener('click', async () => {
        try {
          const isMerge = Boolean(mergeModeCheck && mergeModeCheck.checked);
          const res = await performImportData(backupTextarea.value, isMerge);
          backupModal.style.display = 'none';
          addLog(`[設定檔] 還原成功！載入 ${res.importedCount} 組設定檔（現共有 ${res.totalPresets} 組，已同步副本障礙記憶）`);
          updateStatusBar(`✅ 還原成功（共 ${res.totalPresets} 組設定檔）`);
        } catch (err) {
          if (backupModalDesc) {
            backupModalDesc.innerHTML = `<span style="color:#FCA5A5;">❌ 還原失敗：${err.message || String(err)}</span>`;
          }
          addLog(`[設定檔還原失敗] ${err.message || String(err)}`);
        }
      });
    }
    renderPresetSelector();
    const STREAM_PRESETS = {
      dmg: {
        name: '🔥 輸出爆發流', autoLoot: false, lootPrio: { magnet: true, equip: true, chest: false, supply: false },
        affixKw: [{ keyword: '目標', weight: 100, note: '第一優先' }, { keyword: '傷害', weight: 90, note: '高額傷害加成' }, { keyword: '冷卻縮減', weight: 80, note: '頻繁施放技能' }, { keyword: '爆擊', weight: 70, note: '爆擊與爆傷' }, { keyword: '範圍', weight: 60, note: '清怪範圍' }],
        items: {
          '藥水': ['p_dmg', 'p_cd', 'p_area', 'p_pickup', 'p_speed', 'p_greed', 'p_discovery', 'p_hp', 'p_regen', 'p_armor', 'p_cast', 'p_reach'],
          '秘藥': ['e_dmg', 'e_crit', 'e_critdmg', 'e_surprise', 'e_area', 'e_cast', 'e_dodge', 'e_armor', 'e_hp', 'e_dot'],
          '祝福': ['b_dmg', 'b_cd', 'b_lifesteal', 'b_area', 'b_wisdom', 'b_plenty', 'b_double', 'b_cast', 'b_regen', 'b_reach'],
          '料理': ['12202', '12203', '12205', '12207', '12206', '12204'],
        },
        deity: ['戰爭神器', '處刑神器', '力量神器', '思想神器', '記憶神器', '堡壘神器', '疾風神器', '生命神器', '智慧神器', '束縛神器', '詭計神器', '折磨神器', '貪婪神器'],
      },
      farm: {
        name: '💰 極致刷寶流', autoLoot: true, lootPrio: { magnet: true, equip: true, chest: true, supply: false },
        affixKw: [{ keyword: '目標', weight: 100, note: '第一優先' }, { keyword: '冷卻縮減', weight: 90, note: '技能循環' }, { keyword: '範圍', weight: 80, note: '大範圍收割' }, { keyword: 'INT', weight: 70, note: '智力加成' }, { keyword: '詠唱速度', weight: 60, note: '施法加速' }],
        items: {
          '藥水': ['p_pickup', 'p_greed', 'p_discovery', 'p_cd', 'p_area', 'p_dmg', 'p_speed', 'p_hp', 'p_regen', 'p_armor', 'p_cast', 'p_reach'],
          '秘藥': ['e_surprise', 'e_area', 'e_cast', 'e_dmg', 'e_crit', 'e_critdmg', 'e_dodge', 'e_armor', 'e_hp', 'e_dot'],
          '祝福': ['b_plenty', 'b_cd', 'b_area', 'b_wisdom', 'b_dmg', 'b_regen', 'b_lifesteal', 'b_double', 'b_cast', 'b_reach'],
          '料理': ['12203', '12204', '12205', '12207', '12206', '12202'],
        },
        deity: ['智慧神器', '貪婪神器', '記憶神器', '思想神器', '戰爭神器', '處刑神器', '力量神器', '堡壘神器', '疾風神器', '生命神器', '束縛神器', '詭計神器', '折磨神器'],
      },
      skill: {
        name: '⚡ 技能循環流', autoLoot: false, lootPrio: { magnet: true, equip: true, chest: false, supply: false },
        affixKw: [{ keyword: '冷卻縮減', weight: 100, note: '極致 CD 縮減' }, { keyword: '詠唱速度', weight: 90, note: '極速詠唱' }, { keyword: '目標', weight: 80, note: '多目標攻擊' }, { keyword: '範圍', weight: 70, note: '技能範圍' }, { keyword: 'INT', weight: 60, note: '魔法增幅' }],
        items: {
          '藥水': ['p_cd', 'p_cast', 'p_area', 'p_pickup', 'p_dmg', 'p_discovery', 'p_greed', 'p_speed', 'p_hp', 'p_regen', 'p_armor', 'p_reach'],
          '秘藥': ['e_cast', 'e_area', 'e_surprise', 'e_dmg', 'e_crit', 'e_critdmg', 'e_dodge', 'e_armor', 'e_hp', 'e_dot'],
          '祝福': ['b_cd', 'b_cast', 'b_area', 'b_double', 'b_wisdom', 'b_dmg', 'b_plenty', 'b_regen', 'b_lifesteal', 'b_reach'],
          '料理': ['12203', '12205', '12204', '12207', '12206', '12202'],
        },
        deity: ['思想神器', '記憶神器', '智慧神器', '束縛神器', '戰爭神器', '處刑神器', '力量神器', '堡壘神器', '疾風神器', '生命神器', '詭計神器', '折磨神器', '貪婪神器'],
      },
    };
    const applyBuiltinStreamPreset = (type) => {
      const sp = STREAM_PRESETS[type];
      if (!sp) return;
      const job = getActiveJobName();
      Object.entries(sp.items).forEach(([cat, ord]) => setJobItemOrder(cat, ord, job));
      setJobDeityOrder(sp.deity);
      CONFIG.strategy.priorityKeywords = sp.affixKw.map((x) => ({ ...x }));
      CONFIG.autoMoveConfig.lootPriorities = { ...CONFIG.autoMoveConfig.lootPriorities, ...sp.lootPrio };
      CONFIG.autoMoveConfig.autoLootChests = sp.autoLoot;
      GM_setValue('skillpick_overrides', { ...GM_getValue('skillpick_overrides', {}), strategy: CONFIG.strategy, autoMoveConfig: CONFIG.autoMoveConfig });
      const presets = loadUserPresets();
      const presetId = `stream_${type}`;
      const snapshot = captureCurrentSnapshot();
      const existingIdx = presets.findIndex((p) => p.id === presetId);
      if (existingIdx >= 0) presets[existingIdx] = { ...presets[existingIdx], snapshot, updatedAt: Date.now() };
      else presets.push({ id: presetId, name: sp.name, snapshot, updatedAt: Date.now() });
      saveUserPresets(presets);
      GM_setValue(ACTIVE_USER_PRESET_KEY, presetId);
      syncAllHudControlsFromState();
      renderPresetSelector(presetId);
      addLog(`[設定檔] 已一鍵套用【${sp.name}】（含詞條、道具順位、神器與撿取設定）`);
    };
    ['dmg', 'farm', 'skill'].forEach((t) => $id(`rh-preset-stream-${t}`)?.addEventListener('click', () => applyBuiltinStreamPreset(t)));
    const savedFolds = GM_getValue('skillpick_fold_state', {}) || {};
    $qa('details.rh-fold[data-fold]').forEach((d) => {
      const fKey = d.getAttribute('data-fold');
      if (!fKey) return;
      d.open = Boolean(savedFolds[fKey]);
      d.addEventListener('toggle', () => GM_setValue('skillpick_fold_state', { ...(GM_getValue('skillpick_fold_state', {}) || {}), [fKey]: d.open }));
    });
    const toggleFoldsBtn = $id('rh-toggle-folds');
    if (toggleFoldsBtn) {
      toggleFoldsBtn.addEventListener('click', () => {
        const activePanel = hudRoot.querySelector('.rh-tab-panel.active');
        const folds = activePanel ? Array.from(activePanel.querySelectorAll('details.rh-fold[data-fold]')) : [];
        if (!folds.length) return;
        const anyOpen = folds.some((d) => d.open);
        const nextOpen = !anyOpen;
        const nextState = { ...(GM_getValue('skillpick_fold_state', {}) || {}) };
        folds.forEach((d) => {
          d.open = nextOpen;
          const k = d.getAttribute('data-fold');
          if (k) nextState[k] = nextOpen;
        });
        GM_setValue('skillpick_fold_state', nextState);
      });
    }
    updateFarmHud();
    updateMoveHud();
    updateBridgeHud();
    updateStatusBar();
    updateFoldSummaries();
    if (CONFIG.selectionActionMode === 'hybrid_bridge') checkBridgeHealth(true);
    if (CONFIG.autoMoveConfig.mode === 'radius_wander') scheduleNextMoveStep();
  }

  // === 9. 啟動 MutationObserver 監聽畫面變化 + 計時與刷圖迴圈 ===
  // 任何一次例外都不能中斷後續輪詢；同一種錯誤只記錄一次，避免洗版
  const loggedErrors = new Set();
  function safeRun(fn, ...args) {
    try {
      return fn(...args);
    } catch (err) {
      const key = `${fn.name}:${err?.message}`;
      if (!loggedErrors.has(key)) {
        loggedErrors.add(key);
        addLog(`[錯誤] ${fn.name}：${err?.message || err}`);
      }
    }
  }
  // 舊版儲存的設定若殘留舊模式，啟動時一律自動轉為混合橋接
  const fixedMode = normalizeActionMode(CONFIG.selectionActionMode);
  if (fixedMode !== CONFIG.selectionActionMode) {
    CONFIG.selectionActionMode = fixedMode;
    GM_setValue('skillpick_overrides', { ...GM_getValue('skillpick_overrides', {}), selectionActionMode: fixedMode });
    addLog(`[實體輸入] 偵測到舊設定殘留，已自動轉為「${ACTION_LABELS[fixedMode] || fixedMode}」`);
  }
  restoreRunSession();
  const farmDoneHaltInfo = GM_getValue('skillpick_farm_done_halt', null);
  const savedRestInfo = GM_getValue('skillpick_farm_rest_state', null);
  const savedWatchdogResume = GM_getValue('skillpick_farm_watchdog_resume', null);
  let pendingImmediateRestResume = false;
  let pendingWatchdogResume = null;
  if (farmDoneHaltInfo) {
    GM_setValue('skillpick_farm_watchdog_resume', null);
    state.farmDoneHalted = true;
    state.autoEnabled = false;
    GM_setValue('skillpick_auto_enabled', false);
    state.farmEnabled = false;
    GM_setValue('skillpick_farm_enabled', false);
    if (CONFIG.autoMoveConfig.mode === 'radius_wander') {
      CONFIG.autoMoveConfig.mode = 'stationary';
      GM_setValue('skillpick_overrides', { ...GM_getValue('skillpick_overrides', {}), autoMoveConfig: CONFIG.autoMoveConfig });
    }
  } else if (savedRestInfo && typeof savedRestInfo.restingUntil === 'number') {
    GM_setValue('skillpick_farm_watchdog_resume', null);
    state.farmRunsDone = Number(savedRestInfo.totalRunsBeforeRest) || 0;
    state.farmRestInfo = savedRestInfo;
    if (savedRestInfo.restingUntil > Date.now()) {
      state.farmRestUntil = savedRestInfo.restingUntil;
      state.autoEnabled = false;
      GM_setValue('skillpick_auto_enabled', false);
      state.farmEnabled = false;
      GM_setValue('skillpick_farm_enabled', false);
      if (CONFIG.autoMoveConfig.mode === 'radius_wander') {
        CONFIG.autoMoveConfig.mode = 'stationary';
        GM_setValue('skillpick_overrides', { ...GM_getValue('skillpick_overrides', {}), autoMoveConfig: CONFIG.autoMoveConfig });
      }
    } else {
      pendingImmediateRestResume = true;
    }
  } else if (savedWatchdogResume && typeof savedWatchdogResume.ts === 'number' && Date.now() - savedWatchdogResume.ts < 10 * 60 * 1000) {
    GM_setValue('skillpick_farm_watchdog_resume', null);
    pendingWatchdogResume = savedWatchdogResume;
    state.farmRunsDone = Number(savedWatchdogResume.runsDone) || 0;
    state.farmSessionRunsDone = Number(savedWatchdogResume.sessionRunsDone) || 0;
    if (Number(savedWatchdogResume.sessionTargetRuns) > 0) {
      state.farmSessionTargetRuns = Number(savedWatchdogResume.sessionTargetRuns);
    }
    state.farmEnabled = true;
    GM_setValue('skillpick_farm_enabled', true);
    state.autoEnabled = savedWatchdogResume.resumeAutoPick !== false;
    GM_setValue('skillpick_auto_enabled', state.autoEnabled);
    if (savedWatchdogResume.resumeMove !== false && CONFIG.autoMoveConfig.mode !== 'radius_wander') {
      CONFIG.autoMoveConfig.mode = 'radius_wander';
      GM_setValue('skillpick_overrides', { ...GM_getValue('skillpick_overrides', {}), autoMoveConfig: CONFIG.autoMoveConfig });
    }
  } else if (savedWatchdogResume) {
    GM_setValue('skillpick_farm_watchdog_resume', null);
  }
  createHud();
  if (farmDoneHaltInfo) {
    addLog(`[目標達成] 上輪已完成刷圖 ${farmDoneHaltInfo.runsDone}/${farmDoneHaltInfo.maxRuns} 場並自動 F5 重新整理，已停止所有動作（手動啟動任一功能即可恢復）`);
  } else if (state.farmRestUntil > Date.now()) {
    const remMin = Math.max(1, Math.ceil((state.farmRestUntil - Date.now()) / 60000));
    const wakeStr = new Date(state.farmRestUntil).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
    addLog(`[階段休息] 已重整登出休息中（累計已完成 ${state.farmRunsDone} 場），剩餘約 ${remMin} 分鐘，將於 ${wakeStr} 自動登入繼續刷圖`);
    updateFarmHud();
    updateMiniMagnetHud();
  } else if (pendingImmediateRestResume) {
    resumeFromFarmRest(false);
  } else if (pendingWatchdogResume) {
    setAutoEnabledState(state.autoEnabled, { skipStatusUpdate: true });
    state.setHudMinimized?.(true);
    updateFarmHud();
    updateMoveHud(true);
    updateMiniMagnetHud();
    updateStatusBar();
    addLog(`[防卡死恢復] 上次因連續無效按鍵【${pendingWatchdogResume.key || '?'}】(${pendingWatchdogResume.count || 0}次) 已自動重整，現接續自動登入與刷圖迴圈（累計已完成 ${state.farmRunsDone} 場）`);
    setTimeout(() => safeRun(runFarmingLoopStep), 1200);
  } else if (state.farmEnabled) {
    ensureFarmDependenciesActive('重整恢復');
    updateFarmHud();
    updateMoveHud(true);
    updateStatusBar();
    setTimeout(() => safeRun(runFarmingLoopStep), 1200);
  } else if (state.autoEnabled) {
    setAutoEnabledState(true);
    addLog('[重整恢復] 已自動恢復先前開啟的「自動選擇」狀態');
    setTimeout(() => safeRun(runDetectionCycle, false), 900);
  }
  // 偵測玩家手動點擊卡片（即使未開自動或手動先選了技能神祇／第四招，也立即同步鎖定）
  document.addEventListener('click', (e) => {
    if (!e.isTrusted) return;
    const target = e.target instanceof Element ? e.target : e.target?.parentElement;
    if (!target || isOwnHudNode(target)) return;
    const cardEl = target.closest('.pk-card, .pk-slot, [class*="pk-slot"], [class*="choice-card"], [class*="skill-card"]');
    if (!cardEl) return;
    const actBtn = target.closest('.pk-act, button, [role="button"]');
    if (actBtn && /放逐|banish|重抽|reroll|專注|focus/i.test(actBtn.textContent || '')) {
      // 若玩家手動點擊放逐鈕，延遲驗證放逐次數確實減少後同步記錄至 banishedKeys，讓「全部放逐完再按自動」判定保持精準
      if (/放逐|banish/i.test(actBtn.textContent || '')) {
        try {
          const cardsSnap = extractDomCards();
          const clickedCard = cardsSnap?.find((c) => c.element === cardEl || cardEl.contains(c.element) || c.element.contains(cardEl));
          const beforeCnt = readBtnChargeCount(actBtn);
          if (clickedCard) {
            const skName = cardNameOf(clickedCard);
            const modalCtx = extractModalContext(cardsSnap.map((c) => c.element), cardsSnap);
            if (modalCtx.modalType === '升級技能' && skName) {
              setTimeout(() => {
                const afterCnt = readBtnChargeCount(actBtn);
                const dropped = beforeCnt !== null && afterCnt !== null ? afterCnt < beforeCnt : (!document.body.contains(clickedCard.element) || !isVisible(clickedCard.element));
                if (!dropped) return;
                if (!Array.isArray(state.run.banishedKeys)) state.run.banishedKeys = [];
                const isInn = INNATE_ATTACK_NAMES.some((k) => deityNamesMatch(skName, k) || deityNamesMatch(skName, k.replace(/^攻擊：/, '')));
                let syncedKey = null;
                if (isInn) {
                  syncedKey = '__INNATE__';
                  state.run.attrBanished = true;
                } else if (state.run.fourthSkill && deityNamesMatch(skName, state.run.fourthSkill)) {
                  syncedKey = '__FOURTH__';
                  state.run.fourthBanished = true;
                } else {
                  const qMatch = getJobBanishOrder().find((k) => k !== '__FOURTH__' && k !== '__INNATE__' && deityNamesMatch(skName, k));
                  if (qMatch) syncedKey = qMatch;
                }
                if (syncedKey && !state.run.banishedKeys.includes(syncedKey)) {
                  state.run.banishedKeys.push(syncedKey);
                  saveRunSession();
                  updateRunInfo();
                  addLog(`[手動放逐同步] 已記錄【${skName}】放逐完成`);
                }
              }, 700);
            }
          }
        } catch (_) {}
      }
      return;
    }
    const cards = extractDomCards();
    if (!cards || cards.length < 2) return;
    const clickedCard = cards.find((c) => c.element === cardEl || cardEl.contains(c.element) || c.element.contains(cardEl));
    if (!clickedCard) return;
    const modalCtx = extractModalContext(cards.map((c) => c.element), cards);
    if (modalCtx.modalType === '技能神祇') {
      const skName = resolveSkillNameByIconOrSlug(clickedCard.itemKey || '') || cardNameOf(clickedCard) || normalizeDeityName(clickedCard.title);
      if (skName) {
        state.run.skillDeity = skName;
        state.run.skillDeityLevel = 0;
        state.run.deityPending = false;
        saveRunSession();
        updateRunInfo();
        addLog(`[手動偵測] 已偵測你選擇 Lv 20 技能神祇【${skName}】（後續每 10 級自動升級）`);
      }
    } else if (modalCtx.modalType === '寶箱道具') {
      const clickedItem = resolveCardRunItem(clickedCard);
      trackPickedCardStatBonus(clickedCard, clickedItem || null);
      if (clickedItem) {
        if (!state.run.items) state.run.items = { '藥水': null, '秘藥': null, '祝福': null, '料理': null };
        if (state.run.items[clickedItem.category] !== clickedItem.key) {
          state.run.items[clickedItem.category] = clickedItem.key;
          saveRunSession();
          updateRunInfo();
          addLog(`[手動偵測] 已偵測你選擇${clickedItem.category}【${clickedItem.displayName}】`);
        }
      } else if (isArtifactCard(clickedCard)) {
        const clickedBack = target.closest('.pk-back');
        const clickedConfirmYes = Boolean(clickedBack && target.closest('button[data-yes]'));
        const clickedCancelNo = Boolean(clickedBack && target.closest('button[data-no]'));
        const hasPendingSwapFlip = Boolean(!clickedBack && clickedCard.element?.querySelector?.('.pk-swap'));
        if (!clickedCancelNo && (!hasPendingSwapFlip || clickedConfirmYes)) {
          const name = cardNameOf(clickedCard) || normalizeDeityName(clickedCard.title) || clickedCard.title;
          if (name && !deityNamesMatch(state.run.deity, name)) {
            state.run.deity = name;
            state.run.deityLevel = 0;
            saveRunSession();
            updateRunInfo();
            addLog(`[手動偵測] 已偵測你選擇神器【${name}】`);
          }
        }
      }
    } else if (modalCtx.modalType === '升級技能' && !modalCtx.isSkillSlotsFull && !state.run.fourthSkill) {
      const name = cardNameOf(clickedCard);
      const isCore = getCoreSkills().some((s) => deityNamesMatch(name, s));
      const isInnate = INNATE_ATTACK_NAMES.some((k) => deityNamesMatch(name, k.replace(/^攻擊：/, '')));
      if (name && !isCore && !isInnate && cardIsNew(clickedCard)) {
        state.run.fourthSkill = name;
        saveRunSession();
        updateRunInfo();
        addLog(`[手動偵測] 已偵測第四招【${name}】`);
      }
    }
  }, true);

  const COMBAT_NOISE_SELECTOR = '#timer, #hp-text, #hp-fill, #exp-text, #exp-fill, #kills, #gold, #zeny, #zeny-text, #chest-cost, #skillbar, #minimap-coords';
  const observer = new MutationObserver((mutations) => {
    const pickerHidden = Boolean(document.querySelector('#picker.hidden'));
    const relevant = mutations.some((m) => {
      const target = m.target instanceof Element ? m.target : m.target.parentElement;
      if (!target || isOwnHudNode(target)) return false;
      if (m.type === 'attributes') {
        return target.id === 'picker' || target.id === 'pk-cards';
      }
      if (pickerHidden && target.closest(COMBAT_NOISE_SELECTOR)) return false;
      return true;
    });
    if (!relevant) return;
    // 節流而非防抖：畫面持續變動時也能每 150ms 處理一次；戰鬥中免重複跑村莊刷圖輪詢
    if (state.observerTimer) return;
    state.observerTimer = setTimeout(() => {
      state.observerTimer = null;
      safeRun(runDetectionCycle, false);
      if (!isInCombat() || document.querySelector('.summary-window, .ro-window.npc-window')) {
        safeRun(runFarmingLoopStep);
      }
    }, 150);
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  setInterval(() => safeRun(runDetectionCycle, false), 1400);
  setInterval(() => safeRun(runBossRedDodgeTick), 130);
  setInterval(() => {
    safeRun(gameClockTick);
    safeRun(checkFarmRestTick);
    safeRun(runFarmingLoopStep);
  }, 1000);
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(__roStartMain, 0);
  } else {
    document.addEventListener('DOMContentLoaded', __roStartMain, { once: true });
    window.addEventListener('load', __roStartMain, { once: true });
  }
})();
