/**
 * MÓDULO BRIGADA 1.0 — Modulo_Auditagem.gs
 * Auditagem: verificação de serviços tirados (quantitativo). Só LÊ as escalas; nada é alterado nelas.
 * Depende de Codigo.gs e Modulo_Escala.gs.
 */

function mnuQuantitativo() { mostrarHtml_(htmlQuantitativo_(), 'Verificação de serviços tirados', 760, 700); }

/* Afastamento "estrito": só as cores da legenda (azuis/laranja/verde de serviço NÃO são afastamento) */
function ehAfastLegenda_(A, r, c) {
  var bg = String(A.bgs[r][c]).toLowerCase(), fg = String(A.fgs[r][c]).toLowerCase(), L = A.leg;
  if (bg === L.exame.bg && fg === L.exame.fg) return true;
  var af = ['ferias', 'missao', 'licenca', 'baixado', 'concurso', 'fora'];
  for (var i = 0; i < af.length; i++) if (bg === L[af[i]].bg) return true;
  return false;
}

/** Lista de escalas disponíveis (tipo|título) e militares, a partir das abas dos meses escolhidos. */
function apiQuantitativoOpcoes(meses, tipos) {
  var escalas = {}, ordem = [], militares = {};
  meses.forEach(function (m) {
    tipos.forEach(function (t) {
      var sh = ss_().getSheetByName(m + ' ' + t);
      if (!sh) return;
      var A = lerAba_(sh);
      A.blocos.forEach(function (B) {
        var k = t + '|' + B.titulo;
        if (!escalas[k]) { escalas[k] = { id: k, tipo: t, titulo: B.titulo }; ordem.push(k); }
        B.rows.forEach(function (R) { if (!militares[R.key]) militares[R.key] = { key: R.key, nome: R.nome, sub: R.sub }; });
      });
    });
  });
  return {
    escalas: ordem.map(function (k) { return escalas[k]; }),
    militares: Object.keys(militares).map(function (k) { return militares[k]; })
  };
}

function resolverNomeNota_(nota, chaves) {
  var n = semAcento_(String(nota).replace(/\*/g, '')).replace(/[^A-Z0-9 .]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!n) return null;
  var exato = [], fim = [], contem = [];
  chaves.forEach(function (c) {
    var k = semAcento_(c.key);
    if (k === n) exato.push(c);
    else if (k.slice(-(n.length + 1)) === ' ' + n) fim.push(c);
    else if ((' ' + k + ' ').indexOf(' ' + n + ' ') >= 0) contem.push(c);
  });
  var lista = exato.length ? exato : fim.length ? fim : contem;
  var unicos = {};
  lista.forEach(function (c) { unicos[c.key] = c; });
  var ks = Object.keys(unicos);
  return ks.length === 1 ? unicos[ks[0]] : null;
}

/**
 * p: { meses:[ids], tipos:['Grad','Cndt e Praia'], escalas:['Grad|CB DIA',...], de, ate, futuros, trocas, keys:[] }
 * Conta cada "0" de serviço (qualquer cor, exceto cor de afastamento). "0" verde (serviço em outra escala) só entra
 * se a pessoa não tiver "0" próprio no mesmo dia nas escalas escolhidas, para não contar o mesmo serviço duas vezes.
 */
function calcularQuantitativo_(p) {
  var hoje = new Date(), pessoas = {}, avisos = [], naoReconhecidas = 0, periodos = [], escSel = {};
  (p.escalas || []).forEach(function (e) { escSel[e] = true; });
  function pessoa(key, nome, sub) {
    if (!pessoas[key]) pessoas[key] = { key: key, nome: nome, sub: sub || '', proprios: 0, outra: 0, passados: 0, pegos: 0, porEscala: {} };
    return pessoas[key];
  }
  var temCnt = false;
  p.meses.forEach(function (m) {
    (p.tipos || []).forEach(function (t) {
      var sh = ss_().getSheetByName(m + ' ' + t);
      if (!sh) return;
      var A = lerAba_(sh), n = A.nDias;
      var dIni = p.de ? Math.max(1, diaDeData_(A, p.de, true)) : 1;
      var dFim = p.ate ? Math.min(n, diaDeData_(A, p.ate, false)) : n;
      if (!p.futuros) {
        var pm = posMes_(A);
        if (pm < 0) dFim = 0; else if (pm === 0) dFim = Math.min(dFim, hoje.getDate());
      }
      if (dFim < dIni) return;
      periodos.push(A.nome + ' (dias ' + dIni + '–' + dFim + ')');
      var notas = p.trocas ? sh.getRange(1, 1, A.vals.length, A.vals[0].length).getNotes() : null;
      var chaves = [];
      A.blocos.forEach(function (B) { B.rows.forEach(function (R) { chaves.push({ key: R.key, nome: R.nome, sub: R.sub }); }); });
      var donos = {}; /* aba|key|dia -> true (zero próprio) */
      var verdes = [];
      A.blocos.forEach(function (B) {
        if (!escSel[t + '|' + B.titulo]) return;
        B.rows.forEach(function (R) {
          for (var d = dIni; d <= dFim; d++) {
            var c = colDia_(d);
            if (num_(A.vals[R.r][c]) !== 0) continue;
            if (ehAfastLegenda_(A, R.r, c)) continue;
            var pe = pessoa(R.key, R.nome, R.sub), cl = String(A.bgs[R.r][c]).toLowerCase() === A.leg.outra.bg;
            if (cl) { verdes.push({ pe: pe, key: A.nome + '|' + R.key + '|' + d }); continue; }
            donos[A.nome + '|' + R.key + '|' + d] = true;
            pe.proprios++;
            pe.porEscala[B.titulo] = (pe.porEscala[B.titulo] || 0) + 1;
            if (notas && String(notas[R.r][c]).trim()) {
              var tomou = resolverNomeNota_(notas[R.r][c], chaves);
              if (tomou && tomou.key !== R.key) {
                pe.passados++;
                pessoa(tomou.key, tomou.nome, tomou.sub).pegos++;
              } else if (!tomou) naoReconhecidas++;
            }
          }
        });
      });
      verdes.forEach(function (v) { if (!donos[v.key]) v.pe.outra++; });
    });
  });
  var linhas = Object.keys(pessoas).map(function (k) {
    var x = pessoas[k];
    x.total = x.proprios + x.outra - x.passados + x.pegos;
    x.detalhe = Object.keys(x.porEscala).map(function (e) { return e + ': ' + x.porEscala[e]; }).join(' · ');
    return x;
  });
  if (p.keys && p.keys.length) {
    var sel = {};
    p.keys.forEach(function (k) { sel[k] = true; });
    linhas = linhas.filter(function (x) { return sel[x.key]; });
    p.keys.forEach(function (k) { if (!pessoas[k]) linhas.push({ key: k, nome: k, sub: '', proprios: 0, outra: 0, passados: 0, pegos: 0, total: 0, detalhe: '' }); });
  }
  linhas.sort(function (a, b) { return b.total - a.total || (a.nome < b.nome ? -1 : 1); });
  var tot = linhas.map(function (x) { return x.total; });
  var soma = tot.reduce(function (a, b) { return a + b; }, 0);
  var resumo = {
    militares: linhas.length, media: linhas.length ? Math.round(soma / linhas.length * 100) / 100 : 0,
    maximo: linhas.length ? Math.max.apply(null, tot) : 0, minimo: linhas.length ? Math.min.apply(null, tot) : 0,
    periodos: periodos
  };
  resumo.comMaximo = linhas.filter(function (x) { return x.total === resumo.maximo; }).map(function (x) { return x.nome; });
  resumo.comMinimo = linhas.filter(function (x) { return x.total === resumo.minimo; }).map(function (x) { return x.nome; });
  if (p.trocas && naoReconhecidas) avisos.push(naoReconhecidas + ' nota(s) de célula não identificaram um militar único (ex.: "Gragoatá Cal. 12") e foram ignoradas como troca.');
  if (!periodos.length) avisos.push('Nenhuma aba/período dentro do filtro (cheque meses, tipos e "Incluir dias futuros").');
  return { linhas: linhas, resumo: resumo, avisos: avisos, trocas: !!p.trocas };
}

function apiQuantitativo(p) {
  if (!p.meses || !p.meses.length) throw new Error('Marque ao menos um mês.');
  if (!p.escalas || !p.escalas.length) throw new Error('Marque ao menos uma escala.');
  return calcularQuantitativo_(p);
}

/* ---------- exportação (arquivo NOVO na pasta da planilha) */
function matrizQuantitativo_(r) {
  var cab = ['#', 'Militar', 'SU', 'Serviços próprios', 'Em outra escala'];
  if (r.trocas) cab.push('Passados', 'Pegos');
  cab.push('Total', 'Detalhe por escala');
  var m = [cab];
  r.linhas.forEach(function (x, i) {
    var l = [i + 1, x.nome, x.sub, x.proprios, x.outra];
    if (r.trocas) l.push(x.passados, x.pegos);
    l.push(x.total, x.detalhe);
    m.push(l);
  });
  return m;
}

function pastaDaPlanilha_() {
  var arq = DriveApp.getFileById(ss_().getId()), it = arq.getParents();
  return it.hasNext() ? it.next() : DriveApp.getRootFolder();
}

function apiExportarQuantitativo(p, formato) {
  var r = calcularQuantitativo_(p), nome = 'Quantitativo de serviços - ' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HHmm');
  var matriz = matrizQuantitativo_(r), pasta = pastaDaPlanilha_();
  var cabecalho = ['Quantitativo de serviços tirados', 'Período: ' + (r.resumo.periodos.join('; ') || '-'),
    'Militares: ' + r.resumo.militares + ' · média ' + r.resumo.media + ' · máximo ' + r.resumo.maximo + ' · mínimo ' + r.resumo.minimo];
  if (formato === 'sheet') {
    var s2 = SpreadsheetApp.create(nome), sh = s2.getSheets()[0];
    sh.getRange(1, 1, cabecalho.length, 1).setValues(cabecalho.map(function (x) { return [x]; })).setFontWeight('bold');
    sh.getRange(cabecalho.length + 2, 1, matriz.length, matriz[0].length).setValues(matriz);
    sh.getRange(cabecalho.length + 2, 1, 1, matriz[0].length).setFontWeight('bold').setBackground('#d9d9d9');
    DriveApp.getFileById(s2.getId()).moveTo(pasta);
    return { url: s2.getUrl(), nome: nome };
  }
  var doc = DocumentApp.create(nome), body = doc.getBody();
  body.appendParagraph(cabecalho[0]).setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(cabecalho[1]);
  body.appendParagraph(cabecalho[2]);
  var tab = body.appendTable(matriz);
  tab.getRow(0).editAsText().setBold(true);
  doc.saveAndClose();
  var arq = DriveApp.getFileById(doc.getId()), blob, url;
  if (formato === 'pdf') {
    blob = arq.getAs(MimeType.PDF).setName(nome + '.pdf');
  } else {
    var resp = UrlFetchApp.fetch('https://docs.google.com/document/d/' + doc.getId() + '/export?format=docx',
      { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) { arq.setTrashed(true); throw new Error('Falha ao gerar o .docx (HTTP ' + resp.getResponseCode() + ').'); }
    blob = resp.getBlob().setName(nome + '.docx');
  }
  var novo = pasta.createFile(blob);
  arq.setTrashed(true);
  url = novo.getUrl();
  return { url: url, nome: novo.getName() };
}

/* ---------- caixa */
function htmlQuantitativo_() {
  return '<h3>Verificação de serviços tirados</h3>' +
    '<label>Meses: <span id="meses">Carregando…</span></label>' +
    '<label>Abas: <label style="display:inline"><input type="checkbox" id="tG" checked onchange="opcoes()"> Grad</label> ' +
    '<label style="display:inline"><input type="checkbox" id="tC" checked onchange="opcoes()"> Cndt e Praia</label></label>' +
    '<label>Período (opcional, dentro dos meses marcados): de <input type="date" id="de"> até <input type="date" id="ate"></label>' +
    '<label><input type="checkbox" id="fut"> Incluir dias futuros (conta também o planejado)</label>' +
    '<h3>Escalas</h3><div id="escalas" class="lista"></div>' +
    '<label><input type="checkbox" onclick="marcaTodas(this.checked)"> marcar/desmarcar todas</label>' +
    '<h3>Militares</h3><label><input type="radio" name="mil" value="todos" checked onchange="lista()"> todos das escalas marcadas ' +
    '<input type="radio" name="mil" value="alguns" onchange="lista()"> só os que eu escolher</label>' +
    '<div id="mil" class="lista" style="display:none"></div>' +
    '<label><input type="checkbox" id="trocas"> Considerar trocas de serviço (nota da célula: Total = próprios − passados + pegos)</label>' +
    '<button class="p" onclick="gerar()">Gerar quantitativo</button> ' +
    '<span id="exp" style="display:none">Exportar: <button onclick="exporta(\'sheet\')">Planilha Google</button><button onclick="exporta(\'pdf\')">PDF</button><button onclick="exporta(\'docx\')">Word (.docx)</button></span>' +
    '<div id="out"></div>' + JS_COMUM_ +
    '<script>var OP=null,SEL={};' +
    'google.script.run.withSuccessHandler(function(d){var h="";d.meses.forEach(function(m){h+="<label style=\\"display:inline;margin-right:8px\\"><input type=checkbox class=mes value="+m.id+(m.id===d.mesAtual?" checked":"")+" onchange=\\"opcoes()\\"> "+m.id+"</label>"});$("meses").innerHTML=h;opcoes()}).withFailureHandler(falha).apiAbas();' +
    'function meses(){return Array.prototype.slice.call(document.querySelectorAll(".mes")).filter(function(x){return x.checked}).map(function(x){return x.value})}' +
    'function tipos(){var t=[];if($("tG").checked)t.push("Grad");if($("tC").checked)t.push("Cndt e Praia");return t}' +
    'function opcoes(){var m=meses();if(!m.length||!tipos().length){$("escalas").textContent="Marque mês e aba.";return}google.script.run.withSuccessHandler(function(o){OP=o;var h="";o.escalas.forEach(function(e,k){h+="<label><input type=checkbox class=esc id=e"+k+" checked> "+esc(e.tipo)+" — "+esc(e.titulo)+"</label>"});$("escalas").innerHTML=h;lista()}).withFailureHandler(falha).apiQuantitativoOpcoes(m,tipos())}' +
    'function marcaTodas(v){OP.escalas.forEach(function(e,k){$("e"+k).checked=v})}' +
    'function lista(){var alg=document.querySelector("input[name=mil]:checked").value==="alguns";$("mil").style.display=alg?"block":"none";if(!alg||!OP)return;var x="";' +
    'OP.militares.forEach(function(m){x+="<label><input type=checkbox "+(SEL[m.key]?"checked":"")+" onchange=\\"SEL[this.value]=this.checked\\" value=\\""+esc(m.key)+"\\"> "+esc(m.nome)+" <small>"+esc(m.sub)+"</small></label>"});$("mil").innerHTML=x}' +
    'function params(){var es=[];OP.escalas.forEach(function(e,k){if($("e"+k).checked)es.push(e.id)});var alg=document.querySelector("input[name=mil]:checked").value==="alguns";' +
    'return{meses:meses(),tipos:tipos(),escalas:es,de:$("de").value,ate:$("ate").value,futuros:$("fut").checked,trocas:$("trocas").checked,keys:alg?Object.keys(SEL).filter(function(k){return SEL[k]}):[]}}' +
    'function gerar(){$("out").className="";$("out").textContent="Calculando…";$("exp").style.display="none";google.script.run.withSuccessHandler(mostra).withFailureHandler(falha).apiQuantitativo(params())}' +
    'function mostra(r){var s=r.resumo,h="<p><b>"+s.militares+"</b> militar(es) · média <b>"+s.media+"</b> · máximo <b>"+s.maximo+"</b> ("+esc(s.comMaximo.slice(0,6).join(", "))+") · mínimo <b>"+s.minimo+"</b> ("+esc(s.comMinimo.slice(0,6).join(", "))+")</p>";' +
    'if(r.avisos.length)h+="<p class=erro>⚠ "+esc(r.avisos.join(" | "))+"</p>";h+="<small>"+esc(s.periodos.join("; "))+"</small>";' +
    'h+="<table><tr><th>#</th><th>Militar</th><th>SU</th><th>Próprios</th><th>Outra escala</th>"+(r.trocas?"<th>Passados</th><th>Pegos</th>":"")+"<th>Total</th><th>Detalhe</th></tr>";' +
    'r.linhas.forEach(function(x,i){h+="<tr><td>"+(i+1)+"</td><td>"+esc(x.nome)+"</td><td>"+esc(x.sub)+"</td><td>"+x.proprios+"</td><td>"+x.outra+"</td>"+(r.trocas?"<td>"+x.passados+"</td><td>"+x.pegos+"</td>":"")+"<td><b>"+x.total+"</b></td><td><small>"+esc(x.detalhe)+"</small></td></tr>"});' +
    '$("out").innerHTML=h+"</table>";$("exp").style.display="inline"}' +
    'function exporta(f){$("out").insertAdjacentHTML("afterbegin","<p id=ex>Gerando arquivo…</p>");google.script.run.withSuccessHandler(function(r){$("ex").innerHTML="✅ Arquivo criado na pasta da planilha: <a target=_blank href=\\""+r.url+"\\">"+esc(r.nome)+"</a>"}).withFailureHandler(function(e){$("ex").className="erro";$("ex").textContent="ERRO: "+e.message}).apiExportarQuantitativo(params(),f)}' +
    '</script>';
}
