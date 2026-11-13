/**
 * MÓDULO BRIGADA 1.0 — Modulo_Telas.gs
 * Telas de consulta e análise do aplicativo web (dados da escala e da Central de trocas):
 *  público: painel do militar, calendário em mapa de calor, fila da escala, situação do efetivo, afastamentos (Gantt), extrato em PDF;
 *  Gestão (1ª Seção logada): painel de riscos, rede de trocas, desempenho (funil e tempo de resposta), mapa de calor das trocas.
 * Depende de Codigo.gs, Modulo_Extras.gs, Modulo_Trocas.gs e Modulo_TrocasWeb.gs.
 */

/* ---------- utilidades */
/** abas (Grad e Cndt e Praia) do mês atual + delta */
function abasMes_(delta) {
  var h = new Date(), dm = new Date(h.getFullYear(), h.getMonth() + (delta || 0), 1), mesId = CFG.MESES[dm.getMonth()], out = [];
  [CFG.TIPO_GRAD, CFG.TIPO_CNDT].forEach(function (t) {
    var o = abaEscala_(mesId, t, dm.getFullYear(), dm.getMonth());
    if (o) out.push({ sh: o.sh, A: o.A, tipo: t });
  });
  return out;
}
function diaHojeEm_(A) { var h = new Date(); return (A.mes === h.getMonth() && A.ano === h.getFullYear()) ? h.getDate() : 1; }
function cacheTela_(chave, ttl, fn) {
  var k = chave + '|' + verTrocas_(), c = cacheGet_(k);
  if (c) return c;
  var r = fn();
  cachePut_(k, r, ttl);
  return r;
}
function nomeCurto_(n) { return semGrad_(n) || String(n); }
var NOMES_AFAST_ = { ferias: 'férias', missao: 'missão', licenca: 'licença', baixado: 'baixado', concurso: 'concurso', fora: 'fora' };
/** tipo e cor do afastamento de uma célula (pela legenda da aba) */
function rotuloAfast_(A, r, c) {
  var bg = String(A.bgs[r][c]).toLowerCase(), fg = String(A.fgs[r][c]).toLowerCase(), L = A.leg || {};
  if (L.exame && L.exame.bg === bg && L.exame.fg === fg) return { tipo: 'exame', cor: bg };
  for (var k in NOMES_AFAST_) if (L[k] && L[k].bg === bg) return { tipo: NOMES_AFAST_[k], cor: bg };
  return { tipo: 'afastamento', cor: bg };
}
/** previsto por dia de um bloco: linha "previsto" da planilha, se houver; senão o sugerido */
function previstoBloco_(A, B) {
  var ex = null;
  try { ex = acharLinhasEfetivo_(A, B); } catch (e) { ex = null; }
  if (ex) { var o = []; for (var d = 1; d <= A.nDias; d++) { var x = num_(A.vals[ex.prev][colDia_(d)]); o.push(x == null ? '' : x); } return o; }
  try { return previstoDias_(A, B, vagasSugeridas_(A, B), false); } catch (e2) { return []; }
}

/* ============================================================ 1 · painel do militar */
function webPainelMilitar(nome) {
  ativarMemoLer_();
  if (!String(nome || '').trim()) throw new Error('Escolha um militar.');
  return cacheTela_('PM|' + norm_(nome), 60, function () {
    var base = webEscalaMilitarCalc_(nome), blocos = [], hoje = new Date();
    abasMes_(0).forEach(function (o) {
      var A = o.A, d = diaHojeEm_(A), c = colDia_(d);
      A.blocos.forEach(function (B) {
        var meu = null, lista = [];
        B.rows.forEach(function (R) {
          var v = num_(A.vals[R.r][c]);
          if (mesmoMil_(R.key, nome)) meu = { R: R, v: v, cl: classeCel_(A, R.r, c) };
          if (v != null && classeCel_(A, R.r, c) !== 'afast') lista.push({ r: R.r, v: v });
        });
        if (!meu) return;
        lista.sort(function (a, b) { return b.v - a.v || b.r - a.r; });
        var pos = 0; lista.forEach(function (x, i) { if (x.r === meu.R.r) pos = i + 1; });
        blocos.push({ titulo: B.titulo, aba: A.nome, folga: meu.v, afast: meu.cl === 'afast', pos: pos, de: lista.length });
      });
    });
    var iso = isoData_(hoje), itens = base.itens, prox = itens.filter(function (x) { return x.iso >= iso && x.tipo !== 'passou'; })[0] || null;
    var mes = hoje.getMonth(), mesIni = isoData_(new Date(hoje.getFullYear(), mes, 1)), mesFim = isoData_(new Date(hoje.getFullYear(), mes + 1, 0));
    var noMes = itens.filter(function (x) { return x.iso >= mesIni && x.iso <= mesFim; });
    return {
      nome: base.nome, hoje: iso, itens: itens, blocos: blocos, proximo: prox,
      servicosMes: noMes.filter(function (x) { return x.tipo === 'servico'; }).length,
      pegou: noMes.filter(function (x) { return x.tipo === 'pegou'; }).length,
      passou: noMes.filter(function (x) { return x.tipo === 'passou'; }).length
    };
  });
}

/* ============================================================ 2 · calendário em mapa de calor */
function calendarioCalc_(delta, filtro) {
  var abas = abasMes_(delta);
  if (!abas.length) throw new Error('Não há escala cadastrada para esse mês.');
  var A0 = abas[0].A, n = A0.nDias, dias = [], keys = {}, afastPorDia = [], titulos = [];
  for (var d = 1; d <= n; d++) { dias.push({ d: d, prev: 0, esc: 0, falta: 0, det: [] }); afastPorDia.push({}); }
  abas.forEach(function (o) {
    var A = o.A;
    A.blocos.forEach(function (B) {
      if (titulos.indexOf(B.titulo) < 0) titulos.push(B.titulo);
      B.rows.forEach(function (R) {
        keys[R.key] = true;
        for (var d = 1; d <= n; d++) if (classeCel_(A, R.r, colDia_(d)) === 'afast' && num_(A.vals[R.r][colDia_(d)]) !== 0) afastPorDia[d - 1][R.key] = true;
      });
      if (filtro && B.titulo !== filtro) return;
      var prev = previstoBloco_(A, B);
      for (var dd = 1; dd <= n; dd++) {
        var p = prev[dd - 1];
        if (p === '' || p == null) continue;
        var esc = 0;
        B.rows.forEach(function (R) { var c = colDia_(dd); if (participa_(A, B, R, dd) && num_(A.vals[R.r][c]) === 0 && classeCel_(A, R.r, c) !== 'verde') esc++; });
        var x = dias[dd - 1];
        x.prev += p; x.esc += Math.min(esc, p);
        if (esc < p) { x.falta += p - esc; x.det.push({ t: B.titulo, falta: p - esc }); }
      }
    });
  });
  var total = Object.keys(keys).length || 1;
  dias.forEach(function (x, i) {
    x.afast = Object.keys(afastPorDia[i]).length;
    x.st = x.prev === 0 ? 'z' : (x.falta > 0 ? 'r' : (x.afast / total >= 0.18 ? 'm' : 'o'));
    x.det = x.det.slice(0, 6);
  });
  var primeiro = new Date(A0.ano, A0.mes, 1);
  return { mes: A0.nome, mesN: A0.mes + 1, ano: A0.ano, dow1: primeiro.getDay(), nDias: n, hojeD: (new Date().getMonth() === A0.mes && new Date().getFullYear() === A0.ano) ? new Date().getDate() : 0, totalEfetivo: total, titulos: titulos, dias: dias };
}
function webCalendario(delta, filtro) {
  ativarMemoLer_();
  return cacheTela_('CL|' + (delta || 0) + '|' + norm_(filtro || ''), 90, function () { return calendarioCalc_(delta || 0, filtro || ''); });
}

/* ============================================================ 3 · fila da escala */
function webFila(titulo) {
  ativarMemoLer_();
  return cacheTela_('FQ|' + norm_(titulo), 60, function () {
    var achou = null;
    abasMes_(0).forEach(function (o) { o.A.blocos.forEach(function (B) { if (!achou && B.titulo === titulo) achou = { A: o.A, B: B }; }); });
    if (!achou) throw new Error('Escala não encontrada neste mês.');
    var A = achou.A, B = achou.B, d = diaHojeEm_(A), c = colDia_(d), ok = [], serv = [], af = [];
    B.rows.forEach(function (R) {
      var v = num_(A.vals[R.r][c]), cl = classeCel_(A, R.r, c), nm = R.nome.replace(/\s+/g, ' ').trim();
      if (cl === 'afast' && v !== 0) { af.push({ nome: nm, sub: R.sub, st: 'afast', folga: null, r: R.r }); return; }
      if (v === 0) { serv.push({ nome: nm, sub: R.sub, st: 'serv', folga: 0, r: R.r }); return; }
      if (v == null) return;
      ok.push({ nome: nm, sub: R.sub, st: 'ok', folga: v, curta: v < 2, r: R.r });
    });
    ok.sort(function (a, b) { return b.folga - a.folga || b.r - a.r; });
    var itens = ok.concat(serv, af).slice(0, 60).map(function (x) { return { nome: x.nome, sub: x.sub, st: x.st, folga: x.folga, curta: !!x.curta }; });
    return { titulo: B.titulo, aba: A.nome, dia: d, data: fmtData_(dataDia_(A, d)), proximo: ok.length ? ok[0].nome : '', itens: itens };
  });
}

/* ============================================================ 4 · situação do efetivo */
function webEfetivo(iso) {
  ativarMemoLer_();
  var dt = parseIso_(iso), mesId = CFG.MESES[dt.getMonth()];
  return cacheTela_('EF|' + iso, 90, function () {
    var por = {}, d = dt.getDate(), c = colDia_(d), achou = false;
    [CFG.TIPO_GRAD, CFG.TIPO_CNDT].forEach(function (t) {
      var o = abaEscala_(mesId, t, dt.getFullYear(), dt.getMonth());
      if (!o) return;
      achou = true;
      o.A.blocos.forEach(function (B) {
        B.rows.forEach(function (R) {
          var v = num_(o.A.vals[R.r][c]), cl = classeCel_(o.A, R.r, c), st = v === 0 && cl !== 'verde' ? 's' : (cl === 'afast' ? 'a' : 'd');
          var x = por[R.key] = por[R.key] || { sub: R.sub || '—', st: 'd' };
          if (st === 's') x.st = 's'; else if (st === 'a' && x.st !== 's') x.st = 'a';
        });
      });
    });
    if (!achou) throw new Error('Não há escala cadastrada para essa data.');
    var tot = { s: 0, a: 0, d: 0 }, subs = {};
    Object.keys(por).forEach(function (k) { var x = por[k]; tot[x.st]++; var s = subs[x.sub] = subs[x.sub] || { sub: x.sub, s: 0, a: 0, d: 0 }; s[x.st]++; });
    return {
      data: fmtData_(dt) + ' ' + CFG.DIAS[dt.getDay()], total: tot.s + tot.a + tot.d, servico: tot.s, afast: tot.a, disp: tot.d,
      subs: Object.keys(subs).map(function (k) { return subs[k]; }).sort(function (a, b) { return (b.s + b.a + b.d) - (a.s + a.a + a.d); })
    };
  });
}

/* ============================================================ 7 · afastamentos (Gantt) */
function webAfastamentos(delta) {
  ativarMemoLer_();
  return cacheTela_('AF|' + (delta || 0), 120, function () {
    var abas = abasMes_(delta || 0);
    if (!abas.length) throw new Error('Não há escala cadastrada para esse mês.');
    var n = abas[0].A.nDias, por = {}, legenda = {};
    abas.forEach(function (o) {
      var A = o.A;
      A.blocos.forEach(function (B) {
        B.rows.forEach(function (R) {
          for (var d = 1; d <= n; d++) {
            var c = colDia_(d);
            if (num_(A.vals[R.r][c]) === 0 || classeCel_(A, R.r, c) !== 'afast') continue;
            var rot = rotuloAfast_(A, R.r, c), x = por[R.key] = por[R.key] || { nome: R.nome.replace(/\s+/g, ' ').trim(), sub: R.sub || '', dias: {} };
            if (!x.dias[d]) x.dias[d] = rot;
            legenda[rot.tipo] = rot.cor;
          }
        });
      });
    });
    var militares = [], cont = [];
    for (var i = 0; i <= n; i++) cont.push(0);
    Object.keys(por).forEach(function (k) {
      var x = por[k], runs = [], cur = null;
      for (var d = 1; d <= n; d++) {
        var r = x.dias[d];
        if (r) { cont[d]++; if (cur && cur.tipo === r.tipo && cur.cor === r.cor && cur.e === d - 1) cur.e = d; else { cur = { s: d, e: d, tipo: r.tipo, cor: r.cor }; runs.push(cur); } }
      }
      militares.push({ nome: x.nome, sub: x.sub, runs: runs });
    });
    militares.sort(function (a, b) { return a.runs[0].s - b.runs[0].s || (a.nome < b.nome ? -1 : 1); });
    var picos = []; for (var dd = 1; dd <= n; dd++) picos.push({ d: dd, n: cont[dd] });
    picos.sort(function (a, b) { return b.n - a.n || a.d - b.d; });
    var A0 = abas[0].A;
    return {
      mes: A0.nome, nDias: n, hojeD: (new Date().getMonth() === A0.mes && new Date().getFullYear() === A0.ano) ? new Date().getDate() : 0,
      total: militares.length, militares: militares.slice(0, 80), picos: picos.slice(0, 3).filter(function (p) { return p.n > 0; }),
      legenda: Object.keys(legenda).map(function (k) { return { tipo: k, cor: legenda[k] }; })
    };
  });
}

/* ============================================================ 14 · extrato do militar (PDF) */
function webExtratoPdf(nome) {
  var p = webPainelMilitar(nome);
  function td(x) { return '<td>' + escH_(x) + '</td>'; }
  var linhas = p.itens.map(function (x, i) {
    var sit = x.tipo === 'pegou' ? 'pegou de ' + x.troca : (x.tipo === 'passou' ? 'passou para ' + x.troca : (x.iso < p.hoje ? 'cumprido' : 'previsto'));
    return '<tr class="' + (i % 2 ? 'z' : '') + '">' + td(fmtData_(parseIso_(x.iso)) + ' ' + x.dia) + td(x.esc) + td(sit) + '</tr>';
  }).join('');
  var fol = p.blocos.map(function (b, i) { return '<tr class="' + (i % 2 ? 'z' : '') + '">' + td(b.titulo) + td(b.afast ? 'afastado' : (b.folga == null ? '—' : b.folga + ' dia(s)')) + td(b.pos ? b.pos + 'º de ' + b.de : '—') + '</tr>'; }).join('');
  var corpo = '<div class="k"><b>' + p.servicosMes + '</b>serviços no mês</div><div class="k"><b>' + p.pegou + '</b>pegou por troca</div><div class="k"><b>' + p.passou + '</b>passou por troca</div>' +
    '<h2>Serviços e trocas</h2><table><tr><th>Data</th><th>Escala</th><th>Situação</th></tr>' + (linhas || '<tr><td colspan="3">Sem serviços no período.</td></tr>') + '</table>' +
    '<h2>Folga e posição na fila (hoje)</h2><table><tr><th>Escala</th><th>Folga</th><th>Posição</th></tr>' + (fol || '<tr><td colspan="3">—</td></tr>') + '</table>';
  var nomeArq = 'extrato-' + semAcento_(nomeCurto_(p.nome)).toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.pdf';
  return { nome: nomeArq, b64: pdfBlob_(pdfHtml_('Extrato de serviços — ' + p.nome, 'Gerado em ' + agoraTxt_(), corpo), nomeArq) };
}

/* ============================================================ Gestão: 9 · riscos */
var RISCO_SERV7_ = 3; /* 3 ou mais serviços em 7 dias */
function webRiscos(tok) {
  ativarMemoLer_();
  sessao_(tok);
  return cacheTela_('RK', 60, function () {
    var itens = [], hoje = new Date(), gapMin = Math.ceil(CFG.FOLGA_MIN_H / 24) + 1, alertados = {}, efTotal = 0, nomes = {};
    var abas = abasMes_(0);
    abas.forEach(function (o) {
      var A = o.A, h = diaHojeEm_(A), svc = servicosPorMilitar_(A);
      A.blocos.forEach(function (B) { B.rows.forEach(function (R) { nomes[R.key] = R.nome.replace(/\s+/g, ' ').trim(); }); });
      Object.keys(svc).forEach(function (k) {
        var dias = {}; svc[k].forEach(function (x) { if (!x.v) dias[x.d] = x.e; });
        var ds = Object.keys(dias).map(Number).sort(function (a, b) { return a - b; });
        for (var i = 1; i < ds.length; i++) {
          var gap = ds[i] - ds[i - 1];
          if (ds[i] < h || ds[i] > h + 14 || gap >= gapMin) continue;
          var hh = (gap - 1) * 24;
          itens.push({ sev: hh <= 24 ? 'r' : 'a', t: (nomes[k] || k) + ' — folga de ' + hh + ' h', s: dias[ds[i]] + ' dia ' + ds[i] + ' · serviço anterior no dia ' + ds[i - 1] + ' (' + dias[ds[i - 1]] + ')' });
          alertados[k] = true;
        }
        for (var s = h; s <= h + 14; s++) {
          var q = ds.filter(function (x) { return x >= s && x <= s + 6; }).length;
          if (q >= RISCO_SERV7_) { itens.push({ sev: 'a', t: (nomes[k] || k) + ' — ' + q + ' serviços em 7 dias', s: 'a partir do dia ' + s + ' (limite: ' + RISCO_SERV7_ + ')' }); alertados[k] = true; break; }
        }
      });
    });
    try {
      var cal = calendarioCalc_(0, '');
      efTotal = cal.totalEfetivo;
      cal.dias.forEach(function (x) { if (x.d >= (cal.hojeD || 1) && x.d <= (cal.hojeD || 1) + 7 && x.falta > 0) itens.push({ sev: 'r', t: 'Déficit de efetivo em ' + ('0' + x.d).slice(-2) + '/' + ('0' + (hoje.getMonth() + 1)).slice(-2), s: x.det.map(function (y) { return 'faltam ' + y.falta + ' em ' + y.t; }).join(' · ') }); });
    } catch (e) { /* sem calendário */ }
    var lin = linhasTrocas_(400), porDia = {};
    lin.forEach(function (l) {
      var d = null; try { d = l[15] ? JSON.parse(l[15]) : null; } catch (e) { d = null; }
      if ((l[11] === 'Pendente' || l[11] === 'Autorizada') && d && d.iso) { var k2 = d.iso + '|' + norm_(l[8]); (porDia[k2] = porDia[k2] || []).push(fmtNr_(l[0])); }
      if (l[11] === 'Pendente') {
        if (/pós-fechamento/i.test(String(l[10]))) itens.push({ sev: 'a', t: 'Pedido pós-fechamento do BI — ' + fmtNr_(l[0]), s: String(l[6]) + ' · ' + String(l[7]) + ' ➜ ' + String(l[8]) });
        if (l[1] instanceof Date && (hoje - l[1]) / 86400000 >= 2) itens.push({ sev: 'a', t: 'Pendente há ' + Math.floor((hoje - l[1]) / 86400000) + ' dias — ' + fmtNr_(l[0]), s: String(l[6]) + ' · serviço ' + (l[4] instanceof Date ? fmtData_(l[4]) : '') });
      }
    });
    Object.keys(porDia).forEach(function (k) { if (porDia[k].length > 1) itens.push({ sev: 'r', t: 'Conflito: o mesmo militar é “pega” em ' + porDia[k].length + ' solicitações', s: porDia[k].join(' e ') + ' · ' + k.split('|')[0].split('-').reverse().join('/') }); });
    itens.sort(function (a, b) { return (a.sev === 'r' ? 0 : 1) - (b.sev === 'r' ? 0 : 1); });
    var crit = itens.filter(function (x) { return x.sev === 'r'; }).length, aten = itens.length - crit;
    return { crit: crit, aten: aten, ok: Math.max(0, efTotal - Object.keys(alertados).length), itens: itens.slice(0, 40) };
  });
}

/* ============================================================ Gestão: 10 · rede, 11 · desempenho, 12 · calor */
function faixaDatas_(de, ate) {
  var h = new Date(), a = de ? parseIso_(de) : new Date(h.getFullYear(), h.getMonth(), 1), b = ate ? parseIso_(ate) : new Date(h.getFullYear(), h.getMonth() + 1, 0);
  b.setHours(23, 59, 59);
  return { a: a, b: b };
}
function webRede(tok, de, ate) {
  sessao_(tok);
  var f = faixaDatas_(de, ate), arestas = {}, grau = {}, nomes = {}, total = 0;
  linhasTrocas_(0).forEach(function (l) {
    if (l[11] !== 'Autorizada' || !(l[4] instanceof Date) || l[4] < f.a || l[4] > f.b) return;
    var a = norm_(l[7]), b = norm_(l[8]);
    if (!a || !b) return;
    nomes[a] = nomeCurto_(l[7]); nomes[b] = nomeCurto_(l[8]); total++;
    grau[a] = (grau[a] || 0) + 1; grau[b] = (grau[b] || 0) + 1;
    var k = a < b ? a + '||' + b : b + '||' + a, e = arestas[k] = arestas[k] || { a: a < b ? a : b, b: a < b ? b : a, n: 0, ab: 0, ba: 0 };
    e.n++; if (a === e.a) e.ab++; else e.ba++;
  });
  var top = Object.keys(grau).sort(function (x, y) { return grau[y] - grau[x]; }).slice(0, 10), set = {};
  top.forEach(function (k) { set[k] = true; });
  var edges = Object.keys(arestas).map(function (k) { return arestas[k]; }).filter(function (e) { return set[e.a] && set[e.b]; }).map(function (e) { return { a: nomes[e.a], b: nomes[e.b], n: e.n, ab: e.ab, ba: e.ba }; });
  var ins = Object.keys(arestas).map(function (k) { return arestas[k]; }).filter(function (e) { return e.n >= 3; }).sort(function (x, y) { return y.n - x.n; }).slice(0, 4).map(function (e) {
    var uni = e.ab === 0 || e.ba === 0;
    return nomes[e.a] + ' ⇄ ' + nomes[e.b] + ': ' + e.n + ' trocas' + (uni ? ', sempre na mesma direção' : ' (' + e.ab + ' e ' + e.ba + ')');
  });
  return { total: total, nodes: top.map(function (k) { return { nome: nomes[k], n: grau[k] }; }), edges: edges, insights: ins };
}

function webDesempenho(tok, de, ate) {
  sessao_(tok);
  var f = faixaDatas_(de, ate), c = { sol: 0, aut: 0, neg: 0, pend: 0, exp: 0, canc: 0 }, horas = [], sem = {};
  linhasTrocas_(0).forEach(function (l) {
    if (!(l[1] instanceof Date) || l[1] < f.a || l[1] > f.b || l[11] === 'Excluída' || l[11] === 'Inválida') return;
    c.sol++;
    var s = l[11]; if (s === 'Autorizar' || s === 'Negar') s = 'Pendente';
    if (s === 'Autorizada') c.aut++; else if (s === 'Negada') c.neg++; else if (s === 'Pendente') c.pend++; else if (s === 'Expirada') c.exp++; else if (s === 'Cancelada') c.canc++;
    if ((s === 'Autorizada' || s === 'Negada') && l[13] instanceof Date) {
      var h = (l[13] - l[1]) / 3600000; horas.push(h);
      var ini = new Date(l[1].getFullYear(), l[1].getMonth(), l[1].getDate() - l[1].getDay()), k = isoData_(ini);
      (sem[k] = sem[k] || []).push(h);
    }
  });
  function med(a) { return a.length ? Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length * 10) / 10 : null; }
  var semanas = Object.keys(sem).sort().slice(-8).map(function (k) { return { rot: k.slice(8) + '/' + k.slice(5, 7), h: med(sem[k]) }; });
  var dec = c.aut + c.neg;
  return { sol: c.sol, aut: c.aut, neg: c.neg, pend: c.pend, exp: c.exp, canc: c.canc, taxa: dec ? Math.round(100 * c.aut / dec) : null, horas: med(horas), semanas: semanas };
}

function webCalorTrocas(tok, de, ate) {
  sessao_(tok);
  var f = faixaDatas_(de, ate), mat = {}, tot = [0, 0, 0, 0, 0, 0, 0], porEsc = {}, n = 0;
  linhasTrocas_(0).forEach(function (l) {
    if (!(l[4] instanceof Date) || l[4] < f.a || l[4] > f.b) return;
    if (['Excluída', 'Inválida', 'Cancelada'].indexOf(l[11]) >= 0) return;
    var t = String(l[6] || '—'), w = l[4].getDay();
    mat[t] = mat[t] || [0, 0, 0, 0, 0, 0, 0]; mat[t][w]++; tot[w]++; porEsc[t] = (porEsc[t] || 0) + 1; n++;
  });
  var escalas = Object.keys(mat).sort(function (a, b) { return porEsc[b] - porEsc[a]; }).slice(0, 10), max = 0;
  escalas.forEach(function (e) { mat[e].forEach(function (v) { if (v > max) max = v; }); });
  var fimSem = tot[5] + tot[6], leitura = '';
  if (n) {
    var dm = 0; tot.forEach(function (v, i) { if (v > tot[dm]) dm = i; });
    leitura = 'O dia com mais trocas é ' + ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][dm] + ' (' + tot[dm] + ' de ' + n + '). Sexta e sábado somam ' + Math.round(100 * fimSem / n) + '% das trocas' + (escalas.length ? '; a escala com mais trocas é ' + escalas[0] + ' (' + porEsc[escalas[0]] + ').' : '.');
  }
  return { total: n, max: max, escalas: escalas.map(function (e) { return { nome: e, dias: mat[e], n: porEsc[e] }; }), porDia: tot, leitura: leitura };
}
