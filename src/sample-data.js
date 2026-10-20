// sample-data.js -- レイアウト確認用のダミー予約データ
//
// 金額はここには持たない。すべて slip-master.js の単価から算出する。
// 単価の出典は 店舗の確定単価マスタ（税込）。
// 保冷料金も slip-master.js の固定マスタから取る。受付画面では変更できない。
(function () {
  'use strict';

  function build(over) {
    var d = {
      storeCode: 'YATSUSHIRO',   // 管理表には記録するが伝票には印字しない
      acceptMonth: '11', acceptDay: '15',
      reserveNo: 'Y-0001',
      acceptStaff: '前田',
      acceptKind: 'ご来店',
      pickupMonth: '12', pickupDay: '24', pickupWday: '木',
      pickupHour: '15', pickupMin: '30',
      customerName: '山田 太郎',
      phone: '090-1234-5678',

      // 商品番号 → 注文内容。金額はマスタ単価から算出（二重管理を避ける）。
      // ⑦=パーティセットR、⑧=パーティセットS（別商品）。付属品確認は ③⑦⑧ を含める。
      // 貼付用総枚数＝①1＋③1＋⑤2＋⑦1＋⑧2＝7枚。
      items: {
        1: { qty: 1 },
        3: { qty: 1 },
        5: { qty: 2 },
        7: { qty: 1 },
        8: { qty: 2 }
      },

      flavors: [],   // フレーバーは手書き（事前印字しない）

      // 保冷料金: M30=0円 / H1=50円 / H2=80円（すべて確定・固定マスタ）
      carryKey: 'M30',

      paid: false,
      remark: ''   // 既定では備考文を印字しない（手書き空白を優先）
    };
    if (over) for (var k in over) d[k] = over[k];
    return d;
  }

  window.CY = window.CY || {};
  window.CY.sampleData = { build: build };
})();
