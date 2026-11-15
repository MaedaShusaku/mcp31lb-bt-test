// slip-verify-core.js -- 帳票（slip-template.js）の机上検証ロジック
//
// 描画命令（fillText / fillRect / ellipse）を記録する Recorder を ctx として
// slip-template.js の render() に渡し、描画結果を意味的・幾何的に検査する。
//   ・ブラウザ（verify-slip.html）: 実 Canvas の measureText で計測し、同時にプレビューを描く
//   ・node（verify-slip-node.js） : フォント幅の近似値で計測（実機フォントとは異なる）
// どちらの合格も、実機（mC-Print3）での紙の寸法・文字・罫線・排紙の合格を意味しない。
(function (root) {
  'use strict';

  var ACCEPT_TEXT_MIN_SIZE = { F_TITLE: 34, F_NAME: 20, F_LABEL: 17, F_VALUE: 21, F_NOTICE: 15 };

  // ------------------------------------------------------------ Recorder（記録用 ctx）
  // real: 実 CanvasRenderingContext2D（あれば描画と計測を委譲）/ approxMeasure: 近似計測関数
  function Recorder(real, approxMeasure, width, height) {
    this.real = real || null;
    this.approx = approxMeasure;
    this.canvas = real ? real.canvas : makeFakeCanvas(width, height, this);
    this._font = '10px sans-serif'; this.textBaseline = 'alphabetic'; this.textAlign = 'left';
    this.fillStyle = '#000'; this.strokeStyle = '#000'; this.lineWidth = 1;
    this.texts = []; this.rects = []; this.circles = [];
    this._stack = []; this._ell = null;
  }
  Object.defineProperty(Recorder.prototype, 'font', {
    get: function () { return this._font; },
    set: function (v) { this._font = v; if (this.real) this.real.font = v; }
  });
  Recorder.prototype._fontInfo = function () {
    var m = /(bold\s+)?(\d+(?:\.\d+)?)px/.exec(this._font) || [];
    return { bold: !!m[1], size: Number(m[2]) || 10 };
  };
  Recorder.prototype.measureText = function (s) {
    if (this.real) { this.real.font = this._font; return this.real.measureText(s); }
    var f = this._fontInfo(); return { width: this.approx(String(s), f.size, f.bold) };
  };
  Recorder.prototype._sync = function () {
    if (!this.real) return;
    var c = this.real; c.font = this._font; c.textBaseline = this.textBaseline; c.textAlign = this.textAlign;
    c.fillStyle = this.fillStyle; c.strokeStyle = this.strokeStyle; c.lineWidth = this.lineWidth;
  };
  function isWhite(style) { return /^#fff(fff)?$/i.test(String(style)) || /^white$/i.test(String(style)); }
  Recorder.prototype.fillRect = function (x, y, w, h) {
    this.rects.push({ x: x, y: y, w: w, h: h, white: isWhite(this.fillStyle) });
    if (this.real) { this._sync(); this.real.fillRect(x, y, w, h); }
  };
  Recorder.prototype.fillText = function (s, x, y) {
    var f = this._fontInfo(), w = this.measureText(s).width;
    var l = this.textAlign === 'center' ? x - w / 2 : (this.textAlign === 'right' || this.textAlign === 'end') ? x - w : x;
    // textBaseline='middle' 前提で、上下は em ボックス（±size/2）で近似する
    this.texts.push({ s: String(s), x: x, y: y, size: f.size, bold: f.bold, align: this.textAlign,
      white: isWhite(this.fillStyle), w: w, l: l, r: l + w, t: y - f.size / 2, b: y + f.size / 2 });
    if (this.real) { this._sync(); this.real.fillText(s, x, y); }
  };
  Recorder.prototype.save = function () {
    this._stack.push([this._font, this.textBaseline, this.textAlign, this.fillStyle, this.strokeStyle, this.lineWidth]);
    if (this.real) this.real.save();
  };
  Recorder.prototype.restore = function () {
    var s = this._stack.pop();
    if (s) { this._font = s[0]; this.textBaseline = s[1]; this.textAlign = s[2]; this.fillStyle = s[3]; this.strokeStyle = s[4]; this.lineWidth = s[5]; }
    if (this.real) this.real.restore();
  };
  Recorder.prototype.beginPath = function () { this._ell = null; if (this.real) this.real.beginPath(); };
  Recorder.prototype.ellipse = function (cx, cy, rx, ry, rot, a0, a1) {
    this._ell = { cx: cx, cy: cy, rx: rx, ry: ry };
    if (this.real) this.real.ellipse(cx, cy, rx, ry, rot, a0, a1);
  };
  Recorder.prototype.stroke = function () {
    if (this._ell) { var e = this._ell; e.lw = this.lineWidth; this.circles.push(e); }
    if (this.real) { this._sync(); this.real.stroke(); }
  };
  Recorder.prototype.getImageData = function (x, y, w, h) {
    if (this.real) return this.real.getImageData(x, y, w, h);
    return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  };

  function makeFakeCanvas(width, height, ctx) {
    return { width: width || 576, height: height || 10, getContext: function () { return ctx; } };
  }

  // node 用の近似幅（Hiragino 系を想定し、やや広めに見積もる）
  function approxMeasure(s, size, bold) {
    var w = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      // 2026-11-14 実測(Hiragino): bold数字≈0.74em / 通常数字≈0.67em / 空白≈0.33em → やや広めに見積もる
      if (c === 0x20) w += 0.34;
      else if (c < 0x7f) w += bold ? 0.76 : 0.70;
      else if (c >= 0xff61 && c <= 0xff9f) w += 0.5;
      else w += 1.0;
    }
    return w * size;
  }

  // ------------------------------------------------------------ 幾何検査
  function inter(a, b, tol) {
    tol = tol || 0;
    return a.l < b.r - tol && b.l < a.r - tol && a.t < b.b - tol && b.t < a.b - tol;
  }
  function rectBox(r) { return { l: r.x, r: r.x + r.w, t: r.y, b: r.y + r.h }; }
  function circleBox(c) { var e = (c.lw || 1) / 2; return { l: c.cx - c.rx - e, r: c.cx + c.rx + e, t: c.cy - c.ry - e, b: c.cy + c.ry + e }; }
  function visible(t) { return t.s.replace(/[\s　]/g, '') !== ''; }
  function label(t) { return '「' + t.s + '」@(' + Math.round(t.l) + ',' + Math.round(t.t) + ')'; }

  // 罫線・塗り・文字・丸囲みの重なり、セル/用紙はみ出しを検出する
  function layoutIssues(rec, W, H) {
    var issues = [];
    var black = rec.rects.filter(function (r) { return !r.white; });
    var rules = black.filter(function (r) { return Math.min(r.w, r.h) <= 3; });
    var fills = black.filter(function (r) { return Math.min(r.w, r.h) > 3; });
    var texts = rec.texts.filter(visible);

    texts.forEach(function (t) {
      if (t.l < 0 || t.r > W || t.t < 0 || t.b > H) issues.push({ kind: '用紙外', box: t, msg: label(t) + ' が用紙の外にはみ出す' });
      if (t.white) {
        if (!fills.some(function (f) { var b = rectBox(f); return t.l >= b.l && t.r <= b.r && t.t >= b.t && t.b <= b.b; }))
          issues.push({ kind: '白抜き', box: t, msg: label(t) + ' 白抜き文字が黒ベタからはみ出す' });
        return;
      }
      rules.forEach(function (r) {
        if (inter(t, rectBox(r), 0.5)) issues.push({ kind: 'セル超過', box: t,
          msg: label(t) + ' が罫線(' + r.x + ',' + r.y + ',' + r.w + 'x' + r.h + ')に重なる' });
      });
      fills.forEach(function (f) {
        if (inter(t, rectBox(f), 0.5)) issues.push({ kind: '塗り重なり', box: t, msg: label(t) + ' が黒ベタに重なる' });
      });
    });

    for (var i = 0; i < texts.length; i++) {
      for (var j = i + 1; j < texts.length; j++) {
        if (inter(texts[i], texts[j], 0.5)) issues.push({ kind: '文字重なり', box: texts[i],
          msg: label(texts[i]) + ' と ' + label(texts[j]) + ' が重なる' });
      }
    }

    rec.circles.forEach(function (c) {
      var cb = circleBox(c);
      var targets = texts.filter(function (t) { return Math.abs((t.l + t.r) / 2 - c.cx) < 2.5 && Math.abs((t.t + t.b) / 2 - c.cy) < 2.5; });
      if (targets.length !== 1) { issues.push({ kind: '丸囲み', box: cb, msg: '丸囲み(' + Math.round(c.cx) + ',' + Math.round(c.cy) + ')の対象文字が1つに定まらない' }); return; }
      var tg = targets[0];
      if (tg.w > c.rx * 2 || tg.size > c.ry * 2) issues.push({ kind: '丸囲み', box: cb, msg: '丸囲みが ' + label(tg) + ' を囲みきれない' });
      texts.forEach(function (t) {
        if (t !== tg && inter(cb, t, 0.5)) issues.push({ kind: '丸囲み重なり', box: cb, msg: label(tg) + ' の丸囲みが ' + label(t) + ' に重なる' });
      });
      rules.forEach(function (r) {
        if (inter(cb, rectBox(r), 0.5)) issues.push({ kind: '丸囲み重なり', box: cb, msg: label(tg) + ' の丸囲みが罫線に重なる' });
      });
      if (cb.l < 0 || cb.r > W) issues.push({ kind: '用紙外', box: cb, msg: label(tg) + ' の丸囲みが用紙外' });
    });
    return issues;
  }

  // 備考の手書き領域（無罫線白紙）に何も描かれていないか
  function remarkIssues(rec, rect) {
    if (!rect) return [{ kind: '白紙', msg: '備考欄の矩形情報がない' }];
    var inner = { l: rect.x + 3, r: rect.x + rect.w - 3, t: rect.y + 3, b: rect.y + rect.h - 3 };
    var out = [];
    rec.texts.filter(visible).forEach(function (t) { if (inter(t, inner)) out.push({ kind: '白紙', box: t, msg: '備考の白紙部に ' + label(t) + ' がある' }); });
    rec.rects.filter(function (r) { return !r.white; }).forEach(function (r) {
      if (inter(rectBox(r), inner)) out.push({ kind: '白紙', box: rectBox(r), msg: '備考の白紙部に罫線/塗り(' + r.x + ',' + r.y + ')がある' });
    });
    rec.circles.forEach(function (c) { if (inter(circleBox(c), inner)) out.push({ kind: '白紙', box: circleBox(c), msg: '備考の白紙部に丸囲みがある' }); });
    if (rect.h < 64 * 8) out.push({ kind: '白紙', msg: '備考の白紙高さが ' + rect.h + 'dot（64mm=512dot以上が必要）' });
    return out;
  }

  // ------------------------------------------------------------ 検証本体
  // env: { S, M, SD, make(opts) → { rec, result, canvas? } , measureCtx }
  function run(env) {
    var S = env.S, M = env.M, SD = env.SD, L = S.LAYOUT;
    var lines = [], fails = 0, slips = [];
    function ok(cond, text, detail) {
      lines.push((cond ? 'ok   ' : 'FAIL ') + text + (!cond && detail ? '\n       ' + detail : ''));
      if (!cond) fails++;
      return cond;
    }
    function section(t) { lines.push(''); lines.push('[' + t + ']'); }
    function noWs(s) { return String(s).replace(/[\s　]/g, ''); }

    // 予約1件分の描画（buildAll と同じ順序・枚数）
    function renderAll(d, tag) {
      var list = [
        { kind: 'customer', opts: { mode: 'copy', variant: 'exchange', data: d } },
        { kind: 'store', opts: { mode: 'copy', variant: 'order', data: d } }
      ];
      S.enumerateUnits(d).forEach(function (u) { list.push({ kind: 'tag', opts: { mode: 'tag', variant: 'reserve', data: d, unit: u } }); });
      return list.map(function (x) {
        var m = env.make(x.opts);
        var o = { kind: x.kind, opts: x.opts, rec: m.rec, result: m.result, canvas: m.canvas, scenario: tag,
                  texts: m.rec.texts.filter(visible).map(function (t) { return t.s; }) };
        o.joined = noWs(o.texts.join(''));
        o.issues = layoutIssues(m.rec, L.W, m.result.height).concat(remarkIssues(m.rec, m.result.remark && m.result.remark.rect));
        return o;
      });
    }
    function allItems(q5) {
      var items = {}; M.PRODUCTS.forEach(function (p) { items[p.no] = { qty: p.no === 5 ? (q5 || 2) : 1 }; }); return items;
    }

    // --- マスタ ---------------------------------------------------
    section('マスタ・仕様値');
    var expected = {
      1: ['発泡容器(グリーン)', '6cmロウソク5本'],
      2: ['発泡容器(レッド)', '6cmロウソク5本', 'ピックシート1枚'],
      3: ['USJ専用ケーキ箱', '6cmロウソク5本', 'ピックシート2枚'],
      4: ['発泡容器(レッド)', '6cmロウソク5本'],
      5: ['発泡容器(レッド)', '6cmロウソク5本', 'ピックシート1枚'],
      6: ['発泡容器(レッド)', '6cmロウソク5本'],
      7: ['専用ボックス', '専用カップホルダー', '専用カップ', 'カラースプレー1袋'],
      8: ['専用ボックス', '専用カップホルダー', '専用カップ', 'カラースプレー1袋']
    };
    ok(M.PRODUCTS.length === 8 && M.PRODUCTS.every(function (p, i) { return p.no === i + 1; }), '商品①〜⑧を別商品として保持');
    Object.keys(expected).forEach(function (no) {
      ok(JSON.stringify(M.ACCESSORY_CHECKS[no]) === JSON.stringify(expected[no]), '付属品マスタ ' + M.productByNo(Number(no)).mark + ' が確定表どおり',
         JSON.stringify(M.ACCESSORY_CHECKS[no]));
    });
    ok(M.unregisteredAccessoryProducts().length === 0, '付属品未登録の商品なし');
    ok(JSON.stringify(M.ACCEPT_KINDS) === JSON.stringify(['ご来店', 'お電話', 'MO', '当日']), '受付区分4種はデータマスタに保持');
    ok(M.STORES.length === 3 && M.STORES.every(function (s) { return M.storeByCode(s.code) === s; }), '3店舗とも storeCode から店舗名を解決');
    ok(M.storeByCode('UNKNOWN') === null, '未知の storeCode は null');
    ok(JSON.stringify(M.CARRY_OPTIONS.map(function (c) { return c.fee; })) === '[0,50,80]', '保冷料金 0/50/80円（固定）');
    ok(SD().phone === '09012345678', 'サンプル電話番号はハイフンなし');
    Object.keys(ACCEPT_TEXT_MIN_SIZE).forEach(function (k) {
      ok(L[k] >= ACCEPT_TEXT_MIN_SIZE[k], '文字サイズ ' + k + '=' + L[k] + ' ≥ ' + ACCEPT_TEXT_MIN_SIZE[k]);
    });
    ok(L.REMARK_BLANK >= S.mm(64), '備考白紙は64mm以上（' + L.REMARK_BLANK + 'dot = ' + (L.REMARK_BLANK / 8) + 'mm）');
    ok(S.measureRemark().ruledLines === 0 && S.measureRemark().printedText === false, '備考白紙は罫線なし・備考テキスト非印字');

    // --- 折返し欠落（wrap 単体） --------------------------------------
    section('折返し欠落');
    var wrapCases = M.PRODUCTS.map(function (p) { return p.mark + p.name; }).concat([M.NOTICE, '専用カップホルダー', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789']);
    var wrapBad = [];
    [80, 140, 200, 364, 424, 520].forEach(function (w) {
      [L.F_SUB, L.F_NAME, L.F_NOTICE].forEach(function (sz) {
        wrapCases.forEach(function (s) {
          var ls = S.wrapLines(env.measureCtx, s, w, sz, false);
          // 1文字だけの行は幅を超えても分割できないので除外
          var tooWide = ls.some(function (ln) { env.measureCtx.font = sz + 'px ' + L.FF; return ln.length > 1 && env.measureCtx.measureText(ln).width > w + 0.01; });
          if (noWs(ls.join('')) !== noWs(s) || tooWide) wrapBad.push(w + 'dot/' + sz + 'px: ' + s.slice(0, 20));
        });
      });
    });
    ok(wrapBad.length === 0, '折返し後の全行を連結すると原文と一致し、各行が幅内（' + wrapCases.length + '文字列×6幅×3サイズ）', wrapBad.slice(0, 5).join(' / '));

    // --- シナリオ描画 -------------------------------------------------
    var scenarios = [];
    scenarios.push({ tag: '標準サンプル(①③⑤×2⑦⑧×2)', d: SD() });
    scenarios.push({ tag: '全商品(⑤×2)・支払済・2時間', d: SD({ items: allItems(2), paid: true, carryKey: 'H2' }) });
    M.STORES.forEach(function (s, i) {
      scenarios.push({ tag: '店舗=' + s.name + '・受付区分=' + M.ACCEPT_KINDS[i + 1], d: SD({ storeCode: s.code, acceptKind: M.ACCEPT_KINDS[i + 1], carryKey: 'H1', items: { 2: { qty: 1 }, 4: { qty: 1 }, 6: { qty: 1 } } }) });
    });
    scenarios.push({ tag: '支払未選択(null)・長い氏名/担当/電話', d: SD({ paid: null, customerName: '長谷川部 久美子左衛門太郎兵衛', acceptStaff: '長い担当者名サンプル', phone: '090-1234-5678', items: { 3: { qty: 1 } } }) });
    scenarios.push({ tag: '大量(⑦×10・2桁連番)', d: SD({ reserveNo: 'Y-0123', items: { 7: { qty: 10 }, 8: { qty: 2 } }, paid: true }) });

    scenarios.forEach(function (sc) {
      var d = sc.d;
      section('描画: ' + sc.tag);
      var slipsSc = renderAll(d, sc.tag);
      slips = slips.concat(slipsSc);
      var qtyTotal = M.PRODUCTS.reduce(function (s, p) { return s + M.itemQty(p.no, (d.items || {})[p.no]); }, 0);
      ok(slipsSc.length === 2 + qtyTotal, '枚数 = 控え2 + 貼付用' + qtyTotal + '（商品1個1枚）');
      var tagNos = slipsSc.filter(function (x) { return x.kind === 'tag'; }).map(function (x) { return x.opts.unit.no; });
      ok(tagNos.every(function (n, i) { return i === 0 || tagNos[i - 1] <= n; }), '貼付用は商品番号昇順');

      var layoutBad = [];
      slipsSc.forEach(function (x) { x.issues.forEach(function (is) { layoutBad.push(x.kind + (x.opts.unit ? x.opts.unit.seq : '') + ': ' + is.msg); }); });
      ok(layoutBad.length === 0, '罫線/隣セル/文字同士/丸囲みの重なり・はみ出し・白紙部の描画なし（' + slipsSc.length + '枚）', layoutBad.slice(0, 6).join('\n       '));

      // 受付区分は全帳票で印字しない
      var kindHit = [];
      // 固定ラベル「お電話番号」は受付区分「お電話」ではないので除外して判定する
      slipsSc.forEach(function (x) { M.ACCEPT_KINDS.forEach(function (k) { if (x.texts.some(function (s) { return s.replace(/お電話番号/g, '').indexOf(k) >= 0; })) kindHit.push(x.kind + ':' + k); }); });
      ok(kindHit.length === 0, '受付区分（データ=' + d.acceptKind + '）をどの帳票にも印字しない', kindHit.join(','));

      // 店舗名は引換証のみ
      var st = M.storeByCode(d.storeCode);
      var cust = slipsSc[0], ord = slipsSc[1];
      ok(cust.texts.indexOf(st.name) >= 0, '引換証（お客様控え）に店舗名「' + st.name + '」');
      var storeLeak = [];
      slipsSc.slice(1).forEach(function (x) { M.STORES.forEach(function (s) { if (x.texts.some(function (t) { return t.indexOf(s.name) >= 0; })) storeLeak.push(x.kind + ':' + s.name); }); });
      M.STORES.forEach(function (s) { if (s !== st && cust.texts.some(function (t) { return t.indexOf(s.name) >= 0 && t !== st.name; })) storeLeak.push('customer:' + s.name); });
      ok(storeLeak.length === 0, '受注書・貼付用に店舗名なし／引換証は該当店舗のみ', storeLeak.join(','));

      // 主要値の実描画サイズ（自動縮小で小さくなりすぎていないか）
      var sizeBad = [];
      slipsSc.forEach(function (x) {
        x.rec.texts.forEach(function (t) {
          if (t.s === d.phone && /^\d{10,11}$/.test(d.phone) && t.size < L.F_VALUE) sizeBad.push(x.kind + ' 電話' + t.size);
          if (/^\d+\/\d+（/.test(t.s) && t.size < 19) sizeBad.push(x.kind + ' お渡し' + t.size);
          if (M.CARRY_OPTIONS.some(function (o) { return o.label === t.s; }) && t.size < 17) sizeBad.push(x.kind + ' 保冷' + t.size);
        });
      });
      // 文字幅に依存するため実フォント（ブラウザ）でのみ合否判定。node の近似幅は広めなので参考表示にとどめる。
      if (env.realFont) ok(sizeBad.length === 0, '電話番号(11桁)=' + L.F_VALUE + 'px・お渡し日時≥19px・保冷選択肢≥17px（実フォント）', sizeBad.slice(0, 6).join(','));
      else lines.push('info 文字サイズ自動縮小は実フォントで判定（近似幅では: ' + (sizeBad.length ? sizeBad.slice(0, 3).join(',') : '縮小なし') + '）');

      // 電話番号・氏名をそのまま印字（欠けなし）
      ok(slipsSc.every(function (x) { return x.texts.indexOf(d.phone) >= 0 && x.texts.indexOf(d.customerName) >= 0; }), '全帳票に電話番号・氏名を欠けなく印字');

      // 付属品: 貼付用のみ、その商品の分だけ、空チェック欄付き
      var allLabels = {}; Object.keys(M.ACCESSORY_CHECKS).forEach(function (k) { M.ACCESSORY_CHECKS[k].forEach(function (a) { allLabels[a] = 1; }); });
      var accBad = [];
      slipsSc.forEach(function (x) {
        var drawn = x.texts.filter(function (s) { return allLabels[s]; });
        if (x.kind !== 'tag') {
          if (drawn.length || x.texts.indexOf('付属品確認') >= 0) accBad.push(x.kind + ' に付属品欄');
          return;
        }
        var exp = M.ACCESSORY_CHECKS[x.opts.unit.no];
        if (JSON.stringify(drawn) !== JSON.stringify(exp)) accBad.push('貼付' + x.opts.unit.seq + ' ' + JSON.stringify(drawn));
        // 付属品確認見出しより下にあるチェック欄（上辺・下辺の2本で1個）。商品表の確認列□は除外。
        var accHead = x.rec.texts.filter(function (t) { return t.s === '付属品確認'; })[0];
        var accTops = x.rec.rects.filter(function (r) { return !r.white && r.w === L.ACC_BOX && r.h === 2 && accHead && r.y > accHead.b; });
        var boxes = accTops.length / 2;
        if (!accHead) accBad.push('貼付' + x.opts.unit.seq + ' 付属品確認見出しなし');
        if (boxes !== exp.length) accBad.push('貼付' + x.opts.unit.seq + ' チェック欄' + boxes + '/' + exp.length);
        // チェック欄の内側は空（手書き用）
        var emptyBad = accTops.some(function (top) {
          var inner = { l: top.x + 2, r: top.x + L.ACC_BOX - 2, t: top.y + 2, b: top.y + L.ACC_BOX - 2 };
          return x.rec.texts.some(function (t) { return visible(t) && inter(t, inner); });
        });
        if (emptyBad) accBad.push('貼付' + x.opts.unit.seq + ' チェック欄が空でない');
      });
      ok(accBad.length === 0, '付属品は貼付用に注文商品1個分だけ・空チェック欄で印字（控えには出さない）', accBad.join(' / '));

      // 折返し欠落（実描画）: 商品名・付属品見出し・注意文
      var lost = [];
      slipsSc.forEach(function (x) {
        var nos = x.kind === 'tag' ? [x.opts.unit.no] : M.PRODUCTS.filter(function (p) { return M.itemQty(p.no, d.items[p.no]) > 0; }).map(function (p) { return p.no; });
        nos.forEach(function (no) {
          var p = M.productByNo(no), full = noWs(p.mark + p.name);
          var cnt = x.joined.split(full).length - 1;
          if (cnt < (x.kind === 'tag' ? 2 : 1)) lost.push(x.kind + ':' + p.mark + '×' + cnt);
        });
      });
      ok(lost.length === 0, '商品名・付属品見出しを全行描画（貼付用は表と付属品見出しの2回）', lost.join(','));
      ok(cust.joined.indexOf(noWs(M.NOTICE)) >= 0 && ord.joined.indexOf(noWs(M.NOTICE)) < 0, '注意文は引換証のみ・全文');

      // 支払: 済/未の丸囲み
      [cust, ord].forEach(function (x) {
        var pc = x.rec.circles.map(function (c) {
          var t = x.rec.texts.filter(function (t) { return Math.abs((t.l + t.r) / 2 - c.cx) < 2.5 && Math.abs((t.t + t.b) / 2 - c.cy) < 2.5; })[0];
          return t ? t.s : '?';
        });
        var payC = pc.filter(function (s) { return s === '済' || s === '未'; });
        var expPay = d.paid === true ? ['済'] : d.paid === false ? ['未'] : [];
        ok(JSON.stringify(payC) === JSON.stringify(expPay), (x.kind === 'customer' ? '引換証' : '受注書') + ' 支払丸囲み=' + (expPay[0] || 'なし'), JSON.stringify(pc));
        var co = M.carryOption(d.carryKey);
        ok(pc.indexOf(co.label) >= 0 && x.texts.indexOf(co.fee.toLocaleString('ja-JP')) >= 0 || (co.fee === 0 && pc.indexOf(co.label) >= 0 && x.texts.indexOf('0') >= 0),
           (x.kind === 'customer' ? '引換証' : '受注書') + ' 保冷「' + co.label + '」丸囲み・' + co.fee + '円');
        var tot = M.totalAmount(d);
        ok(x.texts.indexOf(tot.toLocaleString('ja-JP')) >= 0, (x.kind === 'customer' ? '引換証' : '受注書') + ' 合計 ' + tot + '円');
      });
      // 支払の位置関係: 支払 < 済 < ・ < 未 < 金額列
      var tx = function (x, s) { return x.rec.texts.filter(function (t) { return t.s === s; }); };
      var lab = tx(cust, '支払')[0], pz = tx(cust, '済')[0], pm = tx(cust, '未')[0];
      ok(lab && pz && pm && lab.r < pz.l && pz.r < pm.l && Math.abs(lab.y - pz.y) < 1 && Math.abs(pz.y - pm.y) < 1 && pm.r < L.MX + 440,
         '支払ラベル→済→未 の順で横並び・金額列より左', lab && pz && pm ? ('支払' + Math.round(lab.l) + '-' + Math.round(lab.r) + ' 済' + Math.round(pz.l) + ' 未' + Math.round(pm.l)) : 'missing');

      // 貼付用には価格を印字しない
      ok(slipsSc.filter(function (x) { return x.kind === 'tag'; }).every(function (x) { return x.texts.indexOf('円') < 0 && x.texts.indexOf('合 計 金 額') < 0; }), '貼付用に金額・合計なし');

      // 備考白紙: 全帳票で64mm以上。備考テキスト300字を渡しても高さ・白紙は不変（印字しない）
      var rmBad = [];
      slipsSc.forEach(function (x) { var rr = x.result.remark && x.result.remark.rect; if (!rr || rr.h < S.mm(64)) rmBad.push(x.kind + ':' + (rr ? rr.h : 'none')); });
      ok(rmBad.length === 0, '全帳票の備考白紙 ≥ 64mm（' + S.mm(64) + 'dot）', rmBad.join(','));
      var longRemark = new Array(301).join('備');
      var d2 = {}; for (var k in d) d2[k] = d[k]; d2.remark = longRemark;
      var withRm = renderAll(d2, sc.tag + '+備考300字');
      var rmTextBad = [];
      withRm.forEach(function (x, i) {
        if (x.result.height !== slipsSc[i].result.height) rmTextBad.push(x.kind + ' 高さ' + slipsSc[i].result.height + '→' + x.result.height);
        if (x.texts.some(function (s) { return s.indexOf('備備') >= 0; })) rmTextBad.push(x.kind + ' 備考文を印字');
        if (x.issues.length) rmTextBad.push(x.kind + ' ' + x.issues[0].msg);
      });
      ok(rmTextBad.length === 0, '備考テキスト300字でも白紙・伝票高さ不変', rmTextBad.slice(0, 4).join(','));

      // 白紙でない（描画がある）
      ok(slipsSc.every(function (x) { return x.texts.length > 10 && x.rec.rects.filter(function (r) { return !r.white; }).length > 10; }), '全帳票に描画あり（白紙出力でない）');
    });

    return { lines: lines, fails: fails, slips: slips };
  }

  var api = { Recorder: Recorder, approxMeasure: approxMeasure, layoutIssues: layoutIssues, remarkIssues: remarkIssues, run: run };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CY = root.CY || {}; root.CY.slipVerify = api;
})(typeof window !== 'undefined' ? window : this);
