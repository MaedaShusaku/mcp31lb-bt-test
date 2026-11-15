// verify-slip-node.js -- bt-public 帳票の机上検証（node・外部通信なし・ブラウザ起動なし）
//
//   node bt-public/tools/verify-slip-node.js
//
// 文字幅は近似値（slip-verify-core.js approxMeasure）。実フォントでの判定は
// bt-public/verify-slip.html を既存ブラウザで開いて確認する。実機合格ではない。
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const BT = path.join(__dirname, '..');
const core = require('./slip-verify-core.js');

const sandbox = { console, Math, JSON, Uint8ClampedArray };
sandbox.window = sandbox;
sandbox.document = {
  createElement(tag) {
    if (tag !== 'canvas') throw new Error('unexpected element ' + tag);
    const rec = new core.Recorder(null, core.approxMeasure, 576, 10);
    return rec.canvas;
  }
};
vm.createContext(sandbox);
// SLIP_TEMPLATE=別パス で旧テンプレートを検査できる（検査器が既知の不具合を検出するかの確認用）
const TEMPLATE = process.env.SLIP_TEMPLATE ? path.resolve(process.env.SLIP_TEMPLATE) : path.join(BT, 'src/slip-template.js');
for (const f of [path.join(BT, '../poc/js/StarWebPrintBuilder.js'), path.join(BT, 'src/slip-master.js'), TEMPLATE, path.join(BT, 'src/sample-data.js')]) {
  vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: path.basename(f) });
}
const S = sandbox.CY.slipTemplate, M = sandbox.CY.master, SD = sandbox.CY.sampleData.build;

function make(opts) {
  const probe = new core.Recorder(null, core.approxMeasure, 576, 10);
  const h = S.render(probe, opts, true).height;
  const rec = new core.Recorder(null, core.approxMeasure, 576, h);
  const result = S.render(rec, opts, false);
  if (result.height !== h) throw new Error('dry/本描画で高さ不一致 ' + h + '/' + result.height);
  return { rec, result };
}

const res = core.run({ S, M, SD, make, measureCtx: new core.Recorder(null, core.approxMeasure, 576, 10) });

// buildAll（SDK リクエスト生成・印刷順・カット）
const lines = res.lines;
let fails = res.fails;
function ok(c, t, d) { lines.push((c ? 'ok   ' : 'FAIL ') + t + (!c && d ? '\n       ' + d : '')); if (!c) fails++; }
lines.push('', '[buildAll / SDKリクエスト（無改変SDK・送信なし）]');
const d = SD();
const jobs = S.buildAll(d);
ok(jobs.length === 2 + 7, 'buildAll = 9ジョブ（控え2＋貼付用7）');
ok(jobs[0].name === '引換証（お客様控え）' && jobs[1].name === '受注書（店舗控え）', '印刷順: 引換証→受注書→貼付用', jobs.slice(0, 2).map(j => j.name).join(','));
ok(jobs.every(j => (j.request.match(/<cutpaper[^>]*type="partial"/g) || []).length === 1), '各ジョブにパーシャルカット1回');
ok(jobs.every(j => /<bitimage[^>]*width="576"/.test(j.request)), '全ジョブ 576dot 幅のビットイメージ');

lines.push('', '[計測（近似フォント）]');
const meas = res.slips.filter(x => x.scenario === '標準サンプル(①③⑤×2⑦⑧×2)');
meas.forEach(x => lines.push('  ' + (x.kind === 'tag' ? '貼付用' + x.opts.unit.seq + ' ' + M.productByNo(x.opts.unit.no).mark : x.kind === 'customer' ? '引換証' : '受注書') +
  ': ' + x.result.height + 'dot / ' + Math.round(x.result.height / 8) + 'mm'));
lines.push('  合計: ' + meas.reduce((a, x) => a + x.result.height, 0) + 'dot / ' + Math.round(meas.reduce((a, x) => a + x.result.height, 0) / 8) + 'mm / ' + meas.length + '枚');

lines.push('', 'RESULT=' + (fails ? 'FAIL(' + fails + ')' : 'PASS') + '  ※近似フォントでの机上検証。実フォントは verify-slip.html、紙は実機で確認');
console.log(lines.join('\n'));
process.exitCode = fails ? 1 : 0;
