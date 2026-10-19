// slip-template.js -- 実帳票テンプレート（3枚共通・Canvas 576dot）
//
// 原本（ご予約表／受注書／引換証）は罫線・項目配置が完全に同一の複写伝票。
// タイトルのみ差し替えた共通テンプレートとして実装する。白黒。
//
// 【寸法の考え方】
//   mC-Print3 / 80mm紙: 203dpi = 8 dot/mm、印字可能幅 576 dot = 72mm
//   原本は 72mm より広いため、写真の単純縮小はしない（文字が潰れるため）。
//   原本の項目の並び・階層・罫線区画・注意文を保ったまま、72mm幅で組み直す。
//
// 【調整方法】
//   下の LAYOUT の数値を変えるだけで全体に反映される。
//   実機テストの結果を見て数値を詰める前提の設計。再撮影を待たずに進められる。
(function () {
  'use strict';

  var M = window.CY.master;

  var DPMM = 8; // 203dpi ≒ 8 dot/mm
  function mm(v) { return Math.round(v * DPMM); }

  // ---------------------------------------------------------------- レイアウト定義
  var LAYOUT = {
    W: 576,              // 印字可能幅（固定）
    MX: 8,               // 左右マージン
    MT: 8,               // 上マージン

    // ヘッダー
    HDR_TITLE_W: 150,    // タイトル白抜きベタの幅
    HDR_ROW_H: 36,       // ヘッダー右側3行それぞれの高さ

    // お客様情報
    NAME_H: 44,
    TEL_H: 36,

    // 商品表の列幅（合計 = W - MX*2 = 560）
    COL_NAME: 330,
    COL_QTY: 60,
    COL_AMT: 110,
    COL_CHK: 60,
    TBL_HEAD_H: 30,
    ROW_PAD: 6,          // 商品行の上下余白
    LINE_NAME: 23,       // 商品名の行送り
    LINE_SUB: 19,        // 付属品の行送り
    ROW_MIN_H: 34,       // 商品1行の最低高さ

    // フレーバー記入欄（S2: 原本のセル構造が未確定。実機確認後に調整する）
    FLAVOR_LABEL_H: 26,
    FLAVOR_ROWS: 2,
    FLAVOR_COLS: 3,
    FLAVOR_CELL_H: 40,

    CARRY_H: 40,
    TOTAL_H: 48,

    // 付属品確認欄（備考欄の上に配置。注文商品に応じて自動生成）
    ACC_HEAD_H: 26,
    ACC_TITLE_H: 24,     // 商品名の見出し行
    ACC_ROW_H: 26,       // チェック項目1行
    ACC_BOX: 16,         // チェックボックスの1辺
    ACC_PAD: 8,
    ACC_MAX_BOXES: 6,    // 個数がこれを超える場合は □×N 表記にする

    // 備考欄（原本下部の大きな空白を活用）
    // 見出しは「備考」。その下は【完全な白紙】とする。
    // 横罫線・定型文・備考文の印字はいずれも入れない。
    REMARK_HEAD_H: 26,
    REMARK_BLANK: mm(64),      // 見出しの下の白紙スペース。64mm以上

    // 下部
    NOTICE_LINE: 18,
    STAFF_BOX_W: 150,
    STAFF_BOX_H: 44,
    MB: 10,              // 下マージン

    // 罫線
    T_OUTER: 2,
    T_INNER: 2,

    // フォント
    FF: '"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif',
    F_TITLE: 30, F_SUBTTL: 16, F_LABEL: 15, F_VALUE: 19,
    F_HEAD: 17, F_NAME: 18, F_SUB: 14, F_NOTICE: 13,
    F_TOTAL: 24
  };

  // ---------------------------------------------------------------- 描画ヘルパ
  // 感熱印字は _encodeRasterImage の 8x8 ディザを通る。
  // 罫線は stroke（アンチエイリアスで灰色が出る）ではなく
  // fillRect で描き、純黒にしてディザによるにじみを防ぐ。
  function R(ctx, dry) {
    this.c = ctx;
    this.dry = !!dry;
    this.L = LAYOUT;
  }
  R.prototype.hline = function (x, y, w, t) {
    if (!this.dry) this.c.fillRect(x, y, w, t || this.L.T_INNER);
  };
  R.prototype.vline = function (x, y, h, t) {
    if (!this.dry) this.c.fillRect(x, y, t || this.L.T_INNER, h);
  };
  R.prototype.box = function (x, y, w, h, t) {
    t = t || this.L.T_INNER;
    this.hline(x, y, w, t); this.hline(x, y + h - t, w, t);
    this.vline(x, y, h, t); this.vline(x + w - t, y, h, t);
  };
  R.prototype.fill = function (x, y, w, h) {
    if (!this.dry) this.c.fillRect(x, y, w, h);
  };
  // 点線（原本の破線枠の再現）
  R.prototype.dash = function (x, y, w, on, off) {
    on = on || 6; off = off || 5;
    for (var i = x; i < x + w; i += on + off) {
      this.hline(i, y, Math.min(on, x + w - i), 1);
    }
  };
  R.prototype.vdash = function (x, y, h, on, off) {
    on = on || 6; off = off || 5;
    for (var i = y; i < y + h; i += on + off) {
      this.vline(x, i, Math.min(on, y + h - i), 1);
    }
  };
  R.prototype.font = function (size, bold) {
    this.c.font = (bold ? 'bold ' : '') + size + 'px ' + this.L.FF;
  };
  R.prototype.text = function (s, x, y, opts) {
    opts = opts || {};
    this.font(opts.size || this.L.F_LABEL, opts.bold);
    this.c.textBaseline = 'middle';
    this.c.textAlign = opts.align || 'left';
    if (!this.dry) {
      this.c.fillStyle = opts.white ? '#fff' : '#000';
      this.c.fillText(s, x, y);
      this.c.fillStyle = '#000';
    }
    return this.c.measureText(s).width;
  };
  R.prototype.measure = function (s, size, bold) {
    this.font(size, bold);
    return this.c.measureText(s).width;
  };
  // 幅に収まるよう折り返して行配列を返す（文字を落とさない）
  // 空白を優先的な改行位置として扱う。
  // 単純な文字単位の折り返しだと「アイスクリー／ムケーキ」「（R・／S）」のように
  // 語中で割れて伝票として読みにくくなるため。
  // 空白が無い長い語はやむを得ず文字単位で折る（文字は絶対に落とさない）。
  R.prototype.wrap = function (s, maxW, size, bold) {
    this.font(size, bold);
    var c = this.c, lines = [], self = this;

    function fits(t) { return c.measureText(t).width <= maxW; }

    // 文字単位で強制的に折る（空白の無い長語用）
    function hardWrap(word, prefix) {
      var cur = prefix || '';
      for (var i = 0; i < word.length; i++) {
        var ch = word.charAt(i);
        if (cur !== '' && !fits(cur + ch)) { lines.push(cur); cur = ch; }
        else cur += ch;
      }
      return cur;
    }

    String(s).split('\n').forEach(function (para) {
      // 半角・全角の空白を区切りとして語に分解（空白は直前の語に含める）
      var words = para.match(/[^\s\u3000]+[\s\u3000]*/g) || [''];
      var cur = '';
      words.forEach(function (w) {
        var trimmed = w.replace(/[\s\u3000]+$/, '');
        if (fits(cur + trimmed)) { cur += w; return; }
        if (fits(trimmed)) {
          // 語单体なら1行に収まる → 現在行を確定して次行の先頭に置く
          if (cur !== '') lines.push(cur.replace(/[\s\u3000]+$/, ''));
          cur = w;
          return;
        }
        // 1行に収まらない長語（空白の無い日本語文など）。
        // 現在行を捨てずに続きから詰める。そうしないと行頭が不自然に短くなる。
        cur = hardWrap(w, cur);
      });
      lines.push(cur.replace(/[\s\u3000]+$/, ''));
    });

    if (lines.length === 0) lines.push('');
    return lines;
  };
  // 選択肢を丸で囲む（原本の手書き○の再現）
  R.prototype.circle = function (cx, cy, rx, ry) {
    if (this.dry) return;
    var c = this.c;
    c.save();
    c.strokeStyle = '#000'; c.lineWidth = 3;
    c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.stroke();
    c.restore();
  };

  // ---------------------------------------------------------------- 備考欄の寸法計算
  //
  // 確定仕様:
  //   - 見出しは「備考」
  //   - その下は【完全な白紙】。横罫線も定型文も備考文も入れない
  //   - 白紙スペースの高さは 64mm 以上
  //   - 付属品確認欄を追加しても、この白紙は削らない
  //
  // 備考のテキストデータ自体は予約データとして保持し、
  // スプレッドシートに保存する（Phase 3）。伝票には印字しない。
  function measureRemark() {
    var L = LAYOUT;
    return {
      height: L.REMARK_BLANK,
      blankMm: Math.round(L.REMARK_BLANK / DPMM),
      ruledLines: 0,
      printedText: false
    };
  }

  // ---------------------------------------------------------------- 付属品確認欄の寸法計算
  function measureAccessory(r, data) {
    var L = LAYOUT;
    var groups = M.accessoryChecksFor(data);
    if (groups.length === 0) return { groups: [], height: 0 };

    var h = L.ACC_HEAD_H + L.ACC_PAD;
    groups.forEach(function (g) {
      h += L.ACC_TITLE_H;
      h += g.items.length * L.ACC_ROW_H;
    });
    h += L.ACC_PAD;
    return { groups: groups, height: h };
  }

  // ---------------------------------------------------------------- 本体描画
  // dry=true で高さだけ計算する（Canvas生成前の2パス目的）
  function render(ctx, opts, dry) {
    var L = LAYOUT;
    var r = new R(ctx, dry);
    var d = opts.data;
    var v = M.VARIANTS[opts.variant];
    if (!v) throw new Error('未知の伝票種別: ' + opts.variant);

    var X = L.MX, CW = L.W - L.MX * 2;
    var y = L.MT;

    if (!dry) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, L.W, ctx.canvas.height);
      ctx.fillStyle = '#000';
    }

    function blank(x) { return (x == null || x === '') ? '' : String(x); }
    function money(x) { return (x == null || x === '') ? '' : Number(x).toLocaleString('ja-JP'); }

    // ===================== ヘッダー =====================
    var hdrH = L.HDR_ROW_H * 3;
    var tx = X, tw = L.HDR_TITLE_W;
    // タイトル：白抜きベタ
    r.fill(tx, y, tw, hdrH);
    r.text(v.title, tx + tw / 2, y + hdrH / 2 - 14, { size: L.F_TITLE, bold: true, align: 'center', white: true });
    r.text(v.subtitle, tx + tw / 2, y + hdrH / 2 + 18, { size: L.F_SUBTTL, bold: true, align: 'center', white: true });

    var rx = X + tw, rw = CW - tw;
    r.box(rx, y, rw, hdrH);

    // 1行目: 受付日 / 予約No.
    var r1 = y, w1 = 200;
    r.vline(rx + w1, r1, L.HDR_ROW_H);
    r.text('受付日', rx + 8, r1 + L.HDR_ROW_H / 2, { size: L.F_LABEL });
    r.text(blank(d.acceptMonth) + '  月  ' + blank(d.acceptDay) + '  日',
           rx + 60, r1 + L.HDR_ROW_H / 2, { size: L.F_VALUE, bold: true });
    r.text('予約No.', rx + w1 + 8, r1 + L.HDR_ROW_H / 2, { size: L.F_LABEL });
    r.text(blank(d.reserveNo), rx + w1 + 62, r1 + L.HDR_ROW_H / 2, { size: L.F_VALUE, bold: true });

    // 2行目: 受付者 / 受付区分（4択を丸囲み）
    var r2 = y + L.HDR_ROW_H, w2 = 150;
    r.hline(rx, r2, rw);
    r.vline(rx + w2, r2, L.HDR_ROW_H);
    r.text('受付者', rx + 8, r2 + L.HDR_ROW_H / 2, { size: L.F_LABEL });
    r.text(blank(d.acceptStaff), rx + 62, r2 + L.HDR_ROW_H / 2, { size: L.F_VALUE, bold: true });

    var kx = rx + w2 + 10, ky = r2 + L.HDR_ROW_H / 2;
    M.ACCEPT_KINDS.forEach(function (k, i) {
      if (i > 0) { r.text('・', kx, ky, { size: L.F_LABEL }); kx += r.measure('・', L.F_LABEL); }
      var kw = r.measure(k, L.F_LABEL);
      r.text(k, kx, ky, { size: L.F_LABEL });
      if (d.acceptKind === k) r.circle(kx + kw / 2, ky, kw / 2 + 6, 13);
      kx += kw;
    });

    // 3行目: お渡し日時
    var r3 = y + L.HDR_ROW_H * 2;
    r.hline(rx, r3, rw);
    r.text('お渡し日時', rx + 8, r3 + L.HDR_ROW_H / 2, { size: L.F_LABEL });
    r.text(blank(d.pickupMonth) + ' 月 ' + blank(d.pickupDay) + ' 日（' +
           blank(d.pickupWday) + '） ' + blank(d.pickupHour) + ' 時 ' + blank(d.pickupMin) + ' 分',
           rx + 88, r3 + L.HDR_ROW_H / 2, { size: L.F_VALUE, bold: true });

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
    var cN = X, cQ = cN + L.COL_NAME, cA = cQ + L.COL_QTY, cC = cA + L.COL_AMT;
    var tblTop = y;

    // 見出し行
    r.box(X, y, CW, L.TBL_HEAD_H);
    r.text('商 品 名', cN + L.COL_NAME / 2, y + L.TBL_HEAD_H / 2, { size: L.F_HEAD, bold: true, align: 'center' });
    r.text('個数', cQ + L.COL_QTY / 2, y + L.TBL_HEAD_H / 2, { size: L.F_HEAD, bold: true, align: 'center' });
    r.text('金額', cA + L.COL_AMT / 2, y + L.TBL_HEAD_H / 2, { size: L.F_HEAD, bold: true, align: 'center' });
    r.text('確認', cC + L.COL_CHK / 2, y + L.TBL_HEAD_H / 2, { size: L.F_HEAD, bold: true, align: 'center' });
    y += L.TBL_HEAD_H;

    // 商品7行（固定。注文が無くても行を削除しない）
    var items = d.items || {};
    M.PRODUCTS.forEach(function (p) {
      var nameW = L.COL_NAME - 16;
      var nameLines = r.wrap(p.mark + p.name, nameW, L.F_NAME, false);
      var accLines = p.accessory ? r.wrap(p.accessory, nameW - 14, L.F_SUB, false) : [];

      // ⑦のようにS/Rで単価が分かれる商品で、2種類以上を同時に注文した場合は
      // 個数・金額の合算だけでは内訳が分からない。小さい行で内訳を補う。
      var itPre = items[p.no] || {};
      var breakdown = null;
      if (p.variants) {
        var ordered = p.variants.filter(function (v) {
          return (Number((itPre.variants || {})[v.key]) || 0) > 0;
        });
        if (ordered.length > 1) {
          breakdown = ordered.map(function (v) {
            return v.label + ' ' + itPre.variants[v.key] + '個';
          }).join(' ／ ');
        }
      }
      var bdLines = breakdown ? r.wrap(breakdown, nameW - 14, L.F_SUB, false) : [];

      var h = Math.max(L.ROW_MIN_H,
        L.ROW_PAD * 2 + nameLines.length * L.LINE_NAME +
        accLines.length * L.LINE_SUB + bdLines.length * L.LINE_SUB);

      r.hline(X, y, CW);
      r.vline(cQ, y, h); r.vline(cA, y, h); r.vline(cC, y, h);
      r.vline(X, y, h); r.vline(X + CW - L.T_INNER, y, h);

      var ty = y + L.ROW_PAD + L.LINE_NAME / 2;
      nameLines.forEach(function (ln) {
        r.text(ln, cN + 8, ty, { size: L.F_NAME });
        ty += L.LINE_NAME;
      });
      accLines.forEach(function (ln) {
        r.text(ln, cN + 22, ty - L.LINE_NAME / 2 + L.LINE_SUB / 2, { size: L.F_SUB });
        ty += L.LINE_SUB;
      });
      bdLines.forEach(function (ln) {
        r.text(ln, cN + 22, ty - L.LINE_NAME / 2 + L.LINE_SUB / 2, { size: L.F_SUB, bold: true });
        ty += L.LINE_SUB;
      });

      // ⑦のように1行でS/Rに単価が分かれる商品は、原本の「（R・S）」の
      // 該当文字を丸で囲む。折り返し後の行内位置を measureText で求める。
      var it = items[p.no] || {};
      if (p.variants) {
        var vy = y + L.ROW_PAD + L.LINE_NAME / 2;
        nameLines.forEach(function (ln) {
          p.variants.forEach(function (v) {
            var q = Number((it.variants || {})[v.key]) || 0;
            if (q === 0) return;
            var at = ln.indexOf('（' + (p.variants[0].label) + '・') >= 0 || ln.indexOf(v.label) >= 0
              ? ln.indexOf(v.label) : -1;
            // 「（R・S）」の中の文字だけを対象にする（商品名中の同字を拾わない）
            var paren = ln.indexOf('（');
            if (at < 0 || paren < 0 || at < paren) return;
            var preW = r.measure(ln.slice(0, at), L.F_NAME, false);
            var chW = r.measure(v.label, L.F_NAME, false);
            r.circle(cN + 8 + preW + chW / 2, vy, chW / 2 + 5, 12);
          });
          vy += L.LINE_NAME;
        });
      }

      var qty = M.itemQty(p.no, it);
      var amt = M.itemAmount(p.no, it);
      var mid = y + h / 2;
      r.text(qty ? String(qty) : '', cQ + L.COL_QTY / 2, mid, { size: L.F_VALUE, bold: true, align: 'center' });
      // 金額欄は原本どおり「円」を右端に固定印字し、数字をその左に置く
      r.text('円', cA + L.COL_AMT - 8, mid, { size: L.F_LABEL, align: 'right' });
      r.text(money(amt), cA + L.COL_AMT - 30, mid, { size: L.F_VALUE, bold: true, align: 'right' });
      y += h;
    });
    var tblProductBottom = y;

    // フレーバー記入欄（S2: 原本のセル構造が未確定。行数・列数は LAYOUT で調整）
    var flvH = L.FLAVOR_LABEL_H + L.FLAVOR_ROWS * L.FLAVOR_CELL_H;
    r.hline(X, y, CW);
    r.vline(cQ, y, flvH); r.vline(cA, y, flvH); r.vline(cC, y, flvH);
    r.vline(X, y, flvH); r.vline(X + CW - L.T_INNER, y, flvH);
    r.text('フレーバー記入欄', cN + 8, y + L.FLAVOR_LABEL_H / 2, { size: L.F_HEAD, bold: true });
    var fy = y + L.FLAVOR_LABEL_H;
    for (var fr = 0; fr < L.FLAVOR_ROWS; fr++) {
      r.dash(cN + 4, fy, L.COL_NAME - 8);
      for (var fc = 1; fc < L.FLAVOR_COLS; fc++) {
        r.vdash(cN + Math.round(L.COL_NAME * fc / L.FLAVOR_COLS), fy, L.FLAVOR_CELL_H);
      }
      fy += L.FLAVOR_CELL_H;
    }
    // フレーバーの記入内容を1セル1種類で配置する。
    // 連続した文字列として流し込むと破線の格子に重なって判読できなくなるため。
    if (d.flavors && d.flavors.length) {
      var cellW = L.COL_NAME / L.FLAVOR_COLS;
      d.flavors.slice(0, L.FLAVOR_ROWS * L.FLAVOR_COLS).forEach(function (fv, i) {
        var col = i % L.FLAVOR_COLS, row = Math.floor(i / L.FLAVOR_COLS);
        var cxp = cN + col * cellW;
        var cyp = y + L.FLAVOR_LABEL_H + row * L.FLAVOR_CELL_H;
        // セル幅に収まる字送りを選ぶ（潰れる単純縮小はせず、2段までで表示）
        var fl = r.wrap(String(fv), cellW - 10, L.F_SUB, false).slice(0, 2);
        var fty = cyp + L.FLAVOR_CELL_H / 2 - (fl.length - 1) * 8;
        fl.forEach(function (ln) {
          r.text(ln, cxp + cellW / 2, fty, { size: L.F_SUB, align: 'center' });
          fty += 16;
        });
      });
      if (d.flavors.length > L.FLAVOR_ROWS * L.FLAVOR_COLS) {
        r.text('他' + (d.flavors.length - L.FLAVOR_ROWS * L.FLAVOR_COLS) + '件',
               cN + L.COL_NAME - 8, y + L.FLAVOR_LABEL_H / 2, { size: L.F_SUB, align: 'right' });
      }
    }
    y += flvH;

    // 持ち帰り時間（3択を丸囲み）＋ 保冷料金
    r.hline(X, y, CW);
    r.vline(cA, y, L.CARRY_H); r.vline(cC, y, L.CARRY_H);
    r.vline(X, y, L.CARRY_H); r.vline(X + CW - L.T_INNER, y, L.CARRY_H);
    var cy0 = y + L.CARRY_H / 2;
    var ctext = '持ち帰り時間（';
    var cxx = X + 8;
    r.text(ctext, cxx, cy0, { size: L.F_HEAD, bold: true });
    cxx += r.measure(ctext, L.F_HEAD, true);
    M.CARRY_OPTIONS.forEach(function (o, i) {
      if (i > 0) { r.text('・', cxx, cy0, { size: L.F_HEAD, bold: true }); cxx += r.measure('・', L.F_HEAD, true); }
      var ow = r.measure(o.label, L.F_HEAD, true);
      r.text(o.label, cxx, cy0, { size: L.F_HEAD, bold: true });
      if (d.carryKey === o.key) r.circle(cxx + ow / 2, cy0, ow / 2 + 6, 15);
      cxx += ow;
    });
    r.text('）', cxx, cy0, { size: L.F_HEAD, bold: true });
    r.text('円', cA + L.COL_AMT - 8, cy0, { size: L.F_LABEL, align: 'right' });
    var co = M.carryOption(d.carryKey);
    r.text(co && co.fee != null ? money(co.fee) : '',
           cA + L.COL_AMT - 30, cy0, { size: L.F_VALUE, bold: true, align: 'right' });
    y += L.CARRY_H;

    // 合計金額 ＋ 済・未
    r.hline(X, y, CW);
    r.vline(cA, y, L.TOTAL_H); r.vline(cC, y, L.TOTAL_H);
    r.vline(X, y, L.TOTAL_H); r.vline(X + CW - L.T_INNER, y, L.TOTAL_H);
    r.hline(X, y + L.TOTAL_H, CW);
    var ty0 = y + L.TOTAL_H / 2;
    r.text('合 計 金 額', X + 16, ty0, { size: L.F_TOTAL, bold: true });
    r.text('円', cA + L.COL_AMT - 8, ty0, { size: L.F_LABEL, align: 'right' });
    // 未確定の金額が1つでも含まれる場合は空欄にする。
    // 誤った合計を印字するより、スタッフが手書きするほうが安全。
    var grand = M.totalAmount(d);
    r.text(money(grand), cA + L.COL_AMT - 30, ty0, { size: 21, bold: true, align: 'right' });
    // 済・未（支払状態）
    var sx = cC + L.COL_CHK / 2;
    var sw = r.measure('済', L.F_HEAD, true);
    r.text('済・未', sx, ty0, { size: L.F_HEAD, bold: true, align: 'center' });
    if (d.paid === true)  r.circle(sx - 17, ty0, sw / 2 + 5, 13);
    if (d.paid === false) r.circle(sx + 17, ty0, sw / 2 + 5, 13);
    y += L.TOTAL_H + L.T_INNER;

    // ===================== 付属品確認 =====================
    // 注文された商品の付属品だけをチェック欄として自動生成する。
    // チェックボックスは空欄で印字し、スタッフが手書きでチェックする。
    // 個数分のボックスを並べ、複数数量の注文に対応する。
    var acc = measureAccessory(r, d);
    if (acc.groups.length) {
      r.box(X, y, CW, acc.height);
      r.hline(X, y + L.ACC_HEAD_H, CW);
      r.text('付属品確認', X + 10, y + L.ACC_HEAD_H / 2, { size: L.F_HEAD, bold: true });
      r.text('（お渡し前にご確認ください）', X + 108, y + L.ACC_HEAD_H / 2, { size: L.F_SUB });

      var ay = y + L.ACC_HEAD_H + L.ACC_PAD;
      acc.groups.forEach(function (g) {
        var head = g.product.mark + g.product.name.replace(/（R・S）$/, '');
        head = r.wrap(head, CW - 90, L.F_SUB, true)[0];
        r.text(head, X + 10, ay + L.ACC_TITLE_H / 2, { size: L.F_SUB, bold: true });
        r.text('×' + g.qty, X + CW - 12, ay + L.ACC_TITLE_H / 2,
               { size: L.F_SUB, bold: true, align: 'right' });
        ay += L.ACC_TITLE_H;

        g.items.forEach(function (label) {
          var bx = X + 24, by = ay + (L.ACC_ROW_H - L.ACC_BOX) / 2;
          var n = Math.min(g.qty, L.ACC_MAX_BOXES);
          for (var i = 0; i < n; i++) {
            r.box(bx, by, L.ACC_BOX, L.ACC_BOX, 2);
            bx += L.ACC_BOX + 6;
          }
          if (g.qty > L.ACC_MAX_BOXES) {
            r.text('×' + g.qty, bx, ay + L.ACC_ROW_H / 2, { size: L.F_SUB });
            bx += r.measure('×' + g.qty, L.F_SUB) + 6;
          }
          r.text(label, bx + 6, ay + L.ACC_ROW_H / 2, { size: L.F_SUB });
          ay += L.ACC_ROW_H;
        });
      });
      y += acc.height;
    }

    // ===================== 備考 =====================
    // 見出し「備考」＋ 完全な白紙スペース（64mm以上）。
    // 枠線と見出しの区切り線以外は、この領域に一切描画しない。
    var rm = measureRemark();
    r.box(X, y, CW, L.REMARK_HEAD_H + rm.height);
    r.hline(X, y + L.REMARK_HEAD_H, CW);
    r.text('備 考', X + 10, y + L.REMARK_HEAD_H / 2, { size: L.F_HEAD, bold: true });
    // 白紙スペースの実座標。検査しやすいよう呼び出し側に返す。
    rm.rect = { x: X, y: y + L.REMARK_HEAD_H, w: CW, h: rm.height };
    y += L.REMARK_HEAD_H + rm.height;

    // ===================== 注意文 ＋ お引取り時/担当 =====================
    y += 8;
    var noticeW = CW - L.STAFF_BOX_W - 12;
    var nLines = r.wrap(M.NOTICE, noticeW, L.F_NOTICE, false);
    var noticeH = nLines.length * L.NOTICE_LINE;
    var ny = y;
    nLines.forEach(function (ln) {
      r.text(ln, X, ny + L.NOTICE_LINE / 2, { size: L.F_NOTICE });
      ny += L.NOTICE_LINE;
    });

    // 担当欄（右）
    var bx = X + CW - L.STAFF_BOX_W;
    r.box(bx, y, L.STAFF_BOX_W, L.STAFF_BOX_H);
    r.vline(bx + 92, y, L.STAFF_BOX_H);
    r.text('お引取り時', bx + 46, y + L.STAFF_BOX_H / 2, { size: L.F_LABEL, align: 'center' });
    r.text('担当', bx + 92 + 29, y + L.STAFF_BOX_H / 2, { size: L.F_LABEL, align: 'center' });

    y += Math.max(noticeH, L.STAFF_BOX_H);

    // PoC用のテスト印刷マーク（本番では opts.testMark を渡さない）
    if (opts.testMark) {
      y += 6;
      r.text('【Phase 1 テスト印刷 / ' + opts.testMark + '】', X, y + 9, { size: L.F_SUB });
      y += 20;
    }

    y += L.MB;
    return {
      height: y, remark: rm, accessory: acc,
      // 重なり検査用に、商品表の実座標と縦罫線のx座標を返す
      tableRect: { top: tblTop, bottom: tblProductBottom, ruleX: [cQ, cA, cC] }
    };
  }

  // ---------------------------------------------------------------- 公開API
  // 2パス: 空Canvasで高さを測ってから本番Canvasに描く
  function renderToCanvas(opts) {
    var probe = document.createElement('canvas');
    probe.width = LAYOUT.W; probe.height = 10;
    var measured = render(probe.getContext('2d'), opts, true);

    var canvas = document.createElement('canvas');
    canvas.width = LAYOUT.W;
    canvas.height = measured.height;
    var ctx = canvas.getContext('2d');
    var result = render(ctx, opts, false);
    return { canvas: canvas, context: ctx, height: result.height,
             remark: result.remark, accessory: result.accessory,
             tableRect: result.tableRect };
  }

  // 1枚分の印刷リクエストを組む
  function buildRequest(opts) {
    var B = new StarWebPrintBuilder();
    var out = renderToCanvas(opts);
    var req = B.createInitializationElement({ reset: 'true' });
    req += B.createBitImageElement({
      context: out.context, x: 0, y: 0,
      width: out.canvas.width, height: out.canvas.height
    });
    // カット位置の調整。原本の下部余白に相当する送り量。
    req += B.createFeedElement({ line: opts.feedLines || 2 });
    req += B.createCutPaperElement({ feed: 'true', type: 'partial' });
    return {
      request: req,
      canvas: out.canvas,
      heightDots: out.canvas.height,
      heightMm: Math.round(out.canvas.height / DPMM),
      bytes: req.length,
      remark: out.remark,
      accessory: out.accessory,
      tableRect: out.tableRect
    };
  }

  // 3枚分を直列実行用のジョブ配列にする（確定仕様: 3ジョブ直列）
  function buildJobs(data, testMark) {
    return M.PRINT_ORDER.map(function (key) {
      var v = M.VARIANTS[key];
      var built = buildRequest({ variant: key, data: data, testMark: testMark });
      return {
        name: v.title + v.subtitle,
        request: built.request,
        heightMm: built.heightMm,
        bytes: built.bytes,
        remark: built.remark,
        accessory: built.accessory
      };
    });
  }

  window.CY = window.CY || {};
  window.CY.slipTemplate = {
    LAYOUT: LAYOUT,
    mm: mm,
    render: render,
    renderToCanvas: renderToCanvas,
    buildRequest: buildRequest,
    buildJobs: buildJobs,
    measureRemark: measureRemark
  };
})();
