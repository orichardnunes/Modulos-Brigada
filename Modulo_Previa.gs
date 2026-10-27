/**
 * MÓDULO BRIGADA 1.0 — Modulo_Previa.gs
 * Prévia semanal (quarta a terça) lendo as escalas da própria planilha, SEM abas de cache:
 *  - nomes vêm de fórmulas (INDIRECT) direto das abas "<Mês> Grad" / "<Mês> Cndt e Praia" (tempo real);
 *  - o que fórmula não enxerga (cores e anotações das células) vem de duas funções personalizadas,
 *    PREVIA_CAL e PREVIA_TROCAS, cujo resultado fica em colunas ocultas da própria aba da prévia
 *    (recalculam a cada minuto: Arquivo > Configurações > Cálculo > "Ao alterar e a cada minuto").
 * Escalas de arquivos externos (Of Dia, Sgt Dia, Manobreiro, Atendimento) ainda usam as abas *_CACHE (próxima etapa).
 * Depende de Codigo.gs, Modulo_Escala.gs e Modulo_Auditagem.gs.
 */

/* colunas ocultas da prévia (A1): tabela por dia em L:AE e trocas em AG:AJ */
var PREVIA_LOC = {
  CAL: { B: 'M', C: 'N', D: 'O', E: 'P', F: 'R', G: 'S', H: 'S' },
  ESC: { B: 'T', C: 'U', D: 'V', E: 'W', F: 'X', G: 'Y', H: 'Z', I: 'AA', J: 'AB', K: 'AC', L: 'AD', M: 'AE' },
  TRC: { A: 'AG', B: 'AH', C: 'AI' }
};
var PREVIA_COR = { PORTAO12: '#a4c2f4', PORTAO24: '#1c4587', CAB_NORMAL: '#cccccc', CAB_VERMELHO: '#cc0000' };

/* ============================================================ FUNÇÕES PERSONALIZADAS */
function serialData_(d) { return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000); }

function achatar_(v) {
  var out = [];
  (Array.isArray(v) ? v : [[v]]).forEach(function (r) { (Array.isArray(r) ? r : [r]).forEach(function (x) { out.push(x); }); });
  return out;
}

function carregarAbaPrevia_(ctx, d, tipo) {
  var nome = CFG.MESES[d.getMonth()] + ' ' + tipo;
  if (!(nome in ctx.abas)) {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome);
    ctx.abas[nome] = sh ? lerAba_(sh, d.getMonth(), d.getFullYear()) : null;
    if (ctx.abas[nome]) {
      ctx.abas[nome].notas = sh.getRange(1, 1, ctx.abas[nome].vals.length, ctx.abas[nome].vals[0].length).getNotes();
      ctx.abas[nome].chaves = [];
      ctx.abas[nome].blocos.forEach(function (B) { B.rows.forEach(function (R) { ctx.abas[nome].chaves.push({ key: R.key, nome: R.nome, sub: R.sub }); }); });
    }
  }
  return ctx.abas[nome];
}

function flagResumo_(A, igual, dia, prefixoBloco) {
  if (!A) return false;
  var achou = false;
  A.resumo.forEach(function (S) {
    var lab = semAcento_(S.label);
    if (lab === igual && !achou) achou = String(A.bgs[S.r][colDia_(dia)]).toLowerCase() === CFG.COR.LARANJA;
  });
  if (achou || !prefixoBloco) return achou;
  /* alternativa: o cabeçalho do próprio bloco QG AD/1 (dias laranja = serviço do 21º GAC) */
  A.blocos.forEach(function (B) {
    if (!achou && B.kind === 'qg' && semAcento_(B.titulo).indexOf(prefixoBloco) === 0) achou = String(A.bgs[B.hdr][colDia_(dia)]).toLowerCase() === CFG.COR.LARANJA;
  });
  return achou;
}

/** nome do militar de serviço, já trocado pelo que a nota da célula informa (marcado com " *") */
function nomeComTroca_(A, R, c) {
  var nota = A.notas[R.r][c];
  if (nota && String(nota).trim()) {
    var t = resolverNomeNota_(nota, A.chaves);
    if (t && t.key !== R.key) return t.nome.replace(/\s+/g, ' ').trim() + ' *';
  }
  return R.nome.replace(/\s+/g, ' ').trim();
}

function zerosValidos_(A, B, dia, filtroCor) { /* [{R, nome, bg}] na ordem do bloco */
  var out = [], c = colDia_(dia);
  B.rows.forEach(function (R) {
    if (num_(A.vals[R.r][c]) !== 0) return;
    if (ehAfastLegenda_(A, R.r, c)) return;
    var bg = String(A.bgs[R.r][c]).toLowerCase();
    if (bg === A.leg.outra.bg) return;
    if (filtroCor && !filtroCor(bg)) return;
    out.push({ R: R, bg: bg, nome: nomeComTroca_(A, R, c) });
  });
  return out;
}

/**
 * Tabela por dia: [data, CMT GD(laranja), CB GD, GD, MOT POMN, OF DIA, vermelho Grad, vermelho Cndt,
 * portão 12h x2, portão 24h x3, controle x3, CB DIA x4]. Cores e anotações lidas das abas do mês.
 * @param {Range} datas intervalo com as datas da prévia (ex.: C2:I2)
 * @param {any} tick use NOW() para recalcular a cada minuto
 * @return {Array} tabela
 * @customfunction
 */
function PREVIA_CAL(datas, tick) {
  var ctx = { abas: {} }, linhas = [];
  achatar_(datas).forEach(function (d) {
    if (!(d instanceof Date)) return;
    var dia = d.getDate(), G = carregarAbaPrevia_(ctx, d, CFG.TIPO_GRAD), C = carregarAbaPrevia_(ctx, d, CFG.TIPO_CNDT);
    var vermG = G && G.topo != null ? String(G.bgs[G.topo + 1][colDia_(dia)]).toLowerCase() === CFG.COR.VERMELHO : ehVermelhoData_(d);
    var vermC = C && C.blocos.length ? vermelho_(C, C.blocos[0], dia) : vermG;
    var linha = [serialData_(d), flagResumo_(G, 'CMT GD GRAGOATA', dia, 'CMT GD'), flagResumo_(G, 'CB GD GRAGOATA', dia, 'CB GD'), flagResumo_(G, 'GD GRAGOATA', dia, 'SD GD'),
      flagResumo_(G, 'MOTORISTA A POMN', dia, 'MOTORISTA'), flagResumo_(G, 'OF DIA GRAGOATA', dia, 'OF DIA'), vermG, vermC];
    var p12 = [], p24 = [], ctrl = [], cb = [];
    if (G) {
      G.blocos.forEach(function (B) {
        var t = semAcento_(B.titulo);
        if (t.indexOf('POMN') === 0) {
          var resto = [];
          zerosValidos_(G, B, dia).forEach(function (z) {
            if (vermG) ctrl.push(z.nome);
            else if (z.bg === PREVIA_COR.PORTAO12) p12.push(z.nome);
            else if (z.bg === PREVIA_COR.PORTAO24) p24.push(z.nome);
            else resto.push(z.nome); /* sem cor de portão: os 2 primeiros são 12h e os demais 24h */
          });
          resto.forEach(function (nm) { if (p12.length < 2) p12.push(nm); else p24.push(nm); });
        } else if (t === 'CB DIA') {
          zerosValidos_(G, B, dia).forEach(function (z) { cb.push(z.nome); });
        }
      });
    }
    function pega(l, n) { var o = []; for (var i = 0; i < n; i++) o.push(l[i] || ''); return o; }
    linhas.push(linha.concat(pega(p12, 2), pega(p24, 3), pega(ctrl, 3), pega(cb, 4)));
  });
  return linhas.length ? linhas : [['']];
}

/**
 * Trocas de serviço (anotação na célula do "0") nos dias da prévia: [data, quem estava na grade, quem assume (*), escala].
 * @param {Range} datas intervalo com as datas da prévia
 * @param {any} tick use NOW() para recalcular a cada minuto
 * @return {Array} tabela
 * @customfunction
 */
function PREVIA_TROCAS(datas, tick) {
  var ctx = { abas: {} }, out = [];
  achatar_(datas).forEach(function (d) {
    if (!(d instanceof Date)) return;
    var dia = d.getDate();
    [CFG.TIPO_GRAD, CFG.TIPO_CNDT].forEach(function (tipo) {
      var A = carregarAbaPrevia_(ctx, d, tipo);
      if (!A) return;
      A.blocos.forEach(function (B) {
        var c = colDia_(dia);
        B.rows.forEach(function (R) {
          if (num_(A.vals[R.r][c]) !== 0 || ehAfastLegenda_(A, R.r, c)) return;
          if (String(A.bgs[R.r][c]).toLowerCase() === A.leg.outra.bg) return;
          var nota = A.notas[R.r][c];
          if (!nota || !String(nota).trim()) return;
          var t = resolverNomeNota_(nota, A.chaves);
          if (t && t.key !== R.key) out.push([serialData_(d), R.nome.replace(/\s+/g, ' ').trim(), t.nome.replace(/\s+/g, ' ').trim() + ' *', B.titulo]);
        });
      });
    });
  });
  return out.length ? out : [['', '', '', '']];
}

/* ============================================================ MIGRAÇÃO DAS FÓRMULAS (sem abas de cache) */
function trocarRefsCache_(f) {
  var out = f;
  out = out.replace(/INDEX\(\s*CAL_CACHE!\$([A-Z])\$2:\$[A-Z]\$500\s*([,;])\s*MATCH\(\s*([^,;()]+?)\s*[,;]\s*CAL_CACHE!\$A\$2:\$A\$500\s*[,;]\s*0\s*\)\s*\)/g,
    function (m, col, sep, arg) {
      var lc = PREVIA_LOC.CAL[col];
      return lc ? 'INDEX($' + lc + '$2:$' + lc + '$8' + sep + ' MATCH(' + arg + sep + ' $L$2:$L$8' + sep + ' 0))' : m;
    });
  out = out.replace(/INDEX\(\s*ESCALADOS_CACHE!\$([A-Z]):\$[A-Z]\s*([,;])\s*MATCH\(\s*([^,;()]+?)\s*[,;]\s*ESCALADOS_CACHE!\$A:\$A\s*[,;]\s*0\s*\)\s*\)/g,
    function (m, col, sep, arg) {
      var lc = PREVIA_LOC.ESC[col];
      return lc ? 'INDEX($' + lc + '$2:$' + lc + '$8' + sep + ' MATCH(' + arg + sep + ' $L$2:$L$8' + sep + ' 0))' : m;
    });
  out = out.replace(/TROCAS_CACHE!\$([ABC])\$2:\$[ABC]\$500/g, function (m, col) { return '$' + PREVIA_LOC.TRC[col] + '$2:$' + PREVIA_LOC.TRC[col] + '$400'; });
  return out;
}

/** grava (por script, que tem permissão total) a tabela por dia e as trocas internas nas colunas ocultas L:AE e AG:AJ */
function atualizarTabelasInternas_(sh) {
  var datas = datasPrevia_(sh), cal = PREVIA_CAL([datas], 0), trc = PREVIA_TROCAS([datas], 0);
  sh.getRange(2, 12, cal.length, cal[0].length).setValues(cal);
  sh.getRange('AG2:AJ300').clearContent();
  sh.getRange(2, 33, trc.length, 4).setValues(trc);
  carimboPrevia_(sh);
}

var CABECALHO_CAL_ = ['Data', 'QG: CMT GD (laranja)', 'QG: CB GD (laranja)', 'QG: GD (laranja)', 'QG: Mot POMN (laranja)', 'QG: Of Dia (laranja)', 'Dia vermelho (Grad)',
  'Dia vermelho (Cndt)', 'Portão 12h #1', 'Portão 12h #2', 'Portão 24h #1', 'Portão 24h #2', 'Portão 24h #3', 'Controle #1', 'Controle #2', 'Controle #3',
  'CB DIA #1 (2ª BO)', 'CB DIA #2 (1ª BO)', 'CB DIA #3 (DMSF)', 'CB DIA #4 (BIA C)'];

/** títulos, formato de data e aviso nas colunas ocultas (L:AW); só apresentação, não altera os dados */
function formatarAuxPrevia_(sh) {
  var cab = '#e8eaed';
  sh.getRange(1, 12, 1, 20).setValues([CABECALHO_CAL_]).setFontWeight('bold').setBackground(cab).setWrap(true);
  sh.getRange(1, 33, 1, 4).setValues([['Trocas (nesta planilha): data', 'Quem estava na escala', 'Quem assume (*)', 'Escala']]).setFontWeight('bold').setBackground(cab).setWrap(true);
  sh.getRange('AL1:AN1').setFontWeight('bold').setBackground(cab).setWrap(true);
  sh.getRange('AP1:AS1').setFontWeight('bold').setBackground(cab).setWrap(true);
  sh.getRange('AU1:AW1').setFontWeight('bold').setBackground(cab).setWrap(true);
  ['L2:L8', 'AG2:AG300', 'AL2:AL8', 'AP2:AP300', 'AU2:AU8'].forEach(function (a) { sh.getRange(a).setNumberFormat('dd/mm/yyyy'); });
  sh.getRange('L10').setValue('Área auxiliar da prévia: preenchida por script (a cada alteração da planilha, a cada 10 min e em "Atualizar prévia"). Não edite.').setFontColor('#80868b');
}

function instalarAuxPrevia_(sh) {
  var precisa = 49 - sh.getMaxColumns();
  if (precisa > 0) sh.insertColumnsAfter(sh.getMaxColumns(), precisa);
  sh.getRange(1, 10, sh.getMaxRows(), 40).clearContent(); /* limpa colunas auxiliares (J:AW), inclusive restos de versões antigas */
  sh.hideColumns(12, 38);
  atualizarTabelasInternas_(sh);
  formatarAuxPrevia_(sh);
}

function colNum_(L) { var n = 0; for (var i = 0; i < L.length; i++) n = n * 26 + L.charCodeAt(i) - 64; return n; }

/* se as colunas auxiliares foram deslocadas (inserção/remoção de colunas), religa as referências às posições L/AG */
function normalizarHelpers_(f) {
  var out = f.replace(/INDEX\(\s*\$([A-Z]+)\$2:\$\1\$8\s*([,;])\s*MATCH\(\s*([^,;()]+?)\s*[,;]\s*\$([A-Z]+)\$2:\$\4\$8\s*[,;]\s*0\s*\)\s*\)/g,
    function (m, x, sep, arg, y) {
      if (y === 'AL' || y === 'AU') return m; /* tabelas do Of Dia (AL) e do Atendimento (AU) não são a tabela por dia */
      var nx = 12 + colNum_(x) - colNum_(y);
      if (nx < 12 || nx > 31) return m;
      var L = colLetra_(nx - 1);
      return 'INDEX($' + L + '$2:$' + L + '$8' + sep + ' MATCH(' + arg + sep + ' $L$2:$L$8' + sep + ' 0))';
    });
  out = out.replace(/INDEX\(\s*\$([A-Z]+)\$2:\$\1\$400\s*([,;])\s*MATCH\(\s*1\s*[,;]\s*ARRAYFORMULA\(\(\s*\$([A-Z]+)\$2:\$\3\$400\s*=\s*([^)*]+?)\s*\)\s*\*\s*\(\s*\$([A-Z]+)\$2:\$\5\$400\s*=\s*TRIM\(nomeGrade/g,
    function (m, as, sep, da, arg) {
      return 'INDEX($AI$2:$AI$400' + sep + ' MATCH(1' + sep + ' ARRAYFORMULA(($AG$2:$AG$400=' + arg + ')*($AH$2:$AH$400=TRIM(nomeGrade';
    });
  return out;
}

/* serviços que normalmente não existem em todos os dias: sem ninguém escalado = "X" (e não PENDENTE) */
function opcionaisParaX_(f) {
  if (!/CONDUTOR DE TURISMO|SUPERVISOR DE PRAIA FBRB|Ct Aces Estr/.test(f)) return f;
  return f.replace(/(nomeGrade\s*=\s*""\s*[,;]\s*)"PENDENTE"/g, '$1"X"');
}

/* CB DIA: nos dias com menos de 4 (título "2 CB DIA"), as posições sem militar ficam "X" */
function cbDiaParaX_(f) {
  if (!/\$A[B-E]\$2:\$A[B-E]\$8/.test(f)) return f;
  return f.replace(/IF\(\s*nome\s*=\s*""\s*([,;])\s*"PENDENTE"\s*[,;]\s*nome\s*\)/g, function (m, sep) {
    return 'IF(nome=""' + sep + ' IF(INDEX($AB$2:$AB$8' + sep + ' MATCH(d' + sep + ' $L$2:$L$8' + sep + ' 0))=""' + sep + ' "PENDENTE"' + sep + ' "X")' + sep + ' nome)';
  });
}

/* meses de 31 dias: a coluna do dia 31 é a AI (dia + 3); intervalos até AH deixavam o último dia PENDENTE */
function estenderDia31_(f) { return /IMPORTRANGE/i.test(f) ? f.replace(/:AH(?=")/g, ':AI') : f; }

function ajustarFormulaPrevia_(f) { return estenderDia31_(cbDiaParaX_(opcionaisParaX_(normalizarHelpers_(trocarRefsCache_(f))))); }

/** Troca as referências às abas CAL/TROCAS/ESCALADOS_CACHE por fórmulas locais. Devolve {alteradas, externas[]}. */
function migrarPrevia_(sh) {
  var lr = sh.getLastRow(), rg = sh.getRange(1, 1, lr, 9), forms = rg.getFormulas(), alteradas = 0, externas = {};
  for (var r = 0; r < forms.length; r++) {
    for (var c = 0; c < 9; c++) {
      var f = forms[r][c];
      if (!f) continue;
      var novo = ajustarFormulaPrevia_(f);
      if (novo !== f) { sh.getRange(r + 1, c + 1).setFormula(novo); alteradas++; }
      var m = /(OF_DIA|SGT_DIA|MANOBREIRO|ATENDIMENTO|CAL|TROCAS|ESCALADOS)_CACHE/.exec(novo);
      if (m) externas[m[1]] = true;
    }
  }
  instalarAuxPrevia_(sh);
  return { alteradas: alteradas, externas: Object.keys(externas) };
}

function abasPrevia_() {
  return ss_().getSheets().filter(function (s) { return /^Pr[eé]via/i.test(s.getName()); });
}

/* ============================================================ MENU */
var ABAS_CACHE_ = ['CAL_CACHE', 'TROCAS_CACHE', 'ESCALADOS_CACHE', 'OF_DIA_CACHE', 'SGT_DIA_CACHE', 'MANOBREIRO_CACHE', 'ATENDIMENTO_CACHE'];

function refsCache_(sh) {
  var lr = sh.getLastRow(), forms = sh.getRange(1, 1, lr, 9).getFormulas(), achou = {};
  forms.forEach(function (l) { l.forEach(function (f) { var m = f && /([A-Z_]+_CACHE)/.exec(f); if (m) achou[m[1]] = true; }); });
  return Object.keys(achou);
}

/** carimbo visível (J1) com a hora da última atualização feita pelo script */
function carimboPrevia_(sh) {
  var t = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM HH:mm:ss');
  sh.getRange('J1').setValue('Atualizado pelo script em ' + t).setFontColor('#9aa0a6').setFontSize(8);
}

/** conta as células PENDENTE/erro de uma prévia e lista onde estão */
function pendenciasPrevia_(sh) {
  var lr = sh.getLastRow(), out = { n: 0, linhas: {} };
  if (lr < 4) return out;
  var v = sh.getRange(1, 1, lr, 9).getDisplayValues();
  for (var r = 3; r < lr; r++) for (var c = 2; c < 9; c++) {
    var t = String(v[r][c]).trim();
    if (t === 'PENDENTE' || /^#(ERROR|REF|N\/A|VALUE|NAME)/i.test(t) || /^Loading|^Carregando/i.test(t)) {
      out.n++;
      var rot = String(v[r][1]).trim() || String(v[r][0]).trim() || ('linha ' + (r + 1));
      out.linhas[rot] = (out.linhas[rot] || []).concat(String(v[1][c]).trim() || ('col ' + (c + 1)));
    }
  }
  return out;
}

function mnuAtualizarPrevia() {
  var ui = SpreadsheetApp.getUi();
  try {
    ss_().setRecalculationInterval(SpreadsheetApp.RecalculationInterval.MINUTE);
    var tot = 0, previas = [], avisos = [], pendentes = {}, objs = [];
    abasPrevia_().forEach(function (sh) {
      var r;
      try { r = migrarPrevia_(sh); } catch (e) { avisos.push(sh.getName() + ': ' + e.message); return; }
      tot += r.alteradas;
      try {
        var x = atualizarExternosPrevia_(sh, true);
        x.avisos.forEach(function (a) { avisos.push(sh.getName() + ': ' + a); });
      } catch (e) { avisos.push(sh.getName() + ': ' + e.message); }
      try { atualizarTabelasInternas_(sh); } catch (e) { avisos.push(sh.getName() + ': ' + e.message); }
      objs.push(sh);
      refsCache_(sh).forEach(function (c) { pendentes[c] = true; });
    });
    var novoGatilho = garantirTriggerExternos_();
    SpreadsheetApp.flush();
    Utilities.sleep(2500); /* tempo para o IMPORTRANGE (Sgt Dia e Manobreiro) carregar */
    objs.forEach(function (sh) { previas.push({ nome: sh.getName(), p: pendenciasPrevia_(sh) }); });
    var totPend = previas.reduce(function (a, x) { return a + x.p.n; }, 0);
    var agora = Utilities.formatDate(new Date(), 'America/Sao_Paulo', "dd/MM/yyyy 'às' HH:mm:ss");
    var pend = Object.keys(pendentes);

    var h = '<h2 style="margin-top:0">Atualizar prévia</h2>' +
      '<p class="mu">Atualizado em ' + agora + '</p>' +
      '<div class="cards"><div class="card"><b>' + previas.length + '</b><span>prévia(s) verificada(s)</span></div>' +
      '<div class="card"><b>' + tot + '</b><span>fórmula(s) ajustada(s)</span></div>' +
      '<div class="card' + (totPend ? ' bad' : '') + '"><b>' + totPend + '</b><span>célula(s) pendente(s)</span></div></div>';
    h += totPend ? '<p class="erro"><b>Ainda há pendências.</b> Veja abaixo onde estão.</p>' : '<p class="ok"><b>✔ Prévia atualizada.</b> Nenhuma célula pendente.</p>';
    previas.forEach(function (x) {
      h += '<details' + (x.p.n ? ' open' : '') + '><summary>' + esc_(x.nome) + ' — ' + (x.p.n ? '<span class="erro">' + x.p.n + ' pendente(s)</span>' : '<span class="ok">completa</span>') + '</summary>';
      var ks = Object.keys(x.p.linhas);
      if (!ks.length) h += '<p class="mu">Todas as linhas preenchidas.</p>';
      else { h += '<table><tr><th>Linha</th><th>Dias pendentes</th></tr>'; ks.forEach(function (k) { h += '<tr><td>' + esc_(k) + '</td><td>' + esc_(x.p.linhas[k].join(' · ').replace(/\s+/g, ' ')) + '</td></tr>'; }); h += '</table>'; }
      h += '</details>';
    });
    if (avisos.length) h += '<details open><summary class="erro">⚠ Avisos (' + avisos.length + ')</summary><ul>' + avisos.slice(0, 10).map(function (a) { return '<li>' + esc_(a) + '</li>'; }).join('') + '</ul></details>';
    if (pend.length) h += '<p class="erro">Ainda há fórmulas lendo as abas de cache: ' + esc_(pend.join(', ')) + '.</p>';
    var existentes = ABAS_CACHE_.filter(function (n) { return ss_().getSheetByName(n); });
    if (!pend.length && existentes.length) h += '<p class="mu">Abas de cache que não são mais usadas (pode apagá-las): ' + esc_(existentes.join(', ')) + '.</p>';
    h += '<details><summary>Como a prévia se mantém atualizada</summary><ul>' +
      '<li><b>Escalas da própria planilha:</b> tempo real (fórmulas).</li>' +
      '<li><b>Cores e anotações</b> (portões, CB DIA, trocas): a cada alteração da planilha (até 1x a cada 20 s).</li>' +
      '<li><b>Of Dia, Atendimento e trocas dos arquivos externos:</b> lidos por script a cada 10 min' + (novoGatilho ? ' <i>(gatilho criado agora)</i>' : '') + ', ou ao rodar esta função.</li>' +
      '<li><b>Sgt Dia e Manobreiro:</b> IMPORTRANGE em tempo real. Se ficar PENDENTE, clique nas células cinzas J2:J3 da prévia e escolha “Permitir acesso” (uma vez por arquivo).</li>' +
      '<li>Em cada prévia, a célula <b>J1</b> (cinza, à direita da tabela) mostra a hora da última atualização feita pelo script.</li></ul></details>' +
      '<button class="p" onclick="google.script.host.close()">OK</button>';
    mostrarHtml_(h, 'Atualizar prévia', 560, 560);

  } catch (e) { ui.alert('Não foi possível atualizar a prévia', e.message, ui.ButtonSet.OK); }
}

function vermelhoParaData_(dt) {
  var sh = ss_().getSheetByName(CFG.MESES[dt.getMonth()] + ' ' + CFG.TIPO_GRAD);
  if (sh) {
    try {
      var A = lerAba_(sh, dt.getMonth(), dt.getFullYear());
      if (A.topo != null) return String(A.bgs[A.topo + 1][colDia_(dt.getDate())]).toLowerCase() === CFG.COR.VERMELHO;
    } catch (e) { /* usa o calendário padrão */ }
  }
  return ehVermelhoData_(dt);
}

function nomePrevia_(ini) {
  var fim = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + 6);
  return ini.getMonth() === fim.getMonth() ?
    'Prévia ' + ini.getDate() + ' - ' + fim.getDate() + ' ' + CFG.MESES[fim.getMonth()] :
    'Prévia ' + ini.getDate() + ' ' + CFG.MESES[ini.getMonth()] + ' - ' + fim.getDate() + ' ' + CFG.MESES[fim.getMonth()];
}

function vermelhoFlags_(ini) {
  var out = [];
  for (var i = 0; i < 7; i++) out.push(!!vermelhoParaData_(new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + i)));
  return out;
}

/** o corpo da prévia acompanha o tipo do dia: colunas de escala vermelha (sáb, dom, feriado) copiam o formato de uma coluna vermelha do Modelo, as demais o de uma coluna normal.
 *  Copia o formato direto do Modelo (getBackgrounds mistura formatação condicional e não serve para isso). */
function ajustarCorpoPrevia_(sh, modelo, flags) {
  var cab = modelo.getRange(2, 3, 1, 7).getBackgrounds()[0].map(function (c) { return String(c).toLowerCase(); });
  var isRed = cab.map(function (c) { return c === PREVIA_COR.CAB_VERMELHO; });
  var rj = isRed.indexOf(true), nj = isRed.indexOf(false), lr = Math.min(sh.getLastRow(), modelo.getLastRow());
  if (rj < 0 || nj < 0 || lr < 6) return;
  for (var j = 0; j < 7; j++) {
    if (isRed[j] === flags[j]) continue;
    modelo.getRange(6, 3 + (flags[j] ? rj : nj), lr - 5, 1).copyTo(sh.getRange(6, 3 + j, lr - 5, 1), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  }
}

function criarPrevia_(ini) {
  var ss = ss_(), modelo = ss.getSheetByName('Prévia - Modelo');
  if (!modelo) throw new Error('A aba "Prévia - Modelo" não existe.');
  var nome = nomePrevia_(ini);
  if (ss.getSheetByName(nome)) throw new Error('A aba "' + nome + '" já existe.');
  var sh = modelo.copyTo(ss), avisos = [];
  try {
    sh.setName(nome);
    sh.showSheet();
    sh.getRange('C2').setValue(ini);
    var vermelhos = [], normais = [], parada = [];
    for (var i = 0; i < 7; i++) {
      var dt = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + i), v = vermelhoParaData_(dt), col = 3 + i;
      (v ? vermelhos : normais).push([2, col], [3, col], [4, col]);
      parada.push(v ? 'PARADA DIÁRIA: 7h' : 'PARADA DIÁRIA: 8h');
    }
    vermelhos.forEach(function (p) { sh.getRange(p[0], p[1]).setBackground(PREVIA_COR.CAB_VERMELHO); });
    normais.forEach(function (p) { sh.getRange(p[0], p[1]).setBackground(PREVIA_COR.CAB_NORMAL); });
    sh.getRange(4, 3, 1, 7).setValues([parada]);
    ajustarCorpoPrevia_(sh, modelo, vermelhoFlags_(ini));
    /* a nova aba fica à frente das outras prévias */
    var primeira = abasPrevia_().filter(function (s) { return s.getSheetId() !== sh.getSheetId() && !s.isSheetHidden(); })[0];
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(primeira ? primeira.getIndex() : ss.getNumSheets());
    migrarPrevia_(sh);
    var ax = atualizarExternosPrevia_(sh, true);
    avisos = ax.avisos || [];
  } catch (e) { ss.deleteSheet(sh); throw e; }
  SpreadsheetApp.flush();
  Utilities.sleep(2000); /* tempo para o IMPORTRANGE carregar antes de contar as pendências */
  var pend = { n: 0, linhas: {} };
  try { pend = pendenciasPrevia_(sh); } catch (e) { /* o relatório segue sem a contagem */ }
  var flags = vermelhoFlags_(ini), dias = flags.map(function (v, i) {
    var dt = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + i);
    return { d: ('0' + dt.getDate()).slice(-2) + '/' + ('0' + (dt.getMonth() + 1)).slice(-2), sem: CFG.DIAS[dt.getDay()], verm: v, parada: v ? '7h' : '8h' };
  });
  return { nome: nome, rotulo: rotuloSemana_(ini), dias: dias, avisos: avisos, pend: pend.n, pendLinhas: Object.keys(pend.linhas).map(function (k) { return k + ' (' + pend.linhas[k].join(', ').replace(/\s+/g, ' ') + ')'; }) };
}

function rotuloSemana_(ini) {
  var fim = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + 6);
  return ini.getMonth() === fim.getMonth() ? ini.getDate() + ' – ' + fim.getDate() + ' ' + CFG.MESES[fim.getMonth()] :
    ini.getDate() + ' ' + CFG.MESES[ini.getMonth()] + ' – ' + fim.getDate() + ' ' + CFG.MESES[fim.getMonth()];
}

/** semanas (quarta a terça) para escolher: de 2 semanas atrás até 14 à frente */
function apiPreviaSemanas() {
  var hoje = new Date(), h0 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  var ini = new Date(h0); ini.setDate(ini.getDate() - ((ini.getDay() + 4) % 7)); /* quarta-feira desta semana (ou a mais recente) */
  ini.setDate(ini.getDate() - 14);
  var out = [], sugerida = false;
  for (var i = 0; i < 17; i++) {
    var d = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + 7 * i), fim = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6);
    var existe = !!ss_().getSheetByName(nomePrevia_(d)), sug = false;
    if (!existe && !sugerida && fim >= h0) { sug = true; sugerida = true; }
    out.push({ iso: isoData_(d), rotulo: rotuloSemana_(d), ano: d.getFullYear(), existe: existe, sugerida: sug, atual: d <= h0 && h0 <= fim });
  }
  return out;
}

function apiCriarPrevia(iso) { return criarPrevia_(parseIso_(iso)); }

function mnuAdicionarPrevia() {
  var h = '<style>.g{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}.w{border:1px solid #dadce0;border-radius:10px;padding:9px 12px;cursor:pointer;position:relative;margin:0}' +
    '.w:has(input:checked){border-color:#1a73e8;background:#e8f0fe}.w input{display:none}.w b{display:block;font-size:15px}.w small{color:#5f6368}' +
    '.w.ex{opacity:.45;cursor:not-allowed;background:#f1f3f4}.tag{position:absolute;right:8px;top:8px;font-size:10px;border-radius:8px;padding:1px 7px;background:#e6f4ea;color:#137333}' +
    '.ban{border-radius:10px;padding:8px 12px;margin:4px 0 8px}.okb{background:#e6f4ea;color:#137333}.lar{display:inline-block;min-width:22px;text-align:center;border-radius:10px;background:#5f6368;color:#fff;font-weight:600;padding:0 8px}.lar.vm{background:#cc0000}.tag.at{background:#fef7e0;color:#b06000}.tag.cx{background:#f1f3f4;color:#5f6368}.ano{grid-column:1/-1;color:#5f6368;font-size:11px;text-transform:uppercase;margin-top:4px}</style>' +
    '<h3 style="margin-top:0">Adicionar prévia semanal</h3><p id="sub" style="color:#5f6368;margin:2px 0">Escolha a semana (quarta a terça). A aba é criada a partir de “Prévia - Modelo”.</p>' +
    '<div class="g" id="g">Carregando…</div><button class="p" id="ok" disabled onclick="criar()">Criar prévia</button><button id="cancel" onclick="google.script.host.close()">Cancelar</button>' +
    '<div id="out" style="display:none;margin-top:10px"></div>' +
    '<script>function $(i){return document.getElementById(i)}var ESC=null;' +
    'google.script.run.withSuccessHandler(function(l){var h="",ano=0;l.forEach(function(s,i){if(s.ano!==ano){ano=s.ano;h+="<div class=ano>"+ano+"</div>"}' +
    'h+="<label class=\\"w"+(s.existe?" ex":"")+"\\"><input type=radio name=s value="+s.iso+(s.existe?" disabled":"")+(s.sugerida?" checked":"")+" onchange=sel()><b>"+s.rotulo+"</b><small>"+(s.atual?"semana atual":"quarta a terça")+"</small>"+' +
    '(s.existe?"<span class=\\"tag cx\\">já criada</span>":s.sugerida?"<span class=tag>sugerida</span>":s.atual?"<span class=\\"tag at\\">atual</span>":"")+"</label>"});$("g").innerHTML=h;sel()}).apiPreviaSemanas();' +
    'function sel(){$("ok").disabled=!document.querySelector("input[name=s]:checked")}' +
    'function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;")}' +
    'function resp(r){var h="",nv=r.dias.filter(function(x){return x.verm}).length;$("g").style.display="none";$("ok").style.display="none";$("cancel").style.display="none";$("sub").style.display="none";' +
    'var o=$("out");o.style.display="block";o.className="";' +
    'h+="<div class=\\"ban okb\\"><b>✅ Prévia criada</b><br><span class=mu>"+esc(r.nome)+" · semana "+esc(r.rotulo)+"</span></div>";' +
    'h+="<div class=cards><div class=card><b>7</b><span>dias (quarta a terça)</span></div><div class=card><b>"+nv+"</b><span>dia(s) de escala vermelha</span></div><div class=\\"card"+(r.pend?" bad":"")+"\\"><b>"+r.pend+"</b><span>célula(s) pendente(s)</span></div></div>";' +
    'h+="<table><tr><th>Dia</th><th>Semana</th><th>Escala</th><th>Parada diária</th></tr>";' +
    'r.dias.forEach(function(x){h+="<tr><td class=num>"+x.d+"</td><td>"+esc(x.sem)+"</td><td><span class=\\""+(x.verm?"lar vm":"lar")+"\\">"+(x.verm?"vermelha":"preta")+"</span></td><td class=mu>"+x.parada+"</td></tr>"});h+="</table>";' +
    'if(r.pend){h+="<details open><summary class=erro>Pendências ("+r.pend+")</summary><ul>";r.pendLinhas.forEach(function(x){h+="<li>"+esc(x)+"</li>"});h+="</ul><p class=mu>Sgt Dia e Manobreiro leem os arquivos externos: se continuarem PENDENTE, clique nas células cinzas J2:J3 e escolha “Permitir acesso”. Depois use “Atualizar prévia”.</p></details>"}' +
    'if(r.avisos.length){h+="<details open><summary class=erro>⚠ Avisos ("+r.avisos.length+")</summary><ul>";r.avisos.forEach(function(a){h+="<li>"+esc(a)+"</li>"});h+="</ul></details>"}' +
    'h+="<p class=mu>A célula J1 da prévia mostra a hora da última atualização feita pelo script.</p><button class=p onclick=\\"google.script.host.close()\\">Concluir</button>";' +
    'o.innerHTML=h}' +
    'function criar(){var v=document.querySelector("input[name=s]:checked").value;$("ok").disabled=true;$("out").style.display="block";$("out").textContent="Criando a prévia… (pode levar alguns segundos)";' +
    'google.script.run.withSuccessHandler(resp).withFailureHandler(function(e){$("out").textContent="ERRO: "+e.message;$("ok").disabled=false}).apiCriarPrevia(v)}</script>';
  mostrarHtml_(h, 'Adicionar prévia', 520, 560);
}
