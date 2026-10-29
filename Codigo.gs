/**
 * MÓDULO BRIGADA 1.0 — Codigo.gs
 * Menu, configuração, leitura da estrutura da planilha, manual (Sobre) e verificação.
 * Complemento: Modulo_Escala.gs (Confecção e Abas mensais).
 *
 * Planilha: "Escala do 21º GAC"  |  Abas: "<Mês> Grad" e "<Mês> Cndt e Praia".
 */

/* ============================================================ CONFIGURAÇÃO */
var CFG = {
  VERSAO: '1.0',
  COL_DIA1: 5, /* índice 0-based da coluna F (dia 1) */
  FOLGA_MIN_H: 48, /* intervalo mínimo entre dois serviços (horas) */
  CB_DIA_PADRAO: 4, /* vagas padrão do bloco "CB DIA" */
  HORA_GATILHO: 7,
  MESES: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
  MESES_EXT: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto',
              'setembro', 'outubro', 'novembro', 'dezembro'],
  DIAS: ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'],
  TIPO_GRAD: 'Grad',
  TIPO_CNDT: 'Cndt e Praia',
/* Cores fixas (não existem na legenda) */
  COR: {
    SERVICO: '#ffff00', OUTRA: '#00ff00', LARANJA: '#ff9900', AZUL: '#0000ff', QG_PRETA: '#c9daf8', QG_VERM: '#ea9999',
    CINZA_CAB: '#999999', CINZA_DIA: '#cccccc', VERMELHO: '#ff0000', BRANCO: '#ffffff',
    PRETO: '#000000', SEM_FOLGA: '#c0504d'
  },
/* Usadas só se a legenda da aba não for encontrada */
  LEGENDA_PADRAO: {
    servico: { bg: '#ffff00', fg: '#000000' },
    outra: { bg: '#00ff00', fg: '#000000' },
    gragoata: { bg: '#ff9900', fg: '#000000' },
    ferias: { bg: '#93c47d', fg: '#000000' },
    missao: { bg: '#274e13', fg: '#00ff00' },
    licenca: { bg: '#1155cc', fg: '#00ffff' },
    baixado: { bg: '#9900ff', fg: '#ffffff' },
    concurso: { bg: '#ff00ff', fg: '#000000' },
    exame: { bg: '#ff9900', fg: '#783f04' },
    fora: { bg: '#000000', fg: '#ffffff' },
    apres: { bg: '#999999', fg: '#000000' }
  },
/* Feriados nacionais fixos (MM-DD). Móveis/locais: use FERIADOS_EXTRAS (AAAA-MM-DD). */
  FERIADOS_FIXOS: ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'],
  FERIADOS_EXTRAS: [],
  GRADUACOES: ['STEN', '1º SGT', '2º SGT', '3º SGT', 'CB', 'SD EP', 'SD EV'],
  SUBUNIDADES: ['BC', '1ª BO', '2ª BO', 'DMSF'],
  URL_GUARNICAO: 'https://docs.google.com/spreadsheets/d/1Cp7rYlV_l4cOC-GnMw2vhQr2pLubqG7xX9YvPRnc6IU/edit'
};

/* ============================================================ MENU */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Módulo Brigada')
    .addSubMenu(ui.createMenu('✏️ Confecção')
      .addItem('Adicionar serviços', 'mnuAdicionarServicos')
      .addItem('Retirar serviços', 'mnuRetirarServicos')
      .addItem('Adicionar afastamento', 'mnuAdicionarAfastamento')
      .addItem('Adicionar militar', 'mnuAdicionarMilitar'))
    .addSubMenu(ui.createMenu('📅 Prévia Semanal')
      .addItem('Atualizar prévia', 'mnuAtualizarPrevia')
      .addItem('Adicionar prévia', 'mnuAdicionarPrevia')
      .addItem('Definir horário da parada diária', 'mnuDefinirParada'))
    .addSubMenu(ui.createMenu('🗂️ Abas Mensais')
      .addItem('Criar abas do próximo mês', 'mnuCriarAbasProximoMes')
      .addSubMenu(ui.createMenu('📥 Importar Escala')
        .addItem('Importar via Google Drive', 'mnuImportarDrive')
        .addItem('Importar via documento', 'mnuImportarDocumento'))
      .addItem('Configuração de Gatilho Automático', 'mnuConfigGatilho'))
    .addSubMenu(ui.createMenu('🔍 Auditagem do Sistema')
      .addItem('📊 Verificação de serviços tirados', 'mnuQuantitativo')
      .addItem('✅ Verificação do sistema', 'mnuVerificarSistema'))
    .addSeparator()
    .addItem('ℹ️ Sobre o Módulo Brigada ' + CFG.VERSAO, 'mnuSobre')
    .addToUi();
}

/* Fase 2 (em desenvolvimento) */
function emDesenvolvimento_(nome) {
  SpreadsheetApp.getUi().alert('Módulo Brigada',
    nome + ' ainda está em desenvolvimento (fase 2 do projeto).', SpreadsheetApp.getUi().ButtonSet.OK);
}

/* ============================================================ UTILITÁRIOS */
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function norm_(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toUpperCase(); }

function semAcento_(s) { return norm_(s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }

function colLetra_(c) { /* c 0-based -> "A", "AJ" */
  var s = '';
  c++;
  while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); }
  return s;
}

function a1_(r, c) { return colLetra_(c) + (r + 1); }

function num_(v) {
  if (typeof v === 'number') return v;
  if (v === '' || v == null || v instanceof Date) return null;
  var n = Number(v);
  return isNaN(n) ? null : n;
}

function nomeAba_(nome) {
  var m = /^(Jan|Fev|Mar|Abr|Mai|Jun|Jul|Ago|Set|Out|Nov|Dez) (Grad|Cndt e Praia)$/.exec(nome);
  return m ? { mes: CFG.MESES.indexOf(m[1]), tipo: m[2] } : null;
}

function fmtData_(d) { return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy'); }
function isoData_(d) { return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function parseIso_(s) { var p = String(s).split('-'); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); }

function ehFeriado_(dt) {
  var iso = isoData_(dt);
  return CFG.FERIADOS_FIXOS.indexOf(iso.substring(5)) >= 0 || CFG.FERIADOS_EXTRAS.indexOf(iso) >= 0;
}
function ehVermelhoData_(dt) { var w = dt.getDay(); return w === 0 || w === 6 || ehFeriado_(dt); }

function mesesDasAbas_() { /* [{mes, tipos:[..]}] na ordem em que aparecem */
  var vistos = {}, out = [];
  ss_().getSheets().forEach(function (sh) {
    var n = nomeAba_(sh.getName());
    if (!n) return;
    if (!vistos[n.mes]) { vistos[n.mes] = { mes: n.mes, id: CFG.MESES[n.mes], tipos: [] }; out.push(vistos[n.mes]); }
    vistos[n.mes].tipos.push(n.tipo);
  });
  return out;
}

/* ============================================================ LEGENDA */
function lerLegenda_(sh) {
  var L = JSON.parse(JSON.stringify(CFG.LEGENDA_PADRAO));
  var lr = sh.getLastRow();
  if (lr < 2) return L;
  var colD = sh.getRange(1, 4, lr, 1).getValues();
  var ini = -1;
  for (var i = 0; i < colD.length; i++) if (norm_(colD[i][0]) === 'LEGENDA') { ini = i; break; }
  if (ini < 0) return L;
  var n = Math.min(20, lr - ini - 1), lidas = {};
  var rg = sh.getRange(ini + 2, 4, n, 2);
  var vals = rg.getValues(), bgs = rg.getBackgrounds(), fgs = rg.getFontColors();
  for (var k = 0; k < n; k++) {
    var rot = semAcento_(vals[k][1]);
    if (!rot) break;
    var key = null;
    /* início do rótulo (e não "contém"): "INCLUIR NO PLANO DE FÉRIAS" não pode valer como FÉRIAS */
    if (rot === 'SV') key = 'servico';
    else if (rot.indexOf('SV EM OUTRA ESCALA') === 0) key = 'outra';
    else if (rot.indexOf('SV GRAGOATA') === 0) key = 'gragoata';
    else if (rot.indexOf('FERIAS') === 0) key = 'ferias';
    else if (rot.indexOf('MISSAO') === 0) key = 'missao';
    else if (rot.indexOf('LICENCA') === 0) key = 'licenca';
    else if (rot.indexOf('BAIXADO') === 0) key = 'baixado';
    else if (rot.indexOf('CONCURSO') === 0) key = 'concurso';
    else if (rot.indexOf('EXAME') === 0) key = 'exame';
    else if (rot.indexOf('FORA DA ESCALA') === 0) key = 'fora';
    else if (rot.indexOf('APRESENTA') === 0) key = 'apres';
    if (key && lidas[key]) key = null; /* vale a primeira ocorrência */
    if (key) lidas[key] = true;
    if (key) L[key] = { bg: bgs[k][0].toLowerCase(), fg: fgs[k][0].toLowerCase() };
  }
  return L;
}

/* ============================================================ LEITURA DA ABA */
/**
 * Lê uma aba mensal e devolve a estrutura:
 * { sh, nome, tipo, mes, ano, nDias, vals, forms, bgs, fgs, leg, topo, gac[], blocos[] }
 * bloco = { titulo, hdr, wk, kind, rows:[{r,key,nome,sub}] }   (índices 0-based)
 * kind: 'dia' | 'qg' (só dias laranja) | 'par3' (Condutor: ter-qua, qui-sex, sáb-dom) | 'par1' (Praia: sáb-dom)
 */
function lerAba_(sh, mes, ano) {
  var nm = nomeAba_(sh.getName());
  if (!nm) throw new Error('Aba "' + sh.getName() + '" não segue o padrão "<Mês> Grad" / "<Mês> Cndt e Praia".');
  var lr = sh.getLastRow(), lc = Math.max(sh.getLastColumn(), CFG.COL_DIA1 + 1);
  var rg = sh.getRange(1, 1, lr, lc);
  var A = {
    sh: sh, nome: sh.getName(), tipo: nm.tipo, mes: mes == null ? nm.mes : mes,
    vals: rg.getValues(), forms: rg.getFormulas(), bgs: rg.getBackgrounds(), fgs: rg.getFontColors()
  };
  A.leg = lerLegenda_(sh);
  var hdrs = achaCabecalhos_(A);
  A.ano = ano || inferirAno_(A, hdrs);
  A.nDias = new Date(A.ano, A.mes + 1, 0).getDate();
  A.topo = null;
  A.blocos = [];
  hdrs.forEach(function (h) {
    if (!h.titulo) { if (!A.topo) A.topo = h.r; return; }
    var B = { titulo: h.titulo, hdr: h.r, wk: h.r + 1, rows: [] };
    var tu = semAcento_(h.titulo);
    B.kind = tu.indexOf('CONDUTOR') >= 0 ? 'par3' : tu.indexOf('PRAIA') >= 0 ? 'par1' : tu.indexOf('QG AD/1') >= 0 ? 'qg' : 'dia';
    for (var x = h.r + 2; x < lr; x++) {
      var e = A.vals[x][4];
      if (e === '' || e == null || String(e).trim() === '') break;
      B.rows.push({ r: x, key: norm_(e), nome: String(e).trim(), sub: String(A.vals[x][3]).trim() });
    }
    if (B.rows.length) A.blocos.push(B);
  });
  A.gac = {};
  for (var d = 1; d <= A.nDias; d++) {
    A.gac[d] = A.topo != null && String(A.bgs[A.topo][CFG.COL_DIA1 + d - 1]).toLowerCase() === CFG.COR.LARANJA;
  }
  /* linhas-resumo do topo (OF DIA GRAGOATÁ, CMT GD GRAGOATÁ...): laranja = dia do 21º GAC na escala da Guarnição */
  A.resumo = [];
  var pb = A.blocos.length ? A.blocos[0].hdr : A.vals.length;
  if (A.topo != null) {
    for (var i = A.topo + 2; i < pb; i++) {
      if (diaDe_(A.vals[i][CFG.COL_DIA1]) == null) continue;
      var lab = '';
      for (var cc = 0; cc <= 4 && !lab; cc++) lab = norm_(A.vals[i][cc]);
      if (lab) A.resumo.push({ r: i, label: lab });
    }
  }
  A.blocos.forEach(function (B) {
    if (B.kind !== 'qg') return;
    var base = baseResumo_(B.titulo);
    B.gacRow = null;
    A.resumo.forEach(function (S) {
      if (B.gacRow == null && baseResumo_(S.label) === base) B.gacRow = S.r;
    });
    B.gac = {};
    B.todosDias = /^(CB|SD) GD/.test(semAcento_(B.titulo)); /* CB GD e SD GD (QG): a folga conta em todos os dias, mesmo nos que não são do 21º GAC */
    for (var dd = 1; dd <= A.nDias; dd++) {
      B.gac[dd] = B.gacRow != null ? String(A.bgs[B.gacRow][colDia_(dd)]).toLowerCase() === CFG.COR.LARANJA : !!A.gac[dd];
    }
    /* o cabeçalho do próprio bloco (laranja = serviço do 21º GAC, azul = outra unidade) manda; se ainda estiver cinza (Guarnição não importada), vale a linha-resumo */
    B.gacResumo = {}; for (var dr = 1; dr <= A.nDias; dr++) B.gacResumo[dr] = B.gac[dr]; /* só pela linha-resumo (usado pela importação) */
    var nLar = 0, nAzul = 0;
    for (var dh = 1; dh <= A.nDias; dh++) {
      var hb = String(A.bgs[B.hdr][colDia_(dh)]).toLowerCase();
      if (hb === CFG.COR.LARANJA) nLar++; else if (hb === CFG.COR.AZUL) nAzul++;
    }
    if (nLar + nAzul > 0) for (var d3 = 1; d3 <= A.nDias; d3++) B.gac[d3] = String(A.bgs[B.hdr][colDia_(d3)]).toLowerCase() === CFG.COR.LARANJA;
  });
  return A;
}

/** chave de uma linha-resumo do topo / título de bloco QG: aceita "OF DIA GRAGOATÁ" (antigo) e "OF DIA QG" (atual); "SD GD" = "GD" */
function baseResumo_(txt) {
  var b = semAcento_(txt).replace(/\s*QG AD\/1\s*$/, '').replace(/\s*(GRAGOATA|QG)\s*$/, '').trim();
  return b === 'SD GD' ? 'GD' : b;
}

function diaDe_(v) { /* célula de cabeçalho -> nº do dia (aceita Date) */
  if (v instanceof Date) return v.getDate();
  return num_(v);
}

function achaCabecalhos_(A) {
  var out = [], n = A.vals.length;
  for (var r = 0; r < n - 1; r++) {
    if (diaDe_(A.vals[r][CFG.COL_DIA1]) !== 1) continue;
    if (CFG.DIAS.indexOf(String(A.vals[r + 1][CFG.COL_DIA1]).trim().toLowerCase()) < 0) continue;
    var partes = [];
    for (var c = 2; c <= 4; c++) { var t = norm_(A.vals[r][c]); if (t) partes.push(t); }
    out.push({ r: r, titulo: partes.join(' ') });
  }
  return out;
}

function inferirAno_(A, hdrs) {
  for (var r = 0; r < Math.min(A.vals.length, 12); r++)
    for (var c = CFG.COL_DIA1; c < A.vals[r].length; c++)
      if (A.vals[r][c] instanceof Date) return A.vals[r][c].getFullYear();
  if (!hdrs.length) return new Date().getFullYear();
  var w = CFG.DIAS.indexOf(String(A.vals[hdrs[0].r + 1][CFG.COL_DIA1]).trim().toLowerCase());
  var hoje = new Date().getFullYear(), melhor = hoje, dist = 99;
  for (var y = hoje - 3; y <= hoje + 3; y++) {
    if (new Date(y, A.mes, 1).getDay() === w && Math.abs(y - hoje) < dist) { melhor = y; dist = Math.abs(y - hoje); }
  }
  return melhor;
}

/* ----- helpers de célula / dia */
function colDia_(d) { return CFG.COL_DIA1 + d - 1; }

function dataDia_(A, d) { return new Date(A.ano, A.mes, d); }

function vermelho_(A, B, d) {
  var bg = String(A.bgs[B.wk][colDia_(d)]).toLowerCase();
  if (bg === CFG.COR.VERMELHO) return true;
  if (bg === CFG.COR.CINZA_DIA || bg === CFG.COR.BRANCO) return false;
  return ehVermelhoData_(dataDia_(A, d));
}

function wd_(A, d) { return dataDia_(A, d).getDay(); }

function ehCabecaPar_(A, B, d) {
  var w = wd_(A, d);
  return B.kind === 'par3' ? (w === 2 || w === 4 || w === 6) : B.kind === 'par1' ? w === 6 : false;
}
function ehSegundoPar_(A, B, d) {
  var w = wd_(A, d);
  return B.kind === 'par3' ? (w === 3 || w === 5 || w === 0) : B.kind === 'par1' ? w === 0 : false;
}
function ehPar_(B) { return B.kind === 'par3' || B.kind === 'par1'; }

function ehTexto_(A, r, c) { /* célula com texto não numérico, ex.: "***" */
  var v = A.vals[r][c];
  return typeof v === 'string' && v.trim() !== '' && num_(v) == null;
}

function participa_(A, B, R, d) {
  if (B.kind === 'qg') return B.gac ? !!B.gac[d] : !!A.gac[d];
  var c = colDia_(d);
  return !(A.vals[R.r][c] === '' && A.forms[R.r][c] === '');
}

/** a folga conta neste dia? (nos blocos QG comuns só nos dias do 21º GAC; em CB GD e SD GD QG, em todos) */
function contaFolga_(A, B, R, d) { return B.kind === 'qg' && B.todosDias ? true : participa_(A, B, R, d); }

function classeCel_(A, r, c) {
  var bg = String(A.bgs[r][c]).toLowerCase(), fg = String(A.fgs[r][c]).toLowerCase(), L = A.leg;
  if (bg === L.exame.bg && fg === L.exame.fg) return 'afast';
  if (bg === L.outra.bg) return 'verde';
  /* cores neutras (dia útil, dia vermelho, serviço, Gragoatá, apresentação, cabeçalho) */
  var neutras = [CFG.COR.BRANCO, CFG.COR.VERMELHO, CFG.COR.CINZA_DIA, CFG.COR.CINZA_CAB, L.servico.bg, L.gragoata.bg, L.apres.bg, '#ffffff'];
  if (neutras.indexOf(bg) >= 0) return 'normal';
  /* qualquer outra cor de fundo (férias, licença, missão, baixado... mesmo fora da legenda) = afastamento */
  return 'afast';
}

/**
 * Vagas por dia escritas no título do bloco (linha acima do cabeçalho), ex.: "2 CB DIA" mesclado sobre os dias.
 * Retorna {dia: n}.
 */
function vagasDiaBloco_(A, B) {
  if (B._vd) return B._vd;
  var out = {};
  B._vd = out;
  if (B.hdr < 1) return out;
  var rx = new RegExp('^(\\d+)\\s+' + B.titulo.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&'));
  var F1 = colDia_(1) + 1, ocupados = {};
  try {
    A.sh.getRange(B.hdr, F1, 1, A.nDias).getMergedRanges().forEach(function (m) {
      var col = m.getColumn() - 5, v = norm_(A.vals[B.hdr - 1][m.getColumn() - 1]), mm = rx.exec(v);
      for (var k = 0; k < m.getNumColumns(); k++) ocupados[col + k] = true;
      if (mm) for (var j = 0; j < m.getNumColumns(); j++) out[col + j] = Number(mm[1]);
    });
  } catch (e) { /* sem mesclagem */ }
  for (var d = 1; d <= A.nDias; d++) {
    if (ocupados[d]) continue;
    var mm2 = rx.exec(norm_(A.vals[B.hdr - 1][colDia_(d)]));
    if (mm2) out[d] = Number(mm2[1]);
  }
  return out;
}

/** -1 = mês futuro, 0 = mês corrente, 1 = mês passado */
function posMes_(A) {
  var t = new Date(), a = t.getFullYear() * 12 + t.getMonth(), b = A.ano * 12 + A.mes;
  return b > a ? -1 : b < a ? 1 : 0;
}
function primeiroDiaAdicionar_(A) { var p = posMes_(A); return p < 0 ? 1 : p > 0 ? A.nDias + 1 : new Date().getDate() + 1; }
function primeiroDiaRetirar_(A) { var p = posMes_(A); return p < 0 ? 1 : p > 0 ? A.nDias + 1 : new Date().getDate(); }

function abaMesVizinho_(A, delta) { /* devolve a aba do mês anterior/seguinte do mesmo tipo (ou null) */
  var m = A.mes + delta, ano = A.ano;
  if (m < 0) { m = 11; ano--; } else if (m > 11) { m = 0; ano++; }
  return ss_().getSheetByName(CFG.MESES[m] + ' ' + A.tipo);
}

/* ============================================================ UI */
var CSS_ = '<style>*{box-sizing:border-box}body{font:13px/1.45 "Google Sans",Roboto,Arial,sans-serif;margin:14px 16px;color:#202124}' +
  'h2{font-size:17px;margin:18px 0 6px;color:#174ea6}h3{font-size:16px;margin:0 0 8px;color:#202124}p{margin:6px 0}ul{margin:4px 0 8px;padding-left:20px}li{margin:2px 0}' +
  'label{display:block;margin:4px 0}b.lb{display:inline-block;min-width:58px;color:#3c4043}' +
  'select,input[type=text],input[type=date],input[type=number]{padding:5px 8px;font:inherit;border:1px solid #dadce0;border-radius:8px;background:#fff}' +
  'select:focus,input:focus{outline:2px solid #1a73e8;outline-offset:-1px;border-color:#1a73e8}' +
  'button{padding:7px 16px;margin:10px 8px 0 0;font:inherit;font-weight:500;cursor:pointer;border:1px solid #dadce0;border-radius:18px;background:#fff;color:#1a73e8}' +
  'button:hover{background:#f1f6fe}button.p{background:#1a73e8;color:#fff;border-color:#1a73e8}button.p:hover{background:#1765cc}button:disabled{opacity:.5;cursor:default}' +
  '.bar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:6px 0}' +
  '.chip{display:inline-flex;align-items:center;gap:5px;border:1px solid #dadce0;border-radius:16px;padding:3px 11px;cursor:pointer;margin:0;font-size:12px;background:#fff}' +
  '.chip:has(input:checked){background:#e8f0fe;border-color:#1a73e8;color:#174ea6}.chip input{display:none}' +
  '.opt{display:flex;align-items:flex-start;gap:8px;margin:5px 0;cursor:pointer}.opt input{margin-top:3px;accent-color:#1a73e8}' +
  'details{border:1px solid #e0e0e0;border-radius:10px;margin:10px 0;padding:6px 12px}summary{cursor:pointer;font-weight:600;color:#3c4043;padding:2px 0}details[open] summary{margin-bottom:6px}' +
  '.cards{display:flex;gap:8px;margin:10px 0}.card{flex:1;border:1px solid #e0e0e0;border-radius:10px;padding:7px 12px}.card b{display:block;font-size:20px;color:#1a73e8}.card span{font-size:11px;color:#5f6368}.card.bad b{color:#b00020}' +
  'table{border-collapse:collapse;width:100%}td,th{padding:5px 7px;text-align:left;border-bottom:1px solid #f1f3f4;vertical-align:middle}tr:nth-child(even) td{background:#fafafa}' +
  'th{font-size:11px;color:#5f6368;text-transform:uppercase;border-bottom:2px solid #e0e0e0;background:#fff!important}' +
  'pre{background:#f8f9fa;border:1px solid #e8eaed;border-radius:10px;padding:10px 12px;white-space:pre-wrap;max-height:260px;overflow:auto;font:12px/1.5 Consolas,monospace;margin:10px 0 0}' +
  '.erro{color:#b00020}.ok{color:#137333}.mu{color:#80868b;font-size:11px}small{color:#5f6368}.num{font-weight:600}' +
  '.tb{height:8px;border-radius:4px;background:#1a73e8;display:inline-block;vertical-align:middle;margin-right:6px}' +
  '.lk{color:#1a73e8;cursor:pointer;font-size:12px;margin-right:10px}.lista{max-height:200px;overflow:auto;border:1px solid #e8eaed;border-radius:8px;padding:4px 8px}' +
  '.lista label{margin:3px 0}</style>';

function mostrarHtml_(corpo, titulo, w, h) {
  var html = HtmlService.createHtmlOutput(CSS_ + corpo).setWidth(w || 620).setHeight(h || 560);
  SpreadsheetApp.getUi().showModalDialog(html, titulo);
}

function esc_(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

/* ============================================================ SOBRE */
function mnuSobre() {
  var h = '' +
    '<h2>Módulo Brigada ' + CFG.VERSAO + '</h2>' +
    '<p>Conjunto de funções que auxilia o S/1 a organizar, confeccionar e conferir as escalas de serviço do 21º GAC na planilha ' +
    '“Escala do 21º GAC”. Tudo fica no menu <b>Módulo Brigada</b>, depois de “Ajuda”.</p>' +
    '<h3>Como a planilha é organizada</h3><ul>' +
    '<li>Uma aba por mês e tipo: “&lt;Mês&gt; Grad” e “&lt;Mês&gt; Cndt e Praia” (ex.: Out Grad).</li>' +
    '<li>Cada aba tem blocos (uma escala por bloco: OF DIA, CMT GD, CB GD, SD GD, PoMN, QG AD/1…), uma linha por militar e uma coluna por dia.</li>' +
    '<li>Colunas fixas: A (ano/rótulo), B (Cal/FRI), C (turma/nº de ordem), D (subunidade), E (graduação e nome). Os dias começam na coluna F.</li>' +
    '<li>Cada célula do dia guarda a <b>folga</b>: dias do mesmo tipo (escala preta ou vermelha — sáb, dom, feriado) sem tirar serviço. O “0” é o dia de serviço; nos dias seguintes a fórmula soma +1. Quem tem a maior folga é o próximo; empate = o mais moderno.</li>' +
    '<li>Cabeçalho do topo: laranja = dia do 21º GAC na escala da Guarnição; azul = outra unidade; cinza = ainda não carregado.</li></ul>' +
    '<h3>Regras que o módulo respeita</h3><ul>' +
    '<li>Adicionar serviços nunca mexe em dias até hoje; retirar vale de hoje em diante.</li>' +
    '<li>Folga mínima entre dois serviços do mesmo militar (em qualquer escala e entre meses): 48 h (padrão) = 2 dias livres (serviço no dia 14, primeiro dia possível 17).</li>' +
    '<li>Não escala quem está de afastamento, já de serviço em outra escala no dia, ou de serviço no dia anterior/seguinte (as duas últimas podem ser desligadas).</li>' +
    '<li>Nenhuma função apaga fórmula de folga por conta própria: o “0” volta a ser fórmula quando o serviço é retirado.</li></ul>' +
    '<h3>Cuidados gerais</h3><ul>' +
    '<li>Trabalhe primeiro numa cópia (Arquivo → Fazer uma cópia).</li>' +
    '<li>Não há “desfazer” próprio: use Ctrl+Z ou Arquivo → Histórico de versões.</li>' +
    '<li>Reexiba linhas ocultas antes de criar o mês seguinte.</li>' +
    '<li>Em meses grandes, aguarde: pode levar de alguns segundos a minutos.</li></ul>' +
    '<h2>✏️ Confecção</h2>' +
    '<h3>Adicionar serviços</h3><p>Escolhe quem cumpre cada serviço e marca o “0” (amarelo). Escolha o mês, as abas e as escalas; defina o período (padrão: de amanhã ao fim do mês) e as vagas por dia. ' +
    'Escolhido = maior folga do tipo do dia; empate = mais moderno. “Folga mínima” (horas) garante o intervalo. Use <b>Verificar</b> (mostra o que será feito) e depois <b>Aplicar</b>. ' +
    'Quem recebe um serviço ganha “0” verde nas outras escalas em que consta no dia. “0” em célula de afastamento (posterior) é refeito. ' +
    'CB DIA: padrão 4 vagas; se o título do bloco (linha acima do cabeçalho) tiver “2 CB DIA”, vale essa quantidade. Blocos QG AD/1 só têm vaga em dias de cabeçalho laranja.</p>' +
    '<p><b>Cndt e Praia — pares de dias:</b> Condutor de turismo = pares ter-qua, qui-sex, sáb-dom (2 por par; segunda não tem serviço). Supervisor de praia = par sáb-dom (1). ' +
    'O “0” é marcado nos dois dias; pelo menos 1 dia livre entre pares; par com dia em branco é pulado; sáb 31 + dom 1º usa a aba do mês seguinte, se existir.</p>' +
    '<h3>Retirar serviços</h3><p>Retira os “0” das escalas marcadas, de hoje em diante; o “0” volta a ser fórmula de folga e a cor volta ao padrão. Opções: retirar também os verdes, preservar cores de afastamento e anotações (marcadas por padrão). Cores de afastamento nunca são apagadas.</p>' +
    '<h3>Adicionar afastamento</h3><p>Pinta o período na linha do militar com a cor da legenda (férias, licença/dispensa/curso, missão, baixado, concurso, exame de pagamento, fora da escala). A apresentação pinta só o dia em cinza. ' +
    'Vários militares de uma vez (afastamento conjunto). Se havia “0” no período, ele vira fórmula e o resumo avisa que falta substituto — use depois “Adicionar serviços”. Período que atravessa o mês pinta também a aba seguinte, se existir.</p>' +
    '<h3>Adicionar militar</h3><p>Informe subunidade, graduação e nome de guerra; para cada escala escolha a posição (automática pela graduação) e a data do último serviço em dia útil e em dia vermelho — ou “nunca serviu” (folga 31 nas duas escalas a partir do dia da inclusão, e “***” em fundo marrom-avermelhado nos dias anteriores). O nº de ordem (coluna C) é recalculado pelo tamanho do grupo da escala (ex.: CB DIA 1-1-1-1, 2-2-2-2). ' +
    'Verificar mostra onde entra e a folga; depois Adicionar. Só o mês escolhido é alterado.</p>' +
    '<h2>🗂️ Abas Mensais</h2>' +
    '<p><b>Criar abas do próximo mês:</b> cria as duas abas do mês seguinte ao de hoje, sem perguntar.  cria “&lt;Mês&gt; Grad” e “&lt;Mês&gt; Cndt e Praia” a partir das abas do mês atual, com folgas ligadas ao mês anterior e corpo limpo. Meses de 28 a 31 dias são ajustados sozinhos; se algo falhar, as abas criadas na tentativa são removidas.<br>' +
    '<b>Configuração de Gatilho Automático:</b> uma só caixa: mostra o gatilho atual e a última criação automática, permite definir (todo mês em um dia de 1 a 28, uma data única ou o primeiro dia útil de cada mês, e o horário) ou desativar. Roda às ' + CFG.HORA_GATILHO + 'h e só cria se as abas ainda não existirem.<br>' +
    '<b>Importar Escala</b> (submenu de Abas Mensais): veja a seção seguinte.</p>' +
    '<h2>📊 Auditagem — Verificação de serviços tirados</h2>' +
    '<p>Conta quantos serviços cada militar tirou em uma ou várias escalas, em meses inteiros ou num período (por padrão até hoje; “Incluir dias futuros” conta o planejado) e mostra o ranking, a média, o máximo e o mínimo. Só LÊ a planilha. ' +
    'Conta cada “0” (amarelo, laranja, azuis, sem cor); “0” verde (serviço em outra escala) entra só se o militar não tiver “0” próprio no mesmo dia nas escalas marcadas; “0” com cor de afastamento não conta. ' +
    '“Considerar trocas” usa a nota da célula (Total = próprios − passados + pegos). Exporte para Planilha Google, PDF ou Word: o arquivo novo é salvo na pasta da planilha (o Google pede autorização na primeira exportação).</p>' +
    '<h2>📥 Importar escala da Guarnição</h2>' +
    '<p><b>Aba de destino:</b> escolhida numa lista dentro da própria janela de importação (vem selecionada a aba “&lt;Mês&gt; Grad” aberta). <b>Via Google Drive:</b> lê direto a planilha da Guarnição (acha a aba pelo título “ESCALAS DE SERVIÇO – MÊS DE ANO”, mesmo que o nome da aba esteja desatualizado). ' +
    '<b>Via documento:</b> PDF, xlsx, xls, ods ou csv; mostra a tabela lida, onde você corrige qualquer célula e o tipo (PRETA/VERM) antes de aplicar. ' +
    'A importação pinta as linhas OF DIA QG / CMT GD QG / CB GD QG / SD GD QG / MOTORISTA À POMN do topo (laranja = 21º GAC, azul = outra unidade), cria a fórmula de folga dos blocos QG AD/1 só nos dias laranja e confere o tipo do dia; se divergir, escolha “refazer fórmulas” ou “manter os tipos atuais”. ' +
    'Se a Guarnição ainda não publicou o mês, o módulo avisa.</p>' +
    '<h2>📅 Prévia semanal</h2>' +
    '<p><b>Adicionar prévia:</b> escolha a semana na lista (quarta a terça; a sugerida vem marcada); o módulo copia “Prévia - Modelo”, ajusta as datas, pinta de vermelho as colunas de sábado, domingo e feriado (conforme a aba do mês) e usa “PARADA DIÁRIA 7h” nesses dias e 8h nos demais. ' +
    '<b>Atualizar prévia:</b> religa as fórmulas à planilha (sem abas de cache) e ativa o recálculo a cada minuto. ' +
    'As escalas feitas na própria planilha (PERMANÊNCIA PNR — bloco “PNR” da aba Grad, com trocas —, ADJ OF DIA, CMT GD, CH PI, CB GD, AUX PI, Condutor, Supervisor, QG AD/1…) são lidas direto das abas do mês em tempo real. ' +
    'Cores e anotações — portões (azul-claro 12h / azul-escuro 24h), CB DIA por posição e trocas de serviço (“*”, nota da célula) — são lidos por script e gravados em colunas ocultas da própria prévia: a cada alteração da planilha (no máximo 1 vez a cada 20 s), a cada 10 min e ao usar Atualizar prévia. Serviços opcionais sem ninguém (Condutor, Controle de acesso, Supervisor e CB DIA com menos vagas) aparecem como X. ' +
    'Sgt Dia, Manobreiro e Atendimento vêm por IMPORTRANGE (tempo real; o Google pede “Permitir acesso” uma vez por arquivo). Of Dia (cor da célula) e as trocas anotadas nesses arquivos são lidos por um gatilho a cada 10 min e ficam em colunas ocultas da prévia; as abas *_CACHE podem ser apagadas depois de Atualizar prévia.</p>' +
    '<h2>✅ Verificação do sistema</h2><p>Confere se todas as funções estão instaladas no projeto, se a legenda foi lida e quais abas mensais existem. Use depois de colar/atualizar o código.</p>';
  mostrarHtml_(h, 'Sobre o Módulo Brigada', 700, 620);
}

/* ============================================================ VERIFICAÇÃO DO SISTEMA */
function mnuVerificarSistema() {
  var esperadas = [
    'onOpen', 'mnuSobre', 'mnuVerificarSistema',
    'mnuAdicionarServicos', 'mnuRetirarServicos', 'mnuAdicionarAfastamento', 'mnuAdicionarMilitar',
    'apiAbas', 'apiBlocos', 'apiServicos', 'apiAfastamento', 'apiMilitar',
    'mnuAtualizarPrevia', 'mnuAdicionarPrevia', 'mnuDefinirParada', 'apiParadaPrevias', 'apiParadaDias', 'apiDefinirParada', 'apiPreviaSemanas', 'apiCriarPrevia', 'atualizarExternosPrevia_', 'preencherPermanencia_', 'atualizarExternosTrigger', 'atualizarTrocasTrigger', 'atualizarTabelasOnChange', 'atualizarTabelasInternas_', 'PREVIA_CAL', 'PREVIA_TROCAS',
    'mnuImportarDrive', 'mnuImportarDocumento', 'apiImportarLinhas', 'apiImportarDrive',
    'mnuQuantitativo', 'apiQuantitativo', 'apiExportarQuantitativo', 'calcularQuantitativo_',
    'mnuCriarAbasProximoMes', 'mnuConfigGatilho', 'apiDesativarGatilho', 'gatilhoCriarAbas', 'apiCriarAbas',
    'lerAba_', 'propagarAfast_', 'aplicarPendencias_', 'planejarServicos_', 'planejarRetirada_', 'criarAbasMes_'
  ];
  var faltam = esperadas.filter(function (n) { return typeof globalThis[n] !== 'function'; });
  var meses = mesesDasAbas_(), tabela = [], g = null;
  ss_().getSheets().forEach(function (sh) {
    var nm = nomeAba_(sh.getName());
    if (nm && nm.tipo === CFG.TIPO_GRAD && !g) g = sh;
    if (!nm || sh.isSheetHidden()) return;
    try {
      var A = lerAba_(sh);
      tabela.push('<tr><td>' + esc_(A.nome) + '</td><td>' + A.ano + '</td><td>' + A.nDias + '</td><td>' + A.blocos.length + '</td></tr>');
    } catch (e) { tabela.push('<tr><td>' + esc_(sh.getName()) + '</td><td colspan="3" class="erro">' + esc_(e.message) + '</td></tr>'); }
  });
  var legendaOk = false, cores = '';
  if (g) {
    var L = lerLegenda_(g);
    legendaOk = /LEGENDA/i.test(String(g.getRange(1, 4, g.getLastRow(), 1).getValues().join('|')));
    cores = ['ferias', 'missao', 'licenca', 'baixado'].map(function (k) {
      return '<span class="chip" style="cursor:default"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + L[k].bg + '"></span>' + k + '</span>';
    }).join('');
  }
  var props = PropertiesService.getDocumentProperties();
  var gat = props.getProperty('GATILHO'), pend = JSON.parse(props.getProperty('AFAST_PEND') || '[]');
  var h = '<h3>Verificação do sistema <span class="mu">Módulo Brigada ' + CFG.VERSAO + '</span></h3><div class="cards">' +
    '<div class="card' + (faltam.length ? ' bad' : '') + '"><b>' + (faltam.length ? faltam.length + ' faltando' : '✔ ' + esperadas.length) + '</b><span>funções no projeto</span></div>' +
    '<div class="card"><b>' + meses.length + '</b><span>meses com abas</span></div>' +
    '<div class="card"><b>' + pend.length + '</b><span>afastamentos pendentes</span></div>' +
    '<div class="card"><b style="font-size:14px">' + (gat ? '✔' : '—') + '</b><span>' + (gat ? esc_(JSON.parse(gat).texto) : 'sem gatilho automático') + '</span></div></div>';
  if (faltam.length) h += '<p class="erro">❌ Funções ausentes: ' + faltam.join(', ') + '. Cole de novo os arquivos do projeto.</p>';
  h += '<details open><summary>Abas mensais visíveis</summary>' + (tabela.length ? '<table><tr><th>Aba</th><th>Ano</th><th>Dias</th><th>Blocos</th></tr>' + tabela.join('') + '</table>' : '<span class="mu">nenhuma</span>') + '</details>';
  h += '<details><summary>Legenda de cores ' + (legendaOk ? '<span class="ok">lida</span>' : '<span class="erro">não encontrada — usando cores padrão</span>') + '</summary><div class="bar">' + cores + '</div></details>';
  if (pend.length) h += '<details><summary>Afastamentos pendentes</summary><ul>' + pend.map(function (e) {
    return '<li>' + esc_(CFG.MESES[e.mes] + '/' + e.ano + ' ' + e.tipoAba + ' — ' + e.rec.keys.length + ' militar(es), ' + e.rec.tipo + ' até ' + e.rec.ate) + '</li>';
  }).join('') + '</ul></details>';
  mostrarHtml_(h, 'Verificação do sistema', 560, 520);
}
