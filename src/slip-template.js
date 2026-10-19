// slip-template.js -- 予約伝票テンプレート（Canvas 576dot）
//
// 最終仕様（2026-10 確定）:
//   印刷物は 予約1件につき
//     ・お客様控え（引換証） 1枚
//     ・店舗控え（受注書）   1枚
//     ・ご予約表（貼付用）   注文個数の合計枚数（商品1個=1枚）
//
//   mode='tag'  … 貼付用。商品1個1枚。商品名/個数1/確認のみ（金額・合計・保冷なし）。
//                 ⑦のみフレーバー手書き10セル(5行×2列)。③/⑦のみ付属品確認(1個分)。
//                 予約Noは「Y-0001 ｜ 2/4」(分母=商品種類数, 分子=商品番号順の何種類目)。
//   mode='copy' … 控え。全注文商品の 商品名/個数/金額/確認 ＋ 保冷料金 ＋ 合計 ＋ 済・未。
//                 フレーバー欄・付属品欄は出さない。
//
//   「備考」見出しの下は無罫線白紙（REMARK_BLANK。まず30mm。LAYOUTで変更可）。
//   価格・保冷料金は固定マスタ(slip-master.js)を使用。貼付用には価格を印字しない。
(function () {
  'use strict';

  var M = window.CY.master;

  var DPMM = 8; // 203dpi ≒ 8 dot/mm
  function mm(v) { return Math.round(v * DPMM); }

  // ---------------------------------------------------------------- レイアウト定義
  var LAYOUT = {
    W: 576, MX: 8, MT: 8,

    HDR_TITLE_W: 150, HDR_ROW_H: 36,
    NAME_H: 44, TEL_H: 36,

    // 控え(copy)の商品表 列幅（合計560）
    COL_NAME: 330, COL_QTY: 60, COL_AMT: 110, COL_CHK: 60,
    // 貼付用(tag)の商品表 列幅（金額列なし・合計560）
    COL_NAME_T: 440, COL_QTY_T: 60, COL_CHK_T: 60,

    TBL_HEAD_H: 30, ROW_PAD: 6, LINE_NAME: 23, LINE_SUB: 19, ROW_MIN_H: 34,

    // 貼付用のフレーバー手書き欄（⑦のみ）5行×2列=10セル
    FL_LABEL_H: 26, FL_ROWS: 5, FL_COLS: 2, FL_CELL_H: 34,

    CARRY_H: 40, TOTAL_H: 48,

    // 付属品確認欄
    ACC_HEAD_H: 26, ACC_TITLE_H: 24, ACC_ROW_H: 26, ACC_BOX: 16, ACC_PAD: 8, ACC_MAX_BOXES: 6,

    // 備考欄（見出し＋無罫線白紙）。まず30mm。手書き領域は後から調整しやすいよう定数化。
    REMARK_HEAD_H: 26, REMARK_BLANK: mm(30),

    NOTICE_LINE: 18, STAFF_BOX_W: 150, STAFF_BOX_H: 44, MB: 10,

    T_OUTER: 2, T_INNER: 2,

    FF: '"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif',
    F_TITLE: 30, F_SUBTTL: 16, F_LABEL: 15, F_VALUE: 19,
    F_HEAD: 17, F_NAME: 18, F_SUB: 14, F_NOTICE: 13, F_TOTAL: 24
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
        if (cur !== '' && !fits(cur + ch)) { lines.push(cur); cur = ch; } else cur += ch; } return cur; }
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
    var K = kinds.length;
    var units = [];
    kinds.forEach(function (no, idx) {
      var kindIndex = idx + 1;
      var p = M.productByNo(no);
      var it = items[no] || {};
      if (p.variants) {
        p.variants.forEach(function (vv) {
          var q = Number((it.variants || {})[vv.key]) || 0;
          for (var i = 0; i < q; i++) units.push({ no: no, size: vv.key, sizeLabel: vv.label, kindIndex: kindIndex, kindCount: K });
        });
      } else {
        var q2 = Number(it.qty) || 0;
        for (var j = 0; j < q2; j++) units.push({ no: no, size: null, sizeLabel: null, kindIndex: kindIndex, kindCount: K });
      }
    });
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

    // ===================== ヘッダー =====================
    var hdrH = L.HDR_ROW_H * 3;
    var tx = X, tw = L.HDR_TITLE_W;
    r.fill(tx, y, tw, hdrH);
    r.text(v.title, tx + tw / 2, y + hdrH / 2 - 14, { size: L.F_TITLE, bold: true, align: 'center', white: true });
    r.text(v.subtitle, tx + tw / 2, y + hdrH / 2 + 18, { size: L.F_SUBTTL, bold: true, align: 'center', white: true });

    var rx = X + tw, rw = CW - tw;
    r.box(rx, y, rw, hdrH);

    var r1 = y, w1 = 200;
    r.vline(rx + w1, r1, L.HDR_ROW_H);
    r.text('受付日', rx + 8, r1 + L.HDR_ROW_H / 2, { size: L.F_LABEL });
    r.text(blank(d.acceptMonth) + '  月  ' + blank(d.acceptDay) + '  日', rx + 60, r1 + L.HDR_ROW_H / 2, { size: L.F_VALUE, bold: true });
    r.text('予約No.', rx + w1 + 8, r1 + L.HDR_ROW_H / 2, { size: L.F_LABEL });
    // 貼付用は「Y-0001 ｜ k/K」。控えは予約番号のみ。
    var noStr = blank(d.reserveNo);
    r.text(noStr, rx + w1 + 60, r1 + L.HDR_ROW_H / 2, { size: L.F_VALUE, bold: true });
    if (mode === 'tag' && opts.unit) {
      var noW = r.measure(noStr, L.F_VALUE, true);
      r.text(' ｜ ' + opts.unit.kindIndex + '/' + opts.unit.kindCount,
             rx + w1 + 60 + noW + 2, r1 + L.HDR_ROW_H / 2, { size: L.F_LABEL, bold: true });
    }

    var r2 = y + L.HDR_ROW_H, w2 = 150;
    r.hline(rx, r2, rw); r.vline(rx + w2, r2, L.HDR_ROW_H);
    r.text('受付者', rx + 8, r2 + L.HDR_ROW_H / 2, { size: L.F_LABEL });
    r.text(blank(d.acceptStaff), rx + 62, r2 + L.HDR_ROW_H / 2, { size: L.F_VALUE, bold: true });
    var kx = rx + w2 + 10, ky = r2 + L.HDR_ROW_H / 2;
    M.ACCEPT_KINDS.forEach(function (k, i) {
      if (i > 0) { r.text('・', kx, ky, { size: L.F_LABEL }); kx += r.measure('・', L.F_LABEL); }
      var kw = r.measure(k, L.F_LABEL); r.text(k, kx, ky, { size: L.F_LABEL });
      if (d.acceptKind === k) r.circle(kx + kw / 2, ky, kw / 2 + 6, 13); kx += kw;
    });

    var r3 = y + L.HDR_ROW_H * 2;
    r.hline(rx, r3, rw);
    r.text('お渡し日時', rx + 8, r3 + L.HDR_ROW_H / 2, { size: L.F_LABEL });
    r.text(blank(d.pickupMonth) + ' 月 ' + blank(d.pickupDay) + ' 日（' + blank(d.pickupWday) + '） ' +
           blank(d.pickupHour) + ' 時 ' + blank(d.pickupMin) + ' 分', rx + 88, r3 + L.HDR_ROW_H / 2, { size: L.F_VALUE, bold: true });
    y += hdrH;

    // ===================== お客様情報 =====================
    r.box(X, y, CW, L.NAME_H);
    r.text('お名前', X + 8, y + L.NAME_H / 2, { size: L.F_LABEL });
    r.text(blank(d.customerName), X + 70, y + L.NAME_H / 2, { size: 22, bold: true });
    r.text('様', X + CW - 12, y + L.NAME_H / 2, { size: L.F_VALUE, align: 'right' });
    y += L.NAME_H;
    r.box(X, y, CW, L.TEL_H);
    r.text('お電話番号', X + 8, y + L.TEL_H / 2, { size: L.F_LABEL });
    r.text(blank(d.phone), X + 92, y + L.TEL_H / 2, { size: L.F_VALUE, bold: true });
    y += L.TEL_H;

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
      if (p.variants && opts.unit.size) tName = p.mark + p.name.replace(/（R・S）$/, '') + '（' + opts.unit.sizeLabel + '）';
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

      // フレーバー手書き欄（⑦のみ・空欄10セル 5行×2列）
      if (p.no === 7) {
        var flH = L.FL_LABEL_H + L.FL_ROWS * L.FL_CELL_H;
        r.box(X, y, CW, flH);
        r.hline(X, y + L.FL_LABEL_H, CW);
        r.text('フレーバー記入欄（' + (opts.unit.sizeLabel || '') + '）10個分', X + 8, y + L.FL_LABEL_H / 2, { size: L.F_HEAD, bold: true });
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

      // 付属品確認（③/⑦のみ・1個分）
      var accData = { items: {} };
      if (p.variants) { accData.items[p.no] = { variants: {} }; accData.items[p.no].variants[opts.unit.size || p.variants[0].key] = 1; }
      else accData.items[p.no] = { qty: 1 };
      var accG = M.accessoryChecksFor(accData);
      if (accG.length) {
        var g = accG[0];
        var accH = L.ACC_HEAD_H + L.ACC_PAD + L.ACC_TITLE_H + g.items.length * L.ACC_ROW_H + L.ACC_PAD;
        r.box(X, y, CW, accH); r.hline(X, y + L.ACC_HEAD_H, CW);
        r.text('付属品確認', X + 10, y + L.ACC_HEAD_H / 2, { size: L.F_HEAD, bold: true });
        r.text('（お渡し前にご確認ください）', X + 108, y + L.ACC_HEAD_H / 2, { size: L.F_SUB });
        var ay = y + L.ACC_HEAD_H + L.ACC_PAD;
        var head = r.wrap(g.product.mark + g.product.name.replace(/（R・S）$/, ''), CW - 40, L.F_SUB, true)[0];
        r.text(head, X + 10, ay + L.ACC_TITLE_H / 2, { size: L.F_SUB, bold: true });
        ay += L.ACC_TITLE_H;
        g.items.forEach(function (label) {
          var by = ay + (L.ACC_ROW_H - L.ACC_BOX) / 2;
          r.box(X + 24, by, L.ACC_BOX, L.ACC_BOX, 2);
          r.text(label, X + 24 + L.ACC_BOX + 10, ay + L.ACC_ROW_H / 2, { size: L.F_SUB });
          ay += L.ACC_ROW_H;
        });
        y += accH;
      }
    } else {
      // --- 控え(copy): 商品名/個数/金額/確認、注文商品のみ、保冷・合計・済未 ---
      var cN2 = X, cQ2 = cN2 + L.COL_NAME, cA2 = cQ2 + L.COL_QTY, cC3 = cA2 + L.COL_AMT;
      r.box(X, y, CW, L.TBL_HEAD_H);
      r.text('商 品 名', cN2 + L.COL_NAME / 2, y + L.TBL_HEAD_H / 2, { size: L.F_HEAD, bold: true, align: 'center' });
      r.text('個数', cQ2 + L.COL_QTY / 2, y + L.TBL_HEAD_H / 2, { size: L.F_HEAD, bold: true, align: 'center' });
      r.text('金額', cA2 + L.COL_AMT / 2, y + L.TBL_HEAD_H / 2, { size: L.F_HEAD, bold: true, align: 'center' });
      r.text('確認', cC3 + L.COL_CHK / 2, y + L.TBL_HEAD_H / 2, { size: L.F_HEAD, bold: true, align: 'center' });
      y += L.TBL_HEAD_H;

      var items = d.items || {};
      M.PRODUCTS.forEach(function (p) {
        var it = items[p.no]; if (M.itemQty(p.no, it) === 0) return; // 注文商品のみ
        var nameW = L.COL_NAME - 16;
        var nameLines = r.wrap(p.mark + p.name, nameW, L.F_NAME, false);
        var breakdown = null;
        if (p.variants) {
          var ordered = p.variants.filter(function (vv) { return (Number((it.variants || {})[vv.key]) || 0) > 0; });
          if (ordered.length > 1) breakdown = ordered.map(function (vv) { return vv.label + ' ' + it.variants[vv.key] + '個'; }).join(' ／ ');
        }
        var bdLines = breakdown ? r.wrap(breakdown, nameW - 14, L.F_SUB, false) : [];
        var h = Math.max(L.ROW_MIN_H, L.ROW_PAD * 2 + nameLines.length * L.LINE_NAME + bdLines.length * L.LINE_SUB);
        r.hline(X, y, CW); r.vline(cQ2, y, h); r.vline(cA2, y, h); r.vline(cC3, y, h);
        r.vline(X, y, h); r.vline(X + CW - L.T_INNER, y, h);
        var ty = y + L.ROW_PAD + L.LINE_NAME / 2;
        nameLines.forEach(function (ln) { r.text(ln, cN2 + 8, ty, { size: L.F_NAME }); ty += L.LINE_NAME; });
        bdLines.forEach(function (ln) { r.text(ln, cN2 + 22, ty - L.LINE_NAME / 2 + L.LINE_SUB / 2, { size: L.F_SUB, bold: true }); ty += L.LINE_SUB; });
        // ⑦の（R・S）丸囲み
        if (p.variants) {
          var vy = y + L.ROW_PAD + L.LINE_NAME / 2;
          nameLines.forEach(function (ln) {
            p.variants.forEach(function (vv) {
              var q = Number((it.variants || {})[vv.key]) || 0; if (q === 0) return;
              var paren = ln.indexOf('（'); var at = ln.indexOf(vv.label);
              if (at < 0 || paren < 0 || at < paren) return;
              var preW = r.measure(ln.slice(0, at), L.F_NAME, false);
              var chW = r.measure(vv.label, L.F_NAME, false);
              r.circle(cN2 + 8 + preW + chW / 2, vy, chW / 2 + 5, 12);
            });
            vy += L.LINE_NAME;
          });
        }
        var qty = M.itemQty(p.no, it), amt = M.itemAmount(p.no, it), mid = y + h / 2;
        r.text(qty ? String(qty) : '', cQ2 + L.COL_QTY / 2, mid, { size: L.F_VALUE, bold: true, align: 'center' });
        r.text('円', cA2 + L.COL_AMT - 8, mid, { size: L.F_LABEL, align: 'right' });
        r.text(money(amt), cA2 + L.COL_AMT - 30, mid, { size: L.F_VALUE, bold: true, align: 'right' });
        y += h;
      });

      // 持ち帰り時間（保冷料金）
      r.hline(X, y, CW); r.vline(cA2, y, L.CARRY_H); r.vline(cC3, y, L.CARRY_H);
      r.vline(X, y, L.CARRY_H); r.vline(X + CW - L.T_INNER, y, L.CARRY_H);
      var cy0 = y + L.CARRY_H / 2, cxx = X + 8;
      r.text('持ち帰り時間（', cxx, cy0, { size: L.F_HEAD, bold: true }); cxx += r.measure('持ち帰り時間（', L.F_HEAD, true);
      M.CARRY_OPTIONS.forEach(function (o, i) {
        if (i > 0) { r.text('・', cxx, cy0, { size: L.F_HEAD, bold: true }); cxx += r.measure('・', L.F_HEAD, true); }
        var ow = r.measure(o.label, L.F_HEAD, true); r.text(o.label, cxx, cy0, { size: L.F_HEAD, bold: true });
        if (d.carryKey === o.key) r.circle(cxx + ow / 2, cy0, ow / 2 + 6, 15); cxx += ow;
      });
      r.text('）', cxx, cy0, { size: L.F_HEAD, bold: true });
      r.text('円', cA2 + L.COL_AMT - 8, cy0, { size: L.F_LABEL, align: 'right' });
      var co = M.carryOption(d.carryKey);
      r.text(co && co.fee != null ? money(co.fee) : '', cA2 + L.COL_AMT - 30, cy0, { size: L.F_VALUE, bold: true, align: 'right' });
      y += L.CARRY_H;

      // 合計 ＋ 済・未
      r.hline(X, y, CW); r.vline(cA2, y, L.TOTAL_H); r.vline(cC3, y, L.TOTAL_H);
      r.vline(X, y, L.TOTAL_H); r.vline(X + CW - L.T_INNER, y, L.TOTAL_H); r.hline(X, y + L.TOTAL_H, CW);
      var ty0 = y + L.TOTAL_H / 2;
      r.text('合 計 金 額', X + 16, ty0, { size: L.F_TOTAL, bold: true });
      r.text('円', cA2 + L.COL_AMT - 8, ty0, { size: L.F_LABEL, align: 'right' });
      r.text(money(M.totalAmount(d)), cA2 + L.COL_AMT - 30, ty0, { size: 21, bold: true, align: 'right' });
      var sx = cC3 + L.COL_CHK / 2, sw = r.measure('済', L.F_HEAD, true);
      r.text('済・未', sx, ty0, { size: L.F_HEAD, bold: true, align: 'center' });
      if (d.paid === true) r.circle(sx - 17, ty0, sw / 2 + 5, 13);
      if (d.paid === false) r.circle(sx + 17, ty0, sw / 2 + 5, 13);
      y += L.TOTAL_H + L.T_INNER;
    }

    // ===================== 備考（見出し＋無罫線白紙） =====================
    var rm = measureRemark();
    r.box(X, y, CW, L.REMARK_HEAD_H + rm.height);
    r.hline(X, y + L.REMARK_HEAD_H, CW);
    r.text('備 考', X + 10, y + L.REMARK_HEAD_H / 2, { size: L.F_HEAD, bold: true });
    rm.rect = { x: X, y: y + L.REMARK_HEAD_H, w: CW, h: rm.height };
    y += L.REMARK_HEAD_H + rm.height;

    // ===================== 注意文 ＋ お引取り時/担当 =====================
    y += 8;
    var noticeW = CW - L.STAFF_BOX_W - 12;
    var nLines = r.wrap(M.NOTICE, noticeW, L.F_NOTICE, false);
    var noticeH = nLines.length * L.NOTICE_LINE, ny = y;
    nLines.forEach(function (ln) { r.text(ln, X, ny + L.NOTICE_LINE / 2, { size: L.F_NOTICE }); ny += L.NOTICE_LINE; });
    var sbx = X + CW - L.STAFF_BOX_W;
    r.box(sbx, y, L.STAFF_BOX_W, L.STAFF_BOX_H);
    r.vline(sbx + 92, y, L.STAFF_BOX_H);
    r.text('お引取り時', sbx + 46, y + L.STAFF_BOX_H / 2, { size: L.F_LABEL, align: 'center' });
    r.text('担当', sbx + 92 + 29, y + L.STAFF_BOX_H / 2, { size: L.F_LABEL, align: 'center' });
    y += Math.max(noticeH, L.STAFF_BOX_H);

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
                 ' ' + unit.kindIndex + '/' + unit.kindCount;
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
    measureRemark: measureRemark
  };
})();
