/* print-engine.js — 実機で9枚連続印刷に成功した Bluetooth 送信処理（slip.html）を
 *   【動作を変えずに】モジュール化したもの。予約受付画面(reserve-test.html)から再利用する。
 *   送信・1枚ごと完了確認・結果不明保留・自動再送禁止・カットは slip.html と同一仕様。
 *   SDK(StarWebPrintBuilder/Trader)と伝票テンプレート(slip-master/slip-template)は別途読み込む。 */
(function () {
  'use strict';
  var WEBPRNT_URL = 'http://localhost:8001/StarWebPRNT/SendMessage';
  var WATCHDOG_SLIP = 45000;   // 伝票画像1枚の監視時間（slip.htmlと同一）
  var printPending = null;     // { url, token, at, lateResult }
  var logFn = function () {};
  function log(m) { try { logFn(m); } catch (e) {} }

  function handlerSlot() { try { return window._handlerCallback || null; } catch (e) { return null; } }
  function clearHandlerSlot(url) { var s = handlerSlot(); if (s) { try { s[url] = null; } catch (e) {} } }
  function slotBusy(url) { var s = handlerSlot(); try { return !!(s && s[url]); } catch (e) { return false; } }

  // --- slip.html の send() を動作そのままに移植 ---
  function send(request, opts) {
    opts = opts || {};
    var watchdogMs = opts.watchdogMs || WATCHDOG_SLIP;
    return new Promise(function (resolve) {
      if (printPending) {
        log('⛔ 送信中止: 前回の印刷結果が未確定（保留 ' + Math.round((Date.now() - printPending.at) / 1000) + '秒）。結果不明を解除後に再操作してください。');
        resolve({ status: 'blocked', message: '前回の印刷結果が未確定のため送信しませんでした。' }); return;
      }
      var token = 'job-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
      var t0 = Date.now(), settled = false, wd = null;
      function settle(r) { if (settled) return; settled = true; if (wd) { clearTimeout(wd); wd = null; } r.elapsedMs = Date.now() - t0; resolve(r); }
      var t;
      try { t = new StarWebPrintTrader({ url: WEBPRNT_URL, timeout: 120000 }); }
      catch (e) { log('SDK: Trader生成失敗 — ' + e.message); settle({ status: 'error', message: 'Trader生成失敗: ' + e.message }); return; }
      window.trader = t;

      t.onReceive = function (res) {
        var succ = String(res.traderSuccess) === 'true', code = String(res.traderCode), isOk = succ && code === '0';
        if (settled) { clearHandlerSlot(WEBPRNT_URL);
          if (printPending && printPending.token === token) { printPending.lateResult = isOk ? 'ok' : 'error'; } return; }
        log('← onReceive: success=' + succ + ' code=' + code);
        settle({ status: isOk ? 'ok' : 'error', success: succ, code: code, traderStatus: res.traderStatus, trader: t,
                 message: isOk ? '' : ('印刷が完了していません success=' + succ + ' code=' + code) });
      };
      t.onError = function (res) {
        if (settled) { clearHandlerSlot(WEBPRNT_URL); return; }
        var hint = ''; if (res && res.status === 413) hint = ' リクエストが大きすぎます。';
        else if (res && (res.status === 0 || res.status === 10002 || res.status === 10003)) hint = ' ブリッジに到達できていません。';
        log('← onError: status=' + (res && res.status));
        settle({ status: 'error', message: '印刷エラー status=' + (res && res.status) + hint });
      };
      t.onTimeout = function () { if (settled) return; log('← onTimeout(SDK)'); settle({ status: 'error', message: '通信タイムアウト(SDK)' }); };

      if (slotBusy(WEBPRNT_URL)) { clearHandlerSlot(WEBPRNT_URL); }

      wd = setTimeout(function () {
        log('⏱ 監視タイマー作動: ' + watchdogMs + 'ms 以内に応答なし');
        printPending = { url: WEBPRNT_URL, token: token, at: Date.now(), lateResult: null };
        settle({ status: 'unknown', token: token, message: '印刷結果不明（応答なし）' });
      }, watchdogMs);

      try { log('SDK送信: ' + request.length + '文字 / token=' + token); t.sendMessage({ request: request }); }
      catch (e) { log('SDK送信: 例外 — ' + e.message); settle({ status: 'error', message: '送信失敗(例外): ' + e.message }); }
    });
  }

  function deviceStatus(r) {
    if (!r || !r.trader) return '';
    var errs = []; [['isCoverOpen', 'カバー開'], ['isPaperEnd', '用紙切れ'], ['isOffLine', 'オフライン'],
      ['isAutoCutterError', 'カッターエラー'], ['isNonRecoverableError', '回復不能'], ['isHighTemperatureStop', 'ヘッド高温']
    ].forEach(function (c) { try { if (r.trader[c[0]]({ traderStatus: r.traderStatus })) errs.push(c[1]); } catch (e) {} });
    return errs.length ? errs.join(' / ') : '異常なし';
  }

  // 逐次印刷（slip.html の一括印刷と同一: 1枚ごと完了確認し ok 以外で停止・自動再送なし）
  // 戻り: {okCount, total, stoppedAt, unknown, blocked, results:[{index,name,status}]}
  function printSequential(jobs, opts) {
    opts = opts || {};
    var okCount = 0, results = [], stoppedAt = -1, sawUnknown = false, sawBlocked = false;
    var chain = Promise.resolve(false);
    jobs.forEach(function (j, idx) {
      chain = chain.then(function (stopped) {
        if (stopped) return true;
        if (opts.onSheet) try { opts.onSheet({ phase: 'start', index: idx, total: jobs.length, name: j.name }); } catch (e) {}
        return send(j.request, { watchdogMs: WATCHDOG_SLIP }).then(function (r) {
          results.push({ index: idx, name: j.name, status: r.status });
          if (r.status === 'unknown') sawUnknown = true;
          if (r.status === 'blocked') sawBlocked = true;
          if (opts.onSheet) try { opts.onSheet({ phase: 'done', index: idx, total: jobs.length, name: j.name, status: r.status, device: deviceStatus(r) }); } catch (e) {}
          if (r.status === 'ok') { okCount++; return false; }
          stoppedAt = idx; return true;   // ok以外は停止（残りは未送信・自動再送なし）
        });
      });
    });
    return chain.then(function () { return { okCount: okCount, total: jobs.length, stoppedAt: stoppedAt, unknown: sawUnknown, blocked: sawBlocked, results: results }; });
  }

  function clearPending() {
    if (!printPending) return;
    clearHandlerSlot(printPending.url);
    log('✅ 結果不明の保留を解除' + (printPending.lateResult ? ' / 遅延結果=' + printPending.lateResult : ''));
    printPending = null;
  }

  window.CY = window.CY || {};
  window.CY.printer = {
    send: send, printSequential: printSequential, clearPending: clearPending,
    hasPending: function () { return !!printPending; },
    setLogger: function (fn) { logFn = fn || function () {}; },
    WATCHDOG: WATCHDOG_SLIP
  };
})();
