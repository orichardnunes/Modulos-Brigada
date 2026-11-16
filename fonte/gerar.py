#!/usr/bin/env python3
"""Gera, a partir de fonte/web.html e fonte/backend.gs.tpl:
  - ../Modulo_TrocasWeb.gs   (app dentro do Apps Script)
  - ../gestao-escalas/index.html (página para o GitHub Pages)
Uso: python3 fonte/gerar.py"""
import json, os, re
aqui = os.path.dirname(os.path.abspath(__file__))
raiz = os.path.dirname(aqui)
html = open(os.path.join(aqui, 'web.html'), encoding='utf-8').read()
tpl = open(os.path.join(aqui, 'backend.gs.tpl'), encoding='utf-8').read()
open(os.path.join(raiz, 'Modulo_TrocasWeb.gs'), 'w', encoding='utf-8').write(tpl.replace('__HTML__', json.dumps(html, ensure_ascii=False)))
cor = (re.search(r'--p:(#[0-9a-fA-F]{6})', html) or [None, '#3A6A35'])[1]
head = ('<link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="%s">'
        '<link rel="icon" type="image/png" href="icone-192.png"><link rel="apple-touch-icon" href="icone-192.png"><script src="config.js"></script>') % cor
assert '<!--TVFLAG-->' in html
open(os.path.join(raiz, 'gestao-escalas', 'index.html'), 'w', encoding='utf-8').write(html.replace('<!--TVFLAG-->', head))
print('ok: Modulo_TrocasWeb.gs e gestao-escalas/index.html')
