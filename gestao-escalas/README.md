# Gestão de Escalas — página no GitHub Pages

Esta pasta é a **página do app** (HTML + ícones). Os dados e as regras continuam no **Apps Script** da planilha:
a página chama o app publicado por HTTPS (`POST` para o endereço `/exec`), com o mesmo login e as mesmas permissões de sempre.

## Publicar (uma vez)
1. Crie um repositório **público** (ex.: `gestao-escalas`) e envie os arquivos desta pasta para a raiz dele
   (o `index.html`, `config.js`, `manifest.webmanifest`, os dois `icone-*.png` e o `.nojekyll`).
2. No Apps Script: cole os arquivos do projeto (principalmente `Modulo_TrocasWeb.gs`) e publique uma **nova versão** do app da web
   (Implantar → Gerenciar implantações → Editar → Nova versão; acesso: **Qualquer pessoa**).
3. Copie a **URL do app da Web** (termina em `/exec`) e cole em `config.js`, no lugar de `COLE_AQUI_A_URL_DO_APP_EXEC`.
4. No GitHub: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`** → Save.
5. Em 1–2 minutos o app abre em `https://SEU-USUARIO.github.io/gestao-escalas/`.
6. (Opcional) para os links dos e-mails e da ajuda apontarem para o endereço novo, rode **uma vez** no editor do Apps Script:
   `definirUrlPublica_('https://SEU-USUARIO.github.io/gestao-escalas/')`.

## Instalar no celular
Abra o endereço no Chrome → menu ⋮ → **Adicionar à tela inicial** (aparece como app “Escalas”).
Modo painel/TV: acrescente `?tv=1` ao endereço.

## Atualizar a página depois
O arquivo `index.html` é gerado a partir de `fonte/web.html` do repositório do projeto (`python3 fonte/gerar.py`).
Para mudar o visual: edite `fonte/web.html`, rode o gerador e envie o novo `index.html` para este repositório.
Mudanças nas regras (arquivos `.gs`) continuam sendo coladas no Apps Script, como antes.
