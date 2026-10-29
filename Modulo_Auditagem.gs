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

function resolverNomeNota_(nota, chaves, livre) {
  function limpa(t) { return semAcento_(String(t).replace(/\*/g, '')).replace(/[^A-Z0-9 .]/g, ' ').replace(/\s+/g, ' ').trim(); }
  var n = limpa(nota);
  if (!n) return null;
  var exato = [], fim = [], contem = [];
  chaves.forEach(function (c) {
    var k = limpa(c.key);
    if (k === n) exato.push(c);
    else if (k.slice(-(n.length + 1)) === ' ' + n) fim.push(c);
    else if ((' ' + k + ' ').indexOf(' ' + n + ' ') >= 0) contem.push(c);
  });
  var lista = exato.length ? exato : fim.length ? fim : contem;
  var unicos = {};
  lista.forEach(function (c) { unicos[c.key] = c; });
  var ks = Object.keys(unicos);
  if (ks.length === 1) return unicos[ks[0]];
  /* militar que não consta nas escalas do mês (outra unidade/aba): na prévia, aceita o texto da nota se parecer um nome com graduação */
  if (livre && !ks.length && n.length <= 40 && /^(\d )?(SD|CB|SGT|SUBTEN|ST|TEN|CAP|MAJ|TC|CEL|ASP)( |$)/.test(n)) {
    return { key: n, nome: String(nota).replace(/\*/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase(), livre: true };
  }
  return null;
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
            var peso = ehPar_(B) ? 0.5 : 1; /* par de dias seguidos (Condutor/Praia) = 1 serviço */
            if (cl) { verdes.push({ pe: pe, peso: 1, key: A.nome + '|' + R.key + '|' + d }); continue; }
            donos[A.nome + '|' + R.key + '|' + d] = true;
            pe.proprios += peso;
            pe.porEscala[B.titulo] = (pe.porEscala[B.titulo] || 0) + peso;
            if (notas && String(notas[R.r][c]).trim()) {
              var tomou = resolverNomeNota_(notas[R.r][c], chaves);
              if (tomou && tomou.key !== R.key) {
                pe.passados += peso;
                pessoa(tomou.key, tomou.nome, tomou.sub).pegos += peso;
              } else if (!tomou) naoReconhecidas++;
            }
          }
        });
      });
      verdes.forEach(function (v) { if (!donos[v.key]) v.pe.outra += v.peso; });
    });
  });
  var linhas = Object.keys(pessoas).map(function (k) {
    var x = pessoas[k];
    ['proprios', 'outra', 'passados', 'pegos'].forEach(function (k) { x[k] = Math.round(x[k] * 100) / 100; });
    x.total = Math.round((x.proprios + x.outra - x.passados + x.pegos) * 100) / 100;
    x.detalhe = Object.keys(x.porEscala).map(function (e) { return e + ' ' + Math.round(x.porEscala[e] * 100) / 100; }).join(' · ');
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

function etapa_(nome, fn) { /* devolve a mensagem real do erro, com o nome da etapa */
  try { return fn(); } catch (e) { throw new Error(nome + ': ' + (e && e.message ? e.message : e)); }
}

function apiExportarQuantitativo(p, formato) {
  var r = calcularQuantitativo_(p), nome = 'Quantitativo de serviços - ' +
    Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd HHmm');
  var matriz = matrizQuantitativo_(r);
  var cabecalho = ['Quantitativo de serviços tirados', 'Período: ' + (r.resumo.periodos.join('; ') || '-'),
    'Militares: ' + r.resumo.militares + ' · média ' + r.resumo.media + ' · máximo ' + r.resumo.maximo + ' · mínimo ' + r.resumo.minimo];
  var pasta = null;
  try { pasta = pastaDaPlanilha_(); } catch (e) { pasta = null; } /* sem pasta: o arquivo fica no Meu Drive */
  function guardar(arq) { if (pasta) { try { arq.moveTo(pasta); } catch (e) { /* fica onde foi criado */ } } return arq; }
  var nCol = matriz[0].length;

  if (formato === 'sheet') {
    return etapa_('Planilha', function () {
      var s2 = SpreadsheetApp.create(nome), sh = s2.getSheets()[0];
      sh.setName('Quantitativo');
      sh.getRange(1, 1, cabecalho.length, 1).setValues(cabecalho.map(function (x) { return [x]; })).setFontWeight('bold');
      var topo = cabecalho.length + 2;
      sh.getRange(topo, 1, matriz.length, nCol).setValues(matriz.map(function (l) { return l.map(function (v) { return v == null ? '' : v; }); }));
      sh.getRange(topo, 1, 1, nCol).setFontWeight('bold').setBackground('#d9d9d9');
      sh.getRange(topo, 1, matriz.length, nCol).setBorder(true, true, true, true, true, true, '#bdbdbd', SpreadsheetApp.BorderStyle.SOLID);
      sh.setFrozenRows(topo);
      sh.autoResizeColumns(1, nCol);
      sh.setColumnWidth(nCol, 420);
      sh.getRange(topo + 1, nCol, matriz.length - 1, 1).setWrap(true);
      sh.setColumnWidth(2, Math.max(sh.getColumnWidth(2), 200));
      SpreadsheetApp.flush();
      guardar(DriveApp.getFileById(s2.getId()));
      return { url: s2.getUrl(), nome: nome };
    });
  }

  var docId = etapa_('Documento', function () {
    var doc = DocumentApp.create(nome), body = doc.getBody();
    try { body.setPageWidth(842).setPageHeight(595).setMarginLeft(36).setMarginRight(36).setMarginTop(36).setMarginBottom(36); } catch (e) { /* mantém a página padrão */ }
    body.appendParagraph(cabecalho[0]).setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(cabecalho[1]);
    body.appendParagraph(cabecalho[2]);
    var txt = matriz.map(function (l) { return l.map(function (v) { return v == null ? '' : String(v); }); }); /* appendTable só aceita texto */
    var tab = body.appendTable(txt);
    try {
      tab.setFontSize(9);
      var c0 = tab.getRow(0);
      for (var j = 0; j < nCol; j++) c0.getCell(j).setBackgroundColor('#d9d9d9').editAsText().setBold(true);
    } catch (e) { /* estilo é opcional */ }
    if (body.getNumChildren() > 1 && body.getChild(0).getType() === DocumentApp.ElementType.PARAGRAPH && body.getChild(0).asParagraph().getText() === '') body.removeChild(body.getChild(0));
    doc.saveAndClose();
    return doc.getId();
  });
  var arq = DriveApp.getFileById(docId), blob;
  etapa_('Conversão', function () {
    if (formato === 'pdf') blob = arq.getAs(MimeType.PDF).setName(nome + '.pdf');
    else {
      var resp = UrlFetchApp.fetch('https://docs.google.com/document/d/' + docId + '/export?format=docx',
        { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
      if (resp.getResponseCode() !== 200) throw new Error('HTTP ' + resp.getResponseCode() + ' ao gerar o .docx');
      blob = resp.getBlob().setName(nome + '.docx');
    }
  });
  var novo = etapa_('Gravação', function () { var f = DriveApp.createFile(blob); return guardar(f); });
  try { arq.setTrashed(true); } catch (e) { /* o documento temporário pode ficar */ }
  return { url: novo.getUrl(), nome: novo.getName() };
}

/* ---------- caixa */
function htmlQuantitativo_() {
  var css = '<style>body{margin:0}.bar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:6px 0}' +
    '.chip{display:inline-flex;align-items:center;gap:5px;border:1px solid #dadce0;border-radius:16px;padding:3px 10px;cursor:pointer;margin:0;font-size:12px}' +
    '.chip:has(input:checked){background:#e8f0fe;border-color:#1a73e8;color:#174ea6}.chip input{display:none}' +
    'details{border:1px solid #e0e0e0;border-radius:8px;margin:8px 0;padding:6px 10px}summary{cursor:pointer;font-weight:600;color:#3c4043}' +
    '.cards{display:flex;gap:8px;margin:10px 0}.card{flex:1;border:1px solid #e0e0e0;border-radius:8px;padding:6px 10px}.card b{display:block;font-size:20px;color:#1a73e8}.card span{font-size:11px;color:#5f6368}' +
    '.rk td{border-bottom:1px solid #f1f3f4;padding:4px 6px;vertical-align:middle}.rk tr:nth-child(even) td{background:#fafafa}.rk th{font-size:11px;color:#5f6368;text-transform:uppercase;border-bottom:2px solid #e0e0e0}' +
    '.tb{height:8px;border-radius:4px;background:#1a73e8;display:inline-block;vertical-align:middle;margin-right:6px}.mu{color:#80868b;font-size:11px}.num{font-weight:600}' +
    '.exp{float:right}.exp button{margin:0 0 0 4px;padding:4px 10px;font-size:12px}.pri{margin-top:6px}.lk{color:#1a73e8;cursor:pointer;font-size:12px;margin-left:8px}</style>';
  return css + '<h3 style="margin-top:0">Serviços tirados</h3>' +
    '<div class="bar"><b style="width:56px">Meses</b><span id="meses">…</span></div>' +
    '<div class="bar"><b style="width:56px">Abas</b>' +
    '<label class="chip"><input type="checkbox" id="tG" checked onchange="opcoes()">Grad</label><label class="chip"><input type="checkbox" id="tC" checked onchange="opcoes()">Cndt e Praia</label></div>' +
    '<details><summary>Escalas <span class="mu" id="nEsc"></span></summary><div class="bar" id="escalas"></div>' +
    '<span class="lk" onclick="marcaTodas(true)">todas</span><span class="lk" onclick="marcaTodas(false)">nenhuma</span></details>' +
    '<details><summary>Período, militares e opções</summary>' +
    '<div class="bar">De <input type="date" id="de"> até <input type="date" id="ate"> <span class="mu">(vazio = meses inteiros)</span></div>' +
    '<div class="bar"><label class="chip"><input type="checkbox" id="fut">Incluir dias futuros</label>' +
    '<label class="chip"><input type="checkbox" id="trocas">Considerar trocas de serviço</label></div>' +
    '<div class="bar"><label class="chip"><input type="radio" name="mil" value="todos" checked onchange="lista()">Todos os militares</label>' +
    '<label class="chip"><input type="radio" name="mil" value="alguns" onchange="lista()">Escolher militares</label></div>' +
    '<div id="mil" class="lista" style="display:none"></div></details>' +
    '<button class="p pri" onclick="gerar()">Gerar quantitativo</button><div id="out"></div>' + JS_COMUM_ +
    '<script>var OP=null,SEL={};' +
    'function n(x){x=Math.round(x*10)/10;return String(x).replace(".",",")}' +
    'google.script.run.withSuccessHandler(function(d){var h="";d.meses.forEach(function(m){h+="<label class=chip><input type=checkbox class=mes value="+m.id+(m.id===d.mesAtual?" checked":"")+" onchange=opcoes()>"+m.id+"</label>"});$("meses").innerHTML=h;opcoes()}).withFailureHandler(falha).apiAbas();' +
    'function meses(){return Array.prototype.slice.call(document.querySelectorAll(".mes")).filter(function(x){return x.checked}).map(function(x){return x.value})}' +
    'function tipos(){var t=[];if($("tG").checked)t.push("Grad");if($("tC").checked)t.push("Cndt e Praia");return t}' +
    'function opcoes(){var m=meses();if(!m.length||!tipos().length){$("escalas").textContent="Marque mês e aba.";return}google.script.run.withSuccessHandler(function(o){OP=o;var h="";' +
    'o.escalas.forEach(function(e,k){h+="<label class=chip><input type=checkbox class=esc id=e"+k+" checked onchange=cont()>"+esc(e.tipo==="Grad"?e.titulo:e.titulo+" (C)")+"</label>"});$("escalas").innerHTML=h;cont();lista()}).withFailureHandler(falha).apiQuantitativoOpcoes(m,tipos())}' +
    'function cont(){var t=OP.escalas.length,k=0;OP.escalas.forEach(function(e,i){if($("e"+i).checked)k++});$("nEsc").textContent="("+k+" de "+t+")"}' +
    'function marcaTodas(v){OP.escalas.forEach(function(e,k){$("e"+k).checked=v});cont()}' +
    'function lista(){var alg=document.querySelector("input[name=mil]:checked").value==="alguns";$("mil").style.display=alg?"block":"none";if(!alg||!OP)return;var x="";' +
    'OP.militares.forEach(function(m){x+="<label><input type=checkbox "+(SEL[m.key]?"checked":"")+" onchange=\\"SEL[this.value]=this.checked\\" value=\\""+esc(m.key)+"\\"> "+esc(m.nome)+" <small>"+esc(m.sub)+"</small></label>"});$("mil").innerHTML=x}' +
    'function params(){var es=[];OP.escalas.forEach(function(e,k){if($("e"+k).checked)es.push(e.id)});var alg=document.querySelector("input[name=mil]:checked").value==="alguns";' +
    'return{meses:meses(),tipos:tipos(),escalas:es,de:$("de").value,ate:$("ate").value,futuros:$("fut").checked,trocas:$("trocas").checked,keys:alg?Object.keys(SEL).filter(function(k){return SEL[k]}):[]}}' +
    'function gerar(){$("out").className="";$("out").innerHTML="<p class=mu>Calculando…</p>";google.script.run.withSuccessHandler(mostra).withFailureHandler(falha).apiQuantitativo(params())}' +
    'function mostra(r){var s=r.resumo,mx=Math.max(s.maximo,1),h="<div class=cards><div class=card><b>"+s.militares+"</b><span>militares</span></div><div class=card><b>"+n(s.media)+"</b><span>média</span></div>' +
    '<div class=card><b>"+n(s.maximo)+"</b><span>máximo · "+esc(s.comMaximo.slice(0,2).join(", "))+"</span></div><div class=card><b>"+n(s.minimo)+"</b><span>mínimo · "+esc(s.comMinimo.slice(0,2).join(", "))+"</span></div></div>";' +
    'if(r.avisos.length)h+="<p class=erro>⚠ "+esc(r.avisos.join(" | "))+"</p>";' +
    'h+="<div class=mu>"+esc(s.periodos.join(" · "))+"<span class=exp><button data-f=sheet onclick=exporta(this.dataset.f)>Planilha</button><button data-f=pdf onclick=exporta(this.dataset.f)>PDF</button><button data-f=docx onclick=exporta(this.dataset.f)>Word</button></span></div><div id=ex></div>";' +
    'h+="<table class=rk><tr><th>#</th><th>Militar</th><th>Total</th><th>Detalhe</th></tr>";' +
    'r.linhas.forEach(function(x,i){var d=[];if(x.outra)d.push("em outra escala "+n(x.outra));if(r.trocas&&x.passados)d.push("passou −"+n(x.passados));if(r.trocas&&x.pegos)d.push("pegou +"+n(x.pegos));' +
    'h+="<tr><td class=mu>"+(i+1)+"</td><td>"+esc(x.nome)+" <span class=mu>"+esc(x.sub)+"</span></td><td style=\\"white-space:nowrap\\"><span class=tb style=\\"width:"+Math.round(70*Math.max(x.total,0)/mx)+"px\\"></span><span class=num>"+n(x.total)+"</span></td>"+' +
    '"<td class=mu>"+esc((x.detalhe?x.detalhe+" · ":"")+d.join(" · "))+"</td></tr>"});$("out").innerHTML=h+"</table>"}' +
    'function exporta(f){$("ex").innerHTML="<p class=mu>Gerando arquivo…</p>";google.script.run.withSuccessHandler(function(r){$("ex").innerHTML="<p>✅ Criado na pasta da planilha: <a target=_blank href=\\""+r.url+"\\">"+esc(r.nome)+"</a></p>"})' +
    '.withFailureHandler(function(e){$("ex").innerHTML="<p class=erro>ERRO: "+esc(e.message)+"</p>"}).apiExportarQuantitativo(params(),f)}' +
    '</script>';
}
