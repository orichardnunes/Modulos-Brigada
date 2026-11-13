/**
 * MÓDULO BRIGADA 1.0 — Modulo_Extras.gs
 * Painel, Balanceamento do mês, Troca de serviço (com sugestão de substitutos), Remover / transferir militar,
 * Exportar prévia em PDF e Conferir prévia.
 * Depende de Codigo.gs, Modulo_Escala.gs, Modulo_Auditagem.gs e Modulo_Previa.gs.
 */

var CSS_EXTRA_ = '<style>.ban{border-radius:10px;padding:8px 12px;margin:4px 0 8px}.okb{background:#e6f4ea;color:#137333}.inf{background:#e8f0fe;color:#174ea6}.offb{background:#fce8e6;color:#b00020}' +
  '.sec{font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#5f6368;margin:12px 0 4px}.sub{color:#5f6368;margin:-2px 0 10px}.stk{position:sticky;bottom:0;background:#fff;padding:6px 0 2px;margin-top:6px}' +
  '.lar{display:inline-block;min-width:22px;text-align:center;border-radius:10px;background:#1a73e8;color:#fff;font-weight:600;padding:0 8px;font-size:12px}' +
  '.tg{display:inline-block;font-size:10px;border-radius:8px;padding:1px 7px;margin-left:4px;background:#f1f3f4;color:#5f6368}.tg.ok{background:#e6f4ea;color:#137333}.tg.al{background:#fef7e0;color:#b06000}.tg.er{background:#fce8e6;color:#b00020}' +
  '.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:6px 0}.at{border:1px solid #dadce0;border-radius:10px;padding:9px 10px;cursor:pointer;background:#fff;text-align:left;margin:0;font-weight:500;color:#202124}.at:hover{background:#f1f6fe;border-color:#1a73e8}.at small{display:block;color:#5f6368;font-weight:400;margin-top:2px}' +
  '.bw{display:inline-block;height:8px;border-radius:4px;vertical-align:middle;margin-right:6px}.up{background:#d93025}.dn{background:#1a73e8}.eq{background:#9aa0a6}' +
  '.it{display:flex;align-items:center;gap:8px;border-bottom:1px solid #f1f3f4;padding:5px 2px;cursor:pointer;margin:0}.it:last-child{border:0}.it input{accent-color:#1a73e8}.it.sel{background:#f8fbff}</style>';

var HTML_BAL_ = '<h3 style="margin-top:0">Balanceamento do mês</h3>\n' +
  '<p class="sub">Serviços por militar em cada escala, comparados com a média do grupo (pares de dias contam 0,5 por dia).</p>\n' +
  '<div class="bar"><select id="mes"></select><label class="chip"><input type="checkbox" id="tG" checked>Grad</label><label class="chip"><input type="checkbox" id="tC" checked>Cndt e Praia</label></div>\n' +
  '<div class="stk"><button class="p" onclick="gerar()">Gerar balanceamento</button></div>\n' +
  '<div id="out" style="margin-top:8px"></div>\n';
var JS_BAL_ = 'google.script.run.withSuccessHandler(function(d){selMes(d,"mes")}).withFailureHandler(falha).apiAbas();\n' +
  'function tipos(){var t=[];if($("tG").checked)t.push("Grad");if($("tC").checked)t.push("Cndt e Praia");return t}\n' +
  'function n1(x){return String(Math.round(x*10)/10).replace(".",",")}\n' +
  'function gerar(){var o=$("out");o.style.display="block";o.className="";o.textContent="Calculando…";google.script.run.withSuccessHandler(resp).withFailureHandler(falha).apiBalanceamento($("mes").value,tipos())}\n' +
  'function resp(r){var o=$("out"),h="",R=r.resumo;o.className="";\n' +
  'h+="<div class=\\"ban inf\\"><b>📊 Balanceamento de "+esc(r.mes)+"</b><br><span class=mu>"+esc((R.periodos||[]).join(" · "))+"</span></div>";\n' +
  'h+="<div class=cards><div class=card><b>"+R.militares+"</b><span>militares</span></div><div class=card><b>"+n1(R.media)+"</b><span>média de serviços</span></div><div class=card><b>"+n1(R.maximo)+"</b><span>máximo</span></div><div class=card><b>"+n1(R.minimo)+"</b><span>mínimo</span></div></div>";\n' +
  'if(R.comMaximo&&R.comMaximo.length)h+="<p class=mu>Mais serviços: "+esc(R.comMaximo.slice(0,6).join(", "))+(R.comMaximo.length>6?"…":"")+" · Menos serviços: "+esc((R.comMinimo||[]).slice(0,6).join(", "))+((R.comMinimo||[]).length>6?"…":"")+"</p>";\n' +
  'r.escalas.forEach(function(e,i){var mx=Math.max(1,e.maximo);\n' +
  'h+="<details"+(i<1?" open":"")+"><summary>"+esc(e.titulo)+" <span class=mu>"+esc(e.tipo)+" · média "+n1(e.media)+" · "+e.linhas.length+" militar(es)</span></summary><table><tr><th>Militar</th><th>Serviços</th><th>Dif. da média</th></tr>";\n' +
  'e.linhas.forEach(function(l){var c=l.dif>=1?"up":(l.dif<=-1?"dn":"eq");\n' +
  'h+="<tr><td>"+esc(l.nome)+" <span class=mu>"+esc(l.sub)+"</span></td><td style=\\"white-space:nowrap\\"><span class=\\"bw "+c+"\\" style=\\"width:"+Math.round(80*l.n/mx)+"px\\"></span><b>"+n1(l.n)+"</b></td><td class="+(l.dif>=1?"erro":"mu")+">"+(l.dif>0?"+":"")+n1(l.dif)+"</td></tr>"});\n' +
  'h+="</table></details>"});\n' +
  'if(r.avisos&&r.avisos.length)h+="<p class=erro>⚠ "+esc(r.avisos.join(" | "))+"</p>";\n' +
  'o.innerHTML=h}\n';

var HTML_TROCA_ = '<h3 style="margin-top:0">Troca de serviço</h3>\n' +
  '<p class="sub">Registra a troca na anotação do “0” de quem sai e sugere quem pode entrar: sem serviço no dia e dentro da folga mínima.</p>\n' +
  '<div class="sec">Escala e dia</div>\n' +
  '<div class="bar"><select id="mes" onchange="carrega()"></select><label class="chip"><input type="radio" name="tipo" value="Grad" checked onchange="carrega()">Grad</label><label class="chip"><input type="radio" name="tipo" value="Cndt e Praia" onchange="carrega()">Cndt e Praia</label></div>\n' +
  '<div class="bar"><select id="bloco" style="max-width:300px" onchange="limpa()"></select><input type="date" id="data" onchange="limpa()"><button onclick="buscar()" style="margin:0">Buscar</button></div>\n' +
  '<div id="info"></div>\n' +
  '<div class="stk" id="acoes" style="display:none"><label class="opt"><input type="checkbox" id="forcar"> Aplicar mesmo com alertas</label><button onclick="run(false)">Verificar</button><button class="p" onclick="run(true)">Aplicar troca</button></div>\n' +
  '<div id="out" style="margin-top:8px"></div>\n';
var JS_TROCA_ = 'var D=null,INFO=null;\n' +
  'google.script.run.withSuccessHandler(function(d){selMes(d,"mes");carrega()}).withFailureHandler(falha).apiAbas();\n' +
  'function tipoAba(){return document.querySelector("input[name=tipo]:checked").value}\n' +
  'function limpa(){$("info").innerHTML="";$("acoes").style.display="none";INFO=null}\n' +
  'function carrega(){limpa();google.script.run.withSuccessHandler(function(r){D=r;var s=$("bloco");s.innerHTML="";r.blocos.forEach(function(b,k){var o=document.createElement("option");o.value=k;o.text=b.titulo;s.appendChild(o)});\n' +
  '$("data").min=r.ini;$("data").max=r.fim;var v=$("data").value;if(!v||v<r.ini||v>r.fim)$("data").value=(r.hoje>=r.ini&&r.hoje<=r.fim)?r.hoje:r.ini}).withFailureHandler(falha).apiBlocos($("mes").value,[tipoAba()])}\n' +
  'function buscar(){if(!D||!D.blocos.length){falha("Sem escalas.");return}var b=D.blocos[$("bloco").value];$("out").textContent="";$("info").innerHTML="<p class=mu>Buscando…</p>";\n' +
  'google.script.run.withSuccessHandler(mostra).withFailureHandler(function(e){$("info").innerHTML="";falha(e)}).apiTrocaInfo($("mes").value,tipoAba(),b.hdr,$("data").value)}\n' +
  'function pickE(r){var el=document.querySelector("input[name=entra][value=\\""+r+"\\"]");if(el){el.checked=true;el.scrollIntoView({block:"nearest"})}}\n' +
  'function mostra(r){INFO=r;var h="";\n' +
  'h+="<div class=\\"ban inf\\"><b>"+esc(r.titulo)+"</b><br><span class=mu>"+esc(r.aba)+" · "+esc(r.data)+"</span></div>";\n' +
  'if(!r.sai.length){h+="<div class=\\"ban offb\\">Ninguém com “0” de serviço nesse dia nessa escala.</div>";$("info").innerHTML=h;$("acoes").style.display="none";return}\n' +
  'h+="<div class=sec>Quem sai</div><div class=bar>";\n' +
  'r.sai.forEach(function(x,i){h+="<label class=chip><input type=radio name=sai value=\\""+x.r+"\\""+(i===0?" checked":"")+">"+esc(x.nome)+(x.nota?" <span class=mu>(nota: "+esc(x.nota)+")</span>":"")+"</label>"});h+="</div>";\n' +
  'if(r.sugeridos.length){h+="<div class=sec>Sugestões (maior folga, sem alertas)</div><div class=bar>";r.sugeridos.forEach(function(x){h+="<span class=chip onclick=\\"pickE("+x.r+")\\"><b>"+esc(x.nome)+"</b> <span class=mu>folga "+x.folga+"</span></span>"});h+="</div>"}\n' +
  'h+="<div class=sec>Quem entra</div><div class=lista style=\\"max-height:240px\\">";\n' +
  'r.cands.forEach(function(x){h+="<label class=it><input type=radio name=entra value=\\""+x.r+"\\"><span><b>"+esc(x.nome)+"</b> <span class=mu>"+esc(x.sub)+"</span></span><span class=\\"tg\\">folga "+(x.folga==null?"—":x.folga)+"</span>"+(x.ok?"<span class=\\"tg ok\\">disponível</span>":x.flags.map(function(f){return "<span class=\\"tg al\\">"+esc(f)+"</span>"}).join(""))+"</label>"});\n' +
  'h+="</div>";$("info").innerHTML=h;$("acoes").style.display="block"}\n' +
  'function run(ap){if(!INFO){falha("Clique em Buscar primeiro.");return}var b=D.blocos[$("bloco").value],s=document.querySelector("input[name=sai]:checked"),e=document.querySelector("input[name=entra]:checked");\n' +
  'if(!s||!e){falha("Escolha quem sai e quem entra.");return}\n' +
  'var p={mes:$("mes").value,tipo:tipoAba(),hdr:b.hdr,iso:$("data").value,saiR:s.value,entraR:e.value,forcar:$("forcar").checked};\n' +
  'var o=$("out");o.style.display="block";o.className="";o.textContent="Processando…";google.script.run.withSuccessHandler(resp).withFailureHandler(falha).apiTroca(p,ap)}\n' +
  'function resp(r){var R=r.rel,o=$("out"),h="";o.className="";\n' +
  'h+="<div class=\\"ban "+(R.aplicado?"okb":"inf")+"\\"><b>"+(R.aplicado?"✅ Troca registrada":"🔎 Verificação — nada foi alterado")+"</b><br><span class=mu>"+esc(R.aba)+" · "+esc(R.titulo)+" · "+esc(R.data)+"</span></div>";\n' +
  'h+="<table><tr><th>Sai</th><th>Entra</th></tr><tr><td><b>"+esc(R.sai)+"</b></td><td><b>"+esc(R.entra)+"</b></td></tr></table>";\n' +
  'if(R.notaAnterior)h+="<p class=mu>A anotação anterior da célula ("+esc(R.notaAnterior)+") será substituída.</p>";\n' +
  'if(R.alertas.length){h+="<details open><summary class=erro>⚠ Alertas ("+R.alertas.length+")</summary><ul>";R.alertas.forEach(function(a){h+="<li>"+esc(a)+"</li>"});h+="</ul></details>"}\n' +
  'else h+="<p class=ok>✔ Sem alertas de folga ou de serviço no dia.</p>";\n' +
  'if(R.aplicado)h+="<p class=mu>A prévia lê a anotação sozinha (até 5 min, ou use “Atualizar prévia”); o nome aparece com *.</p><button class=p onclick=\\"google.script.host.close()\\">Concluir</button>";\n' +
  'o.innerHTML=h}\n';

var HTML_MOVER_ = '<h3 style="margin-top:0">Remover / transferir militar</h3>\n' +
  '<p class="sub">Remove o militar das escalas escolhidas (a numeração da coluna C é refeita) ou troca a subunidade dele.</p>\n' +
  '<div class="sec">Onde</div>\n' +
  '<div class="bar"><select id="mes" onchange="carrega()"></select><label class="chip"><input type="radio" name="tipo" value="Grad" checked onchange="carrega()">Grad</label><label class="chip"><input type="radio" name="tipo" value="Cndt e Praia" onchange="carrega()">Cndt e Praia</label></div>\n' +
  '<div class="sec">Militar</div>\n' +
  '<div class="bar"><input type="text" id="busca" oninput="lista()" placeholder="buscar nome" style="flex:1"><select id="mil" onchange="onde()" style="max-width:280px"></select></div>\n' +
  '<div class="sec">Escalas em que ele consta <span class="mu" id="nb"></span></div>\n' +
  '<div id="onde" class="lista" style="max-height:150px">—</div>\n' +
  '<div class="sec">Ação</div>\n' +
  '<div class="bar"><label class="chip"><input type="radio" name="acao" value="remover" checked onchange="acao()">Remover</label><label class="chip"><input type="radio" name="acao" value="transferir" onchange="acao()">Transferir de SU</label><select id="su" style="display:none">{{SUS}}</select></div>\n' +
  '<label class="opt"><input type="checkbox" id="casc" checked> Aplicar também nos meses seguintes já criados (recomendado: evita referências quebradas)</label>\n' +
  '<div class="stk"><button onclick="run(false)">Verificar</button><button class="p" onclick="run(true)">Aplicar</button></div>\n' +
  '<div id="out" style="margin-top:8px"></div>\n';
var JS_MOVER_ = 'var D=null,MIL={};\n' +
  'google.script.run.withSuccessHandler(function(d){selMes(d,"mes");carrega()}).withFailureHandler(falha).apiAbas();\n' +
  'function tipoAba(){return document.querySelector("input[name=tipo]:checked").value}\n' +
  'function carrega(){google.script.run.withSuccessHandler(function(r){D=r;MIL={};r.blocos.forEach(function(b){b.linhas.forEach(function(l){var n=l.nome.replace(/\\s+/g," ").trim();(MIL[n]=MIL[n]||[]).push({hdr:b.hdr,titulo:b.titulo,sub:l.sub})})});lista()}).withFailureHandler(falha).apiBlocos($("mes").value,[tipoAba()])}\n' +
  'function lista(){var q=$("busca").value.toUpperCase(),s=$("mil"),at=s.value,h="";Object.keys(MIL).sort().forEach(function(n){if(q&&n.toUpperCase().indexOf(q)<0)return;h+="<option value=\\""+esc(n)+"\\""+(n===at?" selected":"")+">"+esc(n)+"</option>"});s.innerHTML=h;onde()}\n' +
  'function onde(){var n=$("mil").value,l=MIL[n]||[],h="";l.forEach(function(x,i){h+="<label class=it><input type=checkbox class=bl value=\\""+x.hdr+"\\" checked onchange=cont()><span>"+esc(x.titulo)+"</span><span class=\\"tg\\">"+esc(x.sub)+"</span></label>"});$("onde").innerHTML=h||"<span class=mu>Nenhum militar.</span>";cont()}\n' +
  'function cont(){var n=document.querySelectorAll(".bl:checked").length;$("nb").textContent=n?"— "+n+" marcada(s)":""}\n' +
  'function acao(){$("su").style.display=document.querySelector("input[name=acao]:checked").value==="transferir"?"inline-block":"none"}\n' +
  'function run(ap){var hd=[].slice.call(document.querySelectorAll(".bl:checked")).map(function(x){return Number(x.value)});if(!$("mil").value){falha("Escolha o militar.");return}\n' +
  'var a=document.querySelector("input[name=acao]:checked").value;\n' +
  'if(ap&&!confirm(a==="remover"?"Remover "+$("mil").value+" das escalas marcadas? A linha será apagada.":"Transferir "+$("mil").value+" para a SU "+$("su").value+"?"))return;\n' +
  'var p={mes:$("mes").value,tipo:tipoAba(),nome:$("mil").value,hdrs:hd,acao:a,su:$("su").value,cascata:$("casc").checked};\n' +
  'var o=$("out");o.style.display="block";o.className="";o.textContent="Processando…";google.script.run.withSuccessHandler(function(r){resp(r);if(ap)carrega()}).withFailureHandler(falha).apiMover(p,ap)}\n' +
  'function resp(r){var R=r.rel,o=$("out"),h="";o.className="";var rm=R.acao==="remover";\n' +
  'h+="<div class=\\"ban "+(R.aplicado?"okb":"inf")+"\\"><b>"+(R.aplicado?(rm?"✅ Militar removido":"✅ Subunidade alterada"):"🔎 Verificação — nada foi alterado")+"</b><br><span class=mu>"+esc(R.nome)+(rm?"":" → "+esc(R.su))+"</span></div>";\n' +
  'h+="<div class=cards><div class=card><b>"+R.itens.length+"</b><span>linha(s) "+(rm?"a remover":"a alterar")+"</span></div><div class=\\"card"+(R.avisos.length?" bad":"")+"\\"><b>"+R.avisos.length+"</b><span>aviso(s)</span></div></div>";\n' +
  'h+="<table><tr><th>Aba</th><th>Escala</th><th>Linha</th></tr>";R.itens.forEach(function(x){h+="<tr><td>"+esc(x.aba)+"</td><td><b>"+esc(x.escala)+"</b></td><td class=mu>"+x.linha+" ("+esc(x.sub)+")</td></tr>"});h+="</table>";\n' +
  'if(R.avisos.length){h+="<details open><summary class=erro>⚠ Avisos ("+R.avisos.length+")</summary><ul>";R.avisos.forEach(function(a){h+="<li>"+esc(a)+"</li>"});h+="</ul></details>"}\n' +
  'if(R.aplicado)h+="<button class=p onclick=\\"google.script.host.close()\\">Concluir</button>";\n' +
  'o.innerHTML=h}\n';

var HTML_PDF_ = '<h3 style="margin-top:0">Exportar prévia em PDF</h3>\n' +
  '<p class="sub">Gera um PDF da prévia (colunas A a I, sem as colunas auxiliares) e salva na pasta da planilha.</p>\n' +
  '<div class="sec">Prévia</div>\n' +
  '<div class="bar"><select id="pv" style="min-width:280px"></select></div>\n' +
  '<div class="sec">Página</div>\n' +
  '<div class="bar"><label class="chip"><input type="radio" name="or" value="paisagem" checked>Paisagem</label><label class="chip"><input type="radio" name="or" value="retrato">Retrato</label></div>\n' +
  '<div class="stk"><button class="p" id="ok" onclick="gerar()">Gerar PDF</button><button onclick="google.script.host.close()">Cancelar</button></div>\n' +
  '<div id="out" style="margin-top:8px"></div>\n';
var JS_PDF_ = 'google.script.run.withSuccessHandler(function(l){if(!l.length){$("out").textContent="Nenhuma prévia.";$("ok").disabled=true;return}var h="";l.forEach(function(p){h+="<option value=\\""+esc(p.nome)+"\\">"+esc(p.nome)+(p.atual?" (atual)":"")+"</option>"});$("pv").innerHTML=h}).withFailureHandler(falha).apiPreviasLista(false);\n' +
  'function gerar(){$("ok").disabled=true;var o=$("out");o.style.display="block";o.className="";o.textContent="Gerando o PDF…";\n' +
  'google.script.run.withSuccessHandler(resp).withFailureHandler(function(e){$("ok").disabled=false;falha(e)}).apiExportarPrevia($("pv").value,document.querySelector("input[name=or]:checked").value==="paisagem")}\n' +
  'function resp(r){var R=r.rel,o=$("out"),h="";$("ok").disabled=false;o.className="";\n' +
  'h+="<div class=\\"ban okb\\"><b>✅ PDF gerado</b><br><span class=mu>"+esc(R.nome)+" · "+(R.paisagem?"paisagem":"retrato")+"</span></div>";\n' +
  'h+="<p><a target=_blank href=\\""+esc(R.url)+"\\">Abrir o PDF no Drive</a></p><p class=mu>Salvo na mesma pasta da planilha.</p>";\n' +
  'o.innerHTML=h}\n';
var HTML_CONF_ = '<h3 style="margin-top:0">Conferir prévia</h3>\n' +
  '<p class="sub">Lista as células PENDENTE (ou com erro) de cada linha e o motivo provável.</p>\n' +
  '<div class="sec">Prévia</div>\n' +
  '<div class="bar"><select id="pv" style="min-width:280px"></select><button onclick="conferir()" style="margin:0">Conferir</button></div>\n' +
  '<div id="out" style="margin-top:8px"></div>\n';
var JS_CONF_ = 'google.script.run.withSuccessHandler(function(l){if(!l.length){$("out").textContent="Nenhuma prévia.";return}var h="";l.forEach(function(p){h+="<option value=\\""+esc(p.nome)+"\\">"+esc(p.nome)+(p.atual?" (atual)":"")+"</option>"});$("pv").innerHTML=h;conferir()}).withFailureHandler(falha).apiPreviasLista(true);\n' +
  'function conferir(){var o=$("out");o.style.display="block";o.className="";o.textContent="Conferindo…";google.script.run.withSuccessHandler(resp).withFailureHandler(falha).apiConferirPrevia($("pv").value)}\n' +
  'function resp(r){var o=$("out"),h="";o.className="";\n' +
  'if(!r.total){h+="<div class=\\"ban okb\\"><b>✔ Nenhuma pendência</b><br><span class=mu>"+esc(r.nome)+(r.carimbo?" · "+esc(r.carimbo):"")+"</span></div>"}\n' +
  'else{h+="<div class=\\"ban offb\\"><b>"+r.total+" célula(s) pendente(s) em "+r.linhas.length+" linha(s)</b><br><span class=mu>"+esc(r.nome)+(r.carimbo?" · "+esc(r.carimbo):"")+"</span></div>";\n' +
  'h+="<table><tr><th>Linha</th><th>Dias</th></tr>";r.linhas.forEach(function(l){h+="<tr><td><b>"+esc(l.label)+"</b><br><span class=mu>"+esc(l.secao)+"</span></td><td><span class=\\"tg al\\">"+l.dias.length+" dia(s)</span> <span class=mu>"+esc(l.dias.join(", "))+"</span><br><span class=mu>"+esc(l.motivo)+"</span></td></tr>"});h+="</table>";\n' +
  'h+="<button class=p onclick=\\"google.script.run.withFailureHandler(falha).mnuAtualizarPrevia()\\">Atualizar prévia agora</button>"}\n' +
  'o.innerHTML=h}\n';


var HTML_EFET_ = '<h3 style="margin-top:0">Conferência do efetivo</h3>\n' +
  '<p class="sub">Cria embaixo de cada escala duas linhas coladas: o efetivo previsto por dia e o escalado (conta os “0”). Confere = verde “OK”; falta ou sobra = vermelho com o número escalado.</p>\n' +
  '<div class="sec">Onde</div>\n' +
  '<div class="bar"><select id="mes" onchange="carrega()"></select><label class="chip"><input type="checkbox" id="tG" checked onchange="carrega()">Grad</label><label class="chip"><input type="checkbox" id="tC" checked onchange="carrega()">Cndt e Praia</label></div>\n' +
  '<div class="sec">Escalas <span class="mu" id="nb"></span></div>\n' +
  '<div id="lista" class="lista" style="max-height:300px">Carregando…</div>\n' +
  '<div class="stk"><button class="p" onclick="aplicar()">Criar / atualizar conferência</button></div>\n' +
  '<div id="out" style="margin-top:8px"></div>\n';
var JS_EFET_ = 'var D=[];\n' +
  'google.script.run.withSuccessHandler(function(d){selMes(d,"mes");carrega()}).withFailureHandler(falha).apiAbas();\n' +
  'function tipos(){var t=[];if($("tG").checked)t.push("Grad");if($("tC").checked)t.push("Cndt e Praia");return t}\n' +
  'function carrega(){if(!tipos().length){$("lista").textContent="Marque Grad e/ou Cndt e Praia.";return}$("lista").textContent="Carregando…";\n' +
  'google.script.run.withSuccessHandler(function(r){D=r;var h="";r.forEach(function(b,i){h+="<div class=it><input type=checkbox class=bk id=k"+i+" checked onchange=cont()><span style=\\"flex:1\\"><b>"+esc(b.titulo)+"</b> <span class=mu>"+esc(b.tipo)+"</span>"+(b.nota?" <span class=tg>"+esc(b.nota)+"</span>":"")+(b.tem?" <span class=\\"tg ok\\">já tem</span>":"")+"</span><span class=mu>previsto</span><input type=number min=0 id=p"+i+" value="+b.previsto+" style=\\"width:54px;text-align:center\\" oninput=\\"D["+i+"].mudou=true\\"></div>"});$("lista").innerHTML=h;cont()}).withFailureHandler(falha).apiEfetivoInfo($("mes").value,tipos())}\n' +
  'function cont(){var n=0;D.forEach(function(b,i){if($("k"+i)&&$("k"+i).checked)n++});$("nb").textContent="— "+n+" de "+D.length}\n' +
  'function aplicar(){var bl=[];D.forEach(function(b,i){if($("k"+i).checked)bl.push({aba:b.aba,hdr:b.hdr,previsto:$("p"+i).value,mudou:!!b.mudou})});if(!bl.length){falha("Marque ao menos uma escala.");return}\n' +
  'var o=$("out");o.style.display="block";o.className="";o.textContent="Criando as linhas…";google.script.run.withSuccessHandler(resp).withFailureHandler(falha).apiEfetivoAplicar({blocos:bl})}\n' +
  'function resp(r){var o=$("out"),h="",R=r.rel;o.className="";\n' +
  'h+="<div class=\\"ban okb\\"><b>✅ Conferência criada</b><br><span class=mu>"+R.itens.length+" escala(s)</span></div>";\n' +
  'h+="<table><tr><th>Aba</th><th>Escala</th><th>Previsto</th></tr>";R.itens.forEach(function(x){h+="<tr><td>"+esc(x.aba)+"</td><td><b>"+esc(x.escala)+"</b> "+(x.criado?"<span class=\\"tg ok\\">nova</span>":"<span class=tg>atualizada</span>")+"</td><td><span class=lar>"+x.previsto+"</span></td></tr>"});h+="</table>";\n' +
  'h+="<p class=mu>Edite o previsto de qualquer dia direto na primeira das duas linhas (a de números). Ao importar a Guarnição ou criar o mês, os dias previstos são refeitos.</p><button class=p onclick=\\"google.script.host.close()\\">Concluir</button>";\n' +
  'o.innerHTML=h}\n';

/* ============================================================ PAINEL */
function mnuPainel() {
  var hoje = new Date(), mesId = CFG.MESES[hoje.getMonth()], props = PropertiesService.getDocumentProperties();
  var linhasHoje = [], nDiaMes = '', previaAtual = '', pendPrevia = '', erro = '';
  try {
    var shG = ss_().getSheetByName(mesId + ' ' + CFG.TIPO_GRAD);
    [CFG.TIPO_GRAD, CFG.TIPO_CNDT].forEach(function (t) {
      var sh = ss_().getSheetByName(mesId + ' ' + t);
      if (!sh) return;
      var A = lerAba_(sh), d = hoje.getDate(), c = colDia_(d);
      nDiaMes = d + '/' + A.nDias;
      A.blocos.forEach(function (B) {
        var nomes = [];
        B.rows.forEach(function (R) {
          if (!participa_(A, B, R, d) || num_(A.vals[R.r][c]) !== 0) return;
          var cl = classeCel_(A, R.r, c);
          if (cl === 'afast' || cl === 'verde') return;
          nomes.push(R.nome.replace(/\s+/g, ' ').trim());
        });
        if (nomes.length) linhasHoje.push({ t: B.titulo, n: nomes.join(' · ') });
      });
    });
    var h0 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    abasPrevia_().forEach(function (sh) {
      if (sh.isSheetHidden() || /Modelo/i.test(sh.getName()) || previaAtual) return;
      var v = sh.getRange('C2').getValue();
      if (!(v instanceof Date)) return;
      var ini = new Date(v.getFullYear(), v.getMonth(), v.getDate()), fim = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + 6);
      if (ini <= h0 && h0 <= fim) { previaAtual = sh.getName(); pendPrevia = pendenciasPrevia_(sh).n; }
    });
  } catch (e) { erro = e.message; }
  var gAbas = JSON.parse(props.getProperty('GATILHO') || 'null'), gPrev = JSON.parse(props.getProperty('GATILHO_PREVIA') || 'null');
  var pend = JSON.parse(props.getProperty('AFAST_PEND') || '[]');
  var h = CSS_EXTRA_ + '<h3 style="margin-top:0">Painel — ' + esc_(CFG.MESES[hoje.getMonth()]) + '/' + hoje.getFullYear() + '</h3>' +
    '<div class="cards"><div class="card"><b>' + (nDiaMes || '—') + '</b><span>dia do mês</span></div>' +
    '<div class="card' + (pendPrevia ? ' bad' : '') + '"><b>' + (previaAtual ? pendPrevia : '—') + '</b><span>' + (previaAtual ? 'pendente(s) na prévia atual' : 'sem prévia da semana') + '</span></div>' +
    '<div class="card' + (pend.length ? ' bad' : '') + '"><b>' + pend.length + '</b><span>afastamento(s) para o mês seguinte</span></div></div>' +
    '<div class="bar"><span class="tg ' + (gAbas ? 'ok' : '') + '">Gatilho das abas: ' + (gAbas ? 'ativo' : 'sem gatilho') + '</span>' +
    '<span class="tg ' + (gPrev && gPrev.ativo ? 'ok' : '') + '">Gatilho da prévia: ' + (gPrev && gPrev.ativo ? 'ativo' : 'desativado') + '</span></div>';
  if (erro) h += '<div class="ban offb">' + esc_(erro) + '</div>';
  h += '<details open><summary>Serviços de hoje (' + linhasHoje.length + ' escala(s))</summary>' +
    (linhasHoje.length ? '<table><tr><th>Escala</th><th>Militar(es)</th></tr>' + linhasHoje.map(function (x) { return '<tr><td><b>' + esc_(x.t) + '</b></td><td class="mu">' + esc_(x.n) + '</td></tr>'; }).join('') + '</table>' : '<p class="mu">Nenhum “0” de serviço lançado para hoje.</p>') + '</details>';
  var atalhos = [
    ['Adicionar serviços', 'mnuAdicionarServicos', 'escala automática'], ['Troca de serviço', 'mnuTrocaServico', 'com sugestões'], ['Central de trocas', 'mnuCentralTrocas', 'pedidos e autorização'], ['Adicionar afastamento', 'mnuAdicionarAfastamento', 'férias, licença…'],
    ['Adicionar militar', 'mnuAdicionarMilitar', 'com folga inicial'], ['Remover / transferir', 'mnuMoverMilitar', 'militar ou SU'], ['Retirar serviços', 'mnuRetirarServicos', 'desfaz escalas'],
    ['Atualizar prévia', 'mnuAtualizarPrevia', 'religa fórmulas'], ['Conferir prévia', 'mnuConferirPrevia', 'pendências'], ['Exportar prévia (PDF)', 'mnuExportarPrevia', 'salva no Drive'],
    ['Balanceamento', 'mnuBalanceamento', 'serviços x média'], ['Conferência do efetivo', 'mnuConferenciaEfetivo', 'previsto x escalado'], ['Serviços tirados', 'mnuQuantitativo', 'ranking'], ['Verificação do sistema', 'mnuVerificarSistema', 'abas e funções']
  ];
  h += '<div class="sec">Atalhos</div><div class="grid">' + atalhos.map(function (a) {
    return '<button class="at" onclick="go(\'' + a[1] + '\')">' + a[0] + '<small>' + a[2] + '</small></button>';
  }).join('') + '</div><div id="out" style="display:none"></div>' + JS_COMUM_ +
    '<script>function go(f){google.script.run.withFailureHandler(falha)[f]()}</script>';
  mostrarHtml_(h, 'Painel', 640, 700);
}

/* ============================================================ BALANCEAMENTO DO MÊS */
function mnuBalanceamento() { mostrarHtml_(CSS_EXTRA_ + HTML_BAL_ + JS_COMUM_ + '<script>' + JS_BAL_ + '</script>', 'Balanceamento do mês', 760, 700); }

function arred_(x) { return Math.round(x * 100) / 100; }

function apiBalanceamento(mesId, tipos) {
  if (!mesId || !tipos || !tipos.length) throw new Error('Escolha o mês e ao menos um tipo de aba.');
  var bl = apiBlocos(mesId, tipos);
  if (!bl.blocos.length) throw new Error('Nenhuma aba encontrada para ' + mesId + '.');
  var op = apiQuantitativoOpcoes([mesId], tipos);
  var r = calcularQuantitativo_({ meses: [mesId], tipos: tipos, escalas: op.escalas.map(function (e) { return e.id; }), futuros: true, trocas: true });
  var porKey = {};
  r.linhas.forEach(function (x) { porKey[x.key] = x; });
  var escalas = [];
  bl.blocos.forEach(function (b) {
    var lin = b.linhas.map(function (l) {
      var x = porKey[norm_(l.nome)];
      return { nome: l.nome.replace(/\s+/g, ' ').trim(), sub: l.sub, n: x ? arred_(x.porEscala[b.titulo] || 0) : 0 };
    });
    var soma = lin.reduce(function (a, l) { return a + l.n; }, 0), media = lin.length ? soma / lin.length : 0;
    lin.forEach(function (l) { l.dif = arred_(l.n - media); });
    lin.sort(function (a, c) { return c.n - a.n || (a.nome < c.nome ? -1 : 1); });
    escalas.push({ titulo: b.titulo, tipo: b.tipo, media: arred_(media), maximo: lin.length ? lin[0].n : 0, minimo: lin.length ? lin[lin.length - 1].n : 0, linhas: lin });
  });
  var total = r.linhas.map(function (x) { return { nome: x.nome.replace(/\s+/g, ' ').trim(), sub: x.sub, total: x.total }; });
  return { mes: mesId, resumo: r.resumo, escalas: escalas, total: total, avisos: r.avisos };
}


/* ============================================================ TROCA DE SERVIÇO (com sugestão de substitutos) */
function mnuTrocaServico() { mostrarHtml_(CSS_EXTRA_ + HTML_TROCA_ + JS_COMUM_ + '<script>' + JS_TROCA_ + '</script>', 'Troca de serviço', 720, 700); }

/** serviços de cada militar em todas as escalas do mês (meses vizinhos entram como dias fora do mês): key -> [{d, e, v}] */
/** dRef (opcional): dia de interesse; os meses vizinhos só são lidos se o dia estiver perto da virada do mês */
function servicosPorMilitar_(A, dRef) {
  var svc = {};
  function ler(V, off) {
    V.blocos.forEach(function (VB) {
      VB.rows.forEach(function (VR) {
        for (var x = 1; x <= V.nDias; x++) {
          if (!participa_(V, VB, VR, x) || num_(V.vals[VR.r][colDia_(x)]) !== 0) continue;
          var cl = classeCel_(V, VR.r, colDia_(x));
          if (cl === 'afast') continue;
          (svc[VR.key] = svc[VR.key] || []).push({ d: off(x), e: VB.titulo, v: cl === 'verde' });
        }
      });
    });
  }
  ler(A, function (x) { return x; });
  var margem = Math.ceil(CFG.FOLGA_MIN_H / 24) + 3;
  var pa = (dRef == null || dRef <= margem) ? abaMesVizinho_(A, -1) : null, ps = (dRef == null || dRef > A.nDias - margem) ? abaMesVizinho_(A, 1) : null;
  try { if (pa) { var Pa = lerAba_(pa); ler(Pa, function (x) { return x - Pa.nDias; }); } } catch (e1) { /* sem mês anterior legível */ }
  try { if (ps) { var Ps = lerAba_(ps); ler(Ps, function (x) { return A.nDias + x; }); } } catch (e2) { /* sem mês seguinte legível */ }
  return svc;
}

/** extras (opcional): militares de fora da escala que também podem entrar [{full, nome, sub}] */
function apiTrocaInfo(mesId, tipo, hdr, iso, extras) {
  var sh = ss_().getSheetByName(mesId + ' ' + tipo);
  if (!sh) throw new Error('Aba "' + mesId + ' ' + tipo + '" não encontrada.');
  var A = lerAba_(sh), B = null;
  A.blocos.forEach(function (b) { if (b.hdr === Number(hdr)) B = b; });
  if (!B) throw new Error('Escala não encontrada.');
  if (!iso) throw new Error('Escolha o dia.');
  var dt = parseIso_(iso);
  if (dt.getMonth() !== A.mes || dt.getFullYear() !== A.ano) throw new Error('Escolha uma data dentro de ' + A.nome + '.');
  var d = dt.getDate(), c = colDia_(d), notas = sh.getRange(1, 1, A.vals.length, A.vals[0].length).getNotes();
  var svc = servicosPorMilitar_(A, d), gapMin = Math.ceil(CFG.FOLGA_MIN_H / 24) + 1, sai = [], cands = [];
  function avaliarServ_(lista) { /* avisos (não bloqueiam) de serviço no dia, vizinho e folga */
    var fl = [], md = Infinity, outra = '';
    lista.forEach(function (x) {
      if (x.v) return;
      var dist = Math.abs(x.d - d);
      if (dist === 0) outra = x.e;
      if (dist < md) md = dist;
    });
    if (outra) fl.push('já está de serviço no dia (' + outra + ')');
    else if (md === 1) fl.push('serviço no dia anterior/seguinte');
    else if (md < gapMin) fl.push('folga de ' + ((md - 1) * 24) + ' h');
    return fl;
  }
  B.rows.forEach(function (R) {
    if (!participa_(A, B, R, d)) return;
    var v = num_(A.vals[R.r][c]), cl = classeCel_(A, R.r, c), nome = R.nome.replace(/\s+/g, ' ').trim();
    if (v === 0) {
      if (cl !== 'verde') sai.push({ r: R.r, nome: nome, sub: R.sub, nota: String(notas[R.r][c] || '') });
      return;
    }
    var fl = avaliarServ_(svc[R.key] || []);
    if (cl === 'afast') fl.unshift('fora da escala');
    cands.push({ r: R.r, nome: nome, sub: R.sub, folga: v, flags: fl, ok: !fl.length, key: R.key });
  });
  /* convenção inversa: a nota está na célula de quem pegou ("de FULANO") em vez de na de quem passou */
  B.rows.forEach(function (R) {
    var nt = String(notas[R.r][c] || '').trim();
    if (!nt || num_(A.vals[R.r][c]) === 0) return;
    var knt = norm_(nt);
    sai.forEach(function (y) {
      var ky = norm_(y.nome);
      if (!y.nota && (knt.indexOf(ky) >= 0 || knt === semGrad_(ky))) y.nota = R.nome.replace(/\s+/g, ' ').trim() + ' (nota na célula dele)';
    });
  });
  var jaNaLista = cands.map(function (x) { return x.key; }).concat(sai.map(function (x) { return norm_(x.nome); }));
  var chavesSvc = Object.keys(svc), extrasOk = [];
  (extras || []).forEach(function (m) {
    var kf = norm_(m.full), kn = norm_(m.nome);
    var achou = jaNaLista.some(function (k) { return mesmoMil_(k, m.full); });
    if (achou) return; /* já aparece (o posto no cadastro pode diferir do da planilha) */
    var lista = [];
    achaChaves_(chavesSvc, m.full).forEach(function (k) { lista = lista.concat(svc[k]); });
    var f = avaliarServ_(lista);
    f.unshift('fora da escala');
    extrasOk.push({ r: -1, nome: m.full, sub: m.sub || '', folga: null, flags: f, ok: false, fora: true });
  });
  extrasOk.sort(function (a, b) { return a.nome < b.nome ? -1 : 1; });
  cands.sort(function (a, b) { return (b.ok ? 1 : 0) - (a.ok ? 1 : 0) || (b.folga == null ? -1 : b.folga) - (a.folga == null ? -1 : a.folga); });
  if (extras && extras.length) {
    cands.forEach(function (x) {
      var kf = norm_(x.nome), kn = kf.replace(/^(\d+\s*º?\s*SGT|SD\s*EP|SD\s*EV|CB\s*EP|CB|SGT|ST|TEN|CAP)\s+/, '');
      x.cad = extras.some(function (m) { return mesmoMil_(m.full, x.nome); });
    });
    extrasOk.forEach(function (x) { x.cad = true; });
  }
  cands = cands.concat(extrasOk);
  var SEMGRAD = /^(\d+\s*º?\s*SGT|SD\s*EP|SD\s*EV|CB\s*EP|CB|SGT|ST|TEN|CAP)\s+/;
  sai.forEach(function (x) { x.notaK = norm_(x.nota); });
  cands.forEach(function (x) { /* já pegou o serviço de outro por troca anotada no dia */
    var kf = norm_(x.nome), kn = kf.replace(SEMGRAD, ''), q = sai.filter(function (y) { return y.notaK && (y.notaK.indexOf(kf) >= 0 || y.notaK === kn); })[0];
    if (q) { x.flags = x.flags.slice(); x.flags.unshift('já pegou o serviço de ' + q.nome); x.ok = false; }
  });
  return { aba: A.nome, titulo: B.titulo, dia: d, data: fmtData_(dt), sai: sai, cands: cands, sugeridos: cands.filter(function (x) { return x.ok; }).slice(0, 5) };
}

/** p: {mes, tipo, hdr, iso, saiR, entraR, forcar} */
function apiTroca(p, aplicar) {
  var info = apiTrocaInfo(p.mes, p.tipo, p.hdr, p.iso), sai = null, entra = null;
  info.sai.forEach(function (x) { if (x.r === Number(p.saiR)) sai = x; });
  info.cands.forEach(function (x) { if (x.r === Number(p.entraR)) entra = x; });
  if (!sai) throw new Error('Escolha quem sai (militar com “0” de serviço nesse dia).');
  if (!entra) throw new Error('Escolha quem entra.');
  if (aplicar && entra.flags.length && !p.forcar) throw new Error('Alertas para ' + entra.nome + ': ' + entra.flags.join('; ') + '. Marque “Aplicar mesmo com alertas” para continuar.');
  if (aplicar) {
    var sh = ss_().getSheetByName(p.mes + ' ' + p.tipo);
    sh.getRange(sai.r + 1, colDia_(info.dia) + 1).setNote(entra.nome);
    if (typeof reforcarZero_ === 'function') { var Ax = lerAba_(sh); reforcarZero_(sh, Ax, sai.r, colDia_(info.dia)); agendarPrevia_(); }
    SpreadsheetApp.flush();
    if (typeof bumpTrocas_ === 'function') bumpTrocas_();
  }
  return { rel: { aplicado: !!aplicar, aba: info.aba, titulo: info.titulo, data: info.data, sai: sai.nome, entra: entra.nome, alertas: entra.flags, notaAnterior: sai.nota } };
}


/* ============================================================ REMOVER / TRANSFERIR MILITAR */
function mnuMoverMilitar() {
  var sus = CFG.SUBUNIDADES.map(function (x) { return '<option>' + esc_(x) + '</option>'; }).join('');
  mostrarHtml_(CSS_EXTRA_ + HTML_MOVER_.replace('{{SUS}}', sus) + JS_COMUM_ + '<script>' + JS_MOVER_ + '</script>', 'Remover / transferir militar', 700, 700);
}

/** renumera a coluna C (nº de ordem) do bloco depois de apagar a linha R; A é a leitura da aba antes da exclusão */
function removerLinha_(A, B, R) {
  var sh = A.sh, cont = {}, K = 1, mx = 0;
  B.rows.forEach(function (x) { var n = num_(A.vals[x.r][2]); if (n != null) cont[n] = (cont[n] || 0) + 1; });
  Object.keys(cont).forEach(function (k) { if (cont[k] > mx) { mx = cont[k]; K = cont[k]; } });
  var info = B.rows.filter(function (x) { return x.r !== R.r; }).map(function (x) {
    return { r1: x.r > R.r ? x.r : x.r + 1, n: num_(A.vals[x.r][2]), f: A.forms[x.r][2] !== '' };
  });
  sh.deleteRow(R.r + 1);
  var k = 0, ant = null;
  info.forEach(function (l) {
    if (l.n == null) return;
    var alvo = Math.floor(k / K) + 1;
    k++;
    var cel = sh.getRange(l.r1, 3);
    if (l.f && ant) cel.setFormula(alvo === ant.t ? '=C' + ant.r1 : '=C' + ant.r1 + '+1'); else cel.setValue(alvo);
    ant = { r1: l.r1, t: alvo };
  });
}

/** p: {mes, tipo, nome, hdrs:[], acao:'remover'|'transferir', su, cascata} */
function apiMover(p, aplicar) {
  var sh0 = ss_().getSheetByName(p.mes + ' ' + p.tipo);
  if (!sh0) throw new Error('Aba "' + p.mes + ' ' + p.tipo + '" não encontrada.');
  if (!p.nome) throw new Error('Escolha o militar.');
  if (!p.hdrs || !p.hdrs.length) throw new Error('Marque ao menos uma escala.');
  if (p.acao === 'transferir' && CFG.SUBUNIDADES.indexOf(p.su) < 0) throw new Error('Escolha a nova subunidade.');
  var key = norm_(p.nome), A0 = lerAba_(sh0), titulos = [], meses = [A0], avisos = [];
  A0.blocos.forEach(function (B) { if (p.hdrs.indexOf(B.hdr) >= 0) titulos.push(B.titulo); });
  if (p.cascata) {
    var cur = A0;
    for (var g = 0; g < 14; g++) {
      var ns = abaMesVizinho_(cur, 1);
      if (!ns) break;
      try { cur = lerAba_(ns); } catch (e) { break; }
      meses.push(cur);
    }
  }
  var plano = [];
  meses.forEach(function (A) {
    A.blocos.forEach(function (B) {
      if (titulos.indexOf(B.titulo) < 0) return;
      var R = null;
      B.rows.forEach(function (x) { if (x.key === key) R = x; });
      if (!R) { if (A === A0) throw new Error('"' + p.nome + '" não consta em ' + B.titulo + '.'); return; }
      if (p.acao === 'remover' && B.rows.length <= 1) throw new Error('Não é possível remover o único militar de ' + B.titulo + '.');
      var n = 0, d1 = primeiroDiaRetirar_(A);
      for (var d = d1; d <= A.nDias; d++) if (participa_(A, B, R, d) && num_(A.vals[R.r][colDia_(d)]) === 0 && classeCel_(A, R.r, colDia_(d)) !== 'afast') n++;
      if (n && p.acao === 'remover') avisos.push(A.nome + ' · ' + B.titulo + ': ' + n + ' serviço(s) lançado(s) a partir de hoje serão apagados junto com a linha.');
      plano.push({ A: A, B: B, R: R, n: n });
    });
  });
  if (!plano.length) throw new Error('Nada a fazer.');
  if (aplicar) {
    plano.sort(function (a, b) { return a.A.sh.getSheetId() - b.A.sh.getSheetId() || b.R.r - a.R.r; });
    plano.forEach(function (x) {
      if (p.acao === 'remover') removerLinha_(x.A, x.B, x.R);
      else {
        var A = x.A, sh = A.sh, base = null;
        A.blocos.forEach(function (B) { B.rows.forEach(function (r) { if (!base && r.sub === p.su) base = r; }); });
        sh.getRange(x.R.r + 1, 4).setValue(p.su);
        if (base) sh.getRange(base.r + 1, 4).copyTo(sh.getRange(x.R.r + 1, 4), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
        else avisos.push(A.nome + ': nenhuma linha da SU ' + p.su + ' para copiar a cor — ajuste a cor da célula manualmente.');
      }
    });
    SpreadsheetApp.flush();
  }
  return {
    rel: {
      aplicado: !!aplicar, acao: p.acao, nome: p.nome, su: p.su || '', avisos: avisos,
      itens: plano.map(function (x) { return { aba: x.A.nome, escala: x.B.titulo, linha: x.R.r + 1, sub: x.R.sub }; })
    }
  };
}


/* ============================================================ EXPORTAR PRÉVIA (PDF) */
function mnuExportarPrevia() { mostrarHtml_(CSS_EXTRA_ + HTML_PDF_ + JS_COMUM_ + '<script>' + JS_PDF_ + '</script>', 'Exportar prévia (PDF)', 520, 520); }

function apiPreviasLista(incluirModelo) {
  var out = [], hoje = new Date(), h0 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  abasPrevia_().forEach(function (sh) {
    if (sh.isSheetHidden() || (!incluirModelo && /Modelo/i.test(sh.getName()))) return;
    var v = sh.getRange('C2').getValue(), ini = v instanceof Date ? new Date(v.getFullYear(), v.getMonth(), v.getDate()) : null;
    out.push({ nome: sh.getName(), t: ini ? ini.getTime() : 0, atual: !!ini && ini <= h0 && h0 <= new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + 6) });
  });
  out.sort(function (a, b) { return b.t - a.t; });
  return out;
}

function apiExportarPrevia(nome, paisagem) {
  var sh = ss_().getSheetByName(nome);
  if (!sh) throw new Error('Aba "' + nome + '" não encontrada.');
  var lr = sh.getLastRow(), v = sh.getRange(1, 1, lr, 9).getDisplayValues(), ult = 10;
  for (var r = 0; r < v.length; r++) if (v[r].some(function (x) { return String(x).trim() !== ''; })) ult = r + 1;
  var url = 'https://docs.google.com/spreadsheets/d/' + ss_().getId() + '/export?format=pdf&gid=' + sh.getSheetId() + '&size=A4&portrait=' + (paisagem ? 'false' : 'true') +
    '&fitw=true&gridlines=false&printtitle=false&sheetnames=false&pagenumbers=false&top_margin=0.4&bottom_margin=0.4&left_margin=0.4&right_margin=0.4&range=' + encodeURIComponent('A1:I' + ult);
  var resp = buscarUrl_(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) throw new Error('Falha ao gerar o PDF (HTTP ' + resp.getResponseCode() + ').');
  var blob = resp.getBlob().setName(nome + '.pdf'), pasta = null;
  try { pasta = pastaDaPlanilha_(); } catch (e) { pasta = null; }
  var arq = pasta ? pasta.createFile(blob) : DriveApp.createFile(blob);
  return { rel: { nome: arq.getName(), url: arq.getUrl(), paisagem: !!paisagem, linhas: ult } };
}

/* ============================================================ CONFERIR PRÉVIA */
function mnuConferirPrevia() { mostrarHtml_(CSS_EXTRA_ + HTML_CONF_ + JS_COMUM_ + '<script>' + JS_CONF_ + '</script>', 'Conferir prévia', 640, 640); }

function apiConferirPrevia(nome) {
  var sh = ss_().getSheetByName(nome);
  if (!sh) throw new Error('Aba "' + nome + '" não encontrada.');
  var lr = sh.getLastRow(), rg = sh.getRange(1, 1, lr, 9), disp = rg.getDisplayValues(), forms = rg.getFormulas(), datas = datasPrevia_(sh);
  var rot = {};
  rotularLinhasPrevia_(sh).forEach(function (m) { if (!rot[m.r]) rot[m.r] = m; });
  var linhas = [], total = 0, meses = {};
  datas.forEach(function (d) { meses[CFG.MESES[d.getMonth()]] = true; });
  var mesesTxt = Object.keys(meses).join(' / ');
  for (var r = 3; r < lr; r++) {
    var dias = [], f1 = '';
    for (var c = 2; c < 9; c++) {
      var t = String(disp[r][c]).trim();
      if (t === 'PENDENTE' || /^#(ERROR|REF|N\/A|VALUE|NAME)/i.test(t) || /^(Loading|Carregando)/i.test(t)) {
        dias.push(CFG.DIAS[datas[c - 2].getDay()] + ' ' + ('0' + datas[c - 2].getDate()).slice(-2) + '/' + ('0' + (datas[c - 2].getMonth() + 1)).slice(-2));
        if (!f1) f1 = forms[r][c];
        total++;
      }
    }
    if (!dias.length) continue;
    var motivo;
    if (/IMPORTRANGE/i.test(f1)) motivo = 'Arquivo externo (Sgt Dia / Manobreiro): confira o acesso nas células cinzas J2:J4 (“Permitir acesso”) e se o arquivo tem a aba e a coluna desse dia.';
    else if (/\$A[L-N]\$/.test(f1)) motivo = 'Of Dia (arquivo externo): sem “0” de serviço nesse dia na aba do mês, ou cor de legenda não reconhecida. Use “Atualizar prévia”.';
    else if (/\$A[UVW]\$/.test(f1)) motivo = 'Atendimento (arquivo externo): sem “0” no bloco do dia ou aba do mês não encontrada. Use “Atualizar prévia”.';
    else if (/\$(AY|AZ|BA)\$/.test(f1)) motivo = 'Motorista (arquivo da garagem): sem “0” ou nome na célula do dia, ou aba do mês não encontrada. Use “Atualizar prévia”.';
    else if (/INDIRECT/i.test(f1)) motivo = 'Escala da própria planilha: nenhum militar com “0” nesse dia na aba ' + mesesTxt + ' (Grad ou Cndt e Praia), ou o bloco não foi encontrado.';
    else motivo = 'Confira a fórmula da célula ou rode “Atualizar prévia”.';
    var m = rot[r + 1];
    linhas.push({ secao: m ? m.secao : '', label: (m && m.label) || String(disp[r][1]).trim() || ('linha ' + (r + 1)), r: r + 1, dias: dias, motivo: motivo });
  }
  var carimbo = String(sh.getRange('J1').getDisplayValue() || '');
  return { nome: nome, total: total, linhas: linhas, carimbo: carimbo };
}

/* ============================================================ CONFERÊNCIA DO EFETIVO (embaixo de cada escala) */
var ROT_PREV_ = 'EFETIVO PREVISTO', ROT_ESC_ = 'EFETIVO ESCALADO';

function mnuConferenciaEfetivo() { mostrarHtml_(CSS_EXTRA_ + HTML_EFET_ + JS_COMUM_ + '<script>' + JS_EFET_ + '</script>', 'Conferência do efetivo', 700, 680); }

/** linhas (0-based) do previsto e do escalado: coladas embaixo do bloco (ou depois de uma linha em branco, no modelo antigo); a linha "escalado" tem a fórmula COUNTIF */
function acharLinhasEfetivo_(A, B) {
  var ult = B.rows[B.rows.length - 1].r, F1 = colDia_(1);
  function temConf(r) {
    if (r >= A.forms.length) return false;
    for (var d = 1; d <= A.nDias; d++) if (/COUNTIF/i.test(A.forms[r][F1 + d - 1] || '')) return true;
    return false;
  }
  for (var o = 1; o <= 4; o++) { if (temConf(ult + o + 1)) return { prev: ult + o, esc: ult + o + 1 }; }
  return null;
}

/** previsto por dia: QG só nos dias laranja; POMN dois-em-um 5/3; título "N ESCALA" por dia; demais, dias em que o bloco tem escala */
function previstoDias_(A, B, base, mudou) {
  var out = [], vd = {};
  try { vd = vagasDiaBloco_(A, B); } catch (e) { vd = {}; }
  for (var d = 1; d <= A.nDias; d++) {
    var v = '';
    if (B.kind === 'qg') v = B.gac[d] ? base : '';
    else if (ehPomnDuplo_(B)) v = vermelho_(A, B, d) ? (mudou ? base : 3) : base;
    else if (!mudou && vd[d] != null) v = vd[d];
    else v = B.rows.some(function (R) { return participa_(A, B, R, d); }) ? base : '';
    out.push(v);
  }
  return out;
}

function baseEfetivo_(A, B, ex) { /* valor mais frequente já digitado na linha "previsto"; senão, o sugerido pela escala */
  if (ex) {
    var cont = {}, mx = 0, base = null;
    for (var d = 1; d <= A.nDias; d++) {
      var x = num_(A.vals[ex.prev][colDia_(d)]);
      if (x != null) { cont[x] = (cont[x] || 0) + 1; if (cont[x] > mx) { mx = cont[x]; base = x; } }
    }
    if (base != null) return base;
  }
  return vagasSugeridas_(A, B);
}

function escreverEfetivo_(A, B, base, mudou) {
  var sh = A.sh, n = A.nDias, ex = acharLinhasEfetivo_(A, B), r2 = B.rows[B.rows.length - 1].r, rowPrev, rowEsc;
  if (ex) { rowPrev = ex.prev + 1; rowEsc = ex.esc + 1; }
  else { sh.insertRowsAfter(r2 + 1, 2); rowPrev = r2 + 2; rowEsc = r2 + 3; } /* duas linhas coladas embaixo da escala, sem rótulos */
  var F1 = colDia_(1) + 1, prev = previstoDias_(A, B, base, mudou), first = B.rows[0].r + 1, last = r2 + 1, form = [];
  for (var d = 1; d <= n; d++) {
    var L = colLetra_(colDia_(d)), rg = L + first + ':' + L + last;
    form.push(localizarFormula_('=IF(' + L + rowPrev + '="","",IF(COUNTIF(' + rg + ',0)=' + L + rowPrev + ',"OK",COUNTIF(' + rg + ',0)))'));
  }
  sh.getRange(rowPrev, F1, 1, n).setValues([prev]);
  sh.getRange(rowEsc, F1, 1, n).setFormulas([form]);
  sh.getRange(rowPrev, F1, 1, n).setFontSize(8).setFontColor('#5f6368').setHorizontalAlignment('center').setBackground('#ffffff');
  sh.getRange(rowEsc, F1, 1, n).setFontSize(9).setFontWeight('bold').setHorizontalAlignment('center').setBackground('#ffffff').setFontColor('#000000');
  sh.getRange(rowPrev, F1, 2, n).setBorder(true, true, true, true, true, true, '#999999', SpreadsheetApp.BorderStyle.SOLID);
  /* verde "OK" quando confere; vermelho quando falta ou sobra (e há previsto) */
  var real = sh.__real || sh, k = A.k || 0, area = sh.getRange(rowEsc, F1, 1, n), areaR = area.__real || area;
  var topo = colLetra_(colDia_(1)) + rowEsc, fVerde = deslocarFormula_('=' + topo + '="OK"', k), fVerm = deslocarFormula_('=AND(' + topo + '<>"",' + topo + '<>"OK")', k);
  var rowReal = areaR.getRow(), regras = real.getConditionalFormatRules().filter(function (r) {
    var rs = r.getRanges(); return !(rs.length && rs[0].getRow() === rowReal && rs[0].getNumRows() === 1);
  });
  regras.push(SpreadsheetApp.newConditionalFormatRule().setRanges([areaR]).whenFormulaSatisfied(localizarFormula_(fVerde)).setBackground('#b7e1cd').setFontColor('#0b5394').build());
  regras.push(SpreadsheetApp.newConditionalFormatRule().setRanges([areaR]).whenFormulaSatisfied(localizarFormula_(fVerm)).setBackground('#d93025').setFontColor('#ffffff').build());
  real.setConditionalFormatRules(regras);
  return { criado: !ex, previsto: base };
}

/** refaz a linha "previsto" das escalas que já têm conferência (ex.: depois de importar a Guarnição ou criar o mês) */
function recalcPrevisto_(sh) {
  var A = lerAba_(sh), blocos = A.blocos.filter(function (B) { return acharLinhasEfetivo_(A, B); });
  blocos.sort(function (a, b) { return b.hdr - a.hdr; });
  blocos.forEach(function (B) { escreverEfetivo_(A, B, baseEfetivo_(A, B, acharLinhasEfetivo_(A, B)), false); });
  return blocos.length;
}

function apiEfetivoInfo(mesId, tipos) {
  var out = [];
  (tipos || []).forEach(function (t) {
    var sh = ss_().getSheetByName(mesId + ' ' + t);
    if (!sh) return;
    var A = lerAba_(sh);
    A.blocos.forEach(function (B) {
      var ex = acharLinhasEfetivo_(A, B), vd = {};
      try { vd = vagasDiaBloco_(A, B); } catch (e) { vd = {}; }
      out.push({ aba: A.nome, tipo: t, hdr: B.hdr, titulo: B.titulo, previsto: baseEfetivo_(A, B, ex), tem: !!ex,
        nota: B.kind === 'qg' ? 'só dias laranja' : ehPomnDuplo_(B) ? '5 úteis / 3 vermelhos' : (Object.keys(vd).length ? 'vagas pelo título do dia' : '') });
    });
  });
  if (!out.length) throw new Error('Nenhuma aba encontrada para ' + mesId + '.');
  return out;
}

/** p: {blocos:[{aba, hdr, previsto, mudou}]} */
function apiEfetivoAplicar(p) {
  if (!p.blocos || !p.blocos.length) throw new Error('Marque ao menos uma escala.');
  var porAba = {}, itens = [];
  p.blocos.forEach(function (b) { (porAba[b.aba] = porAba[b.aba] || []).push(b); });
  Object.keys(porAba).forEach(function (nome) {
    var sh = ss_().getSheetByName(nome);
    if (!sh) throw new Error('Aba "' + nome + '" não encontrada.');
    var A = lerAba_(sh), lista = porAba[nome].slice().sort(function (a, b) { return b.hdr - a.hdr; });
    lista.forEach(function (b) {
      var B = null;
      A.blocos.forEach(function (x) { if (x.hdr === Number(b.hdr)) B = x; });
      if (!B) return;
      var base = Number(b.previsto);
      if (isNaN(base) || base < 0) throw new Error('Efetivo previsto inválido em ' + B.titulo + '.');
      var r = escreverEfetivo_(A, B, base, !!b.mudou);
      itens.push({ aba: nome, escala: B.titulo, previsto: base, criado: r.criado });
    });
  });
  SpreadsheetApp.flush();
  return { rel: { itens: itens } };
}
