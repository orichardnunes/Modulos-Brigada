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
  '<div class="cf"><h4>🗂️ Planilha da Central (dados dos pedidos) <span id="tp"></span></h4><div id="fp"></div>\n' +
  '<input type="text" id="plan" placeholder="para usar outra planilha, cole o link ou o ID aqui (opcional)" style="margin-top:6px"></div>\n' +
  '<div class="cf"><h4>🔑 Acesso da 1ª Seção (bootstrap) <span id="pl2"></span></h4>\n' +
  '<select id="am" style="width:100%;margin-bottom:6px"></select><input type="password" id="pin" placeholder="senha deste militar (mín. 4 caracteres)" autocomplete="new-password">\n' +
  '<label class="opt" style="margin-top:6px"><input type="checkbox" id="aadm"> Administrador (configura, vê relatórios e auditoria no aplicativo)</label><div class="mu" style="margin-top:4px">Cada militar da 1ª Seção entra no aplicativo com a própria senha. Aqui você define a primeira senha (do administrador); depois tudo pode ser feito na área de Administração do aplicativo. Fica guardado apenas o hash.</div></div>\n' +
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
  'if(r.cfg.planilha){$("tp").innerHTML="<span class=\\"tg ok\\">separada da escala</span>";$("fp").innerHTML="<div class=lk2><a target=_blank href=\\""+esc(r.cfg.planilha)+"\\">"+esc(r.cfg.planilha)+"</a></div><div class=mu>Quem for decidir pelo celular (aba Situação) precisa de acesso de edição a ela. A escala não recebe mais essa aba.</div>"}else{$("tp").innerHTML="<span class=\\"tg al\\">erro</span>";$("fp").innerHTML="<div class=mu>"+esc(r.cfg.erro||"")+"</div>"}\n' +
  '$("pl2").innerHTML=r.cfg.comSenha+" de "+r.cfg.membros.length+" com senha";if(!$("am").options.length)$("am").innerHTML=r.cfg.membros.map(function(m){return "<option>"+esc(m)+"</option>"}).join("");\n' +
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
  'function salvar(){var o=$("out");o.style.display="block";o.className="";o.textContent="Salvando…";google.script.run.withSuccessHandler(function(){o.className="ok";o.textContent="Configuração salva.";$("pin").value="";$("plan").value="";carrega()}).withFailureHandler(falha).apiTrocasSalvarCfg({planilha:$("plan").value,acesso:$("pin").value?{nome:$("am").value,senha:$("pin").value,admin:$("aadm").checked}:null,notificar:$("not").checked,aprov:$("aprov").value})}\n' +
  'carrega();\n';

var CENTRAL_ = 'Central de trocas';
var TROCAS_MILITARES_ID = '1RAXj_4RHxQkr65eZYRedCj-Wmjkx1q4R-4Te6FR_t7A'; /* planilha do SiRAlt, aba "Militares": Graduação | Nº | Nome | Subunidade | Ativo */

/** cadastro de militares (qualquer um pode entrar numa troca); guarda 10 min em cache */
var CAD_MEMO_ = null;
function cadastroMilitares_() {
  if (CAD_MEMO_) return CAD_MEMO_;
  var cache = CacheService.getScriptCache(), c = null;
  try { c = cache.get('TROCAS_MIL'); } catch (e) { c = null; }
  if (c) { CAD_MEMO_ = JSON.parse(c); return CAD_MEMO_; }
  var lista = [];
  var aba = SpreadsheetApp.openById(TROCAS_MILITARES_ID).getSheetByName('Militares');
  if (!aba) throw new Error('A planilha de militares não tem a aba "Militares".');
  if (aba.getLastRow() > 1) {
    aba.getRange(2, 1, Math.min(aba.getLastRow() - 1, 2000), 5).getValues().forEach(function (r) {
      var nome = String(r[2] || '').replace(/\s+/g, ' ').trim(), grad = String(r[0] || '').replace(/\s+/g, ' ').trim(), at = String(r[4] || '').trim().toLowerCase();
      if (!nome || ['não', 'nao', 'n', 'inativo'].indexOf(at) >= 0) return;
      lista.push({ full: (grad + ' ' + nome).toUpperCase(), nome: nome, sub: String(r[3] || '').trim() });
    });
  }
  try { cache.put('TROCAS_MIL', JSON.stringify(lista), 600); } catch (e) { /* lista grande demais para o cache: segue sem */ }
  CAD_MEMO_ = lista;
  return lista;
}
function cadastroMilitaresSeguro_() { try { return cadastroMilitares_(); } catch (e) { Logger.log('Cadastro de militares: ' + e.message); return []; } }
function infoTroca_(mes, tipo, hdr, iso) { return apiTrocaInfo(mes, tipo, hdr, iso, cadastroMilitaresSeguro_()); }
var SIT_ = ['Pendente', 'Autorizar', 'Negar', 'Cancelar', 'Autorizada', 'Negada', 'Cancelada', 'Inválida', 'Excluída', 'Expirada'];

var CFG_MEMO_ = null;
function cfgTrocas_() {
  if (CFG_MEMO_) return CFG_MEMO_;
  var c = JSON.parse(PropertiesService.getDocumentProperties().getProperty('TROCAS_CFG') || 'null') || {};
  CFG_MEMO_ = {
    aprov: c.aprov || [], notificar: c.notificar !== false,
    titulo: c.titulo || 'Gestão de Serviços de Escalas', subtitulo: c.subtitulo || 'S/1 - Seção de Pessoal',
    biTitulo: c.biTitulo != null ? c.biTitulo : 'Fechamento do Boletim', biIntegral: c.biIntegral != null ? c.biIntegral : '13h15', biParcial: c.biParcial != null ? c.biParcial : '09h00',
    biNota: c.biNota != null ? c.biNota : 'Trocas solicitadas após o fechamento do BI somente serão aprovadas em caso de extrema necessidade.',
    escalaUrl: c.escalaUrl || 'https://docs.google.com/spreadsheets/d/1QeqywNXn8YnlFKvnl7FlzEOUzGfo23UDQj4jK84UqoU/edit?gid=1382688629#gid=1382688629',
    avisos: c.avisos || [],
    expirarAuto: c.expirarAuto !== false, novidadesVer: Number(c.novidadesVer || 1),
    novidades: c.novidades != null ? c.novidades : 'Permuta (troca de mão dupla) na etapa 2.\nAviso do fechamento do BI com contagem regressiva.\nTemas claro, escuro e Tático.\nSolicitações vencidas expiram sozinhas e exclusões podem ser desfeitas.\nBotão Ajuda com tour e glossário.',
    antecedencia: c.antecedencia != null ? Number(c.antecedencia) : 1, visEscalas: c.visEscalas || []
  };
  return CFG_MEMO_;
}
function salvarCfgTrocas_(c) { PropertiesService.getDocumentProperties().setProperty('TROCAS_CFG', JSON.stringify(c)); CFG_MEMO_ = null; }

/* ---------- versão de dados + cache entre execuções (aplicativo web) */
function verTrocas_() { try { return CacheService.getScriptCache().get('TV') || '0'; } catch (e) { return '0'; } }
function bumpTrocas_() { try { CacheService.getScriptCache().put('TV', String(Date.now()), 21600); } catch (e) { /* sem cache: segue */ } }
function cacheGet_(k) { try { var s = CacheService.getScriptCache().get(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function cachePut_(k, v, ttl) { try { var s = JSON.stringify(v); if (s.length < 90000) CacheService.getScriptCache().put(k, s, ttl || 60); } catch (e) { /* grande demais ou sem cache */ } }

/** número do dia: AAAAMMDD-001; recomeça em 001 a cada dia */
function fmtNr_(id) { var m = /^(\d{4})(\d{2})(\d{2})-(\d{3})$/.exec(String(id)); return m ? 'Nr ' + m[4] + ' (' + m[3] + '/' + m[2] + '/' + m[1] + ')' : String(id); }
function nrCurto_(id) { var m = /-(\d{3})$/.exec(String(id)); return m ? m[1] : String(id); }

/** registro de auditoria (aba "Auditoria" da planilha da Central) */
function auditar_(quem, acao, detalhe) {
  try {
    var ss = centralSS_(), sh = ss.getSheetByName('Auditoria');
    if (!sh) {
      sh = ss.insertSheet('Auditoria');
      sh.getRange(1, 1, 1, 4).setValues([['Data/hora', 'Usuário', 'Ação', 'Detalhe']]).setFontWeight('bold').setBackground('#e8eaed');
      sh.setFrozenRows(1); sh.setColumnWidth(1, 130); sh.setColumnWidth(2, 190); sh.setColumnWidth(3, 190); sh.setColumnWidth(4, 520);
    }
    sh.appendRow([new Date(), String(quem || ''), String(acao || ''), String(detalhe || '').slice(0, 900)]);
    sh.getRange(sh.getLastRow(), 1).setNumberFormat('dd/mm/yyyy HH:mm:ss');
  } catch (e) { Logger.log('Auditoria: ' + e.message); }
}

/** planilha própria da Central de trocas (fora da planilha da escala): abre a guardada ou cria uma nova na pasta da escala */
var CENTRAL_MEMO_ = null, CENTRAL_SH_ = null;
function centralSS_() {
  if (CENTRAL_MEMO_) return CENTRAL_MEMO_;
  var p = PropertiesService.getDocumentProperties(), id = p.getProperty('TROCAS_SS');
  if (id) {
    try { CENTRAL_MEMO_ = SpreadsheetApp.openById(id); return CENTRAL_MEMO_; }
    catch (e) { throw new Error('Não consegui abrir a planilha da Central de trocas. Ela foi apagada ou você perdeu o acesso? Informe outra em Configuração.'); }
  }
  var novo = SpreadsheetApp.create('Central de trocas — 21º GAC');
  try {
    var f = DriveApp.getFileById(novo.getId()), pais = DriveApp.getFileById(ss_().getId()).getParents();
    if (pais.hasNext()) { pais.next().addFile(f); DriveApp.getRootFolder().removeFile(f); }
  } catch (e) { Logger.log('Pasta da Central: ' + e.message); }
  p.setProperty('TROCAS_SS', novo.getId());
  CENTRAL_MEMO_ = novo;
  return novo;
}

/** aba "Central de trocas" na planilha própria (cria se não existir; traz os pedidos que ficaram na planilha da escala) */
function garantirCentral_() {
  if (CENTRAL_SH_) return CENTRAL_SH_;
  var ss = centralSS_(), sh = ss.getSheetByName(CENTRAL_);
  if (sh) { CENTRAL_SH_ = sh; return sh; }
  var uma = ss.getSheets();
  if (uma.length === 1 && uma[0].getLastRow() === 0) { sh = uma[0]; sh.setName(CENTRAL_); } else sh = ss.insertSheet(CENTRAL_);
  var antiga = null;
  try { antiga = ss_().__real.getSheetByName(CENTRAL_); } catch (e) { antiga = null; }
  if (antiga && antiga.getSheetId() === sh.getSheetId() && ss.getId() === ss_().getId()) antiga = null;
  var cab = ['ID', 'Recebido em', 'Origem', 'Solicitante', 'Data', 'Aba', 'Escala', 'Quem sai', 'Quem entra', 'Motivo', 'Alertas', 'Situação', 'Decidido por', 'Decidido em', 'Observação', 'dados'];
  sh.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold').setBackground('#e8eaed').setWrap(true);
  sh.setFrozenRows(1);
  [70, 110, 90, 150, 80, 90, 160, 170, 170, 200, 220, 110, 150, 110, 240].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.hideColumns(16);
  var vd = SpreadsheetApp.newDataValidation().requireValueInList(SIT_, true).setAllowInvalid(false).build();
  sh.getRange(2, 12, 1000, 1).setDataValidation(vd);
  var rg = sh.getRange(2, 12, 1000, 1), regras = [
    ['Pendente', '#fef7e0', '#b06000'], ['Autorizada', '#e6f4ea', '#137333'], ['Negada', '#fce8e6', '#b00020'], ['Inválida', '#f1f3f4', '#5f6368'], ['Cancelada', '#f1f3f4', '#5f6368'], ['Excluída', '#f1f3f4', '#9aa0a6'], ['Expirada', '#f1f3f4', '#9aa0a6']
  ].map(function (r) { return SpreadsheetApp.newConditionalFormatRule().setRanges([rg]).whenTextEqualTo(r[0]).setBackground(r[1]).setFontColor(r[2]).build(); });
  sh.setConditionalFormatRules(regras);
  sh.getRange(1, 12).setNote('Mude para Autorizar ou Negar (funciona também no Planilhas do celular). Cancelar desfaz uma troca já autorizada.');
  if (antiga && antiga.getLastRow() > 1) {
    var vv = antiga.getRange(2, 1, antiga.getLastRow() - 1, 16).getValues();
    sh.getRange(2, 1, vv.length, 16).setValues(vv);
    sh.getRange(2, 2, vv.length, 1).setNumberFormat('dd/mm/yyyy HH:mm');
    sh.getRange(2, 5, vv.length, 1).setNumberFormat('dd/mm/yyyy');
    sh.getRange(2, 14, vv.length, 1).setNumberFormat('dd/mm/yyyy HH:mm');
    sh.getRange(2, 1, vv.length, 15).setWrap(true).setVerticalAlignment('top');
  }
  if (antiga) { try { ss_().__real.deleteSheet(antiga); } catch (e) { Logger.log('Aba antiga da Central: ' + e.message); } }
  return sh;
}

function proximoIdTroca_() {
  var p = PropertiesService.getDocumentProperties(), hoje = isoData_(new Date()).replace(/-/g, ''), o = JSON.parse(p.getProperty('TROCAS_SEQD') || '{}');
  if (o.d !== hoje) o = { d: hoje, n: 0 };
  o.n++;
  p.setProperty('TROCAS_SEQD', JSON.stringify(o));
  return hoje + '-' + ('000' + o.n).slice(-3);
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

var GRAD_RX_ = /^(\d+\s*º?\s*SGT|SD\s*EP|SD\s*EV|CB\s*EP|CB|SGT|ST|TEN|CAP)\s+/;
function semGrad_(s) { return norm_(s).replace(GRAD_RX_, ''); }
function mesmoMil_(a, b) { var x = norm_(a), y = norm_(b); if (!x || !y) return false; return x === y || semGrad_(x) === semGrad_(y); }

/** "13h15" / "9:00" -> minutos desde 00:00 (ou null) */
function minutosHora_(txt) { var m = /(\d{1,2})\s*[h:]\s*(\d{2})?/i.exec(String(txt || '')); return m ? Number(m[1]) * 60 + Number(m[2] || 0) : null; }

/** texto do aviso quando a solicitação é feita depois do fechamento do BI para serviço de amanhã (ou antes); '' se estiver no prazo */
function fechamentoBI_(dtServico) {
  var c = cfgTrocas_(), agora = new Date(), amanha = new Date(); amanha.setHours(0, 0, 0, 0); amanha.setDate(amanha.getDate() + 1);
  if (dtServico > amanha) return '';
  var min = agora.getHours() * 60 + agora.getMinutes(), integ = minutosHora_(c.biIntegral), parc = minutosHora_(c.biParcial);
  if (integ != null && min >= integ) return 'após o fechamento do BI (expediente integral ' + c.biIntegral + ')';
  if (parc != null && min >= parc) return 'após o fechamento do BI do expediente parcial (' + c.biParcial + ')';
  return '';
}

/** conflitos com outros pedidos pendentes/autorizados no mesmo dia (alertas; não bloqueiam) */
function conflitosTroca_(iso, sai, entra, linhas, ignorarId) {
  var out = [];
  (linhas || []).forEach(function (l) {
    if (!l[0] || String(l[0]) === String(ignorarId || '') || (l[11] !== 'Pendente' && l[11] !== 'Autorizada')) return;
    var d = null; try { d = l[15] ? JSON.parse(l[15]) : null; } catch (e) { d = null; }
    if (!d || d.iso !== iso) return;
    var rot = fmtNr_(l[0]).replace(/ \(.*\)$/, '') + ' ' + String(l[11]).toLowerCase();
    if (mesmoMil_(l[8], entra)) out.push('já é o "pega" na solicitação ' + rot + ' (' + l[6] + ')');
    else if (mesmoMil_(l[7], entra)) out.push('está passando o serviço na solicitação ' + rot);
    if (mesmoMil_(l[8], sai) && !mesmoMil_(l[7], entra)) out.push(sai + ' vai pegar o serviço de ' + l[7] + ' na solicitação ' + rot);
  });
  return out;
}

/** valida e monta os dados de uma solicitação, sem gravar. p: {iso, tipo, titulo, sai, entra, motivo} */
function analisarTroca_(p, linhas, ignorarId) {
  var r = { erro: '', data: null, aba: '', alertas: '', dados: {}, pos: '' };
  try {
    var dt = parseIso_(p.iso), h0 = new Date(), ant = Math.max(0, cfgTrocas_().antecedencia);
    h0.setHours(0, 0, 0, 0); h0.setDate(h0.getDate() + ant);
    r.data = dt;
    if (dt < h0) throw new Error(ant ? 'O serviço precisa ser pelo menos ' + ant + ' dia(s) à frente: a partir de ' + fmtData_(h0) + '.' : 'A data do serviço já passou.');
    var mesId = CFG.MESES[dt.getMonth()], b = apiBlocos(mesId, [p.tipo]).blocos.filter(function (x) { return x.titulo === p.titulo; })[0];
    if (!b) throw new Error('Escala "' + p.titulo + '" não encontrada em ' + mesId + ' ' + p.tipo + '.');
    var info = infoTroca_(mesId, p.tipo, b.hdr, p.iso), ks = norm_(p.sai), ke = norm_(p.entra);
    r.aba = info.aba;
    var sai = info.sai.filter(function (x) { return norm_(x.nome) === ks; })[0];
    if (ks === ke) throw new Error('Quem sai e quem entra são o mesmo militar.');
    if (!sai) throw new Error(p.sai + ' não tem “0” de serviço em ' + info.data + ' nessa escala.');
    var ent = info.cands.filter(function (x) { return norm_(x.nome) === ke; })[0];
    if (!ent) throw new Error(p.entra + ' não pode entrar: já está de serviço nessa escala nesse dia ou não consta no cadastro de militares.');
    if (ent.cad === false) throw new Error(p.entra + ' não consta no cadastro de militares.');
    var al = ent.flags.slice();
    if (sai.nota) al.push('já havia troca anotada: ' + String(sai.nota).replace(/\s+/g, ' ').trim().slice(0, 60));
    r.pos = fechamentoBI_(dt);
    if (r.pos) {
      al.unshift('pós-fechamento: ' + r.pos);
      if (!String(p.motivo || '').trim()) throw new Error('Solicitação ' + r.pos + ': informe a justificativa (somente aprovada em caso de extrema necessidade).');
    }
    conflitosTroca_(p.iso, p.sai, p.entra, linhas, ignorarId).forEach(function (c) { al.push('conflito: ' + c); });
    r.alertas = al.join('; ');
    r.dados = { mes: mesId, tipo: p.tipo, hdr: b.hdr, iso: p.iso, aba: info.aba, membros: (b.linhas || []).map(function (x) { return norm_(x.nome); }) };
    (linhas || []).forEach(function (l) {
      if (l[0] && l[11] === 'Pendente' && String(l[6]) === p.titulo && norm_(l[7]) === ks && l[15] && JSON.parse(l[15]).iso === p.iso && String(l[0]) !== String(ignorarId || '')) throw new Error('Pedido repetido (já existe ' + fmtNr_(l[0]) + ' pendente).');
    });
  } catch (e) { r.erro = e.message; }
  return r;
}

function gravarLinhaTroca_(sh, id, p, a, situ, obs) {
  bumpTrocas_();
  var agora = new Date(), dados = a.dados || {};
  if (p.dadosExtra) Object.keys(p.dadosExtra).forEach(function (k) { dados[k] = p.dadosExtra[k]; });
  sh.appendRow([id, agora, p.origem, p.solicitante || '', a.data || '', a.aba || (p.tipo || ''), p.titulo || '', p.sai || '', p.entra || '', p.motivo || '', a.alertas || (situ === 'Pendente' ? 'Sem alertas' : ''), situ, '', '', obs, JSON.stringify(dados)]);
  var r = sh.getLastRow();
  sh.getRange(r, 2).setNumberFormat('dd/mm/yyyy HH:mm');
  sh.getRange(r, 5).setNumberFormat('dd/mm/yyyy');
  sh.getRange(r, 1, 1, 15).setWrap(true).setVerticalAlignment('top');
}

/** p: {origem, solicitante, iso, tipo, titulo, sai, entra, motivo} -> {id, nr, situacao, obs} */
function registrarTroca_(p) {
  var sh = garantirCentral_(), linhas = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 16).getValues() : [], id = proximoIdTroca_();
  var a = analisarTroca_(p, linhas), situ = a.erro ? 'Inválida' : 'Pendente', obs = a.erro;
  gravarLinhaTroca_(sh, id, p, a, situ, obs);
  if (situ === 'Pendente') notificarTroca_('novo', { id: id, sai: p.sai, entra: p.entra, titulo: p.titulo, data: a.data, alertas: a.alertas, motivo: p.motivo, solicitante: p.solicitante });
  auditar_(p.solicitante || p.origem, 'Solicitação ' + situ.toLowerCase(), fmtNr_(id) + ' · ' + (p.titulo || '') + ' · ' + (a.data instanceof Date ? fmtData_(a.data) : '') + ' · ' + (p.sai || '') + ' ➜ ' + (p.entra || '') + (obs ? ' · ' + obs : ''));
  return { id: id, nr: fmtNr_(id), situacao: situ, obs: obs };
}

/** permuta: p1 (ida) e p2 (volta) são autorizadas ou negadas juntas. Nada é gravado se uma das duas for inválida. */
function registrarPermuta_(p1, p2) {
  var sh = garantirCentral_(), linhas = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 16).getValues() : [];
  var a1 = analisarTroca_(p1, linhas), a2 = analisarTroca_(p2, linhas);
  if (a1.erro) throw new Error('Ida: ' + a1.erro);
  if (a2.erro) throw new Error('Volta: ' + a2.erro);
  var id1 = proximoIdTroca_(), id2 = proximoIdTroca_();
  p1.dadosExtra = { par: id2, perna: 1 }; p2.dadosExtra = { par: id1, perna: 2 };
  gravarLinhaTroca_(sh, id1, p1, a1, 'Pendente', '');
  gravarLinhaTroca_(sh, id2, p2, a2, 'Pendente', '');
  notificarTroca_('novo', { id: id1, sai: p1.sai, entra: p1.entra, titulo: p1.titulo + ' (permuta com ' + fmtNr_(id2) + ')', data: a1.data, alertas: [a1.alertas, a2.alertas].filter(Boolean).join(' | '), motivo: p1.motivo, solicitante: p1.solicitante });
  auditar_(p1.solicitante || p1.origem, 'Permuta solicitada', fmtNr_(id1) + ' + ' + fmtNr_(id2) + ' · ' + p1.sai + ' ⇄ ' + p1.entra);
  return { id: id1, nr: fmtNr_(id1), id2: id2, nr2: fmtNr_(id2), situacao: 'Pendente', obs: '' };
}

function emailsTroca_(c) { return (c.aprov || []).filter(function (x) { return /@/.test(x); }); }

function escH_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

/** e-mail no estilo do aplicativo (verde, cartão, botão); sempre com versão em texto simples */
function emailTroca_(tipo, x) {
  var cfg = cfgTrocas_(), url = urlAppTrocas_(), d = x.data instanceof Date ? fmtData_(x.data) + ' ' + CFG.DIAS[x.data.getDay()] : String(x.data || '');
  var novo = tipo === 'novo', nr = fmtNr_(x.id);
  var corTit = novo ? '#3A6A35' : (x.situacao === 'Autorizada' ? '#3A6A35' : (x.situacao === 'Negada' ? '#BA1A1A' : '#5f6368'));
  var tit = novo ? 'Nova solicitação de troca' : 'Solicitação de troca ' + String(x.situacao || '').toLowerCase();
  function lin(r, v) { return v ? '<tr><td style="padding:6px 0;width:118px;color:#43483F;font-size:13px;vertical-align:top">' + r + '</td><td style="padding:6px 0;color:#191D17;font-size:15px;font-weight:500">' + v + '</td></tr>' : ''; }
  var al = x.alertas && x.alertas !== 'Sem alertas' ? x.alertas : '';
  var html = '<div style="background:#F8FAF0;padding:20px 12px;font-family:Roboto,Arial,sans-serif">' +
    '<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;border-collapse:collapse">' +
    '<tr><td style="background:#ECEFE5;border:1px solid #C3C8BB;border-radius:16px 16px 0 0;padding:14px 18px"><span style="display:inline-block;width:34px;height:34px;line-height:34px;text-align:center;border-radius:10px;background:#BBF0AE;color:#002201;font-size:18px;vertical-align:middle">⇄</span>' +
    '<span style="display:inline-block;vertical-align:middle;margin-left:10px"><span style="font-size:16px;color:#191D17;display:block;line-height:20px">Gestão de Serviços de Escalas</span><span style="font-size:12px;color:#43483F;font-weight:500">' + escH_(cfg.subtitulo) + '</span></span></td></tr>' +
    '<tr><td style="background:#F2F5EB;border:1px solid #C3C8BB;border-top:0;border-radius:0 0 16px 16px;padding:18px">' +
    '<div style="font-size:12px;letter-spacing:.6px;text-transform:uppercase;color:' + corTit + ';font-weight:700">' + tit + '</div>' +
    '<div style="font-size:20px;color:#191D17;margin:4px 0 14px">Solicitação de Troca ' + escH_(nr) + '</div>' +
    '<table role="presentation" width="100%" style="border-collapse:collapse;background:#FFFFFF;border:1px solid #C3C8BB;border-radius:12px"><tr><td style="padding:10px 16px">' +
    '<table role="presentation" width="100%" style="border-collapse:collapse">' +
    lin('Serviço', escH_(d)) + lin('Escala', escH_(x.titulo)) +
    '<tr><td colspan="2" style="padding:6px 0"><table role="presentation" width="100%" style="border-collapse:collapse;background:#F2F5EB;border-radius:10px"><tr>' +
    '<td style="padding:8px 12px;width:46%"><div style="font-size:10px;letter-spacing:.5px;color:#43483F;text-transform:uppercase">Passa</div><div style="font-size:15px;font-weight:500;color:#191D17">' + escH_(x.sai) + '</div></td>' +
    '<td style="text-align:center;color:#3A6A35;font-size:20px;width:8%">➜</td>' +
    '<td style="padding:8px 12px;width:46%"><div style="font-size:10px;letter-spacing:.5px;color:#43483F;text-transform:uppercase">Pega</div><div style="font-size:15px;font-weight:500;color:#191D17">' + escH_(x.entra) + '</div></td></tr></table></td></tr>' +
    (novo ? lin('Solicitante', escH_(x.solicitante || '—')) + lin('Motivo', escH_(x.motivo || '—')) : '') +
    (!novo ? lin('Decisão', '<span style="color:' + corTit + '">' + escH_(x.situacao) + '</span>') + lin('Observação', escH_(x.obs)) : '') +
    '</table></td></tr></table>' +
    (novo ? (al ? '<div style="margin-top:12px;background:#FFE9B5;color:#3B2A00;border-radius:12px;padding:10px 14px;font-size:14px"><b>⚠ Alertas:</b> ' + escH_(al) + '</div>' : '<div style="margin-top:12px;background:#BBF0AE;color:#002201;border-radius:12px;padding:10px 14px;font-size:14px">✔ Sem alertas</div>') : '') +
    (novo && url ? '<div style="margin-top:18px;text-align:center"><a href="' + escH_(url) + '" style="display:inline-block;background:#3A6A35;color:#FFFFFF;text-decoration:none;font-weight:500;font-size:14px;padding:12px 26px;border-radius:22px">Abrir Sistema e verificar</a></div>' : '') +
    '<div style="margin-top:16px;font-size:12px;color:#43483F;line-height:18px">' + (novo ? 'Também é possível decidir pela aba “Central de trocas” da planilha ou pelo menu Módulo Brigada → Confecção → Central de trocas.' : 'Mensagem automática da 1ª Seção.') + '</div>' +
    '</td></tr></table></div>';
  var txt = (novo ? 'Nova solicitação de troca ' : 'Solicitação de troca ' + String(x.situacao || '').toLowerCase() + ' — ') + nr + '\n' + d + ' · ' + x.titulo + '\nPassa: ' + x.sai + '\nPega: ' + x.entra +
    (novo ? '\nSolicitante: ' + (x.solicitante || '-') + '\nMotivo: ' + (x.motivo || '-') + '\nAlertas: ' + (al || 'nenhum') + (url ? '\n\nDecidir: ' + url : '') : (x.obs ? '\nObservação: ' + x.obs : ''));
  return { assunto: (novo ? '[Trocas] Nova solicitação ' : '[Trocas] Solicitação ' + String(x.situacao || '').toLowerCase() + ' ') + nr + ' · ' + x.titulo, html: html, txt: txt };
}

function notificarTroca_(tipo, x, para) {
  var c = cfgTrocas_();
  try {
    if (!c.notificar) return;
    var dest = para ? [para] : emailsTroca_(c);
    if (!dest.length) return;
    var m = emailTroca_(tipo, x);
    MailApp.sendEmail({ to: dest.join(','), subject: m.assunto, body: m.txt, htmlBody: m.html, name: 'Gestão de Serviços de Escalas' });
  } catch (e) { Logger.log('E-mail de troca: ' + e.message); }
}

/** reescreve o "0" da célula (só se for valor fixo, nunca fórmula): a mudança de valor faz a planilha recalcular tudo que depende dela */
function reforcarZero_(sh, A, r, c) {
  try { if (!A.forms[r][c]) sh.getRange(r + 1, c + 1).setValue(0); } catch (e) { Logger.log('Reforço do 0: ' + e.message); }
}

/** a prévia lê as trocas por script; edição feita por script não dispara gatilho, então agenda (uma vez, agrupando) a atualização das prévias */
function agendarPrevia_() {
  try {
    if (ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'atualizarPreviaAposTroca'; })) return;
    ScriptApp.newTrigger('atualizarPreviaAposTroca').timeBased().after(8000).create();
  } catch (e) { Logger.log('Agendar prévia: ' + e.message); }
}
function atualizarPreviaAposTroca() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'atualizarPreviaAposTroca') ScriptApp.deleteTrigger(t); });
  try { atualizarTrocasTrigger(); } catch (e) { Logger.log('Prévia após troca: ' + e.message); }
}

function gravarNotaTroca_(d, saiNome, entraNome) {
  bumpTrocas_();
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
  reforcarZero_(sh, A, R.r, colDia_(dia));
  if (ehPar_(B)) { /* escala de pares: a anotação vale também para o outro dia do par */
    var d2 = ehCabecaPar_(A, B, dia) ? dia + 1 : dia - 1;
    if (d2 >= 1 && d2 <= A.nDias && num_(A.vals[R.r][colDia_(d2)]) === 0) { sh.getRange(R.r + 1, colDia_(d2) + 1).setNote(nota); reforcarZero_(sh, A, R.r, colDia_(d2)); }
  }
  agendarPrevia_();
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
    var info = infoTroca_(d.mes, d.tipo, d.hdr, d.iso), ke = norm_(l[8]);
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
  auditar_(quem, novo === 'Autorizada' ? 'Troca autorizada' : (novo === 'Negada' ? 'Troca negada' : 'Troca cancelada'), fmtNr_(id) + ' · ' + l[6] + ' · ' + l[7] + ' ➜ ' + l[8] + (obs ? ' · ' + obs : ''));
  bumpTrocas_();
  return novo; /* sem e-mail de decisão: só as novas solicitações são avisadas */
}

/** decide uma solicitação; se for permuta (ida/volta), decide as duas juntas e desfaz a primeira se a segunda falhar */
function decidirTrocaPar_(id, acao, quem, obs) {
  var sh = garantirCentral_(), r = acharLinhaTroca_(sh, id);
  if (!r) throw new Error('Pedido ' + id + ' não encontrado.');
  var d = null; try { d = JSON.parse(sh.getRange(r, 16).getValue() || 'null'); } catch (e) { d = null; }
  var par = d && d.par && acharLinhaTroca_(sh, d.par) ? d.par : '';
  var res = decidirTroca_(id, acao, quem, obs);
  if (!par) return res;
  try { decidirTroca_(par, acao, quem, obs); }
  catch (e) {
    if (acao === 'Autorizar') { try { decidirTroca_(id, 'Cancelar', quem, 'revertida: ' + e.message); } catch (x) { /* mantém o erro original */ } }
    throw new Error('A permuta não foi aplicada: ' + e.message);
  }
  return res;
}

/** exclusão definitiva: apaga a linha da Central (e a outra ponta, se for permuta) e remove a anotação da escala se estava autorizada.
 *  O que foi apagado fica descrito na auditoria (número, escala, militares, situação anterior, motivo e quem excluiu). */
function excluirTroca_(id, quem, motivo) {
  motivo = String(motivo || '').trim();
  if (motivo.length < 3) throw new Error('Informe o motivo da exclusão.');
  var sh = garantirCentral_(), r = acharLinhaTroca_(sh, id);
  if (!r) throw new Error('Pedido ' + id + ' não encontrado.');
  var l = sh.getRange(r, 1, 1, 16).getValues()[0], d = null; try { d = l[15] ? JSON.parse(l[15]) : null; } catch (e) { d = null; }
  var ids = [id]; if (d && d.par && acharLinhaTroca_(sh, d.par)) ids.push(d.par);
  ids.forEach(function (i) {
    var rr = acharLinhaTroca_(sh, i);
    if (!rr) return;
    var ll = sh.getRange(rr, 1, 1, 16).getValues()[0], dd = null; try { dd = ll[15] ? JSON.parse(ll[15]) : null; } catch (e) { dd = null; }
    var nota = '';
    if (ll[11] === 'Autorizada' && dd && dd.iso) { try { gravarNotaTroca_(dd, ll[7], ''); nota = ' (anotação removida da escala)'; } catch (e) { nota = ' (anotação: ' + e.message + ')'; } }
    var data = ll[4] instanceof Date ? fmtData_(ll[4]) : '';
    sh.deleteRow(rr);
    auditar_(quem, 'Solicitação excluída (definitivo)', fmtNr_(i) + ' · ' + data + ' · ' + ll[6] + ' · ' + ll[7] + ' ➜ ' + ll[8] + ' · solicitante: ' + (ll[3] || '-') + ' · situação: ' + ll[11] + ' · motivo: ' + motivo + nota);
  });
  bumpTrocas_();
  return 'Excluída';
}

/** pendentes cujo serviço já passou viram "Expirada" (permuta: se uma das pontas passou, as duas expiram) */
function expirarPendentes_(quem) {
  if (!cfgTrocas_().expirarAuto) return 0;
  var sh = garantirCentral_();
  if (sh.getLastRow() < 2) return 0;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 16).getValues(), hoje = new Date(), passou = {}, n = 0;
  hoje.setHours(0, 0, 0, 0);
  v.forEach(function (l) { if (l[11] === 'Pendente' && l[4] instanceof Date && l[4] < hoje) passou[l[0]] = true; });
  v.forEach(function (l, i) {
    if (l[11] !== 'Pendente') return;
    var d = null; try { d = l[15] ? JSON.parse(l[15]) : null; } catch (e) { d = null; }
    if (!(passou[l[0]] || (d && d.par && passou[d.par]))) return;
    var r = i + 2;
    sh.getRange(r, 12).setValue('Expirada');
    sh.getRange(r, 13).setValue('Sistema');
    sh.getRange(r, 14).setValue(new Date()).setNumberFormat('dd/mm/yyyy HH:mm');
    sh.getRange(r, 15).setValue('Expirada: o serviço passou sem decisão');
    auditar_(quem || 'Sistema', 'Solicitação expirada', fmtNr_(l[0]) + ' · ' + l[6] + ' · ' + l[7] + ' ➜ ' + l[8]);
    n++;
  });
  if (n) bumpTrocas_();
  return n;
}
function expirarPendentesTrigger() { try { expirarPendentes_('Sistema'); } catch (e) { Logger.log('Expirar pendentes: ' + e.message); } }

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
  try { sh.getRange(r, 15).clearContent(); decidirTrocaPar_(id, v, quem, ''); }
  catch (er) { sh.getRange(r, 12).setValue(antes); sh.getRange(r, 15).setValue('Erro: ' + er.message); }
}

/* ---------- instalação e tela */
function instalarGatilhosTrocas_() {
  var tr = ScriptApp.getProjectTriggers();
  function tem(f) { return tr.some(function (t) { return t.getHandlerFunction() === f; }); }
  var cid = centralSS_().getId(), tem2 = false;
  tr.forEach(function (t) {
    if (t.getHandlerFunction() !== 'aoEditarCentral') return;
    var src = ''; try { src = t.getTriggerSourceId(); } catch (e) { src = ''; }
    if (src === cid) tem2 = true; else ScriptApp.deleteTrigger(t); /* o gatilho antigo era da planilha da escala */
  });
  if (!tem2) ScriptApp.newTrigger('aoEditarCentral').forSpreadsheet(cid).onEdit().create();
  if (!tem('expirarPendentesTrigger')) ScriptApp.newTrigger('expirarPendentesTrigger').timeBased().everyDays(1).atHour(1).create();
  tr.forEach(function (t) { if (['verificarComentariosTrocas', 'aoEnviarTroca', 'atualizarListasTrocasTrigger'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); }); /* versões anteriores (comentários e formulário) */
}

function mnuCentralTrocas() { mostrarHtml_(CSS_EXTRA_ + HTML_CENTRAL_ + JS_COMUM_ + '<script>' + JS_CENTRAL_ + '</script>', 'Central de trocas', 760, 700); }

function apiTrocasEstado(filtro) {
  var c = cfgTrocas_(), sh = null, out = { cfg: { planilha: '', url: urlAppTrocas_(), membros: membrosAdm_().map(function (m) { return m.nome; }), comSenha: membrosAdm_().filter(function (m) { return m.hash; }).length, aprov: c.aprov.join(', '), notificar: c.notificar }, itens: [], n: { Pendente: 0, Autorizada: 0, Negada: 0, outras: 0 } };
  try { sh = garantirCentral_(); out.cfg.planilha = sh.getParent().getUrl(); } catch (e) { out.cfg.erro = e.message; }
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
  return decidirTrocaPar_(id, acao, quem, obs || '');
}

function apiTrocasSalvarCfg(p) {
  var c = cfgTrocas_();
  c.notificar = !!p.notificar;
  c.aprov = String(p.aprov || '').split(/[,;\s]+/).filter(function (x) { return /@/.test(x); });
  salvarCfgTrocas_(c);
  if (p.acesso && p.acesso.senha) definirAcesso_(p.acesso.nome, p.acesso.senha, !!p.acesso.admin, 'Menu do módulo');
  var m = String(p.planilha || '').match(/[-\w]{25,}/);
  if (m && m[0] !== PropertiesService.getDocumentProperties().getProperty('TROCAS_SS')) {
    try { SpreadsheetApp.openById(m[0]); } catch (e) { throw new Error('Não consegui abrir essa planilha (confira o link e se você tem acesso de edição).'); }
    PropertiesService.getDocumentProperties().setProperty('TROCAS_SS', m[0]);
    CENTRAL_MEMO_ = null; CENTRAL_SH_ = null;
  }
  garantirCentral_();
  instalarGatilhosTrocas_();
  return apiTrocasEstado('pendentes').cfg;
}
