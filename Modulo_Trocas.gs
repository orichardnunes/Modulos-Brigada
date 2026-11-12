/**
 * MÓDULO BRIGADA 1.0 — Modulo_Trocas.gs
 * Central de trocas: o militar pede a troca por um Formulário Google (celular) ou por um comentário "TROCA ..." na planilha;
 * o pedido vira uma linha na aba "Central de trocas"; o S/1 autoriza ou nega (lista na própria aba, que funciona no celular,
 * ou botões na tela do módulo). Autorizada, a troca é gravada como anotação no "0" de quem sai (a prévia já lê isso).
 * Depende de Codigo.gs, Modulo_Escala.gs, Modulo_Auditagem.gs e Modulo_Extras.gs. Escopos novos: forms e script.send_mail.
 */

var HTML_CENTRAL_ = '<h3 style="margin-top:0">Central de trocas</h3>\n' +
  '<p class="sub">Pedidos feitos pelos militares (formulário ou comentário “TROCA …”). Autorize ou negue; a troca autorizada é gravada na escala.</p>\n' +
  '<div id="resumo"></div>\n' +
  '<div class="bar"><label class="chip"><input type="radio" name="f" value="pendentes" checked onchange="carrega()">Pendentes</label><label class="chip"><input type="radio" name="f" value="todas" onchange="carrega()">Todas</label></div>\n' +
  '<div id="lista">Carregando…</div>\n' +
  '<details><summary>Configuração</summary>\n' +
  '<div class="sec">Formulário (celular)</div>\n' +
  '<div class="bar"><button onclick="form()" style="margin:0">Criar / atualizar formulário</button><span id="fl" class="mu"></span></div>\n' +
  '<div class="sec">Comentários</div>\n' +
  '<label class="opt"><input type="checkbox" id="com"> Ler comentários da planilha que começam com <b>TROCA</b> (a cada 5 min). Formato: <span class="mu">TROCA 15/11 CB DIA: SAI SD EP FULANO ENTRA SD EP BELTRANO</span></label>\n' +
  '<div class="sec">Autorizadores</div>\n' +
  '<div class="bar"><input type="text" id="aprov" placeholder="e-mails separados por vírgula (vazio = qualquer editor)" style="flex:1"></div>\n' +
  '<label class="opt"><input type="checkbox" id="not"> Avisar por e-mail (novo pedido para os autorizadores; decisão para quem pediu pelo formulário)</label>\n' +
  '<button class="p" onclick="salvar()">Salvar configuração</button>\n' +
  '</details>\n' +
  '<div id="out" style="margin-top:8px"></div>\n';
var JS_CENTRAL_ = 'var ST=null;\n' +
  'function filtro(){return document.querySelector("input[name=f]:checked").value}\n' +
  'function carrega(){google.script.run.withSuccessHandler(pinta).withFailureHandler(falha).apiTrocasEstado(filtro())}\n' +
  'function pinta(r){ST=r;var n=r.n,h="";\n' +
  'h+="<div class=cards><div class=\\"card"+(n.Pendente?" bad":"")+"\\"><b>"+n.Pendente+"</b><span>pendente(s)</span></div><div class=card><b>"+n.Autorizada+"</b><span>autorizada(s)</span></div><div class=card><b>"+n.Negada+"</b><span>negada(s)</span></div></div>";\n' +
  '$("resumo").innerHTML=h;\n' +
  '$("fl").innerHTML=r.cfg.tem?"Link: <a target=_blank href=\\""+esc(r.cfg.formUrl)+"\\">abrir formulário</a> (envie aos militares)":"Ainda não criado.";\n' +
  '$("com").checked=r.cfg.comentarios;$("aprov").value=r.cfg.aprov;$("not").checked=r.cfg.notificar;\n' +
  'var l="";if(!r.itens.length)l="<p class=mu>Nenhum pedido"+(filtro()==="pendentes"?" pendente":"")+".</p>";\n' +
  'r.itens.forEach(function(x){var pend=x.sit==="Pendente";\n' +
  'l+="<div class=\\"ban "+(pend?"inf":(x.sit==="Autorizada"?"okb":"offb"))+"\\" style=\\"margin:8px 0\\"><b>"+esc(x.id)+"</b> · "+esc(x.data)+" · "+esc(x.esc)+" <span class=mu>"+esc(x.aba)+" · "+esc(x.org)+"</span><br>"+\n' +
  '"Escalado: <b>"+esc(x.sai)+"</b> → pega: <b>"+esc(x.entra)+"</b>"+(x.sol?"<br><span class=mu>Pedido de "+esc(x.sol)+" em "+esc(x.rec)+"</span>":"")+(x.mot?"<br><span class=mu>Motivo: "+esc(x.mot)+"</span>":"")+\n' +
  '(x.alert&&x.alert!=="Sem alertas"?"<br><span class=\\"tg al\\">"+esc(x.alert)+"</span>":(pend?"<br><span class=\\"tg ok\\">sem alertas</span>":""))+\n' +
  '(!pend?"<br><span class=mu>"+esc(x.sit)+(x.por?" por "+esc(x.por):"")+(x.obs?" · "+esc(x.obs):"")+"</span>":"")+\n' +
  '(pend?"<div style=\\"margin-top:6px\\"><input type=text id=o"+esc(x.id)+" placeholder=\\"observação (opcional)\\" style=\\"width:230px\\"> <button class=p onclick=\\"dec(\'"+esc(x.id)+"\',\'Autorizar\')\\">Autorizar</button><button onclick=\\"dec(\'"+esc(x.id)+"\',\'Negar\')\\" style=\\"color:#b00020\\">Negar</button></div>":(x.sit==="Autorizada"?"<div><button onclick=\\"dec(\'"+esc(x.id)+"\',\'Cancelar\')\\" style=\\"color:#b00020\\">Cancelar troca</button></div>":""))+"</div>"});\n' +
  '$("lista").innerHTML=l}\n' +
  'function dec(id,a){var ob=$("o"+id)?$("o"+id).value:"";if(a==="Cancelar"&&!confirm("Cancelar a troca "+id+"? A anotação da escala será removida."))return;\n' +
  'var o=$("out");o.style.display="block";o.className="";o.textContent="Processando…";\n' +
  'google.script.run.withSuccessHandler(function(s){o.textContent="";carrega()}).withFailureHandler(falha).apiTrocaDecidir(id,a,ob)}\n' +
  'function form(){var o=$("out");o.style.display="block";o.className="";o.textContent="Criando/atualizando o formulário…";google.script.run.withSuccessHandler(function(){o.textContent="";carrega()}).withFailureHandler(falha).apiTrocasFormulario()}\n' +
  'function salvar(){var o=$("out");o.style.display="block";o.className="";o.textContent="Salvando…";google.script.run.withSuccessHandler(function(){o.textContent="Configuração salva.";carrega()}).withFailureHandler(falha).apiTrocasSalvarCfg({comentarios:$("com").checked,notificar:$("not").checked,aprov:$("aprov").value})}\n' +
  'carrega();\n';

var CENTRAL_ = 'Central de trocas';
var SIT_ = ['Pendente', 'Autorizar', 'Negar', 'Cancelar', 'Autorizada', 'Negada', 'Cancelada', 'Inválida'];

function cfgTrocas_() {
  var c = JSON.parse(PropertiesService.getDocumentProperties().getProperty('TROCAS_CFG') || 'null') || {};
  return { formId: c.formId || '', formUrl: c.formUrl || '', itens: c.itens || {}, comentarios: !!c.comentarios, aprov: c.aprov || [], notificar: c.notificar !== false, vistos: c.vistos || [] };
}
function salvarCfgTrocas_(c) { PropertiesService.getDocumentProperties().setProperty('TROCAS_CFG', JSON.stringify(c)); }

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

/** p: {origem, solicitante, iso, tipo, titulo, sai, entra, motivo, comentarioId} -> {id, situacao, obs} */
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
    dados = { mes: mesId, tipo: p.tipo, hdr: b.hdr, iso: p.iso, aba: info.aba, com: p.comentarioId || '' };
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
      'Novo pedido de troca ' + x.id + '\n' + d + ' · ' + x.titulo + '\nSai: ' + x.sai + '\nEntra: ' + x.entra + '\nSolicitante: ' + (x.solicitante || '-') + '\nMotivo: ' + (x.motivo || '-') + '\nAlertas: ' + (x.alertas || 'nenhum') + '\n\nAutorize ou negue na aba "Central de trocas" (ou no menu Módulo Brigada → Confecção → Central de trocas).' :
      'Sua troca ' + x.id + ' (' + d + ' · ' + x.titulo + ': ' + x.sai + ' → ' + x.entra + ') foi ' + x.situacao.toLowerCase() + '.' + (x.obs ? '\nObservação: ' + x.obs : '');
    MailApp.sendEmail(dest.join(','), (tipo === 'novo' ? '[Trocas] Novo pedido ' : '[Trocas] Troca ') + x.id, corpo);
  } catch (e) { Logger.log('E-mail de troca: ' + e.message); }
}

/** responde ao comentário de origem (Drive API) */
function responderComentario_(comentarioId, texto) {
  if (!comentarioId) return;
  try {
    buscarUrl_('https://www.googleapis.com/drive/v3/files/' + ss_().getId() + '/comments/' + comentarioId + '/replies?fields=id',
      { method: 'post', contentType: 'application/json', payload: JSON.stringify({ content: texto }), headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  } catch (e) { Logger.log('Resposta ao comentário: ' + e.message); }
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
  if (d && d.com) responderComentario_(d.com, 'Troca ' + id + ': ' + novo.toLowerCase() + (obs ? ' (' + obs + ')' : '') + '.');
  return novo;
}

/* ---------- entrada 1: formulário */
function opcoesFormTrocas_() {
  var hoje = new Date(), meses = [hoje.getMonth(), (hoje.getMonth() + 1) % 12], escalas = {}, mil = {};
  meses.forEach(function (m) {
    [CFG.TIPO_GRAD, CFG.TIPO_CNDT].forEach(function (t) {
      var sh = ss_().getSheetByName(CFG.MESES[m] + ' ' + t);
      if (!sh) return;
      var A = lerAba_(sh);
      A.blocos.forEach(function (B) {
        escalas[B.titulo + ' | ' + t] = true;
        B.rows.forEach(function (R) { mil[R.nome.replace(/\s+/g, ' ').trim()] = true; });
      });
    });
  });
  return { escalas: Object.keys(escalas).sort(), mil: Object.keys(mil).sort() };
}

function criarFormularioTrocas_() {
  var c = cfgTrocas_();
  if (c.formId) { try { FormApp.openById(c.formId); return atualizarFormularioTrocas_(); } catch (e) { c.formId = ''; } }
  var o = opcoesFormTrocas_();
  if (!o.escalas.length) throw new Error('Nenhuma aba de escala do mês encontrada para montar as listas.');
  var f = FormApp.create('Troca de serviço — 21º GAC');
  f.setDescription('Peça a troca do seu serviço. O S/1 recebe o pedido e autoriza ou nega.');
  f.setCollectEmail(true).setAllowResponseEdits(false).setConfirmationMessage('Pedido enviado. Aguarde a decisão do S/1.');
  var it = {};
  it.data = f.addDateItem().setTitle('Data do serviço').setRequired(true).getId();
  it.escala = f.addListItem().setTitle('Escala').setChoiceValues(o.escalas).setRequired(true).getId();
  it.sai = f.addListItem().setTitle('Militar escalado (quem sai)').setChoiceValues(o.mil).setRequired(true).getId();
  it.entra = f.addListItem().setTitle('Militar que vai pegar o serviço (quem entra)').setChoiceValues(o.mil).setRequired(true).getId();
  it.motivo = f.addParagraphTextItem().setTitle('Motivo (opcional)').getId();
  c.formId = f.getId(); c.formUrl = f.getPublishedUrl(); c.itens = it;
  salvarCfgTrocas_(c);
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'aoEnviarTroca') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('aoEnviarTroca').forForm(f).onFormSubmit().create();
  return c;
}

function atualizarFormularioTrocas_() {
  var c = cfgTrocas_();
  if (!c.formId) throw new Error('O formulário ainda não foi criado.');
  var f = FormApp.openById(c.formId), o = opcoesFormTrocas_();
  f.getItemById(Number(c.itens.escala)).asListItem().setChoiceValues(o.escalas);
  f.getItemById(Number(c.itens.sai)).asListItem().setChoiceValues(o.mil);
  f.getItemById(Number(c.itens.entra)).asListItem().setChoiceValues(o.mil);
  return c;
}

function atualizarListasTrocasTrigger() { try { if (cfgTrocas_().formId) atualizarFormularioTrocas_(); } catch (e) { Logger.log('Listas do formulário: ' + e.message); } }

/** gatilho do formulário */
function aoEnviarTroca(e) {
  var c = cfgTrocas_(), r = e.response, v = {};
  r.getItemResponses().forEach(function (ir) { v[ir.getItem().getId()] = ir.getResponse(); });
  var esc = String(v[c.itens.escala] || ''), k = esc.lastIndexOf(' | ');
  registrarTroca_({
    origem: 'Formulário', solicitante: r.getRespondentEmail() || '', iso: String(v[c.itens.data] || ''),
    titulo: k >= 0 ? esc.slice(0, k) : esc, tipo: k >= 0 ? esc.slice(k + 3) : CFG.TIPO_GRAD,
    sai: v[c.itens.sai], entra: v[c.itens.entra], motivo: v[c.itens.motivo] || ''
  });
}

/* ---------- entrada 2: comentário "TROCA dd/mm [escala]: SAI nome ENTRA nome" */
function parseComentarioTroca_(texto) {
  var t = String(texto).replace(/\s+/g, ' ').trim();
  if (!/^TROCA\b/i.test(t)) return null;
  var m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/.exec(t);
  if (!m) return { erro: 'Informe a data, por exemplo: TROCA 15/11 CB DIA: SAI SD EP FULANO ENTRA SD EP BELTRANO.' };
  var hoje = new Date(), ano = m[3] ? Number(m[3]) : hoje.getFullYear();
  if (ano < 100) ano += 2000;
  if (!m[3] && Number(m[2]) - 1 < hoje.getMonth() - 6) ano++;
  var iso = ano + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  var resto = t.replace(/^TROCA\s*/i, '').replace(m[0], ' ');
  var ms = /\bSAI\b[:\s-]*(.+?)(?=\bENTRA\b|$)/i.exec(resto), me = /\bENTRA\b[:\s-]*(.+)$/i.exec(resto);
  if (!ms || !me) return { erro: 'Use o formato: TROCA 15/11 CB DIA: SAI SD EP FULANO ENTRA SD EP BELTRANO (a escala é opcional).' };
  var limpa = function (x) { return String(x).replace(/[\/,;.]+\s*$/g, '').trim(); };
  var antes = resto.slice(0, resto.search(/\bSAI\b/i)).replace(/[:\-]/g, ' ');
  return { iso: iso, sai: limpa(ms[1]), entra: limpa(me[1]), escalaTxt: antes, motivo: '' };
}

/** acha tipo e escala: pelo texto ou, se ausente, pela escala em que quem sai tem “0” no dia */
function resolverPedidoComentario_(pc, autor) {
  var dt = parseIso_(pc.iso), mesId = CFG.MESES[dt.getMonth()], ctx = contextoTrocas_(mesId);
  var sai = resolverNomeNota_(pc.sai, ctx.chaves), entra = resolverNomeNota_(pc.entra, ctx.chaves);
  if (!sai) return { erro: 'Não identifiquei um único militar em “' + pc.sai + '” (quem sai). Escreva graduação e nome, como na escala.' };
  if (!entra) return { erro: 'Não identifiquei um único militar em “' + pc.entra + '” (quem entra). Escreva graduação e nome, como na escala.' };
  var alvo = semAcento_(pc.escalaTxt), esc = null;
  ctx.escalas.forEach(function (e) {
    var tt = semAcento_(e.titulo);
    if (tt && alvo.indexOf(tt) >= 0 && (!esc || tt.length > semAcento_(esc.titulo).length)) esc = e;
  });
  if (!esc) {
    var achados = [];
    [CFG.TIPO_GRAD, CFG.TIPO_CNDT].forEach(function (t) {
      var sh = ss_().getSheetByName(mesId + ' ' + t);
      if (!sh) return;
      var A = lerAba_(sh), d = dt.getDate();
      A.blocos.forEach(function (B) {
        B.rows.forEach(function (R) {
          if (R.key !== sai.key || !participa_(A, B, R, d) || num_(A.vals[R.r][colDia_(d)]) !== 0) return;
          var cl = classeCel_(A, R.r, colDia_(d));
          if (cl !== 'afast' && cl !== 'verde') achados.push({ titulo: B.titulo, tipo: t });
        });
      });
    });
    if (achados.length === 1) esc = achados[0];
    else return { erro: achados.length ? 'Quem sai está em mais de uma escala nesse dia; escreva o nome da escala no comentário.' : sai.nome + ' não tem “0” de serviço nesse dia.' };
  }
  return { iso: pc.iso, tipo: esc.tipo, titulo: esc.titulo, sai: sai.nome.replace(/\s+/g, ' ').trim(), entra: entra.nome.replace(/\s+/g, ' ').trim(), motivo: pc.motivo || '' };
}

/** gatilho (a cada 5 min): lê os comentários novos da planilha que começam com TROCA */
function verificarComentariosTrocas() {
  var c = cfgTrocas_();
  if (!c.comentarios) return 0;
  var url = 'https://www.googleapis.com/drive/v3/files/' + ss_().getId() + '/comments?pageSize=100&includeDeleted=false&fields=' +
    encodeURIComponent('comments(id,content,author(displayName,emailAddress),resolved,createdTime)');
  var resp = buscarUrl_(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) throw new Error('Não foi possível ler os comentários (HTTP ' + resp.getResponseCode() + ').');
  var lista = JSON.parse(resp.getContentText()).comments || [], novos = 0, vistos = c.vistos.slice();
  lista.forEach(function (cm) {
    if (cm.resolved || vistos.indexOf(cm.id) >= 0 || !/^\s*TROCA\b/i.test(cm.content || '')) return;
    vistos.push(cm.id);
    var autor = (cm.author && (cm.author.emailAddress || cm.author.displayName)) || '';
    var pc = parseComentarioTroca_(cm.content), rp = pc && !pc.erro ? resolverPedidoComentario_(pc, autor) : pc;
    if (!rp || rp.erro) { responderComentario_(cm.id, 'Pedido de troca não registrado: ' + ((rp && rp.erro) || 'formato inválido') + ' Use: TROCA 15/11 CB DIA: SAI SD EP FULANO ENTRA SD EP BELTRANO'); return; }
    rp.origem = 'Comentário'; rp.solicitante = autor; rp.comentarioId = cm.id;
    var r = registrarTroca_(rp);
    novos++;
    responderComentario_(cm.id, r.situacao === 'Pendente' ? 'Pedido ' + r.id + ' registrado na Central de trocas. Aguarde a decisão do S/1.' : 'Pedido ' + r.id + ' não pôde ser registrado: ' + r.obs);
  });
  c = cfgTrocas_(); c.vistos = vistos.slice(-300); salvarCfgTrocas_(c);
  return novos;
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
  var tr = ScriptApp.getProjectTriggers(), c = cfgTrocas_();
  function tem(f) { return tr.some(function (t) { return t.getHandlerFunction() === f; }); }
  if (!tem('aoEditarCentral')) ScriptApp.newTrigger('aoEditarCentral').forSpreadsheet(ss_().getId()).onEdit().create();
  if (!tem('atualizarListasTrocasTrigger')) ScriptApp.newTrigger('atualizarListasTrocasTrigger').timeBased().everyDays(1).atHour(4).create();
  tr.forEach(function (t) { if (t.getHandlerFunction() === 'verificarComentariosTrocas' && !c.comentarios) ScriptApp.deleteTrigger(t); });
  if (c.comentarios && !tem('verificarComentariosTrocas')) ScriptApp.newTrigger('verificarComentariosTrocas').timeBased().everyMinutes(5).create();
}

function mnuCentralTrocas() { mostrarHtml_(CSS_EXTRA_ + HTML_CENTRAL_ + JS_COMUM_ + '<script>' + JS_CENTRAL_ + '</script>', 'Central de trocas', 760, 700); }

function apiTrocasEstado(filtro) {
  var c = cfgTrocas_(), sh = ss_().getSheetByName(CENTRAL_), out = { cfg: { formUrl: c.formUrl, tem: !!c.formId, comentarios: c.comentarios, aprov: c.aprov.join(', '), notificar: c.notificar }, itens: [], n: { Pendente: 0, Autorizada: 0, Negada: 0, outras: 0 } };
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
  c.comentarios = !!p.comentarios; c.notificar = !!p.notificar;
  c.aprov = String(p.aprov || '').split(/[,;\s]+/).filter(function (x) { return /@/.test(x); });
  salvarCfgTrocas_(c);
  garantirCentral_();
  instalarGatilhosTrocas_();
  return apiTrocasEstado('pendentes').cfg;
}

function apiTrocasFormulario() {
  garantirCentral_();
  var c = criarFormularioTrocas_();
  instalarGatilhosTrocas_();
  return { formUrl: c.formUrl };
}
