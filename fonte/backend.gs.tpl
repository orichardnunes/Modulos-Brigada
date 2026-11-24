/**
 * MÓDULO BRIGADA 1.0 — Modulo_TrocasWeb.gs
 * Aplicativo web "Gestão de Escalas — S/1 Seção de Pessoal" (visual Material Design verde, como o SiRAlt).
 * Público: solicitar troca (etapas), acompanhar por número. 1ª Seção: entra com militar + senha própria; decide pedidos,
 * vê relatórios e auditoria; o administrador configura tudo (textos, antecedência, visibilidade, militares e senhas).
 * Publicar: Implantar → Nova implantação → App da Web → Executar como: você · Quem tem acesso: qualquer pessoa (com login Google).
 * Depois de mudar o código: Implantar → Gerenciar implantações → Editar → Nova versão.
 */

var HTML_TROCAS_WEB_ = __HTML__;

function doGet(e) {
  var tv = e && e.parameter && e.parameter.tv; /* ?tv=1 abre direto o modo painel (TV) */
  var cod = e && e.parameter ? String(e.parameter.c || '') : ''; /* ?c=0113NOV26 abre o Acompanhar com a solicitação pesquisada (link do WhatsApp) */
  var flags = (tv ? '<script>window.__TV=1;</script>' : '') + (/^[0-9A-Za-z-]{3,20}$/.test(cod) ? '<script>window.__COD="' + cod.toUpperCase() + '";</script>' : '');
  return HtmlService.createHtmlOutput(flags ? HTML_TROCAS_WEB_.replace('<!--TVFLAG-->', flags) : HTML_TROCAS_WEB_)
    .setTitle('Gestão de Escalas')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** endereço público do app (o do GitHub Pages, se definido em definirUrlPublica_) para os links dos e-mails e da ajuda */
function urlAppTrocas_() {
  try { var u = PropertiesService.getDocumentProperties().getProperty('URL_PUBLICA'); if (u) return u; } catch (e) { /* usa o endereço do Apps Script */ }
  try { return ScriptApp.getService().getUrl() || ''; } catch (e2) { return ''; }
}
/** rode uma vez no editor: definirUrlPublica_('https://SEU-USUARIO.github.io/gestao-escalas/') — vazio volta ao endereço do Apps Script */
function definirUrlPublica_(url) { PropertiesService.getDocumentProperties().setProperty('URL_PUBLICA', String(url || '')); }

/* ============================================================ API HTTPS (para páginas hospedadas fora do Apps Script, ex.: GitHub Pages)
 * POST (text/plain, sem pré-voo CORS) com {fn, args}; só funções web* (as mesmas que o app já chama por google.script.run). */
function doPost(e) {
  var out;
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}'), fn = String(req.fn || '');
    if (!/^web[A-Z][A-Za-z0-9]*$/.test(fn) || typeof globalThis[fn] !== 'function') throw new Error('Função inválida.');
    out = { ok: true, r: globalThis[fn].apply(null, Array.isArray(req.args) ? req.args : []) };
  } catch (err) { out = { ok: false, erro: String((err && err.message) || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================ 1ª SEÇÃO: militares, senhas e sessão */
var ADM_PADRAO_ = ['1º Sgt Guimarães', '3º Sgt Juan', '3º Sgt Ximenes', 'Cb Peclat', 'Cb Alves', 'Sd Richard', 'Sd EV Ramos', 'Sd EV Duarte'];

var ADM_MEMO_ = null;
function salvarMembros_(l) { PropertiesService.getDocumentProperties().setProperty('TROCAS_ADM', JSON.stringify(l)); ADM_MEMO_ = null; }
function membrosAdm_() {
  if (ADM_MEMO_) return ADM_MEMO_;
  var j = PropertiesService.getDocumentProperties().getProperty('TROCAS_ADM');
  if (j) { ADM_MEMO_ = JSON.parse(j); return ADM_MEMO_; }
  var l = ADM_PADRAO_.map(function (n) { return { nome: n, ativo: true, admin: /richard/i.test(n), hash: '' }; });
  salvarMembros_(l);
  return l;
}
function hashSenha_(nome, senha) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'trocas-v2:' + norm_(nome) + ':' + String(senha), Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
function definirAcesso_(nome, senha, admin, por) {
  senha = String(senha || '');
  if (senha.length < 4) throw new Error('A senha precisa ter pelo menos 4 caracteres.');
  var l = membrosAdm_(), m = l.filter(function (x) { return norm_(x.nome) === norm_(nome); })[0];
  if (!m) { m = { nome: String(nome).trim(), ativo: true, admin: false, hash: '' }; l.push(m); }
  m.hash = hashSenha_(m.nome, senha);
  if (admin != null) m.admin = !!admin;
  salvarMembros_(l);
  auditar_(por || 'Sistema', 'Senha definida', m.nome + (m.admin ? ' (administrador)' : ''));
}

function bloqueioAdm_(nome, falhou) {
  var p = PropertiesService.getDocumentProperties(), mp = JSON.parse(p.getProperty('TROCAS_ERR') || '{}'), k = norm_(nome), e = mp[k] || { n: 0, ate: 0 }, agora = Date.now();
  if (falhou === undefined) { if (e.ate > agora) throw new Error('Muitas tentativas. Tente de novo em ' + Math.ceil((e.ate - agora) / 60000) + ' min.'); return; }
  if (falhou) { e.n = (e.n || 0) + 1; if (e.n >= 5) e = { n: 0, ate: agora + 15 * 60000 }; } else e = { n: 0, ate: 0 };
  mp[k] = e; p.setProperty('TROCAS_ERR', JSON.stringify(mp));
}

function webLogin(nome, senha) {
  var m = membrosAdm_().filter(function (x) { return x.ativo && norm_(x.nome) === norm_(nome); })[0];
  if (!m) throw new Error('Selecione um militar da 1ª Seção.');
  bloqueioAdm_(m.nome);
  if (!m.hash) throw new Error('A senha deste militar ainda não foi definida. Peça ao administrador.');
  if (hashSenha_(m.nome, senha) !== m.hash) {
    bloqueioAdm_(m.nome, true);
    auditar_(m.nome, 'Acesso negado', 'Senha incorreta');
    throw new Error('Senha incorreta.');
  }
  bloqueioAdm_(m.nome, false);
  var tok = Utilities.getUuid();
  CacheService.getScriptCache().put('TS_' + tok, m.nome, 21600);
  auditar_(m.nome, 'Acesso à 1ª Seção', m.admin ? 'administrador' : 'militar');
  return { token: tok, nome: m.nome, admin: !!m.admin };
}
function webSair(tok) { try { var m = CacheService.getScriptCache().get('TS_' + tok); CacheService.getScriptCache().remove('TS_' + tok); if (m) auditar_(m, 'Saída', ''); } catch (e) { /* já expirou */ } return true; }

function sessao_(tok, admin) {
  var nome = tok ? CacheService.getScriptCache().get('TS_' + tok) : null;
  if (!nome) throw new Error('Sessão expirada. Entre novamente.');
  var m = membrosAdm_().filter(function (x) { return x.ativo && norm_(x.nome) === norm_(nome); })[0];
  if (!m) throw new Error('Sessão expirada. Entre novamente.');
  if (admin && !m.admin) throw new Error('Somente o administrador pode fazer isto.');
  return m;
}

/* ============================================================ avisos personalizáveis */
var AV_ICONES_ = ['campaign', 'info', 'warning', 'error', 'push_pin', 'event', 'schedule', 'celebration', 'school', 'groups', 'swap_horiz', 'new_releases', 'notifications', 'flag'];
function limparAviso_(a) {
  a = a || {};
  var ini = /^\d{4}-\d{2}-\d{2}$/.test(String(a.ini || '')) ? a.ini : '', fim = /^\d{4}-\d{2}-\d{2}$/.test(String(a.fim || '')) ? a.fim : '';
  var url = String(a.linkUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) url = '';
  return {
    id: String(a.id || ('a' + Date.now())).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24) || ('a' + Date.now()),
    ativo: !!a.ativo,
    estilo: ['cartao', 'faixa', 'mural'].indexOf(a.estilo) >= 0 ? a.estilo : 'cartao',
    tom: ['info', 'atencao', 'urgente'].indexOf(a.tom) >= 0 ? a.tom : 'info',
    icone: AV_ICONES_.indexOf(a.icone) >= 0 ? a.icone : 'campaign',
    onde: a.onde === 'todas' ? 'todas' : 'etapa1',
    titulo: String(a.titulo || '').trim().slice(0, 80),
    texto: String(a.texto || '').trim().slice(0, 600),
    longo: String(a.longo || '').trim().slice(0, 3000),
    ini: ini, fim: fim,
    linkTxt: url ? String(a.linkTxt || 'Abrir').trim().slice(0, 40) : '', linkUrl: url
  };
}
function avisosAtivos_(c) {
  var hoje = isoData_(new Date());
  return (c.avisos || []).filter(function (a) { return a.ativo && (a.titulo || a.texto) && (!a.ini || hoje >= a.ini) && (!a.fim || hoje <= a.fim); });
}

/* ============================================================ público */
function ymd_(d) { return isoData_(d); }

function webInicio() {
  ativarMemoLer_();
  var hoje = new Date(), tipos = [CFG.TIPO_GRAD, CFG.TIPO_CNDT], meses = [], c = cfgTrocas_();
  var min = new Date(); min.setHours(0, 0, 0, 0); min.setDate(min.getDate() + Math.max(0, c.antecedencia));
  var kM = 'WI_M|' + hoje.getFullYear() + '|' + hoje.getMonth() + '|' + verTrocas_();
  meses = cacheGet_(kM) || [];
  if (!meses.length) {
    [0, 1].forEach(function (k) {
      var m = (hoje.getMonth() + k) % 12, mesId = CFG.MESES[m], r = apiBlocos(mesId, tipos);
      if (!r.blocos.length) return;
      meses.push({ mes: mesId, ini: r.ini, fim: r.fim, escalas: r.blocos.concat(blocosExt_()).map(function (b) { return { aba: b.aba, tipo: b.tipo, hdr: b.hdr, titulo: b.titulo }; }) });
    });
    if (meses.length) cachePut_(kM, meses, 300);
  }
  if (!meses.length) throw new Error('Nenhuma aba de escala do mês foi encontrada.');
  var cad = cadastroMilitaresSeguro_();
  return {
    avisos: avisosAtivos_(c), agoraMin: hoje.getHours() * 60 + hoje.getMinutes(), urlApp: urlAppTrocas_(), novidades: c.novidades, novidadesVer: c.novidadesVer,
    hoje: ymd_(hoje), min: ymd_(min), fim: meses[meses.length - 1].fim, meses: meses,
    cfg: { titulo: c.titulo, subtitulo: c.subtitulo, biTitulo: c.biTitulo, biIntegral: c.biIntegral, biParcial: c.biParcial, biNota: c.biNota, biSemana: c.biSemana, biExc: c.biExc, escalaUrl: c.escalaUrl, antecedencia: c.antecedencia, visAtiva: c.visEscalas.length > 0 },
    mil: cad.map(function (x) { return x.full; }), cadOk: cad.length > 0,
    membros: membrosAdm_().filter(function (m) { return m.ativo; }).map(function (m) { return m.nome; })
  };
}

function webDia(mes, tipo, hdr, iso) {
  ativarMemoLer_();
  var kD = 'WD|' + mes + '|' + tipo + '|' + hdr + '|' + iso + '|' + verTrocas_(), ch = cacheGet_(kD);
  if (ch) { ch.fecha = fechamentoBI_(parseIso_(iso)); return ch; }
  var res = webDiaCalc_(mes, tipo, hdr, iso);
  cachePut_(kD, res, 60);
  return res;
}
function webDiaCalc_(mes, tipo, hdr, iso) {
  var i = infoTroca_(mes, tipo, hdr, iso), cad = cadastroMilitaresSeguro_().length > 0, linhas = linhasTrocas_();
  i.cands.forEach(function (x) { /* conflitos com outras solicitações do dia */
    var ex = [];
    linhas.forEach(function (l) {
      if (l[11] !== 'Pendente' && l[11] !== 'Autorizada') return;
      var d = null; try { d = l[15] ? JSON.parse(l[15]) : null; } catch (e) { d = null; }
      if (!d || d.iso !== iso) return;
      var rot = fmtNr_(l[0]) + ' ' + String(l[11]).toLowerCase();
      if (mesmoMil_(l[8], x.nome)) ex.push('já é o "pega" na solicitação ' + rot);
      else if (mesmoMil_(l[7], x.nome)) ex.push('está passando o serviço na solicitação ' + rot);
    });
    if (ex.length) { x.flags = x.flags.concat(ex); x.ok = false; }
  });
  return {
    fecha: fechamentoBI_(parseIso_(iso)),
    data: i.data + ' ' + CFG.DIAS[parseIso_(iso).getDay()],
    par: i.par || null,
    sai: i.sai.map(function (x) { return { dois: !!x.dois, nome: x.nome, sub: x.sub || '', nota: String(x.nota || '').replace(/\s+/g, ' ').trim().slice(0, 90) }; }),
    cands: i.cands.filter(function (x) { return !cad || x.cad !== false; }).map(function (x) { return { nome: x.nome, sub: x.sub || '', ok: !!x.ok, fora: !!x.fora, flags: x.flags }; })
  };
}

function webSolicitar(p) {
  ativarMemoLer_();
  var nome = String(p.solicitante || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!nome) throw new Error('Informe quem está fazendo a solicitação.');
  if (!p.ciente) throw new Error('Confirme que os militares relacionados estão cientes da troca.');
  var cad = cadastroMilitaresSeguro_();
  if (cad.length && norm_(nome) !== norm_(p.sai)) {
    var kn = norm_(nome), ok = cad.some(function (m) { return norm_(m.full) === kn; });
    if (!ok) throw new Error('"' + nome + '" não consta no cadastro de militares.');
  }
  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    var p1 = {
      origem: 'Aplicativo', solicitante: nome, iso: String(p.iso || ''), tipo: String(p.tipo || ''), titulo: String(p.titulo || ''),
      sai: String(p.sai || ''), entra: String(p.entra || ''), motivo: String(p.motivo || '').slice(0, 300), ciente: true, escopo: p.escopo === 'so' ? 'so' : '',
      dadosExtra: { ciente: 1, escopo: p.escopo === 'so' ? 'so' : '' }
    };
    if (p.perm && p.perm.iso) {
      var q = p.perm;
      return registrarPermuta_(p1, {
        origem: 'Aplicativo', solicitante: nome, iso: String(q.iso), tipo: String(q.tipo || ''), titulo: String(q.titulo || ''),
        sai: String(q.sai || ''), entra: String(q.entra || ''), motivo: p1.motivo, escopo: q.escopo === 'so' ? 'so' : ''
      });
    }
    return registrarTroca_(p1);
  } finally { lock.releaseLock(); }
}

function itemTrocaWeb_(l) {
  var s = l[11] === 'Autorizar' || l[11] === 'Negar' ? 'Pendente' : l[11], dd = null;
  if (l[15]) { try { dd = JSON.parse(l[15]); } catch (e) { dd = null; } }
  return {
    ciente: dd && dd.ciente ? 1 : 0, so: dd && dd.escopo === 'so' ? 1 : 0, par: dd && dd.par ? dd.par : '', perna: dd && dd.perna ? dd.perna : 0, parNr: dd && dd.par ? fmtNr_(dd.par) : '',
    id: l[0], nr: fmtNr_(l[0]), rec: l[1] instanceof Date ? fmtData_(l[1]) + ' ' + Utilities.formatDate(l[1], Session.getScriptTimeZone(), 'HH:mm') : '', sol: l[3],
    data: l[4] instanceof Date ? fmtData_(l[4]) + ' ' + CFG.DIAS[l[4].getDay()] : '', iso: l[4] instanceof Date ? isoData_(l[4]) : '', aba: l[5], esc: l[6], sai: l[7], entra: l[8], mot: l[9], alert: l[10],
    sit: s, por: l[12], obs: l[14], dec: l[13] instanceof Date ? fmtData_(l[13]) + ' ' + Utilities.formatDate(l[13], Session.getScriptTimeZone(), 'HH:mm') : ''
  };
}
/** últimas `max` linhas (padrão 1500; 0 = todas) */
function linhasTrocas_(max) {
  var sh = garantirCentral_(), ult = sh.getLastRow();
  if (ult < 2) return [];
  var ini = (max === 0) ? 2 : Math.max(2, ult - (max || 1500) + 1);
  return sh.getRange(ini, 1, ult - ini + 1, 16).getValues().filter(function (l) { return l[0]; });
}

/** busca pelo código da solicitação (ex.: 0113NOV26; sem o ano também vale, pegando o mais recente); aceita ainda o número interno. Devolve a solicitação e, se for permuta, a outra ponta. */
function webAcompanhar(codigo) {
  var cod = String(codigo || '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (!cod) throw new Error('Informe o código da solicitação (ex.: 0113NOV26).');
  var sh = garantirCentral_(), ult = sh.getLastRow();
  if (ult < 2) return { itens: [] };
  var ids = sh.getRange(2, 1, ult - 1, 1).getValues(), r = 0;
  for (var i = ids.length - 1; i >= 0; i--) { /* do mais recente para o mais antigo (o código se repete a cada ano) */
    var id = String(ids[i][0] || '');
    if (!id) continue;
    var cd = codigoTroca_(id).toUpperCase();
    if (id.toUpperCase() === cod || cd === cod || (/[A-Z]{3}$/.test(cod) && cd.slice(0, -2) === cod)) { r = i + 2; break; } /* sem o ano (códigos antigos) vale o mais recente */
  }
  if (!r) return { itens: [] };
  var l = sh.getRange(r, 1, 1, 16).getValues()[0], out = [itemTrocaWeb_(l)], d = null;
  try { d = l[15] ? JSON.parse(l[15]) : null; } catch (e) { d = null; }
  if (d && d.par) { var rp2 = acharLinhaTroca_(sh, d.par); if (rp2) out.push(itemTrocaWeb_(sh.getRange(rp2, 1, 1, 16).getValues()[0])); }
  return { itens: out };
}

/** as 5 últimas solicitações pendentes (as demais, só pelo código) */
function webUltimasPend() {
  var k = 'UP|' + verTrocas_(), c = cacheGet_(k);
  if (c) return c;
  var out = linhasTrocas_(400).filter(function (l) { return l[11] === 'Pendente'; }).slice(-5).reverse().map(itemTrocaWeb_);
  cachePut_(k, out, 30);
  return out;
}

/* ============================================================ 1ª Seção: pedidos */
function webPendentes(tok) {
  var m = sessao_(tok);
  try { expirarPendentes_('Sistema'); } catch (e) { Logger.log('Expirar: ' + e.message); }
  var todas = linhasTrocas_().map(itemTrocaWeb_).reverse();
  return {
    quem: m.nome, admin: !!m.admin, podeCancelar: podeCancelar_(m),
    pend: todas.filter(function (x) { return x.sit === 'Pendente'; }),
    aut: todas.filter(function (x) { return x.sit === 'Autorizada'; }).slice(0, 15)
  };
}

/** cancelar troca já autorizada: administrador sempre; os demais membros da 1ª Seção só se o administrador ativar na Configuração */
function podeCancelar_(m) { return !!(m && (m.admin || cfgTrocas_().membrosCancelam)); }
function exigirCancelar_(m, acao) {
  if (String(acao) === 'Cancelar' && !podeCancelar_(m)) throw new Error('Cancelar troca autorizada está liberado só para o administrador. Peça a ele para ativar a opção na Configuração.');
}

function webDecidir(tok, id, acao, obs) {
  ativarMemoLer_();
  var m = sessao_(tok), lock = LockService.getDocumentLock();
  exigirCancelar_(m, acao);
  lock.waitLock(20000);
  try { return decidirTrocaPar_(String(id), String(acao), m.nome, String(obs || '').slice(0, 200)); }
  finally { lock.releaseLock(); }
}

/** decide várias de uma vez; devolve {ok: n, erros: [{nr, msg}]} */
function webDecidirLote(tok, ids, acao, obs) {
  ativarMemoLer_();
  var m = sessao_(tok), lock = LockService.getDocumentLock(), ok = 0, erros = [], feitos = {};
  exigirCancelar_(m, acao);
  lock.waitLock(30000);
  try {
    (ids || []).slice(0, 60).forEach(function (id) {
      id = String(id);
      if (feitos[id]) return;
      try { decidirTrocaPar_(id, String(acao), m.nome, String(obs || '').slice(0, 200)); ok++; feitos[id] = 1; }
      catch (e) { erros.push({ nr: fmtNr_(id), msg: e.message }); }
    });
  } finally { lock.releaseLock(); }
  auditar_(m.nome, 'Decisão em lote (' + acao + ')', ok + ' ok, ' + erros.length + ' com erro');
  return { ok: ok, erros: erros };
}

/** exclusão definitiva (somente administrador); fica registrada na auditoria */
function webExcluir(tok, id, motivo) {
  var m = sessao_(tok, true), lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try { return excluirTroca_(String(id), m.nome, motivo); }
  finally { lock.releaseLock(); }
}

/** "como fica o dia" a partir de uma linha da Central */
function previaDados_(l) {
  var d = l[15] ? JSON.parse(l[15]) : null;
  if (!d) throw new Error('Pedido sem dados.');
  d.hdr = hdrPorTitulo_(d, l[6]);
  var info = infoTroca_(d.mes, d.tipo, d.hdr, d.iso), ks = norm_(l[7]);
  return {
    data: info.data, esc: info.titulo,
    linhas: info.sai.map(function (x) { var me = norm_(x.nome) === ks; return { sai: x.nome, antes: x.nota, dep: me ? l[8] : x.nota, destaque: me }; })
  };
}
function webPrevia(tok, id) {
  ativarMemoLer_();
  sessao_(tok);
  var sh = garantirCentral_(), r = acharLinhaTroca_(sh, String(id));
  if (!r) throw new Error('Pedido não encontrado.');
  return previaDados_(sh.getRange(r, 1, 1, 16).getValues()[0]);
}

/* ============================================================ resumo por escala (aba Acompanhar) */
/** contagem pública; detalhes só para a 1ª Seção logada ou para quem é da escala liberada pelo administrador */
function resumoTrocas_() {
  var k = 'RS|' + verTrocas_(), c = cacheGet_(k);
  if (c) return c;
  var linhas = linhasTrocas_(), ont = new Date(), por = {}, ordem = [];
  ont.setHours(0, 0, 0, 0); ont.setDate(ont.getDate() - 1); /* autorizadas: serviço de ontem em diante */
  linhas.forEach(function (l) {
    var st = l[11];
    if (st !== 'Pendente' && st !== 'Autorizada') return;
    if (st === 'Autorizada' && !(l[4] instanceof Date && l[4] >= ont)) return;
    var t = String(l[6] || '—'), o = por[t];
    if (!o) { o = por[t] = { titulo: t, pend: 0, aut: 0, mem: [], itens: [] }; ordem.push(t); }
    if (st === 'Pendente') o.pend++; else o.aut++;
    var d = null; try { d = l[15] ? JSON.parse(l[15]) : null; } catch (e) { d = null; }
    if (d && d.membros && o.mem.length < 80) d.membros.forEach(function (m) { if (o.mem.indexOf(m) < 0 && o.mem.length < 80) o.mem.push(m); });
    if (o.itens.length < 30) o.itens.push(itemTrocaWeb_(l));
  });
  var res = { escalas: ordem.map(function (t) { var o = por[t]; o.itens.sort(function (a, b) { return (a.sit === 'Pendente' ? 0 : 1) - (b.sit === 'Pendente' ? 0 : 1); }); return o; }) };
  cachePut_(k, res, 30);
  return res;
}
function militarDaEscala_(mem, militar) {
  var kn = norm_(militar), kt = semGrad_(kn);
  return !!kn && (mem || []).some(function (x) { return mesmoMil_(x, kn); });
}
function podeVerEscala_(titulo, mem, militar, adm) {
  if (adm) return true;
  var vs = cfgTrocas_().visEscalas.map(norm_);
  return vs.indexOf(norm_(titulo)) >= 0 && militarDaEscala_(mem, militar);
}
function admSessao_(tok) { if (!tok) return false; try { sessao_(tok); return true; } catch (e) { return false; } }
function checaMilitarCad_(militar) {
  if (!militar) return '';
  var cad = cadastroMilitaresSeguro_(), kn = norm_(militar);
  if (cad.length && !cad.some(function (m) { return norm_(m.full) === kn; })) throw new Error('Escolha um militar cadastrado.');
  return militar;
}

/** total de pendentes (selo do ícone "Acompanhar"); usa o resumo em cache */
function webPendCount() {
  ativarMemoLer_();
  return resumoTrocas_().escalas.reduce(function (n, o) { return n + o.pend; }, 0);
}

function webResumo(tok) {
  ativarMemoLer_();
  var adm = admSessao_(tok);
  return {
    adm: adm,
    escalas: resumoTrocas_().escalas.map(function (o) {
      /* a relação é aberta a todos; quem não é da 1ª Seção não vê solicitante, motivo, alertas nem o id interno */
      return { titulo: o.titulo, pend: o.pend, aut: o.aut, det: true, itens: adm ? o.itens : o.itens.map(itemPublico_) };
    })
  };
}

function itemPublico_(x) {
  return { nr: x.nr, rec: x.rec, data: x.data, iso: x.iso, esc: x.esc, sai: x.sai, entra: x.entra, sit: x.sit, por: x.por, dec: x.dec, par: x.par ? 1 : 0, parNr: x.parNr || '' };
}

/** solicitações NÃO autorizadas (negadas, expiradas e inválidas) dos últimos 7 dias, com o motivo — aberto a todos */
function webNaoAut() {
  ativarMemoLer_();
  var k = 'NA|' + verTrocas_(), c = cacheGet_(k);
  if (c) return c;
  var lim = new Date(), lista = [];
  lim.setHours(0, 0, 0, 0); lim.setDate(lim.getDate() - 7);
  var MOT = { Negada: 'Motivo não informado.', Expirada: 'O serviço passou sem decisão da 1ª Seção.', 'Inválida': 'Pedido inválido.' };
  linhasTrocas_().forEach(function (l) {
    var st = l[11];
    if (!MOT[st]) return;
    var quando = l[13] instanceof Date ? l[13] : (l[1] instanceof Date ? l[1] : null);
    if (!quando || quando < lim) return;
    var it = itemTrocaWeb_(l);
    lista.push({ t: quando.getTime(), nr: it.nr, iso: it.iso, data: it.data, esc: it.esc, sai: it.sai, entra: it.entra, sit: st,
      motivo: String(l[14] || '').trim() || MOT[st], reg: String(l[12] || '').trim() || 'Sistema',
      regEm: quando instanceof Date ? fmtData_(quando) + ' ' + Utilities.formatDate(quando, Session.getScriptTimeZone(), 'HH:mm') : '', par: it.par ? 1 : 0, parNr: it.parNr || '', perna: it.perna });
  });
  lista = lista.filter(function (x) { return !(x.perna === 2 && lista.some(function (y) { return y.nr === x.parNr && y.sit === x.sit; })); });
  lista.sort(function (a, c2) { return c2.t - a.t; });
  var res = { itens: lista.slice(0, 30).map(function (x) { delete x.t; delete x.perna; return x; }) };
  cachePut_(k, res, 30);
  return res;
}

function webPreviaPub(id, tok) {
  ativarMemoLer_();
  if (!admSessao_(tok)) throw new Error('Os detalhes são liberados só para a 1ª Seção.');
  var sh = garantirCentral_(), r = acharLinhaTroca_(sh, String(id));
  if (!r) throw new Error('Pedido não encontrado.');
  return previaDados_(sh.getRange(r, 1, 1, 16).getValues()[0]);
}

/* ============================================================ relatórios (1ª Seção) */
function webRelatorio(tok, f) {
  sessao_(tok);
  f = f || {};
  var linhas = linhasTrocas_(0), itens = [], cont = {}, esc = {}, passam = {}, pegam = {}, dec = {}, dsem = [0, 0, 0, 0, 0, 0, 0], serie = {}, mot = {}, tdec = [], ant = [], comAl = 0, n = { Pendente: 0, Autorizada: 0, Negada: 0, Cancelada: 0, 'Inválida': 0, 'Excluída': 0, Expirada: 0 };
  function inc(o, k, extra) { o[k] = o[k] || { n: 0, aut: 0, neg: 0 }; o[k].n++; if (extra === 'Autorizada') o[k].aut++; if (extra === 'Negada') o[k].neg++; }
  linhas.forEach(function (l) {
    var it = itemTrocaWeb_(l);
    if (f.de && it.iso && it.iso < f.de) return;
    if (f.ate && it.iso && it.iso > f.ate) return;
    if (f.escala && String(l[6]) !== f.escala) return;
    if (f.situacao ? it.sit !== f.situacao : it.sit === 'Excluída') return;
    itens.push(it);
    n[it.sit] = (n[it.sit] || 0) + 1;
    inc(esc, l[6] || '—', it.sit); inc(passam, l[7] || '—', it.sit); inc(pegam, l[8] || '—', it.sit);
    if (l[12]) inc(dec, l[12], it.sit);
    if (l[4] instanceof Date) { dsem[l[4].getDay()]++; var k = isoData_(l[4]); serie[k] = (serie[k] || 0) + 1; }
    if (l[10] && l[10] !== 'Sem alertas') comAl++;
    if (l[1] instanceof Date && l[13] instanceof Date && (it.sit === 'Autorizada' || it.sit === 'Negada')) tdec.push((l[13] - l[1]) / 3600000);
    if (l[1] instanceof Date && l[4] instanceof Date) ant.push(Math.round((l[4] - l[1]) / 86400000));
    var mt = String(l[9] || '').trim().toLowerCase(); if (mt) { mot[mt] = (mot[mt] || 0) + 1; }
  });
  function top(o, k) { return Object.keys(o).map(function (x) { return { nome: x, n: o[x].n, aut: o[x].aut, neg: o[x].neg }; }).sort(function (a, b) { return b.n - a.n || (a.nome < b.nome ? -1 : 1); }).slice(0, k || 12); }
  function med(a) { return a.length ? Math.round(a.reduce(function (s, x) { return s + x; }, 0) / a.length * 10) / 10 : null; }
  var decididas = n.Autorizada + n.Negada;
  var escalas = {}; linhas.forEach(function (l) { if (l[6]) escalas[l[6]] = 1; });
  return {
    total: itens.length, n: n, taxaAprov: decididas ? Math.round(100 * n.Autorizada / decididas) : null,
    horasDecisao: med(tdec), antecedenciaDias: med(ant), comAlerta: comAl,
    porEscala: top(esc, 15), passam: top(passam), pegam: top(pegam), decisores: top(dec, 10),
    diaSemana: dsem, serie: Object.keys(serie).sort().slice(-31).map(function (k) { return { d: k, n: serie[k] }; }),
    motivos: Object.keys(mot).map(function (k) { return { nome: k, n: mot[k] }; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 8),
    escalas: Object.keys(escalas).sort(), itens: itens.slice(-500).reverse()
  };
}

/* ============================================================ auditoria e configuração (administrador) */
function webAuditoria(tok) {
  var m = sessao_(tok, true);
  var sh = centralSS_().getSheetByName('Auditoria');
  if (!sh || sh.getLastRow() < 2) return [];
  var n = Math.min(sh.getLastRow() - 1, 400), v = sh.getRange(sh.getLastRow() - n + 1, 1, n, 4).getValues();
  auditar_(m.nome, 'Consulta à auditoria', '');
  return v.reverse().map(function (r) { return { q: r[0] instanceof Date ? fmtData_(r[0]) + ' ' + Utilities.formatDate(r[0], Session.getScriptTimeZone(), 'HH:mm:ss') : String(r[0]), u: r[1], a: r[2], d: r[3] }; });
}

function webCfgGet(tok) {
  sessao_(tok, true);
  var c = cfgTrocas_(), esc = {};
  [0, 1].forEach(function (k) {
    var mesId = CFG.MESES[(new Date().getMonth() + k) % 12];
    apiBlocos(mesId, [CFG.TIPO_GRAD, CFG.TIPO_CNDT]).blocos.forEach(function (b) { esc[b.titulo] = 1; });
    blocosExt_().forEach(function (b) { esc[b.titulo] = 1; });
  });
  return {
    titulo: c.titulo, subtitulo: c.subtitulo, biTitulo: c.biTitulo, biIntegral: c.biIntegral, biParcial: c.biParcial, biNota: c.biNota, biSemana: c.biSemana, biExc: c.biExc, escalaUrl: c.escalaUrl, antecedencia: c.antecedencia, visEscalas: c.visEscalas, notificar: c.notificar, aprov: c.aprov.join(', '), avisos: c.avisos, membrosCancelam: !!c.membrosCancelam, expirarAuto: c.expirarAuto, novidades: c.novidades,
    escalas: Object.keys(esc).sort(),
    membros: membrosAdm_().map(function (m) { return { nome: m.nome, ativo: !!m.ativo, admin: !!m.admin, temSenha: !!m.hash }; }),
    planilha: centralSS_().getUrl(), url: urlAppTrocas_()
  };
}

function webCfgSalvar(tok, n) {
  var adm = sessao_(tok, true), c = cfgTrocas_(), mud = [];
  function troca(campo, novo, rot) { if (String(c[campo]) !== String(novo)) { mud.push(rot + ': "' + c[campo] + '" ➜ "' + novo + '"'); c[campo] = novo; } }
  troca('titulo', String(n.titulo || '').trim().slice(0, 90) || c.titulo, 'Título');
  troca('subtitulo', String(n.subtitulo || '').trim().slice(0, 90), 'Subtítulo');
  troca('biTitulo', String(n.biTitulo || '').trim().slice(0, 60), 'BI: título');
  troca('biIntegral', String(n.biIntegral || '').trim().slice(0, 20), 'BI: expediente integral');
  troca('biParcial', String(n.biParcial || '').trim().slice(0, 20), 'BI: expediente parcial');
  troca('biNota', String(n.biNota || '').trim().slice(0, 400), 'BI: observação');
  troca('escalaUrl', String(n.escalaUrl || '').trim().slice(0, 300) || c.escalaUrl, 'Link da escala do 21º GAC');
  var NOMES_ = { int: 'integral', par: 'parcial', off: 'sem expediente' }, DS_ = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  var sem = [0, 1, 2, 3, 4, 5, 6].map(function (i) { var v = (n.biSemana || [])[i]; return NOMES_[v] ? v : c.biSemana[i]; });
  if (JSON.stringify(sem) !== JSON.stringify(c.biSemana)) {
    mud.push('Expediente da semana: ' + [1, 2, 3, 4, 5, 6, 0].map(function (i) { return DS_[i] + '=' + NOMES_[sem[i]]; }).join(', '));
    c.biSemana = sem;
  }
  var seen = {}, exc = [];
  (n.biExc || []).forEach(function (x) { if (x && /^\d{4}-\d{2}-\d{2}$/.test(String(x.iso)) && NOMES_[x.tipo] && !seen[x.iso] && exc.length < 60) { seen[x.iso] = 1; exc.push({ iso: x.iso, tipo: x.tipo }); } });
  exc.sort(function (a, b) { return a.iso < b.iso ? -1 : 1; });
  if (JSON.stringify(exc) !== JSON.stringify(c.biExc)) { mud.push('Exceções de expediente: ' + (exc.map(function (x) { return x.iso + '=' + NOMES_[x.tipo]; }).join(', ') || 'nenhuma')); c.biExc = exc; }
  var ant = Math.max(0, Math.min(30, Math.round(Number(n.antecedencia) || 0)));
  troca('antecedencia', ant, 'Antecedência (dias)');
  var vis = Array.isArray(n.visEscalas) ? n.visEscalas.map(String) : c.visEscalas;
  if (JSON.stringify(vis) !== JSON.stringify(c.visEscalas)) { mud.push('Escalas com acompanhamento liberado: ' + (vis.join(', ') || 'nenhuma')); c.visEscalas = vis; }
  c.notificar = !!n.notificar;
  var avs = (n.avisos || []).slice(0, 8).map(limparAviso_);
  if (JSON.stringify(avs) !== JSON.stringify(c.avisos || [])) {
    mud.push('Avisos personalizados: ' + avs.length + ' cadastrado(s), ' + avs.filter(function (a) { return a.ativo; }).length + ' ativo(s) — ' + avs.map(function (a) { return (a.ativo ? '' : '[off] ') + (a.titulo || a.texto.slice(0, 30)); }).join(' | '));
    c.avisos = avs;
  }
  if (!!n.membrosCancelam !== !!c.membrosCancelam) { mud.push('Demais membros da 1ª Seção podem cancelar trocas autorizadas: ' + (n.membrosCancelam ? 'sim' : 'não')); c.membrosCancelam = !!n.membrosCancelam; }
  if (!!n.expirarAuto !== c.expirarAuto) { mud.push('Expirar pendentes automaticamente: ' + (n.expirarAuto ? 'sim' : 'não')); c.expirarAuto = !!n.expirarAuto; }
  var nov = String(n.novidades || '').trim().slice(0, 1200);
  if (nov !== c.novidades) { c.novidades = nov; c.novidadesVer = (c.novidadesVer || 1) + 1; mud.push('Texto de novidades alterado'); }
  c.aprov = String(n.aprov || '').split(/[,;\s]+/).filter(function (x) { return /@/.test(x); });
  var atual = membrosAdm_(), novos = [];
  (n.membros || []).forEach(function (m) {
    var nome = String(m.nome || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!nome) return;
    var o = atual.filter(function (x) { return norm_(x.nome) === norm_(nome); })[0], r = { nome: o ? o.nome : nome, ativo: !!m.ativo, admin: !!m.admin, hash: o ? o.hash : '' };
    if (!o) mud.push('Militar adicionado à 1ª Seção: ' + nome);
    else {
      if (o.ativo !== r.ativo) mud.push(nome + (r.ativo ? ' reativado' : ' desativado'));
      if (o.admin !== r.admin) mud.push(nome + (r.admin ? ' agora é administrador' : ' deixou de ser administrador'));
    }
    if (m.novaSenha) {
      if (String(m.novaSenha).length < 4) throw new Error('A senha de ' + nome + ' precisa ter pelo menos 4 caracteres.');
      r.hash = hashSenha_(r.nome, m.novaSenha); mud.push('Senha redefinida: ' + nome);
    }
    novos.push(r);
  });
  atual.forEach(function (o) { if (!novos.some(function (x) { return norm_(x.nome) === norm_(o.nome); })) mud.push('Militar removido da 1ª Seção: ' + o.nome); });
  if (!novos.some(function (x) { return x.ativo && x.admin && x.hash; })) throw new Error('É preciso manter pelo menos um administrador ativo com senha.');
  salvarMembros_(novos);
  salvarCfgTrocas_(c);
  auditar_(adm.nome, 'Configuração alterada', mud.join(' | ') || 'sem mudanças');
  return webCfgGet(tok);
}

/* ============================================================ ver escala (consulta, somente leitura) */
function abaEscala_(mesId, tipo, ano, mes) {
  var sh = ss_().getSheetByName(mesId + ' ' + tipo);
  if (!sh) return null;
  var A = lerAba_(sh);
  if (mes != null && (A.mes !== mes || A.ano !== ano)) return null;
  return { sh: sh, A: A };
}
function notaCurta_(x) { return String(x || '').replace(/\s+/g, ' ').trim().slice(0, 80); }

/** quem está de serviço em cada escala num dia (com a troca anotada, se houver) */
function webEscalaDia(iso) {
  ativarMemoLer_();
  var kE = 'ED|' + iso + '|' + verTrocas_(), ce = cacheGet_(kE);
  if (ce) return ce;
  var rE = webEscalaDiaCalc_(iso);
  cachePut_(kE, rE, 90);
  return rE;
}
function webEscalaDiaCalc_(iso) {
  var dt = parseIso_(iso), mesId = CFG.MESES[dt.getMonth()], d = dt.getDate(), out = [], achou = false;
  [CFG.TIPO_GRAD, CFG.TIPO_CNDT].forEach(function (t) {
    var o = abaEscala_(mesId, t, dt.getFullYear(), dt.getMonth());
    if (!o) return;
    achou = true;
    var A = o.A, c = colDia_(d), notas = o.sh.getRange(1, 1, A.vals.length, A.vals[0].length).getNotes();
    A.blocos.forEach(function (B) {
      var pes = [];
      B.rows.forEach(function (R) {
        if (!participa_(A, B, R, d) || num_(A.vals[R.r][c]) !== 0) return;
        pes.push({ nome: R.nome.replace(/\s+/g, ' ').trim(), sub: R.sub || '', troca: notaCurta_(notas[R.r][c]) });
      });
      out.push({ aba: A.nome, tipo: t, titulo: B.titulo, pessoas: pes });
    });
  });
  if (!achou) throw new Error('Não há escala cadastrada para essa data.');
  return { data: fmtData_(dt) + ' ' + CFG.DIAS[dt.getDay()], escalas: out };
}

/** serviços de um militar no mês atual e no seguinte (inclui os que pegou por troca) */
function webEscalaMilitar(nome) {
  ativarMemoLer_();
  var kM2 = 'EM|' + norm_(nome) + '|' + verTrocas_(), cm = cacheGet_(kM2);
  if (cm) return cm;
  var rM = webEscalaMilitarCalc_(nome);
  cachePut_(kM2, rM, 90);
  return rM;
}
function webEscalaMilitarCalc_(nome) {
  var kn = norm_(nome), kt = kn.replace(/^(\d+\s*º?\s*SGT|SD\s*EP|SD\s*EV|CB\s*EP|CB|SGT|ST|TEN|CAP)\s+/, ''), hoje = new Date(), itens = [], achouLinha = '';
  if (!kn) throw new Error('Escolha um militar.');
  function eu(txt) { var k = norm_(txt); return k === kn || k.indexOf(kn) >= 0 || mesmoMil_(k, kn); }
  [0, 1].forEach(function (k) {
    var dm = new Date(hoje.getFullYear(), hoje.getMonth() + k, 1), mesId = CFG.MESES[dm.getMonth()];
    [CFG.TIPO_GRAD, CFG.TIPO_CNDT].forEach(function (t) {
      var o = abaEscala_(mesId, t, dm.getFullYear(), dm.getMonth());
      if (!o) return;
      var A = o.A, notas = o.sh.getRange(1, 1, A.vals.length, A.vals[0].length).getNotes();
      A.blocos.forEach(function (B) {
        B.rows.forEach(function (R) {
          var meu = mesmoMil_(R.key, kn);
          if (meu) achouLinha = R.nome;
          for (var d = 1; d <= A.nDias; d++) {
            var c = colDia_(d);
            if (!participa_(A, B, R, d) || num_(A.vals[R.r][c]) !== 0) continue;
            var nt = notaCurta_(notas[R.r][c]), iso = isoData_(new Date(A.ano, A.mes, d));
            if (meu) itens.push({ iso: iso, d: d, dia: CFG.DIAS[new Date(A.ano, A.mes, d).getDay()], esc: B.titulo, aba: A.nome, tipo: nt ? 'passou' : 'servico', troca: nt });
            else if (nt && eu(nt)) itens.push({ iso: iso, d: d, dia: CFG.DIAS[new Date(A.ano, A.mes, d).getDay()], esc: B.titulo, aba: A.nome, tipo: 'pegou', troca: R.nome.replace(/\s+/g, ' ').trim() });
          }
        });
      });
    });
  });
  itens.sort(function (a, b) { return a.iso < b.iso ? -1 : (a.iso > b.iso ? 1 : 0); });
  return { nome: achouLinha || nome, hoje: isoData_(hoje), itens: itens };
}

/** lista da escala escolhida, dia a dia, com as trocas */
function webEscalaBloco(mes, tipo, hdr) {
  ativarMemoLer_();
  var kB = 'EB|' + mes + '|' + tipo + '|' + hdr + '|' + verTrocas_(), cb = cacheGet_(kB);
  if (cb) return cb;
  var rB = webEscalaBlocoCalc_(mes, tipo, hdr);
  cachePut_(kB, rB, 90);
  return rB;
}
function webEscalaBlocoCalc_(mes, tipo, hdr) {
  var o = abaEscala_(mes, tipo);
  if (!o) throw new Error('Aba não encontrada.');
  var A = o.A, B = A.blocos.filter(function (b) { return b.hdr === Number(hdr); })[0];
  if (!B) throw new Error('Escala não encontrada.');
  var notas = o.sh.getRange(1, 1, A.vals.length, A.vals[0].length).getNotes(), dias = [];
  for (var d = 1; d <= A.nDias; d++) {
    var c = colDia_(d), pes = [];
    B.rows.forEach(function (R) {
      if (!participa_(A, B, R, d) || num_(A.vals[R.r][c]) !== 0) return;
      pes.push({ nome: R.nome.replace(/\s+/g, ' ').trim(), troca: notaCurta_(notas[R.r][c]) });
    });
    var dd = new Date(A.ano, A.mes, d);
    dias.push({ d: d, iso: isoData_(dd), dia: CFG.DIAS[dd.getDay()], vermelho: vermelho_(A, B, d), pessoas: pes });
  }
  return { titulo: B.titulo, aba: A.nome, dias: dias };
}

/* ============================================================ PDF (mesmo estilo do aplicativo) */
function pdfHtml_(titulo, sub, corpo) {
  return '<html><head><meta charset="utf-8"><style>' +
    'body{font-family:Arial,sans-serif;color:#191D17;font-size:10px;margin:0}' +
    'table{border-collapse:collapse;width:100%}th{background:#3A6A35;color:#FFFFFF;text-align:left;padding:5px 6px;font-size:9px}' +
    'td{padding:4px 6px;border-bottom:1px solid #C3C8BB;vertical-align:top}tr.z td{background:#F2F5EB}' +
    '.k{display:inline-block;border:1px solid #C3C8BB;border-radius:6px;padding:6px 12px;margin:0 6px 6px 0;background:#F2F5EB}.k b{display:block;font-size:16px;color:#3A6A35}' +
    '.p{font-weight:bold}.Autorizada{color:#137333}.Negada,.Inválida{color:#BA1A1A}.Pendente{color:#B06000}.Cancelada,.Excluída{color:#5f6368}' +
    'h2{font-size:12px;color:#3A6A35;margin:14px 0 4px}</style></head><body>' +
    '<table><tr><td style="background:#ECEFE5;border-bottom:3px solid #3A6A35;padding:10px 12px"><div style="font-size:15px">Gestão de Escalas</div><div style="font-size:10px;color:#43483F">' + escH_(cfgTrocas_().subtitulo) + '</div></td></tr></table>' +
    '<div style="padding:10px 12px"><div style="font-size:16px;font-weight:bold">' + escH_(titulo) + '</div><div style="color:#43483F;margin:2px 0 10px">' + sub + '</div>' + corpo + '</div></body></html>';
}
function pdfBlob_(html, nome) { return Utilities.base64Encode(HtmlService.createHtmlOutput(html).getBlob().getAs('application/pdf').setName(nome).getBytes()); }
function agoraTxt_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'); }

/** tipo: 'aud' (administrador) ou 'rel' (1ª Seção). f: filtros do relatório ou {q} da auditoria. Devolve {nome, b64}. */
function webPdf(tok, tipo, f) {
  var m = sessao_(tok, tipo === 'aud');
  f = f || {};
  if (tipo === 'aud') {
    var l = webAuditoria(tok), q = norm_(f.q || '');
    if (q) l = l.filter(function (x) { return norm_(x.u + ' ' + x.a + ' ' + x.d).indexOf(q) >= 0; });
    var h = '<table><tr><th>Quando</th><th>Usuário</th><th>Ação</th><th>Detalhe</th></tr>' + l.map(function (x, i) { return '<tr class="' + (i % 2 ? 'z' : '') + '"><td>' + escH_(x.q) + '</td><td>' + escH_(x.u) + '</td><td>' + escH_(x.a) + '</td><td>' + escH_(x.d) + '</td></tr>'; }).join('') + '</table>';
    auditar_(m.nome, 'Exportação da auditoria (PDF)', l.length + ' registros');
    return { nome: 'auditoria.pdf', b64: pdfBlob_(pdfHtml_('Auditoria', 'Gerado em ' + agoraTxt_() + ' por ' + escH_(m.nome) + ' · ' + l.length + ' registro(s)' + (q ? ' · filtro: ' + escH_(f.q) : ''), h), 'auditoria.pdf') };
  }
  var r = webRelatorio(tok, f);
  function tab(tit, arr) { return '<h2>' + tit + '</h2><table><tr><th>Nome</th><th>Total</th><th>Autorizadas</th><th>Negadas</th></tr>' + arr.map(function (x, i) { return '<tr class="' + (i % 2 ? 'z' : '') + '"><td>' + escH_(x.nome) + '</td><td>' + x.n + '</td><td>' + x.aut + '</td><td>' + x.neg + '</td></tr>'; }).join('') + '</table>'; }
  var k = function (b, t) { return '<div class="k"><b>' + b + '</b>' + t + '</div>'; };
  var corpo = k(r.total, 'solicitações') + k(r.n.Autorizada, 'autorizadas') + k(r.n.Negada, 'negadas') + k(r.n.Pendente, 'pendentes') + k(r.taxaAprov == null ? '—' : r.taxaAprov + '%', 'aprovação') + k(r.horasDecisao == null ? '—' : r.horasDecisao + ' h', 'tempo médio de decisão') +
    tab('Por escala', r.porEscala) + tab('Quem mais passa serviço', r.passam) + tab('Quem mais pega serviço', r.pegam) + tab('Decisões por militar da 1ª Seção', r.decisores) +
    '<h2>Solicitações (' + r.itens.length + ')</h2><table><tr><th>Nr</th><th>Serviço</th><th>Escala</th><th>Passa</th><th>Pega</th><th>Situação</th><th>Decisão</th></tr>' +
    r.itens.map(function (x, i) { return '<tr class="' + (i % 2 ? 'z' : '') + '"><td>' + escH_(x.nr) + '</td><td>' + escH_(x.data) + '</td><td>' + escH_(x.esc) + '</td><td>' + escH_(x.sai) + '</td><td>' + escH_(x.entra) + '</td><td class="p ' + escH_(x.sit) + '">' + escH_(x.sit) + '</td><td>' + escH_(x.por) + (x.dec ? ' ' + escH_(x.dec) : '') + '</td></tr>'; }).join('') + '</table>';
  var per = (f.de || f.ate) ? ' · período do serviço: ' + escH_(f.de || '…') + ' a ' + escH_(f.ate || '…') : '';
  auditar_(m.nome, 'Exportação do relatório (PDF)', r.itens.length + ' solicitações');
  return { nome: 'relatorio-trocas.pdf', b64: pdfBlob_(pdfHtml_('Relatório de trocas de serviço', 'Gerado em ' + agoraTxt_() + ' por ' + escH_(m.nome) + per + (f.escala ? ' · escala: ' + escH_(f.escala) : '') + (f.situacao ? ' · situação: ' + escH_(f.situacao) : ''), corpo), 'relatorio-trocas.pdf') };
}
