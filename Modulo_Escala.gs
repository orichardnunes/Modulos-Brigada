/**
 * MÓDULO BRIGADA 1.0 — Modulo_Escala.gs
 * Confecção de escalas (adicionar/retirar serviços, afastamentos, militares) e Abas mensais.
 * Depende de Codigo.gs.
 */

/* ============================================================ ENTRADAS DO MENU */
function mnuAdicionarServicos() { mostrarHtml_(htmlServicos_('add'), 'Adicionar serviços', 700, 640); }
function mnuRetirarServicos() { mostrarHtml_(htmlServicos_('del'), 'Retirar serviços', 700, 620); }
function mnuAdicionarAfastamento() { mostrarHtml_(htmlAfastamento_(), 'Adicionar afastamento', 700, 660); }
function mnuAdicionarMilitar() { mostrarHtml_(htmlMilitar_(), 'Adicionar militar', 720, 680); }

/* ============================================================ API (chamada pelas caixas) */
function apiAbas() {
  var hoje = new Date();
  return { meses: mesesDasAbas_(), mesAtual: CFG.MESES[hoje.getMonth()], hoje: isoData_(hoje) };
}

/** Lista os blocos (escalas) das abas do mês, com vagas sugeridas e linhas (militares). */
function apiBlocos(mesId, tipos) {
  var out = { blocos: [], hoje: isoData_(new Date()), ini: '', fim: '' };
  tipos.forEach(function (t) {
    var sh = ss_().getSheetByName(mesId + ' ' + t);
    if (!sh) return;
    var A = lerAba_(sh);
    if (!out.ini) { out.ini = isoData_(dataDia_(A, 1)); out.fim = isoData_(dataDia_(A, A.nDias)); }
    A.blocos.forEach(function (B) {
      out.blocos.push({
        aba: A.nome, tipo: t, hdr: B.hdr, titulo: B.titulo, kind: B.kind, n: B.rows.length,
        vagas: vagasSugeridas_(A, B),
        linhas: B.rows.map(function (R) { return { r: R.r, nome: R.nome, sub: R.sub }; })
      });
    });
  });
  return out;
}

function vagasSugeridas_(A, B) {
  if (B.kind === 'par3') return 2;
  if (B.kind === 'par1') return 1;
  var ehCb = semAcento_(B.titulo).indexOf('CB DIA') >= 0;
  if (ehCb) return CFG.CB_DIA_PADRAO;
  var freq = {}, melhor = 0, mf = 0;
  for (var d = 1; d <= A.nDias; d++) {
    var k = 0;
    B.rows.forEach(function (R) {
      if (participa_(A, B, R, d) && num_(A.vals[R.r][colDia_(d)]) === 0 && classeCel_(A, R.r, colDia_(d)) === 'normal') k++;
    });
    if (k > 0) { freq[k] = (freq[k] || 0) + 1; if (freq[k] > mf) { mf = freq[k]; melhor = k; } }
  }
  if (melhor) return melhor;
  return 1;
}

function diaDeData_(A, iso, ehInicio) {
  var dt = parseIso_(iso), k = dt.getFullYear() * 12 + dt.getMonth(), kA = A.ano * 12 + A.mes;
  if (k < kA) return ehInicio ? 1 : 0;
  if (k > kA) return ehInicio ? A.nDias + 1 : A.nDias;
  return dt.getDate();
}

function agruparPorAba_(blocos) {
  var g = {}, ordem = [];
  blocos.forEach(function (b) { if (!g[b.aba]) { g[b.aba] = []; ordem.push(b.aba); } g[b.aba].push(b); });
  return ordem.map(function (n) { return { aba: n, blocos: g[n] }; });
}

/** modo: 'add' | 'del'. aplicar=false apenas simula (Verificar). */
function apiServicos(modo, p, aplicar) {
  var txt = [];
  agruparPorAba_(p.blocos).forEach(function (g) {
    var sh = ss_().getSheetByName(g.aba);
    if (!sh) throw new Error('Aba "' + g.aba + '" não encontrada.');
    var A = lerAba_(sh);
    var pr = {
      dIni: diaDeData_(A, p.de, true), dFim: diaDeData_(A, p.ate, false), folgaH: Number(p.folgaH) || CFG.FOLGA_MIN_H,
      evOutra: !!p.evOutra, evAdj: !!p.evAdj, relaxar: !!p.relaxar, verdes: !!p.verdes, notas: p.notas !== false,
      blocos: g.blocos.map(function (b) { return { hdr: b.hdr, vagas: Number(b.vagas) || 0 }; })
    };
    txt.push('══ ' + A.nome + ' ══');
    if (modo === 'add') {
      var proxA = null;
      if (A.blocos.some(function (B) { return ehPar_(B); })) {
        var ps = abaMesVizinho_(A, 1);
        if (ps) { try { proxA = lerAba_(ps); } catch (e) { proxA = null; } }
      }
      var plano = planejarServicos_(A, pr, proxA);
      txt.push(textoPlano_(A, plano));
      if (aplicar) {
        escreverMarcas_(A, plano.esc);
        escreverProx_(A, proxA, plano.prox);
      }
    } else {
      var rem = planejarRetirada_(A, pr);
      txt.push(rem.avisos.concat(['Serviços a retirar: ' + rem.lista.length]).join('\n'));
      if (aplicar) escreverMarcas_(A, rem.lista, { notas: pr.notas });
    }
  });
  SpreadsheetApp.flush();
  return (aplicar ? '✅ APLICADO\n\n' : '🔎 VERIFICAÇÃO (nada foi alterado)\n\n') + txt.join('\n');
}

/* ============================================================ MOTOR — ADICIONAR SERVIÇOS */
function planejarServicos_(A, pr, proxA) {
  var n = A.nDias, hoje1 = primeiroDiaAdicionar_(A);
  var dIni = Math.max(pr.dIni, hoje1), dFim = Math.min(pr.dFim, n);
  var gapMin = Math.ceil(pr.folgaH / 24) + 1;
  var vagasDe = {};
  pr.blocos.forEach(function (b) { vagasDe[b.hdr] = b.vagas; });
  var plano = { esc: [], prox: [], avisos: [], resumo: {}, linhas: [] };

  var svc = {}, svcB = {}, idx = {};
  function addSvc(bi, key, d, proprio) {
    (svc[key] = svc[key] || {})[d] = true;
    if (proprio) (svcB[bi + '|' + key] = svcB[bi + '|' + key] || []).push(d);
  }
  function minDist(lista, d) {
    var m = Infinity;
    (lista || []).forEach(function (s) { m = Math.min(m, Math.abs(s - d)); });
    return m;
  }
  A.blocos.forEach(function (B, bi) {
    B.rows.forEach(function (R, ri) {
      (idx[R.key] = idx[R.key] || []).push({ bi: bi, ri: ri });
      for (var d = 1; d <= n; d++) {
        if (!participa_(A, B, R, d) || num_(A.vals[R.r][colDia_(d)]) !== 0) continue;
        var cl = classeCel_(A, R.r, colDia_(d));
        if (cl === 'afast' && d >= hoje1) continue;
        addSvc(bi, R.key, d, cl !== 'verde');
      }
    });
    plano.resumo[bi] = { titulo: B.titulo, esc: 0, falta: 0, sel: vagasDe[B.hdr] != null };
  });

  var ST = A.blocos.map(function (B) {
    return B.rows.map(function () { return { last: [null, null], dirty: [false, false], prev: null }; });
  });
  var ovr = {};

  function marcaVerde(bi, R, d, atual) {
    (idx[R.key] || []).forEach(function (o) {
      if (o.bi === bi) return;
      var Bj = A.blocos[o.bi], Rj = Bj.rows[o.ri];
      if (!participa_(A, Bj, Rj, d)) return;
      var c = colDia_(d);
      if (num_(A.vals[Rj.r][c]) === 0 || classeCel_(A, Rj.r, c) === 'afast') return;
      plano.esc.push({ bi: o.bi, ri: o.ri, d: d, tipo: 'verde' });
      if (atual && o.bi < bi) {
        var s = ST[o.bi][o.ri], tj = vermelho_(A, Bj, d) ? 1 : 0;
        s.last[tj] = 0; s.dirty[tj] = true; s.prev = 0;
      } else ovr[o.bi + '|' + o.ri + '|' + d] = true;
    });
  }

  for (var d = 1; d <= n; d++) {
    for (var bi = 0; bi < A.blocos.length; bi++) {
      var B = A.blocos[bi], par = ehPar_(B), t = vermelho_(A, B, d) ? 1 : 0;
      var seg = par && ehSegundoPar_(A, B, d), c = colDia_(d);
      var V = [], CL = [], INV = [], VERDE = [];
      B.rows.forEach(function (R, ri) {
        if (!participa_(A, B, R, d) || ehTexto_(A, R.r, c)) { V[ri] = undefined; return; }
        var st = ST[bi][ri], disp = num_(A.vals[R.r][c]), cl = classeCel_(A, R.r, c);
        var z = disp === 0 && (cl !== 'afast' || d < hoje1);
        var inv = disp === 0 && cl === 'afast' && d >= hoje1;
        var v, forcado = !!ovr[bi + '|' + ri + '|' + d];
        if (forcado) v = 0;
        else if (z) v = 0;
        else if (seg && st.prev != null) v = st.prev;
        else if (inv || st.dirty[t] || disp == null) v = st.last[t] == null ? ((inv || disp == null) ? 1 : disp) : st.last[t] + 1;
        else v = disp;
        V[ri] = v; CL[ri] = cl; INV[ri] = inv; VERDE[ri] = forcado || cl === 'verde';
      });

      var sel = plano.resumo[bi].sel && d >= dIni && d <= dFim;
      if (sel) {
        B.rows.forEach(function (R, ri) { if (INV[ri]) plano.esc.push({ bi: bi, ri: ri, d: d, tipo: 'fix' }); });
      }
      if (sel && (!par || ehCabecaPar_(A, B, d))) {
        var exist = 0;
        B.rows.forEach(function (R, ri) { if (V[ri] === 0 && !VERDE[ri]) exist++; });
        var vd = vagasDiaBloco_(A, B), vagasHoje = vd[d] != null ? vd[d] : vagasDe[B.hdr];
        if (exist > vagasHoje) plano.avisos.push(('0' + d).slice(-2) + '/' + ('0' + (A.mes + 1)).slice(-2) + ' ' + B.titulo + ': já há ' + exist + ' serviço(s), acima do título (' + vagasHoje + '); ninguém foi retirado.');
        var need = vagasHoje - exist;
        if (need > 0) {
          var escolhidos = par ? escolherPar_() : escolherDia_();
          escolhidos.forEach(function (x, ix) {
            V[x.ri] = 0;
            var R = B.rows[x.ri];
            plano.esc.push({ bi: bi, ri: x.ri, d: d, tipo: 'servico', cor: (!par && !t && semAcento_(B.titulo).indexOf('POMN') === 0) ? (ix < 2 ? '#a4c2f4' : '#1c4587') : null });
            addSvc(bi, R.key, d, true);
            marcaVerde(bi, R, d, true);
            if (par) {
              if (d + 1 <= n) {
                plano.esc.push({ bi: bi, ri: x.ri, d: d + 1, tipo: 'servico' });
                addSvc(bi, R.key, d + 1, true);
                marcaVerde(bi, R, d + 1, false);
              } else plano.prox.push({ bi: bi, ri: x.ri });
            }
            plano.resumo[bi].esc++;
            plano.linhas.push(('0' + d).slice(-2) + '/' + ('0' + (A.mes + 1)).slice(-2) + ' ' + B.titulo + ': ' + R.nome);
          });
          var faltou = need - escolhidos.length;
          if (faltou > 0) {
            plano.resumo[bi].falta += faltou;
            plano.avisos.push(('0' + d).slice(-2) + '/' + ('0' + (A.mes + 1)).slice(-2) + ' ' + B.titulo + ': ' + faltou + ' vaga(s) sem militar disponível.');
          }
        }
      }
      B.rows.forEach(function (R, ri) {
        if (V[ri] === undefined || V[ri] == null) return;
        var st = ST[bi][ri];
        st.last[t] = V[ri]; st.prev = V[ri];
        if (V[ri] === 0 || INV[ri]) st.dirty[t] = true;
      });

/* ------- escolha: escalas diárias */
      /* jshint loopfunc:true */
      function escolherDia_() {
        var elig = [], rel = [];
        B.rows.forEach(function (R, ri) {
          if (V[ri] === undefined || V[ri] == null || V[ri] === 0 || CL[ri] === 'afast') return;
          var s = svc[R.key] || {};
          if (pr.evOutra && s[d]) return;
          if (pr.evAdj && (s[d - 1] || s[d + 1])) return;
          var x = { ri: ri, v: V[ri], md: minDist(Object.keys(svc[R.key] || {}).map(Number), d) };
          (x.md >= gapMin ? elig : rel).push(x);
        });
        elig.sort(function (a, b) { return b.v - a.v || b.ri - a.ri; });
        var out = elig.slice(0, need);
        if (out.length < need && pr.relaxar) {
          rel.sort(function (a, b) { return b.md - a.md || b.v - a.v || b.ri - a.ri; });
          rel.slice(0, need - out.length).forEach(function (x) {
            out.push(x);
            plano.avisos.push(('0' + d).slice(-2) + '/' + ('0' + (A.mes + 1)).slice(-2) + ' ' + B.titulo + ': ' + B.rows[x.ri].nome +
              ' só ' + ((x.md - 1) * 24) + ' h de intervalo.');
          });
        }
        return out;
      }

/* ------- escolha: pares de dias (Cndt e Praia) */
      function escolherPar_() {
        var d2 = d + 1, cruza = d2 > n;
        if (cruza ? !(d === n && dFim === n) : d2 > dFim) return [];
        if (cruza && !proxA) {
          plano.avisos.push('Par ' + d + '/' + (A.mes + 1) + ' (' + B.titulo + '): a aba do mês seguinte não existe — crie-a e repita.');
          return [];
        }
        var c2 = colDia_(d2), nPart1 = 0, nPart2 = 0;
        B.rows.forEach(function (R) {
          if (participa_(A, B, R, d)) nPart1++;
          if (!cruza && participa_(A, B, R, d2)) nPart2++;
        });
        if (!cruza && nPart1 !== nPart2) {
          plano.avisos.push('Par ' + d + '-' + d2 + '/' + (A.mes + 1) + ' (' + B.titulo + ') pulado: um dos dias está em branco (feriado?).');
          return [];
        }
        var cands = [];
        B.rows.forEach(function (R, ri) {
          if (V[ri] === undefined || V[ri] == null || V[ri] === 0 || CL[ri] === 'afast') return;
          var s = svc[R.key] || {};
          if (s[d] || s[d2]) return;
          if ((svcB[bi + '|' + R.key] || []).some(function (z) { return z >= d - 1 && z <= d2 + 1; })) return;
          if (cruza) {
            var pr2 = proxLinha_(proxA, B, R);
            if (!pr2 || !participa_(proxA, pr2.B, pr2.R, 1) || classeCel_(proxA, pr2.R.r, colDia_(1)) === 'afast' ||
              num_(proxA.vals[pr2.R.r][colDia_(1)]) === 0) return;
          } else {
            if (!participa_(A, B, R, d2) || classeCel_(A, R.r, c2) === 'afast' || num_(A.vals[R.r][c2]) === 0) return;
          }
          cands.push({ ri: ri, v: V[ri] });
        });
        cands.sort(function (a, b) { return b.v - a.v || b.ri - a.ri; });
        return cands.slice(0, need);
      }
    }
  }
  return plano;
}

function proxLinha_(P, B, R) {
  for (var i = 0; i < P.blocos.length; i++) {
    if (P.blocos[i].titulo !== B.titulo) continue;
    for (var j = 0; j < P.blocos[i].rows.length; j++) if (P.blocos[i].rows[j].key === R.key) return { B: P.blocos[i], R: P.blocos[i].rows[j] };
  }
  return null;
}

function textoPlano_(A, plano) {
  var l = [];
  Object.keys(plano.resumo).forEach(function (bi) {
    var r = plano.resumo[bi];
    if (r.sel) l.push('▸ ' + r.titulo + ': ' + r.esc + ' serviço(s) escalado(s)' + (r.falta ? ', ' + r.falta + ' vaga(s) sem militar' : ''));
  });
  var fix = plano.esc.filter(function (e) { return e.tipo === 'fix'; }).length;
  var verdes = plano.esc.filter(function (e) { return e.tipo === 'verde'; }).length;
  if (fix) l.push('♻ ' + fix + ' serviço(s) inválido(s) (cor de afastamento) refeito(s) pela fórmula de folga.');
  if (verdes) l.push('🟩 ' + verdes + ' "0" verde(s) em outras escalas.');
  if (plano.prox.length) l.push('➡ ' + plano.prox.length + ' marcação(ões) do 2º dia do par na aba do mês seguinte.');
  if (plano.avisos.length) l.push('\n⚠ AVISOS:\n' + plano.avisos.join('\n'));
  if (plano.linhas.length) l.push('\nLISTA DIA A DIA:\n' + plano.linhas.join('\n'));
  return l.join('\n');
}

/* ============================================================ MOTOR — RETIRAR SERVIÇOS */
function planejarRetirada_(A, pr) {
  var dIni = Math.max(pr.dIni, primeiroDiaRetirar_(A)), dFim = Math.min(pr.dFim, A.nDias);
  var sel = {};
  pr.blocos.forEach(function (b) { sel[b.hdr] = true; });
  var out = { lista: [], avisos: [] };
  A.blocos.forEach(function (B, bi) {
    if (!sel[B.hdr]) return;
    var antes = out.lista.length;
    B.rows.forEach(function (R, ri) {
      for (var d = dIni; d <= dFim; d++) {
        if (!participa_(A, B, R, d)) continue;
        var c = colDia_(d);
        if (num_(A.vals[R.r][c]) !== 0) continue;
        var cl = classeCel_(A, R.r, c);
        if (cl === 'verde' && !pr.verdes) continue;
        out.lista.push({ bi: bi, ri: ri, d: d, tipo: 'rem', keepBg: cl === 'afast', limparNota: pr.notas === false });
      }
    });
    out.avisos.push('▸ ' + B.titulo + ': ' + (out.lista.length - antes) + ' serviço(s)');
  });
  return out;
}

/* ============================================================ ESCRITA NA PLANILHA */
/**
 * Retorna {r1c1:'=RC[-3]+1'} (mesma aba) ou {a1:"='Mês anterior'!X+1"} ou null.
 * Segue a cadeia existente: folga = célula anterior do mesmo tipo (preta/vermelha) + 1;
 * 2º dia do par repete o 1º.
 */
function formulaFolga_(A, B, R, d) {
  var t = vermelho_(A, B, d), x;
  if (ehPar_(B) && ehSegundoPar_(A, B, d) && d > 1 && contaFolga_(A, B, R, d - 1)) return { r1c1: '=RC[-1]' };
  for (x = d - 1; x >= 1; x--) {
    if (vermelho_(A, B, x) === t && contaFolga_(A, B, R, x) && !ehTexto_(A, R.r, colDia_(x))) return { r1c1: '=RC[' + (x - d) + ']+1' };
  }
  if (A._prev === undefined) {
    var ps = abaMesVizinho_(A, -1);
    try { A._prev = ps ? lerAba_(ps) : null; } catch (e) { A._prev = null; }
  }
  var P = A._prev;
  if (!P) return null;
  var pl = proxLinha_(P, B, R);
  if (!pl) return null;
  for (x = P.nDias; x >= 1; x--) {
    if (vermelho_(P, pl.B, x) === t && contaFolga_(P, pl.B, pl.R, x)) {
      return { a1: "='" + P.nome + "'!" + a1_(pl.R.r, colDia_(x)) + '+1' };
    }
  }
  return null;
}

/** itens: {bi, ri, d, tipo:'servico'|'verde'|'fix'|'rem', keepBg, limparNota} */
function escreverMarcas_(A, itens, opts) {
  var sh = A.sh, rl = { servico: [], verde: [], branco: [], vermelho: [], notas: [] }, grupos = {}, av = [], porCorServ = {};
  itens.forEach(function (it) {
    var B = A.blocos[it.bi], R = B.rows[it.ri], a1 = a1_(R.r, colDia_(it.d));
    if (it.tipo === 'servico') { var ck = it.cor || A.leg.servico.bg; (porCorServ[ck] = porCorServ[ck] || []).push(a1); return; }
    if (it.tipo === 'verde') { rl.verde.push(a1); return; }
    var f = formulaFolga_(A, B, R, it.d);
    if (!f) { av.push(R.nome + ' dia ' + it.d); f = { a1: '=1' }; }
    if (f.r1c1) (grupos[f.r1c1] = grupos[f.r1c1] || []).push(a1);
    else sh.getRange(a1).setFormula(f.a1);
    if (it.tipo === 'rem' && !it.keepBg) (vermelho_(A, B, it.d) ? rl.vermelho : rl.branco).push(a1);
    if (it.limparNota) rl.notas.push(a1);
  });
  Object.keys(porCorServ).forEach(function (ck) {
    sh.getRangeList(porCorServ[ck]).setValue(0).setBackground(ck).setFontColor(ck === '#1c4587' ? CFG.COR.BRANCO : A.leg.servico.fg);
  });
  if (rl.verde.length) sh.getRangeList(rl.verde).setValue(0).setBackground(A.leg.outra.bg).setFontColor(A.leg.outra.fg);
  Object.keys(grupos).forEach(function (f) { sh.getRangeList(grupos[f]).setFormulaR1C1(f); });
  if (rl.branco.length) sh.getRangeList(rl.branco).setBackground(CFG.COR.BRANCO).setFontColor(CFG.COR.PRETO);
  if (rl.vermelho.length) sh.getRangeList(rl.vermelho).setBackground(CFG.COR.VERMELHO).setFontColor(CFG.COR.PRETO);
  if (rl.notas.length) sh.getRangeList(rl.notas).clearNote();
  if (av.length) Logger.log('Sem referência de folga (usado =1): ' + av.join('; '));
}

/** 2º dia do par que cai no dia 1º do mês seguinte. */
function escreverProx_(A, P, lista) {
  if (!P || !lista || !lista.length) return;
  var cels = [];
  lista.forEach(function (o) {
    var B = A.blocos[o.bi], pl = proxLinha_(P, B, B.rows[o.ri]);
    if (pl) cels.push(a1_(pl.R.r, colDia_(1)));
  });
  if (cels.length) P.sh.getRangeList(cels).setValue(0).setBackground(P.leg.servico.bg).setFontColor(P.leg.servico.fg);
}

/* ============================================================ AFASTAMENTO */
var TIPOS_AFAST = {
  ferias: 'Férias', licenca: 'Licença / Dispensa / Curso', missao: 'Missão / Atividade no terreno',
  baixado: 'Baixado', concurso: 'Concurso', exame: 'Exame de pagamento', fora: 'Fora da escala'
};

function pintarAfast_(A, alvos, d1, d2, tipo, nomes, semSubst) {
  if (d2 < d1) return null;
  var sh = A.sh, cor = A.leg[tipo], rl = [], zeros = [];
  alvos.forEach(function (o) {
    var B = A.blocos[o.bi], R = B.rows[o.ri];
    for (var d = d1; d <= d2; d++) {
      rl.push(a1_(R.r, colDia_(d)));
      if (participa_(A, B, R, d) && num_(A.vals[R.r][colDia_(d)]) === 0) {
        zeros.push({ bi: o.bi, ri: o.ri, d: d, tipo: 'fix' });
        semSubst.push(R.nome + ' — ' + A.nome + ' dia ' + d);
      }
    }
  });
  if (zeros.length) escreverMarcas_(A, zeros);
  if (rl.length) sh.getRangeList(rl).setBackground(cor.bg).setFontColor(cor.fg);
  if (!rl.length) return null;
  SpreadsheetApp.flush();
  var lido = sh.getRange(rl[0]).getBackground();
  return { cor: cor.bg, primeira: rl[0], ultima: rl[rl.length - 1], ok: String(lido).toLowerCase() === String(cor.bg).toLowerCase(), lido: lido };
}

function alvosAfast_(A, rec) {
  var alvos = [], nomes = {};
  rec.keys.forEach(function (k) {
    A.blocos.forEach(function (B, bi) {
      if (!rec.todas && B.titulo !== rec.titulo) return;
      B.rows.forEach(function (R, ri) { if (R.key === k) { alvos.push({ bi: bi, ri: ri }); nomes[k] = R.nome; } });
    });
  });
  return { alvos: alvos, nomes: nomes };
}

function guardarPendencia_(rec, tipoAba, mes, ano) {
  var props = PropertiesService.getDocumentProperties(), l = JSON.parse(props.getProperty('AFAST_PEND') || '[]');
  var novo = { rec: rec, tipoAba: tipoAba, mes: mes, ano: ano };
  if (l.some(function (e) { return JSON.stringify(e) === JSON.stringify(novo); })) return;
  l.push(novo);
  props.setProperty('AFAST_PEND', JSON.stringify(l));
}

function listarPendencias_() { return JSON.parse(PropertiesService.getDocumentProperties().getProperty('AFAST_PEND') || '[]'); }

/**
 * Pinta o afastamento (rec) a partir da aba A e segue pelos meses seguintes enquanto o período continuar.
 * Se a aba do mês seguinte não existir, guarda a pendência para ser aplicada quando ela for criada.
 */
function propagarAfast_(A, rec, aplicar, linhas, semSubst) {
  var cur = A, ate = parseIso_(rec.ate), de = parseIso_(rec.de), guard = 0;
  while (cur && guard++ < 14) {
    var fimMes = dataDia_(cur, cur.nDias);
    var d1 = Math.max(1, diaDeData_(cur, rec.de, true)), d2 = Math.min(cur.nDias, diaDeData_(cur, rec.ate, false));
    if (de <= fimMes && d2 >= d1) {
      var t = alvosAfast_(cur, rec);
      if (t.alvos.length) {
        linhas.push((TIPOS_AFAST[rec.tipo] || 'Apresentação') + ': ' + Object.keys(t.nomes).length + ' militar(es), ' + t.alvos.length +
          ' linha(s), dias ' + d1 + '–' + d2 + ' de ' + cur.nome);
        if (aplicar) {
          var rs = pintarAfast_(cur, t.alvos, d1, d2, rec.tipo, t.nomes, semSubst);
          if (rs) linhas.push(rs.ok ? '🎨 Cor ' + rs.cor + ' aplicada (de ' + rs.primeira + ' a ' + rs.ultima + ').' :
            '⚠ A cor ' + rs.cor + ' foi enviada, mas a célula ' + rs.primeira + ' continua ' + rs.lido + ' (regra de formatação condicional ou proteção?).');
        }
      } else linhas.push('⚠ Militar(es) não encontrado(s) em ' + cur.nome + ' (escala "' + rec.titulo + '").');
    }
    if (ate <= fimMes) return;
    var m = cur.mes + 1, ano = cur.ano;
    if (m > 11) { m = 0; ano++; }
    var nx = ss_().getSheetByName(CFG.MESES[m] + ' ' + cur.tipo);
    if (!nx) {
      linhas.push('🕓 O período continua até ' + fmtData_(ate) + ' e a aba "' + CFG.MESES[m] + ' ' + cur.tipo +
        '" ainda não existe: o afastamento ' + (aplicar ? 'FICOU PENDENTE e' : 'ficará pendente e') + ' será lançado automaticamente quando a aba for criada.');
      if (aplicar) guardarPendencia_(rec, cur.tipo, m, ano);
      return;
    }
    cur = lerAba_(nx, m, ano);
  }
}

/** Aplica nas abas recém-criadas os afastamentos que ficaram pendentes para aquele mês. */
function aplicarPendencias_(sheets, mes, ano) {
  var props = PropertiesService.getDocumentProperties(), todas = listarPendencias_(), resto = [], minhas = [], linhas = [];
  todas.forEach(function (e) { (e.mes === mes && e.ano === ano ? minhas : resto).push(e); });
  if (!minhas.length) return linhas;
  props.setProperty('AFAST_PEND', JSON.stringify(resto));
  minhas.forEach(function (e) {
    var sh = sheets.filter(function (x) { var n = nomeAba_(x.getName()); return n && n.tipo === e.tipoAba; })[0];
    if (!sh) { guardarPendencia_(e.rec, e.tipoAba, e.mes, e.ano); return; }
    try { propagarAfast_(lerAba_(sh, mes, ano), e.rec, true, linhas, []); }
    catch (x) { linhas.push('ERRO ao lançar afastamento pendente: ' + x.message); }
  });
  return linhas;
}

function apiAfastamento(p, aplicar) {
  var sh = ss_().getSheetByName(p.aba);
  if (!sh) throw new Error('Aba "' + p.aba + '" não encontrada.');
  if (!p.keys || !p.keys.length) throw new Error('Selecione ao menos um militar.');
  if (!p.apres && (!p.de || !p.ate)) throw new Error('Informe início e término.');
  if (p.de && p.ate && parseIso_(p.ate) < parseIso_(p.de)) throw new Error('O término é anterior ao início.');
  var A = lerAba_(sh), semSubst = [], linhas = [], titulo = '';
  A.blocos.forEach(function (B) { if (B.hdr === p.hdr) titulo = B.titulo; });
  var base = { keys: p.keys, titulo: titulo, todas: !!p.todas };
  if (p.de && p.ate) propagarAfast_(A, Object.assign({ tipo: p.tipo, de: p.de, ate: p.ate }, base), aplicar, linhas, semSubst);
  if (p.apres) propagarAfast_(A, Object.assign({ tipo: 'apres', de: p.apres, ate: p.apres }, base), aplicar, linhas, []);
  if (semSubst.length) linhas.push('\n⚠ "0" substituído(s) pela fórmula de folga — falta substituto (use "Adicionar serviços"):\n' + semSubst.join('\n'));
  SpreadsheetApp.flush();
  return (aplicar ? '✅ APLICADO\n\n' : '🔎 VERIFICAÇÃO (nada foi alterado)\n\n') + linhas.join('\n');
}

/* ============================================================ ADICIONAR MILITAR */
function rankGrad_(nome) {
  var u = norm_(nome);
  for (var i = 0; i < CFG.GRADUACOES.length; i++) if (u.indexOf(norm_(CFG.GRADUACOES[i]) + ' ') === 0) return i;
  return 99;
}

function contarTipo_(A, B, de, ate, tipo) { /* nº de dias do tipo (0 preta/1 vermelha) em (de, ate] */
  var n = 0, dt = new Date(de.getFullYear(), de.getMonth(), de.getDate() + 1);
  while (dt <= ate) {
    var v;
    if (dt.getFullYear() === A.ano && dt.getMonth() === A.mes) v = vermelho_(A, B, dt.getDate());
    else v = ehVermelhoData_(dt);
    if ((v ? 1 : 0) === tipo) n++;
    dt = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + 1);
  }
  return n;
}

function apiMilitar(p, aplicar) {
  var sh = ss_().getSheetByName(p.aba);
  if (!sh) throw new Error('Aba "' + p.aba + '" não encontrada.');
  var nome = String(p.nome || '').trim().toUpperCase();
  if (!nome) throw new Error('Informe o nome de guerra.');
  if (CFG.GRADUACOES.indexOf(p.grad) < 0) throw new Error('Graduação inválida.');
  if (CFG.SUBUNIDADES.indexOf(p.sub) < 0) throw new Error('Subunidade inválida.');
  if (!p.escalas || !p.escalas.length) throw new Error('Marque ao menos uma escala.');
  var A = lerAba_(sh), E = p.grad + ' ' + nome, key = norm_(E), rk = rankGrad_(E), planos = [], linhas = [];

  p.escalas.forEach(function (e) {
    var bi = -1;
    A.blocos.forEach(function (B, i) { if (B.hdr === e.hdr) bi = i; });
    if (bi < 0) throw new Error('Escala não encontrada.');
    var B = A.blocos[bi], R0 = B.rows[0];
    if (B.rows.some(function (R) { return R.key === key; })) throw new Error('"' + E + '" já consta em ' + B.titulo + '.');
    var apos;
    if (e.pos === 'auto' || e.pos === '' || e.pos == null) {
      apos = B.wk;
      B.rows.forEach(function (R) { if (rankGrad_(R.nome) <= rk) apos = R.r; });
    } else apos = Number(e.pos);
    var avisos = [], fi = [null, null];
    var primeiros = [null, null];
    for (var d = 1; d <= A.nDias; d++) {
      if (B.kind === 'qg' || !participa_(A, B, R0, d)) continue;
      var t = vermelho_(A, B, d) ? 1 : 0;
      if (primeiros[t] == null) primeiros[t] = d;
    }
    [0, 1].forEach(function (t) {
      var D = primeiros[t];
      if (D == null) return;
      if (e.nunca) {
        fi[t] = 31; /* nunca serviu: folga 31 nas duas escalas, a partir do dia da inclusão */
      } else {
        var iso = t === 0 ? e.ultPreta : e.ultVerm;
        if (!iso) throw new Error('Informe a data do último serviço (' + (t ? 'vermelho' : 'dia útil') + ') em ' + B.titulo + ' ou marque "nunca serviu".');
        var ult = parseIso_(iso), alvo = dataDia_(A, D);
        if (ult >= alvo) { avisos.push('data do último serviço (' + (t ? 'vermelho' : 'útil') + ') não é anterior ao mês'); fi[t] = 0; }
        else fi[t] = contarTipo_(A, B, ult, alvo, t);
      }
    });
    var ref = B.rows.filter(function (R) { return R.r === apos; })[0];
    var inicio = 1;
    if (e.nunca) {
      if (p.inicio) inicio = Math.min(A.nDias + 1, Math.max(1, diaDeData_(A, p.inicio, true)));
      else { var pm = posMes_(A); inicio = pm === 0 ? new Date().getDate() : 1; }
    }
    planos.push({ bi: bi, apos: apos, fi: fi, primeiros: primeiros, nunca: !!e.nunca, inicio: inicio });
    linhas.push('▸ ' + B.titulo + ': entra ' + (ref ? 'após ' + ref.nome : 'no topo') + ' (linha ' + (apos + 2) + '); folga inicial: dia útil ' +
      (fi[0] == null ? '—' : fi[0]) + ' · vermelho ' + (fi[1] == null ? '—' : fi[1]) + (e.nunca ? ' · nunca serviu: "***" até o dia ' + (inicio - 1) + ', folga 31 a partir do dia ' + inicio : '') +
      (B.kind === 'qg' ? ' · QG: células ficam em branco até carregar a Guarnição' : '') +
      (avisos.length ? ' ⚠ ' + avisos.join('; ') : ''));
  });

  if (aplicar) {
    planos.sort(function (a, b) { return b.apos - a.apos; }); /* de baixo para cima mantém os índices válidos */
    planos.forEach(function (pl) { inserirMilitar_(A, pl, p, E); });
    SpreadsheetApp.flush();
  }
  return (aplicar ? '✅ MILITAR ADICIONADO: ' : '🔎 VERIFICAÇÃO: ') + E + ' (' + p.sub + ')\n\n' + linhas.join('\n') +
    (aplicar ? '\n\nNº de ordem (coluna C) recalculado pelo tamanho do grupo de cada escala.' : '');
}

function inserirMilitar_(A, pl, p, E) {
  var sh = A.sh, B = A.blocos[pl.bi], R0 = B.rows[0], n = A.nDias;
  sh.insertRowAfter(pl.apos + 1);
  var nr = pl.apos + 2; /* nº da nova linha (1-based) */
  /* formatação da linha inteira (contornos, fontes, alinhamento) copiada da linha vizinha da escala */
  var vizFmt = null;
  B.rows.forEach(function (R) { if (R.r <= pl.apos) vizFmt = R; });
  var refFmt = vizFmt || B.rows[0], refLin = refFmt.r <= pl.apos ? refFmt.r + 1 : refFmt.r + 2, ultCol = colDia_(1) + n;
  sh.getRange(refLin, 1, 1, ultCol).copyTo(sh.getRange(nr, 1, 1, ultCol), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  sh.getRange(nr, 4).setValue(p.sub);
  sh.getRange(nr, 5).setValue(E);
  /* SU: copia a formatação completa (cor, fonte e contorno) de uma célula da mesma escala */
  var mod = null, viz = null;
  B.rows.forEach(function (R) { if (!mod && R.sub === p.sub) mod = R; if (R.r <= pl.apos) viz = R; });
  var base = mod || viz || B.rows[0];
  var baseLin = base.r <= pl.apos ? base.r + 1 : base.r + 2; /* a linha inserida desloca as de baixo */
  sh.getRange(baseLin, 4).copyTo(sh.getRange(nr, 4), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  if (!mod) {
    var modelo = null;
    A.blocos.forEach(function (b) { b.rows.forEach(function (R) { if (!modelo && R.sub === p.sub) modelo = R; }); });
    if (modelo) sh.getRange(nr, 4).setBackground(A.bgs[modelo.r][3]).setFontColor(A.fgs[modelo.r][3]);
  }
  var f = [], bg = [], fg = [], ultimo = [-1, -1];
  for (var d = 1; d <= n; d++) {
    var t = vermelho_(A, B, d) ? 1 : 0;
    bg.push(t ? CFG.COR.VERMELHO : CFG.COR.BRANCO); fg.push(CFG.COR.PRETO);
    if (B.kind === 'qg' || !participa_(A, B, R0, d)) { f.push(''); continue; }
    if (pl.nunca && d < pl.inicio) { f.push('***'); bg[bg.length - 1] = CFG.COR.SEM_FOLGA; continue; }
    if (ehPar_(B) && ehSegundoPar_(A, B, d) && f[d - 2] !== '' && f[d - 2] !== '***') { f.push('=' + a1_(nr - 1, colDia_(d - 1))); ultimo[t] = d; continue; }
    if (ultimo[t] < 0) f.push(pl.fi[t] == null ? 0 : pl.fi[t]);
    else f.push('=' + a1_(nr - 1, colDia_(ultimo[t])) + '+1');
    ultimo[t] = d;
  }
  var rg = sh.getRange(nr, colDia_(1) + 1, 1, n);
  rg.setValues([f]).setBackgrounds([bg]).setFontColors([fg]);
  renumerarOrdem_(A, pl, nr);
}

/**
 * Recalcula o nº de ordem (coluna C) do bloco depois da inclusão.
 * O tamanho do grupo K é o nº de militares por número já existente na escala
 * (ex.: CB DIA 4 por dia: 1-1-1-1, 2-2-2-2...). Linhas com C não numérico ("-") são ignoradas.
 * Onde havia fórmula (=C anterior +1) o padrão de fórmula é mantido.
 */
function renumerarOrdem_(A, pl, nr) {
  var sh = A.sh, B = A.blocos[pl.bi], apos = pl.apos;
  var linhas = B.rows.map(function (R) {
    return { r1: R.r <= apos ? R.r + 1 : R.r + 2, n: num_(A.vals[R.r][2]), f: A.forms[R.r][2] !== '' };
  });
  var cont = {}, K = 1, mx = 0;
  linhas.forEach(function (l) { if (l.n != null) cont[l.n] = (cont[l.n] || 0) + 1; });
  Object.keys(cont).forEach(function (k) { if (cont[k] > mx) { mx = cont[k]; K = cont[k]; } });
  var viz = null;
  linhas.forEach(function (l) { if (l.r1 < nr) viz = l; });
  var vizinha = viz || linhas[0];
  linhas.push({ r1: nr, n: 0, f: vizinha ? vizinha.f : false });
  linhas.sort(function (a, b) { return a.r1 - b.r1; });
  var k = 0, ant = null;
  linhas.forEach(function (l) {
    if (l.n == null) return;
    var alvo = Math.floor(k / K) + 1;
    k++;
    var cel = sh.getRange(l.r1, 3);
    if (l.f && ant) cel.setFormula(alvo === ant.t ? '=C' + ant.r1 : '=C' + ant.r1 + '+1');
    else cel.setValue(alvo);
    ant = { r1: l.r1, t: alvo };
  });
}

/* ============================================================ ABAS MENSAIS */
function apiCriarAbas(mm, aaaa) {
  var nomes = criarAbasMes_(Number(mm) - 1, Number(aaaa));
  return 'Criadas: ' + nomes.join(' e ') + '.' + (INFO_PEND_.length ? '\n\nAfastamentos pendentes lançados:\n' + INFO_PEND_.join('\n') : '') +
    '\nDigite os zeros/impedimentos do mês, depois use "Adicionar serviços".';
}

function mnuCriarAbasProximoMes() {
  var ui = SpreadsheetApp.getUi(), hoje = new Date();
  var alvo = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
  try { ui.alert('Abas do próximo mês', apiCriarAbas(alvo.getMonth() + 1, alvo.getFullYear()), ui.ButtonSet.OK); }
  catch (e) { ui.alert('Não foi possível criar as abas', e.message, ui.ButtonSet.OK); }
}

var INFO_PEND_ = [];

function criarAbasMes_(mes, ano) {
  var ss = ss_(), tipos = [CFG.TIPO_GRAD, CFG.TIPO_CNDT], criadas = [];
  var mAnt = (mes + 11) % 12, anoAnt = mes === 0 ? ano - 1 : ano;
  tipos.forEach(function (t) {
    if (ss.getSheetByName(CFG.MESES[mes] + ' ' + t)) throw new Error('A aba "' + CFG.MESES[mes] + ' ' + t + '" já existe.');
    if (!ss.getSheetByName(CFG.MESES[mAnt] + ' ' + t)) throw new Error('A aba base "' + CFG.MESES[mAnt] + ' ' + t + '" não existe.');
  });
  var base = 0; /* as abas novas ficam à direita das abas do mês vigente (Grad, depois Cndt e Praia) */
  tipos.forEach(function (t) { base = Math.max(base, ss.getSheetByName(CFG.MESES[mAnt] + ' ' + t).getIndex()); });
  try {
    tipos.forEach(function (t, ti) {
      var prev = ss.getSheetByName(CFG.MESES[mAnt] + ' ' + t);
      var novo = prev.copyTo(ss);
      criadas.push(novo);
      novo.setName(CFG.MESES[mes] + ' ' + t);
      novo.showSheet();
      ss.setActiveSheet(novo);
      ss.moveActiveSheet(base + 1 + ti);
      montarAbaNova_(novo, prev, mes, ano, anoAnt);
    });
  } catch (e) {
    criadas.forEach(function (s) { try { ss.deleteSheet(s); } catch (x) { /* ignora */ } });
    throw e;
  }
  SpreadsheetApp.flush();
  INFO_PEND_ = [];
  try { INFO_PEND_ = aplicarPendencias_(criadas, mes, ano); } catch (e) { INFO_PEND_ = ['ERRO nas pendências: ' + e.message]; }
  SpreadsheetApp.flush();
  return criadas.map(function (s) { return s.getName(); });
}

function tipoDataVermelho_(ano, mes, d) { return ehVermelhoData_(new Date(ano, mes, d)); }

function participaNovo_(B, w) {
  if (B.kind === 'qg') return false;
  if (B.kind === 'par3') return w !== 1;
  if (B.kind === 'par1') return w === 6 || w === 0;
  return true;
}

function escreverCabecalho_(sh, A, hIdx, mes, ano, n, comoData, corNum) {
  var F1 = colDia_(1) + 1, nums = [], dias = [], bgW = [], fgW = [];
  for (var d = 1; d <= n; d++) {
    var dt = new Date(ano, mes, d);
    if (comoData) nums.push(d === 1 ? dt : '=' + a1_(hIdx, colDia_(d - 1)) + '+1');
    else nums.push(d);
    dias.push(CFG.DIAS[dt.getDay()]);
    bgW.push(ehVermelhoData_(dt) ? CFG.COR.VERMELHO : CFG.COR.CINZA_DIA);
  }
  sh.getRange(hIdx + 1, F1, 1, n).setValues([nums]);
  if (corNum) sh.getRange(hIdx + 1, F1, 1, n).setBackground(corNum);
  sh.getRange(hIdx + 2, F1, 1, n).setValues([dias]).setBackgrounds([bgW]);
}

/* cor das células de um dia em que o bloco não tem serviço (ex.: segunda no Condutor), copiada de um dia igual (mesmo dia da semana e tipo) da aba anterior */
function corDiaSemServico_(P, PB, PR, anoAnt, mes, w, t) {
  var R = PR || (PB && PB.rows[0]);
  if (!PB || !R) return null;
  var mAnt = (mes + 11) % 12;
  for (var x = 1; x <= P.nDias; x++) {
    if (new Date(anoAnt, mAnt, x).getDay() !== w || (vermelho_(P, PB, x) ? 1 : 0) !== t || participa_(P, PB, R, x)) continue;
    return P.bgs[R.r][colDia_(x)];
  }
  return null;
}

function montarAbaNova_(novo, prev, mes, ano, anoAnt) {
  var P = lerAba_(prev, undefined, anoAnt);
  var n = new Date(ano, mes + 1, 0).getDate(), diff = n - P.nDias, F1 = colDia_(1) + 1;
  if (diff < 0) novo.deleteColumns(F1 + n, -diff);
  else if (diff > 0) {
    var ult = F1 + P.nDias - 1;
    novo.insertColumnsAfter(ult, diff);
    novo.getRange(1, ult, novo.getMaxRows(), 1).copyTo(novo.getRange(1, ult + 1, novo.getMaxRows(), diff),
      SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  }
  var N = lerAba_(novo, mes, ano);

/* cabeçalho do topo (cinza = escala da Guarnição ainda não carregada) */
  var primeiroBloco = N.blocos.length ? N.blocos[0].hdr : N.vals.length;
  if (N.topo != null) {
    var dm = N.vals[N.topo][colDia_(1)] instanceof Date;
    /* acima do cabeçalho (linhas 1 a 3): sem textos, anotações e mesclagens do mês anterior; nomes das unidades (última linha) voltam ao azul */
    var colsTopo = novo.getMaxColumns() - F1 + 1;
    novo.getRange(1, F1, novo.getMaxRows(), colsTopo).clearNote(); /* anotações do mês anterior não valem no mês novo */
    if (N.topo > 0) {
      var acima = novo.getRange(1, F1, N.topo, colsTopo);
      acima.breakApart().clearContent();
      var uni = novo.getRange(N.topo, F1, 1, colsTopo);
      uni.clear().setBackground(CFG.COR.AZUL);
      novo.getRange(1, F1, N.topo, n).setBorder(true, true, true, true, false, false, CFG.COR.PRETO, SpreadsheetApp.BorderStyle.SOLID);
    }
    escreverCabecalho_(novo, N, N.topo, mes, ano, n, dm, CFG.COR.CINZA_CAB);
/* linhas-resumo do topo (OF DIA, CMT GD ... Gragoatá) */
    var rotImp = {};
    GUARNICAO_MAPA.forEach(function (m) { rotImp[m.rotulo] = true; });
    for (var i = N.topo + 2; i < primeiroBloco; i++) {
      if (diaDe_(N.vals[i][colDia_(1)]) == null || String(N.vals[i].slice(0, 5).join('')).trim() === '') continue;
      var vals = [], lab = '';
      for (var cc = 0; cc <= 4 && !lab; cc++) lab = semAcento_(N.vals[i][cc]);
      for (var d = 1; d <= n; d++) vals.push(d === 1 ? 1 : '=' + a1_(i, colDia_(d - 1)) + '+1');
      var rgS = novo.getRange(i + 1, F1, 1, n).setValues([vals]);
      if (rotImp[lab]) rgS.setBackground(CFG.COR.CINZA_CAB); /* só as linhas que vêm da importação ficam cinza */
    }
  }

  N.blocos.forEach(function (B) {
    var dmB = N.vals[B.hdr][colDia_(1)] instanceof Date;
    var temLaranja = B.kind === 'qg';
    for (var dx = 1; dx <= Math.min(n, P.nDias) && !temLaranja; dx++) temLaranja = String(N.bgs[B.hdr][colDia_(dx)]).toLowerCase() === CFG.COR.LARANJA;
    /* só as datas do cabeçalho ficam cinza (até importar a Guarnição) nos blocos que seguem laranja/azul */
    escreverCabecalho_(novo, N, B.hdr, mes, ano, n, dmB, temLaranja ? CFG.COR.CINZA_CAB : null);
    var PB = null;
    P.blocos.forEach(function (b) { if (b.titulo === B.titulo) PB = b; });
    var M = [], BG = [], FG = [];
    B.rows.forEach(function (R) {
      var linha = [], bgl = [], fgl = [], ult = [-1, -1];
      var PR = null;
      if (PB) PB.rows.forEach(function (r2) { if (r2.key === R.key) PR = r2; });
      for (var d = 1; d <= n; d++) {
        var dt = new Date(ano, mes, d), t = ehVermelhoData_(dt) ? 1 : 0, w = dt.getDay();
        bgl.push(t ? CFG.COR.VERMELHO : CFG.COR.BRANCO); fgl.push(CFG.COR.PRETO);
        if (!participaNovo_(B, w)) {
          linha.push('');
          if (B.kind !== 'qg' && !t) bgl[d - 1] = corDiaSemServico_(P, PB, PR, anoAnt, mes, w, t) || bgl[d - 1]; /* dia sem serviço: mesma cor da aba anterior */
          continue;
        }
        var seg = ehPar_(B) && (B.kind === 'par3' ? (w === 3 || w === 5 || w === 0) : w === 0);
        if (seg && d > 1 && linha[d - 2] !== '') { linha.push('=' + a1_(R.r, colDia_(d - 1))); ult[t] = d; continue; }
        if (ult[t] > 0) { linha.push('=' + a1_(R.r, colDia_(ult[t])) + '+1'); ult[t] = d; continue; }
        var ref = null;
        if (PB && PR) {
          for (var x = P.nDias; x >= 1; x--) {
            if (vermelho_(P, PB, x) === !!t && participa_(P, PB, PR, x)) { ref = a1_(PR.r, colDia_(x)); break; }
          }
        }
        linha.push(ref ? "='" + P.nome + "'!" + ref + '+1' : 1);
        ult[t] = d;
      }
      M.push(linha); BG.push(bgl); FG.push(fgl);
    });
    if (!M.length) return;
    var rg = novo.getRange(B.rows[0].r + 1, F1, M.length, n);
    rg.clearNote().setValues(M).setBackgrounds(BG).setFontColors(FG);
  });
}

/* ----- gatilho */
function textoHora_(h) { return ('0' + h).slice(-2) + ':00'; }

function mnuDefinirGatilho() {
  var atual = JSON.parse(PropertiesService.getDocumentProperties().getProperty('GATILHO') || 'null');
  var dias = '', horas = '', i;
  for (i = 1; i <= 28; i++) dias += '<option value="' + i + '">dia ' + i + '</option>';
  for (i = 0; i <= 23; i++) horas += '<option value="' + i + '"' + (i === CFG.HORA_GATILHO ? ' selected' : '') + '>' + textoHora_(i) + '</option>';
  var amanha = new Date(); amanha.setDate(amanha.getDate() + 1);
  var h = '<style>.op{display:block;border:1px solid #ddd;border-radius:8px;padding:10px 12px;margin:8px 0;cursor:pointer}.op:has(input:checked){border-color:#1a73e8;background:#e8f0fe}' +
    '.op small{display:block;color:#5f6368;margin:2px 0 0 22px}.op select,.op input[type=date]{margin-left:6px}.top{color:#5f6368;margin:0 0 6px}</style>' +
    '<h3>Criação automática das abas do mês</h3>' +
    '<p class="top">' + (atual ? 'Gatilho atual: <b>' + esc_(atual.texto) + '</b>' : 'Nenhum gatilho definido.') + '</p>' +
    '<label class="op"><input type="radio" name="t" value="DIA" checked> Todo mês, no <select id="dia">' + dias + '</select><small>Cria as abas do mês seguinte.</small></label>' +
    '<label class="op"><input type="radio" name="t" value="DATA"> Uma única vez, em <input type="date" id="data" value="' + isoData_(amanha) + '"><small>Cria as abas do mês seguinte, na data escolhida.</small></label>' +
    '<label class="op"><input type="radio" name="t" value="PDU"> No primeiro dia útil de cada mês<small>Cria as abas do mês corrente, se ainda não existirem.</small></label>' +
    '<label style="display:block;margin:10px 0">Horário: <select id="hora">' + horas + '</select></label>' +
    '<button class="p" onclick="salvar()">Salvar gatilho</button><button onclick="google.script.host.close()">Cancelar</button><pre id="out" style="display:none"></pre>' +
    '<script>function $(i){return document.getElementById(i)}' +
    'function salvar(){var t=document.querySelector("input[name=t]:checked").value;var p={tipo:t,dia:$("dia").value,data:$("data").value,hora:$("hora").value};' +
    '$("out").style.display="block";$("out").textContent="Salvando…";google.script.run.withSuccessHandler(function(m){$("out").textContent="✅ "+m;setTimeout(function(){google.script.host.close()},1800)})' +
    '.withFailureHandler(function(e){$("out").textContent="ERRO: "+e.message}).apiDefinirGatilho(p)}</script>';
  mostrarHtml_(h, 'Definir gatilho', 460, 470);
}

function apiDefinirGatilho(p) {
  var hora = Number(p.hora), cfg;
  if (isNaN(hora) || hora < 0 || hora > 23) throw new Error('Horário inválido.');
  if (p.tipo === 'DIA') cfg = { tipo: 'DIA', valor: Number(p.dia), hora: hora, texto: 'todo dia ' + Number(p.dia) + ', às ' + textoHora_(hora) };
  else if (p.tipo === 'DATA') {
    if (!p.data) throw new Error('Escolha a data.');
    var dt = parseIso_(p.data); dt.setHours(hora, 0, 0, 0);
    if (dt <= new Date()) throw new Error('A data e o horário precisam estar no futuro.');
    cfg = { tipo: 'DATA', valor: dt.getTime(), hora: hora, texto: 'uma vez, em ' + fmtData_(dt) + ' às ' + textoHora_(hora) };
  } else if (p.tipo === 'PDU') cfg = { tipo: 'PDU', valor: 0, hora: hora, texto: 'primeiro dia útil de cada mês, às ' + textoHora_(hora) };
  else throw new Error('Escolha uma das opções.');
  removerGatilhos_();
  var tb = ScriptApp.newTrigger('gatilhoCriarAbas').timeBased();
  if (cfg.tipo === 'DIA') tb.onMonthDay(cfg.valor).atHour(hora).create();
  else if (cfg.tipo === 'DATA') tb.at(new Date(cfg.valor)).create();
  else tb.everyDays(1).atHour(hora).create();
  PropertiesService.getDocumentProperties().setProperty('GATILHO', JSON.stringify(cfg));
  return 'Gatilho definido: ' + cfg.texto + '.';
}

function removerGatilhos_() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'gatilhoCriarAbas') ScriptApp.deleteTrigger(t); });
}

function ehPrimeiroDiaUtil_(dt) {
  for (var d = 1; d <= 31; d++) {
    var x = new Date(dt.getFullYear(), dt.getMonth(), d);
    if (!ehVermelhoData_(x)) return x.getDate() === dt.getDate();
  }
  return false;
}

function gatilhoCriarAbas() {
  var props = PropertiesService.getDocumentProperties(), cfg = JSON.parse(props.getProperty('GATILHO') || 'null');
  if (!cfg) return;
  var hoje = new Date(), alvo;
  if (cfg.tipo === 'PDU') {
    if (!ehPrimeiroDiaUtil_(hoje)) return;
    alvo = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  } else alvo = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
  var msg;
  try {
    var jaExiste = ss_().getSheetByName(CFG.MESES[alvo.getMonth()] + ' ' + CFG.TIPO_GRAD) ||
      ss_().getSheetByName(CFG.MESES[alvo.getMonth()] + ' ' + CFG.TIPO_CNDT);
    if (jaExiste) msg = 'Abas de ' + CFG.MESES[alvo.getMonth()] + ' já existiam — nada feito.';
    else { criarAbasMes_(alvo.getMonth(), alvo.getFullYear()); msg = 'Abas de ' + CFG.MESES[alvo.getMonth()] + '/' + alvo.getFullYear() + ' criadas.' + (INFO_PEND_.length ? ' Pendências: ' + INFO_PEND_.join(' | ') : ''); }
  } catch (e) { msg = 'ERRO: ' + e.message; }
  cfg.ultima = fmtData_(hoje) + ' — ' + msg;
  if (cfg.tipo === 'DATA') { cfg.texto += ' (já executado)'; removerGatilhos_(); }
  props.setProperty('GATILHO', JSON.stringify(cfg));
}

function mnuVerGatilho() {
  var ui = SpreadsheetApp.getUi(), cfg = JSON.parse(PropertiesService.getDocumentProperties().getProperty('GATILHO') || 'null');
  if (!cfg) { ui.alert('Gatilho', 'Nenhum gatilho definido.', ui.ButtonSet.OK); return; }
  var r = ui.alert('Gatilho de criação de abas', 'Configuração: ' + cfg.texto + '\nÚltima execução: ' + (cfg.ultima || 'nunca') +
    '\n\nDesativar o gatilho?', ui.ButtonSet.YES_NO);
  if (r === ui.Button.YES) { removerGatilhos_(); PropertiesService.getDocumentProperties().deleteProperty('GATILHO'); ui.alert('Gatilho desativado.'); }
}

/* ============================================================ HTML DAS CAIXAS */
var JS_COMUM_ = '<script>' +
  'function $(i){return document.getElementById(i)}' +
  'function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;")}' +
  'function falha(e){var o=$("out");o.style.display="block";o.className="erro";o.textContent="ERRO: "+(e&&e.message?e.message:e)}' +
  'function selMes(d,id){var s=$(id);d.meses.forEach(function(m){var o=document.createElement("option");o.value=m.id;o.text=m.id;' +
  'if(m.id===d.mesAtual)o.selected=true;s.appendChild(o)})}' +
  '</script>';

function htmlServicos_(modo) {
  var head =
    '<style>.sub{color:#5f6368;margin:-2px 0 10px}.esc{display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:1px solid #f1f3f4;padding:5px 2px}.esc:last-child{border:0}\n' +
    '.esc label{display:flex;align-items:center;gap:8px;margin:0;flex:1;cursor:pointer}.esc input[type=checkbox]{accent-color:#1a73e8;width:15px;height:15px}\n' +
    '.gh{font-size:11px;text-transform:uppercase;color:#5f6368;letter-spacing:.4px;padding:6px 2px 2px}.vg{display:flex;align-items:center;gap:5px}.vg input{width:54px;text-align:center}\n' +
    '.tag{font-size:10px;background:#f1f3f4;color:#5f6368;border-radius:8px;padding:1px 7px}.stk{position:sticky;bottom:0;background:#fff;padding:6px 0 2px;margin-top:6px}</style>\n' +
    '<h3 id="ttl"></h3><p class="sub" id="sub"></p>\n' +
    '<div class="bar"><b class="lb">Mês</b><select id="mes" onchange="carrega()"></select>\n' +
    '<label class="chip"><input type="checkbox" id="tG" checked onchange="carrega()">Grad</label><label class="chip"><input type="checkbox" id="tC" checked onchange="carrega()">Cndt e Praia</label></div>\n' +
    '<div class="bar"><b class="lb">Período</b><input type="date" id="de"><span class="mu">até</span><input type="date" id="ate">\n' +
    '<span class="lk" onclick="setP(\'rest\')">restante do mês</span><span class="lk" onclick="setP(\'sem\')">7 dias</span><span class="lk" onclick="setP(\'mes\')">mês inteiro</span></div>\n' +
    '<details open><summary>Escalas <span class="mu" id="nb"></span></summary><div id="blocos" class="lista" style="max-height:230px">Carregando…</div>\n' +
    '<div style="margin-top:6px"><span class="lk" onclick="marca(true)">marcar todas</span><span class="lk" onclick="marca(false)">limpar</span></div></details>\n' +
    '<details open id="optAdd"><summary>Regras</summary>\n' +
    '<div class="bar"><b class="lb" style="min-width:0">Folga mínima</b><input type="number" id="folga" value="{{FOLGA}}" style="width:70px"> horas</div>\n' +
    '<label class="opt"><input type="checkbox" id="evOutra" checked> Não escalar quem já está de serviço em outra escala no dia</label>\n' +
    '<label class="opt"><input type="checkbox" id="evAdj" checked> Não escalar quem está de serviço no dia anterior/seguinte (outra escala)</label>\n' +
    '<label class="opt"><input type="checkbox" id="relaxar"> Se faltar militar, aceitar intervalo menor que a folga mínima (avisa no resumo)</label></details>\n' +
    '<details open id="optDel"><summary>Opções</summary>\n' +
    '<label class="opt"><input type="checkbox" id="verdes" checked> Retirar também os “0” verdes (serviço em outra escala)</label>\n' +
    '<label class="opt"><input type="checkbox" id="notas" checked> Preservar as anotações das células</label>\n' +
    '<small>Cores de afastamento nunca são apagadas.</small></details>\n' +
    '<div class="stk"><button class="p" id="bap" onclick="run(true)"></button><button onclick="run(false)">Verificar</button></div>\n' +
    '<pre id="out" style="display:none"></pre>\n' +
    '\n';
  var tail =
    '<script>\n' +
    'var MODO="{{MODO}}",D=null,ADD=MODO==="add";\n' +
    '$("ttl").textContent=ADD?"Adicionar serviços":"Retirar serviços";\n' +
    '$("sub").textContent=ADD?"Escolhe quem cumpre cada serviço pela maior folga e marca o “0” na escala.":"Retira os “0” das escalas marcadas, de hoje em diante; a fórmula de folga volta.";\n' +
    '$("optAdd").style.display=ADD?"block":"none";$("optDel").style.display=ADD?"none":"block";$("bap").textContent=ADD?"Aplicar":"Retirar";\n' +
    'google.script.run.withSuccessHandler(function(d){selMes(d,"mes");carrega()}).withFailureHandler(falha).apiAbas();\n' +
    'function carrega(){var t=[];if($("tG").checked)t.push("Grad");if($("tC").checked)t.push("Cndt e Praia");$("blocos").textContent="Carregando…";\n' +
    ' google.script.run.withSuccessHandler(render).withFailureHandler(falha).apiBlocos($("mes").value,t)}\n' +
    'function iso(d){return d.toISOString().substring(0,10)}\n' +
    'function mais(s,n){var a=new Date(s+"T12:00:00");a.setDate(a.getDate()+n);return iso(a)}\n' +
    'function setP(t){if(!D)return;var h=D.hoje,i=D.ini,f=D.fim,ini=(h>=i&&h<=f)?(ADD&&h<f?mais(h,1):h):i;\n' +
    ' if(t==="mes"){$("de").value=i;$("ate").value=f}else if(t==="sem"){$("de").value=ini;var e=mais(ini,6);$("ate").value=e>f?f:e}else{$("de").value=ini;$("ate").value=f}}\n' +
    'function render(r){D=r;setP("rest");var x="",tp="";\n' +
    ' r.blocos.forEach(function(b,k){if(b.tipo!==tp){tp=b.tipo;x+="<div class=gh>"+esc(tp)+(ADD&&k===0?"<span style=\\"float:right\\">militares por dia</span>":"")+"</div>"}\n' +
    '  x+="<div class=esc><label><input type=checkbox id=b"+k+(ADD?" checked":"")+" onchange=cont()><span>"+esc(b.titulo)+"</span>"+\n' +
    '  (b.kind==="par3"||b.kind==="par1"?" <span class=tag>par de 2 dias</span>":"")+(b.kind==="qg"?" <span class=tag>só dias laranja</span>":"")+"</label>"+\n' +
    '  (ADD?"<span class=vg><input type=number min=0 id=v"+k+" value="+b.vagas+"></span>":"")+"</div>"});\n' +
    ' $("blocos").innerHTML=x||"Nenhuma escala encontrada.";cont()}\n' +
    'function cont(){if(!D)return;var n=0;D.blocos.forEach(function(b,k){if($("b"+k).checked)n++});$("nb").textContent="("+n+" de "+D.blocos.length+")"}\n' +
    'function marca(v){D.blocos.forEach(function(b,k){$("b"+k).checked=v});cont()}\n' +
    'function run(ap){var p={mesId:$("mes").value,de:$("de").value,ate:$("ate").value,blocos:[]};\n' +
    ' if(ADD){p.folgaH=$("folga").value;p.evOutra=$("evOutra").checked;p.evAdj=$("evAdj").checked;p.relaxar=$("relaxar").checked}else{p.verdes=$("verdes").checked;p.notas=$("notas").checked}\n' +
    ' D.blocos.forEach(function(b,k){if($("b"+k).checked)p.blocos.push({aba:b.aba,hdr:b.hdr,vagas:ADD?$("v"+k).value:0})});\n' +
    ' if(!p.blocos.length){falha("Marque ao menos uma escala.");return}\n' +
    ' if(ap&&!confirm(ADD?"Aplicar os serviços na planilha?":"Retirar os serviços marcados?"))return;\n' +
    ' var o=$("out");o.style.display="block";o.className="";o.textContent="Processando… (pode levar alguns minutos)";\n' +
    ' google.script.run.withSuccessHandler(function(t){o.textContent=t}).withFailureHandler(falha).apiServicos(MODO,p,ap)}\n' +
    '</script>\n';
  return (head + JS_COMUM_ + tail).replace('{{MODO}}', function () { return modo; }).replace('{{FOLGA}}', function () { return String(CFG.FOLGA_MIN_H); });
}

function htmlAfastamento_() {
  var cores = { ferias: CFG.LEGENDA_PADRAO.ferias.bg, licenca: CFG.LEGENDA_PADRAO.licenca.bg, missao: CFG.LEGENDA_PADRAO.missao.bg, baixado: CFG.LEGENDA_PADRAO.baixado.bg,
    concurso: CFG.LEGENDA_PADRAO.concurso.bg, exame: CFG.LEGENDA_PADRAO.exame.bg, fora: CFG.LEGENDA_PADRAO.fora.bg };
  var tipos = JSON.stringify(Object.keys(TIPOS_AFAST).map(function (k) { return { k: k, l: TIPOS_AFAST[k], c: cores[k] }; }));
  var subs = CFG.SUBUNIDADES.map(function (x) { return '<option>' + x + '</option>'; }).join('');
  var head =
    '<style>.sub{color:#5f6368;margin:-2px 0 10px}.sec{font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#5f6368;margin:12px 0 4px}\n' +
    '.dot{display:inline-block;width:11px;height:11px;border-radius:50%;border:1px solid #0002}.mil{display:flex;align-items:center;gap:8px;margin:0;padding:4px 2px;border-bottom:1px solid #f1f3f4;cursor:pointer}\n' +
    '.mil input{accent-color:#1a73e8;width:15px;height:15px}.mil small{margin-left:auto}.stk{position:sticky;bottom:0;background:#fff;padding:6px 0 2px;margin-top:6px}</style>\n' +
    '<h3>Adicionar afastamento</h3><p class="sub">Pinta o período na linha do militar com a cor da legenda. Marque vários para um afastamento conjunto.</p>\n' +
    '<div class="sec">Escala</div>\n' +
    '<div class="bar"><select id="mes" onchange="carrega()"></select><label class="chip"><input type="radio" name="tipo" value="Grad" checked onchange="carrega()">Grad</label>\n' +
    '<label class="chip"><input type="radio" name="tipo" value="Cndt e Praia" onchange="carrega()">Cndt e Praia</label><select id="bloco" onchange="lista()" style="max-width:260px"></select></div>\n' +
    '<div class="sec">Militares <span id="nsel" class="mu"></span></div>\n' +
    '<div class="bar"><select id="sub" onchange="lista()"><option value="">todas as SU</option>{{SUBS}}</select><input type="text" id="busca" oninput="lista()" placeholder="buscar nome" style="flex:1"></div>\n' +
    '<div id="mil" class="lista" style="max-height:170px"></div>\n' +
    '<div class="sec">Tipo</div><div class="bar" id="tipos"></div>\n' +
    '<div class="sec">Período</div>\n' +
    '<div class="bar"><input type="date" id="de"><span class="mu">até</span><input type="date" id="ate"><span class="mu" style="margin-left:10px">apresentação</span><input type="date" id="apres"></div>\n' +
    '<label class="opt"><input type="checkbox" id="todas"> Aplicar em todas as escalas do militar nesta aba</label>\n' +
    '<div class="stk"><button onclick="run(false)">Verificar</button><button class="p" onclick="run(true)">Aplicar</button></div>\n' +
    '<pre id="out" style="display:none"></pre>\n' +
    '\n';
  var tail =
    '<script>\n' +
    'var D=null,SEL={},TIPOS={{TIPOS}};\n' +
    '(function(){var h="";TIPOS.forEach(function(t,i){h+="<label class=chip><input type=radio name=tp value="+t.k+(i===0?" checked":"")+"><span class=dot style=\\"background:"+t.c+"\\"></span>"+esc(t.l)+"</label>"});$("tipos").innerHTML=h})();\n' +
    'google.script.run.withSuccessHandler(function(d){selMes(d,"mes");carrega()}).withFailureHandler(falha).apiAbas();\n' +
    'function tipoAba(){return document.querySelector("input[name=tipo]:checked").value}\n' +
    'function carrega(){google.script.run.withSuccessHandler(function(r){D=r;var s=$("bloco");s.innerHTML="";\n' +
    ' r.blocos.forEach(function(b,k){var o=document.createElement("option");o.value=k;o.text=b.titulo;s.appendChild(o)});lista()}).withFailureHandler(falha).apiBlocos($("mes").value,[tipoAba()])}\n' +
    'function lista(){if(!D||!D.blocos.length){$("mil").textContent="Sem escalas.";return}var b=D.blocos[$("bloco").value],q=$("busca").value.toUpperCase(),sb=$("sub").value,x="";\n' +
    ' b.linhas.forEach(function(l){if(sb&&l.sub!==sb)return;if(q&&l.nome.toUpperCase().indexOf(q)<0)return;var k=l.nome.toUpperCase().replace(/\\s+/g," ");\n' +
    ' x+="<label class=mil><input type=checkbox "+(SEL[k]?"checked":"")+" onchange=\\"SEL[this.value]=this.checked;cont()\\" value=\\""+esc(k)+"\\"><span>"+esc(l.nome)+"</span><small>"+esc(l.sub)+"</small></label>"});\n' +
    ' $("mil").innerHTML=x||"<span class=mu>Nenhum militar.</span>";cont()}\n' +
    'function cont(){var n=Object.keys(SEL).filter(function(k){return SEL[k]}).length;$("nsel").textContent=n?"— "+n+" selecionado(s)":""}\n' +
    'function run(ap){var b=D.blocos[$("bloco").value],keys=Object.keys(SEL).filter(function(k){return SEL[k]});\n' +
    ' var p={aba:b.aba,hdr:b.hdr,keys:keys,tipo:document.querySelector("input[name=tp]:checked").value,de:$("de").value,ate:$("ate").value,apres:$("apres").value,todas:$("todas").checked};\n' +
    ' var o=$("out");o.style.display="block";o.className="";o.textContent="Processando…";\n' +
    ' google.script.run.withSuccessHandler(function(t){o.textContent=t}).withFailureHandler(falha).apiAfastamento(p,ap)}\n' +
    '</script>\n';
  return (head + JS_COMUM_ + tail).replace('{{TIPOS}}', function () { return tipos; }).replace('{{SUBS}}', function () { return subs; });
}

function htmlMilitar_() {
  var subs = JSON.stringify(CFG.SUBUNIDADES), grads = JSON.stringify(CFG.GRADUACOES);
  var head =
    '<style>.sub{color:#5f6368;margin:-2px 0 10px}.sec{font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#5f6368;margin:12px 0 4px}\n' +
    '.card2{border:1px solid #e0e0e0;border-radius:10px;margin:6px 0;padding:7px 12px}.card2.on{border-color:#1a73e8;background:#f8fbff}.card2 .h{display:flex;align-items:center;gap:8px;margin:0;cursor:pointer;font-weight:500}\n' +
    '.card2 .h input{accent-color:#1a73e8;width:15px;height:15px}.card2 .b{display:none;margin-top:8px;gap:8px;flex-wrap:wrap;align-items:flex-end}.card2.on .b{display:flex}\n' +
    '.f{display:flex;flex-direction:column;font-size:11px;color:#5f6368;gap:2px}.tag{font-size:10px;background:#f1f3f4;color:#5f6368;border-radius:8px;padding:1px 7px;font-weight:400}\n' +
    '.stk{position:sticky;bottom:0;background:#fff;padding:6px 0 2px;margin-top:6px}</style>\n' +
    '<h3>Adicionar militar</h3><p class="sub">Insere o militar nas escalas marcadas, na posição certa e já com a folga calculada.</p>\n' +
    '<div class="sec">Militar</div>\n' +
    '<div class="bar" id="sus"></div><div class="bar" id="grads"></div>\n' +
    '<div class="bar"><input type="text" id="nome" placeholder="nome de guerra" style="flex:1;max-width:260px"></div>\n' +
    '<div class="sec">Onde</div>\n' +
    '<div class="bar"><select id="mes" onchange="carrega()"></select><label class="chip"><input type="radio" name="tipo" value="Grad" checked onchange="carrega()">Grad</label>\n' +
    '<label class="chip"><input type="radio" name="tipo" value="Cndt e Praia" onchange="carrega()">Cndt e Praia</label>\n' +
    '<span class="mu" style="margin-left:8px">entra em</span><input type="date" id="inicio" title="usado em “nunca serviu”; vazio = hoje"></div>\n' +
    '<div class="sec">Escalas <span class="mu">— marque e informe o último serviço (dia útil e dia vermelho) ou “nunca serviu”</span></div>\n' +
    '<div id="blocos" style="max-height:290px;overflow:auto">Carregando…</div>\n' +
    '<div class="stk"><button onclick="run(false)">Verificar</button><button class="p" id="bad" disabled onclick="run(true)">Adicionar</button></div>\n' +
    '<pre id="out" style="display:none"></pre>\n' +
    '\n';
  var tail =
    '<script>\n' +
    'var D=null,SUS={{SUS}},GRADS={{GRADS}};\n' +
    '(function(){var h="";SUS.forEach(function(s,i){h+="<label class=chip><input type=radio name=sub value=\\""+s+"\\""+(i===0?" checked":"")+">"+s+"</label>"});$("sus").innerHTML=h;\n' +
    ' h="";GRADS.forEach(function(s){h+="<label class=chip><input type=radio name=grad value=\\""+s+"\\""+(s==="SD EP"?" checked":"")+">"+s+"</label>"});$("grads").innerHTML=h})();\n' +
    'google.script.run.withSuccessHandler(function(d){selMes(d,"mes");carrega()}).withFailureHandler(falha).apiAbas();\n' +
    'function tipoAba(){return document.querySelector("input[name=tipo]:checked").value}\n' +
    'function carrega(){$("bad").disabled=true;google.script.run.withSuccessHandler(render).withFailureHandler(falha).apiBlocos($("mes").value,[tipoAba()])}\n' +
    'function render(r){D=r;var x="";\n' +
    ' r.blocos.forEach(function(b,k){var o="<option value=auto>Automática (graduação)</option>";b.linhas.forEach(function(l){o+="<option value="+l.r+">Depois de "+esc(l.nome)+"</option>"});\n' +
    ' x+="<div class=card2 id=c"+k+"><label class=h><input type=checkbox id=b"+k+" onchange=tog("+k+")><span>"+esc(b.titulo)+"</span>"+(b.kind==="qg"?" <span class=tag>QG AD/1</span>":"")+"</label>"+\n' +
    ' "<div class=b><span class=f>Posição<select id=p"+k+">"+o+"</select></span><span class=f>Último serviço útil<input type=date id=u"+k+"></span>"+\n' +
    ' "<span class=f>Último serviço vermelho<input type=date id=r"+k+"></span><label class=chip style=\\"margin-bottom:2px\\"><input type=checkbox id=n"+k+" onchange=nun("+k+")>nunca serviu</label></div></div>"});\n' +
    ' $("blocos").innerHTML=x||"Nenhuma escala encontrada."}\n' +
    'function tog(k){$("c"+k).className="card2"+($("b"+k).checked?" on":"");$("bad").disabled=true}\n' +
    'function nun(k){$("u"+k).disabled=$("n"+k).checked;$("r"+k).disabled=$("n"+k).checked}\n' +
    'function run(ap){var es=[];D.blocos.forEach(function(b,k){if($("b"+k).checked)es.push({hdr:b.hdr,pos:$("p"+k).value,ultPreta:$("u"+k).value,ultVerm:$("r"+k).value,nunca:$("n"+k).checked})});\n' +
    ' if(!es.length){falha("Marque ao menos uma escala.");return}\n' +
    ' var p={inicio:$("inicio").value,aba:D.blocos[0].aba,sub:document.querySelector("input[name=sub]:checked").value,grad:document.querySelector("input[name=grad]:checked").value,nome:$("nome").value,escalas:es};\n' +
    ' var o=$("out");o.style.display="block";o.className="";o.textContent="Processando…";\n' +
    ' google.script.run.withSuccessHandler(function(t){o.textContent=t;$("bad").disabled=ap}).withFailureHandler(function(e){$("bad").disabled=true;falha(e)}).apiMilitar(p,ap)}\n' +
    '</script>\n';
  return (head + JS_COMUM_ + tail).replace('{{SUS}}', function () { return subs; }).replace('{{GRADS}}', function () { return grads; });
}
