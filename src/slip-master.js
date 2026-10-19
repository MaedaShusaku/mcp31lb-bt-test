// slip-master.js -- 確定仕様のマスタ定義
//
// 価格: 店舗の確定単価マスタ（税込）
// 未確定の値は null のままにする。推測値を入れてはならない。
(function () {
  'use strict';

  // ------------------------------------------------ 店舗マスタ
  // 管理表には店舗識別を必ず記録するが、
  // 原本伝票に店舗名欄が無いため【印刷デザインには出さない】。
  var STORES = [
    { code: 'YATSUSHIRO',     name: '八代店' },
    { code: 'YUMETOWN_YATSU', name: 'ゆめタウン八代店' },
    { code: 'UTO_CITY',       name: '宇土シティ店' }
  ];

  // ------------------------------------------------ 商品マスタ（原本の固定7行）
  //
  // price: 税込単価（円）。（店舗の確定単価マスタ）。
  // variants: 1行の中で単価が分かれる商品（⑦のS/R）。この場合 price は null。
  // accessory: 原本に固定印字されている付属品表記（商品名セル内の小さい行）。
  var PRODUCTS = [
    { no: 1, mark: '①', name: 'クリスマス パレット 8',
      accessory: null, price: 5400, variants: null },

    { no: 2, mark: '②', name: 'ポケモン クリスマス アイスクリームケーキ',
      accessory: null, price: 4400, variants: null },

    { no: 3, mark: '③', name: 'ユニバーサル・スタジオ・ジャパン 25th アニバーサリー パレット6',
      accessory: '付属品：アタッチメントセット・専用BOX', price: 4900, variants: null },

    { no: 4, mark: '④', name: 'クリスマス パレット 4',
      accessory: null, price: 4000, variants: null },

    { no: 5, mark: '⑤', name: 'サンリオキャラクターズ クリスマス パレット6',
      accessory: null, price: 4900, variants: null },

    { no: 6, mark: '⑥', name: 'ゴディバ監修 - ショコラ＆ヘーゼルナッツ クリスマスアイスクリームケーキ',
      accessory: null, price: 4900, variants: null },

    // ⑦は伝票上では1行だが、S・Rで単価が異なる。
    // 原本の「（R・S）」の該当文字を丸で囲み、個数・金額は合算して表示する。
    { no: 7, mark: '⑦', name: 'クリスマス パーティーセット（R・S）',
      accessory: '付属品：カラースプレー', price: null,
      variants: [
        { key: 'R', label: 'R', price: 4900 },
        { key: 'S', label: 'S', price: 4100 }
      ] }
  ];

  // ------------------------------------------------ 付属品確認マスタ
  //
  // 備考欄の上に印字する「付属品確認」チェック欄の元データ。
  // 注文された商品の分だけ生成し、注文されていない商品の付属品は印字しない。
  // チェックボックスは空欄で印字し、スタッフが手書きでチェックする。
  //
  // 【未登録】①②④⑤⑥ は別添えが必要な付属品を確認してから登録する。
  //          確認が取れるまで空配列のままにする（推測で足さない）。
  var ACCESSORY_CHECKS = {
    1: [],
    2: [],
    3: [
      'アタッチメントセット（ピック・ロウソク）',
      '専用デザインケーキ箱',
      'ケーキ用手提げ袋'
    ],
    4: [],
    5: [],
    6: [],
    7: [
      '専用ボックス',
      '専用カップ・カップホルダー',
      'カラースプレー1袋'
    ]
  };

  // ------------------------------------------------ 持ち帰り時間マスタ（保冷料金・固定）
  // 原本の「持ち帰り時間（30分無料・1時間・2時間）」に対応。
  // 全区分の料金が確定済み。GAS側の固定マスタで管理し、
  // 予約受付画面からは変更できない。
  var CARRY_OPTIONS = [
    { key: 'M30', label: '30分無料', minutes: 30,  fee: 0 },
    { key: 'H1',  label: '1時間',    minutes: 60,  fee: 50 },
    { key: 'H2',  label: '2時間',    minutes: 120, fee: 80 }
  ];

  var ACCEPT_KINDS = ['ご来店', 'お電話', 'MO', '当日'];

  // ------------------------------------------------ 伝票3種（共通テンプレート）
  var VARIANTS = {
    reserve:  { key: 'reserve',  title: 'ご予約表', subtitle: '（貼付用）' },
    order:    { key: 'order',    title: '受注書',   subtitle: '（店舗控え）' },
    exchange: { key: 'exchange', title: '引換証',   subtitle: '（お客様控え）' }
  };
  var PRINT_ORDER = ['reserve', 'order', 'exchange'];

  var NOTICE = [
    '当店が本証にてお客様から頂いた個人情報は、ご予約の確認、商品のお渡し、',
    'お客様からのご予約に関するお問い合わせへの対応のみに利用させていただきます。',
    '本証は、商品お渡し後一定期間の後、当店で責任をもって処分いたします。'
  ].join('');

  // ------------------------------------------------ 計算
  function productByNo(no) {
    for (var i = 0; i < PRODUCTS.length; i++) if (PRODUCTS[i].no === no) return PRODUCTS[i];
    return null;
  }

  // 1商品の個数合計。variants 商品は各バリアントの合計。
  function itemQty(no, item) {
    if (!item) return 0;
    var p = productByNo(no);
    if (p && p.variants) {
      return p.variants.reduce(function (s, v) {
        return s + (Number((item.variants || {})[v.key]) || 0);
      }, 0);
    }
    return Number(item.qty) || 0;
  }

  // 1商品の金額。価格未確定なら null を返す（0 にしない＝推測しない）。
  function itemAmount(no, item) {
    if (!item) return null;
    var p = productByNo(no);
    if (!p) return null;
    if (p.variants) {
      var sum = 0, any = false;
      for (var i = 0; i < p.variants.length; i++) {
        var v = p.variants[i];
        var q = Number((item.variants || {})[v.key]) || 0;
        if (q === 0) continue;
        if (v.price == null) return null;
        sum += v.price * q; any = true;
      }
      return any ? sum : null;
    }
    var q2 = Number(item.qty) || 0;
    if (q2 === 0) return null;
    if (p.price == null) return null;
    return p.price * q2;
  }

  function carryOption(key) {
    for (var i = 0; i < CARRY_OPTIONS.length; i++) if (CARRY_OPTIONS[i].key === key) return CARRY_OPTIONS[i];
    return null;
  }

  // 合計金額。未確定の金額が1つでも含まれる場合は null を返す。
  // 誤った合計を印字するより空欄のほうが安全。
  function totalAmount(data) {
    var sum = 0;
    var items = data.items || {};
    for (var no in items) {
      if (!items.hasOwnProperty(no)) continue;
      if (itemQty(Number(no), items[no]) === 0) continue;
      var a = itemAmount(Number(no), items[no]);
      if (a == null) return null;
      sum += a;
    }
    var co = carryOption(data.carryKey);
    if (co) {
      if (co.fee == null) return null;
      sum += co.fee;
    }
    return sum;
  }

  // 注文された商品のうち、付属品確認が必要なものを列挙する
  function accessoryChecksFor(data) {
    var out = [];
    var items = data.items || {};
    PRODUCTS.forEach(function (p) {
      var it = items[p.no];
      var q = itemQty(p.no, it);
      if (q === 0) return;
      var list = ACCESSORY_CHECKS[p.no] || [];
      if (list.length === 0) return;
      out.push({ product: p, qty: q, items: list });
    });
    return out;
  }

  // ================================================================
  // 予約確定ガード
  //
  // 商品価格は2026年クリスマスセールの公式税込価格を【固定値】として使う。
  // スタッフによる価格・合計金額の編集は一切できない。
  // 金額は 商品／数量／⑦のR・S／持ち帰り時間 の選択から自動計算するだけ。
  //
  // 商品価格・保冷料金はすべて確定済みの固定値。
  // PRICE_NOT_SET のガードは、将来マスタに未設定値が混入した場合の
  // 安全装置として残してある（通常の運用では発火しない）。
  // ================================================================

  // 注文内容から明細と合計を算出する。
  // 固定価格が未設定の項目があれば unresolved に入り、total は null になる。
  function resolveAmounts(data) {
    var unresolved = [];
    var lines = [];
    var sum = 0;

    var items = data.items || {};
    PRODUCTS.forEach(function (p) {
      var it = items[p.no];
      if (!it) return;
      if (p.variants) {
        p.variants.forEach(function (v) {
          var q = Number((it.variants || {})[v.key]) || 0;
          if (q === 0) return;
          if (v.price == null) {
            unresolved.push({ label: p.mark + p.name + ' ' + v.label });
            return;
          }
          sum += v.price * q;
          lines.push({ no: p.no, variant: v.key, qty: q, unit: v.price, amount: v.price * q });
        });
      } else {
        var q2 = Number(it.qty) || 0;
        if (q2 === 0) return;
        if (p.price == null) { unresolved.push({ label: p.mark + p.name }); return; }
        sum += p.price * q2;
        lines.push({ no: p.no, variant: null, qty: q2, unit: p.price, amount: p.price * q2 });
      }
    });

    var co = carryOption(data.carryKey);
    var carryFee = null;
    if (co) {
      if (co.fee == null) unresolved.push({ label: '持ち帰り時間 ' + co.label });
      else { carryFee = co.fee; sum += co.fee; }
    }

    return {
      lines: lines,
      carryFee: carryFee,
      total: unresolved.length === 0 ? sum : null,
      unresolved: unresolved
    };
  }

  // 予約を確定してよいか。Phase 2以降の確定処理で必ず呼ぶ。
  function validateForConfirmation(data) {
    var errors = [];
    var r = resolveAmounts(data);

    if (!PRODUCTS.some(function (p) { return itemQty(p.no, (data.items || {})[p.no]) > 0; })) {
      errors.push({ code: 'NO_ITEM', message: '商品が1点も選択されていません。' });
    }

    r.unresolved.forEach(function (u) {
      errors.push({
        code: 'PRICE_NOT_SET',
        message: u.label + ' の料金が未設定のため予約を確定できません。'
      });
    });

    return {
      canConfirm: errors.length === 0,
      errors: errors,
      total: r.total,
      lines: r.lines,
      carryFee: r.carryFee
    };
  }

  function unpricedProducts() {
    return PRODUCTS.filter(function (p) {
      if (p.variants) return p.variants.some(function (v) { return v.price == null; });
      return p.price == null;
    });
  }
  function unpricedCarryOptions() {
    return CARRY_OPTIONS.filter(function (c) { return c.fee == null; });
  }
  // 付属品が未登録の商品（①②④⑤⑥）
  function unregisteredAccessoryProducts() {
    return PRODUCTS.filter(function (p) { return (ACCESSORY_CHECKS[p.no] || []).length === 0; });
  }

  window.CY = window.CY || {};
  window.CY.master = {
    STORES: STORES,
    PRODUCTS: PRODUCTS,
    ACCESSORY_CHECKS: ACCESSORY_CHECKS,
    CARRY_OPTIONS: CARRY_OPTIONS,
    ACCEPT_KINDS: ACCEPT_KINDS,
    VARIANTS: VARIANTS,
    PRINT_ORDER: PRINT_ORDER,
    NOTICE: NOTICE,
    productByNo: productByNo,
    itemQty: itemQty,
    itemAmount: itemAmount,
    carryOption: carryOption,
    totalAmount: totalAmount,
    resolveAmounts: resolveAmounts,
    validateForConfirmation: validateForConfirmation,
    accessoryChecksFor: accessoryChecksFor,
    unpricedProducts: unpricedProducts,
    unpricedCarryOptions: unpricedCarryOptions,
    unregisteredAccessoryProducts: unregisteredAccessoryProducts
  };
})();
