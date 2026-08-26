"""Validador do workflow de atendimento (biblioteca padrão apenas).

Uso:
    python automation/n8n/validar_workflow.py
    python automation/n8n/validar_workflow.py caminho/para/workflow.json

Verifica JSON válido, estado inativo, nós obrigatórios, rotas sem destino,
ausência de segredos e de dados pessoais, e que toda operação de agenda passa
por `/api/ai/*` com token de automação — nunca pelo PostgREST.
"""

import json
import os
import re
import sys

PADRAO = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                      "AgendaMagnetica-v2.n8n.json")

NOS_OBRIGATORIOS = [
    "Webhook",
    "normalizar entrada",
    "Redis - marcar mensagem",
    "mensagem duplicada?",
    "Redis - atendimento humano ativo?",
    "agrupar mensagens",
    "contexto da empresa",
    "montar contexto",
    "IA interpretadora",
    "validar interpretação",
    "resolver e decidir",
    "rota",
    "buscar horários",
    "avaliar horários",
    "consultas do cliente",
    "decidir sobre consultas",
    "criar consulta",
    "reagendar consulta",
    "cancelar consulta",
    "repetir escrita",
    "verificar resultado",
    "montar resposta",
    "evo enviar mensagem",
    "registrar decisão",
]

# Nada mais fala com o banco: quem tem `SUPABASE_SERVICE_ROLE_KEY` é o backend.
# Um destes literais de volta ao JSON significa acesso direto ao PostgREST,
# vocabulário de status errado ou filtro montado no fluxo.
PROIBIDOS = [
    (r"SUPABASE_SERVICE_ROLE_KEY", "chave administrativa do banco no workflow"),
    (r"SUPABASE_URL", "acesso direto ao Supabase"),
    (r"rest/v1", "chamada direta ao PostgREST"),
    (r"id_info_clinica", "id de empresa no fluxo (a API deriva pela instância)"),
    (r"senha_hash", "coluna de senha exposta ao fluxo"),
    (r"cancelada", "status inexistente no banco (a API grava 'cancelado')"),
    (r"status=neq", "filtro do PostgREST montado no fluxo"),
    (r"n8n-nodes-base\.supabase", "nó Supabase (a agenda passa por /api/ai/*)"),
    (r"\$fromAI", "valor escolhido pela IA"),
    # N8N_BLOCK_ENV_ACCESS_IN_NODE=true na VPS (APP-FixWear infra/stacks/06-n8n.yml):
    # a expressao lanca "access to env vars denied" dentro do worker. Origem publica
    # vira constante em `normalizar entrada`; segredo vira credencial do n8n.
    (r"\$env\.", "variavel de ambiente no fluxo (o worker nao consegue ler)"),
]

# Cada nó de agenda e a rota que ele precisa chamar.
NOS_API = {
    "contexto da empresa": "/api/ai/contexto",
    "buscar horários": "/api/ai/disponibilidade",
    "consultas do cliente": "/api/ai/agendamentos/buscar",
    "criar consulta": "/api/ai/agendamentos",
    "reagendar consulta": "/api/ai/agendamentos/reagendar",
    "cancelar consulta": "/api/ai/agendamentos/cancelar",
    "atualizar cadastro": "/api/ai/cliente",
    # A repetição reusa o caminho e o corpo já montados: mesma chave de
    # idempotência, então repetir não cria um segundo agendamento.
    "repetir escrita": None,
}

SEGREDOS = [
    (r"eyJ[A-Za-z0-9_\-]{20,}", "token JWT embutido"),
    (r"sk-[A-Za-z0-9]{16,}", "chave de API OpenAI embutida"),
    (r"service_role[\"']?\s*:\s*[\"'][A-Za-z0-9._\-]{20,}", "service role embutida"),
    (r"https?://[A-Za-z0-9.-]+\.supabase\.co", "URL de projeto Supabase fixa"),
    (r"\b\d{2}9?\d{8}@s\.whatsapp\.net", "telefone real"),
    (r"\b55\d{10,11}\b", "telefone real"),
    (r"[A-Za-z0-9._%+-]+@(?!s\.whatsapp\.net|exemplo\.)[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "e-mail pessoal"),
]

SUBNOS = (
    "@n8n/n8n-nodes-langchain.lmChat",
    "@n8n/n8n-nodes-langchain.outputParser",
    "@n8n/n8n-nodes-langchain.memory",
    "@n8n/n8n-nodes-langchain.toolWorkflow",
)


def falhas_do_workflow(caminho):
    erros = []
    with open(caminho, encoding="utf-8") as arquivo:
        bruto = arquivo.read()

    try:
        wf = json.loads(bruto)
    except ValueError as exc:
        return [f"JSON inválido: {exc}"]

    if wf.get("active") is not False:
        erros.append("workflow precisa continuar inativo (active: false)")

    if wf.get("pinData"):
        erros.append("pinData deve ficar vazio (pode conter payload real)")

    if wf.get("settings", {}).get("saveDataSuccessExecution") != "none":
        erros.append("saveDataSuccessExecution precisa ser 'none' (evita guardar dados pessoais)")

    nos = wf.get("nodes", [])
    por_nome = {n["name"]: n for n in nos}
    nomes = set(por_nome)

    for obrigatorio in NOS_OBRIGATORIOS:
        if obrigatorio not in nomes:
            erros.append(f"nó obrigatório ausente: {obrigatorio}")

    if len(nomes) != len(nos):
        erros.append("existem nós com nome duplicado")

    webhook = por_nome.get("Webhook")
    if webhook and webhook.get("parameters", {}).get("authentication") in (None, "none"):
        erros.append("Webhook sem autenticação")

    conexoes = wf.get("connections", {})
    destinos = set()
    for origem, portas in conexoes.items():
        if origem not in nomes:
            erros.append(f"conexão partindo de nó inexistente: {origem}")
        for tipo, saidas in portas.items():
            for indice, saida in enumerate(saidas or []):
                for ligacao in saida or []:
                    if ligacao["node"] not in nomes:
                        erros.append(f"conexão para nó inexistente: {ligacao['node']}")
                    destinos.add(ligacao["node"])
                if tipo == "main" and not saida:
                    origem_no = por_nome.get(origem, {})
                    if origem_no.get("type") in ("n8n-nodes-base.switch", "n8n-nodes-base.if"):
                        erros.append(f"saída {indice} de '{origem}' não tem destino")

    for no in nos:
        tipo = no.get("type", "")
        nome = no["name"]
        if tipo in ("n8n-nodes-base.stickyNote", "n8n-nodes-base.webhook"):
            continue
        if tipo.startswith(SUBNOS):
            if nome not in conexoes:
                erros.append(f"sub-nó de IA sem consumidor: {nome}")
            continue
        if nome not in destinos:
            erros.append(f"nó órfão (sem entrada): {nome}")
        if nome not in conexoes and not nome.startswith("fim -"):
            erros.append(f"nó sem saída e sem nome de encerramento: {nome}")

    for no in nos:
        for referencia in re.findall(r"\$\('([^']+)'\)", json.dumps(no, ensure_ascii=False)):
            if referencia not in nomes:
                erros.append(f"'{no['name']}' referencia o nó inexistente '{referencia}'")

    # Toda chave do Redis inclui a instância: o mesmo telefone falando com duas
    # empresas nunca compartilha buffer, estado nem pausa.
    for no in nos:
        if no.get("type") != "n8n-nodes-base.redis":
            continue
        parametros = no.get("parameters", {})
        # `push` nomeia a chave de `list`; as outras operações usam `key`.
        chave = parametros.get("key") or parametros.get("list") or ""
        if ".instance" not in chave:
            erros.append(f"chave do Redis sem instância em '{no['name']}'")

    for nome, rota in NOS_API.items():
        no = por_nome.get(nome)
        if not no:
            erros.append(f"nó de API ausente: {nome}")
            continue
        if no.get("type") != "n8n-nodes-base.httpRequest":
            erros.append(f"'{nome}' precisa ser um nó HTTP Request")
            continue
        parametros = no.get("parameters", {})
        url = parametros.get("url", "")
        texto = json.dumps(no, ensure_ascii=False)
        if "json.api_base" not in url:
            erros.append(f"'{nome}' não monta a URL a partir de api_base")
        cabecalhos = {
            c.get("name"): c.get("value", "")
            for c in parametros.get("headerParameters", {}).get("parameters", [])
        }
        # O token vai como credencial Header Auth, cifrada no banco do n8n. Em
        # header literal ele entraria no Git; em variável de ambiente ele não
        # chega a ser lido (N8N_BLOCK_ENV_ACCESS_IN_NODE=true na VPS).
        if parametros.get("genericAuthType") != "httpHeaderAuth":
            erros.append(f"'{nome}' não autentica por credencial Header Auth")
        if not (no.get("credentials") or {}).get("httpHeaderAuth"):
            erros.append(f"'{nome}' sem credencial httpHeaderAuth ligada")
        if "X-Automation-Token" in cabecalhos:
            erros.append(f"'{nome}' manda o token como header literal")
        if rota and rota not in url:
            erros.append(f"'{nome}' não chama {rota}")
        # A API devolve 4xx/5xx COM envelope: sem neverError o código de erro se
        # perde e o fluxo não sabe se reoferta, lista de novo ou chama uma pessoa.
        resposta = parametros.get("options", {}).get("response", {}).get("response", {})
        if resposta.get("neverError") is not True:
            erros.append(f"'{nome}' não lê o corpo em erro HTTP (neverError)")
        if not parametros.get("options", {}).get("timeout"):
            erros.append(f"'{nome}' sem timeout")
        if "AGENDA_AUTOMATION_TOKEN" in url:
            erros.append(f"'{nome}' coloca o token na URL")
        if "$fromAI" in texto:
            erros.append(f"'{nome}' aceita valor escolhido pela IA ($fromAI)")

    # Falha de infra em 'contexto da empresa' não pode virar o mesmo silêncio do
    # liga/desliga por empresa: com `continueRegularOutput` o item de ENTRADA passa
    # adiante sem `ok`, 'contexto ok?' cai no `false`, a execução termina "com
    # sucesso" — e `saveDataSuccessExecution: none` não guarda nada para investigar.
    # `neverError` já entrega o envelope de 4xx/5xx, que é o caso legítimo.
    if por_nome.get("contexto da empresa", {}).get("onError"):
        erros.append(
            "'contexto da empresa' não pode continuar em erro: falha de infra ficaria "
            "indistinguível de atendimento desligado, e sem execução salva"
        )

    # O encerramento do contexto precisa separar "a empresa disse não" de "a
    # integração quebrou". Como noOp, os dois terminam a execução com sucesso —
    # e `saveDataSuccessExecution: none` apaga o rastro do segundo.
    fim_contexto = por_nome.get("fim - contexto indisponível", {})
    codigo_fim = fim_contexto.get("parameters", {}).get("jsCode", "")
    if fim_contexto.get("type") != "n8n-nodes-base.code":
        erros.append("'fim - contexto indisponível' precisa ser um nó Code que falha alto")
    elif "RECUSA_DE_NEGOCIO" not in codigo_fim or "throw" not in codigo_fim:
        erros.append("'fim - contexto indisponível' não separa recusa de negócio de falha")

    for nome in ("evo digitando", "evo enviar mensagem"):
        no = por_nome.get(nome)
        if not no:
            continue
        parametros = no.get("parameters", {})
        if "json.evolution_base" not in parametros.get("url", ""):
            erros.append(f"'{nome}' não monta a URL a partir de evolution_base")
        if not (no.get("credentials") or {}).get("httpHeaderAuth"):
            erros.append(f"'{nome}' sem credencial httpHeaderAuth ligada")
        cabecalhos = [
            c.get("name")
            for c in parametros.get("headerParameters", {}).get("parameters", [])
        ]
        if "apikey" in cabecalhos:
            erros.append(f"'{nome}' manda a chave da Evolution como header literal")

    # A repetição precisa repetir o MESMO pedido, senão a chave muda.
    repetir = por_nome.get("repetir escrita")
    if repetir:
        texto = json.dumps(repetir, ensure_ascii=False)
        if "escrita.caminho" not in texto or "escrita.corpo" not in texto:
            erros.append("'repetir escrita' não reusa escrita.caminho e escrita.corpo")

    decisor = por_nome.get("resolver e decidir", {}).get("parameters", {}).get("jsCode", "")
    if "chave_idempotencia" not in decisor:
        erros.append("'resolver e decidir' não envia chave_idempotencia na criação")
    if "/api/ai/agendamentos/reagendar" in decisor:
        bloco = decisor.split("/api/ai/agendamentos/reagendar", 1)[1].split("/api/ai/agendamentos", 1)[0]
        if "chave_idempotencia" in bloco:
            erros.append("reagendar não pode enviar chave_idempotencia (a API recusa)")

    for padrao, descricao in PROIBIDOS:
        achado = re.search(padrao, bruto)
        if achado:
            erros.append(f"{descricao}: literal '{achado.group(0)}' no JSON")

    for padrao, descricao in SEGREDOS:
        achado = re.search(padrao, bruto)
        if achado:
            trecho = achado.group(0)
            mascara = trecho[:6] + "..." + trecho[-4:] if len(trecho) > 12 else "..."
            erros.append(f"{descricao}: {mascara}")

    agentes = [n for n in nos if n.get("type") == "@n8n/n8n-nodes-langchain.agent"]
    if len(agentes) > 1:
        erros.append(f"o fluxo deve ter uma única chamada de IA de conversa (encontrei {len(agentes)})")
    for agente in agentes:
        if not agente.get("parameters", {}).get("hasOutputParser"):
            erros.append(f"'{agente['name']}' sem saída estruturada")
        prompt = json.dumps(agente.get("parameters", {}), ensure_ascii=False).lower()
        if "andressa" in prompt:
            erros.append("prompt ainda usa o nome fixo 'Andressa'")

    return erros


def main():
    caminho = sys.argv[1] if len(sys.argv) > 1 else PADRAO
    if not os.path.exists(caminho):
        print(f"arquivo não encontrado: {caminho}")
        return 1
    erros = falhas_do_workflow(caminho)
    if erros:
        print(f"FALHOU ({len(erros)}):")
        for erro in erros:
            print(f"  - {erro}")
        return 1
    print(f"OK: {os.path.basename(caminho)} passou em todas as verificações")
    return 0


if __name__ == "__main__":
    sys.exit(main())
