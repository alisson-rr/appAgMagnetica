"""Validador do workflow de atendimento (biblioteca padrão apenas).

Uso:
    python automation/n8n/validar_workflow.py
    python automation/n8n/validar_workflow.py caminho/para/workflow.json

Verifica JSON válido, estado inativo, nós obrigatórios, rotas sem destino,
ausência de segredos e de dados pessoais, e as guardas de empresa e cliente nas
operações de escrita.
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
    "montar contexto",
    "IA interpretadora",
    "validar interpretação",
    "resolver e decidir",
    "rota",
    "buscar horários",
    "avaliar horários",
    "consultas do cliente",
    "decidir sobre consultas",
    "revalidar horário",
    "conferir revalidação",
    "criar consulta",
    "reagendar consulta",
    "cancelar consulta",
    "verificar resultado",
    "montar resposta",
    "evo enviar mensagem",
    "registrar decisão",
]

# Nós de escrita e o filtro que o sistema precisa impor em cada um.
ESCRITAS = {
    "criar consulta": ["id_cliente", "id_info_clinica"],
    "reagendar consulta": ["id_cliente", "id_info_clinica"],
    "cancelar consulta": ["id_cliente", "id_info_clinica"],
    "atualizar cadastro": ["id_info_clinica"],
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

    if wf.get("settings", {}).get("saveDataSuccessExecution") == "all":
        erros.append("saveDataSuccessExecution: all guarda dados pessoais em toda execução")

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

    for nome, filtros in ESCRITAS.items():
        no = por_nome.get(nome)
        if not no:
            continue
        texto = json.dumps(no, ensure_ascii=False)
        for filtro in filtros:
            if filtro not in texto:
                erros.append(f"'{nome}' não impõe o filtro {filtro}")
        if "$fromAI" in texto:
            erros.append(f"'{nome}' aceita valor escolhido pela IA ($fromAI)")
        if "Prefer" not in texto or "return=representation" not in texto:
            erros.append(f"'{nome}' não pede retorno do registro (Prefer: return=representation)")

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
