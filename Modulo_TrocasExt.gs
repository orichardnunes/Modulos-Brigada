/**
 * MÓDULO BRIGADA 1.0 — Modulo_TrocasExt.gs
 * Central de trocas para as escalas dos ARQUIVOS EXTERNOS (Of Dia, Of Dia QG, Sgt Dia e Manobreiro).
 * O procedimento é o mesmo das escalas da planilha: pedido → autorização → anotação do substituto na célula do “0”
 * (aqui, na célula do arquivo externo; a prévia lê essa anotação e mostra o substituto com “*”).
 * Escreve nos arquivos externos com a permissão de quem publicou o app: se faltar acesso de editor, o erro diz qual arquivo.
 */
var TIPO_EXT_ = 'EXT';
var EXT_ESCALAS_ = [
  { hdr: 1001, titulo: 'OF DIA', fonte: 'OFDIA', modo: 'unid' },
  { hdr: 1002, titulo: 'OF DIA QG AD/1', fonte: 'OFDIA', modo: 'qg' },
  { hdr: 1003, titulo: 'SGT DIA', fonte: 'SGT', modo: '' },
  { hdr: 1004, titulo: 'MANOBREIRO', fonte: 'MANO', modo: '' }
];

function escalaExtPorHdr_(hdr) {
  var h = Number(hdr), e = EXT_ESCALAS_.filter(function (x) { return x.hdr === h; })[0];
  if (!e) throw new Error('Escala externa não encontrada.');
  return e;
}

/** blocos no formato dos de apiBlocos, para aparecerem na lista de escalas do app */
function blocosExt_() {
  return EXT_ESCALAS_.map(function (e) { return { aba: 'Arquivo externo', tipo: TIPO_EXT_, hdr: e.hdr, titulo: e.titulo }; });
}

function lerExtDia_(e, dt) {
  var X = e.fonte === 'OFDIA' ? lerOfDia_(dt) : e.fonte === 'SGT' ? lerSgt_(dt) : lerMano_(dt);
  if (!X) throw new Error('O arquivo externo (' + e.titulo + ') não tem aba/coluna para ' + fmtData_(dt) + '.');
  return X;
}

/** quem está de serviço (“0”) nessa escala nesse dia: no Of Dia, a cor separa o serviço da unidade do QG */
function zerosExtEscala_(e, X) {
  var c = X.loc.col, z = zerosExt_(X, X.pessoas);
  if (e.fonte !== 'OFDIA') return z;
  return z.filter(function (p) {
    var bg = String(X.D.bgs[p.r][c]).toLowerCase();
    if (e.modo === 'qg') return !!X.corQG && bg === X.corQG;
    return !X.corQG || bg !== X.corQG; /* serviço da unidade (ou sem legenda de QG) */
  });
}

/** mesmo formato de apiTrocaInfo: {aba, titulo, dia, data, sai:[{nome,sub,nota}], cands:[{nome,sub,ok,flags,cad,fora,folga}], membros} */
function infoTrocaExt_(hdr, iso, extras) {
  var e = escalaExtPorHdr_(hdr), dt = parseIso_(iso), X = lerExtDia_(e, dt), c = X.loc.col, V = X.D.vals;
  var zeros = zerosExtEscala_(e, X), gapMin = Math.ceil(CFG.FOLGA_MIN_H / 24) + 1, sai = [], cands = [];
  zeros.forEach(function (p) { sai.push({ r: p.r, nome: p.nome, sub: p.su || '', nota: String(X.D.notes[p.r][c] || '') }); });
  var zerosTodos = {};
  zerosExt_(X, X.pessoas).forEach(function (p) { zerosTodos[p.r] = true; });
  X.pessoas.forEach(function (p) {
    if (zerosTodos[p.r]) return; /* já está de serviço nesse dia (nessa ou em outra função do mesmo arquivo) */
    var md = Infinity, ult = null, fl = [];
    for (var k = 1; k <= 40; k++) {
      var a = c - k, b = c + k;
      if (a >= 0 && (V[p.r][a] === 0 || V[p.r][a] === '0')) { if (k < md) md = k; if (ult == null) ult = k; }
      if (b < V[p.r].length && (V[p.r][b] === 0 || V[p.r][b] === '0') && k < md) md = k;
    }
    if (md === 1) fl.push('serviço no dia anterior/seguinte');
    else if (md < gapMin) fl.push('folga de ' + ((md - 1) * 24) + ' h');
    cands.push({ r: p.r, nome: p.nome, sub: p.su || '', folga: ult, flags: fl, ok: !fl.length, cad: true, key: norm_(p.nome) });
  });
  (extras || []).forEach(function (m) { /* militar de fora da lista do arquivo (cadastro): entra com o aviso “fora da escala” */
    if (X.pessoas.some(function (p) { return mesmoMil_(m.full, p.nome); })) return;
    cands.push({ r: -1, nome: m.full, sub: m.sub || '', folga: null, flags: ['fora da escala'], ok: false, fora: true, cad: true });
  });
  cands.sort(function (a, b) { return (b.ok ? 1 : 0) - (a.ok ? 1 : 0) || (b.folga == null ? -1 : b.folga) - (a.folga == null ? -1 : a.folga); });
  return { aba: X.loc.sh.getName(), titulo: e.titulo, dia: dt.getDate(), data: fmtData_(dt), sai: sai, cands: cands, sugeridos: cands.filter(function (x) { return x.ok; }).slice(0, 5), membros: X.pessoas.map(function (p) { return norm_(p.nome); }), ext: true };
}

/** grava (ou limpa, com entraNome vazio) a anotação do substituto na célula do “0” no arquivo externo */
function gravarNotaExt_(d, saiNome, entraNome) {
  bumpTrocas_();
  var e = escalaExtPorHdr_(d.hdr), dt = parseIso_(d.iso), X = lerExtDia_(e, dt), c = X.loc.col, ks = norm_(saiNome), alvo = null;
  zerosExtEscala_(e, X).forEach(function (p) { if (!alvo && norm_(p.nome) === ks) alvo = p; });
  if (!alvo) throw new Error(saiNome + ' não está mais com “0” de serviço nesse dia em ' + e.titulo + ' (arquivo externo).');
  var rng = X.loc.sh.getRange(alvo.r + 1, c + 1);
  try { rng.setNote(entraNome ? String(entraNome) : ''); }
  catch (er) { throw new Error('Não consegui gravar a anotação no arquivo externo de ' + e.titulo + ' (' + X.loc.sh.getParent().getName() + '). O dono do app precisa ter acesso de editor a esse arquivo. ' + er.message); }
  try { delete CACHE_EXT_.dados[X.loc.sh.getParent().getId() + '|' + X.loc.sh.getSheetId()]; } catch (er2) { /* o cache é só da execução */ }
  agendarPrevia_();
}
