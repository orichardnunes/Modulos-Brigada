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
  r.grads = CFG.GRADUACOES;
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

/* ============================================================ DEMAIS FERRAMENTAS DO MENU (mesmas funções da planilha) */
function webSecaoParadaPrevias(tok) { sessao_(tok); return apiParadaPrevias(); }
function webSecaoParadaDias(tok, nome) { sessao_(tok); return apiParadaDias(String(nome || '')); }
function webSecaoParadaSalvar(tok, nome, itens) {
  var m = sessao_(tok), lock = LockService.getDocumentLock();
  lock.waitLock(25000);
  try {
    var r = apiDefinirParada(String(nome || ''), (itens || []).slice(0, 7).map(function (x) { return { col: Number(x.col), h: Number(x.h), m: Number(x.m) || 0 }; }));
    bumpTrocas_();
    auditar_(m.nome, 'Parada diária definida (app)', r.nome + ' · ' + r.itens.map(function (i) { return i.d + ' ' + i.antes + '→' + i.depois; }).join(', '));
    return r;
  } finally { lock.releaseLock(); }
}

function webSecaoGatPrevia(tok) { sessao_(tok); return apiGatPrevia() || null; }
function webSecaoGatPreviaSalvar(tok, dow, hora) { var m = sessao_(tok, true); var r = apiSalvarGatPrevia(dow, hora); auditar_(m.nome, 'Criação automática da prévia definida (app)', 'dia ' + dow + ' às ' + hora + 'h'); return r; }
function webSecaoGatPreviaAtivar(tok, ativo) { var m = sessao_(tok, true); var r = apiAtivarGatPrevia(!!ativo); auditar_(m.nome, ativo ? 'Criação automática da prévia ativada (app)' : 'Criação automática da prévia desativada (app)', ''); return r; }

function webSecaoCriarAbas(tok, mm, aaaa) {
  var m = sessao_(tok), mes = Number(mm), ano = Number(aaaa);
  if (!(mes >= 1 && mes <= 12) || !(ano >= 2020 && ano <= 2100)) throw new Error('Mês ou ano inválido.');
  var lock = LockService.getDocumentLock();
  lock.waitLock(25000);
  try {
    INFO_PEND_ = [];
    var nomes = criarAbasMes_(mes - 1, ano);
    bumpTrocas_();
    auditar_(m.nome, 'Abas do mês criadas (app)', nomes.join(', '));
    return { nomes: nomes, pend: INFO_PEND_.filter(function (x) { return !/^ERRO/.test(x); }), erros: INFO_PEND_.filter(function (x) { return /^ERRO/.test(x); }) };
  } finally { lock.releaseLock(); }
}
function webSecaoGatAbas(tok) { sessao_(tok); return apiGatAbas(); }
function webSecaoGatAbasSalvar(tok, p) { var m = sessao_(tok, true); var r = apiDefinirGatilho(p || {}); auditar_(m.nome, 'Gatilho de criação das abas definido (app)', r); return r; }
function webSecaoGatAbasOff(tok) { var m = sessao_(tok, true); var r = apiDesativarGatilho(); auditar_(m.nome, 'Gatilho de criação das abas desativado (app)', ''); return r; }

function webSecaoQuantOpcoes(tok, meses, tipos) { sessao_(tok); var r = apiQuantitativoOpcoes((meses || []).map(String), (tipos || []).map(String)); return { escalas: r.escalas }; }
function secaoQuantP_(p) {
  p = p || {};
  return { meses: (p.meses || []).map(String), tipos: (p.tipos || []).map(String), escalas: (p.escalas || []).map(String), de: /^\d{4}-\d{2}-\d{2}$/.test(p.de || '') ? p.de : '', ate: /^\d{4}-\d{2}-\d{2}$/.test(p.ate || '') ? p.ate : '', futuros: !!p.futuros, trocas: !!p.trocas, keys: [] };
}
function webSecaoQuant(tok, p) { sessao_(tok); return apiQuantitativo(secaoQuantP_(p)); }
function webSecaoQuantExporta(tok, p, formato) {
  var m = sessao_(tok);
  var r = apiExportarQuantitativo(secaoQuantP_(p), formato === 'pdf' ? 'pdf' : formato === 'docx' ? 'docx' : 'sheet');
  auditar_(m.nome, 'Quantitativo exportado (app)', r.nome);
  return r;
}
function webSecaoBalanc(tok, mes, tipos) { sessao_(tok); return apiBalanceamento(String(mes || ''), (tipos || []).map(String)); }
function webSecaoEfetivoInfo(tok, mes, tipos) { sessao_(tok); return apiEfetivoInfo(String(mes || ''), (tipos || []).map(String)); }
function webSecaoEfetivoAplicar(tok, p) {
  var m = sessao_(tok), lock = LockService.getDocumentLock();
  lock.waitLock(25000);
  try {
    var r = apiEfetivoAplicar({ blocos: ((p || {}).blocos || []).slice(0, 80).map(function (b) { return { aba: String(b.aba), hdr: Number(b.hdr), previsto: Number(b.previsto), mudou: !!b.mudou }; }) });
    bumpTrocas_();
    auditar_(m.nome, 'Efetivo previsto/escalado lançado (app)', r.rel.itens.map(function (i) { return i.aba + ' ' + i.escala + '=' + i.previsto; }).join(', ').slice(0, 600));
    return r;
  } finally { lock.releaseLock(); }
}

/** p: {aba, nome, grad, sub, inicio, escalas:[{hdr, pos, nunca, ultPreta, ultVerm}]} */
function webSecaoMilitar(tok, p, aplicar) {
  var m = sessao_(tok);
  p = p || {};
  var q = { aba: String(p.aba || ''), nome: String(p.nome || ''), grad: String(p.grad || ''), sub: String(p.sub || ''), inicio: /^\d{4}-\d{2}-\d{2}$/.test(p.inicio || '') ? p.inicio : '',
    escalas: (p.escalas || []).slice(0, 60).map(function (e) { return { hdr: Number(e.hdr), pos: (e.pos == null || e.pos === '' || e.pos === 'auto') ? 'auto' : Number(e.pos), nunca: !!e.nunca, ultPreta: String(e.ultPreta || ''), ultVerm: String(e.ultVerm || '') }; }) };
  var lock = null;
  if (aplicar) { lock = LockService.getDocumentLock(); lock.waitLock(25000); }
  try {
    var r = apiMilitar(q, !!aplicar);
    if (aplicar) { bumpTrocas_(); agendarPrevia_(); auditar_(m.nome, 'Militar adicionado (app)', r.rel.militar + ' · ' + q.sub + ' · ' + q.aba + ' · escalas: ' + q.escalas.length); }
    return { rel: r.rel, texto: r.texto };
  } finally { if (lock) lock.releaseLock(); }
}

function webSecaoImportar(tok, aba, url, opcoes, aplicar) {
  var m = sessao_(tok);
  url = String(url || '').trim();
  if (url && !/^https:\/\/docs\.google\.com\/spreadsheets\//.test(url)) throw new Error('Informe o link de uma planilha do Google (docs.google.com/spreadsheets).');
  var lock = null;
  if (aplicar) { lock = LockService.getDocumentLock(); lock.waitLock(25000); }
  try {
    var r = apiImportarDrive(String(aba || ''), url, { tipos: (opcoes && opcoes.tipos === 'refazer') ? 'refazer' : 'manter' }, !!aplicar);
    if (aplicar) { bumpTrocas_(); agendarPrevia_(); auditar_(m.nome, 'Guarnição importada (app)', aba + ' · fonte: ' + (r.fonte || '')); }
    return { texto: r.texto, fonte: r.fonte, aplicado: !!aplicar };
  } finally { if (lock) lock.releaseLock(); }
}

function webSecaoVerificar(tok) {
  sessao_(tok);
  var faltam = funcoesEsperadas_().filter(function (n) { return typeof globalThis[n] !== 'function'; }), abas = [], legenda = null;
  ss_().getSheets().forEach(function (sh) {
    var nm = nomeAba_(sh.getName());
    if (!nm || sh.isSheetHidden()) return;
    try { var A = lerAba_(sh); abas.push({ nome: A.nome, ano: A.ano, dias: A.nDias, escalas: A.blocos.length }); } catch (e) { abas.push({ nome: sh.getName(), erro: e.message }); }
  });
  return { total: funcoesEsperadas_().length, faltam: faltam, abas: abas, versao: CFG.VERSAO };
}

/** apaga as abas de prévia escolhidas (nunca a "Prévia - Modelo") */
function webSecaoRemoverPrevias(tok, nomes) {
  var m = sessao_(tok), lock = LockService.getDocumentLock();
  nomes = (nomes || []).slice(0, 60).map(String);
  if (!nomes.length) throw new Error('Marque ao menos uma prévia.');
  lock.waitLock(25000);
  try {
    var ss = ss_(), removidas = [];
    var validas = abasPrevia_().filter(function (sh) { return !/Modelo/i.test(sh.getName()); }).map(function (sh) { return sh.getName(); });
    nomes.forEach(function (n) { if (validas.indexOf(n) < 0) throw new Error('"' + n + '" não é uma prévia que possa ser removida.'); });
    nomes.forEach(function (n) { var sh = ss.getSheetByName(n); if (sh) { ss.deleteSheet(sh); removidas.push(n); } });
    bumpTrocas_();
    auditar_(m.nome, 'Prévias removidas (app)', removidas.join('; '));
    return { removidas: removidas };
  } finally { lock.releaseLock(); }
}

/** executar uma vez no editor (seletor de funções → definirUrlPublicaGitHub → Executar): os links dos e-mails e da ajuda passam a apontar para a página do GitHub Pages */
function definirUrlPublicaGitHub() {
  definirUrlPublica_('https://s1-21gac.github.io/gestao-escalas/');
  Logger.log('Endereço público definido: ' + PropertiesService.getDocumentProperties().getProperty('URL_PUBLICA'));
}
/** volta os links ao endereço do Apps Script */
function limparUrlPublica() { definirUrlPublica_(''); Logger.log('Endereço público removido.'); }
