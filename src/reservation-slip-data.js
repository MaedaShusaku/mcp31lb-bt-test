// reservation-slip-data.js -- 保存済み予約（GAS/Sheets の形）→ 伝票テンプレートのデータ形 への純粋変換
//
// ・店舗コード: Sheets/GAS は小文字コード（yatsushiro / youme-yatsushiro / uto-city）、
//   帳票マスタ（slip-master.js）は YATSUSHIRO / YUMETOWN_YATSU / UTO_CITY。ここで1か所だけ対応付ける。
//   未知の店舗コードは推測せず例外（引換証に誤った店舗名・空欄を出さない）。
// ・受取年: 保存データの puY を使う（2026 固定にしない）。不正なら例外。
// ・氏名・電話はメモリ上で受け渡すだけ。ログ・保存はしない。
// DOM・通信に依存しない（node の机上検証からも読み込む）。
(function (root) {
  'use strict';

  var GAS_TO_SLIP_STORE = {
    'yatsushiro':       'YATSUSHIRO',
    'youme-yatsushiro': 'YUMETOWN_YATSU',
    'uto-city':         'UTO_CITY'
  };
  var WDAY = ['日', '月', '火', '水', '木', '金', '土'];
  var YEAR_MIN = 2025, YEAR_MAX = 2030;   // GAS 側 PICKUP_YEAR_MIN/MAX と同じ

  function M() { return root.CY && root.CY.master; }

  // GAS の店舗コード → 帳票マスタの店舗コード（未知は null）
  function slipStoreCode(gasCode) {
    var k = String(gasCode == null ? '' : gasCode);
    return Object.prototype.hasOwnProperty.call(GAS_TO_SLIP_STORE, k) ? GAS_TO_SLIP_STORE[k] : null;
  }
  // GAS の店舗コード → 店舗名（帳票マスタの名称。未知は null）
  function storeName(gasCode) {
    var sc = slipStoreCode(gasCode), m = M();
    var s = sc && m && m.storeByCode ? m.storeByCode(sc) : null;
    return s ? s.name : null;
  }
  function intIn(v, lo, hi) { var n = Number(v); return (String(v).trim() !== '' && isFinite(n) && Math.floor(n) === n && n >= lo && n <= hi) ? n : null; }
  function pickupYear(h) {
    var y = intIn(h && h.puY, YEAR_MIN, YEAR_MAX);
    if (y === null) throw new Error('受取年(puY)が不正です');
    return y;
  }
  function pickupWday(h) {
    var y = pickupYear(h), m = intIn(h.puM, 1, 12), d = intIn(h.puD, 1, 31);
    if (m === null || d === null) throw new Error('受取日(puM/puD)が不正です');
    var dt = new Date(y, m - 1, d);
    if (dt.getMonth() !== m - 1 || dt.getDate() !== d) throw new Error('存在しない受取日です');
    return WDAY[dt.getDay()];
  }

  // 保存済みヘッダー＋明細 → slip-template.js のデータ形
  function headerToSlip(h, items) {
    var sc = slipStoreCode(h.store);
    if (!sc) throw new Error('店舗コードを帳票の店舗に対応付けできません');
    var ad = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(h.acceptDate || ''));
    var it = {};
    (items || []).forEach(function (x) { it[x.productNo] = { qty: Number(x.qty) }; });
    return {
      storeCode: sc,
      acceptMonth: ad ? String(+ad[2]) : '', acceptDay: ad ? String(+ad[3]) : '',
      reserveNo: h.reserveNo, acceptStaff: h.acceptStaff, acceptKind: h.acceptKind,
      pickupYear: String(pickupYear(h)),
      pickupMonth: String(h.puM), pickupDay: String(h.puD), pickupWday: pickupWday(h),
      pickupHour: String(h.puH), pickupMin: ('0' + h.puMin).slice(-2),
      customerName: h.customerName, phone: h.phone,
      items: it, flavors: [], carryKey: h.carryKey,
      paid: (h.paid === '済'), remark: h.remark || ''
    };
  }

  var api = { GAS_TO_SLIP_STORE: GAS_TO_SLIP_STORE, slipStoreCode: slipStoreCode, storeName: storeName,
              pickupYear: pickupYear, pickupWday: pickupWday, headerToSlip: headerToSlip };
  root.CY = root.CY || {};
  root.CY.reservationSlip = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
