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

function flagResumo_(A, igual, dia) {
  if (!A) return false;
  var achou = false;
  A.resumo.forEach(function (S) {
    var lab = semAcento_(S.label);
    if (lab === igual && !achou) achou = String(A.bgs[S.r][colDia_(dia)]).toLowerCase() === CFG.COR.LARANJA;
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
    var linha = [serialData_(d), flagResumo_(G, 'CMT GD GRAGOATA', dia), flagResumo_(G, 'CB GD GRAGOATA', dia), flagResumo_(G, 'GD GRAGOATA', dia),
      flagResumo_(G, 'MOTORISTA A POMN', dia), flagResumo_(G, 'OF DIA GRAGOATA', dia), vermG, vermC];
    var p12 = [], p24 = [], ctrl = [], cb = [];
    if (G) {
      G.blocos.forEach(function (B) {
        var t = semAcento_(B.titulo);
        if (t.indexOf('POMN') === 0) {
          zerosValidos_(G, B, dia).forEach(function (z) {
            if (vermG) ctrl.push(z.nome);
            else if (z.bg === PREVIA_COR.PORTAO12) p12.push(z.nome);
            else if (z.bg === PREVIA_COR.PORTAO24) p24.push(z.nome);
          });
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

function instalarAuxPrevia_(sh) {
  var precisa = 36 - sh.getMaxColumns();
  if (precisa > 0) sh.insertColumnsAfter(sh.getMaxColumns(), precisa);
  sh.getRange('L2').setFormula('=PREVIA_CAL($C$2:$I$2,NOW())');
  sh.getRange('AG2').setFormula('=PREVIA_TROCAS($C$2:$I$2,NOW())');
  sh.getRange('L1').setValue('PREVIA_CAL (tabela por dia — não apague)');
  sh.getRange('AG1').setValue('PREVIA_TROCAS (não apague)');
  sh.hideColumns(12, 25);
}

/** Troca as referências às abas CAL/TROCAS/ESCALADOS_CACHE por fórmulas locais. Devolve {alteradas, externas[]}. */
function migrarPrevia_(sh) {
  var lr = sh.getLastRow(), rg = sh.getRange(1, 1, lr, 9), forms = rg.getFormulas(), alteradas = 0, externas = {};
  for (var r = 0; r < forms.length; r++) {
    for (var c = 0; c < 9; c++) {
      var f = forms[r][c];
      if (!f) continue;
      var novo = trocarRefsCache_(f);
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
function mnuAtualizarPrevia() {
  var ui = SpreadsheetApp.getUi();
  try {
    ss_().setRecalculationInterval(SpreadsheetApp.RecalculationInterval.MINUTE);
    var tot = 0, ext = {}, nomes = [];
    abasPrevia_().forEach(function (sh) {
      var r = migrarPrevia_(sh);
      tot += r.alteradas;
      r.externas.forEach(function (e) { ext[e] = true; });
      nomes.push(sh.getName());
    });
    SpreadsheetApp.flush();
    var msg = 'Prévias verificadas: ' + nomes.length + ' (' + tot + ' fórmula(s) ajustada(s) para ler direto das escalas).\n' +
      'As escalas da própria planilha atualizam em tempo real; cores e anotações (portões, CB DIA, trocas) a cada minuto.';
    var ex = Object.keys(ext);
    if (ex.length) msg += '\n\nAinda leem abas de cache (arquivos externos): ' + ex.join(', ') + '.';
    ui.alert('Atualizar prévia', msg, ui.ButtonSet.OK);
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

function criarPrevia_(ini) {
  var ss = ss_(), modelo = ss.getSheetByName('Prévia - Modelo');
  if (!modelo) throw new Error('A aba "Prévia - Modelo" não existe.');
  var nome = nomePrevia_(ini);
  if (ss.getSheetByName(nome)) throw new Error('A aba "' + nome + '" já existe.');
  var sh = modelo.copyTo(ss);
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
    /* a nova aba fica à frente das outras prévias */
    var primeira = abasPrevia_().filter(function (s) { return s.getSheetId() !== sh.getSheetId() && !s.isSheetHidden(); })[0];
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(primeira ? primeira.getIndex() : ss.getNumSheets());
    migrarPrevia_(sh);
  } catch (e) { ss.deleteSheet(sh); throw e; }
  SpreadsheetApp.flush();
  return nome;
}

function mnuAdicionarPrevia() {
  var ui = SpreadsheetApp.getUi(), hoje = new Date();
  var sug = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  while (sug.getDay() !== 3 || sug <= hoje) sug.setDate(sug.getDate() + 1);
  var r = ui.prompt('Adicionar prévia semanal', 'Informe a QUARTA-FEIRA inicial (dd/mm/aaaa). A prévia cobre de quarta a terça.\nSugestão: ' + fmtData_(sug),
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var txt = (r.getResponseText() || fmtData_(sug)).trim(), m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(txt);
  if (!m) { ui.alert('Formato inválido. Use dd/mm/aaaa.'); return; }
  var ini = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (ini.getDay() !== 3) { ui.alert('A data informada não é uma quarta-feira.'); return; }
  try {
    var nome = criarPrevia_(ini);
    ui.alert('Prévia criada', '"' + nome + '" criada a partir de "Prévia - Modelo", com as colunas de sábado, domingo e feriado em vermelho.', ui.ButtonSet.OK);
  } catch (e) { ui.alert('Não foi possível criar a prévia', e.message, ui.ButtonSet.OK); }
}
