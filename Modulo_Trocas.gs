/**
 * MÓDULO BRIGADA 1.0 — Modulo_Trocas.gs
 * Central de trocas: o militar pede a troca pelo aplicativo web do módulo (Modulo_TrocasWeb.gs, visual igual ao SiRAlt);
 * o pedido vira uma linha na aba "Central de trocas"; o S/1 autoriza ou nega no próprio aplicativo (código de autorização),
 * na lista da aba (funciona no celular) ou na tela do módulo. Autorizada, a troca é gravada como anotação no "0" de quem sai.
 * Depende de Codigo.gs, Modulo_Escala.gs, Modulo_Auditagem.gs e Modulo_Extras.gs. Escopo: script.send_mail (avisos).
 */

var HTML_CENTRAL_ = '<style>\n' +
  '.rq{border:1px solid #e0e0e0;border-left:5px solid #1a73e8;border-radius:10px;padding:10px 12px;margin:8px 0;background:#fff}\n' +
  '.rq.Autorizada{border-left-color:#137333}.rq.Negada,.rq.Inválida{border-left-color:#b00020}.rq.Cancelada{border-left-color:#9aa0a6}.rq.Pendente{border-left-color:#f9ab00}\n' +
  '.rq .h{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}\n' +
  '.rq .t{font-weight:600}.rq .es{color:#5f6368;font-size:12px;margin:1px 0 6px}\n' +
  '.rq .tr{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#f8f9fa;border-radius:8px;padding:6px 10px}\n' +
  '.rq .tr div{flex:1;min-width:120px}.rq .tr small{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:#5f6368}.rq .tr .ar{flex:none;min-width:0;color:#5f6368;font-size:18px}\n' +
  '.rq .ac{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px}.rq .ac input{flex:1;min-width:160px}.rq .ac button{margin:0}\n' +
  '.pl{display:inline-block;border-radius:10px;padding:1px 10px;font-size:11px;font-weight:600;background:#f1f3f4;color:#5f6368}\n' +
  '.pl.Pendente{background:#fef7e0;color:#b06000}.pl.Autorizada{background:#e6f4ea;color:#137333}.pl.Negada,.pl.Inválida{background:#fce8e6;color:#b00020}\n' +
  '.cf{border:1px solid #e0e0e0;border-radius:10px;padding:10px 12px;margin:8px 0}.cf h4{margin:0 0 6px;font-size:13px;color:#3c4043;display:flex;align-items:center;gap:8px}\n' +
  '.cf input[type=text],.cf input[type=password]{width:100%}.cf .lk2{word-break:break-all;font-size:12px}\n' +
  '.btn-d{color:#b00020}\n' +
  '</style>\n' +
  '<h3 style="margin-top:0">📥 Central de trocas</h3>\n' +
  '<p class="sub">Pedidos feitos pelos militares no aplicativo. Autorize ou negue; a troca autorizada é gravada na escala.</p>\n' +
  '<div id="resumo"></div>\n' +
  '<div class="bar"><label class="chip"><input type="radio" name="f" value="pendentes" checked onchange="carrega()">Pendentes</label><label class="chip"><input type="radio" name="f" value="todas" onchange="carrega()">Todas</label><button onclick="carrega()" style="margin:0 0 0 auto">↻ Atualizar</button></div>\n' +
  '<div id="lista">Carregando…</div>\n' +
  '<details id="cfg"><summary>⚙️ Configuração</summary>\n' +
  '<div class="cf"><h4>📱 Aplicativo (celular) <span id="tl"></span></h4><div id="fl"></div></div>\n' +
  '<div class="cf"><h4>🔑 Código de acesso da Administração - S/1 <span id="pl2"></span></h4>\n' +
  '<input type="password" id="pin" placeholder="digite um novo código (mín. 4 caracteres) para definir ou trocar" autocomplete="new-password">\n' +
  '<div class="mu" style="margin-top:4px">Quem tiver o código decide os pedidos pelo aplicativo. Fica guardado apenas o hash.</div></div>\n' +
  '<div class="cf"><h4>✉️ Avisos por e-mail</h4>\n' +
  '<input type="text" id="aprov" placeholder="e-mails dos autorizadores, separados por vírgula">\n' +
  '<label class="opt" style="margin-top:6px"><input type="checkbox" id="not"> Avisar os autorizadores a cada novo pedido</label></div>\n' +
  '<div class="stk"><button class="p" onclick="salvar()">Salvar configuração</button></div>\n' +
  '</details>\n' +
  '<div id="out" style="margin-top:8px"></div>\n';
var JS_CENTRAL_ = 'var ST=null;\n' +
  'function filtro(){return document.querySelector("input[name=f]:checked").value}\n' +
  'function carrega(){google.script.run.withSuccessHandler(pinta).withFailureHandler(falha).apiTrocasEstado(filtro())}\n' +
  'function copiar(t){var a=document.createElement("textarea");a.value=t;document.body.appendChild(a);a.select();try{document.execCommand("copy");$("out").className="ok";$("out").style.display="block";$("out").textContent="Link copiado."}catch(e){}document.body.removeChild(a)}\n' +
  'function pinta(r){ST=r;var n=r.n,h="";\n' +
  'h+="<div class=cards><div class=\\"card"+(n.Pendente?" bad":"")+"\\"><b>"+n.Pendente+"</b><span>pendente(s)</span></div><div class=card><b style=\\"color:#137333\\">"+n.Autorizada+"</b><span>autorizada(s)</span></div><div class=card><b style=\\"color:#b00020\\">"+n.Negada+"</b><span>negada(s)</span></div></div>";\n' +
  '$("resumo").innerHTML=h;\n' +
  'if(r.cfg.url){$("tl").innerHTML="<span class=\\"tg ok\\">publicado</span>";$("fl").innerHTML="<div class=lk2><a target=_blank href=\\""+esc(r.cfg.url)+"\\">"+esc(r.cfg.url)+"</a></div><div><button onclick=\\"copiar(ST.cfg.url)\\">Copiar link</button><button onclick=\\"window.open(ST.cfg.url)\\">Abrir</button></div><div class=mu>Envie este link aos militares. Depois de mudar o código, publique uma nova versão em Implantar → Gerenciar implantações.</div>"}\n' +
  'else{$("tl").innerHTML="<span class=\\"tg al\\">não publicado</span>";$("fl").innerHTML="<div class=mu>No Apps Script: <b>Implantar → Nova implantação → App da Web</b> (executar como você; acesso: qualquer pessoa com login Google). O link aparece aqui depois de salvar.</div>"}\n' +
  '$("pl2").innerHTML=r.cfg.pin?"<span class=\\"tg ok\\">definido</span>":"<span class=\\"tg al\\">sem código</span>";\n' +
  '$("aprov").value=r.cfg.aprov;$("not").checked=r.cfg.notificar;\n' +
  'if(!r.cfg.pin||!r.cfg.url)$("cfg").open=true;\n' +
  'var l="";if(!r.itens.length)l="<div class=\\"ban inf\\">Nenhum pedido"+(filtro()==="pendentes"?" pendente":"")+" por aqui.</div>";\n' +
  'r.itens.forEach(function(x){var pend=x.sit==="Pendente";\n' +
  'l+="<div class=\\"rq "+esc(x.sit)+"\\"><div class=h><span class=t>"+esc(x.id)+" · "+esc(x.data)+"</span><span class=\\"pl "+esc(x.sit)+"\\">"+esc(x.sit)+"</span></div>"+\n' +
  '"<div class=es>"+esc(x.esc)+" · "+esc(x.aba)+" · via "+esc(x.org)+"</div>"+\n' +
  '"<div class=tr><div><small>Escalado (sai)</small><b>"+esc(x.sai)+"</b></div><span class=ar>➜</span><div><small>Vai pegar (entra)</small><b>"+esc(x.entra)+"</b></div></div>"+\n' +
  '(x.sol||x.mot?"<div class=mu style=\\"margin-top:6px\\">"+(x.sol?"Pedido de "+esc(x.sol)+" em "+esc(x.rec):"")+(x.mot?(x.sol?" · ":"")+"Motivo: "+esc(x.mot):"")+"</div>":"")+\n' +
  '(x.alert&&x.alert!=="Sem alertas"?"<div style=\\"margin-top:6px\\"><span class=\\"tg al\\">⚠ "+esc(x.alert)+"</span></div>":(pend?"<div style=\\"margin-top:6px\\"><span class=\\"tg ok\\">✔ sem alertas</span></div>":""))+\n' +
  '(!pend&&(x.por||x.obs)?"<div class=mu style=\\"margin-top:6px\\">"+(x.por?"Decidido por "+esc(x.por):"")+(x.obs?" · "+esc(x.obs):"")+"</div>":"")+\n' +
  '(pend?"<div class=ac><input type=text id=o"+esc(x.id)+" placeholder=\\"observação (opcional)\\"><button class=p onclick=\\"dec(\\\'"+esc(x.id)+"\\\',\\\'Autorizar\\\')\\">✔ Autorizar</button><button class=btn-d onclick=\\"dec(\\\'"+esc(x.id)+"\\\',\\\'Negar\\\')\\">✖ Negar</button></div>":(x.sit==="Autorizada"?"<div class=ac><button class=btn-d onclick=\\"dec(\\\'"+esc(x.id)+"\\\',\\\'Cancelar\\\')\\">↩ Cancelar troca</button></div>":""))+"</div>"});\n' +
  '$("lista").innerHTML=l}\n' +
  'function dec(id,a){var ob=$("o"+id)?$("o"+id).value:"";if(a==="Cancelar"&&!confirm("Cancelar a troca "+id+"? A anotação da escala será removida."))return;\n' +
  'var o=$("out");o.style.display="block";o.className="";o.textContent="Processando…";\n' +
  'google.script.run.withSuccessHandler(function(s){o.textContent="";carrega()}).withFailureHandler(falha).apiTrocaDecidir(id,a,ob)}\n' +
  'function salvar(){var o=$("out");o.style.display="block";o.className="";o.textContent="Salvando…";google.script.run.withSuccessHandler(function(){o.className="ok";o.textContent="Configuração salva.";$("pin").value="";carrega()}).withFailureHandler(falha).apiTrocasSalvarCfg({pin:$("pin").value,notificar:$("not").checked,aprov:$("aprov").value})}\n' +
  'carrega();\n';

var CENTRAL_ = 'Central de trocas';
var SIT_ = ['Pendente', 'Autorizar', 'Negar', 'Cancelar', 'Autorizada', 'Negada', 'Cancelada', 'Inválida'];

function cfgTrocas_() {
  var c = JSON.parse(PropertiesService.getDocumentProperties().getProperty('TROCAS_CFG') || 'null') || {};
  return { aprov: c.aprov || [], notificar: c.notificar !== false };
}
function salvarCfgTrocas_(c) { PropertiesService.getDocumentProperties().setProperty('TROCAS_CFG', JSON.stringify({ aprov: c.aprov, notificar: c.notificar })); }

/** aba "Central de trocas" (cria se não existir) */
function garantirCentral_() {
  var ss = ss_(), sh = ss.getSheetByName(CENTRAL_);
  if (sh) return sh;
  sh = ss.insertSheet(CENTRAL_);
  var cab = ['ID', 'Recebido em', 'Origem', 'Solicitante', 'Data', 'Aba', 'Escala', 'Quem sai', 'Quem entra', 'Motivo', 'Alertas', 'Situação', 'Decidido por', 'Decidido em', 'Observação', 'dados'];
  sh.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold').setBackground('#e8eaed').setWrap(true);
  sh.setFrozenRows(1);
  [70, 110, 90, 150, 80, 90, 160, 170, 170, 200, 220, 110, 150, 110, 240].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.hideColumns(16);
  var vd = SpreadsheetApp.newDataValidation().requireValueInList(SIT_, true).setAllowInvalid(false).build();
  sh.getRange(2, 12, 1000, 1).setDataValidation(vd);
  var rg = sh.getRange(2, 12, 1000, 1), regras = [
    ['Pendente', '#fef7e0', '#b06000'], ['Autorizada', '#e6f4ea', '#137333'], ['Negada', '#fce8e6', '#b00020'], ['Inválida', '#f1f3f4', '#5f6368'], ['Cancelada', '#f1f3f4', '#5f6368']
  ].map(function (r) { return SpreadsheetApp.newConditionalFormatRule().setRanges([rg]).whenTextEqualTo(r[0]).setBackground(r[1]).setFontColor(r[2]).build(); });
  sh.setConditionalFormatRules(regras);
  sh.getRange(1, 12).setNote('Mude para Autorizar ou Negar (funciona também no Planilhas do celular). Cancelar desfaz uma troca já autorizada.');
  return sh;
}

function proximoIdTroca_() {
  var p = PropertiesService.getDocumentProperties(), n = Number(p.getProperty('TROCAS_SEQ') || 0) + 1;
  p.setProperty('TROCAS_SEQ', String(n));
  return 'T-' + ('000' + n).slice(-4);
}

function acharLinhaTroca_(sh, id) {
  var ids = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues();
  for (var i = 1; i < ids.length; i++) if (String(ids[i][0]) === id) return i + 1;
  return 0;
}

/** militares (e escalas) do mês, para resolver nomes e escalas em texto livre */
function contextoTrocas_(mesId) {
  var tipos = [CFG.TIPO_GRAD, CFG.TIPO_CNDT], op = apiQuantitativoOpcoes([mesId], tipos), esc = [];
  tipos.forEach(function (t) { apiBlocos(mesId, [t]).blocos.forEach(function (b) { esc.push({ titulo: b.titulo, tipo: t, hdr: b.hdr }); }); });
  return { chaves: op.militares, escalas: esc };
}

/** p: {origem, solicitante, iso, tipo, titulo, sai, entra, motivo} -> {id, situacao, obs} */
function registrarTroca_(p) {
  var sh = garantirCentral_(), id = proximoIdTroca_(), agora = new Date(), situ = 'Pendente', obs = '', alertas = '', dados = {}, aba = '', data = null;
  try {
    var dt = parseIso_(p.iso), h0 = new Date(); h0.setHours(0, 0, 0, 0);
    data = dt;
    if (dt < h0) throw new Error('A data do serviço já passou.');
    var mesId = CFG.MESES[dt.getMonth()], b = apiBlocos(mesId, [p.tipo]).blocos.filter(function (x) { return x.titulo === p.titulo; })[0];
    if (!b) throw new Error('Escala "' + p.titulo + '" não encontrada em ' + mesId + ' ' + p.tipo + '.');
    var info = apiTrocaInfo(mesId, p.tipo, b.hdr, p.iso), ks = norm_(p.sai), ke = norm_(p.entra);
    aba = info.aba;
    var sai = info.sai.filter(function (x) { return norm_(x.nome) === ks; })[0];
    if (ks === ke) throw new Error('Quem sai e quem entra são o mesmo militar.');
    if (!sai) throw new Error(p.sai + ' não tem “0” de serviço em ' + info.data + ' nessa escala.');
    var ent = info.cands.filter(function (x) { return norm_(x.nome) === ke; })[0];
    if (!ent) throw new Error(p.entra + ' não pode entrar: já está de serviço nessa escala nesse dia ou não faz parte dela.');
    alertas = ent.flags.join('; ');
    dados = { mes: mesId, tipo: p.tipo, hdr: b.hdr, iso: p.iso, aba: info.aba };
    var v = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 16).getValues();
    for (var i = 1; i < v.length; i++) {
      if (v[i][11] === 'Pendente' && String(v[i][6]) === p.titulo && norm_(v[i][7]) === ks && v[i][15] && JSON.parse(v[i][15]).iso === p.iso) throw new Error('Pedido repetido (já existe ' + v[i][0] + ' pendente).');
    }
  } catch (e) { situ = 'Inválida'; obs = e.message; }
  sh.appendRow([id, agora, p.origem, p.solicitante || '', data || '', aba || (p.tipo || ''), p.titulo || '', p.sai || '', p.entra || '', p.motivo || '', alertas || (situ === 'Pendente' ? 'Sem alertas' : ''), situ, '', '', obs, JSON.stringify(dados)]);
  var r = sh.getLastRow();
  sh.getRange(r, 2).setNumberFormat('dd/mm/yyyy HH:mm');
  sh.getRange(r, 5).setNumberFormat('dd/mm/yyyy');
  sh.getRange(r, 1, 1, 15).setWrap(true).setVerticalAlignment('top');
  if (situ === 'Pendente') notificarTroca_('novo', { id: id, sai: p.sai, entra: p.entra, titulo: p.titulo, data: data, alertas: alertas, motivo: p.motivo, solicitante: p.solicitante });
  return { id: id, situacao: situ, obs: obs };
}

function emailsTroca_(c) { return (c.aprov || []).filter(function (x) { return /@/.test(x); }); }

function notificarTroca_(tipo, x, para) {
  var c = cfgTrocas_();
  try {
    if (!c.notificar) return;
    var dest = para ? [para] : emailsTroca_(c);
    if (!dest.length) return;
    var d = x.data instanceof Date ? fmtData_(x.data) : String(x.data || '');
    var corpo = tipo === 'novo' ?
      'Novo pedido de troca ' + x.id + '\n' + d + ' · ' + x.titulo + '\nSai: ' + x.sai + '\nEntra: ' + x.entra + '\nSolicitante: ' + (x.solicitante || '-') + '\nMotivo: ' + (x.motivo || '-') + '\nAlertas: ' + (x.alertas || 'nenhum') + '\n\nAutorize ou negue no aplicativo' + (urlAppTrocas_() ? ' (' + urlAppTrocas_() + ')' : '') + ', na aba "Central de trocas" ou no menu Módulo Brigada → Confecção → Central de trocas.' :
      'Sua troca ' + x.id + ' (' + d + ' · ' + x.titulo + ': ' + x.sai + ' → ' + x.entra + ') foi ' + x.situacao.toLowerCase() + '.' + (x.obs ? '\nObservação: ' + x.obs : '');
    MailApp.sendEmail(dest.join(','), (tipo === 'novo' ? '[Trocas] Novo pedido ' : '[Trocas] Troca ') + x.id, corpo);
  } catch (e) { Logger.log('E-mail de troca: ' + e.message); }
}

function gravarNotaTroca_(d, saiNome, entraNome) {
  var sh = ss_().getSheetByName(d.aba);
  if (!sh) throw new Error('Aba "' + d.aba + '" não encontrada.');
  var A = lerAba_(sh), B = null;
  A.blocos.forEach(function (b) { if (b.hdr === d.hdr) B = b; });
  if (!B) throw new Error('Escala não encontrada.');
  var dia = parseIso_(d.iso).getDate(), R = null, ks = norm_(saiNome);
  B.rows.forEach(function (r) { if (norm_(r.nome) === ks) R = r; });
  if (!R || num_(A.vals[R.r][colDia_(dia)]) !== 0) throw new Error(saiNome + ' não está mais com “0” de serviço nesse dia.');
  var nota = entraNome ? entraNome : '';
  sh.getRange(R.r + 1, colDia_(dia) + 1).setNote(nota);
  if (ehPar_(B)) { /* escala de pares: a anotação vale também para o outro dia do par */
    var d2 = ehCabecaPar_(A, B, dia) ? dia + 1 : dia - 1;
    if (d2 >= 1 && d2 <= A.nDias && num_(A.vals[R.r][colDia_(d2)]) === 0) sh.getRange(R.r + 1, colDia_(d2) + 1).setNote(nota);
  }
}

/** acao: 'Autorizar' | 'Negar' | 'Cancelar' */
function decidirTroca_(id, acao, quem, obs) {
  var sh = garantirCentral_(), r = acharLinhaTroca_(sh, id);
  if (!r) throw new Error('Pedido ' + id + ' não encontrado.');
  var l = sh.getRange(r, 1, 1, 16).getValues()[0], sit = l[11], d = l[15] ? JSON.parse(l[15]) : null, novo;
  var x = { id: id, sai: l[7], entra: l[8], titulo: l[6], data: l[4], obs: obs };
  if (acao === 'Autorizar') {
    if (sit !== 'Pendente' && sit !== 'Autorizar') throw new Error('Só pedidos pendentes podem ser autorizados (situação: ' + sit + ').');
    if (!d) throw new Error('Pedido sem dados válidos.');
    var info = apiTrocaInfo(d.mes, d.tipo, d.hdr, d.iso), ke = norm_(l[8]);
    var ent = info.cands.filter(function (c) { return norm_(c.nome) === ke; })[0];
    if (!ent) throw new Error(l[8] + ' já não pode entrar (está de serviço nesse dia nessa escala).');
    gravarNotaTroca_(d, l[7], l[8]);
    novo = 'Autorizada';
  } else if (acao === 'Negar') {
    if (sit !== 'Pendente' && sit !== 'Negar') throw new Error('Só pedidos pendentes podem ser negados (situação: ' + sit + ').');
    novo = 'Negada';
  } else if (acao === 'Cancelar') {
    if (sit !== 'Autorizada' && sit !== 'Cancelar') throw new Error('Só trocas autorizadas podem ser canceladas (situação: ' + sit + ').');
    if (d) { try { gravarNotaTroca_(d, l[7], ''); } catch (e) { obs = (obs ? obs + ' · ' : '') + 'anotação: ' + e.message; } }
    novo = 'Cancelada';
  } else throw new Error('Ação inválida.');
  sh.getRange(r, 12).setValue(novo);
  sh.getRange(r, 13).setValue(quem || '');
  sh.getRange(r, 14).setValue(new Date()).setNumberFormat('dd/mm/yyyy HH:mm');
  if (obs) sh.getRange(r, 15).setValue(obs);
  x.situacao = novo;
  var email = /@/.test(String(l[3])) ? String(l[3]).replace(/^.*<|>.*$/g, '') : '';
  if (email) notificarTroca_('decisao', x, email);
  return novo;
}

/* ---------- autorização pela própria aba (funciona no celular) */
function aoEditarCentral(e) {
  var sh = e.range.getSheet();
  if (sh.getName() !== CENTRAL_ || e.range.getColumn() !== 12 || e.range.getRow() < 2) return;
  var v = String(e.value || ''), r = e.range.getRow();
  if (['Autorizar', 'Negar', 'Cancelar'].indexOf(v) < 0) return;
  var id = String(sh.getRange(r, 1).getValue()), antes = e.oldValue || 'Pendente', c = cfgTrocas_();
  var quem = '';
  try { quem = (e.user && e.user.getEmail()) || Session.getActiveUser().getEmail() || ''; } catch (x) { quem = ''; }
  if (c.aprov.length && quem && c.aprov.map(function (m) { return m.toLowerCase(); }).indexOf(quem.toLowerCase()) < 0) {
    sh.getRange(r, 12).setValue(antes); sh.getRange(r, 15).setValue('Sem permissão para decidir (' + quem + ').');
    return;
  }
  try { sh.getRange(r, 15).clearContent(); decidirTroca_(id, v, quem, ''); }
  catch (er) { sh.getRange(r, 12).setValue(antes); sh.getRange(r, 15).setValue('Erro: ' + er.message); }
}

/* ---------- instalação e tela */
function instalarGatilhosTrocas_() {
  var tr = ScriptApp.getProjectTriggers();
  function tem(f) { return tr.some(function (t) { return t.getHandlerFunction() === f; }); }
  if (!tem('aoEditarCentral')) ScriptApp.newTrigger('aoEditarCentral').forSpreadsheet(ss_().getId()).onEdit().create();
  tr.forEach(function (t) { if (['verificarComentariosTrocas', 'aoEnviarTroca', 'atualizarListasTrocasTrigger'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); }); /* versões anteriores (comentários e formulário) */
}

function mnuCentralTrocas() { mostrarHtml_(CSS_EXTRA_ + HTML_CENTRAL_ + JS_COMUM_ + '<script>' + JS_CENTRAL_ + '</script>', 'Central de trocas', 760, 700); }

function apiTrocasEstado(filtro) {
  var c = cfgTrocas_(), sh = ss_().getSheetByName(CENTRAL_), out = { cfg: { url: urlAppTrocas_(), pin: !!PropertiesService.getDocumentProperties().getProperty('TROCAS_PIN'), aprov: c.aprov.join(', '), notificar: c.notificar }, itens: [], n: { Pendente: 0, Autorizada: 0, Negada: 0, outras: 0 } };
  if (!sh) return out;
  var v = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 15).getValues();
  for (var i = v.length - 1; i >= 1; i--) {
    var l = v[i]; if (!l[0]) continue;
    var s = l[11] === 'Autorizar' || l[11] === 'Negar' ? 'Pendente' : l[11];
    if (out.n[s] != null) out.n[s]++; else out.n.outras++;
    if (filtro === 'pendentes' && s !== 'Pendente') continue;
    if (out.itens.length >= 60) continue;
    out.itens.push({ id: l[0], rec: l[1] instanceof Date ? fmtData_(l[1]) : '', org: l[2], sol: l[3], data: l[4] instanceof Date ? fmtData_(l[4]) + ' ' + CFG.DIAS[l[4].getDay()] : '', aba: l[5], esc: l[6], sai: l[7], entra: l[8], mot: l[9], alert: l[10], sit: s, por: l[12], obs: l[14] });
  }
  return out;
}

function apiTrocaDecidir(id, acao, obs) {
  var c = cfgTrocas_(), quem = '';
  try { quem = Session.getActiveUser().getEmail() || ''; } catch (e) { quem = ''; }
  if (c.aprov.length && quem && c.aprov.map(function (m) { return m.toLowerCase(); }).indexOf(quem.toLowerCase()) < 0) throw new Error('Seu e-mail (' + quem + ') não está na lista de autorizadores.');
  return decidirTroca_(id, acao, quem, obs || '');
}

function apiTrocasSalvarCfg(p) {
  var c = cfgTrocas_();
  c.notificar = !!p.notificar;
  c.aprov = String(p.aprov || '').split(/[,;\s]+/).filter(function (x) { return /@/.test(x); });
  salvarCfgTrocas_(c);
  if (p.pin) definirPinTrocas_(p.pin);
  garantirCentral_();
  instalarGatilhosTrocas_();
  return apiTrocasEstado('pendentes').cfg;
}
