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
    "confirmar consulta",
    "repetir escrita",
    "verificar resultado",
    "montar resposta",
    "redigir resposta",
    "aplicar redação",
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
    "confirmar consulta": "/api/ai/agendamentos/confirmar",
    "atualizar cadastro": "/api/ai/cliente",
    "redigir resposta": "/api/ai/redigir",
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

    for nome in ("evo digitando", "evo enviar mensagem", "buscar áudio", "buscar imagem"):
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

    # Toda falha que lança erro precisa avisar alguém: sem workflow de erro, o
    # cliente fica sem resposta e ninguém fica sabendo.
    if not wf.get("settings", {}).get("errorWorkflow"):
        erros.append("settings.errorWorkflow vazio: falha lançada não avisa ninguém")

    # Falha ao enviar a resposta não pode terminar "com sucesso": pode haver
    # agendamento criado nesta execução e o cliente sem saber.
    envio = por_nome.get("evo enviar mensagem", {})
    if envio.get("onError") != "continueErrorOutput":
        erros.append("'evo enviar mensagem' precisa de continueErrorOutput (falha de envio tem de aparecer)")
    elif len(conexoes.get("evo enviar mensagem", {}).get("main", [])) < 2:
        erros.append("'evo enviar mensagem' sem destino para a saída de erro")

    # O eco do próprio envio não pode pausar a IA: a Evolution reemite como
    # `messages.upsert` com fromMe a mensagem que a própria API mandou.
    saidas_entrada = conexoes.get("rota de entrada", {}).get("main", [])
    if len(saidas_entrada) > 1:
        destino_proprio = [l["node"] for l in (saidas_entrada[1] or [])]
        if any(d.startswith("Redis - pausar IA") for d in destino_proprio):
            erros.append(
                "a rota 'humano' pausa a IA sem checar se a mensagem foi o eco do próprio envio"
            )

    # O primeiro nó do ramo do próprio dono não pode falhar aberto: sem onError,
    # uma queda do Redis mata o ramo inteiro e a mensagem que o negócio mandou
    # não é nem ignorada nem tratada como resposta humana. Com continueRegularOutput
    # o valor chega vazio, o IF manda para o ramo que pausa a IA, e pausar é o
    # lado seguro quando pode haver gente atendendo do outro lado.
    if len(saidas_entrada) > 1:
        for ligacao in (saidas_entrada[1] or []):
            no = por_nome.get(ligacao["node"], {})
            if no.get("type") == "n8n-nodes-base.redis" and no.get("onError") != "continueRegularOutput":
                erros.append(
                    f"'{ligacao['node']}' abre o ramo do próprio envio sem onError: "
                    "Redis fora do ar mataria o ramo"
                )

    # Atendimento respondido precisa deixar rastro: com saveDataSuccessExecution
    # 'none', um NoOp no fim apaga a única evidência do que a IA decidiu.
    auditoria = [
        n for n in nos
        if n.get("type") == "n8n-nodes-base.redis"
        and "am:auditoria:" in (n.get("parameters", {}).get("key") or n.get("parameters", {}).get("list") or "")
    ]
    if not auditoria:
        erros.append("nenhum nó persiste a auditoria do atendimento (am:auditoria:...)")
    elif "registrar decisão" in conexoes:
        alvos = [l["node"] for saida in conexoes["registrar decisão"].get("main", []) for l in (saida or [])]
        if not any(a in {n["name"] for n in auditoria} for a in alvos):
            erros.append("'registrar decisão' não entrega o registro ao nó de auditoria")

    # O webhook é registrado com base64 desligado: sem buscar a mídia, todo
    # áudio e toda imagem chegam vazios e o cliente recebe "não entendi".
    for nome in ("buscar áudio", "buscar imagem"):
        no = por_nome.get(nome)
        if not no:
            erros.append(f"nó de mídia ausente: {nome} (áudio/imagem chegariam vazios)")
            continue
        if "getBase64FromMediaMessage" not in no.get("parameters", {}).get("url", ""):
            erros.append(f"'{nome}' não busca a mídia na Evolution")
        # O buffer agrupa mensagens: com áudio seguido de texto, o msg_id da
        # entrada é o do TEXTO, e a Evolution responde 400 para todo áudio.
        if "midia_msg_id" not in no.get("parameters", {}).get("jsonBody", ""):
            erros.append(f"'{nome}' não usa o id da mídia agrupada (pediria o arquivo errado)")

    # Quem consome um item degradado precisa degradar também: sem onError, o
    # conversor lança com base64 vazio, a execução morre e o cliente fica sem
    # resposta — tornando inalcançável a guarda que responde "não consegui ouvir".
    for nome in ("converter áudio", "converter imagem"):
        no = por_nome.get(nome)
        if no and not no.get("onError"):
            erros.append(f"'{nome}' sem onError: mídia vazia derrubaria a execução")

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

    # Toda escrita no Redis expira. A chave carrega o telefone do cliente no nome
    # e o conteúdo dele no valor: sem expiração, uma execução interrompida entre
    # a escrita e a limpeza deixa esse dado no db1 para sempre. O teto de 30 dias
    # vale para o número fixo e para cada número dentro de um TTL calculado.
    TETO_TTL = 30 * 24 * 3600
    for no in nos:
        if no.get("type") != "n8n-nodes-base.redis":
            continue
        parametros = no.get("parameters", {})
        # Só as leituras e o delete escapam; qualquer outra operação escreve.
        operacao = parametros.get("operation")
        if operacao in ("get", "delete", "keys", "info"):
            continue
        nome = no["name"]
        # O nó Redis do n8n só honra `expire`/`ttl` em `set` e `incr`. Em `push`
        # o campo é aceito e ignorado: a chave fica sem expiração e o validador
        # aprovaria, que foi exatamente como a lista sem TTL passou antes.
        if operacao not in ("set", "incr"):
            erros.append(
                f"'{nome}' escreve com operation '{operacao}', que ignora TTL: use set ou incr"
            )
            continue
        if parametros.get("expire") is not True:
            erros.append(f"'{nome}' escreve no Redis sem expiração (dado do cliente ficaria órfão)")
            continue
        ttl = str(parametros.get("ttl"))
        # Conta aritmética numa expressão engana a leitura por número: o maior
        # literal de `{{ 60 * 60 * 24 * 365 }}` é 365, e um ano de retenção
        # passaria como se fosse seis minutos. TTL é número, ou ternário de
        # números escolhendo entre faixas.
        # Segundos em número inteiro, ou um ternário que escolhe entre inteiros.
        # Conta (`60 * 60 * 24 * 365`) e notação científica (`60e6`) enganavam a
        # leitura por literal: a maior parte do valor não aparece como dígito.
        numeros = [int(v) for v in re.findall(r"\d+", ttl)]
        limpo = re.sub(r"\s+", "", ttl)
        expressao = "{{" in limpo
        corpo = limpo.replace("={{", "").replace("}}", "")
        so_inteiros = re.fullmatch(r"[0-9'\"\[\]().,?:|&!=<>a-zA-Z_$]*", corpo) is not None
        if re.search(r"\d\s*[*/+-]\s*\d", ttl) or re.search(r"\de[+-]?\d", ttl, re.I):
            erros.append(f"'{nome}' com TTL calculado: escreva o valor em segundos")
            continue
        if not numeros:
            erros.append(f"'{nome}' com expire ligado e sem TTL")
        elif max(numeros) > TETO_TTL:
            erros.append(f"'{nome}' guarda dado por mais de 30 dias ({max(numeros)} s)")
        elif not expressao and not re.fullmatch(r"\d+", limpo):
            erros.append(f"'{nome}' com TTL que não é número de segundos: {ttl[:40]}")
        elif expressao and not so_inteiros:
            erros.append(f"'{nome}' com TTL em expressão não conferível: {ttl[:40]}")

    # Sem timeout, o nó espera até o limite da execução: o cliente fica sem
    # resposta e o worker segura a vaga na fila.
    for no in nos:
        if no.get("type") != "n8n-nodes-base.httpRequest":
            continue
        tempo = no.get("parameters", {}).get("options", {}).get("timeout")
        if not isinstance(tempo, int):
            erros.append(f"'{no['name']}' sem timeout")
        elif tempo > 30000:
            erros.append(f"'{no['name']}' com timeout acima de 30 s ({tempo} ms)")

    # A janela da ação pendente vive em dois lugares: a constante do nó que a
    # cria e o TTL da chave. Divergindo, ou a chave morre antes de a pendência
    # vencer (o "sim" válido vira "não tenho nada pendente"), ou sobrevive depois
    # (o "sim" tardio executa o que já venceu).
    salvar = por_nome.get("Redis - salvar ação pendente", {})
    minutos = re.search(r"PENDENTE_MINUTOS\s*=\s*(\d+)",
                        por_nome.get("avaliar horários", {}).get("parameters", {}).get("jsCode", ""))
    if salvar and minutos:
        esperado = int(minutos.group(1)) * 60
        if salvar.get("parameters", {}).get("ttl") != esperado:
            erros.append(
                "TTL de 'Redis - salvar ação pendente' "
                f"({salvar.get('parameters', {}).get('ttl')}) não bate com PENDENTE_MINUTOS ({esperado} s)"
            )

    # Repetir um POST de envio não é idempotente: a Evolution entrega, a resposta
    # estoura o timeout e o cliente recebe a mesma mensagem duas vezes. A regra é
    # do ENDEREÇO, não do nome do nó: um segundo nó de envio com outro nome
    # reintroduziria o defeito com o validador verde.
    for no in nos:
        if no.get("type") != "n8n-nodes-base.httpRequest":
            continue
        # A URL é expressão montada por concatenação: sem tirar aspas, espaços e
        # `+`, bastava partir a string para a regra não casar.
        url = re.sub(r"[\s'\"+]", "", str(no.get("parameters", {}).get("url", "")))
        if "/message/send" in url and no.get("retryOnFail"):
            erros.append(
                f"'{no['name']}' envia mensagem e repete: o cliente receberia duas vezes"
            )

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

    # O texto final deve passar pela redação, e o histórico só guarda o enviado.
    for origem, destino in (
        ('montar resposta', 'redigir resposta'),
        ('redigir resposta', 'aplicar redação'),
        ('aplicar redação', 'tem ação pendente nova?'),
        ('enviar em ordem', 'Redis - salvar estado'),
        ('Redis - salvar estado', 'registrar decisão'),
        ('registrar mensagem recebida', 'Redis - ler ação pendente'),
    ):
        saidas = conexoes.get(origem, {}).get('main', [])
        alvos = [c.get('node') for c in (saidas[0] if saidas else [])]
        if alvos != [destino]:
            erros.append(f"'{origem}' precisa seguir para '{destino}', recebeu {alvos}")
    if por_nome.get('redigir resposta', {}).get('retryOnFail'):
        erros.append('Redação não pode repetir a chamada em falha')

    # ===== Fiação do caminho do dinheiro =====
    # Trocar duas saídas do switch manda o corpo de agendar para /cancelar. A
    # API recusa com 422, `verificar resultado` classifica falha_ferramenta e o
    # fluxo transfere — ninguém agenda errado, mas ninguém agenda. As duas
    # suítes ficam verdes: elas testam o texto, não a fiação.
    ACAO_PARA_NO = {
        "cancelar": "cancelar consulta",
        "agendar": "criar consulta",
        "reagendar": "reagendar consulta",
        "confirmar": "confirmar consulta",
    }
    switch = por_nome.get("tipo da ação")
    if switch:
        regras = switch.get("parameters", {}).get("rules", {}).get("values", [])
        saidas = conexoes.get("tipo da ação", {}).get("main", [])
        presentes = {regra.get("outputKey") for regra in regras}
        for acao in ACAO_PARA_NO:
            if acao not in presentes:
                erros.append(f"'tipo da ação' não tem saída para {acao!r}")
        for indice, regra in enumerate(regras):
            chave = regra.get("outputKey")
            esperado = ACAO_PARA_NO.get(chave)
            if not esperado:
                erros.append(f"'tipo da ação' tem uma saída desconhecida: {chave!r}")
                continue
            destinos = [c.get("node") for c in (saidas[indice] if indice < len(saidas) else [])]
            if destinos != [esperado]:
                erros.append(
                    f"'tipo da ação' manda {chave!r} para {destinos} — o certo é ['{esperado}']"
                )

    # ===== Idempotência de entrada e de escrita =====
    # As duas travas são INCR no Redis lidos por um IF. Inverter o IF, ou trocar
    # o comparador, some com a proteção sem quebrar teste nenhum: a de entrada
    # deixa a mesma mensagem ser respondida duas vezes na reentrega da Evolution,
    # e a de escrita deixa dois "sim" seguidos criarem dois agendamentos.
    TRAVAS = [
        # (nó IF, operação esperada, saída que ENCERRA, nó de encerramento)
        ("mensagem duplicada?", "gt", 0, "fim - mensagem duplicada"),
        ("primeira execução da ação?", "equals", 1, "fim - ação já executada"),
    ]
    for nome_if, operacao, saida_que_encerra, terminal in TRAVAS:
        no_if = por_nome.get(nome_if)
        if not no_if:
            erros.append(f"trava de idempotência ausente: '{nome_if}'")
            continue
        condicoes = no_if.get("parameters", {}).get("conditions", {}).get("conditions", [])
        if len(condicoes) != 1 or condicoes[0].get("operator", {}).get("operation") != operacao:
            erros.append(f"'{nome_if}' deixou de comparar o INCR com {operacao!r}")
        # O INCR precisa ser lido do primeiro valor do item, que é como o nó
        # Redis do n8n devolve o contador.
        if "Object.values($json)[0]" not in str(condicoes[0].get("leftValue", "")) if condicoes else True:
            erros.append(f"'{nome_if}' não lê mais o contador que o Redis devolveu")
        destinos = conexoes.get(nome_if, {}).get("main", [])
        alvo = [c.get("node") for c in (destinos[saida_que_encerra] if saida_que_encerra < len(destinos) else [])]
        if alvo != [terminal]:
            erros.append(f"'{nome_if}' deixou de encerrar em '{terminal}' (vai para {alvo})")

    # ===== Eco do próprio envio =====
    # A chave gravada depois de enviar e a chave lida quando a mensagem volta
    # precisam ter a MESMA forma. Se divergirem, nenhum eco é reconhecido: a
    # própria resposta do robô chega como se o dono tivesse digitado e a IA se
    # pausa sozinha por 30 minutos, em toda conversa.
    escrita = por_nome.get("Redis - marcar envio próprio", {}).get("parameters", {}).get("key", "")
    leitura = por_nome.get("Redis - envio próprio?", {}).get("parameters", {}).get("key", "")
    for rotulo, chave in (("escrita", escrita), ("leitura", leitura)):
        if "am:enviada:" not in str(chave):
            erros.append(f"chave de eco ({rotulo}) não usa o prefixo am:enviada:")
    if escrita and leitura:
        prefixo = "am:enviada:{{ $('normalizar entrada').first().json.instance }}:"
        if not (str(escrita).startswith("=" + prefixo) and str(leitura).startswith("=" + prefixo)):
            erros.append("as chaves de eco deixaram de concordar no prefixo por instância")

    # A redação e a memória usam modelos separados no backend. O único agente
    # com saída de intenção no n8n continua sendo a interpretação.
    agentes = [n for n in nos if n.get("type") == "@n8n/n8n-nodes-langchain.agent"]
    if len(agentes) > 1:
        erros.append(f"o fluxo deve ter um único agente interpretador no n8n (encontrei {len(agentes)})")
    for agente in agentes:
        if not agente.get("parameters", {}).get("hasOutputParser"):
            erros.append(f"'{agente['name']}' sem saída estruturada")
        prompt = json.dumps(agente.get("parameters", {}), ensure_ascii=False).lower()
        if "andressa" in prompt:
            erros.append("prompt ainda usa o nome fixo 'Andressa'")

    return erros


def falhas_de_forma(caminho):
    """Regras que valem para QUALQUER workflow do projeto: inativo, sem segredo,
    sem repetição no envio e sem timeout ausente. O fluxo de erro não passa pelas
    regras específicas do V2, e sem isto ninguém olhava para ele."""
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

    for no in wf.get("nodes", []):
        if no.get("type") != "n8n-nodes-base.httpRequest":
            continue
        url = re.sub(r"[\s'\"+]", "", str(no.get("parameters", {}).get("url", "")))
        if "/message/send" in url and no.get("retryOnFail"):
            erros.append(f"'{no['name']}' envia mensagem e repete: o destinatário receberia duas vezes")
        tempo = no.get("parameters", {}).get("options", {}).get("timeout")
        if not isinstance(tempo, int):
            erros.append(f"'{no['name']}' sem timeout")

    for padrao, descricao in SEGREDOS:
        achado = re.search(padrao, bruto)
        if achado:
            erros.append(f"{descricao}: mascarado")
    return erros


def falhas_do_historico(wf):
    """O chat e historico: nao pode entrar no caminho de responder o cliente.

    Se a grava\u00e7\u00e3o virar etapa em serie, um Supabase lento passa a atrasar (ou
    impedir) a resposta ao cliente por causa de uma tela que ninguem esta
    olhando naquele instante.
    """
    erros = []
    nos = {n["name"]: n for n in wf["nodes"]}
    ligacoes = wf.get("connections", {})

    RECEBIDA = "registrar mensagem recebida"
    ENVIADA = "registrar resposta enviada"
    if RECEBIDA not in nos or ENVIADA not in nos:
        return erros

    def destinos(nome, indice=0):
        saidas = (ligacoes.get(nome, {}).get("main") or [])
        if len(saidas) <= indice or not saidas[indice]:
            return []
        return [d.get("node") for d in saidas[indice]]

    # Os dois ramos precisam sair EM PARALELO com o caminho real, nunca no lugar
    # dele.
    if "contexto da empresa" not in destinos("conteudo do cliente"):
        erros.append(
            "o historico do chat virou etapa do caminho de resposta: "
            "'conteudo do cliente' precisa continuar ligado em 'contexto da empresa'"
        )
    if "Redis - marcar envio pr\u00f3prio" not in destinos("evo enviar mensagem"):
        erros.append(
            "'evo enviar mensagem' precisa continuar ligado em "
            "'Redis - marcar envio pr\u00f3prio': sem a marca de eco a IA se pausa sozinha"
        )

    for nome in (RECEBIDA, ENVIADA):
        no = nos[nome]
        if no.get("onError") != "continueRegularOutput":
            erros.append(f"'{nome}' precisa seguir adiante em erro: historico nao derruba atendimento")
        corpo = str(no.get("parameters", {}).get("jsonBody", ""))
        if "conversas/registrar" not in str(no.get("parameters", {}).get("url", "")):
            erros.append(f"'{nome}' deixou de apontar para a rota de registro")
        if "do_negocio" not in corpo:
            erros.append(f"'{nome}' precisa dizer de que lado veio a mensagem")

    # A resposta do robo tem de entrar como 'ia', nunca como 'painel': e o autor
    # que a tela usa para dizer quem falou.
    if "'ia'" not in str(nos[ENVIADA]["parameters"].get("jsonBody", "")):
        erros.append("a resposta da recep\u00e7\u00e3o precisa ser registrada como autor 'ia'")

    return erros


def falhas_do_lembrete(caminho):
    """Invariantes do fluxo de lembrete que nenhum teste de texto alcanca.

    A mais cara e a primeira: sem `am:enviada`, o proprio lembrete volta pelo
    webhook como `fromMe`, a V2 o le como "o negocio respondeu" e pausa a IA por
    30 minutos. O "confirmo" do cliente morre em silencio, e o unico sintoma e
    um lembrete que nunca surte efeito.
    """
    with open(caminho, encoding="utf-8") as arquivo:
        wf = json.load(arquivo)

    erros = []
    nos = {n["name"]: n for n in wf["nodes"]}
    ligacoes = wf.get("connections", {})

    def saida(nome, indice=0):
        destinos = (ligacoes.get(nome, {}).get("main") or [])
        if len(destinos) <= indice or not destinos[indice]:
            return None
        return destinos[indice][0].get("node")

    envio = "evo enviar lembrete"
    marca = "Redis - marcar envio proprio"
    pendente = "Redis - salvar pendente do lembrete"

    for nome in (envio, marca, pendente):
        if nome not in nos:
            erros.append(f"no ausente no fluxo de lembrete: {nome}")
    if erros:
        return erros

    if (saida(envio) != 'registrar resultado do lembrete'
        or saida(envio, 1) != 'registrar resultado do lembrete'
        or saida('registrar resultado do lembrete') != 'lembrete aceito?'
        or saida('lembrete aceito?') != marca):
        erros.append(
            'O lembrete precisa registrar o resultado e exigir aceite com id antes de salvar a confirmação'
        )
    if saida(marca) != pendente:
        erros.append(f"'{marca}' precisa ligar em '{pendente}'")

    chave = str(nos[marca].get("parameters", {}).get("key", ""))
    if "am:enviada:" not in chave or "key.id" not in chave:
        erros.append(
            "a chave de eco do lembrete saiu de forma: precisa ser am:enviada com o "
            "id devolvido pela Evolution, ou a V2 nao reconhece o proprio envio"
        )

    if nos[envio].get("retryOnFail"):
        erros.append("'%s' nao pode repetir: repeticao manda o lembrete duas vezes" % envio)

    pend = str(nos[pendente].get("parameters", {}).get("value", ""))
    if "pendente" not in pend:
        erros.append("'%s' precisa gravar a pendencia montada pelo Code" % pendente)

    # O telefone do cadastro e o que o WhatsApp entrega podem diferir no nono
    # digito. A chave TEM de sair do endereco por onde a mensagem realmente saiu,
    # senao o "sim" do cliente nao acha a pendencia e vira conversa comum.
    chave_pend = str(nos[pendente].get("parameters", {}).get("key", ""))
    if "remoteJid" not in chave_pend or "evo enviar lembrete" not in chave_pend:
        erros.append(
            "a chave de am:pendente do lembrete precisa usar o remoteJid devolvido "
            "por 'evo enviar lembrete': montar o JID a partir do cadastro erra "
            "quando o nono digito do telefone difere do que o WhatsApp entrega"
        )

    jscode = ""
    for n in wf["nodes"]:
        if n["name"] == "montar lembretes":
            jscode = n.get("parameters", {}).get("jsCode", "")
    if "origem: 'lembrete'" not in jscode:
        erros.append(
            "a pendencia do lembrete precisa carregar origem 'lembrete': sem ela "
            "'resolver e decidir' a descarta como obsoleta no dia seguinte"
        )

    return erros


def main():
    caminho = sys.argv[1] if len(sys.argv) > 1 else PADRAO
    if not os.path.exists(caminho):
        print(f"arquivo não encontrado: {caminho}")
        return 1
    erros = falhas_do_workflow(caminho)
    with open(caminho, encoding="utf-8") as arquivo:
        erros += falhas_do_historico(json.load(arquivo))
    # O fluxo de erro é um workflow do projeto como qualquer outro: as regras de
    # forma valem nele também.
    if caminho == PADRAO:
        pasta = os.path.dirname(PADRAO)
        erro_wf = os.path.join(pasta, "AgendaMagnetica-erro.n8n.json")
        if os.path.exists(erro_wf):
            erros += [f"[erro] {e}" for e in falhas_de_forma(erro_wf)]
        lembrete_wf = os.path.join(pasta, "AgendaMagnetica-lembrete.n8n.json")
        if os.path.exists(lembrete_wf):
            erros += [f"[lembrete] {e}" for e in falhas_de_forma(lembrete_wf)]
            erros += [f"[lembrete] {e}" for e in falhas_do_lembrete(lembrete_wf)]
        memoria_wf = os.path.join(pasta, "AgendaMagnetica-memoria.n8n.json")
        if os.path.exists(memoria_wf):
            erros += [f"[memoria] {e}" for e in falhas_de_forma(memoria_wf)]
        else:
            erros.append('Workflow de consolidação de memória ausente')
    if erros:
        print(f"FALHOU ({len(erros)}):")
        for erro in erros:
            print(f"  - {erro}")
        return 1
    print(f"OK: {os.path.basename(caminho)} passou em todas as verificações")
    return 0


if __name__ == "__main__":
    sys.exit(main())
