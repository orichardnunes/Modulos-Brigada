/**
 * MÓDULO BRIGADA 1.0 — Modulo_Importar.gs
 * Importar a escala da Guarnição (AD/1) para a aba "<Mês> Grad":
 *  - linhas-resumo do topo (OF DIA / CMT GD / CB GD / GD GRAGOATÁ, MOTORISTA À POMN): laranja = 21º GAC, azul = outra unidade;
 *  - blocos "QG AD/1": fórmulas de folga só nos dias laranja;
 *  - tipo do dia (PRETA/VERM) conferido com a aba.
 * Depende de Codigo.gs e Modulo_Escala.gs.
 */

/* ordem fixa das 5 colunas de OM da escala da Guarnição */
var GUARNICAO_MAPA = [
  { rotulo: 'OF DIA GRAGOATA', fonte: 'OF DE DIA' },
  { rotulo: 'CMT GD GRAGOATA', fonte: 'CMT GD' },
  { rotulo: 'CB GD GRAGOATA', fonte: 'CB GD' },
  { rotulo: 'GD GRAGOATA', fonte: 'SENTINELA' },
  { rotulo: 'MOTORISTA A POMN', fonte: 'MOT AMBULANCIA' }
];

/* ============================================================ MENU */
function destinoImportacao_() {
  var at = SpreadsheetApp.getActiveSheet(), n = nomeAba_(at.getName());
  if (n && n.tipo === CFG.TIPO_GRAD) return at;
  var salvo = PropertiesService.getDocumentProperties().getProperty('ABA_DESTINO');
  var sh = salvo ? ss_().getSheetByName(salvo) : null;
  if (!sh) { /* sem aba Grad aberta nem destino salvo: sugere a última aba Grad (a janela de importação permite trocar) */
    var gs = ss_().getSheets().filter(function (x) { var y = nomeAba_(x.getName()); return y && y.tipo === CFG.TIPO_GRAD; });
    sh = gs.length ? gs[gs.length - 1] : null;
  }
  if (!sh) throw new Error('Nenhuma aba "<Mês> Grad" encontrada.');
  return sh;
}

function apiAbaDestino(nome) { PropertiesService.getDocumentProperties().setProperty('ABA_DESTINO', nome); }

function mnuImportarDrive() { abrirImportacao_('drive'); }
function mnuImportarDocumento() { abrirImportacao_('doc'); }

function abrirImportacao_(modo) {
  var sh;
  try { sh = destinoImportacao_(); } catch (e) { SpreadsheetApp.getUi().alert(e.message); return; }
  mostrarHtml_(htmlImportacao_(modo, sh.getName()), modo === 'drive' ? 'Importar via Google Drive' : 'Importar via documento', 760, 680);
}

/* ============================================================ LEITURA DA FONTE (Drive) */
function mesDoTitulo_(txt) {
  var u = semAcento_(txt), m = /ESCALAS? DE SERVICO\s*[-–—]?\s*(?:DO MES DE\s*)?(JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\s+DE\s+(\d{4})/.exec(u);
  if (!m) return null;
  var nomes = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
  return { mes: nomes.indexOf(m[1]), ano: Number(m[2]) };
}

function dataParaDMA_(v) {
  if (v instanceof Date) return { dia: v.getDate(), mes: v.getMonth(), ano: v.getFullYear() };
  var m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(String(v).trim());
  if (!m) return null;
  var a = Number(m[3]); if (a < 100) a += 2000;
  return { dia: Number(m[1]), mes: Number(m[2]) - 1, ano: a };
}

function lerGuarnicaoDrive_(url, mes, ano) {
  var src = SpreadsheetApp.openByUrl(url), sheets = src.getSheets(), alvo = null, vistas = [];
  sheets.sort(function (a, b) { return (a.isSheetHidden() ? 1 : 0) - (b.isSheetHidden() ? 1 : 0); });
  for (var i = 0; i < sheets.length && !alvo; i++) {
    var sh = sheets[i];
    if (sh.getLastRow() < 5) continue;
    var topo = sh.getRange(1, 1, Math.min(6, sh.getLastRow()), Math.min(6, sh.getLastColumn())).getDisplayValues();
    var txt = topo.map(function (r) { return r.join(' '); }).join(' ');
    var t = mesDoTitulo_(txt);
    if (t) vistas.push(sh.getName() + ' = ' + CFG.MESES[t.mes] + '/' + t.ano);
    if (t && t.mes === mes && t.ano === ano) alvo = sh;
  }
  if (!alvo) throw new Error('A planilha da Guarnição ainda não tem a escala de ' + CFG.MESES_EXT[mes] + '/' + ano +
    '. Abas lidas: ' + (vistas.join('; ') || 'nenhuma com título "ESCALAS DE SERVIÇO – MÊS DE ANO"') + '.');
  var vals = alvo.getRange(1, 1, alvo.getLastRow(), alvo.getLastColumn()).getValues();
  var hdr = -1;
  for (var r = 0; r < vals.length && hdr < 0; r++) if (vals[r].some(function (c) { return /DATA DO SERVI/i.test(semAcento_(c)); })) hdr = r;
  if (hdr < 0) throw new Error('Cabeçalho "DATA DO SERVIÇO" não encontrado na aba "' + alvo.getName() + '".');
  var colFonte = [];
  GUARNICAO_MAPA.forEach(function (m, k) {
    var idx = -1;
    vals[hdr].forEach(function (c, j) { if (idx < 0 && semAcento_(c).indexOf(m.fonte) >= 0) idx = j; });
    colFonte[k] = idx;
  });
  var colTipo = -1, colData = -1;
  vals[hdr].forEach(function (c, j) {
    var u = semAcento_(c);
    if (colData < 0 && u.indexOf('DATA DO SERVI') >= 0) colData = j;
    if (colTipo < 0 && u.indexOf('PRETA') >= 0) colTipo = j;
  });
  var faltam = [];
  colFonte.forEach(function (c, k) { if (c < 0) faltam.push(GUARNICAO_MAPA[k].fonte); });
  if (faltam.length) throw new Error('Colunas não encontradas na Guarnição: ' + faltam.join(', ') + '.');
  var linhas = [];
  for (var x = hdr + 1; x < vals.length; x++) {
    var d = dataParaDMA_(vals[x][colData]);
    if (!d) continue;
    var tipo = /VERM/i.test(String(vals[x][colTipo])) ? 'VERM' : 'PRETA';
    linhas.push({ dia: d.dia, mes: d.mes, ano: d.ano, tipo: tipo, cols: colFonte.map(function (c) { return String(vals[x][c]).trim(); }) });
  }
  return { linhas: linhas, fonte: alvo.getName() };
}

function apiImportarDrive(destNome, url, opcoes, aplicar) {
  var sh = ss_().getSheetByName(destNome);
  if (!sh) throw new Error('Aba "' + destNome + '" não encontrada.');
  var A = lerAba_(sh);
  var lido = lerGuarnicaoDrive_(url || CFG.URL_GUARNICAO, A.mes, A.ano);
  var r = apiImportarLinhas(destNome, lido.linhas, opcoes, aplicar);
  r.fonte = lido.fonte;
  r.linhas = lido.linhas;
  r.texto = 'Fonte: aba "' + lido.fonte + '" da planilha da Guarnição.\n\n' + r.texto;
  if (r.rel) r.rel.fonte = lido.fonte;
  return r;
}

/* ============================================================ APLICAÇÃO */
function ehProprio_(txt) { return /(^|[^0-9])21\W{0,3}GAC/i.test(semAcento_(txt)); }

/** linhas: [{dia, mes?, ano?, tipo:'PRETA'|'VERM', cols:[5 textos]}]. opcoes: { tipos:'manter'|'refazer' } */
function apiImportarLinhas(destNome, linhas, opcoes, aplicar) {
  opcoes = opcoes || {};
  var sh = ss_().getSheetByName(destNome);
  if (!sh) throw new Error('Aba "' + destNome + '" não encontrada.');
  var n0 = nomeAba_(destNome);
  if (!n0 || n0.tipo !== CFG.TIPO_GRAD) throw new Error('A aba de destino precisa ser "<Mês> Grad".');
  var A = lerAba_(sh), n = A.nDias, porDia = {}, avisos = [];
  (linhas || []).forEach(function (l) {
    if (l.mes != null && l.mes !== A.mes) return;
    if (l.ano != null && l.ano !== A.ano) return;
    if (l.dia < 1 || l.dia > n) return;
    if (porDia[l.dia]) avisos.push('Dia ' + l.dia + ' aparece mais de uma vez na fonte; vale a última linha.');
    porDia[l.dia] = l;
  });
  var dias = Object.keys(porDia).map(Number).sort(function (a, b) { return a - b; });
  if (!dias.length) throw new Error('Nenhum dia de ' + CFG.MESES_EXT[A.mes] + '/' + A.ano + ' encontrado na fonte.');
  var ausentes = [];
  for (var d = 1; d <= n; d++) if (!porDia[d]) ausentes.push(d);
  if (ausentes.length) avisos.push('Dias sem dado na fonte (ficam como estão): ' + ausentes.join(', ') + '.');

  /* linhas-resumo do topo */
  var resumoPorRotulo = {};
  A.resumo.forEach(function (S) { resumoPorRotulo[semAcento_(S.label)] = S; });
  var plano = [], texto = [], relEsc = [];
  GUARNICAO_MAPA.forEach(function (m, k) {
    var S = resumoPorRotulo[m.rotulo];
    if (!S) { avisos.push('Linha "' + m.rotulo + '" não encontrada no topo da aba (ignorada).'); return; }
    var laranja = [], azul = [];
    dias.forEach(function (dd) {
      var om = (porDia[dd].cols[k] || '');
      if (ehProprio_(om)) laranja.push(dd); else azul.push(dd);
      plano.push({ r: S.r, d: dd, cor: ehProprio_(om) ? CFG.COR.LARANJA : CFG.COR.AZUL });
    });
    relEsc.push({ rotulo: m.rotulo, gac: laranja, outra: azul.length });
    texto.push('▸ ' + m.rotulo + ': 21º GAC em ' + laranja.length + ' dia(s)' + (laranja.length ? ' (' + laranja.join(', ') + ')' : '') + ' · outra unidade em ' + azul.length + '.');
  });

  /* tipo do dia (PRETA/VERM) x aba */
  var diverge = [];
  if (A.topo != null) {
    dias.forEach(function (dd) {
      var vermAba = String(A.bgs[A.topo + 1][colDia_(dd)]).toLowerCase() === CFG.COR.VERMELHO;
      var vermFonte = porDia[dd].tipo === 'VERM';
      if (vermAba !== vermFonte) diverge.push({ d: dd, fonte: vermFonte });
    });
  }
  if (diverge.length) {
    texto.push('\n⚠ TIPO DO DIA DIVERGENTE (' + diverge.length + '): ' + diverge.map(function (x) {
      return x.d + ' (Guarnição: ' + (x.fonte ? 'VERM' : 'PRETA') + ', aba: ' + (x.fonte ? 'preta' : 'vermelha') + ')';
    }).join('; ') +
      '\nEscolha "refazer fórmulas" (ajusta as colunas e recalcula as folgas) ou "manter os tipos atuais".');
  }

  var qgInfo = A.blocos.filter(function (B) { return B.kind === 'qg'; }).map(function (B) { return B.titulo; });
  if (qgInfo.length) texto.push('\nBlocos QG AD/1 que serão ajustados: ' + qgInfo.join(', ') + '.');
  if (avisos.length) texto.push('\n⚠ ' + avisos.join('\n⚠ '));

  var qgRel = null;
  if (aplicar) {
    if (diverge.length && opcoes.tipos !== 'refazer' && opcoes.tipos !== 'manter') {
      throw new Error('Há dias com tipo divergente. Escolha "refazer fórmulas" ou "manter os tipos atuais" e aplique de novo.');
    }
    var porCor = {};
    plano.forEach(function (p) { (porCor[p.cor] = porCor[p.cor] || []).push(a1_(p.r, colDia_(p.d))); });
    Object.keys(porCor).forEach(function (cor) { sh.getRangeList(porCor[cor]).setBackground(cor).setFontColor(CFG.COR.BRANCO); });
    if (A.topo != null) {
      var topo = dias.map(function (dd) { return a1_(A.topo, colDia_(dd)); });
      sh.getRangeList(topo).setBackground(CFG.COR.AZUL).setFontColor(CFG.COR.BRANCO);
    }
    SpreadsheetApp.flush();
    if (diverge.length && opcoes.tipos === 'refazer') refazerTipos_(sh, A, diverge);
    var qg = ajustarBlocosQG_(sh);
    qgRel = qg;
    texto.push('\n✅ APLICADO' + (qg ? ' — ' + qg.texto : '') + '.');
  } else texto.unshift('🔎 VERIFICAÇÃO (nada foi alterado)\n');
  SpreadsheetApp.flush();
  return {
    texto: texto.join('\n'), divergencias: diverge.length,
    rel: {
      aplicado: !!aplicar, aba: destNome, mes: CFG.MESES_EXT[A.mes] + '/' + A.ano, dias: dias.length, totalDias: n, escalas: relEsc,
      diverge: diverge.map(function (x) { return { d: x.d, fonte: x.fonte ? 'vermelha' : 'preta', aba: x.fonte ? 'preta' : 'vermelha' }; }),
      tipos: aplicar ? (opcoes.tipos || '') : '', avisos: avisos, qgBlocos: qgInfo, qg: qgRel
    }
  };
}

/** Ajusta cabeçalhos de dia (vermelho/cinza) e recalcula as fórmulas de folga com os novos tipos. */
function refazerTipos_(sh, A, diverge) {
  var F1 = colDia_(1) + 1;
  var linhasSemana = [];
  if (A.topo != null) linhasSemana.push(A.topo + 1);
  A.blocos.forEach(function (B) { linhasSemana.push(B.wk); });
  var verm = [], cinza = [];
  diverge.forEach(function (x) {
    linhasSemana.forEach(function (r) { (x.fonte ? verm : cinza).push(a1_(r, colDia_(x.d))); });
  });
  if (verm.length) sh.getRangeList(verm).setBackground(CFG.COR.VERMELHO);
  if (cinza.length) sh.getRangeList(cinza).setBackground(CFG.COR.CINZA_DIA);
  /* fundo neutro das células do corpo acompanha o novo tipo */
  var vr = [], br = [];
  A.blocos.forEach(function (B) {
    B.rows.forEach(function (R) {
      diverge.forEach(function (x) {
        var c = colDia_(x.d), bg = String(A.bgs[R.r][c]).toLowerCase();
        if (bg === CFG.COR.BRANCO || bg === CFG.COR.VERMELHO) (x.fonte ? vr : br).push(a1_(R.r, c));
      });
    });
  });
  if (vr.length) sh.getRangeList(vr).setBackground(CFG.COR.VERMELHO);
  if (br.length) sh.getRangeList(br).setBackground(CFG.COR.BRANCO);
  SpreadsheetApp.flush();
  var A2 = lerAba_(sh, A.mes, A.ano), grupos = {}, avulsas = [];
  A2.blocos.forEach(function (B, bi) {
    B.rows.forEach(function (R, ri) {
      for (var d = 1; d <= A2.nDias; d++) {
        var c = colDia_(d);
        if (A2.forms[R.r][c] === '' || num_(A2.vals[R.r][c]) === 0 || ehTexto_(A2, R.r, c)) continue;
        var f = formulaFolga_(A2, B, R, d);
        if (!f) continue;
        if (f.r1c1) (grupos[f.r1c1] = grupos[f.r1c1] || []).push(a1_(R.r, c)); else avulsas.push({ a1: a1_(R.r, c), f: f.a1 });
      }
    });
  });
  Object.keys(grupos).forEach(function (f) { sh.getRangeList(grupos[f]).setFormulaR1C1(f); });
  avulsas.forEach(function (x) { sh.getRange(x.a1).setFormula(x.f); });
}

/** Blocos QG AD/1: fórmula de folga nos dias laranja da escala correspondente; some nos dias azuis. */
function ajustarBlocosQG_(sh) {
  var A = lerAba_(sh), grupos = {}, avulsas = [], limpar = [], cores = {}, novos = 0, removidos = 0, preservados = 0;
  A.blocos.forEach(function (B) { /* blocos comuns (ex.: CMT GD) com cabeçalho cinza: colore pela linha-resumo correspondente */
    if (B.kind === 'qg' || String(A.bgs[B.hdr][colDia_(1)]).toLowerCase() !== CFG.COR.CINZA_CAB) return;
    var base = semAcento_(B.titulo).trim(), S = null;
    A.resumo.forEach(function (x) { if (!S && semAcento_(x.label).replace(/\s*GRAGOATA\s*$/, '').trim() === base) S = x; });
    if (!S) return;
    for (var dc = 1; dc <= A.nDias; dc++) {
      var lar = String(A.bgs[S.r][colDia_(dc)]).toLowerCase() === CFG.COR.LARANJA;
      sh.getRange(B.hdr + 1, colDia_(dc) + 1).setBackground(lar ? CFG.COR.LARANJA : CFG.COR.AZUL).setFontColor(CFG.COR.BRANCO);
    }
  });
  A.blocos.forEach(function (B) {
    if (B.kind !== 'qg') return;
    /* dias do cabeçalho: laranja = 21º GAC, azul = outra unidade */
    for (var dh = 1; dh <= A.nDias; dh++) sh.getRange(B.hdr + 1, colDia_(dh) + 1).setBackground(B.gac[dh] ? CFG.COR.LARANJA : CFG.COR.AZUL).setFontColor(CFG.COR.BRANCO);
    B.rows.forEach(function (R) {
      for (var d = 1; d <= A.nDias; d++) {
        var c = colDia_(d), forma = A.forms[R.r][c], val = A.vals[R.r][c], a1 = a1_(R.r, c), vazio = forma === '' && val === '';
        var verm = vermelho_(A, B, d), bg = String(A.bgs[R.r][c]).toLowerCase();
        var neutra = [CFG.COR.BRANCO, CFG.COR.VERMELHO, CFG.COR.QG_PRETA, CFG.COR.QG_VERM, ''].indexOf(bg) >= 0;
        if (B.gac[d] || B.todosDias) {
          if (vazio) {
            var f = formulaFolga_(A, B, R, d);
            if (!f) f = { a1: '=1' };
            if (f.r1c1) (grupos[f.r1c1] = grupos[f.r1c1] || []).push(a1); else avulsas.push({ a1: a1, f: f.a1 });
            novos++;
          }
        } else if (forma !== '' && num_(val) !== 0) { limpar.push(a1); removidos++; }
        else if (val === 0 || num_(val) === 0) preservados++;
        /* dia de outra unidade: azul-claro (escala preta) / rosa (vermelha); dia do 21º GAC volta ao branco/vermelho */
        if (neutra) {
          var alvo = B.gac[d] ? (verm ? CFG.COR.VERMELHO : CFG.COR.BRANCO) : (verm ? CFG.COR.QG_VERM : CFG.COR.QG_PRETA);
          if (alvo !== bg) (cores[alvo] = cores[alvo] || []).push(a1);
        }
      }
    });
  });
  Object.keys(grupos).forEach(function (f) { sh.getRangeList(grupos[f]).setFormulaR1C1(f); });
  avulsas.forEach(function (x) { sh.getRange(x.a1).setFormula(x.f); });
  if (limpar.length) sh.getRangeList(limpar).clearContent();
  Object.keys(cores).forEach(function (cor) { sh.getRangeList(cores[cor]).setBackground(cor); });
  SpreadsheetApp.flush();
  return { novos: novos, removidos: removidos, preservados: preservados, texto: 'QG AD/1: ' + novos + ' célula(s) de folga criada(s), ' + removidos + ' limpa(s) em dia de outra unidade' +
    (preservados ? ', ' + preservados + ' "0" mantido(s) em dia azul (confira)' : '') };
}

/* ============================================================ CAIXA */
function htmlImportacao_(modo, destino) {
  var drive = modo === 'drive';
  var abasG = ss_().getSheets().map(function (x) { return x.getName(); }).filter(function (n) { var x = nomeAba_(n); return x && x.tipo === CFG.TIPO_GRAD; });
  if (abasG.indexOf(destino) < 0) abasG.unshift(destino);
  var cab = '<style>.ban{border-radius:10px;padding:8px 12px;margin:4px 0 8px}.okb{background:#e6f4ea;color:#137333}.inf{background:#e8f0fe;color:#174ea6}.lar{display:inline-block;min-width:22px;text-align:center;border-radius:10px;background:#ff9900;color:#fff;font-weight:600;padding:0 6px}</style>' +
    '<h3 style="margin-top:0">Importar escala da Guarnição</h3>' +
    '<div class="bar"><b class="lb" style="min-width:0">Aba de destino</b><select id="dest" onchange="DEST=this.value;google.script.run.apiAbaDestino(DEST)">' +
    abasG.map(function (n) { return '<option' + (n === destino ? ' selected' : '') + '>' + esc_(n) + '</option>'; }).join('') + '</select></div>';
  var origem = drive ?
    '<label>Planilha da Guarnição (URL):<br><input type="text" id="url" style="width:100%" value="' + esc_(CFG.URL_GUARNICAO) + '"></label>' :
    '<label>Arquivo (PDF, xlsx, xls, ods ou csv): <input type="file" id="arq" accept=".pdf,.xlsx,.xls,.ods,.csv" onchange="leArquivo(this.files[0])"></label>' +
    '<small>O arquivo é lido no navegador; só o texto lido vai para a planilha. PDF escaneado (imagem) não funciona.</small>' +
    '<div id="tab" class="lista" style="max-height:280px"></div>';
  var scripts = drive ? '' :
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>' +
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>';
  var corpo = cab + origem +
    '<div id="opt" class="bar" style="display:none"><b class="lb" style="min-width:0">Tipo do dia divergente:</b><label class="chip"><input type="radio" name="tp" value="manter">manter os tipos atuais</label> ' +
    '<label class="chip"><input type="radio" name="tp" value="refazer">refazer fórmulas</label></div>' +
    '<button onclick="run(false)">Verificar</button><button class="p" onclick="run(true)">Aplicar</button><div id="out" style="margin-top:10px;white-space:pre-wrap"></div>' + JS_COMUM_ + scripts +
    '<script>var MODO="' + modo + '",DEST=' + JSON.stringify(destino) + ',LINHAS=[];' +
    'function opts(){var r=document.querySelector("input[name=tp]:checked");return{tipos:r?r.value:""}}' +
    'function resp(r){' +
    'var o=$("out");o.className="";o.style.whiteSpace="normal";var R=r.rel;' +
    'if(r.linhas){LINHAS=r.linhas}' +
    '$("opt").style.display=r.divergencias?"block":"none";' +
    'if(!R){o.style.whiteSpace="pre-wrap";o.textContent=r.texto;return}' +
    'var h="";' +
    'h+="<div class=\\"ban "+(R.aplicado?"okb":"inf")+"\\"><b>"+(R.aplicado?"✅ Escala aplicada":"🔎 Verificação — nada foi alterado")+"</b><br><span class=mu>"+esc(R.aba)+" · "+esc(R.mes)+(R.fonte?" · fonte: aba “"+esc(R.fonte)+"” da Guarnição":"")+"</span></div>";' +
    'h+="<div class=cards><div class=card><b>"+R.dias+"/"+R.totalDias+"</b><span>dias do mês com dado</span></div>";' +
    'h+="<div class=\\"card"+(R.diverge.length?" bad":"")+"\\"><b>"+R.diverge.length+"</b><span>dia(s) com tipo divergente</span></div>";' +
    'if(R.qg)h+="<div class=card><b>"+R.qg.novos+"</b><span>folga(s) criada(s) no QG</span></div>";' +
    'else h+="<div class=card><b>"+R.qgBlocos.length+"</b><span>bloco(s) QG a ajustar</span></div>";' +
    'h+="</div>";' +
    'h+="<table><tr><th>Escala</th><th>21º GAC</th><th>%</th><th>OUTRAS OM</th><th>Dias do 21º GAC</th></tr>";' +
    'R.escalas.forEach(function(e){h+="<tr><td><b>"+esc(({"OF DIA GRAGOATA":"OF DIA QG","CMT GD GRAGOATA":"CMT GD QG","CB GD GRAGOATA":"CB GD QG","GD GRAGOATA":"SD GD QG AD","MOTORISTA A POMN":"MOTORISTA À POMN"})[e.rotulo]||e.rotulo)+"</b></td><td><span class=lar>"+e.gac.length+"</span></td><td class=num>"+Math.round(100*e.gac.length/Math.max(1,e.gac.length+e.outra))+"%</td><td class=mu>"+e.outra+"</td><td class=mu>"+(e.gac.length?esc(e.gac.join(", ")):"—")+"</td></tr>"});' +
    'h+="</table>";' +
    'if(R.diverge.length){h+="<details open><summary class=erro>⚠ Tipo do dia divergente ("+R.diverge.length+")</summary><ul>";' +
    'R.diverge.forEach(function(x){h+="<li>Dia "+x.d+": Guarnição = escala "+x.fonte+", aba = escala "+x.aba+"</li>"});' +
    'h+="</ul><p class=mu>Escolha abaixo “refazer fórmulas” (ajusta as colunas e recalcula as folgas) ou “manter os tipos atuais” e aplique de novo.</p></details>"}' +
    'if(R.qg){h+="<details><summary>QG AD/1 — resultado</summary><ul><li>"+R.qg.novos+" célula(s) de folga criada(s)</li><li>"+R.qg.removidos+" limpa(s) em dia de outra unidade</li>"+(R.qg.preservados?"<li>"+R.qg.preservados+" “0” mantido(s) em dia de outra unidade (confira)</li>":"")+"</ul><p class=mu>Blocos: "+esc(R.qgBlocos.join(", "))+"</p></details>"}' +
    'else if(R.qgBlocos.length){h+="<p class=mu>Blocos QG AD/1 que serão ajustados: "+esc(R.qgBlocos.join(", "))+".</p>"}' +
    'if(R.avisos.length){h+="<details><summary>⚠ Avisos ("+R.avisos.length+")</summary><ul>";R.avisos.forEach(function(a){h+="<li>"+esc(a)+"</li>"});h+="</ul></details>"}' +
    'if(R.aplicado)h+="<button class=p onclick=\\"google.script.host.close()\\">Concluir</button>";' +
    'o.innerHTML=h;o.scrollIntoView&&o.scrollIntoView({block:"nearest"})}' +
    (drive ?
      'function run(ap){$("out").textContent="Lendo a planilha da Guarnição…";google.script.run.withSuccessHandler(resp).withFailureHandler(falha).apiImportarDrive(DEST,$("url").value,opts(),ap)}' :
      'function run(ap){var l=coleta();if(!l.length){falha("Carregue um arquivo primeiro.");return}$("out").textContent="Processando…";google.script.run.withSuccessHandler(resp).withFailureHandler(falha).apiImportarLinhas(DEST,l,opts(),ap)}' +
      'function leArquivo(f){if(!f)return;$("out").textContent="Lendo arquivo…";var n=f.name.toLowerCase();' +
      'if(n.slice(-4)===".pdf"){lePdf(f)}else{var rd=new FileReader();rd.onload=function(e){try{var wb=XLSX.read(e.target.result,{type:"array",cellDates:false});' +
      'var ws=wb.Sheets[wb.SheetNames[0]];monta(parse(XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:""})))}catch(x){falha(x)}};rd.readAsArrayBuffer(f)}}' +
      'function lePdf(f){pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";var rd=new FileReader();' +
      'rd.onload=function(e){pdfjsLib.getDocument({data:new Uint8Array(e.target.result)}).promise.then(function(pdf){var ps=[];for(var i=1;i<=pdf.numPages;i++)ps.push(pdf.getPage(i).then(function(p){return p.getTextContent()}));' +
      'return Promise.all(ps)}).then(function(pgs){var rows=[];pgs.forEach(function(tc){rows=rows.concat(paginaPdf(tc.items))});monta(rows)}).catch(falha)};rd.readAsArrayBuffer(f)}' +
      'function mediana(a){a=a.slice().sort(function(x,y){return x-y});return a.length?a[Math.floor(a.length/2)]:0}' +
      'function paginaPdf(items){var it=[];items.forEach(function(i){var s=(i.str||"").trim();if(s)it.push({s:s,x:i.transform[4],y:i.transform[5],cx:i.transform[4]+(i.width||0)/2})});' +
      'var rd=/^\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}$/;var ds=it.filter(function(i){return rd.test(i.s)}).sort(function(a,b){return b.y-a.y});if(!ds.length)return[];' +
      'var hs=[];for(var k=1;k<ds.length;k++)hs.push(ds[k-1].y-ds[k].y);var h=mediana(hs)||20;' +
      'var tp=it.filter(function(i){return /^(PRETA|VERM)/i.test(i.s)});var xT=mediana(tp.map(function(i){return i.cx}));var dados=[];' +
      'it.forEach(function(i){if(!(i.cx>xT+15))return;var b=-1,d=1e9;ds.forEach(function(x,j){var dd=Math.abs(x.y-i.y);if(dd<d){d=dd;b=j}});if(d<=h/2+1){i.b=b;dados.push(i)}});' +
      'var cs=dados.map(function(i){return i.cx}).sort(function(a,b){return a-b}),gaps=[];for(var k=1;k<cs.length;k++)gaps.push({g:cs[k]-cs[k-1],at:(cs[k]+cs[k-1])/2});' +
      'gaps.sort(function(a,b){return b.g-a.g});var cuts=gaps.slice(0,4).map(function(g){return g.at}).sort(function(a,b){return a-b});' +
      'function col(cx){var k=0;while(k<cuts.length&&cx>cuts[k])k++;return k}' +
      'return ds.map(function(d,j){var cel=[[],[],[],[],[]];dados.forEach(function(i){if(i.b===j)cel[col(i.cx)].push(i)});' +
      'var tipo=tp.filter(function(t){return Math.abs(t.y-d.y)<=h/2+1})[0];var p=d.s.split("/"),a=parseInt(p[2],10);if(a<100)a+=2000;' +
      'return{dia:parseInt(p[0],10),mes:parseInt(p[1],10)-1,ano:a,tipo:tipo&&/VERM/i.test(tipo.s)?"VERM":"PRETA",cols:cel.map(function(c){c.sort(function(a,b){return b.y-a.y||a.x-b.x});return c.map(function(i){return i.s}).join(" ")})}})}' +
      'function parse(aoa){var out=[];aoa.forEach(function(r){r=r.map(function(x){return x==null?"":String(x).trim()});var di=-1;for(var i=0;i<r.length;i++)if(/^\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}$/.test(r[i])){di=i;break}if(di<0)return;' +
      'var ti=-1;for(var j=di+1;j<r.length;j++)if(/PRETA|VERM/i.test(r[j])){ti=j;break}if(ti<0)return;var p=r[di].split("/"),a=parseInt(p[2],10);if(a<100)a+=2000;' +
      'out.push({dia:parseInt(p[0],10),mes:parseInt(p[1],10)-1,ano:a,tipo:/VERM/i.test(r[ti])?"VERM":"PRETA",cols:[0,1,2,3,4].map(function(k){return r[ti+1+k]||""})})});return out}' +
      'function monta(l){LINHAS=l;if(!l.length){falha("Nenhuma linha com data e PRETA/VERM foi reconhecida. Se for PDF escaneado, use a planilha.");return}' +
      'var h="<table><tr><th>Data</th><th>Tipo</th><th>OF DIA</th><th>CMT GD</th><th>CB GD</th><th>SENTINELAS</th><th>MOT AMB</th></tr>";' +
      'l.forEach(function(x,i){h+="<tr><td>"+("0"+x.dia).slice(-2)+"/"+("0"+(x.mes+1)).slice(-2)+"</td><td><select id=t"+i+"><option"+(x.tipo==="PRETA"?" selected":"")+">PRETA</option><option"+(x.tipo==="VERM"?" selected":"")+">VERM</option></select></td>";' +
      'x.cols.forEach(function(c,k){h+="<td><input type=text id=c"+i+"_"+k+" style=\\"width:110px;"+(/21\\W{0,3}GAC/i.test(c)?"background:#ffd699":"")+"\\" value=\\""+esc(c).replace(/\\"/g,"&quot;")+"\\"></td>"});h+="</tr>"});$("tab").innerHTML=h+"</table>";$("out").textContent=l.length+" dia(s) lido(s). Corrija o que precisar e clique em Verificar."}' +
      'function coleta(){return LINHAS.map(function(x,i){var c=[0,1,2,3,4].map(function(k){return $("c"+i+"_"+k)?$("c"+i+"_"+k).value:""});return{dia:x.dia,mes:x.mes,ano:x.ano,tipo:$("t"+i)?$("t"+i).value:x.tipo,cols:c}})}') +
    '</script>';
  return corpo;
}
