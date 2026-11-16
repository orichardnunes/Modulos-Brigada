/**
 * MÓDULO BRIGADA 1.0 — Modulo_Secao.gs
 * Escalas pelo celular (aba "Escalas" do app de gestão): ver a prévia, conferir divergências,
 * atualizar/criar prévia, adicionar/retirar serviço e exportar PDF. Todas as funções exigem sessão da 1ª Seção.
 */

/** abas de prévia (sem o modelo) com a semana de cada uma; a "atual" é a que contém hoje */
function webSecaoInicio(tok) {
  sessao_(tok);
  var lista = apiPreviasLista(false), hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  lista.forEach(function (x) {
    if (!x.t) { x.rotulo = x.nome; return; }
    var ini = new Date(x.t);
    x.rotulo = rotuloSemana_(ini);
    x.iso = isoData_(ini);
  });
  var padrao = lista.filter(function (x) { return x.atual; })[0] || lista[0] || null;
  return { previas: lista, padrao: padrao ? padrao.nome : '' };
}

function secaoAba_(nome) {
  var sh = ss_().getSheetByName(String(nome || ''));
  if (!sh || !/^Pr[eé]via/i.test(sh.getName()) || /Modelo/i.test(sh.getName())) throw new Error('Prévia "' + nome + '" não encontrada.');
  return sh;
}

/** a prévia como tabela: uma linha por serviço, uma coluna por dia */
function webSecaoPrevia(tok, nome) {
  sessao_(tok);
  var sh = secaoAba_(nome), lr = sh.getLastRow(), disp = sh.getRange(1, 1, lr, 9).getDisplayValues(), datas = datasPrevia_(sh);
  var rot = {};
  rotularLinhasPrevia_(sh).forEach(function (m) { if (!rot[m.r]) rot[m.r] = m; });
  var dias = datas.map(function (d) { return { iso: isoData_(d), d: ('0' + d.getDate()).slice(-2), dow: CFG.DIAS[d.getDay()], dm: ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) }; });
  var parada = []; for (var c = 2; c < 9; c++) parada.push(String(disp[3][c] || '').replace(/^PARADA DI[AÁ]RIA:\s*/i, ''));
  var linhas = [], pend = 0;
  for (var r = 4; r < lr; r++) {
    var a = String(disp[r][0]).trim(), b = String(disp[r][1]).trim(), cel = [], tem = false;
    for (var k = 2; k < 9; k++) { var t = String(disp[r][k]).trim(); cel.push(t); if (t) tem = true; }
    if (!tem) { if (a && !b) linhas.push({ sec: true, label: a.replace(/\s+/g, ' ') }); continue; }
    var m = rot[r + 1], label = (b || (m && m.label) || a || ('linha ' + (r + 1))).replace(/\s+/g, ' ');
    cel.forEach(function (t) { if (t === 'PENDENTE' || /^#(ERROR|REF|N\/A|VALUE|NAME)/i.test(t)) pend++; });
    linhas.push({ label: label, r: r + 1, cels: cel });
  }
  return { nome: sh.getName(), carimbo: String(sh.getRange('J1').getDisplayValue() || ''), dias: dias, parada: parada, linhas: linhas, pend: pend };
}

/* ============================================================ DIVERGÊNCIAS */
function offFormulaExt_(f) {
  var m = /MATCH\(\s*1\s*[;,]\s*INDEX\(\s*dados\s*[;,]\s*\d+\s*[;,]\s*0\s*\)\s*[;,]\s*0\s*\)\s*([+-]\s*\d+)?/.exec(f || '');
  return m ? (m[1] ? Number(m[1].replace(/\s/g, '')) : 0) : null;
}

function secaoSemExt_(nome) { return String(nome || '').replace(/\s*\*\s*$/, '').replace(/\s+/g, ' ').trim(); }

/** compara a prévia com a escala e com os arquivos externos; cada item tem gravidade ('r' crítica, 'a' aviso) */
function divPrevia_(sh) {
  var itens = [], datas = datasPrevia_(sh), lr = sh.getLastRow(), rg = sh.getRange(1, 1, lr, 9), forms = rg.getFormulas(), disp = rg.getDisplayValues();
  var mapa = rotularLinhasPrevia_(sh), por = {};
  mapa.forEach(function (m) { por[m.secao + '|' + m.label + '|' + m.pos] = m.r; });
  function linha(sec, label, pos) { return por[sec + '|' + label + '|' + (pos || 1)]; }
  function rotDia(i) { return ('0' + datas[i].getDate()).slice(-2) + '/' + ('0' + (datas[i].getMonth() + 1)).slice(-2); }
  function nomes(r) { return r ? datas.map(function (d, i) { return String(disp[r - 1][2 + i]).trim(); }) : []; }
  var comprometidas = {};

  /* 1) arquivos externos (Sgt Dia e Manobreiro) lendo a coluna de outra data */
  var rS1 = linha('SV SUBUNIDADES', 'SGT DIA 1ª/2ª BO'), rS2 = linha('SV SUBUNIDADES', 'SGT DIA BIA C/DMSF'), rMano = linha('SV UNIDADE', 'MANOBREIRO');
  var fontes = [
    { id: 'ext-sgt', titulo: 'Sgt Dia', rows: [rS1, rS2], ler: lerSgt_, esperado: true },
    { id: 'ext-mano', titulo: 'Manobreiro', rows: [rMano], ler: lerMano_, esperado: false }
  ];
  fontes.forEach(function (F) {
    var ruins = [], det = [], marks = [];
    datas.forEach(function (dt, i) {
      var X = null;
      try { X = F.ler(dt); } catch (e) { X = null; }
      if (!X || X.loc.idx1 == null || X.loc.idx1 < 0) return;
      var esperado = X.loc.col - X.loc.idx1, errado = false;
      F.rows.forEach(function (r) {
        if (!r) return;
        var got = offFormulaExt_(forms[r - 1][2 + i]);
        if (got !== null && got !== esperado) errado = true;
      });
      if (!errado) return;
      ruins.push(i);
      F.rows.forEach(function (r) { if (r) marks.push([r, i]); });
      var linhaTxt = 'Dia ' + rotDia(i) + ': ';
      if (F.esperado) {
        var z = zerosExt_(X, X.pessoas).map(function (p) { return p.nome; });
        linhaTxt += 'esperado ' + (z.slice(0, 2).join(' / ') || '—') + ' · prévia ' + (F.rows.map(function (r) { return r ? disp[r - 1][2 + i] : ''; }).filter(String).join(' / ') || '—');
      } else linhaTxt += 'prévia ' + (disp[F.rows[0] - 1][2 + i] || '—') + ' (coluna de outra data)';
      det.push(linhaTxt);
    });
    if (ruins.length) {
      F.rows.forEach(function (r) { if (r) comprometidas[r] = true; });
      itens.push({ id: F.id, sev: 'r', titulo: F.titulo + ': ' + (ruins.length === datas.length ? 'a semana inteira' : ruins.map(rotDia).join(', ')) + ' lê(em) outra data', linhas: det.slice(0, 7), marks: marks, acao: 'corrigir' });
    }
  });

  /* 2) CB DIA com as fórmulas fora de ordem (cada linha usa a posição na escala) */
  var cols = ['AB', 'AC', 'AD', 'AE'], rotacionados = [], marksCb = [];
  for (var r = 3; r < lr; r++) {
    var pos = posicaoCbDia_(disp[r][1] || disp[r][0]);
    if (!pos) continue;
    for (var c = 0; c < 7; c++) {
      var m = /nm\s*[;,]\s*INDEX\(\s*\$([A-Z]+)\$2:/.exec(forms[r][2 + c] || '');
      if (m && m[1] !== cols[pos - 1]) { rotacionados.push(rotDia(c)); marksCb.push([r + 1, c]); comprometidas[r + 1] = true; }
    }
  }
  if (rotacionados.length) {
    var u = rotacionados.filter(function (x, i) { return rotacionados.indexOf(x) === i; });
    itens.push({ id: 'cbdia', sev: 'r', titulo: 'CB DIA fora de ordem em ' + u.join(', '), linhas: ['As fórmulas desses dias apontam para outra posição da escala (a 2ª BO é o 1º do bloco, a 1ª BO o 2º, DMSF o 3º).'], marks: marksCb, acao: 'corrigir' });
  }

  /* 3) mesmo militar duas vezes no mesmo dia */
  var vistos = {};
  for (var r2 = 4; r2 < lr; r2++) {
    var label = String(disp[r2][1] || disp[r2][0]).replace(/\s+/g, ' ').trim();
    for (var d = 0; d < 7; d++) {
      var nm = secaoSemExt_(disp[r2][2 + d]);
      if (!nm || /^(X|PENDENTE|SD EV\b|PARADA|SENTINELA)/i.test(nm) || /\d+ Sd EV/i.test(nm) || /^[A-Z0-9ª\/ ]+ - \d+/.test(nm) || nm.length < 4) continue;
      if (!/^(\d+º\s+)?(TEN|CAP|SGT|SD|CB|ST|MAJ|CEL|1º|2º|3º)/i.test(nm) && !/^(SD|CB|\dº)/i.test(nm)) continue;
      var k = d + '|' + norm_(nm);
      (vistos[k] = vistos[k] || { nome: nm, d: d, rows: [] }).rows.push(label);
    }
  }
  Object.keys(vistos).forEach(function (k) {
    var v = vistos[k];
    if (v.rows.length > 1) itens.push({ id: 'dup-' + k, sev: 'a', titulo: v.nome + ' aparece ' + v.rows.length + ' vezes em ' + rotDia(v.d), linhas: ['Linhas: ' + v.rows.join(', ') + '. Confira as notas de troca na escala.'], acao: 'abrir' });
  });

  /* 4) PENDENTE / erros de fórmula */
  try {
    var cf = apiConferirPrevia(sh.getName());
    cf.linhas.forEach(function (l) { itens.push({ id: 'pen-' + l.r, sev: 'a', titulo: l.label + ': ' + l.dias.join(', ') + ' sem militar (PENDENTE ou erro)', linhas: [l.motivo], acao: 'corrigir' }); });
  } catch (e) { /* a conferência é complementar */ }

  var okRows = 0, problema = {};
  itens.forEach(function (it) { it.rowsRef = true; });
  Object.keys(comprometidas).forEach(function (r) { problema[r] = true; });
  for (var r3 = 4; r3 < lr; r3++) {
    if (disp[r3].slice(2).some(function (t) { return String(t).trim(); }) && !problema[r3 + 1]) okRows++;
  }
  itens.sort(function (a, b) { return (a.sev === 'r' ? 0 : 1) - (b.sev === 'r' ? 0 : 1); });
  itens.forEach(function (it) { delete it.rowsRef; });
  return { itens: itens, ok: okRows, carimbo: String(sh.getRange('J1').getDisplayValue() || '') };
}

function webSecaoDiverg(tok, nome) {
  sessao_(tok);
  ativarMemoLer_();
  return divPrevia_(secaoAba_(nome));
}

/* ============================================================ ATUALIZAR / CRIAR PRÉVIA */
function atualizarPreviaSh_(sh) {
  var avisos = [], alteradas = 0;
  try { ss_().setRecalculationInterval(SpreadsheetApp.RecalculationInterval.MINUTE); } catch (e) { /* opcional */ }
  var r = migrarPrevia_(sh);
  alteradas = r.alteradas;
  try { var x = atualizarExternosPrevia_(sh, true); avisos = avisos.concat(x.avisos || []); } catch (e) { avisos.push(e.message); }
  try { atualizarTabelasInternas_(sh); } catch (e) { avisos.push(e.message); }
  try { garantirTriggerExternos_(); } catch (e) { /* o gatilho é opcional */ }
  SpreadsheetApp.flush();
  Utilities.sleep(2500); /* tempo para o IMPORTRANGE carregar */
  var p = pendenciasPrevia_(sh);
  return { alteradas: alteradas, avisos: avisos, pend: p.n, pendLinhas: Object.keys(p.linhas).map(function (k) { return k + ' (' + p.linhas[k].join(', ') + ')'; }) };
}

function webSecaoAtualizar(tok, nome, obs) {
  var m = sessao_(tok), sh = secaoAba_(nome), lock = LockService.getDocumentLock();
  lock.waitLock(25000);
  try {
    var res = atualizarPreviaSh_(sh);
    bumpTrocas_();
    auditar_(m.nome, 'Prévia atualizada (app)', sh.getName() + ' · ' + res.alteradas + ' fórmula(s) refeita(s) · pendências: ' + res.pend + (obs ? ' · ' + obs : ''));
    res.nome = sh.getName();
    return res;
  } finally { lock.releaseLock(); }
}

function webSecaoSemanas(tok) { sessao_(tok); return apiPreviaSemanas(); }

function webSecaoCriar(tok, iso) {
  var m = sessao_(tok), lock = LockService.getDocumentLock();
  lock.waitLock(25000);
  try {
    var r = criarPrevia_(parseIso_(String(iso)));
    bumpTrocas_();
    auditar_(m.nome, 'Prévia criada (app)', r.nome + ' · pendências: ' + r.pend);
    return r;
  } finally { lock.releaseLock(); }
}

function webSecaoPdf(tok, nome) {
  var m = sessao_(tok);
  secaoAba_(nome);
  var r = apiExportarPrevia(nome, true);
  auditar_(m.nome, 'Prévia exportada em PDF (app)', nome);
  return r.rel;
}

/* ============================================================ ADICIONAR / RETIRAR SERVIÇOS (por escala)
 * Reaproveita a lógica do menu da planilha (apiAbas, apiBlocos e apiServicos, em Modulo_Escala.gs). */
function webSecaoAbas(tok) {
  sessao_(tok);
  var r = apiAbas();
  r.folga = CFG.FOLGA_MIN_H;
  r.subs = CFG.SUBUNIDADES;
  r.tiposAfast = Object.keys(TIPOS_AFAST).map(function (k) { return { k: k, l: TIPOS_AFAST[k], c: (CFG.LEGENDA_PADRAO[k] || {}).bg || '#cccccc' }; });
  return r;
}

function webSecaoBlocos(tok, mesId, tipos, comLinhas) {
  sessao_(tok);
  var r = apiBlocos(String(mesId || ''), (tipos || []).filter(function (x) { return x === 'Grad' || x === 'Cndt e Praia'; }));
  r.blocos.forEach(function (b) { if (comLinhas) b.linhas = b.linhas.map(function (l) { return { nome: l.nome, sub: l.sub }; }); else delete b.linhas; });
  return r;
}

/** modo 'add' | 'del'; aplicar=false só verifica (nada é gravado) */
function webSecaoServicos(tok, modo, p, aplicar) {
  var m = sessao_(tok);
  if (modo !== 'add' && modo !== 'del') throw new Error('Ação inválida.');
  p = p || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.de || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(p.ate || '')) || p.de > p.ate) throw new Error('Período inválido.');
  var blocos = (p.blocos || []).slice(0, 60).map(function (b) {
    return { aba: String(b.aba || ''), hdr: Number(b.hdr), vagas: Math.max(0, Math.min(50, Number(b.vagas) || 0)), vagasV: (b.vagasV == null || b.vagasV === '') ? null : Math.max(0, Math.min(50, Number(b.vagasV) || 0)) };
  });
  if (!blocos.length) throw new Error('Marque ao menos uma escala.');
  var q = { de: p.de, ate: p.ate, blocos: blocos, folgaH: Number(p.folgaH) || CFG.FOLGA_MIN_H, evOutra: !!p.evOutra, evAdj: !!p.evAdj, relaxar: !!p.relaxar, verdes: !!p.verdes, notas: p.notas !== false };
  var lock = null;
  if (aplicar) { lock = LockService.getDocumentLock(); lock.waitLock(25000); }
  try {
    var r = apiServicos(modo, q, !!aplicar), rel = r.rel;
    if (aplicar) {
      bumpTrocas_();
      agendarPrevia_();
      var tot = 0, falta = 0;
      rel.abas.forEach(function (a) { a.escalas.forEach(function (e) { tot += e.n || 0; falta += e.falta || 0; }); });
      auditar_(m.nome, modo === 'add' ? 'Serviços adicionados (app)' : 'Serviços retirados (app)', rel.abas.map(function (a) { return a.aba; }).join(', ') + ' · ' + p.de + ' a ' + p.ate + ' · escalas: ' + blocos.length + ' · serviços: ' + tot + (falta ? ' · sem militar: ' + falta : ''));
    }
    return { rel: rel };
  } finally { if (lock) lock.releaseLock(); }
}

/* ============================================================ AFASTAMENTO E MILITAR (mesma lógica do menu Confecção) */
/** p: {aba, hdr, keys:[nomes], tipo, de, ate, apres, todas} */
function webSecaoAfastamento(tok, p, aplicar) {
  var m = sessao_(tok);
  p = p || {};
  var q = { aba: String(p.aba || ''), hdr: Number(p.hdr), keys: (p.keys || []).slice(0, 200).map(function (k) { return String(k); }), tipo: String(p.tipo || ''), de: String(p.de || ''), ate: String(p.ate || ''), apres: String(p.apres || ''), todas: !!p.todas };
  if (q.de || q.ate) {
    if (!TIPOS_AFAST[q.tipo]) throw new Error('Escolha o tipo de afastamento.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(q.de) || !/^\d{4}-\d{2}-\d{2}$/.test(q.ate)) throw new Error('Informe início e término.');
  }
  if (q.apres && !/^\d{4}-\d{2}-\d{2}$/.test(q.apres)) throw new Error('Data de apresentação inválida.');
  var lock = null;
  if (aplicar) { lock = LockService.getDocumentLock(); lock.waitLock(25000); }
  try {
    var r = apiAfastamento(q, !!aplicar);
    if (aplicar) {
      bumpTrocas_();
      agendarPrevia_();
      auditar_(m.nome, 'Afastamento lançado (app)', q.aba + ' · ' + (r.rel.escala || '') + ' · ' + (r.rel.tipo || 'apresentação') + ' · ' + (r.rel.periodo || r.rel.apres) + ' · militares: ' + q.keys.length);
    }
    return { rel: r.rel };
  } finally { if (lock) lock.releaseLock(); }
}

/** p: {mes, tipo, nome, hdrs:[], acao:'remover'|'transferir', su, cascata} */
function webSecaoMover(tok, p, aplicar) {
  var m = sessao_(tok);
  p = p || {};
  var q = { mes: String(p.mes || ''), tipo: String(p.tipo || ''), nome: String(p.nome || ''), hdrs: (p.hdrs || []).slice(0, 60).map(Number), acao: p.acao === 'transferir' ? 'transferir' : 'remover', su: String(p.su || ''), cascata: !!p.cascata };
  if (q.tipo !== 'Grad' && q.tipo !== 'Cndt e Praia') throw new Error('Tipo de aba inválido.');
  var lock = null;
  if (aplicar) { lock = LockService.getDocumentLock(); lock.waitLock(25000); }
  try {
    var r = apiMover(q, !!aplicar);
    if (aplicar) {
      bumpTrocas_();
      agendarPrevia_();
      auditar_(m.nome, q.acao === 'remover' ? 'Militar removido da escala (app)' : 'Militar transferido de SU (app)', q.nome + ' · ' + q.mes + ' ' + q.tipo + (q.acao === 'transferir' ? ' → ' + q.su : '') + ' · linhas: ' + r.rel.itens.length + (q.cascata ? ' · meses seguintes' : ''));
    }
    return { rel: r.rel };
  } finally { if (lock) lock.releaseLock(); }
}
