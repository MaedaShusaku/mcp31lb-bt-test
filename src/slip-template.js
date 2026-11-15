// slip-template.js -- 予約伝票テンプレート（Canvas 576dot）
//
// 最終仕様（2026-10 確定）:
//   印刷物は 予約1件につき
//     ・お客様控え（引換証） 1枚
//     ・店舗控え（受注書）   1枚
//     ・ご予約表（貼付用）   注文個数の合計枚数（商品1個=1枚）
//
//   mode='tag'  … 貼付用。商品1個1枚。商品名/個数1/確認のみ（金額・合計・保冷なし）。
//                 ⑦R・⑧Sのみフレーバー手書き10セル(2行×5列)。
//                 付属品確認は貼付対象の商品1個分を、slip-master.js の確定マスタから空チェック欄で印字。
//                 予約Noは「Y-0001  連番/総枚数」(分母=注文個数合計)。
//   mode='copy' … 控え。注文商品の 商品名/個数/金額 ＋ 保冷料金 ＋ 合計 ＋ 支払 済・未。
//                 フレーバー欄・付属品欄は出さない。
//
//   受付区分は予約データとして保持するが、どの伝票にも印字しない。
//   店舗名は引換証（お客様控え）だけに storeCode から印字する。
//   「備考」見出しの下は64mm以上の完全な白紙（REMARK_BLANK=64mm。罫線・文字なし。備考テキストも印字しない）。
//   価格・保冷料金は固定マスタ(slip-master.js)を使用。貼付用には価格を印字しない。
(function () {
  'use strict';

  var M = window.CY.master;

  var DPMM = 8; // 203dpi ≒ 8 dot/mm
  function mm(v) { return Math.round(v * DPMM); }

  // ---------------------------------------------------------------- レイアウト定義
  var LAYOUT = {
    W: 576, MX: 8, MT: 8,

    HDR_TITLE_W: 150, HDR_ROW_H: 40,
    NAME_H: 48, TEL_H: 40,

    // 控え(copy)の商品表 列幅（合計560）
    COL_NAME: 330, COL_QTY: 60, COL_AMT: 110, COL_CHK: 60,
    // 貼付用(tag)の商品表 列幅（金額列なし・合計560）
    COL_NAME_T: 440, COL_QTY_T: 60, COL_CHK_T: 60,

    TBL_HEAD_H: 34, ROW_PAD: 7, LINE_NAME: 25, LINE_SUB: 21, ROW_MIN_H: 38,

    // 貼付用のフレーバー手書き欄（⑦のみ）2行×5列=10セル。セル高さ約51dot（従来34の約1.5倍）
    FL_LABEL_H: 30, FL_ROWS: 2, FL_COLS: 5, FL_CELL_H: 54,

    CARRY_H: 44, TOTAL_H: 52,

    // 付属品確認欄
    ACC_HEAD_H: 30, ACC_TITLE_H: 28, ACC_ROW_H: 30, ACC_BOX: 18, ACC_PAD: 8, ACC_MAX_BOXES: 6,

    // 備考欄（見出し＋完全な白紙）。利用者確定仕様: 見出しの下 64mm 以上の完全白紙（docs/spec-confirmed.md）。
    REMARK_HEAD_H: 30, REMARK_BLANK: mm(64),

    NOTICE_LINE: 20, STAFF_BOX_W: 150, STAFF_BOX_H: 48, MB: 10,

    T_OUTER: 2, T_INNER: 2,

    FF: '"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif',
    F_TITLE: 34, F_SUBTTL: 18, F_LABEL: 17, F_VALUE: 21,
    F_HEAD: 19, F_NAME: 20, F_SUB: 16, F_NOTICE: 15, F_TOTAL: 27
  };

  // ---------------------------------------------------------------- 描画ヘルパ
  function R(ctx, dry) { this.c = ctx; this.dry = !!dry; this.L = LAYOUT; }
  R.prototype.hline = function (x, y, w, t) { if (!this.dry) this.c.fillRect(x, y, w, t || this.L.T_INNER); };
  R.prototype.vline = function (x, y, h, t) { if (!this.dry) this.c.fillRect(x, y, t || this.L.T_INNER, h); };
  R.prototype.box = function (x, y, w, h, t) { t = t || this.L.T_INNER;
    this.hline(x, y, w, t); this.hline(x, y + h - t, w, t); this.vline(x, y, h, t); this.vline(x + w - t, y, h, t); };
  R.prototype.fill = function (x, y, w, h) { if (!this.dry) this.c.fillRect(x, y, w, h); };
  R.prototype.dash = function (x, y, w, on, off) { on = on || 6; off = off || 5;
    for (var i = x; i < x + w; i += on + off) this.hline(i, y, Math.min(on, x + w - i), 1); };
  R.prototype.vdash = function (x, y, h, on, off) { on = on || 6; off = off || 5;
    for (var i = y; i < y + h; i += on + off) this.vline(x, i, Math.min(on, y + h - i), 1); };
  R.prototype.font = function (size, bold) { this.c.font = (bold ? 'bold ' : '') + size + 'px ' + this.L.FF; };
  R.prototype.text = function (s, x, y, opts) {
    opts = opts || {}; this.font(opts.size || this.L.F_LABEL, opts.bold);
    this.c.textBaseline = 'middle'; this.c.textAlign = opts.align || 'left';
    if (!this.dry) { this.c.fillStyle = opts.white ? '#fff' : '#000'; this.c.fillText(s, x, y); this.c.fillStyle = '#000'; }
    return this.c.measureText(s).width;
  };
  R.prototype.measure = function (s, size, bold) { this.font(size, bold); return this.c.measureText(s).width; };
  R.prototype.wrap = function (s, maxW, size, bold) {
    this.font(size, bold); var c = this.c, lines = [];
    function fits(t) { return c.measureText(t).width <= maxW; }
    function hardWrap(word, prefix) { var cur = prefix || '';
      for (var i = 0; i < word.length; i++) { var ch = word.charAt(i);
        if (cur !== '' && !fits(cur + ch)) { lines.push(cur.replace(/[\s　]+$/, '')); cur = ch; } else cur += ch; } return cur; }
    String(s).split('\n').forEach(function (para) {
      var words = para.match(/[^\s　]+[\s　]*/g) || [''];
      var cur = '';
      words.forEach(function (w) {
        var trimmed = w.replace(/[\s　]+$/, '');
        if (fits(cur + trimmed)) { cur += w; return; }
        if (fits(trimmed)) { if (cur !== '') lines.push(cur.replace(/[\s　]+$/, '')); cur = w; return; }
        cur = hardWrap(w, cur);
      });
      lines.push(cur.replace(/[\s　]+$/, ''));
    });
    if (lines.length === 0) lines.push(''); return lines;
  };
  R.prototype.circle = function (cx, cy, rx, ry) {
    if (this.dry) return; var c = this.c; c.save();
    c.strokeStyle = '#000'; c.lineWidth = 3; c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.stroke(); c.restore();
  };

  function measureRemark() {
    var L = LAYOUT;
    return { height: L.REMARK_BLANK, blankMm: Math.round(L.REMARK_BLANK / DPMM), ruledLines: 0, printedText: false };
  }

  // ---------------------------------------------------------------- 発注単位の列挙
  // 貼付用の枚数＝注文個数の合計。並び＝商品番号①→⑦昇順、⑦はR→S。
  // 予約Noの分母K＝注文された商品種類数(異なる商品番号の数)、分子＝商品番号順の何種類目。
  function enumerateUnits(data) {
    var items = data.items || {};
    var kinds = [];
    M.PRODUCTS.forEach(function (p) { if (M.itemQty(p.no, items[p.no]) > 0) kinds.push(p.no); });
    var units = [];
    kinds.forEach(function (no) {
      var p = M.productByNo(no);
      var it = items[no] || {};
      if (p.variants) {
        p.variants.forEach(function (vv) {
          var q = Number((it.variants || {})[vv.key]) || 0;
          for (var i = 0; i < q; i++) units.push({ no: no, size: vv.key, sizeLabel: vv.label });
        });
      } else {
        var q2 = Number(it.qty) || 0;
        for (var j = 0; j < q2; j++) units.push({ no: no, size: null, sizeLabel: null });
      }
    });
    // 貼付用の採番: 連番/総枚数（商品1個ごとに異なる連番。分母=注文個数合計）
    var total = units.length;
    units.forEach(function (u, i) { u.seq = i + 1; u.total = total; });
    return units;
  }

  // ---------------------------------------------------------------- 本体描画
  // opts: { mode:'tag'|'copy', variant:'reserve'|'exchange'|'order', data, unit, testMark }
  function render(ctx, opts, dry) {
    var L = LAYOUT;
    var r = new R(ctx, dry);
    var d = opts.data;
    var mode = opts.mode || 'copy';
    var v = M.VARIANTS[opts.variant];
    if (!v) throw new Error('未知の伝票種別: ' + opts.variant);

    var X = L.MX, CW = L.W - L.MX * 2;
    var y = L.MT;

    if (!dry) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, L.W, ctx.canvas.height); ctx.fillStyle = '#000'; }

    function blank(x) { return (x == null || x === '') ? '' : String(x); }
    function money(x) { return (x == null || x === '') ? '' : Number(x).toLocaleString('ja-JP'); }

    // ===================== ヘッダー（原本準拠 2バンド格子） =====================
    // 文字がセル幅を超える場合にフォントを縮めて収める
    function fit(s, maxW, size, bold) { var sz = size; while (sz > 10 && r.measure(s, sz, bold) > maxW) sz--; return sz; }

    var tw = L.HDR_TITLE_W;              // タイトル幅
    var ROWH = L.HDR_ROW_H;              // 36
    var UB = ROWH * 2;                   // 上段高さ（受付日/受付者の2段）=72
    var midX = X + tw, MW = 230;         // 中央列（受付日/受付者）
    var rnX = midX + MW, RNW = CW - tw - MW; // 右列（予約No.）=180

    // 上段 外枠＋縦罫線
    r.fill(X, y, tw, UB);                // タイトル白抜きベタ
    r.text(v.title, X + tw / 2, y + UB / 2 - 13, { size: L.F_TITLE, bold: true, align: 'center', white: true });
    r.text(v.subtitle, X + tw / 2, y + UB / 2 + 17, { size: L.F_SUBTTL, bold: true, align: 'center', white: true });
    r.box(X, y, CW, UB);
    r.vline(midX, y, UB); r.vline(rnX, y, UB);

    // 中央列: 受付日(上) / 受付者(下)
    r.hline(midX, y + ROWH, MW);
    // ラベル幅の実測から値の開始位置を決め、ラベルと値が接触しないようにする
    var midValX = midX + 8 + Math.max(r.measure('受付日', L.F_LABEL), r.measure('受付者', L.F_LABEL)) + 10;
    var midValW = midX + MW - 8 - midValX;
    var acceptStr = blank(d.acceptMonth) + ' 月 ' + blank(d.acceptDay) + ' 日';
    r.text('受付日', midX + 8, y + ROWH / 2, { size: L.F_LABEL });
    r.text(acceptStr, midValX, y + ROWH / 2, { size: fit(acceptStr, midValW, L.F_VALUE, true), bold: true });
    r.text('受付者', midX + 8, y + ROWH + ROWH / 2, { size: L.F_LABEL });
    r.text(blank(d.acceptStaff), midValX, y + ROWH + ROWH / 2,
           { size: fit(blank(d.acceptStaff), midValW, L.F_VALUE, true), bold: true });

    // 右列: 予約No.（上段2段分の高さ）。Y-0001 を大きく表示し、貼付用の「｜ seq/total」は小さめに併記。
    r.text('予約No.', rnX + 8, y + ROWH / 2, { size: L.F_LABEL });
    var resNo = blank(d.reserveNo);
    var suffix = (mode === 'tag' && opts.unit) ? ('  ' + opts.unit.seq + '/' + opts.unit.total) : '';
    var noY = y + ROWH + ROWH / 2 - 2;
    // Y-0001 を視認性優先で大きく（枠内に収める。接尾辞分の幅も確保）
    var sufW = suffix ? r.measure(suffix, L.F_VALUE, true) : 0;
    var bigSz = fit(resNo, RNW - 16 - sufW, 28, true);
    r.text(resNo, rnX + 8, noY, { size: bigSz, bold: true });
    if (suffix) {
      var resW = r.measure(resNo, bigSz, true);
      r.text(suffix, rnX + 8 + resW + 4, noY, { size: L.F_VALUE, bold: true });
    }

    y += UB;

    // ===================== 下段: 左=お名前/電話、右=店舗名(お客様控えのみ)/お渡し日時 =====================
    // 受付区分は予約データとして保持するが、どの伝票にも印字しない。
    var nameH = 46, telH = 40, LB = nameH + telH;
    var LW = 290, rX = X + LW, rW = CW - LW;        // 左列290 / 右列270（お渡し日時の文字を大きく保つ）
    // 引換証のみ右列上段に店舗名欄を設ける。他の伝票は欄自体を作らず、お渡し日時を右列全高で表示する。
    var showStore = (opts.variant === 'exchange');
    var storeH = showStore ? 40 : 0, pickH = LB - storeH;

    r.box(X, y, CW, LB);
    r.vline(rX, y, LB);

    // 左列: お名前（上）/ お電話番号（下）。値の開始位置はラベル実測幅から決める。
    r.hline(X, y + nameH, LW);
    r.text('お名前', X + 8, y + nameH / 2, { size: L.F_LABEL });
    var samaW = r.measure('様', L.F_VALUE, false);
    var nmX = X + 8 + r.measure('お名前', L.F_LABEL) + 12;
    var nmMaxW = (X + LW - 12 - samaW - 8) - nmX;
    r.text(blank(d.customerName), nmX, y + nameH / 2, { size: fit(blank(d.customerName), nmMaxW, 23, true), bold: true });
    r.text('様', X + LW - 12, y + nameH / 2, { size: L.F_VALUE, align: 'right' });
    r.text('お電話番号', X + 8, y + nameH + telH / 2, { size: L.F_LABEL });
    var telX = X + 8 + r.measure('お電話番号', L.F_LABEL) + 12;
    r.text(blank(d.phone), telX, y + nameH + telH / 2,
           { size: fit(blank(d.phone), X + LW - 10 - telX, L.F_VALUE, true), bold: true });

    // 右列: 店舗名（引換証のみ）/ お渡し日時
    if (showStore) {
      r.hline(rX, y + storeH, rW);
      var store = M.storeByCode(d.storeCode);
      var storeName = store ? store.name : '';
      r.text(storeName, rX + rW / 2, y + storeH / 2,
             { size: fit(storeName, rW - 20, L.F_HEAD, true), bold: true, align: 'center' });
    }
    var py = y + storeH + pickH / 2;
    r.text('お渡し', rX + 8, py, { size: L.F_LABEL });
    // 全角括弧の内側余白があるため、曜日と時刻の間に空白は入れない（幅を節約し値を大きく保つ）
    var pickStr = blank(d.pickupMonth) + '/' + blank(d.pickupDay) + '（' + blank(d.pickupWday) + '）' +
                  blank(d.pickupHour) + ':' + blank(d.pickupMin);
    var pickX = rX + 8 + r.measure('お渡し', L.F_LABEL) + 6;
    r.text(pickStr, pickX, py, { size: fit(pickStr, rX + rW - 8 - pickX, L.F_VALUE, true), bold: true });

    y += LB;

    // ===================== 商品表 =====================
    if (mode === 'tag') {
      // --- 貼付用: 商品名/個数/確認 の3列・1商品1行（金額なし） ---
      var p = M.productByNo(opts.unit.no);
      var cN = X, cQ = cN + L.COL_NAME_T, cC2 = cQ + L.COL_QTY_T;
      r.box(X, y, CW, L.TBL_HEAD_H);
      r.vline(cQ, y, L.TBL_HEAD_H); r.vline(cC2, y, L.TBL_HEAD_H);
      r.text('商 品 名', cN + L.COL_NAME_T / 2, y + L.TBL_HEAD_H / 2, { size: L.F_HEAD, bold: true, align: 'center' });
      r.text('個数', cQ + L.COL_QTY_T / 2, y + L.TBL_HEAD_H / 2, { size: L.F_HEAD, bold: true, align: 'center' });
      r.text('確認', cC2 + L.COL_CHK_T / 2, y + L.TBL_HEAD_H / 2, { size: L.F_HEAD, bold: true, align: 'center' });
      y += L.TBL_HEAD_H;

      var tName = p.mark + p.name;
      var nameW = L.COL_NAME_T - 16;
      var nameLines = r.wrap(tName, nameW, L.F_NAME, false);
      var h = Math.max(L.ROW_MIN_H, L.ROW_PAD * 2 + nameLines.length * L.LINE_NAME);
      r.hline(X, y, CW); r.vline(cQ, y, h); r.vline(cC2, y, h); r.vline(X, y, h); r.vline(X + CW - L.T_INNER, y, h);
      var ty = y + L.ROW_PAD + L.LINE_NAME / 2;
      nameLines.forEach(function (ln) { r.text(ln, cN + 8, ty, { size: L.F_NAME }); ty += L.LINE_NAME; });
      r.text('1', cQ + L.COL_QTY_T / 2, y + h / 2, { size: L.F_VALUE, bold: true, align: 'center' });
      // 確認列：手書きチェック用の空ボックス（□）を描画
      r.box(cC2 + (L.COL_CHK_T - L.ACC_BOX) / 2, y + (h - L.ACC_BOX) / 2, L.ACC_BOX, L.ACC_BOX, 2);
      y += h;

      // フレーバー手書き欄（パーティセット⑦R・⑧Sのみ・空欄10セル 2行×5列）
      if (p.party) {
        var flH = L.FL_LABEL_H + L.FL_ROWS * L.FL_CELL_H;
        r.box(X, y, CW, flH);
        r.hline(X, y + L.FL_LABEL_H, CW);
        r.text('フレーバー記入欄（' + p.party + '）10個分', X + 8, y + L.FL_LABEL_H / 2, { size: L.F_HEAD, bold: true });
        var gy = y + L.FL_LABEL_H, colW = (CW - L.T_INNER) / L.FL_COLS;
        for (var rr = 0; rr < L.FL_ROWS; rr++) {
          for (var cc = 0; cc < L.FL_COLS; cc++) {
            var gx = X + cc * colW;
            if (rr > 0) r.hline(X, gy, CW, 1);
            if (cc > 0) r.vline(gx, y + L.FL_LABEL_H, flH - L.FL_LABEL_H, 1);
            // 記入番号（1〜10）を薄く左上に
            var num = rr * L.FL_COLS + cc + 1;
            r.text(num + '.', gx + 6, gy + L.FL_CELL_H / 2, { size: L.F_SUB });
          }
          gy += L.FL_CELL_H;
        }
        y += flH;
      }

      // 付属品確認（注文された商品1個分）
      var accData = { items: {} };
      if (p.variants) { accData.items[p.no] = { variants: {} }; accData.items[p.no].variants[opts.unit.size || p.variants[0].key] = 1; }
      else accData.items[p.no] = { qty: 1 };
      var accG = M.accessoryChecksFor(accData);
      if (accG.length) {
        var g = accG[0];
        // 見出し（商品名）は切り捨てず全行を描画する。付属品名も枠幅で折り返す。
        var headLines = r.wrap(g.product.mark + g.product.name.replace(/（R・S）$/, ''), CW - 20 - L.T_INNER * 2, L.F_SUB, true);
        var lblX = X + 24 + L.ACC_BOX + 10, lblW = X + CW - 10 - lblX;
        var itemLines = g.items.map(function (label) { return r.wrap(label, lblW, L.F_SUB, false); });
        var itemsH = itemLines.reduce(function (s, ls) { return s + Math.max(L.ACC_ROW_H, ls.length * L.LINE_SUB + 8); }, 0);
        var accH = L.ACC_HEAD_H + L.ACC_PAD + headLines.length * L.ACC_TITLE_H + itemsH + L.ACC_PAD;
        r.box(X, y, CW, accH); r.hline(X, y + L.ACC_HEAD_H, CW);
        r.text('付属品確認', X + 10, y + L.ACC_HEAD_H / 2, { size: L.F_HEAD, bold: true });
        r.text('（お渡し前にご確認ください）', X + 10 + r.measure('付属品確認', L.F_HEAD, true) + 8,
               y + L.ACC_HEAD_H / 2, { size: L.F_SUB });
        var ay = y + L.ACC_HEAD_H + L.ACC_PAD;
        headLines.forEach(function (ln) {
          r.text(ln, X + 10, ay + L.ACC_TITLE_H / 2, { size: L.F_SUB, bold: true });
          ay += L.ACC_TITLE_H;
        });
        itemLines.forEach(function (ls) {
          var rowH = Math.max(L.ACC_ROW_H, ls.length * L.LINE_SUB + 8);
          var by = ay + (rowH - L.ACC_BOX) / 2;
          r.box(X + 24, by, L.ACC_BOX, L.ACC_BOX, 2);   // 空のチェック欄（手書き）
          var ly = ay + (rowH - ls.length * L.LINE_SUB) / 2 + L.LINE_SUB / 2;
          ls.forEach(function (ln) { r.text(ln, lblX, ly, { size: L.F_SUB }); ly += L.LINE_SUB; });
          ay += rowH;
        });
        y += accH;
      }
    } else {
      // --- 控え(copy): 商品名/個数/金額/確認、注文商品のみ、保冷・合計・済未 ---
      // 控えは「確認」列なし。金額列を広めに取り、5〜6桁でも枠内に収める。
      var CNW = 380, CQW = 60, CAW = 120;       // 合計=560
      var cN2 = X, cQ2 = cN2 + CNW, cA2 = cQ2 + CQW;
      // 金額を金額列(cLeft..cLeft+CAW)の右端に「円」付きで、枠内に収まるよう自動縮小して描画
      function drawMoney(numStr, cLeft, cy, base) {
        var yenW = r.measure('円', L.F_LABEL, false);
        r.text('円', cLeft + CAW - 8, cy, { size: L.F_LABEL, align: 'right' });
        if (numStr === '') return;
        var avail = CAW - 8 - yenW - 10;
        var sz = base; while (sz > 11 && r.measure(numStr, sz, true) > avail) sz--;
        r.text(numStr, cLeft + CAW - 8 - yenW - 6, cy, { size: sz, bold: true, align: 'right' });
      }

      r.box(X, y, CW, L.TBL_HEAD_H);
      r.vline(cQ2, y, L.TBL_HEAD_H); r.vline(cA2, y, L.TBL_HEAD_H);
      r.text('商 品 名', cN2 + CNW / 2, y + L.TBL_HEAD_H / 2, { size: L.F_HEAD, bold: true, align: 'center' });
      r.text('個数', cQ2 + CQW / 2, y + L.TBL_HEAD_H / 2, { size: L.F_HEAD, bold: true, align: 'center' });
      r.text('金額', cA2 + CAW / 2, y + L.TBL_HEAD_H / 2, { size: L.F_HEAD, bold: true, align: 'center' });
      y += L.TBL_HEAD_H;

      var items = d.items || {};
      M.PRODUCTS.forEach(function (p) {
        var it = items[p.no]; if (M.itemQty(p.no, it) === 0) return; // 注文商品のみ
        var nameW = CNW - 16;
        var nameLines = r.wrap(p.mark + p.name, nameW, L.F_NAME, false);
        var h = Math.max(L.ROW_MIN_H, L.ROW_PAD * 2 + nameLines.length * L.LINE_NAME);
        r.hline(X, y, CW); r.vline(cQ2, y, h); r.vline(cA2, y, h);
        r.vline(X, y, h); r.vline(X + CW - L.T_INNER, y, h);
        var ty = y + L.ROW_PAD + L.LINE_NAME / 2;
        nameLines.forEach(function (ln) { r.text(ln, cN2 + 8, ty, { size: L.F_NAME }); ty += L.LINE_NAME; });
        var qty = M.itemQty(p.no, it), amt = M.itemAmount(p.no, it), mid = y + h / 2;
        r.text(qty ? String(qty) : '', cQ2 + CQW / 2, mid, { size: L.F_VALUE, bold: true, align: 'center' });
        drawMoney(money(amt), cA2, mid, L.F_VALUE);
        y += h;
      });

      // 持ち帰り時間（保冷料金）
      r.hline(X, y, CW); r.vline(cA2, y, L.CARRY_H); r.vline(X, y, L.CARRY_H); r.vline(X + CW - L.T_INNER, y, L.CARRY_H);
      var cy0 = y + L.CARRY_H / 2, cxx = X + 8;
      // 丸囲み(左右+5dot・線幅3→外側6.5dot)が区切り「・」や括弧に掛からないよう、選択肢の前後に7dotの余白を取る。
      // 行全体が金額列の罫線(cA2)より左に収まるよう、実測して必要ならフォントを縮める。
      var CARRY_GAP = 7, CARRY_RX = 5;
      function carryW(sz) {
        var w = r.measure('持ち帰り時間（', sz, true) + r.measure('）', sz, true);
        M.CARRY_OPTIONS.forEach(function (o, i) { w += (i > 0 ? r.measure('・', sz, true) : 0) + CARRY_GAP * 2 + r.measure(o.label, sz, true); });
        return w;
      }
      var cSz = L.F_HEAD; while (cSz > 14 && carryW(cSz) > cA2 - 8 - cxx) cSz--;
      r.text('持ち帰り時間（', cxx, cy0, { size: cSz, bold: true }); cxx += r.measure('持ち帰り時間（', cSz, true);
      M.CARRY_OPTIONS.forEach(function (o, i) {
        if (i > 0) { r.text('・', cxx, cy0, { size: cSz, bold: true }); cxx += r.measure('・', cSz, true); }
        cxx += CARRY_GAP;
        var ow = r.measure(o.label, cSz, true); r.text(o.label, cxx, cy0, { size: cSz, bold: true });
        if (d.carryKey === o.key) r.circle(cxx + ow / 2, cy0, ow / 2 + CARRY_RX, 15); cxx += ow + CARRY_GAP;
      });
      r.text('）', cxx, cy0, { size: cSz, bold: true });
      var co = M.carryOption(d.carryKey);
      drawMoney(co && co.fee != null ? money(co.fee) : '', cA2, cy0, L.F_VALUE);
      y += L.CARRY_H;

      // 合計金額 ＋ 支払（済・未）。丸囲み(半径+線幅)が「支払」ラベル・区切り・隣の文字に掛からない位置を実測で決める。
      r.hline(X, y, CW); r.vline(cA2, y, L.TOTAL_H); r.vline(X, y, L.TOTAL_H); r.vline(X + CW - L.T_INNER, y, L.TOTAL_H); r.hline(X, y + L.TOTAL_H, CW);
      var ty0 = y + L.TOTAL_H / 2;
      r.text('合 計 金 額', X + 12, ty0, { size: L.F_TOTAL, bold: true });
      var sLabelX = X + 12 + r.measure('合 計 金 額', L.F_TOTAL, true) + 30;
      r.text('支払', sLabelX, ty0, { size: L.F_HEAD, bold: true });
      var sw = r.measure('済', L.F_HEAD, true), sepW = r.measure('・', L.F_HEAD, true);
      var crx = sw / 2 + 6, cry = 15, PAY_GAP = 6;               // 丸の半径（線幅3の外側1.5も見込む）
      var paidX = sLabelX + r.measure('支払', L.F_HEAD, true) + PAY_GAP + crx + 2;
      var sepX = paidX + crx + 2 + PAY_GAP;                     // 区切り「・」の左端
      var unpaidX = sepX + sepW + PAY_GAP + crx + 2;
      r.text('済', paidX, ty0, { size: L.F_HEAD, bold: true, align: 'center' });
      r.text('・', sepX, ty0, { size: L.F_HEAD, bold: true });
      r.text('未', unpaidX, ty0, { size: L.F_HEAD, bold: true, align: 'center' });
      if (d.paid === true) r.circle(paidX, ty0, crx, cry);
      if (d.paid === false) r.circle(unpaidX, ty0, crx, cry);
      drawMoney(money(M.totalAmount(d)), cA2, ty0, L.F_TOTAL);
      y += L.TOTAL_H + L.T_INNER;
    }

    // ===================== 備考（見出し＋無罫線白紙） =====================
    var rm = measureRemark();
    r.box(X, y, CW, L.REMARK_HEAD_H + rm.height);
    r.hline(X, y + L.REMARK_HEAD_H, CW);
    r.text('備 考', X + 10, y + L.REMARK_HEAD_H / 2, { size: L.F_HEAD, bold: true });
    rm.rect = { x: X, y: y + L.REMARK_HEAD_H, w: CW, h: rm.height };
    y += L.REMARK_HEAD_H + rm.height;

    // ===================== 下部: 担当欄(貼付用のみ) ／ 注意文(引換証のみ) =====================
    //   貼付用  … お客様確認／担当 の独立枠（項目名は上・下に押印空白）。注意文は無し。
    //   引換証  … 個人情報の注意文のみ。担当欄は無し。
    //   受注書  … どちらも無し。
    var showStaff = (mode === 'tag');
    var showNotice = (opts.variant === 'exchange');

    if (showStaff || showNotice) {
      y += 8;
      var STAFF_LABEL_H = 28;
      var STAFF_STAMP_H = mm(15);               // 押印用の空白 ≒ 120dot
      var STAFF_H = STAFF_LABEL_H + STAFF_STAMP_H;
      var BOX_PICK_W = 120;                      // お客様確認（記入）
      var BOX_STAFF_W = 140;                     // 担当（直径15mmの印鑑が入る幅）
      var sbx = X + CW - (BOX_PICK_W + BOX_STAFF_W);

      var noticeH = 0;
      if (showNotice) {
        // 注意文は、担当欄がある場合はその左側、無い場合は全幅で折り返す
        var noticeW = (showStaff ? (sbx - X - 12) : CW);
        var nLines = r.wrap(M.NOTICE, noticeW, L.F_NOTICE, false);
        noticeH = nLines.length * L.NOTICE_LINE; var ny = y;
        nLines.forEach(function (ln) { r.text(ln, X, ny + L.NOTICE_LINE / 2, { size: L.F_NOTICE }); ny += L.NOTICE_LINE; });
      }

      var staffH = 0;
      if (showStaff) {
        staffH = STAFF_H;
        r.box(sbx, y, BOX_PICK_W, STAFF_H);
        r.hline(sbx, y + STAFF_LABEL_H, BOX_PICK_W);
        r.text('お客様確認', sbx + BOX_PICK_W / 2, y + STAFF_LABEL_H / 2, { size: L.F_LABEL, align: 'center' });
        var stx = sbx + BOX_PICK_W;
        r.box(stx, y, BOX_STAFF_W, STAFF_H);
        r.hline(stx, y + STAFF_LABEL_H, BOX_STAFF_W);
        r.text('担当', stx + BOX_STAFF_W / 2, y + STAFF_LABEL_H / 2, { size: L.F_LABEL, align: 'center' });
      }

      y += Math.max(noticeH, staffH);
    }

    if (opts.testMark) { y += 6; r.text('【テスト印刷 / ' + opts.testMark + '】', X, y + 9, { size: L.F_SUB }); y += 20; }

    y += L.MB;
    return { height: y, remark: rm };
  }

  // ---------------------------------------------------------------- 公開API
  function renderToCanvas(opts) {
    var probe = document.createElement('canvas'); probe.width = LAYOUT.W; probe.height = 10;
    var measured = render(probe.getContext('2d'), opts, true);
    var canvas = document.createElement('canvas'); canvas.width = LAYOUT.W; canvas.height = measured.height;
    var ctx = canvas.getContext('2d');
    var result = render(ctx, opts, false);
    return { canvas: canvas, context: ctx, height: result.height, remark: result.remark };
  }

  function buildRequest(opts) {
    var B = new StarWebPrintBuilder();
    var out = renderToCanvas(opts);
    var req = B.createInitializationElement({ reset: 'true' });
    req += B.createBitImageElement({ context: out.context, x: 0, y: 0, width: out.canvas.width, height: out.canvas.height });
    req += B.createFeedElement({ line: opts.feedLines || 2 });
    req += B.createCutPaperElement({ feed: 'true', type: 'partial' });
    return { request: req, canvas: out.canvas, heightDots: out.canvas.height,
             heightMm: Math.round(out.canvas.height / DPMM), bytes: req.length, remark: out.remark };
  }

  // 貼付用1枚（unit 指定）
  function buildTagger(data, unit, testMark) {
    var built = buildRequest({ mode: 'tag', variant: 'reserve', data: data, unit: unit, testMark: testMark });
    var p = M.productByNo(unit.no);
    built.name = 'ご予約表(貼付用) ' + p.mark + (unit.sizeLabel ? '（' + unit.sizeLabel + '）' : '') +
                 ' ' + unit.seq + '/' + unit.total;
    built.unit = unit;
    return built;
  }
  // 貼付用の全枚数（注文個数分）
  function buildTaggers(data, testMark) {
    return enumerateUnits(data).map(function (u) { return buildTagger(data, u, testMark); });
  }
  // 控え（kind: 'customer'=引換証 / 'store'=受注書）
  function buildCopy(data, kind, testMark) {
    var variant = (kind === 'customer') ? 'exchange' : 'order';
    var built = buildRequest({ mode: 'copy', variant: variant, data: data, testMark: testMark });
    built.name = M.VARIANTS[variant].title + M.VARIANTS[variant].subtitle;
    return built;
  }
  // 予約1件の全印刷ジョブ（お客様控え→店舗控え→貼付用×個数）
  function buildAll(data, testMark) {
    return [buildCopy(data, 'customer', testMark), buildCopy(data, 'store', testMark)]
      .concat(buildTaggers(data, testMark));
  }

  window.CY = window.CY || {};
  window.CY.slipTemplate = {
    LAYOUT: LAYOUT, mm: mm,
    enumerateUnits: enumerateUnits,
    render: render, renderToCanvas: renderToCanvas, buildRequest: buildRequest,
    buildTagger: buildTagger, buildTaggers: buildTaggers, buildCopy: buildCopy, buildAll: buildAll,
    measureRemark: measureRemark,
    // 検証用: 本体と同じ折返し処理（ctx の measureText を使用）
    wrapLines: function (ctx, s, maxW, size, bold) { return new R(ctx, true).wrap(s, maxW, size, bold); }
  };
})();
