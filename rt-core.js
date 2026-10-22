/* rt-core.js — 予約受付テスト画面の純粋ロジック（DOM非依存・Nodeで単体テスト可）
 * 下書き(1件/24時間)・未解決取引(別管理・24時間でPII消去しロック維持)・店舗判定・保存失敗ガード。 */
(function (global) {
  'use strict';
  var DRAFT_TTL = 24 * 3600 * 1000;

  // 支払済みが原則＝初期値 paid:true
  function defaultForm() {
    return { items: {}, carryKey: 'M30', acceptKind: 'ご来店', customerName: '', phone: '', acceptStaff: '',
             puY: 2026, puM: 12, puD: 24, puH: 15, puMin: 30, paid: true };   // 受取初期は 15:30
  }

  function isDraftFresh(d, now) { return !!(d && typeof d.at === 'number' && (now - d.at) < DRAFT_TTL); }
  function isPendingAged(p, now) { return !!(p && (now - (Number(p.at) || 0)) >= DRAFT_TTL); }

  // 24時間超の未解決取引はPII(form)を落とし、clientKey・店舗・状態・照合は残す（aged:true）。
  function agePending(p, now) {
    if (p && isPendingAged(p, now) && p.form) {
      return { store: p.store, clientKey: p.clientKey, phase: p.phase, at: p.at, aged: true };
    }
    return p;
  }
  // 元内容(form)が残っているときだけ再送可。期限切れ(aged)は再送禁止＝管理者対応。
  function canResend(p) { return !!(p && p.form && !p.aged); }

  // ログイン時の判定。未解決があれば別店舗ログイン不可、同店舗なら解決優先。
  function loginDecision(pend, selectedStore) {
    if (!pend) return 'ok';
    if (pend.store !== selectedStore) return 'blocked';
    return 'recover';
  }

  // 失敗を飲み込まないストレージラッパ（成功可否を返す）
  function safeSet(storage, key, obj) { try { storage.setItem(key, JSON.stringify(obj)); return true; } catch (e) { return false; } }
  function safeGet(storage, key) { try { var s = storage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function safeDel(storage, key) { try { storage.removeItem(key); return true; } catch (e) { return false; } }

  global.RTCore = {
    DRAFT_TTL: DRAFT_TTL, defaultForm: defaultForm,
    isDraftFresh: isDraftFresh, isPendingAged: isPendingAged, agePending: agePending, canResend: canResend,
    loginDecision: loginDecision, safeSet: safeSet, safeGet: safeGet, safeDel: safeDel
  };
})(typeof window !== 'undefined' ? window : globalThis);
