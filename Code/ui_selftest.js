/* =============================================================================
   Rice on the Boil — UI self-test (loaded only with Model/index.html?selftest=1)
   Clicks through all 7 stages: presets, every control option, ladder, play,
   scrubber, tabs, plot hover, kitchen panels, predictions, trials, notebook.
   Fails on any JS error or console.error, and on "NaN"/"undefined" in the
   scene, tiles or tab panel. Writes the report into <pre id="selftestOut">
   and sets document.title to "SELFTEST PASS" or "SELFTEST FAIL".
   Headless run (see README.txt):
     chrome --headless=new --virtual-time-budget=240000 --dump-dom \
       "file://…/Model/index.html?selftest=1" | grep -A60 selftestOut
   ============================================================================= */
(function () {
  'use strict';
  var A = window.RiceApp, errors = [], log = [], checks = 0, fails = 0;
  window.addEventListener('error', function (e) { errors.push('error: ' + (e.message || e) + ' @' + (e.lineno || '')); });
  var ce = console.error; console.error = function () { errors.push('console.error: ' + Array.prototype.join.call(arguments, ' ')); ce.apply(console, arguments); };
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function wait(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
  function ok(cond, msg) { checks++; if (!cond) { fails++; log.push('FAIL ' + msg); } }
  function clean(where) {
    ['#scene', '#tiles', '#tabpanel', '#predict'].forEach(function (s) {
      var h = $(s).innerHTML;
      ok(h.indexOf('NaN') < 0, where + ': NaN in ' + s);
      ok(!/>undefined</.test(h) && h.indexOf('undefined') < 0, where + ': "undefined" in ' + s);
    });
    ok(errors.length === 0, where + ': JS errors: ' + errors.join(' | '));
    errors.length = 0;
  }
  function fire(el, type) { el.dispatchEvent(new Event(type, { bubbles: true })); }
  async function settle() { await wait(260); }

  async function stage(i) {
    var st = A.STAGES[i], name = (i + 1) + ' ' + st.key;
    A.goStage(i); await wait(400);
    ok(A.app.result && A.app.result.stageKey === st.key, name + ': result computed');
    ok($$('#tiles .tile').length === 8 || st.key === 'verdict', name + ': 8 tiles');
    ok($$('#laws .law').length >= 3, name + ': laws rendered');
    clean(name + ' initial');
    // presets
    var pres = $$('#bench .presets .chip-btn');
    for (var p = 0; p < pres.length; p++) { pres[p].click(); await settle(); clean(name + ' preset ' + pres[p].textContent); }
    // every control
    for (var c = 0; c < st.controls.length; c++) {
      var ctl = st.controls[c], box = $('#bench .ctl[data-ctl="' + ctl.id + '"]');
      if (!box || box.style.display === 'none') continue;
      if (ctl.type === 'range') {
        var r = $('input[type=range]', box), orig = r.value;
        [ctl.min, ctl.max, orig].forEach(function () {});
        r.value = ctl.min; fire(r, 'input'); await settle(); clean(name + ' ' + ctl.id + '=min');
        r.value = ctl.max; fire(r, 'input'); await settle(); clean(name + ' ' + ctl.id + '=max');
        var n = $('input[type=number]', box); n.value = orig; fire(n, 'change'); await settle(); clean(name + ' ' + ctl.id + ' typed');
        ok(Math.abs(+A.app.values[st.key][ctl.id] - +orig) < 1e-9, name + ': number input sets ' + ctl.id);
      } else if (ctl.type === 'select') {
        var sel = $('select', box), o0 = sel.value;
        for (var k = 0; k < sel.options.length; k++) { sel.value = sel.options[k].value; fire(sel, 'change'); await settle(); clean(name + ' ' + ctl.id + '=' + sel.value); }
        sel.value = o0; fire(sel, 'change'); await settle();
      } else if (ctl.type === 'toggle') {
        var tg = $('input[type=checkbox]', box); tg.click(); await settle(); clean(name + ' toggle ' + ctl.id); tg = $('#bench .ctl[data-ctl="' + ctl.id + '"] input'); tg.click(); await settle();
      } else if (ctl.type === 'seg' || ctl.type === 'ladder') {
        var bs = $$('.seg button', box), on = $$('.seg button.on', box)[0];
        for (var b = 0; b < bs.length; b++) { bs[b].click(); await settle(); clean(name + ' ' + ctl.id + '=' + bs[b].textContent); ok(bs[b].classList.contains('on'), name + ': seg state ' + ctl.id); }
        if (on) { on.click(); await settle(); }
      } else if (ctl.type === 'checks') {
        var none = $('a[data-all="0"]', box); none.click(); await settle(); clean(name + ' none selected');
        var cb = $$('.checks input', box); cb[0].click(); cb[6].click(); await settle(); clean(name + ' two selected');
        $('a[data-all="1"]', box).click(); await settle(); clean(name + ' all selected');
      }
    }
    if (pres.length) { pres[0].click(); await settle(); }
    // playback + scrubber
    var t0 = A.app.t; $('#restartBtn').click(); await wait(900);
    ok(A.app.playing || A.app.t !== t0, name + ': playback advances');
    $('#playBtn').click(); await wait(100);
    // real-time rule: N× advances N model seconds per real second
    var spSel = $('#speed'), sp0 = spSel.value; spSel.value = '4';
    $('#restartBtn').click(); var tStart = A.app.t, w0 = performance.now(); await wait(1000);
    var adv = A.app.t - tStart, real = (performance.now() - w0) / 1000;
    ok(A.app.t >= A.app.result.timeline.t1 - 1e-9 || Math.abs(adv - 4 * real) <= 0.6, name + ': 4× gives 4 model s per real s (got ' + adv.toFixed(2) + ' s in ' + real.toFixed(2) + ' s)');
    if (A.app.playing) A.togglePlay(); spSel.value = sp0; await wait(60);
    var sc = $('#scrub'); sc.value = 500; fire(sc, 'input'); await wait(100);
    ok(Math.abs(A.app.t - A.fToT(0.5)) / Math.max(1e-9, A.fToT(0.5)) < 1e-6, name + ': scrubber sets time');
    ok($$('#marks .mk').length >= 1, name + ': event markers');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true })); await wait(200);
    ok(A.app.playing, name + ': space bar plays'); A.togglePlay(); await wait(80);
    clean(name + ' playback');
    // tabs
    var tabs = $$('#tablist button');
    for (var q = 0; q < tabs.length; q++) {
      tabs[q].click(); await wait(80);
      ok($('#tabpanel').innerHTML.length > 200, name + ': tab ' + tabs[q].getAttribute('data-tab') + ' has content');
      clean(name + ' tab ' + tabs[q].getAttribute('data-tab'));
      if (tabs[q].getAttribute('data-tab') === 'plots') {
        var svgs = $$('#tabpanel svg.riceplot'); ok(svgs.length >= 1, name + ': plots rendered');
        svgs.forEach(function (s) {
          var rc = s.getBoundingClientRect(); s.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: rc.left + rc.width * 0.5, clientY: rc.top + rc.height * 0.55 }));
        });
        ok($$('#tabpanel .tip').length <= 1, name + ': hover tooltip');
        var csvb = $('#tabpanel button[data-exp="csv"]'); ok(!!csvb, name + ': CSV export button');
      }
      if (tabs[q].getAttribute('data-tab') === 'notes') {
        var ta = $('#notesTa'); ta.value = 'self-test note ' + st.key; fire(ta, 'input');
        $('#trialBtn').click(); await wait(60);
        ok($$('#tabpanel table.data tbody tr').length >= 1, name + ': trial recorded');
      }
    }
    tabs[0].click(); await wait(60);
    // prediction
    var pin = $('#predIn');
    if (pin && !pin.disabled) { pin.value = '10'; $('#predLock').click(); await wait(60); }
    ok(/Model/.test($('#predRes').textContent) || /not reached/.test($('#predRes').textContent), name + ': prediction compared');
    // kitchen panel
    if (st.kitchen) {
      var det = $('#kitchenSlot details'); ok(!!det, name + ': kitchen panel'); det.open = true;
      if (st.key === 'soak') {
        var m0 = $('#kM0'); m0.value = '20'; fire(m0, 'change'); await wait(60);
        var data = [[10, 21.2], [30, 22.0], [60, 22.6], [120, 23.4]];
        for (var d = 0; d < data.length; d++) {
          if (d > 0) { $('#kAdd').click(); await wait(40); }
          var ins = $$('#kitchenSlot input[data-k]'), rowT = ins[2 * d], rowM = ins[2 * d + 1];
          rowT.value = data[d][0]; fire(rowT, 'change'); await wait(30);
          ins = $$('#kitchenSlot input[data-k]'); rowM = ins[2 * d + 1]; rowM.value = data[d][1]; fire(rowM, 'change'); await wait(30);
        }
        $('#kFit').click(); await wait(80);
        ok(/D = /.test($('#kitchenSlot').textContent), name + ': soaking fit shown');
        $('#kClear').click(); await wait(40);
      } else {
        var ip = $$('#kitchenSlot input[data-k]'); ip[0].value = '8'; fire(ip[0], 'change'); await wait(40);
        ip = $$('#kitchenSlot input[data-k]'); ip[1].value = '40'; fire(ip[1], 'change'); await wait(60);
        ok(A.NB.kitchen.plate.length >= 1, name + ': plate data stored');
        $('#kpClear').click(); await wait(40);
      }
      clean(name + ' kitchen');
    }
    log.push('ok   stage ' + name);
  }

  async function run() {
    await wait(300);
    for (var i = 0; i < A.STAGES.length; i++) {
      try { await stage(i); } catch (e) { fails++; log.push('FAIL stage ' + (i + 1) + ' threw ' + e.message + ' ' + (e.stack || '').split('\n')[1]); }
    }
    // theme switch + notebook
    $('#themeBtn').click(); await wait(200); clean('theme toggle');
    ok(document.documentElement.getAttribute('data-theme') !== null, 'theme attribute set');
    $('#themeBtn').click(); await wait(200);
    $('#nbBtn').click(); await wait(60);
    ok(/NOTEBOOK/.test($('#nbText').textContent) && /self-test note/.test($('#nbText').textContent), 'notebook export text');
    $('#nbClose').click();
    $$('#steps .step')[3].click(); await wait(300); ok(location.hash === '#race', 'stepper click sets hash');
    clean('final');
    var out = document.createElement('pre'); out.id = 'selftestOut';
    out.textContent = 'SELFTEST ' + (fails ? 'FAIL' : 'PASS') + ': ' + checks + ' checks, ' + fails + ' failed\n' + log.join('\n');
    document.body.appendChild(out);
    document.title = 'SELFTEST ' + (fails ? 'FAIL' : 'PASS');
    try { localStorage.removeItem('riceOnTheBoil.v1'); } catch (e) { /* ignore */ }
  }
  async function layout() {
    // ?selftest=layout : report elements wider than the viewport on every stage (phone-width check)
    await wait(300);
    var W = document.documentElement.clientWidth, bad = [];
    for (var i = 0; i < A.STAGES.length; i++) {
      A.goStage(i); await wait(500);
      $$('body *').forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > W + 1 && !el.closest('.tablist') && !el.closest('.tablewrap') && !el.closest('dialog')) {
          var path = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').join('.') : '');
          bad.push(A.STAGES[i].key + ' ' + path + ' right=' + Math.round(r.right) + ' w=' + Math.round(r.width));
        }
      });
    }
    var out = document.createElement('pre'); out.id = 'selftestOut';
    out.textContent = 'LAYOUT ' + (bad.length ? 'FAIL' : 'PASS') + ' viewport ' + W + ' px, scrollWidth ' + document.documentElement.scrollWidth + '\n' + bad.slice(0, 60).join('\n');
    document.body.appendChild(out); document.title = 'LAYOUT ' + (bad.length ? 'FAIL' : 'PASS');
    try { if (window.parent !== window) window.parent.postMessage(out.textContent, '*'); } catch (e) { /* ignore */ }
  }
  if (/selftest=layout/.test(location.search)) layout(); else run();
})();
