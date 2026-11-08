/**
 * MÓDULO BRIGADA 1.0 — Modulo_PreviaExt.gs
 * Prévia semanal: escalas de arquivos EXTERNOS, sem abas de cache.
 *  - Sgt Dia, Manobreiro e Atendimento: nomes por IMPORTRANGE (tempo real), direto dos arquivos;
 *  - Of Dia (cor da célula) e trocas de serviço (anotações): lidos por script a cada 10 min (e em "Atualizar prévia")
 *    e gravados em colunas ocultas da própria aba da prévia (AL:AN e AP:AS).
 * Depende de Codigo.gs, Modulo_Escala.gs, Modulo_Auditagem.gs e Modulo_Previa.gs.
 */

var EXT = {
  OFDIA: '1gUmzvpaKpwBUR1gwui_JStd7lBLr4FYrsqA1ZBrcqoQ',
  SGT: '1-pqXgo2_2ZHQAoXwc84JsO8wu_aXyGaf4CmTRLySffU',
  MANO: '1uSGJcXE51OrZ4NiZooFYRpOYF8e0pZdT9ivlDQ0XBPs',
  ATEND: '16EwNWRSbggX2rJQD4Jqw-5DFNaRDVfNRyBuWkMqyZms',
  MOT: '1Hy3XYlFacKEutSP4DSuzgtH7WEULxU6s1UpoYNiR8OU'
};
var EXT_ANO_SEM_ANO = {};
EXT_ANO_SEM_ANO['1gUmzvpaKpwBUR1gwui_JStd7lBLr4FYrsqA1ZBrcqoQ'] = 0;
EXT_ANO_SEM_ANO['1-pqXgo2_2ZHQAoXwc84JsO8wu_aXyGaf4CmTRLySffU'] = 2026;
EXT_ANO_SEM_ANO['1uSGJcXE51OrZ4NiZooFYRpOYF8e0pZdT9ivlDQ0XBPs'] = 2025;
EXT_ANO_SEM_ANO['16EwNWRSbggX2rJQD4Jqw-5DFNaRDVfNRyBuWkMqyZms'] = 2025;
EXT_ANO_SEM_ANO['1Hy3XYlFacKEutSP4DSuzgtH7WEULxU6s1UpoYNiR8OU'] = 2026;
var MES_FULL_ = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
var MES_ABR_ = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
var PREVIA_EXT = { OF: { data: 'AL', unid: 'AM', qg: 'AN' }, TRC: { data: 'AP', orig: 'AQ', assume: 'AR', tag: 'AS' }, AT: { data: 'AU', at: 'AV', aux: 'AW' }, MT: { data: 'AY', dia: 'AZ', pomn: 'BA' } };

/* ============================================================ ABAS E COLUNAS DOS ARQUIVOS EXTERNOS */
var CACHE_EXT_ = { ss: {}, dados: {}, mapas: {} };

function abrirExt_(id) {
  if (!CACHE_EXT_.ss[id]) CACHE_EXT_.ss[id] = SpreadsheetApp.openById(id);
  return CACHE_EXT_.ss[id];
}

function achaAbaExt_(ss, mes, ano, anoSemAno) {
  var melhor = null, pontos = -1;
  ss.getSheets().forEach(function (sh) {
    var nome = semAcento_(sh.getName()), toks = nome.split(/[^A-Z0-9]+/).filter(function (t) { return t; });
    if (toks.indexOf('MODELO') >= 0) return;
    var mesOk = toks.some(function (t) { return t === MES_ABR_[mes] || (t.length >= 3 && MES_FULL_[mes].indexOf(t) === 0); });
    if (!mesOk) return;
    var anos = toks.filter(function (t) { return /^(\d{2}|\d{4})$/.test(t) && t !== MES_ABR_[mes]; });
    var yy = String(ano).slice(-2), anoOk = anos.some(function (t) { return t === yy || t === String(ano); });
    if (anos.length && !anoOk) return;
    if (!anos.length && ano !== anoSemAno) return; /* aba sem ano só vale para o ano do arquivo */
    var p = (anoOk ? 4 : 1) + (sh.isSheetHidden() ? 0 : 2);
    if (p > pontos) { pontos = p; melhor = sh; }
  });
  return melhor;
}

function dadosAba_(sh) {
  var k = sh.getParent().getId() + '|' + sh.getSheetId();
  if (!CACHE_EXT_.dados[k]) {
    var rg = sh.getDataRange();
    CACHE_EXT_.dados[k] = { vals: rg.getValues(), bgs: rg.getBackgrounds(), notes: rg.getNotes() };
  }
  return CACHE_EXT_.dados[k];
}

/** serial da data -> índice (0-based) da coluna, a partir da linha de cabeçalho com os números dos dias */
function mapaColunas_(hdr, primeiraCol, mes, ano) {
  var map = {}, idx1 = -1, j, v, temData = false;
  for (j = primeiraCol; j < hdr.length; j++) {
    if (hdr[j] instanceof Date) { temData = true; var sd = serialData_(hdr[j]); if (!(sd in map)) map[sd] = j; }
  }
  if (temData) return map; /* cabeçalho com datas de verdade */
  for (j = primeiraCol; j < hdr.length; j++) { v = Number(hdr[j]); if (hdr[j] !== '' && v === 1) { idx1 = j; break; } }
  if (idx1 < 0) return map;
  var m = mes, a = ano, ant = 0;
  for (j = idx1; j < hdr.length; j++) {
    v = Number(hdr[j]);
    if (hdr[j] === '' || isNaN(v)) break;
    if (v < ant) { m++; if (m > 11) { m = 0; a++; } }
    ant = v;
    var s = serialData_(new Date(a, m, v));
    if (!(s in map)) map[s] = j;
  }
  var pm = mes - 1, pa = ano;
  if (pm < 0) { pm = 11; pa--; }
  for (j = idx1 - 1; j >= primeiraCol; j--) {
    v = Number(hdr[j]);
    if (hdr[j] === '' || isNaN(v)) break;
    var s2 = serialData_(new Date(pa, pm, v));
    if (!(s2 in map)) map[s2] = j;
  }
  return map;
}

/** acha {sh, col} (col 0-based) da data dt no arquivo externo */
function acharColunaExt_(id, dt, linhaHdr, primeiraCol) {
  var ss = abrirExt_(id), cand = [0, 1, -1];
  for (var i = 0; i < cand.length; i++) {
    var d2 = new Date(dt.getFullYear(), dt.getMonth() + cand[i], 1), sh = achaAbaExt_(ss, d2.getMonth(), d2.getFullYear(), EXT_ANO_SEM_ANO[id]);
    if (!sh) continue;
    var vals = dadosAba_(sh).vals, hdr = linhaHdr;
    if (hdr === 'auto') { /* linha dos números dos dias: a que tem mais números 1–31 a partir da primeira coluna de dias */
      var melhor = -1;
      hdr = 0;
      for (var r = 0; r < Math.min(8, vals.length); r++) {
        var n = 0;
        for (var j = primeiraCol; j < vals[r].length; j++) { var x = vals[r][j]; if (x instanceof Date || (x !== '' && Number(x) >= 1 && Number(x) <= 31 && Number(x) % 1 === 0)) n++; }
        if (n > melhor) { melhor = n; hdr = r; }
      }
    }
    var k = id + '|' + sh.getSheetId() + '|map|' + hdr;
    if (!CACHE_EXT_.mapas[k]) CACHE_EXT_.mapas[k] = mapaColunas_(vals[hdr] || [], primeiraCol, d2.getMonth(), d2.getFullYear());
    var col = CACHE_EXT_.mapas[k][serialData_(dt)];
    var idx1 = -1;
    for (var j1 = primeiraCol; j1 < (vals[hdr] || []).length; j1++) if (vals[hdr][j1] !== '' && Number(vals[hdr][j1]) === 1) { idx1 = j1; break; }
    if (col != null) return { sh: sh, col: col, hdr: hdr, idx1: idx1 };
  }
  return null;
}

function dispGrad_(grad, nome) {
  var g = semAcento_(grad);
  if (g === 'SD' || g === 'SD NB') g = 'SD EP'; else if (g === 'CB EP') g = 'CB';
  return (g + ' ' + String(nome).replace(/\s+/g, ' ').trim()).trim();
}

/* ============================================================ DEFINIÇÃO DE CADA ARQUIVO */
/* devolve {tab, col(0-based), pessoas:[{r, nome(display), nomeBruto}]} */
function lerSgt_(dt) {
  var loc = acharColunaExt_(EXT.SGT, dt, 0, 2);
  if (!loc) return null;
  var D = dadosAba_(loc.sh), pessoas = [];
  for (var r = 2; r < D.vals.length; r++) {
    var nome = String(D.vals[r][1]).trim();
    if (!nome) break;
    pessoas.push({ r: r, su: String(D.vals[r][0]).trim(), nome: nome.replace(/\s+/g, ' ') });
  }
  return { loc: loc, D: D, pessoas: pessoas };
}

function lerMano_(dt) {
  var loc = acharColunaExt_(EXT.MANO, dt, 'auto', 3);
  if (!loc) return null;
  var D = dadosAba_(loc.sh), pessoas = [], r;
  /* pessoas: linhas com nº de ordem na coluna A; se a aba não numerar, usa o formato antigo (a partir de 2 linhas abaixo do cabeçalho) */
  for (r = loc.hdr + 1; r < D.vals.length; r++) {
    if (!(Number(D.vals[r][0]) > 0)) { if (pessoas.length) break; continue; }
    var nome = String(D.vals[r][2]).trim();
    if (!nome) break;
    pessoas.push({ r: r, nome: dispGrad_(D.vals[r][1], nome) });
  }
  if (!pessoas.length) {
    for (r = loc.hdr + 2; r < D.vals.length; r++) {
      var n2 = String(D.vals[r][2]).trim();
      if (!n2) break;
      pessoas.push({ r: r, nome: dispGrad_(D.vals[r][1], n2) });
    }
  }
  return { loc: loc, D: D, pessoas: pessoas };
}

function lerAtend_(dt) {
  var loc = acharColunaExt_(EXT.ATEND, dt, 0, 5);
  if (!loc) return null;
  var D = dadosAba_(loc.sh), b1 = [], b2 = [], bloco = 1;
  for (var r = 2; r < D.vals.length; r++) {
    var a = semAcento_(D.vals[r][0]), nome = String(D.vals[r][2]).trim();
    if (a.indexOf('MISSAO') === 0) { bloco = 2; r++; continue; }
    if (!nome) { if (bloco === 1 && b1.length && /SERVICO|BRIGADA|DISPENSA/.test(a)) bloco = 0; continue; }
    if (bloco === 0) continue;
    (bloco === 1 ? b1 : b2).push({ r: r, nome: dispGrad_(D.vals[r][1], nome) });
  }
  return { loc: loc, D: D, b1: b1, b2: b2 };
}

/* Of Dia: nome = coluna C; zero pela cor da legenda (SERVIÇO 21º GAC x SERVIÇO QG AD/1) */
function lerOfDia_(dt) {
  var loc = acharColunaExt_(EXT.OFDIA, dt, 2, 3);
  if (!loc) return null;
  var D = dadosAba_(loc.sh), pessoas = [], cor21 = null, corQG = null;
  for (var r = 4; r < D.vals.length; r++) {
    var nome = String(D.vals[r][2]).trim();
    if (!nome) break;
    pessoas.push({ r: r, nome: nome.replace(/\s+/g, ' ') });
  }
  for (var x = 0; x < D.vals.length; x++) {
    var t = semAcento_(D.vals[x][2]);
    if (t.indexOf('SERVICO 21') === 0) cor21 = String(D.bgs[x][1]).toLowerCase();
    if (t.indexOf('SERVICO QG') === 0) corQG = String(D.bgs[x][1]).toLowerCase();
  }
  return { loc: loc, D: D, pessoas: pessoas, cor21: cor21, corQG: corQG };
}

function zerosExt_(X, listaPessoas) {
  var c = X.loc.col, out = [];
  listaPessoas.forEach(function (p) { if (X.D.vals[p.r][c] === 0 || (X.D.vals[p.r][c] === '0')) out.push(p); });
  return out;
}

function trocaExt_(X, p, chaves) { /* nome do militar que assumiu, pela anotação da célula */
  var nota = X.D.notes[p.r][X.loc.col];
  if (!nota || !String(nota).trim()) return null;
  var t = resolverNomeNota_(String(nota).replace(/\bVAI\s+(TIRAR|PEGAR|ASSUMIR)\b.*$/i, ''), chaves, true);
  return t && t.key !== semAcento_(p.nome) ? t : null;
}

/* ============================================================ ATUALIZAÇÃO DA PRÉVIA */
function datasPrevia_(sh) {
  var v = sh.getRange('C2').getValue();
  if (!(v instanceof Date)) throw new Error('C2 da prévia não tem uma data.');
  var out = [];
  for (var i = 0; i < 7; i++) out.push(new Date(v.getFullYear(), v.getMonth(), v.getDate() + i));
  return out;
}

function tabelasExternas_(datas) {
  var of = [], trc = [], at = [], mt = [], avisos = [];
  datas.forEach(function (dt) {
    var s = serialData_(dt), unid = '', qg = '';
    var O = lerOfDia_(dt);
    if (O) {
      var ch = O.pessoas.map(function (p) { return { key: semAcento_(p.nome), nome: p.nome, sub: '' }; });
      zerosExt_(O, O.pessoas).forEach(function (p) {
        var bg = String(O.D.bgs[p.r][O.loc.col]).toLowerCase(), t = trocaExt_(O, p, ch);
        var nome = t ? t.nome + ' *' : p.nome;
        if (O.corQG && bg === O.corQG) { if (!qg) qg = nome; }
        else if (!O.cor21 || bg === O.cor21) { if (!unid) unid = nome; }
      });
    }
    if (!O) avisos.push('Of Dia: aba/coluna de ' + fmtData_(dt) + ' não encontrada no arquivo.');
    else if (!unid && !qg) avisos.push('Of Dia: nenhum "0" de serviço em ' + fmtData_(dt) + ' (confira as cores da legenda).');
    of.push([s, unid, qg]);
    var S = lerSgt_(dt);
    if (S) {
      var chS = S.pessoas.map(function (p) { return { key: semAcento_(p.nome), nome: p.nome, sub: p.su }; });
      zerosExt_(S, S.pessoas).forEach(function (p) {
        var t = trocaExt_(S, p, chS);
        if (t) trc.push([s, p.nome, t.nome + ' *', 'SGT']);
      });
    }
    var M = lerMano_(dt);
    if (M) {
      var chM = M.pessoas.map(function (p) { return { key: semAcento_(p.nome), nome: p.nome, sub: '' }; });
      zerosExt_(M, M.pessoas).forEach(function (p) {
        var t = trocaExt_(M, p, chM);
        if (t) trc.push([s, p.nome, t.nome + ' *', 'MANOBREIRO']);
      });
    }
    var A = lerAtend_(dt), nomeAt = '', nomeAux = '';
    if (A) {
      var chA = A.b1.concat(A.b2).map(function (p) { return { key: semAcento_(p.nome), nome: p.nome, sub: '' }; });
      var zA = zerosExt_(A, A.b1), zX = zerosExt_(A, A.b2);
      var qm = function (p) { var t = trocaExt_(A, p, chA); if (t) trc.push([s, p.nome, t.nome + ' *', 'ATENDIMENTO']); return t ? t.nome + ' *' : p.nome; };
      if (zA.length) nomeAt = qm(zA[0]);
      if (zX.length) nomeAux = qm(zX[0]);
    } else avisos.push('Atendimento: aba/coluna de ' + fmtData_(dt) + ' não encontrada no arquivo.');
    at.push([s, nomeAt, nomeAux]);
    var MT = null;
    try { MT = lerMot_(dt); } catch (e) { avisos.push('Motorista (garagem): ' + e.message); }
    if (!MT) avisos.push('Motorista (garagem): aba de ' + fmtData_(dt) + ' não encontrada no arquivo.');
    mt.push([s, MT ? MT.dia : '', MT ? MT.pomn : '']);
  });
  return { of: of, trc: trc, at: at, mt: mt, avisos: avisos };
}

function escreverTabelasExternas_(sh, tabelas) {
  var E = PREVIA_EXT;
  sh.getRange(E.OF.data + '1:' + E.OF.qg + '1').setValues([['Of Dia: data', 'Of Dia: Unidade', 'Of Dia: QG AD/1']]);
  sh.getRange(E.TRC.data + '1:' + E.TRC.tag + '1').setValues([['Trocas (arquivos externos): data', 'Quem estava na escala', 'Quem assume (*)', 'Fonte']]);
  sh.getRange(E.AT.data + '1:' + E.AT.aux + '1').setValues([['Atendimento: data', 'Atendimento', 'Auxiliar Atendimento']]);
  sh.getRange(E.MT.data + '1:' + E.MT.pomn + '1').setValues([['Motorista (garagem): data', 'Mot Dia', 'Mot PoMN']]);
  sh.getRange(E.MT.data + '2:' + E.MT.pomn + '8').setValues(tabelas.mt);
  sh.getRange(E.OF.data + '2:' + E.OF.qg + '8').setValues(tabelas.of);
  sh.getRange(E.AT.data + '2:' + E.AT.aux + '8').setValues(tabelas.at);
  var lim = sh.getRange(E.TRC.data + '2:' + E.TRC.tag + '300');
  lim.clearContent();
  if (tabelas.trc.length) sh.getRange(E.TRC.data + '2:' + E.TRC.tag + (1 + tabelas.trc.length)).setValues(tabelas.trc);
  formatarAuxPrevia_(sh);
}

/* ----- fórmulas dos blocos externos */
function urlExt_(id) { return 'https://docs.google.com/spreadsheets/d/' + id + '/edit'; }

function importExt_(id, sh) { /* intervalo dentro dos limites da aba (IMPORTRANGE falha se passar da grade) */
  var linhas = Math.max(5, Math.min(sh.getMaxRows(), sh.getLastRow() + 30)), cols = Math.max(5, Math.min(sh.getMaxColumns(), sh.getLastColumn() + 1));
  return 'IMPORTRANGE("' + urlExt_(id) + '","\'' + sh.getName().replace(/'/g, "''") + '\'!A1:' + colLetra_(cols - 1) + linhas + '")';
}

function fxTroca_(col) { /* aplica a troca anotada (tabela oculta AP:AS) ao nome */
  var E = PREVIA_EXT.TRC;
  return 'IFERROR(INDEX($' + E.assume + '$2:$' + E.assume + '$300,MATCH(1,ARRAYFORMULA(($' + E.data + '$2:$' + E.data + '$300=' + col + '$2)*($' + E.orig + '$2:$' + E.orig + '$300=nome)),0)),nome)';
}

/** nº (1-based) da coluna do dia dentro do IMPORTRANGE: relativo ao "1" do cabeçalho, para acompanhar colunas inseridas no arquivo de origem */
function colDiaFx_(loc) {
  if (loc.idx1 == null || loc.idx1 < 0) return String(loc.col + 1);
  var off = loc.col - loc.idx1;
  return '(MATCH(1,INDEX(dados,' + (loc.hdr + 1) + ',0),0)' + (off ? (off > 0 ? '+' : '') + off : '') + ')';
}

function fxSgt_(S, colLetra, posicao) { /* os 2 sargentos do dia, em ordem de antiguidade (ordem das linhas), independente da SU */
  return '=IFERROR(LET(dados,' + importExt_(EXT.SGT, S.loc.sh) + ',v,INDEX(dados,0,' + colDiaFx_(S.loc) + '),n,INDEX(dados,0,2),' +
    'f,FILTER(n,ISNUMBER(v)*(v=0)),nome,TRIM(INDEX(f,' + posicao + ')),' + fxTroca_(colLetra) + '),"PENDENTE")';
}

function fxGradNome_(colGrad, colNome) { /* fragmento de LET: define g, gm e n (nomes com graduação padronizada) */
  return 'g,ARRAYFORMULA(TRIM(INDEX(dados,0,' + colGrad + '))),gm,ARRAYFORMULA(IF(g="SD","SD EP",IF(g="SD NB","SD EP",IF(UPPER(g)="CB EP","CB",UPPER(g))))),' +
    'n,ARRAYFORMULA(gm&" "&TRIM(INDEX(dados,0,' + colNome + ')))';
}

function fxMano_(M, colLetra) {
  return '=IFERROR(LET(dados,' + importExt_(EXT.MANO, M.loc.sh) + ',v,INDEX(dados,0,' + colDiaFx_(M.loc) + '),' + fxGradNome_(2, 3) + ',' +
    'f,FILTER(n,ISNUMBER(v)*(v=0)),nome,TRIM(INDEX(f,1)),' + fxTroca_(colLetra) + '),"PENDENTE")';
}

function fxAtend_(colLetra, bloco) { /* lê da tabela oculta AU:AW, preenchida pelo script (como o Of Dia) */
  var E = PREVIA_EXT.AT, c = bloco === 1 ? E.at : E.aux, rng = '$' + c + '$2:$' + c + '$8';
  var idx = 'INDEX(' + rng + ',MATCH(' + colLetra + '$2,$' + E.data + '$2:$' + E.data + '$8,0))';
  var vazio = bloco === 1 ? '"PENDENTE"' : 'IF(OR(WEEKDAY(' + colLetra + '$2,2)=6,WEEKDAY(' + colLetra + '$2,2)=7),"PENDENTE","X")';
  return '=IFERROR(IF(' + idx + '="",' + vazio + ',' + idx + '),"PENDENTE")';
}


/** Mot Dia / Mot PoMN: lidos da tabela oculta AY:BA (preenchida por script a partir do arquivo da garagem); POMN só nos dias laranja do QG */
function fxMotorista_(colLetra, tipo) {
  var E = PREVIA_EXT.MT, c = tipo === 'pomn' ? E.pomn : E.dia, rng = '$' + c + '$2:$' + c + '$8';
  var idx = 'INDEX(' + rng + ',MATCH(' + colLetra + '$2,$' + E.data + '$2:$' + E.data + '$8,0))';
  var base = 'IF(' + idx + '="","PENDENTE",' + idx + ')';
  if (tipo === 'pomn') return '=IFERROR(IF(NOT(INDEX($P$2:$P$8,MATCH(' + colLetra + '$2,$L$2:$L$8,0))),"X",' + base + '),"PENDENTE")';
  return '=IFERROR(' + base + ',"PENDENTE")';
}

/**
 * Arquivo da garagem (Motorista de Dia / POMN): aba do mês; blocos com título na coluna A ("MOT DE DIA", "MOT POMN"),
 * cabeçalho "NOME DE GUERRA" na coluna D, dias a partir de "DIA 01". Célula 0 = escalado; nome = pegou o serviço do escalado.
 * Devolve { dia: 'GRAD NOME', pomn: '...' } (vazio se não achar).
 */
function lerMot_(dt) {
  var sh = achaAbaExt_(abrirExt_(EXT.MOT), dt.getMonth(), dt.getFullYear(), EXT_ANO_SEM_ANO[EXT.MOT]);
  if (!sh) return null;
  var D = dadosAba_(sh), v = D.vals, out = { dia: '', pomn: '', aba: sh.getName() };
  function bloco(rotulo) {
    var lbl = -1;
    for (var r = 0; r < v.length && lbl < 0; r++) if (semAcento_(v[r][0]) === rotulo) lbl = r;
    if (lbl < 0) return null;
    var ini = semAcento_(v[lbl][3]) === 'NOME DE GUERRA' ? lbl + 1 : lbl, hdr = ini - 1, base = 4;
    for (var cc = 0; cc < v[Math.max(hdr, 0)].length; cc++) if (/^DIA\s*0?1$/.test(semAcento_(v[Math.max(hdr, 0)][cc]))) { base = cc; break; }
    var pessoas = [];
    for (var x = ini; x < v.length && String(v[x][3]).trim() !== ''; x++) pessoas.push({ r: x, grad: String(v[x][2]).trim(), nome: String(v[x][3]).replace(/\s+/g, ' ').trim() });
    return { pessoas: pessoas, col: base + dt.getDate() - 1 };
  }
  function resolve(B, gradPadrao) {
    if (!B) return '';
    var zero = null, subst = null;
    B.pessoas.forEach(function (p) {
      var c = v[p.r][B.col];
      if (c === undefined) return;
      var t = String(c).trim();
      if (c === 0 || t === '0') { if (!zero) zero = p; }
      else if (t !== '' && t !== '***' && semAcento_(t) !== 'X' && isNaN(Number(t.replace(',', '.')))) { if (!subst) subst = t.replace(/\s+/g, ' '); }
    });
    if (zero) return dispGrad_(zero.grad, zero.nome);
    if (subst) {
      var chave = semAcento_(subst).replace(/[^A-Z0-9]/g, ''), achou = null;
      B.pessoas.forEach(function (p) { if (!achou && semAcento_(p.nome).replace(/[^A-Z0-9]/g, '') === chave) achou = p; });
      return dispGrad_(achou ? achou.grad : gradPadrao, subst);
    }
    return '';
  }
  out.dia = resolve(bloco('MOT DE DIA'), 'SD');
  out.pomn = resolve(bloco('MOT POMN'), 'CB');
  return out;
}

function fxOf_(colLetra, qg) {
  var E = PREVIA_EXT.OF, rng = '$' + (qg ? E.qg : E.unid) + '$2:$' + (qg ? E.qg : E.unid) + '$8', idx = 'INDEX(' + rng + ',MATCH(' + colLetra + '$2,$' + E.data + '$2:$' + E.data + '$8,0))';
  return '=IFERROR(IF(' + idx + '="",' + (qg ? '"X"' : '"PENDENTE"') + ',' + idx + '),"PENDENTE")';
}

/** a planilha em português usa ";" como separador de argumentos; em inglês, ",". Converte (fora de textos entre aspas). */
var LOCALE_PLAN_ = null;
function localizarFormula_(f) {
  if (LOCALE_PLAN_ === null) { /* uma consulta por execução (cada chamada à planilha é lenta) */
    try { LOCALE_PLAN_ = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetLocale() || ''; } catch (e) { LOCALE_PLAN_ = ''; }
  }
  var loc = LOCALE_PLAN_;
  if (/^(en|ja|zh|ko|he|th|hi)/i.test(loc)) return f;
  var out = '', dentro = false;
  for (var i = 0; i < f.length; i++) {
    var ch = f.charAt(i);
    if (ch === '"') dentro = !dentro;
    out += (ch === ',' && !dentro) ? ';' : ch;
  }
  return out;
}

/** classifica as linhas da prévia: [{r(1-based), secao, label, pos}] */
function rotularLinhasPrevia_(sh) {
  var lr = sh.getLastRow(), v = sh.getRange(1, 1, lr, 3).getValues(), out = [];
  var SEC = { 'SV EXTERNOS': 1, 'SV UNIDADE': 1, 'SV SUBUNIDADES': 1, 'QG AD/1': 1, 'POMN': 1 };
  var secao = '', ultimo = '', pos = 0;
  for (var r = 4; r < lr; r++) {
    var a = norm_(v[r][0]), b = norm_(v[r][1]), c = String(v[r][2]).trim();
    if (a && SEC[a]) { secao = a; ultimo = ''; pos = 0; if (!b) continue; }
    var rotulo = b || (a && !SEC[a] ? a : '');
    if (rotulo) { ultimo = rotulo; pos = 1; }
    else if (ultimo && c !== '') pos++;
    else { ultimo = ''; continue; }
    out.push({ r: r + 1, secao: secao, label: ultimo, pos: pos });
  }
  return out;
}

function gerarFormulasExternas_(sh, datas) {
  var mapa = rotularLinhasPrevia_(sh), n = 0, avisos = [];
  var por = {};
  mapa.forEach(function (m) { por[m.secao + '|' + m.label + '|' + m.pos] = m.r; });
  function linha(sec, label, pos) { return por[sec + '|' + label + '|' + (pos || 1)]; }
  var rOf = linha('SV UNIDADE', 'OF DIA'), rQg = linha('QG AD/1', 'OF DIA'), rMano = linha('SV UNIDADE', 'MANOBREIRO');
  function porRotulo(rot) { var f = mapa.filter(function (m) { return m.label === rot; })[0]; return f ? f.r : null; }
  var rMotDia = linha('SV UNIDADE', 'MOT DIA') || porRotulo('MOT DIA'), rMotPomn = porRotulo('MOT AMBU GU');
  var rAt = linha('SV UNIDADE', 'ATENDIMENTO'), rAux = linha('SV UNIDADE', 'AUX ATENDIMENTO');
  var rS1 = linha('SV SUBUNIDADES', 'SGT DIA 1ª/2ª BO'), rS2 = linha('SV SUBUNIDADES', 'SGT DIA BIA C/DMSF');
  datas.forEach(function (dt, i) {
    var col = 3 + i, L = colLetra_(col - 1);
    function ponha(r, f, nome) { if (r) { sh.getRange(r, col).setFormula(localizarFormula_(f)); n++; } else avisos.push('linha "' + nome + '" não encontrada'); }
    ponha(rOf, fxOf_(L, false), 'OF DIA');
    ponha(rQg, fxOf_(L, true), 'OF DIA (QG AD/1)');
    var S = lerSgt_(dt);
    if (S) { ponha(rS1, fxSgt_(S, L, 1), 'SGT DIA 1ª/2ª BO'); ponha(rS2, fxSgt_(S, L, 2), 'SGT DIA BIA C/DMSF'); }
    else avisos.push('Sgt Dia sem aba/coluna para ' + fmtData_(dt));
    var M = lerMano_(dt);
    if (M) ponha(rMano, fxMano_(M, L), 'MANOBREIRO'); else avisos.push('Manobreiro sem aba/coluna para ' + fmtData_(dt));
    ponha(rMotDia, fxMotorista_(L, 'dia'), 'MOT DIA');
    ponha(rMotPomn, fxMotorista_(L, 'pomn'), 'MOT AMBU GU (POMN)');
    ponha(rAt, fxAtend_(L, 1), 'ATENDIMENTO');
    ponha(rAux, fxAtend_(L, 2), 'AUX ATENDIMENTO');
  });
  escreverPermissoes_(sh);
  return { n: n, avisos: avisos };
}

/** células visíveis (J2:J4) para o Google pedir "Permitir acesso" a cada arquivo (IFERROR esconderia o pedido) */
function escreverPermissoes_(sh) {
  var itens = [['Sgt Dia', EXT.SGT], ['Manobreiro', EXT.MANO]];
  itens.forEach(function (it, i) {
    sh.getRange(2 + i, 10).setFormula(localizarFormula_('=IMPORTRANGE("' + urlExt_(it[1]) + '","A1")')).setFontColor('#9aa0a6').setFontSize(7);
    sh.getRange(2 + i, 11).setValue('↖ ' + it[0] + ': se aparecer "Permitir acesso", clique').setFontColor('#9aa0a6').setFontSize(8);
  });
}

/** Atualiza uma aba de prévia: tabelas (Of Dia e trocas) e, opcionalmente, as fórmulas dos blocos externos. */
function atualizarExternosPrevia_(sh, comFormulas) {
  var datas = datasPrevia_(sh), tab = tabelasExternas_(datas), res = { n: 0, avisos: [] };
  if (comFormulas) res = gerarFormulasExternas_(sh, datas);
  escreverTabelasExternas_(sh, tab);
  res.avisos = tab.avisos.concat(res.avisos);
  return res;
}

function atualizarExternosTrigger() {
  abasPrevia_().forEach(function (sh) {
    if (sh.isSheetHidden() || /Modelo/i.test(sh.getName())) return;
    try { atualizarTabelasInternas_(sh); atualizarExternosPrevia_(sh, false); } catch (e) { Logger.log(sh.getName() + ': ' + e.message); }
  });
}

/* a cada alteração/formatação da planilha (instalável): atualiza as tabelas internas (cores, trocas), no máximo 1x a cada 20 s */
function atualizarTabelasOnChange() {
  var props = PropertiesService.getDocumentProperties(), agora = Date.now();
  if (agora - Number(props.getProperty('PV_ULT') || 0) < 20000) return;
  props.setProperty('PV_ULT', String(agora));
  abasPrevia_().forEach(function (sh) {
    if (sh.isSheetHidden()) return; /* inclui a "Prévia - Modelo" */
    try { atualizarTabelasInternas_(sh); } catch (e) { Logger.log(sh.getName() + ': ' + e.message); }
  });
}

/* cores e anotações (trocas) das escalas da própria planilha: edição de anotação não dispara "onChange", então um gatilho leve a cada 5 min garante o lançamento */
function atualizarTrocasTrigger() {
  abasPrevia_().forEach(function (sh) {
    if (sh.isSheetHidden()) return;
    try { atualizarTabelasInternas_(sh); } catch (e) { Logger.log(sh.getName() + ': ' + e.message); }
  });
}

function garantirTriggerExternos_() {
  var tr = ScriptApp.getProjectTriggers(), novo = false;
  if (!tr.some(function (t) { return t.getHandlerFunction() === 'atualizarExternosTrigger'; })) {
    ScriptApp.newTrigger('atualizarExternosTrigger').timeBased().everyMinutes(10).create(); novo = true;
  }
  if (!tr.some(function (t) { return t.getHandlerFunction() === 'atualizarTrocasTrigger'; })) {
    ScriptApp.newTrigger('atualizarTrocasTrigger').timeBased().everyMinutes(5).create(); novo = true;
  }
  if (!tr.some(function (t) { return t.getHandlerFunction() === 'atualizarTabelasOnChange'; })) {
    ScriptApp.newTrigger('atualizarTabelasOnChange').forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet()).onChange().create(); novo = true;
  }
  return novo;
}
