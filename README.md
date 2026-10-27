# Módulo Brigada 1.0 (Google Apps Script)

Menu **Módulo Brigada** para a planilha "Escala do 21º GAC".

## Instalação
1. Na planilha: **Extensões → Apps Script**.
2. Crie/cole os arquivos `Codigo.gs` e `Modulo_Escala.gs` (e, em *Configurações do projeto*, marque "Mostrar arquivo de manifesto" e cole `appsscript.json`).
3. Salve, recarregue a planilha e autorize no primeiro uso.
4. Menu **Módulo Brigada → Auditagem → Verificação do sistema** para conferir a instalação.

Teste primeiro numa **cópia** da planilha.

## Fase 1 (implementada)
- ✏️ Confecção: adicionar/retirar serviços, afastamento (individual e conjunto), adicionar militar.
- 🗂️ Abas mensais: criar abas do mês + gatilho automático (dia 1–28, data única ou PDU).
- ℹ️ Sobre (manual) e ✅ Verificação do sistema.

## Fase 2
- ✅ Auditagem: verificação de serviços tirados (`Modulo_Auditagem.gs`).
- ✅ Importar escala da Guarnição via Drive ou documento (`Modulo_Importar.gs`).
- ✅ Prévia semanal sem abas de cache: escalas da própria planilha (`Modulo_Previa.gs`) e arquivos externos por IMPORTRANGE + gatilho de 10 min para Of Dia/trocas (`Modulo_PreviaExt.gs`).

## Como o script lê a planilha
- Blocos: linha com dia 1 em `F` e dia da semana na linha de baixo; título em C/D/E. Militares = linhas seguintes até `E` vazio.
- Cores de afastamento/serviço: lidas da **LEGENDA** da própria aba (coluna D/E). Laranja/azul/cinza do cabeçalho e vermelho dos dias ficam em `CFG.COR`.
- Folga: as fórmulas existentes (`=célula anterior do mesmo tipo +1`) são mantidas; o script só grava `0` e, ao retirar, recria a fórmula.

## Premissas a confirmar
- Folga mínima de 48 h = 2 dias livres entre os serviços (serviço dia 14 → primeiro dia possível: 17). Vale entre meses (lê as abas vizinhas).
- Feriados: `CFG.FERIADOS_FIXOS` (nacionais fixos) e `CFG.FERIADOS_EXTRAS` (AAAA-MM-DD). Ao criar aba nova, dias vermelhos = sáb/dom/feriados dessa lista; ajuste a cor manualmente se houver feriado local.
- Gatilho `PDU`: cria as abas do **mês corrente** se ainda não existirem; dia/data criam o **mês seguinte**.
- Blocos `QG AD/1` só têm vaga em dias com cabeçalho laranja (carregue a Guarnição antes).
